; Instalador de Windows (spec, Distribución): copia el build de Unity, crea los accesos directos y comprueba el runtime
; de WebView2. Lo compila el CI con ISCC.exe /DVersion=X.Y.Z; el build va en build\windows (relativo a la raíz).
#ifndef Version
  #define Version "0.0.0"
#endif

[Setup]
AppId={{8C2B4E57-1C1E-4E4B-9C3B-6D9A3B2F0C11}
AppName=ChatCouncil
AppVersion={#Version}
AppPublisher=ChatCouncil
DefaultDirName={autopf}\ChatCouncil
DefaultGroupName=ChatCouncil
DisableProgramGroupPage=yes
OutputDir=..\salida
OutputBaseFilename=ChatCouncil-instalador
UninstallDisplayIcon={app}\ChatCouncil.exe
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; Sin permisos de administrador: se instala para la persona; puede elegir todos los usuarios.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
WizardStyle=modern

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "escritorio"; Description: "Crear un acceso directo en el escritorio"

[Files]
Source: "..\build\windows\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{group}\ChatCouncil"; Filename: "{app}\ChatCouncil.exe"
Name: "{autodesktop}\ChatCouncil"; Filename: "{app}\ChatCouncil.exe"; Tasks: escritorio

[Run]
Filename: "{app}\ChatCouncil.exe"; Description: "Abrir ChatCouncil"; Flags: nowait postinstall skipifsilent

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
