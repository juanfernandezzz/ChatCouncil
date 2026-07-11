/**
 * Identidad de panel — ChatCouncil (Fase 4, E1)
 * ------------------------------------------------------------------
 * Por qué existe: `PROVIDER_CAPABILITIES` y los registros BYOK/BYOA usan
 * el MISMO espacio de ids de proveedor ("openai", "anthropic", "google",
 * ...) para dos cosas distintas. BYOA-claude ya rompe la correspondencia
 * 1:1 (se llama "claude", no "anthropic"), y `adapters.json.byoaPriority`
 * anticipa un futuro BYOA-"openai" (ChatGPT vía sesión) ADEMÁS del
 * BYOK-"openai" que ya existe — mismo string, dos implementaciones. Un
 * panel del grid no puede identificarse sólo por `providerId`: necesita
 * (familia, proveedor).
 *
 * Codificación elegida: un id compuesto "byok:openai" / "byoa:claude",
 * guardado en los mismos `string[]` que ya existían
 * (`Conversation.lockedModelIds`, `useCouncilStore.priorityModelIds`) —
 * cero migración de esquema para esos campos. El modelo intra-proveedor
 * (Q4) NO va en este id: la fuente (familia+proveedor) se lockea: el
 * modelo se elige por Round (decisión E4 de la entrevista).
 */

export type ConnectionModeId = "byok" | "byoa";

export interface PanelSource {
  connectionMode: ConnectionModeId;
  providerId: string;
}

const SEPARATOR = ":";

/** "byok:openai" — determinístico, usable como key de mapa/lookup. */
export function encodePanelSourceId(source: PanelSource): string {
  return `${source.connectionMode}${SEPARATOR}${source.providerId}`;
}

/**
 * Parsea un id compuesto. `providerId` puede en teoría contener ":" (no
 * lo hace ningún proveedor registrado hoy, pero no se asume) — todo lo
 * que sigue al primer separador es el providerId completo.
 */
export function parsePanelSourceId(id: string): PanelSource | null {
  const sepIndex = id.indexOf(SEPARATOR);
  if (sepIndex <= 0) return null;
  const mode = id.slice(0, sepIndex);
  const providerId = id.slice(sepIndex + 1);
  if (mode !== "byok" && mode !== "byoa") return null;
  if (!providerId) return null;
  return { connectionMode: mode, providerId };
}

/** Guarda de tipo para filtrar listas de strings sin lanzar. */
export function isValidPanelSourceId(id: string): boolean {
  return parsePanelSourceId(id) !== null;
}
