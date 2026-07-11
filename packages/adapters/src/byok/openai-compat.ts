/**
 * Dialecto openai-compat — @chatcouncil/adapters (Fase 2)
 * ------------------------------------------------------------------
 * Un solo builder + parser cubre a OpenAI y a los que hablan su
 * dialecto de `/chat/completions` con SSE (`data: {...}` + `[DONE]`):
 * DeepSeek y Perplexity en esta fase; Groq/xAI/OpenRouter/Mistral
 * cuando se habiliten (E6: llegan como config + probe + test manual,
 * no como código nuevo).
 *
 * Diferencias de dialecto modeladas como opciones:
 *   · `includeUsageOption`: OpenAI sólo manda `usage` en streaming si se
 *     pide `stream_options.include_usage`; DeepSeek/Perplexity lo
 *     incluyen solos en los chunks finales y el flag podría rechazarse.
 *   · terminación: `[DONE]` explícito O fin de cuerpo (EOF) — el parser
 *     acepta ambos y emite exactamente UN terminal.
 * Chunks malformados (JSON truncado) se saltean sin matar el stream —
 * un frame roto no debe costar la respuesta entera.
 * `reasoning_content` (DeepSeek reasoner) se ignora a propósito en v1:
 * el contrato AdapterChunk sólo modela texto de respuesta (ledger §0.3).
 */

import type { AdapterChunk, CuratedModel } from "@chatcouncil/shared";
import { createSseDecoder } from "./sse";
import type { ByokProviderConfig, ByokRoute, ByokStreamParser } from "./types";

export interface OpenAiCompatOptions {
  id: string;
  label: string;
  baseUrl: string;
  /** p. ej. "/v1/chat/completions" (openai) o "/chat/completions" (deepseek/perplexity). */
  chatPath: string;
  defaultModel: string;
  route: ByokRoute;
  includeUsageOption?: boolean;
  /** Registro curado para el selector (Fase 4, E4). */
  models?: CuratedModel[];
  notes?: string;
}

interface OaStreamChunk {
  choices?: Array<{ delta?: { content?: string | null } | null } | null> | null;
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  error?: { message?: string } | null;
}

export function createOpenAiCompatParser(): ByokStreamParser {
  const sse = createSseDecoder();
  let tokensIn: number | undefined;
  let tokensOut: number | undefined;
  let terminal = false;

  const handleData = (data: string): AdapterChunk[] => {
    if (terminal) return [];
    if (data.trim() === "[DONE]") {
      terminal = true;
      return [{ kind: "done", tokensIn, tokensOut }];
    }
    let obj: OaStreamChunk;
    try {
      obj = JSON.parse(data) as OaStreamChunk;
    } catch {
      return []; // frame malformado: saltear, no matar el stream
    }
    if (obj.error?.message) {
      terminal = true;
      return [{ kind: "error", message: obj.error.message }];
    }
    const out: AdapterChunk[] = [];
    if (obj.usage) {
      tokensIn = obj.usage.prompt_tokens ?? tokensIn;
      tokensOut = obj.usage.completion_tokens ?? tokensOut;
    }
    const delta = obj.choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta.length > 0) {
      out.push({ kind: "text-delta", text: delta });
    }
    return out;
  };

  return {
    push: (text) => sse.push(text).flatMap((ev) => handleData(ev.data)),
    end: () => {
      const out = sse.end().flatMap((ev) => handleData(ev.data));
      if (!terminal) {
        // Cuerpo terminado sin [DONE] (dialectos EOF-terminados): done leniente.
        terminal = true;
        out.push({ kind: "done", tokensIn, tokensOut });
      }
      return out;
    },
  };
}

export function openAiCompatProvider(opts: OpenAiCompatOptions): ByokProviderConfig {
  const config: ByokProviderConfig = {
    id: opts.id,
    label: opts.label,
    baseUrl: opts.baseUrl,
    defaultModel: opts.defaultModel,
    route: opts.route,
    buildRequest: ({ prompt, history, apiKey, model, maxTokens }) => ({
      url: `${opts.baseUrl}${opts.chatPath}`,
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: model ?? opts.defaultModel,
        // E2=B: mismo shape {role,content} de siempre; el historial va
        // primero, en orden, y el turno nuevo al final.
        messages: [...(history ?? []), { role: "user", content: prompt }],
        stream: true,
        ...(opts.includeUsageOption ? { stream_options: { include_usage: true } } : {}),
        ...(maxTokens != null ? { max_tokens: maxTokens } : {}),
      }),
      stream: true,
    }),
    createParser: createOpenAiCompatParser,
  };
  if (opts.notes !== undefined) config.notes = opts.notes;
  if (opts.models !== undefined) config.models = opts.models;
  return config;
}
