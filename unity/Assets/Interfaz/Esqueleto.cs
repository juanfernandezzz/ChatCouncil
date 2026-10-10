using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.TextCore.Text;
using UnityEngine.UIElements;

namespace ChatCouncil.Interfaz
{
    /// <summary>
    /// El esqueleto de la pantalla de Ronda (T18, parte 5): la arquitectura de docs/FASE6-INTERFAZ.md
    /// con los tokens de Tokens.uss y datos de ejemplo. No arranca con -autoprueba.
    /// Argumentos: -tema oscuro; -captura RUTA [-ancho N -alto N]: dibuja la interfaz en una textura de N×N dp
    /// a escala 1, la guarda como PNG y cierra la app.
    /// </summary>
    public sealed class Esqueleto : MonoBehaviour
    {
        /// <summary>Clases de tamaño de ventana de Material 3, en dp (D3).</summary>
        const float AnchoExpandida = 840, AnchoMediana = 600;
        /// <summary>Interlineado de los párrafos (WCAG 1.4.8); la fuente trae 1,30.</summary>
        const float Interlineado = 1.5f;

        string[] args;
        RenderTexture textura;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Arrancar()
        {
            var args = Environment.GetCommandLineArgs();
            if (Array.IndexOf(args, "-autoprueba") >= 0) return;
            var go = new GameObject("Interfaz");
            DontDestroyOnLoad(go);
            go.AddComponent<Esqueleto>().args = args;
        }

        string Arg(string nombre)
        {
            var i = Array.IndexOf(args, nombre);
            return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
        }

        void Start()
        {
            var ajustes = ScriptableObject.CreateInstance<PanelSettings>();
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

            var raiz = doc.rootVisualElement;
            raiz.style.flexGrow = 1;
            if (Arg("-tema") == "oscuro") raiz.AddToClassList("tema-oscuro");

            raiz.style.unityFontDefinition = FontDefinition.FromSDFFont(Fuente("AtkinsonHyperlegibleNext-Regular"));
            var semibold = FontDefinition.FromSDFFont(Fuente("AtkinsonHyperlegibleNext-SemiBold"));
            raiz.Query(className: "semibold").ForEach(e => e.style.unityFontDefinition = semibold);

            var contenido = raiz.Q("raiz");
            raiz.RegisterCallback<GeometryChangedEvent>(e =>
            {
                var ancho = e.newRect.width;
                contenido.EnableInClassList("ancha", ancho >= AnchoExpandida);
                contenido.EnableInClassList("angosta", ancho < AnchoExpandida);
                contenido.EnableInClassList("compacta", ancho < AnchoMediana);
            });

            if (ruta != null) StartCoroutine(Capturar(ruta));
        }

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
