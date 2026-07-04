import { useEffect, useState } from "react";
import { PANEL_COUNT_OPTIONS, useCouncilStore, type PanelCount } from "@/store/useCouncilStore";
import { bridgeClient, type StreamHandlers } from "@/lib/bridge-client";
import { GridPanel } from "@/components/layout/GridPanel";
import { ExtensionBadge } from "@/components/shell/ExtensionBadge";

type SelfTestPhase =
  | "idle"
  | "streaming"
  | "reconnecting"
  | "resumed"
  | "done"
  | "aborted"
  | "error";

interface SelfTestState {
  phase: SelfTestPhase;
  chunks: string[];
  lastSeq: number;
  note: string;
}

const PHASE_COLOR: Record<SelfTestPhase, string> = {
  idle: "#8a8a8a",
  streaming: "#00e5ff",
  reconnecting: "#f59e0b",
  resumed: "#00e5ff",
  done: "#10b981",
  aborted: "#ef4444",
  error: "#ef4444",
};

export default function App() {
  const panelCount = useCouncilStore((s) => s.panelCount);
  const isLayoutLocked = useCouncilStore((s) => s.isLayoutLocked);
  const setPanelCount = useCouncilStore((s) => s.setPanelCount);
  const setExtensionStatus = useCouncilStore((s) => s.setExtensionStatus);
  const extensionStatus = useCouncilStore((s) => s.extensionStatus);

  useEffect(() => {
    bridgeClient.connect();
    const unsub = bridgeClient.onStatus(setExtensionStatus);
    return unsub;
  }, [setExtensionStatus]);

  const [selfTest, setSelfTest] = useState<SelfTestState>({
    phase: "idle",
    chunks: [],
    lastSeq: -1,
    note: "",
  });

  const runSelfTest = () => {
    setSelfTest({ phase: "streaming", chunks: [], lastSeq: -1, note: "iniciando…" });
    const handlers: StreamHandlers = {
      onChunk: (seq, chunk) =>
        setSelfTest((s) => ({
          ...s,
          phase: s.phase === "reconnecting" ? "resumed" : "streaming",
          chunks: [...s.chunks, chunk],
          lastSeq: seq,
        })),
      onDone: (lastSeq) =>
        setSelfTest((s) => ({ ...s, phase: "done", note: `done · lastSeq ${lastSeq}` })),
      onError: (message) => setSelfTest((s) => ({ ...s, phase: "error", note: message })),
      onAborted: () =>
        setSelfTest((s) => ({
          ...s,
          phase: "aborted",
          note: "stream abortado (piso A) — no fue posible reanudar con contenido",
        })),
      onReconnecting: () =>
        setSelfTest((s) => ({ ...s, phase: "reconnecting", note: "Port caído; reconectando…" })),
      onResumed: () => setSelfTest((s) => ({ ...s, note: "reanudación pedida; reproduciendo buffer…" })),
    };
    bridgeClient.runSelfTest(handlers, { chunks: 40, intervalMs: 1000 });
  };

  const connected = extensionStatus.state === "connected";
  const testRunning = selfTest.phase === "streaming" || selfTest.phase === "reconnecting" || selfTest.phase === "resumed";

  return (
    <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-semibold tracking-tight text-text-primary">ChatCouncil</h1>
          <span className="font-mono text-xs text-text-secondary">scaffold · fase 1</span>
        </div>
        <ExtensionBadge />
      </header>

      {/* ─── Panel de autodiagnóstico (SÓLO Fase 1 · scaffolding temporal) ───
          Ejercita el camino real SPA→SW→offscreen→SW→SPA con un stream
          sintético largo. Para validar el criterio de aceptación: matá el
          service worker a mitad de stream (chrome://extensions → service
          worker → “inspeccionar” → recargá) y observá abajo que NO se
          pierde contenido — la fase pasa a "reconnecting" y luego se
          reanuda hasta "done". Borrar este bloque al cerrar la fase. */}
      <section className="rounded-lg border border-dashed border-border bg-surface-elevated p-3">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <span className="font-mono text-xs uppercase tracking-wide text-text-secondary">
            self-test · fase 1
          </span>
          <button
            type="button"
            disabled={!connected || testRunning}
            onClick={runSelfTest}
            className="rounded-md border border-accent-primary px-3 py-1 text-xs font-medium text-accent-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:border-border disabled:text-text-secondary disabled:opacity-50"
          >
            {testRunning ? "corriendo…" : "Correr self-test (~40s)"}
          </button>
          <span className="flex items-center gap-1.5 font-mono text-xs">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: PHASE_COLOR[selfTest.phase] }}
              aria-hidden
            />
            {selfTest.phase}
          </span>
          <span className="font-mono text-xs text-text-secondary">
            recibidos {selfTest.chunks.length} · lastSeq {selfTest.lastSeq}
          </span>
          {selfTest.note && (
            <span className="font-mono text-xs text-text-secondary">— {selfTest.note}</span>
          )}
        </div>
        {!connected && (
          <p className="font-mono text-xs text-text-secondary">
            Conectá la extensión para habilitar el self-test.
          </p>
        )}
        {selfTest.chunks.length > 0 && (
          <pre className="max-h-40 overflow-auto rounded border border-border bg-bg-base p-2 font-mono text-[11px] leading-relaxed text-text-primary">
            {selfTest.chunks.join("")}
          </pre>
        )}
      </section>

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
