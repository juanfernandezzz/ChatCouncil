import type {
  AdapterAvailability,
  BridgeRequest,
  BridgeResponse,
} from "@chatcouncil/shared";
import {
  BRIDGE_PORT_NAME,
  BRIDGE_PROTOCOL_VERSION,
  SELFTEST_PROVIDER_ID,
} from "@chatcouncil/shared";
import { BYOA_SESSION_ALLOWED_ORIGINS, BYOK_PROXY_ALLOWED_ORIGINS } from "@chatcouncil/adapters";
import { openProviderWindow, tileGeometries } from "../lib/provider-windows";
import {
  isDiagRequest,
  isOffscreenReady,
  isOffscreenRelay,
  type DiagSnapshot,
  type ToOffscreenMessage,
} from "@/lib/offscreen-protocol";

// `defineBackground` y `browser` son globals auto-importados por WXT.
//
// Rol del service worker en Fase 1/2: ROUTER LIVIANO. No sostiene streams
// NI ejecuta fetch de proveedores (el offscreen lo hace, porque el SW
// muere a los ~30s y un fetch cuya respuesta tarda >30s también lo mata —
// verificado en la doc de Chrome; aplica a byok streaming o no). El SW:
// (1) resuelve el handshake alimentando la lista de adaptadores desde el
// manifiesto cacheado; (2) enruta dispatch/resume/abort y el proxy BYOK
// (previa allowlist + sender.origin, Q11) al offscreen; (3) hace
// broadcast de los chunks del offscreen a los Ports externos conectados;
// (4) responde el snapshot de diagnóstico al popup.
//
// Todo el estado de abajo es de MEMORIA y se pierde si el SW se suspende.
// Es a propósito: se reconstruye solo (los Ports se re-registran al
// reconectar la SPA; el manifiesto se re-lee de storage.local; el buffer
// de streams vive en el offscreen, que sobrevive).

// URL del manifiesto remoto (Q9). Servido por Netlify con CORS abierto
// (ver netlify.toml, decisión "cartel"): la extensión lo fetchea por CORS
// normal, sin host_permissions. En dev local puede degradar a vacío si
// el server de Vite no expone CORS — no bloquea nada (el handshake igual
// resuelve con adaptadores vacíos).
const ADAPTERS_MANIFEST_URL = "https://chatcouncil.netlify.app/adapters.json";
const MANIFEST_STORAGE_KEY = "adaptersManifestCache";
const MANIFEST_TTL_MS = 10 * 60 * 1000; // 10 min

const OFFSCREEN_PATH = "/offscreen.html";

type ExternalPort = Parameters<
  Parameters<typeof browser.runtime.onConnectExternal.addListener>[0]
>[0];

interface AdaptersManifest {
  providers?: Array<{ id?: string; byoaStrategy?: string; healthy?: boolean | null }>;
}

interface ManifestCache {
  manifest: AdaptersManifest;
  fetchedAt: number;
}

const externalPorts = new Set<ExternalPort>();
let lastManifestResolve: DiagSnapshot["manifest"] | null = null;
let creatingOffscreen: Promise<void> | null = null;

export default defineBackground(() => {
  browser.runtime.onConnectExternal.addListener((port) => {
    if (port.name !== BRIDGE_PORT_NAME) return; // otro Port ajeno: ignorar
    externalPorts.add(port);
    port.onDisconnect.addListener(() => externalPorts.delete(port));
    port.onMessage.addListener((message: BridgeRequest) => {
      void handleExternal(port, message);
    });
  });

  // Bus interno: sw-relay (chunks del offscreen -> broadcast) y diag (popup).
  browser.runtime.onMessage.addListener((message: unknown) => {
    const m = message as Record<string, unknown> | null;
    if (m && m.envelope === "byoa:page:event") {
      relayPageEvent(m);
    }
  });

  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (isOffscreenReady(message)) {
      offscreenReadyResolve?.();
      return; // sin respuesta
    }
    if (isOffscreenRelay(message)) {
      broadcast(message.payload);
      return; // sin respuesta
    }
    if (isDiagRequest(message)) {
      void buildDiag().then(sendResponse);
      return true; // respuesta asíncrona
    }
    return;
  });
});

function broadcast(payload: BridgeResponse): void {
  for (const port of externalPorts) {
    try {
      port.postMessage(payload);
    } catch {
      externalPorts.delete(port); // Port muerto
    }
  }
}

