"use strict";
// PART-030: la lectura con assistantMessage.pick = "todosDesdeUsuario" (Muse responde en varios mensajes): junta todos
// los mensajes del asistente que siguen al último mensaje del usuario. Usa las funciones de pagina.js (inyectado antes);
// sin ellas no lee. No envía nada. Devuelve lo mismo que leer de pagina.js, con `text` y `html` de todos esos mensajes.
(() => {
    const w = window;
    if (w.__ccTodos?.huella === "cc-todos")
        return;
    async function leerTodos(spec) {
        if (typeof leer !== "function" || typeof buscarTodos !== "function" || typeof textoDelAsistente !== "function")
            throw new Error("pagina.js no está cargado: no se lee");
        const base = await leer(spec);
        const usuarios = buscarTodos(spec.userMessage?.selector);
        const ultimo = usuarios[usuarios.length - 1] ?? null;
        // Sin mensaje del usuario que anclar, no se devuelve una lectura que parezca completa.
        if (!ultimo)
            return { ...base, error: "no se encontró el mensaje del usuario: no se sabe desde dónde leer" };
        const despues = buscarTodos(spec.assistantMessage.selector).filter((n) => !ultimo.contains(n) && (ultimo.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
        // Un mensaje anidado en otro se lee una sola vez, con el que lo contiene.
        const nodos = despues.filter((n) => !despues.some((o) => o !== n && o.contains(n)));
        // Si el asistente aún no respondió a ese mensaje, no se devuelve la respuesta anterior.
        return {
            ...base,
            text: nodos.map((n) => textoDelAsistente(spec, n)).filter((t) => t.trim() !== "").join("\n\n"),
            html: nodos.length > 0 ? nodos.map((n) => n.outerHTML).join("\n") : null,
        };
    }
    const pedidos = new Map();
    w.__ccTodos = {
        huella: "cc-todos",
        pedir(json) {
            let p;
            try {
                p = JSON.parse(json);
            }
            catch (e) {
                return `error: el pedido no es JSON (${e instanceof Error ? e.message : String(e)})`;
            }
            pedidos.clear();
            pedidos.set(p.id, { estado: "pendiente" });
            leerTodos(p.spec).then((resultado) => pedidos.set(p.id, { estado: "listo", resultado }), (e) => pedidos.set(p.id, { estado: "error", error: e instanceof Error ? e.message : String(e) }));
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
