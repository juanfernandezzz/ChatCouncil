# ChatCouncil — Blueprint Arquitectónico (/goal)

> Este documento es la fuente de verdad del plan de ejecución. Vive en el
> repo (no solo en el chat) para que cualquier sesión futura — tuya, mía,
> o de Claude Code trabajando de forma autónoma — pueda retomarlo sin
> releer todo el hilo de la entrevista. Cross-referencias `Qn` apuntan a
> las respuestas de la entrevista de requerimientos original.

**Estado global:** Fases 0 y 1 completas y verificadas. Fases 2–9
pendientes, en orden de dependencia estricta (Q34: no saltar de UI a
lógica de transporte sin cerrar la anterior).

**Leyenda:** ✅ hecho y verificado · 🔜 siguiente · ⏳ bloqueado por lo anterior

---

## 0. Ledger de verificación (2026-07-02)

Todo lo que sigue fue investigado activamente (búsquedas + lectura de
fuentes primarias donde existían, más una instalación y build real del
scaffold en un sandbox) — no completado desde memoria. Cada fila trae
su nivel de confianza porque varios de estos hechos son inherentemente
frágiles (comportamiento no documentado, cambia sin aviso).

| Hallazgo | Confianza | Implicación |
|---|---|---|
| WXT es el framework recomendado en 2026 sobre CRXJS/Plasmo (activamente mantenido, ~9.2k stars, Vite nativo) | **Alta** | Confirmado Q32. Verificado además compilando de verdad (ver §0.1). |
| Anthropic soporta CORS directo desde navegador agregando el header `anthropic-dangerous-direct-browser-access: true` | **Alta** | Estable desde ago-2024, multiples fuentes independientes 18+ meses. Claude es BYOK-viable en movil. |
| OpenAI **bloquea** CORS por defecto, sin header de opt-in oficial conocido | **Moderada-alta** | Multiples reportes tecnicos 2023→mar-2026 con el mismo error exacto. OpenAI queda fuera de BYOK movil salvo que aparezca un opt-in oficial. |
| Google Gemini (`generativelanguage.googleapis.com`) permite fetch directo con `x-goog-api-key` | **Moderada** | Reportes 2026 de apps cliente-servidor reales; los bugs reportados son de exposicion de headers puntuales, no de bloqueo base. |
| DeepSeek y Perplexity: sin via directa documentada, todas las integraciones de referencia usan proxy | **Moderada** | Consistente con lo que Juan ya reportaba de su propia experiencia. Tratar como bloqueados. |
| Groq, xAI, OpenRouter, Mistral | **Baja / desconocida** | Evidencia parcial o contradictoria (ver `capability-matrix.ts`). **No hardcodear**: requiere `probeCors()` en runtime (Fase 2). |
| Tailwind v4 no usa `tailwind.config.js` ni PostCSS por defecto — `@tailwindcss/vite` + bloque `@theme` en CSS | **Alta** | Cambia el scaffold real entregado (sin config file legacy). |
| GIS OAuth2 token client (`initTokenClient`, implicit grant) es un flujo **distinto** de FedCM/Sign-In | **Alta** | FedCM afecta el login (`google.accounts.id`), no el token de acceso a Drive. El token de Drive no tiene refresh token por diseño del implicit grant — "silencioso" significa re-pedir el access token, no refrescarlo. |
| Google Drive API v3 (`files.list/create/get`) soporta CORS con Bearer token; sub-recursos puntuales (ej. `thumbnailLink`) NO | **Moderada** | Evita el patron mas fragil (uploads resumibles) para v1: multipart simple alcanza para JSON de texto+metadata (Q18). |
| Netlify soporta pnpm nativo via Corepack; con monorepo, dejar `base` sin fijar (o el lockfile en la raiz no se detecta y cae a npm, rompiendo `workspace:*`) | **Alta** | `netlify.toml` ya escrito siguiendo esta regla exacta. |
| pnpm 11 eliminó `onlyBuiltDependencies`/`ignoredBuiltDependencies` de `package.json#pnpm` — el reemplazo es un único mapa `allowBuilds` en `pnpm-workspace.yaml` | **Alta** | Descubierto por el propio pnpm instalado (warning real: *"The pnpm field in package.json is no longer read"*), no desde memoria — es un cambio posterior a cualquier tutorial preexistente. Sin esto, `pnpm install` deja `esbuild`/`spawn-sync` en estado "build ignorado" y `pnpm -r run <script>` puede fallar de forma intermitente en su chequeo interno de deps-status. Ya corregido en `pnpm-workspace.yaml`. |
| pnpm 11 requiere **Node ≥ 22** (soporte para Node 18/19/20/21 eliminado; pnpm 11 es ESM puro) | **Alta** | Descubierto por fallo real del primer deploy en Netlify: corepack ejecutando pnpm 11.9.0 bajo Node 20.19.0 (pineado por `.nvmrc`/`netlify.toml`) crashea con `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` antes de instalar nada. El sandbox de verificación corría Node **v22.22.2** — por eso la incompatibilidad no apareció localmente: los pins del repo divergían del entorno realmente verificado. Corregido alineando `.nvmrc`, `netlify.toml`, CI y `engines` a `22.22.2` / `>=22.12.0` (el piso 22.12 lo fija Vite 7, que exige 20.19+ ó 22.12+; con pnpm 11 exigiendo ≥22, el piso combinado real es 22.12). Lección operativa: el ledger debe registrar también la versión de Node del entorno de verificación, no solo los resultados. |

