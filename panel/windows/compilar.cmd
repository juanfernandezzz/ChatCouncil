@echo off
rem Compila ChatCouncilPanel.dll (x64, MSVC) y la deja en unity\Assets\Plugins\x86_64.
rem Baja el SDK de WebView2 de nuget.org si falta, fijado por version y por SHA-256.
setlocal
pushd "%~dp0"
set VERSION=1.0.4258.31
set HASH=56f7f4b8bf9aee4b8efefbbdd4f67d5f74ebd1b100ed0806da71bf76af481aa9
mkdir obj 2>nul
if exist sdk\webview2\build\native\include\WebView2.h goto sdk_listo
mkdir sdk 2>nul
curl -sSL -o sdk\webview2.zip https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/%VERSION%/microsoft.web.webview2.%VERSION%.nupkg || goto fallo
powershell -NoProfile -Command "if ((Get-FileHash sdk\webview2.zip -Algorithm SHA256).Hash -ne %HASH%) { exit 1 }; Expand-Archive -Force sdk\webview2.zip sdk\webview2" || goto fallo
:sdk_listo
rem La ruta de vswhere tiene "(x86)": dentro de un for /f cerraria el parentesis, por eso va a un archivo.
"%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath > obj\vs.txt || goto fallo
set /p VS=<obj\vs.txt
if not defined VS goto fallo
echo compilar: Visual Studio en %VS%
call "%VS%\VC\Auxiliary\Build\vcvars64.bat" >nul || goto fallo
mkdir ..\..\unity\Assets\Plugins\x86_64 2>nul
cl /nologo /EHsc /std:c++17 /O2 /MT /W4 /WX /utf-8 /LD /Fo:obj\ /I sdk\webview2\build\native\include panel.cpp /link sdk\webview2\build\native\x64\WebView2LoaderStatic.lib user32.lib ole32.lib advapi32.lib /OUT:..\..\unity\Assets\Plugins\x86_64\ChatCouncilPanel.dll /IMPLIB:obj\ChatCouncilPanel.lib || goto fallo
popd
echo compilar: ok
exit /b 0
:fallo
popd
echo compilar: FALLO
exit /b 1
