using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using ChatCouncil.Panel;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace ChatCouncil.Autoprueba
{
    /// <summary>
    /// Autoprueba del panel (punto de prueba 2 de la spec), dentro de la app compilada.
    /// Corre solo si el ejecutable recibe -autoprueba RUTA: escribe ahí una línea por comprobación
    /// y sale con 0 si todas pasan. Usa perfiles de prueba en una carpeta temporal, nunca los reales.
    /// </summary>
    public sealed class Autoprueba : MonoBehaviour
    {
        const string Host = "cc-prueba.test";
        const string Origen = "https://" + Host + "/";
        static readonly string[] Switches =
        {
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
            "--disable-background-timer-throttling",
        };

        // La spec mínima que el script de página necesita para un textarea (el mismo formato que specs.json).
        const string SpecTextarea =
            "{\"composer\":{\"selector\":\"#compositor\",\"kind\":\"textarea\"},\"escritura\":\"insertText\"," +
            "\"assistantMessage\":{\"selector\":\".respuesta\",\"pick\":\"last\"}," +
            "\"completion\":{\"kind\":\"quiescence\",\"quiescenceMs\":10000},\"version\":1}";

        string salida;
        readonly List<string> lineas = new List<string>();
        int pasadas, total;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Arrancar()
        {
            var args = Environment.GetCommandLineArgs();
            var i = Array.IndexOf(args, "-autoprueba");
            if (i < 0 || i + 1 >= args.Length) return;
            var go = new GameObject("Autoprueba");
            DontDestroyOnLoad(go);
            go.AddComponent<Autoprueba>().salida = args[i + 1];
        }

        async void Start()
        {
            var codigo = 1;
            try
            {
                await Correr();
                codigo = pasadas == total ? 0 : 1;
            }
            catch (Exception e)
            {
                Anotar(false, "autoprueba", "se cortó con una excepción: " + e);
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

        async Task Correr()
        {
            lineas.Add($"Autoprueba del panel, {DateTime.Now:yyyy-MM-dd HH:mm:ss}, {Application.platform}, {Application.version}");
            var datos = Path.Combine(Path.GetTempPath(), "cc-autoprueba-" + Guid.NewGuid().ToString("N"));
            await Paneles.Iniciar(datos, Host, Path.Combine(Application.streamingAssetsPath, "autoprueba"));
            Anotar(true, "entorno", "WebView2 " + Paneles.VersionDelNavegador);

            var a = await Paneles.Crear("prueba-a", Origen + "textarea.html");
            a.Rect(0, 0, 800, 600);
            a.Frente();

            // El perfil lo informa WebView2, no se repite el que se pidió.
            Anotar(a.Perfil == "prueba-a", "perfil", $"WebView2 dice \"{a.Perfil}\"");

            // Los tres switches de Electron, leídos por el sistema operativo en el proceso del navegador.
            var linea = Paneles.LineaDeComandosDelNavegador();
            var faltan = Switches.Where(s => !linea.Contains(s)).ToList();
            Anotar(faltan.Count == 0, "argumentos de no limitación",
                faltan.Count == 0 ? "los tres están en la línea de comandos del proceso del navegador" : "faltan: " + string.Join(", ", faltan) + " | línea: " + linea);

            // Escribir y leer por pedido y consulta, con saltos de línea, sin navegar.
            var navAntes = a.Navegaciones;
            var texto = "Primera línea con ñ y acentos: áéíóú\nSegunda línea\n\nCuarta, tras una vacía";
            var escrito = await a.Correr("escribir", SpecTextarea, texto);
            Anotar((bool?)escrito["ok"] == true, "escribir", escrito.ToString(Formatting.None));
            var leido = (string)await a.Correr("leerCompositor", SpecTextarea);
            Anotar(leido == texto, "leer el compositor", leido == texto ? $"{texto.Length} caracteres, idénticos" : "leyó: " + leido);
            var vacio = await a.Correr("chatVacio", SpecTextarea);
            Anotar((bool?)vacio == true, "chat vacío", vacio.ToString(Formatting.None));
            Anotar(a.Navegaciones == navAntes, "escribir no navega", $"navegaciones antes {navAntes}, después {a.Navegaciones}");

            // Contador de navegaciones: una navegación de verdad suma una.
            await a.Navegar(Origen + "cierre.html");
            Anotar(a.Navegaciones == navAntes + 1, "contador de navegaciones", $"antes {navAntes}, después de navegar {a.Navegaciones}");

            // Cierre de sesión: la navegación se cancela, el panel se queda donde estaba y no cuenta como navegación.
            foreach (var destino in new[] { "/logout", "/auth/sign-out?vuelta=1" })
            {
                var nav = a.Navegaciones;
                var bloqueadas = a.Bloqueadas;
                await a.Ejecutar($"location.href = '{destino}'; 'ok'");
                await Task.Delay(1500);
                var url = (string)JToken.Parse(await a.Ejecutar("location.pathname"));
                var ok = a.Bloqueadas == bloqueadas + 1 && a.Navegaciones == nav && url == "/cierre.html";
                Anotar(ok, "bloqueo de " + destino, $"bloqueadas {bloqueadas}→{a.Bloqueadas}, navegaciones {nav}→{a.Navegaciones}, página {url}, última bloqueada {a.UltimaBloqueada}");
            }

            // Navegar desde C# a un cierre de sesión no puede pasar por éxito: WebView2 da por terminada la cancelada.
            string aviso = null;
            try { await a.Navegar(Origen + "signout"); }
            catch (InvalidOperationException e) { aviso = e.Message; }
            Anotar(aviso != null, "navegar a un cierre de sesión avisa", aviso ?? "Navegar devolvió éxito");

            // Frente y detrás: dos paneles en el mismo rectángulo, medido con el orden real de las ventanas.
            var b = await Paneles.Crear("prueba-b", Origen + "textarea.html");
            b.Rect(0, 0, 800, 600);
            b.Frente();
            Anotar(b.EsFrente && !a.EsFrente, "frente", $"b al frente: {b.EsFrente}, a al frente: {a.EsFrente}");
            b.Atras();
            Anotar(a.EsFrente && !b.EsFrente, "detrás", $"después de mandar b atrás, a al frente: {a.EsFrente}");
            var r = a.RectReal;
            Anotar(r == (0, 0, 800, 600), "rectángulo", $"la ventana del panel mide {r}");

            a.Cerrar();
            b.Cerrar();
        }
    }
}
