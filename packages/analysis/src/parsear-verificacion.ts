/**
 * parsear-verificacion.ts — 7-1-1 (2026-09-29): parseo de la salida cruda del
 * VERIFICADOR de fuentes.
 * ------------------------------------------------------------------------
 * Sin `node:` y sin `fetch` — `guard:dominio` lo sostiene igual que al resto
 * de `packages/analysis`.
 *
 * Mismas reglas que `parsear-hallazgos.ts`: sólo cinco prefijos exactos
 * habilitan una línea (VERIFICADO, CONTRADICHO, NO_VERIFICADO, PUNTO_CIEGO,
 * PREGUNTA); el resto se descarta sin romper, porque el verificador puede
 * escribir prosa alrededor. Un H## que no está en la tabla de la ronda se
 * CONSERVA con `hallazgoInvalido: true`: citar un hallazgo inexistente es un
 * hecho sobre el verificador, no ruido.
 */

import { splitCampos } from "./parsear-hallazgos";

export type EstadoVerificacion = "VERIFICADO" | "CONTRADICHO" | "NO_VERIFICADO";

export interface ItemVerificacion {
  estado: EstadoVerificacion;
  hallazgoId: string;
  /** La primera URL http(s) del campo; `null` si no trae ninguna (siempre en NO_VERIFICADO). */
  url: string | null;
  /** La cita textual, sin las comillas de afuera; en NO_VERIFICADO, el motivo. */
  texto: string;
  hallazgoInvalido: boolean;
}

export interface PuntoCiego {
  descripcion: string;
  /** `null` cuando el verificador escribió "sin fuente" o no trajo URL. */
  url: string | null;
}

export interface ResultadoParseoVerificacion {
  verificaciones: ItemVerificacion[];
  puntosCiegos: PuntoCiego[];
  preguntas: string[];
  lineasDescartadas: number;
}

// ponytail: toma la primera URL y le saca la puntuación final; una URL que
// termine legítimamente en ")" (Wikipedia) pierde ese paréntesis.
function primeraUrl(campo: string): string | null {
  const m = /https?:\/\/[^\s<>"'`]+/i.exec(campo);
  return m === null ? null : m[0].replace(/[).,;\]]+$/, "");
}

function sinComillas(t: string): string {
  return t.trim().replace(/^["“”«]+|["“”»]+$/g, "").trim();
}

/** `idsValidos` son los H## de la tabla de hallazgos de la ronda. */
export function parsearVerificacion(salidaCruda: string, idsValidos: readonly string[]): ResultadoParseoVerificacion {
  const validos = new Set(idsValidos);
  const r: ResultadoParseoVerificacion = { verificaciones: [], puntosCiegos: [], preguntas: [], lineasDescartadas: 0 };

  // Espacio duro a espacio antes de parsear, mismo motivo que en parsear-hallazgos.
  for (const cruda of salidaCruda.replace(/ /g, " ").split("\n")) {
    const linea = cruda.trim();
    if (linea.length === 0) continue;
    const prefijo = linea.slice(0, linea.indexOf("|"));

    if (prefijo === "VERIFICADO" || prefijo === "CONTRADICHO") {
      const c = splitCampos(linea, 4);
      if (c !== null) {
        const hallazgoId = c[1]!.trim();
        r.verificaciones.push({ estado: prefijo, hallazgoId, url: primeraUrl(c[2]!), texto: sinComillas(c[3]!), hallazgoInvalido: !validos.has(hallazgoId) });
        continue;
      }
    } else if (prefijo === "NO_VERIFICADO") {
      const c = splitCampos(linea, 3);
      if (c !== null) {
        const hallazgoId = c[1]!.trim();
        r.verificaciones.push({ estado: prefijo, hallazgoId, url: null, texto: c[2]!.trim(), hallazgoInvalido: !validos.has(hallazgoId) });
        continue;
      }
    } else if (prefijo === "PUNTO_CIEGO") {
      const c = splitCampos(linea, 3);
      if (c !== null) {
        r.puntosCiegos.push({ descripcion: c[1]!.trim(), url: primeraUrl(c[2]!) });
        continue;
      }
    } else if (prefijo === "PREGUNTA") {
      const texto = linea.slice("PREGUNTA|".length).trim();
      if (texto.length > 0) {
        r.preguntas.push(texto);
        continue;
      }
    }
    r.lineasDescartadas++;
  }
  return r;
}
