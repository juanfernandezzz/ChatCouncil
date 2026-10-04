/**
 * nombre-proveedor.ts — el nombre de cada proveedor tal como lo ve Juan
 * (informe, nombres de archivo, interfaz). El id (`qwen`) sigue siendo la
 * clave en el registro y en el código; esto es sólo presentación.
 * Mayúscula inicial, o la grafía de la marca cuando la tiene (ChatGPT, GLM,
 * DeepSeek). Un id desconocido sale con la primera letra en mayúscula.
 */

const NOMBRES: Record<string, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  claude: "Claude",
  grok: "Grok",
  mistral: "Mistral",
  glm: "GLM",
  kimi: "Kimi",
  qwen: "Qwen",
  deepseek: "DeepSeek",
};

export function nombreProveedor(id: string): string {
  return NOMBRES[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}
