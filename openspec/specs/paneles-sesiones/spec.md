# Paneles y sesiones

Propósito: mostrar las páginas reales de cada proveedor en paneles nativos con un perfil compartido, y saber si hay sesión sin tocar credenciales.

> Extraído de ChatCouncil-Unity (ChatCouncil-main, commit 247f6db) el 2026-11-07. Rutas relativas a ese repo.

## Requisitos

### PAN-001 · Un navegador compartido en la carpeta de datos
- Qué hace: la app inicia un solo navegador con su carpeta en `<carpeta de datos>/navegador`, con los switches que mantienen activos los paneles ocultos (`--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling`); el user agent no se toca.
- Condición y resultado observable: tras abrir la app existe la carpeta `navegador` y un panel oculto sigue ejecutando sus temporizadores.
- Fuente: unity/Assets/Interfaz/Aplicacion.cs:171-174 ; unity/Assets/Panel/Paneles.cs:21-35
- Prueba: manual — 1. Abrir la app con un perfil de prueba. 2. Comprobar que existe `navegador` en la carpeta de datos. 3. Pegar la pregunta, ocultar un panel y comprobar que su estado sigue cambiando a «Respondiendo».
- Plataforma: ambas

### PAN-002 · Un solo perfil para los proveedores
- Qué hace: todos los proveedores comparten el perfil `proveedores` (D60): el login de Google sirve en todos; las cookies siguen siendo de cada sitio.
- Condición y resultado observable: entrar con Google en un proveedor deja la cuenta disponible en «Continuar con Google» de los demás.
- Fuente: unity/Assets/Panel/Paneles.cs:37-38 ; unity/Assets/Interfaz/PantallaRonda.cs:1234-1237
- Prueba: manual — 1. Con un perfil de prueba, entrar a Gemini con una cuenta Google de prueba. 2. Abrir Claude y tocar «Continuar con Google». 3. Comprobar que la cuenta aparece ofrecida.
- Plataforma: ambas

### PAN-003 · Creación de panel con techo de 90 s
- Qué hace: crear un panel espera hasta 90 s; si la primera página no termina de cargar a tiempo, el panel se queda y la página termina sola.
- Condición y resultado observable: con siete páginas abriendo a la vez, ninguna queda huérfana; la lenta aparece cuando termina.
- Fuente: unity/Assets/Panel/Paneles.cs:70-72 ; unity/Assets/Panel/Paneles.cs:115-129
- Prueba: manual — 1. Abrir la app con red lenta simulada por el sistema. 2. Comprobar que todos los paneles aparecen sin duplicados al terminar de cargar.
- Plataforma: ambas

### PAN-004 · Ventanas emergentes en el mismo perfil
- Qué hace: un `window.open` (por ejemplo «Continuar con Google») abre una ventana propia con el mismo perfil y `window.opener` conectado; tamaño por defecto 520x680, mínimo 400x500 si la página pide tamaño.
- Condición y resultado observable: el login por ventana emergente vuelve con la sesión abierta al panel original.
- Fuente: panel/windows/panel.cpp:209-239
- Prueba: manual — 1. En un perfil de prueba abrir un proveedor sin sesión. 2. Tocar «Continuar con Google». 3. Comprobar que se abre una ventana de 520x680 y que al terminar el panel queda con sesión.
- Plataforma: windows

### PAN-005 · Cierres de sesión bloqueados salvo clic de la persona
- Qué hace: toda navegación a una URL que coincide con `/(logout|log-out|signout|sign-out)(\b|/|\?|$)` se cancela y se cuenta, salvo que la inicie la persona con un clic y no sea una redirección. Navegar desde la app a una URL bloqueada termina en el error «La navegación a {url} se bloqueó: es un cierre de sesión.».
- Condición y resultado observable: una redirección de claude.ai `/new` a `/logout` no cierra la sesión.
- Fuente: panel/windows/panel.cpp:62-63 ; panel/windows/panel.cpp:182-204 ; unity/Assets/Panel/Paneles.cs:131-140
- Prueba: nueva — navegar un panel de prueba a `https://example.com/logout` desde `Navegar` y comprobar la excepción y el contador de bloqueadas.
- Plataforma: ambas

