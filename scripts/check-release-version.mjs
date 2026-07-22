/**
 * Gate de release (Fase 9, E3): el tag `vX.Y.Z` tiene que coincidir
 * EXACTAMENTE con la versión de `apps/extension/package.json` — la
 * fuente que WXT compila al `manifest.version` y al nombre del zip.
 *
 * CERO auto-mutación: si no coinciden, el release FALLA y el humano
 * corrige (bump de versión en un commit normal + tag nuevo). Escribir
 * la versión desde el tag en CI generaría drift entre builds locales
 * y de CI — descartado en la entrevista.
 *
 * El `version` del package.json raíz se sincroniza por convención en
 * el mismo commit del bump; acá sólo se ADVIERTE si divergió (no es
 * gate: no llega a ningún artefacto).
 *
 * Uso: node scripts/check-release-version.mjs v0.2.0
 *      (o con el tag en GITHUB_REF_NAME, como lo expone Actions)
 */
import { readFileSync } from "node:fs";

const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? "";

if (!/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error(
    `[release:check] tag inválido o ausente: "${tag}" — se espera vX.Y.Z ` +
      "(argumento o GITHUB_REF_NAME).",
  );
  process.exit(1);
}

const wanted = tag.slice(1);
const extVersion = JSON.parse(readFileSync("apps/extension/package.json", "utf8")).version;
const rootVersion = JSON.parse(readFileSync("package.json", "utf8")).version;

if (extVersion !== wanted) {
  console.error(
    `[release:check] FALLO — tag ${tag} ≠ apps/extension/package.json version ${extVersion}.\n` +
      "La versión vive en el package.json (E3): hacé el bump en un commit " +
      "normal y re-tageá sobre ese commit. El CI no muta versiones.",
  );
  process.exit(1);
}

if (rootVersion !== wanted) {
  console.warn(
    `[release:check] AVISO — package.json raíz en ${rootVersion} (convención: sincronizarlo en el bump). No bloquea.`,
  );
}

console.log(`[release:check] OK — tag ${tag} == versión de la extensión ${extVersion}`);
