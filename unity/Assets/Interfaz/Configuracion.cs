using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using ChatCouncil.Motor;
using ChatCouncil.Panel;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UIElements;

namespace ChatCouncil.Interfaz
{
    // Dentro de ChatCouncil.*, "Panel" sería el namespace ChatCouncil.Panel y no la clase.
    using Panel = ChatCouncil.Panel.Panel;

    /// <summary>
    /// Ajustes y primer arranque (T19): el consejo y sus roles con las reglas de Roles (D11), la entrada a
    /// cada cuenta con la sesión deducida de la página (D10) y dónde está la carpeta de datos (D15).
    /// El consejo guardado se aplica al reabrir; en el primer arranque, al terminar la guía.
    /// </summary>
    public sealed class Configuracion
    {
        /// <summary>Cuánto se espera a que la página muestre su compositor antes de decir "sin sesión".</summary>
        const int EsperaCompositorMs = 10_000;

        readonly VisualElement raiz;
        readonly string carpetaDatos;
        readonly Func<string, string> urlDe;
        readonly Func<Task> iniciarNavegador;
        bool primerArranque;
        readonly Dictionary<string, Toggle> marcas = new Dictionary<string, Toggle>();
        readonly Dictionary<string, Label> estadoCuenta = new Dictionary<string, Label>();
        readonly Dictionary<string, Panel> paneles = new Dictionary<string, Panel>();
        readonly DropdownField integrador, verificador, redactor;
        readonly Label mensaje;
        Task navegador;
        string cuentaVisible;

        /// <summary>El primer arranque terminó: la app arma la ronda con el consejo recién guardado.</summary>
        public event Action Empezar;

        public VisualElement Raiz => raiz;

        /// <param name="urlDe">La página de cada proveedor: la de su spec, o una de prueba.</param>
        /// <param name="iniciarNavegador">Inicia el navegador de los paneles; se llama una vez, al entrar a la primera cuenta.</param>
        public Configuracion(string carpetaDatos, bool primerArranque, Func<string, string> urlDe, Func<Task> iniciarNavegador)
        {
            this.iniciarNavegador = iniciarNavegador;
            this.carpetaDatos = carpetaDatos;
            this.primerArranque = primerArranque;
            this.urlDe = urlDe;
            raiz = Resources.Load<VisualTreeAsset>("Interfaz/Configuracion").Instantiate().Q("seccion-configuracion");
            raiz.EnableInClassList("primer-arranque", primerArranque);
            raiz.Q<Label>("titulo").text = primerArranque ? "Te damos la bienvenida" : "Ajustes";

            var contenido = LeerArchivo();
            var activos = Roles.LeerSeleccion(contenido, Roles.Conocidos) ?? Roles.Conocidos.ToList();
            var roles = Roles.Leer(contenido, Roles.Conocidos);

            var lista = raiz.Q("proveedores");
            foreach (var id in Roles.Conocidos)
            {
                var marca = new Toggle { text = Dominio.NombreProveedor(id), value = activos.Contains(id), name = "marca-" + id };
                marca.AddToClassList("marca");
                marcas[id] = marca;
                lista.Add(marca);
            }
            var nombres = Roles.Conocidos.Select(Dominio.NombreProveedor).ToList();
            DropdownField Rol(string nombre, string elegido)
            {
                var d = raiz.Q<DropdownField>(nombre);
                d.choices = nombres;
                d.index = Roles.Conocidos.ToList().IndexOf(elegido);
                return d;
            }
            integrador = Rol("integrador", roles.Integrador);
            verificador = Rol("verificador", roles.Verificador);
            redactor = Rol("redactor", roles.Redactor);

            mensaje = raiz.Q<Label>("mensaje");
            raiz.Q<Button>("guardar").clicked += Guardar;
            raiz.Q<Button>("empezar").clicked += TerminarPrimerArranque;
            raiz.Q<Button>("volver").clicked += Volver;
            raiz.Q<Button>("comprobar").clicked += () => _ = Comprobar(cuentaVisible);
            raiz.Q("cuenta-pagina").RegisterCallback<GeometryChangedEvent>(_ => Ubicar());

            ArmarCuentas(activos);
            ArmarDatos();
            MostrarPaso(primerArranque ? 1 : 0);
            raiz.Q("vista-cuenta").style.display = DisplayStyle.None;
        }

