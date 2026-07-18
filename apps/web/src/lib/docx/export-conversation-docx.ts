import { Packer } from "docx";
import { panelDisplayLabel } from "../model-registry";
import { downloadBlob, loadReportData, reportFilename } from "../report-data";
import { buildDocxDocument } from "./build-docx";

/**
 * Export DOCX desde el navegador — Fase 5, adición 2026-07-16 (D2)
 * ------------------------------------------------------------------
 * ESTE módulo es la frontera del import dinámico: la UI lo importa
 * con import() y todo el subárbol (incluida la librería `docx`) va a
 * un chunk propio, mismo patrón que pdfmake. Gate de artefacto: el
 * index NO contiene "wordprocessingml"; el chunk del docx sí.
 */
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export interface GeneratedDocx {
  blob: Blob;
  filename: string;
  title: string;
}

/**
 * Fase 6 (refactor mínimo, mismo patrón D1 del PDF): el blob se expone
 * para que "Enviar por mail" adjunte EXACTAMENTE lo que "Exportar
 * DOCX" descargaría — un solo camino de generación por formato.
 */
export async function generateConversationDocxBlob(conversationId: string): Promise<GeneratedDocx> {
  const { loaded, analysesByRoundId } = await loadReportData(conversationId);
  const doc = buildDocxDocument({
    loaded,
    analysesByRoundId,
    panelLabel: panelDisplayLabel,
    exportedAt: new Date(),
  });
  const raw = await Packer.toBlob(doc);
  const blob = raw.type === DOCX_MIME ? raw : new Blob([raw], { type: DOCX_MIME });
  return { blob, filename: reportFilename(loaded.conversation.title, "docx"), title: loaded.conversation.title };
}

export async function exportConversationDocx(conversationId: string): Promise<void> {
  const { blob, filename } = await generateConversationDocxBlob(conversationId);
  downloadBlob(blob, filename);
}
