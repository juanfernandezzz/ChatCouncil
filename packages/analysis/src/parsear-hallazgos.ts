/**
 * parsear-hallazgos.ts — T6, Fase 3: parseo de la salida cruda de un operador.
 * ------------------------------------------------------------------------
 * Sin `node:` y sin `fetch` — `guard:dominio` lo sostiene igual que al resto
 * de `packages/analysis`.
 *
 * REGLA 1 — sólo nueve prefijos exactos habilitan una línea; todo lo demás
 * se DESCARTA sin error. Los operadores son modelos de lenguaje: van a
 * escribir razonamiento en prosa alrededor del registro final, y eso es el
 * comportamiento ESPERADO (el prompt de operación se lo permite
 * explícitamente), no una salida corrupta.
 *
 * REGLA 4 — una etiqueta que no estaba en el cuerpo que recibió ESE operador
 * no se descarta: el hallazgo se conserva con `etiquetaInvalida: true`. Que
 * un operador invente una referencia es, en sí mismo, un hecho a registrar
 * sobre ESE operador — descartar la línea lo escondería.
 */

export type CategoriaHallazgo = "CONVERGENCIA" | "DIVERGENCIA" | "SINGULARIDAD" | "AUSENCIA";
export type CategoriaLimitacion =
  | "LIMITACION:CORPUS"
  | "LIMITACION:AMBIGUEDAD"
  | "LIMITACION:TAREA"
  | "LIMITACION:OTRA";

const CATEGORIAS_4_CAMPOS: readonly CategoriaHallazgo[] = [
  "CONVERGENCIA",
  "DIVERGENCIA",
  "SINGULARIDAD",
  "AUSENCIA",
];
const CATEGORIAS_LIMITACION: readonly CategoriaLimitacion[] = [
  "LIMITACION:CORPUS",
  "LIMITACION:AMBIGUEDAD",
  "LIMITACION:TAREA",
  "LIMITACION:OTRA",
];

export interface Hallazgo {
  categoria: CategoriaHallazgo | CategoriaLimitacion;
  /** `null` en las cuatro líneas LIMITACION — no llevan eje (regla 2). */
  eje: string | null;
  etiquetas: string[];
  descripcion: string;
  /** `true` si alguna etiqueta no estaba en el cuerpo que recibió este operador (regla 4). */
  etiquetaInvalida: boolean;
}

export interface ResultadoParseo {
  hallazgos: Hallazgo[];
  /** Cuántas líneas no vacías no calzaron con ningún prefijo válido, o no traían los campos exigidos. */
  lineasDescartadas: number;
}

/** Divide `linea` en exactamente `n` campos por "|", el último quedándose con el resto (puede contener "|"). */
function splitCampos(linea: string, n: number): string[] | null {
  const partes: string[] = [];
  let resto = linea;
  for (let i = 0; i < n - 1; i++) {
    const idx = resto.indexOf("|");
    if (idx === -1) return null;
    partes.push(resto.slice(0, idx));
    resto = resto.slice(idx + 1);
  }
  partes.push(resto);
  return partes;
}

/** Regla 3: AUSENCIA (y cualquier línea sin sostenedoras) acepta "—", "-", vacío o "NINGUNA" como "sin etiquetas". */
function parsearEtiquetas(campo: string): string[] {
  const t = campo.trim();
  if (t === "" || t === "—" || t === "-" || t.toUpperCase() === "NINGUNA") return [];
  return t
    .split(",")
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
}

function prefijoDe<T extends string>(linea: string, prefijos: readonly T[]): T | null {
  for (const p of prefijos) {
    if (linea === p || linea.startsWith(p + "|")) return p;
  }
  return null;
}

/**
 * `etiquetasValidas` es el conjunto de etiquetas que de verdad estaban en el
 * cuerpo que recibió ESTE operador (nunca la etiqueta propia del operador,
 * que por diseño de `armarCuerposPorOperador` está excluida — cae sola en
 * la regla 4 sin tratamiento especial).
 */
export function parsearHallazgos(salidaCruda: string, etiquetasValidas: readonly string[]): ResultadoParseo {
  const validas = new Set(etiquetasValidas);
  const hallazgos: Hallazgo[] = [];
  let lineasDescartadas = 0;

  for (const lineaCruda of salidaCruda.split("\n")) {
    const linea = lineaCruda.trim();
    if (linea.length === 0) continue;

    const catHallazgo = prefijoDe(linea, CATEGORIAS_4_CAMPOS);
    if (catHallazgo !== null) {
      const campos = splitCampos(linea, 4);
      if (campos === null) {
        lineasDescartadas++;
        continue;
      }
      const [, eje, etiquetasStr, descripcion] = campos as [string, string, string, string];
      const etiquetas = parsearEtiquetas(etiquetasStr);
      hallazgos.push({
        categoria: catHallazgo,
        eje: eje.trim(),
        etiquetas,
        descripcion: descripcion.trim(),
        etiquetaInvalida: etiquetas.some((e) => !validas.has(e)),
      });
      continue;
    }

    const catLimitacion = prefijoDe(linea, CATEGORIAS_LIMITACION);
    if (catLimitacion !== null) {
      const campos = splitCampos(linea, 3);
      if (campos === null) {
        lineasDescartadas++;
        continue;
      }
      const [, etiquetasStr, descripcion] = campos as [string, string, string];
      const etiquetas = parsearEtiquetas(etiquetasStr);
      hallazgos.push({
        categoria: catLimitacion,
        eje: null,
        etiquetas,
        descripcion: descripcion.trim(),
        etiquetaInvalida: etiquetas.some((e) => !validas.has(e)),
      });
      continue;
    }

    lineasDescartadas++;
  }

  return { hallazgos, lineasDescartadas };
}
