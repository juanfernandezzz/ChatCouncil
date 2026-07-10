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
 *
 * ── Cambio DENTRO de v2 (Fase 2, E4) ──────────────────────────────
 * `byoa:resume` se RENOMBRA a `stream:resume`: la maquinaria de buffer +
 * reanudación del offscreen siempre fue genérica por requestId (su canal
 * interno usa `kind: "resume"` sin prefijo); el nombre byoa-específico
 * era sólo de esta capa. Fase 2 la reutiliza para BYOK (caso real que
 * muerde: modelos con thinking largo pueden callar >30s antes del primer
 * token → el SW muere en el silencio → sin resume, el stream se pierde
 * aunque el fetch del offscreen siga vivo). Se renombra SIN bump de
 * versión ni alias: v2 tiene cero consumidores externos (distribución =
 * zips de GitHub, un solo usuario) — un v3 acá sería teatro de
 * compatibilidad. Registrado en BLUEPRINT §0.3.
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
       * Reanudación (Fase 1, opción B; GENÉRICA desde Fase 2). Tras una
       * reconexión del Port, el cliente pide continuar un stream en vuelo
       * — byoa, byok o self-test, es indistinto: el buffer del offscreen
       * se indexa por requestId — desde después de `fromSeq` (el último
       * seq entregado contiguamente). El offscreen reproduce su buffer y
       * sigue. Si ya no tiene ese stream, responde `stream:aborted`
       * (piso). Hasta Fase 2 se llamaba `byoa:resume`.
       */
      type: "stream:resume";
      requestId: string;
      fromSeq: number;
    }
  | { type: "byoa:abort"; requestId: string }
  | {
      /**
       * Proxy BYOK (Fase 2, Q11). La SPA arma la request HTTP CRUDA —
       * incluidos los headers de auth, porque la custodia de llaves vive
       * en la SPA (E2a: key-vault aislado; ver BLUEPRINT Fase 2) — y la
       * extensión es un caño tonto con allowlist: `background.ts` valida
       * sender.origin + que el origin de `url` esté en la lista blanca
       * EN CÓDIGO (`packages/adapters`, jamás del manifiesto remoto) y
       * recién entonces la reenvía al offscreen, que ejecuta el fetch
       * (ley de Fase 1: ningún fetch de proveedor vive en el SW — una
       * respuesta >30s lo mata, streaming o no). Con `stream: true` el
       * offscreen relaya el cuerpo como texto decodificado en
       * `stream:chunk` con `seq`, por la MISMA maquinaria de buffer +
       * reanudación que byoa/self-test; con `stream: false`, un único
       * chunk y `stream:done`. Los headers NUNCA se loggean (llevan la
       * API key).
       */
      type: "byok:proxy";
      requestId: string;
      url: string;
      method: "GET" | "POST";
      headers: Record<string, string>;
      body?: string;
      stream: boolean;
    }
  | { type: "byok:proxy-abort"; requestId: string }
  | {
      /**
       * Proxy BYOA (Fase 3, camino B+). Gemelo de `byok:proxy` con
       * semántica de SESIÓN en vez de llave: la SPA arma la request HTTP
       * cruda contra el endpoint interno del proveedor (p. ej. claude.ai) y
       * la extensión la ejecuta en el offscreen. Mismo camino de validación
       * que byok (sender.origin + allowlist EN CÓDIGO + https-only), pero
       * contra `BYOA_SESSION_ALLOWED_ORIGINS` (host de sesión) en lugar del
       * allowlist BYOK.
       *
       * DELTA CLAVE vs byok:proxy — modo de credenciales del fetch:
       *   · byok:proxy → el offscreen usa `credentials: "omit"` (la auth
       *     va en un header/llave que arma la SPA).
       *   · byoa:proxy → el offscreen usa `credentials: "include"`: la
       *     cookie de sesión httpOnly del usuario — la MISMA que usa cuando
       *     abre claude.ai en el navegador — la adjunta el navegador en
       *     runtime; el código NUNCA la lee ni la loggea. `headers` acá NO
       *     lleva secretos (la auth es la cookie), pero se trata igual: no
       *     se loggea.
       *
       * El abort reusa el `byoa:abort` existente (registro por requestId).
       * Sin bump de versión: v2 sin consumidores externos (ver E4/§0.3).
       */
      type: "byoa:proxy";
      requestId: string;
      url: string;
      method: "GET" | "POST";
      headers: Record<string, string>;
      body?: string;
      stream: boolean;
    };

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
