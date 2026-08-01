/**
 * probe.ts — reconocimiento AUTÓNOMO del DOM de un proveedor
 * -----------------------------------------------------------
 * Se activa con `--cc-probe`. Recorre cada vista abierta y emite un esqueleto
 * ESTRUCTURAL de los nodos candidatos a compositor, control de envío y
 * mensaje del asistente. Con eso se derivan las specs que faltan sin pedirle
 * a nadie una captura de DevTools.
 *
 * POR QUÉ EXISTE. La regla de autonomía dice que el agente resuelve por su
 * cuenta y que sólo se escala lo técnicamente imposible o lo que sea una
 * decisión de diseño. Derivar un selector no es ninguna de las dos: es
 * trabajo repetitivo sobre una página que la app ya tiene abierta con la
 * sesión puesta. Lo que faltaba era el instrumento, no el permiso.
 *
 * LÍMITES, y son duros:
 *  · Sólo atributos de una lista blanca ESTRUCTURAL. Nunca cookies, tokens,
 *    headers de autenticación, `localStorage` ni `sessionStorage`.
 *  · El texto se recorta a 80 caracteres y existe sólo para reconocer un
 *    nodo, no para llevarse contenido.
 *  · No escribe, no navega, no envía nada. La ÚNICA excepción —decisión de
 *    Juan, no supuesta— es abrir el propio desplegable del selector de
 *    modelo cuando ningún atributo ni texto en reposo lo delata (pasa en
 *    Claude): un clic en el disparador, lectura del ítem resaltado, y cierre
 *    con Escape antes de devolver el control. Nunca hace clic en nada que no
 *    sea ese disparador puntual.
 *
 * SOBRE SHADOW DOM. Un `querySelector` desde `document` no cruza un shadow
 * root. El sondeo cuenta los roots ABIERTOS y busca dentro de ellos; si un
 * candidato aparece únicamente ahí, el informe lo marca con `via: "shadow"`.
 * Si el compositor no aparece por ningún lado y hay roots cerrados, eso SÍ es
 * una decisión de diseño y se escala en vez de improvisar.
 */

export interface Candidato {
  /** "document" si `document.querySelector` lo alcanza; "shadow" si sólo vive dentro de un shadow root abierto. */
  via: "document" | "shadow";
  /** Selector propuesto, construido con lo más estable que tenga el nodo. */
  selector: string;
  tag: string;
  /** Atributos estructurales únicamente (lista blanca). */
  attrs: Record<string, string>;
  /** Cuántos nodos matchea ese selector: si no es 1, el selector todavía no sirve. */
  matches: number;
  muestra: string;
}

export interface ExperimentoModelo {
  disparador: Candidato;
  itemMenu: Candidato;
  disparadorTextoAntes: string;
  disparadorTextoDespues: string;
}

export interface SondeoProveedor {
  id: string;
  url: string;
  titulo: string;
  shadowRootsAbiertos: number;
  compositor: Candidato[];
  envio: Candidato[];
  asistente: Candidato[];
  etiquetaModelo: Candidato[];
  /**
   * Sólo presente cuando `etiquetaModelo` quedó vacío por los dos métodos de
   * sólo-lectura: registra qué encontró el experimento de abrir el
   * desplegable (ver LÍMITES arriba). `null` si tampoco eso encontró nada.
   */
  experimentoModelo?: ExperimentoModelo | null;
  error?: string;
}

/**
 * El sondeo corre en el mundo principal de la página. Se manda como fuente y
 * no vía preload a propósito: es una herramienta de diagnóstico, no parte del
 * contrato del proveedor, y no tiene por qué vivir en el preload que corre en
 * cada turno real.
 */
