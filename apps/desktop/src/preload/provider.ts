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

import { contextBridge } from "electron";

/**
 * Fin de la generación. **Es una unión discriminada de verdad**, y eso es una
 * corrección, no un adorno: antes `kind` era `string` y NADIE lo ramificaba.
 * El código miraba únicamente `completion.selector`, así que un proveedor sin
 * selector caía en `generating: false` — que se lee como "terminó" cuando en
 * realidad significa "no sé". Medido: con esa forma, una respuesta que hace
 * una pausa de 7 s en el medio se daba por terminada y se leía truncada.
 *
 *  · `element-gone`: hay un control observable (el botón de detener) que
 *    existe mientras genera y desaparece al terminar. Es OBSERVACIÓN.
 *  · `quiescence`: no se conoce ningún indicador en ese DOM. El fin sólo se
 *    puede INFERIR de que el texto dejó de crecer durante `quiescenceMs`.
 */
type CompletionSpec =
  | { kind: "element-gone"; selector: string; quiescenceMs: number }
  | { kind: "quiescence"; quiescenceMs: number };

interface PageSpec {
  composer: { selector: string; kind: "textarea" | "contenteditable" };
  submit: { kind: "click"; selector: string } | { kind: "key"; key: "Enter" };
  assistantMessage: { selector: string; pick: "last"; exclude?: string[] };
  completion: CompletionSpec;
  timeouts?: { composerMs?: number; submitReadyMs?: number; submitConfirmMs?: number };
  modelLabel?: { selector: string };
  /**
   * Último mensaje del USUARIO en el panel, no del asistente. Opcional
   * porque no está derivado para los nueve todavía (ver BLUEPRINT, Objetivo
   * 1 de la corrida "sin historial") — un proveedor sin este campo
   * simplemente no aporta dato de comparación, y eso se informa, no se
   * simula con un selector inventado.
   */
  userMessage?: { selector: string; pick: "last" };
}

/**
 * `true` generando, `false` terminado, **`null` no observable**.
 *
 * El `null` es el punto entero de esta corrección. Devolver `false` cuando no
 * hay indicador es afirmar algo que no se midió, y quien lo consume no tiene
 * cómo distinguirlo de un fin real (§2: nunca se simula un resultado; §7.9:
 * un dato de procedencia desconocida no se usa como si fuera conocido).
 */
