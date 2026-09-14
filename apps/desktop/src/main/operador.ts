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

import type { Cita, Respuesta, Ronda } from "@chatcouncil/domain";
import { armarCuerposPorOperador, hashSemilla, type CuerposPorOperador } from "@chatcouncil/analysis";
import { randomUUID } from "node:crypto";

import { escribirSello } from "./registro";

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
export function armarYPersistirCuerposDeRonda(
  userData: string,
  conversacionId: string,
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

  const resultado = armarCuerposPorOperador(
    paraOperar,
    POOL_OPERADORES,
    hashSemilla(ronda.semilla),
    () => randomUUID(),
  );

  escribirSello(userData, conversacionId, ronda.id, resultado.sello);

  return resultado;
}
