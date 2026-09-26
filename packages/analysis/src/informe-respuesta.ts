/**
 * informe-respuesta.ts — Fase 5: el documento de UNA respuesta de
 * investigador, para el PDF que va en la subcarpeta del informe.
 * ------------------------------------------------------------------------
 * MOTIVO (decisión de Juan, 2026-09-26): el informe final pasa a ser una
 * CARPETA, y dentro va una subcarpeta con las respuestas de los
 * investigadores en PDF. Son las respuestas a la PREGUNTA (etapa de
 * investigación) — nunca las `SalidaOperador`, que son la evaluación que cada
 * uno hizo de las respuestas ajenas: eso ya vive en la tabla de hallazgos.
 *
 * Esta pieza sólo arma el Markdown. No lee el registro, no escribe archivos y
 * no convierte a PDF (eso es `apps/desktop/src/main/informe-pdf.ts`): sin
 * `node:` y sin `fetch`, `guard:dominio` lo sostiene.
 *
 * REGLA DEL DATO CANÓNICO: el texto de la respuesta se reproduce ENTERO y sin
 * tocar. Una respuesta que no se capturó no se omite: el documento existe
 * igual y dice que no hay texto y por qué — una ausencia silenciosa en la
 * carpeta se leería como "este proveedor no participó".
 */

import { limpiarTituloParaArchivo } from "./titulo-informe";

/** Nombre literal de la subcarpeta, dentro de la carpeta del informe. */
export const SUBCARPETA_RESPUESTAS = "Respuestas de los investigadores";

export interface RespuestaParaPdf {
  /** Proveedor real, ya sin anonimizar: esta carpeta es para Juan, no para un operador. */
  proveedorId: string;
  /** Etiqueta de modelo leída de la interfaz; `null` = el proveedor no la expone. */
  etiquetaModelo: string | null;
  /** ISO de cuándo se leyó la respuesta. */
  leidaEn: string;
  /** El texto tal como se capturó, entero. */
  textoOriginal: string;
  /** `null` si la captura salió bien; el motivo si no. */
  error: string | null;
  /** `Cita` verificables extraídas de esta respuesta. */
  fuentesCitadas: number;
  /** `<a href>` contados en el DOM; `null` si no se pudo contar. */
  fuentesHref: number | null;
  /** `observado` = un indicador dijo que terminó; `inferido` = se dedujo de la quietud. */
  finDe: "observado" | "inferido";
}

const SIN_TEXTO = "No se capturo texto de esta respuesta.";

/**
 * El Markdown de una respuesta: quién, con qué etiqueta de modelo, cuándo,
 * cuánto, y el texto entero. `pregunta` va arriba porque el PDF se va a leer
 * suelto, fuera de la carpeta, y sin la pregunta no se interpreta.
 */
export function markdownDeRespuestaInvestigador(pregunta: string, r: RespuestaParaPdf): string {
  const cuerpo = r.textoOriginal.trim();
  return [
    `# ${r.proveedorId}`,
    "",
    `**Etiqueta de modelo:** ${r.etiquetaModelo ?? "(no observada)"}`,
    `**Leida:** ${r.leidaEn}`,
    `**Caracteres:** ${r.textoOriginal.length}`,
    `**Fuentes citadas (verificables):** ${r.fuentesCitadas}`,
    `**Enlaces en el DOM:** ${r.fuentesHref ?? "(no contados)"}`,
    `**Fin de respuesta:** ${r.finDe}`,
    ...(r.error === null ? [] : [`**Error registrado en la captura:** ${r.error}`]),
    "",
    "## Pregunta",
    "",
    pregunta,
    "",
    "## Respuesta",
    "",
    cuerpo.length > 0 ? cuerpo : SIN_TEXTO,
    "",
    "---",
    "",
    "Texto capturado tal cual de la interfaz del proveedor, sin corregir ni recortar.",
    "Este documento es la respuesta a la pregunta, no la evaluacion que este",
    "proveedor hizo de las respuestas de los demas.",
  ].join("\n");
}

/**
 * Nombre del archivo de una respuesta, SIN extensión: `<n> — <proveedor>`.
 * El número conserva el ORDEN DEL POOL (el mismo de los paneles y de la tabla
 * de condiciones) — sin él, el explorador ordena alfabéticamente y el orden
 * de la ronda se pierde. Misma limpieza para Windows que el nombre del
 * informe.
 */
export function nombreArchivoRespuesta(indiceEnPool: number, proveedorId: string): string {
  const limpio = limpiarTituloParaArchivo(proveedorId);
  return `${indiceEnPool + 1} — ${limpio.length > 0 ? limpio : "proveedor"}`;
}
