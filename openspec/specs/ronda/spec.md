# Ronda: etapas, roles 7-1-2-1 y selección de proveedores

Propósito: decidir qué proveedores investigan y cuáles cumplen los roles, y guiar la ronda por sus siete etapas con un único paso siguiente derivado del registro.

> Extraído de ChatCouncil-Unity (ChatCouncil-main, commit 247f6db) el 2026-11-07. Rutas relativas a ese repo.

## Requisitos

### RON-001 · Diez proveedores conocidos, en orden fijo
- Qué hace: la app conoce diez proveedores en este orden: chatgpt, gemini, claude, grok, mistral, glm, kimi, qwen, deepseek, perplexity. Ese orden rige la configuración y el pool.
- Condición y resultado observable: la lista de Ajustes y la del pool salen en ese orden.
- Fuente: motor/Runtime/Roles.cs:39-40
- Prueba: vector — motor/Tests/RondaPruebas.cs:124 (LosConocidosSonLosDeTypeScript) ; motor/Tests/Referencias.g.cs:364 (Conocidos)
- Plataforma: ambas

### RON-002 · Roles por defecto
- Qué hace: sin selección guardada, el integrador es deepseek, los verificadores son glm (1) y qwen (2) y el redactor es deepseek.
- Condición y resultado observable: en la primera apertura, la lista de roles muestra deepseek «Integra y redacta», glm y qwen «Verifica».
- Fuente: motor/Runtime/Roles.cs:45-50 ; unity/Assets/Interfaz/PantallaRonda.cs:203-206
- Prueba: vector — motor/Tests/PromptsPruebas.cs:177 (LosRolesPorDefectoSonLosDeLaVersionElectronYCumplenSusReglas) ; motor/Tests/Referencias.g.cs:240 (RolesPorDefecto)
- Plataforma: ambas

### RON-003 · Pool = todos menos los roles
- Qué hace: el pool de investigadores son los conocidos, en su orden, menos integrador, verificadores y redactor; con los roles por defecto quedan siete.
- Condición y resultado observable: con los defectos, el título de la lista dice «Investigación (7)» si están todos cargados.
- Fuente: motor/Runtime/Roles.cs:145-147 ; unity/Assets/Interfaz/PantallaRonda.cs:190-195
- Prueba: vector — motor/Tests/RondaPruebas.cs:166 (ElPoolSonTodosMenosLosRoles) ; motor/Tests/RondaPruebas.cs:178 (ConLosRolesPorDefectoElPoolSigueEnSiete) ; motor/Tests/Referencias.g.cs:404 (Pooles)
- Plataforma: ambas

### RON-004 · La pregunta va solo a los operadores cargados
- Qué hace: los operadores de la ronda son el pool filtrado por los proveedores marcados; la pregunta nunca va a los roles (historia 26).
- Condición y resultado observable: al pegar la pregunta, los paneles de integrador, verificadores y redactor no la reciben.
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:186-188
- Prueba: manual — 1. Abrir la app con roles por defecto. 2. Escribir una pregunta y tocar «Pegar la pregunta aquí». 3. Abrir el panel de deepseek, glm y qwen y comprobar que su compositor está vacío.
- Plataforma: ambas

### RON-005 · Lectura de la selección guardada
- Qué hace: lee `seleccion-proveedores.json` de la carpeta de datos (nunca del registro); si falta, es ilegible o no marca ningún conocido, se cargan los diez. Cada rol cae a su defecto si falta o no es conocido; si integrador y verificadores coinciden vuelven todos los defectos; un redactor ausente o igual a un verificador pasa a ser el integrador; el campo viejo `verificador` (antes de D62) cuenta como verificador 1.
- Condición y resultado observable: un archivo con `"verificador": "kimi"` y sin `verificador1` deja a kimi como verificador 1.
- Fuente: motor/Runtime/Roles.cs:42-43 ; motor/Runtime/Roles.cs:73-112 ; unity/Assets/Interfaz/PantallaRonda.cs:175-186
- Prueba: vector — motor/Tests/RondaPruebas.cs:100 (LaSeleccionYLosRolesSeLeenComoEnTypeScript) ; motor/Tests/Referencias.g.cs:367 (Selecciones)
- Plataforma: ambas

