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

/** Un nodo del subárbol de un candidato a etiqueta de modelo. */
export interface NodoDesglose {
  /** Profundidad respecto del candidato: 0 es el candidato mismo. */
  prof: number;
  tag: string;
  attrs: Record<string, string>;
  /**
   * Texto PROPIO: sólo los nodos de texto hijos directos, no el heredado de
   * los descendientes. Es lo que permite ver en qué nodo vive cada pedazo de
   * la etiqueta, y por lo tanto cuál falta cuando falta.
   */
  propio: string;
  /**
   * El nodo tiene un shadow root ABIERTO colgando. Va porque `textContent` no
   * cruza un shadow root: si el pedazo que falta vive ahí adentro, el texto se
   * lee incompleto sin que nada falle, y eso es indistinguible de un nodo que
   * no existe. Es la misma distinción que `via: "shadow"` en los candidatos.
   */
  sombra: boolean;
}

export interface DesgloseEtiqueta {
  selector: string;
  /** `textContent` completo del candidato, sin recortar a 80 como `muestra`. */
  textoCompleto: string;
  nodos: NodoDesglose[];
  ancestros: { tag: string; attrs: Record<string, string> }[];
  hermanos: { tag: string; attrs: Record<string, string>; muestra: string }[];
}

/**
 * El selector de etiqueta de modelo que la spec YA usa, consultado DIRECTO.
 *
 * POR QUÉ HACE FALTA, medido el 2026-08-10 sobre los nueve crudos del árbol.
 * Las tres vías de descubrimiento proponen candidatos con FILTROS —familia más
 * versión, o un control con un número— y `div[data-test-id="logo-pill-label-container"]`
 * de gemini aparece en las 5 corridas en reposo y en NINGUNA de las 6 con el
 * compositor escrito. Pero "ninguna vía lo propuso" NO es "no está en el DOM":
 * puede seguir ahí con un texto que ya no pasa el filtro. El camino real, que
 * consulta el selector directo, lo encontró y devolvió "GeminiFlash-Lite".
 *
 * O sea que el instrumento no podía distinguir las dos cosas que importan —el
 * selector dejó de matchear, o matchea y el texto se degradó— porque nunca
 * preguntaba por el selector de la spec. Acá se pregunta, exista o no entre los
 * candidatos, y se desglosa igual.
 *
 * Sigue siendo de SÓLO LECTURA: es un `querySelectorAll` y un recorrido de
 * texto y atributos de la lista blanca. No agrega ninguna capacidad.
 */
