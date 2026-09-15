/**
 * prompt-operacion.ts — T6, Fase 3: el prompt que arma el OPERADOR.
 * ------------------------------------------------------------------------
 * MÓDULO SELLADO, mismo motivo que `build-analyst-prompt.ts`: cero imports.
 * El texto de abajo es LITERAL — decidido con Juan, no redactado ni
 * corregido por esta pieza — sustituye únicamente `{{PREGUNTA}}` y
 * `{{CUERPO}}` en el punto exacto donde aparecen.
 *
 * Se usa `split(marcador).join(valor)` en vez de `String.replace` para
 * sustituir: `replace` con un string de reemplazo interpreta secuencias
 * como `$&`/`$\`` si aparecieran en `pregunta` o `cuerpo`, y esos son texto
 * de usuario/modelo, no un patrón — no hay forma de que ese caso sea
 * intencional.
 */

export interface RespuestaEtiquetada {
  /** Código estable de esa respuesta en esta ronda de operación (p.ej. "P3"). */
  etiqueta: string;
  texto: string;
}

const PLANTILLA = `Vas a leer siete respuestas que distintos sistemas dieron a una misma
pregunta. Tu tarea es leerlas todas y registrar lo que encuentres al
compararlas entre si.

LA PREGUNTA ORIGINAL FUE:

{{PREGUNTA}}

LAS SIETE RESPUESTAS:

{{CUERPO}}

QUE TIENES QUE HACER

Lee las siete respuestas completas. Trabajalas como prefieras: puedes
escribir el razonamiento que quieras antes de tu registro final. Al
terminar, escribe tus hallazgos siguiendo el formato de abajo.

Un hallazgo es algo que observaste al comparar las respuestas entre si.
Cada hallazgo se escribe en una linea propia.

LAS CUATRO CATEGORIAS DE HALLAZGO

CONVERGENCIA: varias respuestas afirman lo mismo.
DIVERGENCIA: varias respuestas afirman cosas incompatibles entre si.
SINGULARIDAD: algo que aparece en una sola respuesta y en ninguna otra.
AUSENCIA: algo que la pregunta pedia y que ninguna de las siete respuestas
trae.

LOS TRES EJES

Cada hallazgo se etiqueta con el eje al que pertenece.

HECHOS: lo que la respuesta afirma que ocurrio, con fecha, actor o cifra.
FUENTES: de donde dice la respuesta haber sacado lo que afirma.
CONCLUSIONES: lo que la respuesta interpreta, proyecta o concluye.

EL FORMATO

Cada hallazgo es una linea con cuatro campos separados por el simbolo |

CATEGORIA|EJE|ETIQUETAS|DESCRIPCION

Las etiquetas son los identificadores de las respuestas que sostienen ese
hallazgo, separados por comas y sin espacios.

Ejemplos:

CONVERGENCIA|HECHOS|P1,P3,P6|las tres dan la misma fecha para el anuncio
DIVERGENCIA|FUENTES|P2,P5|citan medios distintos para el mismo dato
SINGULARIDAD|CONCLUSIONES|P4|solo P4 proyecta un cambio regulatorio
AUSENCIA|HECHOS|—|ninguna respuesta entrega cifras de adopcion

En los hallazgos de tipo AUSENCIA el campo de etiquetas lleva el simbolo —
porque no hay respuestas que lo sostengan.

CUANDO NO PUEDAS REGISTRAR UN HALLAZGO

Si hay algo que no puedes determinar, escribelo. No inventes una categoria
para salir del paso. Usa una de estas cuatro lineas, que llevan tres campos
en vez de cuatro y no llevan eje:

LIMITACION:CORPUS|P2,P5|no pude leer parte del material
LIMITACION:AMBIGUEDAD|P2,P5|no puedo determinar si dicen lo mismo
LIMITACION:TAREA|—|no entiendo que se me pide
LIMITACION:OTRA|P3|explica aqui cual es la limitacion

Registrar una limitacion es tan valido como registrar un hallazgo.

DOS COSAS MAS

El texto de las respuestas incluye marcas del tipo [[CC-xxxxx]] intercaladas.
Son marcas de control de integridad del sistema, no forman parte del
contenido. Ignoralas por completo y no las menciones en tus hallazgos.

No sabes que sistema produjo cada respuesta, y no necesitas saberlo. Los
identificadores P1 a P8 son arbitrarios y cambian en cada ronda.`;

function cuerpoDe(respuestas: readonly RespuestaEtiquetada[]): string {
  return respuestas.map((r) => `=== ${r.etiqueta} ===\n${r.texto}`).join("\n\n");
}

/**
 * Arma el prompt de operación sustituyendo `{{PREGUNTA}}` y `{{CUERPO}}` en
 * la plantilla literal de arriba. `pregunta` y `respuestas` son datos, nunca
 * se interpretan como patrón de reemplazo (ver cabecera del archivo).
 */
export function armarPromptOperacion(pregunta: string, respuestas: readonly RespuestaEtiquetada[]): string {
  return PLANTILLA.split("{{PREGUNTA}}")
    .join(pregunta)
    .split("{{CUERPO}}")
    .join(cuerpoDe(respuestas));
}
