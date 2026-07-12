import { parsePanelSourceId } from "@chatcouncil/shared";
import {
  createId,
  db,
  type AnalysisKind,
  type CompareResult,
  type Round,
  type RoundAnalysis,
  type RubricEntry,
  type SummarizeResult,
} from "../db";
import { latestDoneAttempt, saveRoundAnalysis } from "../conversation-repo";
import { panelDisplayLabel } from "../model-registry";
import { sendToPanel } from "../panel-runner";
import { anonymizeReplies, type AnalyzableReply } from "./anonymize";
import { buildJudgePrompt } from "./build-judge-prompt";
import { scanForProviderNames } from "./provider-names";

/**
 * Orquestador de Comparar/Resumir — ChatCouncil Fase 5 (Q30/E2, capa 3)
 * ------------------------------------------------------------------
 * La llamada del juez es UNA request más por `sendToPanel` (E1 de Fase
 * 4): sin cliente nuevo, sin `history`, sin `priorThread` — un análisis
 * es un turno aislado; un juez BYOA crea SIEMPRE una conversación nueva
 * en el proveedor y NO escribe `panelThreads`.
 *
 * Defensa en profundidad (capa 3): con anonimización activa, DESPUÉS
 * del scrub se escanean los textos etiquetados contra la lista de
 * términos identificatorios. Un match = el prompt NO SE ENVÍA (error
 * visible + console.warn). Nunca "recordá anonimizar": si la capa 1
 * falla, esta corta.
 */

export interface JudgeSelection {
  panelSourceId: string;
  providerId: string;
  /** undefined = default de la cuenta / del proveedor (no se manda override). */
  modelId?: string;
  /** Sólo si el juez es BYOA. */
  orgId?: string;
}

export interface RunAnalysisParams {
  conversationId: string;
  round: Round;
  kind: AnalysisKind;
  judge: JudgeSelection;
  anonymized: boolean;
  onPhase?: (phase: "preparando" | "consultando al juez" | "parseando") => void;
}

export interface RunningAnalysis {
  abort: () => void;
  /** Resuelve con el análisis persistido, o null si el usuario abortó. */
  done: Promise<RoundAnalysis | null>;
}

/** Carga las respuestas analizables de un Round: scope "round", con al menos un intento done. */
export async function loadAnalyzableReplies(round: Round): Promise<AnalyzableReply[]> {
  const replies = await db.replies.where("roundId").equals(round.id).sortBy("createdAt");
  const out: AnalyzableReply[] = [];
  for (const reply of replies) {
    if (reply.scope !== "round") continue;
    const attempt = latestDoneAttempt(reply);
    if (!attempt) continue; // sin respuesta exitosa: no hay nada que juzgar
    out.push({
      panelSourceId: reply.panelSourceId,
      replyId: reply.id,
      attemptId: attempt.id,
      displayName: `${panelDisplayLabel(reply.panelSourceId)} · ${reply.modelId}`,
      text: attempt.content,
    });
  }
  return out;
}

/* ------------------------------------------------------------------
 * Parseo tolerante-pero-verificado del JSON del juez. Exportado para
 * que el harness lo ejercite con fixtures (JSON limpio, JSON con
 * fences, basura → parse_error) sin necesitar un proveedor real.
 * ------------------------------------------------------------------ */

export type ParsedJudgeResponse =
  | { ok: true; compare?: CompareResult; summarize?: SummarizeResult }
  | { ok: false; reason: string };

