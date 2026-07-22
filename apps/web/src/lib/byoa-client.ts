/**
 * Orquestador BYOA de la SPA (Fase 3, camino B+)
 * ------------------------------------------------------------------
 * Cablea las piezas inyectables del contrato, igual que byok-client pero
 * con semántica de SESIÓN en vez de llave:
 *   · org    ← la organización elegida en el panel (el gate la descubrió
 *     con GET /api/organizations vía la extensión).
 *   · texto  ← SIEMPRE el puente (byoa:proxy → offscreen con
 *     credentials:"include"). No hay camino directo: la SPA no puede
 *     mandarle la cookie de sesión a claude.ai por su cuenta.
 *   · chunks ← `createByoaAdapter` (contrato Adapter de shared). La máquina
 *     de dos pasos (crear conversación + completion) vive DENTRO del
 *     adapter (packages/adapters); acá sólo inyectamos transporte + org y
 *     consumimos el iterable.
 *
 * BYOA depende de la extensión sí o sí (es la que tiene la sesión). Sin
 * extensión conectada → error INMEDIATO y claro (nunca cuelgue silencioso).
 */

import {
  BYOA_PROVIDERS,
  createByoaAdapter,
  type ByoaAdapterDeps,
  type ByoaHttpRequest,
  type ByoaTransport,
} from "@chatcouncil/adapters";
import type { ProviderThreadState } from "@chatcouncil/shared";
import { bridgeClient, type StreamHandlers } from "./bridge-client";

type ProxyLifecycle = Pick<StreamHandlers, "onReconnecting" | "onResumed">;

/**
 * Transporte "puente" para BYOA: la request cruda viaja por byoa:proxy y
 * el texto vuelve por la maquinaria de orden/reanudación de Fase 1 (los
 * chunks llegan contiguos por seq, así que acá es un passthrough). El piso
 * A (`stream:aborted`) se modela como AbortError: el adapter termina el
 * iterable sin terminal y el orquestador lo mapea a onAborted. Se usa para
 * los DOS pasos (crear conversación no-stream + completion stream): el
 * `req.stream` de cada request decide el comportamiento del offscreen.
 */
function makeByoaBridgeTransport(lifecycle: ProxyLifecycle): ByoaTransport {
  return {
    run(req: ByoaHttpRequest, onText, signal) {
      return new Promise<void>((resolve, reject) => {
        const requestId = bridgeClient.byoaProxy(req, {
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

export interface ByoaPromptHandlers {
  onDelta: (text: string) => void;
  onDone: (meta: { tokensIn?: number; tokensOut?: number; providerThread?: ProviderThreadState }) => void;
  onError: (message: string) => void;
  /** Terminal sin resultado: abort del usuario o piso A del puente. */
  onAborted: () => void;
  onReconnecting?: () => void;
  onResumed?: () => void;
}

export interface ByoaPromptOptions {
  providerId: string;
  /** uuid de la organización de sesión elegida en el panel. */
  orgId: string;
  prompt: string;
  model?: string;
  /** Hilo previo de ESTE panel (Fase 4, E2) — ausente en el primer turno. */
  priorThread?: ProviderThreadState;
}

export function sendByoaPrompt(
  opts: ByoaPromptOptions,
  handlers: ByoaPromptHandlers,
): { requestId: string; abort: () => void } {
  const requestId = crypto.randomUUID();
  const inert = { requestId, abort: () => {} };
  // Fallos previos al stream salen por el handler en microtask (nunca un
  // throw sincrónico que el caller de UI no está mirando).
  const failAsync = (message: string) => queueMicrotask(() => handlers.onError(message));

  const cfg = BYOA_PROVIDERS[opts.providerId];
  if (!cfg) {
    failAsync(`proveedor BYOA desconocido: ${opts.providerId}`);
    return inert;
  }
  if (bridgeClient.getStatus().state !== "connected") {
    failAsync("la extensión no está conectada (BYOA usa la sesión del navegador vía la extensión)");
    return inert;
  }
  if (!opts.orgId) {
    failAsync("elige una organización de sesión primero (Detectar sesión Claude)");
    return inert;
  }

  const transport = makeByoaBridgeTransport({
    onReconnecting: handlers.onReconnecting,
    onResumed: handlers.onResumed,
  });
  const deps: ByoaAdapterDeps = {
    getOrgId: () => opts.orgId,
    transportFor: () => transport,
  };
  if (opts.model !== undefined) deps.model = opts.model;

  const adapter = createByoaAdapter(cfg, deps);
  const controller = new AbortController();

  void (async () => {
    let sawTerminal = false;
    try {
      const sendOpts: Parameters<typeof adapter.send>[0] = {
        requestId,
        prompt: opts.prompt,
        signal: controller.signal,
      };
      if (opts.priorThread !== undefined) sendOpts.priorThread = opts.priorThread;
      for await (const chunk of adapter.send(sendOpts)) {
        if (chunk.kind === "text-delta") {
          handlers.onDelta(chunk.text);
        } else if (chunk.kind === "done") {
          sawTerminal = true;
          const meta: { tokensIn?: number; tokensOut?: number; providerThread?: ProviderThreadState } = {
            tokensIn: chunk.tokensIn,
            tokensOut: chunk.tokensOut,
          };
          if (chunk.providerThread !== undefined) meta.providerThread = chunk.providerThread;
          handlers.onDone(meta);
          return;
        } else {
          sawTerminal = true;
          handlers.onError(chunk.message);
          return;
        }
      }
    } catch (err) {
      // Red de seguridad para bugs del propio orquestador (el adapter
      // convierte fallos en chunks `error`).
      sawTerminal = true;
      handlers.onError(err instanceof Error ? err.message : String(err));
      return;
    }
    // Iterable terminado sin terminal = abort (del usuario o piso A).
    if (!sawTerminal) handlers.onAborted();
  })();

  return { requestId, abort: () => controller.abort() };
}
