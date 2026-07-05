import { useState } from "react";
import { bridgeClient, type StreamHandlers } from "@/lib/bridge-client";
import { useCouncilStore } from "@/store/useCouncilStore";

/**
 * Panel de self-test de Fase 1 — PRESERVADO, NO MONTADO.
 * ------------------------------------------------------------------
 * Retirado de App.tsx al cerrar Fase 1 (2026-07-04) y conservado a
 * pedido de Juan como herramienta de diagnóstico reutilizable. Nadie lo
 * importa → no entra al bundle; pero typechequea con el resto del
 * workspace, así que no puede pudrirse en tipos sin que el gate lo vea.
 *
 * Para re-montarlo:
 *   import { SelfTestPanel } from "@/dev/SelfTestPanel";
 *   ...y renderizar <SelfTestPanel /> bajo el <header> de App.tsx.
 *
 * Qué hace: dispara un stream sintético por el camino real
 * SPA→SW→offscreen→SW→SPA usando el providerId reservado
 * `__selftest__`, y muestra fase / recibidos / lastSeq / transcript en
 * vivo. Parametrizable por URL para pruebas automatizadas sin DevTools:
 *   ?stChunks=40&stIntervalMs=1000   → default (~40s)
 *   ?stChunks=4&stIntervalMs=35000   → "Corrida B" autónoma: los huecos
 *     entre chunks superan la ventana de suspensión (~30s) del SW de
 *     MV3, así que el SW muere por idle A MITAD del stream y la
 *     reanudación con preservación de contenido queda ejercitada sola.
 * Fingerprint útil: la fase `resumed` sólo es alcanzable desde
 * `reconnecting`, así que verla tras cada chunk prueba un ciclo
 * muerte/reanudación del SW antes de ese chunk.
 */

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

const stParams = new URLSearchParams(window.location.search);
const SELFTEST_CHUNKS = Math.max(1, Number(stParams.get("stChunks")) || 40);
const SELFTEST_INTERVAL_MS = Math.max(50, Number(stParams.get("stIntervalMs")) || 1000);

export function SelfTestPanel() {
  const extensionStatus = useCouncilStore((s) => s.extensionStatus);

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
      onResumed: () =>
        setSelfTest((s) => ({ ...s, note: "reanudación pedida; reproduciendo buffer…" })),
    };
    bridgeClient.runSelfTest(handlers, {
      chunks: SELFTEST_CHUNKS,
      intervalMs: SELFTEST_INTERVAL_MS,
    });
  };

  const connected = extensionStatus.state === "connected";
  const testRunning =
    selfTest.phase === "streaming" ||
    selfTest.phase === "reconnecting" ||
    selfTest.phase === "resumed";

  return (
    <section className="rounded-lg border border-dashed border-border bg-surface-elevated p-3">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs uppercase tracking-wide text-text-secondary">
          self-test · diagnóstico
        </span>
        <button
          type="button"
          disabled={!connected || testRunning}
          onClick={runSelfTest}
          className="rounded-md border border-accent-primary px-3 py-1 text-xs font-medium text-accent-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:border-border disabled:text-text-secondary disabled:opacity-50"
        >
          {testRunning ? "corriendo…" : "Correr self-test"}
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
          recibidos {selfTest.chunks.length} · lastSeq {selfTest.lastSeq} · cfg{" "}
          {SELFTEST_CHUNKS}×{SELFTEST_INTERVAL_MS}ms
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
  );
}
