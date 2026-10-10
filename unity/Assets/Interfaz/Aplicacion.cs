using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using ChatCouncil.Motor;
using ChatCouncil.Panel;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.TextCore.Text;
using UnityEngine.UIElements;

namespace ChatCouncil.Interfaz
{
    /// <summary>
    /// La app (T19): las secciones de docs/FASE6-INTERFAZ.md con los tokens de Tokens.uss. Sin archivo de
    /// selección arranca guiada (D10); con él, arma la Ronda con ese consejo y restaura la ronda activa del
    /// registro. No arranca con -autoprueba.
    /// Argumentos: -datos CARPETA (si no, la de Unity para la app); -tema oscuro; -seccion ajustes;
    /// -captura RUTA [-ancho N -alto N]: dibuja la interfaz en una textura de N×N dp a escala 1, la guarda
    /// como PNG y cierra la app; -pruebainterfaz RUTA -fase N: PruebaInterfaz.cs.
    /// </summary>
    public sealed class Aplicacion : MonoBehaviour
    {
        /// <summary>Clases de tamaño de ventana de Material 3, en dp (D3).</summary>
        const float AnchoExpandida = 840, AnchoMediana = 600;
        /// <summary>Interlineado de los párrafos (WCAG 1.4.8); la fuente trae 1,30.</summary>
        const float Interlineado = 1.5f;

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

        static FontDefinition semibold;

        string[] args;
        RenderTexture textura;
        VisualElement raiz, seccionRonda;

        public string CarpetaDatos { get; private set; }
        public Puerta Puerta { get; private set; }
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

            var primerArranque = !File.Exists(Path.Combine(CarpetaDatos, Roles.ArchivoSeleccion));
            var prueba = Arg("-pruebainterfaz");
            Configuracion = new Configuracion(CarpetaDatos, primerArranque,
                prueba == null ? UrlDeSpec : (Func<string, string>)PruebaInterfaz.Url,
                prueba == null ? () => Paneles.Iniciar(Path.Combine(CarpetaDatos, "navegador")) : (Func<Task>)(() => PruebaInterfaz.IniciarNavegador(CarpetaDatos)));
            raiz.Q("secciones").Add(Configuracion.Raiz);
            Configuracion.Empezar += () =>
            {
                raiz.RemoveFromClassList("primer-arranque");
                ArmarRonda();
                Mostrar("ronda");
            };

            Navegacion();
            AplicarSemibold(raiz);
            // En el primer arranque, la guía es la única salida: sin riel ni cajón hasta terminarla.
            raiz.EnableInClassList("primer-arranque", primerArranque);
            if (!primerArranque) ArmarRonda();
            Mostrar(primerArranque || Arg("-seccion") == "ajustes" ? "ajustes" : "ronda");

            if (ruta != null) StartCoroutine(Capturar(ruta));
            if (prueba != null) gameObject.AddComponent<PruebaInterfaz>().Iniciar(this, prueba, int.Parse(Arg("-fase") ?? "1"));
        }

        static string UrlDeSpec(string id) => (string)JObject.Parse(Datos.Specs)["specs"][id]["newConversationUrl"];

        // ---------------------------------------------------------------- secciones (D2, D3)

        void Navegacion()
        {
            var cajon = raiz.Q("cajon");
            void Abrir() => cajon.AddToClassList("cajon--abierto");
            raiz.Q<Button>("ir-ronda").clicked += () => Mostrar("ronda");
            raiz.Q<Button>("ir-ajustes").clicked += () => Mostrar("ajustes");
            raiz.Q<Button>("cajon-ronda").clicked += () => Mostrar("ronda");
            raiz.Q<Button>("cajon-ajustes").clicked += () => Mostrar("ajustes");
            raiz.Q<Button>("cajon-fondo").clicked += () => cajon.RemoveFromClassList("cajon--abierto");
            raiz.Q<Button>("menu").clicked += Abrir;
            Configuracion.Raiz.Q<Button>("menu-configuracion").clicked += Abrir;
        }

        /// <summary>"ronda" o "ajustes".</summary>
        public void Mostrar(string seccion)
        {
            var ronda = seccion == "ronda";
            seccionRonda.style.display = ronda ? DisplayStyle.Flex : DisplayStyle.None;
            Configuracion.Raiz.style.display = ronda ? DisplayStyle.None : DisplayStyle.Flex;
            if (ronda) Configuracion.Ocultar();
            raiz.Q("ir-ronda").EnableInClassList("riel-item--actual", ronda);
            raiz.Q("ir-ajustes").EnableInClassList("riel-item--actual", !ronda);
            raiz.Q("cajon").RemoveFromClassList("cajon--abierto");
        }

