import type { Conversation, PanelThread, PromptTemplate, Reply, Round, RoundAnalysis } from "../db";

/**
 * Serialización del sync a Drive — Fase 6 (E1/E2/E3) — módulo PURO.
 * ------------------------------------------------------------------
 * LEY DE HIERRO (Q10): las llaves BYOK jamás llegan acá — no viven en
 * Dexie (viven en el storage del key-vault) y este path tiene
 * PROHIBIDO tocar web storage (guard:sync) e importar
 * el key-vault (guard:keys, FORBIDDEN_PATH /drive|sync/i). La ley se
 * cumple por estructura en tres capas independientes.
 *
 * E1 — contenido del archivo por conversación (Q18: JSON, sin blobs):
 *  · Conversation SIN driveFileId (metadata local del sync, no
 *    contenido — cada navegador la aprende de su propio list()).
 *  · Rounds (attachments = SOLO metadata; la tabla `blobs` no
 *    participa jamás — Q18).
 *  · Replies completas con TODOS los Attempts (Q15: el historial de
 *    fallos es parte del objeto de auditoría).
 *  · roundAnalyses completas INCLUIDO labelMap (es el sello de
 *    auditoría, no un secreto — sin él el des-sellado se pierde al
 *    restaurar en otro navegador).
 *  · panelThreads de la conversación (identificadores no secretos,
 *    mismo criterio que byoaOrgId; habilitan continuar el hilo BYOA
 *    en otro navegador SI ahí también hay sesión del proveedor).
 *
 * E3 — tombstone IN-FILE: borrar una conversación = escribir el mismo
 * archivo con {deleted:true, updatedAt} — el borrado es una escritura
 * LWW más, un solo mecanismo, converge (borrar el archivo NO converge:
 * el otro navegador lo re-subiría).
 *
 * E2 — templates.json: archivo único con merge por-ítem LWW por
 * `updatedAt` + tombstones por-ítem (mismo argumento anti-resurrección).
 */

export const SYNC_SCHEMA_VERSION = 1 as const;
export const CONV_FILE_PREFIX = "conv_";
export const TEMPLATES_FILE_NAME = "templates.json";

export function conversationFileName(conversationId: string): string {
  return `${CONV_FILE_PREFIX}${conversationId}.json`;
}

/** Contenido de una conversación tal como sale de Dexie (sin blobs — Q18). */
export interface ConversationSyncData {
  conversation: Conversation;
  rounds: Round[];
  replies: Reply[];
  roundAnalyses: RoundAnalysis[];
  panelThreads: PanelThread[];
}

export interface ConversationSyncFileV1 {
  schemaVersion: typeof SYNC_SCHEMA_VERSION;
  conversationId: string;
  /** Reloj del LWW (Q17). Con deleted:true es el deletedAt. */
  updatedAt: number;
  deleted?: true;
  conversation?: Omit<Conversation, "driveFileId">;
  rounds?: Round[];
  replies?: Reply[];
  roundAnalyses?: RoundAnalysis[];
  panelThreads?: PanelThread[];
}

export interface TemplateTombstone {
  id: string;
  deletedAt: number;
}

export interface TemplatesSyncFileV1 {
  schemaVersion: typeof SYNC_SCHEMA_VERSION;
  templates: PromptTemplate[];
  tombstones: TemplateTombstone[];
}

export function buildConversationFile(data: ConversationSyncData): ConversationSyncFileV1 {
  const { driveFileId: _localOnly, ...conversation } = data.conversation;
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    conversationId: data.conversation.id,
    updatedAt: data.conversation.updatedAt,
    conversation,
    rounds: data.rounds,
    replies: data.replies,
    roundAnalyses: data.roundAnalyses,
    panelThreads: data.panelThreads,
  };
}

export function buildTombstoneFile(conversationId: string, deletedAt: number): ConversationSyncFileV1 {
  return { schemaVersion: SYNC_SCHEMA_VERSION, conversationId, updatedAt: deletedAt, deleted: true };
}

/** Validación mínima de un archivo remoto: shape reconocible o null (jamás tirar el pull entero por un archivo roto). */
export function parseConversationFile(raw: string): ConversationSyncFileV1 | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const f = parsed as Partial<ConversationSyncFileV1>;
    if (f.schemaVersion !== SYNC_SCHEMA_VERSION) return null;
    if (typeof f.conversationId !== "string" || typeof f.updatedAt !== "number") return null;
    if (f.deleted !== true && (typeof f.conversation !== "object" || f.conversation === null)) return null;
    return f as ConversationSyncFileV1;
  } catch {
    return null;
  }
}

export function parseTemplatesFile(raw: string): TemplatesSyncFileV1 | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const f = parsed as Partial<TemplatesSyncFileV1>;
    if (f.schemaVersion !== SYNC_SCHEMA_VERSION) return null;
    if (!Array.isArray(f.templates) || !Array.isArray(f.tombstones)) return null;
    return f as TemplatesSyncFileV1;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------
 * LWW por conversación (Q17): decisión pura sobre qué hacer con un
 * par (estado local, archivo remoto). El motor la ejecuta; el harness
 * la verifica sin red ni Dexie.
 * ------------------------------------------------------------------ */

