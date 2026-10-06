# Fase 6 — Especificación de la versión 1 de ChatCouncil en Unity

Escrita con `mattpocock-skills:to-spec` el 2026-10-06, a partir del grilling
de esa fecha (Q1 a Q10), de `docs/FASE6-HANDOFF.md`, de
`docs/FASE6-NAVEGADOR-UNITY.md`, de `docs/BLUEPRINT.md`, de
`docs/LIMITACIONES.md`, de `docs/AGENTES.md` y del código de la versión
Electron. Los dos puntos de prueba los confirmó Juan el mismo día.

Idioma: español latino neutral, con "tú". En la interfaz la palabra es
"consejo"; "ChatCouncil" es marca y no se traduce.

---

## Problem Statement

Juan es psicólogo clínico e investiga con un método propio: siete modelos de
lenguaje responden la misma pregunta en sus interfaces web, con sus cuentas
(BYOA), y después cada uno evalúa a ciegas las respuestas de los otros seis.
Un integrador arma el mapa de coincidencias y discrepancias, un verificador
contrasta lo importante con fuentes y un redactor escribe la respuesta con
ese material. El resultado es un informe trazable hasta el dato crudo.

Hoy eso funciona en una aplicación de escritorio en Electron, con tres
problemas:

1. **Solo corre en Windows.** Juan quiere el instrumento también en su
   teléfono, y más adelante en iOS.
2. **No dice qué hacer.** Una ronda completa son más de treinta acciones
   manuales repartidas en siete etapas. La barra es una fila de botones del
   mismo peso, y saber cuál toca ahora depende de la memoria de Juan. Un
   olvido —no abrir un chat nuevo antes de pegar la operación— rompe el
   diseño ciego sin que nada falle en rojo.
3. **La interfaz no sirve para su público.** El diseño y la accesibilidad de
   la versión actual son inadecuados para profesionales que investigan, y no
   se reproducen.

Además, los cuerpos de la operación llegan a 180.000 caracteres y no entran
en el compositor de algunos proveedores. La vía de archivo existe, pero Juan
tiene que adjuntar a mano, en cada panel, un archivo descargado.

## Solution

Una aplicación nueva en Unity 6, para Windows (.exe instalable) y Android
(.apk), con el mismo método y el mismo dato, envuelta en un flujo que guía:

- **Los paneles siguen siendo las páginas reales de cada proveedor.**
  WebView2 en Windows y Android System WebView con androidx.webkit en
  Android, con un perfil persistente por proveedor. "Continuar con Google"
  abre una ventana emergente con el mismo perfil, medido en los nueve
  proveedores y en las dos plataformas. No se cambia el user agent.
- **Una guía de la ronda** muestra las siete etapas (Pregunta, Investigación,
  Operación, Integración, Verificación, Redacción, Informe), cuál es la
  actual y un único paso siguiente. Cada panel muestra su estado con color,
  símbolo y texto juntos, nunca solo con color. Cada etapa recuerda lo que
  Juan tiene que hacer a mano en ese momento.
- **La app hace todo lo que no es enviar**: abre el chat nuevo y comprueba
  que quedó vacío, pega, adjunta el archivo, lee, captura y arma. Juan revisa
  cada panel y **envía a mano**. Ningún envío es automático.
- **La app avisa cuándo terminó cada respuesta**, pero no captura sola. Juan
  decide; "Capturar los que terminaron" es un solo botón.
- **El dato no cambia**: el mismo registro append-only con el mismo esquema
  que la versión Electron, los mismos cuatro prompts literales, los mismos
  selectores medidos y los mismos algoritmos de barajado, marcas de
  integridad, parseo e informe, reescritos en C# con sus casos de prueba
  portados.

## User Stories

### Instalación y arranque

1. Como investigador, quiero descargar un instalador .exe desde una página de
   GitHub y abrirlo con doble clic, para no tener que usar terminal ni git.
2. Como investigador, quiero descargar un .apk e instalarlo en mi teléfono
   siguiendo instrucciones paso a paso, para no depender de ninguna tienda
   ni de ADB.
3. Como investigador, quiero que una versión nueva del .apk se instale
   encima de la anterior, para no perder las sesiones de los nueve
   proveedores al actualizar.
4. Como investigador, quiero que la primera vez la app me pida elegir qué
   proveedores carga y quiénes son el integrador, el verificador y el
   redactor, para que el consejo quede armado antes de empezar.
5. Como investigador, quiero que la app no me deje elegir el mismo proveedor
   como integrador y verificador, ni un rol que no esté entre los cargados,
   ni un redactor que sea el verificador, para que el método 7-1-1 no se
   rompa por un error de configuración.
6. Como investigador, quiero que los valores por defecto sean deepseek
   integrador, GLM verificador y redactor igual al integrador, para empezar
   con la configuración que ya se probó.
7. Como investigador, quiero cambiar esa configuración cuando quiera y que se
   aplique al volver a abrir la app, para no abrir ni cerrar perfiles a mitad
   de una ronda.
8. Como investigador, quiero que al abrir la app vuelva la última ronda que
   tenía en curso, para seguir donde quedé aunque haya cerrado la app.
9. Como investigador, quiero iniciar sesión en cada proveedor una sola vez,
   incluso con "Continuar con Google", y que la sesión siga abierta al cerrar
   y reabrir, para no repetir el login.
10. Como investigador, quiero que la sesión de un proveedor no se mezcle con
    la de otro, para poder usar cuentas distintas en cada uno.