### 0.1 Verificación ejecutada de punta a punta

No es teoría: el scaffold de Fase 0 se instaló y compiló de verdad en
un sandbox antes de entregarlo. Entorno del sandbox: **Node v22.22.2 +
pnpm 11.9.0** — dato que resultó ser la variable oculta del primer
deploy en Netlify (ver fila "pnpm 11 requiere Node ≥ 22" del ledger).

```
pnpm install                               → 512 paquetes resueltos, 0 errores
pnpm -r run typecheck                      → 5/5 packages, 0 errores de tipos
pnpm --filter @chatcouncil/web build       → vite 7.3.6, build limpio (203 KB JS, 9.3 KB CSS)
pnpm --filter @chatcouncil/extension build → wxt 0.20.27, manifest.json valido generado
pnpm --filter @chatcouncil/extension zip   → .zip de la extension generado
```

La clave RSA en `apps/extension/wxt.config.ts` es una clave de
**desarrollo real** (generada para este scaffold, la privada no se
distribuye) cuyo ID derivado coincide exactamente con el
`VITE_EXTENSION_ID` por defecto en la SPA — verificado recalculando el
ID desde el `manifest.json` ya compilado, no solo desde la clave
fuente. Efecto práctico: cargar la extensión sin empaquetar y correr
`pnpm dev` deja el handshake (Q7/Q9) funcionando sin configurar nada.
Antes de cualquier distribución real, regenerar la clave (instrucciones
en `docs/DEPLOY.md`).

### 0.2 Ledger de verificación — Fase 1 (2026-07-04)

Igual que Fase 0: código escrito contra el repo clonado y verificado en
sandbox (**Node v22.22.2 + pnpm 11.9.0**) antes de entregar. Hallazgos y
decisiones nuevos:

