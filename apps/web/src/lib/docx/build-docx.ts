import { printColors } from "@chatcouncil/ui";
import {
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TabStopPosition,
  TabStopType,
  TextRun,
  WidthType,
} from "docx";
import type { Reply, RoundAnalysis } from "../db";
import {
  fmtDate,
  fmtLatency,
  fmtTokens,
  latestAttempt,
  replyHeaderText,
  roundHeaderText,
  splitCodeFences,
  type PdfBuildInput,
} from "../pdf/build-doc-definition";

/**
 * Documento DOCX del informe — Fase 5, adición 2026-07-16 (D2)
 * ------------------------------------------------------------------
 * PURO: mismo contrato que buildDocDefinition (recibe datos cargados,
 * produce el objeto declarativo) y consume EL MISMO tipo de input y
 * los MISMOS strings de rótulo/metadatos exportados por el builder de
 * PDF — un solo vocabulario entre formatos, la divergencia de
 * contenido es imposible por construcción. Lo alimentan el export del
 * navegador (export-conversation-docx.ts, import dinámico: `docx`
 * pesa y va en chunk propio como pdfmake) y el harness en Node.
 *
 * Por qué DOCX además del PDF (pedido de Juan): las tablas (metadatos
 * por Round y rúbrica del juez) son Table reales de Word → se copian
 * y pegan a Excel/Sheets/otro doc. Bonus sobre el PDF: acá los code
 * fences van en Consolas (mono real — sin el límite del vfs de
 * pdfmake; embeber mono en el PDF quedó fuera del alcance final de F7).
 */

export type ReportBuildInput = PdfBuildInput;

// Fase 7 E4/E5: cero hexes locales — paleta de impresión desde
// @chatcouncil/ui. docx quiere hex SIN "#"; HEADER_BG se unifica con
// codeBg (antes EFEFEF ≈ F2F2F2: diferencia imperceptible, una fuente
// menos que mantener — registrado en el ledger §0.10).
const strip = (hex: string): string => hex.slice(1).toUpperCase();
const INK = strip(printColors.ink);
const MUTED = strip(printColors.muted);
const RULE = strip(printColors.rule);
const CODE_BG = strip(printColors.codeBg);
const HEADER_BG = strip(printColors.codeBg);
const ACCENT = strip(printColors.accent);

// tamaños en half-points (21 = 10.5pt)
const SZ = { title: 34, round: 26, reply: 22, prompt: 21, body: 20, small: 17 } as const;

type HeadingValue = (typeof HeadingLevel)[keyof typeof HeadingLevel];
type Block = Paragraph | Table;

interface RunOpts {
  bold?: boolean;
  italics?: boolean;
  color?: string;
  size?: number;
  font?: string;
}

/** Texto multilínea → runs con break (TextRun no renderiza \n solo). */
function runs(text: string, opts: RunOpts = {}): TextRun[] {
  return text.split("\n").map(
    (ln, i) =>
      new TextRun({
        text: ln,
        break: i > 0 ? 1 : undefined,
        color: opts.color ?? INK,
        size: opts.size ?? SZ.body,
        bold: opts.bold,
        italics: opts.italics,
        font: opts.font,
      }),
  );
}

function para(
  text: string,
  opts: RunOpts = {},
  pOpts: { heading?: HeadingValue; before?: number; after?: number } = {},
): Paragraph {
  return new Paragraph({
    heading: pOpts.heading,
    spacing: { before: pOpts.before, after: pOpts.after },
    children: runs(text, opts),
  });
}

const line = (style: (typeof BorderStyle)[keyof typeof BorderStyle], size: number) => ({ style, size, color: RULE });
/** Como el metaGrid del PDF: sólo líneas horizontales. */
const TABLE_BORDERS = {
  top: line(BorderStyle.SINGLE, 4),
  bottom: line(BorderStyle.SINGLE, 4),
  insideHorizontal: line(BorderStyle.SINGLE, 4),
  left: line(BorderStyle.NONE, 0),
  right: line(BorderStyle.NONE, 0),
  insideVertical: line(BorderStyle.NONE, 0),
};
const NO_BORDERS = {
  top: line(BorderStyle.NONE, 0),
  bottom: line(BorderStyle.NONE, 0),
  insideHorizontal: line(BorderStyle.NONE, 0),
  left: line(BorderStyle.NONE, 0),
  right: line(BorderStyle.NONE, 0),
  insideVertical: line(BorderStyle.NONE, 0),
};

