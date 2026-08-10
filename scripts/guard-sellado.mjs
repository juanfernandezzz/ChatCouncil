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
 *
 * PENDIENTE DE LA FASE 3, anotado acá para que no se pierda: la
 * anonimización va ANTES de los analistas, así que este sello tiene que
 * extenderse al camino de la parte 2 cuando ese camino exista. Mientras no
 * exista, no se declara cubierto: una regla declarada "verificada por gate"
 * cuyo gate no la cubre es exactamente el defecto que este proyecto ya tuvo.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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

if (violations.length > 0) fail(violations);
console.log(
  `[guard:sellado] OK — builder sellado sin imports; build-analyst-prompt importado sólo desde: ${[...BUILDER_ALLOWED_IMPORTERS].join(", ")}`,
);
