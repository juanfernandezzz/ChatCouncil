using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using ChatCouncil.Motor;
using ChatCouncil.Panel;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace ChatCouncil.Autoprueba
{
    // Dentro de ChatCouncil.*, "Panel" sería el namespace ChatCouncil.Panel y no la clase.
    using Panel = ChatCouncil.Panel.Panel;

    /// <summary>
    /// Autoprueba del panel (punto de prueba 2 de la spec), dentro de la app compilada.
    /// Corre solo si el ejecutable recibe -autoprueba RUTA: escribe ahí una línea por comprobación
    /// y sale con 0 si todas pasan. Usa perfiles de prueba en una carpeta temporal, nunca los reales,
    /// y las specs reales de specs.json (Datos.Specs) sobre páginas locales que imitan su estructura.
    /// </summary>
    public sealed class Autoprueba : MonoBehaviour
    {
        const string Host = "cc-prueba.test";
        const string Origen = "https://" + Host + "/";
        // Segundo origen, para el iframe de otro origen: sirve la misma carpeta.
        const string OtroHost = "cc-otro.test";
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

        /// <summary>Un grupo de comprobaciones: si lanza, queda como FALLA y los demás grupos siguen.</summary>
        async Task Grupo(string nombre, Func<Task> cuerpo)
        {
            try { await cuerpo(); }
            catch (Exception e) { Anotar(false, nombre, "se cortó con una excepción: " + e.GetType().Name + ": " + e.Message); }
        }

        static string Spec(string proveedor) => JObject.Parse(Datos.Specs)["specs"][proveedor].ToString(Formatting.None);

        async Task Correr()
        {
            lineas.Add($"Autoprueba del panel, {DateTime.Now:yyyy-MM-dd HH:mm:ss}, {Application.platform}, {Application.version}");
            var datos = Path.Combine(Path.GetTempPath(), "cc-autoprueba-" + Guid.NewGuid().ToString("N"));
            await Paneles.Iniciar(datos, Host + ";" + OtroHost, Path.Combine(Application.streamingAssetsPath, "autoprueba"));
            Anotar(true, "entorno", "WebView2 " + Paneles.VersionDelNavegador);

            var a = await Paneles.Crear("prueba-a", Origen + "textarea.html");
            a.Rect(0, 0, 800, 600);
            a.Frente();

            await Grupo("panel", () => PanelBasico(a));
            await Grupo("escritura", Escritura);
            await Grupo("lectura", Lectura);
            await Grupo("iframe de otro origen", IframeDeOtroOrigen);
            await Grupo("adjunto", Adjunto);
            await Grupo("pdf", Pdf);
            await Grupo("perfiles", () => Perfiles(a));
            await Grupo("techo externo", () => TechoExterno(a));
        }

        // ---------------------------------------------------------------- T15: crear, mostrar, ejecutar

        async Task PanelBasico(Panel a)
        {
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
            b.Cerrar();
        }

        // ---------------------------------------------------------------- T16: el script de página, medido

        async Task Escritura()
        {
            var texto = "Línea uno, con ñ: áéíóú ü\nLínea dos\n\nLínea cuatro, tras una vacía\n  sangría de dos espacios";

            // chatgpt: contenteditable con insertText (una línea por vez, con salto suave).
            var c = await Paneles.Crear("prueba-e1", Origen + "chatgpt.html");
            var spec = Spec("chatgpt");
            var e = await c.Correr("escribir", spec, texto);
            var leido = (string)await c.Correr("leerCompositor", spec);
            Anotar((bool?)e["ok"] == true && leido == texto, "escritura insertText en contenteditable (spec chatgpt)", leido == texto ? $"{texto.Length} caracteres, idénticos" : "leyó: " + leido);
            c.Cerrar();

            // mistral: ProseMirror, un párrafo por línea.
            var m = await Paneles.Crear("prueba-e2", Origen + "mistral.html");
            spec = Spec("mistral");
            e = await m.Correr("escribir", spec, texto);
            leido = (string)await m.Correr("leerCompositor", spec);
            Anotar((bool?)e["ok"] == true && leido == texto, "escritura por párrafos (spec mistral)", leido == texto ? $"{texto.Length} caracteres, idénticos" : "leyó: " + leido);
            m.Cerrar();

            // kimi: editor que procesa el pegado él mismo. 180.000 caracteres con las marcas del motor.
            var k = await Paneles.Crear("prueba-e3", Origen + "kimi.html");
            spec = Spec("kimi");
            var cuerpo = new StringBuilder();
            for (var i = 0; cuerpo.Length < 180_000; i++)
                cuerpo.Append($"Línea {i:D5}: el cuerpo de prueba lleva ñ, acentos (áéíóú) y comillas \"dobles\".").Append(i % 17 == 16 ? "\n\n" : "\n");
            var (conMarcas, marcas) = Cuerpos.InsertarMarcasIntercaladas(cuerpo.ToString(), "autoprueba");
            var reloj = Stopwatch.StartNew();
            e = await k.Correr("escribir", spec, conMarcas, esperaMs: 120_000);
            leido = (string)await k.Correr("leerCompositor", spec);
            var integridad = Cuerpos.EvaluarIntegridad(leido ?? "", marcas);
            Anotar((bool?)e["ok"] == true && leido == conMarcas && integridad.Estado == "completo",
                "pegado de 180.000 caracteres con marcas (spec kimi)",
                $"{conMarcas.Length} caracteres, {marcas.Count} marcas, integridad {integridad.Estado} ({integridad.MarcasPresentes}/{integridad.MarcasEsperadas}), " +
                $"idéntico: {leido == conMarcas}, leídos {leido?.Length ?? 0}, {reloj.ElapsedMilliseconds} ms");
            k.Cerrar();
        }

        async Task Lectura()
        {
            // chatgpt: mensaje de usuario, enlaces de fuente, informe en iframe, generando (está el botón de detener).
            var c = await Paneles.Crear("prueba-l1", Origen + "chatgpt.html");
            var spec = Spec("chatgpt");
            Anotar((bool?)await c.Correr("chatVacio", spec) == false, "chat con mensajes no está vacío", "chatVacio = false");
            var l = await c.Correr("leer", spec);
            Anotar((string)l["userText"] == "Pregunta de prueba" && (int)l["fuentesHref"] == 2 && (bool)l["informeEnIframe"] && (bool?)l["generating"] == true,
                "lectura tipo chatgpt", $"userText {l["userText"]}, fuentesHref {l["fuentesHref"]}, informeEnIframe {l["informeEnIframe"]}, generating {l["generating"]}");

            // Estado de generación en el tiempo: con el botón de detener, generando; sin él y con texto, fin observado.
            var est = await c.Correr("estado", spec);
            await c.Ejecutar("document.querySelector('[data-testid=\"stop-button\"]').remove(); 'ok'");
            var fin = await c.Correr("estado", spec);
            Anotar((bool?)est["generando"] == true && est["fin"].Type == JTokenType.Null && (string)fin["fin"] == "observado" && (int)fin["largo"] > 0,
                "estado de generación", $"antes {est.ToString(Formatting.None)}, después {fin.ToString(Formatting.None)}");

            // Diagnóstico de selectores, de solo lectura.
            var d = await c.Correr("diagnostico", spec);
            var sel = d["selectores"];
            var iframes = d["iframes"].Select(f => (string)f["origen"]).ToList();
            Anotar((int)sel["composer.selector"] == 1 && (int)sel["assistantMessage.selector"] == 1 && (int)sel["userMessage.selector"] == 1 && iframes.Contains("https://cc-otro.test/informe.html"),
                "diagnóstico de selectores", $"selectores {sel.ToString(Formatting.None)}, iframes {string.Join(", ", iframes)}");
            var malo = JObject.Parse(spec);
            malo["composer"]["selector"] = "[[no es un selector";
            var dm = await c.Correr("diagnostico", malo.ToString(Formatting.None));
            Anotar((string)dm["selectores"]["composer.selector"] == "invalido", "diagnóstico con un selector inválido", $"composer.selector = {dm["selectores"]["composer.selector"]}");
            c.Cerrar();

            // kimi: exclude sobre una copia, html crudo sin recortes, y los dos archivos leídos de su iframe.
            var k = await Paneles.Crear("prueba-l2", Origen + "kimi.html");
            l = await k.Correr("leer", Spec("kimi"), esperaMs: 60_000);
            var texto = (string)l["text"];
            var html = (string)l["html"];
            Anotar(!texto.Contains("Copiar y compartir") && html.Contains("Copiar y compartir") && texto.Contains("Respuesta de Kimi"),
                "lectura con exclude y html crudo (spec kimi)", $"el texto excluye el bloque: {!texto.Contains("Copiar y compartir")}, el html lo conserva: {html.Contains("Copiar y compartir")}");
            Anotar((int)l["archivos"]["leidos"] == 2 && (int)l["archivos"]["total"] == 2 && texto.Contains("CONTENIDO DEL ARCHIVO 1") && texto.Contains("CONTENIDO DEL ARCHIVO 2") && texto.Contains("=== ARCHIVO: dos.md ==="),
                "archivos de kimi", $"leídos {l["archivos"]["leidos"]}/{l["archivos"]["total"]}");
            k.Cerrar();

            // mistral: el texto del canvas reemplaza al aviso, el html guarda los dos, el canvas queda cerrado y la etiqueta de modelo.
            var m = await Paneles.Crear("prueba-l3", Origen + "mistral.html");
            l = await m.Correr("leer", Spec("mistral"));
            var cerrado = (string)JToken.Parse(await m.Ejecutar("document.getElementById('chat-side-panel').innerHTML"));
            Anotar(((string)l["text"]).StartsWith("TEXTO DEL CANVAS") && ((string)l["html"]).Contains("Aviso: la respuesta") && ((string)l["html"]).Contains("TEXTO DEL CANVAS") && cerrado == "" && (string)l["modelLabel"] == "Rápido",
                "canvas de mistral", $"texto \"{l["text"]}\", canvas cerrado después: {cerrado == ""}, modelLabel {l["modelLabel"]}");
            m.Cerrar();
        }

        // ---------------------------------------------------------------- T16: las capacidades del panel

        async Task IframeDeOtroOrigen()
        {
            var c = await Paneles.Crear("prueba-i", Origen + "chatgpt.html");
            var spec = JObject.Parse(Spec("chatgpt"));
            spec["informeEnIframe"]["frameUrl"] = OtroHost; // la real es el dominio de OpenAI
            await Task.Delay(500); // el iframe carga después que la página
            var informe = await c.LeerInformeEnIframe(spec.ToString(Formatting.None));
            Anotar(informe != null && ((string)informe["texto"]).StartsWith("INFORME DE PRUEBA") && ((string)informe["html"]).Contains("_reportPage_"),
                "script en un iframe de otro origen", informe == null ? "no se encontró el informe" : $"texto \"{informe["texto"]}\"");
            c.Cerrar();
        }

        async Task Adjunto()
        {
            var c = await Paneles.Crear("prueba-d", Origen + "chatgpt.html");
            var ruta = Path.Combine(Path.GetTempPath(), "adjunto-prueba-" + Guid.NewGuid().ToString("N").Substring(0, 8) + ".txt");
            File.WriteAllText(ruta, "Archivo de la operación, para adjuntar sin abrir el selector.\n");
            await c.Adjuntar(Spec("chatgpt"), ruta);
            var visto = (string)JToken.Parse(await c.Ejecutar("document.getElementById('archivo').textContent"));
            var esperado = Path.GetFileName(ruta) + "|" + new FileInfo(ruta).Length;
            Anotar(visto == esperado, "adjunto sin selector (DevTools)", $"el input recibió \"{visto}\", se esperaba \"{esperado}\"");
            File.Delete(ruta);
            c.Cerrar();
        }

        async Task Pdf()
        {
            var c = await Paneles.Crear("prueba-p", Origen + "chatgpt.html");
            var ruta = Path.Combine(Path.GetTempPath(), "cc-autoprueba-" + Guid.NewGuid().ToString("N").Substring(0, 8) + ".pdf");
            await c.ImprimirPdf(ruta);
            var ok = File.Exists(ruta);
            var cabecera = ok ? Encoding.ASCII.GetString(File.ReadAllBytes(ruta).Take(5).ToArray()) : "";
            var largo = ok ? new FileInfo(ruta).Length : 0;
            Anotar(ok && cabecera == "%PDF-" && largo > 1000, "PDF", $"existe {ok}, cabecera \"{cabecera}\", {largo} bytes");
            if (ok) File.Delete(ruta);
            c.Cerrar();
        }

        // Marca sintética en el almacenamiento del origen de prueba, en perfiles temporales: mide perfiles, no lee nada real.
        const string LeerMarca = "localStorage.getItem('cc-marca')";

        async Task Perfiles(Panel a)
        {
            await a.Navegar(Origen + "emergente.html");
            await a.Ejecutar("localStorage.setItem('cc-marca', 'perfil-a'); 'ok'");

            // La emergente: mismo perfil, con window.opener, y se cierra con window.close().
            await a.Ejecutar("document.getElementById('abrir').click(); 'ok'");
            var reloj = Stopwatch.StartNew();
            Panel e = null;
            while ((e = a.Emergente) == null && reloj.ElapsedMilliseconds < 15_000) await Task.Delay(100);
            if (e == null) { Anotar(false, "ventana emergente", "no apareció en 15 s"); return; }
            await e.EsperarCarga();
            var opener = (string)JToken.Parse(await e.Ejecutar("window.opener ? window.opener.location.origin : null"));
            var marca = (string)JToken.Parse(await e.Ejecutar(LeerMarca));
            Anotar(opener == "https://" + Host && marca == "perfil-a" && e.Perfil == "prueba-a",
                "ventana emergente con opener en el mismo perfil", $"opener {opener ?? "null"}, perfil {e.Perfil}, marca del perfil {marca ?? "null"}");
            await e.Ejecutar("document.getElementById('cerrar').click(); 'ok'");
            reloj.Restart();
            while (e.Abierto && reloj.ElapsedMilliseconds < 5_000) await Task.Delay(100);
            Anotar(!e.Abierto, "la emergente se cierra con window.close()", $"abierta después: {e.Abierto}");

            // Aislamiento: otro perfil, mismo origen, no ve la marca.
            var b = await Paneles.Crear("prueba-b", Origen + "textarea.html");
            var otra = (string)JToken.Parse(await b.Ejecutar(LeerMarca));
            Anotar(otra == null, "aislamiento entre dos perfiles", $"prueba-b ve la marca de prueba-a: {otra ?? "null"}");
            b.Cerrar();

            // Borrado de los datos del perfil.
            await a.BorrarDatos();
            await a.Navegar(Origen + "textarea.html");
            var despues = (string)JToken.Parse(await a.Ejecutar(LeerMarca));
            Anotar(despues == null, "borrado de los datos del perfil", $"marca después de borrar: {despues ?? "null"}");
        }

        async Task TechoExterno(Panel a)
        {
            // Una página colgada a propósito (15 s de bucle) en otro perfil: el techo la corta sin bloquear a los demás.
            var c = await Paneles.Crear("prueba-c", Origen + "textarea.html");
            var reloj = Stopwatch.StartNew();
            var colgada = c.Ejecutar("const hasta = Date.now() + 15000; while (Date.now() < hasta) {} 'fin'", techoMs: 3_000);
            await Task.Delay(300);
            var otro = Stopwatch.StartNew();
            var respuesta = (string)JToken.Parse(await a.Ejecutar("'responde'"));
            var msOtro = otro.ElapsedMilliseconds;
            string corte = null;
            try { await colgada; }
            catch (TimeoutException ex) { corte = ex.Message; }
            var msTecho = reloj.ElapsedMilliseconds;
            Anotar(corte != null && msTecho >= 2_900 && msTecho < 6_000, "techo externo sobre una página colgada", $"cortó a los {msTecho} ms: {corte ?? "no cortó"}");
            Anotar(respuesta == "responde" && msOtro < 1_500, "un panel colgado no bloquea a los demás", $"el otro panel respondió en {msOtro} ms");
            c.Cerrar();
        }
    }
}
