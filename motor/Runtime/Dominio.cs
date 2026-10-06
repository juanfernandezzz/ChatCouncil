using System;
using System.Collections.Generic;
using System.Linq;

namespace ChatCouncil.Motor
{
    /// <summary>
    /// Modelo de datos del registro: port de packages/domain/src/index.ts.
    /// Una línea de JSON por hecho, append-only. Nunca se reescribe una línea.
    /// </summary>
    public static class Dominio
    {
        public const int VersionEsquema = 1;

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
    }
}
