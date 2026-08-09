@echo off
REM ============================================================
REM  Abrir ChatCouncil
REM
REM  Existe porque hasta el 2026-08-02 la unica forma de abrir la
REM  aplicacion era escribir un comando de pnpm en una terminal, y
REM  Juan -que es el unico usuario- no tenia por que saberlo. Una
REM  herramienta que su propio dueno no puede abrir no esta hecha.
REM
REM  Doble clic sobre este archivo. Compila y abre las cuatro
REM  vistas con las sesiones ya iniciadas. Cerrar la ventana
REM  cierra la aplicacion.
REM ============================================================
cd /d "%~dp0"
echo Compilando ChatCouncil...
call pnpm --filter @chatcouncil/desktop build
if errorlevel 1 (
  echo.
  echo No se pudo compilar. Revisa el mensaje de arriba.
  pause
  exit /b 1
)
echo Abriendo...
cd apps\desktop
call pnpm exec electron out/main/index.js --cc-login
cd /d "%~dp0"
