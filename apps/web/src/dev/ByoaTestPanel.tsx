import { useState } from "react";
import { BYOA_PROVIDERS } from "@chatcouncil/adapters";
import { useCouncilStore } from "@/store/useCouncilStore";
import { bridgeClient } from "@/lib/bridge-client";
import { sendByoaPrompt } from "@/lib/byoa-client";

/**
 * Panel BYOA de Fase 3 (camino B+) — harness de gate + aceptación.
 * ------------------------------------------------------------------
 * Mismo ciclo de vida que los paneles de Fase 1/2: MONTADO en App.tsx
 * durante la fase; al cierre se retira el import y queda acá.
 *
 * Dos partes:
 *   1. GATE (make-or-break): "Detectar sesión Claude" hace un GET real a
 *      `/api/organizations` vía `byoa:proxy` (offscreen, credentials:include).
 *      200 + orgs = la cookie de sesión viajó desde la extensión → viable.
 *   2. ENVÍO: elegís una org, escribís un prompt y `sendByoaPrompt` corre
 *      la máquina de dos pasos (crear conversación + completion) por el
 *      contrato Adapter, con las fases reconnecting/resumed del puente
 *      visibles (criterio: matar el SW a mitad de stream preserva contenido).
 *
 * El código NUNCA lee ni imprime la cookie: la adjunta el navegador. Los
 * IDs de organización/conversación son identificadores (no secretos).
 */

type Phase = "idle" | "streaming" | "reconnecting" | "resumed" | "done" | "aborted" | "error";

const PHASE_COLOR: Record<Phase, string> = {
  idle: "#8a8a8a",
  streaming: "#00e5ff",
  reconnecting: "#f59e0b",
  resumed: "#00e5ff",
  done: "#10b981",
  aborted: "#ef4444",
  error: "#ef4444",
};

interface OrgLite {
  id: string;
  name: string;
}

interface RunState {
  phase: Phase;
  text: string;
  tokens: string;
  log: string[];
}

const IDLE_RUN: RunState = { phase: "idle", text: "", tokens: "", log: [] };

function ts(line: string): string {
  return `${new Date().toISOString().slice(11, 19)} ${line}`;
}

export function ByoaTestPanel() {
  const extensionStatus = useCouncilStore((s) => s.extensionStatus);

  const claude = BYOA_PROVIDERS.claude!;
  const orgsUrl = `${claude.sessionOrigin}/api/organizations`;

  const [detecting, setDetecting] = useState(false);
  const [detectLog, setDetectLog] = useState<string[]>([]);
  const [orgs, setOrgs] = useState<OrgLite[]>([]);
  const [orgId, setOrgId] = useState("");

  const [prompt, setPrompt] = useState("Respondé en una sola oración: ¿qué es un consejo de modelos?");
  const [run, setRun] = useState<RunState>(IDLE_RUN);
  const [abortFn, setAbortFn] = useState<(() => void) | null>(null);

  const running = run.phase === "streaming" || run.phase === "reconnecting" || run.phase === "resumed";
  const connected = extensionStatus.state === "connected";

  const detect = () => {
    setDetecting(true);
    setDetectLog([ts(`GET ${orgsUrl} — fetch de sesión (credentials:include) vía la extensión…`)]);
    let buf = "";
    bridgeClient.byoaProxy(
      { url: orgsUrl, method: "GET", headers: { accept: "application/json" }, stream: false },
      {
        onChunk: (_seq, chunk) => {
          buf += chunk;
        },
        onDone: () => {
          setDetecting(false);
          try {
            const parsed: unknown = JSON.parse(buf);
            const list = Array.isArray(parsed) ? parsed : [];
            const lite: OrgLite[] = list.map((o) => {
              const rec = (o ?? {}) as Record<string, unknown>;
              return { id: String(rec.uuid ?? rec.id ?? "?"), name: String(rec.name ?? "(sin nombre)") };
            });
            setOrgs(lite);
            if (lite[0] && !orgId) setOrgId(lite[0].id);
            setDetectLog((l) => [...l, ts(`200 OK · ${lite.length} organización(es) → sesión detectada`)]);
          } catch {
            setDetectLog((l) => [...l, ts("respuesta no-JSON (¿HTML de login?) — la sesión NO autenticó")]);
          }
        },
        onError: (message) => {
          setDetecting(false);
          setDetectLog((l) => [...l, ts(`error: ${message}`)]);
        },
        onAborted: () => {
          setDetecting(false);
          setDetectLog((l) => [...l, ts("abortado / sin extensión (piso A) — recargá la extensión y reintentá")]);
        },
      },
    );
  };

  const send = () => {
    setRun({ phase: "streaming", text: "", tokens: "", log: [ts("enviando… (paso 1: crear conversación)")] });
    const handle = sendByoaPrompt(
      { providerId: "claude", orgId, prompt },
      {
        onDelta: (text) =>
          setRun((s) => ({
            ...s,
            phase: s.phase === "reconnecting" || s.phase === "resumed" ? "resumed" : "streaming",
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
          setRun((s) => ({ ...s, phase: "reconnecting", log: [...s.log, ts("Port caído; reconectando…")] })),
        onResumed: () =>
          setRun((s) => ({ ...s, log: [...s.log, ts("reanudación pedida; reproduciendo buffer…")] })),
      },
    );
    setAbortFn(() => handle.abort);
  };

  return (
    <section className="rounded-lg border border-dashed border-border bg-surface-elevated p-3">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs uppercase tracking-wide text-text-secondary">
          byoa · panel de Fase 3
        </span>
        <span className="flex items-center gap-1.5 font-mono text-xs">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: PHASE_COLOR[run.phase] }}
            aria-hidden
          />
          {run.phase}
        </span>
        {run.tokens && <span className="font-mono text-xs text-text-secondary">{run.tokens}</span>}
        <span className="font-mono text-xs text-text-secondary">sesión: {claude.sessionOrigin}</span>
      </div>

      {/* GATE: detectar la sesión + elegir organización. */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={detect}
          disabled={detecting}
          className="rounded-md border border-accent-primary px-3 py-1 text-xs font-medium text-accent-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:border-border disabled:text-text-secondary disabled:opacity-50"
        >
          {detecting ? "detectando…" : "Detectar sesión Claude"}
        </button>
        <select
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
          disabled={running || orgs.length === 0}
          className="max-w-64 rounded border border-border bg-bg-base px-2 py-1 font-mono text-xs text-text-primary disabled:opacity-50"
          title="organización de sesión"
        >
          {orgs.length === 0 && <option value="">— sin sesión detectada —</option>}
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        {!connected && (
          <span className="font-mono text-xs text-text-secondary">
            (extensión no conectada: cargá .output/chrome-mv3 unpacked)
          </span>
        )}
      </div>

      {detectLog.length > 0 && (
        <pre className="mb-2 max-h-16 overflow-auto rounded border border-border bg-bg-base p-2 font-mono text-[10px] leading-relaxed text-text-secondary">
          {detectLog.join("\n")}
        </pre>
      )}

      {/* ENVÍO. */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
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
          disabled={running || !connected || !orgId}
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
