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

export interface InformeFinalInput {
  pregunta: string;
  fecha: string;
  informeIntegradorCrudo: string;
  /** Toda referencia `[H##]` encontrada en el informe, en el orden en que aparece — `parsearReferenciasIntegrador` la produce. */
  referenciasEnOrden: readonly ReferenciaResuelta[];
  /** TODOS los hallazgos de la tabla que recibió este integrador (para poder listar los no referenciados). */
  hallazgos: readonly HallazgoResuelto[];
  condiciones: readonly CondicionProveedor[];
  /** Ya formado como texto, con el detalle por panel — esta función no calcula integridad, sólo la muestra. */
  integridadEntrega: string;
  semilla: string;
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

export function armarInformeFinal(input: InformeFinalInput): string {
  const codigosExistentes = new Set(input.hallazgos.map((h) => h.codigo));
  const lecturaMarcada = marcarReferencias(input.informeIntegradorCrudo, codigosExistentes);

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

  return [
    "# Informe de ronda",
    "",
    `**Pregunta:** ${input.pregunta}`,
    `**Fecha:** ${input.fecha}`,
    "**Eje de registro:** los tres (HECHOS, FUENTES, CONCLUSIONES)",
    "",
    "## Lectura del integrador",
    "",
    lecturaMarcada,
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
