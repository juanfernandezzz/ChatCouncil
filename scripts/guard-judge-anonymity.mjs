#!/usr/bin/env node
/**
 * Gate mecánico de la regla dura Q30 (BLUEPRINT, Fase 5 / E2):
 * "el juez NUNCA ve el proveedor real" se hace CUMPLIBLE restringiendo
 * la topología de imports del subsistema del juez — no por convención.
 * Corre en CI como paso propio y localmente vía `pnpm guard:judge`.
 * Cero dependencias a propósito (node:fs puro), calcado de guard:keys.
 *
 * Reglas:
 *  1. build-judge-prompt.ts existe y NO tiene NINGÚN import (módulo
 *     sellado: su input es el tipo anonimizado {label, text} y nada
 *     más — la identidad de proveedor no tiene por dónde entrar).
 *  2. Sólo el ALLOWLIST puede importar build-judge-prompt (el
 *     orquestador, que asevera post-scrub antes de despachar, y el
 *     harness de dev).
 *  3. provider-names.ts (la lista de términos identificatorios) sólo
 *     puede importarse desde anonymize.ts (scrub), run-analysis.ts
 *     (aserción runtime) y el harness — y JAMÁS desde el builder
 *     (cubierto además por la regla 1).
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const BUILDER_PATH = "apps/web/src/lib/judge/build-judge-prompt.ts";
const NAMES_PATH = "apps/web/src/lib/judge/provider-names.ts";

const BUILDER_ALLOWED_IMPORTERS = new Set([
  "apps/web/src/lib/judge/run-analysis.ts",
  "apps/web/src/dev/fase5-harness.ts",
]);
const NAMES_ALLOWED_IMPORTERS = new Set([
  "apps/web/src/lib/judge/anonymize.ts",
  "apps/web/src/lib/judge/run-analysis.ts",
  "apps/web/src/dev/fase5-harness.ts",
]);

const SCAN_ROOTS = ["apps", "packages"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".output", ".wxt", ".git", ".turbo"]);
const ANY_IMPORT_RE = /(?:^|\n)\s*(?:import\s|import\s*\(|export\s+\{[^}]*\}\s+from\s|export\s+\*\s+from\s)|require\s*\(/;
const BUILDER_IMPORT_RE = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'][^"']*build-judge-prompt[^"']*["']/;
const NAMES_IMPORT_RE = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'][^"']*provider-names[^"']*["']/;

function fail(lines) {
  console.error("[guard:judge] FALLO — regla dura Q30 (anonimización estructural):");
  for (const l of lines) console.error("  · " + l);
  console.error(
    "Si un import nuevo es legítimo, agregarlo EXPLÍCITAMENTE al allowlist en scripts/guard-judge-anonymity.mjs — el builder del prompt NUNCA gana imports.",
  );
  process.exit(1);
}

if (!existsSync(join(ROOT, BUILDER_PATH))) {
  fail([`no existe ${BUILDER_PATH} — si el builder se movió, actualizar este guard.`]);
}
if (!existsSync(join(ROOT, NAMES_PATH))) {
  fail([`no existe ${NAMES_PATH} — si la lista se movió, actualizar este guard.`]);
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
      violations.push(`${rel} — fuera del allowlist de importadores de build-judge-prompt`);
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
  `[guard:judge] OK — builder sellado sin imports; build-judge-prompt importado sólo desde: ${[...BUILDER_ALLOWED_IMPORTERS].join(", ")}`,
);
