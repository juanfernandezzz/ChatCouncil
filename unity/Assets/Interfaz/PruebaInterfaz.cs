using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using ChatCouncil.Motor;
using ChatCouncil.Panel;
using UnityEngine;
using UnityEngine.UIElements;

namespace ChatCouncil.Interfaz
{
    /// <summary>
    /// La verificación de T19 dentro de la app compilada: maneja los controles reales de la interfaz sobre una
    /// carpeta de datos de prueba (-datos), nunca la real, y páginas locales en lugar de los proveedores.
    /// Tres fases, cada una en un arranque distinto con la misma carpeta:
    /// 1, primer arranque: las combinaciones inválidas se rechazan con su texto y no escriben nada; una válida
    ///    escribe el archivo; la sesión se deduce del compositor; se siembra una ronda en el registro.
    /// 2, al reabrir: la Ronda usa el consejo guardado y restaura la ronda activa; un cambio en Ajustes se
    ///    guarda y no se aplica hasta reabrir.
    /// 3, al reabrir otra vez: el cambio quedó aplicado.
    /// Escribe una línea por comprobación en la ruta de -pruebainterfaz y sale con 0 si todas pasan.
    /// </summary>
    public sealed class PruebaInterfaz : MonoBehaviour
    {
        const string Host = "cc-prueba.test";

        /// <summary>chatgpt.html tiene el compositor de la spec de ChatGPT; popup.html no tiene ninguno.</summary>
        public static string Url(string id) => $"https://{Host}/" + (id == "chatgpt" ? "chatgpt.html" : "popup.html");

        public static Task IniciarNavegador(string carpetaDatos) =>
            Paneles.Iniciar(Path.Combine(carpetaDatos, "navegador"), Host, Path.Combine(Application.streamingAssetsPath, "autoprueba"));

        // El consejo válido de la fase 1: todos menos Mistral, Claude integra y redacta, Grok verifica.
        static readonly string[] Marcados = Roles.Conocidos.Where(id => id != "mistral").ToArray();
        static readonly string[] OperadoresEsperados = { "chatgpt", "gemini", "glm", "kimi", "qwen", "deepseek" };

        Aplicacion app;
        string salida;
        readonly List<string> lineas = new List<string>();
        int pasadas, total;

        public void Iniciar(Aplicacion app, string salida, int fase)
        {
            this.app = app;
            this.salida = salida;
            _ = Correr(fase);
        }

        async Task Correr(int fase)
        {
            var codigo = 1;
            lineas.Add($"Prueba de la interfaz (T19), fase {fase}, {DateTime.Now:yyyy-MM-dd HH:mm:ss}, {Application.platform}, {Application.version}");
            try
            {
                await Cuadros(10); // que se arme el diseño
                if (fase == 1) await Fase1();
                else if (fase == 2) await Fase2();
                else Fase3();
                codigo = pasadas == total ? 0 : 1;
            }
            catch (Exception e)
            {
                Anotar(false, "prueba", "se cortó con una excepción: " + e);
            }
            lineas.Add($"Resultado: {pasadas}/{total}");
            File.WriteAllLines(salida, lineas);
            Application.Quit(codigo);
        }

        void Anotar(bool ok, string nombre, string detalle)
        {
            total++;
            if (ok) pasadas++;
            lineas.Add($"{(ok ? "OK" : "FALLA")} {nombre}: {detalle}");
        }

        static async Task Cuadros(int n)
        {
            for (var i = 0; i < n; i++) await Task.Yield();
        }

        VisualElement Raiz => app.Raiz;
        VisualElement Config => app.Configuracion.Raiz;
        VisualElement Riel => Raiz.Q(className: "riel");
        string Seleccion => Path.Combine(app.CarpetaDatos, Roles.ArchivoSeleccion);
        static bool Visible(VisualElement e) => e.resolvedStyle.display == DisplayStyle.Flex;

        /// <summary>Como la tecla Enter o el toque sobre el botón: el mismo evento que atiende Button.</summary>
        static async Task Pulsar(VisualElement raiz, string nombre)
        {
            var boton = raiz.Q<Button>(nombre) ?? throw new InvalidOperationException("no está el botón " + nombre);
            using (var e = NavigationSubmitEvent.GetPooled())
            {
                e.target = boton;
                boton.SendEvent(e);
            }
            await Cuadros(3);
        }

