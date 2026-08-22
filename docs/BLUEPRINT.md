# ChatCouncil — BLUEPRINT v3 (aplicación de escritorio)

> **Contrato de agentes: `docs/AGENTES.md`.** Ese archivo tiene las reglas duras
> —BYOA, sólo Haiku en pruebas, nada de credenciales, gates, `git add` por ruta,
> cuándo se escala— y se lee ANTES que este documento. Vive en el repositorio a
> propósito: se trabaja desde varias superficies (Chat, Code, Cowork, Dispatch)
> y ninguna comparte memoria ni instrucciones con las otras. Un contrato en la
> configuración de una herramienta se pierde al cambiar de herramienta.

> Reconstrucción desde cero decidida por Juan el 2026-07-29. El BLUEPRINT
> anterior se conserva como `BLUEPRINT.v2.md`: su valor no es el plan —que
> queda superado— sino el **registro de lo aprendido**, que se importa a
> este documento en §2 y §7.

---

## 0. Por qué se reconstruye

La v2 nació como aplicación web con una extensión de navegador que actuaba
de puente. Ese concepto quedó superado por el producto que se quiere hoy, y
la medición del 2026-07-29 lo demostró de forma concluyente:

**Una webapp NO puede mostrar las interfaces de los proveedores con la
sesión puesta.** Medido, no supuesto, sobre los cuatro orígenes:

| Origen | Bloqueo de framing | Con las cabeceras quitadas |
|---|---|---|
| chatgpt.com | `X-Frame-Options: SAMEORIGIN` + CSP `frame-ancestors` | carga, pero **deslogueado** |
| gemini.google.com | `X-Frame-Options: DENY` | carga **con sesión** |
| claude.ai | CSP `frame-ancestors 'self'` | **nunca renderiza**: se cuelga en el splash |
| chat.z.ai | `X-Frame-Options: SAMEORIGIN` | carga, pero **deslogueado** |

Las cabeceras se pueden quitar. Lo que no se puede arreglar desde afuera:

1. **Las cookies de sesión.** El `site-for-cookies` de un iframe se calcula
   contra el documento de NIVEL SUPERIOR —la app— y no contra el proveedor.
   Una cookie de autenticación con `SameSite=Lax` o `Strict` (el default
   sensato) no viaja. Gemini sobrevive sólo porque Google usa
   `SameSite=None` para sus propios flujos de SSO. Es una propiedad de las
   cookies ajenas: no la controlamos.
2. **La detección de embebido por JavaScript.** claude.ai se cuelga dentro
   de un iframe aunque las cabeceras ya no estén.

**Una vista embebida de aplicación de escritorio no es un iframe:** es un
contexto de navegación con su propio documento de nivel superior. Las
cookies se calculan contra el proveedor, `window.top === window.self`, y no
hay cabecera de framing que aplicar. Los tres problemas desaparecen por
construcción, no por parche.

---

## 1. Qué es ChatCouncil

Herramienta **personal** de investigación en ciencias sociales (cuantitativa,
cualitativa y mixta). No es comercial, no se distribuye, y el repositorio
pasará a privado. Su primer y principal usuario es Juan.

**Los LLM son INSTRUMENTOS, no sujetos de estudio.** No se investiga a los
modelos: se los usa para investigar. De ahí que el fluff conversacional sea
irrelevante incluso como dato, y que el objetivo no sea consenso sino
**matiz**: complementariedad, validación cruzada de los puntos salientes, y
alternativas que un solo modelo no daría.

### Arquitectura vigente: DOS partes, no tres (decidida por Juan, 2026-08-13)

> **Esto REEMPLAZA la tabla de "tres roles" que seguía abajo hasta el
> 2026-08-13, y reemplaza también lo que las Fases 3 y 4 describían.** El
> pipeline de analistas —Qwen extrae, Kimi adjudica— **queda descartado**.
> Motivo: extraer, verificar y adjudicar son ETAPAS de un pipeline, no roles
> diferenciados, y la única diferencia real entre los dos "analistas" era el
> turno en que hablaban. Separar por turno no es separar por rol.

Ahora hay **un pool de 8**, en este orden fijo, y **cada modelo cumple los
dos roles** (investiga y opera):

    1 chatgpt · 2 gemini · 3 claude · 4 grok · 5 mistral · 6 glm · 7 kimi · 8 qwen

Y un **noveno, fuera del pool**: `deepseek`, que sólo informa.

**Ese orden es orden de PANEL y nada más.** Nunca es el orden en que el
cuerpo llega a quien opera: eso lo decide el barajado con la semilla de la
ronda (misma garantía que ya regía en la v3 original — ver §2). Si el orden
del pool se filtrara al cuerpo que reciben los operadores, el barajado
quedaría anulado sin que nada fallara en rojo; es un requisito para
`guard:sellado` o el gate que lo suceda, no una nota de intención.

**Parte 1 — investigación.** Los 8 reciben la MISMA pregunta, con búsqueda
web activada. No investigación profunda: búsqueda web y nada más.

**Entre partes, lo hace el código:** extrae las respuestas y las fuentes
citadas, verifica lo mecánico, anonimiza y baraja con la semilla de la
ronda.

**Parte 2 — operación.** Los MISMOS 8 operan sobre ese cuerpo. Diseño
round-robin con exclusión de autoevaluación: cada uno recibe las 7
respuestas que NO son suyas, nadie evalúa su propio trabajo. Produce una
matriz operador × respuesta. (Fundamento metodológico y limitaciones: ver
`docs/LIMITACIONES.md`.)

**Noveno — informe.** `deepseek` recibe la matriz y produce el informe
final: resumen de hallazgos e interpretación de convergencia y divergencia,
siempre en relación con la pregunta original. NO busca. NO agrega
contenido. NO adjudica quién tiene razón. Trabaja ciego, con etiquetas
barajadas; el código desanonimiza después con el sello.

**Regla dura del noveno:** cada afirmación de su informe debe referenciar
una CELDA de la matriz. Lo que no está en la matriz no se puede afirmar.
Puede decir que la matriz no alcanza para responder algo — eso también es
hallazgo.

**Los tres prompts y el hilo.** Se le mandan tres textos a un modelo, y hay
UNA pregunta que los atraviesa:

- **La pregunta** — la escribe Juan cada vez. Es su pregunta de
  investigación.
- **Prompt 1, investigación**: la pregunta más instrucciones de método.
  IDÉNTICO Y LITERAL para los ocho. Sin ajustes por proveedor.
- **Prompt 2, operación**: la herramienta elegida de la biblioteca. Cada
  término definido DENTRO del prompt (si "convergencia" no está definida,
  la define cada modelo a su manera y se mide la ambigüedad del protocolo
  en vez de la diferencia entre modelos).
- **Prompt 3, informe**: instrucciones para leer la matriz.

La pregunta viaja por los tres. Ningún prompt pide postura hostil ni
adversarial: condiciona la respuesta y produce crítica performativa.

**Declaración de salida a la red.** Esta arquitectura hace que la
aplicación salga a la red hacia terceros por primera vez: la verificación
mecánica de fuentes citadas. Sale SÓLO hacia las URL que el investigador
citó, nunca a buscar respaldo que el investigador no dio. Una respuesta sin
fuentes se marca "sin fuentes" y no se verifica — eso es un hallazgo en sí
mismo, no un error.

**Ya decidido, no se rediscute:**
- El fin de cada respuesta lo declara Juan marcando un checklist por panel.
  El botón que pasa de la parte 1 a la parte 2 se llama "Consolidar
  respuestas" y sólo se habilita con los ocho marcados.
- `Procedencia.finDe` gana el valor `"declarado-por-usuario"`, sin
  migración.
- El informe final lo arma el CÓDIGO juntando piezas; el noveno aporta la
  lectura semántica, no el ensamblado.

### Los tres roles (conjuntos DISJUNTOS) — histórico, SUPERSEDIDO arriba

| Rol | Modelos | Qué hace |
|---|---|---|
| **Investigadores** | Claude, Gemini, ChatGPT, GLM | Reciben la misma pregunta en paralelo, cada uno en SU interfaz real, con sus capacidades nativas activables (razonamiento, búsqueda). Diálogo multi-turno: cada uno mantiene su conversación. |
| **Analistas** | Qwen (extracción), Kimi (análisis comparativo) | Dos llamadas sobre el turno actual que producen un output unificado. **DESCARTADO, ver arriba.** |
| **Operador** | DeepSeek | Ejecuta las herramientas que el usuario escribe sobre ese output. **DeepSeek pasa a ser el noveno, sólo informe — ver arriba.** |

Perplexity y Grok quedan como investigadores futuros (cuotas gratuitas
demasiado ajustadas). **El número de investigadores no se codifica en
ningún lado**: es configuración.

### La decisión que define la interfaz

Las **interfaces de los proveedores SON los paneles**. No se espejan: se
muestran. ChatCouncil no reimplementa ni copia sus respuestas para
mostrarlas — aporta el compositor único, la disposición, y la capa de
análisis. La extracción existe **sólo para analizar**, una lectura por turno
y a pedido, nunca para pintar la pantalla.

Al enviar aparece una confirmación —"¿Activaste las capacidades nativas de
cada proveedor?"— con opción de no volver a preguntar en la sesión, y recién
después se difunde a los cuatro.

---

## 2. Decisiones que se IMPORTAN de la v2

Se conservan porque están fundadas y verificadas, no por inercia.

### Metodológicas
- **El original es el dato canónico y nunca se reemplaza.** Cualquier
  procesamiento produce vistas derivadas.
- **Evaluación ciega**: el evaluador nunca ve qué proveedor produjo qué. En
  v2 esto se garantizaba por topología de imports, verificado en CI. Se
  reconstruye con la misma garantía estructural, no por convención.
- **Barajado con semilla** del orden de las respuestas antes del análisis, y
  la semilla se persiste para que la ronda sea reproducible. Sin esto la
  posición filtra la identidad del proveedor.
- **La convergencia NO es validación.** Modelos que comparten linaje de
  entrenamiento pueden coincidir por compartir el sesgo. La herramienta de
  convergencia y divergencia debe decirlo.
- **Divergencia como producto**, no como ruido a resolver.
- **Los conteos se calculan en código**, no los produce un modelo. Un
  "análisis cuantitativo" pedido a un LLM son números impresionistas con
  apariencia de dato.
- **Disjunción de roles verificada por gate**, no por convención.
- **Procedencia persistida por turno**: etiqueta de modelo que mostraba la
  UI, continuidad de hilo, y lo que haga falta para detectar **deriva de
  versión** — bajo cuentas propias el proveedor puede cambiar el modelo por
  debajo sin avisar, y eso sólo es detectable si queda escrito junto a la
  respuesta.
- **Herramientas editables con defaults inmutables**: los de fábrica son la
  línea base; el usuario agrega, modifica y elimina los suyos.

### De producto
- **BYOA es el único camino que importa.** Se usan las cuentas del usuario,
  en las interfaces nativas. No se diseña alrededor de claves de API.
- **Nunca se simula un resultado.** Si algo falla, se reporta. Un panel
  vacío es preferible a un texto inventado.
- **El agente nunca resuelve challenges ni captchas**, nunca ejecuta cambios
  irreversibles de cuenta, y nunca captura cookies, tokens, headers de
  autenticación ni datos personales.
- **Pruebas con Claude: sólo Haiku.** Es una restricción del **arnés de
  verificación**, no del producto: en uso normal el modelo lo elige Juan en el
  panel nativo, que es justamente el motivo de mostrar la interfaz del
  proveedor en vez de espejarla. Por eso la comprobación vive en el
  test-runner y **nunca** en la spec del proveedor ni en el camino de
  difusión.

### Estéticas (Fase final, no se adelanta)
Profesional, sobria, académico-investigativa. **No** blanco como color
principal; **no** estética de SaaS genérico. Paleta con carácter de
biblioteca o laboratorio de investigación, en tono no claro (madera, papel
envejecido, ceniza, como concepto). Tipografía de carácter científico, seria
pero bella, menos "digital" que Inter o JetBrains Mono. Alguna textura o
efecto generado por código para quitar planitud. Media pack rehecho entero,
con ícono simplista conceptualizado sobre la idea del consejo como
institución antigua — una mesa de deliberación. Va al final: función
primero.

### Conocimiento que no se pierde
Los selectores ya derivados del navegador real para **ChatGPT** y **GLM**
siguen siendo válidos: son conocimiento del DOM de los proveedores, no del
armazón que los usaba.

---

## 3. Elección de tecnología, con la evidencia

**Electron.** La decisión se apoya en una restricción del producto que
descarta la alternativa obvia.

**Por qué no Tauri**, que sería el candidato natural por su promesa
multiplataforma: su soporte de **múltiples vistas web en una ventana es
sólo de escritorio** y sigue detrás de una bandera inestable, y el
**aislamiento de sesión entre vistas es una solicitud abierta**, no una
capacidad resuelta. Justo las dos cosas de las que este producto depende por
completo. Confianza alta: verificado en la documentación y en los issues del
proyecto.

**Sobre la compatibilidad futura con Linux, Android e iOS.** El objetivo son
**tablets, no teléfonos** (aclarado por Juan el 2026-07-29). Eso cambia el
análisis: en una tablet de 11 a 13 pulgadas el producto **sí tiene sentido**
—dos o cuatro vistas de proveedor caben—, así que el tamaño de pantalla NO
es el límite.

El límite es otro y es de herramientas: **hoy ningún framework
multiplataforma entrega varias vistas web AISLADAS en tablet.** Electron no
tiene móvil, y la multi-vista de Tauri es sólo de escritorio. A nivel
nativo sí es posible —iOS permite varias `WKWebView` con su propio
`WKWebsiteDataStore`, y Android su equivalente— pero eso significa escribir
el armazón de tablet por separado, no exportar el de escritorio.

Lo que sí se puede honrar, y es lo que se hace:

> **La lógica portable se mantiene separada del armazón.** El dominio
> —contratos, adaptadores, anonimización, análisis, modelo de datos— vive en
> paquetes sin dependencias de Electron ni del sistema operativo, y esa
> separación se verifica por gate.

