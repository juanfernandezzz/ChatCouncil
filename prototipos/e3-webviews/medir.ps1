# E3: M2 de bench/medir.ps1 (60 muestras a 1 Hz tras 30 s, después del mismo detector de reposo) para el prototipo con diez paneles.
# Diferencia con bench: el detector y los renderers se cuentan solo en el árbol del prototipo, no en todos los msedgewebview2 de la máquina,
# para que otro WebView2 abierto (Widgets, Search) no ensucie la comparación entre plugins.
param(
    [Parameter(Mandatory = $true)][ValidateSet('windows', 'floating', 'plus', 'inapp')][string]$Plugin,
    [Parameter(Mandatory = $true)][string]$Exe,
    [Parameter(Mandatory = $true)][string]$Salida,
    [int]$Corridas = 3,
    [double]$UmbralCpu = 10,
    [int]$SegundosQuietos = 15,
    [int]$TechoReposo = 240
)
$ErrorActionPreference = 'Stop'
$Logicos = [Environment]::ProcessorCount
$Nombre = [IO.Path]::GetFileNameWithoutExtension($Exe)

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
    foreach ($p in $todos) { if ($p.Name -eq "$Nombre.exe") { $cola.Enqueue([int]$p.ProcessId) } }
    while ($cola.Count -gt 0) {
        $id = $cola.Dequeue()
        if ($ids.Contains($id)) { continue }
        [void]$ids.Add($id)
        if ($hijos.ContainsKey($id)) { foreach ($h in $hijos[$id]) { $cola.Enqueue($h) } }
    }
    , $ids.ToArray()
}

function Contar-Renderers {
    $arbol = Get-Arbol; $n = 0
    foreach ($p in Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" -Property ProcessId, CommandLine) {
        if ($arbol -contains [int]$p.ProcessId -and $p.CommandLine -match '--type=renderer') { $n++ }
    }
    $n
}

function Tomar-Muestra($ids, $previo, [bool]$primera) {
    $ws = [long]0; $priv = [long]0; $cpu = [double]0; $vivos = 0
    $ids = @($ids | Where-Object { $_ }) # una función que devuelve @() entrega $null, y -Id no acepta nulo
    $procs = if ($ids.Count) { @(Get-Process -Id $ids -ErrorAction SilentlyContinue) } else { @() }
    foreach ($p in $procs) {
        try { $t = $p.TotalProcessorTime.TotalSeconds } catch { continue }
        $ws += $p.WorkingSet64; $priv += $p.PrivateMemorySize64; $vivos++
        if ($previo.ContainsKey($p.Id)) { $cpu += [Math]::Max([double]0, $t - $previo[$p.Id]) }
        elseif (-not $primera) { $cpu += $t }
        $previo[$p.Id] = $t
    }
    [pscustomobject]@{ ws = $ws; priv = $priv; cpuSeg = $cpu; procesos = $vivos }
}

function Get-WebView { $a = Get-Arbol; @(Get-Process -Name msedgewebview2 -ErrorAction SilentlyContinue | Where-Object { $a -contains $_.Id } | ForEach-Object Id) }

function Esperar-Reposo([int]$Paneles) {
    $previo = @{}; [void](Tomar-Muestra (Get-WebView) $previo $true)
    $reloj = [Diagnostics.Stopwatch]::StartNew(); $anterior = 0.0; $traza = New-Object Collections.ArrayList
    while ($reloj.Elapsed.TotalSeconds -lt $TechoReposo) {
        Start-Sleep -Milliseconds 1000
        $m = Tomar-Muestra (Get-WebView) $previo $false
        $ahora = $reloj.Elapsed.TotalSeconds
        [void]$traza.Add([pscustomobject]@{ t = Get-Date; pct = 100 * $m.cpuSeg / ($ahora - $anterior) / $Logicos })
        $anterior = $ahora
        if ($ahora -lt $SegundosQuietos) { continue }
        $ventana = @($traza | Where-Object { $_.t -ge (Get-Date).AddSeconds(-$SegundosQuietos) })
        if (($ventana | Measure-Object pct -Average).Average -lt $UmbralCpu -and (Contar-Renderers) -ge $Paneles) {
            return [pscustomobject]@{ alcanzado = $true; segundos = [Math]::Round($ahora, 1) }
        }
    }
    [pscustomobject]@{ alcanzado = $false; segundos = $TechoReposo }
}

