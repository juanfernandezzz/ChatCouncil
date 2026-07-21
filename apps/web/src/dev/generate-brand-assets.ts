import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { brandMarkSvg, colors } from "@chatcouncil/ui";

/**
 * Generador del media pack — Fase 7 E5 (vite-node, SIN sharp).
 * ------------------------------------------------------------------
 * Emite los SVGs fuente a .brand-out/ desde la geometría única de
 * packages/ui/src/brand.ts:
 *  · favicon.svg  → tile bg-base rx 20 + marca accent-primary
 *                   (copiar a apps/web/public/favicon.svg)
 *  · icon-tile.svg→ mismo tile, base de rasterización para los PNG
 *                   16/48/128 de la extensión
 *  · mark.svg     → marca sola en accent-primary, fondo transparente
 *  · mark-mono.svg→ marca sola en negro (media pack / papel)
 *
 * Rasterización a PNG: sharp instalado FUERA del repo (no entra al
 * lockfile — decisión E5); procedimiento exacto en el ledger §0.10.
 *
 *   pnpm --filter @chatcouncil/web exec vite-node src/dev/generate-brand-assets.ts
 */

const outDir = join(process.cwd(), ".brand-out");
mkdirSync(outDir, { recursive: true });

const files: Record<string, string> = {
  "favicon.svg": brandMarkSvg({ color: colors.accentPrimary, background: colors.bgBase, backgroundRadius: 20 }),
  "icon-tile.svg": brandMarkSvg({ color: colors.accentPrimary, background: colors.bgBase, backgroundRadius: 20 }),
  "mark.svg": brandMarkSvg({ color: colors.accentPrimary }),
  "mark-mono.svg": brandMarkSvg({ color: "#000000" }),
};

for (const [name, svg] of Object.entries(files)) {
  writeFileSync(join(outDir, name), `${svg}\n`);
  console.log(`[brand] ${name} escrito (${svg.length} bytes)`);
}
console.log(`[brand] listo — salida en ${outDir}`);
