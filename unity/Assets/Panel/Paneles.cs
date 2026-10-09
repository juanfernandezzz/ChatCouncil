using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace ChatCouncil.Panel
{
    /// <summary>
    /// Los paneles de los proveedores sobre el plugin nativo de WebView2 (Windows).
    /// El plugin no llama a C#: todo es pedido y sondeo desde el hilo principal de Unity, que es
    /// el que bombea los mensajes de WebView2. Así no hay callbacks de nativo a managed bajo IL2CPP.
    /// </summary>
    public static class Paneles
    {
        // Los tres switches de Electron (apps/desktop/src/main/index.ts): un panel detrás u ocluido
        // sigue ejecutando JS y temporizadores como si estuviera al frente. El user agent no se toca.
        const string Argumentos = "--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling";
        const int EsperaMs = 30_000;

        /// <summary>Inicia WebView2 con una carpeta de datos (un perfil por proveedor adentro). Si se pasa host, sirve esa carpeta en https://host/.</summary>
        public static async Task Iniciar(string carpetaDatos, string host = null, string carpetaHost = null)
        {
            Directory.CreateDirectory(carpetaDatos);
            Nativo.Comprobar(Nativo.CC_Iniciar(carpetaDatos, Argumentos, host, carpetaHost), "iniciar WebView2");
            await Esperar(() => Nativo.CC_EstadoEntorno(), "iniciar WebView2", 0);
        }

        public static string VersionDelNavegador => Nativo.Texto(Nativo.TextoVersion, 0);

        /// <summary>La línea de comandos del proceso del navegador, leída del sistema operativo.</summary>
        public static string LineaDeComandosDelNavegador() => Nativo.Texto(Nativo.TextoLineaDeComandos, 0);

        public static async Task<Panel> Crear(string perfil, string url)
        {
            var id = Nativo.CC_Crear(perfil, url);
            Nativo.Comprobar(id, "crear el panel " + perfil);
            await Esperar(() => Nativo.CC_EstadoPanel(id), "crear el panel " + perfil, id);
            // Listo es con su URL inicial cargada: si no, el contador y la primera navegación del llamador se cruzan con ella.
            await Esperar(() => Nativo.CC_Contador(id, 2) >= 1 ? 1 : 0, "cargar " + url, id);
            return new Panel(id);
        }

        /// <summary>Espera a que un estado nativo pase de 0 (pendiente) a 1 (listo); negativo es error.</summary>
        internal static async Task Esperar(Func<int> estado, string que, int id)
        {
            var reloj = Stopwatch.StartNew();
            for (;;)
            {
                var e = estado();
                if (e == 1) return;
                if (e < 0) throw new InvalidOperationException($"No se pudo {que}: {Nativo.Texto(Nativo.TextoError, id)}");
                if (reloj.ElapsedMilliseconds > EsperaMs) throw new TimeoutException($"No se pudo {que}: sin respuesta en {EsperaMs / 1000} s.");
                await Task.Yield();
            }
        }
    }

    public sealed class Panel
    {
        readonly int id;
        static int siguientePedido;

        internal Panel(int id) => this.id = id;

        /// <summary>El perfil según WebView2, no el nombre que se pidió.</summary>
        public string Perfil => Nativo.Texto(Nativo.TextoPerfil, id);
        /// <summary>Navegaciones del marco principal que empezaron (las bloqueadas no cuentan).</summary>
        public int Navegaciones => Nativo.CC_Contador(id, 0);
        /// <summary>Navegaciones canceladas por ir a un cierre de sesión.</summary>
        public int Bloqueadas => Nativo.CC_Contador(id, 1);
        public string UltimaBloqueada => Nativo.Texto(Nativo.TextoUltimaBloqueada, id);

        public void Rect(int x, int y, int ancho, int alto) => Nativo.CC_Rect(id, x, y, ancho, alto);
        public void Frente() => Nativo.CC_Frente(id);
        public void Atras() => Nativo.CC_Atras(id);
        public bool EsFrente => Nativo.CC_EsFrente(id) == 1;

        public (int x, int y, int ancho, int alto) RectReal
        {
            get
            {
                Nativo.CC_RectReal(id, out var x, out var y, out var w, out var h);
                return (x, y, w, h);
            }
        }

        /// <summary>Navega y espera a que la navegación termine.</summary>
        public async Task Navegar(string url)
        {
            var terminadas = Nativo.CC_Contador(id, 2);
            var bloqueadas = Bloqueadas;
            Nativo.Comprobar(Nativo.CC_Navegar(id, url), "navegar a " + url);
            await Paneles.Esperar(() => Nativo.CC_Contador(id, 2) > terminadas ? 1 : 0, "navegar a " + url, id);
            // WebView2 da por terminada también la navegación cancelada: sin esto, una bloqueada pasaría por éxito.
            if (Bloqueadas > bloqueadas) throw new InvalidOperationException($"La navegación a {url} se bloqueó: es un cierre de sesión.");
        }

        /// <summary>Ejecuta un script en el marco principal y devuelve su resultado como JSON.</summary>
        public async Task<string> Ejecutar(string script)
        {
            var ticket = Nativo.CC_Ejecutar(id, script);
            Nativo.Comprobar(ticket, "ejecutar un script");
            string resultado = null;
            await Paneles.Esperar(() => (resultado = Nativo.Resultado(ticket)) == null ? 0 : 1, "ejecutar un script", id);
            return resultado;
        }

        /// <summary>
        /// Una operación del script de página (pagina.js) por pedido y consulta. Lo inyecta si la página
        /// no lo tiene, porque las páginas navegan y recargan.
        /// </summary>
        public async Task<JToken> Correr(string op, string specJson, string texto = null, int esperaMs = 30_000)
        {
            if ((string)JToken.Parse(await Ejecutar("typeof window.__cc")) != "object")
                await Ejecutar(File.ReadAllText(Path.Combine(Application.streamingAssetsPath, "pagina.js")) + "\n;'ok'");

            var pedido = new JObject { ["id"] = (++siguientePedido).ToString(), ["op"] = op, ["spec"] = JToken.Parse(specJson) };
            if (texto != null) pedido["texto"] = texto;
            var r = (string)JToken.Parse(await Ejecutar("window.__cc.pedir(" + JsonConvert.ToString(pedido.ToString(Formatting.None)) + ")"));
            if (r != "ok") throw new InvalidOperationException($"pagina.js rechazó el pedido {op}: {r}");

            var reloj = Stopwatch.StartNew();
            for (;;)
            {
                var estado = JObject.Parse((string)JToken.Parse(await Ejecutar("window.__cc.consultar(" + JsonConvert.ToString((string)pedido["id"]) + ")")));
                switch ((string)estado["estado"])
                {
                    case "listo": return estado["resultado"];
                    case "error": throw new InvalidOperationException($"pagina.js, {op}: {estado["error"]}");
                }
                if (reloj.ElapsedMilliseconds > esperaMs) throw new TimeoutException($"pagina.js, {op}: sin resultado en {esperaMs / 1000} s.");
                await Task.Delay(100);
            }
        }

        public void Cerrar() => Nativo.CC_Cerrar(id);
    }

    /// <summary>El plugin ChatCouncilPanel.dll (panel/windows). Todas las funciones se llaman desde el hilo principal.</summary>
    static class Nativo
    {
        const string Dll = "ChatCouncilPanel";
        internal const int TextoVersion = 1, TextoLineaDeComandos = 2, TextoPerfil = 3, TextoUltimaBloqueada = 4, TextoError = 5;

        [DllImport(Dll, CharSet = CharSet.Unicode)] internal static extern int CC_Iniciar(string carpetaDatos, string argumentos, string host, string carpetaHost);
        [DllImport(Dll)] internal static extern int CC_EstadoEntorno();
        [DllImport(Dll, CharSet = CharSet.Unicode)] internal static extern int CC_Crear(string perfil, string url);
        [DllImport(Dll)] internal static extern int CC_EstadoPanel(int id);
        [DllImport(Dll)] internal static extern void CC_Rect(int id, int x, int y, int ancho, int alto);
        [DllImport(Dll)] internal static extern void CC_Frente(int id);
        [DllImport(Dll)] internal static extern void CC_Atras(int id);
        [DllImport(Dll)] internal static extern int CC_EsFrente(int id);
        [DllImport(Dll)] internal static extern void CC_RectReal(int id, out int x, out int y, out int ancho, out int alto);
        [DllImport(Dll, CharSet = CharSet.Unicode)] internal static extern int CC_Navegar(int id, string url);
        [DllImport(Dll)] internal static extern int CC_Contador(int id, int cual);
        [DllImport(Dll, CharSet = CharSet.Unicode)] internal static extern int CC_Ejecutar(int id, string script);
        [DllImport(Dll, CharSet = CharSet.Unicode)] static extern int CC_Resultado(int ticket, [Out] char[] destino, int capacidad);
        [DllImport(Dll, CharSet = CharSet.Unicode)] static extern int CC_Texto(int cual, int id, [Out] char[] destino, int capacidad);
        [DllImport(Dll)] internal static extern void CC_Cerrar(int id);

        /// <summary>Un código negativo es un error del plugin, con su mensaje en CC_Texto(TextoError).</summary>
        internal static void Comprobar(int codigo, string que)
        {
            if (codigo < 0) throw new InvalidOperationException($"No se pudo {que}: {Texto(TextoError, 0)}");
        }

        /// <summary>Texto del plugin: la primera llamada pide el largo, la segunda copia.</summary>
        internal static string Texto(int cual, int id)
        {
            var largo = CC_Texto(cual, id, null, 0);
            if (largo <= 0) return "";
            var d = new char[largo];
            CC_Texto(cual, id, d, largo);
            return new string(d);
        }

        /// <summary>El resultado de un script, o null si sigue pendiente. El plugin lo olvida al copiarlo.</summary>
        internal static string Resultado(int ticket)
        {
            var largo = CC_Resultado(ticket, null, 0);
            if (largo == -1) return null;
            if (largo < 0) throw new InvalidOperationException("Resultado de script desconocido: " + ticket);
            var d = new char[largo];
            CC_Resultado(ticket, d, largo);
            return new string(d);
        }
    }
}
