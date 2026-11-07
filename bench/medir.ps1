# Mide ChatCouncil-Unity desde fuera de la app: proceso, ventana, procesos hijos, archivos. No la modifica.
# Nunca lee cookies, login ni la carpeta del navegador, y nunca mata la app: la cierra como una ventana.
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('condiciones', 'm5', 'arrancar', 'diez', 'informe', 'captura', 'cerrar')]
    [string]$Accion,
    [Parameter(Mandatory = $true)]
    [string]$Version,
    [int]$Corrida = 0,
    [switch]$SinRegistro,
    [string]$Traza,
    [double]$UmbralCpu = 10,
    [int]$SegundosQuietos = 15,
    [int]$TechoReposo = 240
)
$ErrorActionPreference = 'Stop'

$Exe = Join-Path $env:ProgramFiles 'ChatCouncil\ChatCouncil.exe'
$Datos = Join-Path $env:USERPROFILE 'AppData\LocalLow\ChatCouncil\ChatCouncil'
$Salida = Join-Path $PSScriptRoot "resultados\unity-$Version-pc.json"
$Logicos = [Environment]::ProcessorCount

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class Entrada {
    [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int tecla);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr ventana, out uint pid);
}
'@

function Hora([datetime]$t) { $t.ToString('o') }

function Leer-Resultados {
    if (Test-Path $Salida) { return [IO.File]::ReadAllText($Salida, [Text.Encoding]::UTF8) | ConvertFrom-Json }
    [pscustomobject]@{ app = "ChatCouncil-Unity $Version"; maquina = 'PC de Juan'; condiciones = $null; corridas = @() }
}

function Guardar-Resultados($d) {
    New-Item -ItemType Directory -Force (Split-Path $Salida) | Out-Null
    [IO.File]::WriteAllText($Salida, ($d | ConvertTo-Json -Depth 8) + "`n", (New-Object Text.UTF8Encoding($false)))
}

# Solo nombres de proceso de las ventanas abiertas: los titulos pueden traer contenido privado.
function Get-CondicionesCorrida {
    $bat = Get-CimInstance Win32_Battery | Select-Object -First 1
    [pscustomobject]@{
        enchufado = ($null -eq $bat) -or ($bat.BatteryStatus -eq 2); bateriaPorcentaje = $bat.EstimatedChargeRemaining
        planEnergia = ((powercfg /getactivescheme) -join ' ').Trim()
        appsAbiertas = @(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object ProcessName | Sort-Object -Unique)
    }
}

function Agregar-Corrida($entrada) {
    $entrada | Add-Member condiciones (Get-CondicionesCorrida)
    if ($SinRegistro) { $entrada | ConvertTo-Json -Depth 6; return }
    $d = Leer-Resultados
    $d.corridas = @($d.corridas) + $entrada
    Guardar-Resultados $d
    $entrada | ConvertTo-Json -Depth 6
}

# El arbol completo: ChatCouncil.exe y todos sus descendientes, incluidos los msedgewebview2.
function Get-Arbol {
    $todos = Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, Name
    $hijos = @{}
    foreach ($p in $todos) {
        $k = [int]$p.ParentProcessId
        if (-not $hijos.ContainsKey($k)) { $hijos[$k] = New-Object Collections.ArrayList }
        [void]$hijos[$k].Add([int]$p.ProcessId)
    }
    $ids = New-Object Collections.ArrayList
    $cola = New-Object Collections.Queue
    foreach ($p in $todos) { if ($p.Name -eq 'ChatCouncil.exe') { $cola.Enqueue([int]$p.ProcessId) } }
    while ($cola.Count -gt 0) {
        $id = $cola.Dequeue()
        if ($ids.Contains($id)) { continue }
        [void]$ids.Add($id)
        if ($hijos.ContainsKey($id)) { foreach ($h in $hijos[$id]) { $cola.Enqueue($h) } }
    }
    , $ids.ToArray()
}

function Contar-WebView { @(Get-Process -Name msedgewebview2 -ErrorAction SilentlyContinue).Count }

