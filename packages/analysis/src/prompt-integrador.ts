/**
 * prompt-integrador.ts — T7, Fase 3: el prompt del INTEGRADOR (deepseek).
 * ------------------------------------------------------------------------
 * MÓDULO SELLADO, mismo motivo que `build-analyst-prompt.ts` y
 * `prompt-operacion.ts`: cero imports. El texto de abajo es LITERAL —
 * decidido con Juan, no redactado ni corregido por esta pieza — sustituye
 * únicamente `{{PREGUNTA}}` y `{{HALLAZGOS}}` en el punto exacto donde
 * aparecen.
 *
 * Se usa `split(marcador).join(valor)` en vez de `String.replace`, mismo
 * motivo que en `prompt-operacion.ts`: `replace` con un string de
 * reemplazo interpreta secuencias como `$&`/`$\`` si aparecieran en la
 * pregunta o en una descripción de hallazgo, y esos son texto de
 * usuario/modelo, no un patrón.
 */

export interface HallazgoParaIntegrador {
  /** "H12" — id del hallazgo. */
  id: string;
  categoria: string;
  /** null en las líneas LIMITACION — mismo campo que en T6. */
  eje: string | null;
  etiquetas: readonly string[];
  descripcion: string;
  /** "O4" — operador (anonimizado) que registró este hallazgo. */
  operador: string;
}

const PLANTILLA = `Vas a leer una tabla de hallazgos y escribir un informe.

Ocho sistemas leyeron un mismo conjunto de respuestas y registraron lo que observaron. La tabla de abajo reune todos esos registros. Tu tarea es leer esa tabla y escribir un informe de lo que muestra.

LA PREGUNTA QUE ORIGINO TODO ESTO FUE:

{{PREGUNTA}}

LA TABLA DE HALLAZGOS:

{{HALLAZGOS}}

Cada linea tiene seis campos: el identificador del hallazgo, su categoria, su eje, las respuestas que lo sostienen, su descripcion, y el operador que lo registro.

QUE TIENES QUE HACER

Escribe un informe con cuatro secciones, en este orden:

1. TIPOS DE DIVERGENCIA
Para cada divergencia registrada en la tabla, di de que tipo es:
- factica: discrepan sobre un dato concreto
- conceptual: usan definiciones distintas del mismo termino
- de alcance: responden a cosas distintas
- de enfasis: dicen lo mismo con peso distinto
Solo la primera se puede resolver con evidencia. Las otras tres necesitan una decision de quien lee el informe.

2. CALIDAD DE LAS CONVERGENCIAS
Para cada convergencia registrada, di si las respuestas que coinciden citan las mismas fuentes o fuentes distintas. Coincidir citando la misma fuente unica no es lo mismo que coincidir por caminos independientes.
Si la tabla no trae informacion de fuentes para una convergencia, dilo.

3. LO QUE NADIE DIJO
Reune las ausencias registradas y di que partes de la pregunta original quedaron sin responder por ninguna de las respuestas.

4. QUE HARIA FALTA
Para cada divergencia, di que dato, que fuente o que decision permitiria resolverla. Si una divergencia no se puede resolver con mas informacion, dilo tambien.

COMO SE ESCRIBE

Escribe en parrafos, en prosa normal. No uses tablas ni listas con vinetas.

REGLA OBLIGATORIA: cada parrafo que escribas tiene que contener al menos una referencia a un hallazgo de la tabla, con su identificador entre corchetes. Por ejemplo: [H12]. Si un parrafo se apoya en varios hallazgos, ponlos todos: [H12] [H31].

No puedes afirmar nada que no este en la tabla. Si la tabla no alcanza para responder algo de las cuatro secciones, escribelo en un parrafo que empiece con LA TABLA NO ALCANZA y explica que falta. Ese parrafo es el unico que puede ir sin referencias.

TRES COSAS QUE NO TIENES QUE HACER

No busques informacion. No uses lo que sabes del tema por fuera de la tabla. Trabaja solo con lo que la tabla dice.

No decidas quien tiene razon. Tu informe describe como se relacionan los registros, no cual es correcto.

No trates de averiguar que sistema produjo cada respuesta. Los identificadores P1 a P8 y O1 a O8 son arbitrarios y cambian en cada ronda.`;

function filaDe(h: HallazgoParaIntegrador): string {
  const etiquetas = h.etiquetas.length === 0 ? "—" : h.etiquetas.join(",");
  return [h.id, h.categoria, h.eje ?? "", etiquetas, h.descripcion, h.operador].join("|");
}

function tablaDe(hallazgos: readonly HallazgoParaIntegrador[]): string {
  return hallazgos.map(filaDe).join("\n");
}

/**
 * Arma el prompt del integrador sustituyendo `{{PREGUNTA}}` y
 * `{{HALLAZGOS}}` en la plantilla literal de arriba. `pregunta` y
 * `hallazgos` son datos, nunca se interpretan como patrón de reemplazo
 * (ver cabecera del archivo).
 */
export function armarPromptIntegrador(pregunta: string, hallazgos: readonly HallazgoParaIntegrador[]): string {
  return PLANTILLA.split("{{PREGUNTA}}")
    .join(pregunta)
    .split("{{HALLAZGOS}}")
    .join(tablaDe(hallazgos));
}
