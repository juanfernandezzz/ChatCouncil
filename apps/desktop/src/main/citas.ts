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
}

const REGEX_TAG = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^<>]*?)?)\/?>/g;
const REGEX_ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** Sin cierre propio: nunca aparecen como `</tag>` y no empujan la pila de ancestros. */
const ETIQUETAS_VACIAS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

/** Reconoce, por nombre estructural, un contenedor que agrupa fuentes/citas. */
const PATRON_CONTENEDOR_FUENTES = /cita|citation|fuente|source|referenc/i;

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

    if (nombre === "a") {
      anclasVistas++;
      const motivo = clasificarHref(attrs["href"]);
      const dentroDeContenedor = profundidadContenedorFuentes >= 0;
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

  return { citas, anclasVistas, descartados };
}
