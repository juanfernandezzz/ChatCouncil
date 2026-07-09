/**
 * Matriz de Capacidades — ChatCouncil
 * ------------------------------------------------------------------
 * Fuente única de verdad para:
 *  - Qué toggles del input soporta cada proveedor de forma nativa (Q31),
 *    usada para pintar en gris el botón correspondiente y explicar
 *    "qué modelos inhabilitan esta función" al hacer click.
 *  - Qué proveedores BYOK pueden hablarse DIRECTO desde la SPA (fetch
 *    con CORS) y cuáles requieren el proxy de la extensión (Q11/Q12).
 *    Nota de la enmienda de Fase 2: la motivación original de esta
 *    clasificación era "viabilidad en móvil" (Q21); con el alcance móvil
 *    retirado (Fase 8 reescrita al cierre de Fase 1), su valor vigente
 *    es otro — los CORS-directos son el transporte más simple (fetch+SSE
 *    sin puente), ideales para validar el contrato Adapter primero, y
 *    no cargan host_permissions.
 *
 * ¡IMPORTANTE SOBRE CORS! Verificado por investigación activa el
 * 2026-07-02, no por memoria — el comportamiento CORS de APIs de
 * terceros no está documentado de forma consistente y algunos
 * proveedores lo activan/desactivan sin aviso (así fue introducido el
 * header de Anthropic). Por eso:
 *   1) Cada entrada trae `confidence` explícito.
 *   2) Este archivo es un DEFAULT, no la verdad final: en runtime,
 *      `probeCors()` (implementada en Fase 2) hace una llamada de prueba
 *      real y cachea el resultado, porque un proveedor puede cambiar su
 *      política sin que nosotros lo sepamos.
 *   3) `apps/web/public/adapters.json` puede sobrescribir estos valores
 *      sin necesidad de un nuevo release (ver Q9, manifiesto remoto) —
 *      con UNA excepción de seguridad: el allowlist del proxy BYOK vive
 *      en código (`packages/adapters`); el manifiesto sólo puede apagar
 *      proveedores, nunca agregar dominios al proxy (Apéndice).
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

/**
 * Cómo sondear empíricamente el CORS de un proveedor desde el navegador
 * del usuario (Fase 2, E7). Diseño: request mínimo NO autenticado — la
 * ausencia/invalidez de credenciales produce un 4xx LEGIBLE si CORS
 * pasa, y `fetch` rechaza con TypeError si CORS bloquea. Nunca se
 * fabrica una llave con forma real: el valor centinela es "probe-invalid".
 *
 * LECCIÓN DE LA ACEPTACIÓN (2026-07-08) — el probe debe ser FIEL A LA
 * FORMA de la request real: mismo método y mismos headers custom (con
 * credencial inválida). Un GET pelado sin headers custom es una "simple
 * request" que NO dispara preflight, y por lo tanto no mide lo que el
 * routing necesita saber: si el preflight del POST autenticado
 * (authorization/x-api-key + content-type) pasa. En la aceptación,
 * openai/deepseek/perplexity midieron "supported" con el GET pelado
 * mientras su realidad de POST autenticado quedaba sin medir — con el
 * riesgo de que `effectiveCorsStatus` ruteara "direct" hacia un fetch
 * que muere en preflight. Con probes fieles, una respuesta legible SÍ
 * prueba que la request real pasa CORS.
 */
export interface CorsProbeSpec {
  url: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  /** Qué estado prueba una respuesta legible (p. ej. anthropic prueba
   * `supported-with-header` porque el probe INCLUYE su header de opt-in). */
  successStatus: Extract<CorsStatus, "supported" | "supported-with-header">;
}

