/**
 * Tipos del subsistema BYOA (Fase 3, camino B+) — @chatcouncil/adapters
 * ------------------------------------------------------------------
 * BYOA opera sobre la SESIÓN del usuario (cookie httpOnly del proveedor,
 * que el navegador adjunta en runtime — el código nunca la lee). A
 * diferencia de BYOK (una request sin estado), el endpoint interno de
 * claude.ai tiene ESTADO: hay que crear la conversación antes de poder
 * pedir la completion. Por eso el dialecto expone DOS builders:
 *   · `buildCreateConversation` → paso 1 (POST chat_conversations, no
 *     streaming). El uuid lo genera el cliente; la respuesta sólo confirma.
 *   · `buildCompletion`         → paso 2 (POST .../completion, streaming).
 * La MÁQUINA con estado que los encadena vive en `createByoaAdapter`
 * (adapter.ts) — no en apps/web: el detalle multi-paso es del proveedor y
 * no debe filtrarse fuera de este paquete (topología del BLUEPRINT, Q1).
 *
 * `ByoaTransport` abstrae "de dónde sale el texto": siempre el puente de
 * la extensión (byoa:proxy → offscreen con credentials:"include"), porque
 * la SPA no puede mandarle la cookie de sesión a claude.ai por su cuenta.
 */

import type { AdapterChunk } from "@chatcouncil/shared";

/** Request HTTP cruda, espejo del payload de `byoa:proxy` del puente. */
export interface ByoaHttpRequest {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
  /** stream:false para crear la conversación; true para la completion. */
  stream: boolean;
}

export interface ByoaCreateParams {
  orgId: string;
  /** uuid generado por el cliente para la conversación nueva. */
  conversationUuid: string;
}

export interface ByoaCompletionParams {
  orgId: string;
  conversationUuid: string;
  /** parent del turno; en el 1er turno = `rootParentMessageUuid`. */
  parentMessageUuid: string;
  prompt: string;
  /** Override del modelo; ausente → default de la cuenta/conversación. */
  model?: string;
}

/**
 * Parser incremental (mismo contrato que el de BYOK): recibe texto
 * decodificado en piezas arbitrarias y emite chunks del contrato,
 * EXACTAMENTE un terminal (`done`|`error`) por stream contando `end()`.
 * El dialecto claude reusa `createAnthropicParser` de BYOK.
 */
export interface ByoaStreamParser {
  push(text: string): AdapterChunk[];
  end(): AdapterChunk[];
}

export interface ByoaProviderConfig {
  id: string;
  label: string;
  /** Origin de la sesión. De acá deriva el allowlist del proxy BYOA. */
  sessionOrigin: string;
  /** parent_message_uuid del PRIMER turno (raíz de una conversación nueva). */
  rootParentMessageUuid: string;
  buildCreateConversation(params: ByoaCreateParams): ByoaHttpRequest;
  buildCompletion(params: ByoaCompletionParams): ByoaHttpRequest;
  createParser(): ByoaStreamParser;
  notes?: string;
}

/** De dónde sale el texto del cuerpo: siempre el puente (offscreen). */
export interface ByoaTransport {
  /**
   * Ejecuta la request y entrega el cuerpo como TEXTO ya decodificado, en
   * piezas, vía `onText`. Resuelve al terminar; rechaza ante HTTP !ok
   * (mensaje con status + snippet corto del cuerpo, jamás headers) o fallo
   * de red. Un abort del `signal` rechaza con un error `name === "AbortError"`.
   */
  run(req: ByoaHttpRequest, onText: (text: string) => void, signal: AbortSignal): Promise<void>;
}
