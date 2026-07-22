import { create } from "zustand";
import type { ExtensionStatus } from "@/lib/bridge-client";
import type { ByoaOrganization } from "@/lib/byoa-org";

export const PANEL_COUNT_OPTIONS = [1, 2, 3, 4, 6, 8, 10] as const;
export type PanelCount = (typeof PANEL_COUNT_OPTIONS)[number];

/**
 * Lista de prioridad editable (Q25b), ahora en ids compuestos (E1):
 * sólo los paneles que HOY tienen adaptador real. Los ~10 BYOA
 * restantes (glm/mistral/groq/xai/openrouter/...) son pista paralela —
 * entran a esta lista cuando tengan adaptador, no antes (mostrar un
 * panel sin adaptador confundiría con "disponible" cuando no lo está).
 */
const DEFAULT_PRIORITY: string[] = [
  "byok:openai",
  "byok:anthropic",
  "byok:google",
  "byoa:claude",
  "byok:deepseek",
  "byok:perplexity",
];

interface CouncilState {
  // --- Composición pre-lock (Q25b): editable hasta el primer envío ---
  priorityPanelSourceIds: string[];
  panelCount: PanelCount;
  setPanelCount: (count: PanelCount) => void;
  reorderPriority: (next: string[]) => void;

  // --- Conversación activa: post-lock, Dexie es la fuente de verdad ---
  activeConversationId: string | null;
  isLayoutLocked: boolean;
  lockedPanelSourceIds: string[];
  /** Al abrir/crear una conversación: refleja su estado de lock real (o null = composer nuevo). */
  setActiveConversation: (conversationId: string | null, lockedPanelSourceIds: string[]) => void;
  /** E6: dispara el lock. Llamado por conversation-repo al crear el Round 1, nunca antes. */
  lockLayout: (panelSourceIds: string[]) => void;

  // --- Ocultar sin borrar (Q14a) — sólo aplica sobre una conversación ya lockeada ---
  hiddenPanelSourceIds: string[];
  toggleHidden: (panelSourceId: string) => void;

  // --- Estado de extensión + sesión/organización BYOA (E8) ---
  extensionStatus: ExtensionStatus;
  setExtensionStatus: (status: ExtensionStatus) => void;
  byoaOrgsByProvider: Record<string, ByoaOrganization[]>;
  byoaSelectedOrgIdByProvider: Record<string, string>;
  byoaSessionConfirmed: Set<string>;
  setByoaSession: (providerId: string, orgs: ByoaOrganization[], selectedOrgId: string) => void;
  setByoaSelectedOrg: (providerId: string, orgId: string) => void;

  // --- Override de modelo por panel para el PRÓXIMO envío (E4: por Round, no lockeado con la fuente) ---
  modelOverrideByPanel: Record<string, string>;
  setModelOverride: (panelSourceId: string, modelId: string) => void;

  // --- Fase 10 (E1): el vault vive fuera de React; este contador avisa a
  // los consumidores de listPanelOptions() que una llave cambió ---
  keyVaultVersion: number;
  bumpKeyVaultVersion: () => void;

  // --- Fase 5: input global compartido (Q29: la librería de plantillas inyecta acá) + toggles Q31 + panel de herramientas ---
  composePrompt: string;
  setComposePrompt: (value: string) => void;
  /** Q31: se persiste en Round.toggles. imageGeneration queda fija en false (diferida a v1.5 en la propia matriz). */
  composeWebSearch: boolean;
  setComposeWebSearch: (value: boolean) => void;
  toolsPanelOpen: boolean;
  setToolsPanelOpen: (open: boolean) => void;

  // --- Fase 6: identidad (Supabase, Q19) + token Google (GIS) + estado de sync (Q17/Q20) ---
  /** Email de la sesión Supabase (identidad pura) — default del destinatario en "Enviar por mail". */
  accountEmail: string | null;
  setAccountEmail: (email: string | null) => void;
  /** true si hay un access token GIS vigente en memoria (drive.appdata + gmail.send, E6). */
  googleTokenReady: boolean;
  setGoogleTokenReady: (ready: boolean) => void;
  syncStatus: "off" | "idle" | "syncing" | "error";
  syncLastAt: number | null;
  syncMessage: string | null;
  setSyncState: (status: "off" | "idle" | "syncing" | "error", lastAt: number | null, message: string | null) => void;

