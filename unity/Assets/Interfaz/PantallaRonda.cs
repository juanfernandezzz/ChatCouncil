using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using ChatCouncil.Motor;
using ChatCouncil.Panel;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UIElements;

namespace ChatCouncil.Interfaz
{
    // Dentro de ChatCouncil.*, "Panel" sería el namespace ChatCouncil.Panel y no la clase.
    using Panel = ChatCouncil.Panel.Panel;

    /// <summary>
    /// La pantalla de Ronda conectada (T20): los paneles del pool apilados en el área de la página, la guía
    /// con el paso que da el motor, y las etapas Pregunta e Investigación (docs/FASE6-INTERFAZ.md §3).
    /// Todo lo que se registra pasa por la Puerta del motor; la interfaz nunca decide la etapa.
    /// </summary>
    public sealed class PantallaRonda
    {
        /// <summary>Cada cuánto se pregunta a cada página si sigue respondiendo (el indicador del panel).</summary>
        const int SondeoMs = 1500;
        const int EscrituraMs = 60_000;

        static readonly string[] Etapas = { "pregunta", "investigacion", "operacion", "integracion", "verificacion", "redaccion", "informe" };
        static readonly string[] NombresEtapa = { "Pregunta", "Investigación", "Operación", "Integración", "Verificación", "Redacción", "Informe" };

        /// <summary>El estado de Puerta.EstadoDePanel: su símbolo (IconoEstado) y su palabra.</summary>
        static readonly Dictionary<string, (string Icono, string Palabra)> Estados = new Dictionary<string, (string, string)>
        {
            ["por-pegar"] = ("por-pegar", "Por pegar"),
            ["pegado-falta-enviar"] = ("falta-enviar", "Pegado, falta que envíes"),
            ["respondiendo"] = ("respondiendo", "Respondiendo"),
            ["parece-terminado-observado"] = ("terminado", "Parece terminado"),
            ["parece-terminado-deducido"] = ("terminado", "Parece terminado"),
            ["capturado"] = ("capturado", "Capturado"),
            ["con-problema"] = ("problema", "Con problema"),
        };

        const string PegarAqui = "Pegar la pregunta aquí";
        const string CapturarEste = "Capturar este panel";

        readonly VisualElement raiz;
        readonly string carpetaDatos;
        readonly Func<Task> iniciarNavegador;
        readonly Func<string, string> urlDe, specDe;
        readonly Dictionary<string, Panel> paneles = new Dictionary<string, Panel>();
        readonly Dictionary<string, string> fallaAlAbrir = new Dictionary<string, string>();
        readonly Dictionary<string, (bool? Generando, string Fin)> pagina = new Dictionary<string, (bool?, string)>();
        readonly Dictionary<string, int> navegacionesAlCapturar = new Dictionary<string, int>();
        RolesElegidos roles;
        List<string> activos, pool;
        string visible, etapaMostrada;
        bool frasePlegada, avisoOmitido, seccionVisible = true, capaAbierta, ocupado, sondeando;
        Action<string, bool> alAceptar;

        public Puerta Puerta { get; private set; }
        public List<string> Operadores { get; private set; } = new List<string>();
        public string Visible => visible;
        public Panel PanelDe(string id) => paneles.TryGetValue(id, out var p) ? p : null;