/** Puertos de la SPA esperando eventos del ejecutor, por requestId. */
const pageRequests = new Map<string, ExternalPort>();
/** Secuencia de chunks por requestId, para respetar el contrato de stream. */
const pageSeq = new Map<string, number>();
/** Ultimo texto ya entregado por requestId, para emitir INCREMENTOS. */
const pageText = new Map<string, string>();
/** Si el turno arranco ventana NUEVA (o sea: no continua el hilo previo). */
const pageFreshWindow = new Map<string, boolean>();

/**
 * Keepalive del transporte "page". A diferencia de BYOK (linea 25: el fetch
 * vive en el offscreen porque el SW muere a los ~30s), acá el estado
 * pendiente (`pageRequests` et al.) SI vive en memoria del SW mientras el
 * turno corre — y un turno "page" puede tardar hasta ~90s (los techos de
 * chatgpt.ts). Sin esto, un SW que se suspende a mitad de turno pierde los
 * Maps; cuando el content script manda el evento `done` final, el SW
 * revivido no encuentra el puerto y lo descarta en silencio — el panel
 * queda colgado para siempre sin error. Llamar una API de chrome.* reinicia
 * el timer de inactividad del SW (mecanismo documentado de Chrome), asi
 * que un ping periodico barato alcanza. Se activa solo mientras haya algun
 * pageRequest pendiente.
 */
let pageKeepAliveTimer: ReturnType<typeof setInterval> | null = null;

function ensurePageKeepAlive(): void {
  if (pageKeepAliveTimer !== null) return;
  pageKeepAliveTimer = setInterval(() => {
    void browser.runtime.getPlatformInfo();
  }, 20_000);
}

function stopPageKeepAliveIfIdle(): void {
  if (pageRequests.size > 0) return;
  if (pageKeepAliveTimer === null) return;
  clearInterval(pageKeepAliveTimer);
  pageKeepAliveTimer = null;
}

/**
 * Entrega la orden al content script. La ventana recien creada puede no
 * tener el ejecutor listo todavia, asi que se reintenta con techo en vez
 * de fallar en el primer intento.
 */
