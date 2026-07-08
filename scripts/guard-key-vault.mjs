#!/usr/bin/env node
/**
 * Gate mecánico de la regla dura Q10 (BLUEPRINT, Fase 2 / E2a):
 * "las llaves BYOK jamás se sincronizan a Drive" se hace CUMPLIBLE
 * restringiendo QUIÉN puede importar el key-vault — no por convención.
 * Corre en CI como paso propio y localmente vía `pnpm guard:keys`.
 * Cero dependencias a propósito (node:fs puro).
 *
 * Reglas:
 *  1. El vault existe en su ruta canónica (si se mueve, actualizar acá).
 *  2. Sólo los archivos del ALLOWLIST pueden importarlo.
 *  3. Ningún archivo cuyo path matchee /drive|sync/i puede importarlo,
 *     NI figurar en el allowlist (defensa contra ediciones futuras del
 *     propio allowlist cuando llegue la Fase 7).
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const VAULT_PATH = "apps/web/src/lib/key-vault.ts";
const ALLOWED_IMPORTERS = new Set([
  "apps/web/src/lib/byok-client.ts",
  "apps/web/src/dev/ByokTestPanel.tsx",
]);
const SCAN_ROOTS = ["apps", "packages"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".output", ".wxt", ".git", ".turbo"]);
const IMPORT_RE = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'][^"']*key-vault[^"']*["']/;
const FORBIDDEN_PATH = /(drive|sync)/i;

function fail(lines) {
  console.error("[guard:keys] FALLO — regla dura Q10:");
  for (const l of lines) console.error("  · " + l);
  console.error(
    "Si un import nuevo es legítimo, agregarlo EXPLÍCITAMENTE al allowlist en scripts/guard-key-vault.mjs (nunca paths de sync/drive).",
  );
  process.exit(1);
}

if (!existsSync(join(ROOT, VAULT_PATH))) {
  fail([`no existe ${VAULT_PATH} — si el vault se movió, actualizar este guard y su allowlist.`]);
}
for (const p of ALLOWED_IMPORTERS) {
  if (FORBIDDEN_PATH.test(p)) {
    fail([`el allowlist contiene un path de sync/drive: ${p}`]);
  }
}

const violations = [];

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
    if (rel === VAULT_PATH) continue;
    const src = readFileSync(full, "utf8");
    if (!IMPORT_RE.test(src)) continue;
    if (FORBIDDEN_PATH.test(rel)) {
      violations.push(`${rel} — PROHIBIDO (path de sync/drive) importa el key-vault`);
    } else if (!ALLOWED_IMPORTERS.has(rel)) {
      violations.push(`${rel} — fuera del allowlist de importadores del key-vault`);
    }
  }
}

for (const root of SCAN_ROOTS) {
  const p = join(ROOT, root);
  if (existsSync(p)) walk(p);
}

if (violations.length > 0) fail(violations);
console.log(
  `[guard:keys] OK — key-vault importado sólo desde: ${[...ALLOWED_IMPORTERS].join(", ")}`,
);
