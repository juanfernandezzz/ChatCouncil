# ChatCouncil — Blueprint Arquitectónico (/goal)

> Este documento es la fuente de verdad del plan de ejecución. Vive en el
> repo (no solo en el chat) para que cualquier sesión futura — tuya, mía,
> o de Claude Code trabajando de forma autónoma — pueda retomarlo sin
> releer todo el hilo de la entrevista. Cross-referencias `Qn` apuntan a
> las respuestas de la entrevista de requerimientos original.

**Estado global:** Fases 0–5 completas y verificadas (Fase 5 cerrada
2026-07-17 — herramientas del panel lateral: juez anonimizado, informe
PDF/DOCX + visor, plantillas, toggles; ledgers §0.1–§0.8). **Siguiente:
Fase 6 — autenticación y sync a Drive.** Fases 6–9 pendientes, en orden
de dependencia estricta (Q34, redacción reconciliada con la rotación de
2026-07-11: no construir sobre cimientos abiertos — la funcionalidad se
cierra primero y el diseño, que es superficie sobre sustancia ya
cerrada, va al final; ver §0.7).

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
| WXT genera el tipo `PublicPath` de `getURL` desde los entrypoints; un entrypoint nuevo exige `wxt prepare` para que `getURL("/offscreen.html")` tipe | **Alta** | Descubierto por error de typecheck real (`TS2769`), no desde memoria. `wxt prepare` corre en `postinstall`. |
| **CORRECCIÓN (post-aplicación, reportado por Code):** `pnpm install` puede saltarse el `postinstall` si detecta "already up to date" (nada que instalar) — no es garantizado en un install incremental sobre un checkout ya poblado. La fila anterior de este ledger asumía lo contrario; era optimismo, no verificación. | **Alta** | Afecta a TODA fase futura que agregue un entrypoint WXT nuevo aplicado sobre un clon existente (el escenario real de este workflow: zip aplicado a un repo ya clonado, no un `git clone` limpio). Corrección de proceso: el prompt para Code debe incluir `pnpm --filter @chatcouncil/extension exec wxt prepare` como paso EXPLÍCITO cuando la fase toque entrypoints, no asumirlo implícito en `pnpm install`. Mitigado en la práctica: Code lo detectó (`paths.d.ts` sin actualizar), corrió `wxt prepare` a mano, y verificó el artefacto regenerado antes de seguir — pero el prompt no debería depender de que quien lo ejecute note el hueco por su cuenta. |
| **CORRECCIÓN MAYOR (diagnóstico en Chrome + inspección de artefactos, 2026-07-04):** la hipótesis "carrera de timing de arranque" queda **refutada como causa primaria** (el ping "ready" no llegaba ni con 3000ms de espera, y el fallo se reprodujo idéntico en Chrome 149 — no era Opera). Causa raíz real: `offscreen/main.ts` envolvía toda su lógica en `export default defineUnlistedScript(() => {...})`. Ese wrapper es para entrypoints de **script unlisted** (`.ts` suelto), donde WXT genera un módulo virtual que llama a `.main()`. En el script de una **página HTML** nadie consume ese export → Rollup lo trata como código muerto y tree-shakea el módulo COMPLETO. El build embarcaba un `offscreen.html` que cargaba únicamente el chunk compartido de runtime (polyfill de modulepreload + shim de `browser`), sin una sola línea propia. | **Alta** — verificado leyendo el artefacto compilado: el chunk que cargaba `offscreen.html` contenía sólo polyfill+shim; los strings del offscreen ausentes de TODO `.output`; hash del chunk congelado a través de 3 builds con `main.ts` editado dos veces. | Explica **todos** los síntomas de una vez, en ambos navegadores: cero logs `[offscreen]` jamás, "ready" ausente incluso con timeout, `Receiving end does not exist` desde el PRIMER `selftest:start`, y el popup reportando offscreen "vivo" con la SPA clavada (getContexts ve el DOCUMENTO — que carga bien — no el script). Fix: ejecución de nivel superior, mismo patrón que `popup/main.ts` (que funcionaba en el mismo build — el contraejemplo que delató el mecanismo). El handshake "offscreen-ready" del fix anterior se conserva como hardening legítimo (la semántica de `createDocument` no garantiza listener registrado) y ahora su ping efectivamente se emite. |
| **NUEVO ESTÁNDAR DE VERIFICACIÓN — "build verde" ≠ "código embarcado":** typecheck y build limpios prueban que el código COMPILA, no que quedó DENTRO del artefacto. El gate de cierre de toda fase que toque entrypoints ahora incluye verificación a nivel de artefacto: (1) grep del `.output` por un string marcador único de cada entrypoint nuevo, (2) confirmar que el HTML compilado referencia el chunk que CONTIENE ese string. La afirmación previa de este ledger ("offscreen.html carga su script bundleado") se había verificado sólo al nivel "referencia un chunk", no "el chunk contiene el código" — ese hueco exacto dejó embarcar el bug. | **Alta** | Aplica a Fase 2+ para cualquier entrypoint o página nueva de la extensión. Verificado post-fix: `chunks/offscreen-*.js` (2.1 kB) ahora existe, contiene los strings marcadores, y `offscreen.html` lo referencia. |

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

**Verificación funcional (Chrome 149, 2026-07-04, corrida autónoma de
Code, post-fix del tree-shake — supersede parcialmente la nota
anterior):** tres tests sobre el build corregido, oráculo = transcript
de la SPA. (1) *Creación del offscreen* (40×1000ms): 40/40 chunks
contiguos, cadencia exacta de 1s, cierre en `done`. El primer chunk
llegó ≈1.1s después del click → el handshake `offscreen-ready` resolvió
en <~150ms (si hubiera corrido el camino de timeout de 3s, el primer
chunk habría llegado a ≥4s) — el hardening funciona y es rápido.
(2) *SW frío + offscreen preexistente*: 40/40, `done`, sin espera de
ready (camino `existing.length > 0`, por diseño). (3) *Muerte del SW a
mitad de stream* (proxy por idle: cfg 4×35000ms, huecos > ventana de
suspensión): 4/4 chunks preservados con separación exacta de 35s,
cierre en `done`, **≥4 ciclos de muerte/reanudación** — fingerprint de
la máquina de estados del cliente: la fase `resumed` sólo es alcanzable
desde `reconnecting`, y se observó tras CADA chunk, incluida la
reanudación con `fromSeq=-1` antes del primero. Decisión B verificada
de punta a punta en Chrome. Pendiente opcional: Stop manual (el gatillo
literal del criterio; mismo evento terminal, timing adversarial) y
re-verificación en Opera (entorno del repro original; la causa raíz era
independiente del navegador → confianza alta sin verificar).
Observación de segundo orden para Fase 2+: con la SPA abierta e
inactiva, el diseño de Port persistente produce un ciclo suspensión del
SW ↔ reconexión del cliente cada ~30s (cada reconexión despierta al
SW) — costo inherente al patrón, no un bug; considerar si Fase 2 quiere
un backoff de reposo cuando no hay streams en vuelo.

**Cierre de Fase 1 (2026-07-04).** Decisión de Juan: los dos checks
opcionales (Stop manual del SW — el gatillo literal del criterio — y
re-verificación en Opera) se **declinan conscientemente**; la
verificación funcional en Chrome vía proxy por idle se considera
suficiente. Queda registrado que el criterio literal no se ejecutó tal
cual está redactado. Scaffolding retirado: el panel de self-test sale de
`App.tsx` y se **conserva desmontado** en `apps/web/src/dev/SelfTestPanel.tsx`
(typechequea con el workspace, no entra al bundle, un import lo
re-monta; incluye los params de URL `?stChunks/?stIntervalMs`). La
instrumentación de diagnóstico se reduce a **warns de camino de fallo**
(entrega SW↔offscreen fallida, timeout de ready, resume sin stream =
piso A) — la lección de la fase fue que los `.catch(() => {})` mudos
hicieron el sistema indiagnosticable; eso no vuelve. Markers vigentes
para el gate de artefactos del entrypoint offscreen tras la limpieza:
`"offscreen-ready"` y `"sw-relay"` (los strings de logs verbosos, como
`"listener registrado"`, ya no existen y no deben usarse como marker).
Cambio de alcance registrado al cierre: Fase 8 (móvil) reescrita — ver
esa sección.

### 0.3 Ledger de verificación — Fase 2 (2026-07-08)

**Decisiones de la entrevista (E1–E9; Juan aprobó todas, con E6
ampliado por él):**

- **E1 — Enmienda:** esta sección de Fase 2 SUPERSEDE su texto original
  (escrito antes del commit 0443384). Retirada la custodia móvil de Q10
  (el gate de App.tsx hace que la SPA nunca opere en móvil); criterio de
  aceptación desktop-only; el reorden por confianza CORS se conserva con
  justificación nueva (los directos son el transporte más simple para
  validar el contrato — nada de móvil). `mobileCompatibleProviders()` →
  `corsDirectProviders()` (mismo predicado, semántica vigente; sin
  consumidores previos, verificado por grep). Las filas históricas de §0
  que mencionan móvil NO se tocan: son registro fechado, no estado.