| Hallazgo / decisión | Confianza | Implicación |
|---|---|---|
| La lifetime de un `offscreen document` es **independiente** del service worker; ilimitada para todo `reason` salvo `AUDIO_PLAYBACK` (cierra a 30s sin audio) | **Alta** | Base de la decisión B: el offscreen sobrevive a la muerte del SW y sostiene el buffer de reanudación en memoria. Verificado contra doc de Chrome + reportes de campo. El test manual de Juan (matar el SW) es la prueba final de que terminar el SW no tira también el offscreen. |
| Un offscreen document sólo puede usar `chrome.runtime` (no `storage`/`tabs`) | **Alta** | Por eso el buffer vive en memoria en el offscreen y el cache del manifiesto lo maneja el SW en `storage.local`. Se sortea la incertidumbre de campo sobre `storage` en offscreen no dependiendo de él. |
| Desde Chrome 114 abrir un Port ya **no** resetea el timer de suspensión del SW; sólo enviar mensajes lo hace. Chrome 116: sólo WebSocket extiende lifetime, no `fetch`/SSE | **Alta** | El offscreen no es opcional: un stream de varios minutos no puede vivir en el SW. Confirma la arquitectura SW-router-liviano + offscreen-dueño-del-stream. |
| `browser.offscreen` (incl. `Reason`, `createDocument`) y `browser.runtime.getContexts` están **tipados en WXT** (`@wxt-dev/browser`) | **Alta** | No hace falta `@types/chrome`. Se usa `browser.*` en toda la extensión. |
| WXT genera el tipo `PublicPath` de `getURL` desde los entrypoints; un entrypoint nuevo exige `wxt prepare` para que `getURL("/offscreen.html")` tipe | **Alta** | Descubierto por error de typecheck real (`TS2769`), no desde memoria. `wxt prepare` corre en `postinstall`, así que un `pnpm install` limpio lo regenera. |

**Decisión de alcance (Juan): opción B — preservación de contenido**, no
sólo "error recuperable" (A). Matar el SW a mitad de stream debe reanudar
y no perder contenido. Implementado como **B con piso A**: reanudación
best-effort desde el buffer del offscreen; si es imposible (offscreen
caído / buffer desalojado / reintentos agotados) termina en
`stream:aborted` → nunca hay cuelgue silencioso.

**Bump de protocolo del puente a v2.** `BRIDGE_PROTOCOL_VERSION` sube de
1 → 2 para soportar reanudación: `stream:chunk` lleva `seq`, `stream:done`
lleva `lastSeq`, y se agrega `byoa:resume {requestId, fromSeq}`. **OJO con
la ambigüedad de nombres:** esto es distinto del campo `protocolVersion`
de `adapters.json`, que sigue en **1** — ese campo versiona el *formato
del manifiesto remoto*, no el contrato SPA↔extensión. Son dos ejes de
versión ortogonales a propósito.

**Decisión "cartel" (Q9 transport):** Netlify sirve `/adapters.json` con
`Access-Control-Allow-Origin: *` (header en `netlify.toml`); la extensión
lo fetchea por CORS normal, **sin `host_permissions`** — menos superficie
de permisos, sin warning al instalar. Si el header faltara, degrada al
cache local (ya previsto).

**Self-test (Q7 end-to-end):** providerId reservado `"__selftest__"`
dispara un stream sintético (~40 chunks × 1s ≈ 40s, supera la ventana de
30s) que nace en la SPA y recorre el camino real SPA→SW→offscreen→SW→SPA.
Botón sólo-Fase-1 en la SPA (marcado como scaffolding temporal) con vista
en vivo del transcript para *ver* la reanudación al matar el SW.

```
pnpm -r run typecheck                      → 5/5 packages, 0 errores de tipos
pnpm --filter @chatcouncil/extension build → wxt 0.20.27; manifest con permiso "offscreen",
                                             action.default_popup, entrypoints offscreen.html
                                             + popup.html generados; sin host_permissions
pnpm --filter @chatcouncil/web build       → vite 7.3.6, build limpio (209 KB JS)
```

Nota de honestidad: la correctitud *sin pérdida* de B depende de que el
offscreen sobreviva a la terminación manual del SW (doc lo respalda,
confianza alta). No es verificable en el sandbox (no hay Chrome real) —
el test de aceptación manual de Juan es la prueba. Por eso se construyó
con piso A: aun en el peor caso, no hay cuelgue silencioso.

---

## 1. Topología y grafo de dependencias

```
chatcouncil/
├─ apps/web           → SPA (Netlify). Depende de packages/shared, ui, adapters.
├─ apps/extension     → WXT/MV3. Depende de packages/shared, adapters.
├─ packages/shared    → contratos: Adapter, protocolo del puente, matriz de capacidades.
├─ packages/adapters  → implementaciones concretas por proveedor (BYOK Fase 2, BYOA Fase 3).
└─ packages/ui        → design tokens (Q26), primitivas visuales compartidas.
```

