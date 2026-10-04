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

const PLANTILLA = `Un grupo de sistemas comparó varias respuestas a una pregunta y otro sistema escribió un análisis. Tu tarea es tres cosas, en tres secciones separadas. Tienes búsqueda web: úsala.

LA PREGUNTA ORIGINAL FUE:

{{PREGUNTA}}

EL ANÁLISIS A REVISAR:

{{RESCATE}}

LOS HALLAZGOS QUE EL ANÁLISIS CITA:

{{HALLAZGOS}}

SECCIÓN 1 — VERIFICACIÓN
Para cada contradicción o afirmación de datos que el análisis señala como importante, busca la fuente primaria y decide una de tres:
VERIFICADO: una fuente primaria confirma la afirmación. Fuente primaria es el texto de la norma o del organismo que la dicta (por ejemplo bcn.cl, el Diario Oficial, fonasa.gob.cl, minsal.cl). Un blog, un estudio jurídico o un sitio comercial no es fuente primaria: si es lo único que encontraste, es NO_VERIFICADO y lo dices en el motivo. La cita va textual y entre comillas; si no puedes citar textual, no está verificado.
CONTRADICHO: la fuente dice algo distinto, o confirma solo una parte. Pon la URL, la cita textual entre comillas y, después de la cita, qué dice en realidad o qué parte no se confirma.
NO_VERIFICADO: no encontraste fuente primaria. Dilo, no inventes una.
No traigas fuentes sobre temas nuevos en esta sección: aquí solo verificas lo que el análisis ya marcó. Máximo diez.
Una línea por ítem, con este formato:
VERIFICADO|H12|https://...|"cita textual del artículo"
CONTRADICHO|H24|https://...|"lo que dice la fuente"
NO_VERIFICADO|H58|no encontré fuente primaria

SECCIÓN 2 — PUNTOS CIEGOS
Aquí sí puedes traer fuentes nuevas. ¿Qué quedó sin cubrir que, para responder bien la pregunta original, hacía falta? Para cada punto ciego, si tienes una fuente que lo cubre, ponla con URL. Máximo cinco.
Una línea por punto:
PUNTO_CIEGO|descripción|https://... (o "sin fuente" si no tienes una)

SECCIÓN 3 — PREGUNTAS DERIVADAS
¿Qué preguntas nuevas abre este análisis, que convendría investigar en otra ronda? Máximo cinco.
Una línea por pregunta:
PREGUNTA|el texto de la pregunta

TRES REGLAS
No decidas quién tiene razón sobre las cosas que el análisis NO marcó: para eso está la sección 2, como aporte tuyo, no como veredicto.
No uses el GDPR ni normas de otros países como si fueran la norma que se pregunta. Si las mencionas, aclara que son de otro país.
Las URLs tienen que ser páginas reales que abriste. Una URL que no lleva a la fuente es peor que un NO_VERIFICADO.

FORMATO DE SALIDA — OBLIGATORIO
Tu respuesta la procesa un programa. Solo se leen las líneas que empiezan con VERIFICADO|, CONTRADICHO|, NO_VERIFICADO|, PUNTO_CIEGO| o PREGUNTA|; todo lo demás se pierde.
- Cada ítem en su propia línea, empezando por la palabra clave en mayúsculas: sin viñetas, números, negritas ni texto delante.
- Una sola URL por línea, en su campo. No agregues otras fuentes después de la cita.
- Si una misma fuente cubre varios hallazgos, júntalos con /: VERIFICADO|H13/H118|https://...|"cita".
- Nada de introducciones, resúmenes ni conclusiones fuera de esas líneas.`;

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