        /// <param name="urlDe">La página de cada proveedor: la de su spec, o una de prueba.</param>
        /// <param name="specDe">La spec de cada proveedor, en JSON: la de specs.json, o una de prueba.</param>
        public PantallaRonda(VisualElement raiz, string carpetaDatos, Func<Task> iniciarNavegador, Func<string, string> urlDe, Func<string, string> specDe)
        {
            this.raiz = raiz;
            this.carpetaDatos = carpetaDatos;
            this.iniciarNavegador = iniciarNavegador;
            this.urlDe = urlDe;
            this.specDe = specDe;

            void Al(string nombre, Action accion) => raiz.Q<Button>(nombre).clicked += accion;
            Al("paso-ancha", Paso);
            Al("paso-angosta", Paso);
            Al("accion-panel", AccionDelPanel);
            Al("menu-panel", () => AbrirMenu(raiz.Q("menu-panel"), ItemsDelPanel()));
            Al("menu-ronda", () => AbrirMenu(raiz.Q("menu-ronda"), ItemsDeLaRonda()));
            Al("menu-angosta", () => AbrirMenu(raiz.Q("menu-angosta"), ItemsDelPanel().Concat(ItemsDeLaRonda()).ToList()));
            Al("ver-todos", () => AbrirMenu(raiz.Q("ver-todos"), ItemsDePaneles()));
            Al("anterior", () => Mover(-1));
            Al("siguiente", () => Mover(1));
            Al("plegar-frase", PlegarFrase);
            Al("abrir-frase", () => { frasePlegada = false; Refrescar(); });
            Al("capa-fondo", CerrarCapa);
            Al("dialogo-cancelar", CerrarCapa);
            Al("dialogo-aceptar", () =>
            {
                var accion = alAceptar;
                var valor = raiz.Q<TextField>("dialogo-campo").value;
                var marcada = raiz.Q<Toggle>("dialogo-casilla").value;
                CerrarCapa();
                accion?.Invoke(valor, marcada);
            });

            // Dos campos, uno por clase de ancho, con el mismo texto.
            var ancha = raiz.Q<TextField>("pregunta-ancha");
            var angosta = raiz.Q<TextField>("pregunta-angosta");
            ancha.RegisterValueChangedCallback(e => angosta.SetValueWithoutNotify(e.newValue));
            angosta.RegisterValueChangedCallback(e => ancha.SetValueWithoutNotify(e.newValue));

            raiz.Q("pagina-ancha").RegisterCallback<GeometryChangedEvent>(_ => Ubicar());
            raiz.Q("pagina-angosta").RegisterCallback<GeometryChangedEvent>(_ => Ubicar());
        }

        public string Pregunta
        {
            get => raiz.Q<TextField>("pregunta-ancha").value;
            set => raiz.Q<TextField>("pregunta-ancha").value = value;
        }

        // ---------------------------------------------------------------- armado

        /// <summary>El consejo del archivo de selección (o los nueve con los roles por defecto) y la ronda activa del registro.</summary>
        public void Armar()
        {
            string contenido = null;
            try
            {
                var archivo = Path.Combine(carpetaDatos, Roles.ArchivoSeleccion);
                if (File.Exists(archivo)) contenido = File.ReadAllText(archivo, Encoding.UTF8);
            }
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
            {
                // ilegible: como sin archivo (seleccion-proveedores.ts)
            }
            activos = Roles.LeerSeleccion(contenido, Roles.Conocidos) ?? Roles.Conocidos.ToList();
            roles = Roles.Leer(contenido, Roles.Conocidos);
            pool = Roles.PoolDeInvestigadores(Roles.Conocidos, roles);
            Puerta = new Puerta(carpetaDatos, () => Guid.NewGuid().ToString(), () => DateTimeOffset.Now, activos, roles, pool);
            Puerta.RestaurarRondaActiva();
            // La pregunta va solo a los operadores cargados, nunca a los roles (historia 26).
            Operadores = pool.Where(activos.Contains).ToList();
            visible = Operadores.FirstOrDefault();

            var lista = raiz.Q<ScrollView>("lista");
            lista.Clear();
            lista.Add(Titulo($"Operadores ({Operadores.Count})"));
            foreach (var id in Operadores)
            {
                var fila = Fila(id, "");
                fila.RegisterCallback<ClickEvent>(_ => Seleccionar(id));
                lista.Add(fila);
            }
            lista.Add(Titulo("Roles (aparecen en su etapa)"));
            lista.Add(Fila(roles.Integrador, roles.Redactor == roles.Integrador ? "Integra y redacta" : "Integra"));
            lista.Add(Fila(roles.Verificador, "Verifica"));
            if (roles.Redactor != roles.Integrador) lista.Add(Fila(roles.Redactor, "Redacta"));
            Refrescar();
        }

        /// <summary>Abre una página por operador, apiladas en el área de la página, y empieza a mirar su estado.</summary>
        public async Task Conectar()
        {
            try
            {
                await iniciarNavegador();
            }
            catch (Exception e)
            {
                foreach (var id in Operadores) fallaAlAbrir[id] = e.Message;
                Refrescar();
                return;
            }
            await Task.WhenAll(Operadores.Select(async id =>
            {
                try
                {
                    paneles[id] = await Paneles.Crear(id, urlDe(id));
                }
                catch (Exception e)
                {
                    fallaAlAbrir[id] = e.Message;
                }
            }));
            Ubicar();
            Refrescar();
            if (!sondeando) Sondear();
        }

