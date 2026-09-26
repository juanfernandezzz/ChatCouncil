/**
 * informe-final.ts — T7/T8, Fase 3 (paso h del cableado, BLUEPRINT §T7).
 * ------------------------------------------------------------------------
 * Arma el informe final EN CÓDIGO, nunca con un LLM (decisión dada). Toma
 * datos YA resueltos —el integrador ya escribió, la tabla ya se armó, el
 * sello ya desanonimizó— y sólo los junta en el formato exacto. Esta función
 * no decide nada: no elige qué hallazgo es válido, no interpreta el texto
 * del integrador, sólo lo reproduce marcando cada referencia como existente
 * o no.
 *
 * La sección "Lo que este informe no dice" va SIEMPRE, literal, con el
 * mismo texto — decisión dada, no se parametriza ni se omite nunca: un
 * informe que no declara lo que no dice se lee como si lo dijera.
 *
 * Sin `node:` y sin `fetch` — `guard:dominio` lo sostiene igual que al
 * resto de `packages/analysis`.
 */

import { ENCABEZADO_RESCATE, extraerSeccionRescate, extraerTituloDelInforme } from "./titulo-informe";

export interface HallazgoResuelto {
  /** "H12" — el código que el integrador vio en la tabla. */
  codigo: string;
  categoria: string;
  eje: string | null;
  /** Nombres reales (proveedorId) de las respuestas que sostienen el hallazgo, ya desanonimizadas con el sello. */
  respuestasReales: readonly string[];
  descripcion: string;
  /** proveedorId real del operador que lo registró, ya desanonimizado con el mapa de `armarTablaHallazgos`. */
  operadorReal: string;
}

export interface ReferenciaResuelta {
  codigo: string;
  existe: boolean;
}

export interface CondicionProveedor {
  proveedorId: string;
  etiquetaModelo: string | null;
  caracteresRespuesta: number;
  fuentesCitadas: number;
}

/**
 * Cuota real de la ronda: 8 operadores, 17 mensajes en total (BLUEPRINT §1).
 * `"ok"` — devolvió al menos un hallazgo parseable. `"sin-hallazgos"` — su
 * `SalidaOperador` SE CAPTURÓ (nunca se descarta), pero `parsearHallazgos`
 * no encontró ninguna línea válida. `"fallo"` — no hay `SalidaOperador` en
 * absoluto para este operador (no respondió, o la captura falló antes de
 * persistir nada). Las tres son HECHOS, ninguna es "ausencia silenciosa".
 */
export type EstadoOperador = "ok" | "sin-hallazgos" | "fallo";

export interface ParticipacionOperador {
  operadorId: string;
  estado: EstadoOperador;
  /** "7 hallazgos", "0 hallazgos parseables (3 líneas de prosa descartadas)", "no se capturó salida: <motivo>". */
  detalle: string;
}

export interface InformeFinalInput {
  pregunta: string;
  fecha: string;
  /**
   * Los ids del registro (Fase 5). Salieron del NOMBRE del archivo, que ahora
   * es fecha y título, y pasaron acá: sin ellos el informe no se puede volver
   * a atar al registro que lo produjo.
   */
  conversacionId: string;
  rondaId: string;
  /**
   * `null` cuando el integrador falló y no se capturó ningún `InformeIntegrador`
   * — el instrumento tiene que poder producir el resto del informe igual: la
   * tabla de hallazgos NO depende del integrador, sólo de las `SalidaOperador`.
   */
  informeIntegradorCrudo: string | null;
  /** Toda referencia `[H##]` encontrada en el informe, en el orden en que aparece — `parsearReferenciasIntegrador` la produce. Vacío si `informeIntegradorCrudo` es `null`. */
  referenciasEnOrden: readonly ReferenciaResuelta[];
  /** TODOS los hallazgos de la tabla que recibió este integrador (para poder listar los no referenciados). */
  hallazgos: readonly HallazgoResuelto[];
  /** Uno por operador del pool — incluye a los que fallaron o no dieron hallazgos, nunca sólo a los que salieron bien. */
  participacionOperadores: readonly ParticipacionOperador[];
  condiciones: readonly CondicionProveedor[];
  /** Ya formado como texto, con el detalle por panel — esta función no calcula integridad, sólo la muestra. */
  integridadEntrega: string;
  semilla: string;
  /**
   * Sólo cuando la ronda corrió con MENOS que el pool completo (selección de
   * "Proveedores al iniciar…"): la lista de lo que estuvo cargado. `null` o
   * ausente = pool completo, o ronda anterior a ese registro — no se imprime.
   */
  proveedoresCargadosIncompletos?: readonly string[] | null;
  /** Proveedor real que integró esta ronda (2026-09-24): el integrador es una preferencia y puede cambiar entre rondas. */
  integrador?: string | null;
}

function marcarReferencias(texto: string, existentes: ReadonlySet<string>): string {
  return texto.replace(/\[H\d+\]/g, (m) => {
    const codigo = m.slice(1, -1);
    return existentes.has(codigo) ? `[${codigo} ✓]` : `[${codigo} ✗ referencia inexistente]`;
  });
}

function entradaHallazgo(h: HallazgoResuelto): string {
  const lineas = [`**${h.codigo}** — ${h.categoria}${h.eje !== null ? ` · ${h.eje}` : ""}`, `Registrado por: ${h.operadorReal}`];
  if (h.respuestasReales.length > 0) {
    lineas.push(`Respuestas que lo sostienen: ${h.respuestasReales.join(", ")}`);
  }
  lineas.push(`> ${h.descripcion}`);
  return lineas.join("\n");
}

