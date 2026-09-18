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
  type Cita,
  type CondicionHerramientas,
  type Conversacion,
  type ErrorCaptura,
  type EtapaRonda,
  type HallazgoHecho,
  type InformeIntegrador,
  type Intento,
  type PreguntaDeclarada,
  type Procedencia,
  type RegistroLeido,
  type Respuesta,
  type Ronda,
  type Sello,
  type SalidaOperador,
  type TipoCaptura,
} from "@chatcouncil/domain";

import { extraerCitas } from "./citas";
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
function escribir(
  userData: string,
  conversacionId: string,
  hecho:
    | Conversacion
    | Ronda
    | Intento
    | Respuesta
    | Cita
    | Sello
    | SalidaOperador
    | HallazgoHecho
    | InformeIntegrador
    | CondicionHerramientas
    | ErrorCaptura
    | PreguntaDeclarada,
): void {
  appendFileSync(rutaArchivo(userData, conversacionId), aLinea(hecho) + "\n", "utf8");
}

/**
 * Semilla real para el barajado de una `Ronda` (T3, Fase 3). Antes de esta
 * ronda, las dos llamadas a `escribirRonda` en `index.ts` pasaban `null` —
 * el campo existía desde la Fase 2 pero nadie lo llenaba. Persiste como
 * STRING (formato del campo `Ronda.semilla`); quien barajea con ella
 * (`anonymizeReplies`, `packages/analysis`) la convierte a número con
 * `hashSemilla` — la representación persistida no depende de qué algoritmo
 * de barajado se use hoy.
 */
export function generarSemilla(): string {
  return randomUUID();
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
      fuentesHref: typeof l.fuentesHref === "number" ? l.fuentesHref : null,
      html: l.html ?? null,
    };
    escribir(userData, conversacionId, hecho);

    // T1 (Fase 3): la extracción de citas es DERIVADA de `hecho.html`, nunca
    // al revés — si la regla de extracción cambia, se vuelve a correr sobre
    // el `html` ya guardado, sin tocar la Respuesta. Se deriva en la MISMA
    // escritura para que cada captura deje su propio hecho `Cita`, igual que
    // ya pasa con `Intento` y `Respuesta`.
    if (hecho.html !== null) {
      const { citas } = extraerCitas(hecho.html, hecho.id);
      for (const cita of citas) escribir(userData, conversacionId, cita);
    }
  }
}

/**
 * Persiste el `seal` que produce `anonymizeReplies` (`packages/analysis`):
 * la correspondencia etiqueta-ciega → identidad real, UNA VEZ, en el
 * momento en que se anonimiza una ronda. Sin este hecho, "el informe lo
 * arma el código y desanonimiza con el sello" no tiene mecanismo — ver
 * `Sello` en `@chatcouncil/domain`. Un `Sello` por entrada, misma
 * granularidad que `escribirIntentos`.
 */
export function escribirSello(
  userData: string,
  conversacionId: string,
  rondaId: string,
  entradas: readonly { label: string; codigoEstable: string; panelSourceId: string; replyId: string; attemptId: string }[],
): void {
  for (const e of entradas) {
    const hecho: Sello = {
      tipo: "sello",
      esquema: VERSION_ESQUEMA,
      id: randomUUID(),
      rondaId,
      label: e.label,
      codigoEstable: e.codigoEstable,
      panelSourceId: e.panelSourceId,
      replyId: e.replyId,
      attemptId: e.attemptId,
    };
    escribir(userData, conversacionId, hecho);
  }
}

/**
 * Defecto 1 (corrida real de Juan, 2026-09-19) — declara la pregunta real
 * de una ronda que ya se capturó sin haber pasado por `escribirRonda` con el
 * texto de la pregunta (envío hecho a mano: `Ronda.prompt` quedó con el
 * marcador `PROMPT_SIN_RONDA`). `Ronda` es append-only y no se reescribe; se
 * agrega este hecho APARTE, con procedencia `"declarado-por-usuario"` —
 * nunca `"observado"`, porque nadie la observó. Quien lee la ronda después
 * la resuelve con `preguntaEfectivaDeRonda` (`packages/domain`).
 */
export function escribirPreguntaDeclarada(
  userData: string,
  conversacionId: string,
  rondaId: string,
  texto: string,
): PreguntaDeclarada {
  const hecho: PreguntaDeclarada = {
    tipo: "pregunta-declarada",
    esquema: VERSION_ESQUEMA,
    id: randomUUID(),
    rondaId,
    texto,
    declaradaEn: new Date().toISOString(),
    procedencia: "declarado-por-usuario",
  };
  escribir(userData, conversacionId, hecho);
  return hecho;
}

/**
 * T7 (Fase 3) — la salida cruda de UN operador, capturada en etapa
 * "operacion". `promptCompleto` es el prompt ENTERO que se le escribió al
 * panel, no un nombre de plantilla (ver `SalidaOperador` en
 * `@chatcouncil/domain`): se persiste tal cual, junto al texto que produjo.
 */
