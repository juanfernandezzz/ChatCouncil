#!/usr/bin/env node
/**
 * Valores de referencia del código TypeScript actual (packages/), para que las
 * pruebas del motor en C# comprueben que el port conserva los algoritmos.
 * Ejecuta las funciones reales con entradas FIJAS y escribe Tests/Referencias.g.cs.
 * Determinista: dos corridas dan el mismo archivo byte a byte.
 *
 *   node motor/Dotnet~/referencias.mjs
 */
import { register } from "node:module";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
register(pathToFileURL(join(RAIZ, "scripts/_ts-loader-hooks.mjs")).href, import.meta.url);
const analisis = await import(pathToFileURL(join(RAIZ, "packages/analysis/src/index.ts")).href);

/** Literal de C#. JSON ya escapa lo que C# exige, salvo U+2028/U+2029, que C# toma como salto de línea. */
const cs = (s) => [0x2028, 0x2029].reduce((t, c) => t.split(String.fromCharCode(c)).join(String.fromCharCode(92) + "u" + c.toString(16)), JSON.stringify(s));

const SEMILLAS = ["", "abc", "0f8fad5b-d9cb-469f-a165-70867728950e", "ñandú", "\u{1F600} con emoji", "salto" + String.fromCharCode(0x2028) + "de linea"];

const archivo = `// Generado por motor/Dotnet~/referencias.mjs a partir de packages/. No editar a mano.
namespace ChatCouncil.Motor.Pruebas
{
    public static class Referencias
    {
        public static readonly string[] Semillas = { ${SEMILLAS.map(cs).join(", ")} };
        public static readonly uint[] HashSemillas = { ${SEMILLAS.map((s) => `${analisis.hashSemilla(s)}u`).join(", ")} };
    }
}
`;
writeFileSync(join(AQUI, "..", "Tests", "Referencias.g.cs"), archivo, "utf8");
console.log(`Referencias.g.cs escrito: ${SEMILLAS.length} semillas.`);
