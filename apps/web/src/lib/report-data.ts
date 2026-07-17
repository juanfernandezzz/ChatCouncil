import { listAnalysesForConversation, loadConversation, type LoadedConversation } from "./conversation-repo";
import type { RoundAnalysis } from "./db";

/**
 * Carga compartida de los exportadores de informe — Fase 5, adición
 * 2026-07-16 (visor en modal + DOCX).
 * ------------------------------------------------------------------
 * UNA sola fuente de datos para todos los formatos: PDF (descarga y
 * visor) y DOCX reciben EXACTAMENTE el mismo shape cargado de Dexie.
 * La paridad de contenido entre formatos es por construcción, no por
 * disciplina.
 */
export interface ReportData {
  loaded: LoadedConversation;
  analysesByRoundId: Map<string, RoundAnalysis[]>;
}

export async function loadReportData(conversationId: string): Promise<ReportData> {
  const loaded = await loadConversation(conversationId);
  if (!loaded) throw new Error("la conversación no existe en Dexie — nada que exportar");
  const analyses = await listAnalysesForConversation(conversationId);
  const analysesByRoundId = new Map<string, RoundAnalysis[]>();
  for (const a of analyses) {
    const list = analysesByRoundId.get(a.roundId) ?? [];
    list.push(a);
    analysesByRoundId.set(a.roundId, list);
  }
  return { loaded, analysesByRoundId };
}

export function sanitizeFilename(title: string): string {
  const clean = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return clean || "conversacion";
}

export function reportFilename(title: string, ext: "pdf" | "docx"): string {
  const date = new Date().toISOString().slice(0, 10);
  return `chatcouncil-${sanitizeFilename(title)}-${date}.${ext}`;
}

/**
 * Descarga un Blob vía <a download>. El revoke se difiere: Chrome
 * necesita el object URL vivo hasta que el download arranque de verdad.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
