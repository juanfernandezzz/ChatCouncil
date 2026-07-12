import Dexie, { type Table } from "dexie";

/**
 * Esquema de datos — ChatCouncil (Q13)
 * ------------------------------------------------------------------
 * Conversation → Round(promptGlobal, adjuntos, toggles) → Reply(por
 * panel) → Attempt[] (versionado, Q15).
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
 *
 * Fase 4 (E1/E2/E4/E8) agrega, de forma ADITIVA (version 2; verificado
 * que ninguna fase anterior escribio filas reales todavia, asi que no
 * hay migracion de datos real, solo de esquema):
 *  - `Reply.panelSourceId` reemplaza el uso ambiguo de `modelId` como
 *    identificador de panel — ver packages/shared/panel-source.ts (E1).
 *    `modelId` ahora es SOLO la variante de modelo usada en ese intento
 *    (E4: se elige por Round, no se lockea con la fuente).
 *  - `Reply.createdAt` permite reconstruir el orden cronologico de un
 *    panel sin depender de `Round.index` — necesario porque "continuar
 *    solo aqui" (panel-continued) vive fuera del flujo de Round normal
 *    y de otro modo no tendria una posicion temporal fiable.
 *  - `Reply.followUpPrompt` guarda el texto puntual de un
 *    "continuar solo aqui" (Round.promptText es el prompt GLOBAL; un
 *    follow-up de un solo panel no tiene donde vivir sin este campo).
 *  - `Conversation.byoaOrgId` persiste la organizacion de sesion BYOA
 *    elegida para esta conversacion (E8) — es un identificador, no un
 *    secreto.
 *  - Tabla `panelThreads`: estado de hilo por panel BYOA (conversationUuid
 *    + ultimo id de mensaje, para encadenar parent_message_uuid). Recon
 *    Round B (2026-07-11) confirmo el campo real: el parent_message_uuid
 *    del turno N+1 es el uuid del mensaje del ASISTENTE del turno N, y
 *    sale de un GET al arbol de la conversacion (no del SSE). Consumidor
 *    real desde entonces: `dispatchReply` en conversation-repo.ts lee el
 *    hilo antes de despachar y lo escribe tras cada turno BYOA exitoso.
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
  /** BYOA (E8): organizacion de sesion elegida para esta conversacion. Identificador, no secreto. */
  byoaOrgId?: string;
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
  /** Identidad de panel: "byok:openai" | "byoa:claude" | etc. (E1, packages/shared/panel-source.ts). */
  panelSourceId: string;
  /** Variante de modelo efectivamente usada en ESTE intento (E4: se elige por Round, no se lockea). */
  modelId: string;
  connectionMode: ConnectionMode;
  /** "panel-continued" = generado por la excepcion "continuar solo aqui" (Q13). */
  scope: "round" | "panel-continued";
  /** Orden cronologico del panel, independiente de Round.index (necesario para panel-continued). */
  createdAt: number;
  /** Solo con scope "panel-continued": el texto puntual del follow-up a este panel. */
  followUpPrompt?: string;
  /** Historial de intentos, nunca se sobreescribe (Q15). El ultimo es el vigente. */
  attempts: Attempt[];
}

/**
 * Estado de hilo BYOA por panel (Fase 4, E2 — ver nota de esquema arriba).
 * Sin consumidores de escritura real hasta que el mini-recon confirme el
 * campo del stream que expone el id del mensaje para encadenar el turno
 * siguiente; existe ahora para no requerir otra migracion despues.
 */
