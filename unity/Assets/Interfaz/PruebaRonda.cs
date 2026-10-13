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
        /// <summary>Un compositor y un chat (autoprueba/textarea.html); el parámetro solo distingue las páginas.</summary>
        public static string Url(string id) => $"https://cc-prueba.test/textarea.html?p={id}";

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
            var apartada = Ronda.PanelDe(Ronda.Visible).RectReal.ancho == 0;
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
            await Esperar(() => Raiz.Q<Button>("accion-panel").text == "Capturar este panel");
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
            Anotar(Raiz.Q<Label>("barra-titulo").text == "Operación · 3 de 7" && Paso == "Pegar la operación en los paneles" && !Raiz.Q<Button>("paso-ancha").enabledSelf,
                "fin de la investigación", $"\"{Raiz.Q<Label>("barra-titulo").text}\", \"{Paso}\" deshabilitado hasta T21");

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
            Anotar(sinEnvio?.Prompt == Puerta.PromptSinRonda && sinEnvio.Indice == 1 && Hechos.OfType<Respuesta>().Count(r => r.RondaId == sinEnvio.Id) == 7,
                "capturar sin pegar", $"ronda {sinEnvio?.Indice} con el marcador; {Hechos.OfType<Respuesta>().Count(r => r.RondaId == sinEnvio?.Id)} respuestas; \"{Paso}\"");
            await Pulsar("paso-ancha");
            Raiz.Q<TextField>("dialogo-campo").value = AMano;
            await Pulsar("dialogo-aceptar");
            await Cuadros(5);
            var declarada = Hechos.OfType<PreguntaDeclarada>().SingleOrDefault();
            Anotar(declarada?.Texto == AMano && declarada.RondaId == sinEnvio?.Id && Raiz.Q<Label>("barra-titulo").text == "Operación · 3 de 7",
                "declarar la pregunta", $"\"{declarada?.Texto}\"; \"{Raiz.Q<Label>("barra-titulo").text}\"");
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