`shared` no depende de nada del monorepo — es la base. `adapters`
depende solo de `shared`. `web` y `extension` son las únicas hojas que
pueden depender de `adapters`. Ningún código de proveedor específico
debe filtrarse a `web`/`extension` directamente: ese es el límite que
hace que Q1 (extensión = runner agnóstico) sea real y no solo
aspiracional.

---

## Fase 0 — Scaffold del monorepo ✅

**Entregado:** estructura completa, configs, esquema Dexie completo
(`db.ts`), contrato de adaptador, protocolo del puente, matriz de
capacidades con hallazgos de CORS, extensión WXT que compila y genera
un manifest válido, SPA que renderiza el grid configurable con detección
de extensión funcional, CI en GitHub Actions, `netlify.toml`.

**Deliberadamente NO incluido** (para no fabricar detalle que no está
verificado): selectores DOM o endpoints internos de ningún proveedor
BYOA, cualquier lógica de negocio de sync a Drive, cualquier llamada
real a un LLM. Ver los comentarios `pending-reverse-engineering` en el
código — son límites reales, no placeholders olvidados.

**Criterio de aceptación:** `pnpm install && pnpm -r run typecheck &&
pnpm build:web && pnpm build:ext` sin errores. *(Cumplido, §0.1.)*

---

## Fase 1 — Puente robusto + ciclo de vida de la extensión ✅

**Objetivo:** que el Port de Q7 sobreviva a la suspensión del service
worker de MV3, y que el handshake de Q9 sea confiable bajo reconexión.
Alcance elevado por decisión de Juan a **preservación de contenido**
(opción B), no sólo error recuperable. Ver §0.2 del ledger.

- **Offscreen document como dueño del stream y del buffer.** El SW es un
  router liviano; el offscreen (lifetime independiente, ilimitada con
  `reason: WORKERS`) sostiene el stream y un buffer en memoria por
  `requestId`. Sobrevive a la muerte del SW → habilita reanudación.
- **Reconexión + reanudación (opción B) con piso A.** `bridge-client.ts`
  mantiene el Port persistente, reconecta con backoff
  `[250,500,1000,2000,4000]ms` y, al reconectar, por cada stream en
  vuelo pide `byoa:resume {fromSeq}`. El offscreen reproduce su buffer
  desde ahí; los chunks se entregan **en orden** vía un buffer `pending`
  (tolera reproducción + chunks en vivo intercalados/duplicados). Si la
  reanudación es imposible → `stream:aborted` (piso) → nunca cuelgue
  silencioso.
- **Protocolo del puente v2.** `stream:chunk`+`seq`, `stream:done`+
  `lastSeq`, nuevo `byoa:resume`. Distinto de `adapters.json.protocolVersion`
  (sigue en 1; versiona el manifiesto, no el puente).
- **Fetch + cache del manifiesto remoto (Q9).** El SW cachea
  `adapters.json` en `storage.local` (TTL 10 min), degrada al último
  cache válido si Netlify falla, o a lista vacía si no hay cache — nunca
  punto único de fallo. Alimenta los adaptadores del handshake.
- **Transporte "cartel":** Netlify sirve `/adapters.json` con CORS
  abierto; la extensión lo fetchea sin `host_permissions`.
- **Popup de diagnóstico** (read-only) mostrando protocolo, Ports
  conectados, offscreen vivo y frescura del manifiesto.
- **Self-test end-to-end** (`__selftest__`) para ejercitar el camino real
  y validar el criterio de aceptación; botón sólo-Fase-1 en la SPA con
  vista en vivo del transcript.

**Módulos entregados:** `packages/shared/src/bridge-protocol.ts` (→v2),
`apps/extension/lib/offscreen-protocol.ts` (contrato interno SW↔offscreen,
NO en shared), `apps/extension/entrypoints/offscreen/` (index.html +
main.ts), `apps/extension/entrypoints/popup/` (index.html + main.ts),
`apps/extension/entrypoints/background.ts` (router + lifecycle + manifiesto),
`apps/extension/wxt.config.ts` (permiso `offscreen`),
`apps/web/src/lib/bridge-client.ts` (cliente persistente; reemplaza el
stub), `apps/web/src/lib/extension-detect.ts` (shim de compat),
`apps/web/src/App.tsx` (wiring + panel self-test), `netlify.toml` (CORS
`/adapters.json`).

