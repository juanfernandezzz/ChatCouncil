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
 *  · **NUNCA envía.** Ni un clic en un control de envío, ni una tecla, ni
 *    navegación. Esa es la línea dura, y está puesta donde importa: enviar
 *    consume cuota, deja un mensaje en la conversación de Juan y no se
 *    deshace. Escribir en un cuadro de texto no hace nada de eso.
 *
 *    El límite original decía "no escribe", y esa formulación resultó
 *    DEMASIADO GRUESA. El sondeo miraba la página siempre EN REPOSO, con el
 *    compositor vacío, y varios controles no existen en ese estado: Gemini
 *    muestra el micrófono en lugar del botón de enviar mientras no hay texto.
 *    O sea que el instrumento no podía observar el momento exacto en que
 *    ocurren los fallos que tiene que diagnosticar. Una lista vacía en `envio`
 *    nunca probó ausencia; probaba que en reposo no estaba.
 *
 *    Por eso hay un modo `--cc-probe-escribe`, OPT-IN y nunca por defecto,
 *    que escribe un marcador neutro, observa, y **limpia el compositor antes
 *    de devolver**. El modo por defecto sigue siendo de sólo lectura: la
 *    garantía no se debilita en silencio, se elige en la línea de comandos.
 *
 *    Hubo una excepción y se revirtió, porque el motivo por el que se aprobó
 *    resultó falso. Se había agregado un experimento que abría el desplegable
 *    del selector de modelo, justificado en que Claude no exponía "model" en
 *    ningún atributo. No era cierto: el selector que terminó derivándose es
 *    `button[data-testid="model-selector-dropdown"]`, que el patrón de
 *    sólo-lectura `[data-testid*="model"]` ya matcheaba. Lo que pasaba en
 *    realidad era de TIEMPO —a los 12 s ese botón todavía no existía en el
 *    DOM— y se arregló esperando 20 s. Quedaba entonces código que hacía clic
 *    sobre la sesión real de Juan, disparado por una carrera y no por una
 *    ausencia. Lección: cuando el disparador de una excepción es "no encontré
 *    nada", primero hay que descartar que sea "todavía no cargó".
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
   * Con qué estado del compositor se tomó la muestra. Sin esto, un `envio`
   * vacío es ambiguo entre "no existe" y "todavía no aparece", que fue
   * exactamente la confusión que costó una ronda.
   */
  estadoCompositor: "reposo" | "con-texto";
  /** Sólo en modo escritura: si el marcador llegó a entrar en el editor. */
  escrituraAceptada?: boolean;
  /**
   * Sólo en modo escritura: el compositor quedó SIN el marcador después de
   * limpiar. Se mide y se reporta en vez de prometerse en un comentario — si
   * alguna vez sale `false`, el sondeo dejó basura en la sesión de Juan y hay
   * que saberlo en la misma corrida, no después.
   */
  compositorLimpio?: boolean;
  error?: string;
}

/**
 * El sondeo corre en el mundo principal de la página. Se manda como fuente y
 * no vía preload a propósito: es una herramienta de diagnóstico, no parte del
 * contrato del proveedor, y no tiene por qué vivir en el preload que corre en
 * cada turno real.
 */