function clampScore(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) return 1;
  return Math.min(5, Math.max(1, Math.round(n)));
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function parseJudgeResponse(kind: AnalysisKind, raw: string): ParsedJudgeResponse {
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    return { ok: false, reason: "la respuesta del juez no contiene un objeto JSON" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(first, last + 1));
  } catch (e) {
    return { ok: false, reason: `JSON inválido: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "el JSON del juez no es un objeto" };
  }
  const obj = parsed as Record<string, unknown>;

  if (kind === "compare") {
    if (!Array.isArray(obj.porRespuesta)) {
      return { ok: false, reason: "falta porRespuesta[] en la respuesta del juez" };
    }
    const porRespuesta: RubricEntry[] = [];
    for (const entry of obj.porRespuesta) {
      if (typeof entry !== "object" || entry === null) continue;
      const e = entry as Record<string, unknown>;
      const cf = (e.correccionFactual ?? {}) as Record<string, unknown>;
      const pf = (e.profundidad ?? {}) as Record<string, unknown>;
      porRespuesta.push({
        label: asString(e.label, "(sin etiqueta)"),
        correccionFactual: { score: clampScore(cf.score), nota: asString(cf.nota) },
        profundidad: { score: clampScore(pf.score), nota: asString(pf.nota) },
        senalesSesgo: asString(e.senalesSesgo),
        tono: asString(e.tono),
      });
    }
    if (porRespuesta.length === 0) {
      return { ok: false, reason: "porRespuesta[] vino vacío o malformado" };
    }
    return { ok: true, compare: { veredicto: asString(obj.veredicto), porRespuesta } };
  }

  const resumen = asString(obj.resumen);
  if (!resumen) return { ok: false, reason: "falta resumen en la respuesta del juez" };
  return {
    ok: true,
    summarize: { resumen, coincidencias: asStringArray(obj.coincidencias), divergencias: asStringArray(obj.divergencias) },
  };
}

/* ------------------------------------------------------------------ */

export function runRoundAnalysis(params: RunAnalysisParams): RunningAnalysis {
  const startedAt = Date.now();
  let abortFn: () => void = () => {};

  const done = (async (): Promise<RoundAnalysis | null> => {
    params.onPhase?.("preparando");
    const analyzable = await loadAnalyzableReplies(params.round);
    const minimum = params.kind === "compare" ? 2 : 1;
    if (analyzable.length < minimum) {
      throw new Error(
        `este Round tiene ${analyzable.length} respuesta(s) exitosa(s); ${
          params.kind === "compare" ? "Comparar necesita al menos 2" : "Resumir necesita al menos 1"
        }`,
      );
    }

    const { labeled, seal, redactions } = anonymizeReplies(analyzable, params.anonymized);

    // Capa 3 (E2): post-scrub, cero términos identificatorios en los
    // textos etiquetados o el prompt NO sale. El prompt original del
    // usuario queda fuera del escaneo a propósito (ver anonymize.ts).
    if (params.anonymized) {
      const leaked = labeled.flatMap((r) => scanForProviderNames(r.text));
      if (leaked.length > 0) {
        console.warn("[chatcouncil:judge] anonimización rota — el prompt NO se envió. Términos:", leaked);
        throw new Error(`anonimización rota (${leaked.length} término(s) identificatorio(s) sobrevivieron al scrub) — no se envió nada al juez`);
      }
    }

    const prompt = buildJudgePrompt({
      kind: params.kind,
      originalPrompt: params.round.promptText,
      replies: labeled,
    });

    const analyzedProviderIds = new Set(
      analyzable
        .map((r) => parsePanelSourceId(r.panelSourceId)?.providerId)
        .filter((p): p is string => typeof p === "string"),
    );
    const judgeWasParticipant = analyzedProviderIds.has(params.judge.providerId);

    params.onPhase?.("consultando al juez");
    let buffer = "";
    const terminal = await new Promise<
      | { kind: "done"; tokensIn?: number; tokensOut?: number }
      | { kind: "error"; message: string }
      | { kind: "aborted" }
    >((resolve) => {
      const sendOpts: Parameters<typeof sendToPanel>[0] = {
        panelSourceId: params.judge.panelSourceId,
        prompt,
      };
      if (params.judge.modelId !== undefined) sendOpts.model = params.judge.modelId;
      if (params.judge.orgId !== undefined) sendOpts.orgId = params.judge.orgId;
      const { abort } = sendToPanel(sendOpts, {
        onDelta: (text) => {
          buffer += text;
        },
        onDone: (meta) => {
          const t: { kind: "done"; tokensIn?: number; tokensOut?: number } = { kind: "done" };
          if (meta.tokensIn !== undefined) t.tokensIn = meta.tokensIn;
          if (meta.tokensOut !== undefined) t.tokensOut = meta.tokensOut;
          resolve(t);
        },
        onError: (message) => resolve({ kind: "error", message }),
        onAborted: () => resolve({ kind: "aborted" }),
      });
      abortFn = abort;
    });

    if (terminal.kind === "aborted") return null; // cancelado por el usuario: no se persiste nada

    const base: RoundAnalysis = {
      id: createId("analysis"),
      conversationId: params.conversationId,
      roundId: params.round.id,
      kind: params.kind,
      createdAt: Date.now(),
      judgePanelSourceId: params.judge.panelSourceId,
      judgeWasParticipant,
      anonymized: params.anonymized,
      labelMap: seal,
      redactions,
      rubricVersion: 1,
      status: "ok",
      rawResponse: buffer,
      latencyMs: Date.now() - startedAt,
    };
    if (params.judge.modelId !== undefined) base.judgeModelId = params.judge.modelId;

    if (terminal.kind === "error") {
      base.status = "error";
      base.errorMessage = terminal.message;
      console.warn("[chatcouncil:judge] el juez falló:", terminal.message);
      await saveRoundAnalysis(base);
      return base;
    }

    if (terminal.tokensIn !== undefined) base.tokensIn = terminal.tokensIn;
    if (terminal.tokensOut !== undefined) base.tokensOut = terminal.tokensOut;

    params.onPhase?.("parseando");
    const parsed = parseJudgeResponse(params.kind, buffer);
    if (!parsed.ok) {
      base.status = "parse_error";
      base.errorMessage = parsed.reason;
      console.warn("[chatcouncil:judge] respuesta del juez no parseable (se conserva el raw):", parsed.reason);
    } else {
      if (parsed.compare !== undefined) base.compare = parsed.compare;
      if (parsed.summarize !== undefined) base.summarize = parsed.summarize;
    }

    await saveRoundAnalysis(base);
    return base;
  })();

  return { abort: () => abortFn(), done };
}