export function escribirSalidaOperador(
  userData: string,
  conversacionId: string,
  rondaId: string,
  operadorId: string,
  promptCompleto: string,
  salidaCruda: string,
): SalidaOperador {
  const hecho: SalidaOperador = {
    tipo: "salida-operador",
    esquema: VERSION_ESQUEMA,
    id: randomUUID(),
    rondaId,
    operadorId,
    promptCompleto,
    salidaCruda,
    recibidaEn: new Date().toISOString(),
  };
  escribir(userData, conversacionId, hecho);
  return hecho;
}

/**
 * Un `HallazgoHecho` por línea que `parsearHallazgos` (`packages/analysis`)
 * extrajo de una `SalidaOperador` — hechos DERIVADOS que referencian el
 * `salidaOperadorId`, nunca copian el texto crudo (§ regla del dato
 * canónico, `packages/domain`).
 */
export function escribirHallazgos(
  userData: string,
  conversacionId: string,
  salidaOperadorId: string,
  hallazgos: readonly { categoria: string; eje: string | null; etiquetas: string[]; descripcion: string; etiquetaInvalida: boolean }[],
): HallazgoHecho[] {
  const escritos: HallazgoHecho[] = [];
  for (const h of hallazgos) {
    const hecho: HallazgoHecho = {
      tipo: "hallazgo",
      esquema: VERSION_ESQUEMA,
      id: randomUUID(),
      salidaOperadorId,
      categoria: h.categoria,
      eje: h.eje,
      etiquetas: h.etiquetas,
      descripcion: h.descripcion,
      etiquetaInvalida: h.etiquetaInvalida,
    };
    escribir(userData, conversacionId, hecho);
    escritos.push(hecho);
  }
  return escritos;
}

/**
 * El informe del integrador, capturado en etapa "integracion". Mismo
 * principio que `escribirSalidaOperador`: se persiste el `promptCompleto`
 * ENTERO junto al `informeCrudo`, nunca por nombre de plantilla.
 */
export function escribirInformeIntegrador(
  userData: string,
  conversacionId: string,
  rondaId: string,
  operadorId: string,
  promptCompleto: string,
  informeCrudo: string,
): InformeIntegrador {
  const hecho: InformeIntegrador = {
    tipo: "informe-integrador",
    esquema: VERSION_ESQUEMA,
    id: randomUUID(),
    rondaId,
    operadorId,
    promptCompleto,
    informeCrudo,
    recibidaEn: new Date().toISOString(),
  };
  escribir(userData, conversacionId, hecho);
  return hecho;
}

/**
 * T7 (Fase 3, corrección de la primera corrida real) — la CONDICIÓN de
 * herramientas de un proveedor en una etapa: si la búsqueda web estaba
 * activada, y si el dato es `"declarado"` (Juan lo dice) u
 * `"observado"` (un selector lo leyó del DOM — todavía no derivado para
 * ningún proveedor, ver `CondicionHerramientas` en `@chatcouncil/domain`).
 * Sin este hecho, la asimetría de herramientas entre etapas —búsqueda web
 * ON en investigación, OFF en operación— no queda escrita en ningún lado.
 */
export function escribirCondicionHerramientas(
  userData: string,
  conversacionId: string,
  rondaId: string,
  proveedorId: string,
  etapa: EtapaRonda,
  busquedaWebActivada: boolean,
  fuente: "declarado" | "observado",
): CondicionHerramientas {
  const hecho: CondicionHerramientas = {
    tipo: "condicion-herramientas",
    esquema: VERSION_ESQUEMA,
    id: randomUUID(),
    rondaId,
    proveedorId,
    etapa,
    busquedaWebActivada,
    fuente,
    registradoEn: new Date().toISOString(),
  };
  escribir(userData, conversacionId, hecho);
  return hecho;
}

/**
 * T7 (Fase 3) — "Capturar" pidió leer un tipo de captura que no coincide
 * con la etapa real de la ronda (`etapaDeRonda`, `@chatcouncil/domain`).
 * Nunca se adivina qué leer: se registra el desajuste como hecho y quien
 * llama decide qué hacer (típicamente, no escribir nada más y avisarle a
 * Juan).
 */
export function escribirErrorCaptura(
  userData: string,
  conversacionId: string,
  rondaId: string,
  etapaEsperada: EtapaRonda,
  tipoCapturaIntentado: TipoCaptura,
  detalle: string,
): ErrorCaptura {
  const hecho: ErrorCaptura = {
    tipo: "error-captura",
    esquema: VERSION_ESQUEMA,
    id: randomUUID(),
    rondaId,
    etapaEsperada,
    tipoCapturaIntentado,
    detalle,
    ocurridoEn: new Date().toISOString(),
  };
  escribir(userData, conversacionId, hecho);
  return hecho;
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
