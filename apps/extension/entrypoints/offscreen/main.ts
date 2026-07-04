import type { BridgeResponse } from "@chatcouncil/shared";
import {
  isToOffscreen,
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
 * Fase 3 reemplazará el generador sintético por un `fetch`/SSE real
 * manteniendo exactamente esta forma de buffer + reanudación.
 */

// defineUnlistedScript / browser son globals auto-importados por WXT.

type StreamStatus = "streaming" | "done" | "error";

interface StreamState {
  /** chunks[seq] = texto. Contiguo y en orden por construcción. */
  chunks: string[];
  status: StreamStatus;
  errorMessage?: string;
  /** id del setInterval del generador sintético (Fase 1). */
  timer?: ReturnType<typeof setInterval>;
  /** meta del terminal `stream:done`, para reenviar en una reanudación. */
  doneMeta?: Record<string, unknown>;
}

const streams = new Map<string, StreamState>();

/** Envía un `BridgeResponse` al SW, que hará broadcast a los Ports. */
function relay(payload: BridgeResponse): void {
  const msg: OffscreenRelayMessage = { target: "sw-relay", payload };
  // El SW puede estar dormido: un `sendMessage` entrante lo revive. Si no
  // hay ningún receptor (SW arrancando), la promesa rechaza; lo tragamos
  // porque el buffer ya guardó el chunk y se reproducirá en la reanudación.
  void browser.runtime.sendMessage(msg).catch(() => {
    /* SW despertando o sin listener aún; el buffer cubre la pérdida. */
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
    // requestId desconocido). Nunca dejamos colgada a la SPA.
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
  streams.delete(requestId);
  relay({ type: "stream:aborted", requestId });
}

export default defineUnlistedScript(() => {
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!isToOffscreen(message)) return; // no es para el offscreen
    const msg = message as ToOffscreenMessage;
    switch (msg.kind) {
      case "selftest:start":
        startSelfTest(msg.requestId, msg.chunks, msg.intervalMs);
        break;
      case "resume":
        resume(msg.requestId, msg.fromSeq);
        break;
      case "abort":
        abort(msg.requestId);
        break;
    }
  });
});
