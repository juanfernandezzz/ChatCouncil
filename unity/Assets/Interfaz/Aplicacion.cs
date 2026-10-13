using System;
using System.Collections;
using System.IO;
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
    /// Argumentos: -datos CARPETA (si no, la de Unity para la app); -tema oscuro; -seccion ajustes;
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

            var ajustes = ScriptableObject.CreateInstance<PanelSettings>();
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
            // En la raíz del panel, para que el tema oscuro y la fuente alcancen también a los menús desplegables.
            if (Arg("-tema") == "oscuro") arbol.panel.visualTree.AddToClassList("tema-oscuro");
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
            AplicarSemibold(raiz);
            // En el primer arranque, la guía es la única salida: sin riel ni cajón hasta terminarla.
            raiz.EnableInClassList("primer-arranque", primerArranque);
            if (!primerArranque) ArmarRonda(ruta == null);
            Mostrar(primerArranque || Arg("-seccion") == "ajustes" ? "ajustes" : "ronda");

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

        void Navegacion()
        {
            var cajon = raiz.Q("cajon");
            raiz.Q<Button>("ir-ronda").clicked += () => Mostrar("ronda");
            raiz.Q<Button>("ir-ajustes").clicked += () => Mostrar("ajustes");
            raiz.Q<Button>("cajon-ronda").clicked += () => Mostrar("ronda");
            raiz.Q<Button>("cajon-ajustes").clicked += () => Mostrar("ajustes");
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
            Configuracion.Raiz.Q<Button>("menu-configuracion").clicked += () => cajon.AddToClassList("cajon--abierto");
        }

        /// <summary>"ronda" o "ajustes".</summary>
        public void Mostrar(string seccion)
        {
            var ronda = seccion == "ronda";
            seccionRonda.style.display = ronda ? DisplayStyle.Flex : DisplayStyle.None;
            Configuracion.Raiz.style.display = ronda ? DisplayStyle.None : DisplayStyle.Flex;
            if (ronda) Configuracion.Ocultar();
            Ronda.MostrarSeccion(ronda);
            raiz.Q("ir-ronda").EnableInClassList("riel-item--actual", ronda);
            raiz.Q("ir-ajustes").EnableInClassList("riel-item--actual", !ronda);
            raiz.Q("cajon").RemoveFromClassList("cajon--abierto");
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
