#!/usr/bin/env node
/**
 * Gate de SPECS — valida `packages/providers/src/specs.json` contra el
 * contrato que el preload espera.
 *
 * POR QUÉ HACE FALTA. `completion` pasó a ser una unión discriminada de
 * verdad, pero las specs viajan al preload como JSON serializado
 * (`executeJavaScript(... JSON.stringify(spec) ...)`). El typecheck NO cruza
 * esa frontera: una spec con `"kind": "sin-indicador-conocido"`, o con
 * `element-gone` y sin `selector`, compila perfecto y falla en ejecución
 * — silenciosamente, que es lo peor.
 *
 * Es la lección §7.4 aplicada a sí misma: el requisito recién existe cuando
 * tiene mecanismo. La versión anterior de este contrato tipaba `kind` como
 * `string`, nadie lo ramificaba, y por eso dos proveedores quedaron con un
 * `kind` decorativo durante toda una fase sin que nada lo delatara.
 *
 * Cero dependencias a propósito.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const RUTA = "packages/providers/src/specs.json";
const raw = JSON.parse(readFileSync(join(process.cwd(), RUTA), "utf8"));
const specs = raw.specs ?? {};

const fallos = [];
const resumen = [];

for (const [id, spec] of Object.entries(specs)) {
  const donde = `${RUTA} → ${id}`;

  for (const campo of ["newConversationUrl", "composer", "submit", "assistantMessage", "completion"]) {
    if (spec[campo] == null) fallos.push(`${donde}: falta "${campo}"`);
  }

  const c = spec.completion;
  if (c == null) continue;

  if (c.kind === "element-gone") {
    if (typeof c.selector !== "string" || c.selector.length === 0) {
      fallos.push(`${donde}: completion "element-gone" SIN selector. Ese kind existe justamente porque hay un indicador observable; sin selector no observa nada.`);
    }
    resumen.push(`${id}: fin OBSERVADO`);
  } else if (c.kind === "quiescence") {
    // Piso deliberado. Se midio que 7 s de pausa alcanzan para truncar una
    // respuesta, asi que una ventana chica en un proveedor que INFIERE el fin
    // es un truncado esperando ocurrir.
    if (!(typeof c.quiescenceMs === "number" && c.quiescenceMs >= 10_000)) {
      fallos.push(`${donde}: completion "quiescence" exige quiescenceMs >= 10000 (tiene ${JSON.stringify(c.quiescenceMs)}). Sin indicador observable, el fin se infiere de la quietud: una ventana corta trunca la respuesta.`);
    }
    if (typeof spec._notaFin !== "string" || spec._notaFin.length === 0) {
      fallos.push(`${donde}: completion "quiescence" exige "_notaFin" que explique por que no hay indicador y como se eligio la ventana.`);
    }
    resumen.push(`${id}: fin INFERIDO (${c.quiescenceMs} ms)`);
  } else {
    fallos.push(`${donde}: completion.kind ${JSON.stringify(c.kind)} no existe. Los unicos validos son "element-gone" y "quiescence".`);
  }

  if (typeof c.quiescenceMs !== "number") {
    fallos.push(`${donde}: completion.quiescenceMs tiene que ser un numero.`);
  }

  // Selectores por aria-label sin nota de idioma: es la trampa que costo la
  // derivacion de claude y gemini (§7).
  const texto = JSON.stringify(spec);
  if (texto.includes("aria-label=") && typeof spec._notaIdioma !== "string") {
    fallos.push(`${donde}: usa un selector por aria-label —que es LOCALIZADO— y no declara "_notaIdioma" con el idioma de la cuenta con la que se derivo.`);
  }
}

if (fallos.length > 0) {
  console.error("[guard:specs] FALLO:");
  for (const f of fallos) console.error("  · " + f);
  process.exit(1);
}

console.log(`[guard:specs] OK — ${Object.keys(specs).length} proveedores validos. ${resumen.join("; ")}.`);
