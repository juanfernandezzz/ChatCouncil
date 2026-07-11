import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  createPendingReply,
  createRound,
  dispatchReply,
  ensureConversationForFirstSend,
} from "@/lib/conversation-repo";
import { setLastConversationId } from "@/lib/last-conversation";
import { isAccountDefaultModel, listPanelOptions } from "@/lib/model-registry";
import { useCouncilStore } from "@/store/useCouncilStore";

/**
 * Input global (Q13: excepciones aparte — retry y "continuar solo
 * aquí" viven en cada PanelCard, no acá). Un envío = un Round nuevo,
 * mandado a TODOS los paneles activos y disponibles del set lockeado
 * (o del set en composición, si todavía no hay lock).
 */
export function ComposeBar({ onConversationReady }: { onConversationReady: (conversationId: string) => void }) {
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
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

      const round = await createRound(conversationId, text);
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
      className="flex items-center gap-2 rounded-lg border border-border bg-surface-elevated p-2"
    >
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
    </form>
  );
}
