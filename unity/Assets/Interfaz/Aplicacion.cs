using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using ChatCouncil.Motor;
using ChatCouncil.Panel;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.TextCore.Text;
using UnityEngine.UIElements;

namespace ChatCouncil.Interfaz
{
    /// <summary>
    /// La app: las secciones de docs/FASE6-INTERFAZ.md con los tokens de Tokens.uss. Sin archivo de selección
    /// arranca guiada (D10); con él, arma la Ronda (PantallaRonda.cs) con ese consejo y la ronda activa del
    /// registro. No arranca con -autoprueba.
    /// Argumentos: -datos CARPETA (si no, la de Unity para la app); -tema claro|oscuro; -texto 100|125|150|200; -seccion ronda|historial|ajustes|ayuda;
    /// -captura RUTA [-ancho N -alto N] [-panel ID] [-frase plegada]: dibuja la interfaz en una textura de N×N dp
    /// a escala 1, sin páginas, la guarda como PNG y cierra la app; -pruebainterfaz RUTA -fase N: PruebaInterfaz.cs;
    /// -pruebaronda RUTA: PruebaRonda.cs.
    /// </summary>
    public sealed class Aplicacion : MonoBehaviour
    {
        /// <summary>Clases de tamaño de ventana de Material 3, en dp (D3).</summary>
        const float AnchoExpandida = 840, AnchoMediana = 600;
        /// <summary>Interlineado de los párrafos (WCAG 1.4.8); la fuente trae 1,30.</summary>
        const float Interlineado = 1.5f;

        static FontDefinition semibold;

        string[] args;
        RenderTexture textura;
        PanelSettings ajustes;
        VisualElement raiz, seccionRonda;
        Task navegador;

        public string CarpetaDatos { get; private set; }
        public PantallaRonda Ronda { get; private set; }
        public Puerta Puerta => Ronda.Puerta;
        public Configuracion Configuracion { get; private set; }
        public VisualElement Raiz => raiz;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Arrancar()
        {
            var args = Environment.GetCommandLineArgs();
            if (Array.IndexOf(args, "-autoprueba") >= 0) return;
            var go = new GameObject("Interfaz");
            DontDestroyOnLoad(go);
            go.AddComponent<Aplicacion>().args = args;
        }

        string Arg(string nombre)
        {
            var i = Array.IndexOf(args, nombre);
            return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
        }

