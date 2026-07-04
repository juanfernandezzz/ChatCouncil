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
import {
  isDiagRequest,
  isOffscreenReady,
  isOffscreenRelay,
  type DiagSnapshot,
  type ToOffscreenMessage,
} from "@/lib/offscreen-protocol";

// `defineBackground` y `browser` son globals auto-importados por WXT.
//
// Rol del service worker en Fase 1: ROUTER LIVIANO. No sostiene streams
// (el offscreen lo hace, porque el SW muere a los ~30s y un fetch cuya
// respuesta tarda >30s también lo mata — verificado en la doc de Chrome).
// El SW: (1) resuelve el handshake alimentando la lista de adaptadores
// desde el manifiesto cacheado; (2) enruta dispatch/resume/abort al
// offscreen; (3) hace broadcast de los chunks del offscreen a los Ports
// externos conectados; (4) responde el snapshot de diagnóstico al popup.
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
  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (isOffscreenReady(message)) {
      console.log("[SW] offscreen confirmó ready");
      offscreenReadyResolve?.();
      return; // sin respuesta
    }
    if (isOffscreenRelay(message)) {
      // INSTRUMENTACIÓN DE DIAGNÓSTICO (temporal, ver nota en offscreen/main.ts relay()).
      console.log(
        "[SW] relay recibido de offscreen:",
        message.payload.type,
        "requestId" in message.payload ? message.payload.requestId : "-",
        "-> broadcasting a",
        externalPorts.size,
        "port(s)",
      );
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

    case "byoa:resume": {
      await sendToOffscreen({
        target: "offscreen",
        kind: "resume",
        requestId: message.requestId,
        fromSeq: message.fromSeq,
      });
      return;
    }

    case "byoa:abort": {
      await sendToOffscreen({ target: "offscreen", kind: "abort", requestId: message.requestId });
      return;
    }

    case "byok:proxy":
    case "byok:proxy-abort": {
      console.warn(`[chatcouncil-bridge] mensaje "${message.type}" aún no implementado (Fase 2)`);
      return;
    }

    default: {
      const exhaustiveCheck: never = message;
      console.warn("[chatcouncil-bridge] mensaje desconocido", exhaustiveCheck);
    }
  }
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
    console.log(
      `[SW] offscreen no confirmó "ready" dentro de ${OFFSCREEN_READY_TIMEOUT_MS}ms; ` +
        "siguiendo de todas formas (puede volver a fallar con 'Receiving end does not exist').",
    );
  }
}

async function sendToOffscreen(msg: ToOffscreenMessage): Promise<void> {
  await ensureOffscreen();
  // INSTRUMENTACIÓN DE DIAGNÓSTICO (temporal, ver nota en offscreen/main.ts
  // relay()). Antes esto tragaba el error de entrega SIN loguear nada.
  console.log("[SW] enviando a offscreen:", msg.kind, "requestId" in msg ? msg.requestId : "-");
  await browser.runtime.sendMessage(msg)
    .then(() => {
      console.log("[SW] mensaje a offscreen ENTREGADO:", msg.kind);
    })
    .catch((err) => {
      console.log("[SW] mensaje a offscreen FALLÓ:", msg.kind, err);
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