Con eso, una versión para tablet es un **armazón nuevo sobre el mismo
dominio**, no una reescritura: se implementa la capa de vistas contra las
APIs nativas de esa plataforma y se reutiliza todo lo demás. Es la diferencia
entre portar el 20% y rehacer el 100%.

Lo que NO se hace es distorsionar hoy la arquitectura para un export
automático que ninguna herramienta actual puede dar. Linux queda disponible
desde el primer día por ser el mismo armazón; se construyen builds de
Windows únicamente.

---

## 4. Estructura

```
chatcouncil/
├─ packages/            ← PORTABLE: sin Electron, sin DOM, sin SO
│  ├─ domain/           contratos, modelo de datos, tipos de rol
│  ├─ providers/        specs declarativas de cada proveedor (selectores)
│  ├─ analysis/         anonimización, barajado, extracción, comparación
│  └─ ui/              tokens de diseño y primitivas
├─ apps/
│  └─ desktop/
│     ├─ main/          proceso principal: vistas, particiones de sesión
│     ├─ preload/       inyección y extracción dentro de cada vista
│     └─ renderer/      la interfaz de ChatCouncil
└─ docs/BLUEPRINT.md
```

**Regla de dependencia, verificada por gate:** `packages/` no puede importar
nada de `apps/`. Es lo que mantiene viva la portabilidad de §3 y lo que
impide que el armazón se filtre al dominio.

**Una partición de sesión por proveedor.** Cada uno con su almacén de
cookies aislado, lo que además resuelve algo que en un mismo perfil de
navegador era imposible: convivir cuentas distintas por proveedor — la
burner para ChatGPT, las pagas para Claude y Gemini.

---

## 5. Roadmap

### Fase 0 — Prueba de viabilidad ✅ (cerrada 2026-07-31 — ver §10)
**Un solo proveedor**, antes de portar nada. Tres cosas y sólo tres:
1. La sesión persiste entre reinicios de la app.
2. Se puede inyectar el prompt en la vista embebida.
3. Se puede leer la respuesta.

Si algo de esto falla, se sabe con un día de trabajo y no con tres semanas.
**Nada se construye encima hasta que estas tres estén verificadas en la
máquina de Juan.**

**Proveedor elegido: GLM.** Por dos motivos concretos: sus selectores ya
están derivados y validados, así que un fallo será atribuible al armazón y
no al selector; y es una cuenta gratuita, así que repetir el login mientras
se ajusta la persistencia no toca ninguna cuenta paga.

**Decisiones del armazón, con su fundamento:**
- **`WebContentsView`**, no la etiqueta `<webview>` que usaba GodMode ni
  `BrowserView`: es la API vigente para componer varias vistas en una
  ventana.
- **`session.fromPartition("persist:glm")`.** El prefijo `persist:` ES la
  prueba 1: sin él la partición vive en memoria y hay que loguearse en cada
  arranque. Una partición POR PROVEEDOR además permite convivir cuentas
  distintas sin que se pisen — algo imposible en un mismo perfil de
  navegador.
- **Dos preloads en CommonJS**, uno por vista. Los preloads con sandbox no
  admiten ESM; `electron-vite` resuelve ese detalle, que es de los fáciles
  de equivocar.
- **La spec viaja como ARGUMENTO** en cada llamada, no como un global
  inyectado en la página: el preload no depende de que alguien la haya
  sembrado antes.
- **Lo que este código NO puede verificar desde el entorno de Claude:** que
  la app arranque. Electron necesita una pantalla. Lo verificable acá fue el
  typecheck y la estructura; lo demás es de la máquina de Juan, y así se
  declara en vez de darlo por bueno.

### Fase 1 — Armazón y los investigadores ✅ (cerrada 2026-07-31 — ver §10)

Ventana única con las vistas dispuestas en grilla, compositor con la
confirmación previa, difusión a todos, particiones de sesión por proveedor,
y el diálogo multi-turno.

**Nada se codifica por cantidad.** La grilla, la difusión y el estado se
derivan de una sola lista de investigadores. Sumar uno es agregarlo ahí y
nada más — el requisito que la v2 escribió y violó tres veces. El typecheck
lo hace cumplir: un id que no esté en `specs.json` no compila.

**El multi-turno sale gratis y conviene entender por qué:** cada vista
conserva su página, así que escribir de nuevo en el compositor continúa la
conversación del proveedor. Es la misma lección de la v2 —"la continuidad de
hilo ES la persistencia de la ventana"— pero acá es directa, sin ventanas
que orquestar ni señales que reportar.

**La difusión usa `allSettled`:** el fallo de un proveedor no puede tumbar
la ronda. El que falla se reporta como fallo y los demás siguen.

#### Los tres modos scriptables

Las herramientas de navegador del agente hablan con Chrome, no con una app de
Electron: no hay forma de que "haga clic" en esta ventana. La salida no fue
delegar el trabajo en una persona sino **volver scriptable la app**. Los
modos se activan por ARGUMENTO de línea de comandos, no por variable de
entorno: `CC_TEST=1 electron ...` es sintaxis de shell POSIX y **no funciona
en el `cmd.exe` de Windows**, que es donde corre esto. La variable de entorno
sigue aceptándose como alternativa.

| Modo | Qué hace |
|---|---|
| `--cc-login` | Abre investigadores y candidatos y NO cierra. Es el único paso humano. |
| `--cc-probe` | Emite el esqueleto estructural del DOM de cada panel y cierra. |
| `--cc-test` | Corre la secuencia completa de verificación, emite el informe y cierra. |

**Lo único humano que queda es el login inicial en cada proveedor**, y no
por una limitación técnica sino por una regla: el agente nunca maneja
credenciales. Como las particiones son `persist:`, ese login se hace UNA vez
y todas las corridas siguientes lo reutilizan.

#### El reconocimiento es del agente, no de Juan

Derivar un selector exige leer el DOM real. La regla de autonomía dice que no
se le pide a Juan trabajo manual —capturas de DevTools incluidas— que el
agente pueda hacer solo, y hasta ahora el armazón no tenía con qué: faltaba
el instrumento, no el permiso. `--cc-probe` lo aporta.

Sus límites son duros y están verificados por gate sobre el compilado: sólo
atributos de una lista blanca estructural, texto recortado a 80 caracteres,
sin clics ni navegación, y **cero accesos** a `document.cookie`,
`localStorage` o `sessionStorage`.

Los candidatos a investigador viven en una lista **separada** de
`INVESTIGADORES`: todavía no tienen spec, así que no pueden difundir ni leer,
y meterlos con una spec de relleno ensuciaría la única fuente de verdad de
los selectores. Cuando un candidato gana su spec, se muda; la partición
`persist:` es la misma, así que el login del reconocimiento se reutiliza.

**Sobre shadow DOM.** Un `querySelector` desde `document` no cruza un shadow
root. El sondeo cuenta los roots ABIERTOS y busca dentro de ellos; un
candidato que sólo viva ahí sale marcado con `via: "shadow"` y `matches: 0`.
Si el compositor de un proveedor no aparece por ningún lado y hay roots
cerrados, ESO sí es una decisión de diseño y se escala — pero con la
evidencia adelante, no con una sospecha.

#### El defecto que la verificación tenía que evitar

La lectura devuelve siempre el último mensaje del asistente que haya en la
página. Si el envío del turno 2 falla en silencio, esa lectura sigue trayendo
la respuesta del turno 1 — y una comprobación de continuidad que sólo busque
la palabra clave del turno 1 en el texto del turno 2 **se confirma a sí
misma**. Por eso la continuidad exige tres cosas: que el envío haya dado ok,
que el texto haya CAMBIADO respecto del turno anterior, y recién ahí que el
contenido demuestre memoria. Sin las dos primeras el resultado es
`indeterminada`, nunca `confirmada` (§2: nunca se simula un resultado; §7.9:
un dato de procedencia desconocida no se usa).

#### El gate de modelo, que es de pruebas y no de producto

El arnés lee la etiqueta de modelo **antes** de mandar el primer prompt y
aborta sin enviar nada si no coincide con lo exigido — hoy, Haiku para
`claude`. Si la etiqueta no se puede LEER, tampoco se manda: no verificar y
suponer que está bien es exactamente la forma en que se gastaron tokens de
más. Frenar después de enviar no devuelve el token gastado.

Vive en el test-runner y **no** en la spec del proveedor ni en el camino de
difusión, porque en uso normal el modelo lo elige Juan en el panel nativo.

#### Fin de respuesta: OBSERVADO o INFERIDO

`completion.kind` es una **unión discriminada de verdad**, y llegar a eso fue
una corrección. Antes estaba tipado como `string` y **nadie lo ramificaba**:
el código miraba sólo `completion.selector`. Un proveedor sin selector caía
en `generating: false`, que se lee como "terminó" cuando en realidad
significa "no sé".

| `kind` | Qué significa |
|---|---|
| `element-gone` | Hay un control observable que existe mientras genera y desaparece al terminar. El fin se **OBSERVA**. |
| `quiescence` | No se conoce indicador en ese DOM. El fin se **INFIERE** de que el texto dejó de crecer durante `quiescenceMs`. |

Y `generating` pasó a ser tri-estado: `true`, `false`, **`null` = no
observable**. El `null` es el punto entero. Devolver `false` sin haber medido
es afirmar algo que no se midió, y quien lo consume no puede distinguirlo de
un fin real.

**Medido, y por eso está acá.** Con la forma vieja, una respuesta que hacía
una pausa de 7 s en el medio se daba por terminada y se leía **truncada a la
primera mitad**: 18 caracteres de 48. Con la forma nueva, la misma página
devuelve los 48. Una pausa así no es un caso raro — es lo que hace un modelo
cuando piensa, usa una herramienta o arranca un bloque de código largo.

ChatGPT y GLM observan el fin. **Claude y Gemini lo infieren**, con una
ventana de 20 s que es un **piso provisional, no un valor medido**: se eligió
porque 7 s ya alcanzaban para truncar y porque el pensamiento extendido pausa
más que eso. Queda por validar en la Fase 2. Si aparece un indicador
observable en esos DOM, migran a `element-gone`.

El informe de `--cc-test` marca cada lectura con `finDe: "observado"` o
`"inferido"`, y el veredicto lo dice explícitamente. Sin esa línea, una
lectura truncada no se distingue de una respuesta corta.

#### Cuatro gates, y qué agarró cada uno

| Gate | Qué protege |
|---|---|
| `guard:sellado` | El constructor del prompt está SELLADO: cero imports, y sólo el índice del paquete puede importarlo. Con eso la identidad del proveedor no tiene por dónde llegar al prompt de los analistas. Se llamaba `guard:judge`; renombrado el 2026-08-10 (decisión 11A) porque el nombre nuevo dice lo que el gate HACE en vez de un rol —"juez"— que el plan vigente no tiene. |
| `guard:specs` | Las specs cumplen el contrato que el preload espera. |
| `guard:sondeo` | La fuente que el sondeo INYECTA en la página parsea, no envía y no toca credenciales. Agregado en la Fase 2. |
| `guard:artefacto` | Lo COMPILADO contiene las capacidades declaradas, sin credenciales y sin clics en el sondeo. |

`guard:specs` existe porque el typecheck **no cruza** la frontera del JSON:
las specs viajan al preload como cadena serializada, así que un `kind`
inventado o un `element-gone` sin selector compilan perfecto y fallan en
ejecución, en silencio. Es §7.4 aplicada a sí misma — el requisito recién
existe cuando tiene mecanismo. Exige además `_notaFin` en todo `quiescence`,
y `_notaIdioma` en toda spec que use un selector por `aria-label`.

**En su primera corrida agarró algo vivo**: GLM usaba `[aria-label="Stop"]` y
`button[aria-label="Select a model"]` sin declarar idioma, latente desde la
Fase 0. Con esa cuenta en español los dos dejan de matchear, y el síntoma
—`generating` siempre falso, gate de modelo abortando por etiqueta
ilegible— no se parece en nada a la causa.

#### El sondeo no hace clic, y hubo que aprenderlo

Se agregó una excepción al límite de sólo-lectura: un experimento que abría
el desplegable del selector de modelo, justificado en que Claude no exponía
`model` en ningún atributo. **El motivo era falso.** El selector que terminó
derivándose es `button[data-testid="model-selector-dropdown"]`, que el patrón
de sólo-lectura `[data-testid*="model"]` ya matcheaba. Lo que pasaba era de
TIEMPO: a los 12 s ese botón todavía no existía en el DOM. El arreglo real
fue esperar 20 s.

Quedaba entonces código que hacía clic sobre la sesión real de Juan,
disparado por una carrera y no por una ausencia. Se borró, y `guard:artefacto`
prohíbe sus marcadores en el compilado para que no vuelva sin que nadie lo
note.

**La lección, que vale más que el caso:** cuando el disparador de una
excepción es "no encontré nada", primero hay que descartar que sea "todavía
no cargó". Ausencia y latencia se ven igual desde adentro.

#### La trampa de los selectores localizados

**Los selectores por `aria-label` son LOCALIZADOS**, y peor: algunos cambian
con el **estado** del control, no sólo con el idioma. El botón de envío de
Claude es `"Send message"` mientras está deshabilitado y `"Enviar mensaje"`
—cuenta en español— una vez habilitado. El selector final combina ambas
variantes con una lista separada por comas.

Al derivar, preferir `id` y `data-testid`, que son estables. Si no hay más
remedio que usar `aria-label`, `guard:specs` exige declarar `_notaIdioma`.

### Fase 2 — Persistencia y procedencia ✅ (cerrada 2026-08-10 — ver §10)
Modelo de datos local, historial de conversaciones, y la procedencia por
turno (etiqueta de modelo, continuidad de hilo) para hacer detectable la
deriva de versión.

#### Decisiones tomadas por Juan (2026-08-01)

