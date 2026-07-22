import { useLiveQuery } from "dexie-react-hooks";
import { Check, TriangleAlert, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { parsePanelSourceId } from "@chatcouncil/shared";
import { latestDoneAttempt } from "@/lib/conversation-repo";
import { db, type AnalysisKind, type Reply, type Round, type RoundAnalysis } from "@/lib/db";
import { runRoundAnalysis, type JudgeSelection } from "@/lib/judge/run-analysis";
import { isAccountDefaultModel, listPanelOptions, panelDisplayLabel, type PanelOption } from "@/lib/model-registry";
import { useCouncilStore } from "@/store/useCouncilStore";
import { Button, Section, Select } from "@chatcouncil/ui";

/**
 * Comparar/Resumir (Q30) — Fase 5. Herramienta de AUDITORÍA DE SESGOS,
 * no un chat comparativo:
 *  · anonimización por DEFAULT; el toggle sólo la desactiva (Q30, no
 *    negociable) — la imposibilidad de filtrar identidad es
 *    estructural (lib/judge + guard:judge), no una convención.
 *  · el selector de juez SUGIERE un proveedor FUERA del consejo
 *    (pedido explícito de Juan): más neutral, menos auto-referencia.
 *    Un juez participante no se bloquea (puede ser lo único
 *    disponible) pero se marca y se persiste judgeWasParticipant.
 *  · el resultado persiste como objeto propio ligado al Round
 *    (roundAnalyses, Dexie v3) — se recupera tras recargar.
 */

const EMPTY_ANALYSES: RoundAnalysis[] = [];

function StatusBadge({ a }: { a: RoundAnalysis }) {
  if (a.status === "ok") return <Check size={12} className="inline shrink-0 text-accent-secondary" aria-label="ok" />;
  if (a.status === "parse_error") return <span aria-label="parse_error">raw</span>;
  return <X size={12} className="inline shrink-0 text-danger" aria-label="error" />;
}

export function AnalyzeSection({ conversationId }: { conversationId: string | null }) {
  const byoaSessionConfirmed = useCouncilStore((s) => s.byoaSessionConfirmed);
  const byoaSelectedOrgIdByProvider = useCouncilStore((s) => s.byoaSelectedOrgIdByProvider);

  const rounds = useLiveQuery(
    () => (conversationId ? db.rounds.where("conversationId").equals(conversationId).sortBy("index") : Promise.resolve([] as Round[])),
    [conversationId],
    [] as Round[],
  );

  const [roundId, setRoundId] = useState<string | null>(null);
  useEffect(() => {
    // default: el último Round; si el elegido ya no existe (cambio de conversación), resetear
    if (rounds.length === 0) {
      setRoundId(null);
      return;
    }
    if (!roundId || !rounds.some((r) => r.id === roundId)) {
      setRoundId(rounds[rounds.length - 1]!.id);
    }
  }, [rounds, roundId]);

  const selectedRound = rounds.find((r) => r.id === roundId) ?? null;

  const roundReplies = useLiveQuery(
    () => (roundId ? db.replies.where("roundId").equals(roundId).sortBy("createdAt") : Promise.resolve([] as Reply[])),
    [roundId],
    [] as Reply[],
  );
  const analyzable = useMemo(
    () => roundReplies.filter((r) => r.scope === "round" && latestDoneAttempt(r) !== null),
    [roundReplies],
  );
  const participantProviderIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of analyzable) {
      const parsed = parsePanelSourceId(r.panelSourceId);
      if (parsed) set.add(parsed.providerId);
    }
    return set;
  }, [analyzable]);

  const judgeOptions = useMemo(
    () => listPanelOptions({ byoaSessionConfirmed }).filter((o) => o.available),
    [byoaSessionConfirmed],
  );
  const outsiders = judgeOptions.filter((o) => !participantProviderIds.has(o.providerId));
  const insiders = judgeOptions.filter((o) => participantProviderIds.has(o.providerId));

  const [judgeId, setJudgeId] = useState<string | null>(null);
  useEffect(() => {
    // default explícito (pedido de Juan): primero un juez FUERA del consejo si existe
    if (judgeId && judgeOptions.some((o) => o.panelSourceId === judgeId)) return;
    const preferred = outsiders[0] ?? insiders[0] ?? null;
    setJudgeId(preferred ? preferred.panelSourceId : null);
  }, [judgeOptions, outsiders, insiders, judgeId]);

  const judge: PanelOption | null = judgeOptions.find((o) => o.panelSourceId === judgeId) ?? null;
  const [judgeModelId, setJudgeModelId] = useState<string | null>(null);
  useEffect(() => {
    setJudgeModelId(judge ? judge.defaultModelId : null);
  }, [judgeId, judge]);

  const [kind, setKind] = useState<AnalysisKind>("compare");
  const [anonymized, setAnonymized] = useState(true); // Q30: default ON, el toggle sólo DESACTIVA
  const [phase, setPhase] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [abortFn, setAbortFn] = useState<(() => void) | null>(null);

  const analyses = useLiveQuery(
    () => (roundId ? db.roundAnalyses.where("roundId").equals(roundId).sortBy("createdAt") : Promise.resolve(EMPTY_ANALYSES)),
    [roundId],
    EMPTY_ANALYSES,
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const judgeIsParticipant = judge ? participantProviderIds.has(judge.providerId) : false;
  const judgeIsByoa = judge?.connectionMode === "byoa";
  const judgeOrgId = judge && judgeIsByoa ? byoaSelectedOrgIdByProvider[judge.providerId] : undefined;
  const minimum = kind === "compare" ? 2 : 1;
  const canRun =
    !!conversationId && !!selectedRound && !!judge && analyzable.length >= minimum && phase === null && (!judgeIsByoa || !!judgeOrgId);

  const handleRun = () => {
    if (!conversationId || !selectedRound || !judge || !judgeModelId) return;
    setRunError(null);
    const selection: JudgeSelection = {
      panelSourceId: judge.panelSourceId,
      providerId: judge.providerId,
    };
    if (!isAccountDefaultModel(judgeModelId)) selection.modelId = judgeModelId;
    if (judgeOrgId !== undefined) selection.orgId = judgeOrgId;

    const running = runRoundAnalysis({
      conversationId,
      round: selectedRound,
      kind,
      judge: selection,
      anonymized,
      onPhase: (p) => setPhase(p),
    });
    setAbortFn(() => running.abort);
    setPhase("preparando");
    running.done
      .then((result) => {
        if (result === null) setRunError("análisis cancelado — no se persistió nada");
        else setExpandedId(result.id);
      })
      .catch((e) => {
        const message = e instanceof Error ? e.message : String(e);
        console.warn("[chatcouncil:judge] análisis falló antes de despachar:", message);
        setRunError(message);
      })
      .finally(() => {
        setPhase(null);
        setAbortFn(null);
      });
  };

  return (
    <Section title="Comparar / Resumir">

      {!conversationId && <p className="text-[11px] text-text-secondary">Abre o crea una conversación primero.</p>}

      {conversationId && (
        <>
          <label className="flex flex-col gap-1 text-[11px] text-text-secondary">
            Round a analizar
            <Select
              value={roundId ?? ""}
              onChange={(e) => setRoundId(e.target.value || null)}
            >
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>
                  Round {r.index + 1} — {r.promptText.slice(0, 48)}
                  {r.promptText.length > 48 ? "…" : ""}
                </option>
              ))}
            </Select>
          </label>

          <div className="flex gap-3 text-[11px] text-text-secondary">
            {(["compare", "summarize"] as const).map((k) => (
              <label key={k} className="flex items-center gap-1">
                <input type="radio" checked={kind === k} onChange={() => setKind(k)} />
                {k === "compare" ? "Comparar (rúbrica v1)" : "Resumir"}
              </label>
            ))}
          </div>

          <label className="flex flex-col gap-1 text-[11px] text-text-secondary">
            Juez — sugerido: un proveedor FUERA de tu consejo (más neutral, evita auto-referencia)
            <Select
              value={judgeId ?? ""}
              onChange={(e) => setJudgeId(e.target.value || null)}
            >
              {outsiders.length > 0 && (
                <optgroup label="Fuera del consejo (recomendado)">
                  {outsiders.map((o) => (
                    <option key={o.panelSourceId} value={o.panelSourceId}>
                      {o.label} {o.connectionMode === "byoa" ? "· sesión" : "· llave"}
                    </option>
                  ))}
                </optgroup>
              )}
              {insiders.length > 0 && (
                <optgroup label="Participa del consejo ⚠ (riesgo de auto-preferencia)">
                  {insiders.map((o) => (
                    <option key={o.panelSourceId} value={o.panelSourceId}>
                      {o.label} {o.connectionMode === "byoa" ? "· sesión" : "· llave"}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          </label>

          {judge && judge.models.length > 0 && (
            <label className="flex flex-col gap-1 text-[11px] text-text-secondary">
              Modelo del juez
              <Select
                value={judgeModelId ?? ""}
                onChange={(e) => setJudgeModelId(e.target.value)}
              >
                {judge.models.map((m) => (
                  <option key={m.id} value={m.id} title={m.note ?? ""}>
                    {m.label}
                    {m.verified ? "" : " (sin verificar)"}
                  </option>
                ))}
              </Select>
            </label>
          )}

          {judgeIsParticipant && (
            <p className="flex items-start gap-1 text-[11px] text-warning">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                Este juez participa del consejo de este Round: aun anonimizado hay riesgo documentado de
                auto-preferencia. Queda registrado en el análisis.
              </span>
            </p>
          )}
          {judgeIsByoa && (
            <p className="text-[11px] text-text-secondary">
              Juez por sesión (BYOA): cada análisis crea una conversación nueva y visible en tu cuenta del proveedor,
              con las respuestas {anonymized ? "anonimizadas" : "SIN anonimizar"}.
            </p>
          )}
          {judgeIsByoa && !judgeOrgId && (
            <p className="text-[11px] text-danger">Elige una organización de sesión antes de usar este juez.</p>
          )}

          <label className="flex items-center gap-2 text-[11px] text-text-secondary">
            <input type="checkbox" checked={anonymized} onChange={(e) => setAnonymized(e.target.checked)} />
            Anonimizar respuestas ante el juez (default — Q30)
          </label>
          {!anonymized && (
            <p className="text-[11px] text-warning">
              Sin anonimizar, el juez ve qué proveedor escribió cada respuesta: el juicio deja de ser ciego. El
              análisis queda marcado.
            </p>
          )}

          {analyzable.length < minimum && selectedRound && (
            <p className="text-[11px] text-text-secondary">
              Este Round tiene {analyzable.length} respuesta(s) exitosa(s); {kind === "compare" ? "Comparar necesita ≥2" : "Resumir necesita ≥1"}.
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button variant="accent" size="md" disabled={!canRun} onClick={handleRun}>
              {phase ? `${phase}…` : "Correr análisis"}
            </Button>
            {phase && abortFn && (
              <Button onClick={() => abortFn()} className="rounded-md py-1.5">
                Cancelar
              </Button>
            )}
          </div>
          {runError && <p className="text-[11px] text-danger">{runError}</p>}

          {analyses.length > 0 && (
            <ul className="flex flex-col gap-1 border-t border-border pt-2">
              {analyses.map((a) => {
                const expanded = expandedId === a.id;
                const labelToPanel = new Map(a.labelMap.map((e) => [e.label, panelDisplayLabel(e.panelSourceId)] as const));
                return (
                  <li key={a.id} className="rounded border border-border p-2">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : a.id)}
                      className="flex w-full items-center justify-between gap-2 text-left text-[11px] text-text-primary"
                    >
                      <span className="flex min-w-0 items-center gap-1 truncate">
                        <StatusBadge a={a} /> {a.kind === "compare" ? "Comparar" : "Resumir"} · juez{" "}
                        {panelDisplayLabel(a.judgePanelSourceId)}
                        {a.judgeWasParticipant && <TriangleAlert size={12} className="shrink-0 text-warning" aria-label="juez participante" />}
                      </span>
                      <span className="shrink-0 text-text-secondary">
                        {new Date(a.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </button>
                    {expanded && (
                      <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2 text-[11px] text-text-primary">
                        <p className="text-text-secondary">
                          {a.anonymized ? "anonimizado (Q30)" : "SIN anonimizar"} ·{" "}
                          {a.judgeWasParticipant ? "juez participante" : "juez fuera del consejo"}
                          {a.judgeWasParticipant && <TriangleAlert size={11} className="ml-1 inline text-warning" aria-hidden />}
                          {a.judgeModelId ? ` · ${a.judgeModelId}` : ""}
                          {a.latencyMs !== undefined ? ` · ${(a.latencyMs / 1000).toFixed(1)}s` : ""}
                        </p>
                        {a.redactions.length > 0 && (
                          <p className="text-text-secondary">
                            Redacciones por anonimización: {a.redactions.map((r) => `${r.label}×${r.count}`).join(", ")}
                          </p>
                        )}
                        {a.status === "error" && <p className="text-danger">El juez falló: {a.errorMessage}</p>}
                        {a.status === "parse_error" && (
                          <>
                            <p className="text-warning">Respuesta no parseable ({a.errorMessage}) — raw conservado:</p>
                            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-bg-base p-2 font-mono text-[10px]">
                              {a.rawResponse}
                            </pre>
                          </>
                        )}
                        {a.compare && (
                          <>
                            <p className="italic">{a.compare.veredicto}</p>
                            {a.compare.porRespuesta.map((e) => (
                              <div key={e.label} className="rounded border border-border p-1.5">
                                <p className="font-semibold">
                                  {e.label}
                                  {labelToPanel.has(e.label) ? ` → ${labelToPanel.get(e.label)}` : ""}
                                </p>
                                <p>
                                  corrección factual {e.correccionFactual.score}/5 — {e.correccionFactual.nota}
                                </p>
                                <p>
                                  profundidad {e.profundidad.score}/5 — {e.profundidad.nota}
                                </p>
                                <p>sesgo: {e.senalesSesgo}</p>
                                <p>tono: {e.tono}</p>
                              </div>
                            ))}
                          </>
                        )}
                        {a.summarize && (
                          <>
                            <p>{a.summarize.resumen}</p>
                            {a.summarize.coincidencias.length > 0 && (
                              <p className="text-text-secondary">Coincidencias: {a.summarize.coincidencias.join(" · ")}</p>
                            )}
                            {a.summarize.divergencias.length > 0 && (
                              <p className="text-text-secondary">Divergencias: {a.summarize.divergencias.join(" · ")}</p>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}
