/**
 * citas.ts — T1, Fase 3: extracción de fuentes desde el HTML crudo.
 * ---------------------------------------------------------------
 * Pura sobre una CADENA de HTML: sin `document`, sin DOM real, sin red. Corre
 * en el proceso principal (Node), no en el preload, porque tiene que poder
 * re-derivarse OFFLINE contra `Respuesta.html` ya guardado en el registro —
 * exactamente el motivo por el que `html` es el dato canónico (BLUEPRINT,
 * decisión de T1). Un parser de DOM real (jsdom o similar) traería una
 * dependencia nativa a recompilar contra Electron; un tokenizador simple de
 * `<a href>` alcanza para lo que este hecho necesita y evita ese riesgo
 * (BLUEPRINT, decisión 1 de la Fase 2, mismo motivo).
 *
 * CRITERIO DE ÉXITO CORREGIDO (no el original del BLUEPRINT): `citas.length`
 * puede ser MENOR que `fuentesHref`, nunca mayor. `fuentesHref` cuenta
 * `a[href^="http"]` subiendo hasta 6 niveles de ancestros — puede aterrizar
 * en un nivel que ya no es `Respuesta.html` (el nodo capturado es el nivel
 * 0). Esta función sólo ve lo que `html` contiene: un panel de fuentes que
 * viva en un ancestro no capturado es indistinguible de "no hay más citas"
 * con el dato de hoy, y eso se declara, no se adivina.
 *
 * GRANULARIDAD DE `Cita`, decisión explícita (T1, revisión 2026-09-13): es
 * POR APARICIÓN, no por fuente. Un investigador que cita la misma URL en el
 * chip inline y de nuevo en la lista final del mensaje produce DOS `Cita`,
 * cada una con su propio `textoVisible` y su propio `dondeVive` — fusionarlas
 * perdería justo el dato que distingue una mención en el cuerpo de una en el
 * panel. Medido sobre la captura real: chatgpt cae de 23 apariciones a 11 URL
 * únicas (sin query ni fragmento), kimi de 17 a 4 — la interfaz repite la
 * misma fuente varias veces con anclas de texto distintas. Por eso
 * `anclasVistas` no basta como reporte: `extraerCitas` también devuelve
 * `urlsUnicas`, la cardinalidad real de fuentes distintas, al lado.
 * CONSECUENCIA PARA T2 (no implementada acá, sólo declarada para que T2 no
 * la relitigue): la verificación mecánica tiene que iterar sobre
 * `normalizarUrl(cita.url)` DEDUPLICADO antes de salir a la red — verificar
 * una vez por `Cita` dispararía una petición por aparición, no por fuente.
 */

import { randomUUID } from "node:crypto";

import type { Cita } from "@chatcouncil/domain";

/** Motivo por el que un `<a href>` encontrado NO se convierte en `Cita`. */
export type MotivoDescartado =
  | "sin-href"
  | "href-vacio"
  | "no-absoluta-http"
  | "esquema-no-http";

export interface ExtraccionCitas {
  citas: Cita[];
  /** Cuántos `<a>` se vieron en total, aceptados + descartados. */
  anclasVistas: number;
  descartados: { motivo: MotivoDescartado; href: string }[];
  /**
   * Cardinalidad de fuentes DISTINTAS entre `citas`, por `normalizarUrl`
   * (sin query ni fragmento). `citas.length` es apariciones; esto es
   * fuentes — la brecha entre los dos es la repetición de una misma URL en
   * varios lugares del mensaje (chip inline + lista final, nota al pie
   * repetida), medida y no asumida (ver comentario de cabecera).
   */
  urlsUnicas: number;
}

/**
 * Normaliza para CONTAR y para que T2 dedupe antes de salir a la red: origen
 * más ruta, sin query ni fragmento. Dos citas de la misma página con distinto
 * `utm_source` o distinto `#:~:text=` son la misma fuente a los fines de
 * "¿existe esta URL?" — no a los fines de qué pasaje sostiene qué afirmación,
 * que es responsabilidad de `textoVisible`, no de esta normalización.
 * Si `url` no parsea como URL válida, se devuelve tal cual: no absorbe un
 * dato roto en un vacío silencioso.
 */
export function normalizarUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}

const REGEX_TAG = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^<>]*?)?)\/?>/g;
const REGEX_ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** Sin cierre propio: nunca aparecen como `</tag>` y no empujan la pila de ancestros. */
const ETIQUETAS_VACIAS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

/**
 * Reconoce, por ATRIBUTO estructural (rol, `aria-label`), un contenedor que
 * agrupa fuentes — nunca por `citation`/`cita` sueltos: ese patrón, probado
 * contra la captura real de chatgpt, matcheaba `data-testid="webpage-
 * citation-pill"` — el CHIP inline de una sola cita en medio del párrafo, no
 * un panel. Sacarlo fue una corrección medida, no cautelar (ver "T1, revisión
 * de dondeVive" en el BLUEPRINT). `\b` evita que "resource" cuente como
 * "source".
 */
const PATRON_CONTENEDOR_FUENTES = /\b(fuentes?|sources?|referenc\w*|bibliograf\w*)\b/i;

/**
 * Reconoce, por TEXTO de un título (h1-h6), el inicio de una sección de
 * fuentes ("Fuentes clave", "Referencias", "Sources"). Es la señal que de
 * verdad separó la lista de fuentes del cuerpo en la captura real: ningún
 * contenedor de chatgpt o deepseek llevaba una clase reconocible, pero los
 * dos tenían un título de sección exacto.
 */