### PAN-006 · Estado de sesión por el compositor
- Qué hace: hay sesión si la página muestra el compositor de su spec (`leerCompositor` devuelve texto); nunca se miran cookies. Comprobar reintenta cada 500 ms hasta 10 s.
- Condición y resultado observable: en Ajustes, la cuenta pasa de «Comprobando…» a «Sesión abierta» o a «Sin sesión: entra a tu cuenta en la página y toca Comprobar.»; si falla, «No se pudo comprobar: {error}».
- Fuente: motor/Runtime/Dominio.cs:30-32 ; unity/Assets/Interfaz/Configuracion.cs:28 ; unity/Assets/Interfaz/Configuracion.cs:247-270
- Prueba: vector — motor/Tests/RondaPruebas.cs:157 (LaSesionSeDeduceDelCompositor)
- Plataforma: ambas

### PAN-007 · Entrar a una cuenta desde Ajustes
- Qué hace: «Entrar» muestra la página del proveedor dentro de Ajustes (creando el panel si hace falta) y comprueba la sesión. Estados: «Sin comprobar», «Abriendo la página…», «No se pudo abrir la página: {error}».
- Condición y resultado observable: tocar «Entrar» en una fila muestra la página del proveedor con su nombre como título.
- Fuente: unity/Assets/Interfaz/Configuracion.cs:163-189 ; unity/Assets/Interfaz/Configuracion.cs:220-245
- Prueba: manual — 1. Ir a Ajustes con un perfil de prueba. 2. Tocar «Entrar» en DeepSeek. 3. Comprobar la página y el estado «Comprobando…» y luego el resultado.
- Plataforma: ambas

### PAN-008 · Recargar la página
- Qué hace: «Recargar la página» recarga desde el navegador; si el panel nunca abrió, lo vuelve a crear sin reiniciar la app. Mensajes: «Se recargó la página de {nombre}.» o «No se pudo recargar {nombre}: {error}».
- Condición y resultado observable: tras recargar, el panel vuelve a la URL del proveedor y se anuncia el mensaje.
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:1252-1271 ; unity/Assets/Panel/Paneles.cs:142-150
- Prueba: manual — 1. En la ronda, abrir «Más…». 2. Tocar «Recargar la página». 3. Comprobar el mensaje «Se recargó la página de …».
- Plataforma: ambas

### PAN-009 · Cerrar la sesión de un panel
- Qué hace: tras confirmar, borra solo los datos del sitio del proveedor (cookies, almacenamiento y caché de su origen) y vuelve a abrir su página. Texto del diálogo: «Se borra todo lo que el sitio de {nombre} guardó (la sesión, las cookies y sus datos) y su página vuelve a abrirse sin cuenta. Tu sesión de Google, la de los demás proveedores, las rondas y los informes no se tocan. Después puedes entrar con otra cuenta.»; botón «Cerrar la sesión».
- Condición y resultado observable: el panel queda sin sesión y los demás siguen con la suya; mensaje «Sesión de {nombre} cerrada. Entra con la cuenta que quieras en su página.».
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:1296-1315 ; unity/Assets/Panel/Paneles.cs:211-224
- Prueba: manual — 1. Con un perfil de prueba con sesión en dos proveedores, abrir «Más…» en uno. 2. Tocar «Cerrar la sesión de este panel…» y confirmar. 3. Comprobar que ese queda sin sesión y el otro no.
- Plataforma: ambas

### PAN-010 · Agregar una cuenta de Google
- Qué hace: navega el panel a `accounts.google.com/AddSession` y explica cómo volver: «Entra con la otra cuenta de Google en este panel. Después usa «Cerrar la sesión de este panel…» para volver a {nombre} y, en «Continuar con Google», elige la cuenta.».
- Condición y resultado observable: el panel muestra la página de Google para agregar una cuenta; si falla, «No se pudo abrir el acceso de Google: {error}».
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:1238-1250
- Prueba: manual — 1. En la ronda, abrir «Más…». 2. Tocar «Agregar una cuenta de Google». 3. Comprobar la página de Google y el mensaje.
- Plataforma: ambas

