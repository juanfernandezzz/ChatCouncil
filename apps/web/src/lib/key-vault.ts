/**
 * key-vault — custodia de API keys BYOK en la SPA (Fase 2, E2a + Q10)
 * ------------------------------------------------------------------
 * REGLA DURA (Q10, Apéndice del BLUEPRINT): las llaves JAMÁS se
 * sincronizan a Google Drive. Acá se hace CUMPLIBLE por estructura, no
 * por convención:
 *   · Este módulo es el ÚNICO que toca el storage de llaves.
 *   · Sólo pueden importarlo los archivos del allowlist de
 *     `scripts/guard-key-vault.mjs` (gate mecánico: CI ROMPE si el
 *     futuro módulo de sync — o cualquier otro no listado — lo importa).
 *   · Nada acá loggea ni serializa la llave; `getKey()` la expone el
 *     tiempo justo de armar la request (builder de adapters). Para UI
 *     existe `maskKey()`.
 *
 * Persistencia (sub-decisión aprobada de E2a): localStorage por
 * defecto, con opt-out POR PROVEEDOR a sessionStorage ("no persistir":
 * la llave muere con la pestaña). El flag de persistencia vive siempre
 * en localStorage (no es secreto). Escribir en un storage LIMPIA el
 * otro: nunca dos copias divergentes.
 *
 * XSS: llaves en el origen web son la superficie clásica de todo
 * BYOK-SPA — trade-off asumido explícitamente en la entrevista (E2a
 * frente a custodiar en la extensión). Mitigación estructural: módulo
 * único + gate; operativa: llaves revocables del lado del proveedor.
 */

const KEY_PREFIX = "chatcouncil:byok:key:";
const PERSIST_PREFIX = "chatcouncil:byok:persist:";

/** Exportado para el guard y los gates de artefacto — NO para leer
 * llaves por fuera de esta API. */
export const KEY_VAULT_STORAGE_PREFIX = KEY_PREFIX;

function local(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null; // storage deshabilitado (modo privado agresivo, etc.)
  }
}

function session(): Storage | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null;
  }
}

export function isPersisted(providerId: string): boolean {
  return local()?.getItem(`${PERSIST_PREFIX}${providerId}`) !== "false"; // default: persistir
}

export function getKey(providerId: string): string | null {
  const k = `${KEY_PREFIX}${providerId}`;
  return session()?.getItem(k) ?? local()?.getItem(k) ?? null;
}

export function hasKey(providerId: string): boolean {
  return getKey(providerId) !== null;
}

export function setKey(providerId: string, apiKey: string, opts?: { persist?: boolean }): void {
  const persist = opts?.persist ?? true;
  const k = `${KEY_PREFIX}${providerId}`;
  try {
    local()?.setItem(`${PERSIST_PREFIX}${providerId}`, String(persist));
    if (persist) {
      local()?.setItem(k, apiKey);
      session()?.removeItem(k);
    } else {
      session()?.setItem(k, apiKey);
      local()?.removeItem(k);
    }
  } catch {
    // Diagnóstico SIN la llave (jamás en logs); el caller lo detecta
    // porque hasKey() queda en false.
    console.warn("[key-vault] no se pudo guardar la llave (storage no disponible o lleno)");
  }
}

export function clearKey(providerId: string): void {
  const k = `${KEY_PREFIX}${providerId}`;
  local()?.removeItem(k);
  session()?.removeItem(k);
}

/** Representación segura para UI: nunca la llave completa. */
export function maskKey(providerId: string): string | null {
  const key = getKey(providerId);
  if (!key) return null;
  const tail = key.length > 4 ? key.slice(-4) : "";
  return `••••${tail} · ${key.length} chars`;
}