        string RutaSeleccion => Path.Combine(carpetaDatos, Roles.ArchivoSeleccion);

        string LeerArchivo()
        {
            try
            {
                return File.Exists(RutaSeleccion) ? File.ReadAllText(RutaSeleccion, Encoding.UTF8) : null;
            }
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
            {
                return null; // ilegible: como sin archivo, se cargan todos (seleccion-proveedores.ts)
            }
        }

        /// <summary>0: ajustes, todo a la vista. 1 y 2: los pasos del primer arranque.</summary>
        void MostrarPaso(int paso)
        {
            raiz.Q("bloque-consejo").style.display = paso == 2 ? DisplayStyle.None : DisplayStyle.Flex;
            raiz.Q("bloque-cuentas").style.display = paso == 1 ? DisplayStyle.None : DisplayStyle.Flex;
            raiz.Q<Label>("paso-guia").text = paso == 1 ? "Paso 1 de 2: tu consejo" : paso == 2 ? "Paso 2 de 2: tus cuentas" : "";
        }

        /// <summary>Desde acá la sección es Ajustes: los cambios siguientes se aplican al reabrir.</summary>
        void TerminarPrimerArranque()
        {
            Ocultar();
            primerArranque = false;
            raiz.RemoveFromClassList("primer-arranque");
            raiz.Q<Label>("titulo").text = "Ajustes";
            mensaje.text = "";
            MostrarPaso(0);
            Empezar?.Invoke();
        }

        static string Id(DropdownField d) => d.index >= 0 ? Roles.Conocidos[d.index] : null;

        /// <summary>Valida con las reglas de Roles; si pasan, escribe el archivo de selección.</summary>
        public void Guardar()
        {
            var marcados = Roles.Conocidos.Where(id => marcas[id].value).ToList();
            var ahora = DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
            var (error, contenido) = Roles.Guardar(Roles.Conocidos, marcados, Id(integrador), Id(verificador), Id(redactor), ahora);
            if (error == null)
            {
                try
                {
                    Directory.CreateDirectory(carpetaDatos);
                    File.WriteAllText(RutaSeleccion, contenido, new UTF8Encoding(false));
                }
                catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
                {
                    error = "No se pudo guardar en la carpeta de datos: " + e.Message;
                }
            }
            mensaje.EnableInClassList("problema", error != null);
            if (error != null)
            {
                mensaje.text = error;
                return;
            }
            mensaje.text = primerArranque ? "Guardado." : "Guardado. Se aplica la próxima vez que abras ChatCouncil.";
            ArmarCuentas(marcados);
            if (primerArranque) MostrarPaso(2);
        }

        void ArmarCuentas(IEnumerable<string> ids)
        {
            var lista = raiz.Q("lista-cuentas");
            lista.Clear();
            estadoCuenta.Clear();
            foreach (var id in ids)
            {
                var fila = new VisualElement();
                fila.AddToClassList("fila-cuenta");
                var texto = new VisualElement();
                texto.AddToClassList("cabecera-texto");
                var nombre = new Label(Dominio.NombreProveedor(id));
                nombre.AddToClassList("semibold");
                var estado = new Label("Sin comprobar") { name = "estado-" + id };
                estado.AddToClassList("pequeno");
                estado.AddToClassList("texto-2");
                texto.Add(nombre);
                texto.Add(estado);
                var entrar = new Button(() => _ = Entrar(id)) { text = "Entrar", name = "entrar-" + id };
                entrar.AddToClassList("boton");
                fila.Add(texto);
                fila.Add(entrar);
                lista.Add(fila);
                estadoCuenta[id] = estado;
            }
            Aplicacion.AplicarSemibold(lista);
        }