### RON-006 · Validación al guardar la selección
- Qué hace: impide guardar con estos mensajes literales, en este orden: «Tienes que marcar al menos un proveedor.», «Los dos verificadores tienen que ser proveedores distintos.», «El integrador y los verificadores tienen que ser proveedores distintos.», «El integrador y los verificadores tienen que estar entre los proveedores cargados.», «El redactor y los verificadores tienen que ser proveedores distintos.», «El redactor tiene que estar entre los proveedores cargados.».
- Condición y resultado observable: con glm como verificador 1 y 2, Guardar muestra el segundo mensaje y no escribe el archivo.
- Fuente: motor/Runtime/Roles.cs:52-57 ; motor/Runtime/Roles.cs:115-125
- Prueba: vector — motor/Tests/RondaPruebas.cs:113 (LaSeleccionSeValidaComoEnTypeScript)
- Plataforma: ambas

### RON-007 · Formato del archivo de selección
- Qué hace: guarda `proveedores` (en el orden de los conocidos), `integrador`, `verificador1`, `verificador2`, `redactor` y `guardadoEn`, con sangría de dos espacios y saltos LF.
- Condición y resultado observable: el archivo escrito coincide con el que escribía la versión TypeScript y se lee igual al reabrir.
- Fuente: motor/Runtime/Roles.cs:128-143
- Prueba: vector — motor/Tests/RondaPruebas.cs:147 (LaSeleccionSeEscribeConElFormatoDeTypeScript) ; motor/Tests/RondaPruebas.cs:128 (LaSeleccionGuardadaSeLeeIgualAlReabrir) ; motor/Tests/Referencias.g.cs:389 (Guardados)
- Plataforma: ambas

### RON-008 · Proveedores de cada etapa de rol
- Qué hace: en integración trabaja el integrador; en verificación, los dos verificadores; en redacción e informe, el redactor; en las etapas de operadores, ningún rol.
- Condición y resultado observable: al entrar en verificación se muestran los paneles de glm y qwen.
- Fuente: motor/Runtime/Roles.cs:22-29
- Prueba: nueva — `DeLaEtapa` para cada una de las siete etapas con roles por defecto.
- Plataforma: ambas

### RON-009 · Siete etapas
- Qué hace: la ronda pasa por pregunta, investigación, operación, integración, verificación, redacción e informe; la etapa sale de los hechos.
- Condición y resultado observable: la barra muestra «{Etapa} · {i} de 7».
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:30-31 ; unity/Assets/Interfaz/PantallaRonda.cs:437 ; motor/Runtime/Dominio.cs:63-72
- Prueba: vector — motor/Tests/DominioPruebas.cs:41 (LaEtapaSaleDeLosHechosYCuentaOperadoresDistintos)
- Plataforma: ambas

### RON-010 · Un único paso siguiente
- Qué hace: el paso siguiente sale del registro y de lo pegado en la sesión, nunca de la interfaz. Textos: «Pegar la pregunta en los paneles», «Capturar los que terminaron», «Declarar la pregunta de esta ronda», «Pegar la operación en los paneles», «Pegar el prompt del integrador», «Capturar el informe del integrador», «Pegar el prompt del verificador», «Capturar la verificación», «Pegar el prompt y el archivo del redactor», «Capturar la respuesta del redactor», «Armar el informe», «Abrir carpeta».
- Condición y resultado observable: con todas las respuestas del pool capturadas sin error y una pregunta válida, el paso es «Pegar la operación en los paneles»; si falta la pregunta válida, «Declarar la pregunta de esta ronda».
- Fuente: motor/Runtime/Puerta.cs:1251-1286
- Prueba: vector — motor/Tests/PuertaPruebas.cs:142 (UnaRondaEnteraDejaLosMismosHechosQueElTypeScript)
- Plataforma: ambas

### RON-011 · Una captura con error no cuenta para avanzar
- Qué hace: en investigación solo cuentan las respuestas sin error; una captura con error no cierra la investigación.
- Condición y resultado observable: con un panel en error, el paso sigue en «Capturar los que terminaron».
- Fuente: motor/Runtime/Puerta.cs:1262-1264
- Prueba: vector — motor/Tests/PuertaPruebas.cs:74 (UnaCapturaConErrorNoCierraLaInvestigacion)
- Plataforma: ambas