11. Como investigador, quiero que la app no siga ninguna navegación a una
    página de cierre de sesión, para que un redireccionamiento no me deslogee
    sin que yo lo pida.
12. Como investigador, quiero cerrar la sesión de un solo panel a pedido, con
    confirmación, para entrar con otra cuenta en ese proveedor.
13. Como investigador con un teléfono cuyo WebView no admite perfiles
    separados, quiero que la app me lo diga y no finja aislamiento, para no
    mezclar cuentas sin saberlo.

### Orientación

14. Como investigador que no recuerda el método, quiero ver en todo momento
    las siete etapas de la ronda y cuál es la actual, para saber dónde estoy.
15. Como investigador, quiero un solo botón principal por etapa, destacado,
    para no tener que elegir entre botones del mismo peso.
16. Como investigador, quiero que cada etapa me diga en una frase qué tengo
    que hacer yo a mano (activar la búsqueda web, revisar y enviar, abrir el
    panel de fuentes antes de capturar), para no depender de mi memoria.
17. Como investigador, quiero ver el estado de cada panel con símbolo, color y
    palabra a la vez (por pegar, pegado y falta que envíes, respondiendo,
    parece terminado, capturado, con problema), para entenderlo aunque no
    distinga colores.
18. Como investigador, quiero que el panel que estoy viendo se distinga
    claramente en la lista de paneles, para saber qué proveedor tengo
    adelante sin mirar su página.
19. Como investigador, quiero que los errores digan qué pasó y qué hacer en
    lenguaje simple, con el detalle técnico disponible pero no adelante, para
    poder resolverlos solo.
20. Como investigador, quiero un aviso antes de un paso que depende de algo
    que tengo que hacer yo (activar capacidades nativas, revisar antes de
    enviar), con la opción de no volver a preguntar en esta sesión, para no
    repetirlo en cada ronda.
21. Como investigador, quiero que las acciones de emergencia (recapturar,
    usar la operación anterior, ronda nueva con respuestas copiadas,
    diagnóstico) estén a mano pero separadas del camino principal, para no
    confundirlas con el paso siguiente.
22. Como investigador en el PC, quiero que la app use bien una pantalla ancha
    —guía, panel y estado a la vista a la vez—, para trabajar sin cambiar de
    pantalla.
23. Como investigador en el teléfono, quiero ver un panel a la vez casi a
    pantalla completa, con la guía a un toque, para poder leer y escribir en
    la página del proveedor.
24. Como investigador que usa teclado o lector de pantalla, quiero que los
    controles de la app tengan foco visible, orden lógico y nombre accesible,
    para no depender solo del mouse o del dedo.

### Pregunta

25. Como investigador, quiero escribir la pregunta en un solo lugar y pegarla
    en los siete paneles del pool con un botón, para no copiarla siete veces.
26. Como investigador, quiero que la pregunta nunca se pegue en el
    integrador, el verificador ni el redactor, para que no lean el tema antes
    de su turno.
27. Como investigador, quiero que pegar la pregunta abra una ronda nueva con
    su semilla y registre qué proveedores estaban cargados y quién integra,
    para que la ronda quede trazable.
28. Como investigador, quiero que la app registre un intento por proveedor,
    incluidos los que fallaron, para saber después dónde no entró la
    pregunta.
29. Como investigador, quiero pegar la pregunta solo en el panel que estoy
    viendo, sin abrir ronda nueva, para reintentar un pegado que falló.
30. Como investigador, quiero que la app nunca escriba encima de un texto que
    ya estaba en el compositor, para no perder un borrador mío.
31. Como investigador, quiero que la pregunta llegue con sus saltos de línea
    intactos a cada proveedor, para que no se pierda su estructura.

### Investigación

32. Como investigador, quiero ver en cada panel si el proveedor sigue
    respondiendo o parece haber terminado, y si ese fin se observó o se
    dedujo, para saber cuándo capturar sin adivinar.
33. Como investigador, quiero capturar con un botón todos los paneles que
    parecen terminados, para no capturar uno por uno.
34. Como investigador, quiero capturar un solo panel, para corregir uno que
    falló sin volver a capturar los demás.
35. Como investigador, quiero que cada captura guarde el texto tal cual, el
    HTML crudo, las fuentes citadas, la etiqueta de modelo, el mensaje del
    usuario y cómo se observó el fin, para poder re-derivar todo después sin
    volver a la página.
36. Como investigador, quiero que una captura de menos de 20 caracteres no
    cuente como respuesta válida y quede registrada con su motivo, para no
    guardar un truncado como si fuera una respuesta.
37. Como investigador, quiero que una respuesta sospechosamente corta quede
    marcada en el registro, para notar cuando la respuesta real quedó fuera
    de la captura.
38. Como investigador, quiero que la app me avise si las preguntas que se ven
    en los paneles no coinciden entre sí, para no comparar respuestas a
    preguntas distintas.
39. Como investigador, quiero que la app lea el canvas de Mistral, los
    archivos que crea Kimi y el informe de Investigación profunda de ChatGPT,
    para que esas respuestas no queden reducidas a un aviso.
40. Como investigador, quiero declarar la pregunta de una ronda que capturé
    sin haberla pegado con la app, para poder seguir con la operación.

### Operación

41. Como investigador, quiero que antes de pegar la operación la app abra un
    chat nuevo en ese panel y compruebe que quedó vacío, para que ningún
    operador vea su propia respuesta.