        void Poner(IEnumerable<string> marcados, string integrador, string verificador, string redactor)
        {
            foreach (var id in Roles.Conocidos) Config.Q<Toggle>("marca-" + id).value = marcados.Contains(id);
            Config.Q<DropdownField>("integrador").index = Roles.Conocidos.ToList().IndexOf(integrador);
            Config.Q<DropdownField>("verificador").index = Roles.Conocidos.ToList().IndexOf(verificador);
            Config.Q<DropdownField>("redactor").index = Roles.Conocidos.ToList().IndexOf(redactor);
        }

        string Mensaje => Config.Q<Label>("mensaje").text;

        async Task<string> EsperarEstadoCuenta(string id)
        {
            var estado = Config.Q<Label>("estado-" + id);
            var limite = DateTime.UtcNow.AddSeconds(60);
            while (DateTime.UtcNow < limite)
            {
                var t = estado.text;
                if (t != "Sin comprobar" && t != "Abriendo la página…" && t != "Comprobando…") return t;
                await Task.Delay(200);
            }
            return estado.text;
        }

        List<string> FilasDeLaRonda() =>
            Raiz.Q<ScrollView>("lista").Query(className: "fila-panel").ToList().Select(f => f.name.Substring("fila-".Length)).ToList();

        // ---------------------------------------------------------------- fase 1

        async Task Fase1()
        {
            Anotar(!File.Exists(Seleccion) && Raiz.ClassListContains("primer-arranque") && Visible(Config) && !Visible(Riel),
                "primer arranque", $"sin archivo de selección arranca la guía, sin riel (sección visible: {(Visible(Config) ? "configuración" : "ronda")})");
            Anotar(Config.Q<Label>("paso-guia").text == "Paso 1 de 2: tu consejo" && !Visible(Config.Q("bloque-cuentas")), "paso 1", Config.Q<Label>("paso-guia").text);

            var invalidas = new (string[] Marcados, string I, string V, string R, string Error)[]
            {
                (new string[0], "deepseek", "glm", "deepseek", Roles.ErrorSeleccionVacia),
                (new[] { "chatgpt", "glm" }, "glm", "glm", "glm", Roles.ErrorRolesIguales),
                (new[] { "chatgpt", "glm" }, "deepseek", "glm", "deepseek", Roles.ErrorRolesDesmarcados),
                (new[] { "chatgpt", "deepseek", "glm" }, "deepseek", "glm", "glm", Roles.ErrorRedactorVerificador),
                (new[] { "chatgpt", "deepseek", "glm" }, "deepseek", "glm", "kimi", Roles.ErrorRedactorDesmarcado),
            };
            foreach (var c in invalidas)
            {
                Poner(c.Marcados, c.I, c.V, c.R);
                await Pulsar(Config, "guardar");
                var ok = Mensaje == c.Error && Config.Q("mensaje").ClassListContains("problema") && !File.Exists(Seleccion);
                Anotar(ok, "combinación inválida", $"[{string.Join(",", c.Marcados)}] {c.I}/{c.V}/{c.R}: \"{Mensaje}\"{(File.Exists(Seleccion) ? " y escribió el archivo" : "")}");
            }

            Poner(Marcados, "claude", "grok", "claude");
            await Pulsar(Config, "guardar");
            var contenido = File.Exists(Seleccion) ? File.ReadAllText(Seleccion, Encoding.UTF8) : null;
            var leidos = Roles.LeerSeleccion(contenido, Roles.Conocidos);
            var roles = Roles.Leer(contenido, Roles.Conocidos);
            Anotar(leidos != null && leidos.SequenceEqual(Marcados) && roles.Integrador == "claude" && roles.Verificador == "grok" && roles.Redactor == "claude" && Mensaje == "Guardado.",
                "combinación válida", $"\"{Mensaje}\"; archivo: {(contenido == null ? "no existe" : contenido.Replace("\n", " "))}");
            Anotar(Visible(Config.Q("bloque-cuentas")) && !Visible(Config.Q("bloque-consejo")), "paso 2", Config.Q<Label>("paso-guia").text);

            await Pulsar(Config, "entrar-chatgpt");
            var conSesion = await EsperarEstadoCuenta("chatgpt");
            Anotar(conSesion == "Sesión abierta", "sesión deducida, con compositor", conSesion);
            await Pulsar(Config, "volver");
            await Pulsar(Config, "entrar-glm");
            var sinSesion = await EsperarEstadoCuenta("glm");
            Anotar(sinSesion.StartsWith("Sin sesión", StringComparison.Ordinal), "sesión deducida, sin compositor", sinSesion);
            await Pulsar(Config, "volver");

            // Una ronda en el registro, para que el arranque siguiente la restaure.
            var puerta = new Puerta(app.CarpetaDatos, () => Guid.NewGuid().ToString(), () => DateTimeOffset.Now, leidos, roles, Roles.PoolDeInvestigadores(Roles.Conocidos, roles));
            puerta.AbrirRonda("Pregunta de prueba de T19");

            await Pulsar(Config, "empezar");
            await Cuadros(5);
            Anotar(Visible(Raiz.Q("seccion-ronda")) && !Raiz.ClassListContains("primer-arranque") && Visible(Riel), "fin de la guía", "la Ronda queda a la vista, con el riel");
            ComprobarRonda("ronda con el consejo recién guardado", OperadoresEsperados);
        }