export type LwwDecision =
  | { action: "apply-remote" } // remoto más nuevo: pisar local
  | { action: "delete-local" } // tombstone remoto más nuevo
  | { action: "push-local" } // local más nuevo: subir
  | { action: "push-tombstone" } // tombstone local más nuevo (anti-resurrección)
  | { action: "noop" };

export interface LocalConversationState {
  /** null = la conversación no existe localmente. */
  updatedAt: number | null;
  /** Tombstone local (syncMeta): la conversación fue borrada acá. */
  deletedAt: number | null;
}

export function decideLww(local: LocalConversationState, remote: ConversationSyncFileV1): LwwDecision {
  const localClock = Math.max(local.updatedAt ?? 0, local.deletedAt ?? 0);
  if (remote.updatedAt > localClock) {
    return remote.deleted === true ? { action: "delete-local" } : { action: "apply-remote" };
  }
  if (remote.updatedAt < localClock) {
    // Desempate del borde exacto: el tombstone local gana sobre contenido
    // local con el mismo reloj (borrar es la intención más reciente del
    // usuario en esta máquina).
    return local.deletedAt !== null && local.deletedAt >= (local.updatedAt ?? 0)
      ? { action: "push-tombstone" }
      : { action: "push-local" };
  }
  return { action: "noop" };
}

/* ------------------------------------------------------------------
 * Merge de plantillas (E2): por-ítem, LWW por updatedAt, con
 * tombstones. Puro: entra (local, remoto), sale el estado resuelto +
 * qué aplicar localmente + si el remoto quedó desactualizado.
 * ------------------------------------------------------------------ */

export interface TemplatesMergeResult {
  /** Estado convergido (lo que debería quedar en ambos lados). */
  resolved: TemplatesSyncFileV1;
  /** Plantillas a crear/actualizar localmente (vinieron más nuevas del remoto). */
  upsertLocal: PromptTemplate[];
  /** Ids a borrar localmente (tombstone remoto más nuevo que la copia local). */
  deleteLocal: string[];
  /** true si el remoto necesita un push (tenía menos información que el resuelto). */
  remoteStale: boolean;
}

export function mergeTemplates(
  local: PromptTemplate[],
  localTombstones: TemplateTombstone[],
  remote: TemplatesSyncFileV1 | null,
): TemplatesMergeResult {
  const remoteTemplates = remote?.templates ?? [];
  const remoteTombstones = remote?.tombstones ?? [];

  const tombstoneClock = new Map<string, number>();
  for (const t of [...localTombstones, ...remoteTombstones]) {
    tombstoneClock.set(t.id, Math.max(tombstoneClock.get(t.id) ?? 0, t.deletedAt));
  }

  const byId = new Map<string, { tpl: PromptTemplate; source: "local" | "remote" }>();
  for (const tpl of local) byId.set(tpl.id, { tpl, source: "local" });
  for (const tpl of remoteTemplates) {
    const existing = byId.get(tpl.id);
    if (!existing || tpl.updatedAt > existing.tpl.updatedAt) byId.set(tpl.id, { tpl, source: "remote" });
  }

  const resolvedTemplates: PromptTemplate[] = [];
  const upsertLocal: PromptTemplate[] = [];
  const deleteLocal: string[] = [];
  const localIds = new Set(local.map((t) => t.id));
  const localById = new Map(local.map((t) => [t.id, t] as const));

  for (const { tpl, source } of byId.values()) {
    const deletedAt = tombstoneClock.get(tpl.id);
    if (deletedAt !== undefined && deletedAt >= tpl.updatedAt) {
      // El borrado gana (>=: borrar es acción explícita; recrear con id nuevo siempre es posible).
      if (localIds.has(tpl.id)) deleteLocal.push(tpl.id);
      continue;
    }
    resolvedTemplates.push(tpl);
    const localCopy = localById.get(tpl.id);
    if (source === "remote" && (!localCopy || tpl.updatedAt > localCopy.updatedAt)) upsertLocal.push(tpl);
  }

  const resolvedTombstones: TemplateTombstone[] = [...tombstoneClock.entries()]
    .filter(([id, deletedAt]) => {
      const winner = byId.get(id);
      return !winner || deletedAt >= winner.tpl.updatedAt;
    })
    .map(([id, deletedAt]) => ({ id, deletedAt }));

  const resolved: TemplatesSyncFileV1 = {
    schemaVersion: SYNC_SCHEMA_VERSION,
    templates: resolvedTemplates.sort((a, b) => a.createdAt - b.createdAt),
    tombstones: resolvedTombstones.sort((a, b) => a.id.localeCompare(b.id)),
  };

  const remoteStale = remote === null || JSON.stringify(resolved) !== JSON.stringify({
    schemaVersion: SYNC_SCHEMA_VERSION,
    templates: [...remoteTemplates].sort((a, b) => a.createdAt - b.createdAt),
    tombstones: [...remoteTombstones].sort((a, b) => a.id.localeCompare(b.id)),
  });

  return { resolved, upsertLocal, deleteLocal, remoteStale };
}
