import { useCouncilStore } from "@/store/useCouncilStore";
import { AnalyzeSection } from "./AnalyzeSection";
import { PdfSection } from "./PdfSection";
import { PromptTemplatesSection } from "./PromptTemplatesSection";

/**
 * Panel lateral de herramientas — Fase 5. Riel derecho colapsable; la
 * ConversationSidebar izquierda (historial + búsqueda, Fase 4) no se
 * toca. Tailwind inline como el resto de 4/5/6 — las primitivas se
 * extraen a packages/ui recién en Fase 7 (ver BLUEPRINT §0.7).
 */
export function ToolsPanel() {
  const open = useCouncilStore((s) => s.toolsPanelOpen);
  const setOpen = useCouncilStore((s) => s.setToolsPanelOpen);
  const activeConversationId = useCouncilStore((s) => s.activeConversationId);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Abrir herramientas"
        className="flex h-fit shrink-0 flex-col items-center gap-1 rounded-lg border border-border bg-surface-elevated px-1.5 py-3 text-xs text-text-secondary transition-colors hover:border-text-secondary"
      >
        <span>🛠</span>
        <span style={{ writingMode: "vertical-rl" }}>Herramientas</span>
      </button>
    );
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-3 self-start rounded-lg border border-border bg-surface-elevated p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Herramientas</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          title="Colapsar"
          className="rounded border border-border px-1.5 py-0.5 text-xs text-text-secondary hover:border-text-secondary"
        >
          »
        </button>
      </div>
      <div className="flex max-h-[calc(100vh-7rem)] flex-col gap-3 overflow-y-auto pr-0.5">
        <AnalyzeSection conversationId={activeConversationId} />
        <PdfSection conversationId={activeConversationId} />
        <PromptTemplatesSection />
      </div>
    </aside>
  );
}
