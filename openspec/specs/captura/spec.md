# Captura

Propósito: leer de cada página la respuesta que la persona decidió capturar, guardar el dato crudo y clasificarlo según la etapa que dice el registro, sin adivinar nunca un fallo.

> Extraído de ChatCouncil-Unity (ChatCouncil-main, commit 247f6db) el 2026-11-07. Rutas relativas a ese repo.

## Requisitos

### CAP-001 · Leer la última respuesta con su HTML crudo
- Qué hace: el script de página lee el último mensaje del asistente, y a continuación el canvas y los archivos si los hay; devuelve texto, html crudo del subárbol (dato canónico), mensaje de usuario, conteo de enlaces de fuente, etiqueta de modelo y si genera. Si la spec define `fallaDeCarga` y aparece, error «la página mostró «{texto}» en lugar de la respuesta: recárgala y vuelve a capturar».
- Condición y resultado observable: el hecho Respuesta guarda `Html` con el `outerHTML` del mensaje más el canvas y los archivos.
- Fuente: pagina/src/pagina.ts:386-413
- Prueba: manual — 1. Con un perfil de prueba y el modelo más barato, enviar la pregunta en Mistral con canvas. 2. Capturar. 3. Comprobar en el `.jsonl` que el texto trae el mensaje y el canvas.
- Plataforma: ambas

### CAP-002 · Informe en iframe
- Qué hace: si la respuesta tiene el informe en un iframe del mismo turno, la app lo lee y lo agrega al texto y al html; si no puede, la lectura queda con error.
- Condición y resultado observable: error «el informe de {nombre} está en un iframe ({frameUrl}) que no se pudo leer: la burbuja sola no es la respuesta».
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:719-756 ; unity/Assets/Panel/Paneles.cs:241-251
- Prueba: manual — 1. Con un perfil de prueba, usar investigación profunda en el proveedor que entrega en iframe. 2. Capturar. 3. Comprobar que el texto incluye el informe.
- Plataforma: ambas

### CAP-003 · Capturar los seleccionados en paralelo
- Qué hace: lee los paneles pedidos a la vez (techo 60 s cada uno), los registra según la etapa y resume.
- Condición y resultado observable: mensaje «Capturados {x} de {n} ({Proveedor caracteres · …} caracteres).» más « Con problema: {nombres}.» y el aviso de prompts si lo hay.
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:768-791
- Prueba: manual — 1. Con un perfil de prueba, enviar y esperar «Parece terminado» en dos paneles. 2. Tocar «Capturar los que terminaron». 3. Comprobar el mensaje con los largos.
- Plataforma: ambas

### CAP-004 · Umbral mínimo de lectura
- Qué hace: una lectura de menos de 20 caracteres sin error pasa a error «lectura por debajo del umbral ({n} de 20 caracteres): no genero una respuesta observable, no se guarda como valida».
- Condición y resultado observable: una captura de 3 caracteres queda como respuesta con error y el panel «Con problema».
- Fuente: motor/Runtime/Puerta.cs:128-131 ; motor/Runtime/Puerta.cs:339-341
- Prueba: vector — motor/Tests/PuertaPruebas.cs:523 (ElUmbralDeLecturaEsElDeLaVersionElectron)
- Plataforma: ambas

### CAP-005 · Capturar sin ronda abre una con marcador
- Qué hace: sin ronda abierta, capturar abre una con el prompt «(capturado sin ronda de envio: el texto ya estaba en pantalla al presionar Leer/Capturar)»; luego la pregunta se declara.
- Condición y resultado observable: el historial muestra esa ronda como «(capturada sin pegar la pregunta, y sin declararla)» hasta declararla.
- Fuente: motor/Runtime/Puerta.cs:133-134 ; motor/Runtime/Puerta.cs:342 ; unity/Assets/Interfaz/Aplicacion.cs:329
- Prueba: vector — motor/Tests/PuertaPruebas.cs:555 (SinRondaAbiertaLaCapturaAbreUnaConElMarcadorYLaPreguntaSeDeclara)
- Plataforma: ambas

### CAP-006 · Clasificación por etapa
- Qué hace: según la etapa del registro, cada lectura va como respuesta, salida de operador, informe del integrador, salida de verificador o respuesta del redactor.
- Condición y resultado observable: capturar al integrador en integración escribe un InformeIntegrador, no una Respuesta.
- Fuente: motor/Runtime/Dominio.cs:180-206 ; motor/Runtime/Puerta.cs:345-347
- Prueba: vector — motor/Tests/RondaPruebas.cs:85 (LasLecturasSeClasificanPorEtapa) ; motor/Tests/Referencias.g.cs:356 (Clasificaciones)
- Plataforma: ambas