**Criterio de aceptación:** matar el service worker manualmente
(`chrome://extensions` → "service worker" → inspeccionar → recargar) a
mitad de un stream simulado no debe perder el mensaje final para el
usuario — debe verse como error recuperable, no como cuelgue silencioso.
*(Bajo B: además preserva contenido y reanuda. Verificación final = test
manual de Juan; el sandbox no tiene Chrome real.)*

---

## Fase 2 — Adaptadores BYOK 🔜 (siguiente)

Orden por prioridad de Q12, pero **reordenado por confianza CORS** para
validar lo mobile-compatible primero: Anthropic → Google → OpenAI →
Mistral/Groq/xAI/OpenRouter (con `probeCors()` real antes de confiar en
la matriz) → DeepSeek/Perplexity (proxy obligatorio desde el día uno).

- Implementar `probeCors(providerId)` de verdad (hoy es una firma
  declarada en `capability-matrix.ts`): un fetch mínimo real contra
  cada API, cacheado en `sessionStorage`, que sobreescribe la
  confianza declarada con un hecho medido en el navegador del usuario.
- Adaptador BYOK genérico en `packages/adapters` implementando el
  contrato `Adapter` de `shared`, parametrizado por proveedor (headers,
  formato de streaming SSE/NDJSON, parseo de la respuesta a
  `AdapterChunk`).
- Proxy de la extensión (Q11): `byok:proxy` en `background.ts`, con
  **allowlist estricta de dominios** (lista blanca explícita de
  `baseUrl` por proveedor, nunca un proxy abierto) y verificación de
  `sender.origin` contra el dominio de la SPA antes de reenviar nada.
- Custodia de llaves (Q10): módulo de `chrome.storage` en la extensión
  para escritorio; módulo de `localStorage` + warning visible en
  componente para móvil. Ninguno de los dos debe ser importado desde
  el módulo de sync de Drive — es la regla dura que hace cumplible
  "las llaves jamás se sincronizan a Drive".

**Criterio de aceptación:** enviar un prompt real a Anthropic y a
Google directo desde el navegador (sin extensión) funciona en Chrome y
en un navegador móvil; DeepSeek/Perplexity funcionan solo con la
extensión activa como proxy.

---

## Fase 3 — Adaptadores BYOA 🔜 (⏳ tras Fase 2)

La fase de mayor incertidumbre real del proyecto — ingeniería inversa
activa, no lectura de documentación. Empezar por el proveedor de la
lista de Q6 que tenga el endpoint interno más estable observado
(típicamente más fácil que DOM automation) y usar ese primer adaptador
para terminar de validar el contrato `AdapterDescriptor` antes de
replicar a los demás.

- Por cada proveedor: investigar en `chrome://net-export` o DevTools
  con la sesión abierta si existe un endpoint interno reutilizable
  (estrategia `endpoint`) antes de resignarse a `dom`. `dom` implica
  mantenimiento continuo — cualquier rediseño de la UI del proveedor
  rompe el selector sin aviso.
- `AdapterDescriptor.notes` de cada proveedor debe documentar la fecha
  de la última verificación manual — esto envejece rápido y silencioso.
- Gestión de pestañas (Q2): grupo dedicado vía `chrome.tabGroups`,
  minimizado; abort limpio con `chrome.tabs.remove` o simplemente
  detener la observación si se decide mantener la pestaña viva entre
  turnos (más barato que reabrir por cada Round).
- Selector de modelo intra-proveedor con discovery (Q4): para
  `endpoint`, casi siempre hay una llamada de "listar modelos
  disponibles en esta sesión" que se puede reutilizar; para `dom`,
  leer el selector nativo del proveedor.

**Riesgo abierto, sin resolver:** ningún adaptador BYOA está diseñado
todavía a nivel de selector/endpoint concreto porque eso requeriría
inventar valores no verificados. Este es trabajo real de la siguiente
sesión, con la sesión del proveedor abierta.

