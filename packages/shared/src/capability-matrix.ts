/**
 * Matriz de Capacidades — ChatCouncil
 * ------------------------------------------------------------------
 * Fuente única de verdad para:
 *  - Qué toggles del input soporta cada proveedor de forma nativa (Q31),
 *    usada para pintar en gris el botón correspondiente y explicar
 *    "qué modelos inhabilitan esta función" al hacer click.
 *  - Qué proveedores son viables en BYOK móvil sin backend propio (Q21),
 *    porque su API permite fetch directo desde el navegador.
 *
 * ¡IMPORTANTE SOBRE CORS! Verificado por investigación activa el
 * 2026-07-02, no por memoria — el comportamiento CORS de APIs de
 * terceros no está documentado de forma consistente y algunos
 * proveedores lo activan/desactivan sin aviso (así fue introducido el
 * header de Anthropic). Por eso:
 *   1) Cada entrada trae `confidence` explícito.
 *   2) Este archivo es un DEFAULT, no la verdad final: en runtime,
 *      `probeCors()` (Fase 2) debe hacer una llamada de prueba real y
 *      cachear el resultado, porque un proveedor puede cambiar su
 *      política sin que nosotros lo sepamos.
 *   3) `apps/web/public/adapters.json` puede sobrescribir estos valores
 *      sin necesidad de un nuevo release (ver Q9, manifiesto remoto).
 */

export type SupportLevel = "native" | "unsupported" | "unknown";
export type Confidence = "high" | "moderate" | "low" | "unknown";
export type CorsStatus = "supported" | "supported-with-header" | "blocked" | "unverified";

export interface BrowserCorsInfo {
  status: CorsStatus;
  detail: string;
  /** Header adicional requerido para desbloquear CORS, si aplica. */
  requiredHeader?: { name: string; value: string };
  confidence: Confidence;
  verifiedAt: string; // fecha ISO de la última verificación manual
}

export interface ProviderCapability {
  id: string;
  label: string;
  webSearch: SupportLevel;
  imageGeneration: SupportLevel; // diferido a v1.5 (Q31), igual se modela
  fileUpload: SupportLevel;
  browserCors: BrowserCorsInfo;
}

/**
 * Clasificación inicial de BYOK (Q12) + BYOA (Q6) construida a partir de
 * investigación cruzada de múltiples fuentes (foros oficiales de cada
 * proveedor, SDKs oficiales, reportes de terceros fechados 2025-2026).
 * Ver docs/BLUEPRINT.md, sección "Matriz CORS", para las fuentes y el
 * razonamiento detrás de cada nivel de confianza.
 */
