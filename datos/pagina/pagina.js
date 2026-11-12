"use strict";
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
function buscar(selector) {
    try {
        return document.querySelector(selector);
    }
    catch {
        return null;
    }
}
function buscarTodos(selector) {
    if (!selector)
        return [];
    try {
        return Array.from(document.querySelectorAll(selector));
    }
    catch {
        return [];
    }
}
async function esperarElemento(selector, ms) {
    const hasta = Date.now() + ms;
    for (;;) {
        const el = buscar(selector);
        if (el)
            return el;
        if (Date.now() > hasta)
            return null;
        await dormir(120);
    }
}
function estaGenerando(spec) {
    return spec.completion.kind === "element-gone" ? buscar(spec.completion.selector) !== null : null;
}
function leerTexto(el, tipo) {
    if (tipo === "textarea")
        return el.value ?? "";
    const hijos = Array.from(el.children);
    const esBloque = (h) => /^(P|DIV|H[1-6]|LI|PRE|BLOCKQUOTE)$/.test(h.tagName);
    let t = hijos.length > 0 && hijos.every(esBloque) ? hijos.map((h) => (h.innerText ?? "").replace(/\n$/, "")).join("\n") : el.innerText ?? "";
    for (const pildora of Array.from(el.querySelectorAll('[contenteditable="false"]')))
        t = t.replace(pildora.innerText ?? "", "");
    return t;
}
function tramosDePegado(texto, max) {
    const tramos = [];
    let actual = "";
    for (const [i, linea] of texto.split("\n").entries()) {
        const pieza = i === 0 ? linea : `\n${linea}`;
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
    if (actual.length > 0)
        tramos.push(actual);
    return tramos;
}
async function escribirEnCompositor(el, tipo, texto, escritura) {
    el.focus();
    if (tipo === "textarea") {
        const ta = el;
        ta.select();
        document.execCommand("insertText", false, texto);
        return ta.value === texto;
    }
    const host = el;
    const seleccion = window.getSelection();
    const rango = document.createRange();
    const pildora = host.querySelector('[contenteditable="false"]');
    rango.selectNodeContents(pildora ? (host.lastElementChild ?? host) : host);
    if (pildora)
        rango.collapse(false);
    seleccion?.removeAllRanges();
    seleccion?.addRange(rango);
    if (escritura === "pegado") {
        if (!pildora) {
            document.execCommand("delete", false);
            const inicio = document.createRange();
            inicio.setStart(host.firstElementChild ?? host, 0);
            inicio.collapse(true);
            seleccion?.removeAllRanges();
            seleccion?.addRange(inicio);
        }
        for (const tramo of tramosDePegado(texto, 1000)) {
            const datos = new DataTransfer();
            datos.setData("text/plain", tramo);
            host.dispatchEvent(new ClipboardEvent("paste", { clipboardData: datos, bubbles: true, cancelable: true }));
        }
    }
    else {
        const salto = escritura === "lineaParrafo" ? "insertParagraph" : "insertLineBreak";
        const lineas = texto.split("\n");
        lineas.forEach((linea, i) => {
            if (linea.length > 0)
                document.execCommand("insertText", false, linea);
            if (i < lineas.length - 1)
                document.execCommand(salto, false);
        });
    }
    const hasta = Date.now() + 3000;
    for (;;) {
        if (leerTexto(host, tipo).trim() === texto.trim())
            return true;
        if (Date.now() > hasta)
            return false;
        await dormir(100);
    }
}
async function escribir(spec, texto) {
    texto = texto.replace(/\r\n?/g, "\n");
    const compositor = await esperarElemento(spec.composer.selector, spec.timeouts?.composerMs ?? 15000);
    if (!compositor)
        return { ok: false, error: "compositor no encontrado: no se escribió nada", ms: 0, textoFinal: "", caracteresEscritos: texto.length, caracteresPresentes: 0 };
    const leer = () => leerTexto(compositor, spec.composer.kind);
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
        }
        else if (performance.now() - quietoDesde >= 400)
            break;
        if (performance.now() - t0 > 45000)
            break;
        await dormir(120);
    }
    const textoFinal = leer();
    const ms = Math.round(performance.now() - t0);
    const normal = (t) => t.replace(/\s+/g, " ").trim();
    if (normal(textoFinal) !== normal(texto)) {
        return { ok: false, error: `el texto no quedó en el compositor (${textoFinal.length} de ${texto.length} caracteres): revisa el panel y vuelve a pegar`, ms, textoFinal, caracteresEscritos: texto.length, caracteresPresentes: textoFinal.length };
    }
    return { ok: true, ms, textoFinal, caracteresEscritos: texto.length, caracteresPresentes: textoFinal.length };
}
function leerCompositor(spec) {
    const el = buscar(spec.composer.selector);
    return el ? leerTexto(el, spec.composer.kind) : null;
}
function chatVacio(spec) {
    return buscarTodos(spec.assistantMessage.selector).length === 0 && buscarTodos(spec.userMessage?.selector).length === 0;
}
function ultimoNodoAsistente(spec) {
    const nodos = buscarTodos(spec.assistantMessage.selector);
    return nodos[nodos.length - 1] ?? null;
}
function textoDelAsistente(spec, nodo) {
    if (!nodo)
        return "";
    const copia = nodo.cloneNode(true);
    copia.querySelectorAll("style, script").forEach((n) => n.remove());
    for (const selector of spec.assistantMessage.exclude ?? []) {
        try {
            copia.querySelectorAll(selector).forEach((n) => n.remove());
        }
        catch {
        }
    }
    return textoEnBloques(copia);
}
const BLOQUES_DE_TEXTO = "p, li, h1, h2, h3, h4, h5, h6, pre, blockquote, tr, div, section, article, table, ul, ol, br, hr";
function textoEnBloques(raiz) {
    for (const celda of Array.from(raiz.querySelectorAll("td, th")))
        celda.after(" | ");
    for (const el of Array.from(raiz.querySelectorAll(BLOQUES_DE_TEXTO)).reverse()) {
        const siguiente = el.nextSibling;
        if (!siguiente || (siguiente.nodeType === Node.TEXT_NODE && /^[ \t]*\n/.test(siguiente.textContent ?? "")))
            continue;
        const propio = el.textContent ?? "";
        if (el.tagName !== "BR" && (propio.trim() === "" || /\n[ \t]*$/.test(propio)))
            continue;
        el.after("\n");
    }
    return raiz.textContent ?? "";
}
function contarEnlacesDeFuente(nodo) {
    let actual = nodo;
    for (let nivel = 0; actual && nivel <= 6; nivel++) {
        const n = actual.querySelectorAll('a[href^="http"]').length;
        if (n > 0)
            return n;
        actual = actual.parentElement;
    }
    return 0;
}
async function leerCanvas(spec, nodo) {
    const c = spec.canvas;
    const mensaje = c && nodo ? nodo.closest(c.mensaje) : null;
    if (!c || !mensaje)
        return null;
    const tarjeta = Array.from(mensaje.querySelectorAll(c.abrir)).pop();
    if (!tarjeta)
        return null;
    const yaAbierto = buscar(c.contenido) !== null;
    try {
        if (!yaAbierto)
            tarjeta.click();
        const hasta = Date.now() + 8000;
        let el = buscar(c.contenido);
        while ((!el || (el.textContent ?? "").length === 0) && Date.now() < hasta) {
            await dormir(150);
            el = buscar(c.contenido);
        }
        if (!el)
            return null;
        const copia = el.cloneNode(true);
        copia.querySelectorAll("style, script").forEach((n) => n.remove());
        return { texto: textoEnBloques(copia), html: el.outerHTML };
    }
    finally {
        if (!yaAbierto)
            buscar(c.cerrar)?.click();
    }
}
async function leerArchivos(spec, nodo) {
    const a = spec.archivos;
    if (!a || !nodo)
        return null;
    const tarjetas = Array.from(nodo.querySelectorAll(a.tarjeta));
    if (tarjetas.length === 0)
        return null;
    const contenido = () => {
        try {
            return buscar(a.iframe)?.contentDocument?.querySelector(a.contenido) ?? null;
        }
        catch {
            return null;
        }
    };
    const texto = (el) => (el.innerText ?? el.textContent ?? "").trim();
    const partes = [];
    const htmls = [];
    let anterior = "";
    let leidos = 0;
    for (const t of tarjetas) {
        const titulo = (t.querySelector(a.titulo)?.textContent ?? "").trim() || "(archivo sin nombre)";
        t.click();
        const hasta = Date.now() + 15000;
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
        }
        else {
            partes.push(`=== ARCHIVO: ${titulo} ===\n(no se pudo leer el contenido de este archivo en 15 s)`);
        }
    }
    return { texto: partes.join("\n\n"), html: htmls.join("\n"), leidos, total: tarjetas.length };
}
function leerMensajeUsuario(spec) {
    const nodos = buscarTodos(spec.userMessage?.selector);
    const nodo = spec.userMessage?.pick === "first" ? nodos[0] : nodos[nodos.length - 1];
    return nodo ? (nodo.textContent ?? "").trim() || null : null;
}
function leerEtiquetaModelo(spec) {
    const el = spec.modelLabel ? buscar(spec.modelLabel.selector) : null;
    const t = el ? textoConEspacios(el) : undefined;
    return t && t.length > 0 && t.length < 120 ? t : null;
}
function textoConEspacios(el) {
    let t = "";
    let padre = null;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
        t += (padre && n.parentNode !== padre ? " " : "") + (n.textContent ?? "");
        padre = n.parentNode;
    }
    return t.replace(/\s+/g, " ").trim();
}
async function leer(spec) {
    const nodo = ultimoNodoAsistente(spec);
    const canvas = await leerCanvas(spec, nodo);
    const archivos = await leerArchivos(spec, nodo);
    const mensaje = textoDelAsistente(spec, nodo);
    const base = canvas ? `${mensaje}\n\n${canvas.texto}` : mensaje;
    const falla = spec.fallaDeCarga ? nodo?.querySelector(spec.fallaDeCarga) : null;
    return {
        error: falla ? `la página mostró «${(falla.innerText ?? "").trim()}» en lugar de la respuesta: recárgala y vuelve a capturar` : null,
        text: archivos ? `${base}\n\n${archivos.texto}` : base,
        archivos: archivos ? { leidos: archivos.leidos, total: archivos.total } : null,
        userText: leerMensajeUsuario(spec),
        fuentesHref: contarEnlacesDeFuente(nodo),
        html: nodo ? nodo.outerHTML + (canvas ? "\n" + canvas.html : "") + (archivos ? "\n" + archivos.html : "") : null,
        informeEnIframe: !!(spec.informeEnIframe && nodo?.closest(spec.informeEnIframe.turno)?.querySelector(spec.informeEnIframe.iframe)),
        generating: estaGenerando(spec),
        completionKind: spec.completion.kind,
        quiescenceMs: spec.completion.quiescenceMs,
        modelLabel: leerEtiquetaModelo(spec),
    };
}
const seguimiento = { largo: -1, desde: 0 };
function estadoDeGeneracion(spec) {
    const nodo = ultimoNodoAsistente(spec);
    const largo = textoDelAsistente(spec, nodo).length;
    const actividad = largo + (nodo?.textContent?.length ?? 0);
    const ahora = Date.now();
    if (actividad !== seguimiento.largo) {
        seguimiento.largo = actividad;
        seguimiento.desde = ahora;
    }
    const quietoMs = ahora - seguimiento.desde;
    const generando = estaGenerando(spec) ?? (actividad > 0 && quietoMs < spec.completion.quiescenceMs ? true : null);
    const fin = largo === 0 || generando === true ? null
        : spec.completion.kind === "element-gone" ? "observado"
            : quietoMs >= spec.completion.quiescenceMs ? "deducido"
                : null;
    desbloquearScroll(spec);
    return { generando, largo, quietoMs, fin, zoom: outerWidth > 0 && innerWidth > 0 ? Math.round((outerWidth / innerWidth) * 100) : null };
}
function desbloquearScroll(spec) {
    for (let e = buscar(spec.composer.selector)?.parentElement; e && e !== document.documentElement; e = e.parentElement) {
        const s = getComputedStyle(e);
        const y = s.overflowY === "hidden" && e.scrollHeight > e.clientHeight + 1;
        const x = s.overflowX === "hidden" && e.scrollWidth > e.clientWidth + 1;
        if (y)
            e.style.overflowY = "auto";
        if (x)
            e.style.overflowX = "auto";
        if (x || y)
            return;
    }
}
const ATRIBUTOS_ESTRUCTURALES = ["id", "class", "data-testid", "data-test-id", "aria-label", "role", "name", "type"];
function recortar(texto, max = 80) {
    const t = texto.replace(/\s+/g, " ").trim();
    return t.length > max ? `${t.slice(0, max)}…` : t;
}
function describir(el) {
    const atributos = {};
    for (const a of ATRIBUTOS_ESTRUCTURALES) {
        const v = el.getAttribute(a);
        if (v !== null)
            atributos[a] = recortar(v, 120);
    }
    return { etiqueta: el.tagName.toLowerCase(), atributos };
}
function contar(selector) {
    if (!selector)
        return null;
    try {
        return document.querySelectorAll(selector).length;
    }
    catch {
        return "invalido";
    }
}
function diagnostico(spec) {
    const selectores = {
        "composer.selector": contar(spec.composer.selector),
        "assistantMessage.selector": contar(spec.assistantMessage.selector),
        "userMessage.selector": contar(spec.userMessage?.selector),
        "modelLabel.selector": contar(spec.modelLabel?.selector),
        "completion.selector": contar(spec.completion.kind === "element-gone" ? spec.completion.selector : undefined),
    };
    (spec.assistantMessage.exclude ?? []).forEach((s, i) => (selectores[`assistantMessage.exclude[${i}]`] = contar(s)));
    for (const [grupo, valores] of Object.entries({ canvas: spec.canvas, archivos: spec.archivos, informeEnIframe: spec.informeEnIframe })) {
        for (const [campo, s] of Object.entries(valores ?? {}))
            if (campo !== "frameUrl")
                selectores[`${grupo}.${campo}`] = contar(s);
    }
    const cuadrosDeTexto = buscarTodos('textarea, [contenteditable="true"], [contenteditable=""], input[type="text"], input:not([type])').slice(0, 20).map(describir);
    const textoLargo = buscarTodos("main *, body > div *")
        .filter((el) => (el.textContent ?? "").length > 500 && Array.from(el.children).every((h) => (h.textContent ?? "").length < 500))
        .slice(0, 10)
        .map((el) => ({ ...describir(el), largo: (el.textContent ?? "").length, inicio: recortar(el.textContent ?? "") }));
    const compositor = buscar(spec.composer.selector);
    let zona = compositor;
    for (let nivel = 0; zona && nivel < 4; nivel++)
        zona = zona.parentElement;
    const controles = zona ? Array.from(zona.querySelectorAll("button, [role=button], input[type=file]")).slice(0, 30).map((el) => ({
        ...describir(el),
        deshabilitado: el.disabled === true || el.getAttribute("aria-disabled") === "true",
    })) : [];
    const iframes = buscarTodos("iframe").slice(0, 20).map((f) => {
        let origen = "";
        try {
            const u = new URL(f.src, location.href);
            origen = u.origin + u.pathname;
        }
        catch {
            origen = "(src no legible)";
        }
        return { ...describir(f), origen, titulo: recortar(f.getAttribute("title") ?? "") };
    });
    const shadowRoots = buscarTodos("*").filter((el) => el.shadowRoot !== null).slice(0, 20).map(describir);
    return { url: location.origin + location.pathname, selectores, cuadrosDeTexto, textoLargo, controlesCercaDelCompositor: controles, iframes, shadowRoots };
}
function inputArchivo(spec) {
    document.querySelectorAll("[data-cc-adjunto]").forEach((el) => el.removeAttribute("data-cc-adjunto"));
    let zona = buscar(spec.composer.selector);
    let input = null;
    const aceptaTexto = (i) => !i.accept || /text|\.txt|\*\/\*/.test(i.accept);
    for (let nivel = 0; zona && !input && nivel <= 6; nivel++) {
        input = Array.from(zona.querySelectorAll('input[type="file"]')).find(aceptaTexto) ?? null;
        zona = zona.parentElement;
    }
    const todos = buscarTodos('input[type="file"]');
    input = input ?? todos.find(aceptaTexto) ?? null;
    if (!input)
        return { encontrado: false, cantidad: 0 };
    input.setAttribute("data-cc-adjunto", "1");
    return { encontrado: true, cantidad: todos.length, selector: '[data-cc-adjunto="1"]', accept: input.accept, multiple: input.multiple, ...describir(input) };
}
(() => {
    const w = window;
    if (w.__cc)
        return;
    const pedidos = new Map();
    const correr = (p) => {
        switch (p.op) {
            case "escribir":
                return escribir(p.spec, p.texto ?? "");
            case "leer":
                return leer(p.spec);
            case "leerCompositor":
                return Promise.resolve(leerCompositor(p.spec));
            case "chatVacio":
                return Promise.resolve(chatVacio(p.spec));
            case "estado":
                return Promise.resolve(estadoDeGeneracion(p.spec));
            case "diagnostico":
                return Promise.resolve(diagnostico(p.spec));
            case "inputArchivo":
                return Promise.resolve(inputArchivo(p.spec));
            default:
                return Promise.reject(new Error(`operacion desconocida: ${String(p.op)}`));
        }
    };
    w.__cc = {
        version: 1,
        pedir(json) {
            let p;
            try {
                p = JSON.parse(json);
            }
            catch (e) {
                return `error: el pedido no es JSON (${e instanceof Error ? e.message : String(e)})`;
            }
            pedidos.set(p.id, { estado: "pendiente" });
            correr(p).then((resultado) => pedidos.set(p.id, { estado: "listo", resultado }), (e) => pedidos.set(p.id, { estado: "error", error: e instanceof Error ? e.message : String(e) }));
            return "ok";
        },
        consultar(id) {
            const e = pedidos.get(id);
            if (!e)
                return JSON.stringify({ estado: "error", error: `pedido desconocido: ${id}` });
            if (e.estado !== "pendiente")
                pedidos.delete(id);
            return JSON.stringify(e);
        },
    };
})();
