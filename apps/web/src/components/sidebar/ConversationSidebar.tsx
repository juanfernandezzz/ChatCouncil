import { useLiveQuery } from "dexie-react-hooks";
import { PanelLeftClose, PanelLeftOpen, Plus, X } from "lucide-react";
import MiniSearch from "minisearch";
import { useMemo, useState } from "react";
import { db, type Conversation } from "@/lib/db";
import { deleteConversationLocal, listConversationsForSidebar } from "@/lib/conversation-repo";
import { getLastConversationId, setLastConversationId } from "@/lib/last-conversation";
import { useCouncilStore } from "@/store/useCouncilStore";
import { Button, TextInput } from "@chatcouncil/ui";
import { AccountSyncSection } from "./AccountSyncSection";

interface SearchDoc {
  id: string;
  conversationId: string;
  text: string;
}

/**
 * Índice en memoria, reconstruido bajo demanda (sólo cuando hay texto
 * de búsqueda) — a la escala de uso personal de Juan (sus propias
 * conversaciones) esto es más simple que mantener un índice persistente
 * y sigue siendo instantáneo.
 */
async function searchConversations(query: string): Promise<Set<string>> {
  const [rounds, replies] = await Promise.all([db.rounds.toArray(), db.replies.toArray()]);
  const docs: SearchDoc[] = [
    ...rounds.map((r) => ({ id: `round:${r.id}`, conversationId: r.conversationId, text: r.promptText })),
    ...replies.map((r) => ({
      id: `reply:${r.id}`,
      conversationId: r.conversationId,
      text: [r.followUpPrompt ?? "", ...r.attempts.map((a) => a.content)].join(" "),
    })),
  ];
  const mini = new MiniSearch<SearchDoc>({ fields: ["text"], storeFields: ["conversationId"] });
  mini.addAll(docs);
  const results = mini.search(query, { prefix: true, fuzzy: 0.2 });
  return new Set(results.map((r) => (r as unknown as SearchDoc & { conversationId: string }).conversationId));
}

/** Fase 10 E4: preferencia de dispositivo — localStorage, nunca Dexie/Drive. */
const SIDEBAR_COLLAPSED_KEY = "chatcouncil:ui:sidebar-collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(value));
  } catch {
    // storage no disponible: la preferencia simplemente no persiste
  }
}

export function ConversationSidebar({
  activeConversationId,
  onSelect,
  onNewConversation,
}: {
  activeConversationId: string | null;
  onSelect: (conversationId: string) => void;
  onNewConversation: () => void;
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [query, setQuery] = useState("");
  const [matchingIds, setMatchingIds] = useState<Set<string> | null>(null);
  const conversations = useLiveQuery(() => listConversationsForSidebar(), []) ?? [];
  const setActiveConversation = useCouncilStore((s) => s.setActiveConversation);

  const visible = useMemo(() => {
    if (!query.trim() || matchingIds === null) return conversations;
    return conversations.filter((c) => matchingIds.has(c.id));
  }, [conversations, query, matchingIds]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (!value.trim()) {
      setMatchingIds(null);
      return;
    }
    void searchConversations(value).then(setMatchingIds);
  };

  const handleSelect = async (conversationId: string) => {
    const conv = conversations.find((c) => c.id === conversationId);
    setActiveConversation(conversationId, conv?.lockedModelIds ?? []);
    setLastConversationId(conversationId);
    onSelect(conversationId);
  };

  /** Fase 6 (E3): borrado con tombstone — sin él, el sync resucitaría la conversación. */
  const handleDelete = async (conv: Conversation) => {
    if (!window.confirm(`¿Borrar la conversación "${conv.title}"? Se borra aquí y, si el sync está activo, también en Drive.`)) return;
    await deleteConversationLocal(conv.id);
    if (conv.id === activeConversationId) {
      setActiveConversation(null, []);
      setLastConversationId(null);
    } else if (getLastConversationId() === conv.id) {
      setLastConversationId(null);
    }
  };

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    writeCollapsed(next);
  };

  if (collapsed) {
    return (
      <aside className="flex w-10 shrink-0 flex-col items-center gap-2 border-r border-border py-3">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Expandir el panel de conversaciones"
          title="Expandir el panel de conversaciones"
          className="rounded p-1.5 text-text-secondary hover:text-text-primary"
        >
          <PanelLeftOpen size={16} aria-hidden />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-2 border-r border-border p-3">
      <div className="flex items-center gap-2">
        <Button variant="accent" size="md" onClick={onNewConversation} className="flex flex-1 items-center justify-center gap-1 text-xs font-medium">
          <Plus size={13} aria-hidden />
          Nueva conversación
        </Button>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Colapsar el panel de conversaciones"
          title="Colapsar el panel de conversaciones"
          className="rounded p-1.5 text-text-secondary hover:text-text-primary"
        >
          <PanelLeftClose size={16} aria-hidden />
        </button>
      </div>
      <TextInput
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        placeholder="Buscar en el historial…"
      />
      <div className="scrollbar-thin flex-1 space-y-1 overflow-y-auto">
        {visible.map((c: Conversation) => (
          <div key={c.id} className="group relative">
            <button
              type="button"
              onClick={() => void handleSelect(c.id)}
              className={`block w-full truncate rounded px-2 py-1.5 pr-6 text-left text-xs ${
                c.id === activeConversationId
                  ? "bg-accent-primary/20 text-accent-primary"
                  : "text-text-secondary hover:bg-bg-base hover:text-text-primary"
              }`}
              title={c.title}
            >
              {c.title}
            </button>
            <button
              type="button"
              aria-label={`Borrar "${c.title}"`}
              title="Borrar conversación"
              onClick={() => void handleDelete(c)}
              className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded px-1 text-text-secondary hover:text-danger group-hover:block"
            >
              <X size={12} aria-hidden />
            </button>
          </div>
        ))}
        {visible.length === 0 && <p className="px-2 py-1.5 text-xs text-text-secondary">sin conversaciones todavía</p>}
      </div>
      <AccountSyncSection />
    </aside>
  );
}

export { getLastConversationId };