        async void Sondear()
        {
            sondeando = true;
            for (;;)
            {
                foreach (var id in Operadores.ToList())
                {
                    if (!paneles.TryGetValue(id, out var p)) continue;
                    try
                    {
                        var e = await p.Correr("estado", specDe(id), esperaMs: 5_000);
                        pagina[id] = ((bool?)e["generando"], (string)e["fin"]);
                    }
                    catch (Exception)
                    {
                        pagina.Remove(id); // la página está cargando o navegó: sin dato, no se inventa uno
                    }
                }
                if (raiz.panel == null) return;
                Refrescar();
                await Task.Delay(SondeoMs);
            }
        }

        static Label Titulo(string texto)
        {
            var l = new Label(texto);
            l.AddToClassList("lista-titulo");
            return l;
        }

        static VisualElement Fila(string id, string texto)
        {
            var fila = new VisualElement { name = "fila-" + id };
            fila.AddToClassList("fila-panel");
            var nombre = new Label(Dominio.NombreProveedor(id));
            nombre.AddToClassList("fila-nombre");
            nombre.AddToClassList("semibold");
            var estado = new Label(texto);
            estado.AddToClassList("fila-estado");
            fila.Add(new IconoEstado());
            fila.Add(nombre);
            fila.Add(estado);
            return fila;
        }

        // ---------------------------------------------------------------- estado a la vista

        public string EstadoDe(string id)
        {
            var (generando, fin) = pagina.TryGetValue(id, out var p) ? p : (null, null);
            return Puerta.EstadoDePanel(id, generando, fin);
        }

        /// <summary>La etapa que dice el registro; sin ronda abierta, la Pregunta.</summary>
        string EtapaDelRegistro() =>
            Puerta.RondaActual == null ? "pregunta" : Dominio.EtapaDeRonda(Puerta.LeerRegistro().Hechos, Puerta.RondaActual, pool.Count);

        static bool Terminado(string estado) => estado.StartsWith("parece-terminado", StringComparison.Ordinal);

        /// <summary>
        /// Qué pasó y qué hacer (D9): la cabecera del PC lleva el detalle; el selector del teléfono, una línea corta
        /// que dice dónde está la acción (H7). Y la acción que corresponde a ese estado (D6).
        /// </summary>
        (string Problema, string Corto, string Accion) Situacion(string id, string etapa)
        {
            if (fallaAlAbrir.TryGetValue(id, out var f))
                return ($"La página no se pudo abrir: {f}. Cierra y vuelve a abrir la app.", "La página no se abrió: cierra y abre la app.", null);
            if (etapa != "investigacion") return (null, null, null);
            var estado = EstadoDe(id);
            if (estado == "por-pegar") return (null, null, PegarAqui);
            if (Terminado(estado)) return (null, null, CapturarEste);
            if (estado != "con-problema") return (null, null, null);
            var hechos = Puerta.LeerRegistro().Hechos;
            var respuesta = hechos.OfType<Respuesta>().LastOrDefault(r => r.RondaId == Puerta.RondaActual && r.ProveedorId == id);
            if (respuesta != null)
                return ($"La captura no sirvió: {respuesta.Error}. Revisa la página y vuelve a capturar.", "La captura no sirvió: captura otra vez desde «Más…».", CapturarEste);
            var intento = hechos.OfType<Intento>().LastOrDefault(i => i.RondaId == Puerta.RondaActual && i.ProveedorId == id);
            // El intento fallido no se borra: si después se pegó aquí y la página ya terminó, lo que corresponde es capturar.
            var termino = pagina.TryGetValue(id, out var p) && p.Fin != null;
            return termino
                ? ($"La pregunta no se pegó con los demás ({intento?.Error}), pero la página ya respondió: captúrala.", "Ya respondió: captúrala desde «Más…».", CapturarEste)
                : ($"La pregunta no se pegó: {intento?.Error}. Revisa el compositor y vuelve a pegarla.", "No se pegó: pégala otra vez desde «Más…».", PegarAqui);
        }

