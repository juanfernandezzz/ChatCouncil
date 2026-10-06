using System;
using System.Globalization;
using System.Text;
using Newtonsoft.Json.Linq;

namespace ChatCouncil.Motor
{
    /// <summary>
    /// Lector de JSON con la semántica de JSON.parse. Existe por dos motivos
    /// medidos en las pruebas del registro: el lector de Newtonsoft reemplaza un
    /// surrogate suelto (\ud800) por U+FFFD —alteraría el dato crudo al leerlo—
    /// y acepta JSON laxo (comillas simples, comentarios) que JSON.parse rechaza.
    /// Las fechas quedan como texto: nunca se convierten.
    /// </summary>
    public static class JsonEstricto
    {
        public static JToken Leer(string texto)
        {
            var i = 0;
            var valor = Valor(texto, ref i);
            Blancos(texto, ref i);
            if (i != texto.Length) throw Error(i, "texto después del valor");
            return valor;
        }

        static JToken Valor(string s, ref int i)
        {
            Blancos(s, ref i);
            if (i >= s.Length) throw Error(i, "fin inesperado");
            switch (s[i])
            {
                case '{': return Objeto(s, ref i);
                case '[': return Arreglo(s, ref i);
                case '"': return new JValue(Texto(s, ref i));
                case 't': return Palabra(s, ref i, "true", new JValue(true));
                case 'f': return Palabra(s, ref i, "false", new JValue(false));
                case 'n': return Palabra(s, ref i, "null", JValue.CreateNull());
                default: return Numero(s, ref i);
            }
        }

        static JObject Objeto(string s, ref int i)
        {
            var o = new JObject();
            i++;
            Blancos(s, ref i);
            if (i < s.Length && s[i] == '}') { i++; return o; }
            for (;;)
            {
                Blancos(s, ref i);
                if (i >= s.Length || s[i] != '"') throw Error(i, "se esperaba un nombre");
                var nombre = Texto(s, ref i);
                Blancos(s, ref i);
                if (i >= s.Length || s[i] != ':') throw Error(i, "se esperaba ':'");
                i++;
                o[nombre] = Valor(s, ref i); // como JSON.parse: con un nombre repetido gana el último
                Blancos(s, ref i);
                if (i < s.Length && s[i] == ',') { i++; continue; }
                if (i < s.Length && s[i] == '}') { i++; return o; }
                throw Error(i, "se esperaba ',' o '}'");
            }
        }

        static JArray Arreglo(string s, ref int i)
        {
            var a = new JArray();
            i++;
            Blancos(s, ref i);
            if (i < s.Length && s[i] == ']') { i++; return a; }
            for (;;)
            {
                a.Add(Valor(s, ref i));
                Blancos(s, ref i);
                if (i < s.Length && s[i] == ',') { i++; continue; }
                if (i < s.Length && s[i] == ']') { i++; return a; }
                throw Error(i, "se esperaba ',' o ']'");
            }
        }

        static string Texto(string s, ref int i)
        {
            var sb = new StringBuilder();
            i++;
            for (;;)
            {
                if (i >= s.Length) throw Error(i, "texto sin cerrar");
                var c = s[i++];
                if (c == '"') return sb.ToString();
                if (c < ' ') throw Error(i - 1, "carácter de control sin escapar");
                if (c != '\\') { sb.Append(c); continue; }
                if (i >= s.Length) throw Error(i, "escape sin terminar");
                var e = s[i++];
                switch (e)
                {
                    case '"': sb.Append('"'); break;
                    case '\\': sb.Append('\\'); break;
                    case '/': sb.Append('/'); break;
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'n': sb.Append('\n'); break;
                    case 'r': sb.Append('\r'); break;
                    case 't': sb.Append('\t'); break;
                    case 'u':
                        if (i + 4 > s.Length || !int.TryParse(s.Substring(i, 4), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out var codigo))
                            throw Error(i, "escape de unicode inválido");
                        sb.Append((char)codigo); // un surrogate suelto queda tal cual, como en JSON.parse
                        i += 4;
                        break;
                    default: throw Error(i - 1, "escape inválido");
                }
            }
        }

        static bool Digito(string s, int i) => i < s.Length && s[i] >= '0' && s[i] <= '9';

        static JValue Numero(string s, ref int i)
        {
            var inicio = i;
            if (i < s.Length && s[i] == '-') i++;
            if (i < s.Length && s[i] == '0') i++;
            else if (Digito(s, i)) while (Digito(s, i)) i++;
            else throw Error(i, "valor inválido");
            var entero = true;
            if (i < s.Length && s[i] == '.')
            {
                entero = false;
                i++;
                if (!Digito(s, i)) throw Error(i, "número inválido");
                while (Digito(s, i)) i++;
            }
            if (i < s.Length && (s[i] == 'e' || s[i] == 'E'))
            {
                entero = false;
                i++;
                if (i < s.Length && (s[i] == '+' || s[i] == '-')) i++;
                if (!Digito(s, i)) throw Error(i, "número inválido");
                while (Digito(s, i)) i++;
            }
            var texto = s.Substring(inicio, i - inicio);
            if (entero && long.TryParse(texto, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var n)) return new JValue(n);
            return new JValue(double.Parse(texto, NumberStyles.Float, CultureInfo.InvariantCulture));
        }

        static JValue Palabra(string s, ref int i, string palabra, JValue valor)
        {
            if (string.CompareOrdinal(s, i, palabra, 0, palabra.Length) != 0) throw Error(i, "valor inválido");
            i += palabra.Length;
            return valor;
        }

        static void Blancos(string s, ref int i)
        {
            while (i < s.Length && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r')) i++;
        }

        static FormatException Error(int i, string que) => new FormatException($"JSON inválido en la posición {i}: {que}");
    }
}
