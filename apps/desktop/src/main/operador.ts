/**
 * operador.ts — T4 + la mitad PURA de T5 (Fase 3).
 * ---------------------------------------------------
 * Arma los 8 cuerpos por operador de una ronda: anonimiza, baraja con la
 * semilla persistida, excluye la propia respuesta de cada operador, agrega
 * la marca canaria, y PERSISTE el sello (con el código estable adentro,
 * revisión de T3). Todo esto es código PURO llamado desde acá — la única
 * pieza que este archivo aporta por sí mismo es la ESCRITURA al registro.
 *
 * Lo que NO hace: no entrega ningún archivo a ningún panel. Eso necesita la
 * Parte 2 de la interfaz (todavía no existe) y es la otra mitad de T5.
 * "Armar el cuerpo" y "entregarlo" son dos pasos distintos, y el primero no
 * depende del segundo — por eso se construye ahora.
 */

import type { Cita, Respuesta, Ronda, Sello } from "@chatcouncil/domain";
import { armarCuerposPorOperador, hashSemilla, type CuerposPorOperador, type EntradaSelloConCodigo } from "@chatcouncil/analysis";
import { randomUUID } from "node:crypto";

import { escribirSello, leerRegistroDeArchivo } from "./registro";

/**
 * El pool de OPERADORES (Parte 2), BLUEPRINT §1: los 8 investigadores,
 * SIEMPRE en este orden — es de ahí que sale el código estable P1..P8.
 * `deepseek` queda AFUERA a propósito: es el noveno, sólo informa, nunca
 * opera ni es operado (§1, "Arquitectura vigente: DOS partes"). Lista
 * propia en vez de reutilizar `INVESTIGADORES` de `index.ts`: esa lista
 * privada del módulo principal incluye a deepseek (investiga en la Parte 1)
 * y no es el pool correcto para la Parte 2 sin filtrarlo — declarar la
 * lista correcta acá, una vez, evita que ese filtro se repita mal en algún
 * otro lugar.
 */
export const POOL_OPERADORES = [
  "chatgpt",
  "gemini",
  "claude",
  "grok",
  "mistral",
  "glm",
  "kimi",
  "qwen",
] as const;

/**
 * Arma y persiste los 8 cuerpos de una ronda. `respuestas` y `citas` son
 * los hechos YA capturados (T1); esta función no lee del disco ni escribe
 * nada más que el `Sello` — armar el cuerpo es puro, escribirlo es lo único
 * que necesita el registro.
 *
 * TIRA si `ronda.semilla` es `null`: sin semilla no hay barajado
 * determinista que reproducir después, y simular uno inventaría un dato
 * que nunca se persistió (§2 del BLUEPRINT: nunca se simula un resultado).
 * Con `generarSemilla()` ya en `escribirRonda` (T3), esto sólo puede pasar
 * con una `Ronda` de antes de esta revisión.
 */
/**
 * LA MITAD PURA, sin persistir nada — extraída para "Consolidar este panel"
 * (Cambio 4): ese botón necesita los MISMOS 8 cuerpos, con la MISMA semilla
 * (nunca se recalcula el barajado — si cambiara, ese operador vería las
 * respuestas en otro orden que el resto y la ronda quedaría inconsistente),
 * pero SIN volver a escribir el `Sello`: `escribirSello` es append-only, y
 * `armarYPersistirCuerposDeRonda` ya lo escribió una vez para esta ronda —
 * llamarlo de nuevo duplicaría las entradas del sello.
 */
export function armarCuerposDeRonda(
  ronda: Ronda,
  respuestas: readonly Respuesta[],
  citas: readonly Cita[],
): CuerposPorOperador {
  if (ronda.semilla === null) {
    throw new Error(
      `ronda ${ronda.id} no tiene semilla persistida: no se puede armar un cuerpo anonimizado reproducible sobre una ronda sin semilla.`,
    );
  }

  const porProveedor = new Map(respuestas.map((r) => [r.proveedorId, r]));
  const faltantes = POOL_OPERADORES.filter((id) => !porProveedor.has(id));
  if (faltantes.length > 0) {
    throw new Error(`faltan respuestas del pool de operadores para armar el cuerpo: ${faltantes.join(", ")}`);
  }

  const citasPorRespuestaId = new Map<string, string[]>();
  for (const c of citas) {
    const lista = citasPorRespuestaId.get(c.respuestaId) ?? [];
    lista.push(c.url);
    citasPorRespuestaId.set(c.respuestaId, lista);
  }

  const paraOperar = POOL_OPERADORES.map((id) => {
    const r = porProveedor.get(id)!;
    return {
      proveedorId: id,
      replyId: r.id,
      attemptId: r.id,
      texto: r.textoOriginal,
      urlsCitadas: citasPorRespuestaId.get(r.id) ?? [],
    };
  });

  return armarCuerposPorOperador(paraOperar, POOL_OPERADORES, hashSemilla(ronda.semilla), () => randomUUID());
}

