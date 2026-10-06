using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace ChatCouncil.Motor
{
    /// <summary>
    /// Port de extraerCitas (apps/desktop/src/main/citas.ts): las fuentes desde
    /// el html crudo de una respuesta, sin DOM. Una Cita por APARICIÓN, no por
    /// fuente: la misma URL en el chip inline y en la lista final son dos, cada
    /// una con su texto y su dondeVive. Las citas pueden ser menos que
    /// fuentesHref, nunca más: un panel que vive en un ancestro no capturado no
    /// se ve desde acá, y eso se declara, no se adivina.
    /// </summary>
    public static class Citas
    {
        const string B = Js.Blancos;

        // /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^<>]*?)?)\/?>/g
        static readonly Regex Etiqueta = new Regex($"</?([a-zA-Z][a-zA-Z0-9-]*)((?:[{B}]+[^<>]*?)?)/?>");
        // /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
        static readonly Regex Atributo = new Regex($"([a-zA-Z_:][-a-zA-Z0-9_:.]*)[{B}]*=[{B}]*(?:\"([^\"]*)\"|'([^']*)')");

        /// <summary>Sin cierre propio: nunca aparecen como &lt;/tag&gt; y no empujan la pila de ancestros.</summary>
        static readonly HashSet<string> Vacias = new HashSet<string>
        {
            "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
        };

        // Un contenedor de fuentes se reconoce por ATRIBUTO (class, id, data-*), nunca por
        // "citation" suelto: eso matcheaba el chip inline de chatgpt
        // (data-testid="webpage-citation-pill"). El borde evita que "resource" cuente.
        // /\b(fuentes?|sources?|referenc\w*|bibliograf\w*)\b/i
        static readonly Regex ContenedorDeFuentes = new Regex(
            $"{Js.Borde}(?:{Js.Ci("fuente")}[sS]?|{Js.Ci("source")}[sS]?|{Js.Ci("referenc")}[A-Za-z0-9_]*|{Js.Ci("bibliograf")}[A-Za-z0-9_]*){Js.Borde}");

        // El título de una sección de fuentes: lo que de verdad separó la lista del cuerpo en chatgpt y deepseek.
        // /^(fuentes?( claves?)?|referencias?|sources?|references?|citas?|bibliograf[ií]a)\s*:?$/i
        static readonly Regex TituloDeFuentes = new Regex(
            $"^(?:{Js.Ci("fuente")}[sS]?(?: {Js.Ci("clave")}[sS]?)?|{Js.Ci("referencia")}[sS]?|{Js.Ci("source")}[sS]?|{Js.Ci("reference")}[sS]?|" +
            $"{Js.Ci("cita")}[sS]?|{Js.Ci("bibliograf")}[iIíÍ][aA])[{B}]*:?\\z");

        static readonly Dictionary<string, Regex> CierreDeTitulo = Enumerable.Range(1, 6)
            .ToDictionary(n => $"h{n}", n => new Regex($"</[hH]{n}[{B}]*>"));
        static readonly Regex CierreDeAncla = new Regex($"</[aA][{B}]*>");
        static readonly Regex Etiquetas = new Regex("<[^>]*>");
        static readonly Regex Blancos = new Regex($"[{B}]+");
        static readonly Regex EsquemaNoHttp = new Regex($"^(?:{Js.Ci("javascript:")}|{Js.Ci("mailto:")}|{Js.Ci("tel:")}|{Js.Ci("data:")})");
        static readonly Regex AbsolutaHttp = new Regex($"^{Js.Ci("http")}[sS]?://");

        static Dictionary<string, string> AtributosDe(string crudo)
        {
            var atributos = new Dictionary<string, string>();
            foreach (Match m in Atributo.Matches(crudo))
                atributos[m.Groups[1].Value.ToLowerInvariant()] = m.Groups[2].Success ? m.Groups[2].Value : m.Groups[3].Success ? m.Groups[3].Value : "";
            return atributos;
        }

        static bool EsContenedorDeFuentes(Dictionary<string, string> atributos) =>
            atributos.Where(a => a.Key == "class" || a.Key == "id" || a.Key.StartsWith("data-", StringComparison.Ordinal))
                .Any(a => ContenedorDeFuentes.IsMatch(a.Value));

        static string DecodificarEntidades(string s) =>
            s.Replace("&amp;", "&").Replace("&lt;", "<").Replace("&gt;", ">").Replace("&quot;", "\"").Replace("&#39;", "'").Replace("&nbsp;", " ");

        static string TextoVisibleDe(string fragmento) => Js.Trim(Blancos.Replace(DecodificarEntidades(Etiquetas.Replace(fragmento, " ")), " "));

        static string ClasificarHref(string crudo)
        {
            if (crudo == null) return "sin-href";
            var href = Js.Trim(DecodificarEntidades(crudo));
            if (href.Length == 0) return "href-vacio";
            if (EsquemaNoHttp.IsMatch(href)) return "esquema-no-http";
            if (!AbsolutaHttp.IsMatch(href)) return "no-absoluta-http";
            return null;
        }

        // Los <a> y los títulos no se anidan: su texto se resuelve de una vez, hasta su cierre.
        static string HastaElCierre(string html, int desde, Regex cierre)
        {
            var m = cierre.Match(html, desde);
            return m.Success ? html.Substring(desde, m.Index - desde) : "";
        }

        /// <summary>
        /// Las citas de Respuesta.html (nunca del texto: no arrastra href). Recorre
        /// el html una vez con una pila de ancestros abiertos para decidir dondeVive.
        /// </summary>
        public static (List<Cita> Citas, int AnclasVistas, List<(string Motivo, string Href)> Descartados) ExtraerCitas(string html, string respuestaId, Func<string> idGen)
        {
            var citas = new List<Cita>();
            var descartados = new List<(string Motivo, string Href)>();
            int anclasVistas = 0;
            var pila = new List<string>();
            int profundidadContenedor = -1;
            // Un título ya CERRADO ("<h2>Referencias</h2>") sigue marcando lo que viene después.
            bool seccionDeFuentes = false;

            foreach (Match m in Etiqueta.Matches(html))
            {
                var nombre = m.Groups[1].Value.ToLowerInvariant();
                bool cierre = m.Value.StartsWith("</", StringComparison.Ordinal);
                bool autoCerrada = m.Value.EndsWith("/>", StringComparison.Ordinal) || Vacias.Contains(nombre);
                int fin = m.Index + m.Length;

                if (cierre)
                {
                    if (nombre == "a") continue; // ya se resolvió al abrir
                    int i = pila.LastIndexOf(nombre);
                    if (i >= 0)
                    {
                        pila.RemoveRange(i, pila.Count - i);
                        if (profundidadContenedor >= pila.Count) profundidadContenedor = -1;
                    }
                    continue;
                }

                var atributos = AtributosDe(m.Groups[2].Value);
                if (CierreDeTitulo.TryGetValue(nombre, out var cierreTitulo) && !autoCerrada)
                    seccionDeFuentes = TituloDeFuentes.IsMatch(TextoVisibleDe(HastaElCierre(html, fin, cierreTitulo)));

                if (nombre == "a")
                {
                    anclasVistas++;
                    atributos.TryGetValue("href", out var href);
                    var motivo = ClasificarHref(href);
                    if (motivo != null) descartados.Add((motivo, href ?? ""));
                    else
                    {
                        citas.Add(new Cita
                        {
                            Id = idGen(),
                            RespuestaId = respuestaId,
                            Url = Js.Trim(DecodificarEntidades(href)),
                            TextoVisible = TextoVisibleDe(HastaElCierre(html, fin, CierreDeAncla)),
                            DondeVive = seccionDeFuentes || profundidadContenedor >= 0 ? "panel-ancestro" : "cuerpo",
                        });
                    }
                    // El <a> no se apila: su </a> no tiene que desapilar nada.
                    continue;
                }

                if (!autoCerrada)
                {
                    pila.Add(nombre);
                    if (profundidadContenedor < 0 && EsContenedorDeFuentes(atributos)) profundidadContenedor = pila.Count - 1;
                }
            }
            return (citas, anclasVistas, descartados);
        }
    }
}
