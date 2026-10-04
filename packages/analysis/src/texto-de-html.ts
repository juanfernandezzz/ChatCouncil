/**
 * texto-de-html.ts — re-deriva texto CON BLOQUES desde el html crudo guardado.
 * ------------------------------------------------------------------------
 * Medido en la ronda real de Juan (2026-10-01, ronda c3801f42): el texto que
 * captura el preload sale de `textContent`, que no conserva cortes de párrafo
 * ni el número de una lista ordenada. deepseek escribe cada sección como
 * `<ol start="5"><li><p>QUE CONVIENE RESCATAR</p></li></ol>`, así que su
 * informe quedó en UNA línea, sin "5.", y el parseo por líneas no encontraba
 * ni el título ni la sección 5. El html es el dato canónico: de ahí se
 * re-deriva, sin reescribir el registro.
 *
 * Sin DOM ni dependencias: un recorrido de etiquetas sobre la cadena.
 */

const BLOQUES = /^(p|div|li|ol|ul|h[1-6]|pre|blockquote|tr|table|section|article|hr)$/;

function decodificar(texto: string): string {
  return texto
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

/** Texto del html con un salto por bloque y el número de cada ítem de `<ol>` (respetando `start`). */
export function textoDeHtmlEnBloques(html: string): string {
  const limpio = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, "");
  const listas: { ordenada: boolean; n: number }[] = [];
  let salida = "";
  // Justo después de "5. " (o "- ") el `<p>` del ítem no corta la línea.
  let trasPrefijo = false;
  for (const m of limpio.matchAll(/<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi)) {
    if (m[4] !== undefined) {
      salida += decodificar(m[4]);
      trasPrefijo = false;
      continue;
    }
    const cierre = m[1] === "/";
    const tag = m[2]!.toLowerCase();
    if (tag === "br") {
      salida += "\n";
      continue;
    }
    if (cierre && (tag === "td" || tag === "th")) {
      salida += " | ";
      continue;
    }
    if (!BLOQUES.test(tag)) continue;
    if (trasPrefijo && !cierre) continue;
    if (!salida.endsWith("\n") && salida.length > 0) salida += "\n";
    if (cierre) {
      if (tag === "ol" || tag === "ul") listas.pop();
      continue;
    }
    if (tag === "ol" || tag === "ul") {
      const start = /\bstart\s*=\s*"?(\d+)/i.exec(m[3] ?? "");
      listas.push({ ordenada: tag === "ol", n: start ? Number(start[1]) : 1 });
    } else if (tag === "li") {
      const lista = listas.at(-1);
      if (lista?.ordenada) salida += `${lista.n++}. `;
      else if (lista) salida += "- ";
      trasPrefijo = lista !== undefined;
    }
  }
  return salida
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * El texto del informe del integrador sobre el que se parsea (título, sección
 * 5, referencias): el re-derivado del html cuando hay html, y si no, el
 * `informeCrudo` tal cual (capturas anteriores a guardar el html).
 */
export function textoDelInformeIntegrador(informe: { informeCrudo: string; html?: string | null }): string {
  return informe.html ? textoDeHtmlEnBloques(informe.html) : informe.informeCrudo;
}

/** Igual para la salida del verificador: GLM (svelte) deja cada párrafo en un `<p>` y el textContent los pega. */
export function textoDeLaSalidaVerificador(salida: { salidaCruda: string; html?: string | null }): string {
  return salida.html ? textoDeHtmlEnBloques(salida.html) : salida.salidaCruda;
}
