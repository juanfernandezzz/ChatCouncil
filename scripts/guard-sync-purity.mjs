#!/usr/bin/env node
/**
 * Gate mecánico de la Fase 6 (E7) — complemento de guard:keys.
 * ------------------------------------------------------------------
 * guard:keys ya prohíbe que los paths /drive|sync/i IMPORTEN el
 * key-vault. El vector restante es leer el storage de llaves POR
 * FUERA del vault: este guard rompe el build si cualquier archivo en
 * esos paths menciona localStorage, sessionStorage o el prefijo de
 * storage de llaves. Efecto de diseño deliberado: los módulos de sync
 * no pueden persistir NADA en web storage — su estado vive en Dexie
 * (syncMeta) o en memoria.
 * Cero dependencias a propósito (node:fs puro), mismo patrón que los
 * otros guards.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SCAN_ROOTS = ["apps", "packages"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".output", ".wxt", ".git", ".turbo"]);
const GUARDED_PATH = /(drive|sync)/i;
const FORBIDDEN_CONTENT = [
  { re: /localStorage/, label: "localStorage" },
  { re: /sessionStorage/, label: "sessionStorage" },
  { re: /chatcouncil:byok:key/, label: "prefijo de storage de llaves" },
];

const violations = [];
let guardedCount = 0;

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
    if (!GUARDED_PATH.test(rel)) continue;
    guardedCount++;
    const src = readFileSync(full, "utf8");
    for (const { re, label } of FORBIDDEN_CONTENT) {
      if (re.test(src)) violations.push(`${rel} — contiene ${label}`);
    }
  }
}

for (const root of SCAN_ROOTS) {
  const p = join(ROOT, root);
  if (existsSync(p)) walk(p);
}

if (violations.length > 0) {
  console.error("[guard:sync] FALLO — pureza de storage en paths de sync/drive:");
  for (const v of violations) console.error("  · " + v);
  console.error("El estado de los módulos de sync vive en Dexie (syncMeta) o en memoria — nunca en web storage.");
  process.exit(1);
}
console.log(`[guard:sync] OK — ${guardedCount} archivo(s) en paths sync/drive, sin web storage ni prefijo de llaves`);
