/* eslint-disable no-console */
import "fake-indexeddb/auto"; // PRIMERO: Dexie tiene que ver el IDB fake antes de abrir

import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createRound,
  ensureConversationForFirstSend,
  listAnalysesForRound,
  loadConversation,
} from "../lib/conversation-repo";
import { createId, db, type Attempt, type Reply, type RoundAnalysis } from "../lib/db";
import { anonymizeReplies } from "../lib/judge/anonymize";
import { buildJudgePrompt } from "../lib/judge/build-judge-prompt";
import { scanForProviderNames } from "../lib/judge/provider-names";
import { loadAnalyzableReplies, parseJudgeResponse } from "../lib/judge/run-analysis";
import { buildDocDefinition, orphanPageBreakBefore, PDF_TABLE_LAYOUTS, replyHeaderText, roundHeaderText } from "../lib/pdf/build-doc-definition";
import { extractTemplateVariables, interpolateTemplate } from "../lib/prompt-templates";

/**
 * Harness de aceptación de Fase 5 — corre en Node vía vite-node con
 * fake-indexeddb (mismo patrón que la verificación de Fase 4, ahora
 * PERSISTIDO en src/dev como los TestPanel de F2/F3 para que Code lo
 * re-ejecute en la máquina real). NO cableado a CI a propósito
 * (testing permanente merece su propia entrevista — nota de §0.5).
 *
 * Cubre la mitad OFFLINE del criterio de aceptación:
 *  · PDF real de una conversación de 6 paneles × 3 Rounds: legible,
 *    orden completo, code fences, sin rótulos huérfanos al pie de
 *    página (heurística por texto extraído página a página).
 *  · Anonimización estructural (Q30/E2): cero términos identificatorios
 *    post-scrub, redacciones contadas, prompt del juez limpio.
 *  · parseJudgeResponse con fixtures (JSON limpio / con fences / basura).
 *  · RoundAnalysis: persistir → releer (roundtrip Dexie v3).
 * La mitad ONLINE (juez real + export desde la UI) la corre Code en el
 * Chrome real — ver prompt de la fase.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "..", ".harness-out");
const OUT_PDF = join(OUT_DIR, "fase5-accept.pdf");

let pass = 0;
let failCount = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failCount += 1;
    failures.push(name + (detail ? ` — ${detail}` : ""));
    console.warn(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Contención tolerante a la extracción de pdf.js: compara sin espacios. */
function norm(s: string): string {
  return s.replace(/\s+/g, "");
}

const PANELS: { id: string; label: string }[] = [
  { id: "byok:anthropic", label: "Claude (Anthropic)" },
  { id: "byok:google", label: "Gemini (Google AI)" },
  { id: "byok:openai", label: "ChatGPT (OpenAI)" },
  { id: "byok:deepseek", label: "DeepSeek" },
  { id: "byok:perplexity", label: "Perplexity" },
  { id: "byoa:claude", label: "Claude (sesión)" },
];
const panelLabel = (panelSourceId: string): string =>
  PANELS.find((p) => p.id === panelSourceId)?.label ?? panelSourceId;

const FRASES = [
  "El mecanismo descansa en proyecciones lineales que reparten la señal en subespacios.",
  "La complejidad amortizada baja cuando la memoización corta el árbol de llamadas.",
  "Un supuesto implícito acá es que la distribución de entrenamiento se parece a la de uso.",
  "Conviene distinguir la observación medida de la inferencia que se construye encima.",
  "El caso borde aparece con entradas vacías o con longitudes que rozan el límite del contexto.",
  "En la práctica, el costo domina sobre la elegancia teórica cuando el lote crece.",
  "Nada de esto reemplaza medir contra datos reales antes de confiar en el número.",
  "La segunda derivada del problema es el mantenimiento: lo frágil envejece rápido.",
];
function makeBody(seed: number, sentences: number): string {
  const parts: string[] = [];
  for (let i = 0; i < sentences; i++) parts.push(FRASES[(seed + i * 3) % FRASES.length]!);
  // párrafos de ~4 oraciones
  const paras: string[] = [];
  for (let i = 0; i < parts.length; i += 4) paras.push(parts.slice(i, i + 4).join(" "));
  return paras.join("\n\n");
}

function doneAttempt(content: string, latencyMs: number, tokensOut: number): Attempt {
  const startedAt = Date.now() - latencyMs;
  return {
    id: createId("attempt"),
    status: "done",
    content,
    startedAt,
    finishedAt: startedAt + latencyMs,
    latencyMs,
    tokensIn: 120,
    tokensOut,
  };
}