function Mediana($v) {
    $s = @($v | Sort-Object); $n = $s.Count
    if ($n % 2) { return $s[($n - 1) / 2] }
    ($s[$n / 2 - 1] + $s[$n / 2]) / 2
}

function Medir-M2 {
    Start-Sleep -Seconds 30
    $previo = @{}; $ids = Get-Arbol
    $previoApp = @{}; $idsApp = @(Get-Process -Name $Nombre | ForEach-Object Id)
    [void](Tomar-Muestra $ids $previo $true); [void](Tomar-Muestra $idsApp $previoApp $true)
    $reloj = [Diagnostics.Stopwatch]::StartNew()
    $muestras = New-Object Collections.ArrayList; $cpu = [double]0
    $app = New-Object Collections.ArrayList; $cpuApp = [double]0
    for ($i = 1; $i -le 60; $i++) {
        $espera = $i * 1000 - $reloj.ElapsedMilliseconds
        if ($espera -gt 0) { Start-Sleep -Milliseconds $espera }
        if (($i % 5) -eq 0) { $ids = Get-Arbol }
        $m = Tomar-Muestra $ids $previo $false; $cpu += $m.cpuSeg; [void]$muestras.Add($m)
        $a = Tomar-Muestra $idsApp $previoApp $false; $cpuApp += $a.cpuSeg; [void]$app.Add($a)
    }
    $seg = $reloj.Elapsed.TotalSeconds
    [ordered]@{
        muestras = $muestras.Count; segundos = [Math]::Round($seg, 2)
        workingSetMedianaBytes = [long](Mediana $muestras.ws); privateBytesMedianaBytes = [long](Mediana $muestras.priv)
        cpuMediaPorcentajeMaquina = [Math]::Round(100 * $cpu / $seg / $Logicos, 2)
        appWorkingSetMedianaBytes = [long](Mediana $app.ws); appPrivateBytesMedianaBytes = [long](Mediana $app.priv)
        appCpuMediaPorcentajeMaquina = [Math]::Round(100 * $cpuApp / $seg / $Logicos, 2)
        procesosMediana = Mediana $muestras.procesos; renderers = Contar-Renderers; nucleosLogicos = $Logicos
    }
}

function Cerrar {
    foreach ($p in @(Get-Process -Name $Nombre -ErrorAction SilentlyContinue)) { [void]$p.CloseMainWindow() }
    $reloj = [Diagnostics.Stopwatch]::StartNew()
    while ((Get-Arbol).Count -gt 0) {
        if ($reloj.Elapsed.TotalSeconds -gt 90) { throw 'el prototipo no cerró en 90 s' }
        Start-Sleep -Milliseconds 500
    }
    Start-Sleep -Seconds 30
}

if ((Get-Arbol).Count -gt 0) { throw 'el prototipo ya está abierto' }
for ($c = 1; $c -le $Corridas; $c++) {
    $datos = Join-Path $env:TEMP "e3-$Plugin-$c-$([guid]::NewGuid().ToString('N').Substring(0, 8))" # perfil de prueba nuevo por corrida
    $inicio = Get-Date
    Start-Process -FilePath $Exe -ArgumentList $Plugin, 'diez', $datos | Out-Null
    Start-Sleep -Seconds 5
    $r = Esperar-Reposo 10
    $m = Medir-M2
    $m.Insert(0, 'corrida', $c); $m.Insert(1, 'inicio', $inicio.ToString('o'))
    $m.reposoAlcanzado = $r.alcanzado; $m.reposoSegundos = $r.segundos
    [IO.File]::AppendAllText($Salida, (([pscustomobject]$m | Add-Member plugin $Plugin -PassThru) | ConvertTo-Json -Compress) + "`n")
    "$Plugin corrida $c : ws=$([Math]::Round($m.workingSetMedianaBytes / 1MB)) MB cpu=$($m.cpuMediaPorcentajeMaquina) % renderers=$($m.renderers) reposo=$($r.alcanzado)"
    Cerrar
}