### CAP-007 · Antes del sello, capturar recaptura la investigación
- Qué hace: en operación sin sello escrito, capturar un investigador recaptura su respuesta (vale la última).
- Condición y resultado observable: tras recapturar, la respuesta vigente es la nueva.
- Fuente: motor/Runtime/Puerta.cs:348-354
- Prueba: vector — motor/Tests/PuertaPruebas.cs:122 (AntesDeArmarLaOperacionCapturarRecapturaLaInvestigacion)
- Plataforma: ambas

### CAP-008 · Respuesta corta queda señalada
- Qué hace: en investigación, una respuesta válida de menos de 300 caracteres deja un ErrorCaptura «respuesta sospechosamente corta: puede haber quedado fuera de la captura»; no la bloquea.
- Condición y resultado observable: la respuesta se guarda y además queda el error de captura.
- Fuente: motor/Runtime/Puerta.cs:136-137 ; motor/Runtime/Puerta.cs:357-362
- Prueba: vector — motor/Tests/PuertaPruebas.cs:531 (LaCorridaDeNueveLecturasDejaLosMismosHechosQueElTypeScript)
- Plataforma: ambas

### CAP-009 · Un fallo nunca se adivina
- Qué hace: una salida de operador que no se puede parsear, o un rol cuyo panel no estaba abierto, queda como ErrorCaptura; por ejemplo «el panel del {rol} ({id}) no estaba abierto al capturar».
- Condición y resultado observable: el registro tiene el ErrorCaptura y el panel aparece «Con problema».
- Fuente: motor/Runtime/Puerta.cs:364-384
- Prueba: vector — motor/Tests/PuertaPruebas.cs:74 (UnaCapturaConErrorNoCierraLaInvestigacion)
- Plataforma: ambas

### CAP-010 · Dato crudo y citas al guardar una respuesta
- Qué hace: cada respuesta guarda texto, html, contexto (continuidad confirmada, refutada o indeterminada y tamaño del panel) y las citas derivadas del html; `metodoEscritura` queda nulo.
- Condición y resultado observable: el hecho Respuesta tiene `Citas` derivadas del html y la continuidad del hilo.
- Fuente: motor/Runtime/Puerta.cs:804-832 ; unity/Assets/Interfaz/PantallaRonda.cs:758-766
- Prueba: vector — motor/Tests/RondaPruebas.cs:12 (LasCitasSonLasMismasQueEnTypeScript) ; motor/Tests/Referencias.g.cs:325 (Citas)
- Plataforma: ambas

### CAP-011 · Extracción de citas
- Qué hace: una cita por aparición de enlace, con dónde vive (dentro de un panel de fuentes o en el cuerpo) y los descartes contados.
- Condición y resultado observable: un chip en línea cuenta como cuerpo y la lista de fuentes clave como panel.
- Fuente: motor/Runtime/Citas.cs:90-151
- Prueba: vector — motor/Tests/RondaPruebas.cs:39 (ElChipInlineEsCuerpoYLaListaDeFuentesClaveEsPanel) ; motor/Tests/RondaPruebas.cs:30 (LosCuatroDescartesDeT1)
- Plataforma: ambas

### CAP-012 · Procedencia del fin
- Qué hace: cada respuesta deriva si su fin fue observado o inferido.
- Condición y resultado observable: el informe muestra la condición de cada captura según su procedencia.
- Fuente: motor/Runtime/Dominio.cs:91-106
- Prueba: vector — motor/Tests/DominioPruebas.cs:65 (LaProcedenciaDistingueFinObservadoDeInferido) ; motor/Tests/Referencias.g.cs:689 (Procedencias)
- Plataforma: ambas

### CAP-013 · Aviso de prompts en investigación
- Qué hace: solo en investigación, con al menos dos prompts de usuario leídos, compara normalizados.
- Condición y resultado observable: «⚠ Los prompts de usuario capturados NO coinciden entre proveedores ({n} versiones distintas) — revisar antes de comparar respuestas.» o «Prompt de usuario: coincide en los {n} proveedores donde se pudo leer.»; el primero se anuncia como problema.
- Fuente: motor/Runtime/Puerta.cs:1340-1368 ; unity/Assets/Interfaz/PantallaRonda.cs:786-788
- Prueba: vector — motor/Tests/PuertaPruebas.cs:630 (ElAvisoDePromptsEsElMismoQueEnTypeScript) ; motor/Tests/Referencias.g.cs:605 (AvisosPrompts)
- Plataforma: ambas

