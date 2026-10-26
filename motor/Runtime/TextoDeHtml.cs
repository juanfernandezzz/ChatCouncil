using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace ChatCouncil.Motor
{
    /// <summary>
    /// Port de packages/analysis/src/texto-de-html.ts: re-deriva texto CON
    /// BLOQUES desde el html guardado. El textContent pierde los cortes de
    /// párrafo y el número de las listas ordenadas (deepseek escribe cada
    /// sección como &lt;ol start="5"&gt;), y el parseo por líneas no encontraba
    /// ni el título ni la sección 5. Sin DOM: un recorrido de etiquetas.
    /// </summary>
    public static class TextoDeHtml
    {
        static readonly HashSet<string> Bloques = new HashSet<string>
        {
            "p", "div", "li", "ol", "ul", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "blockquote", "tr", "table", "section", "article", "hr",
        };

        static readonly Regex Comentario = new Regex(@"<!--[\s\S]*?-->");
        // <(style|script)\b[\s\S]*?<\/\1> con /i: la referencia hacia atrás también ignora la caja.
        static readonly Regex EstiloOScript = new Regex(
            $"<(?:{Js.Ci("style")}{Js.Borde}[\\s\\S]*?</{Js.Ci("style")}>|{Js.Ci("script")}{Js.Borde}[\\s\\S]*?</{Js.Ci("script")}>)");
        static readonly Regex Token = new Regex("<(/?)([A-Za-z0-9]+)([^>]*)>|([^<]+)");
        static readonly Regex Start = new Regex($"{Js.Borde}{Js.Ci("start")}[{Js.Blancos}]*=[{Js.Blancos}]*\"?([0-9]+)");
        static readonly Regex Decimal = new Regex("&#([0-9]+);");
        static readonly Regex Hexadecimal = new Regex("&#[xX]([0-9a-fA-F]+);");
        static readonly Regex BlancoFinal = new Regex("[ \t]+\\z");
        static readonly Regex TresSaltos = new Regex("\n{3,}");
        // Controles de la página, no la respuesta: botones y la barra del bloque de código de DeepSeek ("text", Copiar, Descargar).
        static readonly Regex Control = new Regex($"{Js.Borde}{Js.Ci("role")}[{Js.Blancos}]*=[{Js.Blancos}]*\"{Js.Ci("button")}\"|{Js.Borde}{Js.Ci("class")}[{Js.Blancos}]*=[{Js.Blancos}]*\"[^\"]*code-block-banner");
        static readonly Regex Vacia = new Regex("^(img|input|br|hr|wbr|area|col|embed|source|track|meta|link|param)$");
        static readonly Regex Titulo = new Regex("^h([1-6])$");

        static string Decodificar(string texto)
        {
            texto = texto.Replace("&nbsp;", " ").Replace("&lt;", "<").Replace("&gt;", ">").Replace("&quot;", "\"")
                .Replace("&#39;", "'").Replace("&apos;", "'");
            texto = Decimal.Replace(texto, m => DesdePuntoDeCodigo(m.Groups[1].Value, 10, 7));
            texto = Hexadecimal.Replace(texto, m => DesdePuntoDeCodigo(m.Groups[1].Value, 16, 6));
            return texto.Replace("&amp;", "&");
        }

        // String.fromCodePoint: tira por encima de U+10FFFF y deja pasar un surrogate suelto.
        static string DesdePuntoDeCodigo(string digitos, int baseNumerica, int maximoDeDigitos)
        {
            var sinCeros = digitos.TrimStart('0');
            int punto = sinCeros.Length == 0 ? 0 : sinCeros.Length > maximoDeDigitos ? int.MaxValue : Convert.ToInt32(sinCeros, baseNumerica);
            if (punto > 0x10FFFF) throw new ArgumentOutOfRangeException(nameof(digitos), $"punto de código fuera de rango: {digitos}");
            return punto < 0x10000 ? ((char)punto).ToString() : char.ConvertFromUtf32(punto);
        }

        /// <summary>
        /// Texto del html con un salto por bloque y el número de cada ítem de &lt;ol&gt; (respetando start).
        /// Con markdown (el cuerpo del redactor, que va al informe tal cual) también los títulos, dos niveles
        /// por debajo de los del informe, las tablas con su fila separadora y los bloques de código.
        /// </summary>
        public static string TextoDeHtmlEnBloques(string html, bool markdown = false)
        {
            var limpio = EstiloOScript.Replace(Comentario.Replace(html, ""), "");
            var listas = new List<(bool Ordenada, long N)>();
            var salida = new StringBuilder();
            // Justo después de "5. " (o "- ") el <p> del ítem no corta la línea.
            bool trasPrefijo = false;
            (string Tag, int N)? saltar = null;
            bool enCelda = false;
            int encabezados = 0;
            foreach (Match m in Token.Matches(limpio))
            {
                if (m.Groups[4].Success)
                {
                    if (saltar != null) continue;
                    var t = Decodificar(m.Groups[4].Value);
                    salida.Append(markdown && enCelda ? t.Replace("|", "\\|") : t);
                    trasPrefijo = false;
                    continue;
                }
                bool cierre = m.Groups[1].Value == "/";
                var tag = m.Groups[2].Value.ToLowerInvariant();
                if (saltar != null)
                {
                    if (tag == saltar.Value.Tag)
                    {
                        int n = saltar.Value.N + (cierre ? -1 : 1);
                        saltar = n == 0 ? ((string, int)?)null : (tag, n);
                    }
                    continue;
                }
                if (!cierre && (tag == "button" || Control.IsMatch(m.Groups[3].Value)))
                {
                    if (!Vacia.IsMatch(tag) && !m.Groups[3].Value.EndsWith("/", StringComparison.Ordinal)) saltar = (tag, 1);
                    continue;
                }
                if (tag == "br")
                {
                    salida.Append('\n');
                    continue;
                }
                if (cierre && (tag == "td" || tag == "th"))
                {
                    salida.Append(" | ");
                    enCelda = false;
                    continue;
                }
                if (markdown)
                {
                    if (tag == "td" || tag == "th")
                    {
                        enCelda = true;
                        if (tag == "th") encabezados++;
                        continue;
                    }
                    if (enCelda) continue;
                    var titulo = Titulo.Match(tag);
                    if (titulo.Success)
                    {
                        salida.Append(cierre ? "\n\n" : "\n\n" + new string('#', Math.Min(int.Parse(titulo.Groups[1].Value, CultureInfo.InvariantCulture) + 2, 6)) + " ");
                        continue;
                    }
                    if (tag == "pre")
                    {
                        salida.Append(cierre ? "\n```\n\n" : "\n\n```\n");
                        continue;
                    }
                    if (tag == "table")
                    {
                        salida.Append("\n\n");
                        continue;
                    }
                    if (tag == "tr")
                    {
                        // Cada fila abre su línea; una línea en blanco entre filas partiría la tabla.
                        if (!cierre) salida.Append("\n| ");
                        else
                        {
                            if (encabezados > 0) salida.Append("\n|").Append(string.Concat(Enumerable.Repeat(" --- |", encabezados)));
                            encabezados = 0;
                        }
                        continue;
                    }
                }
                if (!Bloques.Contains(tag)) continue;
                if (trasPrefijo && !cierre) continue;
                if (salida.Length > 0 && salida[salida.Length - 1] != '\n') salida.Append('\n');
                if (cierre)
                {
                    if ((tag == "ol" || tag == "ul") && listas.Count > 0) listas.RemoveAt(listas.Count - 1);
                    continue;
                }
                if (tag == "ol" || tag == "ul")
                {
                    var start = Start.Match(m.Groups[3].Value);
                    // ponytail: start como long; JS lo lee como Number y pierde precisión por encima de 2^53. Ninguna lista empieza ahí.
                    listas.Add((tag == "ol", start.Success && long.TryParse(start.Groups[1].Value, NumberStyles.None, CultureInfo.InvariantCulture, out var n) ? n : start.Success ? long.MaxValue : 1));
                }
                else if (tag == "li")
                {
                    if (listas.Count > 0)
                    {
                        var lista = listas[listas.Count - 1];
                        if (lista.Ordenada)
                        {
                            salida.Append(lista.N.ToString(CultureInfo.InvariantCulture)).Append(". ");
                            listas[listas.Count - 1] = (true, lista.N + 1);
                        }
                        else salida.Append("- ");
                    }
                    trasPrefijo = listas.Count > 0;
                }
            }
            var lineas = salida.ToString().Split('\n').Select(l => BlancoFinal.Replace(l, ""));
            return Js.Trim(TresSaltos.Replace(string.Join("\n", lineas), "\n\n"));
        }

        /// <summary>El texto del informe del integrador para parsear: el re-derivado del html, o el crudo si no hay html.</summary>
        public static string TextoDelInformeIntegrador(string informeCrudo, string html) =>
            string.IsNullOrEmpty(html) ? informeCrudo : TextoDeHtmlEnBloques(html);

        /// <summary>Igual para la salida del verificador: GLM deja cada párrafo en un &lt;p&gt; y el textContent los pega.</summary>
        public static string TextoDeLaSalidaVerificador(string salidaCruda, string html) =>
            string.IsNullOrEmpty(html) ? salidaCruda : TextoDeHtmlEnBloques(html);    }
}
