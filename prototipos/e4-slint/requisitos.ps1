# E4: el requisitos.ps1 de E3 para Slint. Corre los modos y deja un JSON por modo en $Carpeta. Perfil de prueba nuevo en %TEMP%.
param(
    [Parameter(Mandatory = $true)][string]$Exe,
    [Parameter(Mandatory = $true)][string]$Carpeta
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $Carpeta | Out-Null
$datos = Join-Path $env:TEMP "e4-req-slint-$([guid]::NewGuid().ToString('N').Substring(0, 8))"

function Correr([string]$modo, [string]$dir, [int]$techo = 120) {
    $salida = Join-Path $Carpeta "slint-$modo.json"
    if (Test-Path $salida) { Remove-Item -LiteralPath $salida }
    $p = Start-Process -FilePath $Exe -ArgumentList 'slint', $modo, $dir, $salida -PassThru
    if (-not $p.WaitForExit($techo * 1000)) { [void]$p.CloseMainWindow(); "$modo : sin resultado en $techo s"; return }
    if (-not (Test-Path $salida)) { "$modo : el proceso terminó con código $($p.ExitCode) sin escribir resultado"; return }
    "$modo : salida $($p.ExitCode) : $([IO.File]::ReadAllText($salida))"
}

Correr escribir $datos
Start-Sleep -Seconds 3
Correr leer $datos
Correr google (Join-Path $env:TEMP "e4-g-slint-$([guid]::NewGuid().ToString('N').Substring(0, 8))")
Correr pruebas (Join-Path $env:TEMP "e4-p-slint-$([guid]::NewGuid().ToString('N').Substring(0, 8))")
