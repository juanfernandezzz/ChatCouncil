using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;

namespace ChatCouncil.Motor
{
    /// <summary>
    /// Lo que devuelve el script de página al leer un panel (LecturaProveedor de
    /// la versión Electron). Los nombres son los del contrato con la página.
    /// </summary>
    public sealed class Lectura
    {
        public string Id { get; set; }
        public string Text { get; set; }
        /// <summary>true generando, false terminado, null no observable.</summary>
        public bool? Generating { get; set; }
        /// <summary>"element-gone" si el fin se observa, "quiescence" si se infiere; null si la lectura no lo dice.</summary>
        public string CompletionKind { get; set; }
        public int? QuiescenceMs { get; set; }
        public string ModelLabel { get; set; }
        public string UserText { get; set; }
        public int? FuentesHref { get; set; }
        public string Html { get; set; }
        public string Error { get; set; }

        public Lectura ConError(string error)
        {
            var copia = (Lectura)MemberwiseClone();
            copia.Error = error;
            return copia;
        }
    }

    /// <summary>
    /// La única puerta de entrada al motor. Guarda la conversación y la ronda en
    /// curso, y cada comando deja sus hechos en el registro append-only de la
    /// carpeta de datos. Habla con el mundo por puertos inyectados: el generador
    /// de ids y el reloj (para fijarlos en las pruebas).
    /// </summary>
    public sealed class Puerta
    {
        /// <summary>
        /// Por debajo de esto una lectura no es una respuesta observable
        /// (test-runner.ts): qwen llegó a devolver 3 caracteres como "terminado".
        /// </summary>
        public const int UmbralLecturaMinimo = 20;

        /// <summary>La ronda de lo que se capturó sin haberlo enviado: el texto ya estaba en pantalla.</summary>
        public const string PromptSinRonda = "(capturado sin ronda de envio: el texto ya estaba en pantalla al presionar Leer/Capturar)";

        // Medido en la ronda de cierre: Mistral dejó como respuesta solo el aviso del canvas. No bloquea: deja constancia.
        const int RespuestaCorta = 300;

        static readonly Regex Blancos = new Regex($"[{Js.Blancos}]+");

        readonly string carpeta;
        readonly Func<string> nuevoId;
        readonly Func<DateTime> reloj;
        readonly IReadOnlyList<string> activos;
        readonly RolesElegidos roles;
        readonly IReadOnlyList<string> poolOperadores;
        int indiceRonda;

        public Puerta(string carpetaDatos, Func<string> nuevoId, Func<DateTime> ahora, IReadOnlyList<string> activos, RolesElegidos roles, IReadOnlyList<string> poolOperadores)
        {
            carpeta = carpetaDatos;
            this.nuevoId = nuevoId;
            reloj = ahora;
            this.activos = activos;
            this.roles = roles;
            this.poolOperadores = poolOperadores;
        }

        public string ConversacionActual { get; private set; }
        public string RondaActual { get; private set; }

        /// <summary>El registro de la conversación en curso.</summary>
        public RegistroLeido LeerRegistro() => Registro.LeerArchivo(carpeta, ConversacionActual);

        string Ahora() => reloj().ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

        void Escribir(Hecho hecho) => Registro.Agregar(carpeta, ConversacionActual, hecho);

        /// <summary>
        /// Al arrancar: la última ronda de la última conversación que no es de
        /// prueba ("última" por creadaEn e índice, nunca por orden de archivo).
        /// Sólo lee. Sin esto, cerrar la app perdía la ronda en curso aunque el
        /// registro tuviera todo para reconstruirla.
        /// </summary>
        public void RestaurarRondaActiva()
        {
            var dir = Path.Combine(carpeta, "conversaciones");
            if (!Directory.Exists(dir)) return;
            Conversacion mejor = null;
            Ronda mejorRonda = null;
            foreach (var archivo in Directory.GetFiles(dir).Where(f => f.EndsWith(".jsonl", StringComparison.Ordinal)))
            {
                var id = Path.GetFileNameWithoutExtension(archivo);
                List<Hecho> hechos;
                try
                {
                    hechos = Registro.LeerArchivo(carpeta, id).Hechos;
                }
                catch (IOException)
                {
                    continue; // un archivo que no se puede leer no bloquea a los demás
                }
                var conversacion = hechos.OfType<Conversacion>().FirstOrDefault(h => h.Id == id);
                if (conversacion == null || conversacion.EsPrueba) continue;
                var rondas = hechos.OfType<Ronda>().Where(r => r.ConversacionId == id).ToList();
                if (rondas.Count == 0) continue;
                var ultima = rondas.Aggregate((a, b) => b.Indice > a.Indice ? b : a);
                if (mejor == null || string.CompareOrdinal(conversacion.CreadaEn, mejor.CreadaEn) > 0)
                {
                    mejor = conversacion;
                    mejorRonda = ultima;
                }
            }
            if (mejor == null) return;
            ConversacionActual = mejor.Id;
            RondaActual = mejorRonda.Id;
            indiceRonda = mejorRonda.Indice + 1;
        }

