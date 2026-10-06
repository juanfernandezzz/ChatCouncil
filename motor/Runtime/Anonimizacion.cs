using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace ChatCouncil.Motor
{
    /// <summary>
    /// Lo que va a los operadores: etiquetas sin identidad y textos tapados. El
    /// sello (etiqueta → panel) va aparte y JAMÁS al camino del prompt.
    /// </summary>
    public sealed class Anonimizado
    {
        public List<(string Label, string Texto)> Etiquetadas { get; } = new List<(string Label, string Texto)>();
        /// <summary>Sin Id, RondaId ni CodigoEstable: los completa quien escribe el sello.</summary>
        public List<Sello> Sello { get; } = new List<Sello>();
        /// <summary>Sólo las etiquetas con al menos un término tapado.</summary>
        public List<(string Label, int Cuenta)> Redacciones { get; } = new List<(string Label, int Cuenta)>();
    }

    /// <summary>
    /// Port de packages/analysis/src/anonymize.ts, provider-names.ts y
    /// codigosEstables (cuerpo-operador.ts). La misma semilla da el mismo
    /// barajado en las dos versiones.
    /// </summary>
    public static class Anonimizacion
    {
        /// <summary>Términos que identifican proveedor, modelo o empresa.</summary>
        public static readonly string[] TerminosBloqueados =
        {
            "Anthropic", "Claude", "Sonnet", "Opus", "Haiku",
            "OpenAI", "ChatGPT", "GPT-5", "GPT-4", "GPT",
            "Google", "Gemini", "DeepMind", "Bard",
            "DeepSeek", "Perplexity", "Sonar", "Mistral", "Groq", "Grok", "xAI", "OpenRouter", "GLM", "Zhipu",
        };

        /// <summary>Token uniforme: no insinúa el largo ni la inicial del término tapado.</summary>
        public const string TokenRedaccion = "▮▮▮";

        // Los largos primero, para que "GPT-4" gane antes que "GPT". OrderBy es estable, como sort de JS.
        static readonly string[] TerminosPorLargo = TerminosBloqueados.OrderByDescending(t => t.Length).ToArray();

        /// <summary>
        /// FNV-1a de 32 bits sobre unidades UTF-16 (como charCodeAt): convierte
        /// Ronda.semilla, que es un string, en el número que necesita el barajado.
        /// </summary>
        public static uint HashSemilla(string semilla)
        {
            uint h = 0x811c9dc5;
            foreach (var c in semilla) h = unchecked((h ^ c) * 0x01000193);
            return h;
        }

        /// <summary>Fisher-Yates con mulberry32. No muta la entrada.</summary>
        public static List<T> Barajar<T>(IReadOnlyList<T> items, uint semilla)
        {
            var salida = items.ToList();
            var estado = semilla;
            for (int i = salida.Count - 1; i > 0; i--)
            {
                int j = (int)Math.Floor(Mulberry32(ref estado) * (i + 1));
                (salida[i], salida[j]) = (salida[j], salida[i]);
            }
            return salida;
        }

        // Math.imul y >>> de JS son la aritmética de uint con desborde.
        static double Mulberry32(ref uint a)
        {
            unchecked
            {
                a += 0x6d2b79f5;
                uint t = a;
                t = (t ^ (t >> 15)) * (t | 1);
                t ^= t + (t ^ (t >> 7)) * (t | 61);
                return (t ^ (t >> 14)) / 4294967296.0;
            }
        }

        /// <summary>
        /// anonymizeReplies(respuestas, true, semilla): baraja, etiqueta "Modelo A".."Z"
        /// en el orden barajado y tapa los términos de la lista contando cuántos.
        /// </summary>
        public static Anonimizado AnonimizarRespuestas(
            IReadOnlyList<(string PanelSourceId, string ReplyId, string AttemptId, string Texto)> respuestas, uint semilla)
        {
            var salida = new Anonimizado();
            var barajadas = Barajar(respuestas, semilla);
            for (int i = 0; i < barajadas.Count; i++)
            {
                var r = barajadas[i];
                var label = "Modelo " + (char)('A' + i % 26);
                salida.Etiquetadas.Add((label, Tapar(r.Texto, out var cuenta)));
                salida.Sello.Add(new Sello { Label = label, PanelSourceId = r.PanelSourceId, ReplyId = r.ReplyId, AttemptId = r.AttemptId });
                if (cuenta > 0) salida.Redacciones.Add((label, cuenta));
            }
            return salida;
        }

        /// <summary>
        /// /(?&lt;![\p{L}\p{N}])(?:términos)(?![\p{L}\p{N}])/giu sin Regex: la de .NET
        /// mira los límites por unidad UTF-16 y no por punto de código, así que
        /// tapaba "Claude" pegado a una letra o un dígito fuera del plano básico
        /// (medido: "𝐀Claude" y "Claude𝟏", que el TypeScript deja como están).
        /// </summary>
        static string Tapar(string texto, out int cuenta)
        {
            cuenta = 0;
            var sb = new StringBuilder(texto.Length);
            int i = 0;
            while (i < texto.Length)
            {
                var termino = HayLetraONumeroAntes(texto, i) ? null : TerminosPorLargo.FirstOrDefault(t => CoincideEn(texto, i, t));
                if (termino == null)
                {
                    sb.Append(texto[i++]);
                    continue;
                }
                sb.Append(TokenRedaccion);
                cuenta++;
                i += termino.Length;
            }
            return sb.ToString();
        }

        static bool CoincideEn(string texto, int i, string termino)
        {
            int fin = i + termino.Length;
            if (fin > texto.Length) return false;
            for (int k = 0; k < termino.Length; k++)
                if (Plegar(texto[i + k]) != Plegar(termino[k])) return false;
            return fin == texto.Length || !EsLetraONumero(texto, fin);
        }

        // Pliegue simple de Unicode, el de /i con /u. Los términos son ASCII, y fuera
        // de ASCII sólo U+017F (ſ) y U+212A (signo Kelvin) pliegan a una letra ASCII.
        static char Plegar(char c) =>
            c >= 'A' && c <= 'Z' ? (char)(c + 32) : c == (char)0x017F ? 's' : c == (char)0x212A ? 'k' : c;

        static bool HayLetraONumeroAntes(string texto, int i)
        {
            if (i == 0) return false;
            int k = i - 1;
            if (k > 0 && char.IsLowSurrogate(texto[k]) && char.IsHighSurrogate(texto[k - 1])) k--;
            return EsLetraONumero(texto, k);
        }

        // \p{L} y \p{N} por punto de código: esta sobrecarga lee el par de surrogates entero.
        static bool EsLetraONumero(string texto, int i)
        {
            switch (CharUnicodeInfo.GetUnicodeCategory(texto, i))
            {
                case UnicodeCategory.UppercaseLetter:
                case UnicodeCategory.LowercaseLetter:
                case UnicodeCategory.TitlecaseLetter:
                case UnicodeCategory.ModifierLetter:
                case UnicodeCategory.OtherLetter:
                case UnicodeCategory.DecimalDigitNumber:
                case UnicodeCategory.LetterNumber:
                case UnicodeCategory.OtherNumber:
                    return true;
                default:
                    return false;
            }
        }

        /// <summary>
        /// P1..Pn en el orden fijo del pool. Se genera al armar los cuerpos de una
        /// ronda y se persiste en el Sello: nunca se recalcula para esa ronda,
        /// porque el pool puede cambiar después y el informe quedaría mintiendo.
        /// </summary>
        public static Dictionary<string, string> CodigosEstables(IReadOnlyList<string> idsEnOrden)
        {
            var codigos = new Dictionary<string, string>();
            for (int i = 0; i < idsEnOrden.Count; i++) codigos[idsEnOrden[i]] = "P" + (i + 1);
            return codigos;
        }
    }
}
