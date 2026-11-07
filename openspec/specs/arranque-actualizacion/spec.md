# Arranque y actualización

Propósito: abrir la app en la carpeta de datos correcta, guiar el primer arranque, retomar la ronda activa y ofrecer la versión nueva del Release sin instalar nunca sola.

> Extraído de ChatCouncil-Unity (ChatCouncil-main, commit 247f6db) el 2026-11-07. Rutas relativas a ese repo.

## Requisitos

### ARR-001 · Carpeta de datos
- Qué hace: la carpeta de datos es la que da `-datos CARPETA` o, si no, la de Unity para la app (en Windows `%USERPROFILE%\AppData\LocalLow\ChatCouncil\ChatCouncil`, D28).
- Condición y resultado observable: con `-datos C:\x`, las conversaciones se escriben en `C:\x\conversaciones`.
- Fuente: unity/Assets/Interfaz/Aplicacion.cs:22 ; unity/Assets/Interfaz/Aplicacion.cs:69 ; docs/BLUEPRINT.md:2713-2716
- Prueba: manual — 1. Abrir `ChatCouncil.exe -datos <carpeta de prueba>`. 2. Pegar una pregunta. 3. Comprobar el `.jsonl` en `<carpeta de prueba>\conversaciones`.
- Plataforma: ambas

### ARR-002 · Primer arranque guiado
- Qué hace: si no existe `seleccion-proveedores.json`, la app abre Ajustes en modo bienvenida, sin riel ni cajón, hasta terminar la guía; con el archivo, arma la Ronda con ese consejo y la sección pedida por `-seccion` o «ronda».
- Condición y resultado observable: en una carpeta vacía se ve «Te damos la bienvenida» y «Paso 1 de 2: tu consejo».
- Fuente: unity/Assets/Interfaz/Aplicacion.cs:128-136 ; unity/Assets/Interfaz/Aplicacion.cs:153-156 ; unity/Assets/Interfaz/Configuracion.cs:58 ; unity/Assets/Interfaz/Configuracion.cs:113-118
- Prueba: manual — 1. Abrir la app con `-datos` apuntando a una carpeta vacía. 2. Comprobar la bienvenida y que no hay riel. 3. Terminar los dos pasos y comprobar que aparece la Ronda.
- Plataforma: ambas

### ARR-003 · Retomar la ronda activa
- Qué hace: al armar la Ronda, la Puerta restaura la ronda activa del registro sin escribir.
- Condición y resultado observable: tras cerrar y abrir la app a mitad de una ronda, la barra muestra la misma etapa.
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:188-189 ; motor/Runtime/Puerta.cs:207-240
- Prueba: vector — motor/Tests/PuertaPruebas.cs:605 (LaRondaActivaSeRestauraDelRegistro)
- Plataforma: ambas

### ARR-004 · Specs en caliente
- Qué hace: un `specs.json` válido en la carpeta de datos reemplaza al compilado (D61); si no se puede leer o no es JSON, se usan las compiladas; Ayuda lo dice junto a la versión con « Usa el specs.json de la carpeta de datos (pruebas).».
- Condición y resultado observable: con un `specs.json` válido en la carpeta, Ayuda muestra ese aviso.
- Fuente: unity/Assets/Interfaz/Aplicacion.cs:70-81 ; unity/Assets/Interfaz/Aplicacion.cs:292 ; docs/BLUEPRINT.md:2974-2977
- Prueba: manual — 1. Copiar `packages/providers/src/specs.json` a la carpeta de datos de prueba. 2. Abrir la app y ir a Ayuda. 3. Comprobar el aviso junto a la versión.
- Plataforma: ambas

### ARR-005 · Tope de 60 cuadros por segundo
- Qué hace: la app limita su dibujo a 60 cuadros por segundo (D67).
- Condición y resultado observable: en reposo, ChatCouncil.exe no gasta casi un núcleo de CPU.
- Fuente: unity/Assets/Interfaz/Aplicacion.cs:68 ; docs/BLUEPRINT.md:3013
- Prueba: manual — 1. Abrir la app con un perfil de prueba y dejarla en reposo 1 minuto. 2. Medir el uso de CPU del proceso tres veces. 3. Compararlo con la línea base.
- Plataforma: ambas

### ARR-006 · Escala física
- Qué hace: 1 px de estilo es 1 dp en Android (160 dpi) y 1 píxel efectivo en Windows (96 dpi al 100 %).
- Condición y resultado observable: con escala de Windows al 150 %, la interfaz se ve al mismo tamaño físico.
- Fuente: unity/Assets/Interfaz/Aplicacion.cs:86-88
- Prueba: manual — 1. Abrir la app con escala de Windows 100 % y luego 150 %. 2. Comprobar que los controles mantienen su tamaño físico.
- Plataforma: ambas

### ARR-007 · Las pruebas nunca usan la carpeta real ni buscan actualización
- Qué hace: con `-pruebaronda` o `-pruebainterfaz`, la app usa páginas locales en vez de los proveedores; con `-autoprueba` no arma la interfaz; la búsqueda de actualización no corre en pruebas ni en capturas.
- Condición y resultado observable: corriendo `-pruebaronda`, no se hace ningún pedido al Release.
- Fuente: unity/Assets/Interfaz/Aplicacion.cs:51-55 ; unity/Assets/Interfaz/Aplicacion.cs:120-126 ; unity/Assets/Interfaz/Aplicacion.cs:165
- Prueba: manual — 1. Correr la app con `-pruebaronda` y una carpeta de prueba. 2. Comprobar con el monitor de recursos que no hay conexión a github.com.
- Plataforma: ambas

