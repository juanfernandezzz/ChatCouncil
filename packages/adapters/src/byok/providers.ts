/**
 * Registro BYOK de Fase 2 — @chatcouncil/adapters
 * ------------------------------------------------------------------
 * E6 (con la ampliación de Juan): CINCO proveedores de punta a punta.
 *   · Anthropic, Google      → directos (los transportes más simples
 *     validan el contrato primero — justificación vigente del reorden,
 *     ya sin la motivación móvil retirada por la enmienda).
 *   · OpenAI, DeepSeek, Perplexity → proxied (CORS bloqueado); los tres
 *     hablan el dialecto openai-compat con paths/flags propios.
 * Groq/xAI/OpenRouter/Mistral: cuando se habiliten llegan como config
 * openai-compat + probe + test manual con llave real — no código nuevo.
 * GLM: ni el baseUrl público está confirmado; fuera hasta investigarlo.
 *
 * ── ALLOWLIST DEL PROXY (Q11 / Apéndice del BLUEPRINT) ─────────────
 * `BYOK_PROXY_ALLOWED_ORIGINS` es LA fuente de verdad que
 * `background.ts` aplica por mensaje. Vive EN CÓDIGO a propósito: el
 * manifiesto remoto (adapters.json) sólo puede APAGAR proveedores,
 * jamás agregar dominios — un Netlify comprometido no debe poder abrir
 * el proxy. `host_permissions` en wxt.config.ts DEBE espejar esta lista
 * 1:1 (agregar un proxied exige release de extensión de todos modos).
 */

import { anthropicProvider } from "./anthropic";
import { googleProvider } from "./google";
import { openAiCompatProvider } from "./openai-compat";
import type { ByokProviderConfig } from "./types";

export const openaiProvider: ByokProviderConfig = openAiCompatProvider({
  id: "openai",
  label: "ChatGPT (OpenAI)",
  baseUrl: "https://api.openai.com",
  chatPath: "/v1/chat/completions",
  // DATO FRÁGIL (ledger §0.3): confianza alta.
  defaultModel: "gpt-4o-mini",
  route: "proxy",
  includeUsageOption: true,
  notes: "usage sólo llega en streaming si se pide stream_options.include_usage.",
});

export const deepseekProvider: ByokProviderConfig = openAiCompatProvider({
  id: "deepseek",
  label: "DeepSeek",
  baseUrl: "https://api.deepseek.com",
  chatPath: "/chat/completions",
  // DATO FRÁGIL (ledger §0.3): confianza alta.
  defaultModel: "deepseek-chat",
  route: "proxy",
  includeUsageOption: false,
  notes: "usage llega solo en el chunk final; reasoning_content (reasoner) se ignora en v1.",
});

export const perplexityProvider: ByokProviderConfig = openAiCompatProvider({
  id: "perplexity",
  label: "Perplexity",
  baseUrl: "https://api.perplexity.ai",
  chatPath: "/chat/completions",
  // DATO FRÁGIL (ledger §0.3): confianza moderada-alta.
  defaultModel: "sonar",
  route: "proxy",
  includeUsageOption: false,
  notes: "Dialecto openai-compat con búsqueda web inherente; usage en chunks finales.",
});

export const BYOK_PROVIDERS: Record<string, ByokProviderConfig> = {
  anthropic: anthropicProvider(),
  google: googleProvider(),
  openai: openaiProvider,
  deepseek: deepseekProvider,
  perplexity: perplexityProvider,
};

export const BYOK_PROVIDER_IDS: readonly string[] = Object.freeze(Object.keys(BYOK_PROVIDERS));

/** Orígenes admitidos por el proxy de la extensión. Derivado, no duplicado. */
export const BYOK_PROXY_ALLOWED_ORIGINS: readonly string[] = Object.freeze(
  Object.values(BYOK_PROVIDERS)
    .filter((p) => p.route === "proxy")
    .map((p) => new URL(p.baseUrl).origin),
);
