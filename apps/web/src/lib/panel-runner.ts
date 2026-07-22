import { parsePanelSourceId, type ConversationTurn, type ProviderThreadState } from "@chatcouncil/shared";
import { sendByoaPrompt, type ByoaPromptHandlers } from "./byoa-client";
import { sendByokPrompt, type ByokPromptHandlers } from "./byok-client";

/**
 * Panel runner — ChatCouncil (Fase 4, E1)
 * ------------------------------------------------------------------
 * `byok-client.ts` y `byoa-client.ts` ya eran casi isomorfos (mismos
 * handlers, mismo retorno {requestId, abort}). Este módulo es la
 * fachada fina que decide cuál llamar según `panelSourceId` — el grid,
 * el compose bar, el retry y "continuar solo aquí" llaman UNA función,
 * sin `if (family === "byok")` repetido en cada punto de envío.
 */

export interface PanelRunHandlers {
  onDelta: (text: string) => void;
  onDone: (meta: { tokensIn?: number; tokensOut?: number; providerThread?: ProviderThreadState }) => void;
  onError: (message: string) => void;
  onAborted: () => void;
  onReconnecting?: () => void;
  onResumed?: () => void;
}

export interface PanelRunOptions {
  panelSourceId: string;
  prompt: string;
  model?: string;
  /** Sólo se usa si el panel es BYOK (E2=B). BYOA lo ignora — su continuidad es del lado del proveedor. */
  history?: ConversationTurn[];
  /** Sólo se usa si el panel es BYOA. */
  orgId?: string;
  /** Sólo se usa si el panel es BYOA (E2): hilo previo de ESTE panel, ausente en el primer turno. */
  priorThread?: ProviderThreadState;
}

function inertFailure(message: string, onError: (m: string) => void): { requestId: string; abort: () => void } {
  const requestId = crypto.randomUUID();
  queueMicrotask(() => onError(message));
  return { requestId, abort: () => {} };
}

export function sendToPanel(
  opts: PanelRunOptions,
  handlers: PanelRunHandlers,
): { requestId: string; abort: () => void } {
  const parsed = parsePanelSourceId(opts.panelSourceId);
  if (!parsed) {
    return inertFailure(`id de panel inválido: ${opts.panelSourceId}`, handlers.onError);
  }

  if (parsed.connectionMode === "byok") {
    const byokOpts: Parameters<typeof sendByokPrompt>[0] = { providerId: parsed.providerId, prompt: opts.prompt };
    if (opts.history !== undefined) byokOpts.history = opts.history;
    if (opts.model !== undefined) byokOpts.model = opts.model;
    const byokHandlers: ByokPromptHandlers = {
      onDelta: handlers.onDelta,
      onDone: handlers.onDone,
      onError: handlers.onError,
      onAborted: handlers.onAborted,
    };
    if (handlers.onReconnecting !== undefined) byokHandlers.onReconnecting = handlers.onReconnecting;
    if (handlers.onResumed !== undefined) byokHandlers.onResumed = handlers.onResumed;
    return sendByokPrompt(byokOpts, byokHandlers);
  }

  // BYOA: necesita orgId de sesión (E8) antes de poder despachar nada.
  if (!opts.orgId) {
    return inertFailure("elige una organización de sesión antes de enviar a este panel", handlers.onError);
  }
  const byoaOpts: Parameters<typeof sendByoaPrompt>[0] = {
    providerId: parsed.providerId,
    orgId: opts.orgId,
    prompt: opts.prompt,
  };
  if (opts.model !== undefined) byoaOpts.model = opts.model;
  if (opts.priorThread !== undefined) byoaOpts.priorThread = opts.priorThread;
  const byoaHandlers: ByoaPromptHandlers = {
    onDelta: handlers.onDelta,
    onDone: handlers.onDone,
    onError: handlers.onError,
    onAborted: handlers.onAborted,
  };
  if (handlers.onReconnecting !== undefined) byoaHandlers.onReconnecting = handlers.onReconnecting;
  if (handlers.onResumed !== undefined) byoaHandlers.onResumed = handlers.onResumed;
  return sendByoaPrompt(byoaOpts, byoaHandlers);
}
