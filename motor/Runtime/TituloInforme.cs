using System;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;

namespace ChatCouncil.Motor
{
    /// <summary>
    /// Port de packages/analysis/src/titulo-informe.ts: el nombre del archivo del
    /// informe y las dos piezas del informe del integrador que lo alimentan, el
    /// título y la sección 5. Puro: la fecha entra como valor y la existencia de
    /// un nombre como predicado.
    /// </summary>
    public static class TituloInforme
    {
        /// <summary>Encabezado literal bajo el que va la sección 5 del integrador, al principio del informe.</summary>
        public const string EncabezadoRescate = "## Qué conviene rescatar";

        const string B = Js.Blancos;

        // /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*t[ií]tulo\s*:\s*(.*?)\s*(?:\*\*|__)?\s*$/i
        static readonly Regex LineaTitulo = new Regex(
            $"^[{B}]*(?:#{{1,6}}[{B}]*)?(?:\\*\\*|__)?[{B}]*{Js.Ci("t")}[iIíÍ]{Js.Ci("tulo")}[{B}]*:[{B}]*({Js.Punto}*?)[{B}]*(?:\\*\\*|__)?[{B}]*\\z");

        // /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:5\s*[.)-]?\s*)?(?:\*\*|__)?\s*qu[eé]\s+conviene\s+rescatar\b/i
        static readonly Regex LineaRescate = new Regex(
            $"^[{B}]*(?:#{{1,6}}[{B}]*)?(?:\\*\\*|__)?[{B}]*(?:5[{B}]*[.)-]?[{B}]*)?(?:\\*\\*|__)?[{B}]*{Js.Ci("qu")}[eEéÉ][{B}]+{Js.Ci("conviene")}[{B}]+{Js.Ci("rescatar")}{Js.Borde}");

        static readonly Regex SaltoDeLinea = new Regex("\r?\n");
        static readonly Regex LineasEnBlancoIniciales = new Regex($"^(?:[{B}]*\r?\n)+");

        /// <summary>
        /// Separa la línea "TITULO: …" del resto. Sólo mira la PRIMERA línea no
        /// vacía: un "TITULO:" en medio es prosa del integrador. Sin título, null.
        /// </summary>
        public static (string Titulo, string Cuerpo) ExtraerTituloDelInforme(string informeCrudo)
        {
            var lineas = SaltoDeLinea.Split(informeCrudo);
            int i = 0;
            while (i < lineas.Length && Js.Trim(lineas[i]).Length == 0) i++;
            var m = i < lineas.Length ? LineaTitulo.Match(lineas[i]) : Match.Empty;
            if (!m.Success) return (null, informeCrudo);
            var titulo = Js.Trim(m.Groups[1].Value);
            var cuerpo = LineasEnBlancoIniciales.Replace(string.Join("\n", lineas.Skip(i + 1)), "", 1);
            // Un "TITULO:" sin nada detrás se saca igual, pero no inventa un título vacío.
            return (titulo.Length > 0 ? titulo : null, cuerpo);
        }

        public static bool EsEncabezadoRescate(string linea) => LineaRescate.IsMatch(linea);

        /// <summary>El párrafo es la línea del título (exenta de la regla de referencias).</summary>
        public static bool EsParrafoTitulo(string parrafo) => LineaTitulo.IsMatch(SaltoDeLinea.Split(parrafo)[0]);

        /// <summary>
        /// El cuerpo de la sección 5, sin su encabezado, desde él hasta el final.
        /// null si el informe no la tiene o está vacía: el encabezado no aparece vacío.
        /// </summary>
        public static string ExtraerSeccionRescate(string informeCrudo)
        {
            var lineas = SaltoDeLinea.Split(informeCrudo);
            int inicio = Array.FindIndex(lineas, EsEncabezadoRescate);
            if (inicio == -1) return null;
            var cuerpo = Js.Trim(string.Join("\n", lineas.Skip(inicio + 1)));
            return cuerpo.Length > 0 ? cuerpo : null;
        }

        const int MaxTitulo = 80;
        static readonly Regex ProhibidosWindows = new Regex("[\\\\/:*?\"<>|]");
        static readonly Regex Guiones = new Regex("[–—]");
        static readonly Regex Control = new Regex(@"[\u0000-\u001f\u007f]");
        static readonly Regex Blancos = new Regex($"[{B}]+");
        static readonly Regex PuntosYEspaciosFinales = new Regex("[ .]+\\z");

        /// <summary>
        /// Un título usable como nombre de archivo en Windows: sin prohibidos ni
        /// control, guiones largos a simples (para poder comprimir en ZIP),
        /// espacios colapsados, 80 caracteres y sin puntos ni espacios al final.
        /// </summary>
        public static string LimpiarTituloParaArchivo(string titulo)
        {
            var limpio = Js.Trim(Blancos.Replace(Control.Replace(Guiones.Replace(ProhibidosWindows.Replace(titulo, " "), "-"), " "), " "));
            if (limpio.Length > MaxTitulo) limpio = limpio.Substring(0, MaxTitulo);
            return PuntosYEspaciosFinales.Replace(limpio, "");
        }

        /// <summary>Las primeras seis palabras de la pregunta: el título de reserva.</summary>
        public static string TituloDesdePregunta(string pregunta) =>
            string.Join(" ", Blancos.Split(Js.Trim(pregunta)).Where(p => p.Length > 0).Take(6));

        /// <summary>"AAAA-MM-DD HHMM" con la fecha y hora LOCALES: el nombre lo lee Juan.</summary>
        public static string SelloFechaLocal(DateTime ahora) =>
            string.Format(CultureInfo.InvariantCulture, "{0}-{1:D2}-{2:D2} {3:D2}{4:D2}", ahora.Year, ahora.Month, ahora.Day, ahora.Hour, ahora.Minute);

        const string TituloDeReserva = "Informe de ronda";

        /// <summary>"AAAA-MM-DD HHMM - título" sin extensión; sin título del integrador, las seis primeras palabras de la pregunta.</summary>
        public static string NombreBaseDeInforme(string titulo, string pregunta, DateTime ahora)
        {
            var delIntegrador = titulo == null ? "" : LimpiarTituloParaArchivo(titulo);
            var dePregunta = delIntegrador.Length > 0 ? "" : LimpiarTituloParaArchivo(TituloDesdePregunta(pregunta));
            var elegido = delIntegrador.Length > 0 ? delIntegrador : dePregunta.Length > 0 ? dePregunta : TituloDeReserva;
            return $"{SelloFechaLocal(ahora)} - {elegido}";
        }

        const int MaxIntentos = 999;

        /// <summary>
        /// El primer nombre libre: base, base (2), base (3)… Nunca uno ocupado:
        /// sobrescribir un informe es perder un dato. "existe" mira el .md y el .pdf.
        /// </summary>
        public static string NombreLibreDeInforme(string nombreBase, Func<string, bool> existe)
        {
            if (!existe(nombreBase)) return nombreBase;
            for (int n = 2; n <= MaxIntentos; n++)
            {
                var candidato = $"{nombreBase} ({n})";
                if (!existe(candidato)) return candidato;
            }
            throw new InvalidOperationException($"no hay nombre libre para el informe \"{nombreBase}\" despues de {MaxIntentos} intentos");
        }
    }
}
