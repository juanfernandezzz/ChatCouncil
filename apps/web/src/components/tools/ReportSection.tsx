import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Section, TextInput } from "@chatcouncil/ui";
import { googleAuthConfigured } from "@/lib/google-auth";
import { exportConversationPdf, generateConversationPdfBlob } from "@/lib/pdf/export-conversation";
import { useCouncilStore } from "@/store/useCouncilStore";

/**
 * Sección de informe (Q28 + adición 2026-07-16) — Ver / PDF / DOCX.
 * "Ver informe" abre un modal con <iframe> sobre el MISMO blob en
 * memoria que descargaría "Exportar PDF" (D1: un solo camino de
 * generación; nada toca el disco hasta que el usuario lo pida). El
 * DOCX (tablas copiables) se importa dinámico — chunk propio.
 * Renombrado en Fase 7 (deuda de naming saldada): PdfSection →
 * ReportSection — la sección exporta Ver/PDF/DOCX/mail, no sólo PDF.
 */

type BusyKind = "view" | "pdf" | "docx";

interface ViewerState {
  url: string;
  filename: string;
}

export function ReportSection({ conversationId }: { conversationId: string | null }) {
  const [busy, setBusy] = useState<BusyKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const viewerUrlRef = useRef<string | null>(null);

  // ── Fase 6 (Paso 0, E8): "Enviar por mail" ──────────────────────────
  const accountEmail = useCouncilStore((s) => s.accountEmail);
  const [mailOpen, setMailOpen] = useState(false);
  const [mailTo, setMailTo] = useState("");
  const [mailPdf, setMailPdf] = useState(true);
  const [mailDocx, setMailDocx] = useState(true);
  const [mailBusy, setMailBusy] = useState(false);
  const [mailResult, setMailResult] = useState<string | null>(null);
  const mailConfigured = googleAuthConfigured();

  // Default del destinatario (E8): el mail de la sesión, editable.
  useEffect(() => {
    if (accountEmail && mailTo === "") setMailTo(accountEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountEmail]);

  const handleSendMail = async () => {
    if (!conversationId || mailBusy) return;
    setMailBusy(true);
    setMailResult(null);
    setError(null);
    try {
      const { sendReportByMail } = await import("@/lib/mail/send-report-mail");
      const sent = await sendReportByMail({ conversationId, to: mailTo, includePdf: mailPdf, includeDocx: mailDocx });
      setMailResult(`enviado (${sent.attachmentNames.join(", ")})`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn("[chatcouncil:mail] envío falló:", message);
      setMailResult(null);
      setError(message);
    } finally {
      setMailBusy(false);
    }
  };

  const closeViewer = () => {
    if (viewerUrlRef.current) {
      URL.revokeObjectURL(viewerUrlRef.current);
      viewerUrlRef.current = null;
    }
    setViewer(null);
  };

  // revoke si el componente se desmonta con el visor abierto
  useEffect(
    () => () => {
      if (viewerUrlRef.current) URL.revokeObjectURL(viewerUrlRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!viewer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeViewer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // closeViewer es estable en la práctica (sólo toca refs/estado); no lo listamos para no recrear el listener
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer]);

  const run = async (kind: BusyKind) => {
    if (!conversationId || busy) return;
    setBusy(kind);
    setError(null);
    try {
      if (kind === "view") {
        const { blob, filename } = await generateConversationPdfBlob(conversationId);
        const url = URL.createObjectURL(blob);
        viewerUrlRef.current = url;
        setViewer({ url, filename });
      } else if (kind === "pdf") {
        await exportConversationPdf(conversationId);
      } else {
        const mod = await import("@/lib/docx/export-conversation-docx");
        await mod.exportConversationDocx(conversationId);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(`[chatcouncil:${kind === "docx" ? "docx" : "pdf"}] export falló:`, message);
      setError(message);
    } finally {
      setBusy(null);
    }
  };

  const btn = (kind: BusyKind, label: string, primary = false) => (
    <Button
      variant={primary ? "accent" : "ghost"}
      size="md"
      disabled={!conversationId || busy !== null}
      onClick={() => void run(kind)}
    >
      {busy === kind ? "Generando…" : label}
    </Button>
  );

  return (
    <Section title="Informe">
      <p className="text-[11px] leading-snug text-text-secondary">
        Conversación completa: prompts, respuestas por panel con metadatos (modelo, vía, latencia, tokens) y los
        análisis persistidos de cada Round. Vela sin descargar, o bajala como PDF o como DOCX (tablas copiables).
      </p>
      <div className="flex flex-wrap gap-2">
        {btn("view", "Ver informe", true)}
        {btn("pdf", "Exportar PDF")}
        {btn("docx", "Exportar DOCX")}
        <Button
          size="md"
          disabled={!conversationId || !mailConfigured}
          title={
            !mailConfigured
              ? "Configurá las variables de entorno de Google para enviar por mail"
              : "Enviar el informe por Gmail con los adjuntos elegidos"
          }
          onClick={() => setMailOpen((o) => !o)}
        >
          Enviar por mail
        </Button>
      </div>
      {mailOpen && mailConfigured && (
        <div className="flex flex-col gap-1.5 rounded border border-border p-2 text-[11px]">
          <label className="flex items-center gap-1.5 text-text-secondary">
            Para:
            <TextInput
              value={mailTo}
              onChange={(e) => setMailTo(e.target.value)}
              placeholder={accountEmail ?? "destinatario@dominio.com"}
              className="flex-1 px-2 py-1 text-[11px]"
            />
          </label>
          <div className="flex items-center gap-3 text-text-secondary">
            <label className="flex cursor-pointer items-center gap-1">
              <input type="checkbox" checked={mailPdf} onChange={(e) => setMailPdf(e.target.checked)} className="accent-accent-primary" />
              PDF
            </label>
            <label className="flex cursor-pointer items-center gap-1">
              <input type="checkbox" checked={mailDocx} onChange={(e) => setMailDocx(e.target.checked)} className="accent-accent-primary" />
              DOCX
            </label>
            <Button variant="accent" disabled={mailBusy || !mailTo.trim() || (!mailPdf && !mailDocx)} onClick={() => void handleSendMail()} className="ml-auto">
              {mailBusy ? "Enviando…" : "Enviar"}
            </Button>
          </div>
          {mailResult && (
            <p className="flex items-center gap-1 text-accent-secondary">
              <Check size={12} aria-hidden />
              {mailResult}
            </p>
          )}
          <p className="text-[10px] leading-snug text-text-secondary">
            Se envía desde TU cuenta de Gmail (Gmail API, mismo permiso que el sync). El adjunto es exactamente el
            mismo informe de Ver/PDF/DOCX.
          </p>
        </div>
      )}
      {!conversationId && <p className="text-[11px] text-text-secondary">Abrí o creá una conversación primero.</p>}
      {error && <p className="text-[11px] text-danger">{error}</p>}

      {viewer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Vista previa del informe"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={closeViewer}
        >
          <div
            className="flex h-[85vh] w-[min(92vw,900px)] flex-col overflow-hidden rounded-lg border border-border bg-surface-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <span className="truncate text-xs text-text-secondary">{viewer.filename} · en memoria, sin descargar</span>
              <Button size="xs" onClick={closeViewer} className="flex shrink-0 items-center gap-1 px-2 text-xs">
                Cerrar
                <X size={12} aria-hidden />
              </Button>
            </div>
            <iframe title="Vista previa del informe (PDF en memoria)" src={viewer.url} className="h-full w-full flex-1 bg-white" />
          </div>
        </div>
      )}
    </Section>
  );
}
