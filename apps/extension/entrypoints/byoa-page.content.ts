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

const PROBE_TRIGGER = "chatcouncil:byoa-page:probe";
const PROBE_EVENT = "chatcouncil:byoa-page:event";

/** Marcador para el gate de artefacto: prueba que el módulo embarcó. */
const EXECUTOR_MARKER = "byoa-page-executor-v1";

type ExecutorEvent =
  | { kind: "started" }
  | { kind: "human-gate"; selector: string }
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

function submit(spec: ByoaPageSpec, composer: Element): boolean {
  if (spec.submit.kind === "click") {
    const btn = findOne(spec.submit.selector);
    if (!btn) return false;
    (btn as HTMLElement).click();
    return true;
  }
  const opts = { bubbles: true, cancelable: true, key: "Enter", code: "Enter" } as const;
  composer.dispatchEvent(new KeyboardEvent("keydown", opts));
  composer.dispatchEvent(new KeyboardEvent("keyup", opts));
  return true;
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
  if (!submit(spec, composer)) {
    emit({ kind: "error", message: "no se pudo disparar el envío" });
    return;
  }

  const root = findOne(spec.responseRoot.selector) ?? document.body;
  const idleLimit = spec.completion.quiescenceMs;
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

      if (structurallyComplete(spec) && idle > 400) break;
      if (idle > idleLimit) break;

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