        void Start()
        {
            CarpetaDatos = Arg("-datos") ?? Application.persistentDataPath;

            ajustes = ScriptableObject.CreateInstance<PanelSettings>();
            // El tema importa Tokens.uss e Interfaz.uss: así alcanzan también a los menús desplegables, que cuelgan de la raíz del panel.
            ajustes.themeStyleSheet = Resources.Load<ThemeStyleSheet>("Interfaz/Tema");
            // 1 px de USS = 1 dp en Android (160 dpi) y 1 píxel efectivo en Windows (96 dpi a escala 100 %).
            ajustes.scaleMode = PanelScaleMode.ConstantPhysicalSize;
            ajustes.referenceDpi = ajustes.fallbackDpi = Application.platform == RuntimePlatform.Android ? 160 : 96;

            // Captura a un tamaño exacto en dp, sin depender del monitor (la ventana no puede ser más alta que la pantalla).
            var ruta = Arg("-captura");
            if (ruta != null)
            {
                textura = new RenderTexture(int.Parse(Arg("-ancho") ?? "1366"), int.Parse(Arg("-alto") ?? "768"), 24, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB);
                ajustes.targetTexture = textura;
                ajustes.scaleMode = PanelScaleMode.ConstantPixelSize;
                ajustes.scale = 1;
                ajustes.clearColor = true;
            }

            var doc = gameObject.AddComponent<UIDocument>();
            doc.panelSettings = ajustes;
            doc.visualTreeAsset = Resources.Load<VisualTreeAsset>("Interfaz/Ronda");

            var arbol = doc.rootVisualElement;
            arbol.style.flexGrow = 1;
            arbol.panel.visualTree.style.unityFontDefinition = FontDefinition.FromSDFFont(Fuente("AtkinsonHyperlegibleNext-Regular"));
            semibold = FontDefinition.FromSDFFont(Fuente("AtkinsonHyperlegibleNext-SemiBold"));

            raiz = arbol.Q("raiz");
            seccionRonda = raiz.Q("seccion-ronda");
            arbol.RegisterCallback<GeometryChangedEvent>(e =>
            {
                var ancho = e.newRect.width;
                raiz.EnableInClassList("ancha", ancho >= AnchoExpandida);
                raiz.EnableInClassList("angosta", ancho < AnchoExpandida);
                raiz.EnableInClassList("compacta", ancho < AnchoMediana);
            });

            // En las pruebas, páginas locales en lugar de los proveedores y nunca la carpeta real (-datos).
            var pruebaRonda = Arg("-pruebaronda");
            var prueba = pruebaRonda != null || Arg("-pruebainterfaz") != null;
            Func<string, string> urlCuentas = prueba ? (Func<string, string>)PruebaInterfaz.Url : UrlDeSpec;
            Ronda = new PantallaRonda(raiz, CarpetaDatos, Navegador,
                pruebaRonda != null ? (Func<string, string>)PruebaRonda.Url : urlCuentas,
                pruebaRonda != null ? (Func<string, string>)(_ => PruebaRonda.Spec) : SpecDe);

            var primerArranque = !File.Exists(Path.Combine(CarpetaDatos, Roles.ArchivoSeleccion));
            Configuracion = new Configuracion(CarpetaDatos, primerArranque, urlCuentas, Navegador);
            raiz.Q("secciones").Add(Configuracion.Raiz);
            Configuracion.Empezar += () =>
            {
                raiz.RemoveFromClassList("primer-arranque");
                ArmarRonda(ruta == null);
                Mostrar("ronda");
            };

            Navegacion();
            // En la raíz del panel, para que el tema oscuro alcance también a los menús desplegables.
            Apariencia();
            arbol.panel.visualTree.RegisterCallback<KeyDownEvent>(Teclas, TrickleDown.TrickleDown);
            arbol.panel.visualTree.RegisterCallback<NavigationMoveEvent>(Navegar, TrickleDown.TrickleDown);
            gameObject.AddComponent<Lector>().Iniciar(arbol);
            // -lector: la jerarquía aunque no haya un lector encendido, para medirla por UI Automation.
            if (Array.IndexOf(args, "-lector") >= 0) UnityEngine.Accessibility.AssistiveSupport.screenReaderStatusOverride = UnityEngine.Accessibility.AssistiveSupport.ScreenReaderStatusOverride.ForceEnabled;
            AplicarSemibold(raiz);
            // En el primer arranque, la guía es la única salida: sin riel ni cajón hasta terminarla.
            raiz.EnableInClassList("primer-arranque", primerArranque);
            if (!primerArranque) ArmarRonda(ruta == null);
            Mostrar(primerArranque ? "ajustes" : Array.IndexOf(Secciones, Arg("-seccion")) >= 0 ? Arg("-seccion") : "ronda");

            if (ruta != null)
            {
                // Para capturar un estado que en la app se alcanza con clics: el panel a la vista y la frase plegada.
                if (Arg("-panel") != null && !primerArranque) Ronda.Seleccionar(Arg("-panel"));
                if (Arg("-frase") == "plegada") Ronda.PlegarFrase();
                StartCoroutine(Capturar(ruta));
            }
            if (Arg("-pruebainterfaz") != null) gameObject.AddComponent<PruebaInterfaz>().Iniciar(this, Arg("-pruebainterfaz"), int.Parse(Arg("-fase") ?? "1"));
            if (pruebaRonda != null) gameObject.AddComponent<PruebaRonda>().Iniciar(this, pruebaRonda);
        }

        /// <summary>Un solo navegador para la Ronda y para Ajustes, iniciado la primera vez que alguien lo pide.</summary>
        Task Navegador() =>
            navegador ??= Arg("-pruebaronda") != null || Arg("-pruebainterfaz") != null
                ? PruebaInterfaz.IniciarNavegador(CarpetaDatos)
                : Paneles.Iniciar(Path.Combine(CarpetaDatos, "navegador"));

        static string SpecDe(string id) => JObject.Parse(Datos.Specs)["specs"][id].ToString(Formatting.None);

        static string UrlDeSpec(string id) => (string)JObject.Parse(Datos.Specs)["specs"][id]["newConversationUrl"];

