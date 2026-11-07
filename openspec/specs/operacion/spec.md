# Operación: cuerpos, marcas, anonimización, barajado y control de fugas

Propósito: armar para cada operador del pool un cuerpo ciego con las respuestas de los otros seis, reproducible por la semilla de la ronda, con marcas de integridad y sin nada que delate al proveedor.

> Extraído de ChatCouncil-Unity (ChatCouncil-main, commit 247f6db) el 2026-11-07. Rutas relativas a ese repo.

## Requisitos

### OPE-001 · Requisitos para armar la operación
- Qué hace: exige ronda activa, pregunta efectiva y una respuesta capturada de cada operador del pool. Errores literales: «no hay una ronda activa: captura las respuestas del pool antes de pegar la operación», «la ronda {id} no tiene pregunta registrada: declárala antes de pegar la operación», «faltan respuestas capturadas en esta ronda: {ids}. Usa "Capturar" antes de pegar la operación».
- Condición y resultado observable: con un operador sin respuesta, la operación se niega y no escribe sello.
- Fuente: motor/Runtime/Puerta.cs:453-466
- Prueba: vector — motor/Tests/PuertaPruebas.cs:510 (SinLasRespuestasDelPoolLaOperacionSeNiega)
- Plataforma: ambas

### OPE-002 · Semilla persistida obligatoria
- Qué hace: los cuerpos se arman con la semilla guardada en la ronda; sin semilla se niega con «ronda {id} no tiene semilla persistida: no se puede armar un cuerpo anonimizado reproducible sobre una ronda sin semilla.».
- Condición y resultado observable: dos armados de la misma ronda producen el mismo orden.
- Fuente: motor/Runtime/Puerta.cs:468-494
- Prueba: vector — motor/Tests/CuerpoOperadorPruebas.cs:113 (LosCuerposSonLosMismosQueEnTypeScript) ; motor/Tests/Referencias.g.cs:207 (Cuerpos)
- Plataforma: ambas

### OPE-003 · Hash de la semilla FNV-1a
- Qué hace: la semilla de texto se convierte en número con FNV-1a de 32 bits sobre unidades UTF-16.
- Condición y resultado observable: el hash coincide con el de la versión TypeScript para las semillas de referencia.
- Fuente: motor/Runtime/Anonimizacion.cs:46-55
- Prueba: vector — motor/Tests/AnonimizacionPruebas.cs:13 (ElHashDeLaSemillaEsElMismoQueEnTypeScript) ; motor/Tests/Referencias.g.cs:6-7 (Semillas, HashSemillas)
- Plataforma: ambas

### OPE-004 · Barajado Fisher-Yates con mulberry32
- Qué hace: baraja con Fisher-Yates y mulberry32, sin mutar la entrada; es determinista y uniforme.
- Condición y resultado observable: el orden barajado coincide con el de referencia.
- Fuente: motor/Runtime/Anonimizacion.cs:57-80
- Prueba: vector — motor/Tests/AnonimizacionPruebas.cs:19 (ElBarajadoEsElMismoQueEnTypeScript) ; motor/Tests/AnonimizacionPruebas.cs:37 (ElBarajadoEsUniforme) ; motor/Tests/Referencias.g.cs:10 (Barajados)
- Plataforma: ambas

### OPE-005 · Etiquetas «Modelo A..» y términos tapados
- Qué hace: etiqueta las respuestas barajadas «Modelo A», «Modelo B»… y tapa con «▮▮▮» los términos que identifican proveedor, modelo o empresa (Anthropic, Claude, OpenAI, ChatGPT, Google, Gemini, DeepSeek, Perplexity, Mistral, Grok, GLM, Z.ai, Qwen, Kimi, entre otros), con límite de palabra por punto de código y los más largos primero; cuenta cuántos tapó.
- Condición y resultado observable: «Claude dice» queda «▮▮▮ dice»; «𝐀Claude» queda igual.
- Fuente: motor/Runtime/Anonimizacion.cs:29-44 ; motor/Runtime/Anonimizacion.cs:96-140
- Prueba: vector — motor/Tests/AnonimizacionPruebas.cs:81 (AnonimizarDaLasMismasEtiquetasTextosSelloYConteoQueTypeScript) ; motor/Tests/Referencias.g.cs:129-133 (TerminosBloqueados, TokenRedaccion, Anonimizados)
- Plataforma: ambas

