"use strict";
// ESC-014 a ESC-017 (ADR-0011): pulsa enviar solo si el compositor sigue con el texto pegado y el chat no tiene
// un mensaje enviado. Usa las funciones de pagina.js (inyectado antes); sin ellas no envía.
(() => {
    const w = window;
    // La huella distingue este objeto de uno que la página haya definido con el mismo nombre.
    if (w.__ccEnviar?.huella === "cc-enviar")
        return;
    const COMPROBAR_MS = 15000;
    // La misma comparación con que pagina.js verifica lo escrito (INV-ESC-003).
    const normal = (t) => t.replace(/\s+/g, " ").trim();
    // ESC-018: la invocación de una skill al comienzo del compositor no es texto distinto. La misma regla que
    // sin_invocaciones_de_skill en crates/nucleo/src/puerta.rs: «/» o «@» y un nombre, seguidos de espacio o salto.
    const sinSkill = (t) => {
        let r = t.replace(/^\s+/, "");
        for (let m = /^[/@][\p{Alphabetic}\p{N}][\p{Alphabetic}\p{N}\-_.:]*\s+/u.exec(r); m; m = /^[/@][\p{Alphabetic}\p{N}][\p{Alphabetic}\p{N}\-_.:]*\s+/u.exec(r))
            r = r.slice(m[0].length);
        return r;
    };
    const desactivado = (b) => b.disabled === true || b.getAttribute("aria-disabled") === "true";
    async function enviar(spec, texto) {
        if (typeof leerCompositor !== "function" || typeof chatVacio !== "function" || typeof buscar !== "function"
            || typeof buscarTodos !== "function" || typeof dormir !== "function")
            throw new Error("pagina.js no está cargado: no se envía");
        const actual = leerCompositor(spec);
        if (actual === null || normal(actual) === "")
            return { estado: "compositor-vacio" };
        if (normal(actual) !== normal(texto) && normal(sinSkill(actual)) !== normal(texto))
            return { estado: "compositor-distinto" };
        if (!chatVacio(spec))
            return { estado: "ya-enviado" };
        const enviados = () => buscarTodos(spec.userMessage?.selector).length;
        const antes = enviados();
        if (spec.submit.kind === "key") {
            const c = buscar(spec.composer.selector);
            if (!c)
                return { estado: "compositor-vacio" };
            c.focus();
            const tecla = spec.submit.key ?? "Enter";
            const codigo = tecla === "Enter" ? 13 : 0;
            c.dispatchEvent(new KeyboardEvent("keydown", { key: tecla, code: tecla, keyCode: codigo, which: codigo, bubbles: true, cancelable: true }));
        }
        else {
            // Con techo de 15 s: la espera de la app (40 s) cubre esto más los 15 s de comprobación.
            const hasta = Date.now() + Math.min(spec.timeouts?.submitReadyMs ?? 8000, 15000);
            let boton;
            for (;;) {
                boton = buscar(spec.submit.selector);
                if (boton && !desactivado(boton))
                    break;
                if (Date.now() > hasta)
                    return { estado: boton ? "boton-desactivado" : "sin-boton" };
                await dormir(120);
            }
            // Mientras se esperaba el botón el texto pudo cambiar: se compara otra vez justo antes de pulsar.
            const ahora = leerCompositor(spec) ?? "";
            if (normal(ahora) !== normal(texto) && normal(sinSkill(ahora)) !== normal(texto))
                return { estado: "compositor-distinto" };
            boton.click();
        }
        // ESC-017: salió si el compositor quedó vacío o apareció el mensaje enviado. Nunca se pulsa de nuevo.
        const hasta = Date.now() + COMPROBAR_MS;
        for (;;) {
            const c = leerCompositor(spec);
            if ((c !== null && normal(c) === "") || enviados() > antes)
                return { estado: "enviado-pulsado", comprobado: true };
            if (Date.now() > hasta)
                return { estado: "enviado-pulsado", comprobado: false };
            await dormir(150);
        }
    }
    const pedidos = new Map();
    w.__ccEnviar = {
        huella: "cc-enviar",
        pedir(json) {
            let p;
            try {
                p = JSON.parse(json);
            }
            catch (e) {
                return `error: el pedido no es JSON (${e instanceof Error ? e.message : String(e)})`;
            }
            // Un pedido que Rust dejó de consultar (venció a los 40 s) no se acumula.
            pedidos.clear();
            pedidos.set(p.id, { estado: "pendiente" });
            enviar(p.spec, p.texto ?? "").then((resultado) => pedidos.set(p.id, { estado: "listo", resultado }), (e) => pedidos.set(p.id, { estado: "error", error: e instanceof Error ? e.message : String(e) }));
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
