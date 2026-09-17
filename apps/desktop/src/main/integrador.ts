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
import type { EtapaRonda } from "@chatcouncil/domain";
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
  type ParticipacionOperador,
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
 * Cómo le fue a UN operador — la entrada que `calcularParticipacionOperadores`
 * necesita para poder distinguir sus tres estados (BLUEPRINT, ronda de
 * ensayo en seco de etapas): `capturado: false` es un FALLO TOTAL (nunca se
 * escribió `SalidaOperador`); `capturado: true` con `totalHallazgos: 0` es
 * "respondió, pero `parsearHallazgos` no encontró ninguna línea válida" —
 * la salida cruda SIGUE persistida, nunca se descarta.
 */
export interface ResultadoOperador {
  operadorId: string;
  capturado: boolean;
  totalHallazgos?: number;
  lineasDescartadas?: number;
  motivoFallo?: string;
}

/**
 * (3) — un operador nunca desaparece del informe por haber fallado o no
 * haber dado hallazgos: los tres estados son HECHOS, ninguno es "ausencia
 * silenciosa" (regla dada en la ronda de ensayo en seco de etapas).
 */
export function calcularParticipacionOperadores(resultados: readonly ResultadoOperador[]): ParticipacionOperador[] {
  return resultados.map((r) => {
    if (!r.capturado) {
      return { operadorId: r.operadorId, estado: "fallo", detalle: `no se capturo salida: ${r.motivoFallo ?? "sin detalle"}` };
    }
    if ((r.totalHallazgos ?? 0) === 0) {
      return {
        operadorId: r.operadorId,
        estado: "sin-hallazgos",
        detalle: `0 hallazgos parseables (${r.lineasDescartadas ?? 0} lineas de la salida cruda descartadas)`,
      };
    }
    return { operadorId: r.operadorId, estado: "ok", detalle: `${r.totalHallazgos} hallazgos` };
  });
}

/**
 * (h) — arma el informe final de la ronda, desanonimizando con el `sello`
 * (P# → proveedorId real de investigador) y con `tabla` (O# → proveedorId
 * real de operador, H# → id real de `HallazgoHecho`).
 *
 * `informeIntegrador` es `null` cuando el integrador falló: el informe se
 * arma IGUAL, con la tabla de hallazgos completa (no depende del
 * integrador) y la sección "Lectura del integrador" diciendo que no hubo
 * informe — nunca se aborta la ronda entera por esa falla puntual.
 */
export function armarInformeFinalDeRonda(params: {
  pregunta: string;
  fecha: string;
  informeIntegrador: InformeIntegrador | null;
  tabla: TablaHallazgos;
  sello: readonly Sello[];
  respuestasDelPool: readonly Respuesta[];
  citas: readonly Cita[];
  resultadosOperadores: readonly ResultadoOperador[];
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
  const referenciasEnOrden =
    params.informeIntegrador === null
      ? []
      : parsearReferenciasIntegrador(params.informeIntegrador.informeCrudo, idsValidos).referencias.map((r) => ({
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
    informeIntegradorCrudo: params.informeIntegrador === null ? null : params.informeIntegrador.informeCrudo,
    referenciasEnOrden,
    hallazgos: hallazgosResueltos,
    participacionOperadores: calcularParticipacionOperadores(params.resultadosOperadores),
    condiciones,
    integridadEntrega: params.integridadEntrega,
    semilla: params.semilla,
  });
}

/**
 * (1) — despacho PURO de un lote de lecturas según la etapa de la ronda.
 * Extraída de `index.ts` para que el ensayo en seco de etapas pueda
 * probarla con datos sembrados, sin Electron: la lógica de "qué se escribe
 * como qué" es la misma función que corre en el camino real, nunca una
 * segunda copia que se desincroniza.
 *
 * `integradorId` es un parámetro (nunca un literal "deepseek" acá adentro)
 * — mismo motivo que `poolOperadores`: esta pieza no fija identidad de
 * proveedor, eso lo decide `apps/desktop/src/main/index.ts` (BLUEPRINT §1).
 */
export interface ClasificacionLecturas<T extends { id: string }> {
  lecturasOperacion: T[];
  lecturaIntegrador: T | undefined;
  lecturasComoRespuesta: T[];
}

export function clasificarLecturasPorEtapa<T extends { id: string }>(
  lecturas: readonly T[],
  etapa: EtapaRonda,
  poolOperadores: readonly string[],
  integradorId: string,
): ClasificacionLecturas<T> {
  if (etapa === "investigacion") {
    // Todavía no hay nada más que investigadores contestando la pregunta original.
    return { lecturasOperacion: [], lecturaIntegrador: undefined, lecturasComoRespuesta: [...lecturas] };
  }
  if (etapa === "operacion") {
    // Los 8 del pool operan; deepseek (que no opera) sigue siendo un investigador más.
    return {
      lecturasOperacion: lecturas.filter((l) => poolOperadores.includes(l.id)),
      lecturaIntegrador: undefined,
      lecturasComoRespuesta: lecturas.filter((l) => !poolOperadores.includes(l.id)),
    };
  }
  // etapa "integracion": los 8 operadores YA TERMINARON su parte -- no vuelven a
  // escribirse aunque su lectura siga llegando en el lote. SÓLO el integrador
  // tiene algo nuevo que capturar. Antes de esta corrección, cualquier id fuera
  // del pool de operadores (los 8 mismos, ya que deepseek pasa a integrador cuando
  // la etapa es "integracion") caía por descarte en `lecturasComoRespuesta` y
  // re-escribía una `Respuesta` obsoleta en cada captura -- probado en rojo con
  // el ensayo en seco de etapas antes de esta corrección.
  return {
    lecturasOperacion: [],
    lecturaIntegrador: lecturas.find((l) => l.id === integradorId),
    lecturasComoRespuesta: [],
  };
}

/**
 * (2) — comprobación OBLIGATORIA antes de escribir el prompt del integrador
 * en un panel. Dos condiciones, las dos tienen que darse:
 *  1. El destino es REALMENTE el integrador — nunca uno de los ocho
 *     operadores. Escribir ahí gasta cuota, deja basura en la conversación
 *     de Juan y contamina la ronda entera con un prompt que no corresponde.
 *  2. Su compositor está VACÍO. Escribir encima de texto que ya estaba ahí
 *     —una respuesta anterior sin leer, algo que Juan estaba escribiendo a
 *     mano— lo pierde sin aviso.
 * Si CUALQUIERA falla, la función dice que no se puede y por qué — nunca
 * escribe nada por su cuenta: eso lo decide quien la llama, después de
 * mirar el resultado.
 */
export interface GuardaEnvioIntegrador {
  puede: boolean;
  motivo?: string;
}

export function puedeEscribirPromptIntegrador(
  destinoId: string,
  integradorId: string,
  compositorActual: string,
): GuardaEnvioIntegrador {
  if (destinoId !== integradorId) {
    return { puede: false, motivo: `el destino "${destinoId}" no es el integrador ("${integradorId}")` };
  }
  if (compositorActual.trim().length > 0) {
    return { puede: false, motivo: "el compositor del integrador no esta vacio: escribir encima lo perderia sin aviso" };
  }
  return { puede: true };
}

/** Sólo para que la corrida simulada pueda fabricar ids de hecho sin tocar el registro real. */
export function idFicticio(): string {
  return randomUUID();
}
