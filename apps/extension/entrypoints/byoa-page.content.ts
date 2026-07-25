/**
 * byoa-page.content.ts — EJECUTOR GENÉRICO del transporte "page"
 * ---------------------------------------------------------------
 * Fase 11, Round A parte 2a (§0.18). Content script same-origin que
 * interpreta una `ByoaPageSpec` DECLARATIVA y no sabe NADA del proveedor:
 * toda la estrategia (selectores, forma de envío, detección de fin) viaja
 * en el manifiesto remoto. Eso preserva Q1 — la extensión sigue siendo un
 * runner agnóstico — y permite arreglar un rediseño de UI editando un JSON
 * en vez de recompilar la extensión (E11).
 *
 * POR QUÉ EXISTE ESTE TRANSPORTE (§0.15 / §0.16): el JS del propio sitio
 * genera los tokens anti-abuso (proof-of-work del sentinel de ChatGPT, `at`
 * + WAA de Gemini), el `localStorage` es accesible same-origin (DeepSeek) y
 * no hace falta descubrir endpoints internos (Perplexity, Grok).
 *
 * LÍMITES DUROS que este archivo respeta y no debe perder:
 *  · NUNCA lee ni reenvía cookies, tokens ni headers de autenticación.
 *  · NUNCA resuelve challenges ni captchas: al detectar un `humanGate`
 *    emite la señal y se detiene, para que la persona lo resuelva en la
 *    ventana real (§0.14).
 *  · NUNCA evalúa código venido del manifiesto: la spec es sólo selectores
 *    y enums (E11). Acá no hay `eval` ni `new Function`.
 *  · NUNCA simula una respuesta: si se estanca, reporta estancamiento.
 *
 * ESTADO: SONDA. El disparador por `window.postMessage` es un andamio de
 * validación para Round A p2a y NO debe sobrevivir a p2b — cualquier script
 * de la página podría dispararlo. En p2b el disparo pasa a ser un mensaje
 * de la extensión (`chrome.runtime.onMessage`) y este camino se elimina.
 */

import type { ByoaPageSpec } from "@chatcouncil/adapters";

/** Techo para que el control de envío aparezca y se habilite tras escribir. */
const SUBMIT_READY_MS = 5_000;
/** Techo para confirmar que el envío tuvo efecto observable. */
const SUBMIT_CONFIRM_MS = 6_000;
/**
 * Techo absoluto de espera con CERO avance de contenido tras el envío.
 * Hallazgo de la sonda p2a (§0.20): el contenedor del asistente puede
 * existir y quedar quieto durante varios segundos ANTES de tener texto, así
 * que la quietud sola no prueba que la respuesta esté completa. Sin este
 * techo, exigir avance real dejaría el turno colgado para siempre si el
 * contenedor nunca se llena.
 */
const EMPTY_RESPONSE_TIMEOUT_MS = 45_000;

const PROBE_TRIGGER = "chatcouncil:byoa-page:probe";
const PROBE_EVENT = "chatcouncil:byoa-page:event";

/** Marcador para el gate de artefacto: prueba que el módulo embarcó. */
const EXECUTOR_MARKER = "byoa-page-executor-v4";

type ExecutorEvent =
  | { kind: "started" }
  | { kind: "human-gate"; selector: string }
  | { kind: "submitted" }
  | { kind: "delta"; textLength: number }
  | { kind: "stalled"; idleMs: number }
  | { kind: "done"; textLength: number; elapsedMs: number }
  | { kind: "error"; message: string };

function emit(ev: ExecutorEvent): void {
  // Sólo forma y longitudes; jamás el texto de la respuesta ni credenciales.
  window.postMessage({ source: PROBE_EVENT, marker: EXECUTOR_MARKER, ...ev }, window.location.origin);
}

