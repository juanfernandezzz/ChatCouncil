import { useState } from "react";
import {
  BYOK_PROVIDERS,
  BYOK_PROVIDER_IDS,
} from "@chatcouncil/adapters";
import {
  PROVIDER_CAPABILITIES,
  clearCorsProbe,
  probeCors,
  readCorsProbe,
} from "@chatcouncil/shared";
import { useCouncilStore } from "@/store/useCouncilStore";
import { resolveByokRoute, sendByokPrompt } from "@/lib/byok-client";
import { clearKey, hasKey, isPersisted, maskKey, setKey } from "@/lib/key-vault";

/**
 * Panel BYOK de Fase 2 — harness de aceptación (E8).
 * ------------------------------------------------------------------
 * Mismo ciclo de vida que el panel de Fase 1: MONTADO en App.tsx
 * durante la fase; al cierre se retira el import y queda acá,
 * desmontado pero typechequeado, como herramienta de diagnóstico.
 *
 * Qué ejercita, con las llaves REALES de Juan tipeadas en SU Chrome
 * (jamás pre-cargadas; jamás en zips/prompts/commits/logs — este panel
 * no imprime la llave ni siquiera en errores, sólo maskKey()):
 *   · custodia: guardar/borrar por proveedor + persistencia opt-out.
 *   · probe E7: medir CORS real y ver cómo pisa lo declarado.
 *   · routing: directo vs proxy vs no-disponible con razón.
 *   · stream de punta a punta por el contrato Adapter, con las fases
 *     reconnecting/resumed del puente visibles (criterio: matar el SW
 *     a mitad de un stream proxied preserva contenido).
 */

type ByokPhase =
  | "idle"
  | "streaming"
  | "reconnecting"
  | "resumed"
  | "done"
  | "aborted"
  | "error";

const PHASE_COLOR: Record<ByokPhase, string> = {
  idle: "#8a8a8a",
  streaming: "#00e5ff",
  reconnecting: "#f59e0b",
  resumed: "#00e5ff",
  done: "#10b981",
  aborted: "#ef4444",
  error: "#ef4444",
};

interface RunState {
  phase: ByokPhase;
  route: string;
  text: string;
  tokens: string;
  log: string[];
}

const IDLE_RUN: RunState = { phase: "idle", route: "—", text: "", tokens: "", log: [] };

function ts(line: string): string {
  return `${new Date().toISOString().slice(11, 19)} ${line}`;
}

