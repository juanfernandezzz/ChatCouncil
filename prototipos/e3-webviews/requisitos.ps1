# E3: corre los modos de requisitos de un plugin y deja un JSON por modo en $Carpeta. Perfil de prueba nuevo en %TEMP%.
param(
    [Parameter(Mandatory = $true)][ValidateSet('windows', 'floating', 'plus', 'inapp')][string]$Plugin,
    [Parameter(Mandatory = $true)][string]$Exe,
    [Parameter(Mandatory = $true)][string]$Carpeta
)
$ErrorActionPreference = 'Stop'
$Nombre = [IO.Path]::GetFileNameWithoutExtension($Exe)
New-Item -ItemType Directory -Force $Carpeta | Out-Null
$datos = Join-Path $env:TEMP "e3-req-$Plugin-$([guid]::NewGuid().ToString('N').Substring(0, 8))"

function Correr([string]$modo, [string]$dir, [int]$techo = 120) {
    $salida = Join-Path $Carpeta "$Plugin-$modo.json"
    $p = Start-Process -FilePath $Exe -ArgumentList $Plugin, $modo, $dir, $salida -PassThru
    $reloj = [Diagnostics.Stopwatch]::StartNew()
    while (-not (Test-Path $salida)) {
        if ($p.HasExited) { "$modo : el proceso terminó con código $($p.ExitCode) sin escribir resultado"; return }
        if ($reloj.Elapsed.TotalSeconds -gt $techo) { "$modo : sin resultado en $techo s"; [void]$p.CloseMainWindow(); return }
        Start-Sleep -Milliseconds 500
    }
    if ($modo -ne 'pruebas') { [void]$p.WaitForExit(30000) }
    "$modo : $(Get-Content -Raw $salida)"
}

Correr escribir $datos
Start-Sleep -Seconds 3
Correr leer $datos
Correr google (Join-Path $env:TEMP "e3-g-$Plugin-$([guid]::NewGuid().ToString('N').Substring(0, 8))")
Correr pruebas (Join-Path $env:TEMP "e3-p-$Plugin-$([guid]::NewGuid().ToString('N').Substring(0, 8))")
"pruebas queda abierta para la captura: pid $(@(Get-Process -Name $Nombre -ErrorAction SilentlyContinue).Id)"
