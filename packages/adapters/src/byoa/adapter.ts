/**
 * createByoaAdapter — implementación del contrato `Adapter` (Fase 3, B+)
 * ------------------------------------------------------------------
 * El punto de la fase: los proveedores BYOA se consumen VÍA EL CONTRATO
 * de `@chatcouncil/shared`, igual que BYOK — quien consume (la SPA) no
 * sabe que por debajo hay un endpoint interno con estado. La diferencia
 * con BYOK es que `send()` es una MÁQUINA CON ESTADO de dos pasos:
 *   1. crear la conversación (POST chat_conversations, no streaming). El
 *      uuid lo genera el cliente; un !ok rechaza y termina en `error`.
 *   2. completion (streaming) → parser → text-deltas → `done`.
 * Este multi-paso es un detalle del DIALECTO (claude.ai) y por eso vive
 * en packages/adapters, no en apps/web (topología del BLUEPRINT).
 *
 * Dependencias inyectadas (para no importar nada de la SPA):
 *   · `getOrgId`    → la organización de sesión elegida en el panel.
 *   · `transportFor`→ el puente de la extensión (byoa:proxy → offscreen
 *     con credentials:"include"). No hay camino directo: la SPA no puede
 *     mandarle la cookie de sesión a claude.ai por su cuenta.
 *
 * Semántica del iterable (idéntica a BYOK): exactamente UN terminal
 * (`done`|`error`), salvo abort del consumidor → termina sin terminal (el
 * orquestador lo mapea a onAborted). `attachments`/`toggles`/`model`
 * diferidos como en BYOK (adjuntos presentes → `error` explícito).
 *
 * Threading multi-turno (Fase 4, E2): con `opts.priorThread` (hilo de un
 * turno anterior de ESTE panel, ver `apps/web/src/lib/db.ts`
 * `panelThreads`), el paso 1 se SALTEA — se reusa la conversación
 * existente y el `parent_message_uuid` es su `lastMessageId` — en vez de
 * crear una conversación nueva con parent raíz. Tras un paso 2 exitoso
 * (sin abort, sin error), un paso 3 (`buildGetThread`, no-streaming) trae
 * el uuid del mensaje del asistente recién creado y lo adjunta al chunk
 * `done` como `providerThread`; quien consume (apps/web) lo persiste para
 * el próximo turno. Si el paso 3 falla, el turno sigue `done` sin
 * `providerThread` — degradación suave, nunca se pisa una respuesta ya
 * entregada por un fallo de una request de "housekeeping".
 */

import type { Adapter, AdapterChunk, ProviderThreadState, SendOptions } from "@chatcouncil/shared";
import type { ByoaCompletionParams, ByoaProviderConfig, ByoaTransport } from "./types";

export interface ByoaAdapterDeps {
  /** Organización de sesión elegida (uuid). null → error explícito. */
  getOrgId(): string | null;
  transportFor(cfg: ByoaProviderConfig): ByoaTransport;
  /** Override del modelo a nivel instancia (el harness crea un adapter por envío). */
  model?: string;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/** Paso 3: housekeeping post-turno. Nunca lanza — un fallo acá degrada a "sin providerThread", no a error del turno. */
async function fetchThreadState(
  cfg: ByoaProviderConfig,
  transport: ByoaTransport,
  orgId: string,
  conversationUuid: string,
  signal: AbortSignal,
): Promise<ProviderThreadState | null> {
  let body = "";
  try {
    await transport.run(cfg.buildGetThread({ orgId, conversationUuid }), (text) => (body += text), signal);
  } catch {
    return null;
  }
  const lastMessageId = cfg.parseLastAssistantMessageUuid(body);
  return lastMessageId ? { conversationUuid, lastMessageId } : null;
}

export function createByoaAdapter(cfg: ByoaProviderConfig, deps: ByoaAdapterDeps): Adapter {
  const controllers = new Map<string, AbortController>();

  async function* run(opts: SendOptions): AsyncGenerator<AdapterChunk> {
    const orgId = deps.getOrgId();
    if (!orgId) {
      yield { kind: "error", message: `No hay organización de sesión seleccionada para ${cfg.label}.` };
      return;
    }
    if (opts.attachments && opts.attachments.length > 0) {
      yield { kind: "error", message: "Adjuntos BYOA: fuera del alcance de Fase 3." };
      return;
    }

    const controller = new AbortController();
    controllers.set(opts.requestId, controller);
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    const transport = deps.transportFor(cfg);

    // `finished` visible en el finally: cubre tanto el corte antes del paso
    // 2 (error/abort al crear) como después.
    let finished = false;
    try {
      // ── Paso 1: crear la conversación (salteado si hay hilo previo) ───
      // Con `priorThread` reusamos la conversación existente del panel en
      // vez de generar una nueva; sin él, el uuid lo genera el cliente y la
      // respuesta sólo confirma. stream:false → el transporte entrega el
      // cuerpo entero y resuelve; un HTTP !ok rechaza y cae al catch.
      const conversationUuid = opts.priorThread?.conversationUuid ?? crypto.randomUUID();
      if (!opts.priorThread) {
        try {
          await transport.run(cfg.buildCreateConversation({ orgId, conversationUuid }), () => {}, controller.signal);
        } catch (err) {
          finished = true;
          if (isAbortError(err) || controller.signal.aborted) return; // abort del consumidor
          yield { kind: "error", message: `crear conversación: ${err instanceof Error ? err.message : String(err)}` };
          return;
        }
      }

      // ── Paso 2: completion (streaming) ────────────────────────────────
      const params: ByoaCompletionParams = {
        orgId,
        conversationUuid,
        parentMessageUuid: opts.priorThread?.lastMessageId ?? cfg.rootParentMessageUuid,
        prompt: opts.prompt,
      };
      if (deps.model !== undefined) params.model = deps.model;
      const completionReq = cfg.buildCompletion(params);

      const parser = cfg.createParser();
      const queue: AdapterChunk[] = [];
      let failure: Error | null = null;
      let notify: (() => void) | null = null;
      const wake = () => {
        notify?.();
        notify = null;
      };

      transport
        .run(
          completionReq,
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

      for (;;) {
        while (queue.length > 0) {
          const chunk = queue.shift()!;
          if (chunk.kind === "done") {
            // ── Paso 3: housekeeping post-turno (nunca convierte el turno en error) ──
            const providerThread = await fetchThreadState(cfg, transport, orgId, conversationUuid, controller.signal);
            yield providerThread ? { ...chunk, providerThread } : chunk;
            return;
          }
          yield chunk;
          if (chunk.kind !== "text-delta") return; // terminal entregado ("error")
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
        baseUrl: cfg.sessionOrigin,
        streamFormat: "sse",
        // La sesión (cookie) autentica; no hay headers derivados de la
        // página, pero la request depende de la sesión del navegador.
        requiresSessionDerivedHeaders: true,
      },
      ...(cfg.notes !== undefined ? { notes: cfg.notes } : {}),
    },
    send: (opts: SendOptions) => run(opts),
    abort: (requestId: string) => {
      controllers.get(requestId)?.abort();
    },
  };
}