### OPE-006 · Códigos estables P1..Pn
- Qué hace: cada proveedor del pool recibe un código P1..Pn según el orden del pool; se guarda en el sello y nunca se recalcula para esa ronda.
- Condición y resultado observable: el operador lee los cuerpos con separadores «=== P# ===».
- Fuente: motor/Runtime/Anonimizacion.cs:183-193 ; motor/Runtime/Prompts.cs:88-89
- Prueba: vector — motor/Tests/AnonimizacionPruebas.cs:100 (LosCodigosEstablesSiguenElOrdenDelPool) ; motor/Tests/Referencias.g.cs:139 (Codigos)
- Plataforma: ambas

### OPE-007 · Exclusión de autoevaluación
- Qué hace: el cuerpo de cada operador incluye las respuestas de todos los del pool menos la suya; una comprobación cruzada por cantidad de marcas (tolerancia ±3) tira si el cuerpo incluye la propia.
- Condición y resultado observable: el cuerpo de chatgpt no contiene la respuesta de chatgpt; si la contuviera, se lanza «cuerpo de {id}: {n} marcas, esperadas ~{m} (±3) …».
- Fuente: motor/Runtime/Cuerpos.cs:50 ; motor/Runtime/Cuerpos.cs:256-268 ; motor/Runtime/Cuerpos.cs:300 ; motor/Runtime/Cuerpos.cs:310
- Prueba: vector — motor/Tests/CuerpoOperadorPruebas.cs:162 (CadaCuerpoExcluyeLaRespuestaDeSuOperador) ; motor/Tests/CuerpoOperadorPruebas.cs:150 (LaComprobacionCruzadaTiraSiElCuerpoIncluyeLaRespuestaPropia)
- Plataforma: ambas

### OPE-008 · Fuentes citadas con query limpia
- Qué hace: a cada respuesta se agregan sus URL citadas bajo «Fuentes citadas:», con la query reducida al parámetro `model` (el fragmento se conserva).
- Condición y resultado observable: `https://x.com/a?utm_source=y&model=z#f` queda `https://x.com/a?model=z#f`.
- Fuente: motor/Runtime/Cuerpos.cs:59-74 ; motor/Runtime/Cuerpos.cs:135-149
- Prueba: vector — motor/Tests/CuerpoOperadorPruebas.cs:12 (LaQuerySoloConservaModel) ; motor/Tests/CuerpoOperadorPruebas.cs:69 (ElCuerpoConFuentesEsElMismoQueEnTypeScript) ; motor/Tests/Referencias.g.cs:145 (Limpiezas)
- Plataforma: ambas

### OPE-009 · Control de fugas por URL
- Qué hace: una URL es fuga si su host es la interfaz de un proveedor (chatgpt.com, chat.z.ai, claude.ai, gemini.google.com, grok.com, chat.mistral.ai, chat.qwen.ai, kimi.ai, chat.deepseek.com, perplexity.ai o su www.), salvo las rutas /blog, /help-center y /hub, o si su query contiene el id de un proveedor; un subdominio de documentación es fuente legítima. Si el cuerpo armado tiene una fuga, tira y no lo devuelve.
- Condición y resultado observable: un cuerpo con `https://claude.ai/chat/x` se niega con «cuerpo anonimizado filtra identidad de proveedor por URL ({n}): …»; `https://www.kimi.ai/blog/x` pasa.
- Fuente: motor/Runtime/Cuerpos.cs:53-57 ; motor/Runtime/Cuerpos.cs:76-125 ; motor/Runtime/Cuerpos.cs:144-147 ; motor/Runtime/Cuerpos.cs:311-313
- Prueba: vector — motor/Tests/CuerpoOperadorPruebas.cs:19 (LasFugasSonLasMismasQueEnTypeScript) ; motor/Tests/CuerpoOperadorPruebas.cs:44 (UnaFuenteDeDocsOBlogDeUnProveedorNoEsFuga) ; motor/Tests/CuerpoOperadorPruebas.cs:62 (UnEnlaceALaInterfazDelProveedorSigueSiendoFuga) ; motor/Tests/Referencias.g.cs:154 (Fugas)
- Plataforma: ambas

