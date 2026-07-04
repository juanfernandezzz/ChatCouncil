/**
 * Protocolo del Puente SPA ↔ Extensión — ChatCouncil
 * ------------------------------------------------------------------
 * Decisión Q7: transporte por `externally_connectable` +
 * `chrome.runtime.connect` (Port), no `postMessage` contra un content
 * script. Decisión Q9: handshake con manifiesto remoto no negociable.
 *
 * Este archivo es la ÚNICA fuente de verdad del contrato de mensajes
 * SPA↔extensión. Tanto `apps/web/src/lib/bridge-client.ts` como
 * `apps/extension/entrypoints/background.ts` deben importar estos
 * tipos — nunca redefinirlos localmente — para que un cambio de
 * protocolo sea imposible de hacer de un solo lado por accidente.
 *
 * NOTA: el canal interno SW↔offscreen NO vive acá. Es un detalle
 * privado de la extensión (`apps/extension/lib/offscreen-protocol.ts`)
 * y no debe filtrarse a la SPA.
 *
 * ── Versión 2 (Fase 1) ────────────────────────────────────────────
 * Sube de 1 → 2 para soportar REANUDACIÓN de streams con preservación
 * de contenido (decisión de Juan: opción B, no sólo "error recuperable").
 * Cambios respecto de v1:
 *   · `stream:chunk` ahora lleva `seq` (número monótono por requestId,
 *     empezando en 0) — permite al cliente detectar huecos, deduplicar
 *     y reordenar tras una reconexión.
 *   · `stream:done` lleva `lastSeq` — el cliente no declara "done" hasta
 *     haber entregado contiguamente hasta `lastSeq` (detecta pérdidas).
 *   · Nuevo `byoa:resume` (SPA→ext): "reanudá el stream `requestId`
 *     desde después de `fromSeq`". El offscreen (que sobrevive a la
 *     muerte del SW) reproduce su buffer desde ahí y sigue en vivo.
 *   · `stream:aborted` conserva su significado como PISO: terminal
 *     "no reproducible" (offscreen caído / buffer desalojado / reintentos
 *     agotados). Garantiza que nunca hay cuelgue silencioso aunque la
 *     reanudación con contenido sea imposible.
 * Un SPA v2 hablando con una extensión v1 (o viceversa) es rechazado
 * por el handshake (`version-mismatch`) — comportamiento correcto.
 */

export const BRIDGE_PROTOCOL_VERSION = 2;

/** Nombre del Port usado en chrome.runtime.connect(extensionId, { name }) */
export const BRIDGE_PORT_NAME = "chatcouncil-bridge-v1";

/**
 * providerId reservado para el stream de autodiagnóstico de Fase 1. NO
 * es un proveedor real: dispara un stream sintético generado en el
 * offscreen document, cuyo único propósito es ejercitar el camino real
 * (SPA→SW→offscreen→SW→SPA) y validar el criterio de aceptación de la
 * fase (matar el SW a mitad de stream no debe perder contenido). Usar un
 * providerId reservado mantiene el protocolo v2 intacto: `byoa:dispatch`
 * ya acepta cualquier string como providerId.
 */
export const SELFTEST_PROVIDER_ID = "__selftest__";

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
        /**
         * Sólo se usa cuando providerId === SELFTEST_PROVIDER_ID.
         * Permite parametrizar el stream sintético para probar distintos
         * escenarios (por defecto ~40 chunks × 1s ≈ 40s, para superar la
         * ventana de suspensión de 30s del service worker).
         */
        selfTest?: { chunks?: number; intervalMs?: number };
      };
    }
  | {
      /**
       * Reanudación (Fase 1, opción B). Tras una reconexión del Port, el
       * cliente pide continuar un stream en vuelo desde después de
       * `fromSeq` (el último seq entregado contiguamente). El offscreen
       * reproduce su buffer y sigue. Si el offscreen ya no tiene ese
       * stream, responde `stream:aborted` (piso).
       */
      type: "byoa:resume";
      requestId: string;
      fromSeq: number;
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
  | { type: "stream:chunk"; requestId: string; seq: number; chunk: string }
  | { type: "stream:done"; requestId: string; lastSeq: number; meta?: Record<string, unknown> }
  | { type: "stream:error"; requestId: string; message: string }
  | { type: "stream:aborted"; requestId: string };

/**
 * El handshake NUNCA debe asumirse exitoso. `bridge-client.ts` debe
 * aplicar un timeout corto (~300ms recomendado, ver docs/BLUEPRINT.md
 * Fase 1) y tratar la ausencia de respuesta como "extensión no
 * instalada", no como error silencioso.
 */
export const HANDSHAKE_TIMEOUT_MS = 300;
