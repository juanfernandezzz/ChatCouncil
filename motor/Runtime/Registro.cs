using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;

namespace ChatCouncil.Motor
{
    public sealed class LineaIlegible
    {
        public int Numero { get; set; }
        public string Contenido { get; set; }
    }

    public sealed class RegistroLeido
    {
        public List<Hecho> Hechos { get; } = new List<Hecho>();
        /// <summary>Se cuentan y se devuelven, nunca se saltean en silencio.</summary>
        public List<LineaIlegible> LineasIlegibles { get; } = new List<LineaIlegible>();
        /// <summary>true si la ÚNICA ilegible es la última: la firma de un corte a mitad de escritura.</summary>
        public bool UltimaLineaIncompleta { get; set; }
    }

    /// <summary>
    /// El registro: una línea de JSON por hecho, append-only. Lee y escribe el
    /// mismo formato que leerRegistro/aLinea de la versión Electron.
    /// </summary>
    public static class Registro
    {
        static readonly Dictionary<string, Type> Tipos = new Dictionary<string, Type>
        {
            ["conversacion"] = typeof(Conversacion),
            ["ronda"] = typeof(Ronda),
            ["intento"] = typeof(Intento),
            ["respuesta"] = typeof(Respuesta),
            ["cita"] = typeof(Cita),
            ["sello"] = typeof(Sello),
            ["salida-operador"] = typeof(SalidaOperador),
            ["hallazgo"] = typeof(HallazgoHecho),
            ["informe-integrador"] = typeof(InformeIntegrador),
            ["salida-verificador"] = typeof(SalidaVerificador),
            ["respuesta-redactor"] = typeof(RespuestaRedactor),
            ["url-comprobada"] = typeof(UrlComprobada),
            ["condicion-herramientas"] = typeof(CondicionHerramientas),
            ["error-captura"] = typeof(ErrorCaptura),
            ["pregunta-declarada"] = typeof(PreguntaDeclarada),
            ["condicion-proveedores-cargados"] = typeof(CondicionProveedoresCargados),
        };

        // DateParseHandling.None: sin esto Newtonsoft convierte las fechas ISO en
        // DateTime al leer y las reescribe con otro formato.
        static readonly JsonSerializer Serializador = JsonSerializer.Create(new JsonSerializerSettings
        {
            ContractResolver = new CamelCasePropertyNamesContractResolver(),
            DateParseHandling = DateParseHandling.None,
            NullValueHandling = NullValueHandling.Include,
        });

        /// <summary>Un hecho como una línea, sin saltos adentro.</summary>
        public static string ALinea(Hecho hecho) => AJson(hecho);

        public static string AJson(object valor)
        {
            var sb = new StringBuilder();
            using (var escritor = new EscritorComoJs(new StringWriter(sb))) Serializador.Serialize(escritor, valor);
            return sb.ToString();
        }

        public static RegistroLeido Leer(string contenido)
        {
            var r = new RegistroLeido();
            var lineas = contenido.Split('\n');
            var ultimoNoVacio = -1;
            for (var i = 0; i < lineas.Length; i++)
            {
                var linea = lineas[i];
                if (Js.Trim(linea).Length == 0) continue;
                ultimoNoVacio = i;
                var hecho = LeerLinea(linea);
                if (hecho != null) r.Hechos.Add(hecho);
                else r.LineasIlegibles.Add(new LineaIlegible { Numero = i + 1, Contenido = linea.Length > 200 ? linea.Substring(0, 200) : linea });
            }
            r.UltimaLineaIncompleta = r.LineasIlegibles.Count == 1 && r.LineasIlegibles[0].Numero == ultimoNoVacio + 1;
            return r;
        }

        static Hecho LeerLinea(string linea)
        {
            try
            {
                if (!(JsonEstricto.Leer(linea) is JObject objeto)) return null;
                var tipo = objeto["tipo"] as JValue;
                if (tipo == null || !Tipos.TryGetValue(Convert.ToString(tipo.Value, System.Globalization.CultureInfo.InvariantCulture), out var clase)) return null;
                return (Hecho)objeto.ToObject(clase, Serializador);
            }
            catch (Exception e) when (e is FormatException || e is JsonException)
            {
                return null;
            }
        }

        /// <summary>
        /// Escribe los textos exactamente como JSON.stringify: escapa comillas,
        /// barra, controles y surrogates sueltos; deja crudo todo lo demás (ñ,
        /// emoji, U+2028). Newtonsoft escapa U+2028 y deja crudo un surrogate
        /// suelto, que al pasar a UTF-8 se corrompe: sería perder dato.
        /// </summary>
        sealed class EscritorComoJs : JsonTextWriter
        {
            public EscritorComoJs(TextWriter salida) : base(salida) { }

            public override void WriteValue(string value)
            {
                if (value == null) WriteNull();
                else WriteRawValue(Escapar(value));
            }
        }

        static string Escapar(string s)
        {
            var sb = new StringBuilder(s.Length + 2).Append('"');
            for (var i = 0; i < s.Length; i++)
            {
                var c = s[i];
                switch (c)
                {
                    case '"': sb.Append('\\').Append('"'); break;
                    case '\\': sb.Append('\\').Append('\\'); break;
                    case '\b': sb.Append('\\').Append('b'); break;
                    case '\f': sb.Append('\\').Append('f'); break;
                    case '\n': sb.Append('\\').Append('n'); break;
                    case '\r': sb.Append('\\').Append('r'); break;
                    case '\t': sb.Append('\\').Append('t'); break;
                    default:
                        var suelto = char.IsHighSurrogate(c)
                            ? !(i + 1 < s.Length && char.IsLowSurrogate(s[i + 1]))
                            : char.IsLowSurrogate(c) && !(i > 0 && char.IsHighSurrogate(s[i - 1]));
                        if (c < ' ' || suelto) sb.Append('\\').Append('u').Append(((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }
            }
            return sb.Append('"').ToString();
        }
    }
}
