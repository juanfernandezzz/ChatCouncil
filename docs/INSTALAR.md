# Instalar ChatCouncil (versión Unity)

Todo se descarga de una sola página, sin terminal ni git:
**https://github.com/juanfernandezzz/ChatCouncil/releases/tag/chatcouncil-unity-v1**

En "Assets" hay dos archivos:

| Archivo | Para |
|---|---|
| `ChatCouncil-instalador.exe` | Windows 10 u 11, de 64 bits |
| `ChatCouncil.apk` | Android 7.1 o más nuevo |

Cada vez que se mejora la app, esos dos archivos se reemplazan por la versión nueva. Para actualizar, se
repite la instalación: tus rondas e informes se conservan.

## En Windows

1. Abre la página de arriba y haz clic en **ChatCouncil-instalador.exe**. Se descarga a tu carpeta Descargas.
2. Ábrelo. Si Windows muestra **"Windows protegió su PC"**, haz clic en **Más información** y después en
   **Ejecutar de todas formas**. Aparece porque el instalador no tiene firma de un editor conocido.
3. Si el instalador pregunta para quién instalar, elige **Instalar solo para mí**: no hace falta ser
   administrador.
4. Deja marcada **Crear un acceso directo en el escritorio** y sigue con **Siguiente** hasta **Instalar**.
5. Al terminar, deja marcada **Abrir ChatCouncil** y pulsa **Finalizar**.

ChatCouncil queda en el menú Inicio y en el escritorio.

**Si aparece un aviso sobre "Microsoft Edge WebView2 Runtime":** la app lo necesita para abrir los paneles.
Pulsa **Sí**: se abre la página de Microsoft. Descarga el **Evergreen Bootstrapper**, instálalo y abre
ChatCouncil de nuevo. En Windows 10 y 11 actualizados casi siempre ya está instalado.

**Actualizar:** descarga el instalador nuevo y vuelve a instalar encima.

**Desinstalar:** Configuración → Aplicaciones → ChatCouncil → Desinstalar. Tus rondas e informes no se
borran: quedan en la carpeta de datos que la app muestra en **Ajustes**.

## En Android

1. En el teléfono, abre la página de arriba en el navegador y toca **ChatCouncil.apk**. Si el navegador
   advierte que el archivo puede ser dañino, toca **Descargar de todas formas**.
2. Abre el archivo descargado (desde la notificación o desde la app Archivos).
3. Si Android dice que no puede instalar apps de esa fuente, toca **Configuración**, activa **Permitir de
   esta fuente** y vuelve con la flecha de atrás.
4. Toca **Instalar**. Si Google Play Protect muestra un aviso, toca **Más detalles** y después
   **Instalar de todas formas**: aparece porque la app no viene de Google Play.
5. Toca **Abrir**.

**Si la app dice que el teléfono no admite perfiles separados:** actualiza **Android System WebView** desde
Google Play y ábrela de nuevo. ChatCouncil lo necesita para que cada servicio tenga su propia sesión.

**Actualizar:** descarga el `.apk` nuevo e instálalo encima. Tus rondas se conservan.

**Si al actualizar dice "No se instaló la app":** la versión que tienes se firmó con otra llave; solo pasa
con una versión de prueba anterior a este Release. Desinstala ChatCouncil y vuelve a instalar. Eso borra los
datos que tenía esa versión de prueba.
