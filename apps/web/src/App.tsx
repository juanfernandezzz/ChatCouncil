import { useEffect } from "react";
import { PANEL_COUNT_OPTIONS, useCouncilStore, type PanelCount } from "@/store/useCouncilStore";
import { detectExtension } from "@/lib/extension-detect";
import { GridPanel } from "@/components/layout/GridPanel";
import { ExtensionBadge } from "@/components/shell/ExtensionBadge";

export default function App() {
  const panelCount = useCouncilStore((s) => s.panelCount);
  const isLayoutLocked = useCouncilStore((s) => s.isLayoutLocked);
  const setPanelCount = useCouncilStore((s) => s.setPanelCount);
  const setExtensionStatus = useCouncilStore((s) => s.setExtensionStatus);

  useEffect(() => {
    detectExtension().then(setExtensionStatus);
  }, [setExtensionStatus]);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-semibold tracking-tight text-text-primary">ChatCouncil</h1>
          <span className="font-mono text-xs text-text-secondary">scaffold · fase 0</span>
        </div>
        <ExtensionBadge />
      </header>

      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary">Paneles:</span>
        <div className="flex gap-1">
          {PANEL_COUNT_OPTIONS.map((count) => (
            <button
              key={count}
              type="button"
              disabled={isLayoutLocked}
              onClick={() => setPanelCount(count as PanelCount)}
              className={`h-7 w-7 rounded border text-xs transition-colors ${
                panelCount === count
                  ? "border-accent-primary text-accent-primary"
                  : "border-border text-text-secondary hover:border-text-secondary"
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              {count}
            </button>
          ))}
        </div>
        {isLayoutLocked && (
          <span className="text-xs text-text-secondary">
            (layout bloqueado — la conversacion ya tiene mensajes, Q14)
          </span>
        )}
      </div>

      <main className="flex-1">
        <GridPanel />
      </main>

      <footer className="sticky bottom-4">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-elevated p-2">
          <input
            type="text"
            placeholder="Escribe un prompt para distribuir a todos los modelos seleccionados..."
            className="flex-1 bg-transparent px-2 py-1.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none"
          />
          <button
            type="button"
            className="rounded-md bg-accent-primary px-3 py-1.5 text-sm font-medium text-bg-base transition-opacity hover:opacity-90"
          >
            Enviar
          </button>
        </div>
      </footer>
    </div>
  );
}