        void ComprobarRonda(string nombre, string[] operadores)
        {
            var esperadas = operadores.Concat(new[] { "claude", "grok" }).ToList();
            var filas = FilasDeLaRonda();
            var integrador = Raiz.Q("fila-claude")?.Q<Label>(className: "fila-estado")?.text;
            Anotar(filas.SequenceEqual(esperadas) && integrador == "Integra y redacta", nombre, $"filas [{string.Join(",", filas)}], Claude: \"{integrador}\"");
        }

        // ---------------------------------------------------------------- fase 2

        async Task Fase2()
        {
            Anotar(!Raiz.ClassListContains("primer-arranque") && Visible(Raiz.Q("seccion-ronda")) && !Visible(Config), "reabrir", "con archivo de selección arranca en la Ronda, sin la guía");
            ComprobarRonda("el consejo guardado se aplica al reabrir", OperadoresEsperados);
            var titulo = Raiz.Q<Label>("barra-titulo").text;
            var paso = Raiz.Q<Button>("paso-ancha").text;
            Anotar(titulo == "Investigación · 2 de 7" && paso == "Capturar los que terminaron", "ronda activa restaurada", $"\"{titulo}\", \"{paso}\"");

            await Pulsar(Raiz, "ir-ajustes");
            var marcas = Roles.Conocidos.Where(id => Config.Q<Toggle>("marca-" + id).value).ToList();
            var i = Config.Q<DropdownField>("integrador").value;
            var v = Config.Q<DropdownField>("verificador").value;
            var r = Config.Q<DropdownField>("redactor").value;
            Anotar(Visible(Config) && marcas.SequenceEqual(Marcados) && i == "Claude" && v == "Grok" && r == "Claude", "ajustes con lo guardado", $"[{string.Join(",", marcas)}] {i}/{v}/{r}");
            Anotar(Visible(Config.Q("bloque-datos")) && Config.Q<TextField>("ruta-datos").value == app.CarpetaDatos, "carpeta de datos", Config.Q<TextField>("ruta-datos").value);

            Config.Q<Toggle>("marca-qwen").value = false;
            await Pulsar(Config, "guardar");
            Anotar(Mensaje == "Guardado. Se aplica la próxima vez que abras ChatCouncil.", "cambio guardado", Mensaje);
            await Pulsar(Raiz, "ir-ronda");
            ComprobarRonda("el cambio no se aplica antes de reabrir", OperadoresEsperados);
        }

        // ---------------------------------------------------------------- fase 3

        void Fase3() => ComprobarRonda("el cambio se aplica al reabrir", OperadoresEsperados.Where(id => id != "qwen").ToArray());
    }
}
