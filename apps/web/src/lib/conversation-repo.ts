import { parsePanelSourceId } from "@chatcouncil/shared";
import { db, createId, type Attempt, type Conversation, type PanelThread, type Reply, type Round } from "./db";
import { sendToPanel, type PanelRunHandlers } from "./panel-runner";
import { buildByokHistory } from "./thread-history";

/**
 * Repositorio de conversación — ChatCouncil (Fase 4)
 * ------------------------------------------------------------------
 * Todas las escrituras de Dexie de la fase pasan por acá. Diseño
 * deliberado: `appendAttemptDelta`/`finishAttempt` reciben `attemptId`
 * explícito en vez de asumir "el último intento del array" — si un
 * reintento (Q15) se dispara MIENTRAS el intento anterior todavía está
 * en vuelo, "el último" cambiaría de identidad a mitad de un stream y el
 * handler del intento viejo terminaría escribiendo sobre el nuevo. Con
 * id explícito esa condición de carrera no puede pasar.
 */

/** E6: acá se dispara el lock — se escribe UNA sola vez, en la creación. */
export async function ensureConversationForFirstSend(
  panelSourceIds: string[],
  byoaOrgId?: string,
): Promise<Conversation> {
  const now = Date.now();
  const conv: Conversation = {
    id: createId("conv"),
    title: "Nueva conversación",
    createdAt: now,
    updatedAt: now,
    lockedModelIds: [...panelSourceIds],
    hiddenModelIds: [],
    syncState: "local-only",
  };
  if (byoaOrgId !== undefined) conv.byoaOrgId = byoaOrgId;
  await db.conversations.add(conv);
  return conv;
}

export async function createRound(conversationId: string, promptText: string): Promise<Round> {
  const count = await db.rounds.where("conversationId").equals(conversationId).count();
  const round: Round = {
    id: createId("round"),
    conversationId,
    index: count,
    promptText,
    attachments: [],
    toggles: { webSearch: false, imageGeneration: false },
    createdAt: Date.now(),
  };
  await db.rounds.add(round);
  await db.conversations.update(conversationId, { updatedAt: round.createdAt });
  return round;
}

export async function createPendingReply(params: {
  conversationId: string;
  roundId: string;
  panelSourceId: string;
  modelId: string;
  scope: "round" | "panel-continued";
  followUpPrompt?: string;
}): Promise<Reply> {
  const parsed = parsePanelSourceId(params.panelSourceId);
  const now = Date.now();
  const attempt: Attempt = { id: createId("attempt"), status: "pending", content: "", startedAt: now };
  const reply: Reply = {
    id: createId("reply"),
    roundId: params.roundId,
    conversationId: params.conversationId,
    panelSourceId: params.panelSourceId,
    modelId: params.modelId,
    connectionMode: parsed?.connectionMode ?? "byok",
    scope: params.scope,
    createdAt: now,
    attempts: [attempt],
  };
  if (params.followUpPrompt !== undefined) reply.followUpPrompt = params.followUpPrompt;
  await db.replies.add(reply);
  return reply;
}

/** "continuar solo aquí" (Q13): no crea Round nuevo; cuelga del último Round sólo como referencia de agrupación. */
export async function addPanelContinuedReply(params: {
  conversationId: string;
  panelSourceId: string;
  modelId: string;
  followUpPrompt: string;
}): Promise<Reply> {
  const rounds = await db.rounds.where("conversationId").equals(params.conversationId).sortBy("index");
  const lastRound = rounds[rounds.length - 1];
  if (!lastRound) throw new Error("no se puede continuar un panel sin al menos un Round previo");
  return createPendingReply({
    conversationId: params.conversationId,
    roundId: lastRound.id,
    panelSourceId: params.panelSourceId,
    modelId: params.modelId,
    scope: "panel-continued",
    followUpPrompt: params.followUpPrompt,
  });
}

/** Reintento (Q15): agrega un Attempt nuevo, nunca reemplaza el anterior. */
export async function appendRetryAttempt(replyId: string): Promise<Attempt> {
  const attempt: Attempt = { id: createId("attempt"), status: "pending", content: "", startedAt: Date.now() };
  await db.replies
    .where("id")
    .equals(replyId)
    .modify((r) => {
      r.attempts.push(attempt);
    });
  return attempt;
}

export async function appendAttemptDelta(replyId: string, attemptId: string, text: string): Promise<void> {
  await db.replies
    .where("id")
    .equals(replyId)
    .modify((r) => {
      const attempt = r.attempts.find((a) => a.id === attemptId);
      if (!attempt) return;
      attempt.content += text;
      if (attempt.status === "pending") attempt.status = "streaming";
    });
}

export async function finishAttempt(
  replyId: string,
  attemptId: string,
  outcome: { status: "done" | "error" | "aborted"; errorMessage?: string; tokensIn?: number; tokensOut?: number },
): Promise<void> {
  await db.replies
    .where("id")
    .equals(replyId)
    .modify((r) => {
      const attempt = r.attempts.find((a) => a.id === attemptId);
      if (!attempt) return;
      attempt.status = outcome.status;
      attempt.finishedAt = Date.now();
      attempt.latencyMs = attempt.finishedAt - attempt.startedAt;
      if (outcome.errorMessage !== undefined) attempt.errorMessage = outcome.errorMessage;
      if (outcome.tokensIn !== undefined) attempt.tokensIn = outcome.tokensIn;
      if (outcome.tokensOut !== undefined) attempt.tokensOut = outcome.tokensOut;
    });
}

/** `PanelThread.id` es determinístico: evita duplicados por panel dentro de una conversación. */
function panelThreadId(conversationId: string, panelSourceId: string): string {
  return `${conversationId}:${panelSourceId}`;
}

