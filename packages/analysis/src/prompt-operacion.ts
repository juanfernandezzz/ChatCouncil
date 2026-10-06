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

const PLANTILLA = `Vas a leer seis respuestas que distintos sistemas dieron a una misma pregunta. Tu tarea es leerlas todas y registrar lo que encuentres al compararlas entre si.

LA PREGUNTA ORIGINAL FUE:

{{PREGUNTA}}

LAS SEIS RESPUESTAS:

{{CUERPO}}

QUE TIENES QUE HACER

Lee las seis respuestas completas. Trabajalas como prefieras: puedes escribir el razonamiento que quieras antes de tu registro final. Al terminar, escribe tus hallazgos siguiendo el formato de abajo.

Un hallazgo es algo que observaste al comparar las respuestas entre si. Cada hallazgo se escribe en una linea propia.

LAS CINCO CATEGORIAS DE HALLAZGO

CONVERGENCIA: varias respuestas afirman lo mismo.
DIVERGENCIA: varias respuestas afirman cosas incompatibles entre si.
TENSION: varias respuestas coinciden en el dato o el hecho, pero apuntan a conclusiones, recomendaciones o cursos de accion opuestos. No es divergencia, porque los hechos no se contradicen; es que a partir del mismo hecho llegan a decisiones distintas.
SINGULARIDAD: algo que aparece en una sola respuesta y en ninguna otra.
AUSENCIA: algo que la pregunta pedia y que ninguna de las seis respuestas trae.

LOS TRES EJES

Cada hallazgo se etiqueta con el eje al que pertenece.

HECHOS: lo que la respuesta afirma que ocurrio, con fecha, actor o cifra.
FUENTES: de donde dice la respuesta haber sacado lo que afirma.
CONCLUSIONES: lo que la respuesta interpreta, proyecta o concluye.

EL FORMATO

Cada hallazgo es una linea con cuatro campos separados por el simbolo |

CATEGORIA|EJE|ETIQUETAS|DESCRIPCION

Las etiquetas son los identificadores de las respuestas que sostienen ese hallazgo, separados por comas y sin espacios.

Ejemplos:

CONVERGENCIA|HECHOS|P1,P3,P6|las tres dan la misma fecha para el anuncio
DIVERGENCIA|FUENTES|P2,P5|citan medios distintos para el mismo dato
TENSION|CONCLUSIONES|P1,P4|coinciden en la misma cifra pero P1 recomienda ampliar y P4 recomienda reducir
SINGULARIDAD|CONCLUSIONES|P4|solo P4 proyecta un cambio a futuro
AUSENCIA|HECHOS|—|ninguna respuesta entrega cifras de adopcion

En los hallazgos de tipo AUSENCIA el campo de etiquetas lleva el simbolo — porque no hay respuestas que lo sostengan.

CUANDO NO PUEDAS REGISTRAR UN HALLAZGO

Si hay algo que no puedes determinar, escribelo. No inventes una categoria para salir del paso. Usa una de estas cuatro lineas, que llevan tres campos en vez de cuatro y no llevan eje:

LIMITACION:CORPUS|P2,P5|no pude leer parte del material
LIMITACION:AMBIGUEDAD|P2,P5|no puedo determinar si dicen lo mismo
LIMITACION:TAREA|—|no entiendo que se me pide
LIMITACION:OTRA|P3|explica aqui cual es la limitacion

Registrar una limitacion es tan valido como registrar un hallazgo.

DOS COSAS MAS

El texto de las respuestas incluye marcas del tipo [[CC-xxxxx]] intercaladas. Son marcas de control de integridad del sistema, no forman parte del contenido. Ignoralas por completo y no las menciones en tus hallazgos.

No sabes que sistema produjo cada respuesta, y no necesitas saberlo. Los identificadores P1 a P7 son arbitrarios y cambian en cada ronda.`;

function cuerpoDe(respuestas: readonly RespuestaEtiquetada[]): string {
  return respuestas.map((r) => `=== ${r.etiqueta} ===\n${r.texto}`).join("\n\n");
}

/**
 * Vía de archivo (2026-10-01): el cuerpo de ~180.000 caracteres no entra en el
 * compositor de ChatGPT, así que el prompt se pega SIN el cuerpo y las
 * respuestas bajan como .txt para adjuntar a mano. Texto LITERAL, como el de
 * arriba. La primera línea que pide (las dos marcas) es el control de que el
 * proveedor leyó el archivo entero y no un resumen.
 */
