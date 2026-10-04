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

import type {
  Cita,
  HallazgoHecho,
  Hecho,
  InformeIntegrador,
  Respuesta,
  RespuestaRedactor,
  SalidaOperador,
  SalidaVerificador,
  Sello,
  UrlComprobada,
} from "@chatcouncil/domain";
import type { EtapaRonda } from "@chatcouncil/domain";
import {
  armarInformeFinal,
  armarPromptIntegrador,
  armarPromptVerificador,
  armarTablaHallazgos,
  controlesRedaccion,
  lineasDeControl,
  extraerSeccionRescate,
  extraerTituloDelInforme,
  textoDelInformeIntegrador,
  textoDeLaSalidaVerificador,
  hashSemilla,
  nombreProveedor,
  parsearHallazgos,
  parsearReferenciasIntegrador,
  parsearVerificacion,
  type CondicionProveedor,
  type FilaTabla,
  type HallazgoResuelto,
  type ParticipacionOperador,
  type TablaHallazgos,
  type VerificacionParaInforme,
} from "@chatcouncil/analysis";

import { escribirHallazgos, escribirInformeIntegrador, escribirSalidaOperador, escribirSalidaVerificador } from "./registro";

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
  html: string | null,
  etiquetasValidas: readonly string[],
  copiadaDe?: { rondaId: string; salidaOperadorId: string },
): { salida: ReturnType<typeof escribirSalidaOperador>; hallazgos: HallazgoHecho[]; lineasDescartadas: number } {
  const salida = escribirSalidaOperador(userData, conversacionId, rondaId, operadorId, promptCompleto, salidaCruda, html, copiadaDe);
  const resultado = parsearHallazgos(salidaCruda, etiquetasValidas);
  const hallazgos = escribirHallazgos(userData, conversacionId, salida.id, resultado.hallazgos);
  return { salida, hallazgos, lineasDescartadas: resultado.lineasDescartadas };
}

/**
 * Reutilizar la operación de UN operador desde la ronda de la que se copiaron
 * las respuestas (2026-10-03, pedido de Juan). Sólo vale si su cuerpo es el
 * mismo: TODAS las respuestas que ese operador lee (las del pool menos la
 * suya) tienen que ser copias sin cambios. Si alguna se recapturó, el operador
 * leería otra cosa y tiene que operar de nuevo. Las etiquetas P# no cambian
 * entre rondas (salen del orden del pool); los hallazgos se vuelven a derivar
 * contra el sello de esta ronda, así que una etiqueta inválida queda marcada.
 */