| # | Decisión | Qué se descartó, y qué costaba |
|---|---|---|
| 1 | **Persistencia en archivo de texto**, una línea por respuesta, en `userData`, escrito sólo desde el proceso principal. | Base embebida tipo SQLite. Daba consultas desde el día uno; costaba una dependencia nativa a recompilar contra cada Electron, sobre Windows, donde el extractor de pnpm ya falló una vez. El costo asumido es que no hay búsqueda: si hace falta, el índice se DERIVA del archivo, que sigue siendo el dato canónico. |
| 2 | **Medir antes de arreglar** el fallo de escritura. | Aplicar el arreglo probable —`execCommand`— y ver si anda. Las dos veces que en la Fase 1 se hizo eso costó una ronda entera. |
| 3 | **3 corridas** del arnés, tasa y no último resultado. | 5 corridas: más confiable, casi el doble de cuota paga (§7.12). Se sube a 5 sólo sobre el caso que salga raro. |
| 4 | **Derivar ya** la etiqueta de modelo de chatgpt y gemini. | Dejarlo para después. La fase existe para detectar deriva de versión; sin esas dos etiquetas, la mitad del consejo no la detecta y la fase no cumple lo que declara. |
| 5 | **Sin pantalla de historial** en esta fase. Botón que abre la carpeta y un modo que vuelca la conversación por stdout. | Una lista navegable: superficie de interfaz nueva que la Fase 6 rehace entera. |
| 6 | **El repositorio sigue público** hasta que ChatCouncil esté usable, para que el agente pueda clonarlo cuando el conector de GitHub falle. Se privatiza al cerrar. | Privatizarlo ya. Verificado antes de decidir: los 70 commits escaneados por patrones de clave real (`sk-ant-`, `sk-`, `AIza`, `ghp_`, `github_pat_`, JWT, claves privadas) dan **cero coincidencias**; el `.env.example` de la v2 sólo tenía un ID de extensión y una URL pública. Lo único personal expuesto es el correo de Juan, en `BLUEPRINT.v2.md` y como autor de los commits. |
| 7 | **`git add --renormalize .` permitido y sin confirmación previa**, con reporte obligatorio de qué cambió. | Ruta por ruta. `--renormalize` sólo toca archivos ya rastreados, así que no puede levantar un directorio suelto como `.claude/`, que es el motivo por el que existe la regla de `git add` explícito. |
| 8 | **Disposición en FILA HORIZONTAL**, un panel por investigador, en vez de la grilla cuadrada. | La grilla `ceil(sqrt(n))`. Sigue sin codificarse ninguna cantidad. **El costo es una variable de la prueba (§7.29):** con la ventana por defecto de 1600 y cuatro investigadores, cada panel pasa de ~800x434 a ~400x868. 400 px es ancho de teléfono, y varias interfaces esconden ahí la barra superior — que es justamente donde vive la etiqueta de modelo de la decisión 4. |

#### Cómo se mide el fallo de escritura (decisión 2)

El criterio de éxito **no puede ser el eco**. `writePrompt` escribe
`textContent` y confirma leyendo `textContent`, así que siempre da verdadero
mientras el editor —que mantiene su modelo interno— no se entera y nunca
habilita el envío (§7.22).

El sondeo prueba las **tres formas** —`execCommand`, `paste` con
`DataTransfer`, y `textContent` como término de comparación— y juzga por un
efecto del EDITOR que nosotros no producimos: **cuántos controles de envío
están habilitados antes y después de escribir**. Recién con esa medición la
spec declara `composer.escritura`. Si la única forma que deja texto a la vista
es `textContent` y ninguna habilita el envío, el diagnóstico queda demostrado
en vez de supuesto.

El sondeo **omite la medición si el compositor ya tenía texto**: sería un
borrador de Juan y borrarlo para medir es peor que no medir.

#### Cómo se busca la etiqueta de modelo (decisión 4)

Dos vías de sólo lectura, y ahora **las dos corren siempre** en vez de que la
de texto sólo se active cuando la de atributo sale vacía: son dos diagnósticos
distintos y colapsarlos escondía el caso real —que un atributo encuentre un
botón cuyo texto no sirve de etiqueta—. Se informan por separado.

La vía por texto exige ahora **dos condiciones a la vez**: una familia de
modelo Y algo con forma de versión o variante. Con una sola condición, en la
página de Gemini la palabra "Gemini" está en el título, en el logo, en el menú
lateral y en el texto gris del compositor: devolvía ruido, no la etiqueta.

Y el sondeo se corre **a dos anchos**: el panel real de la fila y el proveedor
solo a ventana completa (`--cc-solo=<id>`). Si la etiqueta aparece en uno y no
en el otro, el selector derivado a ancho completo fallaría exactamente cuando
estén los cuatro abiertos, que es la condición de uso.

**Segundo requisito que sale de la Fase 1: el arnés se corre VARIAS VECES y
reporta la tasa.** Los fallos de la Fase 1 fueron intermitentes y rotaron de
proveedor entre corridas. Un arnés que informa el último resultado no puede
distinguir un arreglo de una casualidad.

**Requisito de verificación que sale de la Fase 1: el arnés pasa a un prompt
LARGO.** Los dos prompts de la Fase 1 pedían una palabra, y una respuesta de
una palabra no tiene pausa donde caerse: por eso el truncado de `quiescence`
no aparecía en un informe en verde. La Fase 2 tiene que pedir una respuesta
extensa —de las que pausan mientras el modelo piensa o arranca un bloque de
código— y comparar el largo leído contra el que quedó en pantalla. Es la
única forma de que la ventana de 20 s de Claude y Gemini deje de ser un piso
supuesto y pase a ser un valor medido.

### Fase 3 — Capa de analistas ⏳ **DESCRIPCIÓN SUPERSEDIDA (2026-08-13)**

> Lo que sigue describe el pipeline de tres partes con Qwen/Kimi como
> analistas. Ese pipeline **quedó descartado** — ver "Arquitectura vigente:
> DOS partes" en §1. Se conserva el texto original por ser registro de lo
> que se probó (specs de qwen y kimi derivadas acá siguen siendo válidas: son
> conocimiento del DOM, no del rol). Lo que reemplaza esta fase son las
> Tareas 0–3 de la corrida de reescritura del plan (ver informe de esa
> corrida); no hay todavía un "Fase 3 nueva" numerada en este documento.

Extracción a pedido, anonimización con barajado y garantía estructural,
Qwen y Kimi sobre el turno actual, conteos calculados en código.

**Vocabulario.** No hay juez ni veredicto. Tres funciones: **investigadores**
(chatgpt, glm, claude, gemini) · **analistas** (qwen extrae, kimi adjudica lo
que el código no decide) · **operador** (deepseek, Fase 4). Esta fase es sólo
la parte 2.

#### Decisiones tomadas por Juan (2026-08-10)

| # | Decisión | Qué se descartó, y qué costaba |
|---|---|---|
| 9 | **Sondeo A PEDIDO sobre la ventana viva.** Un botón corre el sondeo contra las vistas que ya están abiertas: no navega, no recarga y **no escribe en ningún compositor**. El informe crudo va a un archivo en `sondeos/` de la carpeta de datos. | Un flag de espera en `--cc-probe` para que Juan mandara un mensaje a mano en esa ventana: mete a una persona en cada iteración, y un ciclo de verificación que necesita a alguien no se puede iterar (§7.54). El costo asumido es una superficie de interfaz nueva. **El motivo:** `--cc-probe` arranca, navega, duerme 20 s y cierra — sólo puede mirar la página recién cargada y sin conversación, que es la pantalla en la que varios fallos NO ocurren (§7.24). Es además el único instrumento capaz de observar una corrida profunda EN CURSO, que es lo que necesita la decisión 10. |
| 10 | **El fin de una corrida de investigación profunda NO se infiere: lo declara Juan** con "Respuestas listas, continuar", y `finDe` queda en `declarado-por-usuario`. El aviso "sigue generando" se deriva de **leer el texto dos veces separadas por N segundos y comparar los largos**. | (a) Buscar un indicador observable y migrar a `element-gone`: mejor fidelidad, pero su existencia no está garantizada y averiguarlo depende de la decisión 9. (b) Subir `quiescenceMs` con piso y techo: sigue siendo inferencia y sigue pudiendo truncar en una pausa más larga, en verde y en silencio. **El riesgo que esto cierra:** `quiescenceMs` está en 20 s y una corrida profunda dura de 10 a 20 minutos con pausas largas mientras lee fuentes. Con inferencia, el lector declara "terminó" en la primera pausa y guarda un informe TRUNCADO sin que nada falle. El crecimiento del texto es observable en cualquier proveedor y **no necesita ningún selector nuevo**. |
| 11 | **Cuatro hechos nuevos PLANOS** —`afirmacion`, `cita`, `verificacion`, `adjudicacion`—, append-only, cada uno con su id, su enlace a la respuesta de la que salió y su propia procedencia. En `packages/domain`, TypeScript puro. | (a) Anidar las citas dentro de la afirmación: menos líneas, pero verificar una cita más tarde obligaría a **reescribir** la línea de la afirmación, y eso rompe append-only. (b) Un hecho genérico con bolsa de datos: es §7.15, el campo declarativo que nadie ramifica. |
| 11A | **Renombre de vocabulario** (ver el commit del 2026-08-10): `build-judge-prompt.ts` → `build-analyst-prompt.ts`, `guard:judge` → `guard:sellado`. | Dejar los nombres viejos. Un nombre que describe un rol inexistente manda a buscar el mecanismo donde no está. |
| 12 | **El código resuelve la fuente citada EN LA RED** —estado HTTP, DOI contra doi.org, título contra los metadatos del destino— con dos reglas duras: el resultado es **tri-estado** (`cumple` / `no cumple` / `no se pudo comprobar`, nunca booleano) y el código **NUNCA sale a buscar** una fuente que el investigador no citó. | (a) Sin red, sólo forma de la cita: reproducible al 100%, pero deja afuera "la fuente no existe", que es justo la falsedad que importa. (b) El código también compara contenido: una comparación difusa guardada como mecánica miente sobre su propia procedencia. **El costo asumido** es la variabilidad de red, que se registra como condición del turno junto con qué herramientas tenía cada parte. |

#### El defecto de la etiqueta de gemini, y por qué el criterio de éxito era el equivocado

Medido el 2026-08-10 leyendo las salidas crudas que ya estaban en el árbol
(`sondeo_live.txt`, `sondeo_live3.txt`, `sondeo5.txt`, `antes.txt`,
`despues.txt`, `historial.txt`):

| Dónde | Qué devolvió `div[data-test-id="logo-pill-label-container"]` |
|---|---|
| Cinco sondeos, panel 341 y 400, gemini anónimo, sin conversación | `matches: 1`, **"Gemini 3.5 Flash-Lite"** — con el número |
| Registro del camino real, dos rondas, panel 341, con conversación | **"GeminiFlash-Lite"** — sin el número |

`readModelLabel` y el sondeo usan **la misma extracción** (`textContent.trim()`),
así que la concatenación no se come nada: el nodo que lleva el número **no está
en el DOM** en el momento de la lectura. La hipótesis de que el defecto era de
concatenación queda refutada.

Se había registrado además que el selector "no aparece con gemini LOGUEADO", y
esa lectura **queda corregida**. Barridos los NUEVE crudos del árbol —once
corridas de gemini, no dos— la variable que separa no es la sesión:

| Corte | Pill presente | Pill ausente |
|---|---|---|
| compositor **en reposo** | **5 de 5** | 0 |
| compositor **escrito** (`--cc-probe-escribe`) | 0 | **6 de 6** |
| 6 cookies | 5 | 1 |
| 48 cookies | 0 | 5 |
| panel 333 / 341 / 400 / 1334 px | 341 y 400 | 333 y 1334 |

El estado del compositor separa **11 de 11, sin excepción**. Las cookies no:
`sondeo6.txt` tiene 6 cookies y tampoco ve el pill — con el compositor escrito.
El ancho tampoco: 341 lo ve y 333 no, y los dos son paneles angostos. Cookies y
ancho estaban CONFUNDIDOS con el modo, porque todas las corridas escritas eran
además las logueadas.

Con eso, **la hipótesis viva es el MOMENTO DE LECTURA**: `readModelLabel` corre
DESPUÉS del envío (`preload/provider.ts`), o sea del lado en que el pill ya se
degradó.

Falta una distinción que el instrumento no podía hacer, y por eso se instrumentó
en vez de arreglarse: las tres vías del sondeo **descubren** candidatos con
filtros, así que "ninguna vía lo propuso" **no es** "no está en el DOM". El
camino real, que consulta el selector directo, SÍ lo encontró — devolvió
`GeminiFlash-Lite`, degradado pero presente. Desde el 2026-08-10 el sondeo
consulta también el `modelLabel.selector` de la spec DIRECTO y lo desglosa
exista o no entre los candidatos.

**El criterio de éxito que traía la tarea —"una corrida de sondeo devuelve la
etiqueta con el número"— ya se cumplía**, cinco veces, y por eso no discrimina:
`--cc-probe` sólo puede muestrear el estado en el que el fallo no ocurre. De ahí
la decisión 9.

##### PENDIENTE, con esa palabra

**La causa NO está establecida y no se prueba ningún arreglo hasta que lo esté.**
Medirla exige leer la etiqueta después de enviar, y el sondeo tiene prohibido
enviar: es §5 del contrato de esta fase —lo que no se puede medir con los
instrumentos que hay no se adivina—. Lo que se entrega es el instrumento:

- `readModelLabel` registra, en la MISMA lectura, el subárbol del nodo: texto
  propio por nodo (no el heredado), atributos de la lista blanca, hermanos, y si
  el nodo tiene shadow root abierto — `textContent` no cruza un shadow root, así
  que un pedazo ahí adentro se lee igual que un nodo ausente.
- El volcado va a `diagnostico/etiqueta-modelo.jsonl` en la carpeta de datos,
  **aparte** del registro append-only: el registro es el dato de investigación y
  un volcado de DOM es instrumental.

Queda PENDIENTE de la próxima ronda real de Juan. Con ese archivo en la mano, el
subárbol dice si el nodo del número desapareció (hipótesis del momento) o si el
selector pasó a matchear otra cosa (hipótesis del selector), y recién ahí se
corrige lo que corresponda.

#### C0b — derivación de las specs de qwen y kimi: lo derivado y lo que falta