        // ---------------------------------------------------------------- la Ronda

        /// <summary>El consejo del archivo de selección (o los nueve con los roles por defecto) y la ronda activa del registro.</summary>
        void ArmarRonda()
        {
            string contenido = null;
            try
            {
                var archivo = Path.Combine(CarpetaDatos, Roles.ArchivoSeleccion);
                if (File.Exists(archivo)) contenido = File.ReadAllText(archivo, Encoding.UTF8);
            }
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
            {
                // ilegible: como sin archivo (seleccion-proveedores.ts)
            }
            var activos = Roles.LeerSeleccion(contenido, Roles.Conocidos) ?? Roles.Conocidos.ToList();
            var roles = Roles.Leer(contenido, Roles.Conocidos);
            var pool = Roles.PoolDeInvestigadores(Roles.Conocidos, roles);
            Puerta = new Puerta(CarpetaDatos, () => Guid.NewGuid().ToString(), () => DateTimeOffset.Now, activos, roles, pool);
            Puerta.RestaurarRondaActiva();
            var paso = Puerta.PasoSiguiente();

            var actual = Array.IndexOf(Etapas, paso.Etapa);
            int j = 0;
            raiz.Query(className: "etapa").ForEach(e =>
            {
                e.EnableInClassList("etapa--hecha", j < actual);
                e.EnableInClassList("etapa--actual", j == actual);
                e.Q(className: "etapa-nombre").EnableInClassList("semibold", j == actual);
                j++;
            });
            j = 0;
            raiz.Q(className: "progreso").Query(className: "etapa-barra").ForEach(e =>
            {
                e.EnableInClassList("etapa-barra--hecha", j < actual);
                e.EnableInClassList("etapa-barra--actual", j == actual);
                j++;
            });
            raiz.Q<Label>("barra-titulo").text = $"{NombresEtapa[actual]} · {actual + 1} de {Etapas.Length}";
            raiz.Q<Button>("paso-ancha").text = raiz.Q<Button>("paso-angosta").text = paso.Texto;
            raiz.Q<Label>("frase-ancha").text = raiz.Q<Label>("frase-angosta").text = paso.Recordatorio;

            var operadores = pool.Where(activos.Contains).ToList();
            var lista = raiz.Q<ScrollView>("lista");
            lista.Clear();
            lista.Add(Titulo($"Operadores ({operadores.Count})"));
            foreach (var id in operadores) lista.Add(Fila(id, Palabra(id)));
            lista.Add(Titulo("Roles (aparecen en su etapa)"));
            lista.Add(Fila(roles.Integrador, roles.Redactor == roles.Integrador ? "Integra y redacta" : "Integra"));
            lista.Add(Fila(roles.Verificador, "Verifica"));
            if (roles.Redactor != roles.Integrador) lista.Add(Fila(roles.Redactor, "Redacta"));

            var visible = operadores.FirstOrDefault() ?? roles.Integrador;
            var (icono, palabra) = Estados[Puerta.EstadoDePanel(visible, null, null)];
            raiz.Q<IconoEstado>("icono-cabecera").Estado = raiz.Q<IconoEstado>("icono-selector").Estado = icono;
            raiz.Q<Label>("cabecera-titulo").text = $"{Dominio.NombreProveedor(visible)} · {palabra}";
            raiz.Q<Label>("selector-texto").text = $"{Dominio.NombreProveedor(visible)} · {palabra} · 1 de {operadores.Count}";
            if (lista.childCount > 1) lista[1].AddToClassList("fila-panel--actual");
            AplicarSemibold(raiz);
        }

        string Palabra(string id) => Estados[Puerta.EstadoDePanel(id, null, null)].Palabra;

        static Label Titulo(string texto)
        {
            var l = new Label(texto);
            l.AddToClassList("lista-titulo");
            return l;
        }

        VisualElement Fila(string id, string texto)
        {
            var fila = new VisualElement { name = "fila-" + id };
            fila.AddToClassList("fila-panel");
            var icono = new IconoEstado { Estado = Estados[Puerta.EstadoDePanel(id, null, null)].Icono };
            var nombre = new Label(Dominio.NombreProveedor(id));
            nombre.AddToClassList("fila-nombre");
            nombre.AddToClassList("semibold");
            var estado = new Label(texto);
            estado.AddToClassList("fila-estado");
            fila.Add(icono);
            fila.Add(nombre);
            fila.Add(estado);
            return fila;
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
