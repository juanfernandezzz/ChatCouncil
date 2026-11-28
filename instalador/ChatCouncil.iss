; Instalador de Windows de la app nueva (ARR-011, ARR-012, DIA-004), portado de instalador/ChatCouncil.iss de la Unity:
; copia el ejecutable, crea los accesos directos y comprueba el runtime de WebView2. Lo compila el CI con
; ISCC.exe /DVersion=X.Y.Z; el ejecutable va en target\release (relativo a la raíz). Convive con la Unity: otro AppId,
; otra carpeta y otro grupo del menú Inicio.
#ifndef Version
  #define Version "0.0.0"
#endif

[Setup]
AppId=cl.juanfernandez.chatcouncil
AppName=ChatCouncil
AppVerName=ChatCouncil {#Version}
AppVersion={#Version}
AppPublisher=ChatCouncil
DefaultDirName={autopf}\ChatCouncil
; D52.4: la carpeta nueva se usa aunque haya una instalación anterior en Programs\ChatCouncilNueva.
#ifndef SinUsePreviousAppDir
UsePreviousAppDir=no
#endif
DefaultGroupName=ChatCouncil
DisableProgramGroupPage=yes
; D38.2: sin esto Inno reutiliza el grupo anterior y el acceso nuevo cae en «ChatCouncil (nueva)».
UsePreviousGroup=no
OutputDir=..\salida
OutputBaseFilename=ChatCouncil-instalador
UninstallDisplayIcon={app}\ChatCouncil.exe
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; D31: siempre por usuario, sin permisos de administrador y sin elegir "todos los usuarios".
PrivilegesRequired=lowest
WizardStyle=modern
; La actualización desde la app corre /SILENT: cierra la app si sigue abierta y la reabre el [Run] de abajo, no el reinicio de Inno.
RestartApplications=no

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[Types]
; El primer tipo es el que queda por defecto (también en /SILENT): sin el acceso de depuración.
Name: "estandar"; Description: "Instalación estándar"
Name: "completa"; Description: "Instalación con acceso de depuración"
Name: "personalizada"; Description: "Personalizada"; Flags: iscustom

[Components]
; D31: el acceso de depuración abre el perfil real con el puerto 9222; no se instala salvo que se marque.
Name: "depuracion"; Description: "Acceso de depuración (abre el perfil real con el puerto 9222)"; Types: completa

[Tasks]
Name: "escritorio"; Description: "Crear un acceso directo en el escritorio"

[Files]
Source: "..\target\release\ChatCouncil.exe"; DestDir: "{app}"; Flags: ignoreversion
; Herramienta de depuración: abre la app con el puerto local de WebView2 para inspeccionar los paneles.
Source: "abrir-depurando.bat"; DestDir: "{app}"; Flags: ignoreversion; Components: depuracion

[Icons]
Name: "{group}\ChatCouncil"; Filename: "{app}\ChatCouncil.exe"
Name: "{group}\ChatCouncil (depuración)"; Filename: "{app}\abrir-depurando.bat"; IconFilename: "{app}\ChatCouncil.exe"; Components: depuracion
Name: "{autodesktop}\ChatCouncil"; Filename: "{app}\ChatCouncil.exe"; Tasks: escritorio

[InstallDelete]
; D38.2: el nombre visible pasa de «ChatCouncil (nueva)» a «ChatCouncil»: se borran la carpeta vieja de Inicio y el acceso viejo del Escritorio.
Type: filesandordirs; Name: "{userprograms}\ChatCouncil (nueva)"
Type: files; Name: "{userdesktop}\ChatCouncil (nueva).lnk"
; D52.4: la carpeta de la versión anterior (ChatCouncilNueva) se borra solo cuando su ejecutable ya no corre; los datos viven en %LOCALAPPDATA%\ChatCouncil.
Type: filesandordirs; Name: "{autopf}\ChatCouncilNueva"; Check: PuedeBorrarCarpetaVieja

[Run]
Filename: "{app}\ChatCouncil.exe"; Description: "Abrir ChatCouncil"; Flags: nowait postinstall skipifsilent
Filename: "{app}\ChatCouncil.exe"; Flags: nowait runasoriginaluser; Check: WizardSilent

[Code]
const
  ClaveWebView2 = '\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';

// Las claves que documenta Microsoft para saber si el runtime de WebView2 está instalado (por equipo o por usuario).
function Tiene(Raiz: Integer; Ruta: String): Boolean;
var
  Version: String;
begin
  Result := RegQueryStringValue(Raiz, Ruta, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0');
end;

// D52.4: espera hasta 10 s a que ChatCouncilNueva.exe termine (un ejecutable en uso no se puede borrar). Si no termina,
// la instalación sigue sin borrar la carpeta vieja.
function PuedeBorrarCarpetaVieja: Boolean;
var
  Exe: String;
  I: Integer;
begin
  Result := True;
  Exe := ExpandConstant('{autopf}\ChatCouncilNueva\ChatCouncilNueva.exe');
  if not FileExists(Exe) then Exit;
  for I := 1 to 20 do
  begin
    if DeleteFile(Exe) then Exit;
    Sleep(500);
  end;
  Result := False;
end;

function InitializeSetup: Boolean;
var
  Codigo: Integer;
begin
  Result := True;
  if not (Tiene(HKLM, 'SOFTWARE\WOW6432Node' + ClaveWebView2) or Tiene(HKLM, 'SOFTWARE' + ClaveWebView2) or Tiene(HKCU, 'Software' + ClaveWebView2)) then
    if MsgBox('ChatCouncil necesita Microsoft Edge WebView2 Runtime, que no está en este equipo. Sin él, los paneles no se abren.' + #13#10#13#10 +
              '¿Abrir la página de descarga de Microsoft? La instalación de ChatCouncil sigue igual.', mbConfirmation, MB_YESNO) = IDYES then
      ShellExec('open', 'https://developer.microsoft.com/microsoft-edge/webview2/', '', '', SW_SHOWNORMAL, ewNoWait, Codigo);
end;
