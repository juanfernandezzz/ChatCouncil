using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace ChatCouncil.Motor
{
    public sealed class RolesElegidos
    {
        public RolesElegidos(string integrador, string verificador, string redactor)
        {
            Integrador = integrador;
            Verificador = verificador;
            Redactor = redactor;
        }

        public string Integrador { get; }
        public string Verificador { get; }
        public string Redactor { get; }
    }

    /// <summary>
    /// Port de las reglas de seleccion-proveedores.ts: qué paneles se cargan y
    /// qué proveedor cumple cada rol. Puro sobre el contenido del archivo de
    /// selección (null si no existe): leerlo y escribirlo es de la app.
    /// </summary>
    public static class Roles
    {
        /// <summary>Los nueve, en el orden de INVESTIGADORES (index.ts): el de la configuración y el del pool.</summary>
        public static readonly IReadOnlyList<string> Conocidos = new[] { "chatgpt", "gemini", "claude", "grok", "mistral", "glm", "kimi", "qwen", "deepseek" };

        /// <summary>El archivo aparte en la carpeta de datos, nunca el registro.</summary>
        public const string ArchivoSeleccion = "seleccion-proveedores.json";

        public const string IntegradorPorDefecto = "deepseek";
        /// <summary>El verificador de fuentes, tercer rol fuera del pool.</summary>
        public const string VerificadorPorDefecto = "glm";
        /// <summary>El integrador: si fuera otro, saldría un proveedor del pool de siete y los prompts ("siete") dejarían de cuadrar.</summary>
        public const string RedactorPorDefecto = "deepseek";

        public const string ErrorSeleccionVacia = "Tienes que marcar al menos un proveedor.";
        public const string ErrorRolesIguales = "El integrador y el verificador tienen que ser proveedores distintos.";
        public const string ErrorRolesDesmarcados = "El integrador y el verificador tienen que estar entre los proveedores cargados.";
        public const string ErrorRedactorVerificador = "El redactor y el verificador tienen que ser proveedores distintos.";
        public const string ErrorRedactorDesmarcado = "El redactor tiene que estar entre los proveedores cargados.";

        static JObject LeerObjeto(string contenido)
        {
            if (contenido == null) return null;
            try
            {
                return JsonEstricto.Leer(contenido) as JObject;
            }
            catch (FormatException)
            {
                return null;
            }
        }

        /// <summary>Los proveedores guardados, en el orden de "conocidos"; null si no hay archivo, es ilegible o no queda ninguno: se cargan todos.</summary>
        public static List<string> LeerSeleccion(string contenido, IReadOnlyList<string> conocidos)
        {
            if (!(LeerObjeto(contenido)?["proveedores"] is JArray proveedores)) return null;
            var validos = conocidos.Where(id => proveedores.Any(p => p.Type == JTokenType.String && (string)p == id)).ToList();
            return validos.Count > 0 ? validos : null;
        }

        /// <summary>
        /// Los roles guardados. Cada uno cae a su defecto si falta o no es un
        /// proveedor conocido; si integrador y verificador quedaron iguales vuelven
        /// los tres defectos; un redactor ausente o igual al verificador pasa a ser
        /// el integrador.
        /// </summary>
        public static RolesElegidos Leer(string contenido, IReadOnlyList<string> conocidos)
        {
            var defecto = new RolesElegidos(IntegradorPorDefecto, VerificadorPorDefecto, RedactorPorDefecto);
            if (contenido == null) return defecto;
            JToken json;
            try
            {
                json = JsonEstricto.Leer(contenido);
            }
            catch (FormatException)
            {
                return defecto;
            }
            // JSON.parse("null") deja que la desestructuración tire: vuelven los defectos.
            if (json.Type == JTokenType.Null) return defecto;
            var o = json as JObject;
            string Valido(string campo, string porDefecto) =>
                o?[campo] is JValue v && v.Type == JTokenType.String && conocidos.Contains((string)v) ? (string)v : porDefecto;
            var integrador = Valido("integrador", IntegradorPorDefecto);
            var verificador = Valido("verificador", VerificadorPorDefecto);
            if (integrador == verificador) return defecto;
            var redactor = Valido("redactor", integrador);
            return new RolesElegidos(integrador, verificador, redactor == verificador ? integrador : redactor);
        }

        /// <summary>El error que impide guardar esta selección, o null si se puede guardar.</summary>
        public static string ValidarSeleccion(IReadOnlyList<string> conocidos, IReadOnlyList<string> marcados, string integrador, string verificador, string redactor)
        {
            var validos = conocidos.Where(marcados.Contains).ToList();
            if (validos.Count == 0) return ErrorSeleccionVacia;
            if (integrador == verificador) return ErrorRolesIguales;
            if (!validos.Contains(integrador) || !validos.Contains(verificador)) return ErrorRolesDesmarcados;
            if (redactor == verificador) return ErrorRedactorVerificador;
            if (!validos.Contains(redactor)) return ErrorRedactorDesmarcado;
            return null;
        }

        /// <summary>El error que impide guardar, o el contenido del archivo de selección (guardarSeleccion de TypeScript, sin escribirlo).</summary>
        public static (string Error, string Contenido) Guardar(IReadOnlyList<string> conocidos, IReadOnlyList<string> marcados, string integrador, string verificador, string redactor, string guardadoEn)
        {
            var error = ValidarSeleccion(conocidos, marcados, integrador, verificador, redactor);
            if (error != null) return (error, null);
            var contenido = new JObject
            {
                ["proveedores"] = new JArray(conocidos.Where(marcados.Contains)),
                ["integrador"] = integrador,
                ["verificador"] = verificador,
                ["redactor"] = redactor,
                ["guardadoEn"] = guardadoEn,
            };
            // JSON.stringify(..., null, 2): sangría de dos espacios y el mismo salto de línea en cualquier sistema.
            return (null, contenido.ToString(Newtonsoft.Json.Formatting.Indented).Replace("\r\n", "\n"));
        }

        /// <summary>El pool de investigadores y operadores: todos, en su orden, menos los tres roles.</summary>
        public static List<string> PoolDeInvestigadores(IReadOnlyList<string> todos, RolesElegidos roles) =>
            todos.Where(id => id != roles.Integrador && id != roles.Verificador && id != roles.Redactor).ToList();
    }
}