async function sendToPageExecutor(tabId: number, payload: unknown): Promise<void> {
  const deadline = Date.now() + 15_000;
  for (;;) {
    try {
      await browser.tabs.sendMessage(tabId, payload);
      return;
    } catch {
      if (Date.now() > deadline) throw new Error("el ejecutor de pagina no respondio a tiempo");
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

/**
 * Traduce los eventos del ejecutor al protocolo de stream que la SPA YA
 * consume, para que los paneles funcionen sin cambios.
 */
function relayPageEvent(ev: Record<string, unknown>): void {
  const requestId = typeof ev.requestId === "string" ? ev.requestId : null;
  if (!requestId) return;
  const port = pageRequests.get(requestId);
  if (!port) return;

  const kind = ev.kind;
  if (kind === "delta" && typeof ev.text === "string") {
    // El ejecutor manda SNAPSHOTS del texto completo (robusto ante
    // reescrituras del DOM); el contrato de `stream:chunk` es de
    // INCREMENTOS acumulables. Se traduce acá con prefijo comun mas largo:
    // el caso normal es crecimiento monotono y el incremento es el sufijo.
    // LIMITACION DECLARADA (§0.27): si el proveedor REESCRIBE texto ya
    // emitido (reflow de markdown, por ejemplo), el panel conserva lo viejo
    // y solo recibe lo nuevo desde el punto de divergencia. Es aproximacion
    // append-only, no se disimula.
    const prev = pageText.get(requestId) ?? "";
    const next = ev.text;
    let i = 0;
    while (i < prev.length && i < next.length && prev[i] === next[i]) i++;
    const increment = next.slice(i);
    pageText.set(requestId, next);
    if (increment.length === 0) return;
    // Convencion de `seq` 0-indexada (igual que el offscreen, main.ts:84):
    // el cliente arranca en lastSeq=-1 y drena esperando el chunk 0 primero.
    // Arrancar en 1 (bug anterior) dejaba el primer chunk inalcanzable y el
    // stream jamas drenaba ni terminaba, sin importar cuanto tardara la
    // respuesta real.
    const seq = pageSeq.get(requestId) ?? 0;
    pageSeq.set(requestId, seq + 1);
    port.postMessage({ type: "stream:chunk", requestId, seq, chunk: increment } satisfies BridgeResponse);
    return;
  }
  if (kind === "human-gate") {
    port.postMessage({
      type: "stream:challenge",
      requestId,
      origin: typeof ev.origin === "string" ? ev.origin : "",
    } satisfies BridgeResponse);
    return;
  }
  if (kind === "done") {
    port.postMessage({
      type: "stream:done",
      requestId,
      // pageSeq guarda el PROXIMO seq a asignar (= cantidad de chunks
      // enviados); el ultimo real es esa cuenta menos uno. Sin chunks
      // (respuesta vacia), da -1, igual que el offscreen con total=0.
      lastSeq: (pageSeq.get(requestId) ?? 0) - 1,
      meta: {
        visibility: ev.visibility,
        hiddenMs: ev.hiddenMs,
        elapsedMs: ev.elapsedMs,
        // "continuo el hilo anterior" vs "arranco conversacion nueva" (§0.31)
        threadContinued: pageFreshWindow.get(requestId) === false,
      },
    } satisfies BridgeResponse);
    pageRequests.delete(requestId);
    pageSeq.delete(requestId);
    pageText.delete(requestId);
    pageFreshWindow.delete(requestId);
    stopPageKeepAliveIfIdle();
    return;
  }
  if (kind === "error" || kind === "stalled") {
    const message =
      kind === "stalled"
        ? `sin avance observable (${String(ev.idleMs)} ms)`
        : String(ev.message ?? "fallo del ejecutor de pagina");
    if (kind === "error") {
      port.postMessage({ type: "stream:error", requestId, message } satisfies BridgeResponse);
      pageRequests.delete(requestId);
      pageSeq.delete(requestId);
      pageText.delete(requestId);
      stopPageKeepAliveIfIdle();
    }
  }
}

async function handleExternal(port: ExternalPort, message: BridgeRequest): Promise<void> {
  switch (message.type) {
    case "handshake": {
      if (message.protocolVersion !== BRIDGE_PROTOCOL_VERSION) {
        const reject: BridgeResponse = { type: "handshake:reject", reason: "version-mismatch" };
        port.postMessage(reject);
        return;
      }
      const adapters = await resolveManifestAdapters();
      const ack: BridgeResponse = {
        type: "handshake:ack",
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        extensionVersion: browser.runtime.getManifest().version,
        adapters,
      };
      port.postMessage(ack);
      return;
    }

    case "byoa:dispatch": {
      if (message.providerId === SELFTEST_PROVIDER_ID) {
        const chunks = message.payload.selfTest?.chunks ?? 40;
        const intervalMs = message.payload.selfTest?.intervalMs ?? 1000;
        await sendToOffscreen({
          target: "offscreen",
          kind: "selftest:start",
          requestId: message.requestId,
          chunks,
          intervalMs,
        });
        return;
      }
      // Adaptadores BYOA reales: Fase 3 (requiere ingeniería inversa). No
      // respondemos un error simulado: sería peor que el silencio porque
      // se manejaría como fallo real de la llamada en vez de feature
      // pendiente.
      console.warn(`[chatcouncil-bridge] byoa:dispatch "${message.providerId}" aún no implementado (Fase 3)`);
      return;
    }

    case "stream:resume": {
      // Genérico desde Fase 2 (E4): el buffer del offscreen se indexa por
      // requestId — reanuda byoa, byok o self-test indistintamente.
      await sendToOffscreen({
        target: "offscreen",
        kind: "resume",
        requestId: message.requestId,
        fromSeq: message.fromSeq,
      });
      return;
    }

    case "byoa:page": {
      // Transporte "page" (§0.25). El SW abre/reutiliza la ventana del
      // proveedor y le entrega la spec al ejecutor. No interpreta la spec:
      // runner agnostico (Q1).
      const spec = message.spec as { newConversationUrl?: string } | null;
      const url = spec?.newConversationUrl;
      if (!url) {
        const err: BridgeResponse = {
          type: "stream:error",
          requestId: message.requestId,
          message: "la spec del proveedor no trae newConversationUrl",
        };
        port.postMessage(err);
        return;
      }
      pageRequests.set(message.requestId, port);
      ensurePageKeepAlive();
      try {
        const geo = tileGeometries(1, { left: 40, top: 40, width: 520, height: 720 })[0]!;
        const ref = await openProviderWindow(message.providerId, url, geo);
        // §0.31: si la ventana se creo, este turno NO continua el hilo
        // anterior — arranca conversacion nueva. Se avisa en vez de dejar
        // que la ruptura pase inadvertida.
        pageFreshWindow.set(message.requestId, ref.created);
        await sendToPageExecutor(ref.tabId, {
          kind: "byoa:page:run",
          requestId: message.requestId,
          prompt: message.prompt,
          spec: message.spec,
        });
      } catch (e) {
        pageRequests.delete(message.requestId);
        stopPageKeepAliveIfIdle();
        const err: BridgeResponse = {
          type: "stream:error",
          requestId: message.requestId,
          message: e instanceof Error ? e.message : "no se pudo iniciar el transporte de pagina",
        };
        port.postMessage(err);
      }
      return;
    }

    case "byoa:abort": {
      await sendToOffscreen({ target: "offscreen", kind: "abort", requestId: message.requestId });
      return;
    }

    case "byok:proxy": {
      const denial = validateByokProxy(port, message);
      if (denial) {
        // Diagnóstico sin secretos: requestId + razón (origins), JAMÁS
        // los headers del mensaje (llevan la API key del usuario).
        console.warn(
          `[chatcouncil-bridge] byok:proxy rechazado (${denial}) requestId=${message.requestId}`,
        );
        const err: BridgeResponse = {
          type: "stream:error",
          requestId: message.requestId,
          message: `byok:proxy rechazado: ${denial}`,
        };
        try {
          port.postMessage(err);
        } catch {
          externalPorts.delete(port); // Port muerto
        }
        return;
      }
      await sendToOffscreen({
        target: "offscreen",
        kind: "byok:start",
        requestId: message.requestId,
        url: message.url,
        method: message.method,
        headers: message.headers,
        body: message.body,
        stream: message.stream,
      });
      return;
    }

    case "byok:proxy-abort": {
      // Mismo abort genérico del offscreen: el registro es por requestId.
      await sendToOffscreen({ target: "offscreen", kind: "abort", requestId: message.requestId });
      return;
    }

    case "byoa:proxy": {
      // Fase 3 (B+): gemelo de byok:proxy con semántica de sesión. Mismo
      // patrón de validación, pero contra el allowlist de orígenes de
      // SESIÓN (host_permissions lo espeja 1:1). El offscreen ejecutará el
      // fetch con credentials:"include" (delta del kind byoa:start).
      const denial = validateByoaProxy(port, message);
      if (denial) {
        // Diagnóstico sin secretos: requestId + razón (origins), jamás los
        // headers del mensaje.
        console.warn(
          `[chatcouncil-bridge] byoa:proxy rechazado (${denial}) requestId=${message.requestId}`,
        );
        const err: BridgeResponse = {
          type: "stream:error",
          requestId: message.requestId,
          message: `byoa:proxy rechazado: ${denial}`,
        };
        try {
          port.postMessage(err);
        } catch {
          externalPorts.delete(port); // Port muerto
        }
        return;
      }
      await sendToOffscreen({
        target: "offscreen",
        kind: "byoa:start",
        requestId: message.requestId,
        url: message.url,
        method: message.method,
        headers: message.headers,
        body: message.body,
        stream: message.stream,
      });
      return;
    }

    default: {
      const exhaustiveCheck: never = message;
      console.warn("[chatcouncil-bridge] mensaje desconocido", exhaustiveCheck);
    }
  }
}

// --------------------------------------------------------------------------
// Proxy BYOK (Fase 2, Q11): allowlist estricta + verificación de origen
// --------------------------------------------------------------------------

// Defensa en profundidad: `externally_connectable` YA limita a nivel de
// manifest quién puede abrir el Port (ver wxt.config.ts, espejar ambos),
// pero byok:proxy mueve credenciales del usuario hacia dominios externos
// y no debe depender de una sola capa — se re-verifica POR MENSAJE.
const ALLOWED_SPA_ORIGINS = new Set(["https://chatcouncil.netlify.app", "http://localhost:5173"]);

// Fuente de verdad EN CÓDIGO (packages/adapters, decisión E5 + Apéndice):
// el manifiesto remoto sólo puede apagar proveedores, jamás agregar
// dominios al proxy. host_permissions (wxt.config.ts) espeja esta lista.
const BYOK_ORIGIN_SET = new Set<string>(BYOK_PROXY_ALLOWED_ORIGINS);

function portOrigin(port: ExternalPort): string | undefined {
  // Acceso estructural: el shape de Port.sender varía entre typings de
  // browser; el dato en runtime existe para Ports de onConnectExternal.
  return (port as { sender?: { origin?: string } }).sender?.origin;
}

/** null = permitido; string = razón del rechazo (sin secretos, nunca headers). */
function validateByokProxy(
  port: ExternalPort,
  message: Extract<BridgeRequest, { type: "byok:proxy" }>,
): string | null {
  const origin = portOrigin(port);
  if (!origin || !ALLOWED_SPA_ORIGINS.has(origin)) {
    return `sender.origin no permitido (${origin ?? "desconocido"})`;
  }
  let target: URL;
  try {
    target = new URL(message.url);
  } catch {
    return "url inválida";
  }
  if (target.protocol !== "https:") {
    return `protocolo no permitido (${target.protocol})`;
  }
  if (!BYOK_ORIGIN_SET.has(target.origin)) {
    return `dominio fuera del allowlist BYOK (${target.origin})`;
  }
  return null;
}

// Fase 3 (BYOA): orígenes de SESIÓN admitidos por el proxy. Fuente de
// verdad EN CÓDIGO (packages/adapters), espejada 1:1 por host_permissions.
// El manifiesto remoto jamás puede agregar un host de sesión.
const BYOA_ORIGIN_SET = new Set<string>(BYOA_SESSION_ALLOWED_ORIGINS);

/** null = permitido; string = razón del rechazo (sin secretos, nunca headers). */
function validateByoaProxy(
  port: ExternalPort,
  message: Extract<BridgeRequest, { type: "byoa:proxy" }>,
): string | null {
  const origin = portOrigin(port);
  if (!origin || !ALLOWED_SPA_ORIGINS.has(origin)) {
    return `sender.origin no permitido (${origin ?? "desconocido"})`;
  }
  let target: URL;
  try {
    target = new URL(message.url);
  } catch {
    return "url inválida";
  }
  if (target.protocol !== "https:") {
    return `protocolo no permitido (${target.protocol})`;
  }
  if (!BYOA_ORIGIN_SET.has(target.origin)) {
    return `host de sesión fuera del allowlist BYOA (${target.origin})`;
  }
  return null;
}

// --------------------------------------------------------------------------
// Offscreen lifecycle
// --------------------------------------------------------------------------

// Handshake de disponibilidad (ver OffscreenReadyMessage). Un único
// resolver pendiente a la vez alcanza: sólo hay un offscreen document
// posible en toda la extensión. Se resuelve desde el listener interno
// de mensajes cuando llega isOffscreenReady(...).
let offscreenReadyResolve: (() => void) | null = null;
const OFFSCREEN_READY_TIMEOUT_MS = 3000;

async function ensureOffscreen(): Promise<void> {
  const offscreenUrl = browser.runtime.getURL(OFFSCREEN_PATH);
  const existing = await browser.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl],
  });
  if (existing.length > 0) {
    // Ya existía ANTES de esta llamada (p. ej. sobrevivió a la muerte de
    // una instancia previa del SW, que es justamente el caso que Fase 1
    // necesita). Lleva rato corriendo → su listener se registró hace
    // tiempo → no hay carrera que esperar acá. Esperar igual sería
    // lentitud sin beneficio, no corrección real.
    return;
  }

  // Guarda de concurrencia: createDocument tira error si ya existe uno.
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  // A partir de acá SÍ hay una carrera real: createDocument() resuelve
  // cuando el documento EXISTE, no cuando su script módulo terminó de
  // ejecutar y registró `runtime.onMessage`. Mandar el primer mensaje
  // apenas resuelve createDocument puede llegar antes de que haya alguien
  // escuchando ("Receiving end does not exist" — visto literalmente en
  // consola en la corrida de verificación, en el PRIMER mensaje de la
  // sesión). Cerramos la carrera esperando el ping `offscreen-ready` que
  // el propio documento manda apenas registra su listener.
  const readyPromise = new Promise<void>((resolve) => {
    offscreenReadyResolve = resolve;
  });

  creatingOffscreen = browser.offscreen
    .createDocument({
      url: offscreenUrl,
      // No existe un `reason` "network". WORKERS da lifetime ilimitado
      // (sólo AUDIO_PLAYBACK tiene tope). Q8 = sin Chrome Web Store en v1,
      // así que la revisión de store no es un gate; revisar este reason si
      // eso cambia.
      reasons: [browser.offscreen.Reason.WORKERS],
      justification:
        "Sostiene streams de larga duración y su buffer de reanudación mientras el service worker se suspende.",
    })
    .finally(() => {
      creatingOffscreen = null;
    });
  await creatingOffscreen;

  const timedOut = await Promise.race([
    readyPromise.then(() => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(true), OFFSCREEN_READY_TIMEOUT_MS)),
  ]);
  offscreenReadyResolve = null;
  if (timedOut) {
    // No convertimos esto en un cuelgue nuevo: seguimos igual (degrada al
    // comportamiento previo, que ya falla de forma diagnosticable vía
    // sendToOffscreen), pero dejamos rastro explícito de que el handshake
    // no llegó a tiempo — sería la señal de que el problema es más
    // profundo que timing (el documento no cargó en absoluto).
    console.warn(
      `[SW] offscreen no confirmó "ready" dentro de ${OFFSCREEN_READY_TIMEOUT_MS}ms; ` +
        "siguiendo de todas formas (puede volver a fallar con 'Receiving end does not exist').",
    );
  }
}

