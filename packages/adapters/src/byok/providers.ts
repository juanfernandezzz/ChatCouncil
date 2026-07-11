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
 *
 * NOTA POST-ACEPTACIÓN (2026-07-09): los tres "proxy" midieron CORS
 * abierto con el probe FIEL (ver capability-matrix) — el routing real
 * (`effectiveCorsStatus`) los lleva DIRECTO. `route: "proxy"` acá NO
 * fuerza transporte: significa membresía del allowlist +
 * host_permissions (derecho a usar el proxy como red de seguridad si
 * la política CORS del proveedor revierte). No cambiar a "direct":
 * vaciaría el allowlist y los host_permissions.
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
  // Registro curado (Fase 4, E4) — verificado por búsqueda web 2026-07-10,
  // no por llamada real salvo el default. GPT-5.5/5.6 requieren plan de
  // pago que Juan todavía no tiene: quedan marcados para cuando lo active.
  models: [
    { id: "gpt-4o-mini", label: "GPT-4o mini", verified: true, note: "default actual (Fase 2), confianza alta." },
    {
      id: "gpt-5.5",
      label: "GPT-5.5",
      verified: false,
      note:
        "flagship OpenAI segun busqueda 2026-07-10 (abr-2026). Necesita plan pago para probar — pendiente cuando Juan tenga acceso. Los modelos de razonamiento de OpenAI historicamente cambian la FORMA del pedido (otros nombres de parametro, sin temperature); no asumir que el shape actual de openai-compat alcanza sin probar.",
    },
  ],
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
  models: [
    { id: "deepseek-chat", label: "DeepSeek Chat", verified: true, note: "default actual (Fase 2), confianza alta." },
    {
      id: "deepseek-v4",
      label: "DeepSeek V4 (nombre de lanzamiento)",
      verified: false,
      note:
        "generacion mas nueva segun busqueda 2026-07-10, pero ese es el nombre de MARKETING del lanzamiento, no confirme el id exacto que expone /chat/completions (suele diferir, ej. 'deepseek-chat' como alias movil). No usar sin confirmar contra la documentacion vigente de DeepSeek.",
    },
  ],
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
  // Sin hallazgos nuevos verificables en la búsqueda de Fase 4 (E4): no
  // agrego variantes que no pude confirmar. Ampliar cuando Juan las use.
  models: [{ id: "sonar", label: "Sonar", verified: true, note: "default actual (Fase 2), confianza moderada-alta." }],
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