        public void Refrescar()
        {
            if (Puerta == null) return;
            var paso = Puerta.PasoSiguiente();
            var etapa = EtapaDelRegistro();
            if (paso.Etapa != etapaMostrada)
            {
                etapaMostrada = paso.Etapa;
                frasePlegada = false; // la frase a la vista al entrar en cada etapa (H1)
            }

            var actual = Array.IndexOf(Etapas, paso.Etapa);
            int j = 0;
            raiz.Query(className: "etapa").ForEach(e =>
            {
                e.EnableInClassList("etapa--hecha", j < actual);
                e.EnableInClassList("etapa--actual", j == actual);
                j++;
            });
            j = 0;
            raiz.Q(className: "progreso").Query(className: "etapa-barra").ForEach(e =>
            {
                e.EnableInClassList("etapa-barra--hecha", j < actual);
                e.EnableInClassList("etapa-barra--actual", j == actual);
                j++;
            });
            raiz.EnableInClassList("etapa-pregunta", paso.Etapa == "pregunta");
            raiz.Q<Label>("barra-titulo").text = $"{NombresEtapa[actual]} · {actual + 1} de {Etapas.Length}";

            var estados = Operadores.ToDictionary(id => id, EstadoDe);
            int enviados = estados.Values.Count(e => e == "respondiendo" || Terminado(e) || e == "capturado");
            int terminados = estados.Values.Count(Terminado);
            int capturados = estados.Values.Count(e => e == "capturado");

            var (texto, habilitado) = TextoDelPaso(paso, terminados);
            foreach (var nombre in new[] { "paso-ancha", "paso-angosta" })
            {
                var b = raiz.Q<Button>(nombre);
                b.text = texto;
                b.SetEnabled(habilitado && !ocupado);
            }
            raiz.Q<Label>("frase-ancha").text = raiz.Q<Label>("frase-angosta").text = paso.Recordatorio;
            raiz.Q("frase-abierta").style.display = frasePlegada ? DisplayStyle.None : DisplayStyle.Flex;
            raiz.Q("abrir-frase").style.display = frasePlegada ? DisplayStyle.Flex : DisplayStyle.None;
            var n = Operadores.Count;
            raiz.Q<Label>("contadores-ancha").text = etapa == "investigacion" ? $"Enviados {enviados} de {n} · Parecen terminados {terminados} · Capturados {capturados}" : "";
            raiz.Q<Label>("contadores-angosta").text = etapa == "investigacion" ? $"{enviados} de {n} enviados · {terminados} terminados" : "";

            foreach (var id in Operadores)
            {
                var fila = raiz.Q("fila-" + id);
                var (icono, palabra) = Estados[estados[id]];
                fila.Q<IconoEstado>().Estado = icono;
                fila.Q<Label>(className: "fila-estado").text = palabra;
                fila.EnableInClassList("fila-panel--actual", id == visible);
            }
            foreach (var id in new[] { roles.Integrador, roles.Verificador, roles.Redactor })
                raiz.Q("fila-" + id).Q<IconoEstado>().Estado = Estados[Puerta.EstadoDePanel(id, null, null)].Icono;

            if (visible != null)
            {
                var (icono, palabra) = Estados[estados[visible]];
                var (problema, corto, accion) = Situacion(visible, etapa);
                raiz.Q<IconoEstado>("icono-cabecera").Estado = raiz.Q<IconoEstado>("icono-selector").Estado = icono;
                raiz.Q<Label>("cabecera-titulo").text = $"{Dominio.NombreProveedor(visible)} · {palabra}";
                raiz.Q<Label>("selector-texto").text = $"{Dominio.NombreProveedor(visible)} · {palabra} · {Operadores.IndexOf(visible) + 1} de {n}";
                foreach (var (nombre, linea) in new[] { ("cabecera-problema", problema), ("selector-problema", corto) })
                {
                    raiz.Q<Label>(nombre).text = linea ?? "";
                    raiz.Q(nombre).style.display = linea == null ? DisplayStyle.None : DisplayStyle.Flex;
                }
                var b = raiz.Q<Button>("accion-panel");
                b.text = accion ?? "";
                b.style.display = accion == null ? DisplayStyle.None : DisplayStyle.Flex;
                b.SetEnabled(!ocupado);
            }
            Aplicacion.AplicarSemibold(raiz);
        }

