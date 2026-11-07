# Pruebas internas

Propósito: las pruebas que trae la app compilada (autoprueba del panel, prueba de la interfaz y prueba de la ronda), lanzadas por línea de comandos sobre carpetas y páginas locales de prueba, con un resultado contable y un código de salida.

> Extraído de ChatCouncil-Unity (ChatCouncil-main, commit 247f6db) el 2026-11-07. Rutas relativas a ese repo.

## Requisitos

### PRU-001 · Autoprueba del panel por línea de comandos
- Qué hace: con `-autoprueba RUTA`, la app compilada corre la autoprueba del panel en una carpeta temporal nueva `cc-autoprueba-{guid}` (en Android, la caché de la app), sobre páginas locales de `StreamingAssets/autoprueba` servidas como `cc-prueba.test` y `cc-otro.test`, y escribe en RUTA una línea de cabecera «Autoprueba del panel, {fecha}, {plataforma}, {versión}», la versión del navegador («WebView2 …» o «Android System WebView …»), una línea «OK {nombre}: {detalle}» o «FALLA {nombre}: {detalle}» por comprobación y «Resultado: {pasadas}/{total}»; sale con 0 si todas pasan y con 1 si no. Un grupo que lanza queda como FALLA «se cortó con una excepción: …» y los demás siguen.
- Condición y resultado observable: el archivo de salida termina en «Resultado: N/N» y el proceso sale con código 0.
- Fuente: unity/Assets/Autoprueba/Autoprueba.cs:19-24 ; unity/Assets/Autoprueba/Autoprueba.cs:48-117
- Prueba: manual — 1. Correr `ChatCouncil.exe -autoprueba salida.txt`. 2. Esperar a que la app se cierre. 3. Comprobar el código de salida y que la última línea es «Resultado: N/N».
- Plataforma: ambas

### PRU-002 · Autoprueba: panel básico
- Qué hace: comprueba el perfil que informa el navegador; en Windows, los tres switches `--disable-backgrounding-occluded-windows`, `--disable-renderer-backgrounding` y `--disable-background-timer-throttling` en el proceso del navegador; escribir y leer un texto con ñ, acentos y líneas vacías idéntico; chat vacío; que escribir no navega; el contador de navegaciones; el bloqueo de `/logout` y `/auth/sign-out?vuelta=1` pedidos por la página (el panel se queda en la página); que navegar desde la app a un cierre de sesión avisa; frente y detrás entre dos paneles; y el rectángulo 800×600.
- Condición y resultado observable: líneas «OK bloqueo de /logout», «OK frente», «OK rectángulo».
- Fuente: unity/Assets/Autoprueba/Autoprueba.cs:157-217
- Prueba: manual — 1. Correr la autoprueba como en PRU-001. 2. Comprobar las líneas del grupo «panel».
- Plataforma: ambas

### PRU-003 · Autoprueba: escritura con las specs reales
- Qué hace: con las specs reales de chatgpt y mistral escribe por párrafos y lee idéntico; con saltos `\r\n` no quedan líneas de más ni `\r`; junto a una píldora de skill no editable escribe y la conserva; con la spec de kimi pega 180.000 caracteres con marcas de integridad y exige que se lean idénticos con integridad «completo», anotando caracteres, marcas y milisegundos.
- Condición y resultado observable: línea «OK pegado de 180.000 caracteres con marcas (spec kimi)».
- Fuente: unity/Assets/Autoprueba/Autoprueba.cs:221-283
- Prueba: manual — 1. Correr la autoprueba. 2. Comprobar las líneas del grupo «escritura».
- Plataforma: ambas