42. Como investigador, quiero que la app arme el cuerpo de cada operador con
    las seis respuestas que no son la suya, anonimizadas y barajadas con la
    semilla de la ronda, para que la evaluación sea ciega.
43. Como investigador, quiero que la app adjunte sola el archivo con las seis
    respuestas y pegue el prompt, para no tener que descargar y adjuntar a
    mano.
44. Como investigador, quiero poder pegar todo en el compositor en vez del
    archivo, para los proveedores en que eso funcione mejor.
45. Como investigador, quiero que la app compruebe con las marcas de
    integridad que lo pegado llegó entero, y diga si llegó completo, truncado
    o indeterminado, para no enviar un cuerpo incompleto.
46. Como investigador, quiero que ninguna URL citada delate qué proveedor
    escribió una respuesta —por su dominio o por un parámetro de rastreo— y
    que la app se niegue a pegar si eso pasa, para que el diseño ciego no se
    rompa en silencio.
47. Como investigador, quiero que el sello de la ronda se guarde la primera
    vez que pego la operación y que nunca se recalcule distinto, para que el
    informe pueda desanonimizar sin mentir.
48. Como investigador, quiero un aviso, una vez por ronda, de qué tengo que
    revisar antes de enviar la operación, para no olvidarlo la primera vez.
49. Como investigador, quiero capturar la salida de cada operador y que la app
    extraiga sus hallazgos, conserve marcadas las etiquetas inválidas y cuente
    la prosa descartada, para que nada se pierda en silencio.
50. Como investigador, quiero reutilizar la operación de un panel de la ronda
    anterior cuando todo lo que ese operador lee son copias sin cambios, para
    no gastar otra respuesta.
51. Como investigador, quiero abrir una ronda nueva con la misma pregunta y
    las respuestas de la anterior copiadas, para corregir una respuesta sin
    rehacer las otras seis.
52. Como investigador, quiero que un panel que se cuelga al recibir un cuerpo
    grande no bloquee la app, para que los demás paneles sigan respondiendo.

### Integración, verificación y redacción

53. Como investigador, quiero que el panel del integrador aparezca recién en
    su etapa, con un chat nuevo, y que la app pegue ahí la tabla de hallazgos
    con su prompt, para que trabaje solo con la tabla.
54. Como investigador, quiero que la app compruebe que lo pegado en el
    integrador es idéntico al prompt, para saber que la tabla entró entera.
55. Como investigador, quiero que la app arme el prompt del verificador con la
    sección "Qué conviene rescatar" del integrador y los hallazgos que cita, y
    me diga claramente si esa sección no está, para no pegar un prompt vacío.
56. Como investigador, quiero que la app pegue el prompt del redactor y le
    adjunte sola el archivo con el informe, la verificación, la tabla y las
    siete respuestas, para que escriba la respuesta con todo el material.
57. Como investigador, quiero que la captura del redactor me diga si leyó el
    archivo entero, si citó enlaces que el material no traía y si citó
    hallazgos inexistentes, para saber cuánto confiar en su texto.
58. Como investigador, quiero recapturar el integrador o el verificador
    aunque la ronda haya pasado a la etapa siguiente, para corregir una
    captura incompleta.
59. Como investigador, quiero mostrar u ocultar los paneles de los roles
    cuando quiera, para revisar una conversación anterior.

### Informe

60. Como investigador, quiero que la app compruebe que las URLs que citó el
    verificador existen y responden —máximo 20 por ronda, 10 segundos cada
    una, sin mis cookies—, para no confiar en una URL inventada.
61. Como investigador, quiero un informe final armado por código en Markdown y
    PDF —respuesta del redactor primero, lo que conviene rescatar,
    verificación, lectura del integrador, participación de cada operador,
    hallazgos, condiciones de la ronda y lo que el informe no dice—, para
    tener un documento citable.
