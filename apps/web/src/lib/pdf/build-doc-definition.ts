import type { Content, ContentText, CustomTableLayout, Node, NodeQueries, TDocumentDefinitions } from "pdfmake/interfaces";
import type { LoadedConversation } from "../conversation-repo";
import type { Attempt, Reply, RoundAnalysis } from "../db";

/**
 * docDefinition del PDF unificado — ChatCouncil Fase 5 (Q28)
 * ------------------------------------------------------------------
 * PURO: recibe datos ya cargados y produce el objeto declarativo de
 * pdfmake. El MISMO builder alimenta el export del navegador
 * (export-conversation.ts, import dinámico) y el harness de aceptación
 * en Node — la fidelidad del layout verificado es por construcción.
 *
 * Política de saltos de página ("no cortar contenido a mitad de página
 * de forma arbitraria", criterio de la fase):
 *  · un rótulo (de Round o de respuesta) JAMÁS queda como último nodo
 *    de una página — receta pageBreakBefore + headlineLevel
 *  · la fila de metadatos nunca se parte (dontBreakRows)
 *  · el CUERPO largo sí fluye entre páginas: con 6 paneles es
 *    inevitable y es lo correcto; "arbitrario" es separar rótulo de
 *    contenido, no paginar texto largo.
 *
 * Tipografía: pdfmake embebe SOLO Roboto (vfs de fábrica). Los code
 * fences se renderizan en caja gris con espacios preservados pero en
 * Roboto — embeber una mono real es peso+licencia y pertenece al
 * pulido de Fase 7. El PDF es CLARO a propósito (el tema oscuro no se
 * imprime — decisión heredada de la sección de diseño).
 */

export interface PdfBuildInput {
  loaded: LoadedConversation;
  analysesByRoundId: Map<string, RoundAnalysis[]>;
  panelLabel: (panelSourceId: string) => string;
  exportedAt: Date;
}

const INK = "#1a1a1a";
const MUTED = "#6b6b6b";
const RULE = "#d9d9d9";
const CODE_BG = "#f2f2f2";
const ACCENT = "#0d7f8c"; // el cian del tema, oscurecido para papel

const HEADLINE = { round: 1, reply: 2 } as const;

export function latestAttempt(reply: Reply): Attempt | null {
  const done = [...reply.attempts].reverse().find((a) => a.status === "done");
  return done ?? reply.attempts[reply.attempts.length - 1] ?? null;
}

export function fmtDate(ts: number | Date): string {
  const d = typeof ts === "number" ? new Date(ts) : ts;
  return d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

export function fmtLatency(a: Attempt | null): string {
  return a?.latencyMs !== undefined ? `${(a.latencyMs / 1000).toFixed(1)}s` : "—";
}

export function fmtTokens(a: Attempt | null): string {
  if (!a) return "—";
  const tin = a.tokensIn !== undefined ? String(a.tokensIn) : "?";
  const tout = a.tokensOut !== undefined ? String(a.tokensOut) : "?";
  return a.tokensIn === undefined && a.tokensOut === undefined ? "—" : `${tin}/${tout}`;
}

/** Divide en segmentos texto/código por fences ``` para render diferenciado. */
export function splitCodeFences(text: string): { kind: "text" | "code"; value: string }[] {
  const out: { kind: "text" | "code"; value: string }[] = [];
  const re = /```[^\n]*\n?([\s\S]*?)```/g;
  let cursor = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > cursor) out.push({ kind: "text", value: text.slice(cursor, idx) });
    out.push({ kind: "code", value: m[1] ?? "" });
    cursor = idx + m[0].length;
  }
  if (cursor < text.length) out.push({ kind: "text", value: text.slice(cursor) });
  return out.filter((s) => s.value.trim().length > 0);
}

function bodyContent(text: string): Content[] {
  if (!text.trim()) return [{ text: "(respuesta vacía)", style: "muted" }];
  return splitCodeFences(text).map((seg) =>
    seg.kind === "code"
      ? {
          table: { widths: ["*"], body: [[{ text: seg.value.replace(/\s+$/, ""), style: "code", preserveLeadingSpaces: true }]] },
          layout: "codeBox" as unknown as CustomTableLayout,
          margin: [0, 4, 0, 8] as [number, number, number, number],
        }
      : { text: seg.value.trim(), style: "body" },
  );
}

/** Rótulo de respuesta — string EXACTO también usado por la heurística anti-huérfanos del harness. */
export function replyHeaderText(panelLabelText: string, modelId: string): string {
  return `— ${panelLabelText} · ${modelId}`;
}

export function roundHeaderText(index: number, createdAt: number): string {
  return `Round ${index + 1} · ${fmtDate(createdAt)}`;
}

