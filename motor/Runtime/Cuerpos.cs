using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace ChatCouncil.Motor
{
    public sealed class RespuestaParaOperar
    {
        public string ProveedorId { get; set; }
        public string ReplyId { get; set; }
        public string AttemptId { get; set; }
        public string Texto { get; set; }
        public IReadOnlyList<string> UrlsCitadas { get; set; }
    }

    public sealed class CuerpoOperador
    {
        /// <summary>El proveedor que VA A OPERAR este cuerpo, no de quién habla el contenido.</summary>
        public string OperadorId { get; set; }
        public string Cuerpo { get; set; }
        /// <summary>Las intercaladas y al final la de FIN, para EvaluarIntegridad.</summary>
        public List<string> Marcas { get; set; }
        /// <summary>Sólo para verificar la exclusión; nunca es lo que el operador lee.</summary>
        public List<string> ProveedoresIncluidos { get; set; }
        /// <summary>Código estable P# y texto limpio de fuentes, sin marcas: lo que arma el prompt de operación.</summary>
        public List<(string Etiqueta, string Texto)> RespuestasParaOperador { get; set; }
    }

    public sealed class CuerposPorOperador
    {
        public List<CuerpoOperador> Cuerpos { get; set; }
        /// <summary>Sin Id ni RondaId: los completa quien escribe el sello.</summary>
        public List<Sello> Sello { get; set; }
        /// <summary>Todo el pool, en el orden barajado: lo que lee el redactor.</summary>
        public List<(string Etiqueta, string Texto)> RespuestasTodas { get; set; }
    }

    /// <summary>
    /// Port de packages/analysis/src/cuerpo-operador.ts: el cuerpo ciego que
    /// recibe cada operador. Una URL citada no puede decirle qué proveedor
    /// produjo la respuesta que lee: query por lista blanca y una aserción que
    /// tira antes de devolver un cuerpo que delate al proveedor.
    /// </summary>
    public static class Cuerpos
    {
        public const int IntervaloMarcaChars = 1000;
        const int ToleranciaMarcas = 3;

        /// <summary>newConversationUrl de los nueve en specs.json.</summary>
        static readonly string[] DominiosPropios =
        {
            "chatgpt.com", "chat.z.ai", "claude.ai", "gemini.google.com", "grok.com",
            "chat.mistral.ai", "chat.qwen.ai", "kimi.ai", "chat.deepseek.com",
        };

        /// <summary>
        /// Quita todo parámetro de query salvo "model", que cambia qué página se
        /// sirve. Conserva el fragmento tal cual.
        /// </summary>
        public static string LimpiarQueryListaBlanca(string url)
        {
            int q = url.IndexOf('?');
            if (q == -1) return url;
            int h = url.IndexOf('#', q);
            var query = h == -1 ? url.Substring(q + 1) : url.Substring(q + 1, h - q - 1);
            var hash = h == -1 ? "" : url.Substring(h);
            // decodeURIComponent tira con un nombre mal codificado y JS lo descarta;
            // UnescapeDataString lo deja como está, que tampoco es "model".
            var conservados = query.Split('&').Where(par => par.Length > 0 && Uri.UnescapeDataString(par.Split('=')[0]) == "model").ToList();
            return url.Substring(0, q) + (conservados.Count > 0 ? "?" + string.Join("&", conservados) : "") + hash;
        }

        /// <summary>
        /// Las URL http(s) del texto que delatan al proveedor: por host propio, o
        /// por el id de un proveedor en la query (nunca en dominio ni ruta, donde
        /// puede ser una fuente legítima de terceros). Reproduce /https?:\/\/\S+/gi.
        /// </summary>
        public static List<string> FugasDeProveedorEnUrls(string texto)
        {
            var fugas = new List<string>();
            for (int i = 0; i < texto.Length; i++)
            {
                int prefijo = LargoPrefijoHttp(texto, i);
                if (prefijo == 0) continue;
                int fin = i + prefijo;
                while (fin < texto.Length && !Js.EsBlanco(texto[fin])) fin++;
                if (fin == i + prefijo) continue;
                var url = texto.Substring(i, fin - i);
                var query = QueryDe(url);
                if (EsHostPropio(HostDe(url)) || (query.Length > 0 && Roles.Conocidos.Any(id => query.Contains(id)))) fugas.Add(url);
                i = fin - 1;
            }
            return fugas;
        }

        // "http://" o "https://" sin distinguir mayúsculas ASCII (la /i sin /u no pliega ſ a s).
        static int LargoPrefijoHttp(string t, int i)
        {
            if (i + 7 > t.Length || string.Compare(t, i, "http", 0, 4, StringComparison.OrdinalIgnoreCase) != 0) return 0;
            int k = i + 4;
            if (t[k] == 's' || t[k] == 'S') k++;
            return k + 3 <= t.Length && t[k] == ':' && t[k + 1] == '/' && t[k + 2] == '/' ? k + 3 - i : 0;
        }

        static string HostDe(string url)
        {
            var u = Js.ToLowerCase(url);
            if (u.StartsWith("https://", StringComparison.Ordinal)) u = u.Substring(8);
            else if (u.StartsWith("http://", StringComparison.Ordinal)) u = u.Substring(7);
            int fin = u.IndexOfAny(new[] { '/', '?', '#' });
            return fin == -1 ? u : u.Substring(0, fin);
        }

        static bool EsHostPropio(string host) =>
            DominiosPropios.Any(d => host == d || host.EndsWith("." + d, StringComparison.Ordinal));

        static string QueryDe(string url)
        {
            int q = url.IndexOf('?');
            if (q == -1) return "";
            int h = url.IndexOf('#', q);
            return Js.ToLowerCase(h == -1 ? url.Substring(q + 1) : url.Substring(q + 1, h - q - 1));
        }

        /// <summary>
        /// El texto de la respuesta más sus fuentes con las URL ya limpias. TIRA
        /// si el cuerpo armado todavía delata al proveedor: nunca devuelve un
        /// cuerpo que no pasó su propia verificación.
        /// </summary>
        public static string ArmarCuerpoConFuentes(string texto, IReadOnlyList<string> urlsCitadas)
        {
            var cuerpo = urlsCitadas.Count == 0
                ? texto
                : texto + "\n\nFuentes citadas:\n" + string.Join("\n", urlsCitadas.Select(u => "- " + LimpiarQueryListaBlanca(u)));
            var fugas = FugasDeProveedorEnUrls(cuerpo);
            if (fugas.Count > 0)
                throw new InvalidOperationException($"cuerpo anonimizado filtra identidad de proveedor por URL ({fugas.Count}): {string.Join(" | ", fugas)}");
            return cuerpo;
        }

        /// <summary>
        /// Una marca [[CC-MARCA-0000-token]] en su propia línea en el primer
        /// espacio o salto a partir de cada "intervalo" caracteres, nunca en
        /// medio de una palabra; si el tramo no tiene ninguno, al final.
        /// </summary>
        public static (string TextoConMarcas, List<string> Marcas) InsertarMarcasIntercaladas(string texto, string token, int intervalo = IntervaloMarcaChars)
        {
            var marcas = new List<string>();
            var sb = new StringBuilder();
            int pos = 0;
            while (pos < texto.Length)
            {
                int corte = Math.Min(pos + intervalo, texto.Length);
                while (corte < texto.Length && texto[corte] != ' ' && texto[corte] != '\n') corte++;
                var marca = $"[[CC-MARCA-{marcas.Count.ToString("D4", CultureInfo.InvariantCulture)}-{token}]]";
                marcas.Add(marca);
                sb.Append(texto, pos, corte - pos).Append('\n').Append(marca).Append('\n');
                pos = corte;
            }
            return (sb.ToString(), marcas);
        }

        /// <summary>
        /// "completo" si están todas las marcas; "truncado" si faltan en un tramo
        /// contiguo (el tramo dice dónde); "indeterminado" si faltan dispersas.
        /// </summary>
        public static (string Estado, int MarcasEsperadas, int MarcasPresentes, List<int> Faltantes) EvaluarIntegridad(string respuesta, IReadOnlyList<string> marcas)
        {
            var faltantes = Enumerable.Range(0, marcas.Count).Where(i => !respuesta.Contains(marcas[i])).ToList();
            if (faltantes.Count == 0) return ("completo", marcas.Count, marcas.Count, faltantes);
            bool contiguo = faltantes.Zip(faltantes.Skip(1), (a, b) => b == a + 1).All(x => x);
            return (contiguo ? "truncado" : "indeterminado", marcas.Count, marcas.Count - faltantes.Count, faltantes);
        }

        /// <summary>
        /// Los segmentos entre marcas cuyo largo cambió de original a final. Sólo
        /// tiene sentido con todas las marcas presentes (integridad "completo").
        /// </summary>
        public static List<(int Indice, int LargoOriginal, int LargoFinal, int Delta)> LocalizarPerdida(string original, string final, IReadOnlyList<string> marcas)
        {
            List<int> Partir(string texto)
            {
                var largos = new List<int>();
                int desde = 0;
                foreach (var m in marcas)
                {
                    int idx = texto.IndexOf(m, desde, StringComparison.Ordinal);
                    if (idx == -1) break;
                    largos.Add(idx - desde);
                    desde = idx + m.Length;
                }
                largos.Add(texto.Length - desde);
                return largos;
            }
            var o = Partir(original);
            var f = Partir(final);
            var resultado = new List<(int, int, int, int)>();
            for (int i = 0; i < Math.Max(o.Count, f.Count); i++)
            {
                int lo = i < o.Count ? o[i] : 0, lf = i < f.Count ? f[i] : 0;
                if (lo != lf) resultado.Add((i, lo, lf, lf - lo));
            }
            return resultado;
        }

        /// <summary>
        /// Comprobación cruzada de la exclusión de autoevaluación: el tamaño
        /// esperado sale del pool menos la respuesta propia, nunca de lo que el
        /// cuerpo terminó incluyendo (esa referencia no podría discrepar de sí misma).
        /// </summary>
        public static void ComprobarExclusion(string operadorId, int marcasReales, int tamanoEsperado)
        {
            int esperadas = Math.Max(1, (int)Math.Round((double)tamanoEsperado / IntervaloMarcaChars, MidpointRounding.AwayFromZero));
            if (Math.Abs(marcasReales - esperadas) > ToleranciaMarcas)
                throw new InvalidOperationException(
                    $"cuerpo de {operadorId}: {marcasReales} marcas, esperadas ~{esperadas} (±{ToleranciaMarcas}) a partir de \"pool menos la respuesta propia\" — " +
                    "posible fallo de exclusión de autoevaluación u otro cambio en qué se incluye.");
        }

        /// <summary>
        /// Los cuerpos de todos los operadores. "respuestas" es EXACTAMENTE el pool
        /// (un ProveedorId cada una) y "poolOrden" el mismo conjunto en el orden fijo
        /// declarado, de donde salen los códigos P#. generarToken va inyectado para
        /// que una prueba pueda fijar los tokens.
        /// </summary>
        public static CuerposPorOperador ArmarCuerposPorOperador(
            IReadOnlyList<RespuestaParaOperar> respuestas, IReadOnlyList<string> poolOrden, uint semilla, Func<string> generarToken)
        {
            var anonimizado = Anonimizacion.AnonimizarRespuestas(respuestas.Select(r => (r.ProveedorId, r.ReplyId, r.AttemptId, r.Texto)).ToList(), semilla);
            var urlsPor = new Dictionary<string, IReadOnlyList<string>>();
            foreach (var r in respuestas) urlsPor[r.ProveedorId] = r.UrlsCitadas;
            // Cada respuesta tal como entra al cuerpo: texto MÁS la lista de fuentes.
            var largoPor = new Dictionary<string, int>();
            foreach (var r in respuestas) largoPor[r.ProveedorId] = ArmarCuerpoConFuentes(r.Texto, r.UrlsCitadas).Length;
            int sumaTotalPool = largoPor.Values.Sum();
            var codigos = Anonimizacion.CodigosEstables(poolOrden);
            string CodigoDe(string id) => codigos.TryGetValue(id, out var c) ? c : "";
            IReadOnlyList<string> UrlsDe(string id) => urlsPor.TryGetValue(id, out var u) ? u : Array.Empty<string>();
            foreach (var s in anonimizado.Sello) s.CodigoEstable = CodigoDe(s.PanelSourceId);

            var cuerpos = poolOrden.Select(operadorId =>
            {
                var bloques = new List<string>();
                var incluidos = new List<string>();
                var paraOperador = new List<(string, string)>();
                for (int i = 0; i < anonimizado.Etiquetadas.Count; i++)
                {
                    var proveedor = anonimizado.Sello[i].PanelSourceId;
                    if (proveedor == operadorId) continue; // exclusión de autoevaluación
                    var textoLimpio = ArmarCuerpoConFuentes(anonimizado.Etiquetadas[i].Texto, UrlsDe(proveedor));
                    bloques.Add($"### Respuesta {anonimizado.Etiquetadas[i].Label}\n{textoLimpio}");
                    incluidos.Add(proveedor);
                    // El prompt de operación promete "P1 a P7": el operador lee el código estable.
                    paraOperador.Add((CodigoDe(proveedor), textoLimpio));
                }
                var token = generarToken();
                var (conMarcas, marcas) = InsertarMarcasIntercaladas(string.Join("\n\n", bloques), token);
                var cuerpo = $"{conMarcas}\n[[CC-MARCA-FIN-{token}]]\n";
                ComprobarExclusion(operadorId, marcas.Count, sumaTotalPool - (largoPor.TryGetValue(operadorId, out var propio) ? propio : 0));
                var fugas = FugasDeProveedorEnUrls(cuerpo);
                if (fugas.Count > 0)
                    throw new InvalidOperationException($"cuerpo del operador {operadorId} filtra identidad de proveedor por URL: {string.Join(" | ", fugas)}");
                marcas.Add($"[[CC-MARCA-FIN-{token}]]");
                return new CuerpoOperador { OperadorId = operadorId, Cuerpo = cuerpo, Marcas = marcas, ProveedoresIncluidos = incluidos, RespuestasParaOperador = paraOperador };
            }).ToList();

            var todas = anonimizado.Etiquetadas
                .Select((e, i) => (CodigoDe(anonimizado.Sello[i].PanelSourceId), ArmarCuerpoConFuentes(e.Texto, UrlsDe(anonimizado.Sello[i].PanelSourceId))))
                .ToList();
            return new CuerposPorOperador { Cuerpos = cuerpos, Sello = anonimizado.Sello, RespuestasTodas = todas };
        }
    }
}
