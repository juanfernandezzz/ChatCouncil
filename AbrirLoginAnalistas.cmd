@echo off
REM ============================================================
REM  Iniciar sesion en los ANALISTAS (Qwen y Kimi)
REM
REM  Doble clic sobre este archivo. Abre UNA ventana con SOLO
REM  dos paneles: Qwen a la izquierda y Kimi a la derecha.
REM
REM  Por que dos y no seis. AbrirChatCouncil.cmd abre los cuatro
REM  investigadores mas los dos analistas; sobre una pantalla de
REM  1366 px eso deja unos 225 px por panel, y a ese ancho varias
REM  pantallas de inicio de sesion esconden el formulario o
REM  mandan a un flujo distinto. Con dos paneles son unos 675 px
REM  cada uno, que es ancho de sobra para entrar comodo.
REM
REM  QUE HAY QUE HACER:
REM   1. Iniciar sesion en el panel de Qwen.
REM   2. Iniciar sesion en el panel de Kimi.
REM   3. Cerrar la ventana con la X.
REM
REM  Cerrar con la X es importante: ese camino es el que vuelca
REM  las sesiones a disco antes de salir. Si se mata el proceso
REM  desde el Administrador de tareas, el login puede no llegar
REM  a escribirse.
REM
REM  Las particiones son persistentes, asi que esto se hace UNA
REM  sola vez.
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
echo Abriendo solo Qwen y Kimi para iniciar sesion...
cd apps\desktop
call pnpm exec electron out/main/index.js --cc-login --cc-solo-candidatos
cd /d "%~dp0"
echo.
echo Listo. Si iniciaste sesion en los dos y cerraste con la X,
echo las sesiones quedaron guardadas.
pause
