import { create } from "zustand";
import type { ExtensionStatus } from "@/lib/extension-detect";

export const PANEL_COUNT_OPTIONS = [1, 2, 3, 4, 6, 8, 10] as const;
export type PanelCount = (typeof PANEL_COUNT_OPTIONS)[number];

/**
 * Lista de prioridad editable (Q25b). En Fase 4 esto se mueve a
 * Settings y persiste en Dexie; por ahora vive en memoria para que el
 * scaffold sea funcional de inmediato.
 */
const DEFAULT_PRIORITY: string[] = [
  "openai",
  "anthropic",
  "google",
  "deepseek",
  "perplexity",
  "glm",
  "mistral",
  "groq",
  "xai",
  "openrouter",
];

interface CouncilState {
  panelCount: PanelCount;
  priorityModelIds: string[];
  /** Se congela al primer mensaje de la conversacion activa (Q14). */
  isLayoutLocked: boolean;
  extensionStatus: ExtensionStatus;
  setPanelCount: (count: PanelCount) => void;
  setExtensionStatus: (status: ExtensionStatus) => void;
  lockLayout: () => void;
  activeModelIds: () => string[];
}

export const useCouncilStore = create<CouncilState>((set, get) => ({
  panelCount: 6,
  priorityModelIds: DEFAULT_PRIORITY,
  isLayoutLocked: false,
  extensionStatus: { state: "checking" },

  setPanelCount: (count) => {
    if (get().isLayoutLocked) return; // Q14: el lock es duro, se ignora el cambio
    set({ panelCount: count });
  },

  setExtensionStatus: (status) => set({ extensionStatus: status }),

  lockLayout: () => set({ isLayoutLocked: true }),

  activeModelIds: () => get().priorityModelIds.slice(0, get().panelCount),
}));
