/**
 * Orquestador BYOK de la SPA (Fase 2) — E2a/E3/E4 en un solo lugar
 * ------------------------------------------------------------------
 * Cablea las piezas inyectables del contrato:
 *   · llave  ← key-vault (único importador legítimo junto al panel;
 *     gate mecánico en scripts/guard-key-vault.mjs).
 *   · texto  ← transporte: fetch DIRECTO desde la SPA (proveedores
 *     CORS-ok) o el PUENTE (byok:proxy → offscreen) para los bloqueados.
 *   · chunks ← `createByokAdapter` (contrato Adapter de shared).
 *
 * Routing por request (no estático): `effectiveCorsStatus` — el probe
 * de E7 pisa lo declarado — decide directo; si no, proxy sólo con la
 * extensión conectada; si tampoco, error INMEDIATO y claro (criterio de
 * aceptación: nunca cuelgue silencioso). Nota de diseño: los directos
 * NO tienen fallback por proxy — sus dominios no están en
 * host_permissions a propósito (ver wxt.config.ts).
 */

import {
  BYOK_PROVIDERS,
  createByokAdapter,
  directFetchTransport,
  type ByokAdapterDeps,
  type ByokHttpRequest,
  type ByokRoute,
  type ByokTransport,
} from "@chatcouncil/adapters";
import { effectiveCorsStatus, isCorsDirectStatus } from "@chatcouncil/shared";
import { bridgeClient, type StreamHandlers } from "./bridge-client";
import { getKey } from "./key-vault";

export type ByokRouteResolution =
  | { route: ByokRoute }
  | { route: "unavailable"; reason: string };

export function resolveByokRoute(providerId: string): ByokRouteResolution {
  const cfg = BYOK_PROVIDERS[providerId];
  if (!cfg) {
    return { route: "unavailable", reason: `proveedor BYOK desconocido: ${providerId}` };
  }
  const cors = effectiveCorsStatus(providerId);
  if (isCorsDirectStatus(cors)) return { route: "direct" };
  if (bridgeClient.getStatus().state === "connected") return { route: "proxy" };
  return {
    route: "unavailable",
    reason:
      cfg.route === "direct"
        ? `CORS directo no confirmado (estado: ${cors}) y la extensión no está conectada para hacer proxy`
        : "requiere el proxy de la extensión y la extensión no está conectada",
  };
}

type ProxyLifecycle = Pick<StreamHandlers, "onReconnecting" | "onResumed">;

/**
 * Transporte "puente": la request cruda viaja por byok:proxy y el texto
 * vuelve por la maquinaria de orden/reanudación de Fase 1 (los chunks
 * llegan contiguos por seq, así que acá es un passthrough). El piso A
 * (`stream:aborted`) se modela como AbortError: el adapter termina el
 * iterable sin terminal y el orquestador lo mapea a onAborted — misma
 * semántica que el self-test.
 */
function makeBridgeTransport(lifecycle: ProxyLifecycle): ByokTransport {
  return {
    run(req: ByokHttpRequest, onText, signal) {
      return new Promise<void>((resolve, reject) => {
        const requestId = bridgeClient.byokProxy(req, {
          onChunk: (_seq, chunk) => onText(chunk),
          onDone: () => resolve(),
          onError: (message) => reject(new Error(message)),
          onAborted: () => {
            const err = new Error("stream abortado (piso A)");
            err.name = "AbortError";
            reject(err);
          },
          onReconnecting: lifecycle.onReconnecting,
          onResumed: lifecycle.onResumed,
        });
        if (signal.aborted) bridgeClient.abort(requestId);
        else signal.addEventListener("abort", () => bridgeClient.abort(requestId), { once: true });
      });
    },
  };
}

export interface ByokPromptHandlers {
  onRoute?: (route: ByokRoute) => void;
  onDelta: (text: string) => void;
  onDone: (meta: { tokensIn?: number; tokensOut?: number }) => void;
  onError: (message: string) => void;
  /** Terminal sin resultado: abort del usuario o piso A del puente. */
  onAborted: () => void;
  onReconnecting?: () => void;
  onResumed?: () => void;
}

export interface ByokPromptOptions {
  providerId: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
}

export function sendByokPrompt(
  opts: ByokPromptOptions,
  handlers: ByokPromptHandlers,
): { requestId: string; abort: () => void } {
  const requestId = crypto.randomUUID();
  const inert = { requestId, abort: () => {} };
  // Los fallos previos al stream también salen por el handler (nunca un
  // throw sincrónico que el caller de UI no está mirando), pero en
  // microtask: el caller termina de registrar su estado primero.
  const failAsync = (message: string) => queueMicrotask(() => handlers.onError(message));

  const cfg = BYOK_PROVIDERS[opts.providerId];
  if (!cfg) {
    failAsync(`proveedor BYOK desconocido: ${opts.providerId}`);
    return inert;
  }
  const resolution = resolveByokRoute(opts.providerId);
  if (resolution.route === "unavailable") {
    failAsync(resolution.reason);
    return inert;
  }
  handlers.onRoute?.(resolution.route);

  const transport =
    resolution.route === "direct"
      ? directFetchTransport
      : makeBridgeTransport({
          onReconnecting: handlers.onReconnecting,
          onResumed: handlers.onResumed,
        });

  const deps: ByokAdapterDeps = {
    getApiKey: getKey,
    transportFor: () => transport,
  };
  if (opts.model !== undefined) deps.model = opts.model;
  if (opts.maxTokens !== undefined) deps.maxTokens = opts.maxTokens;

  const adapter = createByokAdapter(cfg, deps);
  const controller = new AbortController();

  void (async () => {
    let sawTerminal = false;
    try {
      for await (const chunk of adapter.send({
        requestId,
        prompt: opts.prompt,
        signal: controller.signal,
      })) {
        if (chunk.kind === "text-delta") {
          handlers.onDelta(chunk.text);
        } else if (chunk.kind === "done") {
          sawTerminal = true;
          handlers.onDone({ tokensIn: chunk.tokensIn, tokensOut: chunk.tokensOut });
          return;
        } else {
          sawTerminal = true;
          handlers.onError(chunk.message);
          return;
        }
      }
    } catch (err) {
      // No debería: el adapter convierte fallos en chunks `error`. Red de
      // seguridad para bugs del propio orquestador.
      sawTerminal = true;
      handlers.onError(err instanceof Error ? err.message : String(err));
      return;
    }
    // Iterable terminado sin terminal = abort (del usuario o piso A).
    if (!sawTerminal) handlers.onAborted();
  })();

  return { requestId, abort: () => controller.abort() };
}
