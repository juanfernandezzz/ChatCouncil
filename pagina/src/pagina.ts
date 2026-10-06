/**
 * pagina.ts — el script que corre dentro de la página de cada proveedor, el
 * mismo para WebView2 y Android WebView. Port de las funciones con llamador de
 * apps/desktop/src/preload/provider.ts.
 *
 * Límites, intactos de la versión Electron:
 *  · Nunca lee ni reenvía cookies, tokens, almacenamiento ni encabezados.
 *  · Nunca envía: no hay clic en "enviar" ni tecla Enter. Escribe, lee y abre
 *    vistas de la página (canvas, archivos), nada más. Juan envía a mano.
 *  · Nunca simula un resultado: si algo falla, devuelve el error.
 *
 * Contrato con el lado nativo. ExecuteScriptAsync (WebView2) y
 * evaluateJavascript (Android) devuelven el valor de una expresión pero no
 * esperan una promesa, así que cada operación es un pedido y una consulta:
 *   window.__cc.pedir('{"id":"1","op":"leer","spec":{…}}')  → "ok"
 *   window.__cc.consultar("1")  → '{"estado":"pendiente"}' o
 *                                 '{"estado":"listo","resultado":{…}}' o
 *                                 '{"estado":"error","error":"…"}'
 * El resultado se entrega una vez y se olvida.
 */

/** Cómo se sabe que terminó: un control observable (element-gone) o la quietud del texto (quiescence). */
type Fin = { kind: "element-gone"; selector: string; quiescenceMs: number } | { kind: "quiescence"; quiescenceMs: number };

/** Cómo se escribe en este compositor (lo declara cada spec): los saltos de línea se comportan distinto por editor. */
type Escritura = "insertText" | "pegado" | "lineaSuave" | "lineaParrafo";

type Tipo = "textarea" | "contenteditable";

/** Lo que el script usa de una spec de specs.json. No hay campo de envío: este script no envía. */
interface Spec {
  composer: { selector: string; kind: Tipo };
  escritura: Escritura;
  assistantMessage: { selector: string; pick: "last"; exclude?: string[] };
  canvas?: { mensaje: string; abrir: string; contenido: string; cerrar: string };
  archivos?: { tarjeta: string; titulo: string; iframe: string; contenido: string };
  informeEnIframe?: { turno: string; iframe: string; frameUrl: string; contenido: string };
  completion: Fin;
  timeouts?: { composerMs?: number };
  modelLabel?: { selector: string };
  userMessage?: { selector: string; pick: "last" | "first" };
}

interface Pedido {
  id: string;
  op: "escribir" | "leer" | "leerCompositor" | "chatVacio";
  spec: Spec;
  texto?: string;
}

