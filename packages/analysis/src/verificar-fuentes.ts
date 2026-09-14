/**
 * verificar-fuentes.ts — T2, Fase 3: verificación mecánica de la fuente citada.
 * -----------------------------------------------------------------------------
 * FUNCIÓN PURA sobre un PUERTO HTTP INYECTADO (`PuertoHttp`). Este archivo
 * nunca llama a la red por su cuenta: ni `fetch`, ni `node:http`, ni nada que
 * toque un socket. Es la garantía que `guard:dominio` verifica en CI —igual
 * que `packages/domain` no sabe de Electron, `packages/analysis` no sabe de
 * red— y la que permite correr el archivo ENTERO en pruebas contra un puerto
 * falso, sin tocar la red real (BLUEPRINT, decisión de T2).
 *
 * Recibe URLs YA NORMALIZADAS y YA DEDUPLICADAS por fuente (una entrada por
 * `normalizarUrl`, no por `Cita`): ese trabajo usa la API `URL`, que necesita
 * DOM/Node, así que vive en `apps/desktop/src/main/citas.ts` (T1), no acá.
 * Deduplicar de nuevo acá sobre `url` es sólo una red de seguridad — si el
 * llamador ya dedupe, es un no-op.
 *
 * Declaración de salida a la red (BLUEPRINT §1): el PUERTO sólo se llama con
 * URLs que el investigador citó. Este módulo no decide a qué URL llamar más
 * allá de lo que recibe — no busca respaldo que nadie citó.
 */

/**
 * Lo que el PUERTO responde por una URL. Un puerto real (en `apps/desktop`)
 * hace la petición HTTP; acá sólo se define el contrato.
 */
export interface RespuestaPuerto {
  /** Status HTTP, si la petición completó (haya sido 200, 404 o lo que sea). */
  status?: number;
  /** Título de la página de destino, si el puerto pudo extraerlo. */
  tituloDestino?: string | null;
  /**
   * La petición NO completó — timeout, DNS, conexión rechazada. Es
   * TRANSITORIO: se reintenta. Un status HTTP (incluido 404 o 500) NUNCA
   * lleva esto en `true`: es un resultado real, no un error de red.
   */
  errorTransitorio?: boolean;
}

export type PuertoHttp = (url: string) => Promise<RespuestaPuerto>;

/** Tri-estado de existencia — nunca booleano (decisión 12, Fase 3 histórica). */
export type EstadoExistencia = "cumple" | "no-cumple" | "no-se-pudo-comprobar";

/**
 * Tri-estado de TÍTULO, con un cuarto valor que el BLUEPRINT original no
 * tenía y que hizo falta: `"sin-titulo-citado"`. La revisión de T1 midió que
 * varios proveedores citan con un marcador (`"- 30"`) o un nombre de sitio
 * (`"arXiv +1"`), no con un título — comparar esos contra el título del
 * destino inventaría un desacuerdo donde no hay dato para comparar. Colapsar
 * ese caso en `"no-coincide"` sería mentir sobre lo que se comprobó.
 */
export type EstadoTitulo = "coincide" | "no-coincide" | "sin-titulo-citado" | "no-se-pudo-comprobar";

export interface EntradaVerificacion {
  /** Ya normalizada por el llamador (`normalizarUrl`: origen + ruta). */
  url: string;
  /**
   * El texto citado, sólo si YA se decidió (con `pareceTitulo`) que es
   * comparable como título. `null` = ninguna aparición de esta fuente trae
   * algo que valga la pena comparar — no falta el dato, falta el título.
   */
  tituloCitado: string | null;
}

export interface ResultadoVerificacion {
  url: string;
  existencia: EstadoExistencia;
  titulo: EstadoTitulo;
  /** Cuántas veces se llamó al puerto para esta URL (1 = sin reintentos). */
  intentos: number;
}

export interface OpcionesVerificacion {
  /**
   * Cómo esperar entre reintentos. SIN DEFAULT a propósito: un timer
   * (`setTimeout` o el que sea) es una API de plataforma, y este archivo no
   * puede nombrar una sin dejar de ser puro sobre lo que se le inyecta —
   * mismo principio que `puerto`. El caller real (`apps/desktop`) pasa un
   * `setTimeout` de verdad; una prueba pasa una función que resuelve
   * inmediato y cuenta cuántas veces la llamaron, sin esperar de verdad.
   */
  esperar: (ms: number) => Promise<void>;
  /** Reintentos ante error TRANSITORIO, sin contar el primer intento. Default 2. */
  maxReintentos?: number;
  /** Espera antes del primer reintento, en ms. Se duplica en cada uno (backoff). Default 200. */
  esperaBaseMs?: number;
}

const ESTADO_HTTP_CUMPLE_DESDE = 200;
const ESTADO_HTTP_CUMPLE_HASTA = 399;