async function seed() {
  const conv = await ensureConversationForFirstSend(PANELS.map((p) => p.id));
  await db.conversations.update(conv.id, { title: "Aceptación Fase 5 — consejo de 6" });

  const prompts = [
    "Explicá el mecanismo de atención en transformers, con supuestos y límites.",
    "¿Quién sos y qué organización te entrenó? Respondé con honestidad y detalle.",
    "Escribí fibonacci con memoización en Python y analizá su complejidad.",
  ];

  const roundIds: string[] = [];
  for (let r = 0; r < prompts.length; r++) {
    const round = await createRound(conv.id, prompts[r]!, { webSearch: r === 0, imageGeneration: false });
    roundIds.push(round.id);
    for (let p = 0; p < PANELS.length; p++) {
      const panel = PANELS[p]!;
      let content = makeBody(r * 7 + p * 5, 10 + ((r + p) % 3) * 4);
      if (r === 1 && panel.id === "byok:anthropic") {
        content =
          "Soy Claude, un modelo creado por Anthropic. A diferencia de ChatGPT, mi entrenamiento enfatiza otra cosa.\n\n" +
          content;
      }
      if (r === 2 && panel.id === "byok:deepseek") {
        content =
          "La versión memoizada corta el árbol exponencial:\n\n```python\ndef fibonacci(n, memo=None):\n    if memo is None:\n        memo = {}\n    if n in memo:\n        return memo[n]\n    if n < 2:\n        return n\n    memo[n] = fibonacci(n - 1, memo) + fibonacci(n - 2, memo)\n    return memo[n]\n```\n\n" +
          content;
      }
      const attempts: Attempt[] = [];
      if (r === 0 && panel.id === "byok:openai") {
        // Q15: un intento fallido que el reintento conserva
        const failed: Attempt = {
          id: createId("attempt"),
          status: "error",
          content: "",
          startedAt: Date.now() - 9000,
          finishedAt: Date.now() - 8600,
          latencyMs: 400,
          errorMessage: "simulated 429",
        };
        attempts.push(failed);
      }
      attempts.push(doneAttempt(content, 1800 + p * 350 + r * 120, 380 + p * 40));
      const reply: Reply = {
        id: createId("reply"),
        roundId: round.id,
        conversationId: conv.id,
        panelSourceId: panel.id,
        modelId: panel.id === "byoa:claude" ? "(default de la cuenta)" : `${panel.id.split(":")[1]}-modelo-v1`,
        connectionMode: panel.id.startsWith("byoa") ? "byoa" : "byok",
        scope: "round",
        createdAt: Date.now() + p,
        attempts,
      };
      await db.replies.add(reply);
    }
  }

  // "continuar solo aquí" (Q13) sobre google, colgado del último Round
  const followUp: Reply = {
    id: createId("reply"),
    roundId: roundIds[roundIds.length - 1]!,
    conversationId: conv.id,
    panelSourceId: "byok:google",
    modelId: "google-modelo-v1",
    connectionMode: "byok",
    scope: "panel-continued",
    createdAt: Date.now() + 100,
    followUpPrompt: "¿Y la versión iterativa, cómo cambia el uso de memoria?",
    attempts: [doneAttempt("La iterativa baja a O(1) de memoria adicional.\n\n" + makeBody(31, 6), 950, 140)],
  };
  await db.replies.add(followUp);

  return { conversationId: conv.id, roundIds };
}

