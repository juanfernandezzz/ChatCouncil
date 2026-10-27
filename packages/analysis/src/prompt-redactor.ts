/**
 * prompt-redactor.ts — el REDACTOR (2026-10-02, decisión de Juan): escribe la
 * respuesta a la pregunta original con el material de la ronda.
 * ------------------------------------------------------------------------
 * MÓDULO SELLADO, mismo motivo que `prompt-operacion.ts`: cero imports. El
 * texto de la plantilla es LITERAL — aprobado por Juan — y sólo se sustituye
 * `{{PREGUNTA}}`, con `split/join` (nunca `replace`: la pregunta es texto de
 * usuario, no un patrón).
 *
 * El material va en un archivo adjunto, no en el prompt: medido en la ronda
 * real de Juan (c3801f42), las siete respuestas suman 206.198 caracteres.
 * `armarArchivoRedactor` arma ese texto en el orden que el prompt describe;
 * las marcas de integridad las intercala quien llama.
 */

const PLANTILLA = `Vas a escribir la respuesta a una pregunta de investigacion. No partes de cero: siete sistemas ya la respondieron, otros sistemas compararon esas respuestas entre si, un sistema escribio un analisis de esa comparacion y dos sistemas, por separado, buscaron fuentes para lo mas importante. Todo ese material esta en el archivo de texto adjunto a este mensaje. Tu tarea es usarlo para entregar exactamente lo que la pregunta pide.

LA PREGUNTA ORIGINAL FUE:

{{PREGUNTA}}

ANTES DE EMPEZAR, CONFIRMA QUE LEISTE EL ARCHIVO ENTERO

El archivo contiene marcas del tipo [[CC-xxxxx]] intercaladas. Son marcas de control de integridad, no forman parte del contenido. En la primera linea de tu respuesta, escribe exactamente:

ARCHIVO: primera marca = <la primera marca [[CC-...]] que aparece en el archivo>, ultima marca = <la ultima marca [[CC-...]] que aparece en el archivo>

Si no puedes leer el archivo, o no encuentras marcas, escribe en su lugar:

ARCHIVO: no pude leer el archivo adjunto

No sigas sin esa primera linea. Despues de ella, ignora las marcas por completo y no las menciones de nuevo.

QUE CONTIENE EL ARCHIVO

Cuatro partes, en este orden:
INFORME: el analisis de la comparacion. Dice en que coinciden las respuestas, en que discrepan, que no trae ninguna, que haria falta para resolver cada discrepancia y que conviene rescatar.
VERIFICACIONES: dos sistemas verificaron, por separado y sin verse entre si, la correspondencia con la fuente de lo mas importante del informe. Vienen como VERIFICACION A y VERIFICACION B. Cada linea CONFIRMA, CONTRADICE o NO_ENCONTRADA se refiere a un hallazgo H## y dice de que tipo es la fuente: OFICIAL, PRIMARIA, ACADEMICA o SECUNDARIA. A y B son arbitrarias, su orden cambia en cada ronda, y no sabes que sistema hizo cada una. Cualquiera de las dos puede venir vacia si ese sistema no busco nada.
HALLAZGOS: la tabla de hallazgos H## que el informe y las verificaciones citan, con las respuestas P# que sostienen cada uno.
RESPUESTAS: las siete respuestas completas, P1 a P7, con sus fuentes.

DE DONDE SALE CADA COSA QUE ESCRIBAS

Solo puedes usar el material del archivo. No busques en internet aunque tengas como hacerlo, y no agregues nada de tu memoria: ningun articulo, plazo, cifra, norma ni fuente que no este en el archivo. Si la pregunta pide algo que el archivo no trae, no lo completes: dejalo como pendiente.

Cuando el material no coincide, decide en este orden:
1. Compara primero las dos verificaciones entre si, hallazgo por hallazgo:
   - Si A y B coinciden (las dos CONFIRMA, o las dos CONTRADICE), esa verificacion es firme. Con CONFIRMA vale lo verificado; con CONTRADICE vale lo que dice la fuente, no lo que decian las respuestas. Di de que tipo es la fuente tal como lo registran; si difieren en el tipo, da los dos.
   - Si A y B difieren (una CONFIRMA y la otra CONTRADICE o NO_ENCONTRADA, o se contradicen entre si), la verificacion quedo EN DISPUTA: no elijas. Marca el hallazgo como verificacion en disputa, di que encontro cada una, y no lo trates como firme.
   - Si solo una se pronuncio y la otra es NO_ENCONTRADA, la verificacion es parcial: usala, pero di que una sola de las dos la sostiene.
2. Lo que el INFORME presenta como firme o como coincidencia entre respuestas es la base.
3. Lo que dice una sola respuesta lo puedes usar, pero dilo: viene de una sola respuesta.
4. Si dos o mas respuestas discrepan y las verificaciones no lo resolvieron, no elijas. Presenta las versiones, di que respuestas sostienen cada una y que haria falta para decidir, como lo dice el INFORME.

Las plantillas, los textos y los documentos concretos que la pregunta pida tomalos de las RESPUESTAS. Si varias traen el mismo documento, arma uno solo que reuna lo que tienen en comun y respete los puntos 1 a 4.

COMO CITAS

Despues de cada afirmacion, entre corchetes, de donde la sacaste: el hallazgo [H12], la respuesta [P3] o la correspondencia con la fuente. Para la verificacion di cual: [A CONFIRMA H12], [B CONTRADICE H12]; si las dos coinciden, [A y B CONFIRMAN H12]; si quedo en disputa, [EN DISPUTA H12]. Puedes poner varias. Una afirmacion sin cita no se puede rastrear: no la escribas.
En las plantillas basta con citar, al principio de cada una, de que respuestas sale.

QUE ENTREGAS

Lo que pide la pregunta, en el orden y con el formato que pide. Si la pregunta pone reglas propias (como marcar las afirmaciones, que distinguir, que no usar), cumplelas tambien.
Al final, una seccion PENDIENTE con lo que la pregunta pedia y este material no alcanza para entregar, con lo que quedo en discrepancia sin resolver, y con los hallazgos cuya verificacion quedo en disputa.

UNA COSA MAS

No sabes que sistema produjo cada respuesta ni cual hizo cada verificacion, y no necesitas saberlo. Los identificadores P1 a P7 y las etiquetas A y B de las verificaciones son arbitrarios y cambian en cada ronda.`;