- **E2a — Custodia en la SPA:** `apps/web/src/lib/key-vault.ts`
  (localStorage default, opt-out por proveedor a sessionStorage). El Q10
  original (chrome.storage desktop / localStorage móvil) chocaba además
  consigo mismo: llaves sólo en chrome.storage ⇒ la SPA no puede armar el
  header de una llamada directa "sin extensión". Regla dura cumplible por
  estructura: gate mecánico `scripts/guard-key-vault.mjs` (paso propio en
  CI) — sólo `byok-client.ts` y el panel pueden importar el vault; ningún
  path /drive|sync/i puede hacerlo NI entrar al allowlist. Trade-off
  asumido: XSS clásico de todo BYOK-SPA; mitigación operativa = llaves
  revocables.
- **E3 — Ley de fetch:** TODO `byok:proxy` ejecuta en el offscreen,
  streaming o no (una respuesta no-streaming también puede superar los
  ~30s del SW). Los directos fetchean en la SPA sin puente.
- **E4 — Resume reutilizado:** `byoa:resume` → `stream:resume`, SIN bump
  de versión ni alias (v2 sin consumidores externos; distribución = zips
  de GitHub, un usuario). El canal interno SW↔offscreen ya era genérico
  (`kind: "resume"`). Caso real que lo exige: modelos con thinking largo
  callan >30s antes del primer token → el SW muere en el silencio → sin
  resume el stream se pierde con el fetch del offscreen vivo. Mitigación
  por tocar zona verificada: re-correr el escenario 3 del self-test
  (muerte por idle) en Chrome real al cierre.
- **E5 — Allowlist en código:** `BYOK_PROXY_ALLOWED_ORIGINS`
  (packages/adapters, derivado del registro — no duplicado) es la fuente
  de verdad que `background.ts` aplica por mensaje, con verificación de
  `sender.origin` (defensa en profundidad sobre `externally_connectable`)
  y https-only. `host_permissions` la espeja 1:1 (openai/deepseek/
  perplexity). Los directos NO tienen fallback por proxy a propósito
  (sus dominios fuera de host_permissions: no ampliar permisos por un
  hipotético). Kill-switch remoto para BYOK: DIFERIDO — el manifiesto
  hoy no participa del routing BYOK; se cablea cuando la UI consuma
  `healthy` (Fase 4).
- **E6 (ampliado por Juan) — CINCO proveedores de punta a punta:**
  anthropic y google directos; openai, deepseek y perplexity vía proxy.
  Un solo dialecto openai-compat parametrizado cubre a los tres proxied;
  Groq/xAI/OpenRouter/Mistral llegarán como config + probe + test manual
  (no código nuevo). GLM fuera: ni su baseUrl público está confirmado.
- **E7 — probeCors real:** request mínimo NO autenticado; respuesta
  LEGIBLE (401/403/405 incluidos) = CORS pasa → la corrección del probe
  NO depende de que el path sea exacto, sólo del origin y su política.
  Fetch rechazado se desambigua con centinela `mode:"no-cors"`: red viva
  → "blocked" (cacheado en sessionStorage); red caída → "unverified" (NO
  se cachea — sería congelar un falso negativo). `effectiveCorsStatus()`
  = medido pisa declarado; el routing lo consume por request.
- **E8 — Harness:** `ByokTestPanel` montado en App.tsx DURANTE la fase
  (mismo ciclo de vida que el panel de Fase 1; al cierre se retira el
  import y queda en `src/dev/`). La llave se tipea en el navegador de
  Juan, se guarda sólo vía vault, y el panel jamás la imprime (maskKey).
- **E9 — Backoff de reposo: DIFERIDO explícito.** El Port persistente
  despierta al SW cada ~30s con la SPA inactiva — costo conocido del
  patrón. Exige un estado nuevo del cliente ("conectable pero dormido")
  que colisiona con la semántica del badge; revisitar post-Fase 4.
  Condición mínima si se adelanta: dormir sólo con streams.size === 0,
  despertar ante dispatch, re-verificar escenario 3 completo.

**Verificación ejecutada (sandbox, Node 22.22.2 / pnpm 11.9.0):**

- `pnpm install --frozen-lockfile` limpio (postinstall `wxt prepare` OK).
- `pnpm -r run typecheck` → 5/5 `tsc --noEmit`, 0 errores (el 6.º
  proyecto del scope es el raíz privado sin script; esperado).
- `pnpm guard:keys` → OK (allowlist: byok-client.ts + ByokTestPanel.tsx).
- `pnpm build:ext` → chrome-mv3 OK; manifest compilado con
  `host_permissions` = openai/deepseek/perplexity (verificado en el
  JSON compilado, no el fuente). `pnpm build:web` → OK (226 kB JS).
- **Gates de artefacto (todos verificados sobre `.output`/`dist`):**
  extensión — `"offscreen-ready"`, `"sw-relay"` y `"byok:start"` en
  `background.js` Y en el chunk del offscreen; `"stream:resume"` en
  `background.js` (el offscreen usa el `kind:"resume"` interno: NO debe
  aparecer ahí); `offscreen.html` referencia exactamente el chunk que
  contiene los markers. Web — `"stream:resume"`, `"byok:proxy"`,
  `"chatcouncil:byok:key"`, `"chatcouncil:probeCors"`, `"api.deepseek.com"`
  y el título del panel presentes en `dist/assets`.
- **Verificación empírica parcial desde el sandbox** (red del sandbox
  sólo permite api.anthropic.com de los cinco): preflight OPTIONS real a
  `/v1/messages` con `Origin: https://chatcouncil.netlify.app` y los
  tres headers del probe → **HTTP 200**, `access-control-allow-origin: *`,
  `access-control-allow-headers` ecoando los tres textualmente,
  `allow-methods` incluye POST. El diseño del probe queda validado a
  nivel preflight para anthropic; el resto se mide con el botón "Probe
  CORS" del panel en el navegador real.

**Datos frágiles (modelos por defecto — override disponible en el
panel; corregir en `providers.ts`/`anthropic.ts`/`google.ts` si un
proveedor los retira):** `claude-sonnet-4-5` (confianza moderada-alta) ·
`gemini-2.5-flash` (moderada) · `gpt-4o-mini` (alta) · `deepseek-chat`
(alta) · `sonar` (moderada-alta). Los paths de probe de
mistral/groq/xai/openrouter son best-effort: un path errado NO invalida
el probe (ver E7).

**Fuera del alcance de esta fase (explícito):** adjuntos y toggles BYOK
(adjuntos presentes → error explícito del adapter; `thinking_delta` /
`reasoning_content` ignorados — el contrato v1 sólo modela texto de
respuesta); selector de modelo en UI real (Fase 4); adaptadores
Mistral/Groq/xAI/OpenRouter/GLM; kill-switch remoto BYOK (ver E5);
backoff de reposo (E9).

**Aceptación y cierre (2026-07-08/09)** — dos rondas automatizadas
(Playwright sobre Chromium en la máquina del usuario, Windows) + una
corrección (commit 2b82bea):

- **Verificado.** Criterio 1: google stream directo de punta a punta
  (done 4269ms, tokens 20/32, probe medido `supported`); anthropic probe
  `supported-with-header` + camino de error directo (401 legible, 532ms).
  Criterio 3 completo: los 3 proxied sin extensión → Enviar bloqueado
  con razón visible en <25ms, sin cuelgue; google directo con extensión
  presente sin tocar el puente. Transporte del proxy ×3 con llave
  inválida: ruta `proxy` + 401 REAL del proveedor, jamás "byok:proxy
  rechazado" — el allowlist discrimina capas. **Resume end-to-end del
  `stream:resume` renombrado**: kill forzado del SW por CDP
  (`Target.closeTarget`) tras el chunk 2 de un selftest 6×8s →
  `reconnecting` (t=16.7s), `resumed` (t=24.1s), 6/6 chunks contiguos,
  `done · lastSeq 5` — cierra el desvío de la 1.ª ronda, donde la sesión
  CDP impedía la muerte por idle y reconnecting/resumed no aparecían.
- **Hallazgo mayor + corrección (2b82bea).** El probe GET pelado era
  "simple request" (sin preflight): midió `supported` en
  openai/deepseek/perplexity sin probar el POST autenticado — riesgo de
  routing hacia un fetch que muere en preflight. Fix: probes FIELES a la
  forma real (mismo método + headers custom, centinela `probe-invalid`).
  Con el probe fiel los tres SIGUIERON midiendo `supported`, y la
  coherencia con la request real lo confirmó (openai: ruta direct, 401
  en 538ms) → **la realidad CORS cambió respecto de los reportes
  2023-2026**: matriz declarada actualizada (supported, confianza
  moderate, verifiedAt 2026-07-09; una sola medición desde una red).
  Consecuencia: el routing lleva a los CINCO directo; el proxy
  (verificado a nivel transporte) queda como red de seguridad —
  `route:"proxy"` en el registro = membresía de allowlist +
  host_permissions, no transporte forzado.
