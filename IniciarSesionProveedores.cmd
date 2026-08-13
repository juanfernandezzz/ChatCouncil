@echo off
REM ============================================================
REM  Iniciar sesion en los proveedores nuevos
REM
REM  Doble clic sobre este archivo. Abre UNA ventana con SOLO
REM  TRES paneles: grok, mistral y deepseek, en ese orden.
REM  qwen y kimi NO se abren aca: ya tienen sesion iniciada de
REM  antes, y tocar su particion sin necesidad es un riesgo que
REM  este lanzador no tiene por que correr.
REM
REM  Por que tres y no cinco. Sobre una pantalla de 1366 px, cinco
REM  paneles dan unos 273 px cada uno, y a ese ancho varias
REM  pantallas de inicio de sesion esconden el formulario o mandan
REM  a un flujo distinto. Con tres son unos 455 px cada uno.
REM
REM  QUE HAY QUE HACER:
REM   1. Iniciar sesion en el panel de grok.
REM   2. Iniciar sesion en el panel de mistral.
REM   3. Iniciar sesion en el panel de deepseek.
REM   4. Cerrar la ventana con la X.
REM
REM  Cerrar con la X es importante: ese camino es el que vuelca
REM  las sesiones a disco antes de salir. Si se mata el proceso
REM  desde el Administrador de tareas, el login puede no llegar
REM  a escribirse.
REM
REM  ESPERAR UNOS SEGUNDOS antes de volver a abrir la ventana (para
REM  reabrir y confirmar que el login sobrevivio, por ejemplo). Abrir
REM  y cerrar en sucesion rapida contra la misma particion corrompe
REM  la base de sesion — ya paso, y costo los cuatro logins de los
REM  investigadores dos veces.
REM
REM  COMO SE CONFIRMA QUE EL LOGIN QUEDO. Al reabrir, cada panel
REM  tiene que mostrar la interfaz de chat, NO la pantalla de inicio
REM  de sesion. Un conteo de cookies no alcanza: una pagina visitada
REM  sin loguearse tambien deja cookies, y eso no distingue "entre" de
REM  "vio la pagina". Lo que se necesita es la evidencia observable:
REM  el compositor (la caja de texto para escribir) presente en el
REM  panel.
REM
REM  Las particiones son persistentes, asi que esto se hace UNA
REM  sola vez por proveedor.
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
echo Abriendo grok, mistral y deepseek para iniciar sesion...
cd apps\desktop
call pnpm exec electron out/main/index.js --cc-login --cc-solo=grok,mistral,deepseek
cd /d "%~dp0"
echo.
echo Listo. Si iniciaste sesion en los tres y cerraste con la X,
echo las sesiones quedaron guardadas. Espera unos segundos antes
echo de volver a abrir esta misma ventana.
pause