const PLANTILLA_CON_ARCHIVO = `Vas a leer seis respuestas que distintos sistemas dieron a una misma pregunta. Las seis respuestas están en el archivo de texto que viene adjunto a este mensaje. Tu tarea es leer el archivo completo y registrar lo que encuentres al comparar las respuestas entre si.

LA PREGUNTA ORIGINAL FUE:

{{PREGUNTA}}

ANTES DE EMPEZAR, CONFIRMA QUE LEISTE EL ARCHIVO ENTERO

El archivo contiene marcas del tipo [[CC-xxxxx]] intercaladas. Son marcas de control de integridad, no forman parte del contenido. En la primera linea de tu respuesta, escribe exactamente:

ARCHIVO: primera marca = <la primera marca [[CC-...]] que aparece en el archivo>, ultima marca = <la ultima marca [[CC-...]] que aparece en el archivo>

Si no puedes leer el archivo, o no encuentras marcas, escribe en su lugar:

ARCHIVO: no pude leer el archivo adjunto

No sigas sin esa primera linea. Despues de ella, ignora las marcas por completo y no las menciones de nuevo.

QUE TIENES QUE HACER

Lee las seis respuestas completas del archivo. Trabajalas como prefieras: puedes escribir el razonamiento que quieras antes de tu registro final. Al terminar, escribe tus hallazgos siguiendo el formato de abajo.

Un hallazgo es algo que observaste al comparar las respuestas entre si. Cada hallazgo se escribe en una linea propia.

LAS CINCO CATEGORIAS DE HALLAZGO

CONVERGENCIA: varias respuestas afirman lo mismo.
DIVERGENCIA: varias respuestas afirman cosas incompatibles entre si.
TENSION: varias respuestas coinciden en el dato o el hecho, pero apuntan a conclusiones, recomendaciones o cursos de accion opuestos. No es divergencia, porque los hechos no se contradicen; es que a partir del mismo hecho llegan a decisiones distintas.
SINGULARIDAD: algo que aparece en una sola respuesta y en ninguna otra.
AUSENCIA: algo que la pregunta pedia y que ninguna de las seis respuestas trae.

LOS TRES EJES

Cada hallazgo se etiqueta con el eje al que pertenece.

HECHOS: lo que la respuesta afirma que ocurrio, con fecha, actor o cifra.
FUENTES: de donde dice la respuesta haber sacado lo que afirma.
CONCLUSIONES: lo que la respuesta interpreta, proyecta o concluye.

EL FORMATO

Cada hallazgo es una linea con cuatro campos separados por el simbolo |

CATEGORIA|EJE|ETIQUETAS|DESCRIPCION

Las etiquetas son los identificadores de las respuestas que sostienen ese hallazgo, separados por comas y sin espacios.

Ejemplos:

CONVERGENCIA|HECHOS|P1,P3,P6|las tres dan la misma fecha para el anuncio
DIVERGENCIA|FUENTES|P2,P5|citan medios distintos para el mismo dato
TENSION|CONCLUSIONES|P1,P4|coinciden en la misma cifra pero P1 recomienda ampliar y P4 recomienda reducir
SINGULARIDAD|CONCLUSIONES|P4|solo P4 proyecta un cambio a futuro
AUSENCIA|HECHOS|—|ninguna respuesta entrega cifras de adopcion

En los hallazgos de tipo AUSENCIA el campo de etiquetas lleva el simbolo — porque no hay respuestas que lo sostengan.

CUANDO NO PUEDAS REGISTRAR UN HALLAZGO

Si hay algo que no puedes determinar, escribelo. No inventes una categoria para salir del paso. Usa una de estas cuatro lineas, que llevan tres campos en vez de cuatro y no llevan eje:

LIMITACION:CORPUS|P2,P5|no pude leer parte del material
LIMITACION:AMBIGUEDAD|P2,P5|no puedo determinar si dicen lo mismo
LIMITACION:TAREA|—|no entiendo que se me pide
LIMITACION:OTRA|P3|explica aqui cual es la limitacion

Registrar una limitacion es tan valido como registrar un hallazgo.

UNA COSA MAS

No sabes que sistema produjo cada respuesta, y no necesitas saberlo. Los identificadores P1 a P7 son arbitrarios y cambian en cada ronda.`;

/**
 * Las dos piezas de la vía de archivo: `prompt` (se pega) y `cuerpoArchivo`
 * (las respuestas con sus separadores `=== P# ===`, lo mismo que
 * `armarPromptOperacion` embebe en `{{CUERPO}}`). Las marcas de integridad las
 * intercala quien llama sobre `cuerpoArchivo`, igual que hoy las intercala
 * sobre el prompt completo: este módulo no tiene imports.
 */
export function armarPromptOperacionConArchivo(
  pregunta: string,
  respuestas: readonly RespuestaEtiquetada[],
): { prompt: string; cuerpoArchivo: string } {
  return {
    prompt: PLANTILLA_CON_ARCHIVO.split("{{PREGUNTA}}").join(pregunta),
    cuerpoArchivo: cuerpoDe(respuestas),
  };
}

/**
 * Arma el prompt de operación sustituyendo `{{PREGUNTA}}` y `{{CUERPO}}` en
 * la plantilla literal de arriba. `pregunta` y `respuestas` son datos, nunca
 * se interpretan como patrón de reemplazo (ver cabecera del archivo).
 */
export function armarPromptOperacion(pregunta: string, respuestas: readonly RespuestaEtiquetada[]): string {
  // UNA SOLA pasada (2026-10-06, la lección del `{{CONTENIDO}}` del PDF): con
  // dos split/join en cadena, una pregunta que trajera "{{CUERPO}}" recibía el
  // cuerpo entero adentro. Lo insertado nunca se vuelve a recorrer.
  const cuerpo = cuerpoDe(respuestas);
  return PLANTILLA.split("{{PREGUNTA}}")
    .map((parte) => parte.split("{{CUERPO}}").join(cuerpo))
    .join(pregunta);
}