/**
 * Compara el sello YA PERSISTIDO de una ronda contra el que se acaba de
 * calcular — mismos campos que importan para reproducir el barajado
 * (`label`, `codigoEstable`, `panelSourceId`, `replyId`, `attemptId`), sin
 * importar el orden de las dos listas (una viene de un array append-only en
 * disco, la otra del cálculo en memoria; el orden de escritura no es parte
 * del contrato). Devuelve el motivo exacto de la primera discrepancia, o
 * `null` si coinciden.
 */
function discrepanciaDeSello(
  persistido: readonly Sello[],
  calculado: readonly EntradaSelloConCodigo[],
): string | null {
  if (persistido.length !== calculado.length) {
    return `el sello persistido tiene ${persistido.length} entradas y el recién calculado tiene ${calculado.length}`;
  }
  const porLabel = new Map(persistido.map((s) => [s.label, s]));
  for (const c of calculado) {
    const p = porLabel.get(c.label);
    if (!p) return `el sello recién calculado tiene la etiqueta "${c.label}", que no está en el persistido`;
    if (p.codigoEstable !== c.codigoEstable || p.panelSourceId !== c.panelSourceId || p.replyId !== c.replyId || p.attemptId !== c.attemptId) {
      return (
        `la etiqueta "${c.label}" no coincide: persistido {codigoEstable:${p.codigoEstable}, panelSourceId:${p.panelSourceId}, ` +
        `replyId:${p.replyId}, attemptId:${p.attemptId}} vs calculado {codigoEstable:${c.codigoEstable}, panelSourceId:${c.panelSourceId}, ` +
        `replyId:${c.replyId}, attemptId:${c.attemptId}}`
      );
    }
  }
  return null;
}

/**
 * IDEMPOTENTE respecto del `Sello` (corrección tras la primera consolidación
 * real de Juan, con el defecto del cuerpo pelado: reconsolidar una ronda ya
 * consolidada escribía un SEGUNDO `Sello` para la misma ronda — y
 * reconsolidar es lo normal cuando un panel falla, no un caso raro).
 * `escribirSello` es append-only: antes de llamarla, esta función lee el
 * registro y busca si ya hay un `Sello` para esta ronda.
 *  · Si ya existe, NO escribe uno nuevo — devuelve el resultado calculado
 *    ahora, pero verificado CONTRA el sello ya persistido: la semilla de la
 *    ronda no cambia, así que el barajado recalculado tiene que dar
 *    EXACTAMENTE lo mismo.
 *  · Si el sello persistido y el recién calculado DISCREPAN, eso es un
 *    defecto grave (dos órdenes distintos para la misma ronda desanonimizan
 *    mal el informe final) — TIRA con el motivo exacto y no escribe nada en
 *    ningún panel.
 *  · Si no existe todavía, lo escribe como antes.
 */
export function armarYPersistirCuerposDeRonda(
  userData: string,
  conversacionId: string,
  ronda: Ronda,
  respuestas: readonly Respuesta[],
  citas: readonly Cita[],
): CuerposPorOperador {
  const resultado = armarCuerposDeRonda(ronda, respuestas, citas);

  const registro = leerRegistroDeArchivo(userData, conversacionId);
  const selloExistente = registro.hechos.filter((h): h is Sello => h.tipo === "sello" && h.rondaId === ronda.id);

  if (selloExistente.length > 0) {
    const motivo = discrepanciaDeSello(selloExistente, resultado.sello);
    if (motivo !== null) {
      throw new Error(
        `el sello ya persistido para la ronda ${ronda.id} no coincide con el que se acaba de calcular (${motivo}) — ` +
          `posible cambio en las respuestas, la semilla o el orden del pool entre consolidaciones. No se escribió nada.`,
      );
    }
    return resultado;
  }

  escribirSello(userData, conversacionId, ronda.id, resultado.sello);
  return resultado;
}