        void AsegurarConversacion()
        {
            if (ConversacionActual != null) return;
            var id = nuevoId();
            ConversacionActual = id;
            Escribir(new Conversacion { Id = id, CreadaEn = Ahora(), Titulo = null, EsPrueba = false });
        }

        /// <summary>
        /// Escribe la Ronda, con su semilla, y como condición suya qué proveedores
        /// estaban cargados y quién integra.
        /// </summary>
        public string AbrirRonda(string prompt)
        {
            AsegurarConversacion();
            var semilla = nuevoId();
            var id = nuevoId();
            Escribir(new Ronda { Id = id, ConversacionId = ConversacionActual, Indice = indiceRonda++, Prompt = prompt, EnviadaEn = Ahora(), Semilla = semilla });
            Escribir(new CondicionProveedoresCargados { Id = nuevoId(), RondaId = id, Proveedores = activos.ToList(), Integrador = roles.Integrador, RegistradoEn = Ahora() });
            RondaActual = id;
            return id;
        }

        /// <summary>Un intento por proveedor, también los que fallaron: un envío fallido es un hecho.</summary>
        public void RegistrarIntentos(IEnumerable<(string Id, bool Ok, string Error)> resultados)
        {
            var rondaId = RondaActual ?? throw new InvalidOperationException("no hay una ronda abierta para registrar los intentos");
            var ahora = Ahora();
            foreach (var r in resultados)
                Escribir(new Intento { Id = nuevoId(), RondaId = rondaId, ProveedorId = r.Id, Ok = r.Ok, Error = r.Error, EnviadoEn = ahora });
        }

        /// <summary>
        /// Guarda un lote de lecturas según la etapa de la ronda, que dice el
        /// registro y nunca el contenido del panel. Sin ronda abierta, abre una con
        /// el marcador: lo que está en pantalla se guarda igual. Una lectura por
        /// debajo del umbral nunca se guarda como respuesta buena.
        /// </summary>
        public (string Etapa, string Aviso) RegistrarCapturas(IReadOnlyList<Lectura> lecturasCrudas, Func<string, (string Continuidad, string Panel)> contexto)
        {
            var lecturas = lecturasCrudas.Select(l => l.Text.Length < UmbralLecturaMinimo && string.IsNullOrEmpty(l.Error)
                ? l.ConError($"lectura por debajo del umbral ({l.Text.Length} de {UmbralLecturaMinimo} caracteres): no genero una respuesta observable, no se guarda como valida")
                : l).ToList();
            if (RondaActual == null) AbrirRonda(PromptSinRonda);
            var rondaId = RondaActual;
            var etapa = Dominio.EtapaDeRonda(LeerRegistro().Hechos, rondaId, poolOperadores.Count);
            var c = Dominio.ClasificarLecturasPorEtapa(lecturas, l => l.Id, etapa, poolOperadores, roles.Integrador, roles.Verificador, roles.Redactor);

            if (c.ComoRespuesta.Count > 0) EscribirRespuestas(rondaId, c.ComoRespuesta, contexto);
            if (etapa == "investigacion")
            {
                foreach (var l in c.ComoRespuesta)
                    if (string.IsNullOrEmpty(l.Error) && l.Text.Length < RespuestaCorta)
                        EscribirErrorCaptura(rondaId, etapa, "respuesta", "respuesta sospechosamente corta: puede haber quedado fuera de la captura", l.Id);
            }
            return (etapa, AvisoPromptsDeCaptura(lecturas.Select(l => l.UserText), etapa));
        }

