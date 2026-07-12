/**
 * Lista curada de términos que identifican proveedor/modelo/empresa —
 * ChatCouncil Fase 5 (E2). Dos consumidores legítimos y SOLO dos
 * (aplicado por scripts/guard-judge-anonymity.mjs):
 *
 *   · anonymize.ts — scrub de la copia que va al juez (E2-iii)
 *   · run-analysis.ts — aserción runtime post-scrub (defensa en
 *     profundidad: si un término sobrevive, NO se envía)
 *
 * build-judge-prompt.ts tiene PROHIBIDO importar este módulo: la lista
 * de nombres no puede acercarse al camino que construye el prompt.
 *
 * Trade-off asumido y aprobado (E2-iii): el scrub es por término, no
 * semántico — una respuesta que menciona "Google" como buscador o el
 * verbo castellano "sonar" queda con huecos. El log de redacciones por
 * etiqueta (persistido en RoundAnalysis.redactions) lo hace auditable;
 * el original queda intacto en Dexie y en la UI.
 */

export const PROVIDER_NAME_BLOCKLIST: readonly string[] = [
  // Anthropic
  "Anthropic",
  "Claude",
  "Sonnet",
  "Opus",
  "Haiku",
  // OpenAI
  "OpenAI",
  "ChatGPT",
  "GPT-5",
  "GPT-4",
  "GPT",
  // Google
  "Google",
  "Gemini",
  "DeepMind",
  "Bard",
  // Otros del registro (Fase 2/3) + pista paralela
  "DeepSeek",
  "Perplexity",
  "Sonar",
  "Mistral",
  "Groq",
  "Grok",
  "xAI",
  "OpenRouter",
  "GLM",
  "Zhipu",
];

/** Token uniforme: no insinúa longitud ni inicial del término tapado. */
export const REDACTION_TOKEN = "▮▮▮";

/**
 * Regex único, términos largos primero (que "GPT-4" gane antes que
 * "GPT"), límites de palabra unicode-aware (no matchea dentro de otra
 * palabra, sí matchea pegado a puntuación).
 */
export function buildBlocklistRegex(): RegExp {
  const escaped = [...PROVIDER_NAME_BLOCKLIST]
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${escaped.join("|")})(?![\\p{L}\\p{N}])`, "giu");
}

/** Ocurrencias de términos de la lista en un texto (para la aserción y para contar redacciones). */
export function scanForProviderNames(text: string): string[] {
  const re = buildBlocklistRegex();
  const found: string[] = [];
  for (const m of text.matchAll(re)) found.push(m[0]);
  return found;
}
