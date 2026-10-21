@echo off
rem Abre ChatCouncil con el puerto de depuracion local de WebView2 (127.0.0.1:9222) para inspeccionar los paneles.
rem Mientras esta abierta asi, cualquier programa del equipo puede leer las sesiones: cerrarla al terminar.
rem El instalador lo deja junto a ChatCouncil.exe; desde el repo, busca la app instalada.
tasklist /fi "imagename eq ChatCouncil.exe" | find /i "ChatCouncil.exe" >nul && (echo ChatCouncil ya esta abierta. Cierrala y vuelve a abrir este archivo. & pause & exit /b)
set "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling --remote-debugging-port=9222"
set "APP=%~dp0ChatCouncil.exe"
if not exist "%APP%" set "APP=%ProgramFiles%\ChatCouncil\ChatCouncil.exe"
if not exist "%APP%" set "APP=%LOCALAPPDATA%\Programs\ChatCouncil\ChatCouncil.exe"
start "" "%APP%"