const PATRON_TITULO_FUENTES = /^(fuentes?( claves?)?|referencias?|sources?|references?|citas?|bibliograf[ií]a)\s*:?$/i;
const ETIQUETAS_TITULO = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

function atributosDe(attrsCrudo: string): Record<string, string> {
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  REGEX_ATTR.lastIndex = 0;
  while ((m = REGEX_ATTR.exec(attrsCrudo)) !== null) {
    const nombre = m[1]!.toLowerCase();
    out[nombre] = m[2] ?? m[3] ?? "";
  }
  return out;
}

function esContenedorDeFuentes(attrs: Record<string, string>): boolean {
  const candidatos = [attrs["class"], attrs["id"]]
    .concat(Object.keys(attrs).filter((k) => k.startsWith("data-")).map((k) => attrs[k]))
    .filter((v): v is string => typeof v === "string");
  return candidatos.some((v) => PATRON_CONTENEDOR_FUENTES.test(v));
}

function decodificarEntidades(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function textoVisibleDe(fragmentoInterno: string): string {
  const sinTags = fragmentoInterno.replace(/<[^>]*>/g, " ");
  return decodificarEntidades(sinTags).replace(/\s+/g, " ").trim();
}

function clasificarHref(hrefCrudo: string | undefined): MotivoDescartado | null {
  if (hrefCrudo === undefined) return "sin-href";
  const href = decodificarEntidades(hrefCrudo).trim();
  if (href.length === 0) return "href-vacio";
  if (/^(javascript:|mailto:|tel:|data:)/i.test(href)) return "esquema-no-http";
  if (!/^https?:\/\//i.test(href)) return "no-absoluta-http";
  return null;
}

/**
 * Extrae las citas de un fragmento de HTML crudo (siempre `Respuesta.html`,
 * nunca `textoOriginal`: el texto no arrastra `href`). Recorre el HTML una
 * vez, manteniendo una pila de ancestros abiertos para decidir `dondeVive`
 * sin necesitar un DOM real.
 */
export function extraerCitas(html: string, respuestaId: string, idGen: () => string = randomUUID): ExtraccionCitas {
  const citas: Cita[] = [];
  const descartados: { motivo: MotivoDescartado; href: string }[] = [];
  let anclasVistas = 0;

  const pila: Record<string, string>[] = [];
  let profundidadContenedorFuentes = -1;
  // Distinto de la pila de ancestros: un título ya CERRADO ("<h2>Referencias
  // </h2>") sigue marcando la sección de todo lo que viene después, aunque
  // el título mismo ya no esté abierto en ningún ancestro.
  let seccionFuentesActiva = false;

  REGEX_TAG.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REGEX_TAG.exec(html)) !== null) {
    const completo = m[0]!;
    const nombre = m[1]!.toLowerCase();
    const cierre = completo.startsWith("</");
    const autoCerrada = completo.endsWith("/>") || ETIQUETAS_VACIAS.has(nombre);

    if (cierre) {
      if (nombre === "a") continue; // ya se resolvió al abrir
      for (let i = pila.length - 1; i >= 0; i--) {
        if (pila[i]!["__tag__"] === nombre) {
          pila.splice(i);
          if (profundidadContenedorFuentes >= pila.length) profundidadContenedorFuentes = -1;
          break;
        }
      }
      continue;
    }

    const attrs = atributosDe(m[2] ?? "");
    attrs["__tag__"] = nombre;

    if (ETIQUETAS_TITULO.has(nombre) && !autoCerrada) {
      // Mismo truco que en <a>: el título HTML no se anida, así que se
      // resuelve su texto de una sola vez buscando el cierre correspondiente.
      const restante = html.slice(REGEX_TAG.lastIndex);
      const cierreIdx = restante.search(new RegExp(`</${nombre}\\s*>`, "i"));
      const interno = cierreIdx === -1 ? "" : restante.slice(0, cierreIdx);
      seccionFuentesActiva = PATRON_TITULO_FUENTES.test(textoVisibleDe(interno));
    }

    if (nombre === "a") {
      anclasVistas++;
      const motivo = clasificarHref(attrs["href"]);
      const dentroDeContenedor = seccionFuentesActiva || profundidadContenedorFuentes >= 0;
      if (motivo !== null) {
        descartados.push({ motivo, href: attrs["href"] ?? "" });
      } else {
        // Texto visible: hasta el próximo </a> (los <a> de HTML no se anidan).
        const restante = html.slice(REGEX_TAG.lastIndex);
        const cierreIdx = restante.search(/<\/a\s*>/i);
        const interno = cierreIdx === -1 ? "" : restante.slice(0, cierreIdx);
        citas.push({
          tipo: "cita",
          esquema: 1,
          id: idGen(),
          respuestaId,
          url: decodificarEntidades(attrs["href"]!).trim(),
          textoVisible: textoVisibleDe(interno),
          dondeVive: dentroDeContenedor ? "panel-ancestro" : "cuerpo",
        });
      }
      // El <a> NO se empuja a la pila: su contenido se resolvió de una
      // sola vez arriba (búsqueda directa del </a> que le corresponde), así
      // que el `</a>` que el tokenizador vuelva a ver más adelante no debe
      // desapilar nada (de ahí el `continue` temprano en la rama de cierre).
      continue;
    }

    if (!autoCerrada) {
      pila.push(attrs);
      if (profundidadContenedorFuentes < 0 && esContenedorDeFuentes(attrs)) {
        profundidadContenedorFuentes = pila.length - 1;
      }
    }
  }

  const urlsUnicas = new Set(citas.map((c) => normalizarUrl(c.url))).size;
  return { citas, anclasVistas, descartados, urlsUnicas };
}