        void ArmarDatos()
        {
            var android = Application.platform == RuntimePlatform.Android;
            raiz.Q<Label>("que-se-guarda").text = android
                ? "Las rondas, los informes y estos ajustes se guardan solo en este teléfono, en esta carpeta. Las sesiones de tus cuentas quedan dentro de la app."
                : "Las rondas, los informes, estos ajustes y las sesiones de tus cuentas se guardan solo en este aparato, en esta carpeta:";
            raiz.Q<TextField>("ruta-datos").value = carpetaDatos;
            var copiar = raiz.Q<Button>("copiar-ruta");
            copiar.clicked += () =>
            {
                GUIUtility.systemCopyBuffer = carpetaDatos;
                copiar.text = "Ruta copiada";
            };
            var abrir = raiz.Q<Button>("abrir-carpeta");
            abrir.style.display = android ? DisplayStyle.None : DisplayStyle.Flex;
            abrir.clicked += () =>
            {
                Directory.CreateDirectory(carpetaDatos);
                Application.OpenURL(new Uri(carpetaDatos).AbsoluteUri);
            };
            raiz.Q<Label>("como-copiar").text = android
                ? "Para hacer una copia, conecta el teléfono a una computadora por USB y copia la carpeta entera."
                : "Para hacer una copia, cierra ChatCouncil y copia la carpeta entera a otro disco. Lleva las sesiones de tus cuentas: guárdala donde nadie más pueda abrirla.";
        }

        // ---------------------------------------------------------------- cuentas (D10)

        static string Spec(string id) => JObject.Parse(Datos.Specs)["specs"][id].ToString(Formatting.None);

        /// <summary>Muestra la página del proveedor para entrar a la cuenta, y comprueba la sesión.</summary>
        public async Task Entrar(string id)
        {
            cuentaVisible = id;
            raiz.Q("formulario").style.display = DisplayStyle.None;
            raiz.Q("vista-cuenta").style.display = DisplayStyle.Flex;
            raiz.Q<Label>("cuenta-titulo").text = Dominio.NombreProveedor(id);
            Estado(id, "Abriendo la página…");
            try
            {
                if (!paneles.ContainsKey(id))
                {
                    navegador ??= iniciarNavegador();
                    await navegador;
                    paneles[id] = await Paneles.Crear(id, urlDe(id));
                }
            }
            catch (Exception e)
            {
                Estado(id, "No se pudo abrir la página: " + e.Message);
                return;
            }
            Ubicar();
            await Comprobar(id);
        }

        /// <summary>Con sesión si la página muestra el compositor de su spec; se le da un margen para montarlo.</summary>
        public async Task<string> Comprobar(string id)
        {
            if (id == null || !paneles.TryGetValue(id, out var panel)) return null;
            Estado(id, "Comprobando…");
            var limite = DateTime.UtcNow.AddMilliseconds(EsperaCompositorMs);
            string sesion;
            try
            {
                for (;;)
                {
                    sesion = Dominio.EstadoDeSesion(await panel.Correr("leerCompositor", Spec(id)));
                    if (sesion == "con-sesion" || DateTime.UtcNow > limite) break;
                    await Task.Delay(500);
                }
            }
            catch (Exception e)
            {
                Estado(id, "No se pudo comprobar: " + e.Message);
                return null;
            }
            Estado(id, sesion == "con-sesion" ? "Sesión abierta" : "Sin sesión: entra a tu cuenta en la página y toca Comprobar.");
            return sesion;
        }

        void Estado(string id, string texto)
        {
            if (estadoCuenta.TryGetValue(id, out var fila)) fila.text = texto;
            if (id == cuentaVisible) raiz.Q<Label>("cuenta-estado").text = texto;
        }

        /// <summary>La página nativa va encima del rectángulo de la vista, en píxeles de la ventana.</summary>
        void Ubicar()
        {
            if (cuentaVisible == null || !paneles.TryGetValue(cuentaVisible, out var panel) || raiz.panel == null) return;
            var r = raiz.Q("cuenta-pagina").worldBound;
            var k = Screen.width / raiz.panel.visualTree.worldBound.width;
            panel.Rect(Mathf.RoundToInt(r.x * k), Mathf.RoundToInt(r.y * k), Mathf.RoundToInt(r.width * k), Mathf.RoundToInt(r.height * k));
            panel.Frente();
        }

        void Volver()
        {
            Ocultar();
            cuentaVisible = null;
            raiz.Q("vista-cuenta").style.display = DisplayStyle.None;
            raiz.Q("formulario").style.display = DisplayStyle.Flex;
        }

        /// <summary>Las páginas nativas no son parte del árbol: al salir de la vista se esconden.</summary>
        public void Ocultar()
        {
            foreach (var p in paneles.Values) p.Rect(0, 0, 0, 0);
        }
    }
}