export function ByokTestPanel() {
  const extensionStatus = useCouncilStore((s) => s.extensionStatus);

  const [providerId, setProviderId] = useState<string>("anthropic");
  const provider = BYOK_PROVIDERS[providerId]!;
  const [model, setModel] = useState(provider.defaultModel);
  const [keyDraft, setKeyDraft] = useState("");
  const [persist, setPersist] = useState(() => isPersisted("anthropic"));
  const [prompt, setPrompt] = useState(
    "Respondé en una sola oración: ¿para qué sirve comparar varios LLMs a la vez?",
  );
  // Ticks: fuerzan re-render tras mutar vault/probe (viven fuera de React).
  const [, setVaultTick] = useState(0);
  const [, setProbeTick] = useState(0);
  const [probing, setProbing] = useState(false);
  const [run, setRun] = useState<RunState>(IDLE_RUN);
  const [abortFn, setAbortFn] = useState<(() => void) | null>(null);

  const declaredCors = PROVIDER_CAPABILITIES[providerId]?.browserCors.status ?? "unverified";
  const probed = readCorsProbe(providerId);
  const resolution = resolveByokRoute(providerId);
  const keyMask = maskKey(providerId);
  const running =
    run.phase === "streaming" || run.phase === "reconnecting" || run.phase === "resumed";

  const pickProvider = (id: string) => {
    setProviderId(id);
    setModel(BYOK_PROVIDERS[id]?.defaultModel ?? "");
    setPersist(isPersisted(id));
  };

  const saveKey = () => {
    const value = keyDraft.trim();
    if (!value) return;
    setKey(providerId, value, { persist });
    setKeyDraft(""); // la llave no se queda en el estado de React
    setVaultTick((t) => t + 1);
  };

  const dropKey = () => {
    clearKey(providerId);
    setVaultTick((t) => t + 1);
  };

  const reprobe = async () => {
    setProbing(true);
    clearCorsProbe(providerId);
    await probeCors(providerId);
    setProbing(false);
    setProbeTick((t) => t + 1);
  };

  const send = () => {
    setRun({ phase: "streaming", route: "…", text: "", tokens: "", log: [ts("enviando…")] });
    const handle = sendByokPrompt(
      {
        providerId,
        prompt,
        ...(model.trim() && model.trim() !== provider.defaultModel
          ? { model: model.trim() }
          : {}),
      },
      {
        onRoute: (route) =>
          setRun((s) => ({ ...s, route, log: [...s.log, ts(`ruta: ${route}`)] })),
        onDelta: (text) =>
          setRun((s) => ({
            ...s,
            phase: s.phase === "reconnecting" ? "resumed" : s.phase === "resumed" ? "resumed" : "streaming",
            text: s.text + text,
          })),
        onDone: ({ tokensIn, tokensOut }) =>
          setRun((s) => ({
            ...s,
            phase: "done",
            tokens: `tokens in ${tokensIn ?? "?"} · out ${tokensOut ?? "?"}`,
            log: [...s.log, ts("done")],
          })),
        onError: (message) =>
          setRun((s) => ({ ...s, phase: "error", log: [...s.log, ts(`error: ${message}`)] })),
        onAborted: () =>
          setRun((s) => ({
            ...s,
            phase: "aborted",
            log: [...s.log, ts("aborted (stop del usuario o piso A)")],
          })),
        onReconnecting: () =>
          setRun((s) => ({
            ...s,
            phase: "reconnecting",
            log: [...s.log, ts("Port caído; reconectando…")],
          })),
        onResumed: () =>
          setRun((s) => ({
            ...s,
            log: [...s.log, ts("reanudación pedida; reproduciendo buffer…")],
          })),
      },
    );
    setAbortFn(() => handle.abort);
  };

  return (
    <section className="rounded-lg border border-dashed border-border bg-surface-elevated p-3">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs uppercase tracking-wide text-text-secondary">
          byok · panel de Fase 2
        </span>
        <select
          value={providerId}
          onChange={(e) => pickProvider(e.target.value)}
          disabled={running}
          className="rounded border border-border bg-bg-base px-2 py-1 font-mono text-xs text-text-primary"
        >
          {BYOK_PROVIDER_IDS.map((id) => (
            <option key={id} value={id}>
              {BYOK_PROVIDERS[id]?.label ?? id}
            </option>
          ))}
        </select>
        <span className="flex items-center gap-1.5 font-mono text-xs">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: PHASE_COLOR[run.phase] }}
            aria-hidden
          />
          {run.phase}
        </span>
        <span className="font-mono text-xs text-text-secondary">ruta: {run.route}</span>
        {run.tokens && <span className="font-mono text-xs text-text-secondary">{run.tokens}</span>}
      </div>

      {/* Custodia (key-vault): la llave nunca sale de este navegador. */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-text-secondary">
          llave: {keyMask ?? "— sin configurar"}
        </span>
        <input
          type="password"
          value={keyDraft}
          onChange={(e) => setKeyDraft(e.target.value)}
          placeholder="pegar API key (queda sólo en este navegador)"
          autoComplete="off"
          className="w-72 rounded border border-border bg-bg-base px-2 py-1 font-mono text-xs text-text-primary placeholder:text-text-secondary"
        />
        <label className="flex items-center gap-1 font-mono text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={persist}
            onChange={(e) => setPersist(e.target.checked)}
          />
          persistir
        </label>
        <button
          type="button"
          onClick={saveKey}
          disabled={!keyDraft.trim()}
          className="rounded-md border border-accent-primary px-2 py-1 text-xs font-medium text-accent-primary disabled:cursor-not-allowed disabled:border-border disabled:text-text-secondary disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={dropKey}
          disabled={!keyMask}
          className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          Borrar
        </button>
      </div>

      {/* CORS: declarado vs medido (E7), routing resultante. */}
      <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-xs text-text-secondary">
        <span>
          cors declarado: <span className="text-text-primary">{declaredCors}</span>
        </span>
        <span>
          medido:{" "}
          <span className="text-text-primary">
            {probed ? `${probed.status} (${probed.verifiedAt.slice(0, 19)})` : "— sin probe"}
          </span>
        </span>
        <button
          type="button"
          onClick={() => void reprobe()}
          disabled={probing}
          className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary disabled:opacity-50"
        >
          {probing ? "probando…" : "Probe CORS"}
        </button>
        {resolution.route === "unavailable" && (
          <span className="text-[#f59e0b]">no disponible: {resolution.reason}</span>
        )}
      </div>

      {/* Envío. */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={running}
          className="w-52 rounded border border-border bg-bg-base px-2 py-1 font-mono text-xs text-text-primary"
          title="modelo (override; default del proveedor)"
        />
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={running}
          className="min-w-72 flex-1 rounded border border-border bg-bg-base px-2 py-1 text-xs text-text-primary"
        />
        <button
          type="button"
          onClick={send}
          disabled={running || !hasKey(providerId) || resolution.route === "unavailable"}
          className="rounded-md border border-accent-primary px-3 py-1 text-xs font-medium text-accent-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:border-border disabled:text-text-secondary disabled:opacity-50"
        >
          Enviar
        </button>
        <button
          type="button"
          onClick={() => abortFn?.()}
          disabled={!running}
          className="rounded-md border border-border px-3 py-1 text-xs text-text-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          Abortar
        </button>
        {extensionStatus.state !== "connected" && (
          <span className="font-mono text-xs text-text-secondary">
            (extensión no conectada: sólo rutas directas)
          </span>
        )}
      </div>

      {run.text && (
        <pre className="mb-2 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-border bg-bg-base p-2 font-mono text-[11px] leading-relaxed text-text-primary">
          {run.text}
        </pre>
      )}
      {run.log.length > 0 && (
        <pre className="max-h-24 overflow-auto rounded border border-border bg-bg-base p-2 font-mono text-[10px] leading-relaxed text-text-secondary">
          {run.log.join("\n")}
        </pre>
      )}
    </section>
  );
}
