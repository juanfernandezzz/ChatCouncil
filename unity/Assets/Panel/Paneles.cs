using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using ChatCouncil.Motor;
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
        internal const int EsperaMs = 30_000;

        /// <summary>
        /// Inicia WebView2 con una carpeta de datos (un perfil por proveedor adentro). Si se pasan hosts
        /// (separados por ';'), cada uno sirve la carpeta en https://host/.
        /// </summary>
        public static async Task Iniciar(string carpetaDatos, string hosts = null, string carpetaHost = null)
        {
            Directory.CreateDirectory(carpetaDatos);
            Nativo.Comprobar(Nativo.CC_Iniciar(carpetaDatos, Argumentos, hosts, carpetaHost), "iniciar WebView2");
            await Esperar(() => Nativo.CC_EstadoEntorno(), "iniciar WebView2", 0);
        }

        public static string VersionDelNavegador => Nativo.Texto(Nativo.TextoVersion, 0);

        /// <summary>La línea de comandos del proceso del navegador, leída del sistema operativo.</summary>
        public static string LineaDeComandosDelNavegador() => Nativo.Texto(Nativo.TextoLineaDeComandos, 0);

        public static async Task<Panel> Crear(string perfil, string url)
        {
            var id = Nativo.CC_Crear(perfil, url);
            Nativo.Comprobar(id, "crear el panel " + perfil);
            var panel = new Panel(id);
            await panel.EsperarCarga();
            return panel;
        }

        /// <summary>Espera a que un estado nativo pase de 0 (pendiente) a 1 (listo); negativo es error. Al pasar el techo, TimeoutException.</summary>
        internal static async Task Esperar(Func<int> estado, string que, int id, int techoMs = EsperaMs)
        {
            var reloj = Stopwatch.StartNew();
            for (;;)
            {
                var e = estado();
                if (e == 1) return;
                if (e < 0) throw new InvalidOperationException($"No se pudo {que}: {Nativo.Texto(Nativo.TextoError, id)}");
                if (reloj.ElapsedMilliseconds > techoMs) throw new TimeoutException($"No se pudo {que}: sin respuesta en {techoMs / 1000.0:0.#} s.");
                await Task.Yield();
            }
        }
    }

    public sealed class Panel
    {
        /// <summary>El techo externo sobre todo script, fuera del hilo de la página (spec: 90 s).</summary>
        public const int TechoMs = 90_000;

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
        /// <summary>false cuando el panel se cerró (también una emergente con window.close()).</summary>
        public bool Abierto => Nativo.CC_EstadoPanel(id) == 1;

        /// <summary>La última ventana emergente que abrió este panel (window.open), en su mismo perfil; null si no abrió ninguna.</summary>
        public Panel Emergente
        {
            get
            {
                var e = Nativo.CC_Contador(id, 3);
                return e > 0 ? new Panel(e) : null;
            }
        }

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

        /// <summary>Listo es con su primera página cargada: si no, el contador y la primera navegación del llamador se cruzan con ella.</summary>
        public async Task EsperarCarga()
        {
            await Paneles.Esperar(() => Nativo.CC_EstadoPanel(id), "crear el panel", id);
            await Paneles.Esperar(() => Nativo.CC_Contador(id, 2) >= 1 ? 1 : 0, "cargar la primera página", id);
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

        /// <summary>
        /// Ejecuta un script en el marco principal y devuelve su resultado como JSON. Un panel colgado corta en el techo.
        /// Medido en T16: si el resultado trae un surrogate suelto, ExecuteScript no devuelve nada nunca. Todo script que
        /// devuelva texto de la página lo pasa por JSON.stringify en la página (como pagina.js) y se lee con JsonEstricto,
        /// porque Newtonsoft cambia el surrogate suelto por U+FFFD.
        /// </summary>
        public Task<string> Ejecutar(string script, int techoMs = TechoMs) =>
            Esperar(Nativo.CC_Ejecutar(id, script), "ejecutar un script", techoMs);

        /// <summary>Un método del protocolo de DevTools sobre este panel; devuelve el JSON de la respuesta.</summary>
        public Task<string> DevTools(string metodo, string parametrosJson) =>
            Esperar(Nativo.CC_DevTools(id, metodo, parametrosJson), "llamar a DevTools " + metodo, TechoMs);

        /// <summary>
        /// Adjunta un archivo al &lt;input type=file&gt; del compositor por DevTools, sin abrir el selector.
        /// pagina.js elige y marca el input; DOM.setFileInputFiles lo carga como si la persona lo hubiera elegido.
        /// </summary>
        public async Task Adjuntar(string specJson, string ruta)
        {
            var input = await Correr("inputArchivo", specJson);
            if ((bool?)input["encontrado"] != true) throw new InvalidOperationException("No hay un <input type=file> en la página: no se puede adjuntar.");
            var raiz = JObject.Parse(await DevTools("DOM.getDocument", "{\"depth\":0}"));
            var nodo = JObject.Parse(await DevTools("DOM.querySelector", new JObject { ["nodeId"] = raiz["root"]["nodeId"], ["selector"] = input["selector"] }.ToString(Formatting.None)));
            if ((int)nodo["nodeId"] == 0) throw new InvalidOperationException("DevTools no encontró el input que marcó pagina.js.");
            await DevTools("DOM.setFileInputFiles", new JObject { ["nodeId"] = nodo["nodeId"], ["files"] = new JArray(Path.GetFullPath(ruta)) }.ToString(Formatting.None));
        }

        /// <summary>Imprime la página actual a PDF con la impresión nativa de WebView2.</summary>
        public async Task ImprimirPdf(string ruta)
        {
            if (await Esperar(Nativo.CC_Pdf(id, Path.GetFullPath(ruta)), "imprimir a PDF", TechoMs) != "true")
                throw new InvalidOperationException("WebView2 no pudo imprimir el PDF en " + ruta);
        }

        /// <summary>Borra todos los datos de navegación del perfil de este panel (cookies, almacenamiento, caché).</summary>
        public Task BorrarDatos() => Esperar(Nativo.CC_Borrar(id), "borrar los datos del perfil", TechoMs);

        /// <summary>
        /// El informe que un proveedor deja en un iframe de otro origen (spec.informeEnIframe): el script corre en el
        /// último iframe cuya URL contiene frameUrl y en los about:blank que tenga adentro. Sólo lee.
        /// Port de completarInformeEnIframe (apps/desktop/src/main/index.ts). null si no está.
        /// </summary>
        public async Task<JToken> LeerInformeEnIframe(string specJson)
        {
            var cfg = JObject.Parse(specJson)["informeEnIframe"];
            if (cfg == null) return null;
            // El resultado sale por JSON.stringify en la página, como en pagina.js: escapa los surrogates sueltos en ASCII.
            var fuente = "JSON.stringify((() => { const docs = [document]; for (const f of document.querySelectorAll('iframe')) { try { if (f.contentDocument) docs.push(f.contentDocument); } catch (e) {} } " +
                         "for (const d of docs) { const el = Array.from(d.querySelectorAll(" + JsonConvert.ToString((string)cfg["contenido"]) + ")).pop(); if (!el) continue; " +
                         "const c = el.cloneNode(true); c.querySelectorAll('style, script').forEach((n) => n.remove()); const t = c.textContent || ''; " +
                         "if (t.trim().length > 0) return { texto: t, html: el.outerHTML }; } return null; })())";
            var ticket = Nativo.CC_EjecutarEnIframe(id, (string)cfg["frameUrl"], fuente);
            if (ticket < 0) return null; // no hay un iframe con esa URL
            var r = JsonEstricto.Leer((string)JsonEstricto.Leer(await Esperar(ticket, "leer el iframe", TechoMs)));
            return r.Type == JTokenType.Null ? null : r;
        }

        /// <summary>
        /// Una operación del script de página (pagina.js) por pedido y consulta. Lo inyecta si la página
        /// no lo tiene, porque las páginas navegan y recargan.
        /// </summary>
        public async Task<JToken> Correr(string op, string specJson, string texto = null, int esperaMs = 30_000)
        {
            if ((string)JsonEstricto.Leer(await Ejecutar("typeof window.__cc")) != "object")
                await Ejecutar(File.ReadAllText(Path.Combine(Application.streamingAssetsPath, "pagina.js")) + "\n;'ok'");

            var pedido = new JObject { ["id"] = (++siguientePedido).ToString(), ["op"] = op, ["spec"] = JToken.Parse(specJson) };
            if (texto != null) pedido["texto"] = texto;
            var r = (string)JsonEstricto.Leer(await Ejecutar("window.__cc.pedir(" + JsonConvert.ToString(pedido.ToString(Formatting.None)) + ")"));
            if (r != "ok") throw new InvalidOperationException($"pagina.js rechazó el pedido {op}: {r}");

            var reloj = Stopwatch.StartNew();
            for (;;)
            {
                var estado = (JObject)JsonEstricto.Leer((string)JsonEstricto.Leer(await Ejecutar("window.__cc.consultar(" + JsonConvert.ToString((string)pedido["id"]) + ")")));
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

        /// <summary>Espera el resultado de un ticket del plugin. Si pasa el techo, el plugin lo olvida y lanza TimeoutException.</summary>
        async Task<string> Esperar(int ticket, string que, int techoMs)
        {
            Nativo.Comprobar(ticket, que);
            string resultado = null;
            try
            {
                await Paneles.Esperar(() => (resultado = Nativo.Resultado(ticket)) == null ? 0 : 1, que, id, techoMs);
            }
            catch (TimeoutException)
            {
                Nativo.CC_Olvidar(ticket);
                throw;
            }
            // Un fallo de la llamada nativa viene como {"__error": "..."}: no se entrega como si fuera un resultado.
            if (resultado.StartsWith("{\"__error\"")) throw new InvalidOperationException($"No se pudo {que}: {JObject.Parse(resultado)["__error"]}");
            return resultado;
        }
    }

    /// <summary>El plugin ChatCouncilPanel.dll (panel/windows). Todas las funciones se llaman desde el hilo principal.</summary>
    static class Nativo
    {
        const string Dll = "ChatCouncilPanel";
        internal const int TextoVersion = 1, TextoLineaDeComandos = 2, TextoPerfil = 3, TextoUltimaBloqueada = 4, TextoError = 5;

        [DllImport(Dll, CharSet = CharSet.Unicode)] internal static extern int CC_Iniciar(string carpetaDatos, string argumentos, string hosts, string carpetaHost);
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
        [DllImport(Dll, CharSet = CharSet.Unicode)] internal static extern int CC_EjecutarEnIframe(int id, string urlContiene, string script);
        [DllImport(Dll, CharSet = CharSet.Unicode)] internal static extern int CC_DevTools(int id, string metodo, string parametrosJson);
        [DllImport(Dll, CharSet = CharSet.Unicode)] internal static extern int CC_Pdf(int id, string ruta);
        [DllImport(Dll)] internal static extern int CC_Borrar(int id);
        [DllImport(Dll)] internal static extern void CC_Olvidar(int ticket);
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

        /// <summary>El resultado de un ticket, o null si sigue pendiente. El plugin lo olvida al copiarlo.</summary>
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
