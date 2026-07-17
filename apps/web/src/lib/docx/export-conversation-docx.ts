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

export async function exportConversationDocx(conversationId: string): Promise<void> {
  const { loaded, analysesByRoundId } = await loadReportData(conversationId);
  const doc = buildDocxDocument({
    loaded,
    analysesByRoundId,
    panelLabel: panelDisplayLabel,
    exportedAt: new Date(),
  });
  const raw = await Packer.toBlob(doc);
  const blob = raw.type === DOCX_MIME ? raw : new Blob([raw], { type: DOCX_MIME });
  downloadBlob(blob, reportFilename(loaded.conversation.title, "docx"));
}
