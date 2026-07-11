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
    // HALLAZGO (Fase 4, E4, búsqueda 2026-07-10): la documentación oficial
    // de Anthropic (github.com/anthropics/skills, platform.claude.com) ya
    // NO lista "claude-sonnet-4-5" entre los modelos activos — el tier
    // Sonnet vigente es "claude-sonnet-5" (lanzado 2026-06-30). NO cambio
    // este default acá: alterar el comportamiento de una ruta YA
    // verificada en Fase 2 no es alcance de Fase 4. Queda anotado en el
    // ledger para que se decida aparte; el registro `models` de abajo ya
    // ofrece claude-sonnet-5 como opción elegible en el selector.
    defaultModel: "claude-sonnet-4-5",
    route: "direct",
    buildRequest: ({ prompt, history, apiKey, model, maxTokens }) => ({
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
        // E2=B: los turnos previos de este panel van primero, en orden;
        // el mismo shape {role,content} de siempre, el array crece.
        messages: [...(history ?? []), { role: "user", content: prompt }],
        stream: true,
      }),
      stream: true,
    }),
    createParser: createAnthropicParser,
    notes: "Directo por header de opt-in; max_tokens obligatorio (default 1024).",
    // Registro curado (Fase 4, E4). IDs confirmados contra documentación
    // oficial de Anthropic (búsqueda 2026-07-10) — "verified" acá igual
    // significa "probado con una llamada real de Fase 2", no "el id es
    // válido"; sonnet-5/opus-4.8/haiku-4.5 son ids reales y oficiales
    // pero sin llamada real todavía.
    models: [
      {
        id: "claude-sonnet-4-5",
        label: "Claude Sonnet 4.5",
        verified: true,
        note: "default probado en la aceptación de Fase 2. Ojo: ya no figura en la lista oficial de modelos activos (ver nota del default arriba).",
      },
      {
        id: "claude-sonnet-5",
        label: "Claude Sonnet 5",
        verified: false,
        note: "tier Sonnet vigente segun docs oficiales (lanzado 2026-06-30); probable reemplazo del default. No probado con una llamada real todavia.",
      },
      {
        id: "claude-opus-4-8",
        label: "Claude Opus 4.8",
        verified: false,
        note: "flagship vigente segun docs oficiales; mas caro. No probado.",
      },
      {
        id: "claude-haiku-4-5",
        label: "Claude Haiku 4.5",
        verified: false,
        note: "nivel economico/rapido. No probado.",
      },
    ],
  };
}