### CAP-014 · Estado de generación sin inventar
- Qué hace: cada 1,5 s la app pide `estado` a cada página: generando, largo, quietud, fin «observado» (el control de detener desapareció con texto) o «deducido» (texto quieto la ventana de la spec) y zoom; si la página no responde, se borra el dato en vez de inventarlo.
- Condición y resultado observable: el panel pasa a «Parece terminado» solo con fin observado o deducido; la app avisa y la persona decide cuándo capturar.
- Fuente: pagina/src/pagina.ts:415-446 ; unity/Assets/Interfaz/PantallaRonda.cs:27 ; unity/Assets/Interfaz/PantallaRonda.cs:279-302
- Prueba: manual — 1. Enviar la pregunta en un panel de prueba. 2. Ver «Respondiendo» mientras escribe. 3. Ver «Parece terminado» al terminar.
- Plataforma: ambas

### CAP-015 · Estado de cada panel sale del registro
- Qué hace: el estado es capturado, con problema, respondiendo, parece terminado (observado o deducido), pegado falta enviar o por pegar, calculado del registro y de lo pegado en la sesión; quien no es rol de la etapa figura capturado si dejó su hecho.
- Condición y resultado observable: tras capturar, el panel muestra «Capturado» aunque la página siga generando.
- Fuente: motor/Runtime/Puerta.cs:1288-1338
- Prueba: vector — motor/Tests/PuertaPruebas.cs:472 (ElEstadoDeCadaPanelSaleDelRegistro) ; motor/Tests/PuertaPruebas.cs:498 (ElEstadoDelPanelSigueAlPasoCuandoEmpiezaLaOperacion) ; motor/Tests/PuertaPruebas.cs:408 (EnLasEtapasDeLosRolesLoYaCapturadoSigueCapturado)
- Plataforma: ambas

### CAP-016 · Recapturar integrador o verificadores
- Qué hace: vuelve a leer el integrador o los dos verificadores; una lectura fallida, bajo el umbral o (verificador) sin formato queda como ErrorCaptura y no reemplaza a la buena. Sin informe previo: «No hay un informe de integrador en esta ronda todavía. Usa "Pegar integrador".» / «No hay una verificación en esta ronda todavía. Usa "Pegar verificación".».
- Condición y resultado observable: con éxito, «{nombre}: {rol} recapturado, {n} caracteres ({k} en el registro; se usa el último)»; si falla, «{nombre}: el {rol} no se recapturó ({error})».
- Fuente: motor/Runtime/Puerta.cs:699-732 ; unity/Assets/Interfaz/PantallaRonda.cs:1160-1175
- Prueba: vector — motor/Tests/PuertaPruebas.cs:447 (UnaRecapturaFallidaQuedaComoErrorYNoReemplaza) ; motor/Tests/Referencias.g.cs:584 (MensajeRecaptura)
- Plataforma: ambas

## Invariantes

### INV-CAP-001 · Una lectura fallida nunca reemplaza a la buena
- Qué nunca pasa: una recaptura con error o bajo el umbral se convierte en la salida vigente.
- Fuente: motor/Runtime/Puerta.cs:704-713
- Prueba: vector — motor/Tests/PuertaPruebas.cs:447 (UnaRecapturaFallidaQuedaComoErrorYNoReemplaza)

### INV-CAP-002 · Capturar lo decide la persona
- Qué nunca pasa: la app captura sola al detectar el fin; el estado solo avisa.
- Fuente: pagina/src/pagina.ts:415-421 ; unity/Assets/Interfaz/PantallaRonda.cs:508-516
- Prueba: manual — 1. Enviar la pregunta en un panel de prueba y esperar «Parece terminado». 2. Esperar 1 minuto sin tocar nada. 3. Comprobar que el registro no tiene la Respuesta.

### INV-CAP-003 · Sin dato de la página no se inventa estado
- Qué nunca pasa: el sondeo deja un estado viejo o supuesto cuando la página no respondió.
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:294-297
- Prueba: manual — 1. Recargar un panel durante el sondeo. 2. Comprobar que su estado vuelve a «Pegado, falta que envíes» o «Por pegar» y no queda «Respondiendo».