### ARR-008 · Buscar versión nueva al abrir
- Qué hace: al abrir, pide `version.txt` del Release con techo de 15 s; sin red o sin Release no muestra nada; solo ofrece si la publicada es mayor y la local no es una compilación local (0.1.0).
- Condición y resultado observable: aviso «Hay una versión nueva ({v}); tienes la {actual}. La app se cierra y se vuelve a abrir; tus rondas se conservan.» con el botón «Actualizar».
- Fuente: unity/Assets/Interfaz/Actualizador.cs:20 ; unity/Assets/Interfaz/Actualizador.cs:38-55 ; motor/Runtime/Actualizacion.cs:5-13
- Prueba: vector — motor/Tests/ActualizacionPruebas.cs:15 (SoloEsNuevaUnaVersionPublicadaMayor)
- Plataforma: ambas

### ARR-009 · Instalar la actualización en Windows
- Qué hace: al tocar «Actualizar», descarga el instalador al temporal con barra «Descargando la versión {v}… {p} %»; si la descarga queda incompleta o falla, «No se pudo descargar la actualización. Revisa tu conexión.» con «Reintentar»; si no, «Instalando… la app se reinicia sola.», corre el instalador con /SILENT y cierra la app; si el instalador no abre, «No se pudo abrir el instalador (error {n}).».
- Condición y resultado observable: tras actualizar, la app vuelve a abrirse sola con la versión nueva.
- Fuente: unity/Assets/Interfaz/Actualizador.cs:66-117
- Prueba: manual — 1. Instalar una versión anterior en un usuario de prueba. 2. Abrir la app y tocar «Actualizar». 3. Comprobar la barra, el cierre y que reabre con la versión nueva.
- Plataforma: windows

### ARR-010 · Actualización en Android
- Qué hace: en Android, «Actualizar» abre la descarga del `.apk` del Release; la persona confirma la instalación.
- Condición y resultado observable: se abre el navegador del sistema con la descarga de `ChatCouncil.apk`.
- Fuente: unity/Assets/Interfaz/Actualizador.cs:16 ; unity/Assets/Interfaz/Actualizador.cs:68-72
- Prueba: manual — 1. Instalar una versión anterior en un Android de prueba. 2. Tocar «Actualizar». 3. Comprobar que se abre la descarga del `.apk`.
- Plataforma: android

### ARR-011 · Instalador sin administrador y en español
- Qué hace: el instalador no pide permisos de administrador (puede elegir todos los usuarios), está en español, ofrece «Crear un acceso directo en el escritorio», no usa el reinicio de Inno y, en modo silencioso, relanza la app con los permisos del usuario original (D68).
- Condición y resultado observable: tras una actualización silenciosa, la app corre sin elevación.
- Fuente: instalador/ChatCouncil.iss:22-33 ; instalador/ChatCouncil.iss:44-46 ; docs/BLUEPRINT.md:3014
- Prueba: manual — 1. Actualizar desde la app en un usuario de prueba. 2. Abrir el Administrador de tareas, columna «Elevado». 3. Comprobar «No» para ChatCouncil.exe.
- Plataforma: windows

### ARR-012 · Aviso si falta WebView2
- Qué hace: si el runtime de WebView2 no está (por equipo o por usuario), el instalador avisa «ChatCouncil necesita Microsoft Edge WebView2 Runtime, que no está en este equipo. Sin él, los paneles no se abren.» y ofrece abrir la página de descarga; la instalación sigue igual.
- Condición y resultado observable: en un equipo sin WebView2 aparece el diálogo con Sí y No.
- Fuente: instalador/ChatCouncil.iss:48-70
- Prueba: manual — 1. En una máquina virtual sin WebView2, correr el instalador. 2. Comprobar el diálogo y que la instalación termina con cualquiera de las dos respuestas.
- Plataforma: windows

## Invariantes

### INV-ARR-001 · La app nunca instala sola
- Qué nunca pasa: la actualización se instala sin que la persona toque «Actualizar».
- Fuente: unity/Assets/Interfaz/Actualizador.cs:13-14 ; unity/Assets/Interfaz/Actualizador.cs:35
- Prueba: manual — 1. Abrir una versión anterior con un perfil de prueba. 2. Esperar 5 minutos sin tocar el aviso. 3. Comprobar que la versión no cambió.

### INV-ARR-002 · Una compilación local nunca ofrece actualización
- Qué nunca pasa: una versión con número de compilación 0 (0.1.0) muestra el aviso.
- Fuente: motor/Runtime/Actualizacion.cs:12-13
- Prueba: vector — motor/Tests/ActualizacionPruebas.cs:15 (SoloEsNuevaUnaVersionPublicadaMayor)

## Conflictos

### CONFLICTO-ARR-01
- docs/BLUEPRINT.md:2633-2637 (D16) rechaza el aviso automático: «sin tienda, nada avisa de una versión nueva».
- unity/Assets/Interfaz/Actualizador.cs:38-55 busca la versión al abrir y muestra el aviso, como dice D59 (docs/BLUEPRINT.md:2962-2966), posterior.