        /// <summary>Las capturas de la interfaz no abren páginas: dibujan en una textura.</summary>
        void ArmarRonda(bool conPaginas)
        {
            Ronda.Armar();
            if (conPaginas) _ = Ronda.Conectar();
        }

        // ---------------------------------------------------------------- secciones (D2, D3)

        static readonly string[] Secciones = { "ronda", "historial", "ajustes", "ayuda" };

        VisualElement Seccion(string nombre) => nombre == "ajustes" ? Configuracion.Raiz : raiz.Q("seccion-" + nombre);

        void Navegacion()
        {
            var cajon = raiz.Q("cajon");
            foreach (var s in Secciones)
            {
                raiz.Q<Button>("ir-" + s).clicked += () => Mostrar(s);
                raiz.Q<Button>("cajon-" + s).clicked += () => Mostrar(s);
            }
            raiz.Q<Button>("cajon-fondo").clicked += () =>
            {
                cajon.RemoveFromClassList("cajon--abierto");
                Ronda.MostrarSeccion(seccionRonda.style.display != DisplayStyle.None);
            };
            raiz.Q<Button>("menu").clicked += () =>
            {
                Ronda.MostrarSeccion(false); // el cajón va encima de la página: la página se aparta
                cajon.AddToClassList("cajon--abierto");
            };
            raiz.Query<Button>(className: "abre-cajon").ForEach(b => b.clicked += () => cajon.AddToClassList("cajon--abierto"));
            raiz.Q<Label>("version").text = $"ChatCouncil, versión {Application.version}.";
            raiz.Q<Button>("ver-versiones").clicked += () => Application.OpenURL(PaginaDeVersiones);
        }

        const string PaginaDeVersiones = "https://github.com/juanfernandezzz/ChatCouncil/releases";

        /// <summary>"ronda", "historial", "ajustes" o "ayuda".</summary>
        public void Mostrar(string seccion)
        {
            foreach (var s in Secciones)
            {
                Seccion(s).style.display = s == seccion ? DisplayStyle.Flex : DisplayStyle.None;
                raiz.Q("ir-" + s).EnableInClassList("riel-item--actual", s == seccion);
            }
            if (seccion != "ajustes") Configuracion.Ocultar();
            if (seccion == "historial") ArmarHistorial();
            Ronda.MostrarSeccion(seccion == "ronda");
            raiz.Q("cajon").RemoveFromClassList("cajon--abierto");
        }

        /// <summary>Las rondas de este aparato (D12): fecha, pregunta, etapa alcanzada y su informe.</summary>
        void ArmarHistorial()
        {
            var lista = raiz.Q("lista-historial");
            lista.Clear();
            var rondas = Ronda.Puerta?.RondasAnteriores() ?? new List<RondaAnterior>();
            if (rondas.Count == 0) lista.Add(new Label("Todavía no hay rondas en este aparato.") { name = "historial-vacio" });
            var android = Application.platform == RuntimePlatform.Android;
            foreach (var r in rondas)
            {
                var fila = new VisualElement { name = "historial-" + r.RondaId };
                fila.AddToClassList("fila-cuenta");
                fila.AddToClassList("fila-historial");
                var texto = new VisualElement();
                texto.AddToClassList("cabecera-texto");
                var fecha = DateTime.TryParse(r.EnviadaEn, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var utc)
                    ? utc.ToLocalTime().ToString("d 'de' MMMM 'de' yyyy, HH:mm", new CultureInfo("es")) : r.EnviadaEn;
                var pregunta = new Label(r.Pregunta == Puerta.PromptSinRonda ? "(capturada sin pegar la pregunta, y sin declararla)" : r.Pregunta);
                pregunta.AddToClassList("envolver");
                pregunta.AddToClassList("semibold");
                // En Android la carpeta no se abre (D41): se dice dónde está.
                var detalle = new Label($"{fecha} · llegó a {PantallaRonda.NombreDeEtapa(r.CarpetaInforme != null ? "informe" : r.Etapa)}"
                                        + (r.CarpetaInforme == null ? " · sin informe" : android ? $" · informe en {r.CarpetaInforme}" : ""));
                detalle.AddToClassList("pequeno");
                detalle.AddToClassList("texto-2");
                detalle.AddToClassList("envolver");
                texto.Add(pregunta);
                texto.Add(detalle);
                fila.Add(texto);
                if (r.CarpetaInforme != null && !android)
                {
                    var abrir = new Button(() => Ronda.AbrirCarpeta(r.CarpetaInforme)) { text = "Abrir el informe" };
                    abrir.AddToClassList("boton");
                    fila.Add(abrir);
                }
                lista.Add(fila);
            }
            AplicarSemibold(lista);
        }

