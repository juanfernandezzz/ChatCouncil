#!/usr/bin/env node
/**
 * Gate de DOMINIO — la dirección de las dependencias.
 *
 * `docs/BLUEPRINT.md` §4 declara que `packages/` no depende de `apps/` y que
 * eso está "verificada por gate". Al abrir la Fase 2 se leyeron los tres
 * scripts que había y ese gate NO EXISTÍA: era una nota de intención dentro
 * del documento que prohíbe las notas de intención (§7.4). Esto lo repara.
 *
 * Comprueba dos cosas:
 *  1. Ningún archivo bajo `packages/` importa de `apps/`. Si la flecha se da
 *     vuelta, el modelo deja de poder irse a otro lado sin arrastrar la
 *     aplicación de escritorio detrás, que es el argumento de portabilidad
 *     de §3.
 *  2. `packages/domain/` no importa NADA de Electron, del DOM ni de `node:*`.
 *     El modelo de datos es TypeScript puro: si empieza a saber de sistema de
 *     archivos, deja de ser un modelo y pasa a ser media aplicación.
 *
 * Cero dependencias, a propósito.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const PAQUETES = join(ROOT, "packages");

function archivosTs(dir) {
  const salida = [];
  for (const nombre of readdirSync(dir)) {
    if (nombre === "node_modules" || nombre.startsWith(".")) continue;
    const p = join(dir, nombre);
    if (statSync(p).isDirectory()) salida.push(...archivosTs(p));
    else if (nombre.endsWith(".ts") || nombre.endsWith(".tsx")) salida.push(p);
  }
  return salida;
}

if (!existsSync(PAQUETES)) {
  console.error("[guard:dominio] FALLO: no encontre la carpeta packages/.");
  process.exit(1);
}

const fallos = [];
const archivos = archivosTs(PAQUETES);

// Sólo el especificador de un import/export/require, no cualquier mención en
// un comentario: un gate que salta por una palabra en la prosa se apaga solo.
const ESPECIFICADORES = /(?:^|\n)\s*(?:import|export)[\s\S]{0,200}?from\s+["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)|import\(\s*["']([^"']+)["']\s*\)/g;

function especificadoresDe(src) {
  const out = [];
  let m;
  ESPECIFICADORES.lastIndex = 0;
  while ((m = ESPECIFICADORES.exec(src)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  return out.filter(Boolean);
}

const PROHIBIDO_EN_DOMINIO = [
  ["electron", "el modelo de datos no sabe de Electron"],
  ["node:", "el modelo de datos no toca el sistema de archivos ni ningun modulo de Node"],
  ["@chatcouncil/providers", "el dominio no depende de los proveedores; la flecha va al reves"],
];

for (const archivo of archivos) {
  const rel = relative(ROOT, archivo).replace(/\\/g, "/");
  const src = readFileSync(archivo, "utf8");
  const specs = especificadoresDe(src);

  for (const spec of specs) {
    if (spec.startsWith("apps/") || spec.includes("/apps/") || /(^|\/)\.\.\/\.\.\/apps\//.test(spec)) {
      fallos.push(`${rel} importa de apps/ ("${spec}"): packages/ nunca depende de apps/.`);
    }
  }

  if (rel.startsWith("packages/domain/")) {
    for (const [prohibido, motivo] of PROHIBIDO_EN_DOMINIO) {
      if (specs.some((s) => s === prohibido || s.startsWith(prohibido))) {
        fallos.push(`${rel} importa "${prohibido}": ${motivo}.`);
      }
    }
  }
}

if (fallos.length > 0) {
  console.error("[guard:dominio] FALLO:");
  for (const f of fallos) console.error("  · " + f);
  process.exit(1);
}

console.log(
  `[guard:dominio] OK — ${archivos.length} archivos bajo packages/; ninguno importa de apps/, ` +
    `y packages/domain/ sigue sin Electron, sin DOM y sin node.`,
);
