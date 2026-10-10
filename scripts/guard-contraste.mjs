#!/usr/bin/env node
/**
 * Gate de CONTRASTE — cada par de colores de la interfaz cumple WCAG 2.2 AA, en los dos temas.
 *
 * POR QUÉ HACE FALTA. T18 (plan, parte 5) pide que el contraste de cada par se mida, y una
 * tabla escrita a mano deja de ser cierta con el primer color que se toque. Este gate lee los
 * colores de la única hoja de tokens (unity/Assets/Interfaz/Tokens.uss): el tema claro en
 * `:root` y el oscuro en `.tema-oscuro`, que hereda lo que no redefine.
 *
 * Umbrales: 4,5:1 para texto (WCAG 1.4.3); 3:1 para bordes de controles, el foco y el contorno
 * del botón primario (WCAG 1.4.11). Los estados se exigen a 4,5 porque su palabra puede ir en
 * su color.
 *
 * Uso: node scripts/guard-contraste.mjs [--tabla]   (--tabla imprime la medición en Markdown)
 * Cero dependencias a propósito.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const HOJA = resolve("unity/Assets/Interfaz/Tokens.uss");

/** Los colores (hex de 6 dígitos) de un bloque de la hoja. */
function colores(css, selector) {
  const i = css.indexOf(selector + " {");
  if (i < 0) throw new Error(`falta el bloque ${selector} en ${HOJA}`);
  const bloque = css.slice(i, css.indexOf("}", i));
  return Object.fromEntries([...bloque.matchAll(/--(color-[\w-]+):\s*#([0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]));
}

// Luminancia relativa y contraste, como los define WCAG 2.2 (sección "Definitions").
const lineal = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminancia = (hex) => {
  const [r, g, b] = [0, 2, 4].map((k) => lineal(parseInt(hex.slice(k, k + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const FONDOS = ["color-fondo", "color-superficie", "color-superficie-2"];
const ESTADOS = ["por-pegar", "falta-enviar", "respondiendo", "terminado", "capturado", "problema"].map((e) => "color-estado-" + e);

/** [primer plano, fondo, umbral, para qué] */
const PARES = [
  ...["color-texto", "color-texto-2", ...ESTADOS].flatMap((t) => FONDOS.map((f) => [t, f, 4.5, "texto"])),
  ["color-sobre-primario", "color-primario", 4.5, "texto del botón primario"],
  ...FONDOS.map((f) => ["color-borde-control", f, 3, "borde de un control"]),
  ...["color-fondo", "color-superficie"].map((f) => ["color-primario", f, 3, "contorno del botón primario"]),
  ...[...FONDOS, "color-primario"].map((f) => ["color-foco", f, 3, "indicador de foco"]),
];

const css = readFileSync(HOJA, "utf8");
const claro = colores(css, ":root");
const temas = { claro, oscuro: { ...claro, ...colores(css, ".tema-oscuro") } };
const filas = [];
for (const [tema, c] of Object.entries(temas))
  for (const [a, b, umbral, uso] of PARES) {
    if (!c[a] || !c[b]) throw new Error(`tema ${tema}: falta --${c[a] ? b : a} en ${HOJA}`);
    filas.push({ tema, a, b, umbral, uso, r: contraste(c[a], c[b]), ca: c[a], cb: c[b] });
  }

if (process.argv.includes("--tabla")) {
  console.log("| Tema | Primer plano | Fondo | Uso | Contraste | Mínimo |\n|---|---|---|---|---|---|");
  for (const f of filas) console.log(`| ${f.tema} | --${f.a} #${f.ca} | --${f.b} #${f.cb} | ${f.uso} | ${f.r.toFixed(2)}:1 | ${f.umbral}:1 |`);
}
const malos = filas.filter((f) => f.r < f.umbral);
for (const f of malos) console.error(`FALLA ${f.tema}: --${f.a} sobre --${f.b} = ${f.r.toFixed(2)}:1 (mínimo ${f.umbral}:1, ${f.uso})`);
if (malos.length) process.exit(1);
console.log(`guard:contraste OK: ${filas.length} pares en dos temas, todos sobre su mínimo WCAG 2.2 AA.`);