export interface PanelThread {
  /** `${conversationId}:${panelSourceId}` — determinístico, evita duplicados. */
  id: string;
  conversationId: string;
  panelSourceId: string;
  /** uuid interno de la conversacion en claude.ai (lo genera el cliente al crearla). */
  providerConversationId: string;
  /** uuid del ultimo mensaje del hilo — candidato a parent_message_uuid del proximo turno. */
  lastMessageId: string;
  updatedAt: number;
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

/* ------------------------------------------------------------------
 * Fase 5 (Q30) — resultado de Comparar/Resumir como OBJETO PROPIO
 * ligado al Round, no texto libre perdible. Se permiten VARIOS
 * análisis por Round (re-correr con otro juez es parte del caso de
 * uso de auditoría). `labelMap` es el "sello": la correspondencia
 * etiqueta→panel que el juez NUNCA ve (vive acá y en la UI, jamás en
 * el prompt — ver apps/web/src/lib/judge/ y guard:judge).
 * ------------------------------------------------------------------ */

export type AnalysisKind = "compare" | "summarize";
export type AnalysisStatus = "ok" | "parse_error" | "error";

export interface AnalysisLabelEntry {
  /** "Modelo A" (anonimizado) o el nombre real (toggle Q30 desactivado). */
  label: string;
  panelSourceId: string;
  replyId: string;
  attemptId: string;
}

/** Cuántos términos identificatorios se redactaron en la copia enviada al juez (E2-iii, auditabilidad). */
export interface AnalysisRedaction {
  label: string;
  count: number;
}

export interface RubricCriterion {
  score: number; // 1–5, clampeado al parsear
  nota: string;
}

/** Rúbrica fija v1 (Q30): corrección factual aparente, profundidad, señales de sesgo, tono. */
export interface RubricEntry {
  label: string;
  correccionFactual: RubricCriterion;
  profundidad: RubricCriterion;
  senalesSesgo: string;
  tono: string;
}

export interface CompareResult {
  veredicto: string;
  porRespuesta: RubricEntry[];
}

export interface SummarizeResult {
  resumen: string;
  coincidencias: string[];
  divergencias: string[];
}

export interface RoundAnalysis {
  id: string;
  conversationId: string;
  roundId: string;
  kind: AnalysisKind;
  createdAt: number;
  /** Identidad del juez — metadato de auditoría; jamás entró al prompt. */
  judgePanelSourceId: string;
  judgeModelId?: string;
  /** true si el proveedor del juez participa de las respuestas analizadas (riesgo de auto-preferencia). */
  judgeWasParticipant: boolean;
  anonymized: boolean;
  labelMap: AnalysisLabelEntry[];
  redactions: AnalysisRedaction[];
  rubricVersion: 1;
  status: AnalysisStatus;
  /** SIEMPRE se conserva la respuesta cruda del juez (audit trail; con parse_error es lo único legible). */
  rawResponse: string;
  compare?: CompareResult;
  summarize?: SummarizeResult;
  errorMessage?: string;
  latencyMs?: number;
  tokensIn?: number;
  tokensOut?: number;
}

class ChatCouncilDB extends Dexie {
  conversations!: Table<Conversation, string>;
  rounds!: Table<Round, string>;
  replies!: Table<Reply, string>;
  promptTemplates!: Table<PromptTemplate, string>;
  blobs!: Table<BlobRecord, string>;
  panelThreads!: Table<PanelThread, string>;
  roundAnalyses!: Table<RoundAnalysis, string>;

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
    // Fase 4 — aditivo. `[conversationId+panelSourceId]` es el indice que
    // realmente necesita el threading BYOK (E2): "todas las replies de
    // este panel en esta conversacion, en orden" para reconstruir el
    // historial de mensajes. `panelThreads` sin consumidores reales
    // todavia (ver nota de esquema arriba).
    this.version(2)
      .stores({
        conversations: "id, updatedAt, syncState",
        rounds: "id, conversationId, [conversationId+index]",
        replies: "id, roundId, conversationId, panelSourceId, [conversationId+panelSourceId]",
        promptTemplates: "id, updatedAt, *tags",
        blobs: "id",
        panelThreads: "id, [conversationId+panelSourceId]",
      })
      .upgrade((tx) =>
        // Defensivo: ninguna fase anterior escribio Reply reales (verificado
        // por grep antes de este cambio), pero si alguien dejo datos de
        // prueba manuales, esto deriva panelSourceId de los campos viejos
        // en vez de dejar la fila inconsistente.
        tx
          .table<Reply, string>("replies")
          .toCollection()
          .modify((r) => {
            const legacy = r as Reply & { panelSourceId?: string; createdAt?: number };
            if (!legacy.panelSourceId) {
              legacy.panelSourceId = `${legacy.connectionMode}:${legacy.modelId}`;
            }
            if (typeof legacy.createdAt !== "number") {
              legacy.createdAt = legacy.attempts[0]?.startedAt ?? Date.now();
            }
          }),
      );
    // Fase 5 (Q30) — ADITIVA: tabla nueva, cero cambios en las existentes,
    // cero migración de datos (una tabla nueva nace vacía por definición).
    // Índices para las dos consultas reales: "análisis de este Round"
    // (AnalyzeSection) y "análisis de esta conversación" (PDF).
    this.version(3).stores({
      conversations: "id, updatedAt, syncState",
      rounds: "id, conversationId, [conversationId+index]",
      replies: "id, roundId, conversationId, panelSourceId, [conversationId+panelSourceId]",
      promptTemplates: "id, updatedAt, *tags",
      blobs: "id",
      panelThreads: "id, [conversationId+panelSourceId]",
      roundAnalyses: "id, roundId, conversationId, [conversationId+roundId], createdAt",
    });
  }
}

export const db = new ChatCouncilDB();

/** Utilidad de ids: evita traer una dependencia externa solo para esto. */
export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