- **Diferido-por-llave (nominado; costo de cierre reducido).**
  (1) Parser openai-compat contra SSE real — cierra con CUALQUIER llave
  barata streameando DIRECTO (p. ej. deepseek ~USD 2). (2) Loop de relay
  del fetch byok en el offscreen con cuerpo real (~15 líneas espejo del
  transporte directo verificado; sólo relevante si algún proveedor
  vuelve a rutear proxy). (3) El 200 de streaming con ACAO en los tres
  ex-bloqueados (implícito en (1)).
- **Brecha de robustez conocida.** El routing decide upfront sin
  fallback-on-failure: si un proveedor revierte su CORS, el fetch
  directo muere en TypeError sin caer solo al proxy. Remedio actual:
  botón Probe (re-mide y cachea `blocked` → proxy). Candidato: auto-probe
  ante TypeError (Fase 4).
- **Tree-shaking al cierre.** Retirado el panel, el subsistema BYOK web
  (byok-client / key-vault / adapters byok) sale del bundle de la SPA
  hasta que la UI de Fase 4 lo consuma — queda en repo, typechecked, con
  harness re-montable con un import. Gates web: AUSENCIA del título del
  panel + presencia de `stream:resume`; gates de extensión sin cambios
  (`byok:start`, `stream:resume`, allowlist, host_permissions).
- **Incidentes registrados.** (1) La llave de Google quedó pegada en el
  historial del chat de Code pese al canal de archivo — rotación en AI
  Studio instruida, pendiente de confirmación del usuario. (2) Un
  `Stop-Process` por nombre genérico mató el Chrome personal del
  usuario — desde entonces todo kill va por PID exacto verificado
  (regla estándar de los prompts).
- **CI.** Actions habilitado por el usuario durante el cierre; primer
  run de la historia del repo disparado por 2b82bea (`queued` al momento
  del reporte). La conclusión de ese run es PRECONDICIÓN del push de
  cierre; `zip:ext` (único paso jamás ejercitado localmente) fue
  pre-volado en sandbox: OK (9.88 kB).

### 0.4 Ledger de verificación — Fase 3, primer adaptador BYOA (2026-07-10)

**Camino B+ (decidido tras una 1.ª inspección que descartó el clon
single-request de BYOK):** la SPA corre la MÁQUINA DE ESTADOS; la extensión
es un caño credencial genérico (`byoa:proxy`, gemelo de `byok:proxy` pero el
offscreen fetchea con `credentials:"include"`). El detalle multi-paso del
proveedor vive en `packages/adapters/src/byoa/`, no en apps/web: la
topología Q1 (runner agnóstico) se mantiene.

**Ingeniería inversa de claude.ai (sesión propia de Juan, logueado):**
- **Auth = SÓLO cookie de sesión httpOnly** (sin Authorization, sin
  anti-CSRF, sin token en la página). Probado: el completion da 200 SSE
  mandando sólo `Content-Type` + `accept` + la cookie — los headers
  `anthropic-client-platform`/`anthropic-device-id` que manda la webapp NO
  gatean (el 2.º es a su vez una cookie). El código nunca ve la cookie: la
  adjunta el navegador (`credentials:"include"` en el offscreen).
- **Endpoint CON ESTADO** (por eso no es un clon de la request única de
  BYOK): `POST /api/organizations/{orgId}/chat_conversations/{convId}/completion`.
  `orgId` no es accesible desde la SPA (vive en cookies/bootstrap de
  claude.ai); `GET /api/organizations` (cookie-auth) devuelve 2 orgs
  (selección en el panel). Postear a una conversación inexistente → 404
  `chat_conversation_not_found`: hay que crearla antes
  (`POST .../chat_conversations`, body mínimo `{uuid, name:""}` → 201, uuid
  generado por el cliente). `parent_message_uuid` del 1.er turno = raíz
  all-zeros `00000000-0000-4000-8000-000000000000` (verificado: da 200).
- **Cuerpo mínimo de completion** para el dialecto reusable:
  `{prompt, parent_message_uuid, rendering_mode:"messages"}`. `model` es
  OPCIONAL (omitir → default de la cuenta; da 200) — se omite para no
  hardcodear un id de modelo frágil; el override llega en Fase 4.
- **Dialecto del stream = Anthropic Messages** (`message_start` /
  `content_block_delta`[`text_delta`] / `message_delta` / `message_stop`),
  gatillado por `rendering_mode:"messages"` (sin él, el server responde el
  formato legacy `event: completion`, no reusable). El parser es EXACTAMENTE
  `createAnthropicParser` de BYOK; el evento extra `message_limit` (propio de
  claude.ai) cae en el `default` ignorado. Reuso, no duplico.

**Gate make-or-break (verificado en el Chrome real de Juan, no de memoria):**
un `fetch` desde el offscreen de la extensión (host_permissions
`https://claude.ai/*` + `credentials:"include"`) SÍ adjunta la cookie de
sesión httpOnly y autentica cross-origin — la duda central de la fase, no
deducible por memoria (comportamiento SameSite/Origin que cambia sin aviso).
`GET /api/organizations` → 200 + 2 orgs. Y — clave — los **POST cross-origin
(crear conversación + completion streaming) también se aceptan**: claude.ai
NO valida el Origin para rechazar a la extensión → no hace falta content
script, la estrategia `endpoint` es viable.

**Verificación ejecutada (sandbox + Chrome real):** typecheck 5/5;
`guard:keys` OK (byoa NO importa key-vault); build:ext + build:web limpios;
gates de artefacto — `background.js` con `byoa:start`/`byoa:proxy` (+ los de
Fase 1/2), chunk del offscreen con `byoa:start` y SIN `stream:resume`,
manifest con `https://claude.ai/*`, `dist/assets` con `byoa:proxy` +
`chat_conversations` + `rendering_mode` + título del panel. **Aceptación
funcional (2026-07-10):** Detectar sesión → 200 + 2 orgs; Enviar → máquina de
dos pasos (crear conversación + completion) → texto reconocible de Claude
streameado → `done`; Abortar a mitad de un stream largo → corta (texto
congelado, fase `aborted`). Criterio de aceptación de Fase 3 CUMPLIDO.

**Notas / deuda registrada:**
- La reanudación tras muerte del SW (Fase 1, genérica por requestId) aplica
  al stream de completion; el paso 1 (crear conversación) es corto y
  no-stream. No se ejercitó la muerte del SW en esta aceptación (el criterio
  de Fase 3 no lo pide); la maquinaria es la misma verificada en Fase 1/2.