### PRU-004 · Autoprueba: lectura y diagnóstico
- Qué hace: en la página tipo chatgpt comprueba el mensaje de usuario, dos enlaces de fuente, el informe en iframe y «generando»; que el estado pasa de generando a fin «observado» al quitar el botón de detener; el diagnóstico de selectores con un conteo de 1 por selector y el iframe de otro origen; y que un selector inválido da «invalido». En kimi, que el texto excluye lo excluido y el html crudo lo conserva, y que se leen los 2 de 2 archivos. En mistral, que se leen el mensaje y el canvas, que el canvas queda cerrado después y que la etiqueta de modelo es «Rápido».
- Condición y resultado observable: líneas «OK lectura tipo chatgpt», «OK diagnóstico con un selector inválido», «OK canvas de mistral».
- Fuente: unity/Assets/Autoprueba/Autoprueba.cs:285-333
- Prueba: manual — 1. Correr la autoprueba. 2. Comprobar las líneas del grupo «lectura».
- Plataforma: ambas

### PRU-005 · Autoprueba: iframe, compositor recortado, adjunto y PDF
- Qué hace: lee un informe dentro de un iframe de otro origen; comprueba que el contenedor que recorta el compositor gana scroll, que el botón de enviar queda alcanzable y que el estado informa zoom 100; adjunta un archivo (en Windows soltado sobre el compositor; en Android por el selector del sistema) y comprueba nombre y tamaño en la página; imprime un PDF que empieza con «%PDF-» y pesa más de 1.000 bytes.
- Condición y resultado observable: líneas «OK script en un iframe de otro origen» y «OK PDF».
- Fuente: unity/Assets/Autoprueba/Autoprueba.cs:337-391
- Prueba: manual — 1. Correr la autoprueba. 2. Comprobar las líneas de los grupos «iframe de otro origen», «compositor recortado», «adjunto» y «pdf».
- Plataforma: ambas

### PRU-006 · Autoprueba: perfiles
- Qué hace: con una marca sintética en el almacenamiento del origen de prueba comprueba que la ventana emergente abre en 15 s en el mismo perfil con `window.opener` y se cierra con `window.close()`; que otro perfil no ve la marca; que borrar un sitio borra solo el suyo y deja la marca y la cookie del otro host; y que borrar los datos del perfil quita la marca.
- Condición y resultado observable: líneas «OK aislamiento entre dos perfiles» y «OK borrado de un solo sitio».
- Fuente: unity/Assets/Autoprueba/Autoprueba.cs:393-439
- Prueba: manual — 1. Correr la autoprueba. 2. Comprobar las líneas del grupo «perfiles».
- Plataforma: ambas

### PRU-007 · Autoprueba: techo externo
- Qué hace: cuelga a propósito una página 15 s y exige que el techo de 3 s la corte entre 2.900 y 6.000 ms y que otro panel responda en menos de 1.500 ms; además mide, sin exigirlo, cuánto tarda en volver la página trabada tras recargarla.
- Condición y resultado observable: líneas «OK techo externo sobre una página colgada», «OK un panel colgado no bloquea a los demás» y «MEDIDO recargar una página trabada: …».
- Fuente: unity/Assets/Autoprueba/Autoprueba.cs:441-472
- Prueba: manual — 1. Correr la autoprueba. 2. Comprobar las líneas del grupo «techo externo».
- Plataforma: ambas

### PRU-008 · Autoprueba: texto Unicode por el puente
- Qué hace: comprueba que un surrogate suelto llega intacto por el script de página y con `JSON.stringify` en la página, y que un texto con un emoji se escribe y se lee idéntico; mide, sin exigirlo, el resultado crudo de ExecuteScript con un surrogate suelto.
- Condición y resultado observable: línea «OK texto fuera del plano básico llega intacto».
- Fuente: unity/Assets/Autoprueba/Autoprueba.cs:119-153
- Prueba: manual — 1. Correr la autoprueba. 2. Comprobar las líneas del grupo «surrogate suelto».
- Plataforma: ambas

