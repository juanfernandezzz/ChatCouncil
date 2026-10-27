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
        /// <summary>"Capturar este panel (Investigación)": la captura dice en qué fase se registra, con el nombre de la guía.</summary>
        string ConFase(string accion) => accion == CapturarEste ? $"{CapturarEste} ({NombreDeEtapa(EtapaDelRegistro())})" : accion;
        const string PegarOperacionAqui = "Pegar la operación aquí";
        const string PegarOperacionTexto = "Pegar la operación aquí como texto";
        const string UsarAnterior = "Usar su operación anterior";
        const string PegarPromptAqui = "Pegar el prompt aquí";
        /// <summary>Cuánto se espera, después de abrir la conversación nueva, a que el chat y el compositor queden vacíos.</summary>
        const int EsperaChatNuevoMs = 20_000;

        readonly VisualElement raiz;
        readonly string carpetaDatos;
        readonly Func<Task> iniciarNavegador;
        readonly Func<string, string> urlDe, specDe;
        readonly Dictionary<string, Panel> paneles = new Dictionary<string, Panel>();
        readonly Dictionary<string, string> fallaAlAbrir = new Dictionary<string, string>();
        /// <summary>El último tamaño del área de la página, en píxeles: los paneles apartados lo conservan.</summary>
        (int ancho, int alto) tamano = (1000, 700);
        readonly Dictionary<string, (bool? Generando, string Fin)> pagina = new Dictionary<string, (bool?, string)>();
        readonly Dictionary<string, int> zoom = new Dictionary<string, int>();
        readonly Dictionary<string, int> navegacionesAlCapturar = new Dictionary<string, int>();
        RolesElegidos roles;
        List<string> activos, pool;
        string visible, etapaMostrada;
        bool frasePlegada, avisoOmitido, seccionVisible = true, capaAbierta, ocupado, sondeando;
        // De la ronda que se ve: la operación pegada en cada panel, los pegados que fallaron y si ya se dio el aviso.
        readonly Dictionary<string, Operacion> operaciones = new Dictionary<string, Operacion>();
        readonly Dictionary<string, string> fallaOperacion = new Dictionary<string, string>();
        string rondaVista, rondaConAvisoOperacion;
        bool operacionPorTexto;
        Action<string, bool> alAceptar;
        // T22: los roles a la vista (en la lista y en ‹ ›), su función en la lista, los pegados de rol que fallaron
        // y el panel oculto que imprime los PDF.
        readonly List<string> rolesMostrados = new List<string>();
        readonly Dictionary<string, string> funcion = new Dictionary<string, string>();
        readonly Dictionary<string, string> fallaRol = new Dictionary<string, string>();
        Panel panelPdf;

        public Puerta Puerta { get; private set; }
        public List<string> Operadores { get; private set; } = new List<string>();
        public string Visible => visible;
        /// <summary>Los paneles por los que se navega: los operadores y, desde su etapa o a pedido, los roles (D42).</summary>
        public List<string> EnLaVista => Operadores.Concat(RolesDeLaRonda.Where(rolesMostrados.Contains)).ToList();
        List<string> RolesDeLaRonda => new[] { roles.Integrador }.Concat(roles.Verificadores).Append(roles.Redactor).Distinct().ToList();

        /// <summary>Capturar un rol en su etapa captura a todos los de la etapa (D62: los dos verificadores van juntos).</summary>
        List<string> AlCapturar(string id)
        {
            var deLaEtapa = roles.DeLaEtapa(EtapaDelRegistro());
            return deLaEtapa.Contains(id) ? deLaEtapa.ToList() : new List<string> { id };
        }
        IHttp Http { get; } = new HttpSinCookies();
        IPdf Pdf { get; }
        /// <summary>Al terminar el informe. Android no abre carpetas con file:// (FileUriExposedException): ahí solo se dice dónde está.</summary>
        public Action<string> AbrirCarpeta { get; set; } = ruta =>
        {
            // La ruta tal cual: el file:// escapado (%C3%A1 de "Fernández") Windows no lo encuentra.
            if (Application.platform != RuntimePlatform.Android) Application.OpenURL(ruta);
        };
        public Panel PanelDe(string id) => paneles.TryGetValue(id, out var p) ? p : null;
        public Operacion OperacionDe(string id) => operaciones.TryGetValue(id, out var o) ? o : null;

        /// <param name="urlDe">La página de cada proveedor: la de su spec, o una de prueba.</param>
        /// <param name="specDe">La spec de cada proveedor, en JSON: la de specs.json, o una de prueba.</param>
        public PantallaRonda(VisualElement raiz, string carpetaDatos, Func<Task> iniciarNavegador, Func<string, string> urlDe, Func<string, string> specDe)
        {
            this.raiz = raiz;
            this.carpetaDatos = carpetaDatos;
            this.iniciarNavegador = iniciarNavegador;
            this.urlDe = urlDe;
            this.specDe = specDe;
            Pdf = new PdfEnPanel(PanelDelPdf);

            void Al(string nombre, Action accion) => raiz.Q<Button>(nombre).clicked += accion;
            Al("paso-ancha", Paso);
            Al("paso-angosta", Paso);
            Al("accion-panel", AccionDelPanel);
            Al("ampliar", () =>
            {
                raiz.ToggleInClassList("pagina-ampliada");
                raiz.Q<Button>("ampliar").text = raiz.ClassListContains("pagina-ampliada") ? "Reducir" : "Ampliar";
            });
            Al("menu-panel", () => AbrirMenu(raiz.Q("menu-panel"), ItemsDelPanel().Concat(ItemsDeMantenimiento()).ToList()));
            Al("menu-ronda", () => AbrirMenu(raiz.Q("menu-ronda"), ItemsDeLaRonda()));
            Al("menu-angosta", () => AbrirMenu(raiz.Q("menu-angosta"), ItemsDelPanel().Concat(ItemsDeMantenimiento()).Concat(ItemsDeLaRonda()).ToList()));
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
            lista.Add(Titulo($"Proveedores ({Operadores.Count})"));
            foreach (var id in Operadores) lista.Add(Fila(id, "", () => Seleccionar(id)));
            var tituloRoles = Titulo("Roles");
            tituloRoles.name = "titulo-roles";
            lista.Add(tituloRoles);
            funcion.Clear();
            funcion[roles.Integrador] = roles.Redactor == roles.Integrador ? "Integra y redacta" : "Integra";
            foreach (var v in roles.Verificadores) funcion[v] = "Verifica";
            funcion[roles.Redactor] = roles.Redactor == roles.Integrador ? funcion[roles.Integrador] : "Redacta";
            foreach (var id in RolesDeLaRonda)
            {
                var fila = Fila(id, funcion[id], () => { _ = MostrarRol(id, true); });
                // Tocar un rol lo muestra y lo pone a la vista (historia 59), aunque no sea su etapa.
                lista.Add(fila);
            }
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
                    paneles[id] = await Paneles.Crear(Paneles.PerfilProveedores, urlDe(id));
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
                foreach (var id in paneles.Keys.ToList())
                {
                    if (!paneles.TryGetValue(id, out var p)) continue;
                    try
                    {
                        var e = await p.Correr("estado", specDe(id), esperaMs: 5_000);
                        pagina[id] = ((bool?)e["generando"], (string)e["fin"]);
                        zoom[id] = (int?)e["zoom"] ?? 100;
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

        static VisualElement Fila(string id, string texto, Action alActivar)
        {
            // Enfocable y con Enter, como un botón: la lista también se usa con el teclado (WCAG 2.1.1).
            var fila = new VisualElement { name = "fila-" + id, focusable = true };
            fila.AddToClassList("fila-panel");
            fila.RegisterCallback<ClickEvent>(e => alActivar());
            fila.RegisterCallback<NavigationSubmitEvent>(e => alActivar());
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
            var estado = Puerta.EstadoDePanel(id, generando, fin);
            // En la operación y en los roles el motor no conoce los pegados fallidos: los sabe la interfaz, que los intentó.
            return estado == "por-pegar" && (fallaOperacion.ContainsKey(id) || fallaRol.ContainsKey(id)) ? "con-problema" : estado;
        }

        /// <summary>
        /// La etapa que dice el registro; sin ronda abierta, la Pregunta. Con la investigación completa, la operación,
        /// aunque todavía no haya sello (la misma regla que Puerta.EstadoDePanel).
        /// </summary>
        string EtapaDelRegistro()
        {
            if (Puerta.RondaActual == null) return "pregunta";
            var etapa = Dominio.EtapaDeRonda(Puerta.LeerRegistro().Hechos, Puerta.RondaActual, pool.Count);
            return etapa == "investigacion" && Puerta.PasoSiguiente().Etapa == "operacion" ? "operacion" : etapa;
        }

        static bool Terminado(string estado) => estado.StartsWith("parece-terminado", StringComparison.Ordinal);

        /// <summary>
        /// Qué pasó y qué hacer (D9): la cabecera del PC lleva el detalle; el selector del teléfono, una línea corta
        /// que dice dónde está la acción (H7). Y la acción que corresponde a ese estado (D6).
        /// </summary>
        (string Problema, string Corto, string Accion) Situacion(string id, string etapa)
        {
            if (fallaAlAbrir.TryGetValue(id, out var f))
                return ($"La página no se pudo abrir: {f} Prueba Más… → Recargar la página.", "La página no se abrió: Más… → Recargar.", null);
            var rol = roles.DeLaEtapa(etapa);
            // Un rol fuera de su etapa está para mirarlo (historia 59): no recibe la pregunta ni la operación.
            if (!Operadores.Contains(id) && !rol.Contains(id)) return (null, null, null);
            if (rol.Count > 0)
            {
                if (!rol.Contains(id)) return (null, null, null);
                if (fallaRol.TryGetValue(id, out var fr))
                    return ($"El prompt no se pegó: {fr}.", "No se pegó el prompt: pégalo otra vez desde «Más…».", PegarPromptAqui);
                var enRol = EstadoDe(id);
                if (enRol == "por-pegar") return (null, null, PegarPromptAqui);
                if (Terminado(enRol)) return (null, null, CapturarEste);
                if (enRol != "con-problema") return (null, null, null);
                var error = Puerta.LeerRegistro().Hechos.OfType<ErrorCaptura>().LastOrDefault(e => e.RondaId == Puerta.RondaActual && e.ProveedorId == id && e.EtapaEsperada == etapa);
                return ($"La captura no sirvió: {error?.Detalle}. Revisa la página y vuelve a capturar.", "La captura no sirvió: captura otra vez desde «Más…».", CapturarEste);
            }
            if (etapa == "operacion")
            {
                if (fallaOperacion.TryGetValue(id, out var falla))
                    return ($"La operación no se pegó: {falla}.", "No se pegó la operación: pégala otra vez desde «Más…».", PegarOperacionAqui);
                var enOperacion = EstadoDe(id);
                return (null, null, enOperacion == "por-pegar" ? PegarOperacionAqui : Terminado(enOperacion) ? CapturarEste : null);
            }
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
            if (Puerta.RondaActual != rondaVista)
            {
                rondaVista = Puerta.RondaActual;
                operaciones.Clear();
                fallaOperacion.Clear();
                fallaRol.Clear();
                // En una ronda nueva los roles muestran la conversación de la anterior: salen del recorrido hasta su etapa.
                SacarRoles();
            }
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

            var estados = Operadores.Concat(RolesDeLaRonda).Distinct().ToDictionary(id => id, EstadoDe);
            var deOperadores = Operadores.Select(id => estados[id]).ToList();
            int enviados = deOperadores.Count(e => e == "respondiendo" || Terminado(e) || e == "capturado");
            int terminados = deOperadores.Count(Terminado);
            int capturados = deOperadores.Count(e => e == "capturado");
            // Capturar un rol: cuando su página parece terminada o su captura falló (D7: lo imposible, deshabilitado).
            var rolDelPaso = roles.DeLaEtapa(paso.Etapa);
            var rolListo = rolDelPaso.Count > 0 && rolDelPaso.All(id => paneles.ContainsKey(id) && (Terminado(estados[id]) || estados[id] == "con-problema"));

            var (texto, habilitado) = TextoDelPaso(paso, terminados, rolListo);
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
            foreach (var id in RolesDeLaRonda)
            {
                var fila = raiz.Q("fila-" + id);
                var (icono, palabra) = Estados[estados[id]];
                fila.Q<IconoEstado>().Estado = icono;
                fila.Q<Label>(className: "fila-estado").text = rolesMostrados.Contains(id) ? $"{funcion[id]} · {palabra}" : funcion[id];
                fila.EnableInClassList("fila-panel--actual", id == visible);
                // Los roles en la lista solo mientras están en el recorrido (D42): fuera de su etapa no le quitan alto a los paneles.
                fila.style.display = rolesMostrados.Contains(id) ? DisplayStyle.Flex : DisplayStyle.None;
            }
            raiz.Q("titulo-roles").style.display = rolesMostrados.Count > 0 ? DisplayStyle.Flex : DisplayStyle.None;

            if (visible != null)
            {
                var (icono, palabra) = Estados[estados[visible]];
                var (problema, corto, accion) = Situacion(visible, etapa);
                var enLaVista = EnLaVista;
                raiz.Q<IconoEstado>("icono-cabecera").Estado = raiz.Q<IconoEstado>("icono-selector").Estado = icono;
                // Como los navegadores, el zoom (Ctrl + rueda del mouse) solo se muestra cuando no es el 100 %.
                var conZoom = zoom.TryGetValue(visible, out var z) && z != 100 ? $" · Zoom {z} %" : "";
                raiz.Q<Label>("cabecera-titulo").text = $"{Dominio.NombreProveedor(visible)} · {palabra}{conZoom}";
                raiz.Q<Label>("selector-texto").text = $"{Dominio.NombreProveedor(visible)} · {palabra} · {enLaVista.IndexOf(visible) + 1} de {enLaVista.Count}";
                foreach (var (nombre, linea) in new[] { ("cabecera-problema", problema), ("selector-problema", corto) })
                {
                    raiz.Q<Label>(nombre).text = linea ?? "";
                    raiz.Q(nombre).style.display = linea == null ? DisplayStyle.None : DisplayStyle.Flex;
                }
                var b = raiz.Q<Button>("accion-panel");
                b.text = ConFase(accion) ?? "";
                b.style.display = accion == null ? DisplayStyle.None : DisplayStyle.Flex;
                b.SetEnabled(!ocupado);
            }
            Aplicacion.AplicarSemibold(raiz);
        }

        /// <summary>El texto del botón primario y si se puede usar ahora. Lo imposible queda deshabilitado (D7).</summary>
        static (string, bool) TextoDelPaso(Paso paso, int terminados, bool rolListo)
        {
            switch (paso.Accion)
            {
                case "capturar" when paso.Etapa == "investigacion" || paso.Etapa == "operacion": return ($"{paso.Texto} ({terminados})", terminados > 0);
                case "capturar": return (paso.Texto, rolListo);
                default: return (paso.Texto, true);
            }
        }

        void Resultado(string texto, bool problema = false)
        {
            // El resultado de un paso es un mensaje de estado: el lector lo dice sin mover el foco (WCAG 4.1.3).
            if (UnityEngine.Accessibility.AssistiveSupport.isScreenReaderEnabled) UnityEngine.Accessibility.AssistiveSupport.notificationDispatcher.SendAnnouncement(texto);
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

        public void Mover(int paso)
        {
            var enLaVista = EnLaVista;
            if (enLaVista.Count == 0) return;
            var i = (enLaVista.IndexOf(visible) + paso + enLaVista.Count) % enLaVista.Count;
            Seleccionar(enLaVista[i]);
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
            var enLaVista = EnLaVista;
            if (area.width > 0) tamano = (Mathf.RoundToInt(area.width * k), Mathf.RoundToInt(area.height * k));
            foreach (var (id, p) in paneles.Select(x => (x.Key, x.Value)))
            {
                // Un rol oculto se aparta: detrás de la página visible seguiría ocupando el área. Se aparta FUERA de la
                // ventana con su tamaño, como en Electron: a 0×0 una SPA no termina de montar (Gemini no cargaba).
                if (mostrar && enLaVista.Contains(id)) p.Rect(Mathf.RoundToInt(area.x * k), Mathf.RoundToInt(area.y * k), tamano.ancho, tamano.alto);
                else p.Rect(-tamano.ancho - 100, 0, tamano.ancho, tamano.alto);
            }
            if (mostrar) paneles[visible].Frente();
        }

        // ---------------------------------------------------------------- acciones

        public void Paso()
        {
            var paso = Puerta.PasoSiguiente();
            switch (paso.Accion)
            {
                case "pegar-pregunta":
                    PegarPregunta();
                    break;
                case "capturar" when paso.Etapa == "investigacion" || paso.Etapa == "operacion":
                    _ = Capturar(Operadores.Where(id => Terminado(EstadoDe(id))).ToList());
                    break;
                case "pegar-operacion":
                    ConAvisoDeOperacion(Operadores.Where(id => EstadoDe(id) == "por-pegar" || EstadoDe(id) == "con-problema").ToList(), null);
                    break;
                case "declarar-pregunta":
                    DialogoDeclarar();
                    break;
                case "pegar-integrador":
                case "pegar-verificacion":
                case "pegar-redactor":
                    _ = PegarRol();
                    break;
                case "capturar":
                    _ = Capturar(roles.DeLaEtapa(paso.Etapa).ToList());
                    break;
                case "armar-informe":
                    _ = ArmarInforme();
                    break;
                case "abrir-carpeta":
                    AbrirCarpeta(Puerta.CarpetaInformeArmado);
                    break;
            }
        }

        void AccionDelPanel()
        {
            var accion = raiz.Q<Button>("accion-panel").text;
            if (accion == PegarAqui) _ = PegarEnEste();
            else if (accion.StartsWith(CapturarEste, StringComparison.Ordinal)) _ = Capturar(AlCapturar(visible));
            else if (accion == PegarOperacionAqui) ConAvisoDeOperacion(new List<string> { visible }, null);
            else if (accion == PegarPromptAqui) _ = PegarRol();
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
                // Se captura todo: el mensaje y a continuación el informe del iframe; el html guarda los dos.
                var informe = await p.LeerInformeEnIframe(spec);
                var texto = (string)informe?["texto"];
                if (!string.IsNullOrWhiteSpace(texto))
                {
                    l.Text = string.IsNullOrWhiteSpace(l.Text) ? texto : l.Text + "\n\n" + texto;
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

        // ---------------------------------------------------------------- operación (T21)

        /// <summary>
        /// El aviso antes de pegar la operación, una vez por ronda (pedido de Juan del 2026-09-30). En él se elige la
        /// vía de la ronda: archivo, la predeterminada, o texto. porTexto fuerza la vía de un solo panel.
        /// </summary>
        void ConAvisoDeOperacion(List<string> ids, bool? porTexto)
        {
            if (ids.Count == 0) return;
            if (rondaConAvisoOperacion == Puerta.RondaActual)
            {
                _ = PegarOperaciones(ids, porTexto ?? operacionPorTexto);
                return;
            }
            AbrirDialogo("Antes de pegar la operación",
                "En cada panel, antes de pegar: abre una conversación nueva (si siguiera el hilo anterior, el operador leería su " +
                "propia respuesta y la evaluación dejaría de ser ciega) y activa el razonamiento avanzado y la búsqueda si el " +
                "proveedor los tiene. La app comprueba que cada conversación esté vacía, pega solo el prompt y adjunta el archivo " +
                "de ese proveedor. Nada se envía: revisa que el archivo quedó adjunto y envía tú.",
                false, "Pegarla como texto, sin archivo", "Entendido, pegar",
                (campo, marcada) =>
                {
                    rondaConAvisoOperacion = Puerta.RondaActual;
                    operacionPorTexto = marcada;
                    _ = PegarOperaciones(ids, porTexto ?? marcada);
                });
        }

        /// <summary>De a un panel por vez y con ese panel al frente, como en Electron (la única forma medida con textos largos).</summary>
        async Task PegarOperaciones(List<string> ids, bool porTexto)
        {
            ocupado = true;
            int ok = 0;
            for (int i = 0; i < ids.Count; i++)
            {
                var id = ids[i];
                Resultado($"Pegando la operación: {i + 1} de {ids.Count} ({Dominio.NombreProveedor(id)})…");
                Seleccionar(id);
                var error = await PegarOperacion(id, porTexto);
                if (error == null)
                {
                    fallaOperacion.Remove(id);
                    ok++;
                }
                else fallaOperacion[id] = error;
                Refrescar();
            }
            ocupado = false;
            var fallaron = ids.Where(fallaOperacion.ContainsKey).Select(Dominio.NombreProveedor).ToList();
            Resultado($"Operación pegada en {ok} de {ids.Count}." +
                      (fallaron.Count > 0 ? $" No se pegó en: {string.Join(", ", fallaron)}; cada uno dice qué pasó." : "") +
                      (ok > 0 ? porTexto ? " Revísala y envíala." : " Comprueba que el archivo quedó adjunto, revísala y envíala." : ""),
                fallaron.Count > 0);
            Refrescar();
        }

        /// <summary>
        /// La conversación que abrió Juan, comprobada vacía (historia 41); la operación por la vía elegida; lo escrito, verificado
        /// contra lo armado (Cuerpos.VerificarEscritura); y con archivo, el adjunto. El error, o null si quedó pegada.
        /// </summary>
        async Task<string> PegarOperacion(string id, bool porTexto)
        {
            // La conversación nueva la abre Juan, como en la investigación (pedido del 2026-10-23); la app solo comprueba que esté vacía.
            if (!paneles.TryGetValue(id, out var p)) return "el panel no está abierto";
            try
            {
                if ((bool?)await p.Correr("chatVacio", specDe(id), esperaMs: 5_000) != true)
                    return "este panel sigue en una conversación con mensajes: abre una conversación nueva y vuelve a pegar, porque el modelo leería su propia respuesta";
            }
            catch (Exception e)
            {
                return e.Message;
            }
            Operacion op;
            try
            {
                op = Puerta.ArmarOperacion(id, conArchivo: !porTexto);
            }
            catch (InvalidOperationException e)
            {
                return e.Message;
            }
            var error = await EscribirYAdjuntar(id, op.Texto, Cuerpos.VerificarEscritura, op.CuerpoArchivo,
                porTexto ? null : Path.Combine(carpetaDatos, "operaciones", op.NombreArchivo), " o pega la operación como texto");
            if (error != null) return error;
            Puerta.OperacionPegada(op);
            operaciones[id] = op;
            return null;
        }

        /// <summary>
        /// Una conversación nueva, comprobada vacía (historia 41): sin esto el operador o el rol leería el hilo anterior.
        /// El error, o null si quedó vacía.
        /// </summary>
        async Task<string> AbrirChatNuevo(string id)
        {
            if (!paneles.TryGetValue(id, out var p)) return "el panel no está abierto";
            var spec = specDe(id);
            try
            {
                await p.Navegar(urlDe(id));
            }
            catch (Exception e)
            {
                return "no se pudo abrir una conversación nueva: " + e.Message;
            }
            var limite = DateTime.UtcNow.AddMilliseconds(EsperaChatNuevoMs);
            int vacias = 0;
            for (;;)
            {
                // Tres lecturas seguidas con el chat sin mensajes y el compositor vacío: un editor puede restaurar un
                // borrador propio después de navegar (esperarCompositorVacioEstable de Electron).
                try
                {
                    var compositor = await p.Correr("leerCompositor", spec, esperaMs: 5_000);
                    var vacio = (bool?)await p.Correr("chatVacio", spec, esperaMs: 5_000) == true;
                    vacias = compositor.Type == JTokenType.String && ((string)compositor).Trim().Length == 0 && vacio ? vacias + 1 : 0;
                }
                catch (Exception)
                {
                    vacias = 0; // la página todavía está cargando
                }
                if (vacias >= 3) return null;
                if (DateTime.UtcNow > limite)
                    return "la conversación nueva no quedó vacía: no se pega, porque el modelo leería su propia respuesta. Abre una conversación nueva a mano y vuelve a pegar";
                await Task.Delay(300);
            }
        }

        /// <summary>
        /// El texto en el compositor, verificado contra lo armado (verificar da el error o null); con cuerpoArchivo, el
        /// archivo escrito en ruta y adjunto. El error, o null si quedó todo.
        /// </summary>
        async Task<string> EscribirYAdjuntar(string id, string texto, Func<string, string, string> verificar, string cuerpoArchivo, string ruta, string otraVia)
        {
            if (!paneles.TryGetValue(id, out var p)) return "el panel no está abierto";
            var spec = specDe(id);
            try
            {
                var r = await p.Correr("escribir", spec, texto, 90_000);
                if ((bool?)r["ok"] != true) return (string)r["error"];
                var leido = await p.Correr("leerCompositor", spec);
                var error = verificar(texto, leido.Type == JTokenType.String ? (string)leido : "");
                if (error != null) return error;
            }
            catch (Exception e)
            {
                return e.Message;
            }
            if (cuerpoArchivo == null) return null;
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(ruta));
                File.WriteAllText(ruta, cuerpoArchivo, new UTF8Encoding(false));
                await p.Adjuntar(spec, ruta);
            }
            catch (Exception e)
            {
                return $"el texto quedó pegado pero el archivo no se adjuntó ({e.Message}). Está en {ruta}: adjúntalo a mano{otraVia}";
            }
            return null;
        }

        void UsarOperacionAnterior()
        {
            var (ok, mensaje) = Puerta.ReutilizarOperacion(visible);
            Resultado(mensaje, !ok);
            Refrescar();
        }

        void DialogoRondaCopiada()
        {
            AbrirDialogo("Ronda nueva con las respuestas copiadas",
                "Se abre una ronda nueva con la misma pregunta y la última respuesta de cada operador, copiadas. La ronda actual " +
                "queda intacta. Después puedes recapturar lo que quieras corregir, y los operadores que leen exactamente lo mismo " +
                "pueden usar su operación anterior.",
                false, null, "Abrir la ronda nueva", (_, __) =>
                {
                    var mensaje = Puerta.RondaNuevaConRespuestasCopiadas();
                    Resultado(mensaje, !mensaje.StartsWith("Ronda nueva abierta", StringComparison.Ordinal));
                    Refrescar();
                });
        }

        // ---------------------------------------------------------------- roles e informe (T22)

        /// <summary>
        /// Abre la página del rol si todavía no está (los roles no tienen página hasta que se los necesita, historia 26)
        /// y lo pone en el recorrido. true si la página está abierta.
        /// </summary>
        public async Task<bool> MostrarRol(string id, bool seleccionar)
        {
            if (!paneles.ContainsKey(id))
            {
                try
                {
                    paneles[id] = await Paneles.Crear(Paneles.PerfilProveedores, urlDe(id));
                    fallaAlAbrir.Remove(id);
                }
                catch (Exception e)
                {
                    fallaAlAbrir[id] = e.Message;
                }
            }
            if (!rolesMostrados.Contains(id)) rolesMostrados.Add(id);
            if (seleccionar) Seleccionar(id);
            else
            {
                Ubicar();
                Refrescar();
            }
            return paneles.ContainsKey(id);
        }

        async void MostrarRoles()
        {
            foreach (var id in RolesDeLaRonda) await MostrarRol(id, false);
        }

        void OcultarRoles()
        {
            SacarRoles();
            Refrescar();
        }

        void SacarRoles()
        {
            rolesMostrados.Clear();
            if (visible != null && !Operadores.Contains(visible)) visible = Operadores.FirstOrDefault();
            Ubicar();
        }

        /// <summary>
        /// El prompt del rol de la etapa, en una conversación nueva comprobada vacía, verificado por igualdad; el del
        /// redactor, con su archivo adjunto (historia 56). Nunca envía. Si no se puede armar, se dice por qué antes de
        /// tocar el panel (historia 55: nunca un prompt vacío).
        /// </summary>
        async Task PegarRol()
        {
            var etapa = EtapaDelRegistro();
            var ids = roles.DeLaEtapa(etapa);
            if (ids.Count == 0) return;
            string texto;
            ArchivoRedactor archivo = null;
            try
            {
                texto = etapa == "integracion" ? Puerta.ArmarPromptIntegrador()
                    : etapa == "verificacion" ? Puerta.ArmarPromptVerificador()
                    : (archivo = Puerta.ArmarRedactor()).Prompt;
            }
            catch (InvalidOperationException e)
            {
                Resultado($"No se armó el prompt: {e.Message}.", true);
                return;
            }
            // D62: en la verificación, el mismo prompt va a los dos verificadores, uno después del otro.
            ocupado = true;
            foreach (var id in ids)
            {
                var nombre = Dominio.NombreProveedor(id);
                Resultado($"Pegando el prompt en {nombre}…");
                Refrescar();
                var error = await MostrarRol(id, true) ? await AbrirChatNuevo(id) : "la página no se pudo abrir";
                error = error ?? await EscribirYAdjuntar(id, texto, Cuerpos.VerificarIgualdad, archivo?.CuerpoArchivo,
                    archivo == null ? null : Path.Combine(carpetaDatos, "redactor", archivo.NombreArchivo), "");
                if (error == null)
                {
                    fallaRol.Remove(id);
                    continue;
                }
                fallaRol[id] = error;
                ocupado = false;
                Resultado($"No se pegó en {nombre}: {error}.", true);
                Refrescar();
                return;
            }
            ocupado = false;
            if (etapa == "integracion") Puerta.IntegradorPegado(texto);
            else if (etapa == "verificacion") Puerta.VerificadorPegado(texto);
            else Puerta.RedactorPegado(archivo);
            Resultado($"Prompt pegado en {string.Join(" y ", ids.Select(Dominio.NombreProveedor))}."
                      + (archivo == null ? " Revísalo y envíalo." : " Comprueba que el archivo quedó adjunto, revísalo y envíalo.")
                      + (archivo?.Aviso == null ? "" : " " + archivo.Aviso));
            Refrescar();
        }

        /// <summary>Recapturar el integrador o los verificadores en cualquier etapa (historia 58): agrega un hecho y gana el último.</summary>
        async Task Recapturar(string rol)
        {
            var ids = rol == "integrador" ? new[] { roles.Integrador } : roles.Verificadores;
            ocupado = true;
            Resultado($"Recapturando el {rol}…");
            Refrescar();
            var resultados = new List<(bool Ok, string Mensaje)>();
            foreach (var id in ids)
            {
                await MostrarRol(id, true);
                resultados.Add(Puerta.Recapturar(rol, await Leer(id)));
            }
            ocupado = false;
            Resultado(string.Join(" ", resultados.Select(x => x.Mensaje)), resultados.Any(x => !x.Ok));
            Refrescar();
        }

        /// <summary>Comprueba las URLs de los verificadores, arma la carpeta del informe y la abre (D41).</summary>
        async Task ArmarInforme()
        {
            ocupado = true;
            Resultado("Comprobando las URLs y armando el informe…");
            Refrescar();
            var (ok, mensaje, ruta, completo) = await Puerta.ArmarInforme(Http, Pdf);
            // Ya comprobadas para esta verificación: no vuelve a salir a la red, solo da la cuenta.
            var urls = ok ? await Puerta.ComprobarUrls(Http) : null;
            ocupado = false;
            var cuenta = urls?.Urls == null || urls.Urls.Count == 0 ? ""
                : $" URLs de los verificadores: responden {urls.Urls.Count(u => u.Codigo >= 200 && u.Codigo <= 299)} de {urls.Urls.Count}.";
            // Sin PDF, el motor devuelve el .md: la carpeta es la suya.
            var carpeta = ok ? Directory.Exists(ruta) ? ruta : Path.GetDirectoryName(ruta) : null;
            Resultado(mensaje + cuenta, !completo);
            if (carpeta != null) AbrirCarpeta(carpeta);
            Refrescar();
        }

        async Task<Panel> PanelDelPdf()
        {
            if (panelPdf == null)
            {
                // Su propio perfil: la página del PDF no comparte cookies con los proveedores.
                panelPdf = await Paneles.Crear("informe-pdf", "about:blank");
                panelPdf.Rect(0, 0, 0, 0);
            }
            return panelPdf;
        }

        // ---------------------------------------------------------------- mantenimiento del panel (T23)

        internal static string NombreDeEtapa(string etapa) => NombresEtapa[Array.IndexOf(Etapas, etapa)];

        /// <summary>F4 y F5 (D49): el foco del teclado dentro de la página visible. false si no hay página a la vista.</summary>
        public bool FocoEnPagina()
        {
            if (!seccionVisible || capaAbierta || visible == null || !paneles.TryGetValue(visible, out var p)) return false;
            p.Foco();
            return true;
        }

        /// <summary>Recargar, el diagnóstico y cerrar la sesión (historias 12 y 72 a 74): de emergencia, en cualquier etapa (D6).</summary>
        List<Item> ItemsDeMantenimiento()
        {
            if (visible == null) return new List<Item>();
            var grupo = "Este panel: " + Dominio.NombreProveedor(visible);
            var sinPagina = paneles.ContainsKey(visible) ? null : "El panel no tiene su página abierta.";
            return new List<Item>
            {
                new Item { Grupo = grupo, Texto = "Recargar la página", Accion = () => _ = Recargar(visible) },
                new Item { Grupo = grupo, Texto = "Diagnóstico de selectores", Accion = () => _ = Diagnosticar(visible), Motivo = sinPagina },
                new Item { Grupo = grupo, Texto = "Cerrar la sesión de este panel…", Accion = () => DialogoCerrarSesion(visible), Motivo = sinPagina },
            };
        }

        async Task Recargar(string id)
        {
            try
            {
                if (paneles.ContainsKey(id)) await paneles[id].Recargar();
                else
                {
                    // La primera carga no respondió a tiempo: se vuelve a abrir sin reiniciar la app.
                    paneles[id] = await Paneles.Crear(Paneles.PerfilProveedores, urlDe(id));
                    fallaAlAbrir.Remove(id);
                    Ubicar();
                    Refrescar();
                }
                Resultado($"Se recargó la página de {Dominio.NombreProveedor(id)}.");
            }
            catch (Exception e)
            {
                Resultado($"No se pudo recargar {Dominio.NombreProveedor(id)}: {e.Message}", true);
            }
        }

        /// <summary>
        /// Lo que el script de página encontró, de solo lectura (historias 72 y 73), en un archivo de la carpeta de datos;
        /// se abre su carpeta para mandarlo (D18).
        /// </summary>
        async Task Diagnosticar(string id)
        {
            var nombre = Dominio.NombreProveedor(id);
            try
            {
                var d = await paneles[id].Correr("diagnostico", specDe(id), esperaMs: 30_000);
                var dir = Path.Combine(carpetaDatos, "diagnosticos");
                Directory.CreateDirectory(dir);
                var ruta = Path.Combine(dir, $"{id}-{DateTime.Now:yyyy-MM-dd-HHmmss}.json");
                File.WriteAllText(ruta, new JObject { ["proveedor"] = id, ["app"] = Application.version, ["diagnostico"] = d }.ToString(Newtonsoft.Json.Formatting.Indented), new UTF8Encoding(false));
                Resultado($"Diagnóstico de {nombre} guardado en {ruta}. Mándalo junto con lo que pasó para que se corrijan los selectores.");
                AbrirCarpeta(dir);
            }
            catch (Exception e)
            {
                Resultado($"No se pudo hacer el diagnóstico de {nombre}: {e.Message}", true);
            }
        }

        void DialogoCerrarSesion(string id)
        {
            var nombre = Dominio.NombreProveedor(id);
            AbrirDialogo($"Cerrar la sesión de {nombre}",
                $"Se borra todo lo que el sitio de {nombre} guardó (la sesión, las cookies y sus datos) y su página vuelve a abrirse sin cuenta. " +
                "Tu sesión de Google, la de los demás proveedores, las rondas y los informes no se tocan. Después puedes entrar con otra cuenta.",
                false, null, "Cerrar la sesión", async (_, __) =>
                {
                    try
                    {
                        await paneles[id].BorrarSitio(urlDe(id));
                        await paneles[id].Navegar(urlDe(id));
                        Resultado($"Sesión de {nombre} cerrada. Entra con la cuenta que quieras en su página.");
                    }
                    catch (Exception e)
                    {
                        Resultado($"No se pudo cerrar la sesión de {nombre}: {e.Message}", true);
                    }
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
            var etapa = EtapaDelRegistro();
            var accion = visible == null ? null : Situacion(visible, etapa).Accion;
            var grupo = "Este panel" + (visible == null ? "" : ": " + Dominio.NombreProveedor(visible));
            if (visible != null && !Operadores.Contains(visible))
            {
                // Un rol: pegar solo en su etapa; capturar en su etapa siempre (después de reabrir la app no queda el
                // prompt en memoria y el paso vuelve a "Pegar"), fuera de ella con "Recapturar" del menú Ronda.
                var suEtapa = roles.DeLaEtapa(etapa).Contains(visible);
                return new List<Item>
                {
                    new Item { Grupo = grupo, Texto = PegarPromptAqui, Accion = () => _ = PegarRol(),
                        Motivo = accion == PegarPromptAqui ? null : "Solo en su etapa, cuando el panel está por pegar o el pegado falló." },
                    new Item { Grupo = grupo, Texto = ConFase(CapturarEste), Accion = () => _ = Capturar(AlCapturar(visible)),
                        Motivo = suEtapa ? null : "Solo en su etapa: fuera de ella, usa «Recapturar» del menú Ronda." },
                };
            }
            if (etapa == "operacion")
            {
                var pegable = accion == PegarOperacionAqui ? null : "Solo cuando el panel está por pegar o el pegado falló.";
                return new List<Item>
                {
                    new Item { Grupo = grupo, Texto = PegarOperacionAqui, Accion = () => ConAvisoDeOperacion(new List<string> { visible }, false), Motivo = pegable },
                    new Item { Grupo = grupo, Texto = PegarOperacionTexto, Accion = () => ConAvisoDeOperacion(new List<string> { visible }, true), Motivo = pegable },
                    new Item { Grupo = grupo, Texto = UsarAnterior, Accion = UsarOperacionAnterior,
                        Motivo = pegable == null ? null : "Solo cuando el panel todavía no operó en esta ronda." },
                    // Capturar cuando Juan quiera: la página puede haber terminado sin que la app lo viera (pegado a mano, otra pestaña).
                    new Item { Grupo = grupo, Texto = ConFase(CapturarEste), Accion = () => _ = Capturar(new List<string> { visible }), Motivo = paneles.ContainsKey(visible) ? null : "El panel no tiene su página abierta." },
                };
            }
            return new List<Item>
            {
                new Item { Grupo = grupo, Texto = PegarAqui, Accion = () => _ = PegarEnEste(),
                    Motivo = accion == PegarAqui ? null : "Solo cuando el panel está por pegar o el pegado falló." },
                // Capturar cuando Juan quiera, sin pegado previo: la app puede no haber visto terminar la página (se pegó a mano).
                new Item { Grupo = grupo, Texto = ConFase(CapturarEste), Accion = () => _ = Capturar(new List<string> { visible }),
                    Motivo = visible != null && paneles.ContainsKey(visible) ? null : "El panel no tiene su página abierta." },
            };
        }

        List<Item> ItemsDeLaRonda()
        {
            var sinRonda = Puerta.RondaActual == null;
            var paso = Puerta.PasoSiguiente();
            var hechos = sinRonda ? new List<Hecho>() : Puerta.LeerRegistro().Hechos;
            var sinInforme = sinRonda || Dominio.UltimoInformeIntegrador(hechos, Puerta.RondaActual) == null;
            var sinVerificacion = sinRonda || Dominio.UltimaSalidaVerificador(hechos, Puerta.RondaActual) == null;
            return new List<Item>
            {
                new Item { Grupo = "Ronda", Texto = "Recapturar el informe del integrador", Accion = () => _ = Recapturar("integrador"),
                    Motivo = sinInforme ? "Solo cuando la ronda ya tiene un informe del integrador." : null },
                new Item { Grupo = "Ronda", Texto = "Recapturar la verificación", Accion = () => _ = Recapturar("verificador"),
                    Motivo = sinVerificacion ? "Solo cuando la ronda ya tiene una verificación." : null },
                rolesMostrados.Count > 0
                    ? new Item { Grupo = "Ronda", Texto = "Ocultar los paneles de los roles", Accion = OcultarRoles }
                    : new Item { Grupo = "Ronda", Texto = "Mostrar los paneles de los roles", Accion = () => MostrarRoles() },
                new Item { Grupo = "Ronda", Texto = "Capturar lo que ya está en los paneles", Accion = () => _ = Capturar(Operadores.ToList()),
                    Motivo = sinRonda ? null : "Ya hay una ronda abierta: usa «Capturar los que terminaron»." },
                new Item { Grupo = "Ronda", Texto = "Declarar la pregunta de esta ronda", Accion = DialogoDeclarar,
                    Motivo = paso.Accion == "declarar-pregunta" ? null : "Solo cuando se capturó sin pegar la pregunta con la app." },
                new Item { Grupo = "Ronda", Texto = "Ronda nueva con las respuestas copiadas", Accion = DialogoRondaCopiada,
                    Motivo = sinRonda ? "No hay una ronda abierta." : null },
                new Item { Grupo = "Ronda", Texto = "Abandonar la ronda", Accion = DialogoAbandonar,
                    Motivo = sinRonda ? "No hay una ronda abierta." : null },
            };
        }

        List<Item> ItemsDePaneles() =>
            EnLaVista.Select(id => new Item { Grupo = "Paneles", Texto = $"{Dominio.NombreProveedor(id)} · {Estados[EstadoDe(id)].Palabra}", Accion = () => Seleccionar(id) }).ToList();

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
            // Nunca fuera de la vista: se desplaza adentro con el espacio que haya, y se abre hacia arriba si abajo falta.
            var alto = raiz.panel.visualTree.worldBound.height;
            float abajo = alto - r.yMax - 12, arriba = r.y - 12;
            var haciaArriba = !hoja && abajo < 240 && arriba > abajo;
            menu.style.top = hoja || haciaArriba ? new StyleLength(StyleKeyword.Auto) : new StyleLength(r.yMax + 4);
            menu.style.bottom = hoja ? new StyleLength(0f) : haciaArriba ? new StyleLength(alto - r.y + 4) : new StyleLength(StyleKeyword.Auto);
            menu.style.maxHeight = hoja ? alto * 0.8f : haciaArriba ? arriba : abajo;
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
            alAceptar = null; // un diálogo cerrado no deja su acción para el siguiente "Aceptar"
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
