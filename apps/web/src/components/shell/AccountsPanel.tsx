import { ExternalLink, X } from "lucide-react";
import { useEffect, useState } from "react";
import { BYOA_PROVIDERS, BYOK_PROVIDERS, BYOK_PROVIDER_IDS } from "@chatcouncil/adapters";
import { Badge, Button, Section } from "@chatcouncil/ui";
import { detectByoaOrganizations } from "@/lib/byoa-org";
import { resolveByokRoute, sendByokPrompt } from "@/lib/byok-client";
import { clearKey, hasKey, isPersisted, maskKey, setKey } from "@/lib/key-vault";
import { useCouncilStore } from "@/store/useCouncilStore";

/**
 * Panel de cuentas de PRODUCCIÓN — Fase 10, E1/E2 (§0.12)
 * ------------------------------------------------------------------
 * La UI real (no dev) para gestionar llaves BYOK y ver el estado de
 * sesión BYOA. Modal accesible desde el header del shell. Importa el
 * key-vault con autorización explícita en el allowlist de
 * `scripts/guard-key-vault.mjs`: es el sucesor de producción de
 * ByokTestPanel. Igual que allí, la llave jamás se imprime (sólo
 * maskKey) y el draft se limpia del estado de React al guardar.
 *
 * "Probar" (E2): completion mínima (maxTokens=1) al modelo default del
 * proveedor — nunca automático al guardar. El resultado reusa el
 * routing real (directo/proxy), así que también detecta "extensión no
 * conectada" como causa de indisponibilidad.
 */

type TestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "valid" }
  | { kind: "invalid"; message: string };

