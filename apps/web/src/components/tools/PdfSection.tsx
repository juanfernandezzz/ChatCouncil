import { useState } from "react";
import { exportConversationPdf } from "@/lib/pdf/export-conversation";

/** Export PDF (Q28) — Fase 5. El trabajo pesado vive en lib/pdf; acá sólo estados de UI. */
export function PdfSection({ conversationId }: { conversationId: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    if (!conversationId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await exportConversationPdf(conversationId);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn("[chatcouncil:pdf] export falló:", message);
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-2 rounded-md border border-border p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Exportar PDF</h3>
      <p className="text-[11px] leading-snug text-text-secondary">
        Conversación completa: prompts, respuestas por panel con metadatos (modelo, vía, latencia, tokens) y los
        análisis persistidos de cada Round.
      </p>
      <button
        type="button"
        disabled={!conversationId || busy}
        onClick={() => void handleExport()}
        className="rounded-md border border-accent-primary px-3 py-1.5 text-sm text-accent-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Generando…" : "Exportar PDF"}
      </button>
      {!conversationId && <p className="text-[11px] text-text-secondary">Abrí o creá una conversación primero.</p>}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </section>
  );
}
