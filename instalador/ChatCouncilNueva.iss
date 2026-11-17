; Instalador de Windows de la app nueva (ARR-011, ARR-012, DIA-004), portado de instalador/ChatCouncil.iss de la Unity:
; copia el ejecutable, crea los accesos directos y comprueba el runtime de WebView2. Lo compila el CI con
; ISCC.exe /DVersion=X.Y.Z; el ejecutable va en target\release (relativo a la raíz). Convive con la Unity: otro AppId,
; otra carpeta y otro grupo del menú Inicio.
#ifndef Version
  #define Version "0.0.0"
#endif

[Setup]
AppId=cl.juanfernandez.chatcouncil
AppName=ChatCouncil (nueva)
AppVersion={#Version}
AppPublisher=ChatCouncil
DefaultDirName={autopf}\ChatCouncilNueva
DefaultGroupName=ChatCouncil (nueva)
DisableProgramGroupPage=yes
OutputDir=..\salida
OutputBaseFilename=ChatCouncilNueva-instalador
UninstallDisplayIcon={app}\ChatCouncilNueva.exe
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

[Components]
; D31: el acceso de depuración abre el perfil real con el puerto 9222; no se instala salvo que se marque.
Name: "depuracion"; Description: "Acceso de depuración (abre el perfil real con el puerto 9222)"; Flags: unchecked

[Tasks]
Name: "escritorio"; Description: "Crear un acceso directo en el escritorio"

[Files]
Source: "..\target\release\ChatCouncilNueva.exe"; DestDir: "{app}"; Flags: ignoreversion
; Herramienta de depuración: abre la app con el puerto local de WebView2 para inspeccionar los paneles.
Source: "abrir-depurando.bat"; DestDir: "{app}"; Flags: ignoreversion; Components: depuracion

[Icons]
Name: "{group}\ChatCouncil (nueva)"; Filename: "{app}\ChatCouncilNueva.exe"
Name: "{group}\ChatCouncil (depuración)"; Filename: "{app}\abrir-depurando.bat"; IconFilename: "{app}\ChatCouncilNueva.exe"; Components: depuracion
Name: "{autodesktop}\ChatCouncil (nueva)"; Filename: "{app}\ChatCouncilNueva.exe"; Tasks: escritorio

[Run]
Filename: "{app}\ChatCouncilNueva.exe"; Description: "Abrir ChatCouncil"; Flags: nowait postinstall skipifsilent
Filename: "{app}\ChatCouncilNueva.exe"; Flags: nowait runasoriginaluser; Check: WizardSilent

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
