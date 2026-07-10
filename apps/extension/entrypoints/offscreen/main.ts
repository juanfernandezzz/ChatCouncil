import type { BridgeResponse } from "@chatcouncil/shared";
import {
  isToOffscreen,
  type OffscreenReadyMessage,
  type OffscreenRelayMessage,
  type ToOffscreenMessage,
} from "@/lib/offscreen-protocol";

/**
 * Offscreen document — dueño del stream y del BUFFER DE REANUDACIÓN.
 * ------------------------------------------------------------------
 * Por qué acá y no en el service worker (Fase 1, decisión B):
 *   · El SW muere a los ~30s de inactividad y un `fetch` cuya respuesta
 *     tarda >30s también lo mata (verificado en la doc de Chrome). Un
 *     stream de varios minutos NO puede vivir en el SW.
 *   · La lifetime de un offscreen document es independiente del SW y es
 *     ILIMITADA para todo `reason` salvo AUDIO_PLAYBACK. Así, cuando el
 *     usuario mata el SW a mano (criterio de aceptación de la fase),
 *     ESTE contexto sigue vivo y sigue produciendo y bufferizando.
 *   · Al reconectar la SPA, pide `byoa:resume {fromSeq}`; reproducimos el
 *     buffer desde ahí y seguimos en vivo → contenido preservado (B).
 *
 * El buffer es EN MEMORIA a propósito: (1) es lo único que sobrevive a la
 * muerte del SW sin depender de storage; (2) un offscreen sólo puede usar
 * `chrome.runtime`, no tiene `storage`. Si el propio offscreen se cae por
 * otra razón (recarga de la extensión, etc.), el buffer se pierde y la
 * reanudación responde `stream:aborted` (piso) — sin cuelgue silencioso.
 *
 * Fase 2 (BYOK) materializó esa promesa para el camino proxy: el
 * handler `byok:start` ejecuta ACÁ el fetch real contra el proveedor
 * (el SW ya validó allowlist + sender.origin — ley de Fase 1: ningún
 * fetch de proveedor vive en el SW, una respuesta >30s lo mata,
 * streaming o no) y alimenta EXACTAMENTE la misma forma de buffer +
 * reanudación. Los `headers` de byok llevan la API key del usuario:
 * NUNCA se loggean (ni en warns de fallo).
 *
 * Fase 3 (BYOA) reusa EXACTAMENTE esa maquinaria: el handler `byoa:start`
 * corre el mismo fetch con un único delta — `credentials: "include"`, para
 * que la cookie de sesión httpOnly del usuario autentique la request (el
 * navegador la adjunta; el código nunca la ve). Ver `startProxy`.
 */

// `browser` es un global auto-importado por WXT (no requiere import).

type StreamStatus = "streaming" | "done" | "error";

interface StreamState {
  /** chunks[seq] = texto. Contiguo y en orden por construcción. */
  chunks: string[];
  status: StreamStatus;
  errorMessage?: string;
  /** id del setInterval del generador sintético (Fase 1). */
  timer?: ReturnType<typeof setInterval>;
  /** abort del fetch byok en vuelo (Fase 2). */
  controller?: AbortController;
  /** meta del terminal `stream:done`, para reenviar en una reanudación. */
  doneMeta?: Record<string, unknown>;
}

const streams = new Map<string, StreamState>();

/** Envía un `BridgeResponse` al SW, que hará broadcast a los Ports. */
function relay(payload: BridgeResponse): void {
  const msg: OffscreenRelayMessage = { target: "sw-relay", payload };
  // El SW puede estar dormido: un `sendMessage` entrante lo revive. Si aun
  // así falla la entrega, el buffer ya guardó el chunk y se reproducirá en
  // la reanudación — pero NUNCA tragamos el error en silencio (lección de
  // Fase 1, ver BLUEPRINT §0.2): un warn barato es la diferencia entre
  // diagnosticable e indiagnosticable.
  void browser.runtime.sendMessage(msg).catch((err) => {
    console.warn("[offscreen] relay falló (el buffer cubre la pérdida):", payload.type, err);
  });
}

