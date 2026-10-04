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
const INFORME_PATH = join(ROOT, "packages/analysis/src/informe-final.ts");
const LOADER_HOOKS_PATH = join(ROOT, "scripts/_ts-loader-hooks.mjs");

function fail(lines) {
  console.error("[guard:trazabilidad] FALLO:");
  for (const l of lines) console.error("  · " + l);
  process.exit(1);
}

if (!existsSync(PARSER_PATH)) {
  fail([`no existe ${PARSER_PATH.slice(ROOT.length + 1)} — si parsearReferenciasIntegrador se movió, actualizar este gate.`]);
}
if (!existsSync(INFORME_PATH)) {
  fail([`no existe ${INFORME_PATH.slice(ROOT.length + 1)} — si armarInformeFinal se movió, actualizar este gate.`]);
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

/**
 * Regla 2 (2026-10-04) — el otro extremo de la trazabilidad: que el informe
 * ARMADO marque cada H## citado y publique la clave de los [P#].
 *
 * Los dos defectos que esta regla agarra, los dos medidos antes de escribirla:
 *  · `marcarReferencias` exigía el corchete exacto `[H12]`, así que no marcaba
 *    `[CONFIRMA H12]` — una de las formas que el prompt del redactor le PIDE
 *    usar. Un `[CONFIRMA H999]` se contaba como inexistente en la línea de
 *    control del redactor y salía limpio en el cuerpo del informe.
 *  · los `[P#]` que el redactor y el integrador escriben en su prosa no tenían
 *    clave en ninguna parte del informe: "coinciden P3 y P5" era ilegible.
 */
const FIXTURE_INFORME = `
import { register } from "node:module";
import { pathToFileURL } from "node:url";
register(pathToFileURL(${JSON.stringify(LOADER_HOOKS_PATH)}).href, import.meta.url);
const { armarInformeFinal } = await import(pathToFileURL(${JSON.stringify(INFORME_PATH)}).href);

const hallazgos = [
  { codigo: "H1", categoria: "CONVERGENCIA", eje: "HECHOS", respuestasReales: ["chatgpt"], descripcion: "d1", operadorReal: "gemini" },
  { codigo: "H2", categoria: "DIVERGENCIA", eje: "FUENTES", respuestasReales: ["claude"], descripcion: "d2", operadorReal: "grok" },
];
const texto = armarInformeFinal({
  pregunta: "p", fecha: "f", conversacionId: "c", rondaId: "r",
  informeIntegradorCrudo: "TITULO: t\\n5. QUE CONVIENE RESCATAR\\nLo firme [H1] y lo disputado [H2].",
  referenciasEnOrden: [{ codigo: "H1", existe: true }, { codigo: "H2", existe: true }],
  hallazgos,
  participacionOperadores: [{ operadorId: "gemini", estado: "ok", detalle: "1 hallazgos" }],
  condiciones: [
    { proveedorId: "claude", etiquetaModelo: null, caracteresRespuesta: 10, fuentesCitadas: 0, codigoEstable: "P3" },
    { proveedorId: "mistral", etiquetaModelo: null, caracteresRespuesta: 10, fuentesCitadas: 0, codigoEstable: null },
  ],
  integridadEntrega: "x", semilla: "s",
  redaccion: {
    redactorId: "deepseek", controles: ["- control"],
    cuerpo: "Firme [CONFIRMA H1] y tambien [H2], segun P3 y P5. Inventado [CONFIRMA H999] y [H888].",
  },
});

const problemas = [];
const exige = (frag, porque) => { if (!texto.includes(frag)) problemas.push(porque + ' — falta ' + JSON.stringify(frag)); };

exige("[CONFIRMA H1 \\u2713]", "un H## dentro de [CONFIRMA H##] no se marco como existente");
exige("[H2 \\u2713]", "un [H##] suelto dejo de marcarse (regresion)");
exige("[CONFIRMA H999 \\u2717 referencia inexistente]", "un H## inexistente dentro de [CONFIRMA H##] no se marco como inexistente");
exige("[H888 \\u2717 referencia inexistente]", "un [H##] inexistente suelto dejo de marcarse (regresion)");
exige("| P3 | Claude |", "la clave de los [P#] no esta en la tabla de condiciones");
exige("| (sin sello) | Mistral |", "un proveedor sin sello no declara que no lo tiene");

// Ninguna seccion del informe puede quedar vacia por el armado.
const lineas = texto.split("\\n");
let actual = null, cuerpo = [];
const vacias = [];
const cerrar = () => { if (actual !== null && cuerpo.join("").trim().length === 0) vacias.push(actual); };
for (const l of lineas) {
  if (/^## /.test(l)) { cerrar(); actual = l; cuerpo = []; } else if (actual !== null) cuerpo.push(l);
}
cerrar();
if (vacias.length > 0) problemas.push("secciones vacias en el informe armado: " + JSON.stringify(vacias));

/**
 * Los tres casos en que el armado dejaba una seccion vacia o afirmaba algo
 * falso, medidos antes de corregirlos:
 *  · sin informe del integrador -> "Hallazgos referenciados" salia VACIA (259
 *    hallazgos en la tabla, encabezado y nada debajo) y "Hallazgos no
 *    referenciados" decia "El integrador referencio todos los hallazgos."
 *  · tabla vacia -> las dos secciones de hallazgos vacias o mintiendo.
 *  · sin respuestas -> tabla de condiciones con encabezado y cero filas.
 */
const base = {
  pregunta: "p", fecha: "f", conversacionId: "c", rondaId: "r",
  participacionOperadores: [{ operadorId: "gemini", estado: "ok", detalle: "1 hallazgos" }],
  condiciones: [{ proveedorId: "claude", etiquetaModelo: null, caracteresRespuesta: 10, fuentesCitadas: 0, codigoEstable: "P3" }],
  integridadEntrega: "x", semilla: "s",
};
const secciones = (t) => {
  const out = {}; let k = null;
  for (const l of t.split("\\n")) { if (/^## /.test(l)) { k = l; out[k] = []; } else if (k !== null) out[k].push(l); }
  return out;
};
const casos = [
  ["sin informe del integrador", { ...base, informeIntegradorCrudo: null, referenciasEnOrden: [], hallazgos }],
  ["tabla de hallazgos vacia", { ...base, informeIntegradorCrudo: "TITULO: t\\nTexto [H1].", referenciasEnOrden: [{ codigo: "H1", existe: false }], hallazgos: [] }],
  ["integrador que no referencia nada", { ...base, informeIntegradorCrudo: "TITULO: t\\nTexto sin referencias.", referenciasEnOrden: [], hallazgos }],
  ["sin respuestas de investigador", { ...base, informeIntegradorCrudo: null, referenciasEnOrden: [], hallazgos, condiciones: [] }],
];
for (const [nombre, input] of casos) {
  const t = armarInformeFinal(input);
  const s = secciones(t);
  for (const [enc, cuerpo] of Object.entries(s)) {
    if (cuerpo.join("").trim().length === 0) problemas.push(\`caso "\${nombre}": la seccion \${JSON.stringify(enc)} quedo VACIA\`);
  }
  const noRef = (s["## Hallazgos no referenciados"] ?? []).join(" ");
  if (input.informeIntegradorCrudo === null && /referencio todos los hallazgos/.test(noRef)) {
    problemas.push(\`caso "\${nombre}": el informe afirma que el integrador referencio todos los hallazgos, y no hubo integrador\`);
  }
  if (input.hallazgos.length === 0 && /referencio todos los hallazgos/.test(noRef)) {
    problemas.push(\`caso "\${nombre}": el informe afirma que el integrador referencio todos los hallazgos, y la tabla esta vacia\`);
  }
  if (input.condiciones.length === 0 && /\\|---\\|/.test(t)) {
    problemas.push(\`caso "\${nombre}": se imprimio una tabla de condiciones sin ninguna fila\`);
  }
}

/**
 * Las marcas de integridad del archivo ([[CC-MARCA-...]]) son instrumentacion,
 * no contenido: los cuatro prompts le dicen al modelo que las ignore. Un
 * modelo que cita un trozo del archivo tal cual se las trae, y entran al
 * informe por tres caminos — el cuerpo del redactor, la descripcion de un
 * hallazgo (y con ella la tabla, el informe del integrador y su seccion 5) y
 * la cita del verificador. MEDIDO antes de corregirlo: con una marca sembrada
 * en dos de esos caminos, el informe salia con las dos.
 */
const conMarcas = armarInformeFinal({
  ...base,
  informeIntegradorCrudo: "TITULO: t\\n5. QUE CONVIENE RESCATAR\\nLo firme [H1] [[CC-MARCA-0007-tok]] y mas.",
  referenciasEnOrden: [{ codigo: "H1", existe: true }],
  hallazgos: [{ ...hallazgos[0], descripcion: "Coinciden [[CC-MARCA-0042-tok]] en el plazo." }],
  redaccion: { redactorId: "deepseek", controles: ["- c"], cuerpo: "Citando [[CC-MARCA-0099-tok]] el archivo [H1]." },
});
if (/\\[\\[CC-MARCA/.test(conMarcas)) {
  problemas.push("quedaron marcas de integridad [[CC-MARCA-...]] en el informe final");
}
if (!/Se quitaron \\d+ marca\\(s\\) de integridad/.test(conMarcas)) {
  problemas.push("se quitaron marcas y el informe no lo declara");
}
const sinMarcas = armarInformeFinal({
  ...base, informeIntegradorCrudo: "TITULO: t\\nTexto [H1].",
  referenciasEnOrden: [{ codigo: "H1", existe: true }], hallazgos,
});
if (/Se quitaron \\d+ marca/.test(sinMarcas)) {
  problemas.push("un informe sin marcas declara que quito marcas");
}

if (problemas.length > 0) {
  console.error("PROBLEMAS:" + JSON.stringify(problemas));
  process.exit(1);
}
console.log("FIXTURE_OK");
`;

const dirTmp = mkdtempSync(join(tmpdir(), "guard-trazabilidad-"));
function correr(fuente, queEs) {
  const tmpFile = join(dirTmp, "fixture.mjs");
  writeFileSync(tmpFile, fuente, "utf8");
  try {
    const salida = execFileSync(process.execPath, ["--experimental-strip-types", tmpFile], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (!salida.includes("FIXTURE_OK")) {
      fail([`salida inesperada del runner de fixtures de ${queEs}: ${salida.trim()}`]);
    }
  } catch (err) {
    const detalle = (err.stdout ?? "") + (err.stderr ?? "");
    fail([`el runner de fixtures de ${queEs} falló: ${detalle.trim() || err.message}`]);
  } finally {
    unlinkSync(tmpFile);
  }
}

correr(FIXTURE_RUNNER, "parsearReferenciasIntegrador");
correr(FIXTURE_INFORME, "armarInformeFinal");

console.log(
  "[guard:trazabilidad] OK — sobre un informe sembrado de 7 párrafos: detecta el párrafo sin referencias " +
    "de la sección 5, no exige referencia ni en 'LA TABLA NO ALCANZA' ni en la línea TITULO, y conserva " +
    "una referencia inventada (H999) marcada referenciaInvalida sin descartar su párrafo. Y sobre el " +
    "informe ARMADO: marca los H## de [CONFIRMA H##] y de [H##] (existentes e inexistentes), publica la " +
    "clave de los [P#] en la tabla de condiciones, y ninguna sección queda vacía.",
);
