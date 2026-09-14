import { anonymizeReplies } from "./anonymize";

/**
 * cuerpo-operador.ts — T3, Fase 3: el cuerpo que llega a los operadores.
 * ------------------------------------------------------------------------
 * Dos piezas, las dos con la misma preocupación: que una URL citada no le
 * diga al operador qué proveedor produjo la respuesta que está leyendo.
 *
 * LISTA BLANCA, no lista negra — decisión de esta revisión, reemplaza el
 * filtro anterior (`limpiarUrlParaAnonimizar` en `apps/desktop/src/main/
 * citas.ts`, ahora retirado). Una lista NEGRA de parámetros a quitar
 * (`utm_source`, …) sólo cubre lo que ya se vio: un `?ref=chatgpt` que
 * aparezca en una captura futura pasaría intacto y el diseño ciego se
 * rompería sin que ningún gate fallara en rojo. Con lista BLANCA el default
 * es quitar; sólo sobrevive lo que se declaró explícitamente necesario:
 *
 *   · `model` — cambia qué página del sitio se sirve (medido: chatgpt cita
 *     `?model=gpt-5.5` en una de sus URL de "Fuentes clave"; sacarlo
 *     apuntaría a una versión distinta del documento, alterando el dato).
 *
 * Todo lo demás se quita, incluido lo que hoy no delata a nadie (`_bhlid`,
 * un id de marketing del SITIO DESTINO) — el costo de quitar de más es una
 * URL algo menos específica; el de conservar de más es reventar el diseño
 * ciego en silencio. La asimetría se resuelve para el lado de quitar.
 *
 * GATE EN EL CUERPO FINAL, no sólo en la URL individual. `armarCuerpoConFuentes`
 * arma el texto que de verdad recibe el operador y, ANTES de devolverlo, lo
 * escanea con DOS reglas — nunca una búsqueda de texto libre del id del
 * proveedor en toda la URL. Esa primera versión (retirada tras medirla
 * contra la captura real) reventaba en falso: mistral cita
 * `platform.claude.com/…/claude-prompting-best-practices` —una fuente
 * LEGÍTIMA de Anthropic, cualquier proveedor puede citarla— y "claude"
 * aparece ahí dos veces sin que eso delate en absoluto quién produjo la
 * respuesta de mistral. Confundir "esta URL menciona a otro proveedor" con
 * "esta URL delata a QUIEN CITA" es el error que esa versión cometía.
 *
 * Las dos reglas que reemplazan esa búsqueda libre:
 *
 *  1. HOST propio de un proveedor — `OWN_DOMAINS`, tomado tal cual de
 *     `packages/providers/src/specs.json` (`newConversationUrl` de los
 *     nueve). Un `<a href>` que resuelve a `chatgpt.com`, `claude.ai`,
 *     `chat.z.ai` (glm — que ni siquiera contiene "glm" en el dominio,
 *     por eso la búsqueda de texto libre tampoco lo habría cubierto),
 *     etc. es casi con certeza un link de "compartir esta conversación"
 *     hacia la INTERFAZ del proveedor — eso sí delata, siempre, y no hay
 *     forma legítima de que sea otra cosa.
 *  2. QUERY, y sólo la query — nunca dominio ni ruta. Un parámetro de
 *     tracking (`utm_source=chatgpt.com`) delata porque lo puso el
 *     PROVEEDOR EMISOR sobre un link de salida; el mismo texto en la RUTA
 *     de un sitio de terceros (como el caso de mistral arriba) no lo hace.
 *     Es la regla que de verdad cubre "un parámetro nuevo que la lista
 *     blanca no previó" — el motivo por el que esta pieza existe.
 *
 * Es una ASERCIÓN EN TIEMPO DE EJECUCIÓN (mismo patrón que la aserción
 * post-scrub de `provider-names.ts`): si el cuerpo filtra identidad por
 * cualquiera de las dos reglas, esta función TIRA, nunca devuelve el texto
 * filtrado. `scripts/guard-sellado.mjs` la ejecuta contra fixtures —uno
 * limpio, uno que filtra por HOST propio— para probarla en rojo antes de
 * confiar en ella.
 *
 * LÍMITE HONESTO, el mismo que ya registra `docs/LIMITACIONES.md`: este gate
 * cubre PARÁMETROS y hosts PROPIOS del pool, nunca dominios de TERCEROS.
 * `developers.openai.com`, `platform.claude.com` citados por cualquier
 * proveedor son fuentes legítimas — quitarlas sería alterar el dato
 * canónico, así que el gate no las toca. La anonimización no sobrevive a
 * que una fuente citada sea, ELLA MISMA, del mismo linaje que el proveedor
 * que la cita (eso ya está en `docs/LIMITACIONES.md`); sí sobrevive a que
 * el proveedor emisor deje su propia marca en el link de salida, y eso es
 * lo que esta pieza cierra.
 */