        void EscribirRespuestas(string rondaId, IReadOnlyList<Lectura> lecturas, Func<string, (string Continuidad, string Panel)> contexto)
        {
            var ahora = Ahora();
            var coincide = PromptCoincideEnPool(lecturas.Select(l => l.UserText));
            foreach (var l in lecturas)
            {
                var (continuidad, panel) = contexto(l.Id);
                // metodoEscritura null: la escritura no informa con qué método entró el texto, y afirmarlo sería simular un dato.
                var procedencia = Dominio.DerivarProcedencia(l.ModelLabel, l.CompletionKind, l.QuiescenceMs, l.Generating, ahora, continuidad, null, panel);
                var respuesta = new Respuesta
                {
                    Id = nuevoId(),
                    RondaId = rondaId,
                    ProveedorId = l.Id,
                    TextoOriginal = l.Text,
                    LeidaEn = ahora,
                    Error = l.Error,
                    Procedencia = procedencia,
                    PromptUsuarioLeido = l.UserText,
                    PromptCoincideEnPool = coincide,
                    FuentesHref = l.FuentesHref,
                    Html = l.Html,
                };
                Escribir(respuesta);
                // Las citas se derivan del html en la misma escritura: si la regla cambia, se re-derivan sin tocar la Respuesta.
                if (respuesta.Html != null)
                    foreach (var cita in Citas.ExtraerCitas(respuesta.Html, respuesta.Id, nuevoId).Citas) Escribir(cita);
            }
        }

        void EscribirErrorCaptura(string rondaId, string etapa, string tipoCaptura, string detalle, string proveedorId = null) =>
            Escribir(new ErrorCaptura
            {
                Id = nuevoId(),
                RondaId = rondaId,
                EtapaEsperada = etapa,
                TipoCapturaIntentado = tipoCaptura,
                ProveedorId = string.IsNullOrEmpty(proveedorId) ? null : proveedorId,
                Detalle = detalle,
                OcurridoEn = Ahora(),
            });

        /// <summary>
        /// La pregunta real de una ronda capturada sin envío. La Ronda no se
        /// reescribe: se agrega este hecho aparte, declarado por el usuario.
        /// </summary>
        public PreguntaDeclarada DeclararPregunta(string texto)
        {
            var rondaId = RondaActual ?? throw new InvalidOperationException("no hay una ronda activa a la que declararle la pregunta");
            var hecho = new PreguntaDeclarada { Id = nuevoId(), RondaId = rondaId, Texto = texto, DeclaradaEn = Ahora() };
            Escribir(hecho);
            return hecho;
        }

        // El mismo prompt, no el mismo byte: espacios de más y mayúsculas no son la señal.
        static string NormalizarPrompt(string t) => Js.ToLowerCase(Blancos.Replace(Js.Trim(t), " "));

        /// <summary>true si todos los prompts leídos son el mismo; false si hay dos distintos; null si hay menos de dos.</summary>
        static bool? PromptCoincideEnPool(IEnumerable<string> prompts)
        {
            var normalizados = prompts.Where(t => !string.IsNullOrEmpty(t)).Select(NormalizarPrompt).ToList();
            if (normalizados.Count < 2) return null;
            return normalizados.All(t => t == normalizados[0]);
        }

        /// <summary>
        /// El aviso de "Capturar" sobre si los prompts coinciden. Sólo en
        /// investigación, donde todos reciben la misma pregunta; en operación cada
        /// operador recibe a propósito un texto distinto. "" = sin aviso.
        /// </summary>
        public static string AvisoPromptsDeCaptura(IEnumerable<string> promptsLeidos, string etapa)
        {
            if (etapa != "investigacion") return "";
            var conPrompt = promptsLeidos.Where(t => !string.IsNullOrEmpty(t)).ToList();
            if (conPrompt.Count < 2) return "";
            int distintos = new HashSet<string>(conPrompt.Select(NormalizarPrompt)).Count;
            return distintos > 1
                ? $"⚠ Los prompts de usuario capturados NO coinciden entre proveedores ({distintos} versiones distintas) — revisar antes de comparar respuestas."
                : $"Prompt de usuario: coincide en los {conPrompt.Count} proveedores donde se pudo leer.";
        }
    }
}
