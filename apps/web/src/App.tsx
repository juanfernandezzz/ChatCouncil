import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ComposeBar } from "@/components/layout/ComposeBar";
import { CouncilGrid } from "@/components/layout/GridPanel";
import { ExtensionBadge } from "@/components/shell/ExtensionBadge";
import { ConversationSidebar } from "@/components/sidebar/ConversationSidebar";
import { ToolsPanel } from "@/components/tools/ToolsPanel";
import { BYOA_PROVIDERS } from "@chatcouncil/adapters";
import { bridgeClient } from "@/lib/bridge-client";
import { detectByoaOrganizations } from "@/lib/byoa-org";
import { loadConversation } from "@/lib/conversation-repo";
import { getLastConversationId, setLastConversationId } from "@/lib/last-conversation";
import { PANEL_COUNT_OPTIONS, useCouncilStore, type PanelCount } from "@/store/useCouncilStore";
import { BrandMark, Button, Select } from "@chatcouncil/ui";

// ─── Soporte de plataformas (decisión de cierre de Fase 1, ver BLUEPRINT
// "Fase 8 — Móvil") ─────────────────────────────────────────────────────
// v1 depende de la extensión de escritorio para el puente BYOA/BYOK, y
// los navegadores móviles no pueden alojarla. En móvil la SPA sólo
// informa. Detección por UA a propósito: la capacidad real ("¿puede este
// navegador alojar nuestra extensión?") no es detectable directamente.
// Caso borde conocido: iPadOS se presenta como Mac → cae al flujo
// desktop y termina en el badge "Extensión no instalada" — degradación
// aceptable, no un error.
const IS_MOBILE =
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (navigator as { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile === true;

function MobileNotice() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight text-text-primary">ChatCouncil</h1>
      <p className="text-sm leading-relaxed text-text-primary">
        ChatCouncil corre en <span className="text-accent-primary">Chrome de escritorio</span>.
      </p>
      <p className="text-sm leading-relaxed text-text-secondary">
        El puente hacia los proveedores depende de una extensión de navegador, y los navegadores
        móviles no pueden alojarla. Abrí esta misma dirección desde Chrome (o un navegador
        Chromium) de escritorio con la extensión instalada.
      </p>
      <p className="font-mono text-xs text-text-secondary">
        En evaluación: una extensión para Firefox en Android que habilite el uso móvil.
      </p>
    </div>
  );
}

