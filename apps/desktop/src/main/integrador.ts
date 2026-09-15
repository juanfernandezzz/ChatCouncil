/**
 * integrador.ts — T7, Fase 3: el cableado de (b) a (h) del prompt de
 * operación al informe final (BLUEPRINT, ronda de cableado).
 * ------------------------------------------------------------------------
 * Tres motivos por los que este archivo existe en vez de crecer
 * `operador.ts` o `index.ts`:
 *  1. Es el mismo patrón que `operador.ts` ya usa: código de ORQUESTACIÓN
 *     que llama a piezas puras de `packages/analysis`/`packages/domain` y
 *     al ALMACÉN (`registro.ts`) — nunca al revés.
 *  2. Separa "armar los hechos derivados de una ronda" de "escribir en un
 *     panel de Electron", igual que T5 separó "armar el cuerpo" de
 *     "entregarlo".
 *  3. Es la pieza que permite probar el camino ENTERO (b)-(h) con datos
 *     sembrados, sin abrir Electron — exactamente lo que la corrida
 *     simulada de esta ronda necesita.
 */

import { randomUUID } from "node:crypto";

import type { Cita, HallazgoHecho, InformeIntegrador, Respuesta, Sello } from "@chatcouncil/domain";
import {
  armarInformeFinal,
  armarPromptIntegrador,
  armarTablaHallazgos,
  hashSemilla,
  parsearHallazgos,
  parsearReferenciasIntegrador,
  type CondicionProveedor,
  type FilaTabla,
  type HallazgoResuelto,
  type TablaHallazgos,
} from "@chatcouncil/analysis";

import { escribirHallazgos, escribirSalidaOperador } from "./registro";

/**
 * (a)/(b) — persiste la salida cruda de UN operador y deriva sus hallazgos.
 * `etiquetasValidas` son los códigos "P#" que de verdad estaban en el
 * cuerpo que recibió ESTE operador (`CuerposPorOperador.cuerpos[i].
 * proveedoresIncluidos`, traducidos a "P#" con el mismo `sello` de la
 * ronda) — nunca "todas las P# del pool": un operador que cite la P# de
 * SU PROPIA respuesta (excluida por diseño) tiene que quedar marcado
 * `etiquetaInvalida`, igual que una P# inventada.
 */
export function procesarSalidaOperador(
  userData: string,
  conversacionId: string,
  rondaId: string,
  operadorId: string,
  promptCompleto: string,
  salidaCruda: string,
  etiquetasValidas: readonly string[],
): { salida: ReturnType<typeof escribirSalidaOperador>; hallazgos: HallazgoHecho[]; lineasDescartadas: number } {
  const salida = escribirSalidaOperador(userData, conversacionId, rondaId, operadorId, promptCompleto, salidaCruda);
  const resultado = parsearHallazgos(salidaCruda, etiquetasValidas);
  const hallazgos = escribirHallazgos(userData, conversacionId, salida.id, resultado.hallazgos);
  return { salida, hallazgos, lineasDescartadas: resultado.lineasDescartadas };
}

/**
 * Los "P#" válidos para UN operador = el `codigoEstable` de sello de cada
 * proveedor del pool, MENOS el suyo propio (exclusión de autoevaluación,
 * `cuerpo-operador.ts`: siempre se excluye la respuesta propia, nunca otra).
 * Se deriva del `Sello` ya persistido — no hace falta retener en memoria el
 * `CuerposPorOperador` que armó Consolidar: la ronda vuelve a saber esto
 * leyendo el registro, aunque el proceso se haya reiniciado entre medio.
 */
export function etiquetasValidasDelOperador(
  operadorId: string,
  poolOperadores: readonly string[],
  sello: readonly Sello[],
): string[] {
  const codigoDe = new Map(sello.map((s) => [s.panelSourceId, s.codigoEstable]));
  return poolOperadores
    .filter((id) => id !== operadorId)
    .map((id) => {
      const codigo = codigoDe.get(id);
      if (!codigo) throw new Error(`no hay codigo estable de sello para el proveedor ${id}`);
      return codigo;
    });
}

