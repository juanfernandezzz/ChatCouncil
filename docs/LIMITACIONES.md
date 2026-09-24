# Limitaciones — ChatCouncil

> Esto es lo que otra persona necesita saber antes de confiar en una salida
> de ChatCouncil. El aviso de primer uso de la aplicación REFERENCIA este
> archivo; no lo duplica.

**Regla de este archivo:** cada limitación lleva la fecha en que se
constató y si fue MEDIDA o simplemente observada de paso. Un documento de
limitaciones sin procedencia repite el problema que viene a resolver.

---

## Sobre el diseño

- **Diseño round-robin con exclusión de autoevaluación**, apoyado en el
  Modelo de Relaciones Sociales (Social Relations Model — Kenny, 1994; Kenny
  y La Voie, 1984). *Observado de paso, 2026-08-13: es la referencia
  metodológica que fundamenta el diseño de la parte 2, no una medición sobre
  ChatCouncil.*

  **La exclusión depende de que la conversación del panel esté limpia, no
  sólo de qué texto trae el cuerpo.** El prompt de operación se escribe en
  el mismo panel donde ese proveedor ya respondió la pregunta original — si
  el historial visible conserva esa respuesta, el operador la lee igual,
  fuera del cuerpo que se le armó. "Consolidar respuestas" corre "Nuevo
  chat" (navega a `newConversationUrl`) en los 8 del pool antes de escribir,
  y VERIFICA (no asume) que quedaron sin mensajes previos. *Medido en vivo,
  2026-09-17: los 8 proveedores del pool (chatgpt, gemini, claude, grok,
  mistral, glm, kimi, qwen) quedaron con cero mensajes de asistente y de
  usuario tras navegar a su `newConversationUrl` — ninguno arrastra
  contexto entre chats. Si esto cambiara para algún proveedor en una corrida
  futura, se registra acá con su fecha, igual que el resto de este
  documento.*

- El marco de rigor es el de Lincoln y Guba (1985, *Naturalistic Inquiry*):
  credibilidad, transferibilidad, dependibilidad y confirmabilidad.
  ChatCouncil los cubre así:

  | Criterio | Cómo lo cubre ChatCouncil |
  |---|---|
  | credibilidad | triangulación entre ocho fuentes independientes |
  | dependibilidad | registro append-only con procedencia |
  | confirmabilidad | trazabilidad del informe a la matriz, celda a celda |
  | transferibilidad | registro de las condiciones de cada turno |

  *Observado de paso, 2026-08-13: mapeo declarado del diseño contra el
  marco, no una medición.*

- **La fiabilidad de este instrumento NO está medida.** El número de
  participantes (8) se eligió por analogía con una literatura de percepción
  interpersonal humana; no hay medición equivalente para modelos de
  lenguaje. *Constatado 2026-08-13, por ausencia: no existe en este
  repositorio ninguna medición de fiabilidad del pool de 8.*

### Sobre una cifra que circuló y que NO se usa

Circuló en conversaciones un dato del tipo "50,2 [algo] para 8 operadores".
**Ese dato, presentado así, es falso y no se escribe en este documento.**

El dato real, con todas sus condiciones — y sólo se puede citar con ellas,
nunca solo ni redondeado, nunca como propiedad de ChatCouncil:

> Bonito y Kenny (2010) presentan un **ejemplo hipotético** en el que, con
> covarianza diádica 0,20, covarianza target-perceptor -0,05 y varianza de
> target 0,10 mantenidas constantes, la fiabilidad del efecto target pasa de
> 0,29 a 0,52 al comparar un grupo de 4 con uno de 8. Es sobre **percepción
> interpersonal humana**, no sobre modelos de lenguaje.
> Referencia: *Personal Relationships* 17(2):235-251, DOI
> 10.1111/j.1475-6811.2010.01274.x.

No se agrega ninguna otra cifra a este documento salvo que se haya medido
en este repositorio.

- **Dispersión de volumen de 22,5x entre proveedores, sobre el mismo
  prompt.** qwen devolvió 42.890 caracteres, mistral 1.909, en la misma
  captura (nueve conversaciones reales respondiendo la misma pregunta de
  Juan). 42.890 / 1.909 ≈ 22,5. En la Parte 2 (round-robin, exclusión de
  autoevaluación), qwen ocupa ~35% del cuerpo de 7 respuestas que lee cada
  operador; mistral ~1,6%. Es una amenaza real a la comparabilidad: un
  evaluador expuesto a esa asimetría de longitud está sujeto al sesgo de
  verbosidad ya documentado en la literatura de modelo-como-evaluador
  (LLM-as-judge). **No se corrige recortando** — alterar una respuesta real
  para emparejar longitudes sería alterar el dato de investigación, y esa
  es la regla más dura del proyecto. Se declara, nada más.
  *MEDIDO, 2026-09-06, sobre una captura real de los nueve.*