### PRU-009 · Prueba de la interfaz en tres fases
- Qué hace: con `-pruebainterfaz RUTA -fase N` y `-datos CARPETA`, maneja los controles reales sobre la carpeta de prueba con páginas locales (`chatgpt.html` con compositor, `popup.html` sin él); cada fase va en un arranque distinto con la misma carpeta y escribe «Prueba de la interfaz (T19), fase {n}, {fecha}, {plataforma}, {versión}», una línea OK o FALLA por comprobación y «Resultado: {pasadas}/{total}»; sale con 0 si todas pasan.
- Condición y resultado observable: tras las tres fases, cada salida termina en «Resultado: N/N».
- Fuente: unity/Assets/Interfaz/PruebaInterfaz.cs:14-33 ; unity/Assets/Interfaz/PruebaInterfaz.cs:51-77 ; unity/Assets/Interfaz/Aplicacion.cs:22-25 ; unity/Assets/Interfaz/Aplicacion.cs:166
- Prueba: manual — 1. Correr `-datos C:\prueba -pruebainterfaz f1.txt -fase 1`. 2. Repetir con `-fase 2` y `-fase 3` sobre la misma carpeta. 3. Comprobar las tres salidas.
- Plataforma: ambas

### PRU-010 · Prueba de la interfaz: fase 1
- Qué hace: comprueba que sin archivo de selección arranca la guía sin riel en «Paso 1 de 2: tu consejo»; que F1 no saca de la guía; que seis combinaciones inválidas se rechazan con su texto en el color del problema y sin escribir el archivo; que una válida escribe el archivo y dice «Guardado.»; el paso 2; que la sesión se deduce: «Sesión abierta» con compositor y «Sin sesión…» sin él; siembra una ronda; y al terminar la guía, la Ronda a la vista con el riel o, en la clase compacta, con el botón «Menú».
- Condición y resultado observable: líneas «OK combinación válida» y «OK sesión deducida, con compositor».
- Fuente: unity/Assets/Interfaz/PruebaInterfaz.cs:131-203
- Prueba: manual — 1. Correr la fase 1 como en PRU-009 sobre una carpeta vacía. 2. Comprobar sus líneas.
- Plataforma: ambas

### PRU-011 · Prueba de la interfaz: fases 2 y 3
- Qué hace: fase 2: al reabrir, arranca en la Ronda sin la guía; con un tamaño de texto ilegible usa «El del sistema» y conserva «Oscuro»; aplica el consejo guardado; restaura la ronda en «Investigación · 2 de 7» con «Capturar los que terminaron (0)»; Ajustes muestra lo guardado y la carpeta de datos; un cambio dice «Guardado. Se aplica la próxima vez que abras ChatCouncil.» y no se aplica antes de reabrir. Fase 3: el cambio quedó aplicado, y con un archivo de apariencia sin tamaño se conserva el tema.
- Condición y resultado observable: en la fase 3, la línea «OK el cambio se aplica al reabrir».
- Fuente: unity/Assets/Interfaz/PruebaInterfaz.cs:207-245
- Prueba: manual — 1. Correr las fases 2 y 3 tras la fase 1. 2. Comprobar sus líneas.
- Plataforma: ambas

### PRU-012 · Prueba de la ronda por línea de comandos
- Qué hace: con `-pruebaronda RUTA` y `-datos CARPETA`, abre una página local por operador (`ronda.html?p={id}`, con `&sucio=1` para las que cargan con mensajes) con una sola spec cuyo fin se observa cuando desaparece `#detener`; lo que hace la persona (enviar) y el proveedor (responder) lo simula un script en la página; comprueba los hechos del registro y escribe «Prueba de la Ronda (T20), {fecha}, {plataforma}, {versión}», una línea OK o FALLA por comprobación y «Resultado: {pasadas}/{total}»; sale con 0 si todas pasan.
- Condición y resultado observable: la salida termina en «Resultado: N/N».
- Fuente: unity/Assets/Interfaz/PruebaRonda.cs:13-69 ; unity/Assets/Interfaz/PruebaRonda.cs:116-131 ; unity/Assets/Interfaz/Aplicacion.cs:120-126 ; unity/Assets/Interfaz/Aplicacion.cs:167
- Prueba: manual — 1. Correr `ChatCouncil.exe -datos C:\prueba -pruebaronda salida.txt`. 2. Esperar a que se cierre. 3. Comprobar el código de salida y la última línea.
- Plataforma: windows

