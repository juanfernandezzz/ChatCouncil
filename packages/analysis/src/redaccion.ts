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
  /**
   * De esos enlaces, cuántos NO estaban en el material de la ronda. `null`
   * cuando no hay html, o cuando el llamador no pasó el material con qué
   * comparar — en ese caso no se puede decidir nada y se dice así.
   *
   * AGREGADO (2026-10-04) porque el control anterior afirmaba de más: contaba
   * enlaces externos y de ahí concluía "salió a la red: lo que cita de ahí no
   * viene del material de la ronda". El archivo que recibe el redactor LLEVA
   * las URLs de las siete respuestas, así que un redactor que cita una de
   * ellas —y un panel que la convierte en enlace solo— producía exactamente
   * esa señal. Un enlace externo no es una salida a la red; lo que sí es un
   * indicio es un enlace que el material no tenía.
   */
  enlacesFueraDelMaterial: number | null;
  /** H## citados que no están en la tabla, sin repetir, en orden de aparición. */
  hallazgosInexistentes: string[];
  /** El texto a mostrar: re-derivado del html si lo hay, sin la línea "ARCHIVO:". */
  cuerpo: string;
}

/**
 * Origen + ruta, sin query ni fragmento — mismo criterio que `normalizarUrl`
 * (T1, `citas.ts`), pero SOBRE LA CADENA: `packages/analysis` es puro y no
 * tiene la API `URL` (ni `lib: dom` ni `@types/node`), que es justo lo que
 * `guard:dominio` mantiene. Para lo único que se usa esta clave —decidir si
 * un enlace ya estaba en el material— los dos lados pasan por la misma
 * función, así que alcanza con cortar la query y el fragmento y bajar a
 * minúsculas el esquema y el host.
 */
function claveDeUrl(url: string): string {
  const sinColas = url.trim().split("#")[0]!.split("?")[0]!;
  return sinColas.replace(/^([a-zA-Z]+:\/\/[^/]*)/, (m) => m.toLowerCase()).replace(/\/+$/, "");
}

export function controlesRedaccion(
  r: { textoCrudo: string; html: string | null; marcaPrimera: string | null; marcaUltima: string | null },
  idsValidos: readonly string[],
  /** Las URLs que el material de la ronda ya traía (las `Cita` de sus respuestas). */
  urlsDelMaterial: readonly string[] = [],
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

  const hrefs = r.html ? [...r.html.matchAll(/<a\b[^>]*href\s*=\s*"(https?:[^"]*)"/gi)].map((m) => m[1] as string) : null;
  const enlacesExternos = hrefs === null ? null : hrefs.length;
  const delMaterial = new Set(urlsDelMaterial.map(claveDeUrl));
  const enlacesFueraDelMaterial =
    hrefs === null || urlsDelMaterial.length === 0 ? null : hrefs.filter((h) => !delMaterial.has(claveDeUrl(h))).length;

  const validos = new Set(idsValidos);
  const citados = [...texto.matchAll(/\[[^\]\n]*\]/g)].flatMap((m) => m[0].match(/\bH\d+\b/g) ?? []);
  const hallazgosInexistentes = [...new Set(citados.filter((id) => !validos.has(id)))];

  const cuerpo = lecturaArchivo === "sin-linea" ? texto : lineas.slice(i + 1).join("\n").trim();
  return { lecturaArchivo, enlacesExternos, enlacesFueraDelMaterial, hallazgosInexistentes, cuerpo };
}

const TEXTO_LECTURA: Record<LecturaArchivo, string> = {
  entero: "Leyó el archivo entero: la primera línea trae la primera y la última marca correctas.",
  "no-pudo-leer": 'No pudo leer el archivo: respondió "no pude leer el archivo adjunto".',
  "marcas-distintas": "Las marcas de la primera línea no son las del archivo: leyó parcial o resumió.",
  "sin-linea": "Se saltó la primera línea ARCHIVO: no se puede saber si leyó el archivo entero.",
  "sin-marcas-registradas": "No se puede comprobar la lectura: la app se reinició entre pegar y capturar.",
};

/** "1 enlace externo" / "3 enlaces externos": las lee Juan, no un parser. */
function enlaces(n: number): string {
  return n === 1 ? "1 enlace externo" : `${n} enlaces externos`;
}

/** Las líneas de control que van bajo el encabezado de la sección del redactor. */
export function lineasDeControl(c: ControlesRedaccion): string[] {
  return [
    `- ${TEXTO_LECTURA[c.lecturaArchivo]}`,
    // Lo que se mide son ENLACES en el html capturado, no una salida a la red.
    // Sólo un enlace que el material NO traía es indicio de que fue a buscarlo
    // afuera — y ni eso lo prueba: puede haberlo escrito de memoria.
    c.enlacesExternos === null
      ? "- Sin html capturado: no se puede saber si salió a la red."
      : c.enlacesExternos === 0
        ? "- Ningún enlace externo en lo capturado: nada indica que haya salido a la red."
        : c.enlacesFueraDelMaterial === null
          ? `- ${enlaces(c.enlacesExternos)} en lo capturado, sin el material de la ronda con que compararlos: no se puede decir si salió a la red o si cita enlaces del material.`
          : c.enlacesFueraDelMaterial === 0
            ? `- ${enlaces(c.enlacesExternos)} en lo capturado, y ${c.enlacesExternos === 1 ? "estaba" : "todos estaban"} en el material de la ronda: nada indica que haya salido a la red.`
            : `- ${enlaces(c.enlacesExternos)} en lo capturado, y ${
                c.enlacesFueraDelMaterial === 1 ? "1 no estaba" : `${c.enlacesFueraDelMaterial} no estaban`
              } en el material de la ronda: o salió a la red, o ${c.enlacesFueraDelMaterial === 1 ? "lo escribió" : "los escribió"} de memoria. Lo que cite de ${c.enlacesFueraDelMaterial === 1 ? "ese enlace" : `esos ${c.enlacesFueraDelMaterial}`} no sale del material.`,
    c.hallazgosInexistentes.length === 0
      ? "- Todos los hallazgos que cita existen en la tabla."
      : `- Cita hallazgos que no existen en la tabla: ${c.hallazgosInexistentes.join(", ")}.`,
  ];
}
