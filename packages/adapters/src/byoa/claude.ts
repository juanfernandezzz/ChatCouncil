/**
 * Dialecto claude.ai (BYOA, Fase 3) — endpoint interno CON ESTADO.
 * ------------------------------------------------------------------
 * Ingeniería inversa activa contra la sesión propia del usuario
 * (verificado 2026-07-10 en el Chrome de Juan, logueado). Hallazgos:
 *   · Auth = SÓLO cookie de sesión httpOnly (sin Authorization, sin
 *     anti-CSRF, sin token en la página). El offscreen la adjunta con
 *     credentials:"include"; el código nunca la ve.
 *   · Endpoint con estado: `POST /api/organizations/{orgId}/chat_conversations`
 *     crea la conversación (uuid generado por el cliente; body mínimo
 *     `{uuid, name:""}` → 201), y recién entonces
 *     `POST .../{convUuid}/completion` acepta el prompt (POST a una
 *     conversación inexistente → 404).
 *   · parent_message_uuid del PRIMER turno = raíz all-zeros
 *     `00000000-0000-4000-8000-000000000000` (verificado: da 200).
 *   · Cuerpo mínimo de completion para el dialecto Messages:
 *     `{prompt, parent_message_uuid, rendering_mode:"messages"}`. `model`
 *     es OPCIONAL (omitir → el server usa el default de la cuenta; da 200
 *     igual) — se omite a propósito para no hardcodear un id de modelo
 *     frágil; el override llega en Fase 4.
 *   · `rendering_mode:"messages"` es lo que hace que el stream salga en el
 *     dialecto Anthropic Messages (message_start / content_block_delta con
 *     text_delta / message_stop). SIN ese flag el server responde el
 *     formato legacy `event: completion` (no reusable). Con él, el parser
 *     es EXACTAMENTE `createAnthropicParser` de BYOK: mismo mapeo de
 *     eventos → AdapterChunk, y el evento extra `message_limit` (propio de
 *     claude.ai) cae en el `default` ignorado. Reuso, no duplico.
 */

import { createAnthropicParser } from "../byok/anthropic";
import type { ByoaCompletionParams, ByoaCreateParams, ByoaProviderConfig } from "./types";

const CLAUDE_ORIGIN = "https://claude.ai";
/** Raíz de una conversación nueva: el server acepta este parent en el 1er turno. */
const ROOT_PARENT_MESSAGE_UUID = "00000000-0000-4000-8000-000000000000";

export const claudeByoaProvider: ByoaProviderConfig = {
  id: "claude",
  label: "Claude (claude.ai · sesión)",
  sessionOrigin: CLAUDE_ORIGIN,
  rootParentMessageUuid: ROOT_PARENT_MESSAGE_UUID,

  buildCreateConversation: ({ orgId, conversationUuid }: ByoaCreateParams) => ({
    url: `${CLAUDE_ORIGIN}/api/organizations/${orgId}/chat_conversations`,
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ uuid: conversationUuid, name: "" }),
    stream: false,
  }),

  buildCompletion: ({ orgId, conversationUuid, parentMessageUuid, prompt, model }: ByoaCompletionParams) => ({
    url: `${CLAUDE_ORIGIN}/api/organizations/${orgId}/chat_conversations/${conversationUuid}/completion`,
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify({
      prompt,
      parent_message_uuid: parentMessageUuid,
      // Ver header: fuerza el dialecto Messages (parseado por createAnthropicParser).
      rendering_mode: "messages",
      ...(model ? { model } : {}),
    }),
    stream: true,
  }),

  createParser: createAnthropicParser,

  notes:
    "BYOA endpoint con estado: crea conversación (POST chat_conversations, body mínimo {uuid,name}) y luego completion (SSE Messages via rendering_mode:messages). Auth por cookie de sesión (credentials:include en el offscreen). parent del 1er turno = raíz all-zeros; model omitido → default de la cuenta. Verificado manualmente 2026-07-10.",
};
