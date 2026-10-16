<#
Ensayo de lo que verá el CI, en un par de minutos y sin Unity: clona lo commiteado (sin nada de lo ignorado),
genera ahí lo que no se versiona (compilar-app.ps1 -SoloPreparar) y compara unity\Assets del clon con el de esta copia.
Lo que falte en el clon es algo que la app usa y el CI no tendría: así se escapó pagina.js (D57).
  ensayo-limpio.ps1 [-Destino C:\cc-ev\limpio]
#>
param([string]$Destino = 'C:\cc-ev\limpio')
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (Test-Path $Destino) { Remove-Item -Recurse -Force $Destino }
git clone --quiet --no-hardlinks $raiz $Destino
if ($LASTEXITCODE -ne 0) { exit 1 }
& (Join-Path $Destino 'scripts\unity\compilar-app.ps1') -SoloPreparar
if ($LASTEXITCODE -ne 0) { exit 1 }

# Los .meta los regenera Unity, y la escena InitTestScene la dejan las pruebas.
function Lista([string]$base) {
    Get-ChildItem -Recurse -File (Join-Path $base 'unity\Assets') |
        ForEach-Object { $_.FullName.Substring($base.Length + 1) } |
        Where-Object { $_ -notlike '*.meta' -and $_ -notlike 'unity\Assets\InitTestScene*' }
}
$faltan = Compare-Object @(Lista $Destino) @(Lista $raiz) | Where-Object SideIndicator -eq '=>' | ForEach-Object InputObject
if ($faltan) {
    Write-Host 'Archivos que la app usa y el CI no tendría (o que no están commiteados):'
    $faltan
    exit 1
}
Write-Host 'El clon limpio tiene todo lo de unity\Assets.'
