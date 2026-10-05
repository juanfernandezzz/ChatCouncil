# Fase 6 — Reconstrucción de ChatCouncil en Unity: documento de arranque

Este documento se lee ENTERO antes de escribir una sola línea de Fase 6.
No es una tarea: es el contrato de la fase. Cada sesión de Code en Fase 6
empieza releyendo esto.

Idioma: todo el texto para Juan en español latino neutral ("tú", sin voseo).

## 1. Qué es la Fase 6 y qué NO es

ChatCouncil se reconstruye DESDE CERO en Unity Engine, como APLICACIÓN (no
juego), multiplataforma y multidispositivo. Builds simultáneos para PC y
Android; iOS más adelante. Decisión de Juan, no negociable.

El objetivo no es copiar el ChatCouncil de Electron. Es rehacerlo con:
- código mínimo, limpio y rápido (filosofía Ponytail: la solución más simple
  que funciona; stdlib antes que dependencias; una línea antes que cincuenta),
- interfaz responsiva y liviana,
- y un flujo de botones que le diga al usuario, en cada etapa, qué tiene que
  hacer. El diseño y la accesibilidad del ChatCouncil actual son inadecuados y
  NO se reproducen.

Se construyen DOS versiones para comparar (decisión previa de Juan):
- Versión A: la construye Code local, con todo lo que este documento entrega.
- Versión B: una conversación nueva, desde cero, como grupo de control.
Después se comparan y se toma lo mejor de ambas. Este documento es para la
Versión A.

## 2. LA PREGUNTA QUE DECIDE TODO — se responde ANTES de construir

Unity no trae navegador embebido. ChatCouncil ENTERO depende de leer y escribir
en sesiones de navegador reales (los 9 proveedores logueados con las cuentas de
Juan, modelo BYOA: trae tu propia cuenta, nunca claves de API).

PRIMER PASO DE LA FASE 6, antes de cualquier otra cosa:
Investigar si Unity puede embeber un navegador real (Chromium vía CEF, o un
WebView por plataforma) que permita, en PC Y en Android:
  a) cargar 9 sesiones web con login persistente, aisladas entre sí;
  b) leer el DOM de cada una con selectores;
  c) inyectar texto en el compositor de cada una;
  d) que ese texto llegue como entrada confiable (en Electron esto fue
     sendInputEvent con isTrusted=true; hay que hallar el equivalente).

Resultado posible y su consecuencia:
- Si Unity puede embeber navegador con esas cuatro capacidades, la
  reconstrucción procede y el conocimiento de transporte de la sección 4 se
  reusa, reescrito contra la API de ese navegador.
- Si NO puede, la herramienta no existe en Unity tal como está pensada. PARAR
  y escalar a Juan: es una decisión de arquitectura, no un problema a rodear.

No escribas nada de la app hasta tener esta respuesta, medida, no supuesta.

## 3. QUÉ SE TRASPASA INTACTO (el "motor" — conocimiento, no código Electron)

Esto es lo difícil ya resuelto. Se copia tal cual o se reescribe en C#
conservando su lógica exacta. NO se re-descubre.

### 3.1 Datos y conocimiento puro — portables sin cambios
- packages/providers/src/specs.json: los selectores medidos de los 9
  proveedores (chatgpt, gemini, claude, grok, mistral, glm, kimi, qwen,
  deepseek). Dónde vive la respuesta, el compositor, el control de envío, las
  fuentes, el modelLabel, el canvas, el bloque de pensamiento, los exclude.
  Esto es ORO: cada selector costó una ronda de medición. Se copia entero.
- Los cuatro prompts literales, que son datos de investigación y NO se tocan:
  prompt-operacion.ts, prompt-integrador.ts, prompt-verificador.ts,
  prompt-redactor.ts. Se copian palabra por palabra.

### 3.2 Lógica de dominio y análisis — se reescribe en C#, misma estructura
De packages/domain/src/index.ts: el modelo de datos (los hechos append-only:
Respuesta, SalidaOperador, HallazgoHecho, InformeIntegrador, SalidaVerificador,
Sello, etc.). La estructura se conserva; cambia el lenguaje.

De packages/analysis/src/, toda la lógica pura (ninguna toca Electron ni red):
- anonymize.ts — anonimización y barajado con semilla
- cuerpo-operador.ts — armado de cuerpos con exclusión de autoevaluación
- parsear-hallazgos.ts, parsear-referencias-integrador.ts,
  parsear-verificacion.ts — los parseos, con su tolerancia a prosa y variación
- armar-tabla-hallazgos.ts, informe-final.ts, informe-respuesta.ts —
  armado de informes
- verificar-fuentes.ts — verificador puro sobre un puerto HTTP inyectado
- nombre-proveedor.ts / provider-names.ts — grafías de marca
- texto-de-html.ts, titulo-informe.ts, redaccion.ts
- build-analyst-prompt.ts y los prompt-*.ts — armado de prompts

Estas piezas están probadas con gates. Al reescribir en C#, se copian sus
algoritmos y sus casos de prueba, no se reinventan.

### 3.3 Las reglas del método — portables como especificación
- Pool 7-1-1: 7 investigadores + 1 verificador (GLM por defecto) + 1 integrador
  (deepseek por defecto). Verificador e integrador elegibles, fuera del pool,
  distintos entre sí.
- Flujo: pregunta, 7 investigan, 7 operan (cada uno sin su propia respuesta,
  round-robin), integrador sintetiza, verificador cruza fuentes con búsqueda,
  redactor responde, informe final.
