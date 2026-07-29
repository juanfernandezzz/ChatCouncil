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

import type { AdapterChunk, CuratedModel } from "@chatcouncil/shared";

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

export interface ByoaGetThreadParams {
  orgId: string;
  conversationUuid: string;
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

/**
 * Campos comunes a las dos ramas de transporte (E9 ampliada, §0.16).
 */
export interface ByoaProviderCommon {
  id: string;
  label: string;
  /** Origin de la sesión. De acá deriva el allowlist del proxy BYOA. */
  sessionOrigin: string;
  /**
   * Registro curado para el selector (Fase 4, E4). IMPORTANTE: acá
   * "verified" es más estricto que en BYOK — un id de modelo público y
   * oficial puede seguir siendo `verified: false` si nunca se probó como
   * override en ESTE endpoint interno (distinto de la API pública).
   */
  models?: CuratedModel[];
  notes?: string;
}

/**
 * Rama "cookie": el camino verificado en Fase 3 — offscreen con
 * `credentials:"include"` contra el endpoint interno del proveedor. Tiene
 * forma de PETICIÓN HTTP. Hoy sólo claude.ai (§0.16, E10: claude.ai se
 * queda acá porque funciona y no se toca).
 */
export interface ByoaCookieProviderConfig extends ByoaProviderCommon {
  authTransport: "cookie";
  /** parent_message_uuid del PRIMER turno (raíz de una conversación nueva). */
  rootParentMessageUuid: string;
  buildCreateConversation(params: ByoaCreateParams): ByoaHttpRequest;
  buildCompletion(params: ByoaCompletionParams): ByoaHttpRequest;
  createParser(): ByoaStreamParser;
  /**
   * Paso 3, sólo tras un turno exitoso (Fase 4, E2 — recon Round B,
   * 2026-07-11): GET no-streaming que trae el árbol de mensajes de la
   * conversación. De acá sale el uuid del último mensaje del asistente,
   * candidato a `parent_message_uuid` del PRÓXIMO turno.
   */
  buildGetThread(params: ByoaGetThreadParams): ByoaHttpRequest;
  /**
   * Extrae el uuid del último mensaje del asistente del cuerpo (JSON) de
   * `buildGetThread`. `null` si el cuerpo no trae lo esperado — el turno
   * ya entregado sigue `done` igual, sólo se pierde el threading del
   * próximo turno (degradación suave, nunca un error del turno actual).
   */
  parseLastAssistantMessageUuid(body: string): string | null;
}

/**
 * Rama "page" (E10/E11, §0.16) — ESPECIFICACIÓN DECLARATIVA.
 * ----------------------------------------------------------
 * El content script same-origin es un EJECUTOR GENÉRICO: interpreta esta
 * spec y no sabe nada del proveedor (preserva Q1, runner agnóstico). Toda
 * la estrategia viaja en `adapters.json`, así que un rediseño de UI se
 * arregla editando un JSON y esperando el TTL — sin recompilar ni
 * reinstalar la extensión.
 *
 * RESTRICCIÓN DE SEGURIDAD (E11, no negociable): esta spec transporta SÓLO
 * datos declarativos — selectores y enums. JAMÁS cadenas evaluables ni
 * código. El manifiesto es remoto y el ejecutor corre dentro de páginas
 * LOGUEADAS del usuario: si pudiera transportar código, un manifiesto
 * comprometido correría JS arbitrario con la sesión de la persona. Se
 * verifica por gate.
 */
export interface ByoaPageSpec {
  /** URL a abrir para arrancar una conversación nueva. */
  newConversationUrl: string;
  /** Dónde se escribe el prompt. */
  composer: {
    selector: string;
    kind: "textarea" | "contenteditable";
  };
  /** Cómo se dispara el envío. */
  submit:
    | { kind: "click"; selector: string }
    | { kind: "key"; key: "Enter" };
  /** Subárbol que observa el MutationObserver. */
  responseRoot: { selector: string };
  /** De dónde se lee el texto del asistente; `pick` resuelve cuál turno. */
  /**
   * `exclude` (§0.35): subarboles a DESCARTAR antes de leer el texto. Nace
   * de GLM, que inyecta un bloque colapsable de "Thought Process" DENTRO del
   * mismo contenedor que la respuesta final: leer `textContent` a secas
   * arrastraba el razonamiento pegado al texto limpio. Apuntar el selector a
   * los hijos que no son el bloque de pensamiento NO sirve, porque
   * `pick: "last"` se quedaria solo con el ultimo parrafo. La forma correcta
   * es seguir apuntando al CONTENEDOR y restarle lo que sobra.
   */
  assistantMessage: { selector: string; pick: "last"; exclude?: string[] };
  /**
   * Donde la UI muestra la etiqueta del modelo vigente (§0.28). Sirve para
   * DETECTAR la deriva de version: bajo BYOA el proveedor puede cambiar el
   * modelo por debajo sin avisar, y sin esto la deriva es invisible.
   */
  modelLabel?: { selector: string };
  /**
   * Cómo se sabe que la generación terminó. `quiescence` es el fallback
   * universal y debe existir siempre como red: si el marcador estructural
   * cambia con un rediseño, el turno igual cierra en vez de colgarse.
   */
  completion:
    | { kind: "element-gone"; selector: string; quiescenceMs: number }
    | { kind: "element-present"; selector: string; quiescenceMs: number }
    | { kind: "quiescence"; quiescenceMs: number };
  /**
   * Selectores que delatan que hace falta intervención HUMANA (challenge,
   * captcha, gate de producto). Al detectarse, el ejecutor NO intenta
   * resolver nada: emite la señal de challenge de §0.14 para que la
   * persona lo resuelva en la ventana real.
   */
  humanGate?: { selector: string }[];
  /**
   * Techos de tiempo, en milisegundos. Viven en la spec y NO en el codigo
   * (E11) porque el valor correcto depende del proveedor y de las
   * condiciones: §0.20 midio el mismo turno en ~7 s con la pestana recien
   * ocultada y en ~85 s con una pestana ocultada hace rato, por el
   * estrangulamiento progresivo de Chrome. Un techo fijo compilado obliga
   * a recompilar la extension para ajustarlo; aca se ajusta editando el
   * manifiesto remoto. Si se omiten, rigen los valores por defecto del
   * ejecutor.
   */
  timeouts?: {
    /** Espera a que el control de envio exista y este accionable. */
    submitReadyMs?: number;
    /** Espera a que el envio produzca un cambio observable. */
    submitConfirmMs?: number;
    /** Techo con CERO avance de contenido tras el envio. */
    emptyResponseMs?: number;
  };
}

/**
 * Rama "page": transporte PRIMARIO desde §0.16 (E10). El JS del propio
 * sitio genera los tokens anti-abuso, el `localStorage` es accesible y no
 * hace falta descubrir endpoints internos.
 */
export interface ByoaPageProviderConfig extends ByoaProviderCommon {
  authTransport: "page";
  page: ByoaPageSpec;
}

/**
 * Unión discriminada por `authTransport` (E9 ampliada, §0.16). Forzar las
 * dos ramas en una sola interfaz sería un error de diseño: una tiene forma
 * de petición HTTP y la otra de DOM.
 */
export type ByoaProviderConfig =
  | ByoaCookieProviderConfig
  | ByoaPageProviderConfig;

/**
 * De dónde sale el texto del cuerpo en la rama "cookie": el puente
 * (byoa:proxy → offscreen con credentials:"include").
 *
 * NOTA (§0.16): esto YA NO es universal. La suposición original —"siempre
 * el puente"— se rompió con la evidencia del recon (§0.15): DeepSeek
 * autentica por localStorage, inalcanzable desde el offscreen. La rama
 * "page" no usa este transporte: su texto sale del DOM observado por el
 * ejecutor genérico dentro de la página.
 */
export interface ByoaTransport {
  /**
   * Ejecuta la request y entrega el cuerpo como TEXTO ya decodificado, en
   * piezas, vía `onText`. Resuelve al terminar; rechaza ante HTTP !ok
   * (mensaje con status + snippet corto del cuerpo, jamás headers) o fallo
   * de red. Un abort del `signal` rechaza con un error `name === "AbortError"`.
   */
  run(req: ByoaHttpRequest, onText: (text: string) => void, signal: AbortSignal): Promise<void>;
}