62. Como investigador, quiero que el informe marque cada referencia [H##] como
    existente o inexistente y publique la clave de los [P#], para poder leer
    la prosa del integrador y del redactor.
63. Como investigador, quiero que el informe quite las marcas de integridad
    del texto y declare cuántas quitó, para que la instrumentación no ensucie
    la lectura.
64. Como investigador, quiero el informe en una carpeta con fecha, hora y el
    título del integrador, sin guiones largos, junto a las respuestas de los
    investigadores en .md y .pdf, para poder comprimirla y compartirla.
65. Como investigador, quiero que si una respuesta no se pudo escribir quede
    nombrada en un archivo FALTAN con su motivo, para que una ausencia no se
    lea como que ese proveedor no participó.
66. Como investigador, quiero que un informe nunca sobrescriba otro, para no
    perder un dato de investigación.
67. Como investigador, quiero que la app abra el informe al terminar, para
    leerlo de inmediato.

### Registro y datos

68. Como investigador, quiero que cada hecho se agregue al registro y nada se
    reescriba nunca, para que el dato crudo sea la única fuente de verdad.
69. Como investigador, quiero que el registro use el mismo formato que la
    versión Electron, para poder leerlo con las mismas herramientas.
70. Como investigador, quiero que el registro y los informes vivan en una
    carpeta visible que sobreviva a desinstalar la app, para no perder mi
    investigación.
71. Como investigador, quiero que una última línea a medio escribir se
    detecte, se informe y no impida leer el resto, para que un corte de
    energía no destruya una ronda.

### Diagnóstico y mantenimiento

72. Como investigador, quiero un diagnóstico de selectores de solo lectura que
    guarde qué encontró en la página de un panel que no pega o no captura,
    para que los selectores se corrijan sin otra ronda a ciegas.
73. Como investigador, quiero que ese diagnóstico nunca envíe, nunca haga clic
    y nunca lea cookies ni almacenamiento, para usarlo sin riesgo.
74. Como investigador, quiero recargar el panel que estoy viendo, para
    recuperar una página trabada.
75. Como mantenedor, quiero que los selectores sigan en un manifiesto
    declarativo separado del código, para actualizarlos cuando un proveedor
    cambie su página.
76. Como mantenedor, quiero que el código que corre dentro de las páginas sea
    uno solo para Windows y Android, para corregir un selector o una forma de
    escritura en un solo lugar.

## Implementation Decisions

### Arquitectura

- **Unity 6 LTS** como aplicación, no como juego: un solo proyecto para las
  dos plataformas y una escena mínima. Compilación IL2CPP en Windows (x64) y
  Android (arm64): código nativo, más rápido y sin el runtime de Mono.
  *Motivo:* Juan pidió el camino de mayor control y el código más eficiente
  para la app.
- **Cinco módulos, con dependencias en un solo sentido**:

  | Módulo | Responsabilidad | Depende de |
  |---|---|---|
  | motor | Dominio, análisis, prompts, specs y orquestación de la ronda. C# puro, sin Unity. | — |
  | script-de-pagina | Escritura, lectura, estado y diagnóstico dentro de cada página. Un archivo JS. | specs (datos) |
  | panel | Interfaz C# común sobre los dos plugins nativos, más los plugins. | script-de-pagina |
  | interfaz | Guía, configuración, paneles y avisos (UI Toolkit). | motor, panel |
  | distribucion | Compilación en GitHub Actions, instalador, firma y Release. | todos |

- **El motor no conoce Unity.** Es una biblioteca C# que compila igual con el
  SDK de .NET, para las pruebas, y dentro de Unity. Habla con el mundo por
  cuatro puertos inyectados: panel, HTTP, reloj y generador de ids, y la
  carpeta de datos. Es la regla "packages no importa apps" de la versión
  Electron, sostenida por la frontera de compilación y no por convención.

### El motor (punto de prueba 1)

- **Una sola puerta de entrada.**
  - **Consultas**: la etapa de la ronda, el paso siguiente y el estado de
    cada panel, derivados del registro.
  - **Comandos**: abrir ronda, registrar intentos, registrar capturas,
    declarar pregunta, armar la operación de un panel (texto, o prompt más
    archivo, con sus marcas), armar los prompts del integrador, del
    verificador y del redactor, comprobar URLs, armar el informe, copiar
    respuestas a una ronda nueva y reutilizar una operación anterior.
- **El dominio se porta tal cual.**
  - Los dieciséis tipos de hecho, con `esquema: 1` y los mismos nombres de
    campo.
  - `etapaDeRonda`, que cuenta operadores distintos.
  - `preguntaEfectivaDeRonda`, `esPreguntaValida`, `derivarProcedencia`,
    `integradorDeRonda` y `proveedoresCargadosDeRonda`.
  - `leerRegistro`, que cuenta las líneas ilegibles y detecta la última
    incompleta.

  El JSON se serializa con los mismos nombres de campo, para que los
  registros de las dos versiones sean intercambiables.
- **El análisis se porta conservando los algoritmos.**
  - **FNV-1a de 32 bits y mulberry32**, bit a bit, con la misma aritmética
    entera sin signo y el mismo recorrido por unidades UTF-16. Así la misma
    semilla da el mismo barajado en las dos versiones.
  - **Fisher-Yates con semilla**, anonimización con scrub de nombres y conteo
    de redacciones, y los dos sistemas de identificador: la etiqueta barajada
    por ronda y el código estable P#, persistido en el sello.
  - **Lista blanca de parámetros de query** (solo `model`), con una aserción
    en tiempo de ejecución que se niega a devolver un cuerpo que delate al
    proveedor por host propio o por query.
  - **Marcas de integridad** cada 1.000 caracteres, cortadas en el primer
    espacio o salto de línea, más la de FIN. Se mantiene la comprobación
    cruzada de la cantidad de marcas contra "pool menos la respuesta propia",
    con tolerancia ±3.
  - **`evaluarIntegridad`** (completo, truncado o indeterminado) y
    **`localizarPerdida`**.
  - **Los parseos** de hallazgos, de las referencias del integrador y de la
    verificación, con sus tolerancias: espacio duro, viñetas, negritas,
    comillas y formato anterior.
  - **La tabla de hallazgos única**, armada desde las salidas vigentes.
  - **El armado del informe final**, del documento por respuesta, de los
    títulos y nombres de archivo, de los controles del redactor,
    `textoDeHtmlEnBloques` y la extracción de citas sobre el HTML crudo.
- **Las expresiones regulares se traducen con cuidado.** Las de JavaScript
  con `\p{L}`, lookbehind o `normalize("NFD")` tienen equivalente en .NET,
  pero la semántica de `\b`, de la bandera `u` y de las clases de caracteres
  se verifica con los mismos casos de prueba de la versión TypeScript. No se
  da por equivalente.
- **Los cuatro prompts y `specs.json` se copian literales**, como archivos de
  datos que la app carga, nunca reescritos a mano. Una prueba compara byte a
  byte cada prompt armado por el motor contra el que arma la versión
  TypeScript con las mismas entradas.
- **La sustitución de marcadores** en los prompts se hace partiendo y
  juntando, nunca con un reemplazo que interprete patrones, y en una sola
  pasada cuando un texto lleva varios marcadores. Es la lección del
  `{{CONTENIDO}}` en el título del PDF.
- **Comprobación de URLs.** HEAD y, si falla, GET, con 10 s para los dos
  juntos y un techo de 20 URLs por ronda. Solo las URLs de la sección 1 del
  verificador. Sin cookies ni sesión de los paneles, y sin leer el cuerpo de
  la respuesta. Si ya se comprobaron para esa verificación, no se vuelve a
  salir a la red.
- **Dónde se guarda el registro.** Es un archivo JSONL por conversación, con
  una escritura de línea completa por hecho, en una carpeta de datos visible
  que sobrevive a desinstalar la app:
  - en Windows, `Documentos\ChatCouncil`;
  - en Android, una carpeta de Documentos.

  Los informes van en `informes`, dentro de esa misma carpeta. Los perfiles
  de los navegadores viven en la carpeta privada de la app.
- **Lo que no se porta**:
  - `build-analyst-prompt`, porque no tiene llamador;
  - el modo `--cc-test` con su gate de modelo Haiku, `esperarQuietud`, los
    modos `--cc-*`, el sondeo completo y el arnés de medición de entrega,
    porque son instrumentos de desarrollo de la versión Electron;
  - la escritura de `CondicionHerramientas`, porque hoy no tiene llamador.

  El lector entiende ese hecho y todos los demás.

### El script de página

- **Un solo archivo JavaScript**, el mismo para WebView2 y Android WebView.
  Porta las funciones de la versión Electron que tienen llamador en el flujo:
  - **Escribir** según el método que declara la spec: textarea con
    `insertText`; contenteditable línea por línea, con salto suave o de
    párrafo; o pegado en tramos de 1.000 caracteres.
  - **Esperar a que el texto asiente** antes de leerlo.
  - **Leer el compositor** con sus saltos de línea, reconstruidos a una línea
    por bloque.
  - **Comprobar que el chat está vacío.**
  - **Leer la respuesta**:
    - el texto con los `exclude` aplicados sobre una copia, y el HTML crudo
      sin recortes;
    - `userMessage` y la etiqueta de modelo;
    - los enlaces, contados subiendo hasta seis niveles;
    - el canvas de Mistral, los archivos de Kimi y el aviso del informe en
      iframe;
    - el estado de generación, tri-estado.

  Y tres piezas nuevas:
  - **El estado de generación en el tiempo**: el largo de la respuesta a lo
    largo del tiempo, para el indicador de la Q10.
  - **Un diagnóstico de selectores de solo lectura** (Q8): cuántas
    coincidencias da cada selector de la spec, los cuadros de texto
    genéricos, los contenedores de texto largo, los controles cerca del
    compositor, los iframes y los shadow roots. Usa una lista blanca de
    atributos estructurales y recorta el texto.
  - **Encontrar el `<input type=file>` del compositor**, para adjuntar.
- **Contrato asíncrono por sondeo.** El motor pide una operación con un id y
  después consulta su resultado. Funciona igual en las dos plataformas,
  porque ninguna espera promesas al evaluar un script.
- **Nunca envía**: no hace clic en un control de envío, no despacha Enter y
  no lee `document.cookie`, `localStorage` ni `sessionStorage`. Los únicos
  clics permitidos son los de lectura que ya existen: abrir el canvas de
  Mistral y las tarjetas de archivo de Kimi. El código de envío de la versión
  Electron no se porta.
- **Se inyecta antes de cada llamada si la página no lo tiene**, porque las
  páginas navegan y recargan.

### El panel (punto de prueba 2)

- **Una interfaz C# con una implementación por plataforma.** Dos
  implementaciones es el mínimo que exigen dos sistemas, no una abstracción
  de más. La interfaz permite:
  - crear un panel para un proveedor, con su perfil y su URL inicial;
  - posicionarlo en un rectángulo, ponerlo al frente o detrás;
  - navegar y recargar;
  - ejecutar el script y obtener el resultado;
  - ejecutar un script en un iframe de otro origen;
  - adjuntar un archivo al `<input type=file>` del compositor;
  - imprimir un HTML a PDF;
  - borrar los datos del perfil;
  - avisar de cada navegación, para el contador de continuidad.
- **Windows: un plugin nativo en C++ (MSVC) sobre WebView2.**
  - Un perfil (`ProfileName`) por proveedor, todos bajo una sola carpeta de
    datos.
  - Argumentos del navegador que desactivan la limitación de paneles ocultos
    y ocluidos. Son el equivalente de los tres switches de Electron; el user
    agent no se toca.
  - Los paneles se apilan como ventanas hijas en el mismo rectángulo y el
    activo pasa arriba, en vez de ocultarlos.
  - La ventana emergente usa el mismo perfil y conserva `window.opener`.
  - Se cancela toda navegación a una URL de cierre de sesión.
  - El adjunto se hace por el protocolo de DevTools sobre el
    `<input type=file>`, sin abrir el selector.
  - El PDF sale de la impresión nativa de WebView2.
- **Android: un plugin en Java sobre android.webkit.WebView y la última
  versión estable de androidx.webkit.**
  - `ProfileStore` y `setProfile` por proveedor. Si el WebView no admite
    `MULTI_PROFILE`, la app lo dice y no abre los paneles.
  - Los paneles se apilan visibles y el activo pasa arriba.
  - La ventana emergente usa el mismo perfil y conserva `window.opener`.
  - Se bloquea toda navegación a una URL de cierre de sesión.
  - En el adjunto, el selector de archivos del sistema devuelve directamente
    el archivo que la app preparó.
  - El PDF sale de la impresión del sistema a un archivo.
  - El iframe de otro origen se lee con un script de inicio de documento
    restringido a ese origen.
- **Los paneles de los roles** (integrador, verificador y redactor) se cargan
  recién en su etapa y se cierran al abrir una ronda nueva, como en Electron.
- **Techo externo de 90 s** sobre toda escritura grande, controlado desde el
  motor, fuera del hilo de la página. Un panel colgado se informa y no
  bloquea a los demás.
- **Contador de navegaciones por panel**, para derivar la continuidad y
  comprobar que pegar no recargó la página.

### La interfaz

**Enmienda del 2026-10-06.** Juan pidió que la interfaz (menús, su contenido y
distribución, botones, posición y forma) no siga sus preferencias ni su
costumbre con la versión Electron, sino criterios evidenciados, con la meta de
un producto listo para el mercado. Lo único que se conserva de él es lo
esencial de la app. Por eso esta sección separa lo que se exige de lo que se
decide en la etapa 5 con evidencia. Lo que antes fijaba la distribución (las
cuatro zonas fijas, el costado en PC y la barra en el teléfono, y el contenido
del menú aparte) pasa a ser una hipótesis de partida y deja de ser un
requisito. Lo mismo vale para las historias 14 a 24: piden necesidades, y
donde nombran una distribución (22 y 23) es hipótesis.

**Lo que se exige (lo esencial y el piso de calidad):**

- **UI Toolkit**, con una sola hoja de estilos de tokens (color, tipografía y
  espacios).
- **El método no se toca desde la interfaz.** Esto incluye:
  - envío siempre a mano;
  - captura nunca automática;
  - la pregunta nunca va a los roles;
  - el chat nuevo se comprueba antes de pegar;
  - lo imposible por datos se bloquea: no hay operación sin las siete
    respuestas, ni verificación sin un informe del integrador.
- **El paso siguiente lo decide el motor y nunca la interfaz.** La interfaz
  decide cómo se muestra.
- **La página nativa ocupa su zona**: Unity no dibuja encima de ella, así que
  mientras dura un diálogo la página se aparta. Es una restricción técnica.
- **Estado de panel con símbolo, color y texto, siempre los tres** (WCAG
  1.4.1). El vocabulario mínimo del motor (por pegar; pegado, falta que
  envíes; respondiendo; parece terminado; capturado; con problema) es un
  dato. Las palabras finales se deciden en la etapa 5.
- **Toda acción del motor tiene un lugar alcanzable en la interfaz**, en las
  dos plataformas. Las acciones son:
  - el flujo de la ronda;
  - pegar o capturar un solo panel;
  - las recapturas;
  - usar la operación anterior;
  - ronda nueva con respuestas copiadas;
  - mostrar u ocultar los roles;
  - recargar;
  - cerrar la sesión de un panel;
  - el diagnóstico.

  Dónde va cada una se decide en la etapa 5.
- **Piso de accesibilidad: WCAG 2.2 AA.** Incluye:
  - contraste medido;
  - foco visible;
  - orden lógico y nombre accesible;
  - objetivos táctiles de al menos 44 px en el teléfono, más que el mínimo
    de 24 px de WCAG 2.5.8.

  Los textos van en español neutral.

**Lo que decide la etapa 5, con evidencia escrita:**

- **La arquitectura de información.** Comprende:
  - qué menús o áreas hay;
  - qué contiene cada uno y en qué orden;
  - qué es primario, qué es secundario y qué se esconde;
  - cómo se navega en PC y en el teléfono.
- **La distribución, la forma y la jerarquía de cada control**, y la
  dirección visual.
- **Si los botones del flujo se bloquean o no fuera de su etapa.** En
  Electron no se bloquean desde el 2026-09-19. Eso es costumbre, no
  evidencia: se decide contra la prevención de errores y el control del
  usuario.
- **Qué capacidades de producto entran a la versión 1.** El inventario
  candidato es el de la tabla de abajo. Ninguna entra ni sale sin un
  criterio.

Cada decisión se escribe en la sección de la Fase 6 de `docs/BLUEPRINT.md`
con su criterio y su fuente: una heurística, una guía de plataforma, una
norma o un estudio. Ninguna se justifica con "así lo usa Juan".

**Fuentes de criterio.** El método es una evaluación heurística y un
recorrido cognitivo de una ronda completa sobre el boceto, antes de
construir, y de nuevo sobre la app compilada. Las fuentes son:

- las 10 heurísticas de Nielsen;
- ISO 9241-110 (principios de diálogo);
- WCAG 2.2;
- las guías de diseño de apps de Windows (Fluent);
- Material Design 3, con la navegación adaptativa por clase de tamaño de
  ventana para Android.

Si una fuente contradice algo de esta especificación, gana la fuente salvo en
lo esencial. Se informa la contradicción.

**Inventario candidato de capacidades** (2026-10-06). Son capacidades que la
especificación no tenía y que un producto para el mercado suele tener. Cada
una se acepta o se rechaza en T18 con su criterio.

| Capacidad | Por qué se considera |
|---|---|
| Primer arranque guiado: elegir el consejo y entrar a cada cuenta, con el estado de sesión de cada proveedor a la vista | Entrar a nueve cuentas es la primera tarea real y hoy no tiene lugar propio. |
| Configuración alcanzable en cualquier momento | La historia 7 la pide, pero la especificación no le daba lugar. |
| Historial de rondas, con lo que dejó cada una, y abrir un informe anterior o su carpeta | Hoy, para volver a un informe hay que buscar la carpeta a mano. |
| Abandonar la ronda en curso y empezar una limpia | Control del usuario y salida de emergencia. |
| Ayuda: el método en breve, qué hace cada etapa y los atajos | Ayuda y documentación (Nielsen 10); el método no es evidente. |
| Respaldo y ubicación de los datos | No hay sincronización (Q4): el registro existe solo en ese aparato. |
| Acerca de, versión y aviso de versión nueva | Sin tienda, nada avisa que salió una versión. |
| Tema claro, tema oscuro o el del sistema, y tamaño de texto | Legibilidad de textos largos y accesibilidad. |
| Exportar el diagnóstico para reportar un problema | Recuperación de errores sin terminal. |

### Flujo de la ronda

```
Pregunta ─▶ Investigación ─▶ Operación ─▶ Integración ─▶ Verificación ─▶ Redacción ─▶ Informe
 pegar en    enviar a mano    chat nuevo +   chat nuevo +   chat nuevo +   chat nuevo +   comprobar URLs
 los 7       · capturar los   adjuntar y     pegar la tabla pegar prompt   pegar y        y armar la
             que terminaron   pegar          · enviar       · enviar       adjuntar       carpeta
                              · enviar       · capturar     · capturar     · enviar
                              · capturar                                   · capturar
```

- **Solo se bloquea lo que es imposible por datos**: no hay operación sin las
  siete respuestas, ni verificación sin un informe del integrador. Si el
  resto se bloquea o no por etapa lo decide la etapa 5 (ver "La interfaz").
- **El chat nuevo** (Q9) navega a la URL de conversación nueva y comprueba,
  con lecturas repetidas, que el chat y el compositor quedaron vacíos antes
  de pegar. Si no quedaron vacíos, no pega y lo dice. Vale para los
  operadores y para los tres roles.
- **Operación: la vía de archivo es la predeterminada.** La app pega el
  prompt con archivo y adjunta el `.txt` del cuerpo con sus marcas. Pegar
  todo en el compositor queda como opción. *Motivo:* el 2026-10-06 Juan pidió
  que la subida de archivo funcione, porque los cuerpos de la operación no
  entran en algunos compositores. El redactor ya trabaja solo por archivo. El
  integrador y el verificador se pegan: sus prompts literales no tienen
  variante con archivo, y los tamaños medidos (unos 30.000 caracteres)
  entraron pegados en Electron.

### Distribución

- **GitHub Actions** compila las dos plataformas en cada push a `main` que
  toque la app, y publica el Release `chatcouncil-unity-v1` (Q5).
- **La licencia de Unity Personal** entra por tres secretos que carga Juan:
  `UNITY_LICENSE`, `UNITY_EMAIL` y `UNITY_PASSWORD`.
- **Windows**: el build de Unity va dentro de un instalador `.exe` que crea
  los accesos directos y comprueba el runtime de WebView2.
- **Android**: el `.apk` va firmado con una llave fija, guardada como secreto
  de GitHub, con una copia de respaldo fuera del repositorio (Q6).
- **Los binarios viven solo en el Release**, nunca en el repositorio.

## Testing Decisions

- **Qué es una buena prueba aquí.** Prueba comportamiento externo a través de
  uno de los dos puntos de prueba confirmados. Usa datos sembrados o páginas
  que imitan, nunca las cuentas de Juan, y nunca envía. Cada prueba nueva se
  ve fallar antes de confiar en ella (regla de `docs/AGENTES.md`), y cada
  número que se informa es una salida real.
- **Punto 1, el motor.** Corre con `dotnet test`, sin Unity, con paneles
  falsos, un registro en una carpeta temporal y un puerto HTTP falso. Se
  portan:
  - **guard:trazabilidad**: el informe sembrado de siete párrafos; el informe
    armado con `[CONFIRMA H##]` y la clave de los P#; ninguna sección vacía en
    los cuatro casos límite; las marcas quitadas y declaradas.
  - **guard:sellado, regla 4**: un cuerpo limpio pasa y uno con el host
    propio de un proveedor se rechaza.
  - **guard:specs**: las specs cumplen el contrato que el script espera, los
    roles por defecto existen y son distintos, y el redactor por defecto es
    el integrador.
  - **Los criterios medidos del BLUEPRINT**:
    - el barajado es determinista y uniforme (promedio de coincidencias
      1,00 ± 0,15 sobre 200 semillas) y se reparte parejo por posición
      (50 ± 26 por celda sobre 400 barajados);
    - los tres estados de `evaluarIntegridad` y `localizarPerdida`;
    - la comprobación cruzada de marcas, que tiene que dispararse si se
      deshabilita la exclusión de la respuesta propia;
    - la tabla única con un operador recapturado, y la etapa con 6
      operadores distintos y una recaptura;
    - las URLs: 200, 404, un dominio `.invalid`, un HEAD rechazado, un
      timeout y una segunda llamada que no sale a la red;
    - la clasificación de lecturas por etapa y las reglas de roles;
    - la copia de respuestas a una ronda nueva y la reutilización de una
      operación;
    - la carpeta del informe con un fallo sembrado en una respuesta.
  - **Equivalencia con TypeScript.** Para FNV-1a, mulberry32, el barajado,
    el scrub de nombres, las marcas y los cuatro prompts armados, la salida
    en C# se compara contra valores de referencia generados con el código
    TypeScript actual y las mismas entradas.
- **Punto 2, el panel.** Una autoprueba dentro de la app compilada, en cada
  plataforma. Carga páginas locales que imitan un textarea, un
  contenteditable, un editor tipo ProseMirror, un editor tipo Lexical, el
  canvas de Mistral, la vista previa en iframe de Kimi, un iframe de otro
  origen y un `<input type=file>`, y comprueba:
  - la escritura con saltos de línea, carácter por carácter, y un cuerpo de
    180.000 caracteres con sus marcas;
  - la lectura con `exclude` y el HTML crudo, y el chat vacío;
  - el aislamiento entre dos perfiles de prueba, y la ventana emergente con
    `window.opener` en el mismo perfil;
  - el bloqueo de una URL `/logout`;
  - el adjunto sin selector y la generación del PDF;
  - el techo externo, con una página colgada a propósito;
  - el diagnóstico de selectores.

  Usa perfiles de prueba, nunca los de los proveedores reales (regla 60 del
  BLUEPRINT).
- **La interfaz no tiene punto de prueba propio.** Muestra lo que responde el
  motor. Se revisa compilada, con capturas a ancho de PC y de teléfono, en la
  etapa 5.
- **Antecedentes en el repositorio**: los seis guards (`scripts/`), la
  "corrida simulada" sobre `integrador.ts` con datos sembrados, y las
  funciones del preload probadas "en un navegador real contra una página que
  imita tarjetas e iframe" (BLUEPRINT, 2026-10-03).
- **Lo que solo Juan puede medir en vivo**, con sus cuentas: el login en los
  nueve proveedores, los selectores en el sitio móvil de cada proveedor en
  Android, la escritura y el adjunto en cada compositor real, el indicador de
  fin en respuestas largas y la memoria con los paneles abiertos en su
  teléfono.

## Out of Scope

- iOS (WKWebView), que va después de Windows y Android.
- Sincronizar investigaciones entre el PC y el teléfono (Q4: cada aparato
  guarda las suyas).
- Importar el historial de la versión Electron (Q3: la app empieza vacía). El
  formato del registro sí es el mismo.
- El botón "Sesiones", que cuenta cookies (Q7).
- Cualquier envío automático, la captura automática (Q10) y el código de envío
  que la versión Electron conserva sin llamador.
- "Pegar operación en todos", que Juan sacó de la barra el 2026-09-30.
- Los modos de desarrollo `--cc-*`, el sondeo completo, el arnés con gate de
  Haiku y la medición de entrega. Los reemplazan el diagnóstico de selectores
  y la autoprueba.
- Una variante con archivo de los prompts del integrador y del verificador:
  cambiaría prompts literales, que son datos de investigación.
- Publicar en tiendas.
- El rediseño completo de marca (ícono, media pack) más allá de lo que decida
  la etapa 5 para la versión 1.

## Further Notes

- **Riesgo principal, declarado.** Los selectores de `specs.json` se midieron
  en sitios de escritorio. En Android, con el user agent intacto, los
  proveedores sirven su sitio móvil, y es probable que varios selectores no
  coincidan. La red es el diagnóstico de selectores (Q8) en la prueba en vivo
  de Juan. Ninguna prueba sin sus cuentas puede medirlo.
- **Riesgo de los paneles ocultos.** WebView2 replica los switches de
  Electron. Android no tiene equivalente, así que sus paneles se mantienen
  visibles y apilados. Está sin medir que las respuestas en streaming
  terminen en un panel que quedó atrás.
- **Medido en la prueba de login** (2026-10-05): los nueve proveedores entran
  con Google en WebView2 y en Android WebView, la ventana emergente usa el
  mismo perfil y queda conectada con `window.opener`, y la sesión sobrevive a
  cerrar y reabrir.
- **Dirección estética que Juan dejó registrada** (BLUEPRINT §2,
  "Estéticas"): profesional, sobria, académico-investigativa; sin blanco como
  color principal y sin estética de SaaS genérico; carácter de biblioteca o
  laboratorio, en tono no claro; tipografía de carácter científico. Y dos
  preferencias (2026-08-25): que se ilumine el panel al frente y que la app
  arranque maximizada. **Desde el 2026-10-06 son solo antecedentes, no
  restricciones**: Juan pidió que la interfaz siga criterios evidenciados y
  no sus preferencias. Ejemplo de por qué importa: en lectura y corrección de
  texto, la polaridad positiva (texto oscuro sobre fondo claro) rinde mejor
  que la negativa (Piepenbrock y cols., 2013, *Ergonomics*). Eso choca con el
  "tono no claro", y se resuelve en T18 con la evidencia, por ejemplo con
  temas a elección.
- **Las decisiones de diseño que tome el agente** quedan escritas en una
  sección de la Fase 6 de `docs/BLUEPRINT.md`, con su motivo, como pide el
  prompt de la fase. Ninguna se atribuye a Juan si Juan no la escribió.
- **El plan** (orden de las tareas y cómo se comprueba cada una) va aparte, en
  `docs/FASE6-PLAN.md`.
