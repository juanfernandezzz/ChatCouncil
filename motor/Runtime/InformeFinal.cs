using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace ChatCouncil.Motor
{
    public sealed class HallazgoResuelto
    {
        public string Codigo { get; set; }
        public string Categoria { get; set; }
        public string Eje { get; set; }
        public List<string> RespuestasReales { get; set; }
        public string Descripcion { get; set; }
        public string OperadorReal { get; set; }
    }

    public sealed class ReferenciaResuelta
    {
        public string Codigo { get; set; }
        public bool Existe { get; set; }
    }

    public sealed class CondicionProveedor
    {
        public string ProveedorId { get; set; }
        public string EtiquetaModelo { get; set; }
        public int CaracteresRespuesta { get; set; }
        public int FuentesCitadas { get; set; }
        public string CodigoEstable { get; set; }
    }

    public sealed class ParticipacionOperador
    {
        public string OperadorId { get; set; }
        public string Estado { get; set; }
        public string Detalle { get; set; }
    }

    public sealed class RedaccionParaInforme
    {
        public string RedactorId { get; set; }
        public List<string> Controles { get; set; }
        public string Cuerpo { get; set; }
    }

    public sealed class ItemVerificacion
    {
        public string Correspondencia { get; set; }
        public List<string> TiposFuente { get; set; }
        public List<string> TiposNoReconocidos { get; set; }
        public bool FormatoAnterior { get; set; }
        public string HallazgoId { get; set; }
        public string Descripcion { get; set; }
        public string Url { get; set; }
        public string Comprobacion { get; set; }
        public string Texto { get; set; }
    }

    public sealed class VerificacionParaInforme
    {
        public string AvisoSinComprobar { get; set; }
        public List<ItemVerificacion> Items { get; set; }
        public List<PuntoCiego> PuntosCiegos { get; set; }
        public List<string> Preguntas { get; set; }
    }

    public sealed class InformeFinalInput
    {
        public string Pregunta { get; set; }
        public string Fecha { get; set; }
        public string ConversacionId { get; set; }
        public string RondaId { get; set; }
        public string InformeIntegradorCrudo { get; set; }
        public List<ReferenciaResuelta> ReferenciasEnOrden { get; set; }
        public List<HallazgoResuelto> Hallazgos { get; set; }
        public List<ParticipacionOperador> ParticipacionOperadores { get; set; }
        public List<CondicionProveedor> Condiciones { get; set; }
        public string IntegridadEntrega { get; set; }
        public string Semilla { get; set; }
        public List<string> ProveedoresCargadosIncompletos { get; set; }
        public string Integrador { get; set; }
        public VerificacionParaInforme Verificacion { get; set; }
        public RedaccionParaInforme Redaccion { get; set; }
    }

    public sealed class ControlesRedaccion
    {
        public string LecturaArchivo { get; set; }
        public int? EnlacesExternos { get; set; }
        public int? EnlacesFueraDelMaterial { get; set; }
        public List<string> HallazgosInexistentes { get; set; }
        public string Cuerpo { get; set; }
    }

    public sealed class RespuestaParaPdf
    {
        public string ProveedorId { get; set; }
        public string EtiquetaModelo { get; set; }
        public string LeidaEn { get; set; }
        public string TextoOriginal { get; set; }
        public string Error { get; set; }
        public int FuentesCitadas { get; set; }
        public int? FuentesHref { get; set; }
        public string FinDe { get; set; }
    }

    /// <summary>
    /// Port de informe-final.ts, redaccion.ts, informe-respuesta.ts y
    /// verificacionParaInforme (integrador.ts). El informe se arma EN CÓDIGO,
    /// nunca con un modelo: junta datos ya resueltos en el formato exacto y no
    /// decide nada. "Lo que este informe no dice" va siempre, literal.
    /// </summary>
    public static class InformeFinal
    {
        const string B = Js.Blancos;
        const string EncabezadoRedaccion = "## Respuesta a la pregunta (aporte del redactor)";
        const string EncabezadoVerificacion = "## Verificación de fuentes (aporte de un modelo con búsqueda, no verificado por el consejo)";
        const string EncabezadoPuntosCiegos = "## Puntos ciegos y preguntas derivadas (aporte del verificador)";
        const string SinInformeIntegrador = "No se capturo informe del integrador para esta ronda.";
        const string SinTabla = "La tabla de hallazgos de esta ronda esta vacia: ningun operador dejo hallazgos parseables.";

        static readonly Regex Corchetes = new Regex(@"\[[^\]\n]*\]");
        static readonly Regex CodigoH = new Regex($"{Js.Borde}H[0-9]+{Js.Borde}");
        // /^[ \t]*\[\[CC-[^\]\n]*\]\][ \t]*\n/gm: con /m, "^" también arranca después de \r, U+2028 y U+2029.
        static readonly Regex MarcaSolaEnSuLinea = new Regex(@"(?:\A|(?<=[\n\r\u2028\u2029]))[ \t]*\[\[CC-[^\]\n]*\]\][ \t]*\n");
        static readonly Regex MarcaEnLinea = new Regex(@"[ \t]*\[\[CC-[^\]\n]*\]\]");

        /// <summary>
        /// Marca cada H## de cada grupo entre corchetes ([H12], [CONFIRMA H12]) como
        /// existente o no: la misma regla con que ControlesRedaccion los detecta.
        /// </summary>
        static string MarcarReferencias(string texto, ISet<string> existentes) =>
            Corchetes.Replace(texto, grupo => CodigoH.Replace(grupo.Value, codigo =>
                existentes.Contains(codigo.Value) ? $"{codigo.Value} ✓" : $"{codigo.Value} ✗ referencia inexistente"));

        /// <summary>
        /// Las marcas [[CC-MARCA-…]] son instrumentación: un modelo que cita el
        /// archivo se las trae, y entran por el redactor, una descripción o una
        /// cita. Se quitan de este informe, nunca del registro, y se cuentan.
        /// </summary>
        static (string Texto, int Quitadas) SinMarcasDeIntegridad(string texto)
        {
            int quitadas = 0;
            // Primero la que ocupa su propia línea, con su salto: si no, queda una línea en blanco de más.
            var limpio = MarcaEnLinea.Replace(MarcaSolaEnSuLinea.Replace(texto, _ => { quitadas++; return ""; }), _ => { quitadas++; return ""; });
            return (limpio, quitadas);
        }

        static string EntradaHallazgo(HallazgoResuelto h)
        {
            var lineas = new List<string>
            {
                $"**{h.Codigo}** — {h.Categoria}{(h.Eje != null ? $" · {h.Eje}" : "")}",
                $"Registrado por: {Dominio.NombreProveedor(h.OperadorReal)}",
            };
            if (h.RespuestasReales.Count > 0) lineas.Add($"Respuestas que lo sostienen: {string.Join(", ", h.RespuestasReales.Select(Dominio.NombreProveedor))}");
            lineas.Add($"> {h.Descripcion}");
            return string.Join("\n", lineas);
        }

        static string FilaCondicion(CondicionProveedor c) =>
            $"| {c.CodigoEstable ?? "(sin sello)"} | {Dominio.NombreProveedor(c.ProveedorId)} | {c.EtiquetaModelo ?? "(no observada)"} | {c.CaracteresRespuesta} | {c.FuentesCitadas} |";

        static string TiposLegibles(List<string> tipos, List<string> noReconocidos, string sinFuente)
        {
            var partes = new List<string>();
            if (tipos.Count > 0) partes.Add(string.Join(", ", tipos));
            if (noReconocidos.Count > 0) partes.Add($"tipo no reconocido: {string.Join(", ", noReconocidos)}");
            return partes.Count > 0 ? string.Join("; ", partes) : sinFuente;
        }

        static List<string> SeccionesVerificacion(VerificacionParaInforme v)
        {
            var items = v.Items.Select(i =>
            {
                var tipos = i.FormatoAnterior
                    ? "tipo de fuente no registrado (formato anterior)"
                    : TiposLegibles(i.TiposFuente, i.TiposNoReconocidos, i.Correspondencia == "NO_ENCONTRADA" ? "sin fuente" : "tipo no declarado");
                var lineas = new List<string>
                {
                    $"{i.Correspondencia} · {tipos} — [{i.HallazgoId}] {i.Descripcion ?? "(ese hallazgo no existe en la tabla de la ronda)"}",
                    i.Url == null ? $"Fuente: sin fuente — {i.Texto}" : $"Fuente: {i.Url} — {i.Comprobacion}",
                };
                if (i.Url != null && i.Texto.Length > 0) lineas.Add($"> {i.Texto}");
                return string.Join("\n", lineas);
            }).ToList();
            var aportes = v.PuntosCiegos
                .Select(p => p.Url == null
                    ? $"- Punto ciego: {p.Descripcion} — Fuente: sin fuente"
                    : $"- Punto ciego: {p.Descripcion} — Fuente: {p.Url} ({TiposLegibles(p.TiposFuente, p.TiposNoReconocidos, "tipo no declarado")})")
                .Concat(v.Preguntas.Select(q => $"- Pregunta derivada: {q}"))
                .ToList();
            var r = new List<string> { EncabezadoVerificacion, "" };
            if (!string.IsNullOrEmpty(v.AvisoSinComprobar)) r.AddRange(new[] { v.AvisoSinComprobar, "" });
            r.AddRange(new[]
            {
                items.Count > 0 ? string.Join("\n\n", items) : "El verificador no registro lineas de correspondencia con la fuente.",
                "",
                EncabezadoPuntosCiegos,
                "",
                aportes.Count > 0 ? string.Join("\n", aportes) : "El verificador no registro puntos ciegos ni preguntas derivadas.",
                "",
            });
            return r;
        }

        public static string Armar(InformeFinalInput input)
        {
            var existentes = new HashSet<string>(input.Hallazgos.Select(h => h.Codigo));
            // La línea "TITULO:" pasa a ser el encabezado y no se muestra en la lectura del integrador.
            string titulo = null, cuerpoIntegrador = null;
            if (input.InformeIntegradorCrudo != null) (titulo, cuerpoIntegrador) = TituloInforme.ExtraerTituloDelInforme(input.InformeIntegradorCrudo);
            var lectura = cuerpoIntegrador == null ? SinInformeIntegrador : MarcarReferencias(cuerpoIntegrador, existentes);
            // La sección 5 del integrador va al principio: es lo que lee quien hizo la pregunta.
            var rescateCrudo = cuerpoIntegrador == null ? null : TituloInforme.ExtraerSeccionRescate(cuerpoIntegrador);
            var rescate = rescateCrudo == null ? null : MarcarReferencias(rescateCrudo, existentes);

            // Referenciados: sólo los que existen, en orden de primera aparición.
            var referenciados = new List<HallazgoResuelto>();
            var vistos = new HashSet<string>();
            foreach (var r in input.ReferenciasEnOrden)
            {
                if (!r.Existe || !vistos.Add(r.Codigo)) continue;
                var h = input.Hallazgos.FirstOrDefault(x => x.Codigo == r.Codigo);
                if (h != null) referenciados.Add(h);
            }
            var noReferenciados = input.Hallazgos.Where(h => !vistos.Contains(h.Codigo)).ToList();
            var limitaciones = input.Hallazgos.Where(h => h.Categoria.StartsWith("LIMITACION:", StringComparison.Ordinal)).ToList();

            // Sin tabla, sin integrador o sin referencias se dicen por separado: un
            // encabezado en blanco no se distingue de un defecto de armado.
            bool sinTabla = input.Hallazgos.Count == 0;
            var seccionReferenciados = sinTabla ? SinTabla
                : referenciados.Count > 0 ? string.Join("\n\n", referenciados.Select(EntradaHallazgo))
                : cuerpoIntegrador == null ? $"{SinInformeIntegrador} Sin informe no hay referencias que resolver: los {input.Hallazgos.Count} hallazgos de la tabla estan completos en \"Hallazgos no referenciados\"."
                : "El integrador no referencio ningun hallazgo de la tabla.";
            var seccionNoReferenciados = sinTabla ? SinTabla
                : noReferenciados.Count > 0 ? string.Join("\n\n", noReferenciados.Select(EntradaHallazgo))
                : "El integrador referencio todos los hallazgos.";
            var seccionLimitaciones = sinTabla ? SinTabla
                : limitaciones.Count > 0 ? string.Join("\n\n", limitaciones.Select(EntradaHallazgo))
                : "Ningun operador registro limitaciones.";
            var seccionParticipacion = input.ParticipacionOperadores.Count > 0
                ? string.Join("\n", input.ParticipacionOperadores.Select(p => $"**{Dominio.NombreProveedor(p.OperadorId)}** — {p.Estado}: {p.Detalle}"))
                : "No hay operadores registrados para esta ronda.";

            var partes = new List<string> { titulo == null ? "# Informe de ronda" : $"# {titulo}", "" };
            if (input.Redaccion != null)
            {
                partes.AddRange(new[]
                {
                    EncabezadoRedaccion, "",
                    $"Aporte de un solo modelo ({Dominio.NombreProveedor(input.Redaccion.RedactorId)}), basado en el análisis que sigue. No es un resultado del consejo.", "",
                });
                partes.AddRange(input.Redaccion.Controles);
                partes.AddRange(new[] { "", MarcarReferencias(input.Redaccion.Cuerpo, existentes), "" });
            }
            if (rescate != null) partes.AddRange(new[] { TituloInforme.EncabezadoRescate, "", rescate, "" });
            if (input.Verificacion != null) partes.AddRange(SeccionesVerificacion(input.Verificacion));
            partes.AddRange(new[]
            {
                $"**Pregunta:** {input.Pregunta}",
                $"**Fecha:** {input.Fecha}",
                "**Eje de registro:** los tres (HECHOS, FUENTES, CONCLUSIONES)",
                "",
                "## Lectura del integrador", "", lectura, "",
                "## Participacion de operadores", "", seccionParticipacion, "",
                "## Hallazgos referenciados", "", seccionReferenciados, "",
                "## Hallazgos no referenciados", "", seccionNoReferenciados, "",
                "## Limitaciones registradas por los operadores", "", seccionLimitaciones, "",
                "## Condiciones de la ronda", "",
            });
            // Sin respuestas no se imprime una tabla con encabezado y ninguna fila.
            if (input.Condiciones.Count == 0) partes.Add("No hay respuestas de investigador en el registro de esta ronda.");
            else
            {
                partes.AddRange(new[]
                {
                    "La columna Codigo es la clave de los [P#] que aparecen en el texto del",
                    "redactor y del integrador: es el codigo estable del sello de esta ronda.",
                    "",
                    "| Codigo | Proveedor | Etiqueta de modelo | Caracteres de su respuesta | Fuentes citadas |",
                    "|---|---|---|---|---|",
                    string.Join("\n", input.Condiciones.Select(FilaCondicion)),
                });
            }
            partes.AddRange(new[]
            {
                "",
                $"Conversación: {input.ConversacionId}",
                $"Ronda: {input.RondaId}",
                "",
                $"Integrador de esta ronda: {(string.IsNullOrEmpty(input.Integrador) ? "(no registrado)" : Dominio.NombreProveedor(input.Integrador))}",
                "",
            });
            if (input.ProveedoresCargadosIncompletos != null)
            {
                partes.Add("Proveedores cargados en esta ronda:");
                partes.AddRange(input.ProveedoresCargadosIncompletos.Select(p => $"- {Dominio.NombreProveedor(p)}"));
                partes.Add("");
            }
            partes.AddRange(new[]
            {
                $"**Integridad de entrega:** {input.IntegridadEntrega}",
                $"**Semilla de la ronda:** {input.Semilla}",
                "",
                "## Lo que este informe no dice",
                "",
                "Este informe describe como se relacionan siete respuestas entre si. No",
                "determina cual es correcta. La verificacion mecanica comprueba que una fuente",
                "existe y coincide, no que sostenga la afirmacion. El informe del integrador es",
                "una afirmacion de un modelo con su procedencia registrada, no un resultado",
                "verificado. Las limitaciones completas del instrumento estan en",
                "docs/LIMITACIONES.md.",
            });

            // Las marcas se quitan al final, de una pasada: entran por tres caminos.
            var (texto, quitadas) = SinMarcasDeIntegridad(string.Join("\n", partes));
            return quitadas == 0
                ? texto
                : string.Join("\n",
                    texto,
                    "",
                    $"Se quitaron {quitadas} marca(s) de integridad [[CC-...]] del texto de este informe:",
                    "son instrumentacion del archivo que leyeron los modelos, no contenido. El texto",
                    "crudo con las marcas sigue intacto en el registro de la conversacion.");
        }

        static string Otras(int n) => n == 1 ? "la otra sale" : $"las otras {n} salen";

        /// <summary>
        /// La salida del verificador resuelta para el informe: cada H## con la
        /// descripción de la tabla y cada URL con su comprobación mecánica. Dice
        /// por qué quedaron URLs "sin comprobar", y nombra el techo sólo si de
        /// verdad se alcanzó.
        /// </summary>
        public static VerificacionParaInforme VerificacionParaInforme(SalidaVerificador salida, IEnumerable<UrlComprobada> urls, IReadOnlyList<HallazgoResuelto> hallazgos, int? techoUrls)
        {
            var descripcion = new Dictionary<string, string>();
            foreach (var h in hallazgos) descripcion[h.Codigo] = h.Descripcion;
            var comprobada = new Dictionary<string, UrlComprobada>();
            foreach (var u in urls.Where(u => u.SalidaVerificadorId == salida.Id)) comprobada[u.Url] = u;
            var p = Parseos.ParsearVerificacion(TextoDeHtml.TextoDeLaSalidaVerificador(salida.SalidaCruda, salida.Html), descripcion.Keys);

            int unicas = p.Correspondencias.Where(v => v.Correspondencia != "NO_ENCONTRADA" && v.Url != null).Select(v => v.Url).Distinct().Count();
            int faltan = unicas - comprobada.Count;
            var aviso = unicas == 0 || faltan <= 0 ? null
                : comprobada.Count == 0 ? $"Ninguna de las {unicas} URL de esta seccion se comprobo con codigo: las {unicas} salen \"sin comprobar\"."
                : techoUrls != null && comprobada.Count >= techoUrls
                    ? $"El verificador cito {unicas} URL distintas y la comprobacion mecanica tiene un techo de {techoUrls} por ronda: se comprobaron {comprobada.Count} y {Otras(faltan)} \"sin comprobar\" POR EL TECHO, no por haber fallado."
                    : $"Se {(comprobada.Count == 1 ? "comprobo 1" : $"comprobaron {comprobada.Count}")} de las {unicas} URL distintas de esta seccion; {Otras(faltan)} \"sin comprobar\" porque el registro no tiene una comprobacion para {(faltan == 1 ? "ella" : "ellas")}.";

            return new VerificacionParaInforme
            {
                AvisoSinComprobar = aviso,
                Items = p.Correspondencias.Select(v =>
                {
                    UrlComprobada u = null;
                    if (v.Url != null) comprobada.TryGetValue(v.Url, out u);
                    return new ItemVerificacion
                    {
                        Correspondencia = v.Correspondencia,
                        TiposFuente = v.TiposFuente,
                        TiposNoReconocidos = v.TiposNoReconocidos,
                        FormatoAnterior = v.FormatoAnterior,
                        HallazgoId = v.HallazgoId,
                        Descripcion = descripcion.TryGetValue(v.HallazgoId, out var d) ? d : null,
                        Url = v.Url,
                        Comprobacion = u == null ? "sin comprobar" : u.Codigo == null ? "no resuelve" : $"responde {u.Codigo}",
                        Texto = v.Texto,
                    };
                }).ToList(),
                PuntosCiegos = p.PuntosCiegos,
                Preguntas = p.Preguntas,
            };
        }

        // ---------------------------------------------------------------- redactor

        static readonly Regex LineaArchivo = new Regex($"^\\**{Js.Ci("ARCHIVO")}:");
        static readonly Regex NoPudeLeer = new Regex(Js.Ci("no pude leer"));
        static readonly Regex Marca = new Regex(@"\[\[CC-[^\]]+\]\]");
        static readonly Regex Enlace = new Regex($"<[aA]{Js.Borde}[^>]*{Js.Ci("href")}[{B}]*=[{B}]*\"({Js.Ci("http")}[sS]?:[^\"]*)\"");
        static readonly Regex InicioDeUrl = new Regex("^[a-zA-Z]+://[^/]*");
        static readonly Regex BarrasFinales = new Regex("/+\\z");

        // Origen y ruta sin query ni fragmento, con esquema y host en minúsculas:
        // los dos lados de la comparación pasan por acá.
        static string ClaveDeUrl(string url) =>
            BarrasFinales.Replace(InicioDeUrl.Replace(Js.Trim(url).Split('#')[0].Split('?')[0], m => Js.ToLowerCase(m.Value), 1), "");

        /// <summary>
        /// Los controles MECÁNICOS sobre la respuesta del redactor: si leyó el
        /// archivo entero, si trae enlaces que el material no tenía y si cita
        /// hallazgos que no existen. Ninguno juzga el contenido.
        /// </summary>
        public static ControlesRedaccion ControlesRedaccion(string textoCrudo, string html, string marcaPrimera, string marcaUltima,
            IReadOnlyList<string> idsValidos, IReadOnlyList<string> urlsDelMaterial)
        {
            var texto = string.IsNullOrEmpty(html) ? textoCrudo : TextoDeHtml.TextoDeHtmlEnBloques(html);
            var lineas = texto.Split('\n');
            int i = Array.FindIndex(lineas, l => Js.Trim(l).Length > 0);
            var primera = i < 0 ? "" : Js.Trim(lineas[i]);

            string lectura;
            if (!LineaArchivo.IsMatch(primera)) lectura = "sin-linea";
            else if (NoPudeLeer.IsMatch(primera)) lectura = "no-pudo-leer";
            else if (marcaPrimera == null || marcaUltima == null) lectura = "sin-marcas-registradas";
            else
            {
                var marcas = Marca.Matches(primera).Cast<Match>().Select(m => m.Value).ToList();
                lectura = marcas.Count > 0 && marcas[0] == marcaPrimera && marcas[marcas.Count - 1] == marcaUltima ? "entero" : "marcas-distintas";
            }

            var hrefs = string.IsNullOrEmpty(html) ? null : Enlace.Matches(html).Cast<Match>().Select(m => m.Groups[1].Value).ToList();
            var delMaterial = new HashSet<string>(urlsDelMaterial.Select(ClaveDeUrl));
            var validos = new HashSet<string>(idsValidos);
            var inexistentes = new List<string>();
            foreach (Match grupo in Corchetes.Matches(texto))
                foreach (Match codigo in CodigoH.Matches(grupo.Value))
                    if (!validos.Contains(codigo.Value) && !inexistentes.Contains(codigo.Value)) inexistentes.Add(codigo.Value);

            return new ControlesRedaccion
            {
                LecturaArchivo = lectura,
                EnlacesExternos = hrefs?.Count,
                EnlacesFueraDelMaterial = hrefs == null || urlsDelMaterial.Count == 0 ? (int?)null : hrefs.Count(h => !delMaterial.Contains(ClaveDeUrl(h))),
                HallazgosInexistentes = inexistentes,
                Cuerpo = lectura == "sin-linea" ? texto : Js.Trim(string.Join("\n", lineas.Skip(i + 1))),
            };
        }

        static readonly Dictionary<string, string> TextoLectura = new Dictionary<string, string>
        {
            ["entero"] = "Leyó el archivo entero: la primera línea trae la primera y la última marca correctas.",
            ["no-pudo-leer"] = "No pudo leer el archivo: respondió \"no pude leer el archivo adjunto\".",
            ["marcas-distintas"] = "Las marcas de la primera línea no son las del archivo: leyó parcial o resumió.",
            ["sin-linea"] = "Se saltó la primera línea ARCHIVO: no se puede saber si leyó el archivo entero.",
            ["sin-marcas-registradas"] = "No se puede comprobar la lectura: la app se reinició entre pegar y capturar.",
        };

        static string Enlaces(int n) => n == 1 ? "1 enlace externo" : $"{n} enlaces externos";

        /// <summary>Las líneas de control que van bajo el encabezado del redactor.</summary>
        public static List<string> LineasDeControl(ControlesRedaccion c)
        {
            // Lo que se mide son ENLACES en el html, no una salida a la red: sólo uno que el material no traía es indicio.
            string enlaces;
            if (c.EnlacesExternos == null) enlaces = "- Sin html capturado: no se puede saber si salió a la red.";
            else if (c.EnlacesExternos == 0) enlaces = "- Ningún enlace externo en lo capturado: nada indica que haya salido a la red.";
            else if (c.EnlacesFueraDelMaterial == null)
                enlaces = $"- {Enlaces(c.EnlacesExternos.Value)} en lo capturado, sin el material de la ronda con que compararlos: no se puede decir si salió a la red o si cita enlaces del material.";
            else if (c.EnlacesFueraDelMaterial == 0)
                enlaces = $"- {Enlaces(c.EnlacesExternos.Value)} en lo capturado, y {(c.EnlacesExternos == 1 ? "estaba" : "todos estaban")} en el material de la ronda: nada indica que haya salido a la red.";
            else
            {
                int f = c.EnlacesFueraDelMaterial.Value;
                enlaces = $"- {Enlaces(c.EnlacesExternos.Value)} en lo capturado, y {(f == 1 ? "1 no estaba" : $"{f} no estaban")} en el material de la ronda: o salió a la red, o {(f == 1 ? "lo escribió" : "los escribió")} de memoria. Lo que cite de {(f == 1 ? "ese enlace" : $"esos {f}")} no sale del material.";
            }
            return new List<string>
            {
                $"- {TextoLectura[c.LecturaArchivo]}",
                enlaces,
                c.HallazgosInexistentes.Count == 0
                    ? "- Todos los hallazgos que cita existen en la tabla."
                    : $"- Cita hallazgos que no existen en la tabla: {string.Join(", ", c.HallazgosInexistentes)}.",
            };
        }

        // ---------------------------------------------------------------- respuestas de los investigadores

        /// <summary>Nombre literal de la subcarpeta, dentro de la carpeta del informe.</summary>
        public const string SubcarpetaRespuestas = "Respuestas de los investigadores";

        /// <summary>
        /// El Markdown de una respuesta de investigador, para su PDF: el texto
        /// entero y sin tocar. Una respuesta no capturada no se omite: dice que no
        /// hay texto y por qué.
        /// </summary>
        public static string MarkdownDeRespuestaInvestigador(string pregunta, RespuestaParaPdf r)
        {
            var cuerpo = Js.Trim(r.TextoOriginal);
            var lineas = new List<string>
            {
                $"# {Dominio.NombreProveedor(r.ProveedorId)}",
                "",
                $"**Etiqueta de modelo:** {r.EtiquetaModelo ?? "(no observada)"}",
                $"**Leida:** {r.LeidaEn}",
                $"**Caracteres:** {r.TextoOriginal.Length}",
                $"**Fuentes citadas (verificables):** {r.FuentesCitadas}",
                $"**Enlaces en el DOM:** {(r.FuentesHref == null ? "(no contados)" : r.FuentesHref.ToString())}",
                $"**Fin de respuesta:** {r.FinDe}",
            };
            if (r.Error != null) lineas.Add($"**Error registrado en la captura:** {r.Error}");
            lineas.AddRange(new[]
            {
                "", "## Pregunta", "", pregunta, "", "## Respuesta", "",
                cuerpo.Length > 0 ? cuerpo : "No se capturo texto de esta respuesta.",
                "", "---", "",
                "Texto capturado tal cual de la interfaz del proveedor, sin corregir ni recortar.",
                "Este documento es la respuesta a la pregunta, no la evaluacion que este",
                "proveedor hizo de las respuestas de los demas.",
            });
            return string.Join("\n", lineas);
        }

        /// <summary>"n - Proveedor", sin extensión: el número conserva el orden del pool en el explorador.</summary>
        public static string NombreArchivoRespuesta(int indiceEnPool, string proveedorId)
        {
            var limpio = TituloInforme.LimpiarTituloParaArchivo(Dominio.NombreProveedor(proveedorId));
            return $"{indiceEnPool + 1} - {(limpio.Length > 0 ? limpio : "proveedor")}";
        }
    }
}
