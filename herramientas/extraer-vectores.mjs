// Convierte motor/Tests/Referencias.g.cs (repo ChatCouncil-Unity, solo lectura) en un JSON por función bajo tests/vectores/.
// Uso: node herramientas/extraer-vectores.mjs <ruta a Referencias.g.cs>
// Entiende solo el subconjunto de C# que emite motor/Dotnet~/referencias.mjs: cadenas normales, números, true/false/null,
// arreglos { ... } y new T[] { ... }, tuplas ( ... ), una cadena entre paréntesis, a + b y ((char)0xHHHH).ToString().
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const fuente = process.argv[2];
if (!fuente) throw new Error("falta la ruta a Referencias.g.cs");
const bytes = readFileSync(fuente);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const src = bytes.toString("utf8");
const salida = join(dirname(fileURLToPath(import.meta.url)), "..", "tests", "vectores");

let i = 0;
const espacio = () => {
  for (;;) {
    while (i < src.length && /\s/.test(src[i])) i++;
    if (src.startsWith("//", i)) { while (i < src.length && src[i] !== "\n") i++; continue; }
    return;
  }
};
const espera = (t) => { espacio(); if (!src.startsWith(t, i)) throw new Error(`se esperaba ${t} en ${i}: ${src.slice(i, i + 40)}`); i += t.length; };

function cadena() {
  const inicio = ++i;
  while (src[i] !== '"') { if (src[i] === "\\") i++; if (src[i] === "\n" || i >= src.length) throw new Error(`cadena sin cerrar en ${inicio}`); i++; }
  const crudo = src.slice(inicio, i++);
  if (/\\[^nrt"\\u]/.test(crudo.replace(/\\\\/g, ""))) throw new Error(`escape no soportado en ${inicio}`);
  // Los escapes de C# que emite el generador (\n \r \t \" \\ \uXXXX) son los mismos de JSON.
  return JSON.parse(`"${crudo.replace(/[\u0000-\u001f]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"))}"`);
}

function lista(cierre) {
  const items = [];
  espacio();
  while (src[i] !== cierre) { items.push(valor()); espacio(); if (src[i] === ",") { i++; espacio(); } }
  i++;
  return items;
}

// a + b + ...: el generador concatena cadenas con caracteres sueltos (surrogates solos), que JSON guarda como \udXXX.
function valor() {
  let v = primario();
  for (espacio(); src[i] === "+"; espacio()) { i++; v += primario(); }
  return v;
}

function primario() {
  espacio();
  const caracter = /^\(\(char\)0x([0-9A-Fa-f]{1,4})\)\.ToString\(\)/.exec(src.slice(i, i + 40));
  if (caracter) { i += caracter[0].length; return String.fromCharCode(parseInt(caracter[1], 16)); }
  const c = src[i];
  if (c === '"') return cadena();
  if (c === "{") { i++; return lista("}"); }
  if (c === "(") { i++; const v = lista(")"); return v.length === 1 ? v[0] : { tupla: v }; }
  if (src.startsWith("new ", i)) { i = src.indexOf("{", i) + 1; return lista("}"); }
  const m = /^(true|false|null|-?\d+(?:\.\d+)?)[uUlLfFdDmM]*/.exec(src.slice(i, i + 40));
  if (!m) throw new Error(`valor desconocido en ${i}: ${src.slice(i, i + 40)}`);
  i += m[0].length;
  return m[1] === "null" ? null : m[1] === "true" ? true : m[1] === "false" ? false : Number(m[1]);
}

// Nombres de los campos de una tupla: "(uint semilla, int n, int[] orden)[]" -> ["semilla", "n", "orden"].
const nombresDe = (tipo) => {
  if (!tipo.startsWith("(")) return null;
  return tipo.slice(1, tipo.lastIndexOf(")")).split(",").map((p) => p.trim().split(/\s+/).pop());
};
const aObjeto = (v, nombres) => {
  if (!v || !v.tupla) return v;
  if (v.tupla.length !== nombres.length) throw new Error("tupla con otra cantidad de campos");
  return Object.fromEntries(nombres.map((n, k) => [n, v.tupla[k]]));
};

mkdirSync(salida, { recursive: true });
for (const f of readdirSync(salida)) if (f.endsWith(".json")) rmSync(join(salida, f));

const decl = /public static readonly (.+?) (\w+) = /g;
const casos = {};
let m;
while ((m = decl.exec(src))) {
  const [, tipo, nombre] = m;
  i = decl.lastIndex;
  const nombres = nombresDe(tipo);
  let v = valor();
  espera(";");
  decl.lastIndex = i;
  if (Array.isArray(v)) {
    if (nombres) v = v.map((x) => aObjeto(x, nombres));
    casos[nombre] = v.length;
    writeFileSync(join(salida, `${nombre}.json`), "[\n" + v.map((x) => JSON.stringify(x)).join(",\n") + "\n]\n");
  } else {
    if (v && v.tupla) throw new Error(`tupla suelta en ${nombre}`);
    casos[nombre] = 1;
    writeFileSync(join(salida, `${nombre}.json`), JSON.stringify(v) + "\n");
  }
}
writeFileSync(join(salida, "_fuente.json"), JSON.stringify({ fuente: "ChatCouncil-Unity/motor/Tests/Referencias.g.cs", sha256, casos }, null, 2) + "\n");
console.log(`sha256 ${sha256}`);
console.log(`${Object.keys(casos).length} funciones, ${Object.values(casos).reduce((a, b) => a + b, 0)} casos`);
