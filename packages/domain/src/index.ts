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
  /**
   * Último mensaje del usuario en el panel, leído EN LA MISMA captura que
   * `textoOriginal`. `null` si el proveedor no tiene `userMessage.selector`
   * en su spec (todavía no derivado para los nueve) o no se pudo leer.
   */
  promptUsuarioLeido: string | null;
  /**
   * Cobertura del riesgo de "sin historial" (decisión de Juan,
   * 2026-08-26/09-01): sin rondas encadenadas, un panel intervenido a mano
   * puede tener la respuesta a OTRO prompt, y nada fallaría en rojo. Se
   * compara `promptUsuarioLeido` contra el resto del pool EN ESTA MISMA
   * captura. `true` = coincide con todos los demás no-nulos; `false` = no
   * coincide con al menos uno; `null` = no hay con qué comparar (menos de
   * dos proveedores con `promptUsuarioLeido` no nulo en la captura).
   * INFORMATIVO: nunca bloquea la captura, sólo se guarda como hecho.
   */
  promptCoincideEnPool: boolean | null;
  /**
   * `<a href="http...">` REALES en el DOM del cuerpo, contados en la MISMA
   * captura que `textoOriginal`. Decide entre las dos causas de "no hay URL
   * en el texto": (a) el selector pierde una fuente que sí está en el DOM
   * como link, o (b) no hubo búsqueda web / no se citó nada. `null` si no
   * se pudo contar (lectura fallida antes de llegar al DOM).
   */
  fuentesHref: number | null;
  /**
   * HTML crudo (`outerHTML`) del nodo de la respuesta, SIN recortes de
   * `exclude` — el DATO CANÓNICO del DOM, la misma regla que ya rige para
   * `textoOriginal` respecto del texto. Un selector nuevo derivado después
   * (contar links, aislar un panel de fuentes) se puede re-aplicar sobre
   * esto sin volver a capturar. `null` si no se pudo leer.
   */
  html: string | null;
}

/**
 * Una cita: un `<a href>` real encontrado en `Respuesta.html`, derivado
 * OFFLINE del HTML crudo (T1, Fase 3). Append-only, como todo hecho: si la
 * regla de extracción cambia, se vuelve a derivar del `html` original, que
 * nunca se reemplaza (§2 de `docs/BLUEPRINT.md`).
 *
 * `dondeVive` distingue dos ubicaciones DENTRO del subárbol capturado:
 * `"cuerpo"` cuando el `<a>` está en el flujo normal del texto, y
 * `"panel-ancestro"` cuando está anidado bajo un contenedor que se reconoce
 * estructuralmente como una lista de fuentes/citas (clase, id o
 * `data-*` con "cita", "fuente", "source" o "referenc"). Esto NO cubre un
 * panel de fuentes que viva fuera del nodo capturado (ver `fuentesHref`,
 * que sí puede subir por ancestros no capturados en `html`): ese caso es
 * indistinguible de "no hay más citas" con el dato que hoy se guarda, y por
 * eso `citas.length` puede ser MENOR que `fuentesHref` — es el criterio de
 * éxito corregido de T1, no un defecto de esta extracción.
 */
export interface Cita {
  tipo: "cita";
  esquema: number;
  id: string;
  /** La `Respuesta` de la que salió: sin esto una cita no es trazable. */
  respuestaId: string;
  /** Absoluta, nunca vacía: lo que no cumple esto se descarta antes de crear la Cita. */
  url: string;
  /** Texto visible del `<a>`, con las etiquetas internas removidas y recortado. */
  textoVisible: string;
  dondeVive: "cuerpo" | "panel-ancestro";
}

