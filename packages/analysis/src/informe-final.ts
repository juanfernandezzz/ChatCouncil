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

import { nombreProveedor } from "./nombre-proveedor";
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
  /**
   * El `codigoEstable` del `Sello` de esta ronda ("P1".."P7"). AGREGADO
   * (2026-10-04): el informe desanonimiza los H## y los nombres de proveedor,
   * pero los `[P#]` que el redactor y el integrador escriben en su PROSA
   * quedaban sin clave en ninguna parte del informe — quien lo lee veía
   * "coinciden P3 y P5" sin forma de saber quiénes son. El sello ya tiene la
   * correspondencia; esta columna la publica. `null` = esa ronda no dejó sello
   * para ese proveedor (nunca se pegó la operación).
   */
  codigoEstable: string | null;
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
  /** 7-1-1: `null` o ausente = no hubo verificación en la ronda, y sus dos secciones no aparecen. */
  verificacion?: VerificacionParaInforme | null;
  /**
   * Redactor (2026-10-02): su respuesta va PRIMERO, antes del mapa. `null` o
   * ausente = no hubo redacción en la ronda y el informe queda como antes.
   */
  redaccion?: { redactorId: string; controles: readonly string[]; cuerpo: string } | null;
}

const ENCABEZADO_REDACCION = "## Respuesta a la pregunta (aporte del redactor)";

/** Los tipos de fuente que declaró el verificador, tal como los registró (los no reconocidos también). */
interface TiposParaInforme {
  tiposFuente: readonly string[];
  tiposNoReconocidos: readonly string[];
}

/**
 * 7-1-1 (2026-09-29) — lo que aportó el verificador, ya resuelto: cada línea
 * de su sección 1 con la descripción del H## que cita (`null` si no existe en
 * la tabla) y el resultado de la comprobación mecánica de su URL. Desde el
 * 2026-10-04, la correspondencia con la fuente y el tipo de fuente van en
 * campos separados.
 */
export interface VerificacionParaInforme {
  items: readonly (TiposParaInforme & {
    /** CONFIRMA, CONTRADICE o NO_ENCONTRADA. */
    correspondencia: string;
    hallazgoId: string;
    descripcion: string | null;
    url: string | null;
    /** "responde 200", "responde 404", "no resuelve" o "sin comprobar". */
    comprobacion: string;
    /** La cita textual; en NO_ENCONTRADA, el motivo. */
    texto: string;
    /** Línea del formato anterior, que no traía tipo de fuente. */
    formatoAnterior: boolean;
  })[];
  puntosCiegos: readonly (TiposParaInforme & { descripcion: string; url: string | null })[];
  preguntas: readonly string[];
}

const ENCABEZADO_VERIFICACION =
  "## Verificación de fuentes (aporte de un modelo con búsqueda, no verificado por el consejo)";
const ENCABEZADO_PUNTOS_CIEGOS = "## Puntos ciegos y preguntas derivadas (aporte del verificador)";

/** "OFICIAL, PRIMARIA"; lo no reconocido va aparte y dicho, nunca se pierde. */
function tiposLegibles(t: TiposParaInforme, sinFuente: string): string {
  const partes = [
    ...(t.tiposFuente.length > 0 ? [t.tiposFuente.join(", ")] : []),
    ...(t.tiposNoReconocidos.length > 0 ? [`tipo no reconocido: ${t.tiposNoReconocidos.join(", ")}`] : []),
  ];
  return partes.length > 0 ? partes.join("; ") : sinFuente;
}

function seccionesVerificacion(v: VerificacionParaInforme): string[] {
  const items = v.items.map((i) => {
    const tipos = i.formatoAnterior
      ? "tipo de fuente no registrado (formato anterior)"
      : tiposLegibles(i, i.correspondencia === "NO_ENCONTRADA" ? "sin fuente" : "tipo no declarado");
    return [
      `${i.correspondencia} · ${tipos} — [${i.hallazgoId}] ${i.descripcion ?? "(ese hallazgo no existe en la tabla de la ronda)"}`,
      i.url === null ? `Fuente: sin fuente — ${i.texto}` : `Fuente: ${i.url} — ${i.comprobacion}`,
      ...(i.url !== null && i.texto.length > 0 ? [`> ${i.texto}`] : []),
    ].join("\n");
  });
  const aportes = [
    ...v.puntosCiegos.map((p) =>
      p.url === null
        ? `- Punto ciego: ${p.descripcion} — Fuente: sin fuente`
        : `- Punto ciego: ${p.descripcion} — Fuente: ${p.url} (${tiposLegibles(p, "tipo no declarado")})`,
    ),
    ...v.preguntas.map((q) => `- Pregunta derivada: ${q}`),
  ];
  return [
    ENCABEZADO_VERIFICACION,
    "",
    items.length > 0 ? items.join("\n\n") : "El verificador no registro lineas de correspondencia con la fuente.",
    "",
    ENCABEZADO_PUNTOS_CIEGOS,
    "",
    aportes.length > 0 ? aportes.join("\n") : "El verificador no registro puntos ciegos ni preguntas derivadas.",
    "",
  ];
}