export const PROVIDER_CAPABILITIES: Record<string, ProviderCapability> = {
  anthropic: {
    id: "anthropic",
    label: "Claude (Anthropic)",
    webSearch: "native",
    imageGeneration: "unsupported",
    fileUpload: "native",
    browserCors: {
      status: "supported-with-header",
      detail:
        "Funciona con fetch directo agregando el header oficial de opt-in para uso en navegador.",
      requiredHeader: { name: "anthropic-dangerous-direct-browser-access", value: "true" },
      confidence: "high",
      verifiedAt: "2026-07-02",
    },
  },
  openai: {
    id: "openai",
    label: "ChatGPT (OpenAI)",
    webSearch: "unknown",
    imageGeneration: "unsupported",
    fileUpload: "native",
    browserCors: {
      status: "blocked",
      detail:
        "Multiples reportes (2023-2026) de fetch directo bloqueado por falta de Access-Control-Allow-Origin. Sin header de opt-in oficial conocido. Requiere el proxy de la extension incluso para llamadas API (BYOK), y bloquea BYOK en movil.",
      confidence: "moderate",
      verifiedAt: "2026-07-02",
    },
  },
  google: {
    id: "google",
    label: "Gemini (Google AI)",
    webSearch: "native",
    imageGeneration: "unsupported",
    fileUpload: "native",
    browserCors: {
      status: "supported",
      detail:
        "Reportes 2026 de llamadas cliente-servidor directas (REST y streaming) contra generativelanguage.googleapis.com con x-goog-api-key. Persisten bugs puntuales de exposicion de headers, no de bloqueo base.",
      confidence: "moderate",
      verifiedAt: "2026-07-02",
    },
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    webSearch: "unsupported",
    imageGeneration: "unsupported",
    fileUpload: "unsupported",
    browserCors: {
      status: "blocked",
      detail:
        "Sin documentacion oficial de soporte CORS. Consistente con la experiencia reportada por el usuario. Tratar como bloqueado hasta probar lo contrario.",
      confidence: "moderate",
      verifiedAt: "2026-07-02",
    },
  },
  perplexity: {
    id: "perplexity",
    label: "Perplexity",
    webSearch: "native",
    imageGeneration: "unsupported",
    fileUpload: "unsupported",
    browserCors: {
      status: "blocked",
      detail:
        "Todas las guias oficiales y de terceros (2025-2026) enrutan a traves de un backend/proxy explicitamente para proteger la key. Sin via directa documentada.",
      confidence: "moderate",
      verifiedAt: "2026-07-02",
    },
  },
  mistral: {
    id: "mistral",
    label: "Mistral",
    webSearch: "unknown",
    imageGeneration: "unsupported",
    fileUpload: "unknown",
    browserCors: {
      status: "unverified",
      detail: "No investigado aun. No asumir soporte; probar con probeCors() antes de habilitar en movil.",
      confidence: "unknown",
      verifiedAt: "2026-07-02",
    },
  },
  groq: {
    id: "groq",
    label: "Groq",
    webSearch: "unsupported",
    imageGeneration: "unsupported",
    fileUpload: "unsupported",
    browserCors: {
      status: "unverified",
      detail:
        "El SDK oficial expone un flag 'dangerouslyAllowBrowser', lo que sugiere diseno pensado para navegador, pero no hay confirmacion de una llamada fetch real exitosa. Confirmar con probeCors().",
      confidence: "low",
      verifiedAt: "2026-07-02",
    },
  },
  xai: {
    id: "xai",
    label: "Grok (xAI)",
    webSearch: "unknown",
    imageGeneration: "unsupported",
    fileUpload: "unknown",
    browserCors: {
      status: "unverified",
      detail: "Una unica fuente de terceros lo reporta como CORS-friendly; no confirmado de forma independiente.",
      confidence: "low",
      verifiedAt: "2026-07-02",
    },
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter (multi-modelo)",
    webSearch: "unknown",
    imageGeneration: "unsupported",
    fileUpload: "unknown",
    browserCors: {
      status: "unverified",
      detail:
        "Evidencia contradictoria: un reporte de terceros dice que funciona directo desde navegador, un issue de GitHub reporta error CORS real con el mismo patron. Probar con probeCors() antes de confiar; cada modelo de su catalogo cuenta como candidato individual de panel (Q12).",
      confidence: "low",
      verifiedAt: "2026-07-02",
    },
  },
  glm: {
    id: "glm",
    label: "GLM (Z.ai)",
    webSearch: "unknown",
    imageGeneration: "unsupported",
    fileUpload: "unknown",
    browserCors: {
      status: "unverified",
      detail: "No investigado aun.",
      confidence: "unknown",
      verifiedAt: "2026-07-02",
    },
  },
};

/**
 * Fase 2 (BYOK): implementar esta funcion para reemplazar la
 * confianza declarada por una verificacion empirica real, cacheada
 * por sesion de navegador. Firma dejada aqui para que el contrato sea
 * visible desde ahora.
 */
export declare function probeCors(providerId: string): Promise<CorsStatus>;

/** Proveedores viables para BYOK en movil segun el estado actual de la matriz. */
export function mobileCompatibleProviders(): ProviderCapability[] {
  return Object.values(PROVIDER_CAPABILITIES).filter(
    (p) => p.browserCors.status === "supported" || p.browserCors.status === "supported-with-header",
  );
}
