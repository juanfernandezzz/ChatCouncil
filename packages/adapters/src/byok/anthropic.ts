/**
 * Dialecto Anthropic (Messages API, SSE con eventos nombrados) — Fase 2
 * ------------------------------------------------------------------
 * CORS directo desde la SPA vía el header oficial de opt-in
 * `anthropic-dangerous-direct-browser-access: true` (matriz: confianza
 * alta, estable desde ago-2024). `max_tokens` es OBLIGATORIO en esta
 * API → default explícito acá.
 *
 * Mapeo de eventos → AdapterChunk:
 *   · content_block_delta / text_delta      → text-delta
 *   · message_start (usage.input_tokens)    → captura tokensIn
 *   · message_delta (usage.output_tokens)   → captura tokensOut
 *   · message_stop                          → done (terminal)
 *   · error                                 → error (terminal)
 *   · ping / content_block_start|stop       → ignorados
 *   · thinking_delta                        → IGNORADO a propósito en v1
 *     (el contrato AdapterChunk sólo modela texto de respuesta; ledger).
 * `end()` leniente: si el cuerpo cierra sin message_stop, done con lo
 * capturado — nunca cuelgue silencioso por un cierre abrupto del server.
 */

import type { AdapterChunk } from "@chatcouncil/shared";
import { createSseDecoder } from "./sse";
import type { ByokProviderConfig, ByokStreamParser } from "./types";

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 1024;

interface AnthropicEventShape {
  type?: string;
  message?: { usage?: { input_tokens?: number } | null } | null;
  delta?: { type?: string; text?: string } | null;
  usage?: { output_tokens?: number } | null;
  error?: { message?: string } | null;
}

export function createAnthropicParser(): ByokStreamParser {
  const sse = createSseDecoder();
  let tokensIn: number | undefined;
  let tokensOut: number | undefined;
  let terminal = false;

  const handle = (eventName: string, data: string): AdapterChunk[] => {
    if (terminal) return [];
    let obj: AnthropicEventShape;
    try {
      obj = JSON.parse(data) as AnthropicEventShape;
    } catch {
      return []; // frame malformado: saltear
    }
    // El nombre puede venir del campo `event:` o del `type` del JSON.
    const kind = eventName !== "message" ? eventName : (obj.type ?? "");
    switch (kind) {
      case "message_start": {
        const input = obj.message?.usage?.input_tokens;
        if (typeof input === "number") tokensIn = input;
        return [];
      }
      case "content_block_delta": {
        if (obj.delta?.type === "text_delta" && typeof obj.delta.text === "string") {
          return [{ kind: "text-delta", text: obj.delta.text }];
        }
        return []; // thinking_delta / input_json_delta: fuera del contrato v1
      }
      case "message_delta": {
        const output = obj.usage?.output_tokens;
        if (typeof output === "number") tokensOut = output;
        return [];
      }
      case "message_stop": {
        terminal = true;
        return [{ kind: "done", tokensIn, tokensOut }];
      }
      case "error": {
        terminal = true;
        return [{ kind: "error", message: obj.error?.message ?? "error del proveedor" }];
      }
      default:
        return []; // ping, content_block_start/stop, futuros
    }
  };

  return {
    push: (text) => sse.push(text).flatMap((ev) => handle(ev.event, ev.data)),
    end: () => {
      const out = sse.end().flatMap((ev) => handle(ev.event, ev.data));
      if (!terminal) {
        terminal = true;
        out.push({ kind: "done", tokensIn, tokensOut });
      }
      return out;
    },
  };
}

export function anthropicProvider(): ByokProviderConfig {
  return {
    id: "anthropic",
    label: "Claude (Anthropic)",
    baseUrl: "https://api.anthropic.com",
    // DATO FRÁGIL (ledger §0.3): alias sin fecha, confianza moderada-alta.
    defaultModel: "claude-sonnet-4-5",
    route: "direct",
    buildRequest: ({ prompt, apiKey, model, maxTokens }) => ({
      url: "https://api.anthropic.com/v1/messages",
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: model ?? "claude-sonnet-4-5",
        max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
        stream: true,
      }),
      stream: true,
    }),
    createParser: createAnthropicParser,
    notes: "Directo por header de opt-in; max_tokens obligatorio (default 1024).",
  };
}
