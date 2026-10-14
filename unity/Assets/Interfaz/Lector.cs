using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.Accessibility;
using UnityEngine.UIElements;

namespace ChatCouncil.Interfaz
{
    /// <summary>
    /// Los controles de UI Toolkit para los lectores de pantalla (D50, WCAG 4.1.2): Narrador en Windows y TalkBack en
    /// Android. UI Toolkit no los publica solo; esto arma la jerarquía de accesibilidad con lo que está a la vista, en el
    /// orden del documento. La rearma solo cuando cambian los controles a la vista; si cambia un texto, un valor o un
    /// estado, actualiza su nodo (rearmarla movería el foco del lector). Las páginas de los proveedores no pasan por
    /// aquí: son ventanas nativas con su propia accesibilidad.
    /// </summary>
    public sealed class Lector : MonoBehaviour
    {
        const float CadaSegundos = 0.5f;

        VisualElement arbol;
        List<VisualElement> armados;
        List<AccessibilityNode> nodos = new List<AccessibilityNode>();
        float proxima;

        public void Iniciar(VisualElement arbol) => this.arbol = arbol;

        void Update()
        {
            if (arbol?.panel == null || !AssistiveSupport.isScreenReaderEnabled || Time.unscaledTime < proxima) return;
            proxima = Time.unscaledTime + CadaSegundos;
            var elementos = arbol.Query<VisualElement>().Where(e => Rol(e) != AccessibilityRole.None && Visible(e)).ToList();
            if (armados != null && elementos.SequenceEqual(armados) && elementos.Select(Rol).SequenceEqual(nodos.Select(n => n.role)))
            {
                for (var i = 0; i < nodos.Count; i++) Actualizar(nodos[i], elementos[i]);
                AssistiveSupport.activeHierarchy?.RefreshNodeFrames();
                return;
            }
            var h = new AccessibilityHierarchy();
            armados = elementos;
            nodos = new List<AccessibilityNode>();
            foreach (var e in elementos)
            {
                var n = h.AddNode(Nombre(e));
                n.role = Rol(e);
                Actualizar(n, e);
                nodos.Add(n);
                var x = e;
                n.frameGetter = () => Marco(x);
                n.invoked += () => Activar(x);
                n.focusChanged += (nodo, enfocado) => { if (enfocado && x.focusable) x.Focus(); };
            }
            AssistiveSupport.activeHierarchy = h;
        }

        // Solo si cambió: asignar avisa al lector.
        static void Actualizar(AccessibilityNode n, VisualElement e)
        {
            var nombre = Nombre(e);
            var valor = Valor(e);
            var estado = !e.enabledInHierarchy ? AccessibilityState.Disabled : e is Toggle t && t.value ? AccessibilityState.Selected : AccessibilityState.None;
            if (n.label != nombre) n.label = nombre;
            if (n.value != valor) n.value = valor;
            if (n.state != estado) n.state = estado;
        }

        internal static AccessibilityRole Rol(VisualElement e)
        {
            if (e is Button || e.ClassListContains("fila-panel")) return AccessibilityRole.Button;
            if (e is Toggle) return AccessibilityRole.Toggle;
            if (e is TextField) return AccessibilityRole.TextField;
            if (e is DropdownField) return AccessibilityRole.Dropdown;
            // El texto suelto, no el de adentro de un control (ese ya es su nombre).
            // Ni el relleno que queda debajo de la página nativa, ni los textos de una fila de panel (son su nombre).
            if (e is Label l && !string.IsNullOrWhiteSpace(l.text) && l.GetFirstAncestorOfType<BaseField<string>>() == null && l.GetFirstAncestorOfType<BaseField<bool>>() == null
                && !Dentro(l, "pagina") && !Dentro(l, "fila-panel"))
                return l.ClassListContains("titulo-seccion") || l.ClassListContains("titulo-bloque") ? AccessibilityRole.Header : AccessibilityRole.StaticText;
            return AccessibilityRole.None;
        }

        static bool Dentro(VisualElement e, string clase)
        {
            for (var x = e.parent; x != null; x = x.parent)
                if (x.ClassListContains(clase)) return true;
            return false;
        }

        internal static string Nombre(VisualElement e) => e switch
        {
            Button b => b.text,
            // La fila de un panel: el proveedor y su estado (la forma y el color del ícono los repiten).
            _ when e.ClassListContains("fila-panel") => string.Join(", ", e.Query<Label>().ToList().Select(l => l.text).Where(x => !string.IsNullOrEmpty(x))),
            // La etapa actual y las hechas se distinguen por la barra; el lector lo dice (WCAG 1.3.1).
            Label l when l.parent != null && l.parent.ClassListContains("etapa--actual") => l.text + ", etapa actual",
            Label l when l.parent != null && l.parent.ClassListContains("etapa--hecha") => l.text + ", hecha",
            Toggle t => t.text,
            BaseField<string> f => f.label ?? "",
            Label l => l.text,
            _ => "",
        };

        static string Valor(VisualElement e) => e is BaseField<string> f ? f.value ?? "" : "";

        static bool Visible(VisualElement e)
        {
            for (var x = e; x != null; x = x.parent)
                if (x.resolvedStyle.display == DisplayStyle.None || x.resolvedStyle.visibility == Visibility.Hidden) return false;
            return e.worldBound.width > 0 && e.worldBound.height > 0;
        }

        /// <summary>El rectángulo en píxeles de la ventana, con el origen arriba a la izquierda, como Panel.Rect.</summary>
        static Rect Marco(VisualElement e)
        {
            if (e.panel == null) return Rect.zero;
            var k = Screen.width / e.panel.visualTree.worldBound.width;
            var r = e.worldBound;
            return new Rect(r.x * k, r.y * k, r.width * k, r.height * k);
        }

        static bool Activar(VisualElement e)
        {
            if (!e.enabledInHierarchy) return false;
            switch (e)
            {
                case Toggle t:
                    t.value = !t.value;
                    return true;
                case Button _:
                case DropdownField _:
                case VisualElement fila when fila.ClassListContains("fila-panel"):
                    using (var ev = NavigationSubmitEvent.GetPooled())
                    {
                        ev.target = e;
                        e.SendEvent(ev);
                    }
                    return true;
                default:
                    if (!e.focusable) return false;
                    e.Focus();
                    return true;
            }
        }
    }
}