        /// <summary>El texto del botón primario y si se puede usar ahora. Lo imposible queda deshabilitado (D7).</summary>
        static (string, bool) TextoDelPaso(Paso paso, int terminados)
        {
            switch (paso.Accion)
            {
                case "pegar-pregunta": return (paso.Texto, true);
                case "capturar" when paso.Etapa == "investigacion": return ($"{paso.Texto} ({terminados})", terminados > 0);
                case "declarar-pregunta": return (paso.Texto, true);
                default: return (paso.Texto, false); // las etapas siguientes se conectan en T21 y T22
            }
        }

        void Resultado(string texto, bool problema = false)
        {
            foreach (var nombre in new[] { "resultado-ancha", "resultado-angosta" })
            {
                var l = raiz.Q<Label>(nombre);
                l.text = texto;
                l.EnableInClassList("problema", problema);
            }
        }

        public string TextoDelResultado => raiz.Q<Label>("resultado-ancha").text;

        // ---------------------------------------------------------------- paneles

        public void Seleccionar(string id)
        {
            visible = id;
            Ubicar();
            Refrescar();
        }

        void Mover(int paso)
        {
            if (Operadores.Count == 0) return;
            var i = (Operadores.IndexOf(visible) + paso + Operadores.Count) % Operadores.Count;
            Seleccionar(Operadores[i]);
        }

        public void PlegarFrase()
        {
            frasePlegada = true;
            Refrescar();
        }

        public void MostrarSeccion(bool visibleAhora)
        {
            seccionVisible = visibleAhora;
            if (!visibleAhora) CerrarCapa();
            Ubicar();
        }

        /// <summary>
        /// Las páginas nativas van apiladas sobre el área de la página; la del panel visible, al frente. Fuera de la
        /// Ronda, o con un menú o un diálogo abierto, se apartan: van encima de todo lo que dibuja Unity.
        /// </summary>
        void Ubicar()
        {
            if (paneles.Count == 0 || raiz.panel == null) return;
            var area = raiz.Q(raiz.ClassListContains("ancha") ? "pagina-ancha" : "pagina-angosta").worldBound;
            var k = Screen.width / raiz.panel.visualTree.worldBound.width;
            var mostrar = seccionVisible && !capaAbierta && visible != null && paneles.ContainsKey(visible) && area.width > 0;
            foreach (var p in paneles.Values)
            {
                if (mostrar) p.Rect(Mathf.RoundToInt(area.x * k), Mathf.RoundToInt(area.y * k), Mathf.RoundToInt(area.width * k), Mathf.RoundToInt(area.height * k));
                else p.Rect(0, 0, 0, 0);
            }
            if (mostrar) paneles[visible].Frente();
        }

        // ---------------------------------------------------------------- acciones

        void Paso()
        {
            var paso = Puerta.PasoSiguiente();
            switch (paso.Accion)
            {
                case "pegar-pregunta":
                    PegarPregunta();
                    break;
                case "capturar" when paso.Etapa == "investigacion":
                    _ = Capturar(Operadores.Where(id => Terminado(EstadoDe(id))).ToList());
                    break;
                case "declarar-pregunta":
                    DialogoDeclarar();
                    break;
            }
        }

        void AccionDelPanel()
        {
            var accion = raiz.Q<Button>("accion-panel").text;
            if (accion == PegarAqui) _ = PegarEnEste();
            else if (accion == CapturarEste) _ = Capturar(new List<string> { visible });
        }

        /// <summary>Pegar en los operadores, después del aviso de capacidades (historia 20), que se puede omitir en esta sesión.</summary>
        void PegarPregunta()
        {
            var texto = Pregunta;
            if (string.IsNullOrWhiteSpace(texto))
            {
                Resultado("Escribe la pregunta antes de pegarla.", true);
                return;
            }
            if (avisoOmitido)
            {
                _ = Difundir(texto);
                return;
            }
            AbrirDialogo("Antes de pegar la pregunta",
                $"En cada panel, activa a mano lo que quieras que use el proveedor: la búsqueda web o la investigación profunda. La app pega la pregunta en los {Operadores.Count} paneles; tú la revisas y la envías en cada uno.",
                false, "No volver a avisar en esta sesión", $"Pegar en los {Operadores.Count}",
                (campo, marcada) =>
                {
                    avisoOmitido = marcada;
                    _ = Difundir(texto);
                });
        }

