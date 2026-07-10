import {
  BRIDGE_PORT_NAME,
  BRIDGE_PROTOCOL_VERSION,
  HANDSHAKE_TIMEOUT_MS,
  SELFTEST_PROVIDER_ID,
  type AdapterAvailability,
  type BridgeRequest,
  type BridgeResponse,
} from "@chatcouncil/shared";

/**
 * Cliente del puente SPA ↔ extensión (Fase 1). Reemplaza el stub de
 * detección de una sola pasada por una CONEXIÓN PERSISTENTE con:
 *   · Reconexión con backoff si el Port cae (p. ej. el service worker
 *     MV3 se suspende — verificado: un Port abierto ya NO mantiene vivo
 *     al SW desde Chrome 114, sólo lo hace enviar mensajes).
 *   · Reanudación con PRESERVACIÓN DE CONTENIDO (decisión B): tras
 *     reconectar, por cada stream en vuelo pide `stream:resume {fromSeq}`
 *     (hasta Fase 2 se llamaba `byoa:resume`; hoy es genérico — byoa,
 *     byok o self-test, el buffer del offscreen se indexa por requestId).
 *     El offscreen (que sobrevive a la muerte del SW) reproduce su buffer
 *     desde ahí. Los chunks se entregan EN ORDEN vía un buffer `pending`,
 *     tolerando que la reproducción y los chunks en vivo lleguen
 *     intercalados o duplicados tras la reconexión.
 *   · PISO garantizado (A-floor): si la reanudación es imposible
 *     (offscreen caído, buffer desalojado, reintentos agotados), el stream
 *     termina en `stream:aborted` → error recuperable, nunca cuelgue
 *     silencioso.
 *
 * No hay `@types/chrome` en la SPA (no es una extensión). Se accede a
 * `chrome.runtime` con un tipo estructural mínimo, igual que hacía el
 * stub original.
 */

const EXTENSION_ID =
  (import.meta.env.VITE_EXTENSION_ID as string | undefined) ?? "bjplhepllcbcpnhnpnpmcecddbjmlpch";

const DOWNLOAD_URL =
  (import.meta.env.VITE_EXTENSION_DOWNLOAD_URL as string | undefined) ??
  "https://github.com/juanfernandezzz/ChatCouncil/releases";

/** Backoff de reconexión (ms). Al agotarse, se abortan los streams en vuelo. */
const RECONNECT_BACKOFF_MS = [250, 500, 1000, 2000, 4000] as const;

/** El payload de un byoa:dispatch, derivado del contrato compartido. */
type DispatchPayload = Extract<BridgeRequest, { type: "byoa:dispatch" }>["payload"];

/** Request cruda de byok:proxy (Fase 2), derivada del contrato compartido. */
type ByokProxyPayload = Omit<Extract<BridgeRequest, { type: "byok:proxy" }>, "type" | "requestId">;

/** Request cruda de byoa:proxy (Fase 3), derivada del contrato compartido. */
type ByoaProxyPayload = Omit<Extract<BridgeRequest, { type: "byoa:proxy" }>, "type" | "requestId">;

export type ExtensionStatus =
  | { state: "checking" }
  | { state: "not-installed"; downloadUrl: string }
  | { state: "outdated"; downloadUrl: string }
  | { state: "connected"; extensionVersion: string; adapters: AdapterAvailability[] };

export interface StreamHandlers {
  onChunk: (seq: number, chunk: string) => void;
  onDone: (lastSeq: number, meta?: Record<string, unknown>) => void;
  onError: (message: string) => void;
  /** Piso: el stream no se pudo completar ni reanudar. Terminal. */
  onAborted: () => void;
  /** El Port cayó con este stream en vuelo; intentando reanudar. */
  onReconnecting?: () => void;
  /** La reanudación prosperó; volviendo a recibir. */
  onResumed?: () => void;
}

interface StreamRecord {
  /** Familia del stream: decide qué mensaje de abort corresponde. La
   * reanudación es genérica (`stream:resume`) para ambas. */
  kind: "byoa" | "byok";
  handlers: StreamHandlers;
  /** Último seq entregado contiguamente (empieza en -1). */
  lastSeq: number;
  /** Chunks recibidos por encima de lastSeq, esperando contigüidad. */
  pending: Map<number, string>;
  terminal: boolean;
  /** Set cuando llega stream:done; sólo finalizamos al drenar hasta acá. */
  doneLastSeq: number | null;
  doneMeta?: Record<string, unknown>;
}

interface ChromePort {
  postMessage: (msg: BridgeRequest) => void;
  onMessage: { addListener: (cb: (msg: BridgeResponse) => void) => void };
  onDisconnect: { addListener: (cb: () => void) => void };
}
interface ChromeRuntime {
  connect: (extensionId: string, opts: { name: string }) => ChromePort;
}

function getChromeRuntime(): ChromeRuntime | null {
  const runtime = (globalThis as { chrome?: { runtime?: Partial<ChromeRuntime> } }).chrome?.runtime;
  if (!runtime || typeof runtime.connect !== "function") return null;
  return runtime as ChromeRuntime;
}