        // ---------------------------------------------------------------- apariencia (D17, D20)

        const string ArchivoApariencia = "apariencia.json";
        static readonly string[] Temas = { "sistema", "claro", "oscuro" };
        static readonly string[] NombresTema = { "El del sistema", "Claro", "Oscuro" };
        /// <summary>0 es el del sistema; el resto, porcentajes. 200 % es el tope de WCAG 1.4.4.</summary>
        static readonly int[] Tamanos = { 0, 100, 125, 150, 200 };

        string RutaApariencia => Path.Combine(CarpetaDatos, ArchivoApariencia);

        void Apariencia()
        {
            string tema = "sistema";
            int texto = 0;
            try
            {
                var j = JObject.Parse(File.ReadAllText(RutaApariencia));
                tema = Array.IndexOf(Temas, (string)j["tema"]) >= 0 ? (string)j["tema"] : tema;
                texto = j["texto"]?.Type == JTokenType.Integer && Array.IndexOf(Tamanos, (int)j["texto"]) >= 0 ? (int)j["texto"] : texto;
            }
            catch (Exception)
            {
                // sin archivo, ilegible o con un valor de otro tipo: las del sistema, nunca una app que no arranca
                tema = "sistema";
                texto = 0;
            }
            var dTema = Configuracion.Raiz.Q<DropdownField>("tema");
            var dTexto = Configuracion.Raiz.Q<DropdownField>("tamano-texto");
            dTema.choices = NombresTema.ToList();
            dTema.index = Array.IndexOf(Temas, tema);
            dTexto.choices = Tamanos.Select(t => t == 0 ? "El del sistema" : $"{t} %").ToList();
            dTexto.index = Array.IndexOf(Tamanos, texto);
            void Elegir()
            {
                var t = Temas[dTema.index];
                var n = Tamanos[dTexto.index];
                AplicarApariencia(t, n);
                try
                {
                    File.WriteAllText(RutaApariencia, new JObject { ["tema"] = t, ["texto"] = n }.ToString(Formatting.None));
                }
                catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
                {
                    // se aplica igual; la próxima vez vuelve la anterior
                }
            }
            dTema.RegisterValueChangedCallback(_ => Elegir());
            dTexto.RegisterValueChangedCallback(_ => Elegir());
            // Las capturas fijan el tema y el tamaño por argumento: no dependen de la máquina.
            AplicarApariencia(Arg("-tema") ?? (Arg("-captura") != null ? "claro" : tema), Arg("-texto") != null ? int.Parse(Arg("-texto")) : texto);
        }

        void AplicarApariencia(string tema, int texto)
        {
            raiz.panel.visualTree.EnableInClassList("tema-oscuro", tema == "oscuro" || tema == "sistema" && SistemaOscuro());
            // Todo crece junto (como el zoom de un navegador) y la ronda pasa sola a la clase angosta cuando no entra (WCAG 1.4.10).
            ajustes.scale = texto == 0 ? Mathf.Clamp(UnityEngine.Accessibility.AccessibilitySettings.fontScale, 1, 2) : texto / 100f;
        }

