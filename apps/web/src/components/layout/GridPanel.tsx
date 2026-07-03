import { PROVIDER_CAPABILITIES } from "@chatcouncil/shared";
import { gridLayouts } from "@chatcouncil/ui";
import { useCouncilStore } from "@/store/useCouncilStore";

const GRID_COLS_CLASS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-2",
  5: "grid-cols-5",
};

function ModelPanel({ modelId }: { modelId: string }) {
  const capability = PROVIDER_CAPABILITIES[modelId];
  const label = capability?.label ?? modelId;

  return (
    <div className="flex min-h-[220px] flex-col rounded-lg border border-border bg-surface-elevated">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="truncate text-sm font-medium text-text-primary">{label}</span>
        {/* Anillo de "streaming/activo" — el unico lugar donde el acento
            primario aparece con fuerza, a proposito (ver frontend-design:
            gastar el atrevimiento en un solo elemento). */}
        <span
          className="h-2 w-2 rounded-full bg-accent-secondary"
          title="En espera de la primera respuesta"
          aria-hidden
        />
      </header>
      <div className="flex flex-1 items-center justify-center px-3 py-6 font-mono text-xs text-text-secondary">
        Sin actividad todavia — este panel se conectara en la Fase 2 (BYOK) o
        Fase 3 (BYOA) del blueprint.
      </div>
    </div>
  );
}

export function GridPanel() {
  const panelCount = useCouncilStore((s) => s.panelCount);
  const priorityModelIds = useCouncilStore((s) => s.priorityModelIds);
  // Se deriva en el render, no via el metodo del store: evitamos que un
  // selector devuelva un array nuevo en cada llamada (rompe la
  // comparacion por referencia de Zustand y genera renders de mas).
  const activeModelIds = priorityModelIds.slice(0, panelCount);
  // gridLayouts esta indexado por los valores exactos de
  // PANEL_COUNT_OPTIONS, pero con noUncheckedIndexedAccess TS no puede
  // probarlo estaticamente — se cae a un layout de 3 columnas en el
  // caso (inalcanzable en la practica) de un panelCount no mapeado.
  const layout = gridLayouts[panelCount] ?? { cols: 3, rows: 2 };
  const colsClass = GRID_COLS_CLASS[layout.cols] ?? "grid-cols-3";

  return (
    <div className={`grid gap-3 ${colsClass}`}>
      {activeModelIds.map((modelId) => (
        <ModelPanel key={modelId} modelId={modelId} />
      ))}
    </div>
  );
}
