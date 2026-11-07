# Verificadores

Propósito: que dos verificadores, por separado, busquen fuentes para lo que el integrador marcó como rescatable, con líneas parseables, y que la app compruebe que sus URLs responden.

> Extraído de ChatCouncil-Unity (ChatCouncil-main, commit 247f6db) el 2026-11-07. Rutas relativas a ese repo.

## Requisitos

### VER-001 · Prompt del verificador desde la sección de rescate
- Qué hace: toma la sección «Qué conviene rescatar» del último informe del integrador, tal cual, y solo los H## que esa sección cita, en orden de primera aparición; un H## que no está en la tabla no se inventa. Sin informe: «la ronda todavía no tiene un informe del integrador capturado». Sin la sección: «el informe del integrador no tiene la seccion QUE CONVIENE RESCATAR. Se capturó (primeros 100 caracteres): "…"».
- Condición y resultado observable: un rescate que cita [H3] [H1] [H3] [H99] produce las líneas de H3 y H1, en ese orden.
- Fuente: motor/Runtime/Puerta.cs:619-649 ; motor/Runtime/Prompts.cs:108-116
- Prueba: vector — motor/Tests/PromptsPruebas.cs:25 (LosPromptsSonLosMismosQueArmaElTypeScript) ; motor/Tests/Referencias.g.cs:217 (Prompts)
- Plataforma: ambas

### VER-002 · El mismo prompt a los dos verificadores
- Qué hace: en verificación, el mismo prompt se pega en los dos verificadores, uno después del otro, cada uno en una conversación nueva comprobada vacía y verificado por igualdad; si uno falla, se detiene y lo dice.
- Condición y resultado observable: mensaje «Prompt pegado en {v1} y {v2}. Revísalo y envíalo.».
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:1128-1157
- Prueba: manual — 1. Con un perfil de prueba, llegar a verificación. 2. Tocar «Pegar el prompt aquí». 3. Comprobar que GLM y Qwen reciben el mismo texto y el mensaje con los dos nombres.
- Plataforma: ambas

### VER-003 · Los dos verificadores se capturan juntos
- Qué hace: capturar un rol en su etapa captura a todos los de la etapa; en verificación, los dos verificadores.
- Condición y resultado observable: «Capturar este panel» en un verificador registra la salida de ambos.
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:98-103 ; motor/Runtime/Puerta.cs:387-389
- Prueba: manual — 1. Enviar el prompt en los dos verificadores de prueba. 2. Capturar desde uno. 3. Comprobar dos hechos SalidaVerificador en el registro.
- Plataforma: ambas

### VER-004 · Sin líneas de verificación no es una verificación
- Qué hace: una salida sin ninguna línea de correspondencia en el formato pedido queda como ErrorCaptura «la respuesta no trae ninguna línea de verificación en el formato pedido (¿investigación profunda?): repite la verificación de este panel con solo búsqueda web».
- Condición y resultado observable: un ensayo largo sin líneas CONFIRMA/CONTRADICE/NO_ENCONTRADA no se guarda como verificación válida.
- Fuente: motor/Runtime/Puerta.cs:582-588 ; motor/Runtime/Puerta.cs:387-389
- Prueba: vector — motor/Tests/PuertaPruebas.cs:95 (UnaVerificacionSinLineasNoSeGuardaComoValida)
- Plataforma: ambas

### VER-005 · Parseo de la verificación
- Qué hace: lee líneas CONFIRMA, CONTRADICE y NO_ENCONTRADA con tipos de fuente OFICIAL, PRIMARIA, ACADEMICA o SECUNDARIA, el H##, la primera URL y la cita sin comillas; una línea con varios H## da una correspondencia por cada uno; PUNTO_CIEGO (con o sin tipo) y PREGUNTA; el formato anterior VERIFICADO/CONTRADICHO/NO_VERIFICADO se traduce; un H## fuera de la tabla queda con `HallazgoInvalido`; lo demás se cuenta como descartado.
- Condición y resultado observable: «VERIFICADO|H12|https://a|"x"» se lee como CONFIRMA con formato anterior.
- Fuente: motor/Runtime/Parseos.cs:153-162 ; motor/Runtime/Parseos.cs:265-330
- Prueba: vector — motor/Tests/ParseosPruebas.cs:90 (LaVerificacionEsLaMismaQueEnTypeScript) ; motor/Tests/ParseosPruebas.cs:55 (LaCitaDelVerificadorSinEntidadesYConSusComillas) ; motor/Tests/Referencias.g.cs:261 (VerificacionParseada)
- Plataforma: ambas

### VER-006 · Texto del verificador sin el razonamiento
- Qué hace: el texto de la salida del verificador se toma del html por bloques, sin el razonamiento.
- Condición y resultado observable: una verificación capturada por bloques no trae el bloque de razonamiento.
- Fuente: motor/Runtime/TextoDeHtml.cs:188
- Prueba: vector — motor/Tests/ParseosPruebas.cs:25 (LaVerificacionCapturadaPorBloquesNoTraeElRazonamiento)
- Plataforma: ambas

