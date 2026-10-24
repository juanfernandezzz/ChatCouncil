using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using ChatCouncil.Motor;
using Newtonsoft.Json;
using UnityEngine;
using UnityEngine.UIElements;

namespace ChatCouncil.Interfaz
{
    /// <summary>
    /// La verificación de T20 en la app compilada: el recorrido de las etapas Pregunta e Investigación con los
    /// controles reales, sobre una carpeta de datos de prueba (-datos), nunca la real, y una página local por
    /// operador en lugar de los proveedores. Lo que hace la persona en cada página (enviar, que el proveedor
    /// responda) lo simula un script en la página. Comprueba los hechos que quedan en el registro.
    /// Escribe una línea por comprobación en la ruta de -pruebaronda y sale con 0 si todas pasan.
    /// </summary>
    public sealed class PruebaRonda : MonoBehaviour
    {
        /// <summary>
        /// Un chat, un compositor y un adjunto (autoprueba/ronda.html); el parámetro distingue las páginas. Los de Sucios
        /// abren la conversación "nueva" con un mensaje, como un proveedor que arrastra el chat anterior.
        /// </summary>
        public static string Url(string id) => $"https://cc-prueba.test/ronda.html?p={id}" + (Sucios.Contains(id) ? "&sucio=1" : "");

        static readonly HashSet<string> Sucios = new HashSet<string>();

        /// <summary>La misma spec para los siete: el fin se observa porque desaparece el botón de detener.</summary>
        public const string Spec =
            "{\"composer\":{\"selector\":\"#compositor\",\"kind\":\"textarea\"},\"escritura\":\"insertText\"," +
            "\"assistantMessage\":{\"selector\":\".respuesta\",\"pick\":\"last\"},\"userMessage\":{\"selector\":\".usuario\",\"pick\":\"first\"}," +
            "\"completion\":{\"kind\":\"element-gone\",\"selector\":\"#detener\",\"quiescenceMs\":500},\"version\":1}";

        const string LaPregunta = "Primera línea de la pregunta\nSegunda línea, con ñ y acentos: áéíóú\n\nCuarta, tras una vacía";
        static readonly string[] Pool = { "chatgpt", "gemini", "claude", "grok", "mistral", "kimi", "qwen" };

        Aplicacion app;
        string salida;
        readonly List<string> lineas = new List<string>();
        int pasadas, total;

        public void Iniciar(Aplicacion app, string salida)
        {
            this.app = app;
            this.salida = salida;
            app.Raiz.RemoveFromClassList("pagina-ampliada"); // la prueba mide la guía completa (etapas, frase, contadores)
            _ = Correr();
        }