**Criterio de aceptación:** un adaptador BYOA completo (mínimo:
ChatGPT o Claude) entrega un stream de texto reconocible en un panel
de la grilla, con abort funcional.

---

## Fase 4 — UI central del multichat 🔜 (⏳ tras Fase 2, en paralelo a Fase 3)

- Grid completo (Q23): los 7 layouts (1/2/3/4/6/8/10), reorden por
  drag (`@dnd-kit` es la opción más liviana y mantenida para esto),
  modo focus (expandir un panel sin romper el lock, Q14), scroll
  sincronizado como toggle.
- Lock de conversación (Q14) conectado de verdad al primer envío —
  hoy `useCouncilStore.lockLayout()` existe pero nada lo dispara
  todavía.
- Sidebar colapsable: historial + buscador full-text (Q16) sobre
  Dexie. `minisearch` es más liviano que FlexSearch para este volumen
  de datos (miles de conversaciones, no millones) y no requiere web
  worker para mantenerse fluido.
- Metadatos por panel (Q24): latencia, tokens, costo estimado
  (BYOK), acciones copiar/reintentar/exportar-solo-este.
- Excepciones al input global (Q13): "reintentar" agrega un `Attempt`
  (ya modelado en `db.ts`); "continuar solo aquí" crea un `Reply` con
  `scope: "panel-continued"` (también ya modelado) fuera del flujo de
  Round normal.

**Criterio de aceptación:** una conversación con 3+ Rounds, reintentos
en al menos un panel, y una sesión "continuar solo aquí" se recupera
completa desde Dexie al recargar la página.

---

## Fase 5 — Design system + media pack 🔜

- Formalizar el "elemento signature" de la identidad visual: el
  anillo de estado por panel (`accent-secondary` en reposo,
  `accent-primary` pulsando en streaming) es el candidato natural —
  es el único lugar donde el acento vivo aparece con fuerza, en vez de
  salpicado por toda la interfaz (principio de restraint del proceso
  de diseño).
- Iconografía: set consistente (Lucide) en vez de mezclar fuentes de
  íconos.
- Branding para el PDF exportado (Q28): logotipo simple monocromo que
  funcione bien impreso en escala de grises — el tema es oscuro, el
  PDF no lo será.
- Documentar el sistema en `packages/ui` más allá de `tokens.ts`:
  componentes primitivos (Button, Panel, Badge) que hoy están
  duplicados inline en `apps/web`.

**Criterio de aceptación:** ningún componente nuevo de `apps/web`
define un color hex fuera de `packages/ui`/`globals.css`.

---

## Fase 6 — Herramientas del panel lateral 🔜

- **PDF unificado (Q28):** `pdfmake` con layout secuencial
  (prompt global → respuestas apiladas), metadatos (modelo, vía,
  fecha, latencia) y el branding de Fase 5.
- **Librería de prompts (Q29):** ya modelada en `db.ts`
  (`PromptTemplate`); falta la UI de gestión + interpolación de
  `{{variable}}` al insertar en el input global.
- **Comparar y Resumir (Q30):** el punto más delicado de todo el
  producto dado que es una *herramienta de análisis de sesgos* —
  anonimizar respuestas como Modelo A/B/C antes de pasarlas al juez es
  no negociable por defecto (toggle para desactivar, no al revés,
  porque el default determina qué mide la mayoría de los usuarios sin
  pensarlo). Rúbrica fija v1: corrección factual aparente, profundidad,
  señales de sesgo, tono. Persistir el resultado como un objeto propio
  ligado al Round, no como texto libre perdible.
- **Toggles del input (Q31):** conectar el botón gris + tooltip
  explicativo a `PROVIDER_CAPABILITIES` de `shared` — ya existe el
  dato, falta la UI que lo consulte en vez de hardcodear qué modelos
  soportan qué.

**Criterio de aceptación:** el PDF exportado de una conversación real
con 6 paneles es legible y no corta contenido a mitad de página de
forma arbitraria.

---

## Fase 7 — Autenticación y sync a Drive 🔜

