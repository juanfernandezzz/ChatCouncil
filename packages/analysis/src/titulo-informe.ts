/**
 * titulo-informe.ts — Fase 5: el nombre del archivo del informe y las dos
 * piezas del informe del integrador que lo alimentan.
 * ------------------------------------------------------------------------
 * MOTIVO (decisión de Juan, 2026-09-26): el nombre viejo era
 * `<conversacionId>-<rondaId>-<HHMMSS>.md` — dos UUID y una hora. Mirando la
 * carpeta `informes` no había forma de saber qué ronda era cuál. El nombre
 * nuevo es fecha y hora LOCALES más el título que escribe el integrador.
 *
 * Los ids NO se pierden: pasan a vivir DENTRO del informe, en "Condiciones de
 * la ronda" (`informe-final.ts`). Perder el id sería perder la trazabilidad
 * al registro; el nombre del archivo no es el lugar donde vive un id.
 *
 * Todo acá es PURO: sin `node:`, sin `fetch`, sin reloj propio y sin sistema
 * de archivos. La fecha entra como `Date` y la existencia de un nombre entra
 * como predicado — `guard:dominio` lo sostiene, y es lo que permite probar
 * los cuatro casos con datos sembrados sin abrir Electron.
 */

/** Encabezado literal bajo el que va la sección 5 del integrador, al principio del informe. */
export const ENCABEZADO_RESCATE = "## Qué conviene rescatar";

export interface TituloDeInforme {
  /** El título que escribió el integrador, ya limpio; `null` si no escribió ninguno (rondas viejas). */
  titulo: string | null;
  /**
   * El informe SIN la línea del título. El texto crudo completo se sigue
   * guardando en el hecho `InformeIntegrador` — esto es sólo lo que se
   * MUESTRA en "Lectura del integrador".
   */
  cuerpo: string;
}

// Tolerante a propósito: un modelo escribe "TITULO: x", "**TÍTULO:** x" o
// "# TITULO: x" con la misma intención. Lo que NO se tolera es inventar un
// título donde no hay línea de título: sin coincidencia, `titulo` es `null`.
const LINEA_TITULO = /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*t[ií]tulo\s*:\s*(.*?)\s*(?:\*\*|__)?\s*$/i;

/** El encabezado de la quinta sección, con la misma tolerancia de formato. */
const LINEA_RESCATE = /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*5\s*[.)-]?\s*(?:\*\*|__)?\s*qu[eé]\s+conviene\s+rescatar\b/i;

/**
 * Separa la línea "TITULO: …" del resto del informe. Sólo mira la PRIMERA
 * línea no vacía: un "TITULO:" en medio del texto es prosa del integrador,
 * no el título del informe.
 */
export function extraerTituloDelInforme(informeCrudo: string): TituloDeInforme {
  const lineas = informeCrudo.split(/\r?\n/);
  let i = 0;
  while (i < lineas.length && (lineas[i] ?? "").trim().length === 0) i++;
  const primera = lineas[i];
  const m = primera === undefined ? null : LINEA_TITULO.exec(primera);
  if (m === null) return { titulo: null, cuerpo: informeCrudo };
  const titulo = (m[1] ?? "").trim();
  const cuerpo = lineas
    .slice(i + 1)
    .join("\n")
    .replace(/^(?:\s*\r?\n)+/, "");
  // Un "TITULO:" con nada detrás no es un título: se descarta la línea igual
  // (no es parte del informe) pero no se inventa un título vacío.
  return { titulo: titulo.length > 0 ? titulo : null, cuerpo };
}

/** `true` si esta línea es el encabezado de la sección 5 del integrador. */
export function esEncabezadoRescate(linea: string): boolean {
  return LINEA_RESCATE.test(linea);
}

/** `true` si este párrafo es la línea del título (exenta de la regla de referencias). */
export function esParrafoTitulo(parrafo: string): boolean {
  return LINEA_TITULO.test(parrafo.split(/\r?\n/)[0] ?? "");
}

