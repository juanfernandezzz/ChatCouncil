#!/usr/bin/env node
/**
 * guard:trazabilidad — gate mecánico de T7 (Fase 3): todo párrafo del
 * informe del integrador tiene que referenciar un hallazgo real.
 *
 * EJECUTA (no sólo lee) `parsearReferenciasIntegrador`
 * (`packages/analysis/src/parsear-referencias-integrador.ts`) contra un
 * informe SEMBRADO, en un proceso Node aparte con
 * `--experimental-strip-types` — mismo patrón que `guard-sellado.mjs` usa
 * para `armarCuerpoConFuentes`, para poder importar el `.ts` fuente directo
 * sin depender de un build previo.
 *
 * El informe sembrado trae, en este orden:
 *  · la línea "TITULO: …" que el integrador escribe primero (Fase 5)
 *  · tres párrafos con referencias válidas, uno de ellos ya en la sección 5
 *  · un párrafo DE LA SECCIÓN 5 sin ninguna referencia
 *  · un párrafo que empieza con "LA TABLA NO ALCANZA" y no tiene referencias
 *  · un párrafo con la referencia H999, que no existe en la tabla
 *
 * ÉXITO: el gate detecta el párrafo sin referencias —también en la sección 5,
 * que no está exenta de la regla—, NO marca como violación ni el párrafo
 * "LA TABLA NO ALCANZA" ni la línea TITULO, y conserva la referencia H999
 * marcada `referenciaInvalida: true` sin descartar su párrafo.
 *
 * Corre en CI como paso propio y localmente vía `pnpm guard:trazabilidad`.
 */

import { existsSync, writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const PARSER_PATH = join(ROOT, "packages/analysis/src/parsear-referencias-integrador.ts");
const LOADER_HOOKS_PATH = join(ROOT, "scripts/_ts-loader-hooks.mjs");

function fail(lines) {
  console.error("[guard:trazabilidad] FALLO:");
  for (const l of lines) console.error("  · " + l);
  process.exit(1);
}

if (!existsSync(PARSER_PATH)) {
  fail([`no existe ${PARSER_PATH.slice(ROOT.length + 1)} — si parsearReferenciasIntegrador se movió, actualizar este gate.`]);
}

// Informe sembrado, cuota cero — nunca se envía nada. Los IDs válidos de
// esta tabla ficticia son H1..H4; H999 no pertenece a ella a propósito.
const INFORME_SEMBRADO = `TITULO: divergencias sobre una dosis

Primer parrafo con una referencia valida sobre una convergencia. [H1]

Segundo parrafo, apoyado en dos hallazgos distintos de la tabla. [H2] [H3]

5. QUE CONVIENE RESCATAR
Lo firme: las respuestas coinciden en esto y ninguna lo contradice. [H4]

Este parrafo de la seccion 5 no trae ninguna referencia y por eso tiene que fallar el gate.

LA TABLA NO ALCANZA para determinar el origen de una de las divergencias, y este parrafo no necesita referencia.

Ultimo parrafo con una referencia inventada que no existe en la tabla. [H999]`;

const FIXTURE_RUNNER = `
import { register } from "node:module";
import { pathToFileURL } from "node:url";
register(pathToFileURL(${JSON.stringify(LOADER_HOOKS_PATH)}).href, import.meta.url);
const { parsearReferenciasIntegrador } = await import(pathToFileURL(${JSON.stringify(PARSER_PATH)}).href);

const idsValidos = ["H1", "H2", "H3", "H4"];
const resultado = parsearReferenciasIntegrador(${JSON.stringify(INFORME_SEMBRADO)}, idsValidos);

const problemas = [];

if (resultado.parrafos.length !== 7) {
  problemas.push("se esperaban 7 parrafos, se obtuvieron " + resultado.parrafos.length);
}

if (resultado.parrafosSinReferencias.length !== 1 || resultado.parrafosSinReferencias[0] !== 4) {
  problemas.push("se esperaba exactamente el parrafo indice 4 (0-based, el de la seccion 5 sin referencias) sin referencias, se obtuvo: " + JSON.stringify(resultado.parrafosSinReferencias));
}

const parrafoTitulo = resultado.parrafos[0];
if (!parrafoTitulo || !parrafoTitulo.esTitulo || parrafoTitulo.sinReferencias) {
  problemas.push("la linea TITULO no se reconocio como exenta de la regla de referencias");
}

const parrafoNoAlcanza = resultado.parrafos[5];
if (!parrafoNoAlcanza || !parrafoNoAlcanza.esLaTablaNoAlcanza || parrafoNoAlcanza.sinReferencias) {
  problemas.push("el parrafo 'LA TABLA NO ALCANZA' no se reconocio como excepcion valida a la regla");
}

const refH999 = resultado.referencias.find((r) => r.hallazgoId === "H999");
if (!refH999 || refH999.referenciaInvalida !== true) {
  problemas.push("H999 tenia que conservarse con referenciaInvalida: true, no descartarse");
}

const ultimoParrafo = resultado.parrafos[6];
if (!ultimoParrafo || ultimoParrafo.sinReferencias) {
  problemas.push("el parrafo con H999 se marco como 'sin referencias' -- una referencia invalida no es lo mismo que ausencia de referencia");
}

const refsValidas = resultado.referencias.filter((r) => ["H1", "H2", "H3", "H4"].includes(r.hallazgoId));
if (refsValidas.some((r) => r.referenciaInvalida)) {
  problemas.push("una referencia valida (H1..H4) se marco como invalida");
}

if (problemas.length > 0) {
  console.error("PROBLEMAS:" + JSON.stringify(problemas));
  process.exit(1);
}
console.log("FIXTURE_OK");
`;

const tmpFile = join(mkdtempSync(join(tmpdir(), "guard-trazabilidad-")), "fixture.mjs");
writeFileSync(tmpFile, FIXTURE_RUNNER, "utf8");
try {
  const salida = execFileSync(process.execPath, ["--experimental-strip-types", tmpFile], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!salida.includes("FIXTURE_OK")) {
    fail([`salida inesperada del runner de fixtures: ${salida.trim()}`]);
  }
} catch (err) {
  const detalle = (err.stdout ?? "") + (err.stderr ?? "");
  fail([`el runner de fixtures de parsearReferenciasIntegrador falló: ${detalle.trim() || err.message}`]);
} finally {
  unlinkSync(tmpFile);
}

console.log(
  "[guard:trazabilidad] OK — sobre un informe sembrado de 7 párrafos: detecta el párrafo sin referencias " +
    "de la sección 5, no exige referencia ni en 'LA TABLA NO ALCANZA' ni en la línea TITULO, y conserva " +
    "una referencia inventada (H999) marcada referenciaInvalida sin descartar su párrafo.",
);
