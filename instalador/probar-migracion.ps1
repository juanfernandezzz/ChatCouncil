# D52.4 (C3): migración de la app instalada ChatCouncilNueva a ChatCouncil, en una máquina limpia (CI).
# Uso: instalador\probar-migracion.ps1 -Viejo <ChatCouncilNueva-instalador.exe del Release> -Nuevo <ChatCouncil-instalador.exe nuevo> -NuevoSinUsePreviousAppDir <el mismo, compilado con /DSinUsePreviousAppDir>
param([Parameter(Mandatory)][string]$Viejo, [Parameter(Mandatory)][string]$Nuevo, [Parameter(Mandatory)][string]$NuevoSinUsePreviousAppDir)
$ErrorActionPreference = 'Stop'
$programas = Join-Path $env:LOCALAPPDATA 'Programs'
$carpetaVieja = Join-Path $programas 'ChatCouncilNueva'
$carpetaNueva = Join-Path $programas 'ChatCouncil'
$clave = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\cl.juanfernandez.chatcouncil_is1'

function Instalar([string]$exe) {
  $p = Start-Process $exe -ArgumentList '/SILENT', '/NORESTART' -PassThru
  $p.WaitForExit()
  if ($p.ExitCode -ne 0) { throw "El instalador $exe salió con $($p.ExitCode)" }
  Start-Sleep -Seconds 2
  # El [Run] silencioso abre la app; es de esta máquina de CI.
  Get-Process ChatCouncil, ChatCouncilNueva -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 2
}
function Desinstalar {
  $u = (Get-ItemProperty $clave).UninstallString.Trim('"')
  $q = Start-Process $u -ArgumentList '/SILENT', '/NORESTART' -PassThru
  $q.WaitForExit()
  Start-Sleep -Seconds 3
}

# Caso rojo: con el UsePreviousAppDir por defecto, la instalación nueva cae en la carpeta vieja.
Instalar $Viejo
Instalar $NuevoSinUsePreviousAppDir
if (-not (Test-Path (Join-Path $carpetaVieja 'ChatCouncil.exe'))) { throw 'Caso rojo: se esperaba que el instalador sin UsePreviousAppDir=no cayera en la carpeta vieja' }
if (Test-Path (Join-Path $carpetaNueva 'ChatCouncil.exe')) { throw 'Caso rojo: no debía existir la carpeta nueva' }
'Caso rojo: sin UsePreviousAppDir=no, la instalación nueva cae en Programs\ChatCouncilNueva (confirmado).'
Desinstalar
if (Test-Path $carpetaVieja) { Remove-Item $carpetaVieja -Recurse -Force }

# Caso verde: el Release actual, luego el instalador nuevo.
Instalar $Viejo
if (-not (Test-Path (Join-Path $carpetaVieja 'ChatCouncilNueva.exe'))) {
  # Tras el primer Release con PART-034, el asset con el nombre viejo es una copia del instalador nuevo: ya no hay migración que probar.
  Desinstalar
  'Aviso: el asset ChatCouncilNueva-instalador.exe del Release ya instala ChatCouncil; la migración se probó en la PR de PART-034.'
  exit 0
}
Instalar $Nuevo
$fallos = @()
if (-not (Test-Path (Join-Path $carpetaNueva 'ChatCouncil.exe'))) { $fallos += 'falta Programs\ChatCouncil\ChatCouncil.exe' }
if (Test-Path $carpetaVieja) { $fallos += 'sigue existiendo Programs\ChatCouncilNueva' }
$loc = (Get-ItemProperty $clave).InstallLocation
if ($loc -notlike '*\Programs\ChatCouncil\') { $fallos += "la entrada de desinstalación apunta a '$loc'" }
$lnk = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\ChatCouncil\ChatCouncil.lnk'
if (-not (Test-Path $lnk)) { $fallos += 'falta el acceso del menú Inicio' }
else {
  $dest = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk).TargetPath
  if ($dest -notlike '*\Programs\ChatCouncil\ChatCouncil.exe') { $fallos += "el acceso abre '$dest'" }
}
if ($fallos.Count) { throw ('Migración: ' + ($fallos -join '; ')) }
"Migración: ChatCouncil.exe en $carpetaNueva; la carpeta vieja ya no existe; la desinstalación apunta a $loc; el acceso abre $dest."

Desinstalar
$sobra = @()
if (Test-Path $carpetaNueva) { $sobra += $carpetaNueva }
if (Test-Path $clave) { $sobra += 'la entrada de desinstalación' }
if (Test-Path $lnk) { $sobra += 'el acceso del menú Inicio' }
if ($sobra.Count) { throw ('La desinstalación dejó: ' + ($sobra -join ', ')) }
'Desinstalación limpia.'
