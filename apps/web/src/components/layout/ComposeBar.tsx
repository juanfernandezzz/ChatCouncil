import { useShallow } from "zustand/react/shallow";
import { parsePanelSourceId, PROVIDER_CAPABILITIES, type SupportLevel } from "@chatcouncil/shared";
import { useState } from "react";
import {
  createPendingReply,
  createRound,
  dispatchReply,
  ensureConversationForFirstSend,
} from "@/lib/conversation-repo";
import { setLastConversationId } from "@/lib/last-conversation";
import { isAccountDefaultModel, listPanelOptions, panelDisplayLabel } from "@/lib/model-registry";
import { useCouncilStore } from "@/store/useCouncilStore";

/**
 * Input global (Q13: excepciones aparte — retry y "continuar solo
 * aquí" viven en cada PanelCard, no acá). Un envío = un Round nuevo,
 * mandado a TODOS los paneles activos y disponibles del set lockeado
 * (o del set en composición, si todavía no hay lock).
 *
 * Fase 5:
 *  · el texto vive en el STORE (composePrompt) para que la librería de
 *    plantillas (Q29) pueda inyectar el resultado interpolado.
 *  · chips de toggles (Q31) que CONSULTAN PROVIDER_CAPABILITIES en vez
 *    de hardcodear soporte; el estado se persiste en Round.toggles.
 *    Honestidad del chip: es informativo+persistido — el contrato
 *    Adapter v1 no transporta el toggle a la request (exclusión de
 *    Fase 2); el tooltip lo declara para no ser un interruptor
 *    mentiroso. Cablearlo al transporte es una fase posterior (E6=A).
 *  · imageGeneration se renderiza deshabilitado: la propia matriz lo
 *    marca "diferido a v1.5".
 */

function webSearchTooltip(activePanelSourceIds: string[]): string {
  const groups: Record<SupportLevel, string[]> = { native: [], unknown: [], unsupported: [] };
  for (const id of activePanelSourceIds) {
    const parsed = parsePanelSourceId(id);
    if (!parsed) continue;
    const level: SupportLevel = PROVIDER_CAPABILITIES[parsed.providerId]?.webSearch ?? "unknown";
    groups[level].push(panelDisplayLabel(id));
  }
  const parts: string[] = ["Búsqueda web por proveedor (PROVIDER_CAPABILITIES):"];
  if (groups.native.length > 0) parts.push(`✓ nativo: ${groups.native.join(", ")}`);
  if (groups.unknown.length > 0) parts.push(`? desconocido: ${groups.unknown.join(", ")}`);
  if (groups.unsupported.length > 0) parts.push(`✗ no soporta: ${groups.unsupported.join(", ")}`);
  parts.push("Informativo (Q31): se persiste en el Round; el envío al proveedor se cablea en una fase posterior.");
  return parts.join("\n");
}

export function ComposeBar({ onConversationReady }: { onConversationReady: (conversationId: string) => void }) {
  const [sending, setSending] = useState(false);
  const prompt = useCouncilStore((s) => s.composePrompt);
  const setPrompt = useCouncilStore((s) => s.setComposePrompt);
  const webSearch = useCouncilStore((s) => s.composeWebSearch);
  const setWebSearch = useCouncilStore((s) => s.setComposeWebSearch);
  const activeConversationId = useCouncilStore((s) => s.activeConversationId);
  const activePanelSourceIds = useCouncilStore(useShallow((s) => s.activePanelSourceIds()));
  const lockLayout = useCouncilStore((s) => s.lockLayout);
  const byoaSessionConfirmed = useCouncilStore((s) => s.byoaSessionConfirmed);
  const byoaSelectedOrgIdByProvider = useCouncilStore((s) => s.byoaSelectedOrgIdByProvider);
  const modelOverrideByPanel = useCouncilStore((s) => s.modelOverrideByPanel);

  const handleSend = async () => {
    const text = prompt.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      let conversationId = activeConversationId;
      if (!conversationId) {
        // E6: acá se dispara el lock — se escribe UNA vez, con el set activo de este instante.
        const conv = await ensureConversationForFirstSend(activePanelSourceIds);
        conversationId = conv.id;
        lockLayout(activePanelSourceIds);
        setLastConversationId(conversationId);
        onConversationReady(conversationId);
      }

      const round = await createRound(conversationId, text, { webSearch, imageGeneration: false });
      const options = listPanelOptions({ byoaSessionConfirmed });
      const optionsById = new Map(options.map((o) => [o.panelSourceId, o]));

      for (const panelSourceId of activePanelSourceIds) {
        const option = optionsById.get(panelSourceId);
        if (!option || !option.available) continue; // E4: no se dispara nada a un panel sin llave/sesión
        const modelId = modelOverrideByPanel[panelSourceId] ?? option.defaultModelId;
        const reply = await createPendingReply({
          conversationId,
          roundId: round.id,
          panelSourceId,
          modelId,
          scope: "round",
        });
        const modelOverride = isAccountDefaultModel(modelId) ? undefined : modelId;
        const orgId = byoaSelectedOrgIdByProvider[option.providerId];
        void dispatchReply(reply, reply.attempts[0]!.id, text, modelOverride, orgId);
      }

      setPrompt("");
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void handleSend();
      }}
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface-elevated p-2"
    >
      <div className="flex items-center gap-2 px-1">
        <button
          type="button"
          onClick={() => setWebSearch(!webSearch)}
          title={webSearchTooltip(activePanelSourceIds)}
          className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
            webSearch
              ? "border-accent-primary text-accent-primary"
              : "border-border text-text-secondary hover:border-text-secondary"
          }`}
        >
          🔎 búsqueda web{webSearch ? " · ON" : ""}
        </button>
        <button
          type="button"
          disabled
          title="Generación de imagen: diferida a v1.5 (Q31) — modelada en la matriz, sin UI activa todavía."
          className="cursor-not-allowed rounded-full border border-border px-2.5 py-0.5 text-[11px] text-text-secondary opacity-40"
        >
          🖼 imagen · v1.5
        </button>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Prompt para todo el council…"
          className="flex-1 bg-transparent px-2 py-1.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none"
        />
        <button
          type="submit"
          disabled={!prompt.trim() || sending}
          className="rounded-md bg-accent-primary px-3 py-1.5 text-sm font-medium text-bg-base transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Enviar
        </button>
      </div>
    </form>
  );
}