/** El prompt del redactor: la plantilla literal con la pregunta sustituida. */
export function armarPromptRedactor(pregunta: string): string {
  return PLANTILLA.split("{{PREGUNTA}}").join(pregunta);
}

/** Lo que va en el archivo, ya en texto: cada parte la arma quien llama. */
export interface MaterialRedactor {
  /** El informe del integrador, re-derivado del html. */
  informe: string;
  /** D62: las verificaciones, ya anonimizadas y barajadas (`anonimizarVerificaciones`); vacío = no se capturó ninguna. */
  verificaciones: readonly { etiqueta: string; texto: string }[];
  /** La tabla H## tal como la vio el integrador, una fila por línea. */
  tabla: string;
  /** Las siete respuestas, con la misma etiqueta P# que usa la tabla. */
  respuestas: readonly { etiqueta: string; texto: string }[];
}

/** El texto del archivo, en el orden que describe el prompt (INFORME, VERIFICACION A y B, HALLAZGOS, RESPUESTAS). */
export function armarArchivoRedactor(m: MaterialRedactor): string {
  return [
    "===== INFORME =====",
    m.informe,
    ...(m.verificaciones.length === 0
      ? ["===== VERIFICACION =====", "(sin verificacion capturada en esta ronda)"]
      : m.verificaciones.flatMap((v) => [`===== VERIFICACION ${v.etiqueta} =====`, v.texto])),
    "===== HALLAZGOS =====",
    "H##|CATEGORIA|EJE|RESPUESTAS|DESCRIPCION|OPERADOR",
    m.tabla,
    "===== RESPUESTAS =====",
    m.respuestas.map((r) => `=== ${r.etiqueta} ===\n${r.texto}`).join("\n\n"),
  ].join("\n\n");
}