/** E8: detectar sesión + elegir organización BYOA. Sólo se muestra si hay un panel BYOA en el set activo. */
function ByoaSessionBar() {
  const activePanelSourceIds = useCouncilStore(useShallow((s) => s.activePanelSourceIds()));
  const byoaSessionConfirmed = useCouncilStore((s) => s.byoaSessionConfirmed);
  const byoaOrgsByProvider = useCouncilStore((s) => s.byoaOrgsByProvider);
  const byoaSelectedOrgIdByProvider = useCouncilStore((s) => s.byoaSelectedOrgIdByProvider);
  const setByoaSession = useCouncilStore((s) => s.setByoaSession);
  const setByoaSelectedOrg = useCouncilStore((s) => s.setByoaSelectedOrg);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsByoa = activePanelSourceIds.some((id) => id.startsWith("byoa:"));
  if (!needsByoa) return null;

  const providerId = "claude"; // único BYOA hoy; generalizar cuando haya más (Class 1 restante)
  const cfg = BYOA_PROVIDERS[providerId];
  if (!cfg) return null;
  const confirmed = byoaSessionConfirmed.has(providerId);
  const orgs = byoaOrgsByProvider[providerId] ?? [];
  const selectedOrgId = byoaSelectedOrgIdByProvider[providerId] ?? "";

  const handleDetect = () => {
    setDetecting(true);
    setError(null);
    detectByoaOrganizations(cfg.sessionOrigin)
      .then((detected) => {
        if (detected[0]) setByoaSession(providerId, detected, detected[0].id);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setDetecting(false));
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-xs">
      <span className="text-text-secondary">Sesión BYOA ({cfg.label}):</span>
      {!confirmed ? (
        <Button variant="accent" onClick={handleDetect} disabled={detecting}>
          {detecting ? "detectando…" : "detectar sesión"}
        </Button>
      ) : (
        <Select
          value={selectedOrgId}
          onChange={(e) => setByoaSelectedOrg(providerId, e.target.value)}
        >
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      )}
      {error && <span className="text-danger">{error}</span>}
    </div>
  );
}

export default function App() {
  const panelCount = useCouncilStore((s) => s.panelCount);
  const isLayoutLocked = useCouncilStore((s) => s.isLayoutLocked);
  const setPanelCount = useCouncilStore((s) => s.setPanelCount);
  const setExtensionStatus = useCouncilStore((s) => s.setExtensionStatus);
  const activeConversationId = useCouncilStore((s) => s.activeConversationId);
  const setActiveConversation = useCouncilStore((s) => s.setActiveConversation);

  const loaded = useLiveQuery(
    () => (activeConversationId ? loadConversation(activeConversationId) : Promise.resolve(null)),
    [activeConversationId],
  );

  useEffect(() => {
    if (IS_MOBILE) return; // sin extensión posible, no hay puente que conectar
    bridgeClient.connect();
    const unsub = bridgeClient.onStatus(setExtensionStatus);
    return unsub;
  }, [setExtensionStatus]);

  // Recuperación tras reload (criterio de aceptación): restaurar la última
  // conversación abierta desde el puntero de localStorage; el CONTENIDO
  // (Rounds/Replies/Attempts) siempre sale de Dexie vía useLiveQuery arriba.
  useEffect(() => {
    if (IS_MOBILE) return;
    const lastId = getLastConversationId();
    if (!lastId) return;
    void loadConversation(lastId).then((conv) => {
      if (conv) setActiveConversation(lastId, conv.conversation.lockedModelIds);
      else setLastConversationId(null); // puntero huérfano (conversación borrada): limpiar
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (IS_MOBILE) {
    return <MobileNotice />;
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[1600px] gap-4 p-4">
      <ConversationSidebar
        activeConversationId={activeConversationId}
        onSelect={() => {
          /* ConversationSidebar ya actualizó el store con el lockedModelIds real de esta conversación. */
        }}
        onNewConversation={() => {
          setActiveConversation(null, []);
          setLastConversationId(null);
        }}
      />

      <div className="flex flex-1 flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BrandMark size={22} className="text-accent-primary" />
            <div className="flex items-baseline gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-text-primary">ChatCouncil</h1>
              <span className="font-mono text-xs text-text-secondary">fase 7 · design system</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ByoaSessionBar />
            <ExtensionBadge />
          </div>
        </header>

        {!isLayoutLocked && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary">Paneles:</span>
            <div className="flex gap-1">
              {PANEL_COUNT_OPTIONS.map((count) => (
                <button
                  key={count}
                  type="button"
                  disabled={isLayoutLocked}
                  onClick={() => setPanelCount(count as PanelCount)}
                  className={`h-7 w-7 rounded border text-xs transition-colors ${
                    panelCount === count
                      ? "border-accent-primary text-accent-primary"
                      : "border-border text-text-secondary hover:border-text-secondary"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>
        )}
        {isLayoutLocked && (
          <p className="font-mono text-[10px] text-text-secondary">
            layout bloqueado — esta conversación ya tiene mensajes (Q14)
          </p>
        )}

        <main className="flex flex-1 flex-col">
          <CouncilGrid loaded={loaded ?? null} />
        </main>

        <footer className="sticky bottom-4">
          <ComposeBar
            onConversationReady={(id) => useCouncilStore.setState({ activeConversationId: id })}
          />
        </footer>
      </div>

      <ToolsPanel />
    </div>
  );
}
