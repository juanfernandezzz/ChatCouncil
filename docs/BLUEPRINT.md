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

### Fase 1 — Armazón y los investigadores 🟡

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

#### Estado y lo que falta

**Dos de cuatro investigadores.** ChatGPT y GLM tienen sus selectores
derivados y validados. **Faltan `claude` y `gemini`**: hay que derivar sus
specs del DOM real con `--cc-probe`. Es lo único que separa esta fase de
estar completa, y no requiere tocar el armazón.

**Trampa que la v2 no dejó registrada: los selectores por `aria-label` son
LOCALIZADOS.** GLM pasó la Fase 0 con `[aria-label="Stop"]` porque la cuenta
está en inglés. Si la de Claude o Gemini está en español, el selector obvio
no matchea nada y el síntoma se parece a un fallo del armazón. Al derivar,
preferir `id` y `data-testid` —que son estables— sobre `aria-label`, y si no
hay más remedio que usarlo, dejar anotado el idioma de la cuenta.

### Fase 2 — Persistencia y procedencia ⏳
Modelo de datos local, historial de conversaciones, y la procedencia por
turno (etiqueta de modelo, continuidad de hilo) para hacer detectable la
deriva de versión.

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

**Lecciones que se suman a §7 desde esta fase**
13. **En Electron, un preload con `contextIsolation` no puede exponer nada
    escribiendo en `window`.** Sólo `contextBridge.exposeInMainWorld` cruza al
    mundo principal, que es donde corre `executeJavaScript`.
14. **Declarar la dependencia de workspace, aunque el monorepo "encuentre" el
    paquete igual.** Sin la declaración, el typecheck no resuelve el import.
