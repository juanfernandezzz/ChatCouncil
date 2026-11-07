# Integrador

Propósito: armar para el integrador la tabla anonimizada de hallazgos de los operadores, pegarle su prompt en una conversación nueva y registrar su informe trazable a los H##.

> Extraído de ChatCouncil-Unity (ChatCouncil-main, commit 247f6db) el 2026-11-07. Rutas relativas a ese repo.

## Requisitos

### INT-001 · Tabla de hallazgos H## y O##
- Qué hace: junta los hallazgos de las salidas vigentes de cada operador; H## sigue el orden de persistencia (nunca barajado) y O## es el operador barajado con la semilla de la ronda, para que el integrador no sepa qué operador registró qué. Un hallazgo de un operador fuera del pool tira «hallazgo {id}: operador "{op}" no está en el pool de operadores».
- Condición y resultado observable: cada línea de la tabla tiene seis campos `H##|CATEGORIA|EJE|P#,P#|DESCRIPCION|O##`; sin etiquetas, «—».
- Fuente: motor/Runtime/Prompts.cs:101-103 ; motor/Runtime/Prompts.cs:118-152 ; motor/Runtime/Puerta.cs:598-613
- Prueba: vector — motor/Tests/RondaPruebas.cs:46 (LaTablaDeHallazgosEsLaMismaQueEnTypeScript) ; motor/Tests/Referencias.g.cs:336 (Tabla) ; motor/Tests/Referencias.g.cs:337 (ErrorTabla)
- Plataforma: ambas

### INT-002 · Requisitos para armar el prompt del integrador
- Qué hace: exige ronda activa, semilla persistida y pregunta efectiva válida. Errores: «no hay una ronda activa», «la ronda no tiene semilla persistida», «la ronda {id} no tiene pregunta registrada válida: declárala antes de pegar el integrador».
- Condición y resultado observable: si no se puede armar, la pantalla dice «No se armó el prompt: {error}.» antes de tocar el panel; nunca pega un prompt vacío.
- Fuente: motor/Runtime/Puerta.cs:599-606 ; unity/Assets/Interfaz/PantallaRonda.cs:1110-1129
- Prueba: nueva — llamar `ArmarPromptIntegrador` sobre una ronda sin semilla y sobre otra sin pregunta válida y comprobar los dos mensajes.
- Plataforma: ambas

