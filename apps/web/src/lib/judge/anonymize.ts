import { buildBlocklistRegex, REDACTION_TOKEN } from "./provider-names";

/**
 * Anonimizador — ChatCouncil Fase 5 (Q30/E2, capa 1 de 3)
 * ------------------------------------------------------------------
 * ÚNICO módulo que decide qué etiqueta lleva cada respuesta. Produce
 * dos salidas deliberadamente separadas:
 *
 *   · `labeled` — {label, text}[] SIN identidad de proveedor: es lo
 *     único que build-judge-prompt.ts acepta (el tipo no puede
 *     transportar identidad sin un cast deliberado).
 *   · `seal` — la correspondencia etiqueta→panel. Va a Dexie
 *     (RoundAnalysis.labelMap) y a la UI para des-referenciar; JAMÁS
 *     al camino del prompt.
 *
 * Con `anonymized: true` (default Q30, el toggle sólo lo DESACTIVA):
 *   · etiquetas neutras "Modelo A/B/C…" en el orden recibido
 *   · scrub E2-iii: términos identificatorios del CONTENIDO → ▮▮▮,
 *     porque las respuestas se auto-identifican ("Soy Claude…") y eso
 *     rompe el juicio ciego por dentro. Sólo se toca la copia que va
 *     al juez; el original queda intacto. Cada redacción se cuenta.
 *
 * El prompt ORIGINAL del usuario no se scrubbea: es idéntico para
 * todas las respuestas y no revela qué etiqueta es qué proveedor
 * (mencionar "Claude" en la PREGUNTA no rompe la ceguera del juicio).
 */

export interface AnalyzableReply {
  panelSourceId: string;
  replyId: string;
  attemptId: string;
  /** Nombre visible (proveedor · modelo). Sólo llega al prompt con anonymized=false. */
  displayName: string;
  text: string;
}

export interface LabeledReply {
  label: string;
  text: string;
}

export interface SealEntry {
  label: string;
  panelSourceId: string;
  replyId: string;
  attemptId: string;
}

export interface RedactionCount {
  label: string;
  count: number;
}

export interface AnonymizeOutput {
  labeled: LabeledReply[];
  seal: SealEntry[];
  redactions: RedactionCount[];
}

const LABEL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function anonymizeReplies(replies: AnalyzableReply[], anonymized: boolean): AnonymizeOutput {
  const labeled: LabeledReply[] = [];
  const seal: SealEntry[] = [];
  const redactions: RedactionCount[] = [];

  replies.forEach((reply, i) => {
    const label = anonymized ? `Modelo ${LABEL_LETTERS[i % LABEL_LETTERS.length]}` : reply.displayName;
    let text = reply.text;
    let count = 0;
    if (anonymized) {
      const re = buildBlocklistRegex();
      text = text.replace(re, () => {
        count += 1;
        return REDACTION_TOKEN;
      });
    }
    labeled.push({ label, text });
    seal.push({ label, panelSourceId: reply.panelSourceId, replyId: reply.replyId, attemptId: reply.attemptId });
    if (count > 0) redactions.push({ label, count });
  });

  return { labeled, seal, redactions };
}
