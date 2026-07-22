import { liveQuery, type Subscription } from "dexie";
import { db, type Conversation, type PromptTemplate, type SyncMetaRecord } from "../db";
import { getGoogleAccessToken } from "../google-auth";
import { downloadFileContent, listAppDataFiles, uploadJsonFile } from "./drive-client";
import {
  buildConversationFile,
  buildTombstoneFile,
  CONV_FILE_PREFIX,
  conversationFileName,
  decideLww,
  mergeTemplates,
  parseConversationFile,
  parseTemplatesFile,
  TEMPLATES_FILE_NAME,
  type ConversationSyncData,
  type ConversationSyncFileV1,
  type TemplateTombstone,
} from "./serialize";

/**
 * sync-engine — orquestación del sync a Drive (Fase 6, Q17/Q18/Q20)
 * ------------------------------------------------------------------
 * Ciclo (E4): al habilitar → pull completo; después, un watcher
 * (liveQuery) empuja con debounce (~2.5 s) cada conversación cuyo
 * `updatedAt` superó su `lastSyncedAt`, los tombstones pendientes y
 * templates.json cuando cambia. "Sincronizar ahora" = pull+push
 * completo bajo demanda.
 *
 * Q20 (no bloqueante): TODO fallo degrada a estado visible
 * ("error" + mensaje + console.warn) y la app sigue local. Nada acá
 * corre si el opt-in está apagado.
 *
 * Ley de hierro: este path no puede tocar web storage
 * (guard:sync) ni el key-vault (guard:keys) — el opt-in vive en Dexie
 * (syncMeta "settings").
 */

const SETTINGS_ID = "settings";
const PUSH_DEBOUNCE_MS = 2500;

export type SyncStatus = "off" | "idle" | "syncing" | "error";

export interface SyncEngineState {
  status: SyncStatus;
  lastSyncAt: number | null;
  message: string | null;
}

type StateListener = (state: SyncEngineState) => void;
const listeners = new Set<StateListener>();
let state: SyncEngineState = { status: "off", lastSyncAt: null, message: null };

function setState(next: Partial<SyncEngineState>): void {
  state = { ...state, ...next };
  for (const l of listeners) l(state);
}

