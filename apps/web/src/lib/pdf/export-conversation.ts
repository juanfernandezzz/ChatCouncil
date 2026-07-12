import { listAnalysesForConversation, loadConversation } from "../conversation-repo";
import type { RoundAnalysis } from "../db";
import { panelDisplayLabel } from "../model-registry";
import { buildDocDefinition, PDF_TABLE_LAYOUTS } from "./build-doc-definition";

/**
 * Export a PDF desde el navegador — ChatCouncil Fase 5 (Q28)
 * ------------------------------------------------------------------
 * pdfmake se carga con IMPORT DINÁMICO a propósito: la fuente Roboto
 * embebida (vfs) pesa ~0.9 MB y no puede vivir en el bundle principal.
 * Gate de artefacto de la fase: el chunk de pdfmake existe separado y
 * el index NO contiene "Roboto-Regular.ttf".
 *
 * Shapes verificados empíricamente contra pdfmake 0.3.11 (probe en
 * sandbox, 2026-07-11 — la línea 0.3 CAMBIÓ respecto de 0.2):
 *  · vfs_fonts exporta el mapa de .ttf DIRECTO (sin .pdfMake.vfs)
 *  · se registra con addVirtualFileSystem(vfs)
 *  · getBuffer() devuelve Promise (ya no callback)
 */

function sanitizeFilename(title: string): string {
  const clean = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return clean || "conversacion";
}

export async function exportConversationPdf(conversationId: string): Promise<void> {
  const loaded = await loadConversation(conversationId);
  if (!loaded) throw new Error("la conversación no existe en Dexie — nada que exportar");

  const analyses = await listAnalysesForConversation(conversationId);
  const analysesByRoundId = new Map<string, RoundAnalysis[]>();
  for (const a of analyses) {
    const list = analysesByRoundId.get(a.roundId) ?? [];
    list.push(a);
    analysesByRoundId.set(a.roundId, list);
  }

  const docDefinition = buildDocDefinition({
    loaded,
    analysesByRoundId,
    panelLabel: panelDisplayLabel,
    exportedAt: new Date(),
  });

  const [pdfmakeMod, vfsMod] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
  ]);
  const pdfMake = (pdfmakeMod as unknown as { default?: unknown }).default ?? pdfmakeMod;
  const vfs = (vfsMod as { default?: Record<string, string> }).default ?? (vfsMod as unknown as Record<string, string>);

  const maker = pdfMake as unknown as {
    addVirtualFileSystem: (v: Record<string, string>) => void;
    createPdf: (
      dd: unknown,
      tableLayouts?: unknown,
    ) => { download: (filename: string) => void };
  };
  maker.addVirtualFileSystem(vfs);

  const date = new Date().toISOString().slice(0, 10);
  maker
    .createPdf(docDefinition, PDF_TABLE_LAYOUTS)
    .download(`chatcouncil-${sanitizeFilename(loaded.conversation.title)}-${date}.pdf`);
}