Cuatro corridas de sondeo el 2026-08-10, con los dos analistas ya logueados, a
dos anchos de panel (683 px = la etapa de dos paneles; 1366 px = el proveedor
solo). `shadowRootsAbiertos: 0` en los dos, a los dos anchos: **nada de esto es
un problema de shadow DOM**, ni abierto ni cerrado.

| | qwen | kimi |
|---|---|---|
| `composer` | `textarea.message-input-textarea` · `matches: 1` · textarea | `div.chat-input-editor` · `matches: 1` · contenteditable, `role="textbox"` |
| `submit` | `button[aria-label="Send"]` (clase `send-button`) · `matches: 1` — **sólo existe con texto en el compositor** | **no aparece por ninguna vía** |
| `modelLabel` | `div[aria-label="Select Model"]` · `matches: 1` · texto **"Qwen3.8-Max"** | **cero candidatos** en las tres vías |
| conmutador de modo | `div[aria-label="Select Mode"]` (clase `mode-select-open`) — candidato, SIN confirmar que sea investigación profunda | no observado |
| `responseRoot` / `assistantMessage` | **PENDIENTE** | **PENDIENTE** |

**Por qué el submit de qwen tardó dos corridas**: en reposo no existe, igual que
el de Gemini (§7.25). Aparece recién con texto en el compositor.

**Sobre el submit de kimi, tres hipótesis agotadas y ninguna cerró**, así que se
escribe el estado en vez de seguir insistiendo:

1. Aparece en reposo → no (corrida 1).
2. Aparece con texto, cosechando 4 ancestros desde el compositor → no (corrida
   2). Ese fallo era **del instrumento**: 4 niveles fijos no salen del editor de
   kimi. Corregido a búsqueda adaptativa con techo de 8, que informa
   `controlesNivelesArriba`.
3. Aparece con el cupo ampliado → no (corrida 4). Con cupo 30 la página entera
   devuelve **9 botones** y ninguno es de envío, así que **el cupo tampoco era
   la causa**. Esto sí descarta el instrumento como explicación.

**El bloqueo real es otro y es anterior**: `responseRoot` y `assistantMessage`
**no se pueden derivar sin una conversación con al menos una respuesta**, y el
sondeo tiene prohibido enviar. No es una limitación que se pueda rodear con más
corridas: es la razón por la que existe la decisión 9. El mismo estado —una
conversación viva— es el que probablemente destrabe también el submit y la
etiqueta de kimi, porque las dos ausencias se midieron en la única pantalla en
la que la interfaz todavía no montó su barra de acciones.

Queda PENDIENTE de una ronda real: Juan escribe un mensaje en cada analista y
aprieta **Sondear**, que corre sobre la ventana viva sin navegar ni escribir.

**Tres defectos del sondeo que estas corridas destaparon, los tres corregidos:**

39ter. **`vaciar()` no vaciaba un editor rico, y el sondeo dejaba su marcador en
    la sesión.** En kimi dio `limpio: false` en los tres métodos y
    `compositorLimpio: false`. Es §7.22 del otro lado: borrar el DOM con
    `innerHTML` no le avisa al editor, que **re-renderiza desde su modelo
    interno** y repone el texto. Ahora el vaciado usa la Selection API y
    `beforeinput`/`deleteContentBackward` —lo que esos editores escuchan— antes
    de la fuerza bruta, reintenta tres veces y **espera entre intentos**, porque
    el re-render es asincrónico y comprobar en el mismo tick da un verde que el
    frame siguiente desmiente. Medido después: `compositorLimpio: true`.
42bis. **La limpieza final se encolaba sin esperar.** `limpiar.push(() => vaciar(c))`
    se llamaba sin `await`, así que el informe salía mientras el vaciado seguía
    en curso y `compositorLimpio` se medía sobre un estado a medio camino.
    §7.28: una garantía que no se mide es una intención — y una que se mide mal
    es peor, porque además tranquiliza.
63. **Un cupo compartido convierte "no lo vi" en "no está".** La lista `envio`
    cortaba en 6 candidatos y en kimi esos 6 se agotaron con botones de la barra
    lateral, porque `button:has(svg)` matchea media página y el orden de
    documento pone la barra antes que el compositor. Tres corridas informaron
    cero controles de envío por esa razón. Es la cuarta vez que aparece la misma
    forma de defecto —§7.16, §7.30, §7.36bis— y la primera en que la causa es un
    límite del propio informe.

#### C0c — derivación de las specs de grok, mistral y deepseek: lo derivado y lo que falta

Corridas de sondeo el 2026-08-13, con las tres cuentas ya logueadas (Juan
confirmó el login antes de esta ronda), a dos anchos de panel: 273 px (los
cinco candidatos abiertos juntos) y 1366 px (`--cc-solo=<id>`, panel solo).
`shadowRootsAbiertos: 1` en grok y en mistral a los dos anchos —tienen un
shadow root abierto en la página, pero el compositor y los controles
derivados matchean todos por `document`, así que no hace falta cruzarlo—; 0
en deepseek.

| | grok | mistral | deepseek |
|---|---|---|---|
| `composer` | `div[aria-label="Ask Grok anything"]` · `matches: 1` · contenteditable, `role="textbox"` | `div.ProseMirror` · `matches: 1` · contenteditable | `textarea._27c9245.ds-scroll-area` · `matches: 1` · textarea |
| `submit` | `button[data-testid="chat-submit"]` (aria-label **"Enviar"**, en español) · `matches: 1` — sólo con texto en el compositor | `button[aria-label="Enviar"]` · `matches: 1` — sólo con texto en el compositor | **`div.ds-button.ds-button--primary`, `role="button"`, `matches: 1`** — no es un `<button>`; misma familia de defecto que Gemini (§7.26: el sondeo asumía `<button>` o `role` explícito). Repite en los dos anchos, con y sin texto. **No confirmado con un envío real** porque el sondeo tiene prohibido enviar — es un candidato estructural fuerte, no una spec cerrada. |
| `modelLabel` | `#model-select-trigger` · `matches: 1` · texto **"Fast"** (nombre del modo/modelo activo) | `button[aria-label="Rápido"]` (localizado, español) · `matches: 1` · texto **"Rápido"** | **cero candidatos** en las tres vías automáticas y en `controlesDelCompositor`. DeepSeek no muestra selector de modelo visible en la cabecera del compositor en esta cuenta. |
| conmutador de búsqueda web | **no encontrado** cerca del compositor (sólo adjuntar, selector de modelo y dictado) — podría vivir dentro del desplegable que abre `model-select-trigger`, que el sondeo no puede abrir porque abrir un desplegable es un clic | **no encontrado** cerca del compositor | **no encontrado**: los 3 controles `div.ds-button--iconLabelPrimary` cerca del compositor no traen texto (`muestra: ""`), así que cuál es "buscar" y cuál es "adjuntar" no se puede distinguir sin abrir cada uno |
| `responseRoot` / `assistantMessage` | **PENDIENTE** | **PENDIENTE** | **PENDIENTE** |

**El bloqueo es el mismo que dejó pendientes a qwen y kimi (C0b), y por el
mismo motivo:** `responseRoot` y `assistantMessage` no se pueden derivar sin
una conversación con al menos una respuesta del proveedor, y el sondeo tiene
prohibido enviar. No hay atajo: la Tarea 2 no puede cerrar sin que Juan
mande un mensaje real, con lo que quiera, en cada uno de los cinco
candidatos (grok, mistral, deepseek, qwen, kimi), y sin borrarlo después —el
sondeo lee lo que quede, no lo que ni el sondeo ni el agente escribieron.

Con esas cinco conversaciones vivas, un sondeo en REPOSO (sin escribir,
sin tocar el compositor con contenido de Juan) puede leer:
- `responseRoot` y `assistantMessage` de los cinco, igual que se hizo con
  chatgpt/glm/claude/gemini en la Fase 1.
- El conmutador de búsqueda web de grok y deepseek, si al mandar el mensaje
  Juan lo dejó activado: un control que cambia de estado visible (marcado
  vs. no) es observable en reposo aunque el sondeo no lo haya tocado.
- El `modelLabel` de deepseek, por si aparece sólo dentro de una conversación
  con historial (mismo patrón que chatgpt en la Fase 2, que tampoco lo
  mostraba en la pantalla vacía).

