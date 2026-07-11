import type { ConversationTurn } from "@chatcouncil/shared";
import { db, type Attempt, type Reply } from "./db";

/** Último intento con status "done" de una Reply, o null si ninguno tuvo éxito todavía. */
function lastDoneAttemptContent(attempts: Attempt[]): string | null {
  for (let i = attempts.length - 1; i >= 0; i--) {
    const a = attempts[i];
    if (a && a.status === "done") return a.content;
  }
  return null;
}

/**
 * Reconstruye el historial de turnos de UN panel para threading BYOK
 * (E2=B, decisión de Juan: los Rounds SÍ threadean por panel — no son
 * comparaciones independientes). Recorre las Replies de ese panel en
 * orden cronológico (`Reply.createdAt`, robusto también para
 * "continuar solo aquí", que vive fuera del flujo de Round) y arma
 * pares user/assistant. Un turno sin ningún intento exitoso se OMITE
 * ENTERO — no tiene sentido threadear una pregunta que el proveedor
 * nunca contestó (dejaría un turno de usuario colgado sin respuesta).
 */
export async function buildByokHistory(conversationId: string, panelSourceId: string): Promise<ConversationTurn[]> {
  const replies: Reply[] = await db.replies
    .where("[conversationId+panelSourceId]")
    .equals([conversationId, panelSourceId])
    .sortBy("createdAt");

  const roundIds = Array.from(new Set(replies.filter((r) => r.scope === "round").map((r) => r.roundId)));
  const rounds = await db.rounds.bulkGet(roundIds);
  const promptByRoundId = new Map(
    rounds.filter((r): r is NonNullable<typeof r> => r != null).map((r) => [r.id, r.promptText] as const),
  );

  const turns: ConversationTurn[] = [];
  for (const reply of replies) {
    const assistantText = lastDoneAttemptContent(reply.attempts);
    if (assistantText === null) continue; // sin respuesta exitosa: se omite el turno completo
    const userText = reply.scope === "panel-continued" ? reply.followUpPrompt : promptByRoundId.get(reply.roundId);
    if (!userText) continue; // defensivo — no debería pasar con datos bien formados
    turns.push({ role: "user", content: userText });
    turns.push({ role: "assistant", content: assistantText });
  }
  return turns;
}
