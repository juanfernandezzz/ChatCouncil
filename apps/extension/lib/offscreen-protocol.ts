/**
 * Contratos internos de mensajería de la extensión:
 *   · service worker ↔ offscreen document (streams + reanudación)
 *   · service worker ↔ popup (snapshot de diagnóstico)
 * ------------------------------------------------------------------
 * DELIBERADAMENTE NO vive en `packages/shared`: es un detalle privado
 * del transporte de la extensión. La SPA jamás habla con el offscreen
 * directamente — sólo ve el contrato público de `@chatcouncil/shared`
 * (bridge-protocol.ts). Meter esto en `shared` sobreexpondría un detalle
 * interno y erosionaría el límite que hace que Q1 (runner agnóstico) sea
 * real.
 *
 * Transporte: `browser.runtime.sendMessage` / `onMessage`. Es el ÚNICO
 * API disponible dentro de un offscreen document (verificado contra la
 * doc de Chrome: un offscreen sólo puede usar `chrome.runtime`; no tiene
 * acceso a `storage`, `tabs`, etc.). Por eso el buffer de reanudación
 * vive EN MEMORIA dentro del offscreen — que además es lo que sobrevive
 * a la suspensión del service worker.
 *
 * Todo mensaje lleva un `target` para que cada contexto filtre lo suyo
 * (`runtime.onMessage` es un bus compartido por todos los contextos de
 * la extensión).
 */

import type { BridgeResponse } from "@chatcouncil/shared";

export const OFFSCREEN_URL = "offscreen.html";

/** SW -> offscreen: instrucciones sobre un stream. */
export type ToOffscreenMessage =
  | {
      target: "offscreen";
      kind: "selftest:start";
      requestId: string;
      chunks: number;
      intervalMs: number;
    }
  | { target: "offscreen"; kind: "resume"; requestId: string; fromSeq: number }
  | { target: "offscreen"; kind: "abort"; requestId: string };

/**
 * offscreen -> SW: un evento de stream ya con forma de `BridgeResponse`
 * público, para que el SW sólo tenga que reenviarlo (broadcast) a los
 * Ports externos conectados sin re-mapear nada. Mantener el payload como
 * `BridgeResponse` evita una segunda traducción propensa a divergir.
 */
export interface OffscreenRelayMessage {
  target: "sw-relay";
  payload: BridgeResponse;
}

export function isToOffscreen(msg: unknown): msg is ToOffscreenMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as { target?: unknown }).target === "offscreen"
  );
}

export function isOffscreenRelay(msg: unknown): msg is OffscreenRelayMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as { target?: unknown }).target === "sw-relay" &&
    "payload" in (msg as object)
  );
}

// ---------------------------------------------------------------------------
// SW <-> popup (diagnóstico)
// ---------------------------------------------------------------------------

/** popup -> SW: pedido de snapshot de estado. */
export interface DiagRequest {
  target: "sw";
  kind: "diag:get";
}

/**
 * SW -> popup (respuesta): foto del estado que ve EL SERVICE WORKER. El
 * popup no puede sondear el Port SPA↔SW por su cuenta (ese Port es de la
 * página web, no del popup); refleja lo que el SW reporta. Ser honesto
 * sobre esto evita prometer un segundo probe independiente que no existe.
 */
export interface DiagSnapshot {
  protocolVersion: number;
  extensionVersion: string;
  /** Cuántos Ports externos (pestañas de la SPA) están conectados AHORA. */
  connectedPorts: number;
  /** Si hay un offscreen document vivo en este momento. */
  offscreenAlive: boolean;
  manifest: {
    /** epoch ms del último fetch exitoso, o null si nunca. */
    fetchedAt: number | null;
    /** true si el cache está dentro del TTL. */
    fresh: boolean;
    /** cuántos providers trae el manifiesto cacheado. */
    providerCount: number;
    /** de dónde salió el dato servido en el último handshake. */
    source: "network" | "cache" | "empty";
  };
}

export function isDiagRequest(msg: unknown): msg is DiagRequest {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as { target?: unknown }).target === "sw" &&
    (msg as { kind?: unknown }).kind === "diag:get"
  );
}