class BridgeClient {
  private port: ChromePort | null = null;
  private status: ExtensionStatus = { state: "checking" };
  private statusSubs = new Set<(s: ExtensionStatus) => void>();
  private streams = new Map<string, StreamRecord>();

  private everConnected = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  // -- API pública -------------------------------------------------------

  /** Idempotente. Arranca la conexión persistente y el handshake. */
  connect(): void {
    if (this.started) return;
    this.started = true;
    this.ensurePort();
  }

  onStatus(cb: (s: ExtensionStatus) => void): () => void {
    this.statusSubs.add(cb);
    cb(this.status);
    return () => this.statusSubs.delete(cb);
  }

  getStatus(): ExtensionStatus {
    return this.status;
  }

  /** Lanza un stream. Devuelve el requestId. */
  dispatch(providerId: string, payload: DispatchPayload, handlers: StreamHandlers): string {
    const requestId = crypto.randomUUID();
    this.streams.set(requestId, {
      kind: "byoa",
      handlers,
      lastSeq: -1,
      pending: new Map(),
      terminal: false,
      doneLastSeq: null,
    });
    this.ensurePort();
    if (!this.port) {
      // Sin extensión: no hay a quién despachar. Terminamos en piso.
      this.finalizeAborted(requestId);
      return requestId;
    }
    this.port.postMessage({ type: "byoa:dispatch", requestId, providerId, payload });
    return requestId;
  }

  /** Atajo del stream de autodiagnóstico de Fase 1. */
  runSelfTest(handlers: StreamHandlers, opts?: { chunks?: number; intervalMs?: number }): string {
    return this.dispatch(SELFTEST_PROVIDER_ID, { prompt: "", selfTest: opts }, handlers);
  }

  /**
   * Fase 2 (BYOK, camino proxy): manda una request HTTP cruda para que
   * el offscreen la ejecute (E3: ningún fetch de proveedor vive en el
   * SW) y engancha el stream resultante a la MISMA maquinaria de
   * orden/reanudación que byoa/self-test (E4). `request.headers` lleva
   * la API key: este cliente no lo loggea jamás.
   */
  byokProxy(request: ByokProxyPayload, handlers: StreamHandlers): string {
    const requestId = crypto.randomUUID();
    this.streams.set(requestId, {
      kind: "byok",
      handlers,
      lastSeq: -1,
      pending: new Map(),
      terminal: false,
      doneLastSeq: null,
    });
    this.ensurePort();
    if (!this.port) {
      // Sin extensión no hay proxy posible: piso inmediato, nunca cuelgue.
      this.finalizeAborted(requestId);
      return requestId;
    }
    this.port.postMessage({ type: "byok:proxy", requestId, ...request });
    return requestId;
  }

  /**
   * Fase 3 (BYOA, camino B+): gemelo de `byokProxy` con semántica de
   * sesión. La request cruda viaja por `byoa:proxy`; el offscreen la
   * ejecuta con `credentials:"include"` (la cookie de sesión httpOnly del
   * usuario, que el navegador adjunta — este cliente nunca la ve). Mismo
   * stream + reanudación que byok/byoa/self-test. El abort de un stream
   * `kind:"byoa"` reusa `byoa:abort` (ver abort()). `request.headers` no
   * lleva secretos (auth por cookie), pero tampoco se loggea.
   */
  byoaProxy(request: ByoaProxyPayload, handlers: StreamHandlers): string {
    const requestId = crypto.randomUUID();
    this.streams.set(requestId, {
      kind: "byoa",
      handlers,
      lastSeq: -1,
      pending: new Map(),
      terminal: false,
      doneLastSeq: null,
    });
    this.ensurePort();
    if (!this.port) {
      // Sin extensión no hay sesión que proxyar: piso inmediato, nunca cuelgue.
      this.finalizeAborted(requestId);
      return requestId;
    }
    this.port.postMessage({ type: "byoa:proxy", requestId, ...request });
    return requestId;
  }

  abort(requestId: string): void {
    const rec = this.streams.get(requestId);
    if (!rec || rec.terminal) return;
    if (this.port) {
      this.port.postMessage(
        rec.kind === "byok"
          ? { type: "byok:proxy-abort", requestId }
          : { type: "byoa:abort", requestId },
      );
      // El offscreen contestará stream:aborted, que finaliza el registro.
    } else {
      this.finalizeAborted(requestId);
    }
  }

  // -- Conexión ----------------------------------------------------------

  private setStatus(s: ExtensionStatus): void {
    this.status = s;
    for (const cb of this.statusSubs) cb(s);
  }

  private ensurePort(): void {
    if (this.port) return;
    const runtime = getChromeRuntime();
    if (!runtime) {
      this.setStatus({ state: "not-installed", downloadUrl: DOWNLOAD_URL });
      return;
    }
    let port: ChromePort;
    try {
      port = runtime.connect(EXTENSION_ID, { name: BRIDGE_PORT_NAME });
    } catch {
      // connect() lanza sincrónicamente si el ID no corresponde a nada.
      this.onPortLost();
      return;
    }
    this.port = port;

    port.onMessage.addListener((msg) => this.handleMessage(msg));
    port.onDisconnect.addListener(() => this.onPortLost());

    // Handshake con timeout: sin ack a tiempo => tratamos como caída.
    this.clearHandshakeTimer();
    this.handshakeTimer = setTimeout(() => {
      if (this.status.state !== "connected") this.onPortLost();
    }, HANDSHAKE_TIMEOUT_MS);

    port.postMessage({
      type: "handshake",
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      origin: window.location.origin,
    });
  }