/**
 * La correspondencia etiqueta-ciega → identidad real, para UNA ronda. T3
 * (Fase 3): `anonymizeReplies` (en `packages/analysis`) ya calculaba esto
 * como `seal` en memoria, pero nadie lo guardaba — sin este hecho persistido,
 * "el informe lo arma el código y desanonimiza con el sello" no tiene
 * mecanismo: la semilla sola no alcanza para reconstruirlo salvo que el
 * orden de entrada al barajado sea estable entre la ronda real y quien
 * intente reproducirla, acoplamiento que se rompe en silencio si algún día
 * cambia el orden en que las respuestas llegan a `anonymizeReplies`.
 *
 * Un `Sello` por etiqueta por ronda — misma granularidad que `Intento` y
 * `Respuesta`, no un array embebido: append-only, nunca se reescribe.
 *
 * `label` es la etiqueta BARAJADA de esa ronda ("Modelo A"...) — nunca
 * estable entre rondas, es justo lo que blindea la posición.
 *
 * `codigoEstable` ("P1".."P8") — CORREGIDO en la revisión de T3
 * (2026-09-14): la primera versión de este campo NO EXISTÍA, con el
 * argumento de que el código era "puramente derivable del orden fijo del
 * pool" y no hacía falta guardarlo. Ese argumento estaba mal: el pool YA
 * cambió tres veces en esta fase (deepseek salió del pool de operadores,
 * kimi estuvo a punto de salir), y un informe archivado que dice "P3
 * convergió con P5" queda MINTIENDO en silencio si el orden del pool usado
 * para reconstruir "P3" cambia después. `codigosEstables`
 * (`packages/analysis`) sigue siendo pura — GENERA el código a partir del
 * orden del pool EN EL MOMENTO en que se arma el cuerpo de la ronda — pero
 * lo que lo hace estable es que, una vez generado, viaja DENTRO de este
 * hecho y nunca se vuelve a calcular para esta ronda.
 */
export interface Sello {
  tipo: "sello";
  esquema: number;
  id: string;
  rondaId: string;
  label: string;
  codigoEstable: string;
  panelSourceId: string;
  replyId: string;
  attemptId: string;
}

/**
 * T6 (Fase 3) — la salida cruda de UN operador sobre el prompt de operación.
 * REGLA DEL DATO CANÓNICO (misma que rige `Respuesta.textoOriginal` y
 * `Respuesta.html`): se guarda el TEXTO CRUDO COMPLETO tal como lo devolvió
 * el operador, sin recortar ni normalizar. Los `HallazgoHecho` que salgan de
 * parsearlo son HECHOS DERIVADOS que referencian este `id` — si el parseo
 * cambia mañana, se vuelve a derivar de `salidaCruda`, que nunca se
 * reemplaza.
 *
 * `promptCompleto` guarda el PROMPT ENTERO enviado, no un nombre ni una
 * versión de plantilla: si el texto de `armarPromptOperacion` cambia en
 * marzo, una corrida de enero tiene que seguir siendo interpretable con el
 * prompt que REALMENTE se usó, no con el que esté vigente el día que alguien
 * la relea.
 */
export interface SalidaOperador {
  tipo: "salida-operador";
  esquema: number;
  id: string;
  rondaId: string;
  operadorId: string;
  promptCompleto: string;
  salidaCruda: string;
  recibidaEn: string;
}

/**
 * Un hallazgo (o una limitación) derivado de `SalidaOperador.salidaCruda`
 * por `parsearHallazgos` (`packages/analysis`). `eje` es `null` en las
 * líneas LIMITACION — no llevan eje (ver `parsear-hallazgos.ts`).
 * `etiquetaInvalida` viaja del parseo tal cual: una etiqueta que el operador
 * inventó no se descarta, se registra como hecho sobre ESE operador.
 */
export interface HallazgoHecho {
  tipo: "hallazgo";
  esquema: number;
  id: string;
  /** Referencia al dato canónico del que se derivó — nunca se copia el texto. */
  salidaOperadorId: string;
  categoria: string;
  eje: string | null;
  etiquetas: string[];
  descripcion: string;
  etiquetaInvalida: boolean;
}

export type Hecho = Conversacion | Ronda | Intento | Respuesta | Cita | Sello | SalidaOperador | HallazgoHecho;

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

const TIPOS = new Set([
  "conversacion",
  "ronda",
  "intento",
  "respuesta",
  "cita",
  "sello",
  "salida-operador",
  "hallazgo",
]);

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