function ByokProviderRow({ providerId }: { providerId: string }) {
  const bumpKeyVaultVersion = useCouncilStore((s) => s.bumpKeyVaultVersion);
  const cfg = BYOK_PROVIDERS[providerId];
  const [keyDraft, setKeyDraft] = useState("");
  const [persist, setPersist] = useState(() => isPersisted(providerId));
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [, setTick] = useState(0);

  if (!cfg) return null;
  const mask = maskKey(providerId);

  const save = () => {
    const value = keyDraft.trim();
    if (!value) return;
    setKey(providerId, value, { persist });
    setKeyDraft(""); // la llave no se queda en el estado de React
    setTest({ kind: "idle" });
    setTick((t) => t + 1);
    bumpKeyVaultVersion();
  };

  const drop = () => {
    clearKey(providerId);
    setTest({ kind: "idle" });
    setTick((t) => t + 1);
    bumpKeyVaultVersion();
  };

  const probe = () => {
    const resolution = resolveByokRoute(providerId);
    if (resolution.route === "unavailable") {
      setTest({ kind: "invalid", message: resolution.reason });
      return;
    }
    setTest({ kind: "testing" });
    sendByokPrompt(
      { providerId, prompt: "ok", maxTokens: 1 },
      {
        onDelta: () => {},
        onDone: () => setTest({ kind: "valid" }),
        onError: (message) => setTest({ kind: "invalid", message }),
        onAborted: () => setTest({ kind: "idle" }),
      },
    );
  };

  return (
    <div className="flex flex-col gap-1.5 border-b border-border py-2 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-40 text-sm text-text-primary">{cfg.label}</span>
        <span className="font-mono text-xs text-text-secondary">
          {mask ?? "sin llave guardada"}
        </span>
        {test.kind === "valid" && <Badge variant="secondary">llave válida</Badge>}
        {test.kind === "testing" && <span className="text-xs text-text-secondary">probando…</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="password"
          value={keyDraft}
          onChange={(e) => setKeyDraft(e.target.value)}
          placeholder={mask ? "pegar llave nueva para reemplazar" : "pegar API key (queda solo en este navegador)"}
          aria-label={`Llave de API de ${cfg.label}`}
          autoComplete="off"
          className="w-64 rounded border border-border bg-bg-base px-2 py-1 font-mono text-xs text-text-primary placeholder:text-text-secondary"
        />
        <label className="flex items-center gap-1 text-xs text-text-secondary" title="Sin esta opción, la llave se descarta al cerrar la pestaña.">
          <input type="checkbox" checked={persist} onChange={(e) => setPersist(e.target.checked)} />
          recordar
        </label>
        <Button variant="accent" onClick={save} disabled={!keyDraft.trim()} aria-label={`Guardar la llave de ${cfg.label}`}>
          Guardar
        </Button>
        <Button onClick={probe} disabled={!hasKey(providerId) || test.kind === "testing"} aria-label={`Probar la llave de ${cfg.label}`} title="Envía una petición mínima (1 token) al proveedor para verificar la llave.">
          Probar
        </Button>
        <Button onClick={drop} disabled={!hasKey(providerId)} aria-label={`Borrar la llave de ${cfg.label}`}>
          Borrar
        </Button>
      </div>
      {test.kind === "invalid" && (
        <p className="text-xs text-danger">llave o ruta no válida: {test.message}</p>
      )}
    </div>
  );
}

function ByoaProviderRow({ providerId }: { providerId: string }) {
  const byoaSessionConfirmed = useCouncilStore((s) => s.byoaSessionConfirmed);
  const byoaOrgsByProvider = useCouncilStore((s) => s.byoaOrgsByProvider);
  const setByoaSession = useCouncilStore((s) => s.setByoaSession);
  const extensionStatus = useCouncilStore((s) => s.extensionStatus);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cfg = BYOA_PROVIDERS[providerId];
  if (!cfg) return null;
  const confirmed = byoaSessionConfirmed.has(providerId);
  const orgs = byoaOrgsByProvider[providerId] ?? [];
  const extensionReady = extensionStatus.state === "connected";

  const detect = () => {
    setDetecting(true);
    setError(null);
    detectByoaOrganizations(cfg.sessionOrigin)
      .then((detected) => {
        if (detected[0]) setByoaSession(providerId, detected, detected[0].id);
        else setError("la cuenta no tiene organizaciones visibles");
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setDetecting(false));
  };

  return (
    <div className="flex flex-col gap-1.5 border-b border-border py-2 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-40 text-sm text-text-primary">{cfg.label}</span>
        {confirmed ? (
          <Badge variant="secondary">sesión detectada{orgs.length > 1 ? ` · ${orgs.length} organizaciones` : ""}</Badge>
        ) : (
          <span className="text-xs text-text-secondary">sesión no detectada</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="accent" onClick={detect} disabled={detecting || !extensionReady} title={extensionReady ? undefined : "Requiere la extensión de ChatCouncil conectada."}>
          {detecting ? "detectando…" : confirmed ? "Volver a detectar" : "Detectar sesión"}
        </Button>
        <a
          href={cfg.sessionOrigin}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs text-accent-primary hover:underline"
        >
          <ExternalLink size={12} aria-hidden />
          abrir {cfg.label} para iniciar sesión
        </a>
        {!extensionReady && (
          <span className="text-xs text-text-secondary">extensión no conectada</span>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function AccountsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Cuentas y llaves"
    >
      <div className="mt-8 w-full max-w-2xl rounded-lg border border-border bg-surface-elevated p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">Cuentas y llaves</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded p-1 text-text-secondary hover:text-text-primary"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <Section title="Llaves de API (BYOK)" className="mb-4">
          <p className="mb-1 text-xs text-text-secondary">
            Las llaves quedan solo en este navegador; nunca se sincronizan ni salen hacia otro
            servicio que no sea el proveedor.
          </p>
          {BYOK_PROVIDER_IDS.map((id) => (
            <ByokProviderRow key={id} providerId={id} />
          ))}
        </Section>

        <Section title="Sesiones de proveedor (BYOA)">
          <p className="mb-1 text-xs text-text-secondary">
            Usa la sesión que ya tienes abierta en el proveedor, a través de la extensión.
          </p>
          {Object.keys(BYOA_PROVIDERS).map((id) => (
            <ByoaProviderRow key={id} providerId={id} />
          ))}
        </Section>
      </div>
    </div>
  );
}