async function sendToOffscreen(msg: ToOffscreenMessage): Promise<void> {
  await ensureOffscreen();
  // Nunca tragamos el error de entrega en silencio (lección de Fase 1,
  // ver BLUEPRINT §0.2): un warn barato mantiene esto diagnosticable.
  await browser.runtime.sendMessage(msg).catch((err) => {
    console.warn("[SW] envío a offscreen falló:", msg.kind, err);
  });
}

// --------------------------------------------------------------------------
// Manifiesto remoto: fetch + cache con TTL + degradación (Q9)
// --------------------------------------------------------------------------

function toAdapters(m: AdaptersManifest): AdapterAvailability[] {
  return (m.providers ?? []).flatMap((p) =>
    p.id
      ? [{ providerId: p.id, byoaReady: false, reason: "pending-reverse-engineering (Fase 3)" }]
      : [],
  );
}

async function readManifestCache(): Promise<ManifestCache | null> {
  const got = await browser.storage.local.get(MANIFEST_STORAGE_KEY);
  const rec = got[MANIFEST_STORAGE_KEY] as unknown;
  if (
    rec &&
    typeof rec === "object" &&
    "manifest" in rec &&
    "fetchedAt" in rec &&
    typeof (rec as ManifestCache).fetchedAt === "number"
  ) {
    return rec as ManifestCache;
  }
  return null;
}

