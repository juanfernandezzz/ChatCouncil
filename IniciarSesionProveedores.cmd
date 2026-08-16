@echo off
REM ============================================================
REM  Iniciar sesion en los cinco proveedores nuevos
REM
REM  Doble clic sobre este archivo. Abre UNA ventana con los CINCO
REM  candidatos: grok, mistral, deepseek, qwen y kimi, en ese orden.
REM  qwen y kimi ya tenian sesion iniciada de antes; se abren igual
REM  porque hace falta poder ENVIAR un mensaje en los cinco (es lo
REM  que requiere el siguiente paso de la investigacion), y eso ya
REM  no cabe en un lanzador de solo tres.
REM
REM  Los cinco NO entran uno al lado del otro apretados: cada panel
REM  tiene su propio ANCHO MINIMO (medido con --cc-barrido), y la fila
REM  se DESPLAZA en vez de comprimirse. Los botones de flecha (< >)
REM  de la barra superior mueven la fila; no navegan ni recargan
REM  ningun panel, asi que no rompen ninguna sesion ni conversacion.
REM
REM  QUE HAY QUE HACER:
REM   1. Iniciar sesion en el panel de grok (si no lo esta ya).
REM   2. Iniciar sesion en el panel de mistral (si no lo esta ya).
REM   3. Iniciar sesion en el panel de deepseek (si no lo esta ya).
REM   4. Desplazar la fila con las flechas y revisar qwen y kimi:
REM      tienen que mostrar la interfaz de chat, no un login.
REM   5. Cerrar la ventana con la X.
REM
REM  Cerrar con la X es importante: ese camino es el que vuelca
REM  las sesiones a disco antes de salir. Si se mata el proceso
REM  desde el Administrador de tareas, el login puede no llegar
REM  a escribirse.
REM
REM  ESPERAR UNOS SEGUNDOS antes de volver a abrir la ventana. Abrir
REM  y cerrar en sucesion rapida contra la misma particion corrompe
REM  la base de sesion — ya paso, y costo los cuatro logins de los
REM  investigadores dos veces.
REM
REM  COMO SE CONFIRMA QUE UN LOGIN QUEDO. Al reabrir, el panel tiene
REM  que mostrar la interfaz de chat, NO la pantalla de inicio de
REM  sesion. Un conteo de cookies no alcanza: una pagina visitada sin
REM  loguearse tambien deja cookies. La evidencia observable es el
REM  compositor (la caja de texto para escribir) presente en el panel.
REM
REM  PARA ABRIR MENOS DE CINCO (por ejemplo, un login puntual), usa
REM  una terminal en esta carpeta:
REM    cd apps\desktop
REM    pnpm exec electron out/main/index.js --cc-login --cc-solo=grok,mistral
REM  (reemplaza la lista de ids por los que necesites).
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
echo Abriendo grok, mistral, deepseek, qwen y kimi para iniciar sesion...
cd apps\desktop
call pnpm exec electron out/main/index.js --cc-login --cc-solo=grok,mistral,deepseek,qwen,kimi
cd /d "%~dp0"
echo.
echo Listo. Si iniciaste sesion donde hacia falta y cerraste con la X,
echo las sesiones quedaron guardadas. Espera unos segundos antes
echo de volver a abrir esta misma ventana.
pause
