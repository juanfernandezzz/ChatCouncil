/**
 * seleccion-proveedores.ts — "Proveedores al iniciar…" (menú Ver, 2026-09-23,
 * pedido de Juan). Qué paneles se cargan la PRÓXIMA vez que abre la app.
 *
 * ARCHIVO APARTE en la carpeta de datos, nunca el registro: el registro es
 * append-only y es el dato de investigación de Juan. Se aplica al reiniciar,
 * no en caliente — abrir y cerrar paneles en caliente es abrir y cerrar
 * particiones, y eso ya costó los logins dos veces.
 *
 * Sin archivo (o ilegible) → `null` → se cargan los nueve, como siempre.
 * Sin `electron` a propósito: se prueba con node solo.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ARCHIVO_SELECCION = "seleccion-proveedores.json";
export const ERROR_SELECCION_VACIA = "Tenés que marcar al menos un proveedor.";

export function leerSeleccion(userData: string, conocidos: readonly string[]): string[] | null {
  const ruta = join(userData, ARCHIVO_SELECCION);
  if (!existsSync(ruta)) return null;
  try {
    const { proveedores } = JSON.parse(readFileSync(ruta, "utf8")) as { proveedores?: unknown };
    if (!Array.isArray(proveedores)) return null;
    const validos = conocidos.filter((id) => proveedores.includes(id));
    return validos.length > 0 ? validos : null;
  } catch {
    return null;
  }
}

/** 2026-09-24: el integrador es una preferencia, con deepseek por defecto. */
export const INTEGRADOR_POR_DEFECTO = "deepseek";
export const ERROR_INTEGRADOR_DESMARCADO = "El integrador tiene que estar entre los proveedores cargados.";

/** El integrador guardado, o el de por defecto si no hay archivo o no es un proveedor conocido. */
export function leerIntegrador(userData: string, conocidos: readonly string[]): string {
  const ruta = join(userData, ARCHIVO_SELECCION);
  if (!existsSync(ruta)) return INTEGRADOR_POR_DEFECTO;
  try {
    const { integrador } = JSON.parse(readFileSync(ruta, "utf8")) as { integrador?: unknown };
    return typeof integrador === "string" && conocidos.includes(integrador) ? integrador : INTEGRADOR_POR_DEFECTO;
  } catch {
    return INTEGRADOR_POR_DEFECTO;
  }
}

export function guardarSeleccion(
  userData: string,
  conocidos: readonly string[],
  marcados: readonly string[],
  integrador: string = INTEGRADOR_POR_DEFECTO,
): { ok: true } | { ok: false; error: string } {
  const validos = conocidos.filter((id) => marcados.includes(id));
  if (validos.length === 0) return { ok: false, error: ERROR_SELECCION_VACIA };
  if (!validos.includes(integrador)) return { ok: false, error: ERROR_INTEGRADOR_DESMARCADO };
  writeFileSync(
    join(userData, ARCHIVO_SELECCION),
    JSON.stringify({ proveedores: validos, integrador, guardadoEn: new Date().toISOString() }, null, 2),
    "utf8",
  );
  return { ok: true };
}