### PAN-011 · Paneles ocultos fuera de la ventana, no a 0x0
- Qué hace: al esconder un panel se mueve fuera de la ventana con su tamaño, para que la página siga montando.
- Condición y resultado observable: al cambiar de sección, la página no se ve pero sigue respondiendo a `estado`.
- Fuente: unity/Assets/Interfaz/Configuracion.cs:303-313 ; unity/Assets/Interfaz/PantallaRonda.cs:566-582
- Prueba: manual — 1. Pegar la pregunta. 2. Ir a Ajustes mientras un proveedor responde. 3. Volver a Ronda y comprobar que el estado avanzó.
- Plataforma: ambas

### PAN-012 · El teclado no queda atrapado en la página
- Qué hace: el Tab que sale de la página devuelve el foco a la app, y F1 a F5 dentro de la página se entregan a la app; Alt+F4 sigue cerrando la ventana.
- Condición y resultado observable: con el foco dentro de un panel, F1 abre la Ronda.
- Fuente: panel/windows/panel.cpp:319-343
- Prueba: manual — 1. Hacer clic dentro de un panel. 2. Pulsar F3. 3. Comprobar que se abre Ajustes.
- Plataforma: windows

### PAN-013 · Adjuntar archivo al compositor
- Qué hace: en Windows suelta el archivo sobre el compositor con un arrastre simulado (`dragEnter`, `dragOver`, `drop`); en Android activa el `<input type=file>` y el selector del sistema devuelve el archivo preparado. Errores: «No está el compositor: no hay dónde soltar el archivo.» / «No hay un <input type=file> en la página: no se puede adjuntar.».
- Condición y resultado observable: el archivo de la operación aparece adjunto en el compositor del proveedor.
- Fuente: unity/Assets/Panel/Paneles.cs:165-199
- Prueba: manual — 1. En un perfil de prueba llegar a la operación con la ruta de archivo. 2. Tocar «Pegar la operación aquí». 3. Comprobar en la página que el archivo quedó adjunto.
- Plataforma: ambas

### PAN-014 · Panel del PDF con perfil propio
- Qué hace: el PDF se imprime en un panel oculto con perfil `informe-pdf`, que no comparte cookies con los proveedores.
- Condición y resultado observable: tras armar el informe existe el perfil `informe-pdf` y ningún proveedor recibe pedidos de él.
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:1196-1205
- Prueba: manual — 1. Armar un informe con un perfil de prueba. 2. Comprobar que el PDF existe y que no apareció ninguna página visible nueva.
- Plataforma: ambas

## Invariantes

### INV-PAN-001 · Nunca se leen cookies ni almacenamiento
- Qué nunca pasa: el panel o el script de página leen, copian o registran cookies, tokens o almacenamiento; la sesión se deduce del compositor.
- Fuente: panel/windows/panel.cpp:8-9 ; pagina/src/pagina.ts:6-10 ; motor/Runtime/Dominio.cs:30-32
- Prueba: manual — 1. Buscar en `panel/` y `pagina/src` llamadas a cookies o storage de lectura. 2. Comprobar que solo existe el borrado por origen.

### INV-PAN-002 · El user agent nunca se cambia
- Qué nunca pasa: la app modifica el user agent de los paneles.
- Fuente: panel/windows/panel.cpp:8-9 ; unity/Assets/Panel/Paneles.cs:21-23
- Prueba: manual — 1. Abrir un panel de prueba en una página que muestre el user agent. 2. Compararlo con el de Edge del mismo equipo.

### INV-PAN-003 · Cerrar sesión nunca toca a los demás
- Qué nunca pasa: cerrar la sesión de un proveedor borra datos de otro origen.
- Fuente: unity/Assets/Panel/Paneles.cs:211-224
- Prueba: manual — 1. Igual que PAN-009, comprobar la sesión del otro proveedor.
