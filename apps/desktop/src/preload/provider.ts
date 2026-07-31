/**
 * preload/provider.ts — inyección y lectura dentro de la vista del proveedor
 * ---------------------------------------------------------------------------
 * Corre en el contexto de la página del proveedor. Reemplaza al content
 * script de la v2, pero sin extensión, sin `host_permissions` y sin puente:
 * acá el acceso al DOM es directo porque el armazón es nuestro.
 *
 * LÍMITES que se mantienen intactos de la v2:
 *  · Nunca lee ni reenvía cookies, tokens ni headers de autenticación.
 *  · Nunca resuelve challenges ni captchas.
 *  · Nunca simula un resultado: si algo falla, devuelve el error.
 *
 * LECCIONES DE LA v2 QUE ESTE ARCHIVO APLICA (BLUEPRINT §7):
 *  · Las UIs con framework re-renderizan de forma asíncrona: después de
 *    escribir hay que ESPERAR a que el control de envío exista y esté
 *    accionable, y después CONFIRMAR que el envío tuvo efecto observable.
 *    Buscarlo en el mismo tick lo encuentra ausente.
 *  · El selector "obvio" viene con ruido estructural: GLM mete el bloque de
 *    razonamiento DENTRO del contenedor de la respuesta, así que se resta
 *    con `exclude` sobre una copia, sin tocar la página que la persona ve.
 */

interface PageSpec {
  composer: { selector: string; kind: "textarea" | "contenteditable" };
  submit: { kind: "click"; selector: string } | { kind: "key"; key: "Enter" };
  assistantMessage: { selector: string; pick: "last"; exclude?: string[] };
  completion: { kind: string; selector?: string; quiescenceMs: number };
  timeouts?: { submitReadyMs?: number; submitConfirmMs?: number };
  modelLabel?: { selector: string };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function findOne(sel: string): Element | null {
  try {
    return document.querySelector(sel);
  } catch {
    return null;
  }
}

async function waitFor(sel: string, timeoutMs: number): Promise<Element | null> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const el = findOne(sel);
    if (el) return el;
    if (Date.now() > until) return null;
    await sleep(120);
  }
}

/** Presente Y accionable: un click sobre un control deshabilitado no hace nada y no lanza. */
function isEnabled(el: Element): boolean {
  if ((el as HTMLButtonElement).disabled) return false;
  return el.getAttribute("aria-disabled") !== "true";
}

async function waitForEnabled(sel: string, timeoutMs: number): Promise<Element | null> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const el = findOne(sel);
    if (el && isEnabled(el)) return el;
    if (Date.now() > until) return null;
    await sleep(80);
  }
}

/**
 * Escribe en el compositor. Los editores controlados por un framework ignoran
 * la asignación directa de `value` porque mantienen su propio estado: hay que
 * usar el setter nativo del prototipo y despachar el evento que el framework
 * escucha. Falla ruidosamente si el texto no quedó.
 */
function writePrompt(el: Element, kind: PageSpec["composer"]["kind"], text: string): boolean {
  (el as HTMLElement).focus();
  if (kind === "textarea") {
    const ta = el as HTMLTextAreaElement;
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ta) as object, "value");
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

/** Lee el texto del asistente restando los subárboles que sobran, sobre una COPIA. */
function readAssistant(spec: PageSpec): string {
  let nodes: Element[];
  try {
    nodes = Array.from(document.querySelectorAll(spec.assistantMessage.selector));
  } catch {
    return "";
  }
  const node = nodes[nodes.length - 1];
  if (!node) return "";
  const exclude = spec.assistantMessage.exclude ?? [];
  if (exclude.length === 0) return node.textContent ?? "";
  const copy = node.cloneNode(true) as Element;
  for (const sel of exclude) {
    try {
      copy.querySelectorAll(sel).forEach((n) => {
        n.remove();
      });
    } catch {
      /* selector inválido: se ignora esa exclusión, no se rompe el turno */
    }
  }
  return copy.textContent ?? "";
}

function readModelLabel(spec: PageSpec): string | null {
  const sel = spec.modelLabel?.selector;
  if (!sel) return null;
  const t = findOne(sel)?.textContent?.trim();
  return t && t.length > 0 && t.length < 120 ? t : null;
}

export interface RunResult {
  ok: boolean;
  error?: string;
  modelLabel?: string | null;
}

async function run(spec: PageSpec, prompt: string): Promise<RunResult> {
  const composer = await waitFor(spec.composer.selector, 15_000);
  if (!composer) return { ok: false, error: "compositor no encontrado" };
  if (!writePrompt(composer, spec.composer.kind, prompt)) {
    return { ok: false, error: "el compositor no aceptó el texto" };
  }

  const before = readAssistant(spec).length;

  if (spec.submit.kind === "click") {
    const btn = await waitForEnabled(spec.submit.selector, spec.timeouts?.submitReadyMs ?? 8_000);
    if (!btn) return { ok: false, error: "el control de envío no apareció habilitado a tiempo" };
    (btn as HTMLElement).click();
  } else {
    const o = { bubbles: true, cancelable: true, key: "Enter", code: "Enter" } as const;
    composer.dispatchEvent(new KeyboardEvent("keydown", o));
    composer.dispatchEvent(new KeyboardEvent("keyup", o));
  }

  // Confirmar EFECTO observable. Sin esto, un click que no reacciona termina
  // en un resultado vacío disfrazado de éxito.
  const until = Date.now() + (spec.timeouts?.submitConfirmMs ?? 12_000);
  for (;;) {
    const vacio = (composer.textContent ?? "").trim() === "" && (composer as HTMLTextAreaElement).value !== prompt;
    const generando = spec.completion.selector ? findOne(spec.completion.selector) !== null : false;
    if (vacio || generando || readAssistant(spec).length > before) break;
    if (Date.now() > until) return { ok: false, error: "el envío no produjo ningún cambio observable" };
    await sleep(100);
  }

  return { ok: true, modelLabel: readModelLabel(spec) };
}

/**
 * Se expone en `window` del propio proveedor para que el proceso principal lo
 * invoque con `executeJavaScript`. En fases posteriores esto pasa a `ipcRenderer`
 * con `contextBridge`; en Fase 0 se mantiene mínimo a propósito.
 */
/**
 * Se expone en `window` del propio proveedor para que el proceso principal lo
 * invoque con `executeJavaScript`. La spec viaja como ARGUMENTO en cada
 * llamada —no como un global inyectado— para que el preload no dependa de
 * que alguien la haya sembrado antes.
 */
Object.defineProperty(window, "__ccProvider", {
  value: {
    run: (spec: PageSpec, prompt: string) => run(spec, prompt),
    read: (spec: PageSpec) => ({
      text: readAssistant(spec),
      generating: spec.completion.selector ? findOne(spec.completion.selector) !== null : false,
      modelLabel: readModelLabel(spec),
    }),
  },
  writable: false,
});
