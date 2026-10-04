/**
 * parsear-verificacion.ts — 7-1-1 (2026-09-29): parseo de la salida cruda del
 * VERIFICADOR de fuentes.
 * ------------------------------------------------------------------------
 * Sin `node:` y sin `fetch` — `guard:dominio` lo sostiene igual que al resto
 * de `packages/analysis`.
 *
 * 2026-10-04: la sección 1 registra la CORRESPONDENCIA con la fuente
 * (CONFIRMA / CONTRADICE / NO_ENCONTRADA) y, aparte, el TIPO de esa fuente
 * (OFICIAL / PRIMARIA / ACADEMICA / SECUNDARIA). Las dos cosas viajan
 * separadas hasta el informe: el verificador describe el tipo, no juzga si
 * alcanza.
 *
 *   CONFIRMA|OFICIAL,PRIMARIA|H12|https://...|"cita"
 *   CONTRADICE|SECUNDARIA|H24|https://...|"lo que dice la fuente"
 *   NO_ENCONTRADA|—|H58|motivo
 *   PUNTO_CIEGO|descripción|https://... o "sin fuente"|tipo o —
 *   PREGUNTA|texto
 *
 * Mismas reglas que `parsear-hallazgos.ts`: sólo las palabras clave habilitan
 * una línea y el resto se descarta sin romper. Un H## que no está en la tabla
 * de la ronda se CONSERVA con `hallazgoInvalido: true`: citar un hallazgo
 * inexistente es un hecho sobre el verificador, no ruido.
 *
 * Las líneas del formato anterior (VERIFICADO / CONTRADICHO / NO_VERIFICADO,
 * sin campo de tipo) se siguen leyendo: son las de las rondas ya capturadas,
 * y el registro no se reescribe. Salen con `formatoAnterior: true` y sin tipos.
 */

import { splitCampos } from "./parsear-hallazgos";

export type Correspondencia = "CONFIRMA" | "CONTRADICE" | "NO_ENCONTRADA";
export type TipoFuente = "OFICIAL" | "PRIMARIA" | "ACADEMICA" | "SECUNDARIA";

const TIPOS: readonly TipoFuente[] = ["OFICIAL", "PRIMARIA", "ACADEMICA", "SECUNDARIA"];

export interface TiposDeclarados {
  /** Los tipos reconocidos, en el orden en que los escribió; vacío si puso "—" o no trajo el campo. */
  tiposFuente: TipoFuente[];
  /** Lo que escribió en el campo de tipo y no es ninguno de los cuatro: se conserva, no se descarta. */
  tiposNoReconocidos: string[];
}

export interface ItemCorrespondencia extends TiposDeclarados {
  correspondencia: Correspondencia;
  hallazgoId: string;
  /** La primera URL http(s) del campo; `null` si no trae ninguna (siempre en NO_ENCONTRADA). */
  url: string | null;
  /** La cita textual, sin las comillas de afuera; en NO_ENCONTRADA, el motivo. */
  texto: string;
  hallazgoInvalido: boolean;
  /** La línea venía en el formato anterior (VERIFICADO / CONTRADICHO / NO_VERIFICADO), sin campo de tipo. */
  formatoAnterior: boolean;
}

export interface PuntoCiego extends TiposDeclarados {
  descripcion: string;
  /** `null` cuando el verificador escribió "sin fuente" o no trajo URL. */
  url: string | null;
}

export interface ResultadoParseoVerificacion {
  correspondencias: ItemCorrespondencia[];
  puntosCiegos: PuntoCiego[];
  preguntas: string[];
  lineasDescartadas: number;
}

const ANTERIOR: Record<string, Correspondencia> = {
  VERIFICADO: "CONFIRMA",
  CONTRADICHO: "CONTRADICE",
  NO_VERIFICADO: "NO_ENCONTRADA",
};

// ponytail: toma la primera URL y le saca la puntuación final; una URL que
// termine legítimamente en ")" (Wikipedia) pierde ese paréntesis.
function primeraUrl(campo: string): string | null {
  const m = /https?:\/\/[^\s<>"'`|]+/i.exec(campo);
  return m === null ? null : m[0].replace(/[).,;\]]+$/, "");
}

function sinComillas(t: string): string {
  return t.trim().replace(/^"+|"+$/g, "").trim();
}

/** "OFICIAL,PRIMARIA", "Académica", "oficial y primaria", "—": lo reconocido y lo que no. */
function leerTipos(campo: string | undefined): TiposDeclarados {
  const r: TiposDeclarados = { tiposFuente: [], tiposNoReconocidos: [] };
  if (campo === undefined) return r;
  const partes = campo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\*/g, "")
    .split(/\s*(?:,|\/|;|\+|\s+y\s+)\s*/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^[—–-]+$/.test(p));
  for (const p of partes) {
    const t = TIPOS.find((x) => x === p.toUpperCase());
    if (t === undefined) r.tiposNoReconocidos.push(p);
    else if (!r.tiposFuente.includes(t)) r.tiposFuente.push(t);
  }
  return r;
}