        async Task<(string Id, bool Ok, string Error)> Escribir(string id, string texto)
        {
            if (!paneles.TryGetValue(id, out var p)) return (id, false, "el panel no está abierto");
            try
            {
                var r = await p.Correr("escribir", specDe(id), texto, EscrituraMs);
                var ok = (bool?)r["ok"] == true;
                return (id, ok, ok ? null : (string)r["error"]);
            }
            catch (Exception e)
            {
                return (id, false, e.Message);
            }
        }

        /// <summary>Pega en todos a la vez; un fallo no tumba a los demás. Después abre la ronda y registra un intento por proveedor.</summary>
        async Task Difundir(string texto)
        {
            ocupado = true;
            Resultado("Pegando la pregunta…");
            Refrescar();
            var resultados = await Task.WhenAll(Operadores.Select(id => Escribir(id, texto)));
            Puerta.AbrirRonda(texto);
            Puerta.RegistrarIntentos(resultados);
            var ok = resultados.Count(r => r.Ok);
            ocupado = false;
            Resultado(ok == resultados.Length
                ? $"Pegada en los {ok} paneles. Revísala y envíala en cada uno."
                : $"Pegada en {ok} de {resultados.Length}. Los que fallaron dicen qué hacer en su cabecera.", ok < resultados.Length);
            Refrescar();
        }

        /// <summary>
        /// Reintenta el pegado en el panel visible: sin ronda nueva ni intento (historia 29). Pega la pregunta de la
        /// ronda; nunca escribe encima de un borrador (historia 30, lo garantiza el script de página).
        /// </summary>
        async Task PegarEnEste()
        {
            var id = visible;
            var hechos = Puerta.LeerRegistro().Hechos;
            var ronda = hechos.OfType<Ronda>().FirstOrDefault(r => r.Id == Puerta.RondaActual);
            var texto = ronda == null ? null : Dominio.PreguntaEfectivaDeRonda(hechos, ronda);
            if (texto == null)
            {
                Resultado("Esta ronda no tiene una pregunta que pegar.", true);
                return;
            }
            ocupado = true;
            Refrescar();
            var (_, ok, error) = await Escribir(id, texto);
            ocupado = false;
            Resultado(ok ? $"Pegada en {Dominio.NombreProveedor(id)}. Revísala y envíala." : $"No se pegó en {Dominio.NombreProveedor(id)}: {error}", !ok);
            Refrescar();
        }

        /// <summary>La lectura de un panel, con el informe que algunos proveedores dejan en un iframe de otro origen.</summary>
        async Task<Lectura> Leer(string id)
        {
            if (!paneles.TryGetValue(id, out var p)) return new Lectura { Id = id, Text = "", Generating = false, Error = "el panel no está abierto" };
            try
            {
                var spec = specDe(id);
                var j = await p.Correr("leer", spec, esperaMs: 60_000);
                var l = new Lectura
                {
                    Id = id,
                    Text = (string)j["text"] ?? "",
                    Generating = (bool?)j["generating"],
                    CompletionKind = (string)j["completionKind"],
                    QuiescenceMs = (int?)j["quiescenceMs"],
                    ModelLabel = (string)j["modelLabel"],
                    UserText = (string)j["userText"],
                    FuentesHref = (int?)j["fuentesHref"],
                    Html = (string)j["html"],
                };
                if ((bool?)j["informeEnIframe"] != true) return l;
                // completarInformeEnIframe de Electron: el informe reemplaza al aviso y el html guarda los dos.
                var informe = await p.LeerInformeEnIframe(spec);
                var texto = (string)informe?["texto"];
                if (!string.IsNullOrWhiteSpace(texto))
                {
                    l.Text = texto;
                    l.Html = (l.Html ?? "") + "\n" + (string)informe["html"];
                    return l;
                }
                var frame = (string)JObject.Parse(spec)["informeEnIframe"]?["frameUrl"];
                return l.ConError($"el informe de {Dominio.NombreProveedor(id)} está en un iframe ({frame}) que no se pudo leer: la burbuja sola no es la respuesta");
            }
            catch (Exception e)
            {
                return new Lectura { Id = id, Text = "", Generating = false, Error = e.Message };
            }
        }

        /// <summary>La continuidad de hilo (continuidadDe de Electron) y el tamaño del panel al capturar.</summary>
        (string, string) Contexto(string id)
        {
            if (!paneles.TryGetValue(id, out var p)) return ("indeterminada", null);
            var continuidad = !navegacionesAlCapturar.TryGetValue(id, out var previa) ? "indeterminada"
                : previa == p.Navegaciones ? "confirmada" : "refutada";
            var r = p.RectReal;
            return (continuidad, r.ancho > 0 ? $"{r.ancho}x{r.alto}" : null);
        }

