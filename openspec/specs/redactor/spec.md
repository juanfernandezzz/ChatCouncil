# Redactor

Propósito: entregar al redactor un archivo con todo el material de la ronda (informe, verificaciones anónimas, tabla y respuestas) con marcas de integridad, y controlar mecánicamente su respuesta.

> Extraído de ChatCouncil-Unity (ChatCouncil-main, commit 247f6db) el 2026-11-07. Rutas relativas a ese repo.

## Requisitos

### RED-001 · Archivo del redactor
- Qué hace: arma un archivo con estas secciones en orden: «===== INFORME =====» (texto del último informe del integrador), una «===== VERIFICACION {A|B} =====» por verificación vigente (o «===== VERIFICACION =====» con «(sin verificacion capturada en esta ronda)»), «===== HALLAZGOS =====» con la cabecera «H##|CATEGORIA|EJE|RESPUESTAS|DESCRIPCION|OPERADOR» y la tabla, y «===== RESPUESTAS =====» con las respuestas de todo el pool por código P#; le intercala marcas cada 1.000 caracteres y la de FIN.
- Condición y resultado observable: el archivo `redactor-{AAAA-MM-DD-HHMM}.txt` contiene las cuatro partes y la primera y la última marca.
- Fuente: motor/Runtime/Prompts.cs:156-162 ; motor/Runtime/Puerta.cs:651-686
- Prueba: vector — motor/Tests/PromptsPruebas.cs:50 (ElArchivoDelRedactorEsElMismoQueArmaElTypeScript) ; motor/Tests/Referencias.g.cs:222 (ArchivosRedactor)
- Plataforma: ambas

### RED-002 · Verificaciones anónimas A y B
- Qué hace: las verificaciones vigentes se tapan con la misma lista de términos y se barajan con la semilla de la ronda más «|verificaciones», con etiquetas A y B; el sello de verificaciones se guarda con la respuesta del redactor (D62).
- Condición y resultado observable: el redactor no sabe qué verificador hizo cada una; el informe final puede revelar la clave.
- Fuente: motor/Runtime/Anonimizacion.cs:82-94 ; motor/Runtime/Puerta.cs:662-664
- Prueba: vector — motor/Tests/PromptsPruebas.cs:68 (LasVerificacionesSeAnonimizanComoEnTypeScript) ; motor/Tests/Referencias.g.cs:229 (VerificacionesAnonimas)
- Plataforma: ambas

### RED-003 · Sin verificación se arma igual y avisa
- Qué hace: si no hay verificación capturada, el archivo lo dice y el mensaje agrega «No hay verificación capturada en esta ronda: el archivo lo dice y el redactor trabaja sin ella.».
- Condición y resultado observable: tras pegar al redactor sin verificaciones, el mensaje incluye el aviso.
- Fuente: motor/Runtime/Puerta.cs:683 ; unity/Assets/Interfaz/PantallaRonda.cs:1153-1155
- Prueba: nueva — `ArmarRedactor` sin SalidaVerificador en la ronda devuelve `Aviso` con el literal y el archivo con «(sin verificacion capturada en esta ronda)».
- Plataforma: ambas

### RED-004 · Prompt del redactor y archivo adjunto
- Qué hace: el prompt sale de la plantilla del redactor con `{{PREGUNTA}}`; la plantilla pide como primera línea «ARCHIVO: primera marca = …, ultima marca = …» o «ARCHIVO: no pude leer el archivo adjunto», citas como [H12], [P3], [A CONFIRMA H12], [EN DISPUTA H12] y una sección PENDIENTE al final. La app abre conversación nueva, pega el prompt verificado por igualdad y adjunta el archivo guardado en la carpeta `redactor`.
- Condición y resultado observable: mensaje «Prompt pegado en {nombre}. Comprueba que el archivo quedó adjunto, revísalo y envíalo.».
- Fuente: motor/Runtime/Prompts.cs:154 ; packages/analysis/src/prompt-redactor.ts:28 ; packages/analysis/src/prompt-redactor.ts:32 ; packages/analysis/src/prompt-redactor.ts:61 ; packages/analysis/src/prompt-redactor.ts:67 ; unity/Assets/Interfaz/PantallaRonda.cs:1134-1155
- Prueba: vector — motor/Tests/PromptsPruebas.cs:25 (LosPromptsSonLosMismosQueArmaElTypeScript)
- Plataforma: ambas