function cell(text: string, widthPct: number, opts: { header?: boolean } = {}): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    shading: opts.header ? { fill: HEADER_BG } : undefined,
    margins: { top: 40, bottom: 40, left: 70, right: 70 },
    children: [
      new Paragraph({
        children: runs(text, { size: SZ.small, bold: opts.header, color: opts.header ? MUTED : INK }),
      }),
    ],
  });
}

function metadataTable(replies: Reply[], input: ReportBuildInput): Table {
  const widths = [22, 26, 10, 12, 14, 16];
  const header = new TableRow({
    tableHeader: true,
    children: ["Panel", "Modelo", "Vía", "Latencia", "Tokens", "Estado"].map((t, i) => cell(t, widths[i]!, { header: true })),
  });
  const rows = replies.map((r) => {
    const a = latestAttempt(r);
    const cells = [input.panelLabel(r.panelSourceId), r.modelId, r.connectionMode.toUpperCase(), fmtLatency(a), fmtTokens(a), a?.status ?? "—"];
    return new TableRow({ cantSplit: true, children: cells.map((t, i) => cell(t, widths[i]!)) });
  });
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS, rows: [header, ...rows] });
}

/** Caja gris con Consolas — la mono REAL que el PDF no tiene (vfs). */
function codeBlock(value: string): Table {
  const lines = value.replace(/\s+$/, "").split("\n");
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: CODE_BG },
            margins: { top: 90, bottom: 90, left: 140, right: 140 },
            children: lines.map(
              (ln) =>
                new Paragraph({
                  children: [new TextRun({ text: ln.length > 0 ? ln : " ", font: "Consolas", size: SZ.small, color: INK })],
                }),
            ),
          }),
        ],
      }),
    ],
  });
}

function bodyBlocks(text: string): Block[] {
  if (!text.trim()) return [para("(respuesta vacía)", { color: MUTED, size: SZ.small })];
  return splitCodeFences(text).map((seg) =>
    seg.kind === "code" ? codeBlock(seg.value) : para(seg.value.trim(), {}, { after: 120 }),
  );
}

function replyBlocks(reply: Reply, input: ReportBuildInput, headerOverride?: string, noteAfterHeader?: string): Block[] {
  const attempt = latestAttempt(reply);
  const header = headerOverride ?? replyHeaderText(input.panelLabel(reply.panelSourceId), reply.modelId);
  const statusNote =
    attempt && attempt.status !== "done" ? ` (último intento: ${attempt.status}${attempt.errorMessage ? ` — ${attempt.errorMessage}` : ""})` : "";
  const out: Block[] = [
    para(header + statusNote, { bold: true, size: SZ.reply }, { heading: HeadingLevel.HEADING_2, before: 200, after: 60 }),
  ];
  if (noteAfterHeader) out.push(para(noteAfterHeader, { italics: true, size: SZ.prompt }));
  if (reply.attempts.length > 1) {
    out.push(para(`${reply.attempts.length} intentos registrados (Q15) — se muestra el último exitoso.`, { color: MUTED, size: SZ.small }));
  }
  out.push(...bodyBlocks(attempt?.content ?? ""));
  return out;
}

