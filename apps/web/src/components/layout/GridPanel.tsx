import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { gridLayouts } from "@chatcouncil/ui";
import { useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  appendRetryAttempt,
  addPanelContinuedReply,
  buildPanelTimeline,
  createRound,
  dispatchReply,
  type LoadedConversation,
  type PanelTimelineEntry,
} from "@/lib/conversation-repo";
import { isAccountDefaultModel, listPanelOptions, type PanelOption } from "@/lib/model-registry";
import type { Reply } from "@/lib/db";
import { useCouncilStore } from "@/store/useCouncilStore";

/**
 * Grid del council — Fase 4
 * ------------------------------------------------------------------
 * Pre-lock (componiendo): drag-reorder vía @dnd-kit sobre la lista de
 * prioridad (Q25b). Post-lock: sin dnd, orden fijo de
 * `conversation.lockedModelIds` (Q14 — el lock es duro). El "modo foco"
 * es puramente local (no toca el store): expande UNA tarjeta sin
 * romper el lock ni el resto del estado.
 */

function statusDot(status: Reply["attempts"][number]["status"] | undefined): string {
  switch (status) {
    case "streaming":
      return "bg-accent-primary animate-pulse";
    case "done":
      return "bg-accent-secondary";
    case "error":
      return "bg-red-500";
    case "aborted":
      return "bg-text-secondary";
    default:
      return "bg-text-secondary opacity-50";
  }
}