/**
 * El CUERPO de la sección 5 ("QUE CONVIENE RESCATAR"), sin su encabezado —
 * el encabezado lo pone `informe-final.ts`, literal. `null` cuando el informe
 * no tiene esa sección (rondas anteriores a este cambio): en ese caso el
 * encabezado tampoco aparece, nunca vacío.
 *
 * La sección 5 es la última del informe, así que se toma desde su encabezado
 * hasta el final. Esta función no reescribe una palabra de lo que dice.
 */
export function extraerSeccionRescate(informeCrudo: string): string | null {
  const lineas = informeCrudo.split(/\r?\n/);
  const inicio = lineas.findIndex((l) => esEncabezadoRescate(l));
  if (inicio === -1) return null;
  const cuerpo = lineas.slice(inicio + 1).join("\n").trim();
  return cuerpo.length > 0 ? cuerpo : null;
}

const MAX_TITULO = 80;
// Windows: los cinco reservados más los tres de comodín y la barra POSIX.
const PROHIBIDOS_WINDOWS = /[\\/:*?"<>|]/g;

/**
 * Deja un `<titulo>` usable como nombre de archivo en Windows: saca los
 * caracteres prohibidos y los de control, colapsa espacios, corta en 80
 * caracteres y saca puntos y espacios del final (Windows no los conserva).
 * Devuelve `""` si no queda nada — el llamador decide el reemplazo.
 */
export function limpiarTituloParaArchivo(titulo: string): string {
  const limpio = titulo
    .replace(PROHIBIDOS_WINDOWS, " ")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TITULO);
  return limpio.replace(/[ .]+$/, "");
}

/** Las primeras seis palabras de la pregunta — el título de reserva cuando el integrador no escribió ninguno. */
export function tituloDesdePregunta(pregunta: string): string {
  return pregunta.trim().split(/\s+/).filter((p) => p.length > 0).slice(0, 6).join(" ");
}

function dosDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/** "AAAA-MM-DD HHMM" con la fecha y hora LOCALES de la máquina — nunca UTC: el nombre lo lee Juan, no un servidor. */
export function sellofechaLocal(ahora: Date): string {
  return (
    `${ahora.getFullYear()}-${dosDigitos(ahora.getMonth() + 1)}-${dosDigitos(ahora.getDate())}` +
    ` ${dosDigitos(ahora.getHours())}${dosDigitos(ahora.getMinutes())}`
  );
}

/** Último recurso: un informe sin título y sin pregunta legible sigue teniendo nombre. */
const TITULO_DE_RESERVA = "Informe de ronda";

/**
 * `AAAA-MM-DD HHMM — <titulo>`, SIN extensión: el `.md` y el `.pdf` comparten
 * este nombre. `titulo` es el del integrador; si es `null` o queda vacío al
 * limpiarlo, se usan las primeras seis palabras de la pregunta.
 */
export function nombreBaseDeInforme(params: { titulo: string | null; pregunta: string; ahora: Date }): string {
  const delIntegrador = params.titulo === null ? "" : limpiarTituloParaArchivo(params.titulo);
  const dePregunta = delIntegrador.length > 0 ? "" : limpiarTituloParaArchivo(tituloDesdePregunta(params.pregunta));
  const titulo = delIntegrador || dePregunta || TITULO_DE_RESERVA;
  return `${sellofechaLocal(params.ahora)} — ${titulo}`;
}

/** Tope del contador de desambiguación: si hay 999 informes con el mismo nombre, el problema no es el nombre. */
const MAX_INTENTOS = 999;

/**
 * El primer nombre libre: `base`, y si ya existe `base (2)`, `base (3)`, …
 * NUNCA devuelve un nombre que `existe` haya dado por ocupado — sobrescribir
 * un informe es perder un dato de investigación. `existe` tiene que mirar
 * TODAS las extensiones que se van a escribir (`.md` y `.pdf`).
 */
export function nombreLibreDeInforme(base: string, existe: (nombre: string) => boolean): string {
  if (!existe(base)) return base;
  for (let n = 2; n <= MAX_INTENTOS; n++) {
    const candidato = `${base} (${n})`;
    if (!existe(candidato)) return candidato;
  }
  throw new Error(`no hay nombre libre para el informe "${base}" despues de ${MAX_INTENTOS} intentos`);
}
