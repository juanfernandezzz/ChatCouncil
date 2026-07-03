/**
 * Protocolo del Puente SPA ↔ Extensión — ChatCouncil
 * ------------------------------------------------------------------
 * Decisión Q7: transporte por `externally_connectable` +
 * `chrome.runtime.connect` (Port), no `postMessage` contra un content
 * script. Decisión Q9: handshake con manifiesto remoto no negociable.
 *
 * Este archivo es la ÚNICA fuente de verdad del contrato de mensajes.
 * Tanto `apps/web/src/lib/bridge-client.ts` como
 * `apps/extension/entrypoints/background.ts` deben importar estos
 * tipos — nunca redefinirlos localmente — para que un cambio de
 * protocolo sea imposible de hacer de un solo lado por accidente.
 */

export const BRIDGE_PROTOCOL_VERSION = 1;

/** Nombre del Port usado en chrome.runtime.connect(extensionId, { name }) */
export const BRIDGE_PORT_NAME = "chatcouncil-bridge-v1";

// ---------------------------------------------------------------------------
// SPA -> Extensión
// ---------------------------------------------------------------------------

export type BridgeRequest =
  | { type: "handshake"; protocolVersion: number; origin: string }
  | {
      type: "byoa:dispatch";
      requestId: string;
      providerId: string;
      payload: {
        prompt: string;
        toggles?: { webSearch?: boolean; imageGeneration?: boolean };
      };
    }
  | { type: "byoa:abort"; requestId: string }
  | {
      type: "byok:proxy";
      requestId: string;
      url: string;
      method: "GET" | "POST";
      headers: Record<string, string>;
      body?: string;
      stream: boolean;
    }
  | { type: "byok:proxy-abort"; requestId: string };

// ---------------------------------------------------------------------------
// Extensión -> SPA
// ---------------------------------------------------------------------------

export interface AdapterAvailability {
  providerId: string;
  byoaReady: boolean;
  reason?: string; // por qué no está listo (sesión no detectada, etc.)
}

export type BridgeResponse =
  | {
      type: "handshake:ack";
      protocolVersion: number;
      extensionVersion: string;
      adapters: AdapterAvailability[];
    }
  | { type: "handshake:reject"; reason: "version-mismatch" | "origin-not-allowed" }
  | { type: "stream:chunk"; requestId: string; chunk: string }
  | { type: "stream:done"; requestId: string; meta?: Record<string, unknown> }
  | { type: "stream:error"; requestId: string; message: string }
  | { type: "stream:aborted"; requestId: string };

/**
 * El handshake NUNCA debe asumirse exitoso. `bridge-client.ts` debe
 * aplicar un timeout corto (~300ms recomendado, ver docs/BLUEPRINT.md
 * Fase 1) y tratar la ausencia de respuesta como "extensión no
 * instalada", no como error silencioso.
 */
export const HANDSHAKE_TIMEOUT_MS = 300;