function startSelfTest(requestId: string, chunks: number, intervalMs: number): void {
  // Reinicio idempotente: si ya existe, no lo dupliques.
  if (streams.has(requestId)) return;

  const state: StreamState = { chunks: [], status: "streaming" };
  streams.set(requestId, state);

  const total = Math.max(1, chunks);
  state.timer = setInterval(() => {
    const seq = state.chunks.length;
    if (seq >= total) {
      // Terminal.
      if (state.timer) clearInterval(state.timer);
      state.timer = undefined;
      state.status = "done";
      state.doneMeta = { synthetic: true, totalChunks: total };
      relay({ type: "stream:done", requestId, lastSeq: total - 1, meta: state.doneMeta });
      return;
    }
    const chunk = `chunk ${seq + 1}/${total} · ${new Date().toISOString()}\n`;
    state.chunks.push(chunk);
    relay({ type: "stream:chunk", requestId, seq, chunk });
  }, Math.max(50, intervalMs));
}

function resume(requestId: string, fromSeq: number): void {
  const state = streams.get(requestId);
  if (!state) {
    // Piso (A-floor): no tenemos ese stream (offscreen reiniciado, o
    // requestId desconocido). Nunca dejamos colgada a la SPA. Warn a
    // propósito: si esto aparece, la premisa de la Decisión B (el
    // offscreen sobrevive al SW) falló para este stream.
    console.warn(`[offscreen] resume de ${requestId}: stream no encontrado — respondiendo aborted (piso A)`);
    relay({ type: "stream:aborted", requestId });
    return;
  }
  // Reproducí lo que ya tenemos por encima de fromSeq. El generador en
  // vivo (si sigue streaming) continúa emitiendo los nuevos por su cuenta;
  // el cliente deduplica por seq, así que un solapamiento es inofensivo.
  for (let seq = fromSeq + 1; seq < state.chunks.length; seq++) {
    relay({ type: "stream:chunk", requestId, seq, chunk: state.chunks[seq]! });
  }
  if (state.status === "done") {
    relay({
      type: "stream:done",
      requestId,
      lastSeq: state.chunks.length - 1,
      meta: state.doneMeta,
    });
  } else if (state.status === "error") {
    relay({ type: "stream:error", requestId, message: state.errorMessage ?? "stream error" });
  }
}

function abort(requestId: string): void {
  const state = streams.get(requestId);
  if (state?.timer) clearInterval(state.timer);
  // Cortar el fetch byok en vuelo ANTES de borrar el registro: el catch
  // del runner distingue "abort pedido" por signal.aborted / registro
  // ausente y no pisa este `stream:aborted` con un error espurio.
  state?.controller?.abort();
  streams.delete(requestId);
  relay({ type: "stream:aborted", requestId });
}

// ─── Proxy real por fetch: BYOK (Fase 2) + BYOA (Fase 3) ────────────────
// Una sola maquinaria de fetch para ambos caminos; el ÚNICO delta es el
// modo de credenciales, que decide el `kind` del mensaje:
//   · byok:start → credentials:"omit"    (auth por header/llave armada en
//     la SPA; el dominio es un endpoint de API, no una sesión).
//   · byoa:start → credentials:"include" (auth por la cookie de sesión
//     httpOnly del usuario, que el navegador adjunta en runtime — el
//     código NUNCA la lee ni la loggea; es la misma cookie que usa cuando
//     abre claude.ai directamente en el navegador).
// El SW ya validó allowlist + sender.origin antes de reenviar (ley de
// Fase 1: ningún fetch de proveedor vive en el SW, una respuesta >30s lo
// mata). Los `headers` NUNCA se loggean en ningún caso (byok lleva la API
// key; byoa no lleva secretos porque la auth va por cookie, pero se trata
// igual por uniformidad).

const PROXY_ERROR_SNIPPET_MAX = 400;

type ProxyStartMessage = Extract<ToOffscreenMessage, { kind: "byok:start" | "byoa:start" }>;

function startProxy(msg: ProxyStartMessage, credentials: RequestCredentials): void {
  // Idempotente, igual que el self-test: un reenvío duplicado no debe
  // duplicar el fetch ni pisar el buffer.
  if (streams.has(msg.requestId)) return;
  const state: StreamState = { chunks: [], status: "streaming" };
  const controller = new AbortController();
  state.controller = controller;
  streams.set(msg.requestId, state);
  void runProxyFetch(msg, state, controller, credentials);
}