/**
 * Dispara el envío real a un panel para UN attempt puntual: arma el
 * historial BYOK si aplica (E2=B: BYOA lo ignora, su continuidad es
 * server-side — ver ledger) y cablea los handlers para que los deltas y
 * el terminal escriban a Dexie por `attemptId`, no por posición.
 *
 * BYOA (E2): antes de despachar, lee el hilo previo del panel en
 * `panelThreads` (ausente en el primer turno de este panel — la conversación
 * se crea desde cero); tras un turno exitoso con `providerThread`, lo
 * persiste para que el PRÓXIMO turno reuse la misma conversación de
 * claude.ai en vez de arrancar una nueva.
 */
export async function dispatchReply(
  reply: Pick<Reply, "id" | "panelSourceId" | "conversationId">,
  attemptId: string,
  promptText: string,
  modelOverride: string | undefined,
  byoaOrgId: string | undefined,
): Promise<{ requestId: string; abort: () => void }> {
  const parsed = parsePanelSourceId(reply.panelSourceId);
  const isByoa = parsed?.connectionMode === "byoa";
  const history = parsed?.connectionMode === "byok" ? await buildByokHistory(reply.conversationId, reply.panelSourceId) : undefined;
  const priorThread = isByoa ? await db.panelThreads.get(panelThreadId(reply.conversationId, reply.panelSourceId)) : undefined;

  const handlers: PanelRunHandlers = {
    onDelta: (text) => void appendAttemptDelta(reply.id, attemptId, text),
    onDone: (meta) => {
      void finishAttempt(reply.id, attemptId, { status: "done", tokensIn: meta.tokensIn, tokensOut: meta.tokensOut });
      if (isByoa && meta.providerThread) {
        const thread: PanelThread = {
          id: panelThreadId(reply.conversationId, reply.panelSourceId),
          conversationId: reply.conversationId,
          panelSourceId: reply.panelSourceId,
          providerConversationId: meta.providerThread.conversationUuid,
          lastMessageId: meta.providerThread.lastMessageId,
          updatedAt: Date.now(),
        };
        void db.panelThreads.put(thread);
      }
    },
    onError: (message) => void finishAttempt(reply.id, attemptId, { status: "error", errorMessage: message }),
    onAborted: () => void finishAttempt(reply.id, attemptId, { status: "aborted" }),
  };

  const runOpts: Parameters<typeof sendToPanel>[0] = { panelSourceId: reply.panelSourceId, prompt: promptText };
  if (history !== undefined) runOpts.history = history;
  if (modelOverride !== undefined) runOpts.model = modelOverride;
  if (byoaOrgId !== undefined) runOpts.orgId = byoaOrgId;
  if (priorThread !== undefined) {
    runOpts.priorThread = { conversationUuid: priorThread.providerConversationId, lastMessageId: priorThread.lastMessageId };
  }

  return sendToPanel(runOpts, handlers);
}

export interface LoadedConversation {
  conversation: Conversation;
  rounds: Round[];
  repliesByRoundId: Map<string, Reply[]>;
  panelContinuedByPanelSourceId: Map<string, Reply[]>;
}

/** Recuperación completa al recargar — esto es lo que el criterio de aceptación mide de verdad. */
export async function loadConversation(conversationId: string): Promise<LoadedConversation | null> {
  const conversation = await db.conversations.get(conversationId);
  if (!conversation) return null;
  const rounds = await db.rounds.where("conversationId").equals(conversationId).sortBy("index");
  const replies = await db.replies.where("conversationId").equals(conversationId).sortBy("createdAt");

  const repliesByRoundId = new Map<string, Reply[]>();
  const panelContinuedByPanelSourceId = new Map<string, Reply[]>();
  for (const r of replies) {
    if (r.scope === "round") {
      const list = repliesByRoundId.get(r.roundId) ?? [];
      list.push(r);
      repliesByRoundId.set(r.roundId, list);
    } else {
      const list = panelContinuedByPanelSourceId.get(r.panelSourceId) ?? [];
      list.push(r);
      panelContinuedByPanelSourceId.set(r.panelSourceId, list);
    }
  }
  return { conversation, rounds, repliesByRoundId, panelContinuedByPanelSourceId };
}

export async function listConversationsForSidebar(): Promise<Conversation[]> {
  return db.conversations.orderBy("updatedAt").reverse().toArray();
}

export interface PanelTimelineEntry {
  reply: Reply;
  /** Texto de usuario resuelto: Round.promptText (scope "round") o Reply.followUpPrompt (scope "panel-continued"). */
  userText: string;
}

/**
 * Timeline de UN panel: mezcla sus replies de Round con sus replies
 * "continuar solo aquí" en orden cronológico real (Reply.createdAt) —
 * el grid renderiza esto sin tener que conocer la diferencia entre
 * scopes.
 */
export function buildPanelTimeline(loaded: LoadedConversation, panelSourceId: string): PanelTimelineEntry[] {
  const promptByRoundId = new Map(loaded.rounds.map((r) => [r.id, r.promptText] as const));
  const entries: PanelTimelineEntry[] = [];
  for (const replies of loaded.repliesByRoundId.values()) {
    for (const reply of replies) {
      if (reply.panelSourceId !== panelSourceId) continue;
      entries.push({ reply, userText: promptByRoundId.get(reply.roundId) ?? "(prompt no encontrado)" });
    }
  }
  const continued = loaded.panelContinuedByPanelSourceId.get(panelSourceId) ?? [];
  for (const reply of continued) {
    entries.push({ reply, userText: reply.followUpPrompt ?? "" });
  }
  entries.sort((a, b) => a.reply.createdAt - b.reply.createdAt);
  return entries;
}