function filaCondicion(c: CondicionProveedor): string {
  const etiqueta = c.etiquetaModelo ?? "(no observada)";
  return `| ${c.proveedorId} | ${etiqueta} | ${c.caracteresRespuesta} | ${c.fuentesCitadas} |`;
}

function entradaParticipacion(p: ParticipacionOperador): string {
  return `**${p.operadorId}** — ${p.estado}: ${p.detalle}`;
}

const SIN_INFORME_INTEGRADOR = "No se capturo informe del integrador para esta ronda.";

export function armarInformeFinal(input: InformeFinalInput): string {
  const codigosExistentes = new Set(input.hallazgos.map((h) => h.codigo));
  // La línea "TITULO:" no es prosa del informe: pasa a ser el encabezado y no
  // se muestra en "Lectura del integrador". El texto crudo COMPLETO sigue
  // guardado en el hecho `InformeIntegrador`, intacto.
  const { titulo, cuerpo: cuerpoIntegrador } =
    input.informeIntegradorCrudo === null
      ? { titulo: null, cuerpo: null }
      : extraerTituloDelInforme(input.informeIntegradorCrudo);
  const lecturaMarcada =
    cuerpoIntegrador === null ? SIN_INFORME_INTEGRADOR : marcarReferencias(cuerpoIntegrador, codigosExistentes);
  // Sección 5 del integrador ("QUE CONVIENE RESCATAR") al principio del
  // informe: es lo que lee quien hizo la pregunta. `null` en rondas anteriores
  // a ese cambio — ahí el encabezado no aparece, nunca vacío.
  // Marcada igual que la lectura: es la sección sobre la que Juan actúa, y una
  // referencia inventada tiene que verse ✗ ahí también, no sólo más abajo.
  const rescateCrudo = cuerpoIntegrador === null ? null : extraerSeccionRescate(cuerpoIntegrador);
  const rescate = rescateCrudo === null ? null : marcarReferencias(rescateCrudo, codigosExistentes);

  // Hallazgos REFERENCIADOS: sólo los que existen, en orden de PRIMERA aparición.
  const referenciados: HallazgoResuelto[] = [];
  const vistos = new Set<string>();
  for (const r of input.referenciasEnOrden) {
    if (!r.existe || vistos.has(r.codigo)) continue;
    vistos.add(r.codigo);
    const h = input.hallazgos.find((x) => x.codigo === r.codigo);
    if (h) referenciados.push(h);
  }
  const noReferenciados = input.hallazgos.filter((h) => !vistos.has(h.codigo));
  const limitaciones = input.hallazgos.filter((h) => h.categoria.startsWith("LIMITACION:"));

  const seccionReferenciados = referenciados.map(entradaHallazgo).join("\n\n");
  const seccionNoReferenciados =
    noReferenciados.length > 0
      ? noReferenciados.map(entradaHallazgo).join("\n\n")
      : "El integrador referencio todos los hallazgos.";
  const seccionLimitaciones =
    limitaciones.length > 0 ? limitaciones.map(entradaHallazgo).join("\n\n") : "Ningun operador registro limitaciones.";
  const tablaCondiciones = input.condiciones.map(filaCondicion).join("\n");
  const seccionParticipacion = input.participacionOperadores.map(entradaParticipacion).join("\n");

  return [
    titulo === null ? "# Informe de ronda" : `# ${titulo}`,
    "",
    ...(rescate === null ? [] : [ENCABEZADO_RESCATE, "", rescate, ""]),
    `**Pregunta:** ${input.pregunta}`,
    `**Fecha:** ${input.fecha}`,
    "**Eje de registro:** los tres (HECHOS, FUENTES, CONCLUSIONES)",
    "",
    "## Lectura del integrador",
    "",
    lecturaMarcada,
    "",
    "## Participacion de operadores",
    "",
    seccionParticipacion,
    "",
    "## Hallazgos referenciados",
    "",
    seccionReferenciados,
    "",
    "## Hallazgos no referenciados",
    "",
    seccionNoReferenciados,
    "",
    "## Limitaciones registradas por los operadores",
    "",
    seccionLimitaciones,
    "",
    "## Condiciones de la ronda",
    "",
    "| Proveedor | Etiqueta de modelo | Caracteres de su respuesta | Fuentes citadas |",
    "|---|---|---|---|",
    tablaCondiciones,
    "",
    `Conversación: ${input.conversacionId}`,
    `Ronda: ${input.rondaId}`,
    "",
    `Integrador de esta ronda: ${input.integrador ?? "(no registrado)"}`,
    "",
    ...(input.proveedoresCargadosIncompletos
      ? ["Proveedores cargados en esta ronda:", ...input.proveedoresCargadosIncompletos.map((p) => `- ${p}`), ""]
      : []),
    `**Integridad de entrega:** ${input.integridadEntrega}`,
    `**Semilla de la ronda:** ${input.semilla}`,
    "",
    "## Lo que este informe no dice",
    "",
    "Este informe describe como se relacionan ocho respuestas entre si. No",
    "determina cual es correcta. La verificacion mecanica comprueba que una fuente",
    "existe y coincide, no que sostenga la afirmacion. El informe del integrador es",
    "una afirmacion de un modelo con su procedencia registrada, no un resultado",
    "verificado. Las limitaciones completas del instrumento estan en",
    "docs/LIMITACIONES.md.",
  ].join("\n");
}