/**
 * Marca cada H## citado como existente o inexistente.
 *
 * CORREGIDO (2026-10-04): la versión anterior exigía el corchete EXACTO
 * `[H12]`, así que no marcaba ninguna de las formas que el prompt del redactor
 * le pide usar — `[CONFIRMA H12]`, `[CONTRADICE H12]` (antes
 * `[VERIFICADO H12]`). Medido sobre un informe armado: en el mismo párrafo,
 * `[H2]` salía `[H2 ✓]` y `[CONFIRMA H1]` salía sin marca. Y la asimetría era
 * peor que cosmética: `controlesRedaccion` (`redaccion.ts`) SÍ lee los H## de
 * cualquier corchete, así que un `[CONFIRMA H9999]` se contaba como hallazgo
 * inexistente en la línea de control del redactor y se mostraba limpio en el
 * cuerpo — quien lee no podía saber CUÁL de las citas era la inventada.
 *
 * Ahora recorre cada grupo entre corchetes y marca cada H## de adentro, con la
 * MISMA regla que `redaccion.ts` usa para detectarlos. Un `[H12]` sigue
 * saliendo `[H12 ✓]`, igual que antes.
 */
function marcarReferencias(texto: string, existentes: ReadonlySet<string>): string {
  return texto.replace(/\[[^\]\n]*\]/g, (grupo) =>
    grupo.replace(/\bH\d+\b/g, (codigo) =>
      existentes.has(codigo) ? `${codigo} ✓` : `${codigo} ✗ referencia inexistente`,
    ),
  );
}

function entradaHallazgo(h: HallazgoResuelto): string {
  const lineas = [`**${h.codigo}** — ${h.categoria}${h.eje !== null ? ` · ${h.eje}` : ""}`, `Registrado por: ${nombreProveedor(h.operadorReal)}`];
  if (h.respuestasReales.length > 0) {
    lineas.push(`Respuestas que lo sostienen: ${h.respuestasReales.map(nombreProveedor).join(", ")}`);
  }
  lineas.push(`> ${h.descripcion}`);
  return lineas.join("\n");
}

function filaCondicion(c: CondicionProveedor): string {
  const etiqueta = c.etiquetaModelo ?? "(no observada)";
  const codigo = c.codigoEstable ?? "(sin sello)";
  return `| ${codigo} | ${nombreProveedor(c.proveedorId)} | ${etiqueta} | ${c.caracteresRespuesta} | ${c.fuentesCitadas} |`;
}

function entradaParticipacion(p: ParticipacionOperador): string {
  return `**${nombreProveedor(p.operadorId)}** — ${p.estado}: ${p.detalle}`;
}

const SIN_INFORME_INTEGRADOR = "No se capturo informe del integrador para esta ronda.";

/**
 * Las marcas de integridad del archivo de operación y de redacción
 * (`[[CC-MARCA-0042-<token>]]`, `cuerpo-operador.ts`) son INSTRUMENTACIÓN, no
 * contenido: los cuatro prompts le dicen al modelo "ignóralas por completo y
 * no las menciones de nuevo". Un modelo que cita un trozo del archivo tal cual
 * se las trae igual, y de ahí pasan al informe por tres caminos distintos — el
 * cuerpo del redactor, la descripción de un hallazgo (y con ella la tabla que
 * ve el integrador, su informe y la sección 5), y la cita del verificador.
 *
 * MEDIDO (2026-10-04): sembrando UNA marca repetida en el cuerpo del redactor
 * y UNA en la descripción de un hallazgo, el informe final salía con las dos.
 *
 * Se quitan de la VISTA DERIVADA —este informe— y nunca del registro: el texto
 * crudo con las marcas sigue intacto como dato canónico, y el informe declara
 * cuántas quitó. El prefijo se eligió justamente para que ningún texto real lo
 * produzca por azar, así que no hay contenido legítimo que esto pueda borrar.
 */
const MARCA_SOLA_EN_SU_LINEA = /^[ \t]*\[\[CC-[^\]\n]*\]\][ \t]*\n/gm;
const MARCA_EN_LINEA = /[ \t]*\[\[CC-[^\]\n]*\]\]/g;