export interface ProviderCapability {
  id: string;
  label: string;
  webSearch: SupportLevel;
  imageGeneration: SupportLevel; // diferido a v1.5 (Q31), igual se modela
  fileUpload: SupportLevel;
  browserCors: BrowserCorsInfo;
  /** Ausente = todavía no diseñamos un probe para este proveedor. */
  corsProbe?: CorsProbeSpec;
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
    corsProbe: {
      // Fiel a la forma real: POST con TODOS los headers custom de la
      // request de streaming (x-api-key inválida incluida) — el preflight
      // probado es exactamente el que enfrentará buildRequest. 401
      // legible → CORS ok con el header de opt-in incluido.
      url: "https://api.anthropic.com/v1/messages",
      method: "POST",
      headers: {
        "x-api-key": "probe-invalid",
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: "{}",
      successStatus: "supported-with-header",
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
        "Multiples reportes (2023-2026) de fetch directo bloqueado por falta de Access-Control-Allow-Origin. Sin header de opt-in oficial conocido. Requiere el proxy de la extension para BYOK.",
      confidence: "moderate",
      verifiedAt: "2026-07-02",
    },
    corsProbe: {
      // Fiel a la forma real: POST al chat endpoint con authorization +
      // content-type (credencial inválida). Legible (401) sólo si el
      // preflight del POST autenticado pasa — que es lo que el routing
      // necesita. (El GET pelado anterior medía "supported" sin probar
      // el preflight: hallazgo de la aceptación.)
      url: "https://api.openai.com/v1/chat/completions",
      method: "POST",
      headers: {
        authorization: "Bearer probe-invalid",
        "content-type": "application/json",
      },
      body: "{}",
      successStatus: "supported",
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
    corsProbe: {
      // GET al endpoint real CON x-goog-api-key inválida: el header
      // custom dispara preflight, así que se prueba la dimensión de auth
      // de la request real. Trade-off documentado: content-type (del POST
      // de streaming) no se prueba acá — POSTear a una URL cuyo OPTIONS
      // no conocemos arriesga un falso negativo cacheado que rompería el
      // routing de google; y el POST real completo quedó verificado de
      // punta a punta en la aceptación (stream directo con key válida).
      url: "https://generativelanguage.googleapis.com/v1beta/models",
      method: "GET",
      headers: { "x-goog-api-key": "probe-invalid" },
      successStatus: "supported",
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
    corsProbe: {
      // Fiel a la forma real (ver openai).
      url: "https://api.deepseek.com/chat/completions",
      method: "POST",
      headers: {
        authorization: "Bearer probe-invalid",
        "content-type": "application/json",
      },
      body: "{}",
      successStatus: "supported",
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
    corsProbe: {
      // Fiel a la forma real (ver openai): POST al chat endpoint.
      url: "https://api.perplexity.ai/chat/completions",
      method: "POST",
      headers: {
        authorization: "Bearer probe-invalid",
        "content-type": "application/json",
      },
      body: "{}",
      successStatus: "supported",
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
      detail:
        "No investigado aun. No asumir soporte; probar con probeCors() antes de habilitarlo como directo.",
      confidence: "unknown",
      verifiedAt: "2026-07-02",
    },
    corsProbe: {
      // Fiel a la forma real (ver openai).
      url: "https://api.mistral.ai/v1/chat/completions",
      method: "POST",
      headers: {
        authorization: "Bearer probe-invalid",
        "content-type": "application/json",
      },
      body: "{}",
      successStatus: "supported",
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
    corsProbe: {
      // Fiel a la forma real (ver openai).
      url: "https://api.groq.com/openai/v1/chat/completions",
      method: "POST",
      headers: {
        authorization: "Bearer probe-invalid",
        "content-type": "application/json",
      },
      body: "{}",
      successStatus: "supported",
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
      detail:
        "Una unica fuente de terceros lo reporta como CORS-friendly; no confirmado de forma independiente.",
      confidence: "low",
      verifiedAt: "2026-07-02",
    },
    corsProbe: {
      // Fiel a la forma real (ver openai).
      url: "https://api.x.ai/v1/chat/completions",
      method: "POST",
      headers: {
        authorization: "Bearer probe-invalid",
        "content-type": "application/json",
      },
      body: "{}",
      successStatus: "supported",
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
    corsProbe: {
      // Fiel a la forma real (ver openai).
      url: "https://openrouter.ai/api/v1/chat/completions",
      method: "POST",
      headers: {
        authorization: "Bearer probe-invalid",
        "content-type": "application/json",
      },
      body: "{}",
      successStatus: "supported",
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
    // Sin corsProbe: ni siquiera el baseUrl público está confirmado con
    // confianza suficiente para diseñar un probe honesto (ver ledger).
  },
};

// ---------------------------------------------------------------------------
// probeCors — verificación empírica en runtime (Fase 2, E7)
// ---------------------------------------------------------------------------

/** Prefijo del cache por sesión. Exportado para el harness y los gates. */
export const CORS_PROBE_CACHE_PREFIX = "chatcouncil:probeCors:";

export interface CorsProbeResult {
  status: CorsStatus;
  verifiedAt: string; // ISO
  detail: string;
}

function probeCacheKey(providerId: string): string {
  return `${CORS_PROBE_CACHE_PREFIX}${providerId}`;
}

function sessionStore(): Storage | null {
  // shared también se importa desde el service worker de la extensión,
  // donde no existe sessionStorage — guard estructural, no supuesto.
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null; // acceso puede tirar en contextos con storage deshabilitado
  }
}

/** Lector sincrónico del resultado sondeado (o null si no se sondeó). */
export function readCorsProbe(providerId: string): CorsProbeResult | null {
  const store = sessionStore();
  if (!store) return null;
  try {
    const raw = store.getItem(probeCacheKey(providerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CorsProbeResult>;
    if (typeof parsed.status !== "string") return null;
    return parsed as CorsProbeResult;
  } catch {
    return null;
  }
}

/** Borra el resultado cacheado (botón "re-probar" del harness). */
export function clearCorsProbe(providerId: string): void {
  sessionStore()?.removeItem(probeCacheKey(providerId));
}

function writeCorsProbe(providerId: string, result: CorsProbeResult): void {
  try {
    sessionStore()?.setItem(probeCacheKey(providerId), JSON.stringify(result));
  } catch {
    // sesión sin storage: el probe sigue siendo útil como valor de retorno
  }
}

/**
 * Sondea empíricamente el CORS de un proveedor DESDE EL ORIGEN DONDE
 * CORRE (en la práctica: la SPA — E2a puso la custodia y las llamadas
 * directas ahí, así que ese es el origen que importa medir).
 *
 * Clasificación:
 *   · respuesta LEGIBLE (cualquier status, 401/403/405 incluidos) →
 *     CORS pasa → `spec.successStatus` (cacheado por sesión).
 *   · `fetch` rechaza → puede ser CORS bloqueado O red caída. Se
 *     desambigua con un fetch centinela `mode: "no-cors"` al mismo URL:
 *     si el centinela resuelve (respuesta opaca), la red está viva →
 *     "blocked" (cacheado); si también falla → "unverified" (problema de
 *     red, NO se cachea — sería congelar un falso negativo).
 *
 * El resultado medido SOBREESCRIBE la confianza declarada de la matriz:
 * consumir siempre vía `effectiveCorsStatus()`.
 */
export async function probeCors(providerId: string): Promise<CorsStatus> {
  const cap = PROVIDER_CAPABILITIES[providerId];
  if (!cap) return "unverified";
  const cached = readCorsProbe(providerId);
  if (cached) return cached.status;
  const spec = cap.corsProbe;
  if (!spec) return cap.browserCors.status;

  try {
    const res = await fetch(spec.url, {
      method: spec.method,
      headers: spec.headers,
      body: spec.body,
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
    });
    const result: CorsProbeResult = {
      status: spec.successStatus,
      verifiedAt: new Date().toISOString(),
      detail: `probe ${spec.method} ${spec.url} → HTTP ${res.status} legible (CORS pasa)`,
    };
    writeCorsProbe(providerId, result);
    return result.status;
  } catch {
    try {
      await fetch(spec.url, { method: "GET", mode: "no-cors", cache: "no-store" });
      const result: CorsProbeResult = {
        status: "blocked",
        verifiedAt: new Date().toISOString(),
        detail: `probe ${spec.method} ${spec.url} → fetch rechazado con red viva (centinela no-cors OK) = CORS bloqueado`,
      };
      writeCorsProbe(providerId, result);
      return result.status;
    } catch {
      // Red caída / DNS / offline: no se cachea.
      return "unverified";
    }
  }
}

/** Estado CORS efectivo: el hecho medido (probe) pisa lo declarado. */
export function effectiveCorsStatus(providerId: string): CorsStatus {
  const probed = readCorsProbe(providerId);
  if (probed) return probed.status;
  return PROVIDER_CAPABILITIES[providerId]?.browserCors.status ?? "unverified";
}

export function isCorsDirectStatus(status: CorsStatus): boolean {
  return status === "supported" || status === "supported-with-header";
}

/**
 * Proveedores que pueden hablarse DIRECTO desde la SPA (sin el proxy de
 * la extensión) según el estado efectivo (probe > declarado). Hasta la
 * enmienda de Fase 2 se llamaba `mobileCompatibleProviders()` — mismo
 * predicado, semántica renombrada a la vigente (el alcance móvil se
 * retiró al cierre de Fase 1; ver BLUEPRINT Fase 8).
 */
export function corsDirectProviders(): ProviderCapability[] {
  return Object.values(PROVIDER_CAPABILITIES).filter((p) =>
    isCorsDirectStatus(effectiveCorsStatus(p.id)),
  );
}