### VER-007 · Verificaciones vigentes en orden D62
- Qué hace: vale la última verificación de cada verificador, en el orden de los verificadores (el 1 primero); la de un proveedor que ya no es verificador va al final.
- Condición y resultado observable: con glm y qwen, glm sale primero aunque qwen se capturó antes.
- Fuente: motor/Runtime/Dominio.cs:149-158
- Prueba: vector — motor/Tests/RondaPruebas.cs:189 (LasVerificacionesVigentesVanEnElOrdenDeLosVerificadores)
- Plataforma: ambas

### VER-008 · Repetir la verificación de un panel
- Qué hace: en verificación o redacción, en el panel de un verificador, vuelve a pegar el prompt del verificador en una conversación nueva; la respuesta se toma con «Recapturar la verificación».
- Condición y resultado observable: mensaje «Prompt del verificador pegado en {nombre}: actívale solo la búsqueda web y el razonamiento, envíalo y, cuando termine, usa «Ronda… → Recapturar la verificación».»; fuera de lugar el ítem dice «Solo en el panel de un verificador.» o «Solo en la verificación o la redacción.».
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:1010-1013 ; unity/Assets/Interfaz/PantallaRonda.cs:1025-1045
- Prueba: manual — 1. En redacción con un perfil de prueba, mostrar el panel de Qwen. 2. Abrir «Ronda…» y tocar «Repetir la verificación de este panel». 3. Comprobar la conversación nueva y el mensaje.
- Plataforma: ambas

### VER-009 · Comprobación de URLs citadas
- Qué hace: antes de armar el informe, cada URL de la sección 1 de cada verificación vigente se pide sin cookies (HEAD y, si no da 2xx, GET, siguiendo redirecciones, sin leer el cuerpo), con 10 s por URL y un máximo de 20 URLs por verificación; solo http/https; las locales o privadas no se piden. Cada verificación se comprueba una sola vez y el resultado queda como hecho UrlComprobada.
- Condición y resultado observable: tras armar, la pantalla dice «URLs de los verificadores: responden {x} de {n}.».
- Fuente: motor/Runtime/Puerta.cs:860-977 ; unity/Assets/Interfaz/Adaptadores.cs:15-33 ; unity/Assets/Interfaz/PantallaRonda.cs:1176-1194
- Prueba: vector — motor/Tests/PuertaPruebas.cs:278 (CadaUrlSeComprueba) ; motor/Tests/PuertaPruebas.cs:291 (LasUrlsLocalesOConOtroEsquemaNoSePiden)
- Plataforma: ambas

## Invariantes

### INV-VER-001 · Los verificadores nunca se ven entre sí
- Qué nunca pasa: el prompt de un verificador incluye la salida del otro; ambos reciben el mismo prompt armado desde el integrador.
- Fuente: motor/Runtime/Puerta.cs:626-649 ; unity/Assets/Interfaz/PantallaRonda.cs:1128
- Prueba: vector — motor/Tests/PromptsPruebas.cs:25 (LosPromptsSonLosMismosQueArmaElTypeScript)

### INV-VER-002 · Las URLs se comprueban sin la sesión de Juan
- Qué nunca pasa: la comprobación de URLs manda cookies o usa el perfil de los paneles.
- Fuente: unity/Assets/Interfaz/Adaptadores.cs:19-25
- Prueba: manual — 1. Revisar que `HttpSinCookies` crea el cliente con `UseCookies = false`. 2. Armar un informe con un perfil de prueba y comprobar con un proxy local que los pedidos no traen cabecera Cookie.

### INV-VER-003 · Una dirección local nunca se pide
- Qué nunca pasa: la app pide una URL de localhost, de red privada o con esquema distinto de http/https.
- Fuente: motor/Runtime/Puerta.cs:905-931
- Prueba: vector — motor/Tests/PuertaPruebas.cs:291 (LasUrlsLocalesOConOtroEsquemaNoSePiden)

## Conflictos

### CONFLICTO-VER-01
- docs/FASE6-SPEC.md:254-256 (historia 60) fija «máximo 20 por ronda».
- motor/Runtime/Puerta.cs:963 aplica el techo de 20 por cada verificación (`ComprobarUrlsDe` por salida, llamado una vez por verificador en motor/Runtime/Puerta.cs:946-951); con dos verificadores (D62) una ronda puede comprobar hasta 40.

### CONFLICTO-VER-02
- PRODUCT.md:27-28 y docs/FASE6-SPEC.md:79-81 hablan de un verificador.
- motor/Runtime/Roles.cs:22-23 y unity/Assets/Interfaz/PantallaRonda.cs:1128 trabajan con dos verificadores que reciben el mismo prompt.