  /** Paneles activos AHORA: si hay conversación lockeada, sus lockedModelIds (menos hidden); si no, el top-N de prioridad. */
  activePanelSourceIds: () => string[];
}

export const useCouncilStore = create<CouncilState>((set, get) => ({
  priorityPanelSourceIds: DEFAULT_PRIORITY,
  panelCount: 6,
  setPanelCount: (count) => {
    if (get().isLayoutLocked) return; // Q14: lock duro, se ignora el cambio
    set({ panelCount: count });
  },
  reorderPriority: (next) => {
    if (get().isLayoutLocked) return;
    set({ priorityPanelSourceIds: next });
  },

  activeConversationId: null,
  isLayoutLocked: false,
  lockedPanelSourceIds: [],
  setActiveConversation: (conversationId, lockedPanelSourceIds) =>
    set({
      activeConversationId: conversationId,
      isLayoutLocked: lockedPanelSourceIds.length > 0,
      lockedPanelSourceIds,
      hiddenPanelSourceIds: [], // se recarga por conversación; hoy no persiste por separado (alcance futuro)
    }),
  lockLayout: (panelSourceIds) => set({ isLayoutLocked: true, lockedPanelSourceIds: panelSourceIds }),

  hiddenPanelSourceIds: [],
  toggleHidden: (panelSourceId) =>
    set((s) => ({
      hiddenPanelSourceIds: s.hiddenPanelSourceIds.includes(panelSourceId)
        ? s.hiddenPanelSourceIds.filter((id) => id !== panelSourceId)
        : [...s.hiddenPanelSourceIds, panelSourceId],
    })),

  extensionStatus: { state: "checking" },
  setExtensionStatus: (status) => set({ extensionStatus: status }),
  byoaOrgsByProvider: {},
  byoaSelectedOrgIdByProvider: {},
  byoaSessionConfirmed: new Set(),
  setByoaSession: (providerId, orgs, selectedOrgId) =>
    set((s) => ({
      byoaOrgsByProvider: { ...s.byoaOrgsByProvider, [providerId]: orgs },
      byoaSelectedOrgIdByProvider: { ...s.byoaSelectedOrgIdByProvider, [providerId]: selectedOrgId },
      byoaSessionConfirmed: new Set(s.byoaSessionConfirmed).add(providerId),
    })),
  setByoaSelectedOrg: (providerId, orgId) =>
    set((s) => ({ byoaSelectedOrgIdByProvider: { ...s.byoaSelectedOrgIdByProvider, [providerId]: orgId } })),

  modelOverrideByPanel: {},
  setModelOverride: (panelSourceId, modelId) =>
    set((s) => ({ modelOverrideByPanel: { ...s.modelOverrideByPanel, [panelSourceId]: modelId } })),

  keyVaultVersion: 0,
  bumpKeyVaultVersion: () => set((s) => ({ keyVaultVersion: s.keyVaultVersion + 1 })),

  composePrompt: "",
  setComposePrompt: (value) => set({ composePrompt: value }),
  composeWebSearch: false,
  setComposeWebSearch: (value) => set({ composeWebSearch: value }),
  toolsPanelOpen: true,
  setToolsPanelOpen: (open) => set({ toolsPanelOpen: open }),

  accountEmail: null,
  setAccountEmail: (email) => set({ accountEmail: email }),
  googleTokenReady: false,
  setGoogleTokenReady: (ready) => set({ googleTokenReady: ready }),
  syncStatus: "off",
  syncLastAt: null,
  syncMessage: null,
  setSyncState: (status, lastAt, message) => set({ syncStatus: status, syncLastAt: lastAt, syncMessage: message }),

  activePanelSourceIds: () => {
    const s = get();
    if (s.isLayoutLocked) {
      return s.lockedPanelSourceIds.filter((id) => !s.hiddenPanelSourceIds.includes(id));
    }
    return s.priorityPanelSourceIds.slice(0, s.panelCount);
  },
}));