### PRU-013 · Prueba de la ronda: Pregunta e Investigación
- Qué hace: comprueba que los paneles se abren solo para el pool; que una pregunta vacía da «Escribe la pregunta antes de pegarla.» sin abrir ronda; el aviso «Antes de pegar la pregunta» con la página apartada; que un borrador en Grok no se pisa; «Pegada en 6 de 7. Los que fallaron dicen qué hacer en su cabecera.»; en el selector, «No se pegó: pégala otra vez desde «Más…».»; el pegado en un solo panel; los indicadores «Respondiendo» y «Parece terminado»; los contadores «Enviados 6 de 7 · Parecen terminados 5 · Capturados 0»; la captura con texto idéntico; la respuesta corta marcada; la continuidad «indeterminada» y luego «confirmada»; y el paso a «Operación · 3 de 7».
- Condición y resultado observable: línea «OK fin de la investigación».
- Fuente: unity/Assets/Interfaz/PruebaRonda.cs:137-241
- Prueba: manual — 1. Correr la prueba de la ronda. 2. Comprobar las líneas hasta «fin de la investigación».
- Plataforma: windows

### PRU-014 · Prueba de la ronda: Operación
- Qué hace: comprueba que «Corregir la investigación…» se ofrece y «Corregir la operación…» todavía no; el aviso «Antes de pegar la operación» con la casilla «Pegarla como texto, sin archivo»; «Operación pegada en 6 de 7. No se pegó en: Mistral; cada uno dice qué pasó. Comprueba que el archivo quedó adjunto, revísala y envíala.»; una conversación nueva vacía con texto y archivo idénticos; el sello con 7 etiquetas; que una conversación que no queda vacía no se pega; pegar como texto sin repetir el aviso; capturar 7 salidas con hallazgos; la ronda nueva con las respuestas copiadas; que el aviso vuelve en la ronda nueva; y «Usar su operación anterior».
- Condición y resultado observable: líneas «OK capturar la operación» y «OK usar la operación anterior».
- Fuente: unity/Assets/Interfaz/PruebaRonda.cs:603-739
- Prueba: manual — 1. Correr la prueba de la ronda. 2. Comprobar las líneas de la operación.
- Plataforma: windows

### PRU-015 · Prueba de la ronda: roles e informe
- Qué hace: comprueba que se cierran los investigadores y se abren los roles; «Prompt pegado en DeepSeek. Revísalo y envíalo.»; la captura y la recaptura del integrador; «Prompt pegado en GLM y Qwen. Revísalo y envíalo.»; «Falta que termine Qwen: las verificaciones se capturan juntas.»; «Prompt pegado en DeepSeek. Comprueba que el archivo quedó adjunto, revísalo y envíalo.»; que las URLs locales y la imagen del PDF no se piden; el `.md` y el PDF en Carta (612 × 792); 7 `.md` y 7 PDF de respuestas; las dos verificaciones con su nombre; «URLs de los verificadores: responden 0 de 6.»; que el botón pasa a «Abrir carpeta» sin armar otro informe; los códigos del adaptador HTTP sin cookies; y que no se ofrece ocultar los roles.
- Condición y resultado observable: líneas «OK informe en .md y PDF, en Carta» y «OK el adaptador HTTP, sin cookies».
- Fuente: unity/Assets/Interfaz/PruebaRonda.cs:752-903 ; unity/Assets/Interfaz/PruebaRonda.cs:905-966
- Prueba: manual — 1. Correr la prueba de la ronda. 2. Comprobar las líneas de los roles y del informe.
- Plataforma: windows

### PRU-016 · Prueba de la ronda: diálogo, abandonar y declarar
- Qué hace: comprueba que un «Aceptar» después de cancelar no abandona; que abandonar vuelve a «Pegar la pregunta en los paneles» sin agregar líneas al registro; que capturar sin pegar abre la ronda con el marcador y lleva a «Declarar la pregunta de esta ronda»; y que declarar escribe la pregunta y pasa a «Operación · 3 de 7».
- Condición y resultado observable: líneas «OK diálogo cancelado», «OK abandonar la ronda», «OK declarar la pregunta».
- Fuente: unity/Assets/Interfaz/PruebaRonda.cs:245-280
- Prueba: manual — 1. Correr la prueba de la ronda. 2. Comprobar esas tres líneas.
- Plataforma: windows

