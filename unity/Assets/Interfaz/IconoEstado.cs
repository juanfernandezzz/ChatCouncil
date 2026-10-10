using UnityEngine;
using UnityEngine.UIElements;

namespace ChatCouncil.Interfaz
{
    /// <summary>
    /// El símbolo del estado de un panel, dibujado: cada estado tiene su forma, así se distingue sin
    /// color (WCAG 1.4.1). El color sale de los tokens (--icono-color en Interfaz.uss). Siempre va
    /// junto a la palabra del estado (spec, "La interfaz").
    /// </summary>
    [UxmlElement]
    public partial class IconoEstado : VisualElement
    {
        static readonly CustomStyleProperty<Color> PropColor = new CustomStyleProperty<Color>("--icono-color");
        static readonly CustomStyleProperty<Color> PropFondo = new CustomStyleProperty<Color>("--icono-fondo");

        string estado = "por-pegar";
        Color color = Color.gray, fondo = Color.white;

        /// <summary>por-pegar, falta-enviar, respondiendo, terminado, capturado o problema.</summary>
        [UxmlAttribute]
        public string Estado
        {
            get => estado;
            set
            {
                RemoveFromClassList("icono-estado--" + estado);
                estado = value;
                AddToClassList("icono-estado--" + estado);
                MarkDirtyRepaint();
            }
        }

        public IconoEstado()
        {
            AddToClassList("icono-estado");
            AddToClassList("icono-estado--" + estado);
            generateVisualContent += Dibujar;
            RegisterCallback<CustomStyleResolvedEvent>(e =>
            {
                if (e.customStyle.TryGetValue(PropColor, out var c)) color = c;
                if (e.customStyle.TryGetValue(PropFondo, out var f)) fondo = f;
                MarkDirtyRepaint();
            });
        }

        void Dibujar(MeshGenerationContext ctx)
        {
            var p = ctx.painter2D;
            var r = contentRect;
            var c = r.center;
            var rad = Mathf.Min(r.width, r.height) / 2f - 1.5f;
            p.lineWidth = 2f;
            p.strokeColor = color;
            p.fillColor = color;
            switch (estado)
            {
                case "falta-enviar": // círculo con un punto: algo espera a la persona
                    Circulo(p, c, rad); p.Stroke();
                    Circulo(p, c, rad * 0.4f); p.Fill();
                    break;
                case "respondiendo": // medio lleno
                    Circulo(p, c, rad); p.Stroke();
                    p.BeginPath();
                    p.MoveTo(c + new Vector2(0, rad));
                    p.Arc(c, rad, Angle.Degrees(90), Angle.Degrees(270));
                    p.ClosePath();
                    p.Fill();
                    break;
                case "terminado": // lleno
                    Circulo(p, c, rad); p.Fill();
                    break;
                case "capturado": // lleno, con una marca
                    Circulo(p, c, rad); p.Fill();
                    p.strokeColor = fondo;
                    p.BeginPath();
                    p.MoveTo(c + new Vector2(-0.45f * rad, 0));
                    p.LineTo(c + new Vector2(-0.1f * rad, 0.35f * rad));
                    p.LineTo(c + new Vector2(0.45f * rad, -0.35f * rad));
                    p.Stroke();
                    break;
                case "problema": // triángulo con un signo de exclamación
                    p.BeginPath();
                    p.MoveTo(new Vector2(c.x, r.yMin + 1));
                    p.LineTo(new Vector2(r.xMax - 1, r.yMax - 1));
                    p.LineTo(new Vector2(r.xMin + 1, r.yMax - 1));
                    p.ClosePath();
                    p.Fill();
                    p.strokeColor = fondo;
                    p.BeginPath();
                    p.MoveTo(new Vector2(c.x, r.yMin + r.height * 0.38f));
                    p.LineTo(new Vector2(c.x, r.yMin + r.height * 0.66f));
                    p.Stroke();
                    p.fillColor = fondo;
                    Circulo(p, new Vector2(c.x, r.yMin + r.height * 0.8f), 1.3f);
                    p.Fill();
                    break;
                default: // por-pegar: círculo vacío
                    Circulo(p, c, rad); p.Stroke();
                    break;
            }
        }

        static void Circulo(Painter2D p, Vector2 centro, float radio)
        {
            p.BeginPath();
            p.Arc(centro, radio, Angle.Degrees(0), Angle.Degrees(360));
            p.ClosePath();
        }
    }
}
