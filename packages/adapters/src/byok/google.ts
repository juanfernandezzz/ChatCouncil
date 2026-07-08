/**
 * Dialecto Google Gemini (generateContent streaming, alt=sse) — Fase 2
 * ------------------------------------------------------------------
 * CORS directo (matriz: confianza moderada → el probe de E7 lo confirma
 * o lo refuta en el navegador real). Auth por header `x-goog-api-key`
 * — NUNCA `?key=` en la URL: las llaves no viajan en query strings (se
 * loggean en cualquier intermediario) y el requestId del proxy tampoco
 * debe delatarlas.
 *
 * Forma del stream: eventos `data:` sin nombre, JSON con
 * `candidates[0].content.parts[].text` (delta), `usageMetadata`
 * acumulativo (último gana) y `finishReason` en el chunk final. SIN
 * sentinela [DONE]: termina por EOF → el terminal `done` lo emite
 * `end()`. `promptFeedback.blockReason` → error (bloqueo de safety del
 * proveedor, distinto de un HTTP error).
 */

import type { AdapterChunk } from "@chatcouncil/shared";
import { createSseDecoder } from "./sse";
import type { ByokProviderConfig, ByokStreamParser } from "./types";

const GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com";
// DATO FRÁGIL (ledger §0.3): confianza moderada; override en el harness.
const GOOGLE_DEFAULT_MODEL = "gemini-2.5-flash";

interface GeminiStreamChunk {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string } | null> | null } | null;
    finishReason?: string | null;
  } | null> | null;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } | null;
  promptFeedback?: { blockReason?: string | null } | null;
  error?: { message?: string } | null;
}

export function createGoogleParser(): ByokStreamParser {
  const sse = createSseDecoder();
  let tokensIn: number | undefined;
  let tokensOut: number | undefined;
  let terminal = false;

  const handle = (data: string): AdapterChunk[] => {
    if (terminal) return [];
    let obj: GeminiStreamChunk;
    try {
      obj = JSON.parse(data) as GeminiStreamChunk;
    } catch {
      return [];
    }
    if (obj.error?.message) {
      terminal = true;
      return [{ kind: "error", message: obj.error.message }];
    }
    const blockReason = obj.promptFeedback?.blockReason;
    if (blockReason) {
      terminal = true;
      return [{ kind: "error", message: `bloqueado por el proveedor: ${blockReason}` }];
    }
    if (obj.usageMetadata) {
      tokensIn = obj.usageMetadata.promptTokenCount ?? tokensIn;
      tokensOut = obj.usageMetadata.candidatesTokenCount ?? tokensOut;
    }
    const parts = obj.candidates?.[0]?.content?.parts ?? [];
    const text = (parts ?? [])
      .map((p) => (p && typeof p.text === "string" ? p.text : ""))
      .join("");
    if (text.length > 0) return [{ kind: "text-delta", text }];
    return [];
  };

  return {
    push: (text) => sse.push(text).flatMap((ev) => handle(ev.data)),
    end: () => {
      const out = sse.end().flatMap((ev) => handle(ev.data));
      if (!terminal) {
        terminal = true;
        out.push({ kind: "done", tokensIn, tokensOut }); // EOF-terminado por diseño
      }
      return out;
    },
  };
}

export function googleProvider(): ByokProviderConfig {
  return {
    id: "google",
    label: "Gemini (Google AI)",
    baseUrl: GOOGLE_BASE_URL,
    defaultModel: GOOGLE_DEFAULT_MODEL,
    route: "direct",
    buildRequest: ({ prompt, apiKey, model, maxTokens }) => ({
      url: `${GOOGLE_BASE_URL}/v1beta/models/${encodeURIComponent(model ?? GOOGLE_DEFAULT_MODEL)}:streamGenerateContent?alt=sse`,
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        ...(maxTokens != null ? { generationConfig: { maxOutputTokens: maxTokens } } : {}),
      }),
      stream: true,
    }),
    createParser: createGoogleParser,
    notes: "Directo (confianza moderada — correr el probe). Stream EOF-terminado, sin [DONE].",
  };
}