/**
 * `newConversationUrl` de los nueve, medido de `packages/providers/src/
 * specs.json` — no inventado. Nótese que glm (`chat.z.ai`) y kimi
 * (`kimi.ai`) no contienen su id de proveedor en el dominio: exactamente
 * el motivo por el que una búsqueda de texto libre del id NO alcanza para
 * cubrir un link de "compartir esta conversación".
 */
const OWN_DOMAINS = [
  "chatgpt.com",
  "chat.z.ai",
  "claude.ai",
  "gemini.google.com",
  "grok.com",
  "chat.mistral.ai",
  "chat.qwen.ai",
  "kimi.ai",
  "chat.deepseek.com",
] as const;

const IDS_PROVEEDOR = ["chatgpt", "gemini", "claude", "grok", "mistral", "glm", "kimi", "qwen", "deepseek"] as const;

/** Únicos parámetros de query que sobreviven la limpieza — declarados uno por uno, con motivo en la cabecera. */
const PARAMS_PERMITIDOS = new Set(["model"]);

/**
 * Quita todo parámetro de query salvo `PARAMS_PERMITIDOS`. Manipulación de
 * STRINGS, no la API `URL` — a propósito: `packages/analysis` no tiene lib
 * DOM ni Node en su `tsconfig` (es portable, BLUEPRINT §3), y esto no
 * necesita parsear una URL de verdad para hacer su trabajo. Conserva el
 * fragmento (`#...`) tal cual: no es asunto de esta función.
 */
export function limpiarQueryWhitelist(url: string): string {
  const qIdx = url.indexOf("?");
  if (qIdx === -1) return url;
  const hashIdx = url.indexOf("#", qIdx);
  const base = url.slice(0, qIdx);
  const query = hashIdx === -1 ? url.slice(qIdx + 1) : url.slice(qIdx + 1, hashIdx);
  const hash = hashIdx === -1 ? "" : url.slice(hashIdx);
  const conservados = query
    .split("&")
    .filter((par) => par.length > 0)
    .filter((par) => {
      const nombre = par.split("=")[0] ?? "";
      try {
        return PARAMS_PERMITIDOS.has(decodeURIComponent(nombre));
      } catch {
        return false; // nombre mal codificado: no es un parametro conocido, se descarta
      }
    });
  return base + (conservados.length > 0 ? "?" + conservados.join("&") : "") + hash;
}