function sinMarcasDeIntegridad(texto: string): { texto: string; quitadas: number } {
  let quitadas = 0;
  const contar = (): string => {
    quitadas++;
    return "";
  };
  // Primero la marca que ocupa su propia línea, con su salto: si no, queda una
  // línea en blanco de más donde estaba.
  const limpio = texto.replace(MARCA_SOLA_EN_SU_LINEA, contar).replace(MARCA_EN_LINEA, contar);
  return { texto: limpio, quitadas };
}

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

  // CORREGIDO (2026-10-04). Dos defectos de armado, medidos sobre el informe
  // de una ronda sembrada con 259 hallazgos:
  //  · "Hallazgos referenciados" salía VACÍA —encabezado y nada debajo— cada
  //    vez que no había referencias que resolver (sin informe del integrador,
  //    o con un informe que no citó ningún H## de la tabla). Es la única
  //    sección que no tenía texto de reserva, así que un encabezado en blanco
  //    no se distinguía de un defecto de armado.
  //  · "El integrador referencio todos los hallazgos." se imprimía también
  //    cuando NO HABÍA integrador y cuando la tabla estaba vacía: afirmaba
  //    algo falso en los dos casos.
  // Los tres estados se dicen por separado, nunca se colapsan.
  const sinTabla = input.hallazgos.length === 0;
  const sinIntegrador = cuerpoIntegrador === null;
  const SIN_TABLA = "La tabla de hallazgos de esta ronda esta vacia: ningun operador dejo hallazgos parseables.";
  const seccionReferenciados = sinTabla
    ? SIN_TABLA
    : referenciados.length > 0
      ? referenciados.map(entradaHallazgo).join("\n\n")
      : sinIntegrador
        ? `${SIN_INFORME_INTEGRADOR} Sin informe no hay referencias que resolver: los ${input.hallazgos.length} hallazgos de la tabla estan completos en "Hallazgos no referenciados".`
        : "El integrador no referencio ningun hallazgo de la tabla.";
  const seccionNoReferenciados = sinTabla
    ? SIN_TABLA
    : noReferenciados.length > 0
      ? noReferenciados.map(entradaHallazgo).join("\n\n")
      : "El integrador referencio todos los hallazgos.";
  const seccionLimitaciones = sinTabla
    ? SIN_TABLA
    : limitaciones.length > 0
      ? limitaciones.map(entradaHallazgo).join("\n\n")
      : "Ningun operador registro limitaciones.";
  const seccionParticipacion =
    input.participacionOperadores.length > 0
      ? input.participacionOperadores.map(entradaParticipacion).join("\n")
      : "No hay operadores registrados para esta ronda.";

  const armado = [
    titulo === null ? "# Informe de ronda" : `# ${titulo}`,
    "",
    ...(input.redaccion
      ? [
          ENCABEZADO_REDACCION,
          "",
          `Aporte de un solo modelo (${nombreProveedor(input.redaccion.redactorId)}), basado en el análisis que sigue. No es un resultado del consejo.`,
          "",
          ...input.redaccion.controles,
          "",
          marcarReferencias(input.redaccion.cuerpo, codigosExistentes),
          "",
        ]
      : []),
    ...(rescate === null ? [] : [ENCABEZADO_RESCATE, "", rescate, ""]),
    ...(input.verificacion ? seccionesVerificacion(input.verificacion) : []),
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
    // Sin respuestas en el registro no se imprime una tabla con encabezado y
    // ninguna fila: se dice que no hay con qué llenarla.
    ...(input.condiciones.length === 0
      ? ["No hay respuestas de investigador en el registro de esta ronda."]
      : [
          "La columna Codigo es la clave de los [P#] que aparecen en el texto del",
          "redactor y del integrador: es el codigo estable del sello de esta ronda.",
          "",
          "| Codigo | Proveedor | Etiqueta de modelo | Caracteres de su respuesta | Fuentes citadas |",
          "|---|---|---|---|---|",
          input.condiciones.map(filaCondicion).join("\n"),
        ]),
    "",
    `Conversación: ${input.conversacionId}`,
    `Ronda: ${input.rondaId}`,
    "",
    `Integrador de esta ronda: ${input.integrador ? nombreProveedor(input.integrador) : "(no registrado)"}`,
    "",
    ...(input.proveedoresCargadosIncompletos
      ? ["Proveedores cargados en esta ronda:", ...input.proveedoresCargadosIncompletos.map((p) => `- ${nombreProveedor(p)}`), ""]
      : []),
    `**Integridad de entrega:** ${input.integridadEntrega}`,
    `**Semilla de la ronda:** ${input.semilla}`,
    "",
    "## Lo que este informe no dice",
    "",
    "Este informe describe como se relacionan siete respuestas entre si. No",
    "determina cual es correcta. La verificacion mecanica comprueba que una fuente",
    "existe y coincide, no que sostenga la afirmacion. El informe del integrador es",
    "una afirmacion de un modelo con su procedencia registrada, no un resultado",
    "verificado. Las limitaciones completas del instrumento estan en",
    "docs/LIMITACIONES.md.",
  ].join("\n");

  // Las marcas se quitan AL FINAL, de una sola pasada sobre el informe ya
  // armado: entran por tres caminos distintos y atajar cada uno por separado
  // garantiza olvidarse del cuarto.
  const { texto, quitadas } = sinMarcasDeIntegridad(armado);
  return quitadas === 0
    ? texto
    : [
        texto,
        "",
        `Se quitaron ${quitadas} marca(s) de integridad [[CC-...]] del texto de este informe:`,
        "son instrumentacion del archivo que leyeron los modelos, no contenido. El texto",
        "crudo con las marcas sigue intacto en el registro de la conversacion.",
      ].join("\n");
}
