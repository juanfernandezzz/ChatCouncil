# Numera la compilacion del CI como 0.1.<corrida> antes de compilar: la app lo lee con Application.version y lo compara con
# version.txt del Release (Actualizacion.EsNueva); Android exige ademas un versionCode que suba. Una compilacion local no
# pasa por aqui y queda en 0.1.0, que no ofrece actualizaciones.
param([Parameter(Mandatory)][int]$Corrida)
$ruta = Join-Path $PSScriptRoot '..\..\unity\ProjectSettings\ProjectSettings.asset'
$texto = [IO.File]::ReadAllText($ruta)
# -creplace y ancla de linea: -replace no distingue mayusculas y tocaria tambien visionOSBundleVersion y tvOSBundleVersion.
$nuevo = $texto -creplace '(?m)^  bundleVersion: .+', "  bundleVersion: 0.1.$Corrida" -creplace '(?m)^  AndroidBundleVersionCode: \d+', "  AndroidBundleVersionCode: $Corrida"
if ($nuevo -eq $texto) { throw 'ProjectSettings.asset no cambio: faltan bundleVersion o AndroidBundleVersionCode' }
[IO.File]::WriteAllText($ruta, $nuevo, (New-Object Text.UTF8Encoding $false))
Write-Host "Version 0.1.$Corrida"
