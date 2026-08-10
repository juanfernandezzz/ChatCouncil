/**
 * Lista curada de términos que identifican proveedor/modelo/empresa.
 * El allowlist de importadores lo aplica `scripts/guard-sellado.mjs`:
 *
 *   · anonymize.ts — scrub de la copia que va a los ANALISTAS
 *   · index.ts — re-exporta
 *
 * Cuando exista el despacho hacia la parte 2, su aserción runtime
 * post-scrub —si un término sobrevive, NO se envía— entra al allowlist
 * en el mismo commit que la escribe, no antes.
 *
 * build-analyst-prompt.ts tiene PROHIBIDO importar este módulo: la lista
 * de nombres no puede acercarse al camino que construye el prompt.
 *
 * Trade-off asumido: el scrub es por término, no semántico — una
 * respuesta que menciona "Google" como buscador o el verbo castellano
 * "sonar" queda con huecos. El conteo de redacciones por etiqueta lo
 * hace auditable, y el original queda intacto en el registro
 * append-only, que es el dato canónico.
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