        async Task Correr()
        {
            var codigo = 1;
            lineas.Add($"Prueba de la Ronda (T20), {DateTime.Now:yyyy-MM-dd HH:mm:ss}, {Application.platform}, {Application.version}");
            try
            {
                await Recorrido();
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

        // ---------------------------------------------------------------- ayudas

        PantallaRonda Ronda => app.Ronda;
        VisualElement Raiz => app.Raiz;
        static bool Visible(VisualElement e) => e.resolvedStyle.display == DisplayStyle.Flex;
        string Resultado => Ronda.TextoDelResultado;
        string Paso => Raiz.Q<Button>("paso-ancha").text;
        List<Hecho> Hechos => Ronda.Puerta.ConversacionActual == null ? new List<Hecho>() : Ronda.Puerta.LeerRegistro().Hechos;
        int LineasDelRegistro => Ronda.Puerta.ConversacionActual == null ? 0 : File.ReadAllLines(Registro.RutaArchivo(app.CarpetaDatos, Ronda.Puerta.ConversacionActual)).Length;

        static async Task Cuadros(int n)
        {
            for (var i = 0; i < n; i++) await Task.Yield();
        }

        /// <summary>Como la tecla Enter o el toque sobre el botón: el mismo evento que atiende Button.</summary>
        async Task Pulsar(string nombre)
        {
            var boton = Raiz.Q<Button>(nombre) ?? Raiz.panel.visualTree.Q<Button>(nombre) ?? throw new InvalidOperationException("no está el botón " + nombre);
            using (var e = NavigationSubmitEvent.GetPooled())
            {
                e.target = boton;
                boton.SendEvent(e);
            }
            await Cuadros(3);
        }

        static async Task<bool> Esperar(Func<bool> condicion, int segundos = 30)
        {
            var limite = DateTime.UtcNow.AddSeconds(segundos);
            while (DateTime.UtcNow < limite)
            {
                if (condicion()) return true;
                await Task.Delay(200);
            }
            return condicion();
        }

        Task<string> En(string id, string js) => Ronda.PanelDe(id).Ejecutar(js, 10_000);

        async Task<string> Compositor(string id) => (string)JsonEstricto.Leer(await En(id, "document.getElementById('compositor').value"));

        /// <summary>Lo que hace la persona: enviar. El texto pasa al chat y aparece el botón de detener.</summary>
        Task Enviar(string id) => En(id,
            "(() => { const c = document.getElementById('compositor'); const u = document.createElement('div'); u.className = 'usuario';" +
            " u.textContent = c.value; document.getElementById('chat').append(u); c.value = ''; const d = document.createElement('button');" +
            " d.id = 'detener'; document.body.append(d); return 'ok'; })()");

        /// <summary>Lo que hace el proveedor: responder y terminar.</summary>
        Task Responder(string id, string texto) => En(id,
            "(() => { const r = document.createElement('div'); r.className = 'respuesta'; r.textContent = " + JsonConvert.ToString(texto) +
            "; document.getElementById('chat').append(r); document.getElementById('detener')?.remove(); return 'ok'; })()");

        static string RespuestaDe(string id) => $"Respuesta de {id}: " + string.Concat(Enumerable.Repeat("un párrafo largo de prueba, con ñ y acentos. ", 10));

        string EstadoEnLaLista(string id) => Raiz.Q("fila-" + id).Q<Label>(className: "fila-estado").text;

        // ---------------------------------------------------------------- el recorrido

        async Task Recorrido()
        {
            await Cuadros(10);

            // El primer arranque, con lo que viene marcado: los nueve y los roles por defecto.
            await Pulsar("guardar");
            await Pulsar("empezar");
            var abiertos = await Esperar(() => Ronda.Operadores.All(id => Ronda.PanelDe(id) != null), 60);
            Anotar(abiertos && Ronda.Operadores.SequenceEqual(Pool) && Ronda.PanelDe("deepseek") == null && Ronda.PanelDe("glm") == null,
                "paneles del pool", $"operadores [{string.Join(",", Ronda.Operadores)}]; sin página el integrador y el verificador (historia 26)");
            Anotar(Paso == "Pegar la pregunta en los paneles" && Raiz.Q<Label>("barra-titulo").text == "Pregunta · 1 de 7" && Visible(Raiz.Q<TextField>("pregunta-ancha")),
                "etapa Pregunta", $"\"{Paso}\", campo de la pregunta a la vista");

            await Pulsar("paso-ancha");
            Anotar(Resultado == "Escribe la pregunta antes de pegarla." && Ronda.Puerta.RondaActual == null, "pregunta vacía", $"\"{Resultado}\", sin ronda");

            // Un borrador en Grok: no se escribe encima (historia 30).
            await En("grok", "document.getElementById('compositor').value = 'borrador mío'; 'ok'");
            Ronda.Pregunta = LaPregunta;
            await Pulsar("paso-ancha");
            var capa = Raiz.Q("capa").ClassListContains("capa--abierta") && Raiz.Q<Label>("dialogo-titulo").text == "Antes de pegar la pregunta";
            var apartada = Ronda.PanelDe(Ronda.Visible).RectReal.x < 0;
            Anotar(capa && apartada, "aviso de capacidades", $"diálogo abierto: {capa}; la página se aparta: {apartada}");
            Raiz.Q<Toggle>("dialogo-casilla").value = true;
            await Pulsar("dialogo-aceptar");
            await Esperar(() => Resultado.StartsWith("Pegada", StringComparison.Ordinal), 60);

            var hechos = Hechos;
            var ronda = hechos.OfType<Ronda>().SingleOrDefault();
            var condicion = hechos.OfType<CondicionProveedoresCargados>().SingleOrDefault();
            var intentos = hechos.OfType<Intento>().ToList();
            var grok = intentos.SingleOrDefault(i => i.ProveedorId == "grok");
            Anotar(ronda?.Prompt == LaPregunta && condicion?.Proveedores.Count == 9 && condicion.Integrador == "deepseek",
                "ronda abierta", $"prompt idéntico: {ronda?.Prompt == LaPregunta}; condición: {condicion?.Proveedores.Count} cargados, integra {condicion?.Integrador}");
            Anotar(intentos.Count == 7 && intentos.Count(i => i.Ok) == 6 && grok != null && !grok.Ok && grok.Error.Contains("borrador"),
                "un intento por proveedor", $"{intentos.Count} intentos, {intentos.Count(i => i.Ok)} bien; Grok: \"{grok?.Error}\"");
            var pegadas = new List<string>();
            foreach (var id in Pool.Where(id => id != "grok"))
                if (await Compositor(id) == LaPregunta) pegadas.Add(id);
            Anotar(pegadas.Count == 6 && await Compositor("grok") == "borrador mío", "saltos de línea y borrador",
                $"pregunta idéntica en {pegadas.Count} de 6; el borrador de Grok sigue intacto");
            Anotar(Resultado == "Pegada en 6 de 7. Los que fallaron dicen qué hacer en su cabecera.", "resultado del pegado", Resultado);

            // Grok: qué pasó y qué hacer, y pegar solo ahí (historia 29), sin ronda ni intento nuevos.
            Ronda.Seleccionar("grok");
            await Esperar(() => Raiz.Q<Button>("accion-panel").text == "Pegar la pregunta aquí");
            var problema = Raiz.Q<Label>("cabecera-problema").text;
            var corto = Raiz.Q<Label>("selector-problema").text;
            Anotar(problema.StartsWith("La pregunta no se pegó: el compositor ya tenía texto", StringComparison.Ordinal) && corto == "No se pegó: pégala otra vez desde «Más…».",
                "problema en la cabecera y en el selector", $"cabecera \"{problema}\"; selector \"{corto}\"");
            await En("grok", "document.getElementById('compositor').value = ''; 'ok'");
            await Pulsar("accion-panel");
            await Esperar(() => Resultado.StartsWith("Pegada en Grok", StringComparison.Ordinal));
            Anotar(await Compositor("grok") == LaPregunta && Hechos.OfType<Intento>().Count() == 7 && Hechos.OfType<Ronda>().Count() == 1,
                "pegar en este panel", $"\"{Resultado}\"; intentos {Hechos.OfType<Intento>().Count()}, rondas {Hechos.OfType<Ronda>().Count()}");

            // La persona envía en los siete; el indicador lo ve.
            foreach (var id in Pool) await Enviar(id);
            var respondiendo = await Esperar(() => Pool.Where(id => id != "grok").All(id => EstadoEnLaLista(id) == "Respondiendo"));
            Anotar(respondiendo, "indicador: respondiendo", string.Join(", ", Pool.Select(id => $"{id} {EstadoEnLaLista(id)}")));

            // Responden todos menos Qwen; Kimi, muy corto.
            foreach (var id in Pool.Where(id => id != "qwen")) await Responder(id, id == "kimi" ? "Respuesta corta de Kimi, de menos de trescientos caracteres." : RespuestaDe(id));
            var terminados = new[] { "chatgpt", "gemini", "claude", "mistral", "kimi" };
            var listos = await Esperar(() => terminados.All(id => EstadoEnLaLista(id) == "Parece terminado") && EstadoEnLaLista("qwen") == "Respondiendo");
            Anotar(listos && Paso == "Capturar los que terminaron (5)" && Raiz.Q<Button>("paso-ancha").enabledSelf,
                "indicador: parece terminado", $"\"{Paso}\"; {string.Join(", ", Pool.Select(id => $"{id} {EstadoEnLaLista(id)}"))}");
            Anotar(Raiz.Q<Label>("contadores-ancha").text == "Enviados 6 de 7 · Parecen terminados 5 · Capturados 0", "contadores", Raiz.Q<Label>("contadores-ancha").text);

            await Pulsar("paso-ancha");
            await Esperar(() => Resultado.StartsWith("Capturados", StringComparison.Ordinal), 60);
            hechos = Hechos;
            var respuestas = hechos.OfType<Respuesta>().ToList();
            var corta = hechos.OfType<ErrorCaptura>().SingleOrDefault(e => e.ProveedorId == "kimi");
            Anotar(respuestas.Select(r => r.ProveedorId).OrderBy(x => x).SequenceEqual(terminados.OrderBy(x => x))
                   && respuestas.All(r => r.Error == null && r.PromptUsuarioLeido == LaPregunta),
                "capturar los que terminaron", $"respuestas de [{string.Join(",", respuestas.Select(r => r.ProveedorId))}]; \"{Resultado}\"");
            // Que los prompts coincidan es una buena noticia: no va en el color del problema.
            var enRojo = Raiz.Q("resultado-ancha").ClassListContains("problema");
            Anotar(!enRojo, "aviso de prompts que coinciden", enRojo ? "marcado como problema" : "sin el color del problema");
            Anotar(respuestas.Single(r => r.ProveedorId == "chatgpt").TextoOriginal == RespuestaDe("chatgpt") && respuestas.All(r => r.Procedencia?.Continuidad == "indeterminada"),
                "texto y procedencia", $"texto idéntico; continuidad {string.Join(",", respuestas.Select(r => r.Procedencia?.Continuidad).Distinct())}");
            Anotar(corta?.Detalle == "respuesta sospechosamente corta: puede haber quedado fuera de la captura", "respuesta corta marcada", corta?.Detalle ?? "sin ErrorCaptura");
            // Para las capturas de la etapa con un panel con problema (H7).
            Copiar(app.CarpetaDatos, salida + ".investigacion");

            // Grok respondió después de pegar aquí: se captura solo.
            Ronda.Seleccionar("grok");
            await Esperar(() => Raiz.Q<Button>("accion-panel").text.StartsWith("Capturar este panel", StringComparison.Ordinal));
            await Pulsar("accion-panel");
            await Esperar(() => Hechos.OfType<Respuesta>().Any(r => r.ProveedorId == "grok"), 60);
            Anotar(Hechos.OfType<Respuesta>().Count(r => r.ProveedorId == "grok") == 1 && Hechos.OfType<Respuesta>().Count() == 6, "capturar este panel",
                $"Grok capturado; respuestas {Hechos.OfType<Respuesta>().Count()}");

            // Qwen termina: la segunda captura confirma la continuidad (no navegó).
            await Responder("qwen", RespuestaDe("qwen"));
            await Esperar(() => Paso == "Capturar los que terminaron (1)");
            await Pulsar("paso-ancha");
            await Esperar(() => Hechos.OfType<Respuesta>().Any(r => r.ProveedorId == "qwen"), 60);
            var qwen = Hechos.OfType<Respuesta>().SingleOrDefault(r => r.ProveedorId == "qwen");
            Anotar(qwen?.Procedencia?.Continuidad == "confirmada", "continuidad confirmada", qwen?.Procedencia?.Continuidad ?? "sin respuesta");
            await Esperar(() => Raiz.Q<Label>("barra-titulo").text == "Operación · 3 de 7");
            Anotar(Raiz.Q<Label>("barra-titulo").text == "Operación · 3 de 7" && Paso == "Pegar la operación en los paneles" && Raiz.Q<Button>("paso-ancha").enabledSelf
                   && Pool.All(id => EstadoEnLaLista(id) == "Por pegar"),
                "fin de la investigación", $"\"{Raiz.Q<Label>("barra-titulo").text}\", \"{Paso}\"; {string.Join(", ", Pool.Select(id => $"{id} {EstadoEnLaLista(id)}"))}");

            await RecorridoDeOperacion();

            // Un diálogo cancelado no deja su acción: un "Aceptar" después no abandona nada (defecto visto en T21).
            var rondaAntes = Ronda.Puerta.RondaActual;
            await Pulsar("menu-ronda");
            await Pulsar("item-Abandonar la ronda");
            await Pulsar("dialogo-cancelar");
            await Pulsar("dialogo-aceptar");
            Anotar(Ronda.Puerta.RondaActual == rondaAntes && rondaAntes != null, "diálogo cancelado", $"la ronda sigue abierta: {Ronda.Puerta.RondaActual == rondaAntes}");

            // Abandonar la ronda (D13): vuelve a Pregunta sin escribir nada.
            var lineasAntes = LineasDelRegistro;
            await Pulsar("menu-ronda");
            await Pulsar("item-Abandonar la ronda");
            await Pulsar("dialogo-aceptar");
            await Cuadros(5);
            Anotar(Ronda.Puerta.RondaActual == null && Paso == "Pegar la pregunta en los paneles" && LineasDelRegistro == lineasAntes,
                "abandonar la ronda", $"\"{Paso}\"; líneas del registro {lineasAntes} → {LineasDelRegistro}");

            // Capturar lo que ya está en pantalla, sin pegar, y declarar la pregunta (historia 40).
            const string AMano = "Pregunta escrita a mano en cada página";
            foreach (var id in Pool)
                await En(id, "(() => { document.getElementById('chat').innerHTML = ''; const u = document.createElement('div'); u.className = 'usuario'; u.textContent = "
                             + JsonConvert.ToString(AMano) + "; document.getElementById('chat').append(u); return 'ok'; })()");
            foreach (var id in Pool) await Responder(id, RespuestaDe(id) + " (segunda)");
            await Pulsar("menu-ronda");
            await Pulsar("item-Capturar lo que ya está en los paneles");
            await Esperar(() => Paso == "Declarar la pregunta de esta ronda", 60);
            var sinEnvio = Hechos.OfType<Ronda>().LastOrDefault();
            Anotar(sinEnvio?.Prompt == Puerta.PromptSinRonda && sinEnvio.Indice == 2 && Hechos.OfType<Respuesta>().Count(r => r.RondaId == sinEnvio.Id) == 7,
                "capturar sin pegar", $"ronda {sinEnvio?.Indice} con el marcador; {Hechos.OfType<Respuesta>().Count(r => r.RondaId == sinEnvio?.Id)} respuestas; \"{Paso}\"");
            await Pulsar("paso-ancha");
            Raiz.Q<TextField>("dialogo-campo").value = AMano;
            await Pulsar("dialogo-aceptar");
            await Cuadros(5);
            var declarada = Hechos.OfType<PreguntaDeclarada>().SingleOrDefault();
            Anotar(declarada?.Texto == AMano && declarada.RondaId == sinEnvio?.Id && Raiz.Q<Label>("barra-titulo").text == "Operación · 3 de 7",
                "declarar la pregunta", $"\"{declarada?.Texto}\"; \"{Raiz.Q<Label>("barra-titulo").text}\"");

            await RecorridoDeT23();
        }

        // ---------------------------------------------------------------- T23: secciones, mantenimiento, teclado, apariencia y lector

        [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
        struct Rect32 { public int Izq, Arriba, Der, Abajo; }

        [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
        struct InfoHilo
        {
            public int Tamano, Banderas;
            public IntPtr Activa, Foco, Captura, Menu, Mover, Cursor;
            public Rect32 Caret;
        }

        [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)]
        struct Entrada
        {
            public int Tipo;
            public int Relleno;
            public ushort Tecla, Escaneo;
            public uint Banderas, Tiempo;
            public IntPtr Extra;
            public long Relleno2;
        }

        [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint hilo, ref InfoHilo info);
        [System.Runtime.InteropServices.DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr ventana, IntPtr proceso);
        [System.Runtime.InteropServices.DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr ventana);
        [System.Runtime.InteropServices.DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
        [System.Runtime.InteropServices.DllImport("user32.dll")] static extern uint SendInput(uint cuantas, Entrada[] entradas, int tamano);

        static IntPtr VentanaDeLaApp => System.Diagnostics.Process.GetCurrentProcess().MainWindowHandle;

        /// <summary>La ventana con el foco del teclado en el hilo de la app: la de Unity, o una de adentro de una página.</summary>
        static IntPtr Foco()
        {
            var info = new InfoHilo { Tamano = System.Runtime.InteropServices.Marshal.SizeOf<InfoHilo>() };
            return GetGUIThreadInfo(GetWindowThreadProcessId(VentanaDeLaApp, IntPtr.Zero), ref info) ? info.Foco : IntPtr.Zero;
        }

        /// <summary>Una tecla de verdad, por la cola de Windows: llega a quien tenga el foco, sea Unity o la página.</summary>
        static async Task Tecla(ushort vk, bool mayus = false)
        {
            var entradas = new List<Entrada>();
            if (mayus) entradas.Add(new Entrada { Tipo = 1, Tecla = 0x10 });
            entradas.Add(new Entrada { Tipo = 1, Tecla = vk });
            entradas.Add(new Entrada { Tipo = 1, Tecla = vk, Banderas = 2 });
            if (mayus) entradas.Add(new Entrada { Tipo = 1, Tecla = 0x10, Banderas = 2 });
            SendInput((uint)entradas.Count, entradas.ToArray(), System.Runtime.InteropServices.Marshal.SizeOf<Entrada>());
            await Task.Delay(400);
        }

        async Task Evento(EventBase e)
        {
            using (e)
            {
                e.target = Raiz.panel.visualTree;
                Raiz.panel.visualTree.SendEvent(e);
            }
            await Cuadros(3);
        }

        string Seccion => new[] { "ronda", "historial", "ayuda" }.FirstOrDefault(s => Raiz.Q("seccion-" + s).resolvedStyle.display == DisplayStyle.Flex)
                          ?? (app.Configuracion.Raiz.resolvedStyle.display == DisplayStyle.Flex ? "ajustes" : "-");

        async Task RecorridoDeT23()
        {
            // Rondas anteriores (D12): las tres rondas, la más nueva primero, y el informe de la primera se abre.
            await Pulsar("ir-historial");
            await Cuadros(5);
            var filas = Raiz.Q("lista-historial").Query(className: "fila-historial").ToList();
            var conInforme = filas.Where(f => f.Q<Button>() != null).ToList();
            string abierta = null;
            Ronda.AbrirCarpeta = r => abierta = r;
            if (conInforme.Count == 1) await PulsarBoton(conInforme[0].Q<Button>());
            var primera = Hechos.OfType<Ronda>().First(r => r.Indice == 0);
            Anotar(Seccion == "historial" && filas.Count == 3 && filas[0].Q<Label>().text == "Pregunta escrita a mano en cada página" && conInforme.Count == 1
                   && conInforme[0].name == "historial-" + primera.Id && abierta != null && abierta.Contains("Informe recapturado"),
                "rondas anteriores", $"{filas.Count} rondas, la primera «{filas.FirstOrDefault()?.Q<Label>().text}»; con informe {conInforme.Count}; abierta «{abierta}»");

            // La Ayuda, con los atajos y la versión, desde el riel; F1 ya no la abre (D49: F1 es el panel anterior).
            await Evento(KeyDownEvent.GetPooled('\0', KeyCode.F1, EventModifiers.None));
            var conF1 = Seccion;
            await Pulsar("ir-ayuda");
            Anotar(conF1 == "historial" && Seccion == "ayuda" && Raiz.Q<Label>("version").text == $"ChatCouncil, versión {Application.version}.",
                "la ayuda desde el riel, no con F1", $"con F1 «{conF1}»; desde el riel «{Seccion}», «{Raiz.Q<Label>("version").text}»");

            // Apariencia (D17): el tema oscuro y el texto al 200 %, guardados; después vuelven.
            await Pulsar("ir-ajustes");
            var tema = app.Configuracion.Raiz.Q<DropdownField>("tema");
            var texto = app.Configuracion.Raiz.Q<DropdownField>("tamano-texto");
            var anchoAntes = Raiz.panel.visualTree.worldBound.width;
            tema.index = 2;
            texto.index = 4;
            await Cuadros(10);
            var archivo = File.ReadAllText(Path.Combine(app.CarpetaDatos, "apariencia.json"));
            var oscuro = Raiz.panel.visualTree.ClassListContains("tema-oscuro");
            var anchoDespues = Raiz.panel.visualTree.worldBound.width;
            Anotar(oscuro && archivo == "{\"tema\":\"oscuro\",\"texto\":200}" && Mathf.Abs(anchoDespues * 2 - anchoAntes) < 2,
                "tema y tamaño del texto", $"oscuro {oscuro}; «{archivo}»; ancho {anchoAntes} → {anchoDespues} dp");
            tema.index = 1;
            texto.index = 1;
            await Cuadros(10);

            // Objetivos de 48 dp (D19) en las cuatro secciones, y el foco visible con el color de foco.
            var chicos = new List<string>();
            foreach (var s in new[] { "ronda", "historial", "ajustes", "ayuda" })
            {
                app.Mostrar(s);
                await Cuadros(5);
                foreach (var c in Raiz.panel.visualTree.Query<VisualElement>().Where(e => (e is Button || e is Toggle || e is DropdownField || e is TextField) && EsVisible(e)).ToList())
                {
                    var r = c is BaseField<string> campo && campo.Q(className: "unity-base-field__input") != null ? campo.Q(className: "unity-base-field__input").worldBound : c.worldBound;
                    if (r.height < 47.5f || r.width < 47.5f) chicos.Add($"{s}/{c.name}«{Lector.Nombre(c)}» {r.width:0}×{r.height:0}");
                }
            }
            Anotar(chicos.Count == 0, "objetivos de 48 dp en las cuatro secciones", chicos.Count == 0 ? "todos" : string.Join("; ", chicos));
            app.Mostrar("ronda");
            await Cuadros(5);
            var paso = Raiz.Q<Button>("paso-ancha");
            paso.Focus();
            await Cuadros(3);
            var colores = new List<string> { "paso " + ColorUtility.ToHtmlStringRGB(paso.resolvedStyle.borderTopColor) };
            app.Mostrar("ajustes");
            await Cuadros(5);
            var conf = app.Configuracion.Raiz;
            foreach (var (nombre, control, borde) in new (string, VisualElement, Func<VisualElement>)[]
                     {
                         ("campo", conf.Q<TextField>("ruta-datos"), () => conf.Q<TextField>("ruta-datos").Q(className: "unity-base-field__input")),
                         ("casilla", conf.Q<Toggle>("marca-chatgpt"), () => conf.Q<Toggle>("marca-chatgpt").Q(className: "unity-toggle__checkmark")),
                         ("desplegable", conf.Q<DropdownField>("tema"), () => conf.Q<DropdownField>("tema").Q(className: "unity-base-field__input")),
                     })
            {
                control.Focus();
                await Cuadros(3);
                colores.Add(nombre + " " + ColorUtility.ToHtmlStringRGB(borde().resolvedStyle.borderTopColor));
            }
            app.Mostrar("ronda");
            await Cuadros(5);
            Anotar(colores.All(c => c.EndsWith("3A79E0", StringComparison.Ordinal)), "foco visible con el color de foco", string.Join(", ", colores));

            // D49, teclado de una mano: F3 el paso siguiente (en Operación abre el aviso); F2 y F1 el panel siguiente y el
            // anterior; Ctrl+Tab y Ctrl+Mayús+Tab siguen como alias.
            await Evento(KeyDownEvent.GetPooled('\0', KeyCode.F3, EventModifiers.None));
            var aviso = Raiz.Q("capa").ClassListContains("capa--abierta") && Raiz.Q<Label>("dialogo-titulo").text == "Antes de pegar la operación";
            if (aviso) await Pulsar("dialogo-cancelar");
            Ronda.Seleccionar("chatgpt");
            await Evento(KeyDownEvent.GetPooled('\0', KeyCode.F2, EventModifiers.None));
            var conF2 = Ronda.Visible;
            await Evento(KeyDownEvent.GetPooled('\0', KeyCode.F1, EventModifiers.None));
            var conF1EnRonda = Ronda.Visible;
            await Evento(NavigationMoveEvent.GetPooled(NavigationMoveEvent.Direction.Next, EventModifiers.Control));
            var siguiente = Ronda.Visible;
            await Evento(NavigationMoveEvent.GetPooled(NavigationMoveEvent.Direction.Previous, EventModifiers.Control));
            Anotar(aviso && conF2 == "gemini" && conF1EnRonda == "chatgpt" && siguiente == "gemini" && Ronda.Visible == "chatgpt", "F3, F2, F1 y Ctrl+Tab",
                $"aviso con F3: {aviso}; F2 → {conF2}, F1 → {conF1EnRonda}; Ctrl+Tab → {siguiente}, Ctrl+Mayús+Tab → {Ronda.Visible}");

            // Mantenimiento del panel (historias 12, 72 a 74), sobre Gemini.
            Ronda.Seleccionar("gemini");
            var nav = Ronda.PanelDe("gemini").Navegaciones;
            await Pulsar("menu-panel");
            await Pulsar("item-Recargar la página");
            var recargo = await Esperar(() => Resultado == "Se recargó la página de Gemini.", 20) && Ronda.PanelDe("gemini").Navegaciones > nav;
            Anotar(recargo && Resultado == "Se recargó la página de Gemini.", "recargar la página", $"navegaciones {nav} → {Ronda.PanelDe("gemini").Navegaciones}; «{Resultado}»");

            for (var i = 0; i < 40 && await En("gemini", "document.readyState") != "\"complete\""; i++) await Task.Delay(250);
            abierta = null;
            await Pulsar("menu-panel");
            await Pulsar("item-Diagnóstico de selectores");
            await Esperar(() => Resultado.StartsWith("Diagnóstico de Gemini", StringComparison.Ordinal) || Resultado.StartsWith("No se pudo", StringComparison.Ordinal), 40);
            var diagnosticos = Directory.Exists(Path.Combine(app.CarpetaDatos, "diagnosticos")) ? Directory.GetFiles(Path.Combine(app.CarpetaDatos, "diagnosticos")) : new string[0];
            var diag = diagnosticos.Length == 1 ? Newtonsoft.Json.Linq.JObject.Parse(File.ReadAllText(diagnosticos[0])) : null;
            Anotar(diag != null && (string)diag["proveedor"] == "gemini" && (int?)diag["diagnostico"]?["selectores"]?["composer.selector"] == 1
                   && abierta == Path.Combine(app.CarpetaDatos, "diagnosticos"),
                "diagnóstico de selectores en un archivo", $"«{Resultado}»; compositor encontrado {diag?["diagnostico"]?["selectores"]?["composer.selector"]} vez; carpeta abierta {abierta != null}");

            await En("gemini", "localStorage.setItem('marca', '1'); document.cookie = 'marca=1; max-age=3600; path=/'; 'ok'");
            await Pulsar("menu-panel");
            await Pulsar("item-Cerrar la sesión de este panel…");
            var confirmacion = Raiz.Q<Label>("dialogo-titulo").text;
            await Pulsar("dialogo-aceptar");
            await Esperar(() => Resultado.StartsWith("Sesión de Gemini cerrada", StringComparison.Ordinal) || Resultado.StartsWith("No se pudo", StringComparison.Ordinal), 40);
            await Task.Delay(1000);
            var restos = (string)JsonEstricto.Leer(await En("gemini", "JSON.stringify([localStorage.getItem('marca'), document.cookie])"));
            Anotar(confirmacion == "Cerrar la sesión de Gemini" && Resultado.StartsWith("Sesión de Gemini cerrada", StringComparison.Ordinal) && restos == "[null,\"\"]",
                "cerrar la sesión con confirmación", $"diálogo «{confirmacion}»; «{Resultado}»; lo que quedó {restos}");

            // F4 y F5 con teclas reales (D49, WCAG 2.1.1 y 2.1.2): de la app a la página y de vuelta a la región siguiente o
            // la anterior; F1, F2 y F3 con el foco en la página llegan igual a la app; el Tab sale de la página.
            SetForegroundWindow(VentanaDeLaApp);
            await Task.Delay(500);
            var adelante = GetForegroundWindow() == VentanaDeLaApp;
            string RegionActual() => RegionDe(Raiz.focusController.focusedElement as VisualElement);
            bool EnLaPagina() => Foco() != VentanaDeLaApp && Foco() != IntPtr.Zero;
            async Task<List<string>> HastaLaPagina(ushort tecla)
            {
                var vistas = new List<string>();
                for (var i = 0; i < 7 && !EnLaPagina(); i++)
                {
                    await Tecla(tecla);
                    vistas.Add(EnLaPagina() ? "página" : RegionActual());
                }
                return vistas;
            }
            Raiz.Q<Button>("paso-ancha").Focus();
            await Cuadros(3);
            var conF4 = await HastaLaPagina(0x73);
            await Tecla(0x73); // F4 dentro de la página
            var trasF4 = EnLaPagina() ? "página" : RegionActual();
            var conF5 = await HastaLaPagina(0x74);
            await Tecla(0x74); // F5 dentro de la página
            var trasF5 = EnLaPagina() ? "página" : RegionActual();

            async Task<bool> EnPaginaYTecla(ushort tecla)
            {
                Ronda.FocoEnPagina();
                await Task.Delay(400);
                var dentro = EnLaPagina();
                await Tecla(tecla);
                return dentro && !EnLaPagina();
            }
            Ronda.Seleccionar("chatgpt");
            await Cuadros(3);
            var f2 = await EnPaginaYTecla(0x71);
            var paginaF2 = Ronda.Visible;
            var f1 = await EnPaginaYTecla(0x70);
            var paginaF1 = Ronda.Visible;
            var f3 = await EnPaginaYTecla(0x72);
            var avisoF3 = Raiz.Q("capa").ClassListContains("capa--abierta");
            if (avisoF3) await Pulsar("dialogo-cancelar");

            Ronda.FocoEnPagina();
            await Task.Delay(400);
            var entroOtraVez = EnLaPagina();
            for (var i = 0; i < 6 && Foco() != VentanaDeLaApp; i++) await Tecla(0x09); // Tab hasta salir de la página
            var volvioConTab = Foco() == VentanaDeLaApp;
            // En la clase ancha la página es la última región visible (la barra y "abajo" son de la angosta): F4 vuelve al riel.
            Anotar(adelante && conF4.LastOrDefault() == "página" && trasF4 == "riel" && conF5.LastOrDefault() == "página" && trasF5 == "cabecera",
                "F4 y F5 entran a la página y salen a la región siguiente o la anterior",
                $"al frente {adelante}; F4 {string.Join(" → ", conF4)} → {trasF4}; F5 {string.Join(" → ", conF5)} → {trasF5}");
            Anotar(f2 && paginaF2 == "gemini" && f1 && paginaF1 == "chatgpt" && f3 && avisoF3 && entroOtraVez && volvioConTab,
                "F1, F2 y F3 desde la página llegan a la app; el Tab sale",
                $"F2 {f2} → {paginaF2}; F1 {f1} → {paginaF1}; F3 {f3}, aviso {avisoF3}; Tab vuelve {volvioConTab}");

            // El lector de pantalla (D50): la jerarquía con los controles a la vista, con su nombre y su función.
            UnityEngine.Accessibility.AssistiveSupport.screenReaderStatusOverride = UnityEngine.Accessibility.AssistiveSupport.ScreenReaderStatusOverride.ForceEnabled;
            await Task.Delay(1500);
            var nodos = new List<UnityEngine.Accessibility.AccessibilityNode>();
            void Juntar(IEnumerable<UnityEngine.Accessibility.AccessibilityNode> n)
            {
                foreach (var x in n)
                {
                    nodos.Add(x);
                    Juntar(x.children);
                }
            }
            if (UnityEngine.Accessibility.AssistiveSupport.activeHierarchy != null) Juntar(UnityEngine.Accessibility.AssistiveSupport.activeHierarchy.rootNodes);
            var boton = nodos.FirstOrDefault(n => n.label == Paso);
            var fila = nodos.FirstOrDefault(n => n.label.StartsWith("Kimi, ", StringComparison.Ordinal));
            var etapa = nodos.FirstOrDefault(n => n.label.EndsWith(", etapa actual", StringComparison.Ordinal));
            Anotar(boton?.role == UnityEngine.Accessibility.AccessibilityRole.Button && nodos.Any(n => n.label == "Ronda…") && boton.frame.width > 0
                   && fila?.role == UnityEngine.Accessibility.AccessibilityRole.Button && etapa?.label == "3 Operación, etapa actual"
                   && nodos.All(n => n.label != "Página del proveedor (vista nativa)" && n.label != "Kimi"),
                "jerarquía para el lector de pantalla", $"{nodos.Count} nodos; «{boton?.label}» como {boton?.role}, marco {boton?.frame}; fila «{fila?.label}» como {fila?.role}; «{etapa?.label}»");

            // T24 (D50): un texto que cambia no rearma la jerarquía (eso movería el foco del lector); se actualiza su nodo.
            var resultado = Raiz.Q<Label>("resultado-ancha");
            var textoResultado = resultado.text;
            resultado.text = "Primer resultado"; // si estaba vacío, aparece un nodo y ahí sí se rearma
            await Task.Delay(1500);
            var antes = UnityEngine.Accessibility.AssistiveSupport.activeHierarchy;
            resultado.text = "Resultado de prueba del lector";
            await Task.Delay(1500);
            var despues = UnityEngine.Accessibility.AssistiveSupport.activeHierarchy;
            nodos.Clear();
            if (despues != null) Juntar(despues.rootNodes);
            Anotar(antes != null && ReferenceEquals(antes, despues) && nodos.Any(n => n.label == "Resultado de prueba del lector"),
                "un texto nuevo no rearma la jerarquía", $"la misma jerarquía: {ReferenceEquals(antes, despues)}; nodo con el texto nuevo: {nodos.Any(n => n.label == "Resultado de prueba del lector")}");
            resultado.text = textoResultado;

            // La lista con el teclado: Enter sobre una fila la pone a la vista (WCAG 2.1.1).
            var filaKimi = Raiz.Q("fila-kimi");
            filaKimi.Focus();
            using (var e = NavigationSubmitEvent.GetPooled())
            {
                e.target = filaKimi;
                filaKimi.SendEvent(e);
            }
            await Cuadros(3);
            Anotar(Ronda.Visible == "kimi" && filaKimi.focusable, "la lista de paneles con el teclado", $"Enter sobre Kimi: a la vista {Ronda.Visible}");
            UnityEngine.Accessibility.AssistiveSupport.screenReaderStatusOverride = UnityEngine.Accessibility.AssistiveSupport.ScreenReaderStatusOverride.OSDriven;
        }

        static string RegionDe(VisualElement e)
        {
            for (var x = e; x != null; x = x.parent)
                if (x.ClassListContains("region")) return x.GetClasses().First();
            return "-";
        }

        static bool EsVisible(VisualElement e)
        {
            for (var x = e; x != null; x = x.parent)
                if (x.resolvedStyle.display == DisplayStyle.None) return false;
            return e.worldBound.width > 0 && e.worldBound.height > 0;
        }

        async Task PulsarBoton(Button boton)
        {
            using (var e = NavigationSubmitEvent.GetPooled())
            {
                e.target = boton;
                boton.SendEvent(e);
            }
            await Cuadros(3);
        }

        // ---------------------------------------------------------------- la operación (T21)

        /// <summary>
        /// Lo que hace Juan antes de pegar la operación: abrir una conversación nueva en esos paneles. Espera a que las
        /// páginas limpias carguen vacías; las de Sucios cargan con mensajes y no se esperan.
        /// </summary>
        async Task AbrirConversacionNueva(params string[] ids)
        {
            foreach (var id in ids) await Ronda.PanelDe(id).Navegar(Url(id));
            foreach (var id in ids.Where(id => !Sucios.Contains(id)))
            {
                var limite = DateTime.UtcNow.AddSeconds(20);
                for (;;)
                {
                    try
                    {
                        if ((bool?)await Ronda.PanelDe(id).Correr("chatVacio", Spec, esperaMs: 2_000) == true
                            && (string)await Ronda.PanelDe(id).Correr("leerCompositor", Spec, esperaMs: 2_000) == "") break;
                    }
                    catch (Exception)
                    {
                        // la página todavía está cargando
                    }
                    if (DateTime.UtcNow > limite)
                    {
                        Anotar(false, $"conversación nueva de {id}", "no quedó vacía en 20 s");
                        break;
                    }
                    await Task.Delay(200);
                }
            }
        }

        async Task RecorridoDeOperacion()
        {
            var ronda = Ronda.Puerta.RondaActual;
            // Juan abre la conversación nueva en cada panel (pedido del 2026-10-23); la de Mistral queda con mensajes.
            Sucios.Add("mistral");
            await AbrirConversacionNueva(Pool.ToArray());
            var navAntes = Pool.ToDictionary(id => id, id => Ronda.PanelDe(id).Navegaciones);

            // Pegar en los siete: la app ya no navega, solo comprueba que cada conversación esté vacía.
            await Pulsar("paso-ancha");
            var aviso = Raiz.Q("capa").ClassListContains("capa--abierta") && Raiz.Q<Label>("dialogo-titulo").text == "Antes de pegar la operación"
                        && Raiz.Q<Toggle>("dialogo-casilla").text == "Pegarla como texto, sin archivo";
            Anotar(aviso, "aviso de la operación", $"diálogo «{Raiz.Q<Label>("dialogo-titulo").text}», casilla «{Raiz.Q<Toggle>("dialogo-casilla").text}»");
            await Pulsar("dialogo-aceptar");
            await Esperar(() => Resultado.StartsWith("Operación pegada", StringComparison.Ordinal), 240);
            Anotar(Resultado == "Operación pegada en 6 de 7. No se pegó en: Mistral; cada uno dice qué pasó. Comprueba que el archivo quedó adjunto, revísala y envíala.",
                "resultado de la operación", Resultado);

            // Sin navegación de la app, la conversación vacía, el texto idéntico al armado y el archivo adjunto (historia 41).
            var bien = new List<string>();
            foreach (var id in Pool.Where(id => id != "mistral"))
            {
                var op = Ronda.OperacionDe(id);
                var navegaciones = Ronda.PanelDe(id).Navegaciones - navAntes[id];
                var vacio = (bool?)await Ronda.PanelDe(id).Correr("chatVacio", Spec) == true;
                var adjunto = (string)JsonEstricto.Leer(await En(id, "document.getElementById('archivo').textContent"));
                var ruta = Path.Combine(app.CarpetaDatos, "operaciones", op?.NombreArchivo ?? "-");
                if (op?.CuerpoArchivo != null && navegaciones == 0 && vacio && await Compositor(id) == op.Texto && File.Exists(ruta)
                    && adjunto == $"{op.NombreArchivo}|{new FileInfo(ruta).Length}" && File.ReadAllText(ruta) == op.CuerpoArchivo)
                    bien.Add(id);
            }
            Anotar(bien.Count == 6, "sin navegar, texto y archivo", $"{bien.Count} de 6: [{string.Join(",", bien)}]");
            Anotar(Hechos.OfType<Sello>().Count(s => s.RondaId == ronda) == 7, "sello de la ronda", $"{Hechos.OfType<Sello>().Count(s => s.RondaId == ronda)} etiquetas");

            Ronda.Seleccionar("mistral");
            var problema = Raiz.Q<Label>("cabecera-problema").text;
            Anotar(EstadoEnLaLista("mistral") == "Con problema" && problema.StartsWith("La operación no se pegó: este panel sigue en una conversación con mensajes", StringComparison.Ordinal)
                   && await Compositor("mistral") == "" && Ronda.OperacionDe("mistral") == null && Ronda.PanelDe("mistral").Navegaciones == navAntes["mistral"],
                "conversación con mensajes: no se pega ni se navega", $"«{EstadoEnLaLista("mistral")}»; {problema}");

            // Mistral otra vez, en una conversación nueva y por la vía del texto: el aviso ya se dio en esta ronda.
            Sucios.Remove("mistral");
            await AbrirConversacionNueva("mistral");
            await Pulsar("menu-panel");
            await Pulsar("item-Pegar la operación aquí como texto");
            var sinAviso = !Raiz.Q("capa").ClassListContains("capa--abierta");
            await Esperar(() => Resultado.StartsWith("Operación pegada en 1 de 1", StringComparison.Ordinal), 60);
            // El sondeo recorre los paneles de a uno: hasta su próxima vuelta por Mistral, la lista conserva lo que leyó de la
            // página sucia (un mensaje, «Parece terminado»). Antes la app navegaba y esperaba ahí; ahora la página la abre Juan.
            await Esperar(() => EstadoEnLaLista("mistral") == "Pegado, falta que envíes", 15);
            var opMistral = Ronda.OperacionDe("mistral");
            Anotar(sinAviso && opMistral?.CuerpoArchivo == null && opMistral.Texto.Contains("[[CC-MARCA-") && await Compositor("mistral") == opMistral.Texto
                   && EstadoEnLaLista("mistral") == "Pegado, falta que envíes",
                "operación como texto, con el aviso una vez por ronda", $"sin aviso: {sinAviso}; «{Resultado}»; «{EstadoEnLaLista("mistral")}»");

            // Los siete envían y responden con un hallazgo; la captura los registra como operación.
            foreach (var id in Pool) await Enviar(id);
            foreach (var id in Pool) await Responder(id, $"CONVERGENCIA|ALCANCE|P1,P2|Las respuestas coinciden en el punto central ({id}).");
            await Esperar(() => Paso == "Capturar los que terminaron (7)");
            await Pulsar("paso-ancha");
            await Esperar(() => Raiz.Q<Label>("barra-titulo").text == "Integración · 4 de 7", 60);
            var salidas = Hechos.OfType<SalidaOperador>().Where(x => x.RondaId == ronda).ToList();
            var hallazgos = Hechos.OfType<HallazgoHecho>().Count(h => salidas.Any(x => x.Id == h.SalidaOperadorId));
            Anotar(salidas.Count == 7 && salidas.All(x => x.PromptCompleto == Ronda.OperacionDe(x.OperadorId)?.PromptCompleto) && hallazgos == 7
                   && salidas.Single(x => x.OperadorId == "chatgpt").PromptCompleto.Contains("=== ARCHIVO ADJUNTO:") && Raiz.Q<Label>("barra-titulo").text == "Integración · 4 de 7",
                "capturar la operación", $"{salidas.Count} salidas con su prompt, {hallazgos} hallazgos; «{Raiz.Q<Label>("barra-titulo").text}»");

            await RecorridoDeRoles();

            // Ronda nueva con las respuestas copiadas, y un operador que reutiliza su operación.
            await Pulsar("menu-ronda");
            await Pulsar("item-Ronda nueva con las respuestas copiadas");
            await Pulsar("dialogo-aceptar");
            await Cuadros(5);
            var copiada = Ronda.Puerta.RondaActual;
            var copias = Hechos.OfType<Respuesta>().Where(r => r.RondaId == copiada).ToList();
            Anotar(copiada != ronda && Resultado.StartsWith("Ronda nueva abierta", StringComparison.Ordinal) && copias.Count == 7 && copias.All(r => r.CopiadaDe?.RondaId == ronda)
                   && Raiz.Q<Label>("barra-titulo").text == "Operación · 3 de 7",
                "ronda nueva con las respuestas copiadas", $"«{Resultado}»; {copias.Count} copias; «{Raiz.Q<Label>("barra-titulo").text}»");
            Anotar(Ronda.EnLaVista.SequenceEqual(Pool) && Pool.Contains(Ronda.Visible), "los roles salen del recorrido en la ronda nueva",
                $"en la vista [{string.Join(",", Ronda.EnLaVista)}], visible {Ronda.Visible}");
            // Reutilizar necesita el sello de la ronda nueva: primero se pega la operación en un panel, y el aviso vuelve.
            await AbrirConversacionNueva("gemini");
            Ronda.Seleccionar("gemini");
            await Esperar(() => Raiz.Q<Button>("accion-panel").text == "Pegar la operación aquí");
            await Pulsar("accion-panel");
            var deNuevo = Raiz.Q("capa").ClassListContains("capa--abierta") && Raiz.Q<Label>("dialogo-titulo").text == "Antes de pegar la operación";
            Anotar(deNuevo, "el aviso vuelve en la ronda nueva", $"diálogo abierto: {deNuevo}");
            await Pulsar("dialogo-aceptar");
            await Esperar(() => Resultado.StartsWith("Operación pegada en 1 de 1", StringComparison.Ordinal), 60);
            Ronda.Seleccionar("chatgpt");
            await Pulsar("menu-panel");
            await Pulsar("item-Usar su operación anterior");
            var reusada = Hechos.OfType<SalidaOperador>().SingleOrDefault(x => x.RondaId == copiada && x.OperadorId == "chatgpt");
            Anotar(Resultado.StartsWith("ChatGPT: se reutilizó", StringComparison.Ordinal) && reusada?.CopiadaDe?.RondaId == ronda && EstadoEnLaLista("chatgpt") == "Capturado",
                "usar la operación anterior", $"«{Resultado}»; «{EstadoEnLaLista("chatgpt")}»");

        }

        // ---------------------------------------------------------------- los roles y el informe (T22)

        /// <summary>Lo que hace el rol: responder en párrafos, como los proveedores que dejan cada línea en un &lt;p&gt;.</summary>
        Task ResponderEnParrafos(string id, params string[] lineas) => En(id,
            "(() => { const r = document.createElement('div'); r.className = 'respuesta'; for (const l of " + JsonConvert.SerializeObject(lineas) +
            ") { const p = document.createElement('p'); p.textContent = l; r.append(p); } document.getElementById('chat').append(r);" +
            " document.getElementById('detener')?.remove(); return 'ok'; })()");

        string Titulo => Raiz.Q<Label>("barra-titulo").text;
        bool Habilitado => Raiz.Q<Button>("paso-ancha").enabledSelf;

        async Task RecorridoDeRoles()
        {
            var ronda = Ronda.Puerta.RondaActual;
            using (var servidor = new ServidorDePrueba())
            {
                // Integración: el rol aparece en su etapa, en una conversación nueva, con el prompt idéntico.
                Anotar(Titulo == "Integración · 4 de 7" && Paso == "Pegar el prompt del integrador" && Habilitado && Ronda.PanelDe("deepseek") == null
                       && EstadoEnLaLista("deepseek") == "Integra y redacta",
                    "etapa Integración", $"«{Titulo}», «{Paso}»; sin página el integrador: {Ronda.PanelDe("deepseek") == null}; «{EstadoEnLaLista("deepseek")}»");
                await Pulsar("paso-ancha");
                await Esperar(() => Resultado.StartsWith("Prompt pegado", StringComparison.Ordinal) || Resultado.StartsWith("No se", StringComparison.Ordinal), 90);
                var promptIntegrador = Ronda.Puerta.ArmarPromptIntegrador();
                var vacio = Ronda.PanelDe("deepseek") != null && (bool?)await Ronda.PanelDe("deepseek").Correr("chatVacio", Spec) == true;
                Anotar(Resultado == "Prompt pegado en DeepSeek. Revísalo y envíalo." && vacio && await Compositor("deepseek") == promptIntegrador
                       && Ronda.Visible == "deepseek" && Ronda.EnLaVista.Count == 8 && EstadoEnLaLista("deepseek") == "Integra y redacta · Pegado, falta que envíes",
                    "pegar el integrador", $"«{Resultado}»; chat nuevo vacío: {vacio}; a la vista {Ronda.Visible}, {Ronda.EnLaVista.Count} en el recorrido; «{EstadoEnLaLista("deepseek")}»");

                await Enviar("deepseek");
                await ResponderEnParrafos("deepseek", "TITULO: Informe de prueba", "1. TIPOS DE DIVERGENCIA", "No hay divergencias de fondo [H2].",
                    "5. QUE CONVIENE RESCATAR", "Lo firme está en [H1].");
                await Esperar(() => Paso == "Capturar el informe del integrador" && Habilitado);
                await Pulsar("paso-ancha");
                await Esperar(() => Titulo == "Verificación · 5 de 7", 60);
                var informe = Hechos.OfType<InformeIntegrador>().SingleOrDefault(h => h.RondaId == ronda);
                Anotar(informe?.Titulo == "Informe de prueba" && informe.PromptCompleto == promptIntegrador && EstadoEnLaLista("deepseek") == "Integra y redacta · Capturado",
                    "capturar el integrador", $"título «{informe?.Titulo}»; prompt registrado idéntico: {informe?.PromptCompleto == promptIntegrador}; «{EstadoEnLaLista("deepseek")}»");

                // Recapturar el integrador después de su etapa (historia 58): gana el último.
                await ResponderEnParrafos("deepseek", "TITULO: Informe recapturado", "5. QUE CONVIENE RESCATAR", "Lo firme está en [H1] y en [H2].");
                await Pulsar("menu-ronda");
                await Pulsar("item-Recapturar el informe del integrador");
                await Esperar(() => Resultado.Contains("recaptur"), 60);
                var informes = Hechos.OfType<InformeIntegrador>().Where(h => h.RondaId == ronda).ToList();
                Anotar(informes.Count == 2 && informes.Last().Titulo == "Informe recapturado" && Resultado.StartsWith("DeepSeek: integrador recapturado", StringComparison.Ordinal),
                    "recapturar el integrador", $"«{Resultado}»; {informes.Count} informes, el último «{informes.LastOrDefault()?.Titulo}»");

                // Verificación: el prompt cita lo que rescata el último informe.
                Anotar(Paso == "Pegar el prompt del verificador" && Habilitado && Ronda.PanelDe("glm") == null, "etapa Verificación", $"«{Paso}»");
                await Pulsar("paso-ancha");
                await Esperar(() => Resultado.StartsWith("Prompt pegado", StringComparison.Ordinal) || Resultado.StartsWith("No se", StringComparison.Ordinal), 90);
                var promptVerificador = Ronda.Puerta.ArmarPromptVerificador();
                Anotar(Resultado == "Prompt pegado en GLM. Revísalo y envíalo." && await Compositor("glm") == promptVerificador && promptVerificador.Contains("[H2]")
                       && Ronda.Visible == "glm" && Ronda.EnLaVista.Count == 9,
                    "pegar el verificador", $"«{Resultado}»; a la vista {Ronda.Visible}, {Ronda.EnLaVista.Count} en el recorrido");
                await Enviar("glm");
                var b = $"http://127.0.0.1:{servidor.Puerto}";
                // Las del servidor local no se piden (T24): las formas raras de 127.0.0.1 prueban el System.Uri de IL2CPP.
                await ResponderEnParrafos("glm", "Reviso las fuentes.", $"CONFIRMA|OFICIAL|H1|{b}/ok|\"cita\"", "CONTRADICE|SECUNDARIA|H2|https://x.invalid/p|\"otra\"",
                    $"CONFIRMA|PRIMARIA|H1|{b}/404|\"no está\"", $"CONFIRMA|OFICIAL|H2|http://0x7f.0.0.1:{servidor.Puerto}/hex|\"hex\"",
                    $"CONFIRMA|OFICIAL|H1|http://2130706433:{servidor.Puerto}/entero|\"entero\"");
                await Esperar(() => Paso == "Capturar la verificación" && Habilitado);
                await Pulsar("paso-ancha");
                await Esperar(() => Titulo == "Redacción · 6 de 7", 60);
                var verificacion = Hechos.OfType<SalidaVerificador>().SingleOrDefault(h => h.RondaId == ronda);
                Anotar(verificacion?.PromptCompleto == promptVerificador && EstadoEnLaLista("glm") == "Verifica · Capturado",
                    "capturar la verificación", $"prompt registrado idéntico: {verificacion?.PromptCompleto == promptVerificador}; «{EstadoEnLaLista("glm")}»");

                // Redacción: el prompt y el archivo adjunto (historia 56).
                Anotar(Paso == "Pegar el prompt y el archivo del redactor" && Habilitado, "etapa Redacción", $"«{Paso}»");
                await Pulsar("paso-ancha");
                await Esperar(() => Resultado.StartsWith("Prompt pegado", StringComparison.Ordinal) || Resultado.StartsWith("No se", StringComparison.Ordinal), 90);
                var archivos = Directory.Exists(Path.Combine(app.CarpetaDatos, "redactor")) ? Directory.GetFiles(Path.Combine(app.CarpetaDatos, "redactor")) : new string[0];
                var adjunto = (string)JsonEstricto.Leer(await En("deepseek", "document.getElementById('archivo').textContent"));
                var esperado = archivos.Length == 1 ? $"{Path.GetFileName(archivos[0])}|{new FileInfo(archivos[0]).Length}" : "-";
                Anotar(Resultado == "Prompt pegado en DeepSeek. Comprueba que el archivo quedó adjunto, revísalo y envíalo." && await Compositor("deepseek") == Ronda.Puerta.ArmarRedactor().Prompt
                       && adjunto == esperado && File.ReadAllText(archivos[0]).Contains("[[CC-MARCA-FIN-"),
                    "pegar el redactor con el adjunto", $"«{Resultado}»; adjunto «{adjunto}», esperado «{esperado}»");
                await Enviar("deepseek");
                // La imagen apunta al servidor local: el panel del PDF no la pide (T24), la escribe como texto.
                await ResponderEnParrafos("deepseek", "Respuesta del redactor para la persona.", "Lo firme está en [H1].", $"![figura]({b}/imagen)");
                await Esperar(() => Paso == "Capturar la respuesta del redactor" && Habilitado);
                await Pulsar("paso-ancha");
                await Esperar(() => Titulo == "Informe · 7 de 7", 60);
                var redaccion = Hechos.OfType<RespuestaRedactor>().SingleOrDefault(h => h.RondaId == ronda);
                Anotar(redaccion != null && redaccion.MarcaUltima?.StartsWith("[[CC-MARCA-FIN-", StringComparison.Ordinal) == true && Paso == "Armar el informe" && Habilitado,
                    "capturar el redactor", $"marcas {redaccion?.MarcaPrimera} … {redaccion?.MarcaUltima}; «{Paso}»");

                // El informe: las URLs locales sin pedir, la carpeta con .md y PDF, y la carpeta que se abre.
                string abierta = null;
                Ronda.AbrirCarpeta = r => abierta = r;
                await Pulsar("paso-ancha");
                await Esperar(() => Resultado.StartsWith("Carpeta del informe", StringComparison.Ordinal) || Resultado.StartsWith("No se pudo", StringComparison.Ordinal), 300);
                var comprobadas = Hechos.OfType<UrlComprobada>().Where(u => u.RondaId == ronda).ToList();
                const string local = "es una dirección local o de la red privada: no se comprueba";
                var urls = comprobadas.Select(u => $"{u.Url} {u.Codigo?.ToString() ?? "sin código"} ({u.Detalle})").ToList();
                Anotar(comprobadas.Count == 5 && comprobadas.All(u => u.Codigo == null) && comprobadas.Count(u => u.Detalle == local) == 4 && servidor.Pedidos.Count == 0,
                    "las URLs locales y la imagen del PDF no se piden", $"{string.Join("; ", urls)}; pedidos al servidor: {string.Join("; ", servidor.Pedidos)}");
                var carpeta = Directory.Exists(Path.Combine(app.CarpetaDatos, "informes")) ? Directory.GetDirectories(Path.Combine(app.CarpetaDatos, "informes")).SingleOrDefault() : null;
                var nombre = carpeta == null ? "-" : Path.GetFileName(carpeta);
                var md = carpeta == null ? "" : File.ReadAllText(Path.Combine(carpeta, nombre + ".md"));
                var pdf = Path.Combine(carpeta ?? "-", nombre + ".pdf");
                var bytesPdf = File.Exists(pdf) ? System.Text.Encoding.ASCII.GetString(File.ReadAllBytes(pdf)) : "";
                var cabecera = bytesPdf.Length >= 5 ? bytesPdf.Substring(0, 5) : "";
                // Carta (D40): 612 × 792 puntos en cada página.
                var paginas = System.Text.RegularExpressions.Regex.Matches(bytesPdf, @"/MediaBox \[[^\]]*\]").Cast<System.Text.RegularExpressions.Match>().Select(m => m.Value).ToList();
                Anotar(nombre.EndsWith("Informe recapturado", StringComparison.Ordinal) && md.Contains("Respuesta del redactor para la persona.") && cabecera == "%PDF-" && bytesPdf.Length > 1000
                       && paginas.Count > 0 && paginas.All(p => p == "/MediaBox [0 0 612 792]"),
                    "informe en .md y PDF, en Carta", $"carpeta «{nombre}»; .md {md.Length} caracteres; PDF «{cabecera}» {bytesPdf.Length} bytes; páginas {string.Join(", ", paginas.Distinct())} ×{paginas.Count}");
                var respuestas = carpeta == null ? "-" : Path.Combine(carpeta, InformeFinal.SubcarpetaRespuestas);
                var mds = Directory.Exists(respuestas) ? Directory.GetFiles(respuestas, "*.md").Length : 0;
                var pdfs = Directory.Exists(respuestas) ? Directory.GetFiles(respuestas, "*.pdf").Count(f => new FileInfo(f).Length > 1000) : 0;
                Anotar(mds == 7 && pdfs == 7, "respuestas de los investigadores", $"{mds} .md y {pdfs} PDF");
                Anotar(abierta == carpeta && Resultado.EndsWith("URLs del verificador: responden 0 de 5.", StringComparison.Ordinal) && !Raiz.Q("resultado-ancha").ClassListContains("problema"),
                    "la carpeta se abre al terminar", $"abierta «{abierta}»; «{Resultado}»");

                // El adaptador real, directo contra el servidor local: el código de cada método, sin cookies.
                var adaptador = new HttpSinCookies();
                var codigos = new List<string>();
                foreach (var (ruta, metodo) in new[] { ("/ok", "HEAD"), ("/sin-head", "HEAD"), ("/sin-head", "GET"), ("/404", "GET") })
                    codigos.Add($"{metodo} {ruta} {await adaptador.Pedir(b + ruta, metodo, System.Threading.CancellationToken.None)}");
                var pedidos = servidor.Pedidos.OrderBy(x => x, StringComparer.Ordinal).ToList();
                Anotar(codigos.SequenceEqual(new[] { "HEAD /ok 200", "HEAD /sin-head 405", "GET /sin-head 200", "GET /404 404" })
                       && pedidos.SequenceEqual(new[] { "GET /404", "GET /sin-head", "HEAD /ok", "HEAD /sin-head" }),
                    "el adaptador HTTP, sin cookies", $"{string.Join("; ", codigos)}; el servidor vio {string.Join("; ", pedidos)}");
                Copiar(Path.Combine(app.CarpetaDatos, "informes"), salida + ".informe");
                // Para las capturas de la etapa Informe.
                Copiar(app.CarpetaDatos, salida + ".roles");

                // Ocultar y mostrar los roles (historia 59).
                await Pulsar("menu-ronda");
                await Pulsar("item-Ocultar los paneles de los roles");
                var oculto = Ronda.EnLaVista.SequenceEqual(Pool) && Pool.Contains(Ronda.Visible) && Ronda.PanelDe("glm").RectReal.x < 0 && EstadoEnLaLista("glm") == "Verifica";
                await Pulsar("menu-ronda");
                await Pulsar("item-Mostrar los paneles de los roles");
                await Esperar(() => Ronda.EnLaVista.Count == 9);
                Anotar(oculto && Ronda.EnLaVista.Count == 9 && EstadoEnLaLista("glm") == "Verifica · Capturado", "ocultar y mostrar los roles",
                    $"ocultos: {oculto}; mostrados: {Ronda.EnLaVista.Count} en el recorrido");
            }
        }

        /// <summary>
        /// Un servidor HTTP en 127.0.0.1 para la comprobación de URLs con el adaptador real: /404 da 404, /sin-head
        /// rechaza HEAD con 405, lo demás 200. Anota método y ruta, y "cookie" si el pedido trae cookies.
        /// </summary>
        sealed class ServidorDePrueba : IDisposable
        {
            readonly System.Net.Sockets.TcpListener escucha = new System.Net.Sockets.TcpListener(System.Net.IPAddress.Loopback, 0);
            readonly List<string> pedidos = new List<string>();

            public ServidorDePrueba()
            {
                escucha.Start();
                _ = Atender();
            }

            public int Puerto => ((System.Net.IPEndPoint)escucha.LocalEndpoint).Port;

            public List<string> Pedidos
            {
                get
                {
                    lock (pedidos) return pedidos.ToList();
                }
            }

            async Task Atender()
            {
                for (;;)
                {
                    System.Net.Sockets.TcpClient cliente;
                    try
                    {
                        cliente = await escucha.AcceptTcpClientAsync();
                    }
                    catch (Exception)
                    {
                        return; // cerrado
                    }
                    _ = Responder(cliente);
                }
            }

            async Task Responder(System.Net.Sockets.TcpClient cliente)
            {
                using (cliente)
                {
                    var flujo = cliente.GetStream();
                    var lector = new StreamReader(flujo, System.Text.Encoding.ASCII);
                    var partes = ((await lector.ReadLineAsync()) ?? "").Split(' ');
                    var cookie = false;
                    for (var h = await lector.ReadLineAsync(); !string.IsNullOrEmpty(h); h = await lector.ReadLineAsync())
                        cookie |= h.StartsWith("Cookie:", StringComparison.OrdinalIgnoreCase);
                    if (partes.Length < 2) return;
                    lock (pedidos) pedidos.Add($"{partes[0]} {partes[1]}{(cookie ? " cookie" : "")}");
                    var codigo = partes[1] == "/404" ? 404 : partes[1] == "/sin-head" && partes[0] == "HEAD" ? 405 : 200;
                    var bytes = System.Text.Encoding.ASCII.GetBytes($"HTTP/1.1 {codigo} Prueba\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                    await flujo.WriteAsync(bytes, 0, bytes.Length);
                }
            }

            public void Dispose() => escucha.Stop();
        }

        static void Copiar(string desde, string hasta)
        {
            foreach (var archivo in Directory.GetFiles(desde, "*", SearchOption.AllDirectories))
            {
                var relativa = archivo.Substring(desde.Length).TrimStart(Path.DirectorySeparatorChar);
                if (relativa.StartsWith("navegador", StringComparison.Ordinal)) continue;
                var destino = Path.Combine(hasta, relativa);
                Directory.CreateDirectory(Path.GetDirectoryName(destino));
                File.Copy(archivo, destino, true);
            }
        }
    }
}