- Categorías de hallazgo: CONVERGENCIA, DIVERGENCIA, TENSION, SINGULARIDAD,
  AUSENCIA. Ejes: HECHOS, FUENTES, CONCLUSIONES. Limitaciones: CORPUS,
  AMBIGUEDAD, TAREA, OTRA.
- Verificador: correspondencia (CONFIRMA/CONTRADICE/NO_ENCONTRADA) + tipo de
  fuente (OFICIAL/PRIMARIA/ACADEMICA/SECUNDARIA), campos separados. El
  verificador describe el tipo; no juzga si basta.
- Registro append-only: el dato crudo nunca se reescribe; todo lo demás se
  deriva de él. Es la regla del dato canónico.
- Marcas de integridad intercaladas contra truncado. Semilla por ronda para
  reproducir el barajado. Sello persistido para desanonimizar al final.

## 4. QUÉ SE BORRA Y SE REESCRIBE DESDE CERO — no reusar nada, ni su estructura

Todo el packages/ui y la capa Electron: ventanas, paneles, webContents,
executeJavaScript, WebFrameMain, el sondeo de subframes, la paginación de
paneles, los botones, el menú, la ventana de progreso, las specs de escritura
por método (insertText/pegado/lineaParrafo), sendInputEvent.

Esto no se porta aunque esté en TypeScript: llama a APIs de Electron que en
Unity no existen, y Unity usa C#, no TypeScript, como lenguaje de la app.

Lo que SÍ sobrevive de aquí es el CONOCIMIENTO, no el código:
- que los paneles ocultos se degradan y hay que mantenerlos "al frente"
  (visibilidad);
- que la entrada sintética necesita llegar como confiable (isTrusted);
- que los editores ricos (kimi) pierden saltos de línea y necesitan pegado por
  evento, no inserción carácter a carácter;
- que algunos proveedores responden en canvas (mistral, chatgpt) y hay que leer
  ese nodo, no la burbuja;
- que los modelos de razonamiento (deepseek, glm) muestran un bloque de
  pensamiento que hay que excluir;
- que el límite del compositor obliga a adjuntar archivo cuando el cuerpo es
  grande;
- que abrir/cerrar sesiones en sucesión rápida corrompe la partición.
Todo esto está documentado en docs/LIMITACIONES.md y en docs/BLUEPRINT.md.
Se lee como especificación de qué problemas ya están resueltos, para no
tropezar de nuevo. El código que los resolvió NO se copia: se reimplementa
contra la API del navegador que Unity termine usando.

## 5. EL FLUJO DE TRABAJO DE LA FASE 6 — qué skill en cada paso

Cada sesión local de Code sigue este orden. Las skills viven en el Claude Code
local de Juan; se invocan según corresponda.

1. GRILLING (mattpocock grilling / grill-me): antes de escribir nada en una
   etapa, Code interroga a Juan sobre el plan de esa etapa para sacar los
   supuestos flojos. Nada se construye sobre un plan sin grillar.

2. SPEC + PLAN (mezcla): la especificación rigurosa de la etapa con el estilo
   spec de Mattpocock; el partido en tareas verificables con
   planning-and-task-breakdown / plan de Agent skills. Se usa la de cada una
   donde sea más eficiente: spec para el "qué y por qué", plan para el "en qué
   orden y cómo se verifica cada paso".

3. CONSTRUIR EL MOTOR (Ponytail + Typescript LSP + Karpathy guidelines):
   traspasar e implementar la lógica universal de la sección 3. Ponytail fuerza
   el código mínimo; el LSP da análisis en vivo; Karpathy reduce los errores
   típicos de LLM al codear. Código limpio, sin dependencias que no hagan falta.

4. CONSTRUIR UNITY (plugin Unity de Anthropic y sus sub-skills): la app, el
   build multiplataforma simultáneo PC + Android, input, rendimiento. Aquí vive
   la respuesta a la pregunta de la sección 2.

5. DISEÑO DE INTERFAZ (Impeccable + make-interfaces-feel-better de ECC): el
   flujo claro, que el usuario sepa qué hacer en cada etapa de la investigación
   y la integración. No es decoración: es claridad de flujo, jerarquía, estados
   de interacción, spacing. (Taste skill queda disponible para dirección
   estética puntual, pero la prioridad es que se ENTIENDA, no que impresione.)

6. PROBAR Y REVISAR (TDD de Superpowers + code-review de Agent skills o
   Mattpocock + Code simplifier): cada pieza se prueba y se revisa antes de
   darla por hecha. verification-before-completion: nunca "listo" sin prueba.

7. HANDOFF (mattpocock handoff): cuando una sesión se llena, se compacta el
   contexto para que la siguiente continúe sin perder el hilo.

## 6. REGLAS DURAS QUE SOBREVIVEN DE TODO EL PROYECTO

- BYOA siempre. Nunca claves de API, nunca credenciales, cookies ni tokens de
  Juan: ni leerlos, ni copiarlos, ni registrarlos.
- La herramienta solo lee las ventanas que Juan tiene a la vista y actúa cuando
  Juan lo pide. No automatiza el envío: Juan revisa y envía a mano cada panel.
- Números medidos, nunca supuestos. Compilar no es embarcar.
- El dato de investigación (el registro) es sagrado: append-only, nunca se
  reescribe.
- Las pruebas de la app real las hace Juan en su máquina: necesitan sus cuentas,
  que no existen en la nube ni en ningún contenedor.

## 7. PRIMER MOVIMIENTO CONCRETO

No escribas app. La primera sesión de Fase 6 hace solo la sección 2: investiga,
con evidencia, si Unity puede embeber un navegador con las cuatro capacidades.
Entrega un informe con la respuesta medida y una recomendación. Juan decide con
eso si la reconstrucción procede, cambia de forma, o se repiensa.