const FUENTE_SONDEO = `(async () => {
  const ATTRS_OK = ["id","class","data-testid","data-test-id","data-message-author-role","aria-label","role","contenteditable","placeholder","name","type","enterkeyhint"];
  const CAP_TEXTO = 80;
  const CAP_CANDIDATOS = 6;

  const raices = [document];
  let shadowAbiertos = 0;
  for (const el of document.querySelectorAll("*")) {
    if (el.shadowRoot) { shadowAbiertos++; raices.push(el.shadowRoot); }
  }

  const attrsDe = (el) => {
    const out = {};
    for (const a of ATTRS_OK) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v != null && v !== "") out[a] = v.slice(0, 120);
    }
    return out;
  };

  /** Selector propuesto: id > data-testid > aria-label > tag+primera clase. */
  const selectorDe = (el) => {
    const id = el.getAttribute("id");
    if (id && /^[A-Za-z][\\w-]*$/.test(id)) return "#" + id;
    const dt = el.getAttribute("data-testid");
    if (dt) return el.tagName.toLowerCase() + '[data-testid="' + dt + '"]';
    const dti = el.getAttribute("data-test-id");
    if (dti) return el.tagName.toLowerCase() + '[data-test-id="' + dti + '"]';
    const rol = el.getAttribute("data-message-author-role");
    if (rol) return '[data-message-author-role="' + rol + '"]';
    const al = el.getAttribute("aria-label");
    if (al) return el.tagName.toLowerCase() + '[aria-label="' + al + '"]';
    const cls = (el.getAttribute("class") || "").trim().split(/\\s+/).filter(Boolean);
    return el.tagName.toLowerCase() + (cls.length ? "." + cls.slice(0, 2).join(".") : "");
  };

  const candidato = (el, via) => {
    const sel = selectorDe(el);
    let matches = 0;
    try { matches = document.querySelectorAll(sel).length; } catch (e) { matches = -1; }
    return {
      via: via,
      selector: sel,
      tag: el.tagName.toLowerCase(),
      attrs: attrsDe(el),
      matches: matches,
      muestra: (el.textContent || "").trim().slice(0, CAP_TEXTO),
    };
  };

  const juntar = (selectores) => {
    const vistos = new Set();
    const out = [];
    for (const raiz of raices) {
      const via = raiz === document ? "document" : "shadow";
      for (const sel of selectores) {
        let nodos = [];
        try { nodos = Array.from(raiz.querySelectorAll(sel)); } catch (e) { continue; }
        for (const el of nodos) {
          if (vistos.has(el)) continue;
          vistos.add(el);
          out.push(candidato(el, via));
          if (out.length >= CAP_CANDIDATOS) return out;
        }
      }
    }
    return out;
  };

  /**
   * Respaldo para etiquetaModelo cuando ningún atributo delata al selector de
   * modelo: busca por el NOMBRE del modelo en el texto de CUALQUIER elemento
   * (no sólo botones, porque el trigger puede ser un div o span), y se queda
   * con el más profundo de cada rama para no reportar el contenedor entero.
   * Claude.ai no expone "model" en ningún atributo de su selector.
   */
  const porNombreDeModelo = () => {
    const patron = /\\b(haiku|sonnet|opus|gemini|gpt|glm)\\b/i;
    const out = [];
    for (const raiz of raices) {
      const via = raiz === document ? "document" : "shadow";
      const candidatosEl = Array.from(raiz.querySelectorAll("*")).filter((el) => {
        const t = (el.textContent || "").trim();
        return t.length > 0 && t.length < 60 && patron.test(t);
      });
      for (const el of candidatosEl) {
        if (out.length >= CAP_CANDIDATOS) break;
        const tieneHijoMatch = candidatosEl.some((otro) => otro !== el && el.contains(otro));
        if (!tieneHijoMatch) out.push(candidato(el, via));
      }
    }
    return out;
  };

  /**
   * ÚLTIMO RECURSO, sólo si los dos métodos de sólo-lectura no encontraron
   * nada: abre el desplegable de un disparador candidato, lee el ítem
   * resaltado y cierra con Escape. Acotado a disparadores con aria-haspopup
   * "menu"/"listbox" —nunca botones de envío ni toggles— y se detiene en el
   * primero que revele un ítem con nombre de modelo.
   */
  const explorarMenuModelo = async () => {
    const patron = /\\b(haiku|sonnet|opus)\\b/i;
    const espera = (ms) => new Promise((r) => setTimeout(r, ms));
    const disparadores = Array.from(
      document.querySelectorAll('button[aria-haspopup="menu"], button[aria-haspopup="listbox"]'),
    ).slice(0, 5);
    for (const btn of disparadores) {
      const textoAntes = (btn.textContent || "").trim().slice(0, CAP_TEXTO);
      try { btn.click(); } catch (e) { continue; }
      await espera(350);
      const menu = document.querySelector('[role="menu"], [role="listbox"]');
      let resultado = null;
      if (menu) {
        const nodosMenu = Array.from(menu.querySelectorAll("*"));
        const item = nodosMenu.find((el) => {
          const t = (el.textContent || "").trim();
          if (t.length === 0 || t.length >= CAP_TEXTO || !patron.test(t)) return false;
          return !nodosMenu.some((otro) => otro !== el && el.contains(otro) && patron.test((otro.textContent || "").trim()));
        });
        if (item) {
          resultado = {
            disparador: candidato(btn, "document"),
            itemMenu: candidato(item, "document"),
            disparadorTextoAntes: textoAntes,
            disparadorTextoDespues: (btn.textContent || "").trim().slice(0, CAP_TEXTO),
          };
        }
      }
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      btn.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await espera(150);
      if (resultado) return resultado;
    }
    return null;
  };

  const etiquetaModeloBase = juntar(['button[aria-label*="odel"]', '[class*="model-selector"]', '[data-testid*="model"]']);
  const etiquetaModeloTexto = etiquetaModeloBase.length > 0 ? [] : porNombreDeModelo();
  const sinNada = etiquetaModeloBase.length === 0 && etiquetaModeloTexto.length === 0;
  const experimentoModelo = sinNada ? await explorarMenuModelo() : undefined;

  return {
    url: location.origin + location.pathname,
    titulo: document.title.slice(0, 120),
    shadowRootsAbiertos: shadowAbiertos,
    compositor: juntar(['textarea', 'div[contenteditable="true"]', '[role="textbox"]']),
    envio: juntar(['button[data-testid*="send"]', 'button[aria-label*="end"]', 'button[type="submit"]', 'button:has(svg)']),
    asistente: juntar(['[data-message-author-role="assistant"]', '[class*="assistant"]', '[class*="model-response"]', '[class*="markdown"]']),
    etiquetaModelo: etiquetaModeloBase.length > 0 ? etiquetaModeloBase : etiquetaModeloTexto,
    experimentoModelo: experimentoModelo,
  };
})()`;

export async function sondear(
  vistas: { id: string; ejecutar: (fuente: string) => Promise<unknown> }[],
): Promise<SondeoProveedor[]> {
  const crudos = await Promise.allSettled(vistas.map((v) => v.ejecutar(FUENTE_SONDEO)));
  return vistas.map((v, i) => {
    const r = crudos[i]!;
    if (r.status !== "fulfilled") {
      return {
        id: v.id,
        url: "",
        titulo: "",
        shadowRootsAbiertos: 0,
        compositor: [],
        envio: [],
        asistente: [],
        etiquetaModelo: [],
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      };
    }
    // El `id` va DESPUÉS del spread: la página no lo conoce y si viniera con
    // uno, el nuestro es el bueno.
    return { ...(r.value as Omit<SondeoProveedor, "id">), id: v.id };
  });
}