function replyBlock(reply: Reply, input: PdfBuildInput, headerOverride?: string, noteAfterHeader?: string): Content[] {
  const attempt = latestAttempt(reply);
  const header = headerOverride ?? replyHeaderText(input.panelLabel(reply.panelSourceId), reply.modelId);
  const statusNote =
    attempt && attempt.status !== "done" ? ` (último intento: ${attempt.status}${attempt.errorMessage ? ` — ${attempt.errorMessage}` : ""})` : "";
  const head: ContentText = {
    text: header + statusNote,
    style: "replyHeader",
    headlineLevel: HEADLINE.reply,
    margin: [0, 10, 0, 3],
  };
  const note = noteAfterHeader ? [{ text: noteAfterHeader, style: "prompt" } satisfies Content] : [];
  const retries =
    reply.attempts.length > 1
      ? [{ text: `${reply.attempts.length} intentos registrados (Q15) — se muestra el último exitoso.`, style: "muted" } satisfies Content]
      : [];
  return [head, ...note, ...retries, ...bodyContent(attempt?.content ?? "")];
}

function metadataTable(replies: Reply[], input: PdfBuildInput): Content {
  const rows = replies.map((r) => {
    const a = latestAttempt(r);
    return [
      { text: input.panelLabel(r.panelSourceId), style: "cell" },
      { text: r.modelId, style: "cell" },
      { text: r.connectionMode.toUpperCase(), style: "cell" },
      { text: fmtLatency(a), style: "cellRight" },
      { text: fmtTokens(a), style: "cellRight" },
      { text: a?.status ?? "—", style: "cell" },
    ];
  });
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: ["*", "*", 34, 40, 50, 44],
      body: [
        ["Panel", "Modelo", "Vía", "Latencia", "Tokens", "Estado"].map((t) => ({ text: t, style: "th" })),
        ...rows,
      ],
    },
    layout: "metaGrid" as unknown as CustomTableLayout,
    margin: [0, 6, 0, 4] as [number, number, number, number],
  };
}

function analysisBlock(analysis: RoundAnalysis, input: PdfBuildInput): Content[] {
  const labelToPanel = new Map(analysis.labelMap.map((e) => [e.label, input.panelLabel(e.panelSourceId)] as const));
  const title = `Análisis · ${analysis.kind === "compare" ? "Comparar" : "Resumir"} · juez: ${input.panelLabel(analysis.judgePanelSourceId)}${
    analysis.judgeModelId ? ` (${analysis.judgeModelId})` : ""
  }`;
  const flags = [
    analysis.anonymized ? "anonimizado (Q30)" : "SIN anonimizar (toggle desactivado)",
    analysis.judgeWasParticipant ? "el juez participa del consejo (!)" : "juez fuera del consejo",
    ...(analysis.redactions.length > 0
      ? [`redacciones: ${analysis.redactions.map((r) => `${r.label}×${r.count}`).join(", ")}`]
      : []),
  ].join(" · ");

  const head: Content[] = [
    { text: title, style: "replyHeader", headlineLevel: HEADLINE.reply, margin: [0, 12, 0, 2] },
    { text: `${fmtDate(analysis.createdAt)} · ${flags}`, style: "muted" },
  ];

  if (analysis.status === "error") {
    return [...head, { text: `El juez falló: ${analysis.errorMessage ?? "(sin detalle)"}`, style: "body" }];
  }
  if (analysis.status === "parse_error" || (!analysis.compare && !analysis.summarize)) {
    return [
      ...head,
      { text: `Respuesta no parseable (${analysis.errorMessage ?? "sin detalle"}) — raw conservado:`, style: "muted" },
      { text: analysis.rawResponse.trim() || "(vacío)", style: "code", margin: [0, 2, 0, 6] },
    ];
  }
  if (analysis.summarize) {
    const s = analysis.summarize;
    return [
      ...head,
      { text: s.resumen, style: "body" },
      ...(s.coincidencias.length > 0 ? [{ text: `Coincidencias: ${s.coincidencias.join(" · ")}`, style: "body" } as Content] : []),
      ...(s.divergencias.length > 0 ? [{ text: `Divergencias: ${s.divergencias.join(" · ")}`, style: "body" } as Content] : []),
    ];
  }
  const c = analysis.compare!;
  const rubricRows = c.porRespuesta.map((e) => [
    { text: `${e.label}${labelToPanel.has(e.label) ? ` -> ${labelToPanel.get(e.label)}` : ""}`, style: "cell" },
    { text: `${e.correccionFactual.score}/5 ${e.correccionFactual.nota}`, style: "cell" },
    { text: `${e.profundidad.score}/5 ${e.profundidad.nota}`, style: "cell" },
    { text: e.senalesSesgo, style: "cell" },
    { text: e.tono, style: "cell" },
  ]);
  return [
    ...head,
    { text: c.veredicto, style: "body" },
    {
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: ["*", "*", "*", "*", "*"],
        body: [["Respuesta", "Corrección factual", "Profundidad", "Señales de sesgo", "Tono"].map((t) => ({ text: t, style: "th" })), ...rubricRows],
      },
      layout: "metaGrid" as unknown as CustomTableLayout,
      margin: [0, 4, 0, 6] as [number, number, number, number],
    },
  ];
}

