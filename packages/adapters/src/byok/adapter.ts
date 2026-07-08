/**
 * createByokAdapter — implementación del contrato `Adapter` (Fase 2)
 * ------------------------------------------------------------------
 * El punto de la fase: los proveedores BYOK se consumen VÍA EL CONTRATO
 * de `@chatcouncil/shared`, no por APIs ad-hoc. Las dependencias de
 * entorno se INYECTAN para que este paquete no importe nada de la SPA:
 *   · `getApiKey`  → en apps/web la provee el key-vault (E2a). Este
 *     paquete jamás persiste ni loggea la llave; la ve el tiempo justo
 *     de armar la request.
 *   · `transportFor` → fetch directo (acá) o puente (apps/web).
 *
 * Semántica del iterable devuelto por `send`:
 *   · exactamente UN terminal (`done` | `error`) … salvo abort del
 *     consumidor, en cuyo caso el iterable simplemente TERMINA sin
 *     terminal (quien abortó ya lo sabe; el orquestador lo mapea a
 *     onAborted). Errores de transporte (HTTP !ok, red) → `error`.
 *   · `SendOptions.attachments`/`toggles`: fuera del alcance BYOK v1 —
 *     adjuntos presentes → `error` explícito (mejor que ignorarlos en
 *     silencio); toggles se ignoran documentadamente (ledger §0.3).
 */

import type { Adapter, AdapterChunk, SendOptions } from "@chatcouncil/shared";
import type { ByokProviderConfig, ByokTransport } from "./types";

export interface ByokAdapterDeps {
  getApiKey(providerId: string): string | null;
  transportFor(cfg: ByokProviderConfig): ByokTransport;
  /** Overrides a nivel instancia (el harness crea un adapter por envío). */
  model?: string;
  maxTokens?: number;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

export function createByokAdapter(cfg: ByokProviderConfig, deps: ByokAdapterDeps): Adapter {
  const controllers = new Map<string, AbortController>();

  async function* run(opts: SendOptions): AsyncGenerator<AdapterChunk> {
    const apiKey = deps.getApiKey(cfg.id);
    if (!apiKey) {
      yield { kind: "error", message: `No hay API key guardada para ${cfg.label} (key-vault vacío).` };
      return;
    }
    if (opts.attachments && opts.attachments.length > 0) {
      yield { kind: "error", message: "Adjuntos BYOK: fuera del alcance de Fase 2." };
      return;
    }

    const controller = new AbortController();
    controllers.set(opts.requestId, controller);
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    const parser = cfg.createParser();
    const queue: AdapterChunk[] = [];
    let finished = false;
    let failure: Error | null = null;
    let notify: (() => void) | null = null;
    const wake = () => {
      notify?.();
      notify = null;
    };

    const params: Parameters<ByokProviderConfig["buildRequest"]>[0] = { prompt: opts.prompt, apiKey };
    if (deps.model !== undefined) params.model = deps.model;
    if (deps.maxTokens !== undefined) params.maxTokens = deps.maxTokens;
    const req = cfg.buildRequest(params);

    deps
      .transportFor(cfg)
      .run(
        req,
        (text) => {
          queue.push(...parser.push(text));
          wake();
        },
        controller.signal,
      )
      .then(
        () => {
          queue.push(...parser.end());
        },
        (err: unknown) => {
          if (isAbortError(err) || controller.signal.aborted) return; // abort del consumidor
          failure = err instanceof Error ? err : new Error(String(err));
        },
      )
      .finally(() => {
        finished = true;
        wake();
      });

    try {
      for (;;) {
        while (queue.length > 0) {
          const chunk = queue.shift()!;
          yield chunk;
          if (chunk.kind !== "text-delta") return; // terminal entregado
        }
        if (finished) break;
        await new Promise<void>((resolve) => {
          if (queue.length > 0 || finished) resolve();
          else notify = resolve;
        });
      }
      if (failure) {
        const f: Error = failure;
        yield { kind: "error", message: f.message };
      }
      // sin failure ni terminal: abort del consumidor → terminar sin terminal
    } finally {
      controllers.delete(opts.requestId);
      if (!finished) controller.abort(); // consumidor cortó la iteración
    }
  }

  return {
    descriptor: {
      providerId: cfg.id,
      strategy: "endpoint",
      endpoint: {
        baseUrl: cfg.baseUrl,
        streamFormat: "sse",
        requiresSessionDerivedHeaders: false,
      },
      ...(cfg.notes !== undefined ? { notes: cfg.notes } : {}),
    },
    send: (opts: SendOptions) => run(opts),
    abort: (requestId: string) => {
      controllers.get(requestId)?.abort();
    },
  };
}