/**
 * `true` si `texto` tiene forma de TÍTULO real, no de nombre de sitio ni de
 * marcador numérico. Medido sobre la captura real de T1 (ver
 * `docs/BLUEPRINT.md`, "T1, cerrada"): todo título real observado separa
 * "publicador" de "título" con un guión largo, un guión con espacios, o dos
 * puntos seguidos de texto ("OpenAI — Model guidance…", "Wei et al. (2022) -
 * Chain-of-Thought…", "Anthropic: Understanding and Mitigating…"); un nombre
 * de sitio solo ("arXiv +1", "Tetrate") o un marcador ("- 30") nunca lo hace.
 * Es una regla ESTRUCTURAL medida contra datos reales, no una suposición: se
 * revisa si aparece un caso real que la contradiga, no se afina a ciegas.
 */
export function pareceTitulo(texto: string): boolean {
  const t = texto.trim();
  if (t.length < 8) return false;
  return /\s[—–-]\s|:\s+\S/.test(t);
}

function normalizarTexto(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Coincidencia laxa: uno contiene al otro, normalizado. Nunca exacta a rajatabla. */
function tituloCoincide(citado: string, destino: string): boolean {
  const a = normalizarTexto(citado);
  const b = normalizarTexto(destino);
  if (a.length === 0 || b.length === 0) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Llama al puerto para una URL, con reintentos de techo fijo y espera
 * creciente SÓLO ante error transitorio. Un status HTTP (incluido un 404 o
 * un 500) es un RESULTADO y corta el reintento en el primer intento: no es
 * un error a reintentar sin fin (regla dura de esta ronda).
 */
async function llamarConReintentos(
  url: string,
  puerto: PuertoHttp,
  maxReintentos: number,
  esperaBaseMs: number,
  esperar: (ms: number) => Promise<void>,
): Promise<{ respuesta: RespuestaPuerto | null; intentos: number; agotado: boolean }> {
  let intentos = 0;
  let respuesta: RespuestaPuerto | null = null;
  for (;;) {
    intentos++;
    try {
      respuesta = await puerto(url);
    } catch {
      respuesta = { errorTransitorio: true };
    }
    if (!respuesta.errorTransitorio) {
      return { respuesta, intentos, agotado: false };
    }
    if (intentos > maxReintentos) {
      return { respuesta, intentos, agotado: true };
    }
    await esperar(esperaBaseMs * 2 ** (intentos - 1));
  }
}

/**
 * Verifica un lote de citas YA deduplicadas por fuente. Sale a la red (vía
 * `puerto`) UNA vez por `url` distinta — nunca una vez por `Cita` — y nunca a
 * ninguna URL que no venga en `entradas`.
 */
export async function verificarCitas(
  entradas: readonly EntradaVerificacion[],
  puerto: PuertoHttp,
  opciones: OpcionesVerificacion,
): Promise<ResultadoVerificacion[]> {
  const maxReintentos = opciones.maxReintentos ?? 2;
  const esperaBaseMs = opciones.esperaBaseMs ?? 200;
  const esperar = opciones.esperar;

  // Red de seguridad: dedupe otra vez por si el llamador no lo hizo. El
  // primer `tituloCitado` no nulo del grupo es el que se compara.
  const porUrl = new Map<string, string | null>();
  for (const e of entradas) {
    const previo = porUrl.get(e.url);
    if (previo === undefined) porUrl.set(e.url, e.tituloCitado);
    else if (previo === null && e.tituloCitado !== null) porUrl.set(e.url, e.tituloCitado);
  }

  const resultados: ResultadoVerificacion[] = [];
  for (const [url, tituloCitado] of porUrl) {
    const { respuesta, intentos, agotado } = await llamarConReintentos(
      url,
      puerto,
      maxReintentos,
      esperaBaseMs,
      esperar,
    );

    let existencia: EstadoExistencia;
    if (agotado || respuesta === null || typeof respuesta.status !== "number") {
      existencia = "no-se-pudo-comprobar";
    } else {
      existencia =
        respuesta.status >= ESTADO_HTTP_CUMPLE_DESDE && respuesta.status <= ESTADO_HTTP_CUMPLE_HASTA
          ? "cumple"
          : "no-cumple";
    }

    let titulo: EstadoTitulo;
    if (existencia !== "cumple") {
      titulo = "no-se-pudo-comprobar";
    } else if (tituloCitado === null) {
      titulo = "sin-titulo-citado";
    } else if (respuesta?.tituloDestino == null) {
      titulo = "no-se-pudo-comprobar";
    } else {
      titulo = tituloCoincide(tituloCitado, respuesta.tituloDestino) ? "coincide" : "no-coincide";
    }

    resultados.push({ url, existencia, titulo, intentos });
  }

  return resultados;
}
