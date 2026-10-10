using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace ChatCouncil.Motor
{
    /// <summary>
    /// Modelo de datos del registro: port de packages/domain/src/index.ts.
    /// Una línea de JSON por hecho, append-only. Nunca se reescribe una línea.
    /// </summary>
    public static class Dominio
    {
        public const int VersionEsquema = 1;

        static readonly Dictionary<string, string> Nombres = new Dictionary<string, string>
        {
            ["chatgpt"] = "ChatGPT", ["gemini"] = "Gemini", ["claude"] = "Claude", ["grok"] = "Grok", ["mistral"] = "Mistral",
            ["glm"] = "GLM", ["kimi"] = "Kimi", ["qwen"] = "Qwen", ["deepseek"] = "DeepSeek",
        };

        /// <summary>
        /// El nombre de un proveedor como lo ve Juan (nombre-proveedor.ts). El id
        /// sigue siendo la clave en el registro; un id desconocido sale con la
        /// primera letra en mayúscula.
        /// </summary>
        public static string NombreProveedor(string id) =>
            Nombres.TryGetValue(id, out var nombre) ? nombre : id.Length == 0 ? "" : Js.ToUpperCase(id.Substring(0, 1)) + id.Substring(1);

        /// <summary>D10: con sesión si la página tiene el compositor de su spec (leerCompositor no da null); sin leer cookies.</summary>
        public static string EstadoDeSesion(JToken compositor) =>
            compositor != null && compositor.Type == JTokenType.String ? "con-sesion" : "sin-sesion";

        /// <summary>
        /// "Hay algo en el campo" no alcanza: el marcador interno de una ronda
        /// capturada sin envío es texto no vacío y no es una pregunta.
        /// </summary>
        public static bool EsPreguntaValida(string texto)
        {
            var t = Js.Trim(texto);
            if (t.Length == 0) return false;
            if (t.StartsWith("(", StringComparison.Ordinal)) return false;
            return !t.ToLowerInvariant().Contains("capturado sin ronda de envio");
        }

        /// <summary>Ronda.prompt si es válida; si no, la última pregunta declarada válida; si no, null.</summary>
        public static string PreguntaEfectivaDeRonda(IEnumerable<Hecho> hechos, Ronda ronda)
        {
            if (EsPreguntaValida(ronda.Prompt)) return ronda.Prompt;
            PreguntaDeclarada ultima = null;
            foreach (var d in hechos.OfType<PreguntaDeclarada>())
            {
                if (d.RondaId == ronda.Id && (ultima == null || string.CompareOrdinal(d.DeclaradaEn, ultima.DeclaradaEn) > 0)) ultima = d;
            }
            return ultima != null && EsPreguntaValida(ultima.Texto) ? ultima.Texto : null;
        }

        /// <summary>
        /// En qué etapa está una ronda, derivado de los hechos y nunca de lo que
        /// haya en pantalla. Cuenta operadores DISTINTOS: un operador recapturado
        /// no cuenta dos veces.
        /// </summary>
        public static string EtapaDeRonda(IEnumerable<Hecho> hechos, string rondaId, int totalOperadores)
        {
            var lista = hechos as IList<Hecho> ?? hechos.ToList();
            if (lista.OfType<SalidaVerificador>().Any(h => h.RondaId == rondaId)) return "redaccion";
            if (lista.OfType<InformeIntegrador>().Any(h => h.RondaId == rondaId)) return "verificacion";
            var operadores = lista.OfType<SalidaOperador>().Where(h => h.RondaId == rondaId).Select(h => h.OperadorId).Distinct().Count();
            if (operadores >= totalOperadores) return "integracion";
            if (lista.OfType<Sello>().Any(h => h.RondaId == rondaId)) return "operacion";
            return "investigacion";
        }

        public static string TipoCapturaDeEtapa(string etapa)
        {
            switch (etapa)
            {
                case "investigacion": return "respuesta";
                case "operacion": return "salida-operador";
                case "integracion": return "informe-integrador";
                case "verificacion": return "salida-verificador";
                case "redaccion": return "respuesta-redactor";
                default: throw new ArgumentException($"etapa desconocida: {etapa}");
            }
        }

        /// <summary>
        /// La procedencia de una lectura. Si el proveedor no dijo cómo terminó,
        /// el fin es INFERIDO: el valor por defecto es el conservador a propósito.
        /// </summary>
        public static Procedencia DerivarProcedencia(
            string modelLabel, string completionKind, int? quiescenceMs, bool? generando,
            string ahora, string continuidad, string metodoEscritura, string panel)
        {
            return new Procedencia
            {
                ModelLabel = modelLabel,
                ModelLabelLeidaEn = modelLabel == null ? null : ahora,
                FinDe = completionKind == "element-gone" ? "observado" : "inferido",
                QuiescenceMs = quiescenceMs,
                GenerandoAlLeer = generando,
                Continuidad = continuidad,
                MetodoEscritura = metodoEscritura,
                Panel = panel,
            };
        }

        /// <summary>El integrador registrado al abrir la ronda, o null si la ronda es anterior a ese dato.</summary>
        public static string IntegradorDeRonda(IEnumerable<Hecho> hechos, string rondaId) =>
            UltimaCondicion(hechos, rondaId)?.Integrador;

        /// <summary>Los proveedores cargados al abrir la ronda, o null si la ronda es anterior a ese hecho.</summary>
        public static IReadOnlyList<string> ProveedoresCargadosDeRonda(IEnumerable<Hecho> hechos, string rondaId) =>
            UltimaCondicion(hechos, rondaId)?.Proveedores;

        static CondicionProveedoresCargados UltimaCondicion(IEnumerable<Hecho> hechos, string rondaId) =>
            hechos.OfType<CondicionProveedoresCargados>().LastOrDefault(h => h.RondaId == rondaId);

        /// <summary>
        /// Las salidas de operador VIGENTES: la última captura de cada operador ("el
        /// hecho más reciente gana"), en el orden de su primera captura. Es la única
        /// entrada de la tabla de hallazgos: el prompt del integrador, el del
        /// verificador y el informe salen de acá, así los H## coinciden entre los tres.
        /// </summary>
        public static List<SalidaVigente> SalidasVigentesDeRonda(IReadOnlyList<Hecho> hechos, string rondaId)
        {
            var orden = new List<string>();
            var ultima = new Dictionary<string, SalidaOperador>();
            foreach (var s in hechos.OfType<SalidaOperador>().Where(s => s.RondaId == rondaId))
            {
                if (!ultima.ContainsKey(s.OperadorId)) orden.Add(s.OperadorId);
                ultima[s.OperadorId] = s;
            }
            return orden.Select(op => new SalidaVigente
            {
                OperadorId = op,
                SalidaId = ultima[op].Id,
                Hallazgos = hechos.OfType<HallazgoHecho>().Where(h => h.SalidaOperadorId == ultima[op].Id).ToList(),
            }).ToList();
        }

        /// <summary>El informe vigente de la ronda: el último capturado. Una recaptura agrega un hecho, no reescribe.</summary>
        public static InformeIntegrador UltimoInformeIntegrador(IEnumerable<Hecho> hechos, string rondaId) =>
            hechos.OfType<InformeIntegrador>().LastOrDefault(h => h.RondaId == rondaId);

        public static SalidaVerificador UltimaSalidaVerificador(IEnumerable<Hecho> hechos, string rondaId) =>
            hechos.OfType<SalidaVerificador>().LastOrDefault(h => h.RondaId == rondaId);

        /// <summary>
        /// Los P# válidos para UN operador: el código estable de cada proveedor del
        /// pool menos el suyo (exclusión de autoevaluación). Sale del Sello
        /// persistido, así sobrevive a un reinicio de la app.
        /// </summary>
        public static List<string> EtiquetasValidasDelOperador(string operadorId, IReadOnlyList<string> poolOperadores, IEnumerable<Sello> sello)
        {
            var codigoDe = new Dictionary<string, string>();
            foreach (var s in sello) codigoDe[s.PanelSourceId] = s.CodigoEstable;
            return poolOperadores.Where(id => id != operadorId).Select(id =>
                codigoDe.TryGetValue(id, out var codigo) && !string.IsNullOrEmpty(codigo)
                    ? codigo
                    : throw new InvalidOperationException($"no hay codigo estable de sello para el proveedor {id}")).ToList();
        }

        /// <summary>
        /// Qué se escribe como qué en un lote de lecturas, según la etapa. Los
        /// operadores que ya terminaron no se vuelven a escribir: en cada etapa sólo
        /// el rol que tiene algo nuevo (en investigación, todas son respuestas).
        /// </summary>
        public static ClasificacionLecturas<T> ClasificarLecturasPorEtapa<T>(IReadOnlyList<T> lecturas, Func<T, string> idDe, string etapa,
            IReadOnlyList<string> poolOperadores, string integradorId, string verificadorId, string redactorId = null)
        {
            T Buscar(string id) => lecturas.FirstOrDefault(l => idDe(l) == id);
            var c = new ClasificacionLecturas<T>();
            switch (etapa)
            {
                case "redaccion":
                    c.Redactor = Buscar(redactorId ?? integradorId);
                    break;
                case "investigacion":
                    c.ComoRespuesta.AddRange(lecturas);
                    break;
                case "operacion":
                    // Los del pool operan; un rol que no opera sigue siendo un investigador más.
                    c.Operacion.AddRange(lecturas.Where(l => poolOperadores.Contains(idDe(l))));
                    c.ComoRespuesta.AddRange(lecturas.Where(l => !poolOperadores.Contains(idDe(l))));
                    break;
                case "verificacion":
                    c.Verificador = Buscar(verificadorId);
                    break;
                default:
                    c.Integrador = Buscar(integradorId);
                    break;
            }
            return c;
        }
    }

    public sealed class SalidaVigente
    {
        public string OperadorId { get; set; }
        public string SalidaId { get; set; }
        public List<HallazgoHecho> Hallazgos { get; set; }
    }

    public sealed class ClasificacionLecturas<T>
    {
        public List<T> Operacion { get; set; } = new List<T>();
        public T Integrador { get; set; }
        public T Verificador { get; set; }
        public T Redactor { get; set; }
        public List<T> ComoRespuesta { get; set; } = new List<T>();
    }
}