export interface EtiquetaModeloSpec {
  selector: string;
  presente: boolean;
  matches: number;
  /**
   * El MISMO valor que `readModelLabel` obtendría (`textContent.trim()`), para
   * poder comparar el sondeo con el registro sin traducir nada en el medio.
   */
  textoComoLoLee: string | null;
  desglose: DesgloseEtiqueta | null;
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
  /** Estructural: un control con texto corto que contiene un número. No exige nombre de familia. */
  etiquetaModeloPorForma: Candidato[];
  etiquetaModeloDescartados: number;
  /**
   * DESGLOSE del subárbol de cada candidato a etiqueta de modelo.
   *
   * Existe por un fallo concreto que las tres vías anteriores no podían
   * explicar: el mismo selector de gemini —`div[data-test-id="logo-pill-label-container"]`,
   * `matches: 1`— devuelve "Gemini 3.5 Flash-Lite" en el sondeo y
   * "GeminiFlash-Lite" en el registro del camino real, con la MISMA extracción
   * (`textContent.trim()`) en los dos lados. O sea que el número no se pierde
   * al concatenar: el nodo que lo contiene no está en el DOM en el momento de
   * la lectura. Un candidato que sólo informa su texto no puede decir eso.
   *
   * El desglose informa, por candidato: el texto propio de CADA nodo del
   * subárbol —no el heredado—, los ancestros y los HERMANOS. Los hermanos van
   * porque en gemini el control que lleva la versión dentro del `aria-label`
   * es hermano del contenedor, y si la corrección pasa por leer un atributo en
   * vez de un texto, hace falta verlo en la misma muestra.
   */
  etiquetaModeloDesglose?: DesgloseEtiqueta[];
  /**
   * El selector de la spec, consultado DIRECTO y desglosado exista o no entre
   * los candidatos. Es lo único que separa "el selector dejó de matchear" de
   * "matchea y el texto se degradó". `undefined` = el proveedor no tiene
   * `modelLabel` en su spec, que no es lo mismo que `presente: false`.
   */
  etiquetaModeloSpec?: EtiquetaModeloSpec;
  /** Milisegundos desde la navegación hasta el momento de la muestra. */
  msDesdeNavegacion?: number;
  readyState?: string;
  /**
   * Controles que viven ALREDEDOR del compositor, en orden de documento.
   *
   * Existe por dos huecos medidos el 2026-08-10 en la primera corrida sobre
   * kimi. La lista `envio` se llena con los primeros seis nodos que matchean
   * patrones GENÉRICOS (`button:has(svg)` y parientes), y en kimi esos seis se
   * agotaron con botones de la BARRA LATERAL —ocultar barra, crear proyecto,
   * invitar— sin llegar al compositor. O sea que "no hay control de envío" no
   * era una observación sobre la página: era el cupo lleno de ruido. Es §7.30
   * otra vez: "no lo encontré" son dos diagnósticos con el mismo nombre.
   *
   * El segundo hueco es de la Fase 3: hay que comprobar que qwen y kimi exponen
   * modo de investigación profunda, y ese conmutador vive exactamente acá —
   * pegado al compositor— y ninguna vía lo miraba.
   *
   * La cosecha es ESTRUCTURAL y no supone nada del idioma ni del framework:
   * sube unos pocos ancestros desde el compositor y lista todo lo accionable
   * que haya dentro, con su texto y sus atributos de la lista blanca. Sólo
   * lectura, sin clics.
   */
  controlesDelCompositor?: Candidato[];
  /**
   * Cuántos ancestros hubo que subir desde el compositor para encontrar algo
   * accionable. Va al informe porque dos proveedores con árboles de distinta
   * profundidad producen muestras que se leen como comparables y no lo son:
   * qwen encuentra controles cerca y kimi mucho más arriba. `null` = no había
   * compositor.
   */
  controlesNivelesArriba?: number | null;
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
const FUENTE_SONDEO = `async (SELECTOR_COMPOSITOR, SELECTOR_ENVIO, MARCADOR, MARCADORES_VIEJOS, SELECTOR_ETIQUETA) => {
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

  /**
   * Vacia el compositor. MEDIDO el 2026-08-10: la version anterior fallaba en
   * kimi las tres veces (limpio:false en los tres metodos) y dejaba el marcador
   * del sondeo colgado en la sesion de Juan.
   *
   * La causa es la misma que §7.22 del otro lado: un editor rico mantiene su
   * propio modelo interno. Borrar el DOM a la fuerza con innerHTML no le avisa
   * a nadie, y el editor RE-RENDERIZA desde su modelo, o sea que repone el
   * texto que acabamos de sacar. Por eso el vaciado tiene que hablarle al
   * editor en el idioma que el editor escucha.
   *
   * Cuatro vias, de la mas respetuosa a la mas bruta, y se COMPRUEBA entre
   * cada una en vez de suponer que anduvo:
   *   1. Selection API sobre todo el contenido, que es lo que un usuario hace
   *      con Ctrl+A y lo unico que deja al editor con una seleccion real.
   *   2. beforeinput/input con deleteContent, que es lo que escuchan los
   *      editores modernos (Lexical, ProseMirror, Slate).
   *   3. execCommand delete, para los que todavia dependen de el.
   *   4. innerHTML vacio como ultimo recurso.
   * Y un reintento con espera, porque el re-render es asincronico: comprobar en
   * el mismo tick da un verde que el siguiente frame desmiente.
   *
   * NINGUNA de las cuatro envia: no hay clic ni tecla en ningun lado.
   */
  const vaciarUnaVez = (c) => {
    c.focus();
    if (esTextarea(c)) {
      c.value = "";
      c.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    // 1. Seleccionar TODO el contenido del compositor, no del documento.
    try {
      const sel = window.getSelection();
      const rango = document.createRange();
      rango.selectNodeContents(c);
      sel.removeAllRanges();
      sel.addRange(rango);
    } catch (e) { /* sin seleccion se sigue igual con las otras vias */ }
    // 2. El evento que los editores modernos escuchan para borrar.
    try {
      c.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "deleteContentBackward", data: null }));
      c.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
    } catch (e) { /* idem */ }
    // 3. La via vieja, para los que dependen de ella.
    if (leerCompositor(c).length > 0) {
      try { document.execCommand("selectAll", false); } catch (e) { /* idem */ }
      try { document.execCommand("delete", false); } catch (e) { /* idem */ }
    }
    // 4. Ultimo recurso. Va con el evento al lado para que el editor tenga al
    // menos la chance de enterarse.
    if (leerCompositor(c).length > 0) {
      c.innerHTML = "";
      c.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
    }
  };

  const vaciar = async (c) => {
    for (let intento = 0; intento < 3; intento++) {
      try { vaciarUnaVez(c); } catch (e) { /* se reporta como limpio:false */ }
      // El re-render del editor es asincronico: comprobar en el mismo tick da
      // un verde que el frame siguiente desmiente.
      await dormir(250);
      if (leerCompositor(c).trim().length === 0) return;
    }
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
    const esNuestro = previo === MARCADOR || (MARCADORES_VIEJOS || []).indexOf(previo) >= 0;
    if (c && previo.length > 0 && !esNuestro) {
      escrituraOmitida = "el compositor tenia texto previo que NO es nuestro marcador: no se midio para no borrar un borrador de Juan";
    } else if (c) {
      // Si lo previo es NUESTRO marcador, es basura de una corrida anterior:
      // se limpia y se sigue. Abstenerse ahi costaba una muestra por nada.
      if (esNuestro && previo.length > 0) restoLimpiado = true;
      escrituraPorMetodo = [];
      await vaciar(c);
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
        await vaciar(c);
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
      // La limpieza final se ESPERA. Antes se empujaba una funcion sincronica
      // que se llamaba sin await, asi que el sondeo devolvia el informe
      // mientras el vaciado seguia en curso y compositorLimpio se media sobre
      // un estado a medio camino.
      limpiar.push(() => vaciar(c));
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
    // Las clases de Tailwind traen dos puntos, corchetes y barras
    // ("sm:text-base", "w-[32px]", "top-1/2") y todos esos son metacaracteres
    // de CSS: el selector sale INVALIDO y la consulta tira, que es de donde
    // salio el matches en -1 del 2026-08-02. Se descartan las clases con
    // metacaracteres en vez de escaparlas: una clase de variante responsiva es
    // ademas mala base para un selector, porque cambia con el ancho.
    const cls = (el.getAttribute("class") || "")
      .trim()
      .split(/\\s+/)
      .filter(Boolean)
      .filter((c) => /^[A-Za-z_-][A-Za-z0-9_-]*$/.test(c));
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
  const juntar = (selectores, sink, cap) => {
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
          if (sink) sink.add(el);
          out.push(candidato(el, via));
          if (out.length >= (cap || CAP_CANDIDATOS)) return out;
        }
      }
    }
    return out;
  };

  /**
   * Los ELEMENTOS que cualquiera de las tres vias propuso como etiqueta de
   * modelo. Se guardan aparte de los candidatos porque el desglose necesita el
   * nodo vivo, no su resumen: la pregunta que tiene que contestar es en QUE
   * nodo vive cada pedazo de la etiqueta, y eso no se puede reconstruir desde
   * un texto ya concatenado.
   */
  const elsEtiqueta = new Set();

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
        if (!tieneHijoMatch) { elsEtiqueta.add(el); out.push(candidato(el, via)); }
      }
    }
    return out;
  };

  /**
   * Tercera via: por FORMA, sin exigir nombre de familia.
   *
   * Las dos vias anteriores exigen una familia de modelo en el texto, y esa
   * condicion excluye justo el caso que hacia falta: medido el 2026-08-02, el
   * selector de modelo de gemini no dice "Gemini", dice la version sola
   * ("2.5 Flash"). Mi propia regla de dos condiciones dejaba afuera al unico
   * proveedor que todavia faltaba.
   *
   * Esta via no pregunta COMO SE LLAMA sino QUE ES: un control —boton, menu,
   * combo— con texto corto que contiene un numero. Es estructural, asi que no
   * hay que acertarle de antemano al nombre del modelo.
   */
  // Deliberadamente NO se mira el atributo de menu desplegable que
  // guard:artefacto prohibe en el proceso principal. El gate tiene razon
  // aunque aca solo se leyera: ese atributo entro a la lista negra como
  // sustituto de "no salgas a buscar disparadores de menu para clickearlos", y
  // relajarlo por comodidad seria justo la clase de excepcion que ya se
  // revirtio una vez. Con el tag y el rol alcanza. (El gate llego a frenar
  // esta misma entrega, y se cedio en vez de aflojarlo.)
  const esControl = (el) => {
    if (el.tagName === "BUTTON") return true;
    const rol = el.getAttribute("role");
    return rol === "button" || rol === "combobox" || rol === "menuitem";
  };
  const porFormaDeVersion = () => {
    const out = [];
    for (const raiz of raices) {
      const via = raiz === document ? "document" : "shadow";
      for (const el of raiz.querySelectorAll("*")) {
        if (out.length >= CAP_CANDIDATOS) break;
        if (!esControl(el)) continue;
        const t = (el.textContent || "").replace(/[\\uE000-\\uF8FF]/g, "").replace(/\\s+/g, " ").trim();
        if (t.length === 0 || t.length > 30) continue;
        if (!/\\d/.test(t)) continue;
        if (compositorEl && (el.contains(compositorEl) || compositorEl.contains(el))) continue;
        elsEtiqueta.add(el);
        out.push(candidato(el, via));
      }
    }
    return out;
  };

  /**
   * DESGLOSE: en que nodo vive cada pedazo de la etiqueta.
   *
   * Un candidato informa su texto ya concatenado, y con eso no se puede
   * distinguir "el numero esta en un nodo que ahora no existe" de "la
   * concatenacion se lo comio". Aca se informa el texto PROPIO de cada nodo
   * —solo sus hijos de tipo texto, no el heredado—, mas los ancestros y los
   * HERMANOS, porque la correccion puede pasar por leer un atributo de un
   * hermano en vez de un texto.
   *
   * Sigue siendo de SOLO LECTURA y sigue respetando la lista blanca de
   * atributos: no agrega ninguna capacidad, agrega resolucion.
   */
  const CAP_NODOS = 40;
  const CAP_PROPIO = 60;
  const limpiarTexto = (s) => (s || "").replace(/[\\uE000-\\uF8FF]/g, "").replace(/\\s+/g, " ").trim();
  const textoPropio = (n) => {
    let out = "";
    for (const h of n.childNodes) {
      if (h.nodeType === 3) out += h.nodeValue || "";
    }
    return limpiarTexto(out).slice(0, CAP_PROPIO);
  };
  const desglosar = (el) => {
    const nodos = [];
    const recorrer = (n, prof) => {
      if (nodos.length >= CAP_NODOS) return;
      // "sombra": textContent NO cruza un shadow root. Si el pedazo que falta
      // vive ahi adentro, el texto sale incompleto sin que nada falle, y eso es
      // indistinguible de un nodo ausente. Se informa por nodo.
      nodos.push({ prof: prof, tag: n.tagName.toLowerCase(), attrs: attrsDe(n), propio: textoPropio(n), sombra: !!n.shadowRoot });
      for (const h of n.children) recorrer(h, prof + 1);
    };
    recorrer(el, 0);
    const ancestros = [];
    let p = el.parentElement;
    for (let k = 0; k < 3 && p; k++) {
      ancestros.push({ tag: p.tagName.toLowerCase(), attrs: attrsDe(p) });
      p = p.parentElement;
    }
    const hermanos = [];
    if (el.parentElement) {
      for (const h of el.parentElement.children) {
        if (h === el || hermanos.length >= 6) continue;
        hermanos.push({ tag: h.tagName.toLowerCase(), attrs: attrsDe(h), muestra: limpiarTexto(h.textContent).slice(0, CAP_PROPIO) });
      }
    }
    return {
      selector: selectorDe(el),
      textoCompleto: (el.textContent || "").slice(0, 120),
      nodos: nodos,
      ancestros: ancestros,
      hermanos: hermanos,
    };
  };

  // Tres vias, todas de SOLO LECTURA, y las tres se corren SIEMPRE. Antes la de
  // texto sólo corria si la de atributo salia vacia, y eso escondia el caso
  // real: que un atributo encuentre un boton cuyo texto no sirve de etiqueta.
  // Son dos diagnosticos distintos y se informan por separado.
  const etiquetaModeloPorAtributo = juntar(['button[aria-label*="odel"]', 'button[aria-label*="odelo"]', '[class*="model-selector"]', '[class*="model-switcher"]', '[data-testid*="model"]', '[data-test-id*="model"]'], elsEtiqueta);
  const etiquetaModeloPorTexto = porNombreDeModelo();
  const etiquetaModeloPorForma = porFormaDeVersion();
  const etiquetaModeloDesglose = Array.from(elsEtiqueta).slice(0, 4).map(desglosar);

  /**
   * El selector que la spec YA usa, consultado DIRECTO.
   *
   * Las tres vias de arriba DESCUBREN candidatos, y descubren con filtros. Que
   * ninguna proponga el selector de la spec no prueba que el selector no
   * matchee: prueba que su texto no paso el filtro. Son dos cosas distintas y
   * piden arreglos opuestos —re-derivar el selector, o mirar por que el texto
   * se degrada— asi que el sondeo tiene que poder decir cual de las dos es.
   *
   * Es la misma forma de defecto que ya aparecio tres veces en este proyecto:
   * un valor por defecto que colapsa "no pasa" con "no pude ver".
   */
  /**
   * CONTROLES ALREDEDOR DEL COMPOSITOR.
   *
   * Sube unos pocos ancestros desde el compositor y lista todo lo accionable
   * que haya adentro. Dos motivos, los dos medidos:
   *
   *  1. La lista "envio" usa patrones genericos y tiene cupo. En kimi los seis
   *     lugares se llenaron con botones de la BARRA LATERAL y el sondeo informo
   *     cero controles de envio — que no es una observacion sobre la pagina
   *     sino un cupo lleno de ruido.
   *  2. El conmutador de investigacion profunda vive justo aca, y ninguna via
   *     lo miraba.
   *
   * Es estructural: no supone idioma, ni framework, ni como se llama el modo.
   */
  const SEL_CONTROLES = "button, [role=button], [role=switch], [role=checkbox], [role=menuitem], [role=tab], input[type=checkbox]";
  let controlesNivelesArriba = null;
  const controlesDelCompositor = (() => {
    if (!compositorEl) return [];
    // ADAPTATIVO, y esa es la correccion. La version anterior subia CUATRO
    // niveles fijos: alcanzaba en qwen —seis controles, con el boton de enviar
    // y el selector de modo— y en kimi devolvia CERO, porque su editor esta mas
    // anidado y a cuatro niveles todavia no se sale de adentro del editor. Un
    // numero fijo de saltos supone una profundidad de arbol ajena, que es
    // exactamente lo que un instrumento hecho para no suponer no puede hacer.
    //
    // Ahora sube de a uno hasta encontrar algo accionable, con techo de OCHO
    // para no terminar cosechando la pagina entera, e informa cuantos niveles
    // subio: sin ese numero, dos proveedores con arboles distintos producen
    // muestras que se leen como comparables y no lo son.
    let raiz = compositorEl;
    for (let k = 0; k <= 8; k++) {
      let encontrados = 0;
      try { encontrados = raiz.querySelectorAll(SEL_CONTROLES).length; } catch (e) { encontrados = 0; }
      if (encontrados > 0) { controlesNivelesArriba = k; break; }
      if (!raiz.parentElement) break;
      raiz = raiz.parentElement;
      controlesNivelesArriba = k + 1;
    }
    const out = [];
    const vistos = new Set();
    let nodos = [];
    try { nodos = Array.from(raiz.querySelectorAll(SEL_CONTROLES)); } catch (e) { nodos = []; }
    for (const el of nodos) {
      if (vistos.has(el)) continue;
      vistos.add(el);
      // Hasta 25: son los controles de UNA barra, no de la pagina entera, y con
      // seis ya se demostro que un cupo chico esconde justo lo que se busca.
      if (out.length >= 25) break;
      out.push(candidato(el, "document"));
    }
    return out;
  })();

  let etiquetaModeloSpec;
  if (SELECTOR_ETIQUETA) {
    let nodosSpec = [];
    try { nodosSpec = Array.from(document.querySelectorAll(SELECTOR_ETIQUETA)); } catch (e) { nodosSpec = []; }
    const elSpec = nodosSpec.length > 0 ? nodosSpec[0] : null;
    etiquetaModeloSpec = {
      selector: SELECTOR_ETIQUETA,
      presente: elSpec !== null,
      matches: nodosSpec.length,
      // Exactamente lo que readModelLabel obtendria, para comparar el sondeo
      // con el registro sin traducir nada en el medio.
      textoComoLoLee: elSpec ? (elSpec.textContent || "").trim().slice(0, 120) : null,
      desglose: elSpec ? desglosar(elSpec) : null,
    };
  }

  const salida = {
    estadoCompositor: SELECTOR_COMPOSITOR && MARCADOR ? "con-texto" : "reposo",
    escrituraAceptada: escrituraAceptada,
    url: location.origin + location.pathname,
    titulo: document.title.slice(0, 120),
    shadowRootsAbiertos: shadowAbiertos,
    compositor: juntar(['textarea', 'div[contenteditable="true"]', '[role="textbox"]']),
    // Cupo PROPIO y grande para el envio. MEDIDO el 2026-08-10: con el cupo
    // comun de 6, en kimi los seis lugares se llenaron con botones de la BARRA
    // LATERAL —ocultar barra, crear proyecto, invitar a ganar— porque
    // 'button:has(svg)' matchea media pagina y el orden de documento pone la
    // barra antes que el compositor. El sondeo informo cero controles de envio
    // en tres corridas, y eso no era una observacion sobre la pagina: era el
    // cupo lleno de ruido. Un cupo que esconde justo lo que se busca convierte
    // "no lo vi" en "no esta", que es la tercera vez que la misma forma de
    // defecto aparece en este proyecto.
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
    ], null, 30),
    asistente: juntar(['[data-message-author-role="assistant"]', '[class*="assistant"]', '[class*="model-response"]', '[class*="markdown"]']),
    etiquetaModeloPorAtributo: etiquetaModeloPorAtributo,
    etiquetaModeloPorTexto: etiquetaModeloPorTexto,
    etiquetaModeloPorForma: etiquetaModeloPorForma,
    etiquetaModeloDesglose: etiquetaModeloDesglose,
    etiquetaModeloSpec: etiquetaModeloSpec,
    controlesDelCompositor: controlesDelCompositor,
    controlesNivelesArriba: controlesNivelesArriba,
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
  for (const f of limpiar) { try { await f(); } catch (e) { /* no hay nada mejor que hacer */ } }

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

/**
 * Marcadores de versiones anteriores. Cambiar el marcador dejo HUERFANO al
 * resto que el cambio venia a resolver: el olvidado en el compositor de
 * chatgpt era la palabra "sondeo", no coincidia con el nuevo, y la corrida
 * siguiente lo clasifico como borrador de Juan y se abstuvo de medir tres
 * veces seguidas. Un instrumento tiene que reconocer TODA su propia basura,
 * no solo la de la version de hoy.
 */
const MARCADORES_VIEJOS = ["sondeo"];

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
    /**
     * Selector de etiqueta de modelo que la spec YA usa. Se consulta DIRECTO y
     * se desglosa exista o no entre los candidatos que las tres vías proponen.
     *
     * Va SIEMPRE que el proveedor tenga uno, también en el sondeo de sólo
     * lectura: es un `querySelectorAll` y una lectura de texto y atributos, no
     * escribe nada. Sin esto, "ninguna vía lo propuso" se lee como "no está en
     * el DOM", y son dos diagnósticos distintos con arreglos opuestos.
     */
    modelLabelSelector?: string;
  }[],
): Promise<SondeoProveedor[]> {
  const crudos = await Promise.allSettled(
    vistas.map((v) => {
      const etiqueta = JSON.stringify(v.modelLabelSelector ?? null);
      const args = v.composerSelector
        ? `${JSON.stringify(v.composerSelector)}, ${JSON.stringify(v.submitSelector ?? null)}, ${JSON.stringify(MARCADOR)}, ${JSON.stringify(MARCADORES_VIEJOS)}, ${etiqueta}`
        : `null, null, null, [], ${etiqueta}`;
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
        etiquetaModeloPorForma: [],
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