const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function buscar(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function buscarTodos(selector: string | undefined): Element[] {
  if (!selector) return [];
  try {
    return Array.from(document.querySelectorAll(selector));
  } catch {
    return [];
  }
}

async function esperarElemento(selector: string, ms: number): Promise<Element | null> {
  const hasta = Date.now() + ms;
  for (;;) {
    const el = buscar(selector);
    if (el) return el;
    if (Date.now() > hasta) return null;
    await dormir(120);
  }
}

/** true generando, false terminado, null no observable: sin indicador no se afirma un fin que no se midió. */
function estaGenerando(spec: Spec): boolean | null {
  return spec.completion.kind === "element-gone" ? buscar(spec.completion.selector) !== null : null;
}

/**
 * El texto del compositor con sus saltos de línea. En un contenteditable,
 * textContent pierde los <br>; innerText los respeta, pero da una línea en
 * blanco entre párrafos: si el compositor es una lista de bloques, cada bloque
 * es una línea.
 */
function leerTexto(el: Element, tipo: Tipo): string {
  if (tipo === "textarea") return (el as HTMLTextAreaElement).value ?? "";
  const hijos = Array.from(el.children) as HTMLElement[];
  const esBloque = (h: HTMLElement): boolean => /^(P|DIV|H[1-6]|LI|PRE|BLOCKQUOTE)$/.test(h.tagName);
  if (hijos.length > 0 && hijos.every(esBloque)) return hijos.map((h) => (h.innerText ?? "").replace(/\n$/, "")).join("\n");
  return (el as HTMLElement).innerText ?? "";
}

/** Tramos de hasta `max` caracteres cortados en saltos de línea; concatenados, reconstruyen el texto exacto. */
function tramosDePegado(texto: string, max: number): string[] {
  const tramos: string[] = [];
  let actual = "";
  for (const [i, linea] of texto.split("\n").entries()) {
    const pieza = i === 0 ? linea : `\n${linea}`;
    // Sólo se corta antes de una línea con texto: un tramo que empieza en blanco la perdía.
    if (actual.length > 0 && actual.length + pieza.length > max && linea.length > 0) {
      tramos.push(actual);
      actual = "";
    }
    actual += pieza;
    while (actual.length > max) {
      tramos.push(actual.slice(0, max));
      actual = actual.slice(max);
    }
  }
  if (actual.length > 0) tramos.push(actual);
  return tramos;
}

/**
 * Escribe reemplazando lo que haya, por el camino que los editores ricos
 * procesan de verdad (execCommand dispara beforeinput/input nativos). En un
 * textarea, insertText entero. En un contenteditable: una línea por vez con su
 * salto, o pegado en tramos de 1.000 caracteres (un solo pegado de 92.000 dejó
 * vacío el compositor de claude). Espera hasta 3 s a que el texto asiente.
 */
async function escribirEnCompositor(el: Element, tipo: Tipo, texto: string, escritura: Escritura): Promise<boolean> {
  (el as HTMLElement).focus();
  if (tipo === "textarea") {
    const ta = el as HTMLTextAreaElement;
    ta.select();
    document.execCommand("insertText", false, texto);
    return ta.value === texto;
  }
  const host = el as HTMLElement;
  const seleccion = window.getSelection();
  const rango = document.createRange();
  rango.selectNodeContents(host);
  seleccion?.removeAllRanges();
  seleccion?.addRange(rango);
  if (escritura === "pegado") {
    // El borrado nativo deja un solo párrafo vacío y el pegado arranca al principio de ese párrafo.
    document.execCommand("delete", false);
    const inicio = document.createRange();
    inicio.setStart(host.firstElementChild ?? host, 0);
    inicio.collapse(true);
    seleccion?.removeAllRanges();
    seleccion?.addRange(inicio);
    for (const tramo of tramosDePegado(texto, 1_000)) {
      const datos = new DataTransfer();
      datos.setData("text/plain", tramo);
      host.dispatchEvent(new ClipboardEvent("paste", { clipboardData: datos, bubbles: true, cancelable: true }));
    }
  } else {
    // insertText no reconoce "\n" en un contenteditable: una línea por vez, con su salto.
    const salto = escritura === "lineaParrafo" ? "insertParagraph" : "insertLineBreak";
    const lineas = texto.split("\n");
    lineas.forEach((linea, i) => {
      if (linea.length > 0) document.execCommand("insertText", false, linea);
      if (i < lineas.length - 1) document.execCommand(salto, false);
    });
  }
  const hasta = Date.now() + 3_000;
  for (;;) {
    if (leerTexto(host, tipo).trim() === texto.trim()) return true;
    if (Date.now() > hasta) return false;
    await dormir(100);
  }
}

/**
 * Escribe y espera a que el texto asiente: el largo leído tiene que quedarse
 * quieto 400 ms (un editor con framework sigue aplicando en frames
 * posteriores), con techo de 45 s. Nunca escribe encima de un borrador y nunca envía.
 */
async function escribir(spec: Spec, texto: string) {
  const compositor = await esperarElemento(spec.composer.selector, spec.timeouts?.composerMs ?? 15_000);
  if (!compositor) return { ok: false, error: "compositor no encontrado: no se escribió nada", ms: 0, textoFinal: "", caracteresEscritos: texto.length, caracteresPresentes: 0 };
  const leer = (): string => leerTexto(compositor, spec.composer.kind);
  if (leer().trim().length > 0) {
    return { ok: false, error: "el compositor ya tenía texto: no se escribe encima de un borrador", ms: 0, textoFinal: "", caracteresEscritos: texto.length, caracteresPresentes: 0 };
  }
  const t0 = performance.now();
  await escribirEnCompositor(compositor, spec.composer.kind, texto, spec.escritura);
  let largoPrevio = -1;
  let quietoDesde = 0;
  for (;;) {
    const largo = leer().length;
    if (largo !== largoPrevio) {
      largoPrevio = largo;
      quietoDesde = performance.now();
    } else if (performance.now() - quietoDesde >= 400) break;
    if (performance.now() - t0 > 45_000) break;
    await dormir(120);
  }
  const textoFinal = leer();
  return { ok: true, ms: Math.round(performance.now() - t0), textoFinal, caracteresEscritos: texto.length, caracteresPresentes: textoFinal.length };
}

/** El texto del compositor sin tocarlo, con sus saltos; null si el compositor no está. */
function leerCompositor(spec: Spec): string | null {
  const el = buscar(spec.composer.selector);
  return el ? leerTexto(el, spec.composer.kind) : null;
}

/**
 * Verifica, no asume, que el chat nuevo quedó vacío: cero mensajes de
 * asistente y de usuario. Si la conversación arrastra la respuesta propia, la
 * exclusión de autoevaluación quedaría nominal.
 */
function chatVacio(spec: Spec): boolean {
  return buscarTodos(spec.assistantMessage.selector).length === 0 && buscarTodos(spec.userMessage?.selector).length === 0;
}

function ultimoNodoAsistente(spec: Spec): Element | null {
  const nodos = buscarTodos(spec.assistantMessage.selector);
  return nodos[nodos.length - 1] ?? null;
}

/** El texto del asistente sobre una COPIA, sin style ni script y restando los exclude: la página que Juan ve no se toca. */
function textoDelAsistente(spec: Spec, nodo: Element | null): string {
  if (!nodo) return "";
  const copia = nodo.cloneNode(true) as Element;
  copia.querySelectorAll("style, script").forEach((n) => n.remove());
  for (const selector of spec.assistantMessage.exclude ?? []) {
    try {
      copia.querySelectorAll(selector).forEach((n) => n.remove());
    } catch {
      // un selector inválido se ignora; no rompe la lectura
    }
  }
  return copia.textContent ?? "";
}

/**
 * Cuenta enlaces <a href="http…"> reales subiendo por los ancestros hasta seis
 * niveles: el panel de fuentes suele colgar varios niveles más arriba que la
 * respuesta. Un panel colapsado que no se montó en el DOM no se ve: límite declarado.
 */
function contarEnlacesDeFuente(nodo: Element | null): number {
  let actual = nodo;
  for (let nivel = 0; actual && nivel <= 6; nivel++) {
    const n = actual.querySelectorAll('a[href^="http"]').length;
    if (n > 0) return n;
    actual = actual.parentElement;
  }
  return 0;
}

/**
 * Mistral escribe la respuesta en un "canvas" que no está en el DOM hasta
 * abrirlo: se abre con la última tarjeta del mensaje, se lee y se cierra.
 * Abrir no envía nada; si Juan lo dejó abierto, se lee y se deja abierto.
 */
async function leerCanvas(spec: Spec, nodo: Element | null): Promise<{ texto: string; html: string } | null> {
  const c = spec.canvas;
  const mensaje = c && nodo ? nodo.closest(c.mensaje) : null;
  if (!c || !mensaje) return null;
  const tarjeta = Array.from(mensaje.querySelectorAll(c.abrir)).pop() as HTMLElement | undefined;
  if (!tarjeta) return null;
  const yaAbierto = buscar(c.contenido) !== null;
  try {
    if (!yaAbierto) tarjeta.click();
    const hasta = Date.now() + 8_000;
    let el = buscar(c.contenido);
    while ((!el || (el.textContent ?? "").length === 0) && Date.now() < hasta) {
      await dormir(150);
      el = buscar(c.contenido);
    }
    if (!el) return null;
    const copia = el.cloneNode(true) as Element;
    copia.querySelectorAll("style, script").forEach((n) => n.remove());
    return { texto: copia.textContent ?? "", html: el.outerHTML };
  } finally {
    if (!yaAbierto) (buscar(c.cerrar) as HTMLElement | null)?.click();
  }
}

/**
 * Kimi en modo agente deja en el mensaje sólo las tarjetas de sus archivos; el
 * contenido se monta al abrir cada una, en un iframe del mismo origen. Un
 * archivo que no se pudo leer queda dicho en el texto, nunca se saltea.
 */
async function leerArchivos(spec: Spec, nodo: Element | null): Promise<{ texto: string; html: string; leidos: number; total: number } | null> {
  const a = spec.archivos;
  if (!a || !nodo) return null;
  const tarjetas = Array.from(nodo.querySelectorAll(a.tarjeta)) as HTMLElement[];
  if (tarjetas.length === 0) return null;
  const contenido = (): Element | null => {
    try {
      return (buscar(a.iframe) as HTMLIFrameElement | null)?.contentDocument?.querySelector(a.contenido) ?? null;
    } catch {
      return null;
    }
  };
  const texto = (el: Element): string => ((el as HTMLElement).innerText ?? el.textContent ?? "").trim();
  const partes: string[] = [];
  const htmls: string[] = [];
  let anterior = "";
  let leidos = 0;
  for (const t of tarjetas) {
    const titulo = (t.querySelector(a.titulo)?.textContent ?? "").trim() || "(archivo sin nombre)";
    t.click();
    const hasta = Date.now() + 15_000;
    let el = contenido();
    while ((!el || texto(el).length === 0 || texto(el) === anterior) && Date.now() < hasta) {
      await dormir(200);
      el = contenido();
    }
    if (el && texto(el).length > 0 && texto(el) !== anterior) {
      anterior = texto(el);
      partes.push(`=== ARCHIVO: ${titulo} ===\n${anterior}`);
      htmls.push(el.outerHTML);
      leidos++;
    } else {
      partes.push(`=== ARCHIVO: ${titulo} ===\n(no se pudo leer el contenido de este archivo en 15 s)`);
    }
  }
  return { texto: partes.join("\n\n"), html: htmls.join("\n"), leidos, total: tarjetas.length };
}

/** El mensaje del usuario ("first" en gemini: Deep Research agrega un turno de usuario más); null si no hay. */
function leerMensajeUsuario(spec: Spec): string | null {
  const nodos = buscarTodos(spec.userMessage?.selector);
  const nodo = spec.userMessage?.pick === "first" ? nodos[0] : nodos[nodos.length - 1];
  return nodo ? (nodo.textContent ?? "").trim() || null : null;
}

function leerEtiquetaModelo(spec: Spec): string | null {
  const t = spec.modelLabel ? buscar(spec.modelLabel.selector)?.textContent?.trim() : undefined;
  return t && t.length > 0 && t.length < 120 ? t : null;
}

/**
 * La lectura de la respuesta. El html crudo del subárbol, sin exclude, es el
 * dato canónico: cualquier regla nueva se re-deriva de él sin volver a pedir
 * nada. Con canvas, su texto reemplaza al aviso; los archivos se agregan.
 */
async function leer(spec: Spec) {
  const nodo = ultimoNodoAsistente(spec);
  const canvas = await leerCanvas(spec, nodo);
  const archivos = await leerArchivos(spec, nodo);
  const base = canvas ? canvas.texto : textoDelAsistente(spec, nodo);
  return {
    text: archivos ? `${base}\n\n${archivos.texto}` : base,
    archivos: archivos ? { leidos: archivos.leidos, total: archivos.total } : null,
    userText: leerMensajeUsuario(spec),
    fuentesHref: contarEnlacesDeFuente(nodo),
    html: nodo ? nodo.outerHTML + (canvas ? "\n" + canvas.html : "") + (archivos ? "\n" + archivos.html : "") : null,
    // Sólo si el iframe está en el mismo turno que el último mensaje.
    informeEnIframe: !!(spec.informeEnIframe && nodo?.closest(spec.informeEnIframe.turno)?.querySelector(spec.informeEnIframe.iframe)),
    generating: estaGenerando(spec),
    completionKind: spec.completion.kind,
    quiescenceMs: spec.completion.quiescenceMs,
    modelLabel: leerEtiquetaModelo(spec),
  };
}

type Estado = { estado: "pendiente" } | { estado: "listo"; resultado: unknown } | { estado: "error"; error: string };

interface Puente {
  version: number;
  pedir(json: string): string;
  consultar(id: string): string;
}

(() => {
  const w = window as unknown as { __cc?: Puente };
  if (w.__cc) return; // inyectado dos veces en el mismo documento: se queda el primero
  const pedidos = new Map<string, Estado>();
  const correr = (p: Pedido): Promise<unknown> => {
    switch (p.op) {
      case "escribir":
        return escribir(p.spec, p.texto ?? "");
      case "leer":
        return leer(p.spec);
      case "leerCompositor":
        return Promise.resolve(leerCompositor(p.spec));
      case "chatVacio":
        return Promise.resolve(chatVacio(p.spec));
      default:
        return Promise.reject(new Error(`operacion desconocida: ${String((p as { op: unknown }).op)}`));
    }
  };
  w.__cc = {
    version: 1,
    pedir(json: string): string {
      let p: Pedido;
      try {
        p = JSON.parse(json) as Pedido;
      } catch (e) {
        return `error: el pedido no es JSON (${e instanceof Error ? e.message : String(e)})`;
      }
      pedidos.set(p.id, { estado: "pendiente" });
      correr(p).then(
        (resultado) => pedidos.set(p.id, { estado: "listo", resultado }),
        (e: unknown) => pedidos.set(p.id, { estado: "error", error: e instanceof Error ? e.message : String(e) }),
      );
      return "ok";
    },
    consultar(id: string): string {
      const e = pedidos.get(id);
      if (!e) return JSON.stringify({ estado: "error", error: `pedido desconocido: ${id}` });
      if (e.estado !== "pendiente") pedidos.delete(id);
      return JSON.stringify(e);
    },
  };
})();
