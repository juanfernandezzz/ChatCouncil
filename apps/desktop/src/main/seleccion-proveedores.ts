/**
 * seleccion-proveedores.ts — "Proveedores al iniciar…" (menú Ver, 2026-09-23,
 * pedido de Juan). Qué paneles se cargan la PRÓXIMA vez que abre la app.
 *
 * ARCHIVO APARTE en la carpeta de datos, nunca el registro: el registro es
 * append-only y es el dato de investigación de Juan. Se aplica al reiniciar,
 * no en caliente — abrir y cerrar paneles en caliente es abrir y cerrar
 * particiones, y eso ya costó los logins dos veces.
 *
 * Sin archivo (o ilegible) → `null` → se cargan todos, como siempre.
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
/**
 * 2026-09-29: el verificador de fuentes, rol fuera del pool. Desde D62
 * (2026-10-27) son dos, que verifican lo mismo por separado: GLM y Qwen.
 */
export const VERIFICADOR_1_POR_DEFECTO = "glm";
export const VERIFICADOR_2_POR_DEFECTO = "qwen";
/**
 * 2026-10-02: el redactor, que escribe la respuesta a la pregunta con el
 * material de la ronda. Nunca es del pool ni un verificador; puede ser el
 * integrador (el defecto lo es). Si es otro proveedor, ese sale del pool.
 */
export const REDACTOR_POR_DEFECTO = "deepseek";
export const ERROR_VERIFICADORES_IGUALES = "Los dos verificadores tienen que ser proveedores distintos.";
export const ERROR_ROLES_IGUALES = "El integrador y los verificadores tienen que ser proveedores distintos.";
export const ERROR_ROLES_DESMARCADOS = "El integrador y los verificadores tienen que estar entre los proveedores cargados.";
export const ERROR_REDACTOR_VERIFICADOR = "El redactor y los verificadores tienen que ser proveedores distintos.";
export const ERROR_REDACTOR_DESMARCADO = "El redactor tiene que estar entre los proveedores cargados.";

export interface Roles {
  integrador: string;
  verificador1: string;
  verificador2: string;
  redactor: string;
}

/**
 * Integrador y verificadores guardados. Cada uno cae a su defecto si falta o
 * no es un proveedor conocido; si dos de los tres quedaron iguales (archivo
 * editado a mano: "Guardar" no lo permite), vuelven todos los defectos. Un
 * archivo anterior a D62 trae "verificador": es el verificador 1.
 */
export function leerRoles(userData: string, conocidos: readonly string[]): Roles {
  const defecto = {
    integrador: INTEGRADOR_POR_DEFECTO,
    verificador1: VERIFICADOR_1_POR_DEFECTO,
    verificador2: VERIFICADOR_2_POR_DEFECTO,
    redactor: REDACTOR_POR_DEFECTO,
  };
  const ruta = join(userData, ARCHIVO_SELECCION);
  if (!existsSync(ruta)) return defecto;
  try {
    const { integrador, verificador, verificador1, verificador2, redactor } = JSON.parse(readFileSync(ruta, "utf8")) as Record<string, unknown>;
    const valido = (v: unknown, d: string): string => (typeof v === "string" && conocidos.includes(v) ? v : d);
    const trio = {
      integrador: valido(integrador, defecto.integrador),
      verificador1: valido(verificador1 ?? verificador, defecto.verificador1),
      verificador2: valido(verificador2, defecto.verificador2),
    };
    if (new Set(Object.values(trio)).size < 3) return defecto;
    // Archivo anterior al redactor, o redactor = un verificador: el redactor pasa a ser el integrador.
    const r = valido(redactor, trio.integrador);
    return { ...trio, redactor: r === trio.verificador1 || r === trio.verificador2 ? trio.integrador : r };
  } catch {
    return defecto;
  }
}

/** Los dos verificadores, en orden: el 1 es el que recibe el redactor. */
export function verificadoresDe(roles: Roles): string[] {
  return [roles.verificador1, roles.verificador2];
}

/** El pool de investigadores y operadores: todos, en su orden, MENOS los roles (integrador, verificadores y redactor). */
export function poolDeInvestigadores<T extends string>(todos: readonly T[], roles: Roles): T[] {
  return todos.filter((id) => id !== roles.integrador && !verificadoresDe(roles).includes(id) && id !== roles.redactor);
}

export function guardarSeleccion(
  userData: string,
  conocidos: readonly string[],
  marcados: readonly string[],
  integrador: string = INTEGRADOR_POR_DEFECTO,
  verificador1: string = VERIFICADOR_1_POR_DEFECTO,
  verificador2: string = VERIFICADOR_2_POR_DEFECTO,
  redactor: string = integrador,
): { ok: true } | { ok: false; error: string } {
  const validos = conocidos.filter((id) => marcados.includes(id));
  const verificadores = [verificador1, verificador2];
  if (validos.length === 0) return { ok: false, error: ERROR_SELECCION_VACIA };
  if (verificador1 === verificador2) return { ok: false, error: ERROR_VERIFICADORES_IGUALES };
  if (verificadores.includes(integrador)) return { ok: false, error: ERROR_ROLES_IGUALES };
  if (![integrador, ...verificadores].every((id) => validos.includes(id))) return { ok: false, error: ERROR_ROLES_DESMARCADOS };
  if (verificadores.includes(redactor)) return { ok: false, error: ERROR_REDACTOR_VERIFICADOR };
  if (!validos.includes(redactor)) return { ok: false, error: ERROR_REDACTOR_DESMARCADO };
  writeFileSync(
    join(userData, ARCHIVO_SELECCION),
    JSON.stringify({ proveedores: validos, integrador, verificador1, verificador2, redactor, guardadoEn: new Date().toISOString() }, null, 2),
    "utf8",
  );
  return { ok: true };
}