        /// <summary>Lee esos paneles y los registra según la etapa que dice el registro (historias 33 a 37).</summary>
        public async Task Capturar(List<string> ids)
        {
            if (ids.Count == 0) return;
            ocupado = true;
            Resultado("Capturando…");
            Refrescar();
            var lecturas = await Task.WhenAll(ids.Select(Leer));
            var (_, aviso) = Puerta.RegistrarCapturas(lecturas, Contexto);
            foreach (var par in paneles) navegacionesAlCapturar[par.Key] = par.Value.Navegaciones;
            ocupado = false;
            var fallidas = lecturas.Where(l => !string.IsNullOrEmpty(l.Error) || l.Text.Length < Puerta.UmbralLecturaMinimo).Select(l => Dominio.NombreProveedor(l.Id)).ToList();
            var texto = $"Capturados {lecturas.Length - fallidas.Count} de {lecturas.Length}."
                        + (fallidas.Count > 0 ? $" Con problema: {string.Join(", ", fallidas)}." : "")
                        + (string.IsNullOrEmpty(aviso) ? "" : " " + aviso);
            // Como en Electron: el aviso de prompts es un problema solo si empieza con la señal de advertencia (U+26A0).
            var advierte = aviso != null && aviso.StartsWith(((char)0x26A0).ToString(), StringComparison.Ordinal);
            Resultado(texto, fallidas.Count > 0 || advierte);
            Refrescar();
        }

        void DialogoDeclarar()
        {
            AbrirDialogo("Declarar la pregunta de esta ronda",
                "Las respuestas se capturaron sin pegar la pregunta con la app. Escribe la pregunta que hiciste: queda en el registro junto a la ronda, sin reescribirla.",
                true, null, "Declarar", (texto, _) =>
                {
                    if (string.IsNullOrWhiteSpace(texto))
                    {
                        Resultado("La pregunta declarada no puede quedar vacía.", true);
                        return;
                    }
                    Puerta.DeclararPregunta(texto);
                    Resultado("Pregunta declarada.");
                    Refrescar();
                });
        }

        void DialogoAbandonar()
        {
            AbrirDialogo("Abandonar la ronda",
                "La ronda queda en el registro tal como está y vuelves a la etapa Pregunta. Si cierras la app antes de pegar la pregunta nueva, al abrirla vuelve esta ronda.",
                false, null, "Abandonar la ronda", (_, __) =>
                {
                    Puerta.AbandonarRonda();
                    navegacionesAlCapturar.Clear();
                    Resultado("Ronda abandonada. Escribe la pregunta nueva.");
                    Refrescar();
                });
        }

        // ---------------------------------------------------------------- menús (D6, D7)

        sealed class Item
        {
            public string Grupo, Texto, Motivo;
            public Action Accion;
        }

        List<Item> ItemsDelPanel()
        {
            var accion = visible == null ? null : Situacion(visible, EtapaDelRegistro()).Accion;
            var grupo = "Este panel" + (visible == null ? "" : ": " + Dominio.NombreProveedor(visible));
            return new List<Item>
            {
                new Item { Grupo = grupo, Texto = PegarAqui, Accion = () => _ = PegarEnEste(),
                    Motivo = accion == PegarAqui ? null : "Solo cuando el panel está por pegar o el pegado falló." },
                new Item { Grupo = grupo, Texto = CapturarEste, Accion = () => _ = Capturar(new List<string> { visible }),
                    Motivo = accion == CapturarEste ? null : "Solo cuando el panel parece terminado o su captura falló." },
            };
        }

        List<Item> ItemsDeLaRonda()
        {
            var sinRonda = Puerta.RondaActual == null;
            var paso = Puerta.PasoSiguiente();
            return new List<Item>
            {
                new Item { Grupo = "Ronda", Texto = "Capturar lo que ya está en los paneles", Accion = () => _ = Capturar(Operadores.ToList()),
                    Motivo = sinRonda ? null : "Ya hay una ronda abierta: usa «Capturar los que terminaron»." },
                new Item { Grupo = "Ronda", Texto = "Declarar la pregunta de esta ronda", Accion = DialogoDeclarar,
                    Motivo = paso.Accion == "declarar-pregunta" ? null : "Solo cuando se capturó sin pegar la pregunta con la app." },
                new Item { Grupo = "Ronda", Texto = "Abandonar la ronda", Accion = DialogoAbandonar,
                    Motivo = sinRonda ? "No hay una ronda abierta." : null },
            };
        }