function estaGenerando(spec: PageSpec): boolean | null {
  if (spec.completion.kind === "element-gone") return findOne(spec.completion.selector) !== null;
  return null;
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

/**
 * Espera a que el control exista Y este habilitado.
 *
 * Devuelve POR QUE fallo, no sólo que fallo. La version anterior devolvia
 * `null` a secas, y ese `null` tapaba dos causas que piden arreglos opuestos:
 *
 *  · "nunca aparecio" → el editor no registro el texto, asi que el boton no
 *    llego a existir. El problema esta ARRIBA, en la escritura.
 *  · "aparecio pero siguio deshabilitado" → el editor si tiene el texto y hay
 *    otra cosa bloqueando. El problema esta ACA.
 *
 * Un mensaje de error que no distingue esas dos manda a arreglar el lado
 * equivocado. Es la misma leccion que la del veredicto de continuidad: el
 * valor por defecto no puede colapsar "no paso" con "no pude ver".
 */
type EsperaControl =
  | { ok: true; el: Element }
  | { ok: false; motivo: "ausente" | "deshabilitado"; vistos: number };

async function waitForEnabled(sel: string, timeoutMs: number): Promise<EsperaControl> {
  const until = Date.now() + timeoutMs;
  // Cuantos nodos llegaron a matchear alguna vez, aunque nunca se habilitaran.
  let vistos = 0;
  for (;;) {
    const todos = document.querySelectorAll(sel);
    if (todos.length > vistos) vistos = todos.length;
    // Recorre TODOS los matches, no sólo el primero: con un selector compuesto
    // —como las dos variantes de aria-label de Claude— `querySelector` devuelve
    // el primero en orden de documento, habilitado o no.
    for (const el of todos) if (isEnabled(el)) return { ok: true, el };
    if (Date.now() > until) {
      return { ok: false, motivo: vistos === 0 ? "ausente" : "deshabilitado", vistos };
    }
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

/**
 * Lee el ÚLTIMO mensaje del usuario, igual que `readAssistant` pero sin
 * `exclude` (todavía no hizo falta). `null` si la spec no declara
 * `userMessage` o si el selector no matchea nada — nunca inventa un texto.
 */
function readUserMessage(spec: PageSpec): string | null {
  const sel = spec.userMessage?.selector;
  if (!sel) return null;
  let nodes: Element[];
  try {
    nodes = Array.from(document.querySelectorAll(sel));
  } catch {
    return null;
  }
  const node = nodes[nodes.length - 1];
  return node ? (node.textContent ?? "").trim() || null : null;
}

function readModelLabel(spec: PageSpec): string | null {
  const sel = spec.modelLabel?.selector;
  if (!sel) return null;
  const t = findOne(sel)?.textContent?.trim();
  return t && t.length > 0 && t.length < 120 ? t : null;
}

/**
 * DESGLOSE DE LA ETIQUETA, EN EL MOMENTO EXACTO DE LA LECTURA.
 * ------------------------------------------------------------
 * Existe por un defecto que NINGÚN instrumento del proyecto podía medir, y
 * conviene tener escrito por qué.
 *
 * El camino real guarda `GeminiFlash-Lite`: sin el número de versión y sin los
 * espacios. El sondeo, con el MISMO selector y la MISMA extracción
 * (`textContent.trim()`), devuelve `Gemini 3.5 Flash-Lite`. Medido sobre los
 * nueve crudos del árbol el 2026-08-10, la variable que separa los dos
 * resultados es el ESTADO DEL COMPOSITOR, con separación perfecta en 11 de 11
 * corridas: en reposo el pill aparece (5 de 5), con el compositor escrito no
 * aparece por ninguna vía (6 de 6). Ni las cookies ni el ancho de panel
 * separan.
 *
 * Y `readModelLabel` corre DESPUÉS del envío, o sea del lado en el que el pill
 * está degradado. El sondeo NO puede reproducir ese estado porque tiene
 * prohibido enviar, y una corrida profunda sólo existe después de enviar. La
 * única medición posible es que la lectura real se mire a sí misma.
 *
 * Por eso esto NO es un arreglo: es el instrumento que va a decidir cuál de
 * las dos causas es, en la próxima ronda de Juan. No se prueba ningún arreglo
 * a ciegas antes de tener ese dato.
 *
 * Es de SÓLO LECTURA y no agrega ninguna capacidad: recorre el subárbol
 * leyendo `tagName`, los atributos de una lista blanca ESTRUCTURAL y el texto
 * propio de cada nodo. Nunca cookies, tokens ni almacenamiento.
 */
const ATRIBUTOS_ESTRUCTURALES = [
  "id",
  "class",
  "data-testid",
  "data-test-id",
  "aria-label",
  "role",
] as const;

export interface NodoEtiqueta {
  prof: number;
  tag: string;
  attrs: Record<string, string>;
  /** Sólo los nodos de texto hijos DIRECTOS: dice en qué nodo vive cada pedazo. */
  propio: string;
  /** `textContent` no cruza un shadow root: un pedazo ahí adentro se lee como ausente. */
  sombra: boolean;
}

export interface DesgloseModelLabel {
  selector: string;
  presente: boolean;
  matches: number;
  /** Lo que `readModelLabel` devolvió en esta misma lectura, sin recortar. */
  textoCompleto: string | null;
  nodos: NodoEtiqueta[];
  hermanos: { tag: string; attrs: Record<string, string>; muestra: string }[];
}

function atributosDe(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of ATRIBUTOS_ESTRUCTURALES) {
    const v = el.getAttribute(a);
    if (v != null && v !== "") out[a] = v.slice(0, 120);
  }
  return out;
}

function textoPropio(n: Element): string {
  let out = "";
  for (const h of Array.from(n.childNodes)) {
    if (h.nodeType === 3) out += h.nodeValue ?? "";
  }
  // Se quitan los glifos del Area de Uso Privado y NADA mas: las fuentes de
  // iconos meten uno pegado al texto (el de claude salio como "Haiku 4.5" con
  // un glifo detras). Guiones y puntos se conservan a proposito: "Flash-Lite"
  // y "3.5" son justo lo que hay que poder ver aparecer y desaparecer.
  return out.replace(/[-]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
}

function readModelLabelDesglose(spec: PageSpec): DesgloseModelLabel | null {
  const sel = spec.modelLabel?.selector;
  if (!sel) return null;
  let nodos: Element[];
  try {
    nodos = Array.from(document.querySelectorAll(sel));
  } catch {
    return { selector: sel, presente: false, matches: -1, textoCompleto: null, nodos: [], hermanos: [] };
  }
  const el = nodos[0];
  if (!el) {
    return { selector: sel, presente: false, matches: 0, textoCompleto: null, nodos: [], hermanos: [] };
  }
  const arbol: NodoEtiqueta[] = [];
  const recorrer = (n: Element, prof: number): void => {
    if (arbol.length >= 40) return;
    arbol.push({
      prof,
      tag: n.tagName.toLowerCase(),
      attrs: atributosDe(n),
      propio: textoPropio(n),
      sombra: n.shadowRoot !== null,
    });
    for (const h of Array.from(n.children)) recorrer(h, prof + 1);
  };
  recorrer(el, 0);
  // Los HERMANOS van porque en gemini el control que lleva la version dentro
  // del aria-label es hermano del contenedor: si la correccion pasa por leer
  // un atributo en vez de un texto, hace falta verlo en la misma muestra.
  const hermanos: DesgloseModelLabel["hermanos"] = [];
  const padre = el.parentElement;
  if (padre) {
    for (const h of Array.from(padre.children)) {
      if (h === el || hermanos.length >= 6) continue;
      hermanos.push({
        tag: h.tagName.toLowerCase(),
        attrs: atributosDe(h),
        muestra: (h.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
      });
    }
  }
  return {
    selector: sel,
    presente: true,
    matches: nodos.length,
    textoCompleto: (el.textContent ?? "").slice(0, 200),
    nodos: arbol,
    hermanos,
  };
}

export interface RunResult {
  ok: boolean;
  error?: string;
  modelLabel?: string | null;
  modelLabelDesglose?: DesgloseModelLabel | null;
}

/**
 * Cuenta cuadros de texto GENERICOS en la pagina, sin usar la spec.
 *
 * Sirve para una sola pregunta, y es la que separa dos causas opuestas cuando
 * el compositor no aparece:
 *  · 0 candidatos → la pagina todavia no monto su interfaz. Es TIEMPO: falta
 *    esperar, o hay contencion entre varias apps cargando a la vez.
 *  · N candidatos pero el selector de la spec no matchea → la pagina SI cargo
 *    y esta mostrando otra cosa: otro layout (paneles angostos), otro idioma,
 *    o el selector caduco.
 * Sin este numero, "compositor no encontrado" son dos diagnosticos con el
 * mismo nombre, y llevan a arreglos contrarios.
 */
function contarCompositoresGenericos(): number {
  return document.querySelectorAll('textarea, div[contenteditable="true"], [role="textbox"]').length;
}

async function run(spec: PageSpec, prompt: string): Promise<RunResult> {
  const esperaCompositor = spec.timeouts?.composerMs ?? 15_000;
  const t0 = Date.now();
  const composer = await waitFor(spec.composer.selector, esperaCompositor);
  if (!composer) {
    const genericos = contarCompositoresGenericos();
    return {
      ok: false,
      error:
        genericos === 0
          ? `compositor no encontrado tras ${Date.now() - t0} ms, y la pagina NO tiene ningun cuadro de texto: no llego a montar su interfaz (tiempo o contencion)`
          : `compositor no encontrado tras ${Date.now() - t0} ms, pero la pagina SI tiene ${genericos} cuadro/s de texto: cargo y muestra otra cosa (otro layout, otro idioma, o el selector caduco)`,
    };
  }
  if (!writePrompt(composer, spec.composer.kind, prompt)) {
    return { ok: false, error: "el compositor no aceptó el texto" };
  }

  const before = readAssistant(spec).length;

  if (spec.submit.kind === "click") {
    const r = await waitForEnabled(spec.submit.selector, spec.timeouts?.submitReadyMs ?? 8_000);
    if (!r.ok) {
      return {
        ok: false,
        error:
          r.motivo === "ausente"
            ? `el control de envío NUNCA aparecio en el DOM (0 nodos para "${spec.submit.selector}"): mirar la ESCRITURA, no el envio`
            : `el control de envío aparecio (${r.vistos} nodo/s) pero siguio deshabilitado`,
      };
    }
    (r.el as HTMLElement).click();
  } else {
    // `keyCode`/`which` van a proposito aunque esten deprecados: mucho editor
    // rico todavia decide por `e.keyCode === 13`, y un KeyboardEvent
    // construido sólo con `key` los deja en 0. `composed` hace falta para que
    // el evento cruce un shadow root. Sin esto el evento es sintacticamente
    // valido y semanticamente invisible para el editor.
    const o = {
      bubbles: true,
      cancelable: true,
      composed: true,
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
    } as const;
    composer.dispatchEvent(new KeyboardEvent("keydown", o));
    composer.dispatchEvent(new KeyboardEvent("keypress", o));
    composer.dispatchEvent(new KeyboardEvent("keyup", o));
  }

  // Confirmar EFECTO observable. Sin esto, un click que no reacciona termina
  // en un resultado vacío disfrazado de éxito.
  const until = Date.now() + (spec.timeouts?.submitConfirmMs ?? 12_000);
  for (;;) {
    const vacio = (composer.textContent ?? "").trim() === "" && (composer as HTMLTextAreaElement).value !== prompt;
    // `=== true` a propósito: `null` significa "no observable" y no puede
    // contar como evidencia de que el envío tuvo efecto.
    const generando = estaGenerando(spec) === true;
    if (vacio || generando || readAssistant(spec).length > before) break;
    if (Date.now() > until) return { ok: false, error: "el envío no produjo ningún cambio observable" };
    await sleep(100);
  }

  // El desglose se toma EN ESTE MOMENTO, el de después del envío, que es el
  // único en el que el defecto de la etiqueta de gemini ocurre. Tomarlo antes
  // volvería a medir el estado en el que el fallo no pasa (§7.24).
  return { ok: true, modelLabel: readModelLabel(spec), modelLabelDesglose: readModelLabelDesglose(spec) };
}

/**
 * ENVÍO CONFIABLE — para proveedores cuyo compositor rico IGNORA la entrada
 * sintética (medido en kimi, 2026-08-23: `dispatchEvent(beforeinput)` con
 * `isTrusted: false` no actualiza el modelo interno del editor. La clase
 * `is-empty` de su contenedor seguía marcada después de escribir por DOM,
 * aunque el DOM mostrara el texto — el editor se seguía viendo a sí mismo
 * vacío, y por eso ni el Enter sintético ni la limpieza posterior surtían
 * efecto: ambos dependen de que el editor SEPA que hay contenido).
 *
 * La escritura de estos proveedores no puede resolverse desde ACÁ: requiere
 * `webContents.sendInputEvent()`, que sólo existe en el proceso principal
 * (inyecta al nivel de Chromium, con `isTrusted: true`; ver
 * `difundirConfiable` en `main/index.ts`). Esto sólo expone las tres piezas
 * de SOLO LECTURA/preparación que sí corren del lado de la página:
 *  1. `prepararConfiable`: encuentra el compositor, confirma que no tiene un
 *     borrador de Juan, lo enfoca y devuelve cuántos caracteres tiene el
 *     asistente ANTES (para medir efecto después).
 *  2. `verificarTextoEscrito`: después de que el proceso principal escribió
 *     con eventos de teclado confiables, confirma que el compositor
 *     REALMENTE tiene ese texto — es la comprobación dura antes de enviar
 *     Enter: si esto da `false`, no se envía nada.
 *  3. `confirmarEfecto`: la MISMA lógica de confirmación de `run()` (efecto
 *     observable tras el envío), factorizada para no duplicarla.
 *
 * Ninguna de las tres hace clic ni despacha una tecla: eso vive en
 * `sendInputEvent`, del lado del proceso principal.
 */
interface PreparacionConfiable {
  ok: boolean;
  error?: string;
  antesLen?: number;
}

async function prepararConfiable(spec: PageSpec): Promise<PreparacionConfiable> {
  const esperaCompositor = spec.timeouts?.composerMs ?? 15_000;
  const composer = await waitFor(spec.composer.selector, esperaCompositor);
  if (!composer) {
    const genericos = contarCompositoresGenericos();
    return {
      ok: false,
      error:
        genericos === 0
          ? "compositor no encontrado: la pagina no monto su interfaz (tiempo o contencion)"
          : `compositor no encontrado, pero hay ${genericos} cuadro/s de texto genericos: otro layout, otro idioma, o el selector caduco`,
    };
  }
  const previo = (composer.textContent ?? "").trim();
  if (previo.length > 0) {
    return { ok: false, error: "el compositor ya tenia texto: no se escribe encima de un borrador de Juan" };
  }
  (composer as HTMLElement).focus();
  return { ok: true, antesLen: readAssistant(spec).length };
}

/**
 * Confirma que el compositor tiene el texto esperado DESPUÉS de que el
 * proceso principal escribió con `sendInputEvent`. Es la comprobación dura
 * antes de enviar Enter: si esto da `false`, el llamador NO tiene que
 * despachar ningún envío.
 */
function verificarTextoEscrito(spec: PageSpec, textoEsperado: string): boolean {
  let composer: Element | null;
  try {
    composer = document.querySelector(spec.composer.selector);
  } catch {
    return false;
  }
  if (!composer) return false;
  const actual = (composer.textContent ?? "").trim();
  // Comparación por PREFIJO, no igualdad exacta: algunos editores normalizan
  // saltos de línea o espacios al renderizar. Un prefijo largo (30 caracteres
  // o el texto entero si es más corto) alcanza para descartar que el
  // compositor haya quedado vacío o con basura, sin exigir un byte a byte
  // que ningún editor rico garantiza.
  const prefijo = textoEsperado.trim().slice(0, Math.min(30, textoEsperado.trim().length));
  return prefijo.length > 0 && actual.includes(prefijo);
}

/** Misma lógica de confirmación que la cola de `run()`, factorizada. */
async function confirmarEfecto(spec: PageSpec, antesLen: number): Promise<RunResult> {
  const composer = document.querySelector(spec.composer.selector) as HTMLElement | null;
  const until = Date.now() + (spec.timeouts?.submitConfirmMs ?? 12_000);
  for (;;) {
    const vacio = composer ? (composer.textContent ?? "").trim() === "" : false;
    const generando = estaGenerando(spec) === true;
    if (vacio || generando || readAssistant(spec).length > antesLen) break;
    if (Date.now() > until) return { ok: false, error: "el envío no produjo ningún cambio observable" };
    await sleep(100);
  }
  return { ok: true, modelLabel: readModelLabel(spec), modelLabelDesglose: readModelLabelDesglose(spec) };
}

/**
 * Se expone en el mundo principal para que el proceso principal lo invoque
 * con `executeJavaScript` —que corre en el mundo principal de la página, no
 * en el mundo aislado del preload—. Con `contextIsolation` activo,
 * `Object.defineProperty(window, ...)` sólo llega al mundo aislado y queda
 * invisible ahí afuera; `contextBridge.exposeInMainWorld` es el puente hecho
 * para cruzar esa frontera. La spec viaja como ARGUMENTO en cada llamada
 * —no como un global inyectado— para que el preload no dependa de que
 * alguien la haya sembrado antes.
 */
contextBridge.exposeInMainWorld("__ccProvider", {
  run: (spec: PageSpec, prompt: string) => run(spec, prompt),
  prepararConfiable: (spec: PageSpec) => prepararConfiable(spec),
  verificarTextoEscrito: (spec: PageSpec, texto: string) => verificarTextoEscrito(spec, texto),
  confirmarEfecto: (spec: PageSpec, antesLen: number) => confirmarEfecto(spec, antesLen),
  read: (spec: PageSpec) => ({
    text: readAssistant(spec),
    userText: readUserMessage(spec),
    generating: estaGenerando(spec),
    // Viaja con la lectura para que quien la consuma sepa si el fin se OBSERVA
    // o se INFIERE, sin tener que volver a mirar la spec.
    completionKind: spec.completion.kind,
    quiescenceMs: spec.completion.quiescenceMs,
    modelLabel: readModelLabel(spec),
    // Viaja junto con la etiqueta y en la MISMA lectura: si se tomara en otra
    // llamada, el DOM ya no seria el mismo y el desglose describiria un
    // instante distinto del que produjo la etiqueta que se guarda.
    modelLabelDesglose: readModelLabelDesglose(spec),
  }),
});