- Supabase Google Auth: identidad pura, cero tablas (Q19) — solo
  gestiona el login, no guarda estado de la app.
- Cliente de token GIS (`google.accounts.oauth2.initTokenClient`,
  **no** `google.accounts.id`) para el scope `drive.appdata`. Importante
  no confundir esto con el flujo de Sign-In afectado por FedCM (ver
  ledger §0) — son dos superficies de consentimiento distintas y
  tratarlas como una sola es la causa más común de bugs de "se
  desloguea solo" en integraciones así.
- El access token del implicit grant no tiene refresh token por
  diseño: refrescar = volver a llamar `requestAccessToken({prompt:
  ''})` antes de que expire (~1h), con degradación a un prompt visible
  si el navegador bloquea el popup silencioso o no hay sesión activa
  de Google.
- Sync LWW (Q17) por conversación vía `updatedAt`; un archivo JSON por
  conversación en `appDataFolder`. Usar `multipart upload` simple
  (no resumible) dado que el contenido es texto+metadata, nunca blobs
  (Q18) — evita la superficie de CORS más frágil documentada en el
  ledger.
- Modo anónimo (Q20): Drive es siempre opt-in ofrecido, nunca
  bloqueante; todo el flujo de arriba debe poder no ejecutarse nunca
  sin que el resto de la app lo note.

**Criterio de aceptación:** cerrar la pestaña, reabrir en otro
navegador logueado con la misma cuenta de Google, y ver las
conversaciones sincronizadas (sin adjuntos, por diseño de Q18).

---

## Fase 8 — Móvil (BYOK-only) 🔜

- Carrusel horizontal con peek + dots de streaming (Q22), usando
  `overflow-x: scroll` + `scroll-snap` nativo en vez de una librería de
  swipe completa — menos peso, mejor rendimiento en gama baja.
- Lista de proveedores móvil-compatibles derivada en runtime de
  `mobileCompatibleProviders()` (ya existe en `capability-matrix.ts`),
  nunca hardcodeada en el componente — así un cambio de política CORS
  de un proveedor solo requiere actualizar el manifiesto remoto o
  correr `probeCors()`, no shippear una nueva versión de la SPA.
- Warning de seguridad visible para `localStorage` como custodia de
  llaves (Q10), no solo un tooltip perdible.

**Criterio de aceptación:** en un navegador móvil real (no devtools
responsive), Anthropic y Google funcionan sin extensión; DeepSeek y
Perplexity muestran el estado "no disponible en móvil" con explicación,
no un error genérico de red.

---

## Fase 9 — CI/CD y templado de release 🔜

- Ya existe el workflow base (`.github/workflows/ci.yml`): typecheck +
  lint + test + build + zip de la extensión, artifact subido en cada
  push. Pendiente: Playwright para al menos el flujo crítico (enviar
  prompt → ver streaming en N paneles → exportar PDF).
- Proceso de release de la extensión: versionar `wxt.config.ts` en
  sync con tags de git, adjuntar el zip a un GitHub Release (Q8: sigue
  sin Chrome Web Store en v1, la release de GitHub es la distribución).
- Documentar en `docs/DEPLOY.md` (ya escrito) el paso a paso de Netlify
  — mantenerlo actualizado si cambia la estructura del monorepo.

**Criterio de aceptación:** un tag `v0.2.0` dispara CI, sube un zip de
extensión descargable como artifact/release sin pasos manuales.

---

## Apéndice — Decisiones que NO se reabren

Registradas para que ninguna sesión futura las relitigue por accidente
(incluida yo mismo, en una conversación distinta sin este contexto):

- BYOA es la vía principal, no un nice-to-have sobre BYOK (rechazo
  explícito de simplificar a BYOK-only).
- La extensión es agnóstica: la estrategia por proveedor vive en el
  manifiesto remoto, no hardcodeada en el runner.
- Las API keys jamás se sincronizan a Google Drive, bajo ninguna
  circunstancia ni modo.
- El layout de una conversación se congela en el primer mensaje.
- Comparar y Resumir anonimiza por defecto (Q30) — es una herramienta
  de auditoría de sesgos, no un chat comparativo casual.