        List<Item> ItemsDePaneles() =>
            Operadores.Select(id => new Item { Grupo = "Paneles", Texto = $"{Dominio.NombreProveedor(id)} · {Estados[EstadoDe(id)].Palabra}", Accion = () => Seleccionar(id) }).ToList();

        /// <summary>Un menú propio, no el de Unity: tiene que apartar las páginas mientras está abierto.</summary>
        void AbrirMenu(VisualElement origen, List<Item> items)
        {
            var menu = raiz.Q("menu-flotante");
            menu.Clear();
            string grupo = null;
            foreach (var item in items)
            {
                if (item.Grupo != grupo)
                {
                    grupo = item.Grupo;
                    var t = new Label(grupo);
                    t.AddToClassList("lista-titulo");
                    menu.Add(t);
                }
                var b = new Button(() =>
                {
                    CerrarCapa();
                    item.Accion();
                }) { text = item.Texto, name = "item-" + item.Texto };
                b.AddToClassList("boton");
                b.AddToClassList("menu-item");
                b.SetEnabled(item.Motivo == null);
                menu.Add(b);
                if (item.Motivo != null)
                {
                    var m = new Label(item.Motivo);
                    m.AddToClassList("pequeno");
                    m.AddToClassList("texto-2");
                    m.AddToClassList("envolver");
                    m.AddToClassList("menu-motivo");
                    menu.Add(m);
                }
            }
            // Debajo del botón que lo abrió, sin salirse de la ventana; en la clase compacta, como hoja abajo (Interfaz.uss).
            var r = origen.worldBound;
            var ancho = raiz.panel.visualTree.worldBound.width;
            var hoja = raiz.ClassListContains("compacta");
            menu.style.left = hoja ? 0 : Mathf.Max(8, Mathf.Min(r.x, ancho - 348));
            menu.style.top = hoja ? new StyleLength(StyleKeyword.Auto) : new StyleLength(r.yMax + 4);
            menu.style.bottom = hoja ? new StyleLength(0f) : new StyleLength(StyleKeyword.Auto);
            menu.style.width = hoja ? new StyleLength(Length.Percent(100)) : new StyleLength(StyleKeyword.Null);
            AbrirCapa(menu);
        }

        // ---------------------------------------------------------------- capa y diálogos

        void AbrirCapa(VisualElement contenido)
        {
            raiz.Q("menu-flotante").style.display = DisplayStyle.None;
            raiz.Q("dialogo").style.display = DisplayStyle.None;
            contenido.style.display = DisplayStyle.Flex;
            raiz.Q("capa").AddToClassList("capa--abierta");
            capaAbierta = true;
            Ubicar();
            Aplicacion.AplicarSemibold(raiz.Q("capa"));
        }

        public void CerrarCapa()
        {
            raiz.Q("capa").RemoveFromClassList("capa--abierta");
            capaAbierta = false;
            Ubicar();
        }

        /// <summary>Un aviso o una pregunta antes de un paso (§3.4): la página se aparta mientras está abierto.</summary>
        void AbrirDialogo(string titulo, string texto, bool conCampo, string casilla, string aceptar, Action<string, bool> accion)
        {
            var d = raiz.Q("dialogo");
            d.Q<Label>("dialogo-titulo").text = titulo;
            d.Q<Label>("dialogo-texto").text = texto;
            var campo = d.Q<TextField>("dialogo-campo");
            campo.value = "";
            campo.style.display = conCampo ? DisplayStyle.Flex : DisplayStyle.None;
            var c = d.Q<Toggle>("dialogo-casilla");
            c.value = false;
            c.text = casilla ?? "";
            c.style.display = casilla == null ? DisplayStyle.None : DisplayStyle.Flex;
            var b = d.Q<Button>("dialogo-aceptar");
            b.text = aceptar;
            alAceptar = accion;
            AbrirCapa(d);
            (conCampo ? (Focusable)campo : b).Focus();
        }
    }
}