### OPE-010 · Marcas de integridad cada 1.000 caracteres
- Qué hace: inserta `[[CC-MARCA-NNNN-token]]` en su propia línea en el primer espacio o salto a partir de cada 1.000 caracteres, nunca en medio de una palabra, y cierra con `[[CC-MARCA-FIN-token]]`.
- Condición y resultado observable: un cuerpo de 3.500 caracteres lleva 4 marcas numeradas y la de FIN.
- Fuente: motor/Runtime/Cuerpos.cs:49 ; motor/Runtime/Cuerpos.cs:151-171 ; motor/Runtime/Cuerpos.cs:309 ; motor/Runtime/Cuerpos.cs:314
- Prueba: vector — motor/Tests/CuerpoOperadorPruebas.cs:79 (LasMarcasVanEnElPrimerBlancoDespuesDelIntervalo) ; motor/Tests/Referencias.g.cs:176 (Marcas)
- Plataforma: ambas

### OPE-011 · Integridad completa, truncada o indeterminada
- Qué hace: compara las marcas presentes en un texto: «completo» si están todas, «truncado» si faltan en un tramo contiguo, «indeterminado» si faltan dispersas; con todas presentes localiza los segmentos cuyo largo cambió.
- Condición y resultado observable: faltan las marcas 3 y 4 → «truncado»; faltan 1 y 4 → «indeterminado».
- Fuente: motor/Runtime/Cuerpos.cs:213-254
- Prueba: vector — motor/Tests/CuerpoOperadorPruebas.cs:90 (LaIntegridadDistingueCompletoTruncadoEIndeterminado) ; motor/Tests/CuerpoOperadorPruebas.cs:102 (LaPerdidaSeLocalizaEnElSegmentoQueCambio) ; motor/Tests/Referencias.g.cs:188 (Integridades) ; motor/Tests/Referencias.g.cs:197 (Perdidas)
- Plataforma: ambas

### OPE-012 · Sello idempotente
- Qué hace: la primera operación escribe el sello (etiqueta, código estable, proveedor, respuesta); las siguientes lo comparan con el recién calculado y, si discrepan, se niegan sin escribir: «el sello ya persistido para la ronda {id} no coincide con el que se acaba de calcular ({motivo}) — posible cambio en las respuestas, la semilla o el orden del pool entre consolidaciones. No se escribió nada.».
- Condición y resultado observable: con el sello escrito, cambiar una respuesta hace que la operación se niegue.
- Fuente: motor/Runtime/Puerta.cs:496-538
- Prueba: vector — motor/Tests/PuertaPruebas.cs:248 (ConElSelloYaEscritoUnaRespuestaDistintaHaceQueLaOperacionSeNiegue)
- Plataforma: ambas

### OPE-013 · Operación por archivo o pegada
- Qué hace: solo para operadores del pool. Con archivo: prompt sin cuerpo y archivo `operacion-{P#}-{AAAA-MM-DD-HHMM}.txt` (hora local) con el cuerpo, sus marcas y FIN, y prompt completo registrado como «{prompt}\n\n=== ARCHIVO ADJUNTO: {nombre} ===\n{archivo}». Pegada: marcas sobre el texto entero y FIN sin salto final.
- Condición y resultado observable: un id fuera del pool se niega con «"{nombre}" no es un operador del pool: no tiene cuerpo que operar».
- Fuente: motor/Runtime/Puerta.cs:540-580 ; motor/Runtime/Prompts.cs:91-99
- Prueba: vector — motor/Tests/PromptsPruebas.cs:25 (LosPromptsSonLosMismosQueArmaElTypeScript) ; motor/Tests/Referencias.g.cs:497 (CorridaOperacionLineas)
- Plataforma: ambas

### OPE-014 · Sustitución literal de marcadores
- Qué hace: `{{PREGUNTA}}` y `{{CUERPO}}` se sustituyen en una sola pasada, partiendo y juntando, sin patrones; un marcador dentro de la pregunta queda literal.
- Condición y resultado observable: una pregunta que contiene «{{CUERPO}}» no recibe el cuerpo adentro.
- Fuente: motor/Runtime/Prompts.cs:80-86
- Prueba: vector — motor/Tests/PromptsPruebas.cs:42 (UnMarcadorDentroDeLaPreguntaQuedaLiteral)
- Plataforma: ambas