### PRU-017 · Prueba de la ronda: secciones, accesibilidad y teclado
- Qué hace: comprueba las tres rondas anteriores, la más nueva primero, con el informe que se abre; que la Ayuda se abre desde el riel y no con F1, con «ChatCouncil, versión {v}.»; el tema oscuro y el texto al 200 % guardados como `{"tema":"oscuro","texto":200}` con el ancho a la mitad; los objetivos de 48 dp en las cuatro secciones; el foco visible con el color 3A79E0; F3, F2, F1 y Ctrl+Tab; «Se recargó la página de Gemini.»; el diagnóstico en un archivo; el cierre de sesión; F4 y F5 con teclas reales que entran a la página y salen a la región siguiente o a la anterior; F1, F2 y F3 desde la página; Tab que sale; la jerarquía del lector; y Enter sobre una fila.
- Condición y resultado observable: líneas «OK objetivos de 48 dp en las cuatro secciones» y «OK F4 y F5 entran a la página y salen a la región siguiente o la anterior».
- Fuente: unity/Assets/Interfaz/PruebaRonda.cs:349-575
- Prueba: manual — 1. Correr la prueba de la ronda con la ventana al frente. 2. Comprobar las líneas de T23.
- Plataforma: windows

### PRU-018 · Copias de evidencia de la prueba de la ronda
- Qué hace: copia la carpeta de datos de prueba a `{salida}.investigacion` tras la investigación y a `{salida}.roles` tras el informe, y la carpeta `informes` a `{salida}.informe`, sin la carpeta `navegador`, para las capturas de cada etapa.
- Condición y resultado observable: junto a la salida quedan las carpetas `.investigacion`, `.informe` y `.roles`, sin `navegador`.
- Fuente: unity/Assets/Interfaz/PruebaRonda.cs:221 ; unity/Assets/Interfaz/PruebaRonda.cs:892-894 ; unity/Assets/Interfaz/PruebaRonda.cs:968-978
- Prueba: manual — 1. Correr la prueba de la ronda. 2. Comprobar las tres carpetas junto a la salida y que ninguna tiene `navegador`.
- Plataforma: windows

## Invariantes

### INV-PRU-001 · La autoprueba nunca usa la carpeta ni los perfiles reales
- Qué nunca pasa: la autoprueba crea paneles fuera de su carpeta temporal o lee almacenamiento que no sea la marca sintética que ella misma escribe en el origen de prueba.
- Fuente: unity/Assets/Autoprueba/Autoprueba.cs:21-23 ; unity/Assets/Autoprueba/Autoprueba.cs:99-100 ; unity/Assets/Autoprueba/Autoprueba.cs:393-394
- Prueba: manual — 1. Anotar la fecha de modificación de la carpeta `navegador` real. 2. Correr la autoprueba. 3. Comprobar que la fecha no cambió y que existe la carpeta temporal `cc-autoprueba-…`.

### INV-PRU-002 · Las copias de evidencia nunca llevan el perfil del navegador
- Qué nunca pasa: una copia de la prueba de la ronda incluye la carpeta `navegador`.
- Fuente: unity/Assets/Interfaz/PruebaRonda.cs:968-978
- Prueba: nueva — llamar a `Copiar` sobre una carpeta con `navegador/x` y `registro/y` y comprobar que solo se copia `registro/y`.

### INV-PRU-003 · Una medición nunca cuenta para el resultado
- Qué nunca pasa: una línea «MEDIDO …» suma al total o a las pasadas de «Resultado: {pasadas}/{total}».
- Fuente: unity/Assets/Autoprueba/Autoprueba.cs:143-152 ; unity/Assets/Autoprueba/Autoprueba.cs:458-470
- Prueba: manual — 1. Correr la autoprueba. 2. Contar las líneas OK y FALLA y comprobar que su suma es el total del «Resultado», sin contar las MEDIDO.