- Quedaron conversaciones de prueba en la cuenta de Juan (prompts "responde
  solo: …", "consejo de modelos", el listado 1–80 abortado). NO se borran
  desde el agente (borrado permanente = decisión humana); Juan las elimina.
- Selección de org: hoy la elige el panel; el default matchea la cookie
  `lastActiveOrg` (la personal). Formalizar la UX de selección en Fase 4.

---

### 0.5 Ledger de verificación — Fase 4, Round A: grid + persistencia + threading BYOK (2026-07-11)

**Alcance de este Round: todo lo que NO depende del mini-recon BYOA.** El
threading real de BYOA-claude (E2=B) necesita saber qué identificador usa
el stream de claude.ai para encadenar un 2.º turno — dato que Fase 3 nunca
capturó (sólo probó el turno 1, parent=raíz) y que este entorno no puede
reconocer (sin red hacia claude.ai desde el sandbox). Se secuencia en un
Round B corto: mini-recon en el Chrome real de Juan → parche puntual. Nada
de lo entregado en este Round A depende de ese resultado ni lo bloquea.

**Decisión central de arquitectura (E1, panel-runner):** `apps/web/src/lib/
panel-runner.ts` — `sendToPanel(panelSource, {prompt, model, history?,
orgId?}, handlers)` despacha a `sendByokPrompt`/`sendByoaPrompt` según
`connectionMode`. Identidad de panel resuelta como id compuesto
(`packages/shared/panel-source.ts`: `"byok:openai"` / `"byoa:claude"`) para
no colisionar cuando exista BYOA de un proveedor que ya tiene BYOK — sin
migración de esquema (sigue siendo `string[]`).

**E2=B aceptado — threading real, no Rounds independientes** (corrección de
Juan sobre la recomendación original: ChatCouncil necesita follow-ups
unificados con memoria por panel, no sólo comparaciones aisladas por
Round). Implementado para BYOK: `SendOptions.history` (contrato
compartido) + cada dialecto (`anthropic.ts`, `openai-compat.ts`, `google.ts`
— este último con mapeo de rol propio, `"model"` en vez de `"assistant"`)
antepone los turnos previos al nuevo. La reconstrucción del historial
(`apps/web/src/lib/thread-history.ts`) lee `Reply`/`Round` de Dexie por
panel, en orden cronológico, y **omite turnos sin ningún intento
exitoso** (no tiene sentido threadear una pregunta que el proveedor nunca
contestó). BYOA-claude queda **sin cambios de comportamiento** en este
Round (sigue creando una conversación nueva en claude.ai por cada envío,
tal como Fase 3 lo verificó) — cambiarlo requiere el mini-recon.

**Esquema Dexie v2 (aditivo — verificado por grep que ninguna fase anterior
escribió Replies reales, cero migración de datos):** `Reply.panelSourceId`
(reemplaza el uso ambiguo de `modelId` como identificador de panel;
`modelId` pasa a ser sólo la variante elegida por Round, E4);
`Reply.createdAt` (orden cronológico robusto para "continuar solo aquí",
que vive fuera del flujo de Round); `Reply.followUpPrompt` (texto del
follow-up puntual); `Conversation.byoaOrgId` (E8, identificador no
secreto); tabla nueva `panelThreads` (estado de hilo BYOA — sin
consumidores de escritura todavía, existe para no pedir otra migración en
el Round B).

**E4 (selector de modelo) — registro curado + filtro de disponibilidad
real:** `CuratedModel` (packages/shared) con flag `verified` explícito por
camino de invocación (no "el id existe" — "se probó por ESTE endpoint").
Poblado con hallazgos de búsqueda 2026-07-10 contra documentación oficial
de Anthropic (github.com/anthropics/skills): el tier Sonnet vigente es
`claude-sonnet-5` (Sonnet 4.5 ya no figura como modelo activo); Gemini
vigente es `gemini-3.5-flash`/`gemini-3.1-pro` (2.5 ya superado); OpenAI
`gpt-5.5`/`gpt-5.6` requieren plan pago que Juan no tiene todavía (marcados
"no verificado", con nota de que los modelos de razonamiento históricamente
cambian el shape del pedido, no sólo el id). **Deliberadamente NO se
tocaron los `defaultModel` de Fase 2** (`claude-sonnet-4-5`,
`gemini-2.5-flash`) pese al hallazgo de staleness — cambiar el default de
una ruta ya verificada no es alcance de Fase 4; el registro curado ya
ofrece las alternativas vigentes en el selector. Filtro de disponibilidad
(`apps/web/src/lib/model-registry.ts`, requisito explícito de Juan): BYOK
sólo aparece "disponible" con llave presente en el vault (`hasKey()` —
booleano, nunca el valor; `scripts/guard-key-vault.mjs` ampliado
explícitamente para este único importador nuevo); BYOA sólo con sesión
confirmada en la carga actual (E8).

**E6 (lock) y E8 (organización BYOA):** el lock se dispara en
`ensureConversationForFirstSend` (crea la `Conversation` con
`lockedModelIds` ya escrito) llamado desde `ComposeBar` al primer envío —
atado a la creación del Round, no al primer token. La organización BYOA se
detecta bajo demanda (`apps/web/src/lib/byoa-org.ts`, mismo patrón de
`ByoaTestPanel`) y se persiste en `Conversation.byoaOrgId`.

**Retiro de harness (E3, criterio propio):** `ByoaTestPanel` desmontado de
`App.tsx` (mismo patrón de cierre que Fase 2 con `ByokTestPanel`); los tres
paneles de diagnóstico quedan en `src/dev/`, remontables con un import.

**Verificación ejecutada (sandbox, salidas reales):**
- `pnpm install` real (no frozen — el lockfile cambió): TypeScript
  `^5.7.3` → **`7.0.2` exacto** (GA 2026-07-08, puerto nativo a Go — ver
  nota de riesgo abajo); Vite `^7.0.0` → `^8.0.0` (resuelto 8.1.2); nuevos:
  `@dnd-kit/{core,sortable,utilities}`, `minisearch`,
  `dexie-react-hooks` (reactividad Dexie→React sin buffer manual de
  streaming).
- **TypeScript 7 — probado empíricamente, no sólo por changelog:**
  compilador real instalado en una carpeta aislada, corrido contra los 5
  `tsconfig.json` reales del repo → **5/5 limpio, exit code 0**. Bajo
  riesgo específicamente en este repo porque `tsconfig.base.json` ya tenía
  `target:ES2022`/`moduleResolution:"Bundler"`/`strict:true` (los defaults
  que TS7 exige) y no hay ESLint/ts-morph/API-del-compilador en uso (los
  scripts de lint son placeholders) — el salto directo 5→7 que la
  documentación oficial desaconseja en general no aplicaba a las
  condiciones reales de este repo. Pineado a versión exacta (no `^7.0.0`,
  recién 3 días de vida a la fecha).
- `pnpm -r run typecheck`: **5/5**. `pnpm guard:keys`: OK (allowlist
  ampliado a 3 importadores). `pnpm build:web`: limpio (Vite 8.1.2, bundle
  400.74 kB — subió por las libs nuevas). `pnpm build:ext`: limpio,
  intacto (WXT resuelve su propio Vite 7.3.6 interno, sin conflicto).
- Gates de artefacto: los 6 markers de `background.js` presentes; chunk de
  offscreen con `byoa:start`/`byok:start`/`offscreen-ready` y SIN
  `stream:resume`; `host_permissions` sin cambios. `dist/assets` del web
  confirma que el subsistema BYOK **ya no está tree-shaken** (`ComposeBar`
  lo usa de verdad): `chatcouncil:byok:key` presente.
- **Criterio de aceptación — verificado empíricamente contra Dexie real**
  (`fake-indexeddb`, script de verificación ejecutado y luego DESCARTADO
  del repo — no se agregó infraestructura de testing por decisión propia,
  ver nota abajo): conversación con 3 Rounds + 1 reintento (Q15: el intento
  fallido se conserva, no se pisa) + 1 "continuar solo aquí" → recarga
  simulada (`loadConversation` desde una lectura fresca) → **18/18
  aserciones pasaron**: conteo de Rounds, recuperación del historial de
  Attempts del reintento, recuperación del `followUpPrompt` textual,
  mezcla cronológica correcta del timeline por panel, y reconstrucción
  correcta de `buildByokHistory` (usa el contenido del intento
  REINTENTADO, no el fallido, para el turno que threadea hacia adelante).

**Notas / deuda registrada:**
- No se agregó testing automatizado permanente (no estaba en el alcance de
  la entrevista; el `test` script sigue siendo el placeholder de siempre en
  los 5 paquetes). La verificación de arriba fue empírica pero puntual —
  si Juan quiere un test real de regresión para `conversation-repo.ts`, es
  una decisión de arquitectura de testing que merece su propia entrevista,
  no colarla de paso en Fase 4.
- `hiddenModelIds` (Q14a, ocultar sin borrar) está cableado en el store
  pero no persiste todavía por conversación en Dexie — hoy resetea al
  cambiar de conversación activa. Persistirlo es trivial (un campo más en
  `Conversation`) pero no era parte del criterio de aceptación; queda
  anotado para no perderlo.
- El costo estimado (E7, sólo BYOK) no se implementó en este Round — la
  tabla de precios curada es exactamente el mismo tipo de dato fráil que
  los defaults de modelo, y no bloqueaba el criterio de aceptación. Latencia
  y tokens sí están cableados (visibles por Attempt en cada `AttemptBlock`).
- Sin router todavía: qué conversación está "abierta" tras un reload se
  resuelve con un puntero mínimo en `localStorage`
  (`apps/web/src/lib/last-conversation.ts`) — NUNCA contenido, sólo un id;
  el contenido siempre sale de Dexie. Cuando haya URLs por conversación
  (fase futura), este puntero deja de hacer falta.

### 0.6 Ledger de verificación — Fase 4, Round B: mini-recon BYOA + parche de threading + aceptación real (2026-07-11)

**Recon (Chrome real de Juan, logueado, conversación de prueba en claude.ai
con 3 turnos):** leyendo `GET .../chat_conversations/{id}?tree=True&
rendering_mode=messages&render_all_tools=true&consistency=strong` (mismo
endpoint que ya usa la SPA real para refrescar la vista) después de cada
turno real disparado desde la UI, confirmado dos veces de forma
consistente: **el `parent_message_uuid` de un turno N+1 es el uuid del
mensaje del ASISTENTE del turno N** (nunca el del mensaje humano). No se
llegó a confirmar si ese mismo uuid aparece en el evento `message_start`
del SSE — intentar un fetch fabricado para comprobarlo lo bloqueó el
clasificador de permisos del harness (correctamente: hubiera sido un
turno no autorizado contra la sesión real de Juan). No hizo falta: el
mismo GET del árbol, cookie-auth y alcanzable por el `byoa:proxy`
genérico, ya da el dato de forma confirmada — se preferyó esa fuente en
vez de una suposición sin verificar sobre el shape del stream.

**Parche de threading BYOA implementado con ese hallazgo:**
`packages/shared/src/adapter-contract.ts` agrega `ProviderThreadState`
(`{conversationUuid, lastMessageId}`), `SendOptions.priorThread` (sólo
BYOA lo usa) y `AdapterChunk` `done.providerThread` opcional.
`packages/adapters/src/byoa/types.ts`/`claude.ts` agregan un tercer
builder (`buildGetThread`, GET no-streaming) y
`parseLastAssistantMessageUuid` (parsea `chat_messages[]`, toma el
`sender:"assistant"` de mayor `index`). `packages/adapters/src/byoa/
adapter.ts`: con `priorThread` se SALTEA el paso 1 (crear conversación) y
se reusa la existente con ese `lastMessageId` como parent; tras un paso 2
exitoso, un paso 3 (housekeeping, nunca convierte el turno en error) trae
el uuid del mensaje del asistente recién creado y lo adjunta al `done`.
`apps/web/src/lib/conversation-repo.ts` (`dispatchReply`) lee
`panelThreads` antes de despachar y lo escribe tras un `onDone` con
`providerThread` — la tabla que Fase 4 Round A dejó preparada sin
consumidores ahora los tiene.

**Bug encontrado y arreglado durante la aceptación real (no relacionado
al parche BYOA, pero bloqueaba probarlo):** `activePanelSourceIds()` es
un getter del store que devuelve un array NUEVO en cada llamada;
`useCouncilStore((s) => s.activePanelSourceIds())` en `App.tsx`,
`GridPanel.tsx` y `ComposeBar.tsx` comparaba por referencia en cada
render → loop infinito (`Maximum update depth exceeded`, app en blanco).
Arreglado envolviendo las tres llamadas con `useShallow` de
`zustand/react/shallow` (comparación por contenido, no por referencia).
Sin este fix la UI de Fase 4 no rendereaba en absoluto — no es un
problema exclusivo de Round B, pero Round A no lo detectó porque su
verificación fue contra Dexie directo (`fake-indexeddb`), sin montar
React de verdad.

**Aceptación real ejecutada (Chrome real de Juan, `pnpm dev` en
`localhost:5173` — permitido por `externally_connectable`, llave real de
Gemini tipeada por Juan en el harness `ByokTestPanel` remontado
TEMPORALMENTE en `App.tsx` para la ocasión y retirado después, mismo
patrón de Fase 2):**
- 2 paneles activos con llave/sesión real: Gemini (BYOK) + Claude
  (BYOA, sesión de claude.ai). Primer envío → layout bloqueado (Q14,
  mensaje visible confirmado).
- 3 Rounds reales. **Threading confirmado de verdad en ambos**: el
  Round 2 de Gemini contestó sobre el dato concreto de su Round 1
  ("ausencia de huesos"); el Round 2 de Claude BYOA contestó sobre SU
  PROPIO dato de Round 1 ("corazón central se detiene al nadar") — la
  conversación de claude.ai se reusó de verdad entre turnos, no una
  conversación nueva por envío (el comportamiento que Fase 3 dejó
  documentado como pendiente de este mismo parche).
- Reintento forzado (Q15): se borró la llave de Gemini a mitad de
  camino, se reintentó el Round 3 → falló con mensaje claro
  ("intento 2/2"), el intento anterior exitoso siguió visible sin
  pisarse.
- "Continuar solo aquí" (Q13) en el panel de Gemini (con la llave
  restaurada): reply aislado, no afectó otros paneles ni generó un
  Round nuevo.
- **Reload real de la página**: los 3 Rounds, el historial de 2 intentos
  del reintento (el fallido conservado) y el "continuar solo aquí" con
  su texto y respuesta reales — todo recuperado de Dexie, contenido
  idéntico al pre-reload.
- Re-verificado tras el fix y el parche: `pnpm -r run typecheck` 5/5,
  `pnpm guard:keys` OK (mismos 3 importadores), `pnpm build:web` /
  `pnpm build:ext` limpios, gates de artefacto de la extensión sin
  cambios (6 markers, offscreen sin `stream:resume`, `host_permissions`
  intacto).

**Fase 4 pasa de 🟡 a ✅.**

### 0.7 Nota de plan — rotación de Fases 5/6/7 (2026-07-11)

Decisión de Juan al abrir la fase siguiente: el pulido visual (el viejo
"Design system + media pack") se ejecuta DESPUÉS de que toda la
funcionalidad esté lista, no antes. Rotación aplicada — sólo se mueven
fases NO empezadas; 0–4 (hechas), 8 y 9 no se tocan:

- Herramientas del panel lateral: vieja Fase 6 → **Fase 5** (la siguiente).
- Autenticación y sync a Drive: vieja Fase 7 → **Fase 6**.
- Design system + media pack: vieja Fase 5 → **Fase 7** (última).

Por qué: extraer primitivas y formalizar el design system ANTES de que
existan las superficies de tools/auth obligaría a rehacer ese trabajo;
las Fases 4/5/6 acumulan primitivas Tailwind inline a propósito y la
fase de diseño las hereda y las extrae al final. El espíritu de Q34 (no
construir sobre cimientos abiertos) se conserva: ninguna fase funcional
depende del pulido. Los bloques de sección de este documento fueron
reordenados para que leerlo de arriba a abajo siga siendo el orden de
ejecución, y las referencias cruzadas se actualizaron ("branding de
Fase 5" → "de Fase 7"). Si un hilo previo menciona la numeración vieja,
ESTA numeración es la vigente.

### 0.8 Fase 5 — herramientas del panel lateral (implementación 2026-07-11)

**Decisiones de entrevista (E1–E7, aprobadas por Juan con adiciones):**

- **E1 — Juez (Q30a):** selector propio filtrado a disponibilidad real
  (reusa `listPanelOptions` de F4). La UI SUGIERE explícitamente un
  proveedor FUERA del consejo (pedido de Juan: más neutral, menos
  auto-referencia): optgroup "Fuera del consejo (recomendado)" primero
  y default automático a un no-participante si existe. Juez
  participante NO se bloquea (puede ser lo único disponible) pero se
  marca en la UI y persiste `judgeWasParticipant` (match por
  providerId, que también cubre byok:x vs byoa:x — misma familia,
  mismo riesgo de auto-preferencia). Juez BYOA válido: reusa
  `sendToPanel`, con nota visible de que cada análisis crea una
  conversación en la cuenta del proveedor. La llamada del juez va SIN
  `history` y SIN `priorThread` (turno aislado; no escribe
  `panelThreads`).
- **E2 — Anonimización estructural (Q30b), 3 capas:** (1)
  `lib/judge/anonymize.ts` es el ÚNICO módulo que etiqueta; produce
  `{label,text}[]` + sello aparte; `build-judge-prompt.ts` es un módulo
  SELLADO con CERO imports — la identidad no tiene por dónde entrar.
  (2) `guard:judge` (CI + local): el builder no puede ganar imports;
  sólo run-analysis y el harness pueden importarlo; `provider-names`
  sólo lo importan anonymize/run-analysis/harness. (3) Aserción
  runtime post-scrub en run-analysis: un término identificatorio
  sobreviviente = el prompt NO SE ENVÍA (error visible +
  console.warn). **Sub-decisión E2-iii:** el contenido se
  auto-identifica ("Soy Claude…"), así que la copia AL JUEZ se
  scrubbea contra una lista curada (→ ▮▮▮) con log de redacciones
  persistido; el original queda intacto en Dexie/UI/PDF. Trade-off
  asumido: falsos positivos posibles ("Google" como buscador, "sonar"
  como verbo) — auditables por el log. El prompt ORIGINAL del usuario
  no se scrubbea (idéntico para todas las respuestas: no rompe la
  ceguera). Toggle Q30: default ON, sólo DESACTIVA; `anonymized`
  persiste.
- **E3 — Persistencia (Q30c):** Dexie **v3 aditiva** (patrón v2):
  tabla `roundAnalyses` con índices `roundId`, `conversationId`,
  `[conversationId+roundId]`, `createdAt`. Rúbrica fija v1
  estructurada (score 1–5 clampeado + nota por criterio),
  `rawResponse` SIEMPRE, `status ok|parse_error|error` (parse fallido
  conserva el raw legible; abort del usuario NO persiste), `labelMap`
  (el sello), `redactions`, latencia/tokens del juez. Varios análisis
  por Round permitidos.
- **E4 — PDF (Q28):** `pdfmake` **0.3.11** (capturado del registry —
  la línea 0.3 cambió shapes vs 0.2: vfs = mapa de .ttf directo +
  `addVirtualFileSystem`; `getBuffer()` es Promise;
  `pageBreakBefore(nodo, nodeQueries)` con
  `getFollowingNodesOnPage()`). Import DINÁMICO: chunks propios
  (pdfmake 973 kB + vfs 855 kB), gate = el index no contiene
  "Roboto-Regular.ttf". Builder PURO (`build-doc-definition.ts`)
  compartido browser/harness. Layout secuencial por Round: header →
  prompt → tabla de metadatos (dontBreakRows) → respuestas apiladas →
  follow-ups del Round → análisis des-sellados. Anti-huérfanos:
  `orphanPageBreakBefore` exportada y asertada unitariamente contra el
  shape 0.3 real (la versión 0.2-style era un no-op silencioso —
  hallazgo del typecheck, no de la suerte). Code fences en caja gris
  con espacios preservados (Roboto — mono real es pulido de F7);
  glifos fuera del subset Roboto de pdfmake (⚠, →) reemplazados por
  ASCII en el PDF (hallazgo del harness: ⚠ extraía \u0000). Wordmark
  de texto "ChatCouncil" (placeholder hasta F7). Markdown v1 = plano +
  fences.
- **E5 — Plantillas (Q29):** panel derecho de herramientas
  (colapsable; la sidebar izquierda no se toca), CRUD + búsqueda por
  título/tag, interpolación `{{variable}}` (dedup en orden, vacías
  permitidas con aviso), inserción al ComposeBar — cuyo texto pasó de
  useState local al store (`composePrompt`) para poder inyectar. Si el
  input tiene texto: confirmación inline, nunca pisar en silencio.
- **E6 — Toggles (Q31), opción A:** chips en ComposeBar leyendo
  `PROVIDER_CAPABILITIES` (webSearch activable; imageGeneration
  deshabilitado "v1.5" como marca la propia matriz); tooltip generado
  del dato real (✓ nativo / ? desconocido / ✗ no soporta, por panel
  activo) que DECLARA que el chip es informativo+persistido: el
  contrato Adapter v1 no transporta el toggle (exclusión de F2).
  `createRound` ahora recibe los toggles reales (param opcional,
  compat). Cablear al transporte = candidata a fase corta posterior.
- **E7 — Aceptación en dos mitades:** offline en sandbox (harness) +
  online en el Chrome real (Code). Regla de Juan: TODO uso de
  Anthropic en pruebas va con **Haiku** (entrada curada
  `claude-haiku-4-5` agregada al registro BYOA-claude, `verified:
  false` con nota — el override interno sigue sin probar; la
  aceptación lo confirma o captura el slug real de la webapp). Juan
  disponible para pasos manuales (llaves, refrescos). Nota operativa
  registrada: la URL interna de extensiones es `chrome://extensions`
  (CON los dos puntos — en una fase previa se intentó sin ellos);
  esta fase es SPA-only, no debería hacer falta tocar la extensión.

**Verificación en sandbox (2026-07-11, salidas reales):** Node
v22.22.2, pnpm 11.9.0. `install --frozen-lockfile` OK (lockfile
actualizado con pdfmake + devDeps del harness: @types/pdfmake, unpdf,
fake-indexeddb, vite-node). `typecheck` 5/5. `guard:keys` OK,
`guard:judge` OK (paso nuevo en CI). `build:web` limpio: index 439.47
kB SIN la fuente; pdfmake/vfs en chunks propios; markers nuevos
presentes (roundAnalyses, "Fuera del consejo", Plantillas,
chatcouncil:judge, "Exportar PDF"). `build:ext` limpio: gates F1–F3
intactos (6/6 markers en background; offscreen sin stream:resume;
host_permissions 3 BYOK + claude.ai); +0.4 kB por la entrada Haiku
(el registro viaja en adapters — esperado). **Harness
`src/dev/fase5-harness.ts`: 37/37** — siembra 6 paneles × 3 Rounds
(con auto-identificación, code fence, reintento Q15 y follow-up),
scrub ON = cero términos identificatorios + ≥3 redacciones en la
respuesta auto-identificada, prompt del juez limpio, toggle OFF
intacto, parser (limpio/fences/basura→parse_error, clamp 1–5),
roundtrip completo de `roundAnalyses`, y PDF real de 10 páginas:
Rounds en orden, 6 paneles presentes, fence "def fibonacci", "Soy
Claude" INTACTO en el PDF (el scrub es sólo para el juez), análisis
des-sellado, follow-up, toggle impreso, cero rótulos huérfanos +
mecanismo anti-huérfanos asertado unitariamente. Dos bugs
encontrados y corregidos POR el harness: `content` faltante en el
docDefinition retornado, y los glifos fuera del subset.

**ACEPTACIÓN REAL (Code en el Chrome de Juan — EJECUTADA 2026-07-16):**
- [x] Pre-flight: Code encontró los dos commits YA aplicados y
      pusheados por una sesión previa suya (main = origin/main =
      8184d62; docs = 5046de3 — hashes propios de esa máquina,
      contenido idéntico: `git diff 4d28066..HEAD --stat` = 26
      archivos exacto). Desvío consciente del "PARÁ y reportá" del
      prompt: verificó el diff exacto ANTES de continuar y NO
      descomprimió nada. Precedente ACOTADO: el tripwire protege
      contra pisar un árbol divergente, no contra reconocer trabajo
      propio ya verificado.
- [x] Verificación local: install frozen OK, typecheck 5/5,
      guard:keys y guard:judge OK, ambos builds con todos los gates
      de artefacto (web y ext).
- [x] Harness en la máquina real: 37/37; PDF del harness juzgado
      LEGIBLE por Juan.
- [x] Flujo real: Gemini BYOK + Claude BYOA (sesión detectada, org
      correcta), 2 Rounds con threading confirmado por contenido y
      por tokens (Gemini in:13→54 al arrastrar historial). Juez real
      gemini-2.5-flash, anonimizado (Q30), `judgeWasParticipant` ⚠
      ejercitado (2 proveedores → el juez siempre participa;
      advertencia visible y persistida: "anonimizado (Q30) · juez
      participante ⚠ · gemini-2.5-flash · 6.1s"). labelMap sellado →
      des-sellado post-reload (Modelo A = Gemini, B = Claude); 3
      análisis históricos recuperados. PDF exportado desde la UI
      (45 kB) y juzgado LEGIBLE por Juan.
- [x] Contingencia Haiku: el override `claude-haiku-4-5` NO llegó a
      intentarse — la conversación usó el default de la cuenta y así
      se reportó. La entrada curada sigue `verified: false`;
      mini-check dedicado pendiente (ver adición abajo).
- [x] Push + CI: Run #13 sobre 8184d62 = success (incluye el paso
      guard:judge del workflow).
- [x] Flip del heading a ✅ (2026-07-17): check online de la adición
      cumplido, mini-check Haiku verificado, PDFs y DOCX juzgados por
      Juan — detalle en el bloque de la adición, abajo.

**Adición post-aceptación (2026-07-16, pedido de Juan): visor en
modal + export DOCX.** Además de descargar, el informe se puede VER
sin descargar (mismo PDF en memoria) y bajar como DOCX con tablas
copiables.
- **D1 — visor = mismo blob, por construcción:**
  `generateConversationPdfBlob()` (lib/pdf/export-conversation) es el
  ÚNICO camino de generación; "Ver informe" (modal con iframe sobre
  object URL; revoke al cerrar/desmontar; ESC cierra) y "Exportar
  PDF" (mismo blob → <a download>; se retiró pdfmake.download()) lo
  comparten. Se RECHAZÓ window.open: el hueco async click→blob rompe
  el gesture context → popup blocker intermitente; el modal tiene un
  solo camino de fallo y el producto es Chrome-desktop.
- **D2 — DOCX:** `docx` 9.7.1 (dep) con import dinámico — frontera en
  lib/docx/export-conversation-docx.ts, chunk propio (patrón
  pdfmake); gate: el index NO contiene "wordprocessingml". Builder
  PURO lib/docx/build-docx.ts que consume el MISMO input que el de
  PDF (reusa tipo, rótulos y formateadores exportados de
  build-doc-definition — un solo vocabulario entre formatos) vía el
  cargador compartido nuevo lib/report-data.ts. Tablas de metadatos y
  rúbrica como Table REALES de Word (el objetivo: copiables a
  Excel/Sheets); code fences en Consolas (mono real — sin el límite
  del vfs de pdfmake, que queda para el pulido de F7); header/footer
  con wordmark y pág. X/Y espejando el PDF.
- **D3 — harness 37→54:** el DOCX es un zip → fflate 0.8.3 (devDep)
  desempaqueta word/document.xml y se asertan: PK+tamaño, 3 Rounds,
  6 paneles, fence+Consolas, "Soy Claude" intacto, tabla de metadatos
  como w:tbl, análisis des-sellado (marker tolerante al escape XML de
  "->"), follow-up y veredicto. Escribe
  .harness-out/fase5-accept.docx para juicio humano.
- Verificación sandbox (2026-07-17, salidas reales): typecheck 5/5;
  guard:keys y guard:judge OK; build:web con index 441.71 kB (sin
  Roboto-Regular.ttf ni wordprocessingml), chunks pdfmake 972.88 kB /
  vfs 854.71 kB intactos + export-conversation-docx-*.js 365.59 kB
  nuevo; markers previos + "Ver informe"/"Exportar DOCX" presentes;
  build:ext 27.04 kB y gates F1–F3 intactos (la adición es SPA-only);
  harness **54/54**. Lockfile actualizado (docx, fflate).
- Deuda de naming asumida: PdfSection.tsx ahora es la sección de
  informe (Ver/PDF/DOCX); no se renombra porque el zip de fases no
  expresa deletes — se renombra en Fase 7 con la extracción de
  primitivas.
- **Check ONLINE de la adición (Code — EJECUTADO 2026-07-17):**
  [x] visor: modal con "…pdf · en memoria, sin descargar", cero
  descargas disparadas, ESC cierra. [x] DOCX: descargado desde la UI
  (13 kB); Juan lo abrió y COPIÓ la tabla de metadatos a una planilla
  (el criterio). PDF del harness re-juzgado legible. [x] mini-check
  Haiku: stream OK — modelId `claude-haiku-4-5` persistido, status
  done, content "ok", 1718 ms. HALLAZGO en el camino: no hay UI para
  elegir modelo ANTES del primer envío global (`setModelOverride`
  existe en el store pero ningún componente lo llama; el select del
  E4 en GridPanel sólo renderiza con locked===true) → el check se
  ejercitó por el camino UI real disponible (follow-up "continuar
  solo acá" con Haiku). El transporte del override (builders BYOA →
  body del completion) es el mismo para cualquier scope → entrada
  curada VERIFICADA (verified:true en este commit; Sonnet/Opus siguen
  sin probar — el flag no se hereda).
- **Brecha UI diferida (decisión de cierre 2026-07-17):** la
  selección de modelo pre-primer-envío NO se parcha suelta — es la
  extensión del selector E4 al estado pre-lock y se resuelve cuando
  esa superficie se rediseñe (candidato natural: Fase 7; antes si
  molesta operativamente). Cablear `setModelOverride` desde ahí.
  Registrado para que ninguna sesión futura lo redescubra como bug.
- **Cierre (2026-07-17):** push `a964bfa` a main; badge de CI de main
  = passing tras el push (la confirmación commit-exacta del run la
  hace el push de cierre como pre-gate). Fase 5 → ✅.

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

## Fase 2 — Adaptadores BYOK ✅ (cerrada 2026-07-09 — resultado de aceptación: §0.3)

> **Enmienda (E1, aprobada en la entrevista de fase):** esta sección fue
> escrita ANTES del cambio de alcance móvil (commit 0443384) y quedó
> superseded en dos puntos: (a) la custodia móvil de Q10 ("localStorage
> + warning para móvil") se RETIRA — con el gate móvil de App.tsx la SPA
> ni siquiera conecta el puente en móvil; (b) el criterio de aceptación
> es desktop-only. El reorden por confianza CORS se CONSERVA con su
> justificación vigente: los proveedores CORS-directos son el transporte
> más simple (fetch+SSE sin puente) — validan el contrato `Adapter` y la
> capa de parseo antes de sumar las variables del proxy. La motivación
> móvil original ya no existe. Decisiones completas y verificación: §0.3.

Alcance implementado (5 proveedores de punta a punta — E6 ampliado):
Anthropic y Google **directos** desde la SPA; OpenAI, DeepSeek y
Perplexity **vía proxy** de la extensión (dialecto openai-compat único
parametrizado). Groq/xAI/OpenRouter/Mistral: config + probe + test
cuando se habiliten; GLM fuera hasta confirmar su API pública.

- `probeCors(providerId)` REAL en `capability-matrix.ts` (E7): fetch
  mínimo no autenticado, centinela no-cors para distinguir CORS-bloqueado
  de red caída, cache en `sessionStorage`, `effectiveCorsStatus()` (lo
  medido pisa lo declarado) consumido por el routing en cada request.
- Subsistema BYOK en `packages/adapters` (`src/byok/`): decoder SSE
  incremental tolerante a cortes arbitrarios; builders + parsers por
  dialecto (anthropic, gemini, openai-compat); registro
  `BYOK_PROVIDERS`; factory `createByokAdapter` que implementa el
  contrato `Adapter` con deps inyectadas (llave y transporte);
  `directFetchTransport`. La request cruda (url/headers/body) la arma la
  SPA; la extensión NO conoce dialectos (Q1 intacta).
- Proxy Q11: `byok:proxy`/`byok:proxy-abort` implementados en
  `background.ts` con **allowlist EN CÓDIGO** (`BYOK_PROXY_ALLOWED_ORIGINS`,
  derivada del registro), https-only y verificación de `sender.origin`;
  el fetch corre en el **offscreen** (ley de Fase 1) y alimenta el MISMO
  buffer + reanudación, ahora genérico: `byoa:resume` → `stream:resume`
  (E4, sin bump — v2 sin consumidores externos). `host_permissions`
  espeja el allowlist 1:1 (openai/deepseek/perplexity).
- Custodia Q10 (E2a): `key-vault.ts` en la SPA — localStorage default,
  opt-out por proveedor a sessionStorage. Regla dura cumplible por
  estructura: `scripts/guard-key-vault.mjs` en CI rompe el build si un
  módulo fuera del allowlist (o cualquier path /drive|sync/i) importa el
  vault. Las llaves jamás viajan en zips/prompts/commits/logs.
- Harness E8: `ByokTestPanel` (src/dev/, montado en App.tsx durante la
  fase) — custodia, probe, ruta directo/proxy visible, stream en vivo
  con fases reconnecting/resumed, tokens in/out.

**Criterio de aceptación (desktop-only, se prueba con las llaves de
Juan en su Chrome — el sandbox no las tiene):**

1. Anthropic y Google streamean un prompt real de punta a punta por la
   vía DIRECTA (ruta "direct" visible en el panel; sin tráfico por el
   puente).
2. OpenAI, DeepSeek y Perplexity streamean vía la extensión (ruta
   "proxy").
3. Con la extensión deshabilitada, esos tres fallan con error claro e
   INMEDIATO (nunca cuelgue) mientras Anthropic/Google siguen andando.
4. Matar el SW (o dejarlo morir por idle) a mitad de un stream proxied
   preserva el contenido y termina en `done` — la reanudación de Fase 1,
   ahora genérica, ejercitada sobre byok. Regresión obligatoria: el
   escenario 3 del self-test de Fase 1 sigue pasando.

## Fase 3 — Adaptadores BYOA 🟡 (primer adaptador hecho y verificado 2026-07-10; ver §0.4)

> **Enmienda (testabilidad primero):** el primer adaptador BYOA es
> **claude.ai** (no ChatGPT), por ser el endpoint interno más testeable
> observado — auth sólo-cookie y dialecto de stream ya conocido (Anthropic
> Messages, reusa el parser de BYOK). Se usó para validar el contrato
> `Adapter` contra un endpoint CON ESTADO real antes de replicar a los
> demás. Arquitectura **B+**: la SPA corre la máquina de estados, la
> extensión es un caño credencial genérico (`byoa:proxy`). Decisiones,
> ingeniería inversa y verificación completas: §0.4.

Sigue siendo la fase de mayor incertidumbre real — ingeniería inversa
activa con la sesión abierta, no lectura de documentación. Regla vigente:
por cada proveedor, buscar el endpoint interno reutilizable (estrategia
`endpoint`) antes de resignarse a `dom` (que implica mantenimiento continuo
— cualquier rediseño de la UI rompe el selector sin aviso). El
`AdapterDescriptor.notes` documenta la fecha de la última verificación
manual (envejece rápido y silencioso).

**Hecho (claude.ai):** dialecto con estado en `packages/adapters/src/byoa/`
(crear conversación + completion SSE Messages), `createByoaAdapter` (máquina
de dos pasos que implementa el contrato `Adapter`), allowlist de orígenes de
sesión `BYOA_SESSION_ALLOWED_ORIGINS` (espejo 1:1 de `host_permissions`),
`byoa:proxy`/`byoa:start` (gemelos de byok con `credentials:"include"`),
`byoa-client.ts` + `ByoaTestPanel` (gate + envío). Verificado de punta a
punta en Chrome real (§0.4).

**Roadmap de continuación (inventario en 3 clases, sin implementar aún):**
1. **Chat mainstream** (ChatGPT, Gemini, DeepSeek, Perplexity, Grok…):
   mismo patrón que claude.ai — buscar el endpoint interno de completion
   con la sesión abierta; probable estado análogo (crear conversación +
   turnos). Cada uno es ingeniería inversa propia; `dom` sólo si no hay
   endpoint reutilizable.
2. **Research-agent / con fit-de-contrato pendiente**: superficies cuyo
   "turno" no mapea limpio a un stream de texto único (agentes con pasos,
   herramientas, artefactos). Requieren decidir cómo se proyecta su salida
   al contrato `AdapterChunk` v1 (sólo texto) antes de adaptarlas.
3. **BYOK-native redundantes**: proveedores que ya cubre BYOK con llave
   (anthropic/google/openai/deepseek/perplexity por API). BYOA para ellos
   es redundante salvo que el usuario prefiera no gastar llave — baja
   prioridad. `chatglm.cn` inaccesible desde acá; GLM se alcanzaría vía
   `z.ai`.

- Gestión de pestañas (Q2): pendiente — hoy el adaptador claude no abre
  pestaña (fetch directo al endpoint desde el offscreen). Si algún
  proveedor exige DOM, ahí entra el grupo dedicado vía `chrome.tabGroups`.

**Criterio de aceptación:** *(CUMPLIDO para claude.ai, §0.4)* un adaptador
BYOA completo entrega un stream de texto reconocible en un panel, con abort
funcional.

---

## Fase 4 — UI central del multichat ✅ (Round A + Round B cerrados y verificados 2026-07-11 — ver §0.5 y §0.6)

**Round A — hecho, verificado (§0.5):** panel-runner unificado (E1), grid
completo con los 7 layouts + drag-reorder pre-lock (`@dnd-kit`) + modo foco
+ scroll sincronizado, sidebar con historial + búsqueda full-text
(`minisearch`), lock real disparado en el primer envío (E6), selector de
modelo curado con filtro de disponibilidad real por llave/sesión (E4),
metadatos de latencia/tokens por panel, "reintentar" (agrega `Attempt`) y
"continuar solo aquí" (`Reply.scope:"panel-continued"`) funcionando de
punta a punta, organización BYOA detectada y persistida por conversación
(E8), threading real por panel para BYOK (E2=B). Criterio de aceptación
verificado empíricamente contra Dexie real (§0.5): 3+ Rounds, reintento
que conserva el intento fallido, "continuar solo aquí", recuperación
completa tras una recarga simulada.

**Round B — hecho, verificado (§0.6):** mini-recon en el Chrome real de
Juan confirmó que `parent_message_uuid` del turno N+1 es el uuid del
mensaje del ASISTENTE del turno N, obtenible de un GET al árbol de la
conversación (no del stream). Parche de threading BYOA implementado
sobre ese hallazgo (`packages/adapters/src/byoa/adapter.ts` +
`conversation-repo.ts` leyendo/escribiendo `panelThreads`); de paso se
arregló un bug de re-render infinito (`activePanelSourceIds()` sin
`useShallow`) que bloqueaba toda la UI de Fase 4. Aceptación real
re-ejecutada con llave BYOK real + sesión BYOA real: threading
confirmado de verdad en ambos paneles a través de 3 Rounds, reintento,
"continuar solo aquí" y reload — todo detallado en §0.6.

**Deuda registrada para más adelante (no bloquea el cierre de fase):**
`hiddenModelIds` no persiste todavía por conversación; costo estimado
(E7) no implementado (dato frágil, se difiere); sin router — la
conversación activa tras un reload se resuelve con un puntero en
localStorage, no con una URL.

---

## Fase 5 — Herramientas del panel lateral ✅ (cerrada 2026-07-17 — aceptación real 2026-07-16 + adición visor/DOCX y mini-check Haiku 2026-07-17; ledger §0.8)

- **PDF unificado (Q28):** `pdfmake` con layout secuencial
  (prompt global → respuestas apiladas), metadatos (modelo, vía,
  fecha, latencia) y el branding de Fase 7 (wordmark de texto como placeholder hasta esa fase).
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

**Hecho (2026-07-11, sandbox — detalle y decisiones E1–E7 en §0.8):**
Dexie v3 aditiva con `roundAnalyses`; subsistema del juez en
`apps/web/src/lib/judge/` (anonimización estructural en 3 capas +
`guard:judge` en CI); PDF con `pdfmake` 0.3.11 code-split
(`build-doc-definition` puro compartido con el harness); panel lateral
de herramientas (Analyze + Export + Plantillas con `{{variable}}`);
chips Q31 leyendo `PROVIDER_CAPABILITIES`; harness persistente en
`src/dev/fase5-harness.ts` (54/54 con la adición).
**Adición 2026-07-16 (pedido de Juan; detalle y decisiones D1–D3 en
§0.8):** visor del informe en modal — mismo PDF en memoria, sin
descarga — y export DOCX con tablas copiables (`docx` 9.7.1
code-split, builder puro compartido con el harness, cargador común
`report-data.ts`).

**Criterio de aceptación:** el PDF exportado de una conversación real
con 6 paneles es legible y no corta contenido a mitad de página de
forma arbitraria. *(Mitad offline CUMPLIDA en sandbox con la
conversación sembrada de 6 paneles — §0.8. Mitad online CUMPLIDA
2026-07-16: juez real + reload + export desde la UI, ambos PDFs
juzgados LEGIBLES por Juan. Check de la adición y mini-check
Haiku CUMPLIDOS 2026-07-17 — fase cerrada, §0.8.)*

---

## Fase 6 — Autenticación y sync a Drive 🔜

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
- **Envío del informe por mail (pedido de Juan, 2026-07-17, post-cierre
  de Fase 5):** junto a Ver/PDF/DOCX, un botón "Enviar por mail" que
  mande el informe con los adjuntos. Investigación verificada
  2026-07-17 (no re-investigar salvo contradicción):
  · EmailJS DESCARTADO para "gratis con adjuntos": el plan free
    (200 mails/mes, 50 KB/request) NO incluye adjuntos; adjuntos sólo
    en planes pagos.
  · Camino recomendado (A): Gmail API `gmail.send` COMO el usuario —
    el mismo GIS token client que esta fase ya construye para
    `drive.appdata`, gratis, adjuntos hasta 25 MB, sin terceros ni
    backend, coherente con la filosofía BYO del producto. Costo: scope
    SENSIBLE (no restringido — sin security assessment); en modo
    testing funciona sin verificación de Google con hasta 100 test
    users agregados a mano en la consola (alcanza para el uso de Juan
    hoy); distribución pública exigiría verificación de Google
    (justificación + video demo).
  · Alternativas: (D) Web Share API con files — share sheet del SO,
    cero cuentas, complemento barato, pero soporte desktop desigual y
    no "envía" directo; (C) Netlify Function como relay con llave en
    env var — sería el PRIMER backend del proyecto, cuota compartida
    entre todos los usuarios y superficie de spam: sólo si A muere en
    la entrevista.
  Si A: el MIME multipart del mensaje se arma client-side (base64url)
  y va a `users.messages.send`.

**Criterio de aceptación:** cerrar la pestaña, reabrir en otro
navegador logueado con la misma cuenta de Google, y ver las
conversaciones sincronizadas (sin adjuntos, por diseño de Q18).
Para el mail: el informe LLEGA a un inbox real con los adjuntos
abribles (enviárselo a sí mismo — análogo de la regla Haiku: gastar
poco y en cuenta propia).

---

## Fase 7 — Design system + media pack 🔜

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
  duplicados inline en `apps/web` — las Fases 4/5/6 acumulan
  primitivas Tailwind inline A PROPÓSITO; esta fase las hereda y
  las extrae (ver §0.7).

**Criterio de aceptación:** ningún componente nuevo de `apps/web`
define un color hex fuera de `packages/ui`/`globals.css`.

---

## Fase 8 — Móvil ⏸ (alcance cambiado al cierre de Fase 1, 2026-07-04)

**Decisión de Juan (supersede el alcance anterior "BYOK-only"):** la v1
móvil de la SPA **sólo informa** que ChatCouncil corre en Chrome de
escritorio, porque el producto depende de una extensión que los
navegadores móviles no pueden alojar. El plan anterior de esta fase
(carrusel Q22 + subconjunto BYOK vía CORS con `mobileCompatibleProviders()`)
queda **retirado del roadmap v1**: mantener una experiencia móvil
parcial (algunos proveedores sí, otros no, sin BYOA) duplicaba UI para
un producto degradado.

**Ya implementado (al cierre de Fase 1, no requiere fase propia):** gate
informativo en `App.tsx` — detección móvil por UA (+`userAgentData.mobile`
donde existe) → pantalla de aviso con la explicación y la dirección
futura. Caso borde conocido y aceptado: iPadOS se presenta como Mac →
cae al flujo desktop y termina en el badge "Extensión no instalada"
(degradación coherente, no un error). En móvil no se intenta conectar el
puente (no hay extensión posible).

**Vía en evaluación para habilitar móvil de verdad: extensión para
Firefox en Android.** Firefox para Android soporta WebExtensions (el
catálogo completo de AMO está abierto desde fines de 2023). La base de
código actual está bien posicionada para un port (WXT compila
multi-target y todo el código usa el namespace estándar `browser.*`),
pero el port NO es gratis — dos fricciones estructurales, ambas en el
corazón del puente de Fase 1:
1. **Firefox no soporta `externally_connectable`** — el transporte
   entero de Q7 (la SPA abre un Port con `runtime.connect(extensionId)`)
   no existe ahí. El patrón estándar de reemplazo es un content script
   inyectado en el origen de la SPA que puentea `window.postMessage` ↔
   mensajería interna. Es una capa de adaptación del transporte, no un
   cambio del protocolo v2 (los mensajes viajan igual).
2. **Firefox no tiene `chrome.offscreen`** — pero tampoco lo necesita:
   su MV3 usa **event pages**, no service workers, con semántica de
   vida distinta; el sostén del stream + buffer de reanudación viviría
   en el background directamente. La arquitectura "router liviano +
   dueño-del-stream separado" de Fase 1 se conserva conceptualmente;
   cambia dónde vive el dueño.
Pendiente de verificar si se retoma: paridad de `tabGroups` en Firefox
(hoy en `permissions`; probablemente ignorado/ausente) y el criterio de
aceptación móvil real. Esta vía queda **post-v1, sin fase asignada** —
se evalúa después de Fase 9 si el uso lo justifica.

**Criterio de aceptación (del alcance vigente):** en un navegador móvil
real, la SPA muestra el aviso informativo (no la UI de paneles, no un
error de red, no el badge de extensión); en desktop nada cambia.

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
- El allowlist del proxy BYOK vive EN CÓDIGO (`packages/adapters`,
  espejado 1:1 en `host_permissions`); el manifiesto remoto sólo puede
  APAGAR proveedores, jamás agregar dominios al proxy (Fase 2, E5).
- Los Rounds THREADEAN por panel, no son comparaciones independientes
  (Fase 4, E2 — corrección explícita de Juan sobre la recomendación
  original): un follow-up en Round N+1 debe llegarle a cada panel con
  memoria real de lo que ese mismo panel respondió antes, no como pregunta
  aislada. Para BYOK esto es reenviar el array de mensajes completo; para
  BYOA-claude es reusar la conversación del proveedor entre Rounds,
  encadenando `parent_message_uuid` = uuid del mensaje del asistente del
  turno anterior (Fase 4, Round B — ver §0.6).
