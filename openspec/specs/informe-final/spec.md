# Informe final (md y PDF Carta)

Propósito: armar desde el registro un informe trazable en Markdown y PDF tamaño Carta, desanonimizado, con las respuestas de los investigadores aparte, sin sobrescribir nunca nada.

> Extraído de ChatCouncil-Unity (ChatCouncil-main, commit 247f6db) el 2026-11-07. Rutas relativas a ese repo.

## Requisitos

### INF-001 · Armar el informe desde el registro
- Qué hace: con ronda activa, comprueba las URLs de los verificadores, desanonimiza (P# a proveedor con el sello, O# a operador con la tabla) y arma el Markdown; sin ronda, «No hay una ronda activa para armar el informe.»; cualquier excepción vuelve como «No se pudo armar el informe final: {error}».
- Condición y resultado observable: «Armar el informe» crea una carpeta en `informes/` de la carpeta de datos.
- Fuente: motor/Runtime/Puerta.cs:1003-1068
- Prueba: vector — motor/Tests/InformePruebas.cs:12 (ElInformeFinalEsElMismoQueArmaElTypeScript) ; motor/Tests/Referencias.g.cs:410 (InformesFinales) ; motor/Tests/Referencias.g.cs:591 (InformeDeRonda)
- Plataforma: ambas

### INF-002 · Orden de las secciones
- Qué hace: el informe abre con «# {título}» (o «# Informe de ronda»); luego «## Respuesta a la pregunta (aporte del redactor)» con «Aporte de un solo modelo ({nombre}), basado en el análisis que sigue. No es un resultado del consejo.», la clave «Clave de las verificaciones que cita: A = …, B = ….» y las líneas de control; «## Qué conviene rescatar»; las secciones de verificación; Pregunta, Fecha y «**Eje de registro:** los tres (HECHOS, FUENTES, CONCLUSIONES)»; «## Lectura del integrador», «## Participación de operadores», «## Hallazgos referenciados», «## Hallazgos no referenciados», «## Limitaciones registradas por los operadores», «## Condiciones de la ronda»; Conversación, Ronda, Integrador, Integridad de entrega, Semilla y «## Lo que este informe no dice».
- Condición y resultado observable: el `.md` generado sigue ese orden y ninguna sección queda vacía.
- Fuente: motor/Runtime/InformeFinal.cs:122-126 ; motor/Runtime/InformeFinal.cs:259-330
- Prueba: vector — motor/Tests/InformePruebas.cs:12 (ElInformeFinalEsElMismoQueArmaElTypeScript) ; motor/Tests/InformePruebas.cs:33 (NingunaSeccionQuedaVacia)
- Plataforma: ambas

### INF-003 · Referencias marcadas
- Qué hace: cada H## dentro de corchetes se marca «H## ✓» si existe o «H## ✗ referencia inexistente» si no.
- Condición y resultado observable: un [H99] inexistente en la respuesta del redactor aparece con la cruz.
- Fuente: motor/Runtime/InformeFinal.cs:134-140
- Prueba: vector — motor/Tests/InformePruebas.cs:20 (ElInformeMarcaCadaReferenciaYPublicaLaClaveDeLosP)
- Plataforma: ambas

### INF-004 · Marcas de integridad quitadas y declaradas
- Qué hace: las marcas `[[CC-...]]` se quitan del informe (nunca del registro) y, si hubo, se agrega «Se quitaron {n} marca(s) de integridad [[CC-...]] del texto de este informe:» con la explicación.
- Condición y resultado observable: el `.md` no contiene `[[CC-` y declara cuántas quitó.
- Fuente: motor/Runtime/InformeFinal.cs:142-153 ; motor/Runtime/InformeFinal.cs:332-342
- Prueba: vector — motor/Tests/InformePruebas.cs:62 (LasMarcasDeIntegridadSeQuitanYSeDeclaran)
- Plataforma: ambas

### INF-005 · Participación de cada operador
- Qué hace: cada operador del pool figura con estado «fallo» («no se capturó salida: no hay salida de operador en el registro»), «ok» («{n} hallazgos») o «sin-hallazgos» («0 hallazgos parseables ({d} líneas de la salida cruda descartadas)»); nunca desaparece del informe.
- Condición y resultado observable: un operador sin salida aparece como fallo.
- Fuente: motor/Runtime/Puerta.cs:1030-1047
- Prueba: vector — motor/Tests/InformePruebas.cs:12 (ElInformeFinalEsElMismoQueArmaElTypeScript)
- Plataforma: ambas

### INF-006 · Tabla de condiciones
- Qué hace: lista por respuesta del pool Código, Proveedor, Etiqueta de modelo, Caracteres y Fuentes citadas; sin sello «(sin sello)», sin etiqueta «(no observada)»; sin respuestas, «No hay respuestas de investigador en el registro de esta ronda.».
- Condición y resultado observable: la columna Código es la clave de los [P#] del texto.
- Fuente: motor/Runtime/InformeFinal.cs:167-168 ; motor/Runtime/InformeFinal.cs:290-302
- Prueba: vector — motor/Tests/InformePruebas.cs:20 (ElInformeMarcaCadaReferenciaYPublicaLaClaveDeLosP)
- Plataforma: ambas

### INF-007 · Verificación en el informe
- Qué hace: cada verificación vigente va con su sección (con el nombre del verificador si hay dos), el estado de cada URL (sin comprobar, no resuelve, responde N) y el aviso de techo de URLs.
- Condición y resultado observable: una URL que respondió 404 se ve como tal junto a su hallazgo.
- Fuente: motor/Runtime/InformeFinal.cs:179-216 ; motor/Runtime/InformeFinal.cs:353-393
- Prueba: vector — motor/Tests/InformePruebas.cs:70 (LaVerificacionParaElInformeEsLaMismaQueEnTypeScript) ; motor/Tests/Referencias.g.cs:425 (VerificacionesInforme)
- Plataforma: ambas

### INF-008 · Nombre de la carpeta del informe
- Qué hace: el nombre es «AAAA-MM-DD HHMM - {título}» con fecha y hora locales; el título es el del integrador o, si falta, las seis primeras palabras de la pregunta, o «Informe de ronda»; se limpia de caracteres prohibidos en Windows, guiones largos a «-», máximo 80 caracteres; si existe, «(2)» hasta «(999)».
- Condición y resultado observable: dos informes con el mismo minuto y título quedan en «… - Título» y «… - Título (2)».
- Fuente: motor/Runtime/TituloInforme.cs:75-121
- Prueba: vector — motor/Tests/ParseosPruebas.cs:133 (ElNombreDelInformeEsElMismoQueEnTypeScript) ; motor/Tests/Referencias.g.cs:300 (LimpiezasTitulo) ; motor/Tests/Referencias.g.cs:314 (NombresBase) ; motor/Tests/Referencias.g.cs:322 (NombreLibre)
- Plataforma: ambas

### INF-009 · Ninguna ruta pasa de 259 caracteres
- Qué hace: el largo del nombre se recorta para que ninguna ruta de la carpeta del informe pase de 259 caracteres (D47).
- Condición y resultado observable: con una carpeta de datos honda, los archivos se crean igual sin error de ruta.
- Fuente: motor/Runtime/Puerta.cs:1109-1120
- Prueba: vector — motor/Tests/PuertaPruebas.cs:333 (NingunaRutaDelInformePasaDe259Caracteres)
- Plataforma: windows

### INF-010 · Carpeta con md, PDF y respuestas
- Qué hace: crea la carpeta; escribe primero el `.md` y luego el PDF; en «Respuestas de los investigadores» guarda cada respuesta del pool, en el orden del pool, como «n - Proveedor» en `.md` y PDF (nunca las salidas de operador); si una falla, las demás se escriben y «FALTAN - respuestas sin PDF.txt» la nombra.
- Condición y resultado observable: mensaje «Carpeta del informe: {ruta}. El informe está en .md y en PDF. {n} respuestas de investigador, cada una en .md y en PDF.»; si el PDF falla, «… El informe quedó solo en Markdown: no se pudo generar el PDF ({error}). …».
- Fuente: motor/Runtime/Puerta.cs:1121-1133 ; motor/Runtime/Puerta.cs:1149-1235 ; motor/Runtime/InformeFinal.cs:496 ; motor/Runtime/InformeFinal.cs:530-535
- Prueba: vector — motor/Tests/PuertaPruebas.cs:315 (SiFallaElPdfDeUnaRespuestaLasDemasSeEscribenYFaltanLaNombra) ; motor/Tests/Referencias.g.cs:612 (NombresRespuesta)
- Plataforma: ambas

### INF-011 · Documento de cada respuesta de investigador
- Qué hace: el Markdown de cada respuesta trae nombre, etiqueta de modelo, hora de lectura, caracteres, fuentes citadas, enlaces en el DOM, fin de respuesta, error si lo hubo, la pregunta y el texto entero sin tocar; sin texto, «No se capturo texto de esta respuesta.».
- Condición y resultado observable: el `.md` cierra con «Texto capturado tal cual de la interfaz del proveedor, sin corregir ni recortar.».
- Fuente: motor/Runtime/InformeFinal.cs:498-528
- Prueba: vector — motor/Tests/InformePruebas.cs:95 (ElDocumentoDeCadaRespuestaEsElMismoQueEnTypeScript) ; motor/Tests/Referencias.g.cs:449 (RespuestasPdf)
- Plataforma: ambas

### INF-012 · PDF Carta con marked en un panel oculto
- Qué hace: el Markdown pasa a HTML con marked 18.0.14 en una página en blanco del panel con perfil propio y se imprime; márgenes de 2 cm, pie «ChatCouncil · página N de M», HTML crudo escapado e imágenes escritas como texto; lo que sigue a la respuesta del redactor lleva otro fondo.
- Condición y resultado observable: el PDF del informe tiene tamaño Carta, numeración en el pie y ninguna imagen remota cargada.
- Fuente: unity/Assets/Interfaz/Adaptadores.cs:35-94 ; panel/windows/panel.cpp:554-570 ; docs/BLUEPRINT.md:2797-2809
- Prueba: manual — 1. Armar un informe con un perfil de prueba. 2. Abrir el PDF y comprobar tamaño Carta en sus propiedades. 3. Comprobar el pie «ChatCouncil · página 1 de N».
- Plataforma: ambas

### INF-013 · Se abre la carpeta al terminar
- Qué hace: tras armar, la app abre la carpeta del informe (o la del `.md` si no hubo PDF), no el archivo (D41).
- Condición y resultado observable: aparece el explorador de Windows en la carpeta del informe.
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:1178-1194 ; docs/BLUEPRINT.md:2810
- Prueba: manual — 1. Armar un informe con un perfil de prueba. 2. Comprobar que se abre el explorador en la carpeta nueva.
- Plataforma: windows

## Invariantes

### INV-INF-001 · Un informe nunca se sobrescribe
- Qué nunca pasa: se pisa un `.md`, un PDF o una carpeta de informe existentes.
- Fuente: motor/Runtime/Puerta.cs:1139-1147 ; motor/Runtime/Puerta.cs:1157 ; unity/Assets/Interfaz/Adaptadores.cs:86-87 ; motor/Runtime/TituloInforme.cs:108-121
- Prueba: vector — motor/Tests/Referencias.g.cs:322 (NombreLibre)

### INV-INF-002 · El HTML de un modelo nunca se ejecuta en el PDF
- Qué nunca pasa: el PDF inserta HTML crudo o pide una imagen que escribió un modelo.
- Fuente: unity/Assets/Interfaz/Adaptadores.cs:62-68
- Prueba: manual — 1. En una ronda de prueba, capturar una respuesta del redactor con `<img src=…>` en el texto. 2. Armar el informe. 3. Comprobar que el PDF muestra la etiqueta escrita.

### INV-INF-003 · Las salidas de operador nunca se publican como respuestas
- Qué nunca pasa: la subcarpeta de respuestas incluye una salida de operador.
- Fuente: motor/Runtime/Puerta.cs:1121-1124
- Prueba: vector — motor/Tests/PuertaPruebas.cs:315 (SiFallaElPdfDeUnaRespuestaLasDemasSeEscribenYFaltanLaNombra)

## Conflictos

### CONFLICTO-INF-01
- docs/FASE6-SPEC.md:276-277 (historia 67) pide que la app abra el informe al terminar.
- unity/Assets/Interfaz/PantallaRonda.cs:1192 abre la carpeta, según D41 (docs/BLUEPRINT.md:2810).