// Una palabra clave es válida en cualquier punto de la línea (un modelo de
// razonamiento pega prosa delante, o escribe un párrafo sin saltos):
// `(?<![A-Za-z_])` evita que "VERIFICADO" se lea dentro de "NO_VERIFICADO".
// Se toleran mayúsculas, `**negritas**` y espacios alrededor del `|`.
const PALABRAS = "NO_ENCONTRADA|NO_VERIFICADO|VERIFICADO|CONFIRMA|CONTRADICE|CONTRADICHO|PUNTO_CIEGO|PREGUNTA";
const CLAVE = new RegExp(`(?<![A-Za-z_])(${PALABRAS})\\*{0,2}\\s*\\|`, "gi");
const VINETA = new RegExp(`^[\\s>*#\\-•\\d.)]+(?=\\**\\s*(${PALABRAS}))`, "i");

/** Los H## de un campo: "H13/H118 (parcial)" son dos hallazgos; si no hay ninguno, el campo tal cual. */
function idsDelCampo(campo: string): string[] {
  const ids = campo.match(/H\d+/gi);
  return ids === null ? [campo.trim()] : [...new Set(ids.map((i) => i.toUpperCase()))];
}

/** Parte la salida en segmentos que arrancan en una palabra clave; lo que va antes de la primera se descarta. */
function segmentos(salida: string): { linea: string; hayPrevio: boolean }[] {
  const out: { linea: string; hayPrevio: boolean }[] = [];
  // Espacio duro a espacio, y `&quot;` (GLM lo escribe como texto) y las
  // comillas tipográficas a comillas rectas, antes de cortar.
  const limpia = salida.replace(/ /g, " ").replace(/&quot;/g, '"').replace(/[“”«»]/g, '"');
  for (const cruda of limpia.split("\n")) {
    const l = cruda.replace(VINETA, "");
    const inicios = [...l.matchAll(CLAVE)].map((m) => m.index!);
    if (inicios.length === 0) {
      if (l.trim().length > 0) out.push({ linea: "", hayPrevio: true });
      continue;
    }
    if (l.slice(0, inicios[0]).trim().length > 0) out.push({ linea: "", hayPrevio: true });
    inicios.forEach((ini, i) => {
      const seg = l.slice(ini, inicios[i + 1] ?? l.length).replace(/SECCI[OÓ]N\s+\d.*$/i, "");
      out.push({ linea: seg.replace(/\*\*\s*\|/, "|").trim(), hayPrevio: false });
    });
  }
  return out;
}

/**
 * Los campos de una línea de correspondencia, después de la palabra clave.
 * Formato nuevo: TIPOS|H##|URL|cita (NO_ENCONTRADA: TIPOS|H##|motivo). Sin el
 * campo de tipo —formato anterior, o un modelo que lo omitió (el segundo campo
 * trae un H## y ningún tipo)— es H##|URL|cita y el tipo queda vacío.
 */
function camposCorrespondencia(linea: string, conUrl: boolean, formatoAnterior: boolean): { tipos: string | undefined; resto: string[] } | null {
  const segundo = splitCampos(linea, 3)?.[1] ?? "";
  const sinTipo = formatoAnterior || (/\bH\d+\b/i.test(segundo) && leerTipos(segundo).tiposFuente.length === 0);
  const c = splitCampos(linea, (conUrl ? 5 : 4) - (sinTipo ? 1 : 0));
  if (c === null) return null;
  return sinTipo ? { tipos: undefined, resto: c.slice(1) } : { tipos: c[1], resto: c.slice(2) };
}

/** `idsValidos` son los H## de la tabla de hallazgos de la ronda. */
export function parsearVerificacion(salidaCruda: string, idsValidos: readonly string[]): ResultadoParseoVerificacion {
  const validos = new Set(idsValidos);
  const r: ResultadoParseoVerificacion = { correspondencias: [], puntosCiegos: [], preguntas: [], lineasDescartadas: 0 };

  for (const { linea, hayPrevio } of segmentos(salidaCruda)) {
    if (hayPrevio) {
      r.lineasDescartadas++;
      continue;
    }
    const palabra = linea.slice(0, linea.indexOf("|")).trim().toUpperCase();
    const formatoAnterior = palabra in ANTERIOR;
    const correspondencia = ANTERIOR[palabra] ?? palabra;

    if (correspondencia === "CONFIRMA" || correspondencia === "CONTRADICE" || correspondencia === "NO_ENCONTRADA") {
      const conUrl = correspondencia !== "NO_ENCONTRADA";
      const c = camposCorrespondencia(linea, conUrl, formatoAnterior);
      if (c !== null) {
        const tipos = leerTipos(c.tipos);
        const [campoH, primero, segundo] = c.resto;
        const url = conUrl ? primeraUrl(primero!) : null;
        const texto = conUrl ? sinComillas(segundo!) : primero!.trim();
        for (const hallazgoId of idsDelCampo(campoH!)) {
          r.correspondencias.push({ correspondencia, ...tipos, hallazgoId, url, texto, hallazgoInvalido: !validos.has(hallazgoId), formatoAnterior });
        }
        continue;
      }
    } else if (palabra === "PUNTO_CIEGO") {
      // Formato nuevo con tipo (4 campos); el anterior traía 3.
      const c = splitCampos(linea, 4) ?? splitCampos(linea, 3);
      if (c !== null) {
        r.puntosCiegos.push({ descripcion: c[1]!.trim(), url: primeraUrl(c[2]!), ...leerTipos(c[3]) });
        continue;
      }
    } else if (palabra === "PREGUNTA") {
      const texto = linea.slice(linea.indexOf("|") + 1).trim();
      if (texto.length > 0) {
        r.preguntas.push(texto);
        continue;
      }
    }
    r.lineasDescartadas++;
  }
  return r;
}
