using System.Text;
using System.Text.RegularExpressions;

namespace ChatCouncil.Motor
{
    /// <summary>
    /// Las pocas funciones de JavaScript cuya semántica el port tiene que
    /// reproducir exacta, porque la de C# difiere en casos que llegan del DOM.
    /// </summary>
    public static class Js
    {
        /// <summary>
        /// String.prototype.trim: los blancos y saltos de ECMAScript. No es
        /// string.Trim(): ese no quita U+FEFF y sí quita U+0085.
        /// </summary>
        public static string Trim(string s)
        {
            int i = 0, j = s.Length;
            while (i < j && EsBlanco(s[i])) i++;
            while (j > i && EsBlanco(s[j - 1])) j--;
            return s.Substring(i, j - i);
        }

        /// <summary>
        /// String.prototype.toLowerCase, exacta en todo lo que se compara contra
        /// texto ASCII: U+0130 (İ) da "i" + U+0307 y U+212A (signo Kelvin) da "k",
        /// como en JS. No reproduce la sigma final ni las mayúsculas fuera del
        /// plano básico.
        /// </summary>
        public static string ToLowerCase(string s)
        {
            var sb = new StringBuilder(s.Length);
            foreach (var c in s)
            {
                if (c == (char)0x0130) sb.Append('i').Append((char)0x0307);
                else if (c == (char)0x212A) sb.Append('k');
                else sb.Append(char.ToLowerInvariant(c));
            }
            return sb.ToString();
        }

        /// <summary>
        /// String.prototype.toUpperCase, exacta en todo lo que se compara contra
        /// texto ASCII: las expansiones de SpecialCasing que dan letras ASCII
        /// (ß → SS, ﬁ → FI…) y las dos simples que caen en ASCII (ı → I, ſ → S).
        /// </summary>
        public static string ToUpperCase(string s)
        {
            var sb = new StringBuilder(s.Length);
            foreach (var c in s)
            {
                switch ((int)c)
                {
                    case 0x00DF: sb.Append("SS"); break;
                    case 0x0131: sb.Append('I'); break;
                    case 0x017F: sb.Append('S'); break;
                    case 0x0149: sb.Append((char)0x02BC).Append('N'); break;
                    case 0x01F0: sb.Append('J').Append((char)0x030C); break;
                    case 0x1E96: sb.Append('H').Append((char)0x0331); break;
                    case 0x1E97: sb.Append('T').Append((char)0x0308); break;
                    case 0x1E98: sb.Append('W').Append((char)0x030A); break;
                    case 0x1E99: sb.Append('Y').Append((char)0x030A); break;
                    case 0x1E9A: sb.Append('A').Append((char)0x02BE); break;
                    case 0xFB00: sb.Append("FF"); break;
                    case 0xFB01: sb.Append("FI"); break;
                    case 0xFB02: sb.Append("FL"); break;
                    case 0xFB03: sb.Append("FFI"); break;
                    case 0xFB04: sb.Append("FFL"); break;
                    case 0xFB05:
                    case 0xFB06: sb.Append("ST"); break;
                    default: sb.Append(char.ToUpperInvariant(c)); break;
                }
            }
            return sb.ToString();
        }

        /// <summary>
        /// String.prototype.normalize("NFD"). La de .NET tira con un surrogate
        /// suelto; JS lo deja como está, y no se combina con nada.
        /// </summary>
        public static string NormalizeNfd(string s)
        {
            var sb = new StringBuilder(s.Length);
            int desde = 0;
            for (int i = 0; i < s.Length; i++)
            {
                if (char.IsHighSurrogate(s[i]) && i + 1 < s.Length && char.IsLowSurrogate(s[i + 1])) { i++; continue; }
                if (!char.IsSurrogate(s[i])) continue;
                sb.Append(s.Substring(desde, i - desde).Normalize(NormalizationForm.FormD)).Append(s[i]);
                desde = i + 1;
            }
            return sb.Append(s.Substring(desde).Normalize(NormalizationForm.FormD)).ToString();
        }

        /// <summary>WhiteSpace y LineTerminator de ECMAScript: lo que quita trim y lo que reconoce \s.</summary>
        public static bool EsBlanco(char c) =>
            (c >= (char)0x09 && c <= (char)0x0D) || c == ' ' || c == (char)0xA0 || c == (char)0x1680 ||
            (c >= (char)0x2000 && c <= (char)0x200A) || c == (char)0x2028 || c == (char)0x2029 ||
            c == (char)0x202F || c == (char)0x205F || c == (char)0x3000 || c == (char)0xFEFF;

        // Piezas para escribir en .NET las expresiones de JS sin /u con la misma
        // semántica: las clases \s, \d y \w de .NET son Unicode, su "." cruza \r y
        // U+2028, su "$" acepta un \n final y su IgnoreCase pliega el signo Kelvin.

        /// <summary>El contenido de la clase \s de JS, para poner entre corchetes: [Blancos] o [^Blancos].</summary>
        public const string Blancos = @"\t\n\v\f\r \u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF";

        /// <summary>El "." de JS sin /s: todo menos los cuatro terminadores de línea. El "$" de JS sin /m es \z.</summary>
        public const string Punto = @"[^\n\r\u2028\u2029]";

        /// <summary>\b de JS sin /u: el borde entre [A-Za-z0-9_] y lo demás.</summary>
        public const string Borde = @"(?:(?<=[A-Za-z0-9_])(?![A-Za-z0-9_])|(?<![A-Za-z0-9_])(?=[A-Za-z0-9_]))";

        /// <summary>
        /// Un literal con la /i de JS sin /u: cada letra con su otra caja y nada
        /// más (JS no pliega ſ, ı ni el signo Kelvin a una letra ASCII).
        /// </summary>
        public static string Ci(string literal)
        {
            var sb = new StringBuilder();
            foreach (var c in literal)
            {
                char mayuscula = char.ToUpperInvariant(c), minuscula = char.ToLowerInvariant(c);
                if (mayuscula == minuscula) sb.Append(Regex.Escape(c.ToString()));
                else sb.Append('[').Append(minuscula).Append(mayuscula).Append(']');
            }
            return sb.ToString();
        }
    }
}
