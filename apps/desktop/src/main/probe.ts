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
  /** `muestra` sin glifos de fuente de iconos ni espacios repetidos. */
  muestraLimpia?: string;
}

/**
 * Una forma de escribir en el compositor, MEDIDA.
 *
 * Existe porque `writePrompt` se confirma a sí mismo (§7.22): escribe
 * `textContent` y verifica leyendo `textContent`, así que siempre da
 * verdadero, mientras el editor —que mantiene su propio modelo interno— no se
 * entera y nunca habilita el control de envío. El síntoma que se vio en
 * producción fue "el control de envío NUNCA aparecio en el DOM".
 *
 * Por eso acá el criterio de éxito NO es el eco. Es un efecto que produce el
 * EDITOR y que nosotros no tocamos: cuántos controles de envío hay y cuántos
 * están habilitados antes y después de escribir. Si el editor registró el
 * texto, ese número cambia; si sólo pintamos caracteres en el DOM, no.
 */
export interface EscrituraMetodo {
  metodo: "execCommand" | "paste" | "textContent";
  /** El eco: el texto figura en el compositor. Necesario pero NO suficiente. */
  textoPresente: boolean;
  envioNodosAntes: number;
  envioHabilitadosAntes: number;
  envioNodosDespues: number;
  envioHabilitadosDespues: number;
  /**
   * Milisegundos desde la escritura hasta que el control de envio APARECE en
   * el DOM. `null` significa "no aparecio dentro de `envioLimiteMs`", que NO
   * es lo mismo que "no existe": es la distincion que la medicion por
   * instantanea colapsaba.
   */
  envioApareceMs: number | null;
  /** Idem, hasta que queda HABILITADO por encima del conteo previo. */
  envioHabilitaMs: number | null;
  envioLimiteMs: number;
  /** Mutaciones registradas FUERA del compositor: cambios que produjo el editor, no nosotros. */
  mutacionesFuera: number;
  /** El compositor quedó sin el marcador después de este intento. */
  limpio: boolean;
}