function AttemptBlock({ entry, onRetry }: { entry: PanelTimelineEntry; onRetry: (reply: Reply) => void }) {
  const attempt = entry.reply.attempts[entry.reply.attempts.length - 1];
  const priorAttempts = entry.reply.attempts.length - 1;
  return (
    <div className="flex flex-col gap-1 border-b border-border pb-2 last:border-b-0">
      <div className="flex items-start gap-1.5">
        <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-text-secondary opacity-60" />
        <p className="whitespace-pre-wrap text-xs text-text-secondary">{entry.userText}</p>
      </div>
      <div className="flex items-start gap-1.5">
        <span className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(attempt?.status)}`} />
        <div className="flex-1">
          <p className="whitespace-pre-wrap text-sm text-text-primary">
            {attempt?.content || (attempt?.status === "pending" ? "…" : "")}
          </p>
          {attempt?.status === "error" && (
            <p className="mt-1 text-xs text-red-400">{attempt.errorMessage ?? "error"}</p>
          )}
          <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-text-secondary">
            {attempt?.latencyMs != null && <span>{attempt.latencyMs}ms</span>}
            {attempt?.tokensIn != null && <span>in:{attempt.tokensIn}</span>}
            {attempt?.tokensOut != null && <span>out:{attempt.tokensOut}</span>}
            {priorAttempts > 0 && <span>intento {entry.reply.attempts.length}/{entry.reply.attempts.length}</span>}
            {(attempt?.status === "done" || attempt?.status === "error") && (
              <button
                type="button"
                onClick={() => onRetry(entry.reply)}
                className="text-accent-primary hover:underline"
              >
                reintentar
              </button>
            )}
            {attempt?.status === "done" && attempt.content && (
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(attempt.content)}
                className="text-accent-primary hover:underline"
              >
                copiar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface PanelCardProps {
  option: PanelOption;
  timeline: PanelTimelineEntry[];
  locked: boolean;
  focused: boolean;
  onToggleFocus: () => void;
  onRetry: (reply: Reply) => void;
  onContinueHere: (panelSourceId: string, modelId: string, text: string) => void;
  onScroll?: (scrollTop: number) => void;
  scrollTopExternal?: number;
}

function PanelCard({
  option,
  timeline,
  locked,
  focused,
  onToggleFocus,
  onRetry,
  onContinueHere,
  onScroll,
  scrollTopExternal,
}: PanelCardProps) {
  const [followUp, setFollowUp] = useState("");
  const [selectedModel, setSelectedModel] = useState(option.defaultModelId);
  const bodyRef = useRef<HTMLDivElement>(null);

  if (scrollTopExternal !== undefined && bodyRef.current && bodyRef.current.scrollTop !== scrollTopExternal) {
    bodyRef.current.scrollTop = scrollTopExternal;
  }

  return (
    <div
      className={`flex min-h-[220px] flex-col rounded-lg border border-border bg-surface-elevated ${focused ? "col-span-full row-span-full" : ""}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
              option.connectionMode === "byoa" ? "bg-accent-secondary/20 text-accent-secondary" : "bg-accent-primary/20 text-accent-primary"
            }`}
          >
            {option.connectionMode}
          </span>
          <span className="text-sm font-medium text-text-primary">{option.label}</span>
        </div>
        <div className="flex items-center gap-2">
          {locked && (
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="rounded border border-border bg-bg-base px-1.5 py-1 font-mono text-[10px] text-text-secondary"
              title="modelo para el próximo envío a este panel (E4)"
            >
              <option value={option.defaultModelId}>{option.defaultModelId}</option>
              {option.models
                .filter((m) => m.id !== option.defaultModelId)
                .map((m) => (
                  <option key={m.id} value={m.id} title={m.note}>
                    {m.label}
                    {m.verified ? "" : " (sin verificar)"}
                  </option>
                ))}
            </select>
          )}
          <button type="button" onClick={onToggleFocus} className="text-xs text-text-secondary hover:text-text-primary">
            {focused ? "achicar" : "foco"}
          </button>
        </div>
      </div>

      {!option.available && (
        <div className="mx-3 mt-2 rounded border border-dashed border-border bg-bg-base p-2 font-mono text-[10px] text-text-secondary">
          {option.unavailableReason}
        </div>
      )}

      <div ref={bodyRef} onScroll={(e) => onScroll?.(e.currentTarget.scrollTop)} className="scrollbar-thin flex-1 space-y-2 overflow-y-auto p-3">
        {timeline.length === 0 && option.available && (
          <p className="text-xs text-text-secondary">sin turnos todavía en este panel</p>
        )}
        {timeline.map((entry) => (
          <AttemptBlock key={entry.reply.id} entry={entry} onRetry={onRetry} />
        ))}
      </div>

      {locked && option.available && timeline.length > 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!followUp.trim()) return;
            onContinueHere(option.panelSourceId, selectedModel, followUp.trim());
            setFollowUp("");
          }}
          className="flex items-center gap-2 border-t border-border p-2"
        >
          <input
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            placeholder="continuar solo acá…"
            className="min-w-0 flex-1 rounded border border-border bg-bg-base px-2 py-1 text-xs text-text-primary placeholder:text-text-secondary"
          />
          <button
            type="submit"
            className="rounded border border-accent-primary px-2 py-1 text-xs text-accent-primary disabled:opacity-40"
            disabled={!followUp.trim()}
          >
            enviar
          </button>
        </form>
      )}
    </div>
  );
}

function SortablePanelSlot({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

export function CouncilGrid({ loaded }: { loaded: LoadedConversation | null }) {
  const isLayoutLocked = useCouncilStore((s) => s.isLayoutLocked);
  const activePanelSourceIds = useCouncilStore(useShallow((s) => s.activePanelSourceIds()));
  const reorderPriority = useCouncilStore((s) => s.reorderPriority);
  const priorityPanelSourceIds = useCouncilStore((s) => s.priorityPanelSourceIds);
  const byoaSessionConfirmed = useCouncilStore((s) => s.byoaSessionConfirmed);
  const byoaSelectedOrgIdByProvider = useCouncilStore((s) => s.byoaSelectedOrgIdByProvider);

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [scrollSync, setScrollSync] = useState(false);
  const scrollTopRef = useRef(0);
  const [, forceScrollTick] = useState(0);

  const options = useMemo(
    () => listPanelOptions({ byoaSessionConfirmed }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byoaSessionConfirmed],
  );
  const optionsById = useMemo(() => new Map(options.map((o) => [o.panelSourceId, o])), [options]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = priorityPanelSourceIds.indexOf(String(active.id));
    const newIndex = priorityPanelSourceIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    reorderPriority(arrayMove(priorityPanelSourceIds, oldIndex, newIndex));
  };

  const handleRetry = async (reply: Reply) => {
    const attempt = await appendRetryAttempt(reply.id);
    const timelineEntry = loaded ? buildPanelTimeline(loaded, reply.panelSourceId).find((e) => e.reply.id === reply.id) : undefined;
    const promptText = timelineEntry?.userText ?? "";
    const parsed = optionsById.get(reply.panelSourceId);
    const orgId = parsed ? byoaSelectedOrgIdByProvider[parsed.providerId] : undefined;
    void dispatchReply(reply, attempt.id, promptText, undefined, orgId);
  };

  const handleContinueHere = async (panelSourceId: string, modelId: string, text: string) => {
    if (!loaded) return;
    const reply = await addPanelContinuedReply({
      conversationId: loaded.conversation.id,
      panelSourceId,
      modelId,
      followUpPrompt: text,
    });
    const option = optionsById.get(panelSourceId);
    const orgId = option ? byoaSelectedOrgIdByProvider[option.providerId] : undefined;
    const modelOverride = isAccountDefaultModel(modelId) ? undefined : modelId;
    void dispatchReply(reply, reply.attempts[0]!.id, text, modelOverride, orgId);
  };

  const idsToRender = focusedId ? [focusedId] : activePanelSourceIds;
  const layout = gridLayouts[activePanelSourceIds.length] ?? { cols: Math.min(activePanelSourceIds.length, 4) || 1, rows: 1 };
  const cols = focusedId ? 1 : layout.cols;

  const grid = (
    <div
      className="grid flex-1 gap-3"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {idsToRender.map((panelSourceId) => {
        const option = optionsById.get(panelSourceId);
        if (!option) {
          return (
            <div key={panelSourceId} className="rounded-lg border border-dashed border-border bg-surface-elevated p-3 font-mono text-xs text-text-secondary">
              {panelSourceId} — sin adaptador registrado todavía
            </div>
          );
        }
        const timeline = loaded ? buildPanelTimeline(loaded, panelSourceId) : [];
        const card = (
          <PanelCard
            option={option}
            timeline={timeline}
            locked={isLayoutLocked}
            focused={focusedId === panelSourceId}
            onToggleFocus={() => setFocusedId(focusedId === panelSourceId ? null : panelSourceId)}
            onRetry={(r) => void handleRetry(r)}
            onContinueHere={(p, m, t) => void handleContinueHere(p, m, t)}
            onScroll={
              scrollSync
                ? (top) => {
                    scrollTopRef.current = top;
                    forceScrollTick((n) => n + 1);
                  }
                : undefined
            }
            scrollTopExternal={scrollSync ? scrollTopRef.current : undefined}
          />
        );
        return isLayoutLocked || focusedId ? (
          <div key={panelSourceId}>{card}</div>
        ) : (
          <SortablePanelSlot key={panelSourceId} id={panelSourceId}>
            {card}
          </SortablePanelSlot>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-1 flex-col gap-2">
      {!focusedId && (
        <div className="flex items-center justify-end gap-2 font-mono text-[10px] text-text-secondary">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={scrollSync} onChange={(e) => setScrollSync(e.target.checked)} />
            sincronizar scroll
          </label>
        </div>
      )}
      {!isLayoutLocked && !focusedId ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={activePanelSourceIds} strategy={rectSortingStrategy}>
            {grid}
          </SortableContext>
        </DndContext>
      ) : (
        grid
      )}
    </div>
  );
}
