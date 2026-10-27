using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace ChatCouncil.Motor
{
    public sealed class RolesElegidos
    {
        public RolesElegidos(string integrador, string verificador1, string verificador2, string redactor)
        {
            Integrador = integrador;
            Verificador1 = verificador1;
            Verificador2 = verificador2;
            Redactor = redactor;
        }

        public string Integrador { get; }
        public string Verificador1 { get; }
        public string Verificador2 { get; }
        public string Redactor { get; }

        /// <summary>Los dos verificadores (D62), en orden: el 1 es el que recibe el redactor.</summary>
        public IReadOnlyList<string> Verificadores => new[] { Verificador1, Verificador2 };

        /// <summary>Los proveedores que trabajan en esa etapa de rol (el redactor también en el informe); ninguno en las de los operadores.</summary>
        public IReadOnlyList<string> DeLaEtapa(string etapa) =>
            etapa == "integracion" ? new[] { Integrador } : etapa == "verificacion" ? Verificadores
            : etapa == "redaccion" || etapa == "informe" ? new[] { Redactor } : new string[0];
    }

    /// <summary>
    /// Port de las reglas de seleccion-proveedores.ts: qué paneles se cargan y
    /// qué proveedor cumple cada rol. Puro sobre el contenido del archivo de
    /// selección (null si no existe): leerlo y escribirlo es de la app.
    /// </summary>
    public static class Roles
    {
        /// <summary>Los diez, en el orden de INVESTIGADORES (index.ts): el de la configuración y el del pool.</summary>
        public static readonly IReadOnlyList<string> Conocidos = new[] { "chatgpt", "gemini", "claude", "grok", "mistral", "glm", "kimi", "qwen", "deepseek", "perplexity" };

        /// <summary>El archivo aparte en la carpeta de datos, nunca el registro.</summary>
        public const string ArchivoSeleccion = "seleccion-proveedores.json";

        public const string IntegradorPorDefecto = "deepseek";
        /// <summary>Los verificadores de fuentes (D62: dos, que verifican lo mismo por separado), fuera del pool.</summary>
        public const string Verificador1PorDefecto = "glm";
        public const string Verificador2PorDefecto = "qwen";
        /// <summary>El integrador: si fuera otro, saldría un proveedor del pool de siete y los prompts ("siete") dejarían de cuadrar.</summary>
        public const string RedactorPorDefecto = "deepseek";

        public const string ErrorSeleccionVacia = "Tienes que marcar al menos un proveedor.";
        public const string ErrorVerificadoresIguales = "Los dos verificadores tienen que ser proveedores distintos.";
        public const string ErrorRolesIguales = "El integrador y los verificadores tienen que ser proveedores distintos.";
        public const string ErrorRolesDesmarcados = "El integrador y los verificadores tienen que estar entre los proveedores cargados.";
        public const string ErrorRedactorVerificador = "El redactor y los verificadores tienen que ser proveedores distintos.";
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
        /// proveedor conocido; si dos de integrador y verificadores quedaron iguales
        /// vuelven todos los defectos; un redactor ausente o igual a un verificador
        /// pasa a ser el integrador. Un archivo anterior a D62 trae "verificador": es el 1.
        /// </summary>
        public static RolesElegidos Leer(string contenido, IReadOnlyList<string> conocidos)
        {
            var defecto = new RolesElegidos(IntegradorPorDefecto, Verificador1PorDefecto, Verificador2PorDefecto, RedactorPorDefecto);
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
            // verificador1 ?? verificador de TypeScript: solo un null o un campo ausente pasan al viejo.
            var campo1 = o?["verificador1"] == null || o["verificador1"].Type == JTokenType.Null ? "verificador" : "verificador1";
            var integrador = Valido("integrador", IntegradorPorDefecto);
            var verificador1 = Valido(campo1, Verificador1PorDefecto);
            var verificador2 = Valido("verificador2", Verificador2PorDefecto);
            if (integrador == verificador1 || integrador == verificador2 || verificador1 == verificador2) return defecto;
            var redactor = Valido("redactor", integrador);
            return new RolesElegidos(integrador, verificador1, verificador2, redactor == verificador1 || redactor == verificador2 ? integrador : redactor);
        }

        /// <summary>El error que impide guardar esta selección, o null si se puede guardar.</summary>
        public static string ValidarSeleccion(IReadOnlyList<string> conocidos, IReadOnlyList<string> marcados, string integrador, string verificador1, string verificador2, string redactor)
        {
            var validos = conocidos.Where(marcados.Contains).ToList();
            if (validos.Count == 0) return ErrorSeleccionVacia;
            if (verificador1 == verificador2) return ErrorVerificadoresIguales;
            if (integrador == verificador1 || integrador == verificador2) return ErrorRolesIguales;
            if (!validos.Contains(integrador) || !validos.Contains(verificador1) || !validos.Contains(verificador2)) return ErrorRolesDesmarcados;
            if (redactor == verificador1 || redactor == verificador2) return ErrorRedactorVerificador;
            if (!validos.Contains(redactor)) return ErrorRedactorDesmarcado;
            return null;
        }

        /// <summary>El error que impide guardar, o el contenido del archivo de selección (guardarSeleccion de TypeScript, sin escribirlo).</summary>
        public static (string Error, string Contenido) Guardar(IReadOnlyList<string> conocidos, IReadOnlyList<string> marcados, string integrador, string verificador1, string verificador2, string redactor, string guardadoEn)
        {
            var error = ValidarSeleccion(conocidos, marcados, integrador, verificador1, verificador2, redactor);
            if (error != null) return (error, null);
            var contenido = new JObject
            {
                ["proveedores"] = new JArray(conocidos.Where(marcados.Contains)),
                ["integrador"] = integrador,
                ["verificador1"] = verificador1,
                ["verificador2"] = verificador2,
                ["redactor"] = redactor,
                ["guardadoEn"] = guardadoEn,
            };
            // JSON.stringify(..., null, 2): sangría de dos espacios y el mismo salto de línea en cualquier sistema.
            return (null, contenido.ToString(Newtonsoft.Json.Formatting.Indented).Replace("\r\n", "\n"));
        }

        /// <summary>El pool de investigadores y operadores: todos, en su orden, menos los roles.</summary>
        public static List<string> PoolDeInvestigadores(IReadOnlyList<string> todos, RolesElegidos roles) =>
            todos.Where(id => id != roles.Integrador && !roles.Verificadores.Contains(id) && id != roles.Redactor).ToList();
    }
}