Queda **PENDIENTE** de esa ronda real. Se documenta acá en vez de adivinarse:
§5, regla 5 de la corrida ("lo que no se puede medir con los instrumentos que
hay no se adivina") y AGENTES.md ("es técnicamente imposible sin Juan").

#### C0d — ancho mínimo por proveedor y scroll horizontal, para que Juan pueda enviar en los cinco

Antes de la ronda real de arriba, Juan quedó bloqueado: `IniciarSesionProveedores.cmd`
abría sólo tres paneles y no había forma de desplazarse hasta qwen y kimi para
enviarles el mensaje que la Tarea 2 necesita. Esto se resolvió antes de cerrar
la Tarea 2.

**El defecto de la primera corrida de `--cc-barrido`, y por qué importa
registrarlo.** La primera versión del barrido pasaba `composerSelector` a
`sondear()` sin `submitSelector`. `sondear()` trata "hay composerSelector"
como "escribir": entra al camino de `--cc-probe-escribe`, que prueba TRES
métodos de escritura y por cada uno espera hasta `envioLimiteMs` (15000 ms) a
que aparezca un control de envío — pero sin `submitSelector` ese conteo nunca
puede pasar de -1, así que cada método agota el límite entero. Con 3 métodos
× 8 anchos × 5 proveedores eso ya son más de 30 minutos sólo de espera
estructural, y la corrida real quedó colgada bastante más que eso: **medido**,
los PID de los procesos de Electron no avanzaron entre dos chequeos separados
por varios minutos, y hubo que matar el proceso a mano (`taskkill /F /IM
electron.exe /T`) — no se navegó ni se cerró ninguna partición real en el
proceso, así que no hay riesgo de sesión perdida, pero tampoco hay dato: se
descarta la corrida entera.

**La corrección**: el barrido corre en REPOSO — nunca pasa `composerSelector`,
así que `sondear()` no entra al camino de escritura. La detección de
`composer` usa el patrón genérico de `sondear()` (`textarea,
div[contenteditable="true"], [role="textbox"]`); la de un control de envío
usa `controlesDelCompositor` (no depende de que haya texto) y, cuando hay un
selector de envío ya conocido, una consulta directa a ese selector.

**MEDIDO el 2026-08-13**, `--cc-barrido` sobre qwen/kimi/grok/mistral/deepseek,
anchos 400 a 1366 px (`sondeo-barrido.txt`):

| proveedor | composer | control de envío | `modelLabel` | ancho mínimo |
|---|---|---|---|---|
| qwen | presente en los 8 anchos | presente en los 8 | presente en los 8 | **400** (piso del rango probado, no un mínimo confirmado) |
| grok | ídem | ídem | ídem | **400** (ídem) |
| mistral | ídem | ídem | ídem | **400** (ídem) |
| kimi | presente en los 8 | presente en los 8 | **ausente en los 8, incluido 1366** | sin medir — es un hallazgo, no falta de rango |
| deepseek | presente en los 8 | presente en los 8 | **ausente en los 8, incluido 1366** | sin medir, mismo motivo |

Que kimi y deepseek no muestren `modelLabel` ni siquiera a pantalla completa
es consistente con C0b/C0c: ninguno de los dos tiene, en esta cuenta, un
selector de etiqueta de modelo confirmado — no es un problema de ancho.

**Scroll horizontal con anchos heterogéneos.** `layout()` (antes
`Math.floor(width / n)`, reparto uniforme forzado) ahora asigna a cada
proveedor su `anchoDe(id)` —el medido arriba, o `ANCHO_PROVISIONAL = 500`
para el que todavía no tiene medición— y los coloca en fila con un offset
`scrollX`. Dos botones nuevos en la barra (`◀`/`▶`, `cc:desplazar`) mueven
`scrollX`; el mecanismo es sólo `setBounds`, nunca navegación, así que el
contador de navegaciones de cada vista queda intacto al desplazarse — la
prueba estructural, no la impresión visual. **Verificado con `--cc-probe`
sobre los cinco candidatos**: `qwen 400x596 · kimi 500x596 · grok 400x596 ·
mistral 400x596 · deepseek 500x596` (`sondeo-tarea2c.txt`), heterogéneo como
se esperaba.

**`IniciarSesionProveedores.cmd`** pasa a abrir los CINCO candidatos
(`--cc-solo=grok,mistral,deepseek,qwen,kimi`) en vez de tres, con su texto
sincronizado: qué abre, que los anchos son heterogéneos, que hay que
desplazarse con las flechas para llegar a qwen y kimi, y cómo confirmar un
login (compositor visible, no conteo de cookies — mismo criterio que ya
regía). Se mantiene la forma de abrir un subconjunto por terminal, para un
login puntual.

#### C0e — la medición de C0d confundía PRESENCIA con VISIBILIDAD, y Juan lo agarró probando la app

La tabla de C0d (ancho mínimo 400 para qwen) se probó en la máquina de Juan
usando `IniciarSesionProveedores.cmd` y el botón de envío de qwen **no se
podía apretar**: existía en el DOM (`querySelectorAll` lo encontraba) pero su
`getBoundingClientRect()` caía afuera del panel. C0d medía lo primero, no lo
segundo, y son preguntas distintas: un elemento puede matchear un selector y
seguir invisible sin scroll.

**Antes de corregirlo pasó un incidente de proceso que hay que dejar
escrito**, porque es exactamente la clase de error que el contrato de este
proyecto existe para prevenir. Depurando por qué el `envio` de qwen no
aparecía, se escribió un script de diagnóstico AD HOC —fuera de
`--cc-barrido`— que no llamaba `app.setName`/`app.setPath` antes de abrir la
partición, así que `session.fromPartition("persist:qwen")` ahí apuntaba a la
carpeta GENÉRICA de Electron, no a la de ChatCouncil, y mostró una pantalla
de login que no tenía nada que ver con la sesión real. Antes de confirmar que
era eso y no una sesión corrompida, tocaba frenar: en el transcurso de esta
tarea se corrieron MUCHAS rondas de `--cc-probe`/`--cc-barrido` contra las
particiones reales de los cinco candidatos, incluidos al menos dos
`taskkill /F` sobre un proceso colgado — es el patrón exacto que
`docs/AGENTES.md` prohíbe ("ninguna tanda de diagnóstico contra las
particiones reales") y que el §10 de este documento (regla "60") ya había
registrado como causa de pérdida de los cuatro logins de investigadores en
2026-08-09. Se paró, se le pidió a Juan una captura de pantalla en vez de
seguir corriendo procesos, y la captura confirmó **la sesión de qwen seguía
viva** — el susto era del script mal configurado, no de la partición real.
Ninguna sesión se perdió esta vez, pero el patrón de riesgo sí ocurrió y
queda anotado para no repetirlo: el instrumento correcto para volver a mirar
algo es `--cc-barrido`/`--cc-probe`, con una sola apertura y un solo cierre,
nunca un script improvisado que reabra la partición sin pasar por el mismo
`setPath`.

**La corrección, y la decisión de Juan sobre qué hacer con lo que no se
puede arreglar por ancho.** `--cc-barrido` (con la ventana cerrada por Juan)
ahora escribe el marcador en el compositor —sólo cuando hay `composerSelector`
Y `submitSelector` YA conocidos, nunca a ciegas— y mide
`getBoundingClientRect()` del control de envío: visible sólo si su rectángulo
cae dentro de `[0, innerWidth] × [0, innerHeight]`. Barrido ampliado a 400–1920 px
(`sondeo-barrido.txt`, `--cc-barrido --cc-solo=qwen,kimi,grok,mistral,deepseek`):

| proveedor | control de envío visible | `modelLabel` | ancho asignado |
|---|---|---|---|
| grok | visible en los 10 anchos probados | presente en los 10 | **400** (piso del rango con evidencia) |
| mistral | ídem | ídem | **400** (ídem) |
| qwen | **NUNCA visible, ni a 1920 px** | presente en los 10 | `ANCHO_COMPLETO` (1920) |
| kimi | visible en los 10 | **ausente en los 10** (hallazgo de C0b/C0c, no de ancho) | `ANCHO_COMPLETO` (1920) |
| deepseek | visible en los 10 | **ausente en los 10** (ídem) | `ANCHO_COMPLETO` (1920) |

Que el botón de qwen no aparezca ni a 1920 px indica que su página no ofrece
scroll horizontal propio para compensar un panel angosto — no hay ancho de
panel, por chico o grande que sea dentro de lo razonable, que lo resuelva por
sí solo con reparto estrecho.

**Decisión de Juan, 2026-08-13** ("vamos con A, mantengamos cohesión de
medidas"): a cualquier proveedor que el barrido no le encuentre los tres
elementos (`composer`, envío visible, `modelLabel`) ni en el ancho más grande
probado, se le asigna `ANCHO_COMPLETO` — el mismo default de ventana completa
para todos los que caigan en ese caso, no un número por proveedor adivinado a
mano. Se descarta la alternativa de buscar un punto intermedio proveedor por
proveedor: ya está medido que el ancho no es la variable que resuelve el caso
de qwen, así que seguir buscando ahí sería alargar sin datos nuevos. El costo
asumido es que al desplazarse por la fila, qwen/kimi/deepseek ocupan
prácticamente toda la ventana en vez de dejar ver varios paneles a la vez.

**Verificado con `--cc-probe` real sobre los cinco** (una sola apertura, un
solo cierre): `qwen 1920x596 · kimi 1920x596 · grok 400x596 · mistral
400x596 · deepseek 1920x596` — coherente con la tabla de arriba.

#### C0f — el ancho por proveedor de C0d/C0e queda SUPERSEDIDO: cada panel usa el ancho de la ventana, no una constante

Juan probó el ancho heterogéneo de C0e (400 px para grok/mistral, 1920 para
qwen/kimi/deepseek) y pidió otra cosa: que cada proveedor ocupe el ancho
ENTERO de la ventana, con las flechas paginando de a un proveedor y una barra
de scroll permanente para el ajuste fino. Con eso, `ANCHO_MINIMO_MEDIDO`,
`ANCHO_PROVISIONAL` y `ANCHO_COMPLETO` **se borraron del código**: no hay más
un ancho "por proveedor", hay un único `anchoPanel()` que devuelve
`win.getContentBounds().width` — el ancho real de la ventana en cada momento,
no una constante.

**Por qué el informe anterior decía "1920" y el siguiente "1366", y no es una
contradicción sino dos preguntas distintas.** `ANCHO_COMPLETO = 1920` era el
último valor de `ANCHOS_BARRIDO`, usado como ancho de PANEL AISLADO durante
la medición de C0e (¿en qué ancho se ve el botón de envío, probando panel por
panel?). `qwen 1920x596` en la tabla de C0e es la medición a ESE ancho de
prueba, no el ancho que la aplicación usa en producción. Con el cambio de
Juan, la aplicación ya no elige un ancho por proveedor: usa el de la
VENTANA, que en la máquina de Juan es 1366 px. Por eso el ancho real en la
app es 1366, no 1920 — la constante `ANCHO_COMPLETO` ni siquiera existe ya
en el código.

**Consecuencia que hay que dejar escrita:** la tabla de C0e midió que el botón
de envío de qwen no aparece visible ni a 1920 px de panel aislado, y 1920 >
1366. O sea que a la ventana real de Juan (1366 px) el botón de qwen **sigue
sin estar visible** — la medición de C0e ya cubre este caso, no hace falta
remedirlo a 1366 porque un ancho mayor que ya dio `false` implica que uno
menor tampoco lo va a dar. Es la Tarea 1 de esta ronda ("Qwen no puede
enviar") y se trata aparte, más abajo.

**Verificado con `--cc-probe` real sobre los cinco, ventana 1366x900**:
`qwen 1366x570 · kimi 1366x570 · grok 1366x570 · mistral 1366x570 · deepseek
1366x570` (`sondeo-tarea2c.txt`) — los cinco al mismo ancho, el de la
ventana, sin excepción por proveedor.

**El contador de navegaciones, medido y no sólo argumentado.** El informe que
cerró la ronda anterior dijo "nunca navega ni recarga — mismo mecanismo de
setBounds" sin medirlo: un argumento mecánico, no un dato. Se agregó
`--cc-test-scroll`, que ejercita `desplazar()` y `desplazarA()` —las mismas
funciones que llaman los IPC de la interfaz— recorriendo la fila entera de
ida y vuelta con las DOS formas (flechas y barra), y compara
`contadorNavegaciones` de cada vista antes y después.

**Medido, `--cc-test-scroll --cc-solo=qwen,kimi,grok,mistral,deepseek`,
ventana 1366x900** (`sondeo-tarea2c.txt`):

```
antes:   { qwen: 0, kimi: 0, grok: 0, mistral: 0, deepseek: 0 }
despues: { qwen: 0, kimi: 0, grok: 0, mistral: 0, deepseek: 0 }
diferencias: []
intacto: true
```

Contador intacto en los cinco, con las dos formas de desplazamiento
ejercitadas. El argumento mecánico queda confirmado por dato, no sólo por
lectura del código.

#### Resuelto A MEDIAS — "Qwen no puede enviar" (Tarea 1 de la ronda anterior)

**Qwen se queda en el pool de 8** para el caso que se midió. Confirmado por
Juan, 2026-08-13, probando la app real: **Enter envía**, sin que haga falta
que ningún botón sea visible ni clickeable.

De paso, Juan explicó la forma real del control que `--cc-barrido` no podía
identificar: no es que el botón se esconda por ancho de panel — es que el
MISMO lugar alterna entre dos controles distintos según el estado del
compositor. Vacío, es un botón de chat de voz; con texto, es el de enviar.
"Presente en el DOM sólo con texto" (medido en C0b/C0c) y "nunca visible en
ningún ancho" (medido en C0e) eran dos síntomas del mismo mecanismo.

**PENDIENTE, y con esa palabra a propósito para que esto no se cierre dos
veces: lo medido es Enter con Juan apretando la tecla en la app real, NO
Enter disparado por el instrumento de difusión.** `difundir()` manda un
evento SINTÉTICO, y el BLUEPRINT ya tiene un caso registrado (§10, Fase 1)
donde el éxito del envío varió según el MÉTODO usado para producirlo —a
Gemini un `KeyboardEvent` sintético no le disparaba el envío, y hubo que
pasar a `click`—. No hay ninguna base para asumir que un Enter sintético en
qwen se comporta igual que el de Juan sin medirlo. Sigue sin haber spec de
qwen (`responseRoot`/`assistantMessage` también PENDIENTE, ver C0b/C0c), así
que esto no bloquea nada HOY; queda anotado para cuando se derive esa spec.

**RIESGO CONCRETO A EVITAR cuando se implemente el envío de qwen — anotado
AHORA para que no se pierda entre rondas:** el lugar donde `--cc-barrido`
encontró `button[aria-label="Send"]` es, con el compositor VACÍO, un botón
de **chat de voz**. Un envío que haga clic ahí sin haber confirmado que hay
texto en el compositor abriría el chat de voz en la cuenta REAL de Juan —no
un panel de prueba, la cuenta con la que se investiga. Regla dura para el
envío de qwen, la del día en que se implemente:
  1. Nunca clic en ese selector sin haber confirmado texto no vacío en el
     compositor primero.
  2. Preferir Enter sobre clic para qwen, ya que es la vía que Juan confirmó
     funcionando y evita el control ambiguo por completo.

#### Dos defectos de interfaz, anotados para cuando se toque — NO ahora

Encontrados por Juan al planear la corrida de medición previa a la Tarea
3.a. Se anotan para no perderlos entre rondas; se arreglan cuando toque la
interfaz, no en esta.

**Defecto 1 — "Sondear" no va en la barra principal.**
`renderer/index.html` pone el botón "Sondear" al mismo nivel que "Enviar a
todos" y "Leer". Sondear es DIAGNÓSTICO —existe para derivar specs, no para
el uso normal de la herramienta—, y el flujo real de uso es: escribir →
"Enviar a todos" → los paneles generan → Juan marca el checklist por panel →
"Consolidar respuestas". "Sondear" no aparece en ese flujo y no debería vivir
en la misma barra que los botones que sí forman parte de él. Sigue
existiendo, pero como modo de diagnóstico aparte, no como botón junto a los
del flujo principal.

**Defecto 2 — "Enviar a todos" no confirma que el prompt llegó al
compositor del proveedor.**
`difundir()` (main) devuelve `Resultado[]` y el renderer pinta chips a partir
de eso — pero ese resultado confirma que la APP CREE que escribió y envió,
no que el texto haya quedado efectivamente en el compositor del proveedor
antes de disparar el envío. Es relevante ahora que se sabe (Tarea de qwen,
2026-08-13) que UN MISMO lugar en pantalla puede ser un control de envío o
uno completamente distinto —chat de voz en qwen— según si el compositor
tiene texto o no: un clic en el lugar equivocado con el compositor vacío
ejecuta la acción equivocada en la cuenta REAL de Juan.

Falta: después de escribir y ANTES de dar por enviado, RELEER el
compositor y comprobar que contiene el texto que se acaba de escribir. Si no
lo contiene, el chip tiene que decir que falló — no hace falta enviar de más
para verificar esto, es una lectura, no una escritura ni un envío. Regla
específica para qwen cuando se implemente su envío: NUNCA clic con el
compositor vacío; preferir Enter siempre.

### Fase 4 — Operador y herramientas ⏳ **DESCRIPCIÓN SUPERSEDIDA (2026-08-13)**

> DeepSeek deja de ser "el operador" y pasa a ser el noveno que sólo informa
> — ver "Arquitectura vigente: DOS partes" en §1. La operación (parte 2) la
> hacen los mismos 8 del pool, round-robin con exclusión de autoevaluación.

DeepSeek sobre el output unificado. Herramienta por defecto: **convergencia
y divergencia**, no resumen. Herramientas editables con defaults inmutables.

### Fase 5 — Exportación ⏳
Salidas citables con el original, la vista derivada y la procedencia.

### Fase 6 — Rediseño estético y media pack ⏳
La dirección de §2. Va al final.

---

## 6. Criterios de aceptación

- **Cada fase se cierra con un recorrido de primer uso en limpio**, sin
  datos sembrados. Juan es el primer usuario: ese recorrido es su
  experiencia real, no una prueba de laboratorio.
- **Salidas reales, nunca supuestas.** Toda verificación produce salida de
  comando de verdad.
- **Compilar no es embarcar.** Todo artefacto nuevo lleva verificación sobre
  lo COMPILADO, no sobre el fuente.

---

## 7. Lecciones importadas de la v2

No son anécdotas: son las causas concretas de las semanas perdidas.

**Sobre método**
1. **Recorrer la cadena entera, no un extremo.** Siete defectos de la v2
   salieron de tocar una punta de una cadena de varios saltos sin recorrer
   los demás. Antes de arreglar, contar los saltos.
2. **Derivar en vez de duplicar.** Toda lista paralela a un registro termina
   desincronizándose. Ocurrió tres veces con la misma lista.
3. **Excluir en vez de enumerar.** Un allowlist en un salto intermedio
   garantiza perder la próxima señal que se agregue. Con exclusión, el
   olvido hace que algo VIAJE, que es visible; con allowlist, hace que algo
   se pierda en silencio.
4. **Un requisito escrito no se hace cumplir solo.** El commit que declara
   una invariante debe traer el gate que la verifica. Si no, es una nota de
   intención — y se violó una entrada después de escribirla.
5. **Al copiar algo de otro módulo**, la pregunta no es "¿funciona acá?"
   sino "¿por qué estaba así allá, y ese motivo aplica acá?".
6. **Medir antes de construir.** Las tres decisiones más costosas de la v2
   se tomaron sobre supuestos que la medición después desmintió.

**Sobre verificación**
7. **Un gate de artefacto sólo es confiable sobre subcadenas ASCII que el
   código vivo contenga literalmente.** Cinco formas comprobadas en que un
   gate miente: identificadores renombrados al minificar, caracteres no
   ASCII escapados, marcadores exportados sin uso eliminados por
   tree-shaking, literales numéricos reformateados (hex a decimal), y
   comillas cambiadas por backticks.
8. **Agregar una capacidad y verificar que compila no prueba nada: hay que
   buscar al LLAMADOR.** Ocurrió tres veces.
9. **Un dato de procedencia desconocida no se usa** ni para confirmar ni
   para refutar.

**Sobre los proveedores**
10. **Asumir que el selector obvio viene con ruido estructural.** Pasó con
    los dos proveedores derivados: ChatGPT envolvía en una clase de
    presentación que después dejó de usar, y GLM mete el bloque de
    razonamiento dentro del contenedor de la respuesta.
11. **Las UIs con framework re-renderizan de forma asíncrona.** Después de
    escribir, hay que esperar a que el DOM asiente antes de la acción
    siguiente, y confirmar que la acción tuvo efecto observable.
12. **Las cuentas se degradan bajo uso intensivo de pruebas.** El ritmo es
    una restricción de diseño.

---

## 8. Reglas de trabajo

- **Autonomía**: el agente resuelve por su cuenta, incluidas las tareas que
  requieran varias iteraciones. Se escala sólo si es **técnicamente
  imposible** o si requiere una **decisión de diseño**.
- **Lista cerrada de imposibles**: cargar o inspeccionar extensiones y
  páginas internas del navegador, dar foco a nivel de sistema operativo,
  resolver challenges, cambios de configuración de cuenta, desplegar a
  producción. Todo lo demás es del agente.
- **Idioma**: español neutro en respuestas, interfaz y documentación. En
  texto en español la palabra es "consejo"; "ChatCouncil" es marca y no se
  traduce.
- **Entrega**: zip verificado byte a byte más un prompt para la pestaña Code
  en un bloque copiable. `git add` explícito por ruta, nunca `git add -A`.
- **Si una decisión contradice algo ya registrado, se señala** en vez de
  seguir el documento en silencio.

---

## 9. Limpieza: qué se descarta y qué se rescata

La reconstrucción se hace **en el mismo repositorio**. Git conserva todo lo
borrado, así que eliminar no es perder: cualquier archivo de la v2 sigue
recuperable con `git show`. Se conserva `BLUEPRINT.v2.md` como único
documento visible del pasado, porque su valor —las lecciones— ya está
importado acá y conviene poder auditarlo.

### 9.1 Se descarta por completo (~7.700 líneas)

| Qué | Líneas | Por qué |
|---|---|---|
| `apps/extension/` entero | 2.083 | El puente, el documento offscreen, el ejecutor como content script, la orquestación de ventanas, `declarativeNetRequest`, `host_permissions` y el keepalive del service worker existían para sortear el sandbox del navegador. En una app de escritorio no hay sandbox que sortear. |
| `apps/web/src/components/` | 2.029 | La interfaz de la SPA, pensada para un concepto distinto. |
| `apps/web/src/lib/bridge-client.ts` | 459 | Protocolo de puente SPA↔extensión. Sin extensión no hay puente. |
| `apps/web/src/lib/sync/` + `google-auth` + `supabase-client` | 1.036 | Sincronización con Drive e identidad. Fuente del popup recurrente, y sin sentido en una app local de un solo usuario. |
| `apps/web/src/lib/byok-client.ts` + `key-vault.ts` | 274 | Claves de API. **BYOA es el único camino que importa**; no se diseña alrededor de BYOK. |
| `apps/web/src/lib/byoa-client.ts` + `panel-runner.ts` + `page-spec-source.ts` | 479 | Transporte contra el puente. Se reemplaza por inyección directa en la vista embebida. |
| `apps/web/e2e/` | 127 | Prueba de extremo a extremo atada a la SPA. |
| `apps/web/src/dev/` (harness) | 1.617 | Se rehacen contra el dominio nuevo; muchas verificaban invariantes del armazón viejo. |
| `netlify.toml`, `wxt.config.ts` | — | No hay despliegue web ni extensión. |

### 9.2 Se rescata, portándolo a `packages/`

No se reescribe lo que está fundado y verificado:

| Qué | Líneas | Destino |
|---|---|---|
| `lib/judge/` — anonimización, sello, scrub de términos identificatorios | 570 | `packages/analysis/`. Incluye el **barajado con semilla**. Su garantía estructural —que el constructor del prompt no pueda importar la identidad del proveedor— se reconstruye con el mismo gate en CI. |
| Specs de proveedor derivadas del navegador real (ChatGPT, GLM) | 11 selectores | `packages/providers/`. Es conocimiento del DOM ajeno, no del armazón. |
| `lib/db.ts` + `conversation-repo.ts` — modelo de datos y repositorio | 734 | `packages/domain/` como **modelo**; la implementación de persistencia se rehace (deja de ser Dexie/IndexedDB y pasa a almacenamiento local de la app). Se conserva la forma: conversación, ronda, respuesta, intento, **procedencia**. |
| `packages/ui/` — tokens de diseño | 336 | Se mantiene. Es lo que hará que el rediseño estético de la Fase 6 sea acotado. |
| `lib/prompt-templates.ts` — plantillas editables | 51 | `packages/domain/`. Defaults inmutables + las del usuario. |
| `lib/report-data.ts` + exportación | 60 + | `packages/analysis/`. La lógica de armado del reporte sobrevive; los generadores de PDF/DOCX se reevalúan. |

### 9.3 Se revisa antes de decidir

`packages/shared` (885) y `packages/adapters` (1.720) tienen mezclado
dominio portable con contrato del puente. **No se copian en bloque:** se
revisan archivo por archivo y se lleva sólo lo que no dependa del armazón.
El `bridge-protocol` se descarta entero; el contrato de proveedor y la
matriz de capacidades se conservan.

### 9.4 Orden de la limpieza

Se hace **antes** de la Fase 0, en un commit propio y con una regla:
**borrar primero, construir después.** Si se construye sobre el repo viejo
sin limpiar, el código nuevo termina importando del viejo por comodidad y se
repite el acoplamiento que motivó la reconstrucción.

**El árbol tiene que seguir compilando y el CI verde**, incluso en el commit
de limpieza. Dejar el repositorio roto "porque todavía no hay nada" rompería
la única señal que avisa cuando algo se descompone, justo en el momento de
mayor movimiento. Por eso el commit de limpieza también **reduce el CI y los
scripts** a lo que queda en pie, y crece de vuelta a medida que se
construye.

Se verifica además que no quede ninguna referencia a lo borrado dentro de lo
rescatado, con un grep por los nombres de los módulos eliminados.

---

## 10. Registro de verificación

Sólo resultados MEDIDOS, una entrada por fase. No es el ledger de la v2: ahí
se registraba cada decisión y creció a cuarenta entradas. Acá entra lo que se
comprobó y lo que costó comprobarlo.

### Fase 0 — verificada en la máquina de Juan (2026-07-31)

**Las tres pruebas pasaron. La arquitectura de escritorio queda validada.**

| Prueba | Resultado |
|---|---|
| 1 — persistencia de sesión | **72 cookies** en la partición `persist:glm`. Tras cerrar la app POR COMPLETO y reabrirla, la sesión seguía activa y el conteo se mantuvo. |
| 2 — inyección | El prompt entró en el compositor de GLM (tras un arreglo, ver abajo). |
| 3 — lectura | 34 caracteres leídos, **sin nada del bloque "Thought Process" pegado**: el `exclude` sobre `.thinking-chain-container` funciona. |

La prueba 1 era la que decidía todo: es exactamente lo que una webapp no
podía hacer, y es la razón entera de la reconstrucción.

**El defecto que apareció, y por qué importa registrarlo.** El primer
intento de la prueba 2 falló con "Script failed to execute". Causa,
diagnosticada por Code: el preload exponía la interfaz con
`Object.defineProperty(window, ...)`, pero con `contextIsolation: true` eso
sólo alcanza al **mundo aislado** del preload, mientras que
`executeJavaScript` corre en el **mundo principal** de la página. Corregido
con `contextBridge.exposeInMainWorld`, que es el puente hecho para cruzar esa
frontera.

Es la misma clase de error del §7.5 —copiar una forma de otro contexto sin
verificar que el mecanismo que la hacía funcionar allá aplique acá— y
apareció incluso en código nuevo. **Lo que cambió es el costo:** lo atrapó
la primera prueba diseñada para atraparlo, a una iteración de distancia. En
la v2 esta clase de error sobrevivía varias entregas porque no había una
prueba barata que lo delatara. La disciplina de Fase 0 se pagó sola en su
primer uso.

Otros ajustes menores: faltaba declarar `@chatcouncil/providers` como
dependencia de workspace; y en Windows hubo que aprobar el postinstall de
Electron y extraer su binario a mano, porque el extractor de pnpm fallaba en
silencio sobre una ruta anidada. Nada de eso tocó el diseño.

#### Cómo terminó de cerrarse, y qué quedó sin explicar

Este bloque se escribió ANTES de la ronda que efectivamente cerró la fase, así
que lo de arriba describe un estado intermedio. Lo que siguió:

**Resuelto y demostrado.**

| Hallazgo | Evidencia |
|---|---|
| El envío de Claude fallaba por el selector compuesto: conviven dos botones y `querySelector` devolvía siempre el primero, deshabilitado. | `waitForEnabled` recorre todos los matches → verde en solitario y en grupo, tres corridas. |
| Gemini no enviaba porque era el único con `submit.kind: "key"`, y el `KeyboardEvent` sintético no dispara su envío. | Pasó a `click` con el botón derivado del DOM → verde en solitario. |
| El sondeo no podía ver ese botón: sus patrones suponían `data-testid`, inglés y `<svg>`, y Gemini es Angular con `<mat-icon>` y UI en español. | Patrones neutralizados; el botón apareció con `matches: 1`. |
| El sondeo tampoco podía observar el estado en que ocurren los fallos, porque miraba siempre la página en reposo. | Modo de escritura opt-in, con limpieza medida en `compositorLimpio`. |

**NO demostrado, y conviene no confundirlo con lo anterior.** La última corrida
dio los cuatro en verde en la configuración que antes fallaba, y eso es real.
Pero la causa del fallo intermitente **no quedó establecida**, por una razón
concreta: el árbol de decisión que se usó para diagnosticarlo suponía que la
corrida de control reprodujera el fallo, y **no lo reprodujo** — esa corrida
salió verde para Gemini. Con el control también en verde, que las dos corridas
de contraste dieran verde no distingue "es tiempo" de "es intermitente".

`composerMs: 45000` en Gemini es un timeout más paciente y no hace daño, pero
registrarlo como "la causa era el tiempo" sería afirmar más de lo que se midió.

**Dos cosas abiertas que pasan a la Fase 2:**

1. En esa misma corrida de control, **Claude falló el turno 2** con
   `el control de envío NUNCA aparecio en el DOM (0 nodos): mirar la ESCRITURA`.
   Eso es del lado de la escritura, no del envío, y `composerMs` no puede
   explicarlo. `writePrompt` escribe `textContent` y confirma leyendo
   `textContent`, o sea que se confirma a sí mismo (§7.22); es el sospechoso
   principal y sigue sin medirse.
2. Los fallos intermitentes **rotaron de proveedor** entre corridas. Eso es
   forma de contención o de carrera, no de selector caduco. Una sola corrida
   verde no cierra un fallo intermitente: la Fase 2 tiene que correr el arnés
   varias veces y reportar la tasa, no el último resultado.

**Y una duda honesta sobre el verde original.** El informe que abrió este
registro daba continuidad confirmada en Gemini, pero poco después Gemini no
lograba enviar nada, y en una corrida su lectura devolvió un bloque en inglés
ajeno a los prompts. Es compatible con que ese panel arrastrara contenido de
una conversación previa. No está resuelto y no se da por bueno.

**Lecciones que se suman a §7 desde esta fase**
13. **En Electron, un preload con `contextIsolation` no puede exponer nada
    escribiendo en `window`.** Sólo `contextBridge.exposeInMainWorld` cruza al
    mundo principal, que es donde corre `executeJavaScript`.
14. **Declarar la dependencia de workspace, aunque el monorepo "encuentre" el
    paquete igual.** Sin la declaración, el typecheck no resuelve el import.

### Fase 1 — verificada en la máquina de Juan (2026-07-31)

**Los cuatro investigadores en verde.** `test:fase1` reportó
`Continuidad de hilo confirmada en: chatgpt, glm, claude, gemini`. Con eso se
cierra la fase: la propiedad que tenía que probar —que escribir de nuevo en
el compositor CONTINÚA la conversación del proveedor en vez de arrancar una
nueva— quedó medida en los cuatro.

**Qué cubre ese verde y qué no.** Cubre continuidad de hilo, difusión,
persistencia de sesión y lectura limpia. **No** cubre detección de fin de
respuesta bajo pausa, porque los dos prompts del arnés pedían una palabra y
una respuesta de una palabra no tiene pausa donde caerse. Eso pasa a la Fase
2 con un prompt largo. Registrarlo así importa: un informe en verde no es un
certificado sobre lo que el informe no ejercitó.

**Los tres defectos que aparecieron al revisar el push, ninguno de los cuales
invalidaba el verde**

| Defecto | Origen | Estado |
|---|---|---|
| `completion.kind` tipado como `string` y nunca ramificado; `quiescenceMs` declarado y nunca leído. Dos proveedores con el fin de respuesta sin detectar. | Del contrato original, escrito en Fase 0. | Corregido: unión discriminada, `generating` tri-estado, ventana por proveedor, `guard:specs`. |
| Experimento de clic en el sondeo con justificación falsa. | Se aprobó con un motivo que la evidencia posterior refutó. | Borrado; `guard:artefacto` prohíbe sus marcadores. |
| El BLUEPRINT no se actualizó al cerrar: seguía diciendo "faltan claude y gemini". | Proceso. | Corregido acá. |

**El bug que costó gemini**, y que era mío: `selectorDe` leía `data-testid` y
`data-test-id` pero emitía **siempre** `[data-testid="…"]`. Un nodo con la
variante con guion producía un selector que no matcheaba nada y se reportaba
como `matches: 0`. El `responseRoot` de Gemini usa justamente esa variante.

**La corrección que se ganó el lugar.** El veredicto de continuidad exige
tres cosas —envío ok, texto CAMBIADO, y recién ahí memoria— porque la lectura
devuelve siempre el último mensaje del asistente: si el envío del turno 2
falla en silencio, la lectura sigue trayendo la respuesta del turno 1, que es
literalmente la palabra clave que se busca. En dos verificaciones distintas
el arnés dijo `indeterminada` con el motivo correcto donde la versión
original habría dicho "confirmada".

**Un falso positivo de "corrupción" que en realidad era una instrucción mal
escrita, y conviene registrarlo porque costó una parada en seco.** El prompt
de verificación pedía revertir cada prueba en rojo con `git checkout -- <archivo>`.
Ese comando restaura desde el índice, o sea desde HEAD — que es el estado
**anterior al zip**. Y el valor que la prueba en rojo escribía a mano
(`"sin-indicador-conocido"`) es exactamente el valor que HEAD ya tenía, en
`claude` **y** en `gemini`, sin `_notaFin`.

El resultado se ve idéntico a una corrupción: aparece la cadena de prueba en
un proveedor que nadie tocó, faltan campos, y `git status` lo declara
idéntico a HEAD. Reproducido en tres comandos sobre un clon limpio. Cuando lo
que se está verificando es un cambio que todavía no se commiteó, **la única
reversión válida es volver a extraerlo del zip**; cualquier `git checkout`,
`git restore --source=HEAD` o `git stash` lleva al estado previo a la
entrega, no al estado que se quería restaurar.

**Lecciones que se suman a §7 desde esta fase**
15. **Un campo de spec que nadie ramifica es decoración, y miente en la
    dirección peligrosa.** `kind` describía una capacidad que el código no
    tenía. Todo campo declarativo necesita un gate que lo valide o una rama
    que lo consuma; si no tiene ninguno de los dos, no existe.
16. **`false` y "no sé" no son el mismo valor.** Un booleano que colapsa
    "medí que no" con "no pude medir" hace indistinguible una respuesta
    terminada de una truncada. Cuando la ausencia de dato es posible, el tipo
    tiene que poder expresarla.
17. **Ausencia y latencia se ven igual desde adentro.** Cuando el disparador
    de una excepción es "no encontré nada", primero hay que descartar que sea
    "todavía no cargó". Una excepción aprobada sobre un diagnóstico de
    ausencia hay que revisarla cuando aparece evidencia de timing.
18. **Un selector por `aria-label` puede cambiar por ESTADO, no sólo por
    idioma.** El botón de envío de Claude alterna entre inglés deshabilitado
    y español habilitado en la misma sesión.
19. **Revertir una prueba destructiva sobre trabajo NO commiteado se hace
    desde el artefacto, nunca desde git.** `git checkout`, `git restore
    --source=HEAD` y `git stash` restauran el estado anterior a la entrega.
    Si además el valor de prueba coincide con el que había en HEAD, el
    resultado es indistinguible de una corrupción del repositorio.
20. **Antes de declarar una anomalía del entorno, hay que descartar que el
    estado "imposible" sea simplemente HEAD.** Un contenido que git jura que
    está commiteado casi siempre está commiteado.
21. **Un error de envio que no distingue "el control nunca aparecio" de "el
    control aparecio deshabilitado" manda a arreglar el lado equivocado.** El
    primero significa que el editor no registro el texto y el problema esta en
    la ESCRITURA; el segundo, que el texto entro y hay otra cosa bloqueando.
    Es la misma forma que el veredicto de continuidad: un valor por defecto
    que colapsa "no paso" con "no pude ver".
22. **`writePrompt` se confirma a si mismo en editores ricos.** Escribe
    `textContent` y despues verifica leyendo `textContent`: siempre da
    verdadero. ProseMirror y Quill mantienen su propio modelo y no se enteran,
    asi que el control de envio nunca se habilita. La verificacion tiene que
    mirar un efecto del EDITOR, no un eco de lo que uno acaba de escribir.
23. **Un `KeyboardEvent` construido sólo con `key` llega con `keyCode` 0.**
    Mucho editor rico decide por `keyCode === 13`. El evento resulta
    sintacticamente valido y semanticamente invisible.
24. **Un diagnostico tomado en un estado que no existe en el momento del
    fallo no vale.** El sondeo mira la pagina EN REPOSO. Yo use su lista de
    candidatos vacia para descartar una hipotesis sobre lo que pasa DESPUES de
    escribir, y la hipotesis era correcta: en Claude conviven dos botones y
    `querySelector` devolvia siempre el primero, deshabilitado. Antes de usar
    una observacion como evidencia hay que preguntarse en que estado se tomo.
25. **Una lista de candidatos vacia no prueba ausencia.** Gemini muestra el
    microfono en lugar del boton de enviar mientras el compositor esta vacio.
26. **Un instrumento hecho para no suponer no puede suponer.** Los patrones de
    `envio` del sondeo fallaban con Gemini por tres suposiciones simultaneas:
    `data-testid` con "send", `aria-label` en ingles ("Enviar" no contiene
    "end") e iconos `<svg>` en vez de `<mat-icon>`. Inglés y React dados por
    sentado dentro de la herramienta de derivacion.
27. **Un limite escrito con la palabra equivocada bloquea trabajo legitimo y
    no protege nada extra.** El sondeo decia "no escribe". La linea que
    importa es **no envia**: enviar consume cuota, deja un mensaje en la
    conversacion y no se deshace; escribir en un cuadro de texto no hace nada
    de eso. Con la formulacion gruesa, el instrumento no podia observar el
    unico estado en el que ocurren los fallos que tiene que diagnosticar.
    Redibujar un limite no es relajarlo: es ponerlo donde estaba el riesgo.
28. **Una garantia que no se mide es una intencion.** El sondeo promete
    limpiar el compositor; ahora lo comprueba y lo reporta en
    `compositorLimpio`. Si algun dia sale `false`, se sabe en esa corrida.
29. **El tamaño del PANEL es una variable de la prueba, no un detalle
    estetico.** Con cuatro vistas en grilla cada panel mide alrededor de
    800x434, y varias interfaces cambian de layout —o de atributos— por debajo
    de cierto ancho. Correr uno solo a pantalla completa y cuatro en grilla
    compara dos cosas distintas sin decirlo. De ahi `--cc-ventana=<w>x<h>`.
30. **"No lo encontre" son dos diagnosticos con el mismo nombre.** Si la
    pagina no tiene NINGUN cuadro de texto, no monto su interfaz y el problema
    es tiempo o contencion. Si tiene varios pero el selector no matchea,
    cargo y muestra otra cosa. Los arreglos son opuestos, asi que el error
    tiene que decir cual de los dos es. Es la tercera vez que aparece la misma
    forma de defecto en esta fase: un valor por defecto que colapsa "no paso"
    con "no pude ver".
31. **Un arbol de diagnostico sólo discrimina si la corrida de control
    reproduce el fallo.** Si el control sale verde, las ramas de contraste
    dejan de significar lo que decian: todas en verde prueban que el fallo es
    intermitente, no cual era su causa. Antes de leer el arbol hay que
    verificar que el sintoma estaba presente.
32. **Una sola corrida verde no cierra un fallo intermitente.** Lo que hay que
    reportar es la tasa sobre varias corridas, no el ultimo resultado.
33. **El commit que cierra una fase incluye el BLUEPRINT.** Si el ledger
    sigue diciendo que falta lo que ya está hecho, la próxima sesión arranca
    sobre una premisa falsa — que es exactamente lo que el ledger existe para
    evitar.

### Fase 2 — verificada en la máquina de Juan (2026-08-10)

**Cerrada con datos del CAMINO REAL, no del arnés.** Juan generó dos rondas
desde la ventana de la aplicación y volcó el registro con
`--cc-historial=<id>`. Eso importa más que el verde de una corrida del arnés:
lo que la fase tenía que probar es que el uso normal —el compositor, el botón
de leer— produce hechos con procedencia, y el arnés recorre un camino propio.

| Qué | Medido |
|---|---|
| conversación | **1**, con `esPrueba: false` |
| rondas | **2** |
| intentos | **8**, los ocho con `ok: true` y `error: null` |
| respuestas | **8** |
| `finDe` | presente en las ocho: **observado** en chatgpt y glm, **inferido** en claude y gemini |
| `modelLabel` | con valor en claude (`Haiku 4.5`), glm (`GLM-4.7`) y gemini (`GeminiFlash-Lite`); **`null` en chatgpt**, exactamente como declara su `_notaModelo` |
| continuidad | **`indeterminada` en la ronda 1 → `confirmada` en la ronda 2**, en los cuatro |
| `lineasIlegibles` | **vacío**, y `ultimaLineaIncompleta: false` |
| largo de las respuestas | ronda 1: **4.007 / 5.014 / 5.043 / 5.574** caracteres · ronda 2: **246 / 225 / 221 / 259** |

El `indeterminada → confirmada` es el resultado que la fase perseguía y es la
forma correcta: en la primera ronda no hay ronda anterior contra la cual
comparar el contador de navegaciones, así que decir "confirmada" ahí sería
afirmar lo no medido. Se confirma recién cuando existe la comparación.

**Sobre el largo de las respuestas, porque el crudo corrigió lo que se venía
diciendo.** La ronda 1 usó un prompt largo —el requisito que la Fase 1 dejó
abierto— y dio respuestas de 4.007 a 5.574 caracteres; la ronda 2 fue una
pregunta corta de seguimiento y dio de 221 a 259. "Respuestas de 4.000 a 5.500
caracteres" describe la ronda 1 y no las ocho, y además recorta por arriba: el
máximo real es 5.574. Se registra el crudo de las dos rondas.

#### Lo que queda ABIERTO al cerrar la Fase 2

No se cierra como resuelto lo que no se explicó. Las dos cosas pasan a la
Fase 3:

1. **Por qué el camino real y el sondeo veían sesiones distintas NUNCA se
   explicó.** Queda ABIERTO. No se le inventa una causa: hay hipótesis
   plausibles —dos procesos, momento de la muestra, la carpeta de datos— y
   ninguna se midió por separado, así que elegir una sería narrar en vez de
   medir (§7.52 es exactamente ese error).
2. **El defecto de la etiqueta de modelo de gemini queda ABIERTO** y pasa a la
   Fase 3. El registro del camino real guarda `GeminiFlash-Lite`: sin el
   número de versión y sin los espacios, contra "Gemini 3.5 Flash-Lite" que el
   sondeo lee en reposo. El detalle medido está arriba, en §5 → Fase 3.

**Lecciones que se suman desde la apertura de la Fase 2**
34. **El typecheck no mira dentro de una cadena.** `FUENTE_SONDEO` es un
    literal de plantilla: para TypeScript es texto, no código. Un paréntesis
    de más compila perfecto y falla recién dentro de la página del proveedor,
    en una corrida que cuesta minutos de carga y logins ya hechos. Es la misma
    frontera que motivó `guard:specs` —el typecheck no cruza el
    `JSON.stringify`— del otro lado del mismo problema. De ahí `guard:sondeo`.
35. **Un marcador de gate que aparece en más de un lugar hace pasar el gate
    por el motivo equivocado.** Medido al escribir `guard:sondeo`: la
    comprobación de que se midieran las tres formas de escritura buscaba
    `"execCommand"`, `"paste"` y `"textContent"` sueltos, y esos nombres
    también aparecen en las ramas de la función que escribe. Con la lista del
    bucle recortada a dos formas, el gate seguía dando OK. La corrección fue
    comprobar la LISTA literal que recorre el bucle. Se suma a las cinco
    formas de §7.7 en que un gate miente: **una sexta es un marcador que el
    archivo contiene por otra razón.**
36bis. **Medir en un instante fijo convierte "todavía no" en "no existe".**
    El sondeo dormía 1500 ms y miraba una vez. El 2026-08-02, claude dio
    `envioNodosDespues: 0` en 2 de 3 corridas a panel angosto y en 0 de 3 a
    panel ancho. Con n=3 por condición eso NO separa "el ancho lo causa" de
    "es intermitente en las dos y la ancha tuvo suerte" — la diferencia no es
    distinguible del azar. Lo que sí se separa es midiendo **cuánto tarda** en
    aparecer el control en vez de si está a los 1500 ms: un binario no tiene
    distribución, una latencia sí. Es la misma familia que §7.16 y §7.30: un
    valor que colapsa dos estados distintos.
37. **`mutacionesFuera` resultó ser el dato, no el ruido.** Al escribirlo lo
    anoté como métrica de contexto porque en una página viva mide animación de
    fondo. En las seis corridas salió bimodal y perfectamente correlacionado:
    48 cuando el control de envío no aparece, 52 cuando aparece. Un delta de 4
    constante es un montaje de componente, no ruido. La lectura correcta es
    que hay una carrera con el montaje de la página, y de ahí que el sondeo
    ahora registre también `msDesdeNavegacion` y `readyState`.
38. **El tamaño de ventana pedido no es el que se aplica, por dos motivos
    distintos y ninguno visible.** `--cc-ventana` fijaba el MARCO, y en Windows
    eso resta ~16 px de ancho y ~39 de alto: pedir 350x700 daba paneles de
    334x529. Y una petición mayor que la pantalla se recorta en silencio: pedir
    1600 sobre una pantalla de 1366 dio 1350, y una corrida entera se informó
    como "ventana completa 1600x1000" sin serlo. Ahora el flag fija el
    CONTENIDO y se informan `ventanaPedida` y `ventanaReal`, las dos.
39bis. **Todo número que me llegó resumido no reprodujo; todo número que me
    llegó crudo se sostuvo.** La ronda del 2026-08-02 informó, sin crudo, que
    el envío de claude fallaba 2 de 3 veces a panel angosto y 0 de 3 a ancho,
    con `mutacionesFuera` bimodal en 48/52. Con el crudo en la mano, **12 de 12
    corridas dan éxito** a los dos anchos y con los tres métodos, con
    `mutacionesFuera` constante en 52. Ni la intermitencia ni la bimodalidad
    reproducen. No se establece si aquello fue narrado en vez de leído o si la
    página cambió; lo que queda establecido es que un resumen no sirve de base.
40. **El id iba primero en `selectorDe` y para este dominio estaba al revés.**
    El botón de modelo de claude tiene `data-testid="model-selector-dropdown"`
    —estable, y ya en la spec— y el sondeo proponía `#base-ui-_r_8l_`, un id
    generado por la librería de componentes. Igual en chatgpt: `#radix-_r_3_`
    contra `data-testid="model-switcher-dropdown-button"`. Derivar de esos ids
    daba selectores que fallan en la corrida siguiente. Peor todavía, el id de
    glm es `#model-selector-glm-4_7-button`: **lleva la versión del modelo
    adentro**, así que un selector así se rompe exactamente cuando el modelo
    cambia, que es el evento que esta fase existe para detectar.
41. **Un filtro sin límites de palabra deja pasar la subcadena.** El filtro de
    etiqueta de modelo exigía una variante, y "mini" casa dentro de "Gemini":
    la palabra "Gemini" sola pasaba como si fuera una etiqueta, y devolvió tres
    candidatos inútiles incluido el título accesible de la página.
62. **Una comprobación escrita DESPUÉS del `exit` no comprueba nada.** La regla
    nueva de `guard:specs` —exigir `_notaModelo` donde no hay `modelLabel`— se
    agregó al final del archivo, es decir después del bloque que ya había
    salido con error. Recolectaba fallos que nadie miraba. La prueba en rojo lo
    delató: quitando la nota, el gate seguía dando OK. Sexta forma de gate que
    miente, y la primera que se detecta ANTES de confiar en ella.

#### Etiqueta de modelo — estado al cierre de la derivación

| | selector | qué dice |
|---|---|---|
| claude | `button[data-testid="model-selector-dropdown"]` | "Modelo: Haiku 4.5" en el aria-label ✔ |
| glm | `button[aria-label="Select a model"]` | "GLM-4.7" en el texto ✔ |
| gemini | `div[data-test-id="logo-pill-label-container"]` | "Gemini 3.5 Flash-Lite" ✔ **— este ✔ vale SÓLO con el compositor en reposo; ver §5, Fase 3. Con el compositor escrito ninguna vía del sondeo lo propone (0 de 6), y el camino real —que lee después de enviar— guarda "GeminiFlash-Lite", sin el número. Causa PENDIENTE de la próxima ronda real; el instrumento ya está.** |
| chatgpt | `button[data-testid="model-switcher-dropdown-button"]` | sólo "ChatGPT". **Sin versión.** |

En gemini el botón hermano lleva la versión DENTRO del `aria-label`
("…actualmente 3.5 Flash-Lite"), así que se rompe justo cuando el modelo
cambia: por eso va el `div`, que es estable y deja la versión en el texto. Es
la misma trampa que el id de glm, `#model-selector-glm-4_7-button`.

En chatgpt, medido en cinco corridas y a dos anchos de panel: **la versión no
está en la cabecera**, y no es un problema de ancho. La deriva de versión no es
detectable ahí desde el encabezado, y la procedencia va a quedar con
`modelLabel` en `null`. Queda anotado en la spec y `guard:specs` ahora EXIGE
esa nota. Pendiente para más adelante: buscarla en los atributos de los
mensajes de respuesta, que sólo existen cuando ya hay conversación.

60. **REGLA DURA: ninguna tanda de diagnóstico se corre contra las particiones
    reales.** El 2026-08-09 se ordenaron veinte aperturas y cierres alternados
    sobre `persist:chatgpt`, `persist:claude`, `persist:glm` y `persist:gemini`
    para comparar dos formas de lanzar la aplicación. Al terminar, los CUATRO
    proveedores estaban deslogueados — incluidos glm y gemini, que venían
    sobreviviendo a todo. §7.48 ya tenía registrado que abrir y cerrar en
    sucesión rápida sobre la misma partición corrompe la base de sesión, y aun
    así el diagnóstico se diseñó exactamente así. **Es la segunda vez que la
    medición destruye lo que iba a medir**, después del caso de `/logout`.
    Desde acá: el banco de pruebas usa particiones sintéticas, y las cuatro
    reales se abren sólo para USAR la aplicación o para correr el arnés, nunca
    para diagnosticar.
61. **El agente propuso la partición sintética y se lo rechacé.** Dos rondas
    antes de perder las cuatro sesiones, Code ofreció medir "con una partición
    sintética propia (no toca chatgpt/claude de verdad)" y la respuesta fue
    "ninguna de las dos". Tenía razón él.
57. **El instrumento cerraba la sesión que intentaba medir.** Con el token a
    medio validar, `claude.ai/new` REDIRIGE a `claude.ai/logout`, y esa página
    no es un cartel: cierra la sesión de verdad, del lado del servidor. Cada
    sondeo que caía ahí destruía el login que iba a medir. De ahí el cuadro que
    parecía imposible: Juan veía las cuatro sesiones abiertas en pantalla —hay
    captura— y el agente, con el mismo binario y la misma carpeta, no
    encontraba ninguna. No era que no se guardara: era que **mirarla la
    rompía**. Se bloquean `will-navigate` y `will-redirect` hacia cualquier
    endpoint de cierre de sesión, y el bloqueo se informa.
58. **Cuatro rondas arreglando la escritura porque nunca cuestioné que el
    problema fuera de escritura.** Carpeta propia, cerrojo de instancia única,
    volcado en `before-quit`, `app.exit` por `app.quit`: todos arreglos reales
    y ninguno tocaba la causa. La señal que lo habría delatado estaba desde el
    principio en el informe —`url: "https://claude.ai/logout"`— y se leyó como
    consecuencia de la corrupción en vez de como causa de la pérdida.
59. **La hipótesis de "cookie de sesión contra persistente" quedó refutada por
    medición**, y la refutó el agente: chatgpt conserva 7 cookies persistentes
    y aun así cae a `/auth/login`. Si fuera sólo el tipo de cookie, esas
    alcanzarían.
55. **Una excepción "angosta" por ARCHIVO apaga la prohibición entera.** Para
    poder probar que `localStorage` sobrevive al cierre se abrió una excepción
    en `guard:artefacto`, atada al marcador `cc_persistencia_ls` y evaluada
    **por archivo**. Pero `main/index.js` es UN SOLO archivo empaquetado con
    todo el proceso principal adentro, y ese marcador está además en la lista
    de EXIGIDOS, o sea que tiene que estar siempre. La prohibición quedaba
    apagada por completo y para siempre, con forma de excepción angosta — y su
    propio comentario afirmaba lo contrario. Corregido a evaluación **por
    línea**, con el literal en línea en cada acceso: cada toque queda marcado y
    auditable de un vistazo. Probado en rojo sobre el compilado.
56. **Escalar y proceder igual no es escalar.** El agente dijo que el choque
    con el gate era decisión de diseño y que no lo resolvería solo, y en el
    mismo informe lo resolvió, anotando en el código "decisión de Juan" por una
    decisión que Juan nunca tomó. La regla se explicita: **escalar significa
    PARAR.** Y ninguna línea de código puede atribuir una decisión a Juan sin
    que Juan la haya escrito.
53. **`app.exit()` saltea justo la parte que escribe.** El volcado terminaba en
    `app.exit(0)` para "asegurar" la salida. `exit` mata el proceso de una y se
    saltea el desmontaje ordenado de Chromium, que es donde se terminan de
    escribir las bases a disco. Usar la salida dura para asegurar una escritura
    la impide. Va `app.quit()`, y el cerrojo `cerrando` hace que la segunda
    vuelta por `before-quit` no reentre.
54. **Un ciclo de verificación que necesita a una persona no se puede iterar.**
    Comprobar si una sesión sobrevive al cierre exigía que Juan entrara a mano
    en cuatro proveedores por cada intento de arreglo. Cinco rondas y cero
    progreso. Lo que hay que probar no es el login: es que **algo escrito en
    una partición siga ahí después de cerrar**, y eso se prueba con una cookie
    propia y un reloj, sin cuentas y sin humano. De ahí `--cc-sesion`. La regla
    general: **antes de iterar sobre un arreglo, separar el mecanismo bajo
    prueba de todo lo que exija una persona.**
50. **El volcado de sesión enganchado en dos modos dejaba afuera al que más lo
    necesitaba.** El arreglo del volcado se puso en los `finally` de
    `--cc-test` y `--cc-probe`. En `--cc-login` el proceso no cierra solo: lo
    cierra Juan con la X, y ese camino iba directo a `app.quit()`. Medido:
    después de un login completo en los cuatro, las cookies siguieron en
    10 / 27 / 13 / 6 — **los mismos números que en la carpeta recién creada**.
    El login no se perdió después: nunca llegó a escribirse. El enganche pasa a
    `before-quit`, por donde salen todos los caminos. Un punto, no tres.
51. **`flushStorageData()` no devuelve promesa, y envolverlo en `Promise.all`
    daba una seguridad falsa.** La versión anterior parecía esperar el volcado
    y en realidad sólo esperaba su propio temporizador. Un `await` sobre algo
    que no es promesa es peor que no tenerlo: se lee como garantía.
52. **Diagnóstico correcto, explicación inventada.** El agente ubicó bien el
    camino sin volcado, y después agregó que glm y gemini sobrevivieron porque
    "persisten cookies de forma más sincrónica" y claude y chatgpt "dependen
    más de IndexedDB". Nada de eso se midió. Lo observable es que las cuatro
    cuentas quedaron en el conteo de carpeta nueva; **glm y gemini se veían
    funcionando porque admiten uso anónimo**, no porque hubieran persistido
    nada.
48. **Dos procesos sobre la misma partición corrompen la sesión, y el diseño
    del arnés produce esa condición sola.** El 2026-08-02 Chromium reportó una
    base de sesión corrupta en la partición de claude, la borró para
    recuperarse, y con eso se fue el login: claude.ai rebotó `/new` a `/logout`
    porque el token ya no valía. Dos mecanismos, los dos plausibles y ninguno
    demostrado por separado: (a) Juan con la aplicación abierta mientras el
    agente corría un sondeo en otro proceso, y (b) `app.quit()` inmediato
    después de emitir el informe, con Chromium escribiendo de forma asincrónica
    — repetido en unas veinticinco corridas, una por proceso, que es
    precisamente el diseño que elegimos para no esconder carreras. Se cierran
    los dos: cerrojo de instancia única y volcado de sesión antes de salir.
49. **Un gate nuevo agarró al que lo escribió, en la entrega siguiente.**
    `guard:sondeo` —el rechazo del acento grave, agregado el 2026-08-02—
    frenó un comentario mío con acentos graves en la entrega inmediatamente
    posterior. Es la prueba de que el gate no era decorativo.
47. **La aplicación no tenía carpeta propia.** Medido: `userData` devolvía
    `AppData\Roaming\Electron`, el nombre genérico de Electron, porque al
    arrancar con `electron out/main/index.js` no toma el nombre del paquete.
    Las sesiones de los cuatro investigadores vivían en una carpeta compartida
    con cualquier otra aplicación de Electron en modo desarrollo — explicación
    plausible, **no demostrada**, del login que desapareció. Y la persistencia
    de la decisión 1 iba a escribir los datos de investigación ahí mismo. Se
    arregla ANTES del primer dato escrito, no después.

#### Cierre de la decisión 2 — cómo se escribe, con medición

Trece corridas de claude, tres de gemini, tres de glm, una de chatgpt:

| método | chatgpt | glm | claude | gemini |
|---|---|---|---|---|
| `textContent` | 366 ms | 266 ms | 252–798 ms | 257–267 ms |
| `execCommand` | 619 ms | 920 ms | 254–315 ms | 311–421 ms |
| `paste` | 1101 ms | **el texto no entra** | 262–305 ms | **el texto no entra** |

`paste` se descarta: falla en dos de cuatro. **`textContent` queda como método
principal —que es lo que `writePrompt` ya hace— y `execCommand` como respaldo.**

Con esto **§7.22 se cierra: la escritura nunca fue la causa del fallo de
envío.** En las diecisiete corridas medidas, cuando el control de envío
aparece, aparece con cualquier método que haya dejado el texto.

43. **Un filtro de dos condiciones excluye el caso que sólo cumple una.** La
    búsqueda de etiqueta de modelo exigía familia Y versión. El selector de
    gemini no dice "Gemini": dice la versión sola. La regla dejaba afuera al
    único proveedor que faltaba. De ahí la tercera vía, **estructural**: no
    pregunta cómo se llama sino qué es — un control con texto corto que
    contiene un número.
44. **Cambiar un marcador deja huérfana la basura vieja.** El resto olvidado en
    chatgpt era `sondeo`; la autolimpieza comparaba contra el marcador nuevo,
    no coincidía, y tres corridas seguidas se abstuvieron de medir tratándolo
    como borrador de Juan. Un instrumento tiene que reconocer TODA su propia
    basura, no sólo la de la versión de hoy.
45. **Un acento grave dentro del literal inyectado lo cierra antes de tiempo, y
    el gate valida el fragmento equivocado.** Un comentario con acentos graves
    rompió `FUENTE_SONDEO`: el typecheck lo agarró, pero `guard:sondeo` siguió
    dando OK sobre un pedazo mal cortado. Un gate que valida el texto
    equivocado es peor que no tenerlo. Ahora rechaza el acento grave.
46. **Cuando un gate frena una entrega, se cede.** `guard:artefacto` prohibió
    el atributo de menú desplegable en el detector estructural. Sólo se leía,
    no se clicaba, así que había excusa para aflojarlo — y la excusa es
    exactamente la forma de la excepción de clic que ya se revirtió una vez. Se
    reescribió el detector sin ese atributo.
42. **Una herramienta que su dueño no puede abrir no está hecha.** Hasta el
    2026-08-02 la única forma de abrir ChatCouncil era un comando de pnpm en
    una terminal. De ahí `AbrirChatCouncil.cmd`.
39. **Un resumen no es una salida real.** Dos rondas de reconocimiento
    llegaron resumidas porque el bloque crudo es largo y se pierde al copiar.
    De ahí `--cc-salida=<ruta>`: el crudo se adjunta como archivo en vez de
    transcribirse.
36. **Un instrumento de medición no puede destruir el dato que mide.** El
    sondeo escribe en el compositor para medir; si el compositor ya tenía
    texto, ese texto es un borrador de Juan. Se omite la medición y se dice
    por qué, en vez de borrarlo.
