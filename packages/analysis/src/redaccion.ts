/**
 * redaccion.ts — los controles MECÁNICOS sobre la respuesta del redactor
 * (2026-10-02). Ninguno juzga el contenido: dicen si leyó el archivo entero,
 * si salió a la red y si cita hallazgos que no existen.
 */
import { textoDeHtmlEnBloques } from "./texto-de-html";

export type LecturaArchivo = "entero" | "no-pudo-leer" | "marcas-distintas" | "sin-linea" | "sin-marcas-registradas";

export interface ControlesRedaccion {
  lecturaArchivo: LecturaArchivo;
  /** Enlaces a sitios externos en el html capturado; `null` = no hay html. */
  enlacesExternos: number | null;
  /** H## citados que no están en la tabla, sin repetir, en orden de aparición. */
  hallazgosInexistentes: string[];
  /** El texto a mostrar: re-derivado del html si lo hay, sin la línea "ARCHIVO:". */
  cuerpo: string;
}

export function controlesRedaccion(
  r: { textoCrudo: string; html: string | null; marcaPrimera: string | null; marcaUltima: string | null },
  idsValidos: readonly string[],
): ControlesRedaccion {
  const texto = r.html ? textoDeHtmlEnBloques(r.html) : r.textoCrudo;
  const lineas = texto.split("\n");
  const i = lineas.findIndex((l) => l.trim().length > 0);
  const primera = i < 0 ? "" : lineas[i]!.trim();

  let lecturaArchivo: LecturaArchivo;
  if (!/^\**ARCHIVO:/i.test(primera)) lecturaArchivo = "sin-linea";
  else if (/no pude leer/i.test(primera)) lecturaArchivo = "no-pudo-leer";
  else if (r.marcaPrimera === null || r.marcaUltima === null) lecturaArchivo = "sin-marcas-registradas";
  else {
    const marcas = primera.match(/\[\[CC-[^\]]+\]\]/g) ?? [];
    lecturaArchivo = marcas[0] === r.marcaPrimera && marcas.at(-1) === r.marcaUltima ? "entero" : "marcas-distintas";
  }

  const enlacesExternos = r.html ? (r.html.match(/<a\b[^>]*href\s*=\s*"https?:/gi) ?? []).length : null;

  const validos = new Set(idsValidos);
  const citados = [...texto.matchAll(/\[[^\]\n]*\]/g)].flatMap((m) => m[0].match(/\bH\d+\b/g) ?? []);
  const hallazgosInexistentes = [...new Set(citados.filter((id) => !validos.has(id)))];

  const cuerpo = lecturaArchivo === "sin-linea" ? texto : lineas.slice(i + 1).join("\n").trim();
  return { lecturaArchivo, enlacesExternos, hallazgosInexistentes, cuerpo };
}

const TEXTO_LECTURA: Record<LecturaArchivo, string> = {
  entero: "Leyó el archivo entero: la primera línea trae la primera y la última marca correctas.",
  "no-pudo-leer": 'No pudo leer el archivo: respondió "no pude leer el archivo adjunto".',
  "marcas-distintas": "Las marcas de la primera línea no son las del archivo: leyó parcial o resumió.",
  "sin-linea": "Se saltó la primera línea ARCHIVO: no se puede saber si leyó el archivo entero.",
  "sin-marcas-registradas": "No se puede comprobar la lectura: la app se reinició entre pegar y capturar.",
};

/** Las líneas de control que van bajo el encabezado de la sección del redactor. */
export function lineasDeControl(c: ControlesRedaccion): string[] {
  return [
    `- ${TEXTO_LECTURA[c.lecturaArchivo]}`,
    c.enlacesExternos === null
      ? "- Sin html capturado: no se puede saber si salió a la red."
      : c.enlacesExternos === 0
        ? "- No salió a la red: 0 enlaces externos en lo capturado."
        : `- Salió a la red: ${c.enlacesExternos} enlaces externos en lo capturado. Lo que cita de ahí no viene del material de la ronda.`,
    c.hallazgosInexistentes.length === 0
      ? "- Todos los hallazgos que cita existen en la tabla."
      : `- Cita hallazgos que no existen en la tabla: ${c.hallazgosInexistentes.join(", ")}.`,
  ];
}