# Solo cuenta procesos renderer: de la linea de comandos no se guarda nada.
function Contar-Renderers {
    $n = 0
    foreach ($p in Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" -Property CommandLine) {
        if ($p.CommandLine -match '--type=renderer') { $n++ }
    }
    $n
}

# Una muestra del arbol. $previo guarda la CPU acumulada por proceso para sacar la diferencia.
function Tomar-Muestra($ids, $previo, [bool]$primera) {
    $ws = [long]0; $priv = [long]0; $cpu = [double]0; $vivos = 0
    foreach ($p in @(Get-Process -Id $ids -ErrorAction SilentlyContinue)) {
        try { $t = $p.TotalProcessorTime.TotalSeconds } catch { continue }
        $ws += $p.WorkingSet64; $priv += $p.PrivateMemorySize64; $vivos++
        # [double]0: con un 0 entero PowerShell elige Max(int, int) y redondea cada diferencia al segundo entero (E1 lo sufrio).
        if ($previo.ContainsKey($p.Id)) { $cpu += [Math]::Max([double]0, $t - $previo[$p.Id]) }
        elseif (-not $primera) { $cpu += $t } # proceso nuevo: todo su tiempo cae dentro de la ventana
        $previo[$p.Id] = $t
    }
    [pscustomobject]@{ ws = $ws; priv = $priv; cpuSeg = $cpu; procesos = $vivos }
}

function Get-WebView { @(Get-Process -Name msedgewebview2 -ErrorAction SilentlyContinue | ForEach-Object Id) }

# Devuelve el inicio de la primera ventana de $SegundosQuietos con CPU media de los WebView2 bajo el umbral y $Paneles renderers vivos.
# ChatCouncil.exe queda fuera: en 0.1.39 corria sin tope de cuadros (vSyncCount 0) y nunca reposaba; el criterio se mantiene igual para comparar.
# Es media y no cada muestra porque con diez paneles las paginas activas dejan picos de ~15 % que no terminan nunca.
function Esperar-Reposo([int]$Paneles) {
    $previo = @{}; $ids = Get-WebView
    [void](Tomar-Muestra $ids $previo $true)
    $reloj = [Diagnostics.Stopwatch]::StartNew()
    $anterior = 0.0; $traza = New-Object Collections.ArrayList
    while ($reloj.Elapsed.TotalSeconds -lt $TechoReposo) {
        Start-Sleep -Milliseconds 1000
        $ids = Get-WebView
        $m = Tomar-Muestra $ids $previo $false
        $ahora = $reloj.Elapsed.TotalSeconds
        $pct = 100 * $m.cpuSeg / ($ahora - $anterior) / $Logicos
        $anterior = $ahora
        [void]$traza.Add([pscustomobject]@{ t = Get-Date; pct = [Math]::Round($pct, 1); procesos = $m.procesos })
        if ($ahora -lt $SegundosQuietos) { continue }
        $limite = (Get-Date).AddSeconds(-$SegundosQuietos)
        $ventana = @($traza | Where-Object { $_.t -ge $limite })
        if (($ventana | Measure-Object pct -Average).Average -lt $UmbralCpu -and (Contar-Renderers) -ge $Paneles) {
            return [pscustomobject]@{ fin = $ventana[0].t; alcanzado = $true; traza = $traza }
        }
    }
    [pscustomobject]@{ fin = Get-Date; alcanzado = $false; traza = $traza }
}

function Es-App {
    $pid2 = [uint32]0
    [void][Entrada]::GetWindowThreadProcessId([Entrada]::GetForegroundWindow(), [ref]$pid2)
    (@(Get-Process -Name ChatCouncil -ErrorAction SilentlyContinue).Id) -contains [int]$pid2
}

