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
 * PURA y sin persistencia a propósito: el orden del pool ya está declarado
 * en `docs/BLUEPRINT.md` §1 (chatgpt, gemini, claude, grok, mistral, glm,
 * kimi, qwen — deepseek fuera del pool, sólo informa) y es fijo. Guardar un
 * hecho para algo que se recalcula siempre igual, a partir de un dato que ya
 * vive en un solo lugar, sería una segunda fuente de verdad que se puede
 * desincronizar de la primera — el sello sí se persiste porque depende del
 * barajado aleatorio de esa ronda puntual, esto no depende de nada que
 * cambie ronda a ronda.
 */
export function codigosEstables(idsEnOrden: readonly string[]): ReadonlyMap<string, string> {
  const mapa = new Map<string, string>();
  idsEnOrden.forEach((id, i) => mapa.set(id, `P${i + 1}`));
  return mapa;
}
