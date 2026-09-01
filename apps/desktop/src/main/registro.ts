/**
 * registro.ts — el ALMACEN de la Fase 2.
 * ----------------------------------------
 * Un archivo por conversación, `conversaciones/<id>.jsonl`, APPEND ONLY. Un
 * solo proceso escribe (el principal), un solo hilo, sin cerrojos: cada
 * escritura es un `appendFileSync` síncrono, así que dos escrituras nunca se
 * entrelazan dentro del mismo proceso.
 *
 * Este archivo es el ÚNICO lugar de `apps/desktop` que llama
 * `derivarProcedencia`: repetir esa derivación en el arnés la desincroniza
 * del camino real (Fase 2, contrato del almacén).
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import {
  aLinea,
  derivarProcedencia,
  leerRegistro,
  VERSION_ESQUEMA,
  type Conversacion,
  type Intento,
  type Procedencia,
  type RegistroLeido,
  type Respuesta,
  type Ronda,
} from "@chatcouncil/domain";

import type { LecturaProveedor, ResultadoEnvio } from "./test-runner";

function carpetaConversaciones(userData: string): string {
  const dir = join(userData, "conversaciones");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function rutaArchivo(userData: string, conversacionId: string): string {
  return join(carpetaConversaciones(userData), `${conversacionId}.jsonl`);
}

/**
 * Único punto de escritura. Síncrono a propósito: `appendFileSync` con la
 * bandera `a` es una llamada al sistema atómica para el tamaño de una línea
 * de este registro, así que no hace falta cola ni cerrojo propio — el
 * contrato pide exactamente eso.
 */
function escribir(userData: string, conversacionId: string, hecho: Conversacion | Ronda | Intento | Respuesta): void {
  appendFileSync(rutaArchivo(userData, conversacionId), aLinea(hecho) + "\n", "utf8");
}

export function crearConversacion(userData: string, esPrueba: boolean): string {
  const id = randomUUID();
  const hecho: Conversacion = {
    tipo: "conversacion",
    esquema: VERSION_ESQUEMA,
    id,
    creadaEn: new Date().toISOString(),
    titulo: null,
    esPrueba,
  };
  escribir(userData, id, hecho);
  return id;
}

export function escribirRonda(
  userData: string,
  conversacionId: string,
  indice: number,
  prompt: string,
  semilla: string | null,
): string {
  const id = randomUUID();
  const hecho: Ronda = {
    tipo: "ronda",
    esquema: VERSION_ESQUEMA,
    id,
    conversacionId,
    indice,
    prompt,
    enviadaEn: new Date().toISOString(),
    semilla,
  };
  escribir(userData, conversacionId, hecho);
  return id;
}

/** Un intento por proveedor, INCLUIDOS los que fallaron: un envío fallido es un hecho. */
export function escribirIntentos(
  userData: string,
  conversacionId: string,
  rondaId: string,
  resultados: readonly ResultadoEnvio[],
): void {
  const ahora = new Date().toISOString();
  for (const r of resultados) {
    const hecho: Intento = {
      tipo: "intento",
      esquema: VERSION_ESQUEMA,
      id: randomUUID(),
      rondaId,
      proveedorId: r.id,
      ok: r.ok === true,
      error: r.error ?? null,
      enviadoEn: ahora,
    };
    escribir(userData, conversacionId, hecho);
  }
}

/**
 * Una respuesta por proveedor, con la procedencia derivada por
 * `derivarProcedencia` del paquete de dominio. `contexto` da, por
 * proveedor, lo que sólo el proceso principal sabe: la continuidad (un
 * hecho de navegación, no del texto) y el tamaño de panel al leer.
 */
/**
 * Normaliza para comparar EL MISMO prompt entre proveedores, no el mismo
 * byte: espacios de más y mayúsculas no son la señal que este chequeo busca.
 */
function normalizarPrompt(t: string): string {
  return t.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * `true` si TODOS los `promptUsuarioLeido` no nulos de esta captura son el
 * mismo prompt normalizado; `false` si hay al menos dos distintos; `null` si
 * hay menos de dos valores no nulos para comparar. Ver `Respuesta.promptCoincideEnPool`
 * en `@chatcouncil/domain` para el porqué: cobertura del riesgo de "sin
 * historial", informativo, nunca bloquea.
 */
function calcularCoincidenciaDePrompt(lecturas: readonly LecturaProveedor[]): boolean | null {
  const normalizados = lecturas
    .map((l) => l.userText)
    .filter((t): t is string => typeof t === "string" && t.length > 0)
    .map(normalizarPrompt);
  if (normalizados.length < 2) return null;
  return normalizados.every((t) => t === normalizados[0]);
}

export function escribirRespuestas(
  userData: string,
  conversacionId: string,
  rondaId: string,
  lecturas: readonly LecturaProveedor[],
  contexto: (proveedorId: string) => { continuidad: Procedencia["continuidad"]; panel: string | null },
): void {
  const ahora = new Date().toISOString();
  const promptCoincideEnPool = calcularCoincidenciaDePrompt(lecturas);
  for (const l of lecturas) {
    const ctx = contexto(l.id);
    const procedencia = derivarProcedencia(
      {
        modelLabel: l.modelLabel ?? null,
        generating: l.generating,
        ...(l.completionKind !== undefined ? { completionKind: l.completionKind } : {}),
        ...(l.quiescenceMs !== undefined ? { quiescenceMs: l.quiescenceMs } : {}),
      },
      {
        ahora,
        continuidad: ctx.continuidad,
        // No medido en el camino real: `writePrompt` no informa con qué
        // método entró el texto, así que afirmar uno sería simular un dato
        // que no se observó (BLUEPRINT §2).
        metodoEscritura: null,
        panel: ctx.panel,
      },
    );
    const hecho: Respuesta = {
      tipo: "respuesta",
      esquema: VERSION_ESQUEMA,
      id: randomUUID(),
      rondaId,
      proveedorId: l.id,
      textoOriginal: l.text,
      leidaEn: ahora,
      error: l.error ?? null,
      procedencia,
      promptUsuarioLeido: l.userText ?? null,
      promptCoincideEnPool,
    };
    escribir(userData, conversacionId, hecho);
  }
}

/**
 * Lee el registro completo de una conversación. Si el archivo no existe
 * todavía, es un registro vacío — no un error: una conversación recién
 * creada no tiene por qué tener hechos aún en un proceso concurrente.
 */
export function leerRegistroDeArchivo(userData: string, conversacionId: string): RegistroLeido {
  const p = rutaArchivo(userData, conversacionId);
  if (!existsSync(p)) return { hechos: [], lineasIlegibles: [], ultimaLineaIncompleta: false };
  return leerRegistro(readFileSync(p, "utf8"));
}