  private onPortLost(): void {
    this.clearHandshakeTimer();
    this.port = null;

    // Marca reconexión a nivel de cada stream en vuelo (no terminal).
    for (const [, rec] of this.streams) {
      if (!rec.terminal) rec.handlers.onReconnecting?.();
    }

    if (!this.everConnected) {
      // Nunca completó un handshake: probablemente no está instalada.
      // Igual reintentamos una vez por si es un arranque lento del SW.
      this.scheduleReconnect();
      return;
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    if (this.reconnectAttempt >= RECONNECT_BACKOFF_MS.length) {
      this.giveUp();
      return;
    }
    const delay = RECONNECT_BACKOFF_MS[this.reconnectAttempt]!;
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensurePort();
    }, delay);
  }

  private giveUp(): void {
    // Reintentos agotados: sin extensión utilizable. Piso para todo lo
    // que quedó en vuelo, y estado no-instalada si nunca conectó.
    if (!this.everConnected) {
      this.setStatus({ state: "not-installed", downloadUrl: DOWNLOAD_URL });
    }
    for (const [requestId, rec] of [...this.streams]) {
      if (!rec.terminal) this.finalizeAborted(requestId);
    }
  }

  private clearHandshakeTimer(): void {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
  }

  // -- Mensajes ----------------------------------------------------------

  private handleMessage(msg: BridgeResponse): void {
    switch (msg.type) {
      case "handshake:ack": {
        this.clearHandshakeTimer();
        this.everConnected = true;
        this.reconnectAttempt = 0;
        this.setStatus({
          state: "connected",
          extensionVersion: msg.extensionVersion,
          adapters: msg.adapters,
        });
        this.resumeInFlight();
        return;
      }
      case "handshake:reject": {
        this.clearHandshakeTimer();
        this.setStatus(
          msg.reason === "version-mismatch"
            ? { state: "outdated", downloadUrl: DOWNLOAD_URL }
            : { state: "not-installed", downloadUrl: DOWNLOAD_URL },
        );
        // Con la extensión rechazando, los streams en vuelo no pueden seguir.
        for (const [requestId, rec] of [...this.streams]) {
          if (!rec.terminal) this.finalizeAborted(requestId);
        }
        return;
      }
      case "stream:chunk": {
        const rec = this.streams.get(msg.requestId);
        if (!rec || rec.terminal) return;
        if (msg.seq <= rec.lastSeq) return; // duplicado (reproducción solapada)
        rec.pending.set(msg.seq, msg.chunk);
        this.drain(msg.requestId, rec);
        return;
      }
      case "stream:done": {
        const rec = this.streams.get(msg.requestId);
        if (!rec || rec.terminal) return;
        rec.doneLastSeq = msg.lastSeq;
        rec.doneMeta = msg.meta;
        this.drain(msg.requestId, rec);
        return;
      }
      case "stream:error": {
        const rec = this.streams.get(msg.requestId);
        if (!rec || rec.terminal) return;
        rec.terminal = true;
        this.streams.delete(msg.requestId);
        rec.handlers.onError(msg.message);
        return;
      }
      case "stream:aborted": {
        this.finalizeAborted(msg.requestId);
        return;
      }
    }
  }

  /** Entrega contigua desde lastSeq+1; finaliza si alcanzó doneLastSeq. */
  private drain(requestId: string, rec: StreamRecord): void {
    while (rec.pending.has(rec.lastSeq + 1)) {
      const seq = rec.lastSeq + 1;
      const chunk = rec.pending.get(seq)!;
      rec.pending.delete(seq);
      rec.lastSeq = seq;
      rec.handlers.onChunk(seq, chunk);
    }
    if (rec.doneLastSeq != null && rec.lastSeq >= rec.doneLastSeq && !rec.terminal) {
      rec.terminal = true;
      this.streams.delete(requestId);
      rec.handlers.onDone(rec.doneLastSeq, rec.doneMeta);
    }
  }

  private finalizeAborted(requestId: string): void {
    const rec = this.streams.get(requestId);
    if (!rec || rec.terminal) return;
    rec.terminal = true;
    this.streams.delete(requestId);
    rec.handlers.onAborted();
  }

  private resumeInFlight(): void {
    if (!this.port) return;
    for (const [requestId, rec] of this.streams) {
      if (rec.terminal) continue;
      rec.handlers.onResumed?.();
      // Genérico desde Fase 2 (E4): cubre byoa, byok y self-test por igual.
      this.port.postMessage({ type: "stream:resume", requestId, fromSeq: rec.lastSeq });
    }
  }
}

/** Singleton: una sola conexión persistente por pestaña. */
export const bridgeClient = new BridgeClient();
