/**
 * parsear-referencias-integrador.ts — T7, Fase 3: trazabilidad del informe
 * del integrador contra la tabla de hallazgos que lo produjo.
 * ------------------------------------------------------------------------
 * Sin `node:` y sin `fetch` — `guard:dominio` lo sostiene igual que al
 * resto de `packages/analysis`.
 *
 * Un párrafo es un bloque de texto separado por una línea en blanco (regla
 * dada). Toda referencia `[H##]` se conserva aunque el id no exista en la
 * tabla que recibió ESTE integrador: se marca `referenciaInvalida: true` en
 * vez de descartarse — inventar una referencia es un hecho sobre el
 * integrador, el mismo principio que la regla 4 de `parsear-hallazgos.ts`.
 */

import { esParrafoTitulo } from "./titulo-informe";

const REFERENCIA_RE = /\[H\d+\]/g;
const PREFIJO_NO_ALCANZA = "LA TABLA NO ALCANZA";

export interface ParrafoAnalizado {
  indice: number;
  texto: string;
  esLaTablaNoAlcanza: boolean;
  /**
   * `true` si el párrafo es la línea "TITULO: …" del integrador (Fase 5). No
   * es prosa del informe: es el nombre del archivo. Exenta de la regla de
   * referencias por el mismo motivo que "LA TABLA NO ALCANZA".
   */
  esTitulo: boolean;
  referencias: string[];
  /** `true` si el párrafo no es "LA TABLA NO ALCANZA" ni la línea TITULO y no trae ninguna referencia — viola la regla obligatoria. */
  sinReferencias: boolean;
}

export interface ReferenciaEnParrafo {
  indiceParrafo: number;
  hallazgoId: string;
  referenciaInvalida: boolean;
}

export interface ResultadoTrazabilidad {
  parrafos: ParrafoAnalizado[];
  referencias: ReferenciaEnParrafo[];
  /** Índices (0-based) de párrafos que violan la regla obligatoria (sin referencias y no son "LA TABLA NO ALCANZA"). */
  parrafosSinReferencias: number[];
}

function partirEnParrafos(informeCrudo: string): string[] {
  return informeCrudo
    .split(/\r?\n\s*\r?\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function parsearReferenciasIntegrador(
  informeCrudo: string,
  idsValidos: readonly string[],
): ResultadoTrazabilidad {
  const validos = new Set(idsValidos);
  const parrafosTexto = partirEnParrafos(informeCrudo);
  const parrafos: ParrafoAnalizado[] = [];
  const referencias: ReferenciaEnParrafo[] = [];
  const parrafosSinReferencias: number[] = [];

  parrafosTexto.forEach((texto, indice) => {
    const esLaTablaNoAlcanza = texto.startsWith(PREFIJO_NO_ALCANZA);
    const esTitulo = indice === 0 && esParrafoTitulo(texto);
    const matches = texto.match(REFERENCIA_RE) ?? [];
    const idsDelParrafo = matches.map((m) => m.slice(1, -1));

    for (const hallazgoId of idsDelParrafo) {
      referencias.push({
        indiceParrafo: indice,
        hallazgoId,
        referenciaInvalida: !validos.has(hallazgoId),
      });
    }

    const sinReferencias = idsDelParrafo.length === 0 && !esLaTablaNoAlcanza && !esTitulo;
    if (sinReferencias) parrafosSinReferencias.push(indice);

    parrafos.push({ indice, texto, esLaTablaNoAlcanza, esTitulo, referencias: idsDelParrafo, sinReferencias });
  });

  return { parrafos, referencias, parrafosSinReferencias };
}