export function copiarOperacionDeRondaAnterior(
  userData: string,
  hechos: readonly Hecho[],
  conversacionId: string,
  rondaId: string,
  operadorId: string,
  poolOperadores: readonly string[],
): { ok: boolean; mensaje: string } {
  if (!poolOperadores.includes(operadorId)) return { ok: false, mensaje: `"${nombreProveedor(operadorId)}" no es un operador del pool.` };
  const sello = hechos.filter((h): h is Sello => h.tipo === "sello" && h.rondaId === rondaId);
  if (sello.length === 0) return { ok: false, mensaje: 'Esta ronda todavía no tiene sello: pega primero la operación en algún panel ("Pegar operación en este panel").' };
  const vigentes = new Map<string, Respuesta>();
  for (const h of hechos) if (h.tipo === "respuesta" && h.rondaId === rondaId) vigentes.set(h.proveedorId, h);
  const leidas = poolOperadores.filter((id) => id !== operadorId);
  const cambiadas = leidas.filter((id) => !vigentes.get(id)?.copiadaDe);
  if (cambiadas.length > 0) {
    return { ok: false, mensaje: `No se puede reutilizar: ${nombreProveedor(operadorId)} lee respuestas que cambiaron en esta ronda (${cambiadas.map(nombreProveedor).join(", ")}). Tiene que operar de nuevo.` };
  }
  const origenes = new Set(leidas.map((id) => vigentes.get(id)!.copiadaDe!.rondaId));
  if (origenes.size !== 1) return { ok: false, mensaje: `Las respuestas copiadas vienen de ${origenes.size} rondas distintas: no hay una operación anterior equivalente.` };
  const origen = [...origenes][0]!;
  const vieja = hechos.filter((h): h is SalidaOperador => h.tipo === "salida-operador" && h.rondaId === origen && h.operadorId === operadorId).pop();
  if (!vieja) return { ok: false, mensaje: `No hay una operación de ${nombreProveedor(operadorId)} en la ronda ${origen.slice(0, 8)}.` };
  const r = procesarSalidaOperador(userData, conversacionId, rondaId, operadorId, vieja.promptCompleto, vieja.salidaCruda, vieja.html ?? null,
    etiquetasValidasDelOperador(operadorId, poolOperadores, sello), { rondaId: origen, salidaOperadorId: vieja.id });
  const invalidas = r.hallazgos.filter((h) => h.etiquetaInvalida).length;
  return {
    ok: true,
    mensaje: `${nombreProveedor(operadorId)}: se reutilizó su operación de la ronda ${origen.slice(0, 8)} (${r.hallazgos.length} hallazgos${invalidas > 0 ? `, ${invalidas} con etiqueta inválida` : ""}). No hace falta pegarle la operación de nuevo.`,
  };
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
 * Menú "Ventana" (2026-09-30) — recapturar el integrador o el verificador sin
 * mirar la etapa. Una vez capturado un informe, la etapa pasa a "verificacion"
 * y "Capturar todos" ya no lee el integrador; si ese informe salió incompleto
 * (la captura de deepseek de las 05:35), no había forma de volver a leerlo.
 * Recapturar AGREGA un hecho nuevo — el registro no se reescribe — y todo el
 * código usa el último de la ronda, igual que con los operadores.
 */
export type RolRecapturable = "integrador" | "verificador";

const SIN_PREVIO: Record<RolRecapturable, string> = {
  integrador: 'No hay un informe de integrador en esta ronda todavía. Usa "Pegar integrador".',
  verificador: 'No hay una verificación en esta ronda todavía. Usa "Pegar verificación".',
};

function previosDeRol(hechos: readonly Hecho[], rondaId: string, rol: RolRecapturable): (InformeIntegrador | SalidaVerificador)[] {
  return hechos.filter(
    (h): h is InformeIntegrador | SalidaVerificador =>
      h.tipo === (rol === "integrador" ? "informe-integrador" : "salida-verificador") && h.rondaId === rondaId,
  );
}

/** El hecho VIGENTE del rol en la ronda: el último capturado. Lo usan el informe final y "Pegar verificación". */
export function ultimoDeRol(hechos: readonly Hecho[], rondaId: string, rol: "integrador"): InformeIntegrador | null;
export function ultimoDeRol(hechos: readonly Hecho[], rondaId: string, rol: "verificador"): SalidaVerificador | null;
export function ultimoDeRol(hechos: readonly Hecho[], rondaId: string, rol: RolRecapturable): InformeIntegrador | SalidaVerificador | null {
  const previos = previosDeRol(hechos, rondaId, rol);
  return previos[previos.length - 1] ?? null;
}

/** El aviso literal si la ronda no tiene todavía nada de ese rol; `null` si se puede recapturar. */
export function avisoSinPrevio(hechos: readonly Hecho[], rondaId: string, rol: RolRecapturable): string | null {
  return previosDeRol(hechos, rondaId, rol).length === 0 ? SIN_PREVIO[rol] : null;
}

/**
 * Escribe la lectura nueva como un hecho más del rol. El prompt es el que se
 * pegó en este proceso o, si la app se reinició, el del hecho anterior: es el
 * mismo prompt que produjo lo que se está recapturando.
 */
export function registrarRecaptura(
  userData: string,
  hechos: readonly Hecho[],
  conversacionId: string,
  rondaId: string,
  rol: RolRecapturable,
  lectura: { id: string; text: string; html?: string | null },
  promptEnMemoria: string | null,
): { ok: boolean; mensaje: string } {
  const previos = previosDeRol(hechos, rondaId, rol);
  const previo = previos[previos.length - 1];
  if (!previo) return { ok: false, mensaje: SIN_PREVIO[rol] };
  const prompt = promptEnMemoria ?? previo.promptCompleto;
  if (rol === "integrador") {
    escribirInformeIntegrador(userData, conversacionId, rondaId, lectura.id, prompt, lectura.text, lectura.html ?? null);
  } else {
    escribirSalidaVerificador(userData, conversacionId, rondaId, lectura.id, prompt, lectura.text, lectura.html ?? null);
  }
  return {
    ok: true,
    mensaje: `${nombreProveedor(lectura.id)}: ${rol} recapturado, ${lectura.text.length} caracteres (${previos.length + 1} en el registro; se usa el último)`,
  };
}

/**
 * Las salidas de operador VIGENTES de una ronda, con sus hallazgos: la última
 * captura de cada operador ("el hecho más reciente gana"), en el orden de su
 * primera captura. Es la ÚNICA entrada de la tabla de hallazgos: el prompt del
 * integrador, el del verificador y el informe final salen de acá, así que los
 * H## (que numera la posición) coinciden entre los tres. Antes el prompt usaba
 * todas las salidas y el informe la última por operador: con un operador
 * recapturado, el integrador contaba dos veces sus hallazgos y el informe
 * resolvía sus [H##] contra otra tabla.
 */
export function salidasVigentesDeRonda(
  hechos: readonly Hecho[],
  rondaId: string,
): { operadorId: string; salidaId: string; hallazgos: HallazgoHecho[] }[] {
  const ultima = new Map<string, SalidaOperador>();
  for (const h of hechos) if (h.tipo === "salida-operador" && h.rondaId === rondaId) ultima.set(h.operadorId, h);
  return [...ultima.values()].map((s) => ({
    operadorId: s.operadorId,
    salidaId: s.id,
    hallazgos: hechos.filter((h): h is HallazgoHecho => h.tipo === "hallazgo" && h.salidaOperadorId === s.id),
  }));
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
 * 7-1-1 (2026-09-29) — el prompt del VERIFICADOR, desde el informe del
 * integrador y la MISMA tabla que el integrador vio (`armarTablaYPromptIntegrador`
 * con las mismas salidas). `{{RESCATE}}` es la sección "QUE CONVIENE RESCATAR"
 * tal cual; `{{HALLAZGOS}}`, sólo los H## que esa sección referencia, en orden
 * de primera aparición. Un H## que no está en la tabla no se inventa: queda
 * fuera de la lista y se devuelve en `inexistentes`.
 */
export function armarPromptVerificadorDeRonda(
  pregunta: string,
  informeCrudo: string,
  tabla: TablaHallazgos,
): { ok: true; prompt: string; citados: string[]; inexistentes: string[] } | { ok: false; error: string } {
  const rescate = extraerSeccionRescate(extraerTituloDelInforme(informeCrudo).cuerpo);
  if (rescate === null) {
    const inicio = informeCrudo.replace(/\s+/g, " ").trim().slice(0, 100);
    return { ok: false, error: `el informe del integrador no tiene la seccion QUE CONVIENE RESCATAR. Se capturó (primeros 100 caracteres): "${inicio}"` };
  }
  const ids = [...new Set((rescate.match(/\[H\d+\]/g) ?? []).map((m) => m.slice(1, -1)))];
  const porId = new Map(tabla.paraPrompt.map((h) => [h.id, h]));
  const citados = ids.filter((id) => porId.has(id));
  const hallazgos = citados.map((id) => {
    const h = porId.get(id)!;
    return { id: h.id, categoria: h.categoria, eje: h.eje, descripcion: h.descripcion };
  });
  return {
    ok: true,
    prompt: armarPromptVerificador(pregunta, rescate, hallazgos),
    citados,
    inexistentes: ids.filter((id) => !porId.has(id)),
  };
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
  /** Fase 5: los ids salieron del nombre del archivo y van DENTRO del informe. */
  conversacionId: string;
  rondaId: string;
  informeIntegrador: InformeIntegrador | null;
  tabla: TablaHallazgos;
  sello: readonly Sello[];
  respuestasDelPool: readonly Respuesta[];
  citas: readonly Cita[];
  resultadosOperadores: readonly ResultadoOperador[];
  integridadEntrega: string;
  semilla: string;
  /** `proveedoresCargadosDeRonda` del registro; `null` si la ronda es anterior a ese hecho. */
  proveedoresCargados?: readonly string[] | null;
  pool?: readonly string[];
  /** Integrador real de la ronda: el que escribió el informe, o el registrado al abrirla. */
  integrador?: string | null;
  /** 7-1-1: la última verificación de la ronda y sus URLs comprobadas; `null`/ausente = no hubo. */
  salidaVerificador?: SalidaVerificador | null;
  urlsComprobadas?: readonly UrlComprobada[];
  /** Redactor (2026-10-02): la última respuesta del redactor; `null`/ausente = no hubo. */
  respuestaRedactor?: RespuestaRedactor | null;
}): string {
  const cargados = params.proveedoresCargados ?? null;
  const incompletos =
    cargados !== null && (params.pool ?? []).some((id) => !cargados.includes(id)) ? cargados : null;
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
      : parsearReferenciasIntegrador(textoDelInformeIntegrador(params.informeIntegrador), idsValidos).referencias.map((r) => ({
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
    conversacionId: params.conversacionId,
    rondaId: params.rondaId,
    informeIntegradorCrudo: params.informeIntegrador === null ? null : textoDelInformeIntegrador(params.informeIntegrador),
    referenciasEnOrden,
    hallazgos: hallazgosResueltos,
    participacionOperadores: calcularParticipacionOperadores(params.resultadosOperadores),
    condiciones,
    integridadEntrega: params.integridadEntrega,
    semilla: params.semilla,
    proveedoresCargadosIncompletos: incompletos,
    integrador: params.informeIntegrador?.operadorId ?? params.integrador ?? null,
    verificacion: params.salidaVerificador
      ? verificacionParaInforme(params.salidaVerificador, params.urlsComprobadas ?? [], hallazgosResueltos)
      : null,
    redaccion: params.respuestaRedactor ? redaccionParaInforme(params.respuestaRedactor, idsValidos) : null,
  });
}

/** Redactor: sus controles mecánicos y el texto a mostrar, para la sección que va primero en el informe. */
export function redaccionParaInforme(
  r: RespuestaRedactor,
  idsValidos: readonly string[],
): { redactorId: string; controles: string[]; cuerpo: string } {
  const c = controlesRedaccion(r, idsValidos);
  return { redactorId: r.redactorId, controles: lineasDeControl(c), cuerpo: c.cuerpo };
}

/** La respuesta VIGENTE del redactor en la ronda: la última capturada. */
export function ultimaRedaccion(hechos: readonly Hecho[], rondaId: string): RespuestaRedactor | null {
  const r = hechos.filter((h): h is RespuestaRedactor => h.tipo === "respuesta-redactor" && h.rondaId === rondaId);
  return r[r.length - 1] ?? null;
}

/**
 * 7-1-1 — resuelve la salida del verificador para el informe: cada H## con la
 * descripción del hallazgo de la tabla, y cada URL con su comprobación
 * mecánica ("responde 200", "responde 404", "no resuelve" o "sin comprobar").
 */
export function verificacionParaInforme(
  salida: SalidaVerificador,
  urls: readonly UrlComprobada[],
  hallazgos: readonly HallazgoResuelto[],
): VerificacionParaInforme {
  const descripcion = new Map(hallazgos.map((h) => [h.codigo, h.descripcion]));
  const comprobada = new Map(urls.filter((u) => u.salidaVerificadorId === salida.id).map((u) => [u.url, u]));
  const p = parsearVerificacion(textoDeLaSalidaVerificador(salida), [...descripcion.keys()]);
  return {
    items: p.verificaciones.map((v) => {
      const u = v.url === null ? undefined : comprobada.get(v.url);
      return {
        estado: v.estado,
        hallazgoId: v.hallazgoId,
        descripcion: descripcion.get(v.hallazgoId) ?? null,
        url: v.url,
        comprobacion: u === undefined ? "sin comprobar" : u.codigo === null ? "no resuelve" : `responde ${u.codigo}`,
        texto: v.texto,
      };
    }),
    puntosCiegos: p.puntosCiegos,
    preguntas: p.preguntas,
  };
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
  lecturaVerificador: T | undefined;
  lecturaRedactor?: T | undefined;
  lecturasComoRespuesta: T[];
}

export function clasificarLecturasPorEtapa<T extends { id: string }>(
  lecturas: readonly T[],
  etapa: EtapaRonda,
  poolOperadores: readonly string[],
  integradorId: string,
  verificadorId: string,
  redactorId: string = integradorId,
): ClasificacionLecturas<T> {
  const nada = { lecturaIntegrador: undefined, lecturaVerificador: undefined };
  if (etapa === "redaccion") {
    // Ya hay verificación: sólo el redactor tiene algo nuevo.
    return { lecturasOperacion: [], ...nada, lecturaRedactor: lecturas.find((l) => l.id === redactorId), lecturasComoRespuesta: [] };
  }
  if (etapa === "investigacion") {
    // Todavía no hay nada más que investigadores contestando la pregunta original.
    return { lecturasOperacion: [], ...nada, lecturasComoRespuesta: [...lecturas] };
  }
  if (etapa === "operacion") {
    // Los 8 del pool operan; deepseek (que no opera) sigue siendo un investigador más.
    return {
      lecturasOperacion: lecturas.filter((l) => poolOperadores.includes(l.id)),
      ...nada,
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
  if (etapa === "verificacion") {
    // 7-1-1: el integrador ya escribió; sólo el verificador tiene algo nuevo.
    return { lecturasOperacion: [], ...nada, lecturaVerificador: lecturas.find((l) => l.id === verificadorId), lecturasComoRespuesta: [] };
  }
  return {
    lecturasOperacion: [],
    ...nada,
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
  rol = "integrador",
): GuardaEnvioIntegrador {
  if (destinoId !== integradorId) {
    return { puede: false, motivo: `el destino "${nombreProveedor(destinoId)}" no es el ${rol} ("${nombreProveedor(integradorId)}")` };
  }
  if (compositorActual.trim().length > 0) {
    return { puede: false, motivo: `el compositor del ${rol} no esta vacio: escribir encima lo perderia sin aviso` };
  }
  return { puede: true };
}

/**
 * El aviso de "Capturar todos" sobre si los prompts de usuario coinciden entre
 * proveedores. Decisión de Juan (2026-09-25): corre SÓLO en la etapa de
 * investigación, donde los ocho reciben la misma pregunta. En operación cada
 * operador recibe a propósito un texto distinto (las seis respuestas que no
 * son la suya), y ahí el aviso era una falsa alarma. `""` = sin aviso.
 */
export function avisoPromptsDeCaptura(
  lecturas: readonly { userText?: string | null }[],
  etapa: EtapaRonda,
): string {
  if (etapa !== "investigacion") return "";
  const conPrompt = lecturas.filter((l) => typeof l.userText === "string" && l.userText.length > 0);
  if (conPrompt.length < 2) return "";
  const normalizado = (t: string): string => t.trim().replace(/\s+/g, " ").toLowerCase();
  const distintos = new Set(conPrompt.map((l) => normalizado(l.userText as string)));
  return distintos.size > 1
    ? `⚠ Los prompts de usuario capturados NO coinciden entre proveedores (${distintos.size} versiones distintas) — revisar antes de comparar respuestas.`
    : `Prompt de usuario: coincide en los ${conPrompt.length} proveedores donde se pudo leer.`;
}

/** Sólo para que la corrida simulada pueda fabricar ids de hecho sin tocar el registro real. */
export function idFicticio(): string {
  return randomUUID();
}