const FUENTE_SONDEO = `async (SELECTOR_COMPOSITOR, MARCADOR) => {
  const ATTRS_OK = ["id","class","data-testid","data-test-id","data-message-author-role","aria-label","role","contenteditable","placeholder","name","type","enterkeyhint"];
  const CAP_TEXTO = 80;
  const CAP_CANDIDATOS = 6;

  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * Escritura de sondeo. Pone un marcador neutro para que aparezcan los
   * controles que sólo existen con texto, y LIMPIA al final. No envia: no
   * hace clic en ningun control y no despacha ninguna tecla.
   */
  let escrituraAceptada;
  const limpiar = [];
  if (SELECTOR_COMPOSITOR && MARCADOR) {
    const c = document.querySelector(SELECTOR_COMPOSITOR);
    if (c) {
      c.focus();
      if (c.tagName === "TEXTAREA" || c.tagName === "INPUT") {
        const previo = c.value;
        c.value = MARCADOR;
        c.dispatchEvent(new Event("input", { bubbles: true }));
        escrituraAceptada = c.value === MARCADOR;
        limpiar.push(() => { c.value = previo; c.dispatchEvent(new Event("input", { bubbles: true })); });
      } else {
        const previo = c.innerHTML;
        c.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: MARCADOR }));
        if (!(c.textContent || "").includes(MARCADOR)) {
          c.textContent = MARCADOR;
          c.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: MARCADOR }));
        }
        escrituraAceptada = (c.textContent || "").includes(MARCADOR);
        limpiar.push(() => { c.innerHTML = previo; c.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" })); });
      }
      // Dar tiempo a que el framework reaccione y monte los controles.
      await dormir(1500);
    }
  }

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

  // Los patrones de arriba son deliberadamente REDUNDANTES y neutrales en
  // idioma y en framework. Los originales fallaban con Gemini por tres cosas
  // a la vez: no usa data-testid con "send", su aria-label esta en espanol
  // ("Enviar" no contiene "end"), y sus iconos son <mat-icon> con ligadura,
  // no <svg>. Tres suposiciones inglesas y de React en un archivo que existe
  // justamente para no suponer.
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
   * Cubre el caso en que el disparador es un div o un span sin ningún
   * atributo que lo delate. OJO: no es el caso de Claude, aunque durante la
   * derivación lo pareció — ahí el botón sí tiene data-testid, sólo que
   * aparece tarde. Ver el bloque de LÍMITES arriba.
   *
   * (Sin comillas invertidas acá: este bloque vive DENTRO del template
   * literal de FUENTE_SONDEO y una comilla invertida lo cortaría en dos.)
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

  // Dos vías, ambas de SÓLO LECTURA: primero por atributo, y si eso no da
  // nada, por el nombre del modelo en el texto. No hay una tercera.
  const etiquetaModeloBase = juntar(['button[aria-label*="odel"]', '[class*="model-selector"]', '[data-testid*="model"]']);
  const etiquetaModeloTexto = etiquetaModeloBase.length > 0 ? [] : porNombreDeModelo();

  const salida = {
    estadoCompositor: SELECTOR_COMPOSITOR && MARCADOR ? "con-texto" : "reposo",
    escrituraAceptada: escrituraAceptada,
    url: location.origin + location.pathname,
    titulo: document.title.slice(0, 120),
    shadowRootsAbiertos: shadowAbiertos,
    compositor: juntar(['textarea', 'div[contenteditable="true"]', '[role="textbox"]']),
    envio: juntar([
      'button[data-testid*="send"]',
      'button[class*="send"]',
      'button[aria-label*="end"]',
      'button[aria-label*="nvia"]',
      'button[aria-label*="nviar"]',
      'button[type="submit"]',
      'button:has(svg)',
      'button:has(mat-icon)',
      'button:has(i)',
      '[role="button"][aria-label*="nvia"]',
    ]),
    asistente: juntar(['[data-message-author-role="assistant"]', '[class*="assistant"]', '[class*="model-response"]', '[class*="markdown"]']),
    etiquetaModelo: etiquetaModeloBase.length > 0 ? etiquetaModeloBase : etiquetaModeloTexto,
  };

  // Devolver el compositor como estaba. Se limpia SIEMPRE, incluso si algo de
  // arriba fallo, para no dejar un borrador colgado en la sesion de Juan.
  for (const f of limpiar) { try { f(); } catch (e) { /* no hay nada mejor que hacer */ } }

  // Y se COMPRUEBA que quedo limpio. Una garantia que no se mide no es una
  // garantia: es una intencion.
  if (SELECTOR_COMPOSITOR && MARCADOR) {
    await dormir(200);
    const c2 = document.querySelector(SELECTOR_COMPOSITOR);
    const resto = c2 ? (c2.value !== undefined ? c2.value : c2.textContent) || "" : "";
    salida.compositorLimpio = !resto.includes(MARCADOR);
  }

  return salida;
}`;

/** Marcador neutro. No es una instruccion: es texto para que aparezcan los controles. */
const MARCADOR = "sondeo";

export async function sondear(
  vistas: {
    id: string;
    ejecutar: (fuente: string) => Promise<unknown>;
    /**
     * Sólo se pasa en modo escritura, y sólo para proveedores que YA tienen
     * spec: se escribe en el selector derivado, no en uno adivinado. Sin esto,
     * el sondeo no escribe nada.
     */
    composerSelector?: string;
  }[],
): Promise<SondeoProveedor[]> {
  const crudos = await Promise.allSettled(
    vistas.map((v) => {
      const args = v.composerSelector
        ? `${JSON.stringify(v.composerSelector)}, ${JSON.stringify(MARCADOR)}`
        : "null, null";
      return v.ejecutar(`(${FUENTE_SONDEO})(${args})`);
    }),
  );
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
        estadoCompositor: v.composerSelector ? "con-texto" : "reposo",
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      };
    }
    // El `id` va DESPUÉS del spread: la página no lo conoce y si viniera con
    // uno, el nuestro es el bueno.
    return { ...(r.value as Omit<SondeoProveedor, "id">), id: v.id };
  });
}