/**
 * Anti-huérfanos (firma REAL de pdfmake 0.3, capturada de
 * @types/pdfmake 0.3.3 el 2026-07-11: el 2.º argumento es un objeto
 * NodeQueries, NO el array posicional de la línea 0.2 — la versión
 * 0.2-style tipa mal Y es un no-op silencioso en runtime). Exportada
 * con nombre para que el harness la asevere contra el shape real.
 */
export function orphanPageBreakBefore(currentNode: Node, nodeQueries: NodeQueries): boolean {
  return currentNode.headlineLevel !== undefined && nodeQueries.getFollowingNodesOnPage().length === 0;
}

export function buildDocDefinition(input: PdfBuildInput): TDocumentDefinitions {
  const { loaded } = input;
  const content: Content[] = [
    { text: loaded.conversation.title, style: "docTitle" },
    {
      text: `${loaded.rounds.length} round(s) · ${loaded.conversation.lockedModelIds.length} panel(es) · creada ${fmtDate(
        loaded.conversation.createdAt,
      )}`,
      style: "muted",
      margin: [0, 0, 0, 10],
    },
  ];

  for (const round of loaded.rounds) {
    const replies = loaded.repliesByRoundId.get(round.id) ?? [];
    const continued = [...loaded.panelContinuedByPanelSourceId.values()].flat().filter((r) => r.roundId === round.id);

    content.push({ text: roundHeaderText(round.index, round.createdAt), style: "roundHeader", headlineLevel: HEADLINE.round, margin: [0, 16, 0, 2] });
    content.push({ text: round.promptText, style: "prompt" });
    if (round.toggles.webSearch || round.toggles.imageGeneration) {
      content.push({
        text: `Toggles del Round: ${[round.toggles.webSearch ? "búsqueda web" : null, round.toggles.imageGeneration ? "imagen" : null]
          .filter(Boolean)
          .join(", ")}`,
        style: "muted",
      });
    }
    if (replies.length > 0) content.push(metadataTable(replies, input));
    for (const reply of replies) content.push(...replyBlock(reply, input));
    for (const reply of continued) {
      const head = `— Follow-up (solo ${input.panelLabel(reply.panelSourceId)}) · ${reply.modelId}`;
      content.push(...replyBlock(reply, input, head, reply.followUpPrompt ? `» ${reply.followUpPrompt}` : undefined));
    }
    for (const analysis of input.analysesByRoundId.get(round.id) ?? []) {
      content.push(...analysisBlock(analysis, input));
    }
  }

  return {
    content,
    pageSize: "A4",
    pageMargins: [42, 56, 42, 52],
    defaultStyle: { fontSize: 10, color: INK, lineHeight: 1.25 },
    info: { title: `ChatCouncil — ${loaded.conversation.title}` },
    header: () => ({
      columns: [
        { text: "ChatCouncil", style: "wordmark" }, // wordmark de texto — placeholder hasta el branding de Fase 7 (Q28)
        { text: loaded.conversation.title, alignment: "right", style: "muted" },
      ],
      margin: [42, 20, 42, 0],
    }),
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: `exportado ${fmtDate(input.exportedAt)}`, style: "muted" },
        { text: `pág. ${currentPage}/${pageCount}`, alignment: "right", style: "muted" },
      ],
      margin: [42, 8, 42, 0],
    }),
    // Receta anti-huérfanos: un rótulo nunca cierra página.
    pageBreakBefore: orphanPageBreakBefore,
    styles: {
      wordmark: { fontSize: 11, bold: true, color: ACCENT, characterSpacing: 1 },
      docTitle: { fontSize: 17, bold: true, margin: [0, 0, 0, 2] },
      roundHeader: { fontSize: 13, bold: true, color: ACCENT },
      prompt: { fontSize: 10.5, italics: true, color: INK, margin: [0, 2, 0, 2] },
      replyHeader: { fontSize: 11, bold: true },
      body: { margin: [0, 2, 0, 6] },
      code: { fontSize: 8.5, color: INK },
      muted: { fontSize: 8.5, color: MUTED },
      th: { fontSize: 8.5, bold: true, color: MUTED },
      cell: { fontSize: 8.5 },
      cellRight: { fontSize: 8.5, alignment: "right" },
    },
    // Layouts custom se registran en el renderer (export-conversation / harness).
  };
}

/** Layouts de tabla compartidos por ambos renderers (browser y harness). */
export const PDF_TABLE_LAYOUTS = {
  metaGrid: {
    hLineWidth: () => 0.5,
    vLineWidth: () => 0,
    hLineColor: () => RULE,
    paddingLeft: () => 4,
    paddingRight: () => 4,
    paddingTop: () => 3,
    paddingBottom: () => 3,
  },
  codeBox: {
    hLineWidth: () => 0,
    vLineWidth: () => 0,
    fillColor: () => CODE_BG,
    paddingLeft: () => 8,
    paddingRight: () => 8,
    paddingTop: () => 6,
    paddingBottom: () => 6,
  },
} as const;