async function runProxyFetch(
  msg: ProxyStartMessage,
  state: StreamState,
  controller: AbortController,
  credentials: RequestCredentials,
): Promise<void> {
  const { requestId } = msg;
  const label = msg.kind === "byoa:start" ? "byoa" : "byok";

  const pushChunk = (text: string): void => {
    if (!text) return;
    const seq = state.chunks.length;
    state.chunks.push(text);
    relay({ type: "stream:chunk", requestId, seq, chunk: text });
  };
  const finishDone = (): void => {
    state.status = "done";
    state.controller = undefined;
    state.doneMeta = { [label]: true };
    relay({ type: "stream:done", requestId, lastSeq: state.chunks.length - 1, meta: state.doneMeta });
  };
  const finishError = (message: string): void => {
    state.status = "error";
    state.controller = undefined;
    state.errorMessage = message;
    // Diagnóstico sin secretos: jamás los headers de la request (byok
    // lleva la API key; byoa la cookie ya viaja aparte). El mensaje viene
    // de status/cuerpo de error/red.
    console.warn(`[offscreen] ${label} ${requestId} falló:`, message);
    relay({ type: "stream:error", requestId, message });
  };

  try {
    const res = await fetch(msg.url, {
      method: msg.method,
      headers: msg.headers,
      body: msg.body,
      signal: controller.signal,
      credentials,
      cache: "no-store",
    });
    if (!res.ok) {
      let snippet = "";
      try {
        snippet = (await res.text()).slice(0, PROXY_ERROR_SNIPPET_MAX);
      } catch {
        // cuerpo ilegible: el status solo ya diagnostica
      }
      finishError(`HTTP ${res.status}${snippet ? ` — ${snippet}` : ""}`);
      return;
    }
    if (msg.stream && res.body) {
      const reader = res.body.getReader();
      // TextDecoder en modo streaming: un code point UTF-8 partido entre
      // dos reads no se corrompe; decode() final drena la cola.
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) pushChunk(decoder.decode(value, { stream: true }));
      }
      const tail = decoder.decode();
      if (tail) pushChunk(tail);
    } else {
      pushChunk(await res.text());
    }
    finishDone();
  } catch (err) {
    // Abort pedido por la SPA: `abort()` ya relayó stream:aborted y borró
    // el registro — no lo pisamos con un error espurio.
    if (controller.signal.aborted || !streams.has(requestId)) return;
    finishError(err instanceof Error ? err.message : String(err));
  }
}

// ─── Ejecución de nivel superior ────────────────────────────────────────
// DELIBERADAMENTE SIN `defineUnlistedScript`. Ese wrapper es para
// entrypoints de script unlisted (`entrypoints/<name>.ts` suelto), donde
// WXT genera un módulo virtual que importa la definición y llama a
// `.main()`. En el script de una PÁGINA HTML nadie consume ese export:
// Rollup lo trata como código muerto y tree-shakea el módulo COMPLETO.
// Eso fue la causa raíz del bug de Fase 1 (verificado a nivel de
// artefacto: el offscreen.html compilado cargaba sólo el chunk compartido
// de runtime — polyfill + shim de `browser` — sin una sola línea de este
// archivo; por eso "Receiving end does not exist" en Chrome Y Opera, y
// cero logs `[offscreen]` jamás). El patrón correcto es el mismo que
// popup/main.ts: efectos de nivel superior, que Rollup preserva.
browser.runtime.onMessage.addListener((message: unknown) => {
  if (!isToOffscreen(message)) return; // no es para el offscreen
  const msg = message as ToOffscreenMessage;
  switch (msg.kind) {
    case "selftest:start":
      startSelfTest(msg.requestId, msg.chunks, msg.intervalMs);
      break;
    case "byok:start":
      startProxy(msg, "omit");
      break;
    case "byoa:start":
      startProxy(msg, "include");
      break;
    case "resume":
      resume(msg.requestId, msg.fromSeq);
      break;
    case "abort":
      abort(msg.requestId);
      break;
  }
});

// Handshake de disponibilidad (ver isOffscreenReady en offscreen-protocol.ts):
// recién ahora, con el listener YA registrado en la línea de arriba, es
// seguro avisarle al SW que puede empezar a mandar trabajo. Mandarlo
// ANTES de addListener sería la misma carrera al revés.
const ready: OffscreenReadyMessage = { target: "offscreen-ready" };
void browser.runtime.sendMessage(ready).catch((err) => {
  // No debería fallar nunca (el SW ya está escuchando para cuando este
  // documento pudo llegar a existir) — si pasa, el SW quedará esperando
  // el ready hasta su timeout de seguridad; dejamos rastro en vez de
  // tragarlo (lección de Fase 1).
  console.warn("[offscreen] aviso de ready falló (inesperado):", err);
});
