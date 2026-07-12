import { BYOA_PROVIDERS, BYOK_PROVIDERS } from "@chatcouncil/adapters";
import { encodePanelSourceId, type ConnectionModeId, type CuratedModel } from "@chatcouncil/shared";
import { hasKey } from "./key-vault";

export interface PanelOption {
  panelSourceId: string;
  connectionMode: ConnectionModeId;
  providerId: string;
  label: string;
  /**
   * Disponible AHORA para este usuario puntual — no "existe en el
   * registro". BYOK: hay llave guardada en el vault. BYOA: la sesión se
   * detectó y confirmó en esta carga de la app (E4, requisito de Juan:
   * mostrar sólo lo que él puede usar con su BYOK/BYOA real).
   */
  available: boolean;
  unavailableReason?: string;
  models: CuratedModel[];
  /** Id a usar cuando el usuario no eligió modelo explícito para este panel. */
  defaultModelId: string;
}

/** Qué proveedores BYOA tienen sesión confirmada en esta carga (E8, poblado por la UI de detección). */
export interface AvailabilityContext {
  byoaSessionConfirmed: ReadonlySet<string>;
}

const BYOA_ACCOUNT_DEFAULT_SENTINEL = "(default de la cuenta)";

export function listPanelOptions(ctx: AvailabilityContext): PanelOption[] {
  const out: PanelOption[] = [];

  for (const cfg of Object.values(BYOK_PROVIDERS)) {
    const available = hasKey(cfg.id);
    const opt: PanelOption = {
      panelSourceId: encodePanelSourceId({ connectionMode: "byok", providerId: cfg.id }),
      connectionMode: "byok",
      providerId: cfg.id,
      label: cfg.label,
      available,
      models: cfg.models ?? [],
      defaultModelId: cfg.defaultModel,
    };
    if (!available) opt.unavailableReason = "sin llave guardada — cargala en el panel BYOK";
    out.push(opt);
  }

  for (const cfg of Object.values(BYOA_PROVIDERS)) {
    const available = ctx.byoaSessionConfirmed.has(cfg.id);
    const opt: PanelOption = {
      panelSourceId: encodePanelSourceId({ connectionMode: "byoa", providerId: cfg.id }),
      connectionMode: "byoa",
      providerId: cfg.id,
      label: cfg.label,
      available,
      models: cfg.models ?? [],
      defaultModelId: BYOA_ACCOUNT_DEFAULT_SENTINEL,
    };
    if (!available) opt.unavailableReason = "sesión no detectada — confirmala en el selector de organización";
    out.push(opt);
  }

  return out;
}

export function isAccountDefaultModel(modelId: string): boolean {
  return modelId === BYOA_ACCOUNT_DEFAULT_SENTINEL;
}

/**
 * Nombre visible de un panel a partir de su id compuesto (Fase 5: lo
 * consumen el PDF y el nombre de-anonimizado del juez). Cae al id crudo
 * si el proveedor no está en los registros — mejor un id feo que un
 * "(desconocido)" que esconde el dato.
 */
export function panelDisplayLabel(panelSourceId: string): string {
  const [mode, providerId] = panelSourceId.split(":");
  if (!providerId) return panelSourceId;
  const cfg = mode === "byok" ? BYOK_PROVIDERS[providerId] : BYOA_PROVIDERS[providerId];
  if (!cfg) return panelSourceId;
  return mode === "byoa" ? `${cfg.label} (sesión)` : cfg.label;
}