### INT-003 · Prompt del integrador desde la plantilla
- Qué hace: sustituye `{{PREGUNTA}}` y `{{HALLAZGOS}}` en la plantilla del integrador; la plantilla pide primera línea «TITULO: …», cinco secciones (la quinta «QUE CONVIENE RESCATAR») y una referencia [H##] por párrafo, salvo el que empieza con «LA TABLA NO ALCANZA».
- Condición y resultado observable: el prompt armado coincide con el de referencia de TypeScript.
- Fuente: motor/Runtime/Prompts.cs:105-106 ; packages/analysis/src/prompt-integrador.ts:49 ; packages/analysis/src/prompt-integrador.ts:73 ; packages/analysis/src/prompt-integrador.ts:85-87
- Prueba: vector — motor/Tests/PromptsPruebas.cs:25 (LosPromptsSonLosMismosQueArmaElTypeScript) ; motor/Tests/Referencias.g.cs:217 (Prompts)
- Plataforma: ambas

### INT-004 · Pegar el prompt del integrador
- Qué hace: abre la página del integrador si no estaba, abre una conversación nueva comprobada vacía, escribe el prompt y lo verifica por igualdad; solo entonces lo marca pegado.
- Condición y resultado observable: mensaje «Pegando el prompt en {nombre}…» y luego «Prompt pegado en {nombre}. Revísalo y envíalo.»; si falla, «No se pegó en {nombre}: {error}.».
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:1105-1157 ; motor/Runtime/Puerta.cs:617
- Prueba: manual — 1. Con un perfil de prueba, llegar a integración. 2. Tocar «Pegar el prompt aquí» en el panel de DeepSeek. 3. Comprobar la conversación nueva, el prompt y el mensaje.
- Plataforma: ambas

### INT-005 · Captura del informe con título
- Qué hace: en integración, capturar escribe un InformeIntegrador con el texto crudo, el html, el prompt pegado (o el marcador de prompt no disponible) y el título extraído de la primera línea no vacía «TITULO: …»; un «TITULO:» en medio del texto es prosa.
- Condición y resultado observable: el hecho InformeIntegrador tiene `Titulo` cuando la primera línea es «TITULO: …»; si no, queda nulo.
- Fuente: motor/Runtime/Puerta.cs:385-386 ; motor/Runtime/Puerta.cs:436-442 ; motor/Runtime/TituloInforme.cs:32-47
- Prueba: vector — motor/Tests/ParseosPruebas.cs:118 (ElTituloYLaSeccionDeRescateSonLosMismosQueEnTypeScript) ; motor/Tests/Referencias.g.cs:272 (Titulos)
- Plataforma: ambas

### INT-006 · Informe vigente: el último capturado
- Qué hace: el informe que usan verificadores y redactor es el último InformeIntegrador de la ronda; una recaptura agrega un hecho y no reescribe.
- Condición y resultado observable: tras «Recapturar el integrador», el prompt del verificador usa el informe nuevo.
- Fuente: motor/Runtime/Dominio.cs:142-144
- Prueba: vector — motor/Tests/PuertaPruebas.cs:447 (UnaRecapturaFallidaQuedaComoErrorYNoReemplaza)
- Plataforma: ambas

### INT-007 · Trazabilidad por párrafo
- Qué hace: parte el informe en párrafos (línea en blanco) y registra cada [H##]; una referencia que no está en la tabla se conserva con `ReferenciaInvalida`; los párrafos sin referencias se listan, salvo el título y el que empieza con «LA TABLA NO ALCANZA».
- Condición y resultado observable: un párrafo con [H99] inexistente queda con referencia inválida.
- Fuente: motor/Runtime/Parseos.cs:334-359
- Prueba: vector — motor/Tests/ParseosPruebas.cs:97 (LaTrazabilidadEsLaMismaQueEnTypeScript) ; motor/Tests/ParseosPruebas.cs:106 (ElInformeSembradoDeGuardTrazabilidad) ; motor/Tests/Referencias.g.cs:264 (Trazabilidades)
- Plataforma: ambas

### INT-008 · Sección de rescate
- Qué hace: extrae el cuerpo de la sección «Qué conviene rescatar» (con o sin «5.», con o sin acento, con o sin markdown) desde su encabezado hasta el final; si falta o está vacía, no hay sección.
- Condición y resultado observable: un informe sin esa sección devuelve nulo.
- Fuente: motor/Runtime/TituloInforme.cs:17 ; motor/Runtime/TituloInforme.cs:23-25 ; motor/Runtime/TituloInforme.cs:54-65
- Prueba: vector — motor/Tests/ParseosPruebas.cs:118 (ElTituloYLaSeccionDeRescateSonLosMismosQueEnTypeScript) ; motor/Tests/Referencias.g.cs:283 (Rescates)
- Plataforma: ambas

### INT-009 · Texto del informe desde el HTML
- Qué hace: el texto del informe del integrador sale del html capturado, por bloques, como en TypeScript.
- Condición y resultado observable: una lista ordenada respeta su `start`.
- Fuente: motor/Runtime/TextoDeHtml.cs:62 ; motor/Runtime/TextoDeHtml.cs:180
- Prueba: vector — motor/Tests/ParseosPruebas.cs:10 (ElTextoDesdeHtmlEsElMismoQueEnTypeScript) ; motor/Tests/ParseosPruebas.cs:18 (LaListaOrdenadaRespetaSuStart) ; motor/Tests/Referencias.g.cs:242 (TextosHtml)
- Plataforma: ambas

## Invariantes

### INV-INT-001 · El integrador nunca sabe qué operador registró qué
- Qué nunca pasa: la tabla expone el id real del operador; solo O## barajado con la semilla.
- Fuente: motor/Runtime/Prompts.cs:118-127 ; motor/Runtime/Prompts.cs:140-148
- Prueba: vector — motor/Tests/RondaPruebas.cs:46 (LaTablaDeHallazgosEsLaMismaQueEnTypeScript)

### INV-INT-002 · Nunca se pega un prompt vacío
- Qué nunca pasa: se toca el panel del rol sin un prompt armado.
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:1117-1129
- Prueba: nueva — con una ronda sin pregunta válida, `PegarRol` muestra «No se armó el prompt: …» y no llama a `Escribir` en ningún panel.
