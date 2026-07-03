import { useCouncilStore } from "@/store/useCouncilStore";

export function ExtensionBadge() {
  const status = useCouncilStore((s) => s.extensionStatus);

  if (status.state === "checking") {
    return (
      <div className="rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-xs text-text-secondary">
        Buscando la extension de ChatCouncil...
      </div>
    );
  }

  if (status.state === "connected") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-xs text-text-secondary">
        <span className="h-1.5 w-1.5 rounded-full bg-accent-secondary" aria-hidden />
        Extension conectada · v{status.extensionVersion} · {status.adapters.length} adaptadores
      </div>
    );
  }

  const message = status.state === "outdated" ? "Extension desactualizada" : "Extension no instalada";

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-xs">
      <span className="text-text-secondary">{message} — BYOA no disponible.</span>
      <a
        href={status.downloadUrl}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-accent-primary hover:underline"
      >
        Descargar extension
      </a>
    </div>
  );
}
