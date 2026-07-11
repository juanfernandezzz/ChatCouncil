/**
 * No hay router todavía (Fase 4 no lo pide; queda para cuando haga
 * falta URL por conversación). Sin router, un reload no tiene de dónde
 * leer "qué conversación estaba abierta" — esto guarda sólo ESE puntero
 * (un id, nada de contenido) para que el criterio de aceptación
 * ("recargar y recuperar") tenga algo que recuperar. El contenido real
 * siempre sale de Dexie; esto nunca cachea Rounds/Replies.
 */
const KEY = "chatcouncil:last-conversation-id";

export function getLastConversationId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setLastConversationId(id: string | null): void {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    // localStorage no disponible (modo privado, etc.) — degradar en silencio no rompe nada crítico.
  }
}