# Espera el efecto de una accion de Juan y devuelve su ultimo clic izquierdo sobre la app antes del efecto.
function Esperar-Clic([scriptblock]$Efecto, [int]$Techo = 600) {
    $clics = New-Object Collections.ArrayList
    $abajo = $false
    [void][Entrada]::GetAsyncKeyState(1) # vacia el bit de "pulsado desde la ultima lectura" para no contar un clic viejo
    $reloj = [Diagnostics.Stopwatch]::StartNew(); $revision = 0
    while ($reloj.Elapsed.TotalSeconds -lt $Techo) {
        $e = [Entrada]::GetAsyncKeyState(1)
        $b = ($e -band 0x8000) -ne 0
        # Un clic sintetico baja y sube entre dos muestras de 15 ms: solo lo delata el bit bajo.
        $rapido = -not $abajo -and -not $b -and ($e -band 1) -ne 0
        if ((($abajo -and -not $b) -or $rapido) -and (Es-App)) { [void]$clics.Add((Get-Date)) }
        $abajo = $b
        if ($reloj.Elapsed.TotalSeconds -ge $revision) {
            $revision = $reloj.Elapsed.TotalSeconds + 1
            if (& $Efecto) {
                if ($clics.Count -eq 0) { throw 'hubo efecto, pero no se vio ningun clic sobre la app' }
                return $clics[$clics.Count - 1]
            }
        }
        Start-Sleep -Milliseconds 15
    }
    throw "no hubo efecto en $Techo s"
}

function Mediana($v) {
    $s = @($v | Sort-Object); $n = $s.Count
    if ($n % 2) { return $s[($n - 1) / 2] }
    ($s[$n / 2 - 1] + $s[$n / 2]) / 2
}

function Medir-M2 {
    Start-Sleep -Seconds 30
    $previo = @{}; $ids = Get-Arbol
    $previoApp = @{}; $idsApp = @(Get-Process -Name ChatCouncil | ForEach-Object Id)
    [void](Tomar-Muestra $ids $previo $true)
    [void](Tomar-Muestra $idsApp $previoApp $true)
    $inicio = Get-Date
    $reloj = [Diagnostics.Stopwatch]::StartNew()
    $muestras = New-Object Collections.ArrayList; $cpu = [double]0
    $app = New-Object Collections.ArrayList; $cpuApp = [double]0
    for ($i = 1; $i -le 60; $i++) {
        $espera = $i * 1000 - $reloj.ElapsedMilliseconds
        if ($espera -gt 0) { Start-Sleep -Milliseconds $espera }
        if (($i % 5) -eq 0) { $ids = Get-Arbol }
        $m = Tomar-Muestra $ids $previo $false
        $cpu += $m.cpuSeg
        [void]$muestras.Add($m)
        $a = Tomar-Muestra $idsApp $previoApp $false
        $cpuApp += $a.cpuSeg
        [void]$app.Add($a)
    }
    $seg = $reloj.Elapsed.TotalSeconds
    Agregar-Corrida ([pscustomobject]@{
            medida = 'M2'; corrida = $Corrida; inicio = Hora $inicio; fin = Hora (Get-Date); rotulo = 'exacta'
            muestras = $muestras.Count; segundos = [Math]::Round($seg, 2)
            workingSetMedianaBytes = [long](Mediana $muestras.ws); workingSetMaximoBytes = [long]($muestras.ws | Measure-Object -Maximum).Maximum
            privateBytesMedianaBytes = [long](Mediana $muestras.priv); privateBytesMaximoBytes = [long]($muestras.priv | Measure-Object -Maximum).Maximum
            cpuMediaPorcentajeMaquina = [Math]::Round(100 * $cpu / $seg / $Logicos, 2); nucleosLogicos = $Logicos
            appCpuMediaPorcentajeMaquina = [Math]::Round(100 * $cpuApp / $seg / $Logicos, 2)
            appWorkingSetMedianaBytes = [long](Mediana $app.ws); appWorkingSetMaximoBytes = [long]($app.ws | Measure-Object -Maximum).Maximum
            appPrivateBytesMedianaBytes = [long](Mediana $app.priv); appPrivateBytesMaximoBytes = [long]($app.priv | Measure-Object -Maximum).Maximum
            procesosMediana = Mediana $muestras.procesos; renderers = Contar-Renderers
        })
}