- **Los CUERPOS que arma T5 varían 38% en tamaño entre operadores — mismo
  mecanismo que la dispersión de arriba, medido en la pieza siguiente del
  pipeline.** Sobre la medición de entrega real (2026-09-14): el cuerpo más
  chico (qwen, que excluye su propia respuesta larga) tiene 78.579
  caracteres antes de las marcas; el más grande (mistral, que excluye su
  propia respuesta corta) tiene 108.116. `(108.116 − 78.579) / 78.579 ≈
  38%`. Es inherente al diseño de exclusión de autoevaluación: quien
  excluye una respuesta larga lee menos: quien excluye una corta, lee más.
  No es un error del armado —de hecho, es la comprobación cruzada que
  valida que la exclusión funciona (ver `docs/BLUEPRINT.md`, "T5")— pero es
  una segunda fuente de asimetría de CARGA DE LECTURA entre operadores,
  distinta de la dispersión de contenido de arriba y con la misma
  implicación: un operador que lee 108.000 caracteres no está en la misma
  posición que uno que lee 78.000. *MEDIDO, 2026-09-14, ver
  `docs/BLUEPRINT.md`, "Objetivo 1, REPETIDO con el panel al frente".*

- **Las tablas de volumen de una corrida de prueba NO comparan
  proveedores entre sí — sólo dimensionan cuánto texto va a manejar la
  Parte 2.** Ejemplo medido el 2026-09-06: claude corrió como "Haiku 4.5"
  (2.549 caracteres) contra gemini como "ProExtendido" (30.287) — el modelo
  más chico de una familia contra uno de los más grandes de otra. Leer esa
  diferencia como "gemini responde mejor" o "más" que claude sería un error
  de interpretación: el modelo elegido en el panel lo decide Juan (o quedó
  de una sesión anterior), no el instrumento. *MEDIDO, 2026-09-06.*

- **Un panel de fuentes COLAPSADO no se distingue de "no hay fuentes".**
  Medido el 2026-09-13: en claude, deepseek, grok y kimi las fuentes citadas
  viven detrás de un chip o botón que, al hacer clic, abre un panel lateral
  — varias de esas interfaces no montan el contenido del panel en el DOM
  hasta ese clic. `fuentesHref` (cuenta `<a href>` reales, subiendo por los
  ancestros del nodo de la respuesta) puede alcanzar el panel una vez
  ABIERTO, pero "Capturar" nunca hace clic — misma regla que rige el
  sondeo—, así que un panel sin abrir da `fuentesHref: 0` indistinguible de
  una respuesta sin fuentes. Si Juan quiere que una captura incluya las
  fuentes, tiene que abrir el panel él mismo ANTES de capturar.
  *MEDIDO, 2026-09-13, confirmado por Juan sobre la app real.*

- **Consecuencia del panel colapsado sobre T1 (extracción de citas):** si el
  panel colapsado es el modo por defecto de la interfaz, la capa de
  extracción de citas no tiene nada que verificar en esos proveedores.
  `Respuesta.html` (el nodo de la respuesta, sin recortes) no contiene ni un
  solo `<a>` de fuente cuando el panel no se abrió — no es que la regla de
  extracción pierda algo que sí está: el contenido no llegó a montarse en el
  DOM. T1 (`apps/desktop/src/main/citas.ts`) extrae CERO `Cita` en gemini,
  claude, grok y qwen mientras el panel siga sin abrirse antes de capturar;
  en chatgpt, mistral, glm, kimi y deepseek —donde el panel no colapsa— T1
  extrajo 23, 7, 6, 17 y 21 citas respectivamente sobre la misma captura.
  *MEDIDO, 2026-09-13, offline contra la captura real ya existente (ver
  `docs/BLUEPRINT.md`, "T1, cerrada").*

- **No se sabe si gemini, claude, grok y qwen usan redirectores en sus
  citas.** T1 verificó por hostname que chatgpt, mistral, glm, kimi y
  deepseek citan URL que resuelven directo al sitio de terceros (nunca a un
  dominio del proveedor que reenvíe a otro lado) — verificación real, no
  supuesta, ver `docs/BLUEPRINT.md`, "T1, cerrada". Para los cuatro con panel
  colapsado no hay ni una `Cita` extraída, así que no hay ningún hostname que
  mirar: la pregunta queda genuinamente SIN COMPROBAR ahí, no se extiende la
  conclusión de los otros cinco por semejanza. *MEDIDO 2026-09-13 para cinco
  de nueve; los otros cuatro son un hueco declarado, no una suposición.*