export function onSyncState(listener: StateListener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export async function isSyncEnabled(): Promise<boolean> {
  const settings = await db.syncMeta.get(SETTINGS_ID);
  return settings?.syncEnabled === true;
}

export async function setSyncEnabled(enabled: boolean): Promise<void> {
  const existing = await db.syncMeta.get(SETTINGS_ID);
  const record: SyncMetaRecord = { ...(existing ?? { id: SETTINGS_ID, kind: "settings" }), syncEnabled: enabled };
  await db.syncMeta.put(record);
  if (enabled) startSyncEngine();
  else stopSyncEngine();
}

/* ------------------------------------------------------------------ */

async function loadConversationSyncData(conversationId: string): Promise<ConversationSyncData | null> {
  const conversation = await db.conversations.get(conversationId);
  if (!conversation) return null;
  const [rounds, replies, roundAnalyses, panelThreads] = await Promise.all([
    db.rounds.where("conversationId").equals(conversationId).sortBy("index"),
    db.replies.where("conversationId").equals(conversationId).sortBy("createdAt"),
    db.roundAnalyses.where("conversationId").equals(conversationId).sortBy("createdAt"),
    db.panelThreads.where("[conversationId+panelSourceId]").between([conversationId, ""], [conversationId, "\uffff"]).toArray(),
  ]);
  return { conversation, rounds, replies, roundAnalyses, panelThreads };
}

/** Aplica un archivo remoto más nuevo: reemplazo transaccional del contenido local (LWW pisa entero, Q17). */
async function applyRemoteConversation(file: ConversationSyncFileV1, driveFileId: string): Promise<void> {
  await db.transaction("rw", [db.conversations, db.rounds, db.replies, db.roundAnalyses, db.panelThreads, db.syncMeta], async () => {
    const conversationId = file.conversationId;
    await Promise.all([
      db.rounds.where("conversationId").equals(conversationId).delete(),
      db.replies.where("conversationId").equals(conversationId).delete(),
      db.roundAnalyses.where("conversationId").equals(conversationId).delete(),
      db.panelThreads.where("[conversationId+panelSourceId]").between([conversationId, ""], [conversationId, "\uffff"]).delete(),
    ]);
    const conversation: Conversation = { ...(file.conversation as Omit<Conversation, "driveFileId">), driveFileId, syncState: "synced" };
    await db.conversations.put(conversation);
    if (file.rounds?.length) await db.rounds.bulkPut(file.rounds);
    if (file.replies?.length) await db.replies.bulkPut(file.replies);
    if (file.roundAnalyses?.length) await db.roundAnalyses.bulkPut(file.roundAnalyses);
    if (file.panelThreads?.length) await db.panelThreads.bulkPut(file.panelThreads);
    await db.syncMeta.put({ id: conversationId, kind: "conversation", lastSyncedAt: file.updatedAt });
  });
}

/** Tombstone remoto más nuevo: borrar el contenido local y registrar el tombstone como ya-reflejado. */
async function applyRemoteTombstone(file: ConversationSyncFileV1): Promise<void> {
  await db.transaction("rw", [db.conversations, db.rounds, db.replies, db.roundAnalyses, db.panelThreads, db.syncMeta], async () => {
    const conversationId = file.conversationId;
    await Promise.all([
      db.conversations.delete(conversationId),
      db.rounds.where("conversationId").equals(conversationId).delete(),
      db.replies.where("conversationId").equals(conversationId).delete(),
      db.roundAnalyses.where("conversationId").equals(conversationId).delete(),
      db.panelThreads.where("[conversationId+panelSourceId]").between([conversationId, ""], [conversationId, "\uffff"]).delete(),
    ]);
    await db.syncMeta.put({
      id: conversationId,
      kind: "conversation",
      deleted: true,
      deletedAt: file.updatedAt,
      tombstonePushed: true,
      lastSyncedAt: file.updatedAt,
    });
  });
}

async function pushConversation(token: string, conversationId: string): Promise<void> {
  const meta = await db.syncMeta.get(conversationId);
  if (meta?.deleted) {
    await pushTombstone(token, conversationId, meta);
    return;
  }
  const data = await loadConversationSyncData(conversationId);
  if (!data) return; // borrada entre el watcher y acá; el tombstone la cubre
  const file = buildConversationFile(data);
  const fileId = await uploadJsonFile(token, {
    ...(data.conversation.driveFileId ? { fileId: data.conversation.driveFileId } : {}),
    name: conversationFileName(conversationId),
    content: JSON.stringify(file),
  });
  await db.conversations.update(conversationId, { driveFileId: fileId, syncState: "synced" });
  await db.syncMeta.put({ id: conversationId, kind: "conversation", lastSyncedAt: file.updatedAt });
}

async function pushTombstone(token: string, conversationId: string, meta: SyncMetaRecord): Promise<void> {
  const deletedAt = meta.deletedAt ?? Date.now();
  const file = buildTombstoneFile(conversationId, deletedAt);
  // El driveFileId puede no conocerse acá (conversación borrada antes de
  // sincronizarse, u origen en otro navegador): resolver por nombre.
  const remoteFiles = await listAppDataFiles(token);
  const existing = remoteFiles.find((f) => f.name === conversationFileName(conversationId));
  await uploadJsonFile(token, {
    ...(existing ? { fileId: existing.id } : {}),
    name: conversationFileName(conversationId),
    content: JSON.stringify(file),
  });
  await db.syncMeta.put({ ...meta, id: conversationId, kind: "conversation", tombstonePushed: true, lastSyncedAt: deletedAt });
}

async function syncTemplates(token: string, remoteFileId: string | undefined, remoteRaw: string | null): Promise<void> {
  const [local, tombstoneRecords, settings] = await Promise.all([
    db.promptTemplates.toArray(),
    db.syncMeta.where("kind").equals("template").toArray(),
    db.syncMeta.get(SETTINGS_ID),
  ]);
  const localTombstones: TemplateTombstone[] = tombstoneRecords
    .filter((t) => t.deleted && typeof t.deletedAt === "number")
    .map((t) => ({ id: t.id.slice("tpl:".length), deletedAt: t.deletedAt as number }));

  const remote = remoteRaw !== null ? parseTemplatesFile(remoteRaw) : null;
  if (remoteRaw !== null && remote === null) {
    console.warn("[chatcouncil:sync] templates.json remoto ilegible — se conserva y se pisa con el estado resuelto local");
  }
  const merge = mergeTemplates(local, localTombstones, remote);

  if (merge.upsertLocal.length > 0) await db.promptTemplates.bulkPut(merge.upsertLocal);
  if (merge.deleteLocal.length > 0) await db.promptTemplates.bulkDelete(merge.deleteLocal);

  if (merge.remoteStale) {
    const fileId = await uploadJsonFile(token, {
      ...(remoteFileId ? { fileId: remoteFileId } : {}),
      name: TEMPLATES_FILE_NAME,
      content: JSON.stringify(merge.resolved),
    });
    await db.syncMeta.put({ ...(settings ?? { id: SETTINGS_ID, kind: "settings" as const }), templatesDriveFileId: fileId });
  } else if (remoteFileId && settings?.templatesDriveFileId !== remoteFileId) {
    await db.syncMeta.put({ ...(settings ?? { id: SETTINGS_ID, kind: "settings" as const }), templatesDriveFileId: remoteFileId });
  }
}

/**
 * Pull completo + reconciliación (arranque y "Sincronizar ahora").
 * Por archivo remoto: LWW puro (decideLww) → aplicar/borrar/push.
 * Después: push de todo lo local que el remoto no conoce.
 */
async function fullSync(interactive: boolean): Promise<void> {
  const token = await getGoogleAccessToken({ interactive });
  const remoteFiles = await listAppDataFiles(token);

  const seenConversationIds = new Set<string>();
  for (const entry of remoteFiles) {
    if (!entry.name.startsWith(CONV_FILE_PREFIX)) continue;
    let file: ConversationSyncFileV1 | null = null;
    try {
      file = parseConversationFile(await downloadFileContent(token, entry.id));
    } catch (err) {
      console.warn(`[chatcouncil:sync] no se pudo descargar ${entry.name}:`, err instanceof Error ? err.message : err);
      continue;
    }
    if (!file) {
      console.warn(`[chatcouncil:sync] archivo remoto ilegible (se ignora): ${entry.name}`);
      continue;
    }
    seenConversationIds.add(file.conversationId);

    const [localConv, meta] = await Promise.all([db.conversations.get(file.conversationId), db.syncMeta.get(file.conversationId)]);
    const decision = decideLww(
      { updatedAt: localConv?.updatedAt ?? null, deletedAt: meta?.deleted ? (meta.deletedAt ?? 0) : null },
      file,
    );
    switch (decision.action) {
      case "apply-remote":
        await applyRemoteConversation(file, entry.id);
        break;
      case "delete-local":
        await applyRemoteTombstone(file);
        break;
      case "push-local":
        if (localConv && !localConv.driveFileId) await db.conversations.update(file.conversationId, { driveFileId: entry.id });
        await pushConversation(token, file.conversationId);
        break;
      case "push-tombstone":
        await pushTombstone(token, file.conversationId, meta as SyncMetaRecord);
        break;
      case "noop":
        if (localConv && localConv.driveFileId !== entry.id) await db.conversations.update(file.conversationId, { driveFileId: entry.id });
        break;
    }
  }

  // Local que el remoto no conoce: conversaciones nuevas + tombstones jamás empujados.
  const [allLocal, pendingTombstones] = await Promise.all([
    db.conversations.toArray(),
    db.syncMeta.where("kind").equals("conversation").filter((m) => m.deleted === true && m.tombstonePushed !== true).toArray(),
  ]);
  for (const conv of allLocal) {
    if (!seenConversationIds.has(conv.id)) await pushConversation(token, conv.id);
  }
  for (const meta of pendingTombstones) {
    if (!seenConversationIds.has(meta.id)) await pushTombstone(token, meta.id, meta);
  }

  const templatesEntry = remoteFiles.find((f) => f.name === TEMPLATES_FILE_NAME);
  let templatesRaw: string | null = null;
  if (templatesEntry) {
    try {
      templatesRaw = await downloadFileContent(token, templatesEntry.id);
    } catch (err) {
      console.warn("[chatcouncil:sync] no se pudo descargar templates.json:", err instanceof Error ? err.message : err);
    }
  }
  await syncTemplates(token, templatesEntry?.id, templatesRaw);
}

/* ------------------------------------------------------------------
 * Watcher incremental: liveQuery sobre (conversations.updatedAt,
 * tombstones pendientes, templates.updatedAt) → push con debounce.
 * ------------------------------------------------------------------ */

let watcher: Subscription | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let rerunRequested = false;

interface WatchSnapshot {
  conversations: Pick<Conversation, "id" | "updatedAt">[];
  metas: SyncMetaRecord[];
  templates: Pick<PromptTemplate, "id" | "updatedAt">[];
}

async function incrementalPush(): Promise<void> {
  const token = await getGoogleAccessToken({ interactive: false });
  const [convs, metas] = await Promise.all([db.conversations.toArray(), db.syncMeta.toArray()]);
  const metaById = new Map(metas.map((m) => [m.id, m] as const));

  for (const conv of convs) {
    const meta = metaById.get(conv.id);
    if ((meta?.lastSyncedAt ?? 0) < conv.updatedAt) await pushConversation(token, conv.id);
  }
  for (const meta of metas) {
    if (meta.kind === "conversation" && meta.deleted === true && meta.tombstonePushed !== true) {
      await pushTombstone(token, meta.id, meta);
    }
  }

  // Templates: comparar contra el resuelto remoto es caro; a escala
  // personal, re-mergear cuando el watcher dispara alcanza y es correcto
  // (mergeTemplates es idempotente; sin cambios → remoteStale false → no sube nada).
  const settings = metaById.get(SETTINGS_ID);
  const templatesFileId = settings?.templatesDriveFileId;
  let remoteRaw: string | null = null;
  if (templatesFileId) {
    try {
      remoteRaw = await downloadFileContent(token, templatesFileId);
    } catch (err) {
      console.warn("[chatcouncil:sync] templates.json no descargable en push incremental:", err instanceof Error ? err.message : err);
    }
  }
  await syncTemplates(token, templatesFileId, remoteRaw);
}

function scheduleIncremental(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runGuarded(() => incrementalPush());
  }, PUSH_DEBOUNCE_MS);
}