### RON-012 · Recordatorio por etapa
- Qué hace: cada paso trae el recordatorio literal de su etapa, por ejemplo en investigación «En cada panel, activa la búsqueda web o la investigación profunda del proveedor, revisa y envía tú. Antes de capturar, abre el panel de fuentes.» y en verificación «En el panel de cada verificador, activa la búsqueda web y el razonamiento, no la investigación profunda (devuelve un informe, no las líneas que pide el prompt); revisa y envía tú.».
- Condición y resultado observable: el texto de «Qué hago yo» cambia con la etapa y coincide con el literal.
- Fuente: motor/Runtime/Puerta.cs:1239-1249
- Prueba: nueva — comparar `PasoSiguiente().Recordatorio` en cada etapa con los siete literales.
- Plataforma: ambas

### RON-013 · Pregunta válida y pregunta efectiva
- Qué hace: una pregunta es válida si no está vacía, no empieza con «(» y no contiene «capturado sin ronda de envio»; la efectiva es la de la ronda si es válida, si no la última declarada válida.
- Condición y resultado observable: una ronda abierta capturando sin pegar usa la pregunta que se declare después.
- Fuente: motor/Runtime/Dominio.cs:38-56
- Prueba: vector — motor/Tests/DominioPruebas.cs:52 (LaPreguntaEfectivaRechazaElMarcadorYUsaLaUltimaDeclarada) ; motor/Tests/Referencias.g.cs:672 (PreguntasEfectivas) ; motor/Tests/Referencias.g.cs:680 (PreguntasValidas)
- Plataforma: ambas

### RON-014 · Declarar la pregunta exige ronda abierta
- Qué hace: declarar la pregunta escribe un hecho PreguntaDeclarada; sin ronda abierta se niega.
- Condición y resultado observable: sin ronda, declarar lanza error y no escribe.
- Fuente: motor/Runtime/Puerta.cs:850-856
- Prueba: vector — motor/Tests/PuertaPruebas.cs:597 (DeclararSinRondaAbiertaSeNiega)
- Plataforma: ambas

### RON-015 · Nombre visible del proveedor
- Qué hace: el nombre visible sale de una tabla de nombres; un id sin entrada se muestra con la inicial en mayúscula.
- Condición y resultado observable: «perplexity» se muestra como «Perplexity».
- Fuente: motor/Runtime/Dominio.cs:16-28
- Prueba: nueva — `NombreProveedor` para los diez conocidos.
- Plataforma: ambas

## Invariantes

### INV-RON-001 · Un rol nunca investiga
- Qué nunca pasa: el integrador, un verificador o el redactor aparecen en el pool de investigadores.
- Fuente: motor/Runtime/Roles.cs:146-147
- Prueba: vector — motor/Tests/RondaPruebas.cs:166 (ElPoolSonTodosMenosLosRoles)

### INV-RON-002 · Los dos verificadores nunca son el mismo proveedor ni el integrador
- Qué nunca pasa: se guarda o se usa una selección con verificadores iguales o con el integrador como verificador.
- Fuente: motor/Runtime/Roles.cs:118-120 ; motor/Runtime/Roles.cs:107
- Prueba: vector — motor/Tests/RondaPruebas.cs:113 (LaSeleccionSeValidaComoEnTypeScript)

### INV-RON-003 · El paso nunca sale de la interfaz
- Qué nunca pasa: la pantalla decide el paso siguiente por su cuenta; siempre lo pide a la Puerta.
- Fuente: motor/Runtime/Puerta.cs:1254-1255
- Prueba: vector — motor/Tests/PuertaPruebas.cs:142 (UnaRondaEnteraDejaLosMismosHechosQueElTypeScript)

## Conflictos

### CONFLICTO-RON-01
- PRODUCT.md:27-28 dice que el consejo tiene «un integrador, un verificador y un redactor».
- motor/Runtime/Roles.cs:46-48 y motor/Runtime/Roles.cs:22-23 tienen dos verificadores (D62).

### CONFLICTO-RON-02
- docs/FASE6-SPEC.md:80 y docs/FASE6-SPEC.md:87 (historias 4 y 6) piden un solo verificador, GLM por defecto.
- motor/Runtime/Roles.cs:46-48 usa glm y qwen como verificadores 1 y 2.

### CONFLICTO-RON-03
- PRODUCT.md:47 dice «Hay nueve proveedores; un consejo usa siete.».
- motor/Runtime/Roles.cs:40 conoce diez proveedores (incluye perplexity).