## Sobre lo que el instrumento no puede ver

- **La anonimización no sobrevive a las fuentes citadas.** Dominios propios
  del proveedor, idioma de las fuentes, estilos de citación pueden delatar
  quién produjo qué. Se declara, no se resuelve. *Observado de paso,
  2026-08-13.* **Parcialmente cerrado en T3 (2026-09-14):** el canal
  MECÁNICO —un parámetro de tracking (`utm_source=chatgpt.com`) o un link a
  la interfaz propia del proveedor (`chatgpt.com/share/…`)— sí se limpia y
  se verifica en tiempo de ejecución (`armarCuerpoConFuentes`,
  `packages/analysis/src/cuerpo-operador.ts`; ver `docs/BLUEPRINT.md`, "T3,
  cerrada"). Lo que sigue SIN resolverse, y no tiene arreglo mecánico
  posible: una fuente legítima del MISMO LINAJE que un proveedor —mistral
  citando `platform.claude.com` sobre cómo escribir prompts para Claude—
  sigue siendo una URL real y correcta; quitarla alteraría el dato
  canónico. Medido: 0 de 74 citas reales necesitó ese tipo de descarte, pero
  el riesgo de que el CONTENIDO de una respuesta (no la URL) revele su
  linaje —"como modelo de Anthropic, yo..."— sigue intacto, cubierto aparte
  por el scrub de `provider-names.ts`, no por esta pieza.

- **Los ocho no buscan sobre el mismo índice.** Parte de la divergencia
  entre respuestas es de corpus y no de razonamiento. El código puede medir
  la superposición de dominios citados entre proveedores; superposición
  baja con divergencia alta sugiere corpus, no desacuerdo. *No medido
  todavía; el mecanismo de medición está pendiente de construir.*

- **El plan de suscripción de cada cuenta no es observable desde la
  interfaz** y afecta la capacidad del modelo (por ejemplo, si tiene
  búsqueda web habilitada). No queda registrado. *Observado de paso,
  2026-08-13.*

- **El proveedor puede cambiar el modelo por defecto sin aviso.** Se
  detecta entre rondas, comparando la etiqueta de modelo registrada; nunca
  antes de la primera ronda en que ocurre. Ver `docs/BLUEPRINT.md` §5/§10
  para el estado medido de la detección de etiqueta por proveedor.

- **kimi no expone `modelLabel` a ningún ancho ni con conversación real.**
  Cuatro corridas de sondeo (dos antes de tener conversación, una a ancho
  variable, una con conversación viva el 2026-08-23), CERO candidatos las
  cuatro veces, con `controlesNivelesArriba: 9` en las cuatro — el árbol del
  compositor de kimi es más profundo que el resto y ninguna vía estructural
  encuentra un selector de etiqueta de modelo. Consecuencia: **en kimi no
  hay detección de deriva de versión del modelo** — el mecanismo que la
  Fase 2 existe para dar no puede operar ahí, no por un defecto del código
  sino porque la interfaz no expone el dato de forma detectable. Tres
  hipótesis agotadas (ver `docs/BLUEPRINT.md`, C0b): no queda una cuarta
  pendiente de probar. *MEDIDA, última vez 2026-08-23, con conversación
  real.*

- **RESUELTO — en kimi, el envío automático necesitaba entrada CONFIABLE,
  no un evento sintético.** El compositor de kimi (`contenteditable` rico)
  ignora la entrada despachada por JS (`isTrusted: false`): tras escribir
  por DOM, el editor se seguía viendo a sí mismo vacío (medido: la clase
  `is-empty` de su contenedor no se quitaba), y por eso ni el Enter
  sintético enviaba ni la limpieza del sondeo lograba borrar. La solución
  —`envioConfiable: true` en la spec de kimi— escribe con
  `webContents.sendInputEvent()`, que inyecta al nivel de Chromium con
  `isTrusted: true`, y sólo entonces despacha el Enter por la misma vía.
  Confirmado por Juan con la app real ("Enviar a todos"): kimi escribe y
  envía solo. El corte medido es el TIPO de compositor
  (`contenteditable` rico vs. `textarea`), no el proveedor — vale para
  cualquier otro que resulte tener el mismo problema.
  *MEDIDA, 2026-08-23, confirmado por Juan sobre la app real.*

- **RESUELTO — kimi necesitaba además el panel AL FRENTE (visible y con
  foco) para que el envío funcione**, no sólo `sendInputEvent`. Con el panel
  al frente, Juan confirmó Enter funcionando "de forma inmediata y
  repetida" (uso manual, 2026-08-25). `difundir()` se corrigió para traer al
  frente, secuencial, a cualquier proveedor con `envioConfiable: true` antes
  de escribirle (`difundirConEnfoque`, `apps/desktop/src/main/index.ts`).
  Juan confirmó con un envío real de "Enviar a todos" que kimi mandó el
  mensaje en la ronda de ocho. kimi queda en el pool de 8 con envío
  automático confirmado. *MEDIDA, 2026-08-25, confirmado por Juan sobre la
  app real, en difusión automática de los ocho.*

- **SUPERADO — kimi ya NO depende de `webContents.sendInputEvent()`.** Las
  dos entradas anteriores describen la solución que hizo falta hasta acá; la
  ronda de camino de entrada portable (2026-09-13) probó la hipótesis de que
  el problema real nunca fue `isTrusted`, sino que el texto insertado por DOM
  no llegaba al MODELO INTERNO del editor. Escribiendo con
  `document.execCommand('insertText')` —que dispara `beforeinput`/`input`
  NATIVOS, la misma vía que usa el navegador al pegar— y enviando con el
  mismo Enter sintético de siempre (`dispatchEvent`, `isTrusted: false`),
  UN envío real de verificación en kimi dejó el mensaje en el hilo IDÉNTICO
  carácter a carácter al marcador escrito. `envioConfiable: true` se retiró
  de la spec de kimi (`packages/providers/src/specs.json`): kimi pasa por el
  mismo camino compartido (`run()`, `writePrompt` con `execCommand`) que los
  otros ocho, sin ninguna excepción de proveedor.
  **Consecuencia para portabilidad**: el transporte de escritura y envío deja
  de depender de una primitiva exclusiva de Electron/Chromium
  (`sendInputEvent` no existe en WKWebView, el único motor permitido en
  iOS). `sendInputEvent`/`difundirConfiable` quedan en el código como
  respaldo declarado, sin usarse hoy en ningún proveedor: se reactivarían
  sólo si un proveedor futuro, medido, lo exige.
  *MEDIDO, 2026-09-13: un envío real en kimi (vía JS, sin sendInputEvent) y
  uno en qwen, los dos con coincidencia exacta del mensaje en el hilo,
  primer intento en los dos casos.*

- **qwen: el botón de envío y el de chat de voz son controles DISTINTOS**,
  no el mismo elemento cambiando de rol según el estado del compositor —
  corregido tras medir con conversación real (2026-08-23): el botón de
  envío existe en reposo, sólo que deshabilitado. El riesgo que se había
  anotado ("un clic con el compositor vacío abre el chat de voz") no aplica
  tal como se había descrito, aunque sigue siendo buena práctica no hacer
  clic con el compositor vacío. Enter manual confirmado por Juan; el envío
  real de la spec usa clic sobre el botón (ya con texto presente), no
  Enter — a diferencia de kimi. *MEDIDA, 2026-08-23.*

- **Un cuerpo grande pegado con `execCommand('insertText')` puede COLGAR el
  panel horas, sin ningún error, mientras la sesión sigue intacta.** Medido
  el 2026-09-14, midiendo si el cuerpo real de un operador (~100.000
  caracteres, T5) entra pegado: la primera corrida —sin resguardo externo—
  se quedó horas sin producir ninguna línea de informe; forzar el cierre
  por la vía normal de la app (que vuelca sesión) confirmó que las nueve
  particiones seguían con sus cookies intactas — no fue una sesión perdida,
  fue un panel (casi con certeza un editor rico: ProseMirror, Lexical, un
  `contenteditable`) que nunca volvió a responder a `executeJavaScript`
  tras recibir el `insertText` completo, probablemente reprocesando el DOM
  de forma bloqueante en el hilo del renderer. Ningún techo INTERNO a la
  medición (un `setTimeout` dentro de la función que corre en ese mismo
  renderer) protege contra esto: si el hilo está bloqueado, ese `setTimeout`
  tampoco corre. Sólo un techo EXTERNO —`Promise.race` desde el proceso
  principal, que vive en su propio hilo— evita que un panel colgado
  bloquee indefinidamente a los demás. **Consecuencia para cualquier
  diseño futuro que pegue un cuerpo grande de una sola vez**: necesita ese
  mismo resguardo externo, o un operador con editor lento puede colgar la
  sesión de Juan sin ningún aviso ni error visible.
  *MEDIDO, 2026-09-14, ver `docs/BLUEPRINT.md`, "Medición de entrega del
  cuerpo".*

- **SUPERADA — la entrada de datos de abajo describía un fallo de
  VISIBILIDAD, no de los proveedores.** Medido primero escribiendo los 8
  cuerpos EN PARALELO (7 de 8 fuera del área visible por el diseño de fila
  horizontal con paginado): gemini y mistral daban timeout siempre, grok
  era inconsistente, y chatgpt/claude/kimi perdían una cantidad fija de
  caracteres en el medio del texto. Repetido SECUENCIAL, con cada panel
  llevado al FRENTE antes de escribir (hipótesis de Juan: un `insertText`
  de ~100.000 caracteres fuerza un re-layout masivo, justo lo que Chromium
  degrada en una página oculta) — **los 8 de 8 entran pegados, en las 3 de
  3 corridas**, con el 100% de las marcas de integridad intercaladas
  presentes en todos los casos. La brecha de caracteres en seis de los
  ocho (todos menos glm y qwen) sigue midiéndose, pero con las marcas
  intactas queda confirmado que es una pérdida DISTRIBUIDA (normalización
  del editor), nunca un truncado — un bloque contiguo perdido habría roto
  al menos una marca. **Consecuencia**: la Parte 2 se diseña SECUENCIAL,
  con el panel al frente, para los ocho por igual — no hace falta una vía
  de entrega distinta por proveedor, y el adjunto de archivo (Objetivo 2)
  queda cerrado como innecesario mientras el pegado secuencial siga
  midiendo 8/8. *MEDIDO, 2026-09-14, tres corridas, panel al frente, ver
  `docs/BLUEPRINT.md`, "Objetivo 1, REPETIDO con el panel al frente".*

  <details><summary>Registro histórico — la medición EN PARALELO que quedó superada</summary>

  De los 8 del pool, sólo 2 (glm, qwen) aceptaban un cuerpo de ~100.000
  caracteres pegado y EXACTO. Tres (chatgpt, claude, kimi) lo aceptaban
  pero perdían una cantidad FIJA de caracteres en el medio del texto —165,
  739 y 734 respectivamente, la misma cifra en las tres corridas de cada
  uno— sin que la marca canaria (al final del cuerpo, versión anterior de
  T4) lo detectara, porque la canaria sobrevivía intacta: la pérdida no
  era un truncado por el final. Dos (gemini, mistral) directamente no
  aceptaban el pegado dentro de 90 s en ninguna de tres corridas. Uno
  (grok) era inconsistente: una corrida sin responder, una que escribió
  CERO caracteres sin reportar error, una casi completa. *MEDIDO,
  2026-09-14, tres corridas, EN PARALELO — condición ahora identificada
  como la causa del fallo, no un dato sobre los proveedores.*

  </details>

- **deepseek entró a `INVESTIGADORES` (2026-08-23, decisión de Juan) sin
  confirmar todavía un envío automático real.** Su spec se derivó de la
  misma ronda de sondeo que los demás (composer, submit y
  `assistantMessage` medidos con conversación real), pero a diferencia de
  grok/mistral/qwen/kimi no se gastó un envío de verificación sobre esta
  cuenta — se promovió confiando en que su compositor es un `textarea`
  (misma categoría que qwen, que sí funciona), no un `contenteditable`
  rico como kimi. **No hay `modelLabel`** para deepseek (cero candidatos en
  tres corridas de sondeo): mismo hueco que kimi, sin detección de deriva
  de versión posible ahí. *Spec: MEDIDA, 2026-08-23. Envío automático:
  PENDIENTE de la primera ronda real que lo incluya.*

- chatgpt convierte unos 200 espacios del prompt de operación en espacio
  duro (U+00A0). Medido el 2026-09-24 con los tres métodos de escritura. No
  se corrigió: no afecta el parseo. No está medido si chatgpt envía el
  espacio duro o un espacio normal, porque medirlo exige enviar un mensaje.

## Sobre qué es y qué no es

- Es un instrumento para **comparar** respuestas, no para determinar cuál
  es correcta.
- La verificación mecánica comprueba que una fuente citada **existe** y
  **coincide** (estado HTTP, DOI, título contra metadatos). **No** comprueba
  que la fuente **sostenga** la afirmación para la que se citó.
- El informe final lo produce un modelo (el noveno, `deepseek`). Es una
  afirmación con procedencia — trazable celda a celda hasta la matriz —, no
  un resultado verificado.
- Una afirmación sin fuentes se marca "sin fuentes" y no se verifica. Es un
  hallazgo, no un error silencioso.
