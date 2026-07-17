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
 *
 * Threading multi-turno (Fase 4, E2 — recon Round B, verificado
 * 2026-07-11 en el Chrome de Juan, 3 turnos reales en una conversación
 * nueva): el `parent_message_uuid` que la SPA real manda en el turno N+1
 * es el uuid del MENSAJE DEL ASISTENTE del turno N (nunca el del mensaje
 * humano). Confirmado dos veces de forma consistente vía el árbol de la
 * conversación. Ese uuid NO se intentó leer del SSE (el `message_start`
 * de la Messages API no fue verificable sin fabricar una request no
 * confirmada — se paró ahí a propósito); en cambio sale de una tercera
 * request, cookie-auth igual que las otras dos y alcanzable por el mismo
 * `byoa:proxy` genérico: `GET .../chat_conversations/{id}?tree=True&
 * rendering_mode=messages&render_all_tools=true&consistency=strong`, que
 * la propia SPA ya usa para refrescar la vista tras cada turno. Devuelve
 * `{chat_messages: [{uuid, parent_message_uuid, sender, index, ...}]}`.
 */

import { createAnthropicParser } from "../byok/anthropic";
import type { ByoaCompletionParams, ByoaCreateParams, ByoaGetThreadParams, ByoaProviderConfig } from "./types";

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

  buildGetThread: ({ orgId, conversationUuid }: ByoaGetThreadParams) => ({
    url: `${CLAUDE_ORIGIN}/api/organizations/${orgId}/chat_conversations/${conversationUuid}?tree=True&rendering_mode=messages&render_all_tools=true&consistency=strong`,
    method: "GET",
    headers: { accept: "application/json" },
    stream: false,
  }),

  parseLastAssistantMessageUuid: (body: string): string | null => {
    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch {
      return null;
    }
    const messages = (data as { chat_messages?: unknown })?.chat_messages;
    if (!Array.isArray(messages)) return null;
    const assistantMessages = messages.filter(
      (m): m is { uuid: string; index: number } =>
        !!m && typeof m === "object" && (m as { sender?: unknown }).sender === "assistant" && typeof (m as { uuid?: unknown }).uuid === "string",
    );
    if (assistantMessages.length === 0) return null;
    assistantMessages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return assistantMessages[assistantMessages.length - 1]!.uuid;
  },

  createParser: createAnthropicParser,

  notes:
    "BYOA endpoint con estado: crea conversación (POST chat_conversations, body mínimo {uuid,name}) y luego completion (SSE Messages via rendering_mode:messages). Auth por cookie de sesión (credentials:include en el offscreen). parent del 1er turno = raíz all-zeros; model omitido → default de la cuenta. Verificado manualmente 2026-07-10.",

  // Registro curado (Fase 4, E4). OJO: acá "verified" es MÁS estricto que
  // en BYOK — estos ids son reales y oficiales en la API pública de
  // Anthropic (confirmados por búsqueda 2026-07-10). Que un id sea válido
  // en la API pública NO garantiza que el endpoint interno de claude.ai
  // acepte el override `model` igual: hasta el cierre de Fase 5 ese
  // override nunca se había probado con un valor real (la aceptación de
  // Fase 3 siempre omitió `model`). El 2026-07-17 el mini-check del
  // cierre de Fase 5 verificó `claude-haiku-4-5` con una llamada real
  // (ver esa entrada). "verified" NO se hereda entre ids: Sonnet/Opus
  // siguen sin probar.
  models: [
    {
      id: "(default de la cuenta)",
      label: "Default de la cuenta (sin override)",
      verified: true,
      note: "Único camino probado en la aceptación de Fase 3: omitir `model` por completo.",
    },
    {
      id: "claude-sonnet-5",
      label: "Claude Sonnet 5",
      verified: false,
      note: "id válido en la API pública (tier vigente). El override en este endpoint interno NUNCA se probó — confirmar con una llamada real antes de confiar.",
    },
    {
      id: "claude-opus-4-8",
      label: "Claude Opus 4.8",
      verified: false,
      note: "id válido en la API pública (flagship vigente). Mismo caveat: override interno sin probar.",
    },
    {
      id: "claude-haiku-4-5",
      label: "Claude Haiku 4.5",
      verified: true,
      note: "Modelo DESIGNADO PARA PRUEBAS (regla de Fase 5: todo uso de Anthropic en aceptación va con Haiku para gastar poca cuota). Override VERIFICADO contra el endpoint interno el 2026-07-17 (mini-check del cierre de Fase 5, vía follow-up 'continuar solo acá': modelId persistido, stream done, content 'ok', 1718 ms). El transporte del override es el mismo para round global y follow-up, así que la verificación cubre ambos scopes.",
    },
  ],
};
