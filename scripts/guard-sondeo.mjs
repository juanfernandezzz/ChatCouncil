#!/usr/bin/env node
/**
 * Gate de SONDEO — valida el codigo que se INYECTA en la pagina del proveedor.
 *
 * POR QUE HACE FALTA. `FUENTE_SONDEO` es una cadena. El typecheck no la mira:
 * para TypeScript es texto, no codigo. Un parentesis de mas, una coma faltante
 * o una variable sin declarar compilan perfecto y fallan reciEn dentro de la
 * pagina de Juan, en una corrida que cuesta minutos de carga y logins. Es la
 * misma frontera que motivo `guard:specs` —el typecheck no cruza el
 * `JSON.stringify`— aplicada al otro lado del mismo problema (BLUEPRINT §7.4:
 * un requisito recien existe cuando tiene mecanismo).
 *
 * Hace tres cosas:
 *  1. Comprueba que la fuente inyectada PARSEA como JavaScript.
 *  2. Comprueba que NO contiene ninguna forma de enviar. Esa es la linea dura
 *     del sondeo: escribir en un cuadro de texto no gasta cuota ni deja un
 *     mensaje; enviar si, y no se deshace.
 *  3. Comprueba que NO toca credenciales ni almacenamiento de sesion.
 *
 * Cero dependencias a proposito.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const RUTA = "apps/desktop/src/main/probe.ts";
const fuente = readFileSync(join(process.cwd(), RUTA), "utf8");

const ABRE = "const FUENTE_SONDEO = `";
const i = fuente.indexOf(ABRE);
if (i < 0) {
  console.error(`[guard:sondeo] FALLO: no encontre "${ABRE}" en ${RUTA}.`);
  process.exit(1);
}
const desde = i + ABRE.length;
const hasta = fuente.indexOf("`;", desde);
if (hasta < 0) {
  console.error(`[guard:sondeo] FALLO: el literal de FUENTE_SONDEO no cierra en ${RUTA}.`);
  process.exit(1);
}
const cuerpo = fuente.slice(desde, hasta);

// Un acento grave dentro del literal lo CIERRA antes de tiempo, y entonces
// esta extraccion agarra un pedazo equivocado y valida lo que no es. Paso el
// 2026-08-02: un comentario con `guard:artefacto` entre acentos graves rompio
// el literal, el typecheck lo agarro y este gate seguia dando OK sobre un
// fragmento mal cortado. Un gate que valida el texto equivocado es peor que
// no tenerlo.
if (cuerpo.includes("`")) {
  console.error(
    "[guard:sondeo] FALLO: FUENTE_SONDEO contiene un acento grave. Cierra el literal antes " +
      "de tiempo y hace que este gate valide un fragmento equivocado. Ni siquiera en comentarios.",
  );
  process.exit(1);
}

if (cuerpo.includes("${")) {
  console.error(
    "[guard:sondeo] FALLO: FUENTE_SONDEO contiene una interpolacion. Tiene que ser texto " +
      "literal para poder verificarse: los argumentos viajan por la llamada, no por el cuerpo.",
  );
  process.exit(1);
}

const fallos = [];

// 1. ¿Parsea? El literal usa escapes de plantilla (\\d, \\s, \\w) que en la
// cadena real son \d, \s, \w. Se deshacen antes de parsear.
const codigo = cuerpo.replace(/\\\\/g, "\\");
try {
  new Function("return " + codigo);
} catch (e) {
  fallos.push(`la fuente inyectada NO parsea como JavaScript: ${e.message}`);
}

// 2. Nada que envie. El limite esta puesto en ENVIAR, no en escribir: enviar
// consume cuota, deja un mensaje en la conversacion de Juan y no se deshace.
const ENVIO = [
  [".click(", "un clic sobre un control puede enviar el mensaje"],
  ["KeyboardEvent", "una tecla sintetica (Enter) puede enviar el mensaje"],
  [".submit(", "enviar un formulario es enviar"],
  ["requestSubmit", "enviar un formulario es enviar"],
];
for (const [m, motivo] of ENVIO) {
  if (codigo.includes(m)) fallos.push(`aparece "${m}": ${motivo}. El sondeo NUNCA envia.`);
}

// 3. Nada de credenciales.
const CREDENCIALES = ["document.cookie", "localStorage", "sessionStorage", "indexedDB"];
for (const m of CREDENCIALES) {
  if (codigo.includes(m)) {
    fallos.push(`aparece "${m}": el sondeo nunca lee cookies, tokens ni almacenamiento de sesion.`);
  }
}

// 4. Las tres formas de escritura tienen que estar las TRES, y se comprueba
// sobre la LISTA que recorre el bucle, no sobre los nombres sueltos: los
// nombres tambien aparecen en las ramas de `escribirPor` y en un comentario,
// asi que buscarlos sueltos hace pasar el gate por el motivo equivocado
// (§7.7). Comprobado: con la lista recortada a dos metodos, la version que
// buscaba nombres sueltos seguia dando OK.
const LISTA_METODOS = '["execCommand", "paste", "textContent"]';
if (!codigo.includes(LISTA_METODOS)) {
  fallos.push(
    `el bucle de escritura no recorre exactamente ${LISTA_METODOS}: la medicion de §7.22 ` +
      `compara las tres formas o no compara nada.`,
  );
}

if (fallos.length > 0) {
  console.error("[guard:sondeo] FALLO:");
  for (const f of fallos) console.error("  · " + f);
  process.exit(1);
}

console.log(
  `[guard:sondeo] OK — la fuente inyectada (${codigo.length} caracteres) parsea, ` +
    `no envia, no toca credenciales, y mide las tres formas de escritura.`,
);