async function runGuarded(task: () => Promise<void>): Promise<void> {
  if (running) {
    rerunRequested = true;
    return;
  }
  running = true;
  setState({ status: "syncing", message: null });
  try {
    await task();
    setState({ status: "idle", lastSyncAt: Date.now(), message: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[chatcouncil:sync] ciclo de sync falló:", message);
    setState({ status: "error", message });
  } finally {
    running = false;
    if (rerunRequested) {
      rerunRequested = false;
      scheduleIncremental();
    }
  }
}

export function startSyncEngine(): void {
  if (watcher) return;
  setState({ status: "idle", message: null });
  void runGuarded(() => fullSync(false)).then(() => {
    if (watcher) return;
    let first = true;
    watcher = liveQuery(async (): Promise<WatchSnapshot> => {
      const [conversations, metas, templates] = await Promise.all([
        db.conversations.toArray().then((cs) => cs.map((c) => ({ id: c.id, updatedAt: c.updatedAt }))),
        db.syncMeta.toArray(),
        db.promptTemplates.toArray().then((ts) => ts.map((t) => ({ id: t.id, updatedAt: t.updatedAt }))),
      ]);
      return { conversations, metas, templates };
    }).subscribe({
      next: () => {
        // La primera emisión es el estado que el fullSync ya reconcilió.
        if (first) {
          first = false;
          return;
        }
        scheduleIncremental();
      },
      error: (err: unknown) => {
        console.warn("[chatcouncil:sync] watcher falló:", err instanceof Error ? err.message : err);
        setState({ status: "error", message: "watcher de cambios caído — usa Sincronizar ahora" });
      },
    });
  });
}

export function stopSyncEngine(): void {
  watcher?.unsubscribe();
  watcher = null;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  setState({ status: "off", message: null });
}

/** "Sincronizar ahora" (E4): pull+push completo con gesto del usuario (habilita el prompt visible de GIS si hace falta). */
export function syncNow(): void {
  void runGuarded(() => fullSync(true));
}
