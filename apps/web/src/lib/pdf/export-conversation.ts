import { panelDisplayLabel } from "../model-registry";
import { downloadBlob, loadReportData, reportFilename } from "../report-data";
import { buildDocDefinition, PDF_TABLE_LAYOUTS } from "./build-doc-definition";

/**
 * Export/visor de PDF desde el navegador — ChatCouncil Fase 5 (Q28)
 * + adición 2026-07-16 (D1): "Ver informe" y "Exportar PDF" comparten
 * generateConversationPdfBlob() — el visor muestra EL MISMO pdf en
 * memoria que se descargaría, por construcción (un solo camino de
 * generación; la descarga dejó de usar pdfmake.download() y pasa por
 * el mismo blob + <a download>).
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

export interface GeneratedPdf {
  blob: Blob;
  filename: string;
  title: string;
}

export async function generateConversationPdfBlob(conversationId: string): Promise<GeneratedPdf> {
  const { loaded, analysesByRoundId } = await loadReportData(conversationId);

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
    createPdf: (dd: unknown, tableLayouts?: unknown) => { getBuffer: () => Promise<Uint8Array> };
  };
  maker.addVirtualFileSystem(vfs);

  const buffer = await maker.createPdf(docDefinition, PDF_TABLE_LAYOUTS).getBuffer();
  const blob = new Blob([buffer as BlobPart], { type: "application/pdf" });
  return { blob, filename: reportFilename(loaded.conversation.title, "pdf"), title: loaded.conversation.title };
}

export async function exportConversationPdf(conversationId: string): Promise<void> {
  const { blob, filename } = await generateConversationPdfBlob(conversationId);
  downloadBlob(blob, filename);
}
