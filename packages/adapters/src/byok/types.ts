/**
 * Tipos del subsistema BYOK (Fase 2) — @chatcouncil/adapters
 * ------------------------------------------------------------------
 * Separación de responsabilidades (decisiones E2a/E3/E5 del BLUEPRINT):
 *   · `buildRequest` produce la request HTTP CRUDA (url/headers/body) —
 *     la SPA la ejecuta directo (fetch) o la manda tal cual por
 *     `byok:proxy`; la extensión NO conoce dialectos de proveedor, es
 *     un caño con allowlist.
 *   · `createParser` convierte el TEXTO del cuerpo (SSE) en
 *     `AdapterChunk`s del contrato compartido. Corre SIEMPRE del lado
 *     SPA, venga el texto de un fetch directo o del relay del puente.
 *   · `ByokTransport` abstrae "de dónde sale el texto": fetch directo
 *     (acá, sin dependencias de la SPA) o el puente (implementado en
 *     apps/web, porque depende de bridge-client).
 */

import type { AdapterChunk, ConversationTurn, CuratedModel } from "@chatcouncil/shared";

/** Request HTTP cruda, espejo del payload de `byok:proxy` del puente. */
export interface ByokHttpRequest {
  url: string;
  method: "GET" | "POST";
  /** Incluye los headers de auth. NUNCA loggear este objeto. */
  headers: Record<string, string>;
  body?: string;
  stream: boolean;
}

export interface ByokBuildParams {
  prompt: string;
  /**
   * Turnos previos de ESTE panel, en orden (Fase 4, E2). Vacío o ausente
   * en el primer turno de la conversación. Cada builder decide cómo
   * mapearlo a la forma del dialecto (mensajes con role/content para
   * Anthropic/openai-compat; `contents` con role "user"/"model" para
   * Google — el mapeo vive en cada dialecto, no acá).
   */
  history?: ConversationTurn[];
  /** Sale del key-vault de la SPA justo antes de armar la request. */
  apiKey: string;
  /** Override del modelo; ausente → `defaultModel` del proveedor. */
  model?: string;
  maxTokens?: number;
}

/**
 * Parser incremental: recibe texto decodificado en piezas arbitrarias
 * (los cortes NO respetan límites de evento SSE) y emite chunks del
 * contrato. Debe emitir EXACTAMENTE un terminal (`done` o `error`) por
 * stream, contando `end()`.
 */
export interface ByokStreamParser {
  push(text: string): AdapterChunk[];
  end(): AdapterChunk[];
}

export type ByokRoute = "direct" | "proxy";

export interface ByokProviderConfig {
  id: string;
  label: string;
  /** Origin + raíz de la API. El allowlist del proxy deriva de acá. */
  baseUrl: string;
  /**
   * DATO FRÁGIL: los IDs de modelo envejecen sin aviso. El harness de
   * Fase 2 permite override por request; corregir acá cuando un
   * proveedor retire el default (ver ledger §0.3, confianzas).
   */
  defaultModel: string;
  /** Ruta DECLARADA. El routing real usa `effectiveCorsStatus` (probe > declarado). */
  route: ByokRoute;
  buildRequest(params: ByokBuildParams): ByokHttpRequest;
  createParser(): ByokStreamParser;
  /** Registro curado para el selector (Fase 4, E4). Ausente/vacío → sólo el defaultModel. */
  models?: CuratedModel[];
  notes?: string;
}

/** De dónde sale el texto del cuerpo: fetch directo o puente (proxy). */
export interface ByokTransport {
  /**
   * Ejecuta la request y entrega el cuerpo como TEXTO ya decodificado,
   * en piezas, vía `onText`. Resuelve al terminar el cuerpo; rechaza
   * ante HTTP !ok (mensaje con status + snippet corto del cuerpo de
   * error — jamás headers) o fallo de red. Un abort del `signal` debe
   * rechazar con un error de `name === "AbortError"`.
   */
  run(req: ByokHttpRequest, onText: (text: string) => void, signal: AbortSignal): Promise<void>;
}
