#!/usr/bin/env node
/**
 * Gate de SURROGATES — ningún literal de C# del motor lleva un surrogate suelto.
 *
 * POR QUÉ HACE FALTA. IL2CPP guarda los literales de cadena en UTF-8 dentro de
 * global-metadata.dat y cambia cada surrogate suelto por U+FFFD al compilar
 * (medido en T14: `PRIMARIA` + U+D800 quedó como EF BF BD). Mono y .NET no lo
 * hacen, así que el defecto solo aparece en el player: en motor/Runtime cambia
 * el comportamiento de la app; en motor/Tests ablanda la prueba sin avisar
 * (pasa a probar U+FFFD). Un surrogate suelto se arma en tiempo de ejecución
 * con (char)0xD800, como hace referencias.mjs desde ea3b12c.
 *
 * Mira las cadenas normales e interpoladas y los literales char, decodificando
 * sus escapes. Las cadenas @"..." no decodifican escapes (el \u queda como
 * texto, p. ej. para una regex), así que no cuentan. Salta los comentarios.
 *
 * Uso: node scripts/guard-surrogates.mjs [carpeta...]   (por defecto: motor y unity/Assets)
 * Cero dependencias a propósito.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const BARRA = 92;
const esAlto = (c) => c >= 0xd800 && c <= 0xdbff;
const esBajo = (c) => c >= 0xdc00 && c <= 0xdfff;
const esHex = (ch) => /^[0-9a-fA-F]$/.test(ch);

function* archivosCs(dir) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) {
      if (!nombre.endsWith("~") && nombre !== "bin" && nombre !== "obj") yield* archivosCs(ruta);
    } else if (nombre.endsWith(".cs")) yield ruta;
  }
}

/** Unidades UTF-16 de un literal normal (sin las comillas), con sus escapes decodificados. */
function decodificar(cuerpo) {
  const u = [];
  for (let i = 0; i < cuerpo.length; i++) {
    if (cuerpo.charCodeAt(i) !== BARRA) { u.push(cuerpo.charCodeAt(i)); continue; }
    const t = cuerpo[++i];
    let largo = 0, max = 0;
    if (t === "u") largo = max = 4;
    else if (t === "U") largo = max = 8;
    else if (t === "x") { largo = 1; max = 4; }
    if (!max) { u.push(0x20); continue; } // \n, \", etc.: nunca son surrogates
    let k = 0;
    while (k < max && esHex(cuerpo[i + 1 + k] ?? "")) k++;
    if (k < largo) { u.push(0x20); continue; }
    const cp = parseInt(cuerpo.slice(i + 1, i + 1 + k), 16);
    i += k;
    if (cp > 0xffff) u.push(0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 0x3ff));
    else u.push(cp);
  }
  return u;
}

const sueltos = (u) =>
  u.some((c, i) => (esAlto(c) && !esBajo(u[i + 1])) || (esBajo(c) && !esAlto(u[i - 1])));

/**
 * Literales normales e interpolados ("..." y $"...") y literales char.
 * shortcut: no anida cadenas dentro de los huecos de una interpolación ($"{d["k"]}"); las
 * corta en tramos, que se revisan igual. Pasar a un lexer con pila si eso diera un falso aviso.
 */
function literales(src) {
  const out = [];
  // El código con comentarios y literales en blanco (los saltos se conservan para numerar líneas).
  const codigo = src.split("");
  const blanquear = (desde, hasta) => {
    for (let k = desde; k < hasta && k < codigo.length; k++) if (codigo[k] !== "\n") codigo[k] = " ";
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "/" && src[i + 1] === "/") {
      const fin = src.indexOf("\n", i);
      blanquear(i, fin < 0 ? src.length : fin);
      if (fin < 0) break;
      i = fin;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const fin = src.indexOf("*/", i + 2);
      blanquear(i, fin < 0 ? src.length : fin + 2);
      if (fin < 0) break;
      i = fin + 1;
      continue;
    }
    if (ch !== '"' && ch !== "'") continue;
    const verbatim = ch === '"' && (src[i - 1] === "@" || (src[i - 1] === "$" && src[i - 2] === "@"));
    let j = i + 1;
    if (verbatim) {
      while (j < src.length && !(src[j] === '"' && src[j + 1] !== '"')) j += src[j] === '"' ? 2 : 1;
    } else {
      while (j < src.length && src[j] !== ch && src[j] !== "\n") j += src.charCodeAt(j) === BARRA ? 2 : 1;
      out.push({ linea: src.slice(0, i).split("\n").length, cuerpo: src.slice(i + 1, j) });
    }
    blanquear(i + 1, j);
    i = j;
  }
  return { literales: out, codigo: codigo.join("") };
}

// (char)0xD800 sin .ToString(): pegado a una cadena constante, el compilador de C# pliega la
// concatenación en un literal ("a" + (char)0xD800 + "b"), y ese literal IL2CPP lo corrompe (medido en T16).
// shortcut: también marca una comparación (c == (char)0xD800), que no se pliega; envolverla si aparece.
const CHAR_SURROGATE = /\(char\)\s*(0x[dD][89a-fA-F][0-9a-fA-F]{2}|5[5-7]\d{3})(?!\s*\)\s*\.ToString\(\))/g;
const esSurrogate = (n) => n >= 0xd800 && n <= 0xdfff;

const carpetas = process.argv.length > 2 ? process.argv.slice(2) : ["motor", "unity/Assets"];
const fallos = [];
let revisados = 0;
for (const carpeta of carpetas) {
  for (const ruta of archivosCs(resolve(carpeta))) {
    revisados++;
    const bytes = readFileSync(ruta);
    // Un surrogate escrito tal cual en el archivo (ED A0..BF en UTF-8) tampoco sobrevive.
    for (let i = 0; i + 1 < bytes.length; i++) {
      if (bytes[i] === 0xed && bytes[i + 1] >= 0xa0 && bytes[i + 1] <= 0xbf) fallos.push(`${ruta}: surrogate escrito tal cual en el archivo (byte ${i}).`);
    }
    const { literales: lits, codigo } = literales(bytes.toString("utf8"));
    for (const { linea, cuerpo } of lits) {
      if (sueltos(decodificar(cuerpo))) fallos.push(`${ruta}:${linea}: literal con un surrogate suelto. IL2CPP lo cambia por U+FFFD; armarlo con ((char)0x...).ToString() en tiempo de ejecución.`);
    }
    for (const m of codigo.matchAll(CHAR_SURROGATE)) {
      if (!esSurrogate(Number(m[1]))) continue;
      const linea = codigo.slice(0, m.index).split("\n").length;
      fallos.push(`${ruta}:${linea}: ${m[0]} sin .ToString(): junto a una cadena constante el compilador lo pliega en un literal, que IL2CPP corrompe. Usar ((char)0x...).ToString().`);
    }
  }
}

if (fallos.length) {
  console.error(`guard:surrogates FALLA (${fallos.length}):\n- ${fallos.join("\n- ")}`);
  process.exit(1);
}
console.log(`guard:surrogates OK: ${revisados} archivos .cs sin literales con surrogates sueltos.`);
