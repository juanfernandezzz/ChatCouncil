#!/usr/bin/env node
/**
 * guard:sellado — gate mecánico de la anonimización ESTRUCTURAL.
 *
 * Se llamaba `guard:judge`. El nombre nuevo describe lo que el gate HACE
 * —SELLA el constructor de prompts para que no se importe por la ventana— en
 * vez de un rol que el plan vigente ya no tiene: acá no hay juez ni veredicto,
 * hay INVESTIGADORES, ANALISTAS y OPERADOR (BLUEPRINT §1).
 *
 * Qué sostiene: "quien construye el prompt NUNCA puede ver qué proveedor
 * produjo qué respuesta" deja de ser una convención y pasa a ser una propiedad
 * de la TOPOLOGÍA DE IMPORTS, verificable sin ejecutar nada. Es la lección
 * §7.4 del BLUEPRINT aplicada: un requisito escrito no se hace cumplir solo.
 *
 * Corre en CI como paso propio y localmente vía `pnpm guard:sellado`.
 * Cero dependencias a propósito (node:fs puro).
 *
 * Reglas:
 *  1. build-analyst-prompt.ts existe y NO tiene NINGÚN import (módulo
 *     sellado: su input es el tipo anonimizado {label, text} y nada
 *     más — la identidad de proveedor no tiene por dónde entrar).
 *  2. Sólo el ALLOWLIST puede importar build-analyst-prompt.
 *  3. provider-names.ts (la lista de términos identificatorios) sólo
 *     puede importarse desde anonymize.ts (scrub) y el índice del
 *     paquete — y JAMÁS desde el builder (cubierto además por la regla 1).
 *  4. (T3, Fase 3) `armarCuerpoConFuentes` (`packages/analysis/src/
 *     cuerpo-operador.ts`) es la pieza que YA cubre el camino de la parte 2
 *     que la regla PENDIENTE de abajo pedía: arma el cuerpo con las URL
 *     citadas y TIRA si ese cuerpo delata a un proveedor por URL. Este gate
 *     la EJECUTA (no sólo lee su código) contra dos fixtures — uno limpio,
 *     uno que filtra a propósito (`?ref=chatgpt`) — en un proceso Node
 *     aparte con `--experimental-strip-types`, para no necesitar un build
 *     previo. Si el fixture limpio tira, o el que filtra NO tira, el gate
 *     falla: es la única forma de que "TIRA si filtra" deje de ser una nota
 *     de intención en un comentario.
 *
 * Ya no queda pendiente lo que esta sección decía hasta el 2026-09-14: la
 * anonimización estructural ahora cubre el camino de la parte 2 con
 * mecanismo, no sólo con una promesa de código.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const BUILDER_PATH = "packages/analysis/src/build-analyst-prompt.ts";
const NAMES_PATH = "packages/analysis/src/provider-names.ts";

// Importadores permitidos. La lista se mantiene MINIMA a proposito: cada
// entrada nueva es una via mas por la que la identidad del proveedor podria
// llegar al prompt de los analistas. `index.ts` re-exporta y por eso figura.
const BUILDER_ALLOWED_IMPORTERS = new Set([
  "packages/analysis/src/index.ts",
]);
const NAMES_ALLOWED_IMPORTERS = new Set([
  "packages/analysis/src/anonymize.ts",
  "packages/analysis/src/index.ts",
]);

const SCAN_ROOTS = ["apps", "packages"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".output", ".wxt", ".git", ".turbo"]);
const ANY_IMPORT_RE = /(?:^|\n)\s*(?:import\s|import\s*\(|export\s+\{[^}]*\}\s+from\s|export\s+\*\s+from\s)|require\s*\(/;
const BUILDER_IMPORT_RE = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'][^"']*build-analyst-prompt[^"']*["']/;
const NAMES_IMPORT_RE = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'][^"']*provider-names[^"']*["']/;

function fail(lines) {
  console.error("[guard:sellado] FALLO — anonimizacion estructural:");
  for (const l of lines) console.error("  · " + l);
  console.error(
    "Si un import nuevo es legítimo, agregarlo EXPLÍCITAMENTE al allowlist en scripts/guard-sellado.mjs — el builder del prompt NUNCA gana imports.",
  );
  process.exit(1);
}

if (!existsSync(join(ROOT, BUILDER_PATH))) {
  fail([`no existe ${BUILDER_PATH} — si el builder se movió, actualizar este gate.`]);
}
if (!existsSync(join(ROOT, NAMES_PATH))) {
  fail([`no existe ${NAMES_PATH} — si la lista se movió, actualizar este gate.`]);
}

const violations = [];

// Regla 1: el builder es un módulo sellado — cero imports de cualquier tipo.
const builderSrc = readFileSync(join(ROOT, BUILDER_PATH), "utf8");
if (ANY_IMPORT_RE.test(builderSrc)) {
  violations.push(`${BUILDER_PATH} contiene un import/require — el builder del prompt es un módulo SELLADO sin imports por diseño`);
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry)) continue;
    const rel = full.slice(ROOT.length + 1).replaceAll("\\", "/");
    if (rel === BUILDER_PATH || rel === NAMES_PATH) continue;
    const src = readFileSync(full, "utf8");
    if (BUILDER_IMPORT_RE.test(src) && !BUILDER_ALLOWED_IMPORTERS.has(rel)) {
      violations.push(`${rel} — fuera del allowlist de importadores de build-analyst-prompt`);
    }
    if (NAMES_IMPORT_RE.test(src) && !NAMES_ALLOWED_IMPORTERS.has(rel)) {
      violations.push(`${rel} — fuera del allowlist de importadores de provider-names`);
    }
  }
}

for (const root of SCAN_ROOTS) {
  const p = join(ROOT, root);
  if (existsSync(p)) walk(p);
}

// Regla 4: EJECUTAR (no sólo leer) `armarCuerpoConFuentes` contra un fixture
// limpio y uno que filtra a propósito. Un proceso Node aparte, con
// `--experimental-strip-types`, para poder importar el `.ts` fuente
// directo sin depender de que haya un build previo — el mismo patrón que
// ya usan las verificaciones offline de T1/T2 en esta ronda.
const CUERPO_OPERADOR_PATH = join(ROOT, "packages/analysis/src/cuerpo-operador.ts");
const LOADER_HOOKS_PATH = join(ROOT, "scripts/_ts-loader-hooks.mjs");
const FIXTURE_RUNNER = `
import { register } from "node:module";
import { pathToFileURL } from "node:url";
// cuerpo-operador.ts importa "./anonymize" SIN extension (moduleResolution
// "bundler", como el resto del repo) -- el resolvedor nativo de Node no lo
// sigue sin este hook. Ver scripts/_ts-loader-hooks.mjs.
register(pathToFileURL(${JSON.stringify(LOADER_HOOKS_PATH)}).href, import.meta.url);
const { armarCuerpoConFuentes } = await import(pathToFileURL(${JSON.stringify(CUERPO_OPERADOR_PATH)}).href);

let limpioTiro = false;
try {
  armarCuerpoConFuentes("texto de respuesta sin nada raro", ["https://arxiv.org/abs/2212.10001"]);
} catch {
  limpioTiro = true;
}

let filtranteTiro = false;
try {
  // El dominio mismo delata al proveedor -- algo que limpiarQueryWhitelist
  // (que sólo toca la QUERY) no puede limpiar. Es justo el caso que separa
  // "la lista blanca ya lo resolvió" de "la aserción es la que agarra esto".
  armarCuerpoConFuentes("texto de respuesta", ["https://chatgpt.com/share/abc123"]);
} catch {
  filtranteTiro = true;
}

if (limpioTiro) {
  console.error("FALLO_LIMPIO_TIRO");
  process.exit(1);
}
if (!filtranteTiro) {
  console.error("FALLO_FILTRANTE_NO_TIRO");
  process.exit(1);
}
console.log("REGLA4_OK");
`;

if (!existsSync(CUERPO_OPERADOR_PATH)) {
  fail([`no existe ${CUERPO_OPERADOR_PATH.slice(ROOT.length + 1)} — si armarCuerpoConFuentes se movió, actualizar este gate.`]);
}

const tmpFile = join(mkdtempSync(join(tmpdir(), "guard-sellado-")), "fixture.mjs");
writeFileSync(tmpFile, FIXTURE_RUNNER, "utf8");
try {
  const salida = execFileSync(process.execPath, ["--experimental-strip-types", tmpFile], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!salida.includes("REGLA4_OK")) {
    violations.push(`armarCuerpoConFuentes: salida inesperada del runner de fixtures: ${salida.trim()}`);
  }
} catch (err) {
  const detalle = (err.stdout ?? "") + (err.stderr ?? "");
  if (detalle.includes("FALLO_LIMPIO_TIRO")) {
    violations.push("armarCuerpoConFuentes tira con un cuerpo LIMPIO (falso positivo) — revisar fugasDeProveedorEnUrls");
  } else if (detalle.includes("FALLO_FILTRANTE_NO_TIRO")) {
    violations.push("armarCuerpoConFuentes NO tira con una URL que filtra al proveedor (?ref=chatgpt) — la aserción en tiempo de ejecución no está protegiendo nada");
  } else {
    violations.push(`el runner de fixtures de armarCuerpoConFuentes falló: ${detalle.trim() || err.message}`);
  }
} finally {
  unlinkSync(tmpFile);
}

if (violations.length > 0) fail(violations);
console.log(
  `[guard:sellado] OK — builder sellado sin imports; build-analyst-prompt importado sólo desde: ${[...BUILDER_ALLOWED_IMPORTERS].join(", ")}; ` +
    `armarCuerpoConFuentes deja pasar un cuerpo limpio y TIRA con uno que filtra al proveedor por URL.`,
);
