/**
 * Contrato de Adaptador — ChatCouncil
 * ------------------------------------------------------------------
 * Decisión Q1: la extensión NO contiene lógica de proveedor hardcodeada.
 * Es un "runner" agnóstico que ejecuta la estrategia que dicta el
 * manifiesto remoto (ver `capability-matrix.ts` y `public/adapters.json`
 * en apps/web). Este archivo define el CONTRATO (las formas), no las
 * implementaciones concretas por proveedor — esas se construyen en la
 * Fase 2 (BYOK) y Fase 3 (BYOA) del blueprint (docs/BLUEPRINT.md).
 *
 * Importante (honestidad epistémica): no incluimos selectores DOM ni
 * endpoints internos reales de ChatGPT/Claude/Gemini/etc. en este
 * scaffold. Esos valores requieren ingeniería inversa activa contra
 * las webapps de cada proveedor, cambian sin aviso, y no son algo que
 * deba inventarse. Cada adaptador nace con `strategy:
 * "pending-reverse-engineering"` hasta que se investigue y confirme.
 */

/** Cómo el runner de la extensión debe hablar con la sesión del usuario. */
export type AdapterStrategy =
  | "dom" // content script que escribe/observa la UI del proveedor
  | "endpoint" // fetch autenticado por cookies contra un endpoint interno
  | "hybrid" // combina ambas según la operación (ej. envío vs. adjuntos)
  | "pending-reverse-engineering"; // aún no investigado — no inventar valores

export type StreamFormat = "sse" | "websocket" | "ndjson" | "unknown";

export interface DomStrategyConfig {
  /** Selectores CSS/ARIA por rol funcional. Se llenan en Fase 3. */
  selectors: Record<string, string>;
  /** Debounce/observer config para detectar fin de streaming. */
  streamEndHeuristic: "mutation-idle" | "stop-button-hidden" | "unknown";
}

export interface EndpointStrategyConfig {
  baseUrl: string;
  streamFormat: StreamFormat;
  /** Si el endpoint requiere headers derivados de la sesión (ej. CSRF). */
  requiresSessionDerivedHeaders: boolean;
}

export interface AdapterDescriptor {
  providerId: string;
  strategy: AdapterStrategy;
  dom?: DomStrategyConfig;
  endpoint?: EndpointStrategyConfig;
  /** Nota libre para dejar constancia de por qué está pendiente, o de
   * hallazgos parciales durante la investigación. */
  notes?: string;
}

export interface SendOptions {
  requestId: string;
  prompt: string;
  attachments?: { name: string; mimeType: string; dataBase64: string }[];
  toggles?: { webSearch?: boolean; imageGeneration?: boolean };
  signal?: AbortSignal;
}

export type AdapterChunk =
  | { kind: "text-delta"; text: string }
  | { kind: "done"; tokensIn?: number; tokensOut?: number }
  | { kind: "error"; message: string };

/**
 * Un Adapter concreto (implementado en `packages/adapters` a partir de
 * la Fase 2) sabe ejecutar `send` contra UN proveedor, sin que quien lo
 * consume (la extensión, o el cliente BYOK en la SPA) necesite conocer
 * si por debajo hay DOM automation o un fetch a un endpoint.
 */
export interface Adapter {
  readonly descriptor: AdapterDescriptor;
  send(opts: SendOptions): AsyncIterable<AdapterChunk>;
  abort(requestId: string): void;
}
