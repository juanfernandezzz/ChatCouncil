import Dexie, { type Table } from "dexie";

/**
 * Esquema de datos — ChatCouncil (Q13)
 * ------------------------------------------------------------------
 * Conversation → Round(promptGlobal, adjuntos, toggles) → Reply(por
 * modelo) → Attempt[] (versionado, Q15).
 *
 * Decisiones encarnadas en este esquema:
 *  - Q14 (lock duro): `lockedModelIds` se escribe una sola vez, en el
 *    primer Round, y no se toca despues. `hiddenModelIds` es la unica
 *    forma de "quitar" un modelo de la vista sin romper el historico.
 *  - Q15 (fallos versionan): `Reply.attempts` es un array que crece;
 *    un reintento agrega un Attempt, nunca reemplaza el anterior.
 *  - Q13 (excepciones al input global): `Reply.scope` distingue una
 *    respuesta normal de round de una generada por "continuar solo
 *    aqui" (follow-up dentro de un panel).
 *  - Q18 (blobs no van a Drive): el contenido binario de adjuntos vive
 *    en la tabla `blobs`, separada de los metadatos en `attachments`,
 *    para que el sync a Drive (Fase 7) pueda ignorar `blobs` sin
 *    tocar el resto del modelo.
 */

export type ReplyStatus = "pending" | "streaming" | "done" | "error" | "aborted";
export type ConnectionMode = "byoa" | "byok";
export type SyncState = "local-only" | "synced" | "pending" | "conflict";

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Se fija en el primer Round y nunca vuelve a escribirse (Q14). */
  lockedModelIds: string[];
  /** Ocultar sin borrar (Q14a). No afecta lockedModelIds. */
  hiddenModelIds: string[];
  syncState: SyncState;
  driveFileId?: string;
}

export interface AttachmentMeta {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  /** FK a la tabla `blobs`. El blob en si NUNCA sincroniza a Drive (Q18). */
  blobId: string;
}

export interface Round {
  id: string;
  conversationId: string;
  index: number;
  promptText: string;
  attachments: AttachmentMeta[];
  toggles: { webSearch: boolean; imageGeneration: boolean };
  createdAt: number;
}

export interface Attempt {
  id: string;
  status: ReplyStatus;
  content: string;
  startedAt: number;
  finishedAt?: number;
  errorMessage?: string;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs?: number;
}

export interface Reply {
  id: string;
  roundId: string;
  conversationId: string;
  modelId: string;
  connectionMode: ConnectionMode;
  /** "panel-continued" = generado por la excepcion "continuar solo aqui" (Q13). */
  scope: "round" | "panel-continued";
  /** Historial de intentos, nunca se sobreescribe (Q15). El ultimo es el vigente. */
  attempts: Attempt[];
}

export interface PromptTemplate {
  id: string;
  title: string;
  body: string; // soporta tokens {{variable}}
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface BlobRecord {
  id: string;
  data: Blob;
}

class ChatCouncilDB extends Dexie {
  conversations!: Table<Conversation, string>;
  rounds!: Table<Round, string>;
  replies!: Table<Reply, string>;
  promptTemplates!: Table<PromptTemplate, string>;
  blobs!: Table<BlobRecord, string>;

  constructor() {
    super("chatcouncil");
    this.version(1).stores({
      // Indices elegidos para las consultas mas frecuentes: listar por
      // fecha (sidebar), y resolver la cadena Conversation->Round->Reply.
      conversations: "id, updatedAt, syncState",
      rounds: "id, conversationId, [conversationId+index]",
      replies: "id, roundId, conversationId, modelId",
      promptTemplates: "id, updatedAt, *tags",
      blobs: "id",
    });
  }
}

export const db = new ChatCouncilDB();

/** Utilidad de ids: evita traer una dependencia externa solo para esto. */
export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
