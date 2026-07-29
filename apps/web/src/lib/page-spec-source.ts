/**
 * page-spec-source.ts — override remoto de la spec de página
 * -----------------------------------------------------------
 * Hace OPERATIVA la promesa de E11 (§0.16): "un proveedor roto por un
 * rediseño se arregla editando un JSON y esperando el TTL, sin recompilar
 * ni reinstalar la extensión".
 *
 * POR QUÉ EXISTE (§0.32): esa promesa estaba escrita en el ledger pero NO
 * implementada. Cuando ChatGPT dejó de envolver sus respuestas en la clase
 * `.markdown`, el extractor dejó de encontrar nodos y el turno expiraba a
 * los 90 s reportando "sin contenido observable" — con la respuesta ya en
 * pantalla. El arreglo tuvo que hacerse en `chatgpt.ts`, o sea recompilar,
 * pushear, esperar CI y recargar la extensión. Exactamente el ciclo que
 * E11 existía para evitar, en el primer caso real que lo requirió.
 *
 * MODELO DE CONFIANZA. El manifiesto es remoto y su spec termina guiando a
 * un ejecutor que corre DENTRO de páginas logueadas de la persona. Por eso:
 *  · Sólo se aceptan DATOS DECLARATIVOS con forma validada. Cualquier campo
 *    inesperado o con tipo incorrecto invalida el override completo — no se
 *    hace merge parcial, que dejaría specs a medio armar.
 *  · Nunca se evalúa nada: es JSON, y aun así la validación es explícita.
 *  · Ante CUALQUIER duda —fetch caído, JSON roto, forma inválida— se cae al
 *    valor por defecto compilado. El override es una MEJORA, jamás una
 *    dependencia: si el manifiesto no está, el producto sigue funcionando.
 */

import type { ByoaPageSpec } from "@chatcouncil/adapters";

const MANIFEST_URL = "https://chatcouncil.netlify.app/adapters.json";
/** Mismo TTL que usa el service worker para el manifiesto. */
const TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  at: number;
  specs: Record<string, ByoaPageSpec>;
}

let cache: CacheEntry | null = null;
let inFlight: Promise<void> | null = null;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isPosNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * Valida la forma COMPLETA de una spec. Devuelve `null` ante cualquier
 * desvío: es preferible seguir con el valor compilado —que se sabe que
 * funcionaba— antes que ejecutar una spec a medio validar.
 */
export function parsePageSpec(raw: unknown): ByoaPageSpec | null {
  if (!isObj(raw)) return null;

  const { newConversationUrl, composer, submit, responseRoot, assistantMessage, completion } = raw;

  if (!isStr(newConversationUrl)) return null;

  if (!isObj(composer) || !isStr(composer.selector)) return null;
  if (composer.kind !== "textarea" && composer.kind !== "contenteditable") return null;

  if (!isObj(submit)) return null;
  if (submit.kind === "click") {
    if (!isStr(submit.selector)) return null;
  } else if (submit.kind === "key") {
    if (submit.key !== "Enter") return null;
  } else return null;

  if (!isObj(responseRoot) || !isStr(responseRoot.selector)) return null;
  if (!isObj(assistantMessage) || !isStr(assistantMessage.selector)) return null;
  if (assistantMessage.pick !== "last") return null;

  if (!isObj(completion) || !isPosNum(completion.quiescenceMs)) return null;
  if (completion.kind === "element-gone" || completion.kind === "element-present") {
    if (!isStr(completion.selector)) return null;
  } else if (completion.kind !== "quiescence") return null;

  // Opcionales: si vienen, deben ser válidos; si son inválidos, se rechaza
  // el override entero en vez de descartarlos en silencio.
  const humanGate = raw.humanGate;
  if (humanGate !== undefined) {
    if (!Array.isArray(humanGate)) return null;
    if (!humanGate.every((g) => isObj(g) && isStr(g.selector))) return null;
  }
  const timeouts = raw.timeouts;
  if (timeouts !== undefined) {
    if (!isObj(timeouts)) return null;
    for (const k of ["submitReadyMs", "submitConfirmMs", "emptyResponseMs"]) {
      const v = timeouts[k];
      if (v !== undefined && !isPosNum(v)) return null;
    }
  }

  return raw as unknown as ByoaPageSpec;
}

async function refresh(): Promise<void> {
  try {
    const res = await fetch(MANIFEST_URL, { cache: "no-store" });
    if (!res.ok) return;
    const body: unknown = await res.json();
    const specs: Record<string, ByoaPageSpec> = {};
    if (isObj(body) && Array.isArray(body.providers)) {
      for (const p of body.providers) {
        if (!isObj(p) || !isStr(p.id) || p.pageSpec === undefined) continue;
        const parsed = parsePageSpec(p.pageSpec);
        if (parsed) specs[p.id] = parsed;
      }
    }
    cache = { at: Date.now(), specs };
  } catch {
    // Sin manifiesto se sigue con los valores compilados. No es un error
    // del turno: el override es opcional por diseño.
  }
}

/** Refresca el manifiesto si venció el TTL. Nunca lanza. */
export async function primePageSpecs(): Promise<void> {
  if (cache && Date.now() - cache.at < TTL_MS) return;
  inFlight ??= refresh().finally(() => {
    inFlight = null;
  });
  await inFlight;
}

/**
 * Devuelve la spec vigente para un proveedor: la remota si existe y es
 * válida, o el valor compilado. Es SÍNCRONA a propósito, para no meter una
 * espera de red en el camino del despacho — se sirve de lo que haya en
 * caché, que `primePageSpecs()` mantiene fresca.
 */
export function resolvePageSpec(providerId: string, compiled: ByoaPageSpec): ByoaPageSpec {
  return cache?.specs[providerId] ?? compiled;
}

/** Sólo para pruebas: limpia la caché. */
export function __resetPageSpecCache(): void {
  cache = null;
  inFlight = null;
}

/** Sólo para pruebas: inyecta specs sin tocar la red. */
export function __seedPageSpecCache(specs: Record<string, ByoaPageSpec>): void {
  cache = { at: Date.now(), specs };
}