export interface SondeoProveedor {
  id: string;
  url: string;
  titulo: string;
  /** Ancho x alto REAL del panel al tomar la muestra. §7.29: es variable de la prueba. */
  panel: string;
  shadowRootsAbiertos: number;
  compositor: Candidato[];
  envio: Candidato[];
  asistente: Candidato[];
  /** Por ATRIBUTO. Vacío significa "ningún atributo lo delata", no "no existe". */
  etiquetaModeloPorAtributo: Candidato[];
  /**
   * Por TEXTO. Se corre SIEMPRE, no sólo cuando la vía por atributo falla: son
   * dos diagnósticos distintos y colapsarlos esconde el caso en que el atributo
   * encuentra un botón cuyo texto no sirve. Cuántos nodos descartó el filtro va
   * en `etiquetaModeloDescartados`.
   */
  etiquetaModeloPorTexto: Candidato[];
  etiquetaModeloDescartados: number;
  /** Milisegundos desde la navegación hasta el momento de la muestra. */
  msDesdeNavegacion?: number;
  readyState?: string;
  /** Sólo en modo escritura: las tres formas, medidas una por una. */
  escrituraPorMetodo?: EscrituraMetodo[];
  escrituraOmitida?: string;
  /** Había un marcador de una corrida anterior y esta corrida lo limpió. */
  restoLimpiado?: boolean;
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
const FUENTE_SONDEO = `async (SELECTOR_COMPOSITOR, SELECTOR_ENVIO, MARCADOR) => {
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
  let escrituraPorMetodo;
  let escrituraOmitida;
  let restoLimpiado = false;
  let metodoQueSirvio;
  const limpiar = [];

  const esTextarea = (c) => c.tagName === "TEXTAREA" || c.tagName === "INPUT";
  const leerCompositor = (c) => (esTextarea(c) ? (c.value || "") : (c.textContent || ""));

  /**
   * Cuenta controles de envio y cuantos estan accionables. NO hace clic: sólo
   * cuenta. Es el efecto del EDITOR que sirve de criterio, en vez del eco.
   */
  const medirEnvio = () => {
    if (!SELECTOR_ENVIO) return { nodos: -1, habilitados: -1 };
    let nodos = [];
    try { nodos = Array.from(document.querySelectorAll(SELECTOR_ENVIO)); } catch (e) { return { nodos: -1, habilitados: -1 }; }
    let hab = 0;
    for (const el of nodos) {
      if (!el.disabled && el.getAttribute("aria-disabled") !== "true") hab++;
    }
    return { nodos: nodos.length, habilitados: hab };
  };

  const vaciar = (c) => {
    try {
      c.focus();
      if (esTextarea(c)) {
        c.value = "";
        c.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        // Primero por la via del propio editor, que mantiene su modelo interno
        // en sincronia; despues, a la fuerza, por si esa via no hizo nada.
        document.execCommand("selectAll", false);
        document.execCommand("delete", false);
        if ((c.textContent || "").length > 0) {
          c.innerHTML = "";
          c.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
        }
      }
    } catch (e) { /* se reporta como limpio:false, no se rompe el sondeo */ }
  };

  /** Escribe por UNA forma concreta. Ninguna envia: ni clic ni tecla. */
  const escribirPor = (c, metodo, texto) => {
    c.focus();
    if (metodo === "execCommand") {
      document.execCommand("insertText", false, texto);
      return;
    }
    if (metodo === "paste") {
      const dt = new DataTransfer();
      dt.setData("text/plain", texto);
      c.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }));
      return;
    }
    // "textContent": la forma que usa hoy writePrompt, incluida a proposito
    // como termino de comparacion. Si esta es la unica que da textoPresente y
    // ninguna habilita el envio, el diagnostico queda demostrado.
    if (esTextarea(c)) {
      c.value = texto;
      c.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      c.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: texto }));
      if (!(c.textContent || "").includes(texto)) {
        c.textContent = texto;
        c.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: texto }));
      }
    }
  };

  if (SELECTOR_COMPOSITOR && MARCADOR) {
    const c = document.querySelector(SELECTOR_COMPOSITOR);
    // Si el compositor YA tenia texto, no se toca: seria un borrador de Juan y
    // la medicion lo borraria. Se omite y se dice por que, en vez de destruirlo
    // en silencio.
    const previo = c ? leerCompositor(c).trim() : "";
    if (c && previo.length > 0 && previo !== MARCADOR) {
      escrituraOmitida = "el compositor tenia texto previo que NO es nuestro marcador: no se midio para no borrar un borrador de Juan";
    } else if (c) {
      // Si lo previo es NUESTRO marcador, es basura de una corrida anterior:
      // se limpia y se sigue. Abstenerse ahi costaba una muestra por nada.
      if (previo === MARCADOR) restoLimpiado = true;
      escrituraPorMetodo = [];
      vaciar(c);
      await dormir(400);

      for (const metodo of ["execCommand", "paste", "textContent"]) {
        const antes = medirEnvio();
        // Mutaciones FUERA del compositor: con execCommand y paste no tocamos
        // el DOM nosotros, asi que todo cambio es del editor. Con textContent
        // si lo tocamos, y por eso se excluye el subarbol del compositor.
        let mutacionesFuera = 0;
        const obs = new MutationObserver((ms) => {
          for (const m of ms) {
            const t = m.target;
            const nodo = t && t.nodeType === 1 ? t : (t ? t.parentNode : null);
            if (nodo && !c.contains(nodo)) mutacionesFuera++;
          }
        });
        obs.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: false });

        const t0 = performance.now();
        try { escribirPor(c, metodo, MARCADOR); } catch (e) { /* se reporta abajo */ }

        // MEDICION POR LATENCIA, no por instantanea.
        //
        // La version anterior dormia 1500 ms y miraba una sola vez. Con eso, un
        // control que tarda 3 segundos en montarse se informa como "0 nodos: no
        // existe", que es indistinguible de "no existe nunca". Las seis
        // corridas del 2026-08-02 dieron 0/1/0 a panel angosto y 1/1/1 a panel
        // ancho MIDIENDO EN UN INSTANTE FIJO: con n=3 por condicion eso no
        // separa "el ancho lo causa" de "es intermitente en los dos y ancho
        // tuvo suerte". Lo que hay que medir es CUANTO TARDA en aparecer, y
        // eso convierte un binario en una distribucion.
        let apareceMs = null;
        let habilitaMs = null;
        const limite = 15000;
        while (performance.now() - t0 < limite) {
          const m = medirEnvio();
          if (apareceMs === null && m.nodos > 0) apareceMs = Math.round(performance.now() - t0);
          if (habilitaMs === null && m.habilitados > antes.habilitados) habilitaMs = Math.round(performance.now() - t0);
          if (apareceMs !== null && habilitaMs !== null) break;
          await dormir(250);
        }
        // Piso comun para que las mutaciones y el estado final sean comparables
        // entre metodos aunque uno haya salido del bucle enseguida.
        const transcurrido = performance.now() - t0;
        if (transcurrido < 1500) await dormir(1500 - transcurrido);

        obs.disconnect();
        const textoPresente = leerCompositor(c).includes(MARCADOR);
        const despues = medirEnvio();
        vaciar(c);
        await dormir(400);
        const limpio = !leerCompositor(c).includes(MARCADOR);

        escrituraPorMetodo.push({
          metodo: metodo,
          textoPresente: textoPresente,
          envioNodosAntes: antes.nodos,
          envioHabilitadosAntes: antes.habilitados,
          envioNodosDespues: despues.nodos,
          envioHabilitadosDespues: despues.habilitados,
          // null = no aparecio dentro del limite. NO es lo mismo que "no existe".
          envioApareceMs: apareceMs,
          envioHabilitaMs: habilitaMs,
          envioLimiteMs: limite,
          mutacionesFuera: mutacionesFuera,
          limpio: limpio,
        });

        // "Sirvio" quiere decir: el texto entro Y el editor reacciono
        // habilitando un control que antes no estaba habilitado. El eco solo
        // no alcanza — es exactamente el error que se esta midiendo.
        if (!metodoQueSirvio && textoPresente && habilitaMs !== null) {
          metodoQueSirvio = metodo;
        }
      }

      // Para la cosecha de candidatos hace falta que el compositor tenga texto:
      // hay controles que sólo existen en ese estado. Se reescribe con la forma
      // que el editor acepto; si ninguna reacciono, con la que al menos dejo el
      // texto a la vista.
      const paraCosechar = metodoQueSirvio || "textContent";
      try { escribirPor(c, paraCosechar, MARCADOR); } catch (e) { /* idem */ }
      await dormir(1200);
      escrituraAceptada = leerCompositor(c).includes(MARCADOR);
      limpiar.push(() => { vaciar(c); });
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

  /**
   * Selector propuesto: data-testid > data-test-id > id ESTABLE > aria-label >
   * tag+clase.
   *
   * El id iba primero y estaba al reves para este dominio. Medido el
   * 2026-08-02: el boton de modelo de claude tiene
   * data-testid="model-selector-dropdown" —estable, y ya en la spec— pero el
   * sondeo proponia "#base-ui-_r_8l_", un id generado por la libreria de
   * componentes que cambia en cada render. Lo mismo en chatgpt con
   * "#radix-_r_3_" contra data-testid="model-switcher-dropdown-button".
   * Derivar de esos ids habria dado selectores que fallan en la corrida
   * siguiente.
   *
   * Y hay un id peor todavia: el de glm es "#model-selector-glm-4_7-button",
   * que lleva la VERSION DEL MODELO adentro. Un selector asi se rompe
   * exactamente cuando el modelo cambia, que es el evento que la Fase 2
   * existe para detectar.
   */
  const ID_INESTABLE = /(^|[-_])(radix|base-ui|headlessui|mui|chakra|reach|rc)[-_]|_r_|::/i;
  const ID_CON_VERSION = /\\d+[._]\\d+/;
  const selectorDe = (el) => {
    const dt0 = el.getAttribute("data-testid");
    if (dt0) return el.tagName.toLowerCase() + '[data-testid="' + dt0 + '"]';
    const dti0 = el.getAttribute("data-test-id");
    if (dti0) return el.tagName.toLowerCase() + '[data-test-id="' + dti0 + '"]';
    const id = el.getAttribute("id");
    if (id && /^[A-Za-z][\\w-]*$/.test(id) && !ID_INESTABLE.test(id) && !ID_CON_VERSION.test(id)) return "#" + id;
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
      // El texto visible viene con glifos de fuente de iconos pegados: el de
      // claude salio como "Haiku 4.5\\ue027". El aria-label venia limpio
      // ("Modelo: Haiku 4.5"), asi que se informan los dos y se elige despues.
      muestraLimpia: (el.textContent || "").replace(/[\\uE000-\\uF8FF]/g, "").replace(/\\s+/g, " ").trim().slice(0, CAP_TEXTO),
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
  let compositorEl = null;
  try {
    compositorEl = SELECTOR_COMPOSITOR
      ? document.querySelector(SELECTOR_COMPOSITOR)
      : document.querySelector('textarea, div[contenteditable="true"], [role="textbox"]');
  } catch (e) { compositorEl = null; }

  let descartadosPorFiltro = 0;
  const porNombreDeModelo = () => {
    // DOS condiciones a la vez, y esa es la correccion. La version anterior
    // pedia solo una familia de modelo, y en la pagina de Gemini la palabra
    // "Gemini" esta en el titulo, en el logo, en el menu lateral y en el texto
    // gris del compositor: devolvia ruido, no la etiqueta. Ahora hace falta
    // ademas algo con forma de VERSION o de variante.
    const familia = /(gpt|chatgpt|gemini|claude|glm|qwen|kimi|deepseek|grok)/i;
    // Cada variante con LIMITES DE PALABRA. Sin ellos "mini" casa dentro de
    // "Gemini" y el filtro deja pasar la palabra "Gemini" sola como si fuera
    // una etiqueta de modelo: paso el 2026-08-02 y devolvio tres candidatos
    // inutiles, incluido el titulo accesible de la pagina.
    const version = /(\\d|\\b(haiku|sonnet|opus|flash|pro|thinking|mini|turbo|nano|air|plus|max|lite|preview)\\b)/i;
    const out = [];
    for (const raiz of raices) {
      const via = raiz === document ? "document" : "shadow";
      const candidatosEl = Array.from(raiz.querySelectorAll("*")).filter((el) => {
        const t = (el.textContent || "").trim();
        if (t.length === 0 || t.length > 40) return false;
        if (!familia.test(t)) return false;
        if (!version.test(t)) { descartadosPorFiltro++; return false; }
        // El compositor y sus ancestros quedan fuera: el texto gris de
        // marcador de posicion nombra al modelo y no es la etiqueta.
        if (compositorEl && (el.contains(compositorEl) || compositorEl.contains(el))) { descartadosPorFiltro++; return false; }
        // El titulo de la pagina repetido en un <title> o en un heading tampoco.
        if (el.tagName === "TITLE" || t === document.title.trim()) { descartadosPorFiltro++; return false; }
        return true;
      });
      for (const el of candidatosEl) {
        if (out.length >= CAP_CANDIDATOS) break;
        const tieneHijoMatch = candidatosEl.some((otro) => otro !== el && el.contains(otro));
        if (!tieneHijoMatch) out.push(candidato(el, via));
      }
    }
    return out;
  };

  // Dos vias, ambas de SOLO LECTURA, y las dos se corren SIEMPRE. Antes la de
  // texto sólo corria si la de atributo salia vacia, y eso escondia el caso
  // real: que un atributo encuentre un boton cuyo texto no sirve de etiqueta.
  // Son dos diagnosticos distintos y se informan por separado.
  const etiquetaModeloPorAtributo = juntar(['button[aria-label*="odel"]', 'button[aria-label*="odelo"]', '[class*="model-selector"]', '[class*="model-switcher"]', '[data-testid*="model"]', '[data-test-id*="model"]']);
  const etiquetaModeloPorTexto = porNombreDeModelo();

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
    etiquetaModeloPorAtributo: etiquetaModeloPorAtributo,
    etiquetaModeloPorTexto: etiquetaModeloPorTexto,
    etiquetaModeloDescartados: descartadosPorFiltro,
    // Cuanto hacia que la pagina habia navegado cuando se tomo la muestra, y en
    // que estado estaba. Si los fallos se concentran en valores bajos, el
    // problema es una carrera con el montaje de la pagina y no el ancho.
    msDesdeNavegacion: Math.round(performance.now()),
    readyState: document.readyState,
    escrituraPorMetodo: escrituraPorMetodo,
    escrituraOmitida: escrituraOmitida,
    /** Habia un marcador nuestro de una corrida anterior y se limpio. */
    restoLimpiado: restoLimpiado,
  };

  // Devolver el compositor como estaba. Se limpia SIEMPRE, incluso si algo de
  // arriba fallo, para no dejar un borrador colgado en la sesion de Juan.
  for (const f of limpiar) { try { f(); } catch (e) { /* no hay nada mejor que hacer */ } }

  // Y se COMPRUEBA que quedo limpio. Una garantia que no se mide no es una
  // garantia: es una intencion.
  if (SELECTOR_COMPOSITOR && MARCADOR) {
    await dormir(300);
    const c2 = document.querySelector(SELECTOR_COMPOSITOR);
    salida.compositorLimpio = c2 ? !leerCompositor(c2).includes(MARCADOR) : true;
  }

  return salida;
}`;

/** Marcador neutro. No es una instruccion: es texto para que aparezcan los controles. */
/**
 * Marcador de sondeo. Era la palabra "sondeo" a secas — una palabra española
 * común, que ni el propio sondeo podía distinguir de un borrador de Juan. El
 * 2026-08-02 quedó uno olvidado en el compositor de ChatGPT y la corrida
 * siguiente se abstuvo de medir por no pisarlo: perdimos una muestra por no
 * poder reconocer nuestra propia basura.
 */
const MARCADOR = "CC-SONDEO-NO-ENVIAR";

export async function sondear(
  vistas: {
    id: string;
    /** Ancho x alto del panel. Va al informe: es variable de la prueba, no adorno. */
    panel: string;
    ejecutar: (fuente: string) => Promise<unknown>;
    /**
     * Sólo se pasa en modo escritura, y sólo para proveedores que YA tienen
     * spec: se escribe en el selector derivado, no en uno adivinado. Sin esto,
     * el sondeo no escribe nada.
     */
    composerSelector?: string;
    /**
     * Selector del control de envío. **No se usa para enviar**: se usa para
     * CONTAR nodos y cuántos están habilitados antes y después de escribir. Es
     * el efecto del editor que sirve de criterio en vez del eco (§7.22).
     */
    submitSelector?: string;
  }[],
): Promise<SondeoProveedor[]> {
  const crudos = await Promise.allSettled(
    vistas.map((v) => {
      const args = v.composerSelector
        ? `${JSON.stringify(v.composerSelector)}, ${JSON.stringify(v.submitSelector ?? null)}, ${JSON.stringify(MARCADOR)}`
        : "null, null, null";
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
        panel: v.panel,
        shadowRootsAbiertos: 0,
        compositor: [],
        envio: [],
        asistente: [],
        etiquetaModeloPorAtributo: [],
        etiquetaModeloPorTexto: [],
        etiquetaModeloDescartados: 0,
        estadoCompositor: v.composerSelector ? "con-texto" : "reposo",
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      };
    }
    // El `id` y el `panel` van DESPUÉS del spread: la página no los conoce y
    // si vinieran con uno, el nuestro es el bueno.
    return { ...(r.value as Omit<SondeoProveedor, "id" | "panel">), id: v.id, panel: v.panel };
  });
}