/**
 * (c)/(d) — arma la tabla de hallazgos de toda la ronda y el prompt del
 * integrador. `hallazgosPorSalida` es, por `SalidaOperador.id`, el
 * `operadorId` real que la produjo y sus `HallazgoHecho` — en el ORDEN en
 * que se persistieron (regla de los "H#"), nunca reordenados.
 */
export function armarTablaYPromptIntegrador(
  pregunta: string,
  hallazgosPorSalida: readonly { operadorId: string; hallazgos: readonly HallazgoHecho[] }[],
  poolOperadores: readonly string[],
  semilla: string,
): { tabla: TablaHallazgos; prompt: string } {
  const paraTabla = hallazgosPorSalida.flatMap((s) =>
    s.hallazgos.map((h) => ({
      hallazgoIdOriginal: h.id,
      categoria: h.categoria,
      eje: h.eje,
      etiquetas: h.etiquetas,
      descripcion: h.descripcion,
      operadorIdOriginal: s.operadorId,
    })),
  );
  const tabla = armarTablaHallazgos(paraTabla, poolOperadores, hashSemilla(semilla));
  const prompt = armarPromptIntegrador(pregunta, tabla.paraPrompt);
  return { tabla, prompt };
}

/**
 * (h) — arma el informe final de la ronda, desanonimizando con el `sello`
 * (P# → proveedorId real de investigador) y con `tabla` (O# → proveedorId
 * real de operador, H# → id real de `HallazgoHecho`).
 */
export function armarInformeFinalDeRonda(params: {
  pregunta: string;
  fecha: string;
  informeIntegrador: InformeIntegrador;
  tabla: TablaHallazgos;
  sello: readonly Sello[];
  respuestasDelPool: readonly Respuesta[];
  citas: readonly Cita[];
  integridadEntrega: string;
  semilla: string;
}): string {
  const proveedorDeCodigoEstable = new Map(params.sello.map((s) => [s.codigoEstable, s.panelSourceId]));

  const hallazgosResueltos: HallazgoResuelto[] = params.tabla.filas.map((f: FilaTabla) => ({
    codigo: f.codigoHallazgo,
    categoria: f.categoria,
    eje: f.eje,
    respuestasReales: f.etiquetas
      .map((p) => proveedorDeCodigoEstable.get(p))
      .filter((id): id is string => typeof id === "string"),
    descripcion: f.descripcion,
    operadorReal: f.operadorIdOriginal,
  }));

  const idsValidos = params.tabla.filas.map((f) => f.codigoHallazgo);
  const trazabilidad = parsearReferenciasIntegrador(params.informeIntegrador.informeCrudo, idsValidos);
  const referenciasEnOrden = trazabilidad.referencias.map((r) => ({
    codigo: r.hallazgoId,
    existe: !r.referenciaInvalida,
  }));

  const citasPorRespuestaId = new Map<string, number>();
  for (const c of params.citas) {
    citasPorRespuestaId.set(c.respuestaId, (citasPorRespuestaId.get(c.respuestaId) ?? 0) + 1);
  }
  const condiciones: CondicionProveedor[] = params.respuestasDelPool.map((r) => ({
    proveedorId: r.proveedorId,
    etiquetaModelo: r.procedencia.modelLabel,
    caracteresRespuesta: r.textoOriginal.length,
    fuentesCitadas: citasPorRespuestaId.get(r.id) ?? 0,
  }));

  return armarInformeFinal({
    pregunta: params.pregunta,
    fecha: params.fecha,
    informeIntegradorCrudo: params.informeIntegrador.informeCrudo,
    referenciasEnOrden,
    hallazgos: hallazgosResueltos,
    condiciones,
    integridadEntrega: params.integridadEntrega,
    semilla: params.semilla,
  });
}

/** Sólo para que la corrida simulada pueda fabricar ids de hecho sin tocar el registro real. */
export function idFicticio(): string {
  return randomUUID();
}