async function resolveManifestAdapters(): Promise<AdapterAvailability[]> {
  const cache = await readManifestCache();
  const fresh = cache != null && Date.now() - cache.fetchedAt < MANIFEST_TTL_MS;

  if (cache && fresh) {
    lastManifestResolve = {
      fetchedAt: cache.fetchedAt,
      fresh: true,
      providerCount: (cache.manifest.providers ?? []).length,
      source: "cache",
    };
    return toAdapters(cache.manifest);
  }

  // stale o inexistente -> intentar red
  try {
    const res = await fetch(ADAPTERS_MANIFEST_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const manifest = (await res.json()) as AdaptersManifest;
    const fetchedAt = Date.now();
    await browser.storage.local.set({
      [MANIFEST_STORAGE_KEY]: { manifest, fetchedAt } satisfies ManifestCache,
    });
    lastManifestResolve = {
      fetchedAt,
      fresh: true,
      providerCount: (manifest.providers ?? []).length,
      source: "network",
    };
    return toAdapters(manifest);
  } catch {
    // Degradar al último cache válido aunque esté vencido. El manifiesto
    // NO debe ser un punto único de fallo: si Netlify tiene un hiccup, la
    // extensión sigue funcionando con lo último que vio.
    if (cache) {
      lastManifestResolve = {
        fetchedAt: cache.fetchedAt,
        fresh: false,
        providerCount: (cache.manifest.providers ?? []).length,
        source: "cache",
      };
      return toAdapters(cache.manifest);
    }
    lastManifestResolve = { fetchedAt: null, fresh: false, providerCount: 0, source: "empty" };
    return [];
  }
}

// --------------------------------------------------------------------------
// Diagnóstico (popup)
// --------------------------------------------------------------------------

async function buildDiag(): Promise<DiagSnapshot> {
  let offscreenAlive = false;
  try {
    const ctx = await browser.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
    offscreenAlive = ctx.length > 0;
  } catch {
    offscreenAlive = false;
  }
  return {
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    extensionVersion: browser.runtime.getManifest().version,
    connectedPorts: externalPorts.size,
    offscreenAlive,
    manifest:
      lastManifestResolve ?? { fetchedAt: null, fresh: false, providerCount: 0, source: "empty" },
  };
}
