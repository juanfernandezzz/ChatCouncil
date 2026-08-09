# ChatCouncil — BLUEPRINT v3 (aplicación de escritorio)

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

### Los tres roles (conjuntos DISJUNTOS)

| Rol | Modelos | Qué hace |
|---|---|---|
| **Investigadores** | Claude, Gemini, ChatGPT, GLM | Reciben la misma pregunta en paralelo, cada uno en SU interfaz real, con sus capacidades nativas activables (razonamiento, búsqueda). Diálogo multi-turno: cada uno mantiene su conversación. |
| **Analistas** | Qwen (extracción), Kimi (análisis comparativo) | Dos llamadas sobre el turno actual que producen un output unificado. |
| **Operador** | DeepSeek | Ejecuta las herramientas que el usuario escribe sobre ese output. |

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
| `guard:judge` | El prompt del evaluador no puede ver la identidad del proveedor. |
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

### Fase 2 — Persistencia y procedencia ⏳
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

### Fase 3 — Capa de analistas ⏳
Extracción a pedido, anonimización con barajado y garantía estructural,
Qwen y Kimi sobre el turno actual, conteos calculados en código.

### Fase 4 — Operador y herramientas ⏳
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
39. **Un resumen no es una salida real.** Dos rondas de reconocimiento
    llegaron resumidas porque el bloque crudo es largo y se pierde al copiar.
    De ahí `--cc-salida=<ruta>`: el crudo se adjunta como archivo en vez de
    transcribirse.
36. **Un instrumento de medición no puede destruir el dato que mide.** El
    sondeo escribe en el compositor para medir; si el compositor ya tenía
    texto, ese texto es un borrador de Juan. Se omite la medición y se dice
    por qué, en vez de borrarlo.