        static bool SistemaOscuro()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            using (var unity = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
            using (var actividad = unity.GetStatic<AndroidJavaObject>("currentActivity"))
            using (var recursos = actividad.Call<AndroidJavaObject>("getResources"))
            using (var config = recursos.Call<AndroidJavaObject>("getConfiguration"))
                return (config.Get<int>("uiMode") & 0x30) == 0x20; // UI_MODE_NIGHT_YES
#else
            // AppsUseLightTheme vale 0 con el tema oscuro de Windows; sin el valor, claro (D20).
            int valor = 1, largo = 4;
            return RegGetValueW(new UIntPtr(0x80000001u), @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize", "AppsUseLightTheme", 0x10, IntPtr.Zero, ref valor, ref largo) == 0
                   && valor == 0;
#endif
        }

        [System.Runtime.InteropServices.DllImport("advapi32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
        static extern int RegGetValueW(UIntPtr clave, string subclave, string valor, uint banderas, IntPtr tipo, ref int datos, ref int largo);

        // ---------------------------------------------------------------- atajos (D8, D49)

        bool focoEnPagina;

        void Teclas(KeyDownEvent e)
        {
            // Teclado de una mano (D49): cada acción con su tecla de F1 a F5. Alt+F4 es del sistema.
            if (e.altKey) return;
            var enRonda = seccionRonda.style.display != DisplayStyle.None && !raiz.Q("capa").ClassListContains("capa--abierta");
            if (e.keyCode == KeyCode.F1 && enRonda) Ronda.Mover(-1);
            else if (e.keyCode == KeyCode.F2 && enRonda) Ronda.Mover(1);
            else if (e.keyCode == KeyCode.F3 && enRonda) Ronda.Paso();
            else if (e.keyCode == KeyCode.F4) Region(1);
            else if (e.keyCode == KeyCode.F5) Region(-1);
            else return;
            if (e.keyCode <= KeyCode.F3) focoEnPagina = false; // desde la página, la tecla devolvió el foco a la app
            e.StopPropagation();
        }

        void Navegar(NavigationMoveEvent e)
        {
            if (!e.ctrlKey || e.direction != NavigationMoveEvent.Direction.Next && e.direction != NavigationMoveEvent.Direction.Previous) return;
            if (seccionRonda.style.display == DisplayStyle.None) return;
            Ronda.Mover(e.direction == NavigationMoveEvent.Direction.Next ? 1 : -1);
            e.StopPropagation();
            raiz.focusController.IgnoreEvent(e);
        }

        static bool Visible(VisualElement e)
        {
            for (var x = e; x != null; x = x.parent)
                if (x.resolvedStyle.display == DisplayStyle.None) return false;
            return e.worldBound.width > 0;
        }

        /// <summary>
        /// F4 y F5: la región siguiente o la anterior (riel, guía, lista, cabecera, la página del proveedor, abajo). La página
        /// nativa recibe el foco del panel; desde ella, la tecla vuelve a la app (panel.cpp) y sigue desde la página.
        /// </summary>
        void Region(int paso)
        {
            var regiones = raiz.Query(className: "region").Where(Visible).ToList();
            if (regiones.Count == 0) return;
            var foco = raiz.focusController.focusedElement as VisualElement;
            var actual = focoEnPagina ? regiones.FindIndex(r => r.ClassListContains("pagina")) : regiones.FindIndex(r => foco != null && r.Contains(foco));
            focoEnPagina = false;
            for (var i = 1; i <= regiones.Count; i++)
            {
                var r = regiones[((actual < 0 ? (paso > 0 ? -1 : 0) : actual) + paso * i + regiones.Count * 2) % regiones.Count];
                if (r.ClassListContains("pagina"))
                {
                    if (!(r.name == "cuenta-pagina" ? Configuracion.FocoEnCuenta() : Ronda.FocoEnPagina())) continue;
                    focoEnPagina = true;
                    return;
                }
                var destino = r.Query<VisualElement>().Where(x => x.focusable && x.canGrabFocus && x.enabledInHierarchy && Visible(x)).First();
                if (destino == null) continue;
                destino.Focus();
                return;
            }
        }

        // ---------------------------------------------------------------- fuente y captura

        public static void AplicarSemibold(VisualElement e) =>
            e.Query(className: "semibold").ForEach(x => x.style.unityFontDefinition = semibold);

        static FontAsset Fuente(string nombre)
        {
            var fuente = FontAsset.CreateFontAsset(Resources.Load<Font>("Interfaz/Fuentes/" + nombre));
            var cara = fuente.faceInfo;
            cara.lineHeight = cara.pointSize * Interlineado;
            fuente.faceInfo = cara;
            return fuente;
        }

        IEnumerator Capturar(string ruta)
        {
            yield return new WaitForSeconds(1.5f); // que se arme el diseño y el atlas de la fuente
            yield return new WaitForEndOfFrame();
            RenderTexture.active = textura;
            var imagen = new Texture2D(textura.width, textura.height, TextureFormat.RGBA32, false);
            imagen.ReadPixels(new Rect(0, 0, textura.width, textura.height), 0, 0);
            imagen.Apply();
            RenderTexture.active = null;
            File.WriteAllBytes(ruta, imagen.EncodeToPNG());
            Application.Quit(0);
        }
    }
}
