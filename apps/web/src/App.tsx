import { useEffect } from "react";
import { PANEL_COUNT_OPTIONS, useCouncilStore, type PanelCount } from "@/store/useCouncilStore";
import { bridgeClient } from "@/lib/bridge-client";
import { GridPanel } from "@/components/layout/GridPanel";
import { ExtensionBadge } from "@/components/shell/ExtensionBadge";
import { ByokTestPanel } from "@/dev/ByokTestPanel";

// ─── Soporte de plataformas (decisión de cierre de Fase 1, ver BLUEPRINT
// "Fase 8 — Móvil") ─────────────────────────────────────────────────────
// v1 depende de la extensión de escritorio para el puente BYOA/BYOK, y
// los navegadores móviles no pueden alojarla. En móvil la SPA sólo
// informa. Detección por UA a propósito: la capacidad real ("¿puede este
// navegador alojar nuestra extensión?") no es detectable directamente.
// Caso borde conocido: iPadOS se presenta como Mac → cae al flujo
// desktop y termina en el badge "Extensión no instalada" — degradación
// aceptable, no un error.
const IS_MOBILE =
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (navigator as { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile === true;

function MobileNotice() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight text-text-primary">ChatCouncil</h1>
      <p className="text-sm leading-relaxed text-text-primary">
        ChatCouncil corre en <span className="text-accent-primary">Chrome de escritorio</span>.
      </p>
      <p className="text-sm leading-relaxed text-text-secondary">
        El puente hacia los proveedores depende de una extensión de navegador, y los navegadores
        móviles no pueden alojarla. Abrí esta misma dirección desde Chrome (o un navegador
        Chromium) de escritorio con la extensión instalada.
      </p>
      <p className="font-mono text-xs text-text-secondary">
        En evaluación: una extensión para Firefox en Android que habilite el uso móvil.
      </p>
    </div>
  );
}

export default function App() {
  const panelCount = useCouncilStore((s) => s.panelCount);
  const isLayoutLocked = useCouncilStore((s) => s.isLayoutLocked);
  const setPanelCount = useCouncilStore((s) => s.setPanelCount);
  const setExtensionStatus = useCouncilStore((s) => s.setExtensionStatus);

  useEffect(() => {
    if (IS_MOBILE) return; // sin extensión posible, no hay puente que conectar
    bridgeClient.connect();
    const unsub = bridgeClient.onStatus(setExtensionStatus);
    return unsub;
  }, [setExtensionStatus]);

  if (IS_MOBILE) {
    return <MobileNotice />;
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-semibold tracking-tight text-text-primary">ChatCouncil</h1>
          <span className="font-mono text-xs text-text-secondary">fase 2 · byok</span>
        </div>
        <ExtensionBadge />
      </header>

      {/* El panel de self-test de Fase 1 fue retirado al cerrar la fase.
          Se conserva desmontado en src/dev/SelfTestPanel.tsx — un import
          lo re-monta si hace falta diagnóstico del puente. */}

      {/* Harness de aceptación de Fase 2 (E8): montado DURANTE la fase
          para el test con llaves reales; al cierre se retira este import
          y queda en src/dev/, igual que el panel de Fase 1. */}
      <ByokTestPanel />

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