switch ($Accion) {
    'condiciones' {
        $so = Get-CimInstance Win32_OperatingSystem
        $cv = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
        $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
        $bat = Get-CimInstance Win32_Battery | Select-Object -First 1
        $d = Leer-Resultados
        $d.condiciones = [pscustomobject]@{
            registradoEn = Hora (Get-Date)
            cpu = $cpu.Name.Trim(); nucleos = $cpu.NumberOfCores; nucleosLogicos = $cpu.NumberOfLogicalProcessors
            ramTotalBytes = [long](Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
            windows = $so.Caption; windowsVersion = $cv.DisplayVersion; windowsCompilacion = "$($so.BuildNumber).$($cv.UBR)"
            planEnergia = ((powercfg /getactivescheme) -join ' ').Trim()
            enchufado = ($null -eq $bat) -or ($bat.BatteryStatus -eq 2); bateriaPorcentaje = $bat.EstimatedChargeRemaining
            appVersionRegistro = (Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match 'ChatCouncil' } | Select-Object -First 1).DisplayVersion
            appVersionEnBinario = ([regex]::Match([Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes((Join-Path (Split-Path $Exe) 'ChatCouncil_Data\globalgamemanagers'))), '0\.1\.\d+')).Value
            exeProductVersion = (Get-Item $Exe).VersionInfo.ProductVersion
            webView2Runtime = (Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}').pv
        }
        Guardar-Resultados $d
        $d.condiciones | ConvertTo-Json
    }
    'm5' {
        $t = Join-Path $env:TEMP ('cc-m5-' + [guid]::NewGuid())
        New-Item -ItemType Directory $t | Out-Null
        & (Join-Path $env:ProgramFiles 'GitHub CLI\gh.exe') release download chatcouncil-unity-v1 --repo juanfernandezzz/ChatCouncil-Unity --dir $t
        if ($LASTEXITCODE -ne 0) { throw "gh fallo con $LASTEXITCODE" }
        foreach ($f in Get-ChildItem $t -File) {
            Agregar-Corrida ([pscustomobject]@{ medida = 'M5'; archivo = $f.Name; valor = $f.Length; unidad = 'bytes'; rotulo = 'exacta'; medidoEn = Hora (Get-Date) })
        }
        Remove-Item -LiteralPath $t -Recurse -Force
        "carpeta temporal borrada: $(-not (Test-Path $t))"
    }
    'arrancar' {
        if (Get-Process -Name ChatCouncil -ErrorAction SilentlyContinue) { throw 'la app ya esta abierta' }
        $inicio = Get-Date
        $reloj = [Diagnostics.Stopwatch]::StartNew()
        $p = Start-Process -FilePath $Exe -PassThru
        $ventana = $null; $webview = $null
        while ($null -eq $ventana -or $null -eq $webview) {
            if ($reloj.Elapsed.TotalSeconds -gt 120) { throw 'sin ventana o sin WebView2 a los 120 s' }
            $p.Refresh()
            if ($null -eq $ventana -and $p.MainWindowHandle -ne 0) { $ventana = $reloj.Elapsed.TotalSeconds }
            if ($null -eq $webview -and (Contar-WebView) -gt 0) { $webview = $reloj.Elapsed.TotalSeconds }
            Start-Sleep -Milliseconds 100
        }
        $r = Esperar-Reposo 3
        if ($Traza) { $r.traza | ForEach-Object { "$($_.t.ToString('HH:mm:ss')) cpu=$($_.pct) procesos=$($_.procesos)" } | Set-Content $Traza }
        Agregar-Corrida ([pscustomobject]@{
                medida = 'M1a'; corrida = $Corrida; inicio = Hora $inicio; fin = Hora $r.fin
                valor = [Math]::Round(($r.fin - $inicio).TotalSeconds, 2); unidad = 's'; rotulo = 'aproximada'; reposoAlcanzado = $r.alcanzado
                ventanaSegundos = [Math]::Round($ventana, 2); primerWebViewSegundos = [Math]::Round($webview, 2)
                arbolProcesos = (Get-Arbol).Count; webview = Contar-WebView; renderers = Contar-Renderers
            })
    }
    'diez' {
        $base = Contar-WebView
        $clic = Esperar-Clic { (Contar-WebView) -ge ($base + 3) }
        $r = Esperar-Reposo 10
        if ($Traza) { $r.traza | ForEach-Object { "$($_.t.ToString('HH:mm:ss')) cpu=$($_.pct) procesos=$($_.procesos)" } | Set-Content $Traza }
        Agregar-Corrida ([pscustomobject]@{
                medida = 'M1b'; corrida = $Corrida; inicio = Hora $clic; fin = Hora $r.fin
                valor = [Math]::Round(($r.fin - $clic).TotalSeconds, 2); unidad = 's'; rotulo = 'aproximada'; reposoAlcanzado = $r.alcanzado
                arbolProcesos = (Get-Arbol).Count; renderers = Contar-Renderers
            })
        Medir-M2
    }
    'informe' {
        $carpeta = Join-Path $Datos 'informes'
        $antes = @(Get-ChildItem $carpeta -Directory | ForEach-Object Name)
        $clic = Esperar-Clic { @(Get-ChildItem $carpeta -Directory | Where-Object { $antes -notcontains $_.Name }).Count -gt 0 }
        $nueva = Get-ChildItem $carpeta -Directory | Where-Object { $antes -notcontains $_.Name } | Select-Object -First 1
        $firma = ''; $estable = 0
        while ($estable -lt 20) {
            Start-Sleep -Seconds 1
            $archivos = @(Get-ChildItem -LiteralPath $nueva.FullName -Recurse -File)
            $f = "$($archivos.Count)|$(($archivos | Measure-Object Length -Sum).Sum)"
            if ($f -eq $firma) { $estable++ } else { $estable = 0; $firma = $f }
        }
        $fin = ($archivos | Sort-Object LastWriteTime | Select-Object -Last 1).LastWriteTime
        Agregar-Corrida ([pscustomobject]@{
                medida = 'M4'; corrida = $Corrida; inicio = Hora $clic; fin = Hora $fin
                valor = [Math]::Round(($fin - $clic).TotalSeconds, 2); unidad = 's'; rotulo = 'exacta'
                archivos = $archivos.Count; bytes = [long]($archivos | Measure-Object Length -Sum).Sum
            })
    }
    'captura' {
        # Para una ronda real con paginas terminadas: el fin es la ultima linea escrita en el registro.
        $registro = Get-ChildItem (Join-Path $Datos 'conversaciones') -Filter *.jsonl | Sort-Object LastWriteTime | Select-Object -Last 1
        $largo = $registro.Length
        $clic = Esperar-Clic { (Get-Item -LiteralPath $registro.FullName).Length -gt $largo }
        $estable = 0; $ultimo = 0
        while ($estable -lt 10) {
            Start-Sleep -Seconds 1
            $l = (Get-Item -LiteralPath $registro.FullName).Length
            if ($l -eq $ultimo) { $estable++ } else { $estable = 0; $ultimo = $l }
        }
        $fin = (Get-Item -LiteralPath $registro.FullName).LastWriteTime
        Agregar-Corrida ([pscustomobject]@{
                medida = 'M3'; corrida = $Corrida; inicio = Hora $clic; fin = Hora $fin
                valor = [Math]::Round(($fin - $clic).TotalSeconds, 2); unidad = 's'; rotulo = 'exacta'
            })
    }
    'cerrar' {
        $ps = @(Get-Process -Name ChatCouncil -ErrorAction SilentlyContinue)
        foreach ($p in $ps) { [void]$p.CloseMainWindow() }
        $reloj = [Diagnostics.Stopwatch]::StartNew()
        while ((@(Get-Process -Name ChatCouncil -ErrorAction SilentlyContinue).Count + (Contar-WebView)) -gt 0) {
            if ($reloj.Elapsed.TotalSeconds -gt 90) { throw 'la app no cerro en 90 s; no se mata para no danar el perfil' }
            Start-Sleep -Milliseconds 500
        }
        "cerrada en $([Math]::Round($reloj.Elapsed.TotalSeconds, 1)) s; reposo de 30 s"
        Start-Sleep -Seconds 30
    }
}