function findOne(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

/** Espera a que aparezca un elemento, con techo de tiempo. */
async function waitFor(selector: string, timeoutMs: number): Promise<Element | null> {
  const started = Date.now();
  for (;;) {
    const el = findOne(selector);
    if (el) return el;
    if (Date.now() - started > timeoutMs) return null;
    await new Promise((r) => setTimeout(r, 120));
  }
}

/**
 * Escribe el prompt en el compositor.
 *
 * RIESGO IDENTIFICADO en §0.17: los compositores controlados por React o
 * ProseMirror (el de ChatGPT entre ellos) IGNORAN la asignación directa de
 * `value`, porque el framework mantiene su propio estado. Por eso se usa el
 * setter nativo del prototipo + un evento `input` con `bubbles`, que es lo
 * que React escucha. Para `contenteditable` se usa `beforeinput`/`input`
 * sobre el nodo enfocado. Si esto falla, falla RUIDOSAMENTE: se verifica
 * que el texto haya quedado y se reporta error si no.
 */
function writePrompt(el: Element, kind: ByoaPageSpec["composer"]["kind"], text: string): boolean {
  (el as HTMLElement).focus();

  if (kind === "textarea") {
    const ta = el as HTMLTextAreaElement;
    const proto = Object.getPrototypeOf(ta) as object;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc?.set) desc.set.call(ta, text);
    else ta.value = text;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    return ta.value === text;
  }

  const host = el as HTMLElement;
  host.dispatchEvent(
    new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: text }),
  );
  if (!host.textContent?.includes(text)) {
    host.textContent = text;
    host.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  }
  return (host.textContent ?? "").includes(text);
}

/** ¿El control está presente Y accionable? Un click sobre un botón
 *  deshabilitado no hace nada y no lanza: sería un no-op SILENCIOSO. */
function isEnabled(el: Element): boolean {
  if ((el as HTMLButtonElement).disabled) return false;
  if (el.getAttribute("aria-disabled") === "true") return false;
  return true;
}

async function waitForEnabled(selector: string, timeoutMs: number): Promise<Element | null> {
  const started = Date.now();
  for (;;) {
    const el = findOne(selector);
    if (el && isEnabled(el)) return el;
    if (Date.now() - started > timeoutMs) return null;
    await new Promise((r) => setTimeout(r, 80));
  }
}

/**
 * Dispara el envío.
 *
 * CARRERA DE TIEMPO corregida en §0.19 (hallada por la sonda p2a): el
 * control de envío de una UI con framework aparece o se habilita DESPUÉS
 * de que el framework re-renderiza en respuesta al `input`, o sea un tick
 * más tarde. Buscarlo en el mismo tick que la escritura lo encuentra
 * ausente. Por eso se ESPERA a que exista Y esté habilitado, igual que ya
 * se esperaba al compositor.
 */
async function submit(spec: ByoaPageSpec, composer: Element): Promise<boolean> {
  if (spec.submit.kind === "click") {
    const btn = await waitForEnabled(spec.submit.selector, SUBMIT_READY_MS);
    if (!btn) return false;
    (btn as HTMLElement).click();
    return true;
  }
  const opts = { bubbles: true, cancelable: true, key: "Enter", code: "Enter" } as const;
  composer.dispatchEvent(new KeyboardEvent("keydown", opts));
  composer.dispatchEvent(new KeyboardEvent("keyup", opts));
  return true;
}

/**
 * Confirma que el envío TUVO EFECTO. Sin esto, un click sobre un control
 * que no reacciona es un no-op silencioso: el ejecutor esperaría, saltaría
 * por inactividad y reportaría `done` con 0 caracteres — o sea una
 * respuesta vacía disfrazada de éxito. Se prefiere un error ruidoso.
 *
 * Señales aceptadas, cualquiera alcanza y ninguna es específica de un
 * proveedor: el compositor se vació, apareció el marcador de "generando",
 * o el texto del asistente creció.
 */
