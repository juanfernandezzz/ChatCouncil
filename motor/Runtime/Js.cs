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
            var sb = new System.Text.StringBuilder(s.Length);
            foreach (var c in s)
            {
                if (c == (char)0x0130) sb.Append('i').Append((char)0x0307);
                else if (c == (char)0x212A) sb.Append('k');
                else sb.Append(char.ToLowerInvariant(c));
            }
            return sb.ToString();
        }

        /// <summary>WhiteSpace y LineTerminator de ECMAScript: lo que quita trim y lo que reconoce \s.</summary>
        public static bool EsBlanco(char c) =>
            (c >= (char)0x09 && c <= (char)0x0D) || c == ' ' || c == (char)0xA0 || c == (char)0x1680 ||
            (c >= (char)0x2000 && c <= (char)0x200A) || c == (char)0x2028 || c == (char)0x2029 ||
            c == (char)0x202F || c == (char)0x205F || c == (char)0x3000 || c == (char)0xFEFF;
    }
}