### OPE-015 · Hallazgos del operador
- Qué hace: al capturar una operación se guarda la salida cruda y se derivan hallazgos por línea: CONVERGENCIA, DIVERGENCIA, TENSION, SINGULARIDAD, AUSENCIA (4 campos con eje) y LIMITACION:CORPUS/AMBIGUEDAD/TAREA/OTRA (3 campos), separados por «|»; etiquetas «—», «-», vacío o «NINGUNA» = ninguna; espacio duro pasa a espacio; las líneas que no encajan se cuentan como descartadas; una etiqueta que no estaba en el cuerpo de ese operador marca `EtiquetaInvalida`.
- Condición y resultado observable: «CONVERGENCIA|costo|P1,P3|…» de un operador que no recibió P3 queda con etiqueta inválida.
- Fuente: motor/Runtime/Parseos.cs:86-151 ; motor/Runtime/Puerta.cs:416-434 ; motor/Runtime/Dominio.cs:160-173
- Prueba: vector — motor/Tests/ParseosPruebas.cs:69 (LosHallazgosSonLosMismosQueEnTypeScript) ; motor/Tests/ParseosPruebas.cs:82 (TensionSeLeeYUnaEtiquetaInexistenteQuedaMarcada) ; motor/Tests/RondaPruebas.cs:75 (LasEtiquetasValidasSonLasDelPoolMenosLaPropia)
- Plataforma: ambas

### OPE-016 · Reutilizar la operación anterior
- Qué hace: en una ronda con respuestas copiadas, reutiliza la operación de un operador si todo lo que lee son copias sin cambios de una sola ronda origen; los hallazgos se vuelven a derivar contra el sello de esta ronda.
- Condición y resultado observable: mensaje «{nombre}: se reutilizó su operación de la ronda {id} ({n} hallazgos). No hace falta pegarle la operación de nuevo.»; si algo cambió, «No se puede reutilizar: {nombre} lee respuestas que cambiaron en esta ronda (…). Tiene que operar de nuevo.»; sin sello, «Esta ronda todavía no tiene sello: pega primero la operación en algún panel («Pegar la operación aquí»).».
- Fuente: motor/Runtime/Puerta.cs:774-802
- Prueba: vector — motor/Tests/Referencias.g.cs:585 (MensajeReusoKimi) ; motor/Tests/Referencias.g.cs:587 (MensajeReusoChatgpt)
- Plataforma: ambas

## Invariantes

### INV-OPE-001 · El barajado nunca se recalcula distinto
- Qué nunca pasa: una misma ronda produce dos órdenes o dos sellos distintos; si discrepan, no se escribe nada.
- Fuente: motor/Runtime/Puerta.cs:496-521 ; motor/Runtime/Anonimizacion.cs:183-186
- Prueba: vector — motor/Tests/PuertaPruebas.cs:248 (ConElSelloYaEscritoUnaRespuestaDistintaHaceQueLaOperacionSeNiegue)

### INV-OPE-002 · Ningún cuerpo delata al proveedor por URL
- Qué nunca pasa: se devuelve un cuerpo con una URL de interfaz de proveedor o con el id de un proveedor en la query.
- Fuente: motor/Runtime/Cuerpos.cs:144-147 ; motor/Runtime/Cuerpos.cs:311-313
- Prueba: vector — motor/Tests/CuerpoOperadorPruebas.cs:27 (ElCuerpoLimpioPasaYElQueDelataAlProveedorTira)

### INV-OPE-003 · Un operador nunca se evalúa a sí mismo
- Qué nunca pasa: el cuerpo de un operador contiene su propia respuesta.
- Fuente: motor/Runtime/Cuerpos.cs:300
- Prueba: vector — motor/Tests/CuerpoOperadorPruebas.cs:162 (CadaCuerpoExcluyeLaRespuestaDeSuOperador)

### INV-OPE-004 · Sin semilla no se simula un barajado
- Qué nunca pasa: se arma un cuerpo con una semilla inventada.
- Fuente: motor/Runtime/Puerta.cs:474-476
- Prueba: nueva — una ronda sin semilla en el registro hace que `ArmarOperacion` lance y no escriba sello.