async function main() {
  console.log("\n[fase5-harness] siembra de 6 paneles × 3 Rounds…");
  const { conversationId, roundIds } = await seed();

  /* ── Q29: interpolación de plantillas ─────────────────────────── */
  console.log("\n[fase5-harness] plantillas {{variable}} (Q29)");
  const tplBody = "Analizá {{tema}} para {{audiencia}}; repetí {{tema}} al final. {{ tema }} otra vez.";
  const vars = extractTemplateVariables(tplBody);
  check("variables dedup preservando orden", JSON.stringify(vars) === JSON.stringify(["tema", "audiencia"]));
  const interpolated = interpolateTemplate(tplBody, { tema: "CORS", audiencia: "" });
  check(
    "interpolación con valor vacío permitida",
    interpolated === "Analizá CORS para ; repetí CORS al final. CORS otra vez.",
    interpolated,
  );

  /* ── Q30/E2: anonimización estructural ────────────────────────── */
  console.log("\n[fase5-harness] anonimización (Q30/E2)");
  const round2 = (await db.rounds.get(roundIds[1]!))!;
  const analyzable = await loadAnalyzableReplies(round2);
  check("6 respuestas analizables en el Round 2", analyzable.length === 6, String(analyzable.length));

  const on = anonymizeReplies(analyzable, true);
  const leakedOn = on.labeled.flatMap((r) => scanForProviderNames(r.text));
  check("scrub ON: cero términos identificatorios post-scrub", leakedOn.length === 0, leakedOn.join(", "));
  const selfIdSeal = on.seal.find((s) => s.panelSourceId === "byok:anthropic");
  const selfIdRedaction = on.redactions.find((r) => r.label === selfIdSeal?.label);
  check(
    "scrub ON: la respuesta auto-identificada registra ≥3 redacciones (Claude/Anthropic/ChatGPT)",
    (selfIdRedaction?.count ?? 0) >= 3,
    JSON.stringify(on.redactions),
  );
  check("etiquetas neutras Modelo A…F", on.labeled.every((l) => /^Modelo [A-F]$/.test(l.label)));

  const judgePrompt = buildJudgePrompt({ kind: "compare", originalPrompt: round2.promptText, replies: on.labeled });
  check("prompt del juez contiene las etiquetas", judgePrompt.includes("Respuesta Modelo A"));
  check("prompt del juez NO contiene 'Anthropic'", !judgePrompt.includes("Anthropic"));
  check("prompt del juez NO contiene 'ChatGPT'", !judgePrompt.includes("ChatGPT"));

  const off = anonymizeReplies(analyzable, false);
  check(
    "toggle OFF: etiquetas = nombre real y contenido intacto",
    off.labeled.some((l) => l.label.includes("Claude")) && off.labeled.some((l) => l.text.includes("Soy Claude")),
  );
  check("toggle OFF: sin redacciones", off.redactions.length === 0);

  /* ── parseJudgeResponse con fixtures ──────────────────────────── */
  console.log("\n[fase5-harness] parser del juez");
  const compareJson = JSON.stringify({
    veredicto: "B más profunda; A con un error factual.",
    porRespuesta: [
      {
        label: "Modelo A",
        correccionFactual: { score: 7, nota: "confunde una fecha" },
        profundidad: { score: 3, nota: "correcta pero plana" },
        senalesSesgo: "ninguna aparente",
        tono: "seguro",
      },
      {
        label: "Modelo B",
        correccionFactual: { score: 5, nota: "sin errores visibles" },
        profundidad: { score: 4, nota: "trata límites" },
        senalesSesgo: "leve favoritismo terminológico",
        tono: "medido",
      },
    ],
  });
  const parsedCompare = parseJudgeResponse("compare", compareJson);
  check("compare: parsea ok", parsedCompare.ok);
  check(
    "compare: score fuera de rango se clampea a 5",
    parsedCompare.ok && parsedCompare.compare?.porRespuesta[0]?.correccionFactual.score === 5,
  );
  const fencedSummarize = "Claro, acá va:\n```json\n" + JSON.stringify({ resumen: "Coinciden en lo central.", coincidencias: ["memoización"], divergencias: ["análisis de memoria"] }) + "\n```";
  const parsedSum = parseJudgeResponse("summarize", fencedSummarize);
  check("summarize: parsea con fences y texto previo", parsedSum.ok && parsedSum.summarize?.resumen === "Coinciden en lo central.");
  const parsedGarbage = parseJudgeResponse("compare", "no pienso responder en json");
  check("basura → parse_error con razón", !parsedGarbage.ok && parsedGarbage.reason.length > 0);

  /* ── RoundAnalysis: persistir → releer (Dexie v3) ─────────────── */
  console.log("\n[fase5-harness] roundtrip roundAnalyses (Q30c)");
  const record: RoundAnalysis = {
    id: createId("analysis"),
    conversationId,
    roundId: round2.id,
    kind: "compare",
    createdAt: Date.now(),
    judgePanelSourceId: "byok:google",
    judgeModelId: "gemini-modelo-v1",
    judgeWasParticipant: true, // google participa del consejo sembrado — camino de advertencia
    anonymized: true,
    labelMap: on.seal,
    redactions: on.redactions,
    rubricVersion: 1,
    status: "ok",
    rawResponse: compareJson,
    latencyMs: 2100,
    tokensIn: 900,
    tokensOut: 260,
  };
  if (parsedCompare.ok && parsedCompare.compare) record.compare = parsedCompare.compare;
  const { saveRoundAnalysis } = await import("../lib/conversation-repo");
  await saveRoundAnalysis(record);
  const reread = await listAnalysesForRound(round2.id);
  const got = reread.find((a) => a.id === record.id);
  check("persistido y recuperado por roundId", !!got);
  check("labelMap intacto (6 sellos)", got?.labelMap.length === 6);
  check("redactions intactas", JSON.stringify(got?.redactions) === JSON.stringify(record.redactions));
  check("compare.veredicto intacto", got?.compare?.veredicto === "B más profunda; A con un error factual.");
  check("judgeWasParticipant persiste", got?.judgeWasParticipant === true);

  /* ── PDF real de 6 paneles (Q28) ──────────────────────────────── */
  console.log("\n[fase5-harness] PDF de 6 paneles × 3 Rounds + análisis");
  const loaded = (await loadConversation(conversationId))!;
  const analysesByRoundId = new Map<string, RoundAnalysis[]>([[round2.id, [got!]]]);
  const dd = buildDocDefinition({ loaded, analysesByRoundId, panelLabel, exportedAt: new Date() });

  const require = createRequire(import.meta.url);
  const pdfmakeMod = require("pdfmake/build/pdfmake");
  const vfsMod = require("pdfmake/build/vfs_fonts");
  const pdfMake = (pdfmakeMod.default ?? pdfmakeMod) as {
    addVirtualFileSystem: (v: Record<string, string>) => void;
    createPdf: (d: unknown, layouts?: unknown) => { getBuffer: () => Promise<Uint8Array> };
  };
  pdfMake.addVirtualFileSystem(vfsMod.default ?? vfsMod);
  const buffer = Buffer.from(await pdfMake.createPdf(dd, PDF_TABLE_LAYOUTS).getBuffer());
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PDF, buffer);
  console.log(`  · PDF escrito: ${OUT_PDF} (${(buffer.length / 1024).toFixed(0)} kB)`);

  const { extractText } = await import("unpdf");
  const extracted = await extractText(new Uint8Array(buffer), { mergePages: false });
  const pages: string[] = (extracted.text as string[]).map((p) => String(p));
  const all = norm(pages.join("\n"));

  check("PDF con firma %PDF y ≥3 páginas", buffer.subarray(0, 5).toString() === "%PDF-" && extracted.totalPages >= 3, `páginas=${extracted.totalPages}`);

  const roundHeaders = loaded.rounds.map((r) => roundHeaderText(r.index, r.createdAt));
  let lastIdx = -1;
  let ordered = true;
  for (const h of roundHeaders) {
    const idx = all.indexOf(norm(h));
    if (idx === -1 || idx < lastIdx) ordered = false;
    lastIdx = idx;
  }
  check("los 3 Rounds presentes y en orden", ordered);

  for (const p of PANELS) check(`panel presente: ${p.label}`, all.includes(norm(p.label)));
  check("code fence presente (def fibonacci)", all.includes(norm("def fibonacci(n, memo=None):")));
  check("original intacto en el PDF ('Soy Claude' NO se scrubbea acá)", all.includes(norm("Soy Claude")));
  check("bloque de análisis presente y des-sellado", all.includes(norm("Análisis · Comparar")) && all.includes(norm("Modelo A ->")));
  check("follow-up presente", all.includes(norm("Follow-up (solo Gemini (Google AI))")));
  check("toggle del Round 1 impreso", all.includes(norm("Toggles del Round: búsqueda web")));

  // Anti-huérfanos, mecanismo (firma 0.3 REAL: nodeQueries.getFollowingNodesOnPage):
  type NQ = Parameters<typeof orphanPageBreakBefore>[1];
  const nq = (following: unknown[]): NQ =>
    ({ getFollowingNodesOnPage: () => following } as unknown as NQ);
  const headerNode = { headlineLevel: 2 } as Parameters<typeof orphanPageBreakBefore>[0];
  const bodyNode = {} as Parameters<typeof orphanPageBreakBefore>[0];
  check("anti-huérfanos: header sin nodos siguientes → salta de página", orphanPageBreakBefore(headerNode, nq([])) === true);
  check("anti-huérfanos: header con contenido debajo → no salta", orphanPageBreakBefore(headerNode, nq([{}])) === false);
  check("anti-huérfanos: nodo común al pie → no salta", orphanPageBreakBefore(bodyNode, nq([])) === false);

  // Anti-huérfanos, e2e: ningún rótulo conocido cierra una página.
  const knownHeaders: string[] = [
    ...roundHeaders,
    ...loaded.rounds.flatMap((r) =>
      (loaded.repliesByRoundId.get(r.id) ?? []).map((rep) => replyHeaderText(panelLabel(rep.panelSourceId), rep.modelId)),
    ),
    "Análisis · Comparar · juez: Gemini (Google AI) (gemini-modelo-v1)",
  ].map(norm);
  let orphan: string | null = null;
  pages.forEach((page, i) => {
    const tail = norm(page).slice(-160);
    for (const h of knownHeaders) {
      if (h.length > 0 && tail.endsWith(h)) orphan = `pág ${i + 1}: "${h.slice(0, 60)}…"`;
    }
  });
  check("ningún rótulo huérfano al pie de página", orphan === null, orphan ?? "");

  /* ── resumen ──────────────────────────────────────────────────── */
  console.log(`\n[fase5-harness] ${pass} OK · ${failCount} FALLOS`);
  if (failCount > 0) {
    for (const f of failures) console.warn("  ✗ " + f);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[fase5-harness] error fatal:", e);
  process.exit(1);
});