### RED-005 · Captura del redactor con sus marcas
- Qué hace: en redacción, capturar escribe una RespuestaRedactor con texto, html, prompt completo y las marcas primera y última pegadas en este proceso; si la app se reinició, usa las de la redacción anterior; si no hay, quedan vacías.
- Condición y resultado observable: el hecho RespuestaRedactor trae `MarcaPrimera`, `MarcaUltima` y `SelloVerificaciones`.
- Fuente: motor/Runtime/Puerta.cs:390-413 ; motor/Runtime/Puerta.cs:688-693
- Prueba: vector — motor/Tests/PuertaPruebas.cs:142 (UnaRondaEnteraDejaLosMismosHechosQueElTypeScript)
- Plataforma: ambas

### RED-006 · Controles mecánicos de la redacción
- Qué hace: comprueba si leyó el archivo entero (primera línea ARCHIVO con las marcas correctas), si trae enlaces que el material no tenía y si cita H## que no existen; ninguno juzga el contenido. Textos: «Leyó el archivo entero: la primera línea trae la primera y la última marca correctas.», «No pudo leer el archivo: respondió "no pude leer el archivo adjunto".», «Las marcas de la primera línea no son las del archivo: leyó parcial o resumió.», «Se saltó la primera línea ARCHIVO: no se puede saber si leyó el archivo entero.», «No se puede comprobar la lectura: la app se reinició entre pegar y capturar.», «Todos los hallazgos que cita existen en la tabla.» / «Cita hallazgos que no existen en la tabla: …».
- Condición y resultado observable: el informe final muestra las tres líneas de control bajo la respuesta del redactor.
- Fuente: motor/Runtime/InformeFinal.cs:397-491
- Prueba: vector — motor/Tests/InformePruebas.cs:83 (LosControlesDelRedactorSonLosMismosQueEnTypeScript) ; motor/Tests/Referencias.g.cs:435 (Controles)
- Plataforma: ambas

### RED-007 · Cuerpo del redactor en Markdown
- Qué hace: el cuerpo que va al informe es la respuesta en Markdown sacada del html, sin la línea ARCHIVO ni los controles de la página; un dominio del material enlazado solo no cuenta como fuera del material.
- Condición y resultado observable: los títulos y tablas del redactor se ven en el informe.
- Fuente: motor/Runtime/InformeFinal.cs:418-420 ; motor/Runtime/InformeFinal.cs:438-439 ; motor/Runtime/InformeFinal.cs:450
- Prueba: vector — motor/Tests/ParseosPruebas.cs:34 (ElCuerpoDelRedactorEnMarkdownSinLosControlesDeLaPagina) ; motor/Tests/ParseosPruebas.cs:46 (UnDominioDelMaterialEnlazadoSoloNoCuentaComoFueraDelMaterial)
- Plataforma: ambas

## Invariantes

### INV-RED-001 · El redactor nunca sabe qué verificador hizo cada verificación
- Qué nunca pasa: el archivo del redactor nombra al verificador; solo trae A y B barajadas con términos tapados.
- Fuente: motor/Runtime/Anonimizacion.cs:87-94 ; motor/Runtime/Puerta.cs:662-664
- Prueba: vector — motor/Tests/PromptsPruebas.cs:68 (LasVerificacionesSeAnonimizanComoEnTypeScript)

### INV-RED-002 · Los controles nunca juzgan el contenido
- Qué nunca pasa: un control de la redacción califica lo que dijo el redactor; solo mide lectura, enlaces y H## inexistentes.
- Fuente: motor/Runtime/InformeFinal.cs:410-414
- Prueba: vector — motor/Tests/InformePruebas.cs:83 (LosControlesDelRedactorSonLosMismosQueEnTypeScript)
