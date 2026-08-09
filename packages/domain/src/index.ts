/**
 * MODELO DE DATOS — Fase 2.
 *
 * TypeScript puro. Sin Electron, sin DOM, sin `node:*`. Esa restricción no es
 * estética: es lo que hace que el modelo pueda irse a otro lado sin arrastrar
 * la aplicación de escritorio detrás (§4), y `guard:dominio` la sostiene con
 * un mecanismo en vez de con una nota de intención.
 *
 * FORMATO: una línea de JSON por hecho, en un archivo por conversación
 * (decisión 1 de la Fase 2). Append-only. Nunca se reescribe una línea ya
 * escrita: el original es el dato canónico, y lo que se corrige se corrige
 * agregando, no pisando.
 */

export const VERSION_ESQUEMA = 1;

/**
 * De dónde salió el fin de una respuesta, y con qué confianza se leyó.
 *
 * Esto es lo que distingue esta fase de "guardar el texto". Una respuesta
 * guardada sin saber si su fin se OBSERVÓ o se DEDUJO es una respuesta de
 * procedencia desconocida, y seis meses después no hay forma de saber si era
 * corta o si estaba truncada (§7.9).
 */
export interface Procedencia {
  /** Etiqueta de modelo leída de la interfaz. `null` = el proveedor no la expone. */
  modelLabel: string | null;
  /** Cuándo se leyó esa etiqueta. Sin esto no se puede fechar una deriva de versión. */
  modelLabelLeidaEn: string | null;
  /** `observado` = un indicador lo dijo. `inferido` = sólo se dedujo de la quietud. */
  finDe: "observado" | "inferido";
  /** La ventana de quietud VIGENTE en esa lectura, no la de hoy. */
  quiescenceMs: number | null;
  /** `true` generando, `false` terminado, **`null` no observable**. El null viaja al disco. */
  generandoAlLeer: boolean | null;
  /** Estado del hilo, derivado de hechos del proceso, no del texto. */
  continuidad: "confirmada" | "refutada" | "indeterminada";
  /** Con qué método entró el texto en el compositor. */
  metodoEscritura: "execCommand" | "paste" | "textContent" | null;
  /** Ancho x alto del panel al leer: es variable de la prueba, no adorno (§7.29). */
  panel: string | null;
}

export interface Conversacion {
  tipo: "conversacion";
  esquema: number;
  id: string;
  creadaEn: string;
  titulo: string | null;
  /** Corrida del arnés, no uso real. Se marca para poder excluirla del análisis. */
  esPrueba: boolean;
}

export interface Ronda {
  tipo: "ronda";
  esquema: number;
  id: string;
  conversacionId: string;
  indice: number;
  prompt: string;
  enviadaEn: string;
  /**
   * Semilla del barajado. La usa la Fase 3, y se guarda desde ya: agregarla
   * después obliga a migrar el registro entero.
   */
  semilla: string | null;
}

/**
 * Un INTENTO de envío. Va separado de la respuesta a propósito: un envío que
 * falla es un hecho, y hoy se pierde entero.
 */
export interface Intento {
  tipo: "intento";
  esquema: number;
  id: string;
  rondaId: string;
  proveedorId: string;
  ok: boolean;
  error: string | null;
  enviadoEn: string;
}

export interface Respuesta {
  tipo: "respuesta";
  esquema: number;
  id: string;
  rondaId: string;
  proveedorId: string;
  /** El texto tal como se leyó. Nunca se normaliza ni se recorta acá. */
  textoOriginal: string;
  leidaEn: string;
  error: string | null;
  procedencia: Procedencia;
}

export type Hecho = Conversacion | Ronda | Intento | Respuesta;

/** Serializa un hecho a su línea. Sin saltos adentro: una línea es un hecho. */
export function aLinea(hecho: Hecho): string {
  return JSON.stringify(hecho);
}

/**
 * Resultado de leer un registro. `hechos` son las líneas que se entendieron;
 * `lineasIlegibles` son las que no.
 *
 * Las ilegibles se CUENTAN y se DEVUELVEN, nunca se saltean en silencio. Un
 * archivo append-only puede quedar con la última línea a medio escribir si el
 * proceso se cortó, y eso hay que poder verlo — es la misma disciplina que
 * distingue "no pasó" de "no pude ver".
 */
export interface RegistroLeido {
  hechos: Hecho[];
  lineasIlegibles: { numero: number; contenido: string }[];
  /** `true` si la ÚNICA ilegible es la última: la firma de un corte a mitad de escritura. */
  ultimaLineaIncompleta: boolean;
}

const TIPOS = new Set(["conversacion", "ronda", "intento", "respuesta"]);

export function leerRegistro(contenido: string): RegistroLeido {
  const lineas = contenido.split("\n");
  const hechos: Hecho[] = [];
  const ilegibles: { numero: number; contenido: string }[] = [];
  let ultimoIndiceNoVacio = -1;

  lineas.forEach((linea, i) => {
    if (linea.trim().length === 0) return;
    ultimoIndiceNoVacio = i;
    try {
      const v: unknown = JSON.parse(linea);
      if (typeof v !== "object" || v === null || !TIPOS.has(String((v as { tipo?: unknown }).tipo))) {
        ilegibles.push({ numero: i + 1, contenido: linea.slice(0, 200) });
        return;
      }
      hechos.push(v as Hecho);
    } catch {
      ilegibles.push({ numero: i + 1, contenido: linea.slice(0, 200) });
    }
  });

  return {
    hechos,
    lineasIlegibles: ilegibles,
    ultimaLineaIncompleta:
      ilegibles.length === 1 && ilegibles[0]!.numero === ultimoIndiceNoVacio + 1,
  };
}

/**
 * Deriva la procedencia de una lectura. Función PURA y sin dependencias, para
 * que la misma derivación valga en el camino real y en el arnés: una segunda
 * copia de esta lógica se desincronizaría (§7.2).
 *
 * `finDe` sale de `completionKind`: si el proveedor no dijo cómo terminó, el
 * fin es INFERIDO. El valor por defecto es el conservador a propósito.
 */
export function derivarProcedencia(lectura: {
  modelLabel?: string | null;
  completionKind?: "element-gone" | "quiescence";
  quiescenceMs?: number;
  generating: boolean | null;
}, contexto: {
  ahora: string;
  continuidad: Procedencia["continuidad"];
  metodoEscritura: Procedencia["metodoEscritura"];
  panel: string | null;
}): Procedencia {
  const label = lectura.modelLabel ?? null;
  return {
    modelLabel: label,
    modelLabelLeidaEn: label === null ? null : contexto.ahora,
    finDe: lectura.completionKind === "element-gone" ? "observado" : "inferido",
    quiescenceMs: lectura.quiescenceMs ?? null,
    generandoAlLeer: lectura.generating,
    continuidad: contexto.continuidad,
    metodoEscritura: contexto.metodoEscritura,
    panel: contexto.panel,
  };
}