function analysisBlocks(analysis: RoundAnalysis, input: ReportBuildInput): Block[] {
  const labelToPanel = new Map(analysis.labelMap.map((e) => [e.label, input.panelLabel(e.panelSourceId)] as const));
  const title = `Análisis · ${analysis.kind === "compare" ? "Comparar" : "Resumir"} · juez: ${input.panelLabel(analysis.judgePanelSourceId)}${
    analysis.judgeModelId ? ` (${analysis.judgeModelId})` : ""
  }`;
  const flags = [
    analysis.anonymized ? "anonimizado (Q30)" : "SIN anonimizar (toggle desactivado)",
    analysis.judgeWasParticipant ? "el juez participa del consejo (!)" : "juez fuera del consejo",
    ...(analysis.redactions.length > 0 ? [`redacciones: ${analysis.redactions.map((r) => `${r.label}×${r.count}`).join(", ")}`] : []),
  ].join(" · ");

  const out: Block[] = [
    para(title, { bold: true, size: SZ.reply }, { heading: HeadingLevel.HEADING_2, before: 240, after: 40 }),
    para(`${fmtDate(analysis.createdAt)} · ${flags}`, { color: MUTED, size: SZ.small }),
  ];

  if (analysis.status === "error") {
    out.push(para(`El juez falló: ${analysis.errorMessage ?? "(sin detalle)"}`));
    return out;
  }
  if (analysis.status === "parse_error" || (!analysis.compare && !analysis.summarize)) {
    out.push(para(`Respuesta no parseable (${analysis.errorMessage ?? "sin detalle"}) — raw conservado:`, { color: MUTED, size: SZ.small }));
    out.push(codeBlock(analysis.rawResponse.trim() || "(vacío)"));
    return out;
  }
  if (analysis.summarize) {
    const s = analysis.summarize;
    out.push(para(s.resumen));
    if (s.coincidencias.length > 0) out.push(para(`Coincidencias: ${s.coincidencias.join(" · ")}`));
    if (s.divergencias.length > 0) out.push(para(`Divergencias: ${s.divergencias.join(" · ")}`));
    return out;
  }
  const c = analysis.compare!;
  out.push(para(c.veredicto));
  const w = [20, 20, 20, 20, 20];
  const header = new TableRow({
    tableHeader: true,
    children: ["Respuesta", "Corrección factual", "Profundidad", "Señales de sesgo", "Tono"].map((t, i) => cell(t, w[i]!, { header: true })),
  });
  const rows = c.porRespuesta.map((e) => {
    const cells = [
      `${e.label}${labelToPanel.has(e.label) ? ` -> ${labelToPanel.get(e.label)}` : ""}`,
      `${e.correccionFactual.score}/5 ${e.correccionFactual.nota}`,
      `${e.profundidad.score}/5 ${e.profundidad.nota}`,
      e.senalesSesgo,
      e.tono,
    ];
    return new TableRow({ cantSplit: true, children: cells.map((t, i) => cell(t, w[i]!)) });
  });
  out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: TABLE_BORDERS, rows: [header, ...rows] }));
  return out;
}

export function buildDocxDocument(input: ReportBuildInput): Document {
  const { loaded } = input;
  const children: Block[] = [
    para(loaded.conversation.title, { bold: true, size: SZ.title }, { heading: HeadingLevel.HEADING_1, after: 40 }),
    para(
      `${loaded.rounds.length} round(s) · ${loaded.conversation.lockedModelIds.length} panel(es) · creada ${fmtDate(loaded.conversation.createdAt)}`,
      { color: MUTED, size: SZ.small },
      { after: 200 },
    ),
  ];

  for (const round of loaded.rounds) {
    const replies = loaded.repliesByRoundId.get(round.id) ?? [];
    const continued = [...loaded.panelContinuedByPanelSourceId.values()].flat().filter((r) => r.roundId === round.id);

    children.push(
      para(roundHeaderText(round.index, round.createdAt), { bold: true, color: ACCENT, size: SZ.round }, { heading: HeadingLevel.HEADING_1, before: 320, after: 40 }),
    );
    children.push(para(round.promptText, { italics: true, size: SZ.prompt }, { after: 60 }));
    if (round.toggles.webSearch || round.toggles.imageGeneration) {
      children.push(
        para(
          `Toggles del Round: ${[round.toggles.webSearch ? "búsqueda web" : null, round.toggles.imageGeneration ? "imagen" : null]
            .filter(Boolean)
            .join(", ")}`,
          { color: MUTED, size: SZ.small },
        ),
      );
    }
    if (replies.length > 0) children.push(metadataTable(replies, input));
    for (const reply of replies) children.push(...replyBlocks(reply, input));
    for (const reply of continued) {
      const head = `— Follow-up (solo ${input.panelLabel(reply.panelSourceId)}) · ${reply.modelId}`;
      children.push(...replyBlocks(reply, input, head, reply.followUpPrompt ? `» ${reply.followUpPrompt}` : undefined));
    }
    for (const analysis of input.analysesByRoundId.get(round.id) ?? []) {
      children.push(...analysisBlocks(analysis, input));
    }
  }

  const tabRight = { tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }] };

  return new Document({
    creator: "ChatCouncil",
    title: `ChatCouncil — ${loaded.conversation.title}`,
    styles: { default: { document: { run: { font: "Calibri", size: SZ.body, color: INK } } } },
    sections: [
      {
        properties: {},
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                ...tabRight,
                children: [
                  // wordmark de texto — placeholder hasta el branding de Fase 7 (Q28)
                  new TextRun({ text: "ChatCouncil", bold: true, color: ACCENT, size: SZ.reply }),
                  new TextRun({ text: `\t${loaded.conversation.title}`, color: MUTED, size: SZ.small }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                ...tabRight,
                children: [
                  new TextRun({ text: `exportado ${fmtDate(input.exportedAt)}`, color: MUTED, size: SZ.small }),
                  new TextRun({ children: ["\t", "pág. ", PageNumber.CURRENT, "/", PageNumber.TOTAL_PAGES], color: MUTED, size: SZ.small }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}