function hostDe(url: string): string {
  const sinEsquema = url.replace(/^https?:\/\//i, "");
  const fin = sinEsquema.search(/[/?#]/);
  return (fin === -1 ? sinEsquema : sinEsquema.slice(0, fin)).toLowerCase();
}

function esHostPropio(host: string): boolean {
  return OWN_DOMAINS.some((dominio) => host === dominio || host.endsWith("." + dominio));
}

/** Sólo la porción de query de la URL — nunca dominio ni ruta (ver cabecera del archivo). */
function queryDe(url: string): string {
  const qIdx = url.indexOf("?");
  if (qIdx === -1) return "";
  const hashIdx = url.indexOf("#", qIdx);
  return (hashIdx === -1 ? url.slice(qIdx + 1) : url.slice(qIdx + 1, hashIdx)).toLowerCase();
}

/**
 * Toda URL `http(s)` en `texto` que delate al proveedor por HOST PROPIO
 * (regla 1) o por el id de algún proveedor en su QUERY (regla 2, nunca en
 * dominio ni ruta — ver cabecera del archivo para el caso real que motivó
 * esta distinción).
 */
export function fugasDeProveedorEnUrls(texto: string): string[] {
  const hallazgos: string[] = [];
  const re = /https?:\/\/\S+/gi;
  for (const m of texto.matchAll(re)) {
    const url = m[0];
    if (esHostPropio(hostDe(url))) {
      hallazgos.push(url);
      continue;
    }
    const query = queryDe(url);
    if (query.length > 0 && IDS_PROVEEDOR.some((id) => query.includes(id))) {
      hallazgos.push(url);
    }
  }
  return hallazgos;
}

/**
 * Arma el cuerpo que recibe el operador: el texto de la respuesta más una
 * lista de fuentes citadas, con las URL YA LIMPIAS. `Cita.url` (el dato
 * canónico, ver `apps/desktop/src/main/citas.ts`) nunca se toca — esta
 * función no la reemplaza, arma una VISTA nueva para el cuerpo ciego.
 *
 * TIRA si, después de armado, el cuerpo todavía filtra identidad de
 * proveedor por URL — nunca devuelve un cuerpo que no pasó su propia
 * verificación.
 */
export function armarCuerpoConFuentes(texto: string, urlsCitadas: readonly string[]): string {
  const limpias = urlsCitadas.map(limpiarQueryWhitelist);
  const cuerpo =
    limpias.length === 0
      ? texto
      : `${texto}\n\nFuentes citadas:\n${limpias.map((u) => `- ${u}`).join("\n")}`;
  const fugas = fugasDeProveedorEnUrls(cuerpo);
  if (fugas.length > 0) {
    throw new Error(
      `cuerpo anonimizado filtra identidad de proveedor por URL (${fugas.length}): ${fugas.join(" | ")}`,
    );
  }
  return cuerpo;
}

/**
 * DOS SISTEMAS DE IDENTIFICADOR, decidido en la revisión de T3 — no se
 * rediscute:
 *  · Etiqueta BARAJADA POR RONDA (`anonymizeReplies`, "Modelo A".."H"): la
 *    que ven los analistas, derrota el sesgo de posición.
 *  · Código ESTABLE POR CONVERSACIÓN (`P1`..`Pn`, esta función): sólo para
 *    armar el INFORME FINAL, después de que el análisis ciego terminó y
 *    fuera de ese camino — nunca se le muestra a un analista.
 *
 * CORRECCIÓN (revisión de T3, 2026-09-14): esta función SIGUE siendo pura
 * —no toca red ni disco—, pero su resultado **SÍ se persiste**, dentro de
 * cada `Sello` (`Sello.codigoEstable`, `packages/domain`). La primera
 * versión de este comentario decía "sin persistencia a propósito, se
 * recalcula del orden del pool" — eso rompe en cuanto el pool cambie, y
 * el pool YA cambió tres veces en esta fase (deepseek salió del pool de
 * operadores, kimi estuvo a punto de salir). Un informe archivado dice "P3
 * convergió con P5"; si el orden del pool se lee de nuevo seis meses
 * después para reconstruir qué es "P3", un pool distinto da una respuesta
 * distinta y el informe queda MINTIENDO sin que nada falle. Por eso esta
 * función sirve para GENERAR el código en el momento en que se arma el
 * cuerpo de una ronda (`apps/desktop/src/main/operador.ts`), y lo que hace
 * estable al código no es la función — es que, una vez generado, se
 * escribe en un hecho append-only y nunca se vuelve a calcular para esa
 * ronda.
 */
export function codigosEstables(idsEnOrden: readonly string[]): ReadonlyMap<string, string> {
  const mapa = new Map<string, string>();
  idsEnOrden.forEach((id, i) => mapa.set(id, `P${i + 1}`));
  return mapa;
}

/**
 * T4 — MARCA CANARIA. Un token único al final del cuerpo de CADA operador
 * (uno por operador, no compartido: si el pipeline de un proveedor trunca
 * SU adjunto, sólo esa respuesta se marca no confiable, no las de los
 * demás). Justificación ya medida en T3 (ver "El volumen decide pegado vs.
 * archivo" en `docs/BLUEPRINT.md`): ~26.800 tokens por operador no entran
 * pegados en el compositor, van como archivo adjunto — y un archivo
 * truncado por el pipeline de ingesta de un proveedor pasa en VERDE si
 * nadie lo comprueba. El texto de la marca no importa mientras sea
 * reconocible; lo que importa es que el token sea único y que el código,
 * no el operador, sea quien note su ausencia.
 */
export function agregarMarcaCanaria(cuerpo: string, token: string): string {
  return `${cuerpo}\n\n---\nMARCA DE INTEGRIDAD: repetí exactamente este token al final de tu respuesta, en su propia línea: ${token}`;
}

/**
 * `true` si el token de la marca canaria de ESTE operador aparece en el
 * texto que devolvió — `false` = el archivo llegó truncado (u operado sin
 * seguir la instrucción), y la respuesta se marca no confiable. El criterio
 * de éxito es que esta función lo detecte sola, sin que el operador lo haya
 * reportado.
 */
export function marcaCanariaPresente(respuestaOperador: string, token: string): boolean {
  return respuestaOperador.includes(token);
}

/**
 * T5, LA MITAD PURA — armar los 8 cuerpos por operador. La otra mitad
 * (entregar el archivo al panel) necesita la Parte 2 de la interfaz, que
 * todavía no existe; ARMAR el cuerpo no necesita nada de eso, es código
 * puro sobre datos que T1/T3 ya producen. Reutiliza `anonymizeReplies`
 * (T3, sin tocar su lógica) para el barajado y las etiquetas.
 */
export interface RespuestaParaOperar {
  proveedorId: string;
  replyId: string;
  attemptId: string;
  texto: string;
  urlsCitadas: readonly string[];
}

export interface EntradaSelloConCodigo {
  label: string;
  panelSourceId: string;
  replyId: string;
  attemptId: string;
  codigoEstable: string;
}

export interface CuerpoOperador {
  /** El proveedor que VA A OPERAR este cuerpo — quién lo recibe, no de quién habla el contenido. */
  operadorId: string;
  cuerpo: string;
  tokenCanario: string;
  /** Sólo para verificar el criterio de exclusión — nunca es lo que el operador lee. */
  proveedoresIncluidos: string[];
}

export interface CuerposPorOperador {
  cuerpos: CuerpoOperador[];
  sello: EntradaSelloConCodigo[];
}

/**
 * `respuestas` tiene que ser EXACTAMENTE el pool (8, un `proveedorId` cada
 * una); `poolOrden` es el mismo conjunto de ids en el orden fijo declarado
 * (BLUEPRINT §1) — de ahí sale `codigosEstables`. `generarToken` es
 * INYECTADO, mismo motivo que `esperar` en T2 (`verificar-fuentes.ts`):
 * `packages/analysis` no puede nombrar `crypto.randomUUID` sin dejar de ser
 * portable, y una prueba necesita tokens PREDECIBLES para poder comparar.
 */
export function armarCuerposPorOperador(
  respuestas: readonly RespuestaParaOperar[],
  poolOrden: readonly string[],
  shuffleSeedNumerica: number,
  generarToken: () => string,
): CuerposPorOperador {
  const analizables = respuestas.map((r) => ({
    panelSourceId: r.proveedorId,
    replyId: r.replyId,
    attemptId: r.attemptId,
    displayName: r.proveedorId,
    text: r.texto,
  }));
  const { labeled, seal } = anonymizeReplies(analizables, true, shuffleSeedNumerica);

  const urlsPor = new Map(respuestas.map((r) => [r.proveedorId, r.urlsCitadas]));
  const codigos = codigosEstables(poolOrden);
  const selloConCodigo: EntradaSelloConCodigo[] = seal.map((s) => ({
    ...s,
    codigoEstable: codigos.get(s.panelSourceId) ?? "",
  }));

  const cuerpos: CuerpoOperador[] = poolOrden.map((operadorId) => {
    const bloques: string[] = [];
    const incluidos: string[] = [];
    labeled.forEach((l, i) => {
      const proveedorDeEsteLabel = seal[i]!.panelSourceId;
      if (proveedorDeEsteLabel === operadorId) return; // exclusión de autoevaluación
      const urls = urlsPor.get(proveedorDeEsteLabel) ?? [];
      bloques.push(`### Respuesta ${l.label}\n${armarCuerpoConFuentes(l.text, urls)}`);
      incluidos.push(proveedorDeEsteLabel);
    });
    const token = generarToken();
    const cuerpo = agregarMarcaCanaria(bloques.join("\n\n"), token);
    const fugas = fugasDeProveedorEnUrls(cuerpo);
    if (fugas.length > 0) {
      throw new Error(`cuerpo del operador ${operadorId} filtra identidad de proveedor por URL: ${fugas.join(" | ")}`);
    }
    return { operadorId, cuerpo, tokenCanario: token, proveedoresIncluidos: incluidos };
  });

  return { cuerpos, sello: selloConCodigo };
}
