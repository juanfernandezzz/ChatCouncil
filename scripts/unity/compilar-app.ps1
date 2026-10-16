<#
Compila la app de Unity igual en esta máquina y en el CI (D56, D57): genera lo que no se versiona y corre Unity.
  compilar-app.ps1 -Plataforma Windows|Android -Salida RUTA [-Proyecto CARPETA] [-Editor Unity.exe] [-SoloPreparar]
-SoloPreparar genera pagina.js y la DLL del panel y termina: es lo que el CI comprueba antes de instalar Unity.
Android, en esta máquina, desde una ruta sin tildes (-Proyecto U:\unity con subst): Gradle y el NDK fallan con rutas no ASCII.
#>
param(
    [ValidateSet('Windows', 'Android')][string]$Plataforma = 'Windows',
    [string]$Salida,
    [string]$Proyecto,
    [string]$Editor = 'C:\Program Files\Unity\Hub\Editor\6000.3.25f1\Editor\Unity.exe',
    [switch]$SoloPreparar
)
# Continue: npm y cmd escriben avisos en stderr, que con Stop serían fatales; cada paso revisa su código de salida.
$ErrorActionPreference = 'Continue'
$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $Proyecto) { $Proyecto = Join-Path $raiz 'unity' }

# En el CI, el motivo va también como anotación: se lee sin entrar al log.
function Fallar([string]$titulo, $lineas) {
    $texto = (@($lineas) | Select-Object -Last 30) -join "`n"
    Write-Host $texto
    if ($env:GITHUB_ACTIONS) { Write-Host ("::error title=$titulo::" + (($texto -replace '%', '%25') -replace "`r", '' -replace "`n", '%0A')) }
    exit 1
}

# 1. pagina.js está en .gitignore y sin él los paneles no funcionan (D57).
Push-Location $raiz
$log = & npx --yes -p typescript@7.0.2 tsc -p pagina 2>&1
$codigo = $LASTEXITCODE
Pop-Location
if ($codigo -ne 0 -or -not (Test-Path (Join-Path $raiz 'unity\Assets\StreamingAssets\pagina.js'))) { Fallar 'pagina.js' $log }

# 2. La DLL del panel tampoco se versiona; solo la usa Windows.
if ($Plataforma -eq 'Windows' -or $SoloPreparar) {
    $log = & cmd /c (Join-Path $raiz 'panel\windows\compilar.cmd') 2>&1
    if ($LASTEXITCODE -ne 0) { Fallar 'compilar.cmd' $log }
}
if ($SoloPreparar) { Write-Host 'Preparado: pagina.js y ChatCouncilPanel.dll.'; exit 0 }

# 3. Unity es una app de ventana: Start-Process -Wait espera y da su código. Las rutas van entre comillas porque
# Start-Process une los argumentos con espacios sin citarlos.
if (-not $Salida) { Fallar 'compilar-app' 'Falta -Salida RUTA' }
New-Item -ItemType Directory -Force (Split-Path -Parent $Salida) | Out-Null
$registro = "$Salida.log"
$destino = @{ Windows = 'Win64'; Android = 'Android' }[$Plataforma]
$p = Start-Process -FilePath $Editor -Wait -PassThru -NoNewWindow -ArgumentList @(
    '-batchmode', '-quit', '-buildTarget', $destino, '-projectPath', "`"$Proyecto`"", '-logFile', "`"$registro`"",
    '-executeMethod', "ChatCouncil.Construccion.Construir.$Plataforma", '-salida', "`"$Salida`"")
if (Test-Path $registro) { Get-Content $registro -Tail 40 }
if ($p.ExitCode -ne 0 -or -not (Test-Path $Salida)) {
    $errores = if (Test-Path $registro) { Select-String -Path $registro -Pattern 'error|failed' | ForEach-Object Line } else { 'Unity no dejó registro' }
    Fallar "Unity $Plataforma" $errores
}
Write-Host "Compilado: $Salida"
