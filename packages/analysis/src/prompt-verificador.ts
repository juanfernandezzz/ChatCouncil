/**
 * prompt-verificador.ts — 7-1-1 (2026-09-29): el prompt del VERIFICADOR de
 * fuentes.
 * ------------------------------------------------------------------------
 * MÓDULO SELLADO, mismo motivo que `prompt-operacion.ts` y
 * `prompt-integrador.ts`: cero imports. El texto de abajo es LITERAL —
 * decidido con Juan, no redactado ni corregido por esta pieza — sustituye
 * únicamente `{{PREGUNTA}}`, `{{RESCATE}}` y `{{HALLAZGOS}}`.
 *
 * `split(marcador).join(valor)` en vez de `String.replace`, mismo motivo que
 * en los otros dos: los valores son texto de usuario/modelo, nunca patrón.
 */

export interface HallazgoParaVerificador {
  /** "H12" — el mismo código que vio el integrador. */
  id: string;
  categoria: string;
  /** null en las líneas LIMITACION. */
  eje: string | null;
  descripcion: string;
}

const PLANTILLA = `Un grupo de sistemas comparó varias respuestas a una pregunta y otro sistema escribió un análisis. Tu tarea es tres cosas, en tres secciones separadas. Tenés búsqueda web: usala.

LA PREGUNTA ORIGINAL FUE:

{{PREGUNTA}}

EL ANÁLISIS A REVISAR:

{{RESCATE}}

LOS HALLAZGOS QUE EL ANÁLISIS CITA:

{{HALLAZGOS}}

SECCIÓN 1 — CORRESPONDENCIA CON LA FUENTE
Para cada contradicción o afirmación de datos que el análisis señala como importante, buscá una fuente y registrá dos cosas separadas: si la fuente sostiene la afirmación, y qué tipo de fuente es.

Lo primero, la correspondencia, es una de tres:
CONFIRMA: la fuente dice lo que se afirma. Poné la URL y la cita textual entre comillas.
CONTRADICE: la fuente dice algo distinto. Poné la URL, la cita textual, y qué dice en realidad.
NO_ENCONTRADA: no encontraste una fuente que trate el punto. Decilo, no inventes una.

Lo segundo, el tipo de fuente, es una de cuatro. Clasificá la fuente que encontraste, no la que te gustaría:
OFICIAL: emitida por la autoridad competente en la materia (un organismo del Estado, el ente regulador, el emisor de la norma o el estándar).
PRIMARIA: la fuente original del dato, no alguien contándolo. El texto mismo de una ley, de un estudio que reporta su propio resultado, de un documento de quien hizo la cosa.
ACADEMICA: un artículo de investigación, un journal revisado por pares, una publicación científica.
SECUNDARIA: alguien que cuenta, resume o comenta lo que dijo otra fuente. Un blog, una nota de prensa, un sitio comercial, una guía de un tercero.
Una misma fuente puede ser oficial y primaria a la vez; si es así, poné las dos. No decidas si el tipo es suficiente: eso lo decide quien lee. Tu trabajo es describir qué encontraste.

Máximo diez.
Una línea por ítem, con este formato:
CONFIRMA|OFICIAL,PRIMARIA|H12|https://...|"cita textual de la fuente"
CONTRADICE|SECUNDARIA|H24|https://...|"lo que dice la fuente"
NO_ENCONTRADA|—|H58|no encontré una fuente que trate este punto

SECCIÓN 2 — PUNTOS CIEGOS
Acá podés traer fuentes nuevas. ¿Qué quedó sin cubrir que, para responder bien la pregunta original, hacía falta? Para cada punto ciego, si tenés una fuente que lo cubre, ponela con su URL y su tipo. Máximo cinco.
Una línea por punto:
PUNTO_CIEGO|descripción|https://... (o "sin fuente")|tipo de fuente (o —)

SECCIÓN 3 — PREGUNTAS DERIVADAS
¿Qué preguntas nuevas abre este análisis, que convendría investigar en otra ronda? Máximo cinco.
Una línea por pregunta:
PREGUNTA|el texto de la pregunta

TRES REGLAS
No decidas quién tiene razón sobre las cosas que el análisis NO marcó: para eso está la sección 2, como aporte tuyo.
No uses normas o fuentes de otro país como si fueran del país o el ámbito que la pregunta trata. Si las mencionás, aclará de dónde son.
Las URLs tienen que ser páginas reales que abriste. Una URL que no lleva a la fuente es peor que una NO_ENCONTRADA.

FORMATO DE SALIDA — OBLIGATORIO
Cada registro va en UNA sola línea, con los campos separados por el signo |, sin texto antes de la primera palabra clave de la línea. No agrupes varios hallazgos en una línea: una línea por hallazgo. No uses comillas tipográficas ni entidades HTML; usá comillas rectas. Podés escribir el razonamiento que quieras antes del bloque de líneas, pero las líneas de registro tienen que ir limpias, cada una empezando por CONFIRMA, CONTRADICE, NO_ENCONTRADA, PUNTO_CIEGO o PREGUNTA.`;

/** Una línea por hallazgo: `H12|CONVERGENCIA|HECHOS|texto`. */
function lineasDe(hallazgos: readonly HallazgoParaVerificador[]): string {
  return hallazgos.map((h) => [h.id, h.categoria, h.eje ?? "", h.descripcion].join("|")).join("\n");
}

/**
 * Arma el prompt del verificador. `rescate` es la sección "QUE CONVIENE
 * RESCATAR" del integrador, tal cual; `hallazgos`, sólo los que esa sección
 * referencia, en el orden en que aparecen.
 */
export function armarPromptVerificador(
  pregunta: string,
  rescate: string,
  hallazgos: readonly HallazgoParaVerificador[],
): string {
  return PLANTILLA.split("{{PREGUNTA}}")
    .join(pregunta)
    .split("{{RESCATE}}")
    .join(rescate)
    .split("{{HALLAZGOS}}")
    .join(lineasDe(hallazgos));
}
