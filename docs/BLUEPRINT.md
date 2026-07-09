# ChatCouncil — Blueprint Arquitectónico (/goal)

> Este documento es la fuente de verdad del plan de ejecución. Vive en el
> repo (no solo en el chat) para que cualquier sesión futura — tuya, mía,
> o de Claude Code trabajando de forma autónoma — pueda retomarlo sin
> releer todo el hilo de la entrevista. Cross-referencias `Qn` apuntan a
> las respuestas de la entrevista de requerimientos original.

**Estado global:** Fases 0–2 completas y verificadas (Fase 2 cerrada
2026-07-09; diferidos-por-llave nominados en §0.3). Fases 3–9
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
