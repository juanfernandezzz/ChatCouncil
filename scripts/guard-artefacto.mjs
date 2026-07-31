#!/usr/bin/env node
/**
 * Gate de ARTEFACTO — BLUEPRINT §6 ("compilar no es embarcar") y la lección
 * §7.7 (un `defineUnlistedScript` hizo que Rollup se llevara un módulo
 * entero por tree-shaking, con el build en verde).
 *
 * Verifica que lo COMPILADO contenga los marcadores de cada capacidad. No
 * mira el fuente: el fuente ya lo mira el typecheck, y el fuente no es lo que
 * se ejecuta.
 *
 * REGLA PARA ELEGIR MARCADORES (§7.7, cinco formas comprobadas en que un gate
 * miente): sólo **literales de cadena ASCII** que el código vivo contenga tal
 * cual. Nunca nombres de identificadores —se renombran al minificar—, nunca
 * texto con acentos —se escapa a \\uXXXX—, y nunca símbolos exportados sin
 * uso —se eliminan.
 *
 * Cero dependencias a propósito.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const BASE = "apps/desktop/out";

/** archivo → marcadores que TIENEN que estar en el compilado. */
const EXIGIDO = {
  "main/index.js": [
    "cc:investigadores",
    "cc:difundir",
    "cc:leer",
    "cc:sesiones",
    "persist:",
    "--cc-test",
    "--cc-probe",
    "--cc-login",
    "CC_TEST_JSON",
    "CC_PROBE_JSON",
    // Del test-runner y del probe: prueba que NO se los llevó el tree-shaking.
    "continuidad",
    "indeterminada",
    "shadowRootsAbiertos",
    "data-message-author-role",
    // Gate de modelo de pruebas: que exista en el compilado, no solo en el fuente.
    "gate de modelo de pruebas",
  ],
  // "contenteditable" NO sirve como marcador: en el preload existe sólo como
  // miembro de un tipo, y los tipos se borran. El gate lo rechazó en su
  // primera corrida, que es exactamente para lo que está.
  "preload/provider.cjs": ["__ccProvider", "beforeinput", "insertText", "aria-disabled"],
  "preload/ui.cjs": ["cc:investigadores", "cc:difundir", "cc:leer", "cc:sesiones"],
  "renderer/index.html": ["no-preguntar", "confirmacion", "paneles"],
};

/** Marcadores que NO pueden aparecer: el sondeo jamás toca credenciales. */
const PROHIBIDO = {
  "main/index.js": ["document.cookie", "localStorage", "sessionStorage"],
  "preload/provider.cjs": ["document.cookie", "localStorage", "sessionStorage"],
};

const fallos = [];

for (const [rel, marcadores] of Object.entries(EXIGIDO)) {
  const p = join(ROOT, BASE, rel);
  if (!existsSync(p)) {
    fallos.push(`${BASE}/${rel} — no existe. Correr el build antes del gate.`);
    continue;
  }
  const src = readFileSync(p, "utf8");
  for (const m of marcadores) {
    if (!src.includes(m)) {
      fallos.push(`${BASE}/${rel} — falta el marcador "${m}" en el COMPILADO (build verde, capacidad ausente)`);
    }
  }
}

for (const [rel, marcadores] of Object.entries(PROHIBIDO)) {
  const p = join(ROOT, BASE, rel);
  if (!existsSync(p)) continue;
  const src = readFileSync(p, "utf8");
  for (const m of marcadores) {
    if (src.includes(m)) {
      fallos.push(`${BASE}/${rel} — aparece "${m}": el codigo NUNCA toca credenciales ni almacenamiento de sesion`);
    }
  }
}

if (fallos.length > 0) {
  console.error("[guard:artefacto] FALLO:");
  for (const f of fallos) console.error("  · " + f);
  process.exit(1);
}

const total = Object.values(EXIGIDO).reduce((n, a) => n + a.length, 0);
console.log(`[guard:artefacto] OK — ${total} marcadores presentes en el compilado; sin accesos a credenciales.`);
