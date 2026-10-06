namespace ChatCouncil.Motor
{
    /// <summary>
    /// Las pocas funciones de JavaScript cuya semántica el port tiene que
    /// reproducir exacta, porque la de C# difiere en casos que llegan del DOM.
    /// </summary>
    static class Js
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

        static bool EsBlanco(char c) =>
            (c >= (char)0x09 && c <= (char)0x0D) || c == ' ' || c == (char)0xA0 || c == (char)0x1680 ||
            (c >= (char)0x2000 && c <= (char)0x200A) || c == (char)0x2028 || c == (char)0x2029 ||
            c == (char)0x202F || c == (char)0x205F || c == (char)0x3000 || c == (char)0xFEFF;
    }
}
