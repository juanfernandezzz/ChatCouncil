using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace ChatCouncil.Motor
{
    public sealed class ResultadoParseo
    {
        /// <summary>Sin Id ni SalidaOperadorId: los pone quien escribe el hecho.</summary>
        public List<HallazgoHecho> Hallazgos { get; } = new List<HallazgoHecho>();
        /// <summary>Líneas no vacías que no calzaron con ningún prefijo o no traían los campos exigidos.</summary>
        public int LineasDescartadas { get; set; }
    }

    // Las propiedades van en el orden de los campos del TypeScript: el JSON sale igual.
    public sealed class ItemCorrespondencia
    {
        public string Correspondencia { get; set; }
        /// <summary>Los tipos reconocidos, en el orden en que los escribió.</summary>
        public List<string> TiposFuente { get; set; }
        /// <summary>Lo que escribió en el campo de tipo y no es ninguno de los cuatro: se conserva.</summary>
        public List<string> TiposNoReconocidos { get; set; }
        public string HallazgoId { get; set; }
        /// <summary>La primera URL http(s) del campo; null si no trae (siempre en NO_ENCONTRADA).</summary>
        public string Url { get; set; }
        /// <summary>La cita sin las comillas de afuera; en NO_ENCONTRADA, el motivo.</summary>
        public string Texto { get; set; }
        public bool HallazgoInvalido { get; set; }
        /// <summary>La línea venía como VERIFICADO / CONTRADICHO / NO_VERIFICADO, sin campo de tipo.</summary>
        public bool FormatoAnterior { get; set; }
    }

    public sealed class PuntoCiego
    {
        public string Descripcion { get; set; }
        /// <summary>null cuando escribió "sin fuente" o no trajo URL.</summary>
        public string Url { get; set; }
        public List<string> TiposFuente { get; set; }
        public List<string> TiposNoReconocidos { get; set; }
    }

    public sealed class ResultadoParseoVerificacion
    {
        public List<ItemCorrespondencia> Correspondencias { get; } = new List<ItemCorrespondencia>();
        public List<PuntoCiego> PuntosCiegos { get; } = new List<PuntoCiego>();
        public List<string> Preguntas { get; } = new List<string>();
        public int LineasDescartadas { get; set; }
    }

    public sealed class ParrafoAnalizado
    {
        public int Indice { get; set; }
        public string Texto { get; set; }
        public bool EsLaTablaNoAlcanza { get; set; }
        /// <summary>La línea "TITULO: …": el nombre del archivo, exenta de la regla de referencias.</summary>
        public bool EsTitulo { get; set; }
        public List<string> Referencias { get; set; }
        /// <summary>Ni "LA TABLA NO ALCANZA" ni título, y sin ninguna referencia: viola la regla obligatoria.</summary>
        public bool SinReferencias { get; set; }
    }

    public sealed class ReferenciaEnParrafo
    {
        public int IndiceParrafo { get; set; }
        public string HallazgoId { get; set; }
        public bool ReferenciaInvalida { get; set; }
    }

    public sealed class ResultadoTrazabilidad
    {
        public List<ParrafoAnalizado> Parrafos { get; } = new List<ParrafoAnalizado>();
        public List<ReferenciaEnParrafo> Referencias { get; } = new List<ReferenciaEnParrafo>();
        public List<int> ParrafosSinReferencias { get; } = new List<int>();
    }

    /// <summary>
    /// Port de parsear-hallazgos.ts, parsear-verificacion.ts y
    /// parsear-referencias-integrador.ts. Las salidas son de modelos de lenguaje:
    /// sólo las palabras clave habilitan una línea, la prosa se descarta sin
    /// error, y una referencia inventada se conserva marcada, porque inventarla
    /// es un hecho sobre quien la escribió.
    /// </summary>
    public static class Parseos
    {
        const string B = Js.Blancos;

        static readonly string[] Categorias4 = { "CONVERGENCIA", "DIVERGENCIA", "TENSION", "SINGULARIDAD", "AUSENCIA" };
        static readonly string[] CategoriasLimitacion = { "LIMITACION:CORPUS", "LIMITACION:AMBIGUEDAD", "LIMITACION:TAREA", "LIMITACION:OTRA" };

        /// <summary>Exactamente n campos por "|", el último con el resto (puede traer "|"); null si faltan.</summary>
        public static List<string> SplitCampos(string linea, int n)
        {
            var partes = new List<string>();
            int desde = 0;
            for (int i = 0; i < n - 1; i++)
            {
                int idx = linea.IndexOf('|', desde);
                if (idx == -1) return null;
                partes.Add(linea.Substring(desde, idx - desde));
                desde = idx + 1;
            }
            partes.Add(linea.Substring(desde));
            return partes;
        }

        // AUSENCIA (y toda línea sin sostenedoras) acepta "—", "-", vacío o "NINGUNA".
        static List<string> ParsearEtiquetas(string campo)
        {
            var t = Js.Trim(campo);
            if (t.Length == 0 || t == "—" || t == "-" || Js.ToUpperCase(t) == "NINGUNA") return new List<string>();
            return t.Split(',').Select(Js.Trim).Where(e => e.Length > 0).ToList();
        }

        static string PrefijoDe(string linea, string[] prefijos) =>
            prefijos.FirstOrDefault(p => linea == p || linea.StartsWith(p + "|", StringComparison.Ordinal));

        /// <summary>
        /// "etiquetasValidas" son las que estaban en el cuerpo que recibió ESTE
        /// operador; una que no estaba deja el hallazgo con EtiquetaInvalida.
        /// </summary>
        public static ResultadoParseo ParsearHallazgos(string salidaCruda, IEnumerable<string> etiquetasValidas)
        {
            var validas = new HashSet<string>(etiquetasValidas);
            var r = new ResultadoParseo();
            // Espacio duro a espacio antes de parsear: chatgpt escribe así unos 200 espacios del prompt.
            foreach (var cruda in salidaCruda.Replace((char)0xA0, ' ').Split('\n'))
            {
                var linea = Js.Trim(cruda);
                if (linea.Length == 0) continue;
                var categoria = PrefijoDe(linea, Categorias4);
                bool conEje = categoria != null;
                categoria = categoria ?? PrefijoDe(linea, CategoriasLimitacion);
                var campos = categoria == null ? null : SplitCampos(linea, conEje ? 4 : 3);
                if (campos == null)
                {
                    r.LineasDescartadas++;
                    continue;
                }
                var etiquetas = ParsearEtiquetas(campos[campos.Count - 2]);
                r.Hallazgos.Add(new HallazgoHecho
                {
                    Categoria = categoria,
                    Eje = conEje ? Js.Trim(campos[1]) : null,
                    Etiquetas = etiquetas,
                    Descripcion = Js.Trim(campos[campos.Count - 1]),
                    EtiquetaInvalida = etiquetas.Any(e => !validas.Contains(e)),
                });
            }
            return r;
        }

        // ---------------------------------------------------------------- verificación

        static readonly string[] Tipos = { "OFICIAL", "PRIMARIA", "ACADEMICA", "SECUNDARIA" };

        static readonly Dictionary<string, string> Anterior = new Dictionary<string, string>
        {
            ["VERIFICADO"] = "CONFIRMA",
            ["CONTRADICHO"] = "CONTRADICE",
            ["NO_VERIFICADO"] = "NO_ENCONTRADA",
        };

        static readonly Regex PrimeraUrlRe = new Regex($"{Js.Ci("http")}[sS]?://[^{B}<>\"'`|]+");
        static readonly Regex PuntuacionFinal = new Regex(@"[).,;\]]+\z");
        static readonly Regex ComillasDeAfuera = new Regex("^\"+|\"+\\z");
        static readonly Regex Diacriticos = new Regex(@"[̀-ͯ]");
        static readonly Regex SeparadorDeTipos = new Regex($"[{B}]*(?:,|/|;|\\+|[{B}]+{Js.Ci("y")}[{B}]+)[{B}]*");
        static readonly Regex SoloGuiones = new Regex("^[—–-]+\\z");

        // ponytail: toma la primera URL y le saca la puntuación final; una URL que
        // termine legítimamente en ")" (Wikipedia) pierde ese paréntesis.
        static string PrimeraUrl(string campo)
        {
            var m = PrimeraUrlRe.Match(campo);
            return m.Success ? PuntuacionFinal.Replace(m.Value, "") : null;
        }

        static string SinComillas(string t) => Js.Trim(ComillasDeAfuera.Replace(Js.Trim(t), ""));

        /// <summary>"OFICIAL,PRIMARIA", "Académica", "oficial y primaria", "—": lo reconocido y lo que no.</summary>
        static (List<string> Reconocidos, List<string> NoReconocidos) LeerTipos(string campo)
        {
            var r = (Reconocidos: new List<string>(), NoReconocidos: new List<string>());
            if (campo == null) return r;
            var limpio = Diacriticos.Replace(Js.NormalizeNfd(campo), "").Replace("*", "");
            foreach (var p in SeparadorDeTipos.Split(limpio).Select(Js.Trim).Where(p => p.Length > 0 && !SoloGuiones.IsMatch(p)))
            {
                var tipo = Tipos.FirstOrDefault(x => x == Js.ToUpperCase(p));
                if (tipo == null) r.NoReconocidos.Add(p);
                else if (!r.Reconocidos.Contains(tipo)) r.Reconocidos.Add(tipo);
            }
            return r;
        }

        // Una palabra clave vale en cualquier punto de la línea (un modelo pega prosa
        // delante o escribe un párrafo sin saltos); (?<![A-Za-z_]) evita leer
        // VERIFICADO dentro de NO_VERIFICADO. Se toleran mayúsculas, **negritas**
        // y espacios antes del |.
        static readonly string Palabras = string.Join("|",
            new[] { "NO_ENCONTRADA", "NO_VERIFICADO", "VERIFICADO", "CONFIRMA", "CONTRADICE", "CONTRADICHO", "PUNTO_CIEGO", "PREGUNTA" }.Select(Js.Ci));
        static readonly Regex Clave = new Regex($"(?<![A-Za-z_])({Palabras})\\*{{0,2}}[{B}]*\\|");
        static readonly Regex Vineta = new Regex($"^[{B}>*#\\-•0-9.)]+(?=\\**[{B}]*({Palabras}))");
        static readonly Regex Seccion = new Regex($"{Js.Ci("SECCI")}[oOóÓ]{Js.Ci("N")}[{B}]+[0-9]{Js.Punto}*\\z");
        static readonly Regex NegritaAntesDeLaBarra = new Regex($"\\*\\*[{B}]*\\|");
        static readonly Regex HId = new Regex($"{Js.Borde}[hH][0-9]+{Js.Borde}");
        static readonly Regex HNumero = new Regex("[hH][0-9]+");
        static readonly Regex Comillas = new Regex("[“”«»]");

        /// <summary>Los H## de un campo ("H13/H118 (parcial)" son dos); sin ninguno, el campo tal cual.</summary>
        static List<string> IdsDelCampo(string campo)
        {
            var ids = new List<string>();
            foreach (Match m in HNumero.Matches(campo))
            {
                var id = Js.ToUpperCase(m.Value);
                if (!ids.Contains(id)) ids.Add(id);
            }
            return ids.Count == 0 ? new List<string> { Js.Trim(campo) } : ids;
        }

        /// <summary>La salida partida en segmentos que arrancan en una palabra clave; lo de antes de la primera cuenta como prosa.</summary>
        static List<(string Linea, bool HayPrevio)> Segmentos(string salida)
        {
            var segmentos = new List<(string, bool)>();
            // Espacio duro a espacio, y &quot; (GLM lo escribe como texto) y las comillas tipográficas a rectas.
            var limpia = Comillas.Replace(salida.Replace((char)0xA0, ' ').Replace("&quot;", "\""), "\"");
            foreach (var cruda in limpia.Split('\n'))
            {
                var l = Vineta.Replace(cruda, "", 1);
                var inicios = Clave.Matches(l).Cast<Match>().Select(m => m.Index).ToList();
                if (inicios.Count == 0)
                {
                    if (Js.Trim(l).Length > 0) segmentos.Add(("", true));
                    continue;
                }
                if (Js.Trim(l.Substring(0, inicios[0])).Length > 0) segmentos.Add(("", true));
                for (int i = 0; i < inicios.Count; i++)
                {
                    int fin = i + 1 < inicios.Count ? inicios[i + 1] : l.Length;
                    var seg = Seccion.Replace(l.Substring(inicios[i], fin - inicios[i]), "", 1);
                    segmentos.Add((Js.Trim(NegritaAntesDeLaBarra.Replace(seg, "|", 1)), false));
                }
            }
            return segmentos;
        }

        /// <summary>
        /// Los campos tras la palabra clave. Formato nuevo: TIPOS|H##|URL|cita
        /// (NO_ENCONTRADA: TIPOS|H##|motivo). Sin campo de tipo (formato anterior,
        /// o un segundo campo con un H## y ningún tipo): H##|URL|cita.
        /// </summary>
        static (string Tipos, List<string> Resto)? CamposCorrespondencia(string linea, bool conUrl, bool formatoAnterior)
        {
            var tres = SplitCampos(linea, 3);
            var segundo = tres != null ? tres[1] : "";
            bool sinTipo = formatoAnterior || (HId.IsMatch(segundo) && LeerTipos(segundo).Reconocidos.Count == 0);
            var c = SplitCampos(linea, (conUrl ? 5 : 4) - (sinTipo ? 1 : 0));
            if (c == null) return null;
            return sinTipo ? ((string)null, c.Skip(1).ToList()) : (c[1], c.Skip(2).ToList());
        }

        /// <summary>"idsValidos" son los H## de la tabla de hallazgos de la ronda.</summary>
        public static ResultadoParseoVerificacion ParsearVerificacion(string salidaCruda, IEnumerable<string> idsValidos)
        {
            var validos = new HashSet<string>(idsValidos);
            var r = new ResultadoParseoVerificacion();
            foreach (var (linea, hayPrevio) in Segmentos(salidaCruda))
            {
                if (hayPrevio)
                {
                    r.LineasDescartadas++;
                    continue;
                }
                var palabra = Js.ToUpperCase(Js.Trim(linea.Substring(0, linea.IndexOf('|'))));
                bool formatoAnterior = Anterior.TryGetValue(palabra, out var nueva);
                var correspondencia = formatoAnterior ? nueva : palabra;

                if (correspondencia == "CONFIRMA" || correspondencia == "CONTRADICE" || correspondencia == "NO_ENCONTRADA")
                {
                    bool conUrl = correspondencia != "NO_ENCONTRADA";
                    var c = CamposCorrespondencia(linea, conUrl, formatoAnterior);
                    if (c != null)
                    {
                        var (reconocidos, noReconocidos) = LeerTipos(c.Value.Tipos);
                        var resto = c.Value.Resto;
                        var url = conUrl ? PrimeraUrl(resto[1]) : null;
                        var texto = conUrl ? SinComillas(resto[2]) : Js.Trim(resto[1]);
                        foreach (var hallazgoId in IdsDelCampo(resto[0]))
                        {
                            r.Correspondencias.Add(new ItemCorrespondencia
                            {
                                Correspondencia = correspondencia,
                                TiposFuente = reconocidos,
                                TiposNoReconocidos = noReconocidos,
                                HallazgoId = hallazgoId,
                                Url = url,
                                Texto = texto,
                                HallazgoInvalido = !validos.Contains(hallazgoId),
                                FormatoAnterior = formatoAnterior,
                            });
                        }
                        continue;
                    }
                }
                else if (palabra == "PUNTO_CIEGO")
                {
                    // Formato nuevo con tipo (4 campos); el anterior traía 3.
                    var c = SplitCampos(linea, 4) ?? SplitCampos(linea, 3);
                    if (c != null)
                    {
                        var (reconocidos, noReconocidos) = LeerTipos(c.Count > 3 ? c[3] : null);
                        r.PuntosCiegos.Add(new PuntoCiego { Descripcion = Js.Trim(c[1]), Url = PrimeraUrl(c[2]), TiposFuente = reconocidos, TiposNoReconocidos = noReconocidos });
                        continue;
                    }
                }
                else if (palabra == "PREGUNTA")
                {
                    var texto = Js.Trim(linea.Substring(linea.IndexOf('|') + 1));
                    if (texto.Length > 0)
                    {
                        r.Preguntas.Add(texto);
                        continue;
                    }
                }
                r.LineasDescartadas++;
            }
            return r;
        }

        // ---------------------------------------------------------------- trazabilidad del integrador

        static readonly Regex Referencia = new Regex(@"\[H[0-9]+\]");
        static readonly Regex SeparadorDeParrafos = new Regex($"\r?\n[{B}]*\r?\n+");

        /// <summary>
        /// Un párrafo es un bloque separado por una línea en blanco. Toda
        /// referencia [H##] se conserva aunque no exista en la tabla que recibió
        /// ESTE integrador: queda con ReferenciaInvalida.
        /// </summary>
        public static ResultadoTrazabilidad ParsearReferenciasIntegrador(string informeCrudo, IEnumerable<string> idsValidos)
        {
            var validos = new HashSet<string>(idsValidos);
            var r = new ResultadoTrazabilidad();
            var textos = SeparadorDeParrafos.Split(informeCrudo).Select(Js.Trim).Where(p => p.Length > 0).ToList();
            for (int indice = 0; indice < textos.Count; indice++)
            {
                var texto = textos[indice];
                bool noAlcanza = texto.StartsWith("LA TABLA NO ALCANZA", StringComparison.Ordinal);
                bool esTitulo = indice == 0 && TituloInforme.EsParrafoTitulo(texto);
                var ids = Referencia.Matches(texto).Cast<Match>().Select(m => m.Value.Substring(1, m.Value.Length - 2)).ToList();
                foreach (var id in ids) r.Referencias.Add(new ReferenciaEnParrafo { IndiceParrafo = indice, HallazgoId = id, ReferenciaInvalida = !validos.Contains(id) });
                bool sinReferencias = ids.Count == 0 && !noAlcanza && !esTitulo;
                if (sinReferencias) r.ParrafosSinReferencias.Add(indice);
                r.Parrafos.Add(new ParrafoAnalizado { Indice = indice, Texto = texto, EsLaTablaNoAlcanza = noAlcanza, EsTitulo = esTitulo, Referencias = ids, SinReferencias = sinReferencias });
            }
            return r;
        }
    }
}