async function confirmSubmitted(
  spec: ByoaPageSpec,
  composer: Element,
  baselineLength: number,
): Promise<boolean> {
  const started = Date.now();
  const marker = spec.completion.kind === "quiescence" ? null : spec.completion.selector;
  for (;;) {
    if ((composer.textContent ?? "").trim() === "") return true;
    if (marker && findOne(marker)) return true;
    if (readAssistantText(spec).length > baselineLength) return true;
    if (Date.now() - started > SUBMIT_CONFIRM_MS) return false;
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** ¿La generación terminó, según el marcador estructural de la spec? */
function structurallyComplete(spec: ByoaPageSpec): boolean {
  const c = spec.completion;
  if (c.kind === "element-gone") return findOne(c.selector) === null;
  if (c.kind === "element-present") return findOne(c.selector) !== null;
  return false; // "quiescence" resuelve sólo por inactividad
}

function readAssistantText(spec: ByoaPageSpec): string {
  let nodes: Element[];
  try {
    nodes = Array.from(document.querySelectorAll(spec.assistantMessage.selector));
  } catch {
    return "";
  }
  const node = nodes[nodes.length - 1];
  return node?.textContent ?? "";
}

/** Cuántos nodos de mensaje del asistente hay AHORA. Sirve para distinguir
 *  "el turno nuevo ya tiene nodo propio" de "todavía apunta al anterior". */
function countAssistantNodes(spec: ByoaPageSpec): number {
  try {
    return document.querySelectorAll(spec.assistantMessage.selector).length;
  } catch {
    return 0;
  }
}

async function run(spec: ByoaPageSpec, prompt: string): Promise<void> {
  const t0 = Date.now();
  emit({ kind: "started" });

  for (const gate of spec.humanGate ?? []) {
    if (findOne(gate.selector)) {
      // No se resuelve NADA acá: lo resuelve la persona en la ventana real.
      emit({ kind: "human-gate", selector: gate.selector });
      return;
    }
  }

  const composer = await waitFor(spec.composer.selector, 15_000);
  if (!composer) {
    emit({ kind: "error", message: "compositor no encontrado" });
    return;
  }
  if (!writePrompt(composer, spec.composer.kind, prompt)) {
    emit({ kind: "error", message: "el compositor no aceptó el texto" });
    return;
  }
  const baselineLength = readAssistantText(spec).length;
  const baselineNodeCount = countAssistantNodes(spec);
  if (!(await submit(spec, composer))) {
    emit({ kind: "error", message: "el control de envío no apareció habilitado a tiempo" });
    return;
  }
  if (!(await confirmSubmitted(spec, composer, baselineLength))) {
    emit({ kind: "error", message: "el envío no produjo ningún cambio observable" });
    return;
  }
  emit({ kind: "submitted" });

  const root = findOne(spec.responseRoot.selector) ?? document.body;
  const idleLimit = spec.completion.quiescenceMs;
  const loopStart = Date.now();
  let lastMutation = Date.now();
  let lastLength = 0;
  let stallReported = false;

  const observer = new MutationObserver(() => {
    lastMutation = Date.now();
    const len = readAssistantText(spec).length;
    if (len !== lastLength) {
      lastLength = len;
      emit({ kind: "delta", textLength: len });
    }
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true });

  try {
    for (;;) {
      await new Promise((r) => setTimeout(r, 200));
      const idle = Date.now() - lastMutation;
      // Un turno nuevo real: existe un nodo de asistente que NO estaba antes
      // del envío (countAssistantNodes creció) Y ese nodo ya tiene texto.
      // Comparar longitudes contra el turno anterior es INCORRECTO: una
      // respuesta nueva más CORTA que la anterior (p.ej. "¡Hola!" tras un
      // "¡Hola! ¿Cómo estás...?") nunca superaría ese umbral y el turno
      // quedaría colgado hasta el error por timeout (hallazgo p2a, §0.21).
      const hasNewContent = lastLength > 0 && countAssistantNodes(spec) > baselineNodeCount;

      // Sin avance real sobre el turno anterior, ninguna de las dos señales
      // de fin cuenta como fin: ni el marcador estructural ni la inactividad
      // prueban nada por sí solos si el contenedor sigue vacío (§0.20).
      if (hasNewContent && structurallyComplete(spec) && idle > 400) break;
      if (hasNewContent && idle > idleLimit) break;

      if (!hasNewContent && Date.now() - loopStart > EMPTY_RESPONSE_TIMEOUT_MS) {
        emit({ kind: "error", message: "sin contenido observable del asistente" });
        return;
      }

      // Estancamiento: se REPORTA, nunca se rellena (§0.17).
      if (!stallReported && idle > idleLimit * 3) {
        stallReported = true;
        emit({ kind: "stalled", idleMs: idle });
      }
    }
    emit({ kind: "done", textLength: readAssistantText(spec).length, elapsedMs: Date.now() - t0 });
  } finally {
    observer.disconnect();
  }
}

export default defineContentScript({
  matches: ["https://chatgpt.com/*"],
  runAt: "document_idle",
  main() {
    // ANDAMIO DE SONDA — se elimina en Round A p2b (ver cabecera).
    window.addEventListener("message", (ev: MessageEvent) => {
      if (ev.source !== window || ev.origin !== window.location.origin) return;
      const data = ev.data as { source?: string; spec?: ByoaPageSpec; prompt?: string } | null;
      if (!data || data.source !== PROBE_TRIGGER || !data.spec || !data.prompt) return;
      void run(data.spec, data.prompt).catch((e: unknown) => {
        emit({ kind: "error", message: e instanceof Error ? e.message : "fallo desconocido" });
      });
    });
    console.info(`[chatcouncil] ${EXECUTOR_MARKER} listo`);
  },
});
