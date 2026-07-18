import { getGoogleAccessToken } from "../google-auth";
import { generateConversationPdfBlob } from "../pdf/export-conversation";
import { buildReportMime, type MimeAttachment } from "./build-mime";

/**
 * send-report-mail — "Enviar por mail" (Fase 6, Paso 0, camino A)
 * ------------------------------------------------------------------
 * Gmail API `users.messages.send` COMO el usuario, con el MISMO token
 * GIS del sync (scopes combinados, E6). Los adjuntos REUSAN los
 * generadores de Fase 5 tal cual (generateConversationPdfBlob /
 * generateConversationDocxBlob): cero código nuevo de generación de
 * informe — este módulo sólo empaqueta y envía.
 *
 * Límite v1: el mensaje viaja en el body JSON de messages.send (no el
 * endpoint /upload). Los informes reales pesan decenas de kB; se
 * corta con error claro mucho antes del límite del endpoint.
 */

const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
/** Techo conservador para el camino no-/upload (base64 infla ~33%). */
const MAX_MIME_BYTES = 8 * 1024 * 1024;

export interface SendReportOptions {
  conversationId: string;
  to: string;
  includePdf: boolean;
  includeDocx: boolean;
}

export interface SentReport {
  gmailMessageId: string;
  attachmentNames: string[];
}

export async function sendReportByMail(opts: SendReportOptions): Promise<SentReport> {
  if (!opts.includePdf && !opts.includeDocx) throw new Error("elegí al menos un adjunto (PDF o DOCX)");
  const to = opts.to.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error(`destinatario inválido: "${to}"`);

  const attachments: MimeAttachment[] = [];
  let title = "";

  if (opts.includePdf) {
    const pdf = await generateConversationPdfBlob(opts.conversationId);
    title = pdf.title;
    attachments.push({
      filename: pdf.filename,
      mimeType: "application/pdf",
      bytes: new Uint8Array(await pdf.blob.arrayBuffer()),
    });
  }
  if (opts.includeDocx) {
    const { generateConversationDocxBlob } = await import("../docx/export-conversation-docx");
    const docx = await generateConversationDocxBlob(opts.conversationId);
    title = title || docx.title;
    attachments.push({
      filename: docx.filename,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: new Uint8Array(await docx.blob.arrayBuffer()),
    });
  }

  const built = buildReportMime({
    to,
    subject: `ChatCouncil — informe: ${title}`,
    bodyText:
      `Informe de la conversación "${title}" generado con ChatCouncil.\n\n` +
      `Adjuntos: ${attachments.map((a) => a.filename).join(", ")}.\n`,
    attachments,
  });
  if (built.sizeBytes > MAX_MIME_BYTES) {
    throw new Error(`el informe supera el límite de envío (${(built.sizeBytes / 1024 / 1024).toFixed(1)} MB) — bajalo y adjuntalo a mano`);
  }

  // Gesto del usuario (click en "Enviar"): habilita el prompt visible de GIS si el silencioso no alcanza.
  const token = await getGoogleAccessToken({ interactive: true });
  const resp = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ raw: built.raw }),
  });
  if (!resp.ok) {
    let detail = "";
    try {
      detail = (await resp.text()).slice(0, 300);
    } catch {
      /* cuerpo ilegible */
    }
    if (resp.status === 403) {
      // Trampa conocida (BLUEPRINT, Fase 6): en testing mode, un 403
      // access_denied casi siempre es "falta el test user en la consola",
      // no un bug del código.
      throw new Error(`Gmail rechazó el envío (HTTP 403). Si el OAuth client está en modo testing, verificá que tu cuenta esté agregada como test user en la consola de Google.${detail ? ` · ${detail}` : ""}`);
    }
    throw new Error(`Gmail send → HTTP ${resp.status}${detail ? ` · ${detail}` : ""}`);
  }
  const body = (await resp.json()) as { id?: string };
  return { gmailMessageId: body.id ?? "(sin id)", attachmentNames: attachments.map((a) => a.filename) };
}
