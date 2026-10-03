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
export const ERROR_SELECCION_VACIA = "Tienes que marcar al menos un proveedor.";

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
/** 2026-09-29: el verificador de fuentes, tercer rol fuera del pool, con GLM por defecto. */
export const VERIFICADOR_POR_DEFECTO = "glm";
/**
 * 2026-10-02: el redactor, que escribe la respuesta a la pregunta con el
 * material de la ronda. Nunca es del pool ni el verificador; puede ser el
 * integrador (el defecto lo es). Si es otro proveedor, ese sale del pool.
 */
export const REDACTOR_POR_DEFECTO = "deepseek";
export const ERROR_ROLES_IGUALES = "El integrador y el verificador tienen que ser proveedores distintos.";
export const ERROR_ROLES_DESMARCADOS = "El integrador y el verificador tienen que estar entre los proveedores cargados.";
export const ERROR_REDACTOR_VERIFICADOR = "El redactor y el verificador tienen que ser proveedores distintos.";
export const ERROR_REDACTOR_DESMARCADO = "El redactor tiene que estar entre los proveedores cargados.";

export interface Roles {
  integrador: string;
  verificador: string;
  redactor: string;
}

/**
 * Integrador y verificador guardados. Cada uno cae a su defecto si falta o no
 * es un proveedor conocido; si el par guardado quedó con los dos iguales
 * (archivo editado a mano: "Guardar" no lo permite), vuelven los dos defectos.
 */
export function leerRoles(userData: string, conocidos: readonly string[]): Roles {
  const defecto = { integrador: INTEGRADOR_POR_DEFECTO, verificador: VERIFICADOR_POR_DEFECTO, redactor: REDACTOR_POR_DEFECTO };
  const ruta = join(userData, ARCHIVO_SELECCION);
  if (!existsSync(ruta)) return defecto;
  try {
    const { integrador, verificador, redactor } = JSON.parse(readFileSync(ruta, "utf8")) as Record<string, unknown>;
    const valido = (v: unknown, d: string): string => (typeof v === "string" && conocidos.includes(v) ? v : d);
    const par = { integrador: valido(integrador, defecto.integrador), verificador: valido(verificador, defecto.verificador) };
    if (par.integrador === par.verificador) return defecto;
    // Archivo anterior al redactor, o redactor = verificador: el redactor pasa a ser el integrador.
    const r = valido(redactor, par.integrador);
    return { ...par, redactor: r === par.verificador ? par.integrador : r };
  } catch {
    return defecto;
  }
}

/** El pool de investigadores y operadores: todos, en su orden, MENOS los roles (7-1-1 y el redactor). */
export function poolDeInvestigadores<T extends string>(todos: readonly T[], roles: Roles): T[] {
  return todos.filter((id) => id !== roles.integrador && id !== roles.verificador && id !== roles.redactor);
}

export function guardarSeleccion(
  userData: string,
  conocidos: readonly string[],
  marcados: readonly string[],
  integrador: string = INTEGRADOR_POR_DEFECTO,
  verificador: string = VERIFICADOR_POR_DEFECTO,
  redactor: string = integrador,
): { ok: true } | { ok: false; error: string } {
  const validos = conocidos.filter((id) => marcados.includes(id));
  if (validos.length === 0) return { ok: false, error: ERROR_SELECCION_VACIA };
  if (integrador === verificador) return { ok: false, error: ERROR_ROLES_IGUALES };
  if (!validos.includes(integrador) || !validos.includes(verificador)) return { ok: false, error: ERROR_ROLES_DESMARCADOS };
  if (redactor === verificador) return { ok: false, error: ERROR_REDACTOR_VERIFICADOR };
  if (!validos.includes(redactor)) return { ok: false, error: ERROR_REDACTOR_DESMARCADO };
  writeFileSync(
    join(userData, ARCHIVO_SELECCION),
    JSON.stringify({ proveedores: validos, integrador, verificador, redactor, guardadoEn: new Date().toISOString() }, null, 2),
    "utf8",
  );
  return { ok: true };
}
