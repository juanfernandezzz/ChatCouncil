/**
 * armar-tabla-hallazgos.ts — T7, Fase 3 (paso c del cableado, BLUEPRINT §T7).
 * ------------------------------------------------------------------------
 * Arma la tabla de hallazgos que recibe el integrador: una fila por
 * `HallazgoHecho`, con el formato exacto que `prompt-integrador.ts` espera.
 *
 * DOS IDENTIFICADORES, DOS REGLAS DISTINTAS — decisión dada, no inventada:
 *  · `H##` — el ORDEN DE PERSISTENCIA de los hallazgos, nunca barajado. Es
 *    sólo un índice de fila; no hay identidad de proveedor que blindar ahí.
 *  · `O##` — el operador que registró cada hallazgo, BARAJADO con la MISMA
 *    semilla de la ronda (mismo `seededShuffle` que ya usa `anonymize.ts`
 *    para "Modelo A".."H"): el integrador no puede saber qué operador
 *    registró qué, el mismo principio de ceguera que protege T6.
 *
 * Sin `node:` y sin `fetch` — `guard:dominio` lo sostiene igual que al
 * resto de `packages/analysis`.
 */

import { seededShuffle } from "./anonymize";
import type { HallazgoParaIntegrador } from "./prompt-integrador";

export interface HallazgoParaTabla {
  /** El `id` real de `HallazgoHecho` (`packages/domain`) — nunca viaja al integrador, sólo sirve para desanonimizar el informe final después. */
  hallazgoIdOriginal: string;
  categoria: string;
  eje: string | null;
  /** Etiquetas "P#" ya asignadas en T6 — no se tocan acá. */
  etiquetas: readonly string[];
  descripcion: string;
  /** El `proveedorId` REAL del operador que registró este hallazgo — nunca viaja al integrador. */
  operadorIdOriginal: string;
}

export interface FilaTabla {
  codigoHallazgo: string;
  hallazgoIdOriginal: string;
  codigoOperador: string;
  operadorIdOriginal: string;
  categoria: string;
  eje: string | null;
  etiquetas: readonly string[];
  descripcion: string;
}

export interface TablaHallazgos {
  filas: FilaTabla[];
  /** Lo que recibe `armarPromptIntegrador` como `{{HALLAZGOS}}`. */
  paraPrompt: HallazgoParaIntegrador[];
}

/**
 * `poolOperadores` es el mismo conjunto de `proveedorId` de operadores en su
 * orden FIJO (BLUEPRINT §1, `POOL_OPERADORES` en `apps/desktop/src/main/
 * operador.ts`) — de ahí sale el barajado de `O##`, igual que
 * `codigosEstables` usa el orden fijo del pool para `P##`.
 */
export function armarTablaHallazgos(
  hallazgos: readonly HallazgoParaTabla[],
  poolOperadores: readonly string[],
  shuffleSeedNumerica: number,
): TablaHallazgos {
  const operadoresBarajados = seededShuffle(poolOperadores, shuffleSeedNumerica);
  const codigoOperadorDe = new Map<string, string>();
  operadoresBarajados.forEach((id, i) => codigoOperadorDe.set(id, `O${i + 1}`));

  const filas: FilaTabla[] = hallazgos.map((h, i) => {
    const codigoOperador = codigoOperadorDe.get(h.operadorIdOriginal);
    if (codigoOperador === undefined) {
      throw new Error(`hallazgo ${h.hallazgoIdOriginal}: operador "${h.operadorIdOriginal}" no está en el pool de operadores`);
    }
    return {
      codigoHallazgo: `H${i + 1}`,
      hallazgoIdOriginal: h.hallazgoIdOriginal,
      codigoOperador,
      operadorIdOriginal: h.operadorIdOriginal,
      categoria: h.categoria,
      eje: h.eje,
      etiquetas: h.etiquetas,
      descripcion: h.descripcion,
    };
  });

  const paraPrompt: HallazgoParaIntegrador[] = filas.map((f) => ({
    id: f.codigoHallazgo,
    categoria: f.categoria,
    eje: f.eje,
    etiquetas: f.etiquetas,
    descripcion: f.descripcion,
    operador: f.codigoOperador,
  }));

  return { filas, paraPrompt };
}
