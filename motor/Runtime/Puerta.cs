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

    /// <summary>La operación de un panel: lo que se pega y, por la vía de archivo, el archivo que se adjunta.</summary>
    public sealed class Operacion
    {
        public string OperadorId { get; set; }
        /// <summary>Lo que se pega en el compositor: el prompt entero con sus marcas, o sólo el prompt si va con archivo.</summary>
        public string Texto { get; set; }
        /// <summary>null si va pegada.</summary>
        public string CuerpoArchivo { get; set; }
        public string NombreArchivo { get; set; }
        /// <summary>Las intercaladas y la de FIN, para comprobar la entrega.</summary>
        public List<string> Marcas { get; set; }
        /// <summary>Lo que se registra como promptCompleto de su salida.</summary>
        public string PromptCompleto { get; set; }
    }

    /// <summary>El material de la ronda para el redactor, en un archivo con marcas, y el prompt que se pega.</summary>
    public sealed class ArchivoRedactor
    {
        public string Prompt { get; set; }
        public string CuerpoArchivo { get; set; }
        public string NombreArchivo { get; set; }
        public string MarcaPrimera { get; set; }
        public string MarcaUltima { get; set; }
        /// <summary>Sin verificación capturada se arma igual y se avisa; null si no hay nada que avisar.</summary>
        public string Aviso { get; set; }
        public string PromptCompleto { get; set; }
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
        readonly Func<DateTimeOffset> reloj;
        readonly IReadOnlyList<string> activos;
        readonly RolesElegidos roles;
        readonly IReadOnlyList<string> poolOperadores;
        int indiceRonda;

        /// <summary>Lo que se registra como prompt cuando la app se reinició entre pegar y capturar.</summary>
        public const string PromptNoDisponible = "(prompt no disponible: no se registró en este proceso — probablemente se reinició la app entre el envío y la captura)";

        // Lo último que se pegó en cada panel, en este proceso: es el promptCompleto de lo que se capture después.
        readonly Dictionary<string, string> promptOperador = new Dictionary<string, string>();
        string promptIntegrador, promptVerificador, promptRedactor;
        (string Primera, string Ultima)? marcasRedactor;

        /// <param name="ahora">La hora con su zona: el registro usa el instante en UTC; los nombres de archivo, la hora local.</param>
        public Puerta(string carpetaDatos, Func<string> nuevoId, Func<DateTimeOffset> ahora, IReadOnlyList<string> activos, RolesElegidos roles, IReadOnlyList<string> poolOperadores)
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

        string Ahora() => reloj().UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

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
            var hechos = LeerRegistro().Hechos;
            var etapa = Dominio.EtapaDeRonda(hechos, rondaId, poolOperadores.Count);
            var sello = hechos.OfType<Sello>().Where(s => s.RondaId == rondaId).ToList();
            var c = Dominio.ClasificarLecturasPorEtapa(lecturas, l => l.Id, etapa, poolOperadores, roles.Integrador, roles.Verificador, roles.Redactor);

            if (c.ComoRespuesta.Count > 0) EscribirRespuestas(rondaId, c.ComoRespuesta, contexto);
            if (etapa == "investigacion")
            {
                foreach (var l in c.ComoRespuesta)
                    if (string.IsNullOrEmpty(l.Error) && l.Text.Length < RespuestaCorta)
                        EscribirErrorCaptura(rondaId, etapa, "respuesta", "respuesta sospechosamente corta: puede haber quedado fuera de la captura", l.Id);
            }

            // Un fallo al capturar una lectura nunca se adivina ni se descarta en silencio: queda como ErrorCaptura.
            foreach (var l in c.Operacion)
            {
                if (!string.IsNullOrEmpty(l.Error)) continue; // una lectura fallida no tiene salida que parsear
                try
                {
                    var validas = Dominio.EtiquetasValidasDelOperador(l.Id, poolOperadores, sello);
                    ProcesarSalidaOperador(rondaId, l.Id, promptOperador.TryGetValue(l.Id, out var p) ? p : PromptNoDisponible, l.Text, l.Html, validas, null);
                }
                catch (InvalidOperationException e)
                {
                    EscribirErrorCaptura(rondaId, etapa, "salida-operador", e.Message);
                }
            }

            void Rol(Lectura lectura, string tipo, string nombreRol, string id, Action<Lectura> escribir)
            {
                if (lectura == null) EscribirErrorCaptura(rondaId, etapa, tipo, $"el panel del {nombreRol} ({id}) no estaba abierto al capturar", id);
                else if (!string.IsNullOrEmpty(lectura.Error)) EscribirErrorCaptura(rondaId, etapa, tipo, lectura.Error, lectura.Id);
                else escribir(lectura);
            }
            if (etapa == "integracion")
                Rol(c.Integrador, "informe-integrador", "integrador", roles.Integrador, l => EscribirInformeIntegrador(rondaId, l.Id, promptIntegrador ?? PromptNoDisponible, l.Text, l.Html));
            if (etapa == "verificacion")
                Rol(c.Verificador, "salida-verificador", "verificador", roles.Verificador, l => EscribirSalidaVerificador(rondaId, l.Id, promptVerificador ?? PromptNoDisponible, l.Text, l.Html));
            if (etapa == "redaccion")
            {
                // Las marcas y el prompt pegados en este proceso, o los de la redacción anterior si la app se reinició.
                Rol(c.Redactor, "respuesta-redactor", "redactor", roles.Redactor, l =>
                {
                    var previo = hechos.OfType<RespuestaRedactor>().LastOrDefault(h => h.RondaId == rondaId);
                    var marcas = marcasRedactor ?? (!string.IsNullOrEmpty(previo?.MarcaPrimera) && !string.IsNullOrEmpty(previo?.MarcaUltima)
                        ? (previo.MarcaPrimera, previo.MarcaUltima)
                        : ((string, string)?)null);
                    Escribir(new RespuestaRedactor
                    {
                        Id = nuevoId(),
                        RondaId = rondaId,
                        RedactorId = l.Id,
                        PromptCompleto = promptRedactor ?? previo?.PromptCompleto ?? PromptNoDisponible,
                        TextoCrudo = l.Text,
                        Html = l.Html,
                        MarcaPrimera = marcas?.Item1,
                        MarcaUltima = marcas?.Item2,
                        RecibidaEn = Ahora(),
                    });
                });
            }
            return (etapa, AvisoPromptsDeCaptura(lecturas.Select(l => l.UserText), etapa));
        }

        /// <summary>La salida cruda de un operador y sus hallazgos derivados, contra las etiquetas que de verdad estaban en su cuerpo.</summary>
        List<HallazgoHecho> ProcesarSalidaOperador(string rondaId, string operadorId, string prompt, string salidaCruda, string html, IEnumerable<string> etiquetasValidas, CopiaDeSalida copiadaDe)
        {
            var salida = new SalidaOperador
            {
                Id = nuevoId(), RondaId = rondaId, OperadorId = operadorId, PromptCompleto = prompt, SalidaCruda = salidaCruda,
                RecibidaEn = Ahora(), Html = html, CopiadaDe = copiadaDe,
            };
            Escribir(salida);
            var parseo = Parseos.ParsearHallazgos(salidaCruda, etiquetasValidas);
            foreach (var h in parseo.Hallazgos)
            {
                h.Id = nuevoId();
                h.SalidaOperadorId = salida.Id;
                Escribir(h);
            }
            return parseo.Hallazgos;
        }

        void EscribirInformeIntegrador(string rondaId, string integradorId, string prompt, string informeCrudo, string html) =>
            Escribir(new InformeIntegrador
            {
                Id = nuevoId(), RondaId = rondaId, OperadorId = integradorId, PromptCompleto = prompt, InformeCrudo = informeCrudo,
                Titulo = TituloInforme.ExtraerTituloDelInforme(TextoDeHtml.TextoDelInformeIntegrador(informeCrudo, html)).Titulo,
                RecibidaEn = Ahora(), Html = html,
            });

        void EscribirSalidaVerificador(string rondaId, string verificadorId, string prompt, string salidaCruda, string html) =>
            Escribir(new SalidaVerificador
            {
                Id = nuevoId(), RondaId = rondaId, VerificadorId = verificadorId, PromptCompleto = prompt, SalidaCruda = salidaCruda, RecibidaEn = Ahora(), Html = html,
            });

        // ---------------------------------------------------------------- operación

        /// <summary>La ronda en curso con su pregunta y las últimas respuestas del pool; se niega con el motivo exacto si falta algo.</summary>
        (Ronda Ronda, string Pregunta, List<Respuesta> Respuestas, List<Cita> Citas) PrepararRonda()
        {
            if (ConversacionActual == null || RondaActual == null)
                throw new InvalidOperationException("no hay una ronda activa: captura las respuestas del pool antes de pegar la operación");
            var hechos = LeerRegistro().Hechos;
            var ronda = hechos.OfType<Ronda>().FirstOrDefault(r => r.Id == RondaActual) ?? throw new InvalidOperationException("no se encontró la ronda actual en el registro");
            var pregunta = Dominio.PreguntaEfectivaDeRonda(hechos, ronda)
                ?? throw new InvalidOperationException($"la ronda {ronda.Id} no tiene pregunta registrada: declárala antes de pegar la operación");
            var ultimas = new Dictionary<string, Respuesta>();
            foreach (var r in hechos.OfType<Respuesta>().Where(r => r.RondaId == ronda.Id && poolOperadores.Contains(r.ProveedorId))) ultimas[r.ProveedorId] = r;
            var faltantes = poolOperadores.Where(id => !ultimas.ContainsKey(id)).ToList();
            if (faltantes.Count > 0)
                throw new InvalidOperationException($"faltan respuestas capturadas en esta ronda: {string.Join(", ", faltantes)}. Usa \"Capturar\" antes de pegar la operación");
            return (ronda, pregunta, ultimas.Values.ToList(), hechos.OfType<Cita>().ToList());
        }

        /// <summary>
        /// Los cuerpos de todos los operadores, con la semilla persistida de la
        /// ronda: el barajado nunca se recalcula distinto. Sin semilla no hay
        /// barajado que reproducir, y simular uno inventaría un dato.
        /// </summary>
        CuerposPorOperador ArmarCuerposDeRonda(Ronda ronda, List<Respuesta> respuestas, List<Cita> citas)
        {
            if (ronda.Semilla == null)
                throw new InvalidOperationException($"ronda {ronda.Id} no tiene semilla persistida: no se puede armar un cuerpo anonimizado reproducible sobre una ronda sin semilla.");
            var porProveedor = new Dictionary<string, Respuesta>();
            foreach (var r in respuestas) porProveedor[r.ProveedorId] = r;
            var urlsPor = new Dictionary<string, List<string>>();
            foreach (var cita in citas)
            {
                if (!urlsPor.TryGetValue(cita.RespuestaId, out var lista)) urlsPor[cita.RespuestaId] = lista = new List<string>();
                lista.Add(cita.Url);
            }
            var paraOperar = poolOperadores.Select(id => new RespuestaParaOperar
            {
                ProveedorId = id,
                ReplyId = porProveedor[id].Id,
                AttemptId = porProveedor[id].Id,
                Texto = porProveedor[id].TextoOriginal,
                UrlsCitadas = urlsPor.TryGetValue(porProveedor[id].Id, out var urls) ? urls : new List<string>(),
            }).ToList();
            return Cuerpos.ArmarCuerposPorOperador(paraOperar, poolOperadores, Anonimizacion.HashSemilla(ronda.Semilla), nuevoId);
        }

        /// <summary>
        /// Idempotente respecto del Sello: la primera vez lo escribe; después lo
        /// compara con el recién calculado y, si discrepan, se niega sin escribir
        /// nada (dos órdenes para la misma ronda desanonimizarían mal el informe).
        /// </summary>
        CuerposPorOperador ArmarYPersistirCuerpos(Ronda ronda, List<Respuesta> respuestas, List<Cita> citas)
        {
            var resultado = ArmarCuerposDeRonda(ronda, respuestas, citas);
            var existente = LeerRegistro().Hechos.OfType<Sello>().Where(s => s.RondaId == ronda.Id).ToList();
            if (existente.Count > 0)
            {
                var motivo = DiscrepanciaDeSello(existente, resultado.Sello);
                if (motivo != null)
                    throw new InvalidOperationException(
                        $"el sello ya persistido para la ronda {ronda.Id} no coincide con el que se acaba de calcular ({motivo}) — " +
                        "posible cambio en las respuestas, la semilla o el orden del pool entre consolidaciones. No se escribió nada.");
                return resultado;
            }
            foreach (var s in resultado.Sello)
            {
                s.Id = nuevoId();
                s.RondaId = ronda.Id;
                Escribir(s);
            }
            return resultado;
        }

        static string DiscrepanciaDeSello(List<Sello> persistido, List<Sello> calculado)
        {
            if (persistido.Count != calculado.Count)
                return $"el sello persistido tiene {persistido.Count} entradas y el recién calculado tiene {calculado.Count}";
            var porLabel = new Dictionary<string, Sello>();
            foreach (var s in persistido) porLabel[s.Label] = s;
            foreach (var c in calculado)
            {
                if (!porLabel.TryGetValue(c.Label, out var p)) return $"el sello recién calculado tiene la etiqueta \"{c.Label}\", que no está en el persistido";
                if (p.CodigoEstable != c.CodigoEstable || p.PanelSourceId != c.PanelSourceId || p.ReplyId != c.ReplyId || p.AttemptId != c.AttemptId)
                    return $"la etiqueta \"{c.Label}\" no coincide: persistido {{codigoEstable:{p.CodigoEstable}, panelSourceId:{p.PanelSourceId}, " +
                        $"replyId:{p.ReplyId}, attemptId:{p.AttemptId}}} vs calculado {{codigoEstable:{c.CodigoEstable}, panelSourceId:{c.PanelSourceId}, " +
                        $"replyId:{c.ReplyId}, attemptId:{c.AttemptId}}}";
            }
            return null;
        }

        // "AAAA-MM-DD-HHMM" con la hora local, para los nombres de archivo que ve Juan.
        string SelloDeArchivo()
        {
            var t = reloj().DateTime;
            return string.Format(CultureInfo.InvariantCulture, "{0}-{1:D2}-{2:D2}-{3:D2}{4:D2}", t.Year, t.Month, t.Day, t.Hour, t.Minute);
        }

        /// <summary>
        /// La operación de un panel: pegada (el prompt entero con sus marcas
        /// intercaladas) o con archivo (el prompt sin cuerpo, y el cuerpo con sus
        /// marcas en un .txt para adjuntar). Escribe el sello la primera vez.
        /// </summary>
        public Operacion ArmarOperacion(string operadorId, bool conArchivo)
        {
            if (!poolOperadores.Contains(operadorId))
                throw new InvalidOperationException($"\"{Dominio.NombreProveedor(operadorId)}\" no es un operador del pool: no tiene cuerpo que operar");
            var p = PrepararRonda();
            var resultado = ArmarYPersistirCuerpos(p.Ronda, p.Respuestas, p.Citas);
            var cuerpo = resultado.Cuerpos.First(c => c.OperadorId == operadorId);
            var token = nuevoId();
            var marcaFin = $"[[CC-MARCA-FIN-{token}]]";
            if (conArchivo)
            {
                var codigo = resultado.Sello.First(s => s.PanelSourceId == operadorId).CodigoEstable;
                var (prompt, cuerpoArchivo) = Prompts.ArmarPromptOperacionConArchivo(p.Pregunta, cuerpo.RespuestasParaOperador);
                var (conMarcas, marcas) = Cuerpos.InsertarMarcasIntercaladas(cuerpoArchivo, token);
                marcas.Add(marcaFin);
                var archivo = $"{conMarcas}\n{marcaFin}\n";
                var nombre = $"operacion-{codigo}-{SelloDeArchivo()}.txt";
                return new Operacion
                {
                    OperadorId = operadorId, Texto = prompt, CuerpoArchivo = archivo, NombreArchivo = nombre, Marcas = marcas,
                    PromptCompleto = $"{prompt}\n\n=== ARCHIVO ADJUNTO: {nombre} ===\n{archivo}",
                };
            }
            // Las marcas van sobre el texto ENTERO; sin salto final, que cada editor trata distinto.
            var (texto, marcasPegado) = Cuerpos.InsertarMarcasIntercaladas(Prompts.ArmarPromptOperacion(p.Pregunta, cuerpo.RespuestasParaOperador), token);
            marcasPegado.Add(marcaFin);
            var completo = $"{texto}\n{marcaFin}";
            return new Operacion { OperadorId = operadorId, Texto = completo, Marcas = marcasPegado, PromptCompleto = completo };
        }

        /// <summary>Se llama cuando la operación quedó pegada en su panel: lo que ese operador devuelva se registra con este prompt.</summary>
        public void OperacionPegada(Operacion operacion) => promptOperador[operacion.OperadorId] = operacion.PromptCompleto;

        // ---------------------------------------------------------------- roles

        /// <summary>La tabla de hallazgos de la ronda tal como la ve el integrador: el verificador cita sus H##.</summary>
        (List<Hecho> Hechos, Ronda Ronda, string Pregunta, TablaHallazgos Tabla, string Prompt) TablaDeRonda(string rol)
        {
            if (ConversacionActual == null || RondaActual == null) throw new InvalidOperationException("no hay una ronda activa");
            var hechos = LeerRegistro().Hechos;
            var ronda = hechos.OfType<Ronda>().FirstOrDefault(r => r.Id == RondaActual) ?? throw new InvalidOperationException("no se encontró la ronda actual en el registro");
            if (ronda.Semilla == null) throw new InvalidOperationException("la ronda no tiene semilla persistida");
            var pregunta = Dominio.PreguntaEfectivaDeRonda(hechos, ronda)
                ?? throw new InvalidOperationException($"la ronda {ronda.Id} no tiene pregunta registrada válida: declárala antes de pegar el {rol}");
            var paraTabla = Dominio.SalidasVigentesDeRonda(hechos, ronda.Id).SelectMany(s => s.Hallazgos.Select(h => new HallazgoParaTabla
            {
                HallazgoIdOriginal = h.Id, Categoria = h.Categoria, Eje = h.Eje, Etiquetas = h.Etiquetas, Descripcion = h.Descripcion, OperadorIdOriginal = s.OperadorId,
            })).ToList();
            var tabla = Prompts.ArmarTablaHallazgos(paraTabla, poolOperadores, Anonimizacion.HashSemilla(ronda.Semilla));
            return (hechos, ronda, pregunta, tabla, Prompts.ArmarPromptIntegrador(pregunta, tabla.ParaPrompt));
        }

        public string ArmarPromptIntegrador() => TablaDeRonda("integrador").Prompt;

        public void IntegradorPegado(string prompt) => promptIntegrador = prompt;

        static readonly Regex ReferenciaH = new Regex(@"\[H[0-9]+\]");

        /// <summary>
        /// El prompt del verificador: la sección QUE CONVIENE RESCATAR del último
        /// informe del integrador, tal cual, y sólo los H## que esa sección cita,
        /// en orden de primera aparición. Un H## que no está en la tabla no se inventa.
        /// </summary>
        public string ArmarPromptVerificador()
        {
            var d = TablaDeRonda("verificador");
            var informe = Dominio.UltimoInformeIntegrador(d.Hechos, d.Ronda.Id) ?? throw new InvalidOperationException("la ronda todavía no tiene un informe del integrador capturado");
            var crudo = TextoDeHtml.TextoDelInformeIntegrador(informe.InformeCrudo, informe.Html);
            var rescate = TituloInforme.ExtraerSeccionRescate(TituloInforme.ExtraerTituloDelInforme(crudo).Cuerpo);
            if (rescate == null)
            {
                var inicio = Js.Trim(Blancos.Replace(crudo, " "));
                throw new InvalidOperationException($"el informe del integrador no tiene la seccion QUE CONVIENE RESCATAR. Se capturó (primeros 100 caracteres): \"{(inicio.Length > 100 ? inicio.Substring(0, 100) : inicio)}\"");
            }
            var ids = new List<string>();
            foreach (Match m in ReferenciaH.Matches(rescate))
            {
                var id = m.Value.Substring(1, m.Value.Length - 2);
                if (!ids.Contains(id)) ids.Add(id);
            }
            var porId = new Dictionary<string, HallazgoParaIntegrador>();
            foreach (var h in d.Tabla.ParaPrompt) porId[h.Id] = h;
            var hallazgos = ids.Where(porId.ContainsKey)
                .Select(id => new HallazgoParaVerificador { Id = id, Categoria = porId[id].Categoria, Eje = porId[id].Eje, Descripcion = porId[id].Descripcion })
                .ToList();
            return Prompts.ArmarPromptVerificador(d.Pregunta, rescate, hallazgos);
        }

        public void VerificadorPegado(string prompt) => promptVerificador = prompt;

        /// <summary>
        /// El archivo del redactor (informe, verificación, la tabla H## y las siete
        /// respuestas con sus P#, con marcas) y su prompt. Sin verificación se arma
        /// igual y se avisa: los botones no se bloquean por etapa.
        /// </summary>
        public ArchivoRedactor ArmarRedactor()
        {
            var d = TablaDeRonda("redactor");
            var informe = Dominio.UltimoInformeIntegrador(d.Hechos, d.Ronda.Id) ?? throw new InvalidOperationException("la ronda todavía no tiene un informe del integrador capturado");
            var verificacion = Dominio.UltimaSalidaVerificador(d.Hechos, d.Ronda.Id);
            var p = PrepararRonda();
            var material = new MaterialRedactor
            {
                Informe = TextoDeHtml.TextoDelInformeIntegrador(informe.InformeCrudo, informe.Html),
                Verificacion = verificacion == null ? null : TextoDeHtml.TextoDeLaSalidaVerificador(verificacion.SalidaCruda, verificacion.Html),
                Tabla = Prompts.TablaDe(d.Tabla.ParaPrompt),
                Respuestas = ArmarCuerposDeRonda(p.Ronda, p.Respuestas, p.Citas).RespuestasTodas,
            };
            var token = nuevoId();
            var (conMarcas, marcas) = Cuerpos.InsertarMarcasIntercaladas(Prompts.ArmarArchivoRedactor(material), token);
            var marcaFin = $"[[CC-MARCA-FIN-{token}]]";
            var archivo = $"{conMarcas}\n{marcaFin}\n";
            var nombre = $"redactor-{SelloDeArchivo()}.txt";
            var prompt = Prompts.ArmarPromptRedactor(d.Pregunta);
            return new ArchivoRedactor
            {
                Prompt = prompt, CuerpoArchivo = archivo, NombreArchivo = nombre,
                MarcaPrimera = marcas.Count > 0 ? marcas[0] : marcaFin, MarcaUltima = marcaFin,
                Aviso = verificacion == null ? "No hay verificación capturada en esta ronda: el archivo lo dice y el redactor trabaja sin ella." : null,
                PromptCompleto = $"{prompt}\n\n=== ARCHIVO ADJUNTO: {nombre} ===\n{archivo}",
            };
        }

        public void RedactorPegado(ArchivoRedactor archivo)
        {
            promptRedactor = archivo.PromptCompleto;
            marcasRedactor = (archivo.MarcaPrimera, archivo.MarcaUltima);
        }

        /// <summary>
        /// Recapturar el integrador o el verificador sin mirar la etapa: agrega un
        /// hecho, el registro no se reescribe, y todo usa el último de la ronda.
        /// </summary>
        public (bool Ok, string Mensaje) Recapturar(string rol, Lectura lectura)
        {
            if (ConversacionActual == null || RondaActual == null) return (false, "no hay una ronda activa");
            var hechos = LeerRegistro().Hechos;
            if (rol == "integrador")
            {
                var previos = hechos.OfType<InformeIntegrador>().Where(h => h.RondaId == RondaActual).ToList();
                if (previos.Count == 0) return (false, "No hay un informe de integrador en esta ronda todavía. Usa \"Pegar integrador\".");
                EscribirInformeIntegrador(RondaActual, lectura.Id, promptIntegrador ?? previos[previos.Count - 1].PromptCompleto, lectura.Text, lectura.Html);
                return (true, Recapturado(lectura, rol, previos.Count));
            }
            if (rol == "verificador")
            {
                var previos = hechos.OfType<SalidaVerificador>().Where(h => h.RondaId == RondaActual).ToList();
                if (previos.Count == 0) return (false, "No hay una verificación en esta ronda todavía. Usa \"Pegar verificación\".");
                EscribirSalidaVerificador(RondaActual, lectura.Id, promptVerificador ?? previos[previos.Count - 1].PromptCompleto, lectura.Text, lectura.Html);
                return (true, Recapturado(lectura, rol, previos.Count));
            }
            throw new ArgumentException($"no se recaptura el rol \"{rol}\"", nameof(rol));
        }

        static string Recapturado(Lectura lectura, string rol, int previos) =>
            $"{Dominio.NombreProveedor(lectura.Id)}: {rol} recapturado, {lectura.Text.Length} caracteres ({previos + 1} en el registro; se usa el último)";

        static string Corto(string id) => id.Length > 8 ? id.Substring(0, 8) : id;

        /// <summary>
        /// Una ronda nueva con la misma pregunta y la última respuesta de cada
        /// proveedor del pool, copiada y marcada copiadaDe (con sus citas vueltas a
        /// derivar del mismo html). Lo que haya que corregir se recaptura después: la
        /// última gana. La ronda anterior queda intacta. La confirmación es de la interfaz.
        /// </summary>
        public string RondaNuevaConRespuestasCopiadas()
        {
            if (ConversacionActual == null || RondaActual == null) return "No hay una ronda activa de la que copiar.";
            var hechos = LeerRegistro().Hechos;
            var anterior = hechos.OfType<Ronda>().FirstOrDefault(r => r.Id == RondaActual);
            if (anterior == null) return "No se encontró la ronda activa en el registro.";
            var pregunta = Dominio.PreguntaEfectivaDeRonda(hechos, anterior);
            if (pregunta == null) return "La ronda activa no tiene una pregunta registrada válida: no se puede repetir.";
            var ultimas = new Dictionary<string, Respuesta>();
            foreach (var r in hechos.OfType<Respuesta>().Where(r => r.RondaId == anterior.Id && poolOperadores.Contains(r.ProveedorId))) ultimas[r.ProveedorId] = r;
            if (ultimas.Count == 0) return "La ronda activa no tiene respuestas del pool para copiar.";

            var nueva = AbrirRonda(pregunta);
            foreach (var r in ultimas.Values)
            {
                var copia = new Respuesta
                {
                    Id = nuevoId(), RondaId = nueva, ProveedorId = r.ProveedorId, TextoOriginal = r.TextoOriginal, LeidaEn = r.LeidaEn, Error = r.Error,
                    Procedencia = r.Procedencia, PromptUsuarioLeido = r.PromptUsuarioLeido, PromptCoincideEnPool = r.PromptCoincideEnPool,
                    FuentesHref = r.FuentesHref, Html = r.Html, CopiadaDe = new CopiaDeRespuesta { RondaId = r.RondaId, RespuestaId = r.Id },
                };
                Escribir(copia);
                if (copia.Html != null)
                    foreach (var cita in Citas.ExtraerCitas(copia.Html, copia.Id, nuevoId).Citas) Escribir(cita);
            }
            promptOperador.Clear();
            promptIntegrador = promptVerificador = promptRedactor = null;
            marcasRedactor = null;
            return $"Ronda nueva abierta ({Corto(nueva)}) con {ultimas.Count} respuestas copiadas de la ronda {Corto(anterior.Id)}. Recaptura con \"Capturar este panel\" lo que quieras corregir.";
        }

        /// <summary>
        /// Reutilizar la operación de un operador desde la ronda de la que se
        /// copiaron las respuestas. Sólo vale si todo lo que ese operador lee (el pool
        /// menos la suya) son copias sin cambios; si no, tiene que operar de nuevo.
        /// Los hallazgos se vuelven a derivar contra el sello de esta ronda.
        /// </summary>
        public (bool Ok, string Mensaje) ReutilizarOperacion(string operadorId)
        {
            if (ConversacionActual == null || RondaActual == null) return (false, "no hay una ronda activa");
            var nombre = Dominio.NombreProveedor(operadorId);
            if (!poolOperadores.Contains(operadorId)) return (false, $"\"{nombre}\" no es un operador del pool.");
            var hechos = LeerRegistro().Hechos;
            var sello = hechos.OfType<Sello>().Where(s => s.RondaId == RondaActual).ToList();
            if (sello.Count == 0) return (false, "Esta ronda todavía no tiene sello: pega primero la operación en algún panel (\"Pegar operación en este panel\").");
            var vigentes = new Dictionary<string, Respuesta>();
            foreach (var r in hechos.OfType<Respuesta>().Where(r => r.RondaId == RondaActual)) vigentes[r.ProveedorId] = r;
            var leidas = poolOperadores.Where(id => id != operadorId).ToList();
            var cambiadas = leidas.Where(id => !(vigentes.TryGetValue(id, out var r) && r.CopiadaDe != null)).ToList();
            if (cambiadas.Count > 0)
                return (false, $"No se puede reutilizar: {nombre} lee respuestas que cambiaron en esta ronda ({string.Join(", ", cambiadas.Select(Dominio.NombreProveedor))}). Tiene que operar de nuevo.");
            var origenes = leidas.Select(id => vigentes[id].CopiadaDe.RondaId).Distinct().ToList();
            if (origenes.Count != 1) return (false, $"Las respuestas copiadas vienen de {origenes.Count} rondas distintas: no hay una operación anterior equivalente.");
            var origen = origenes[0];
            var vieja = hechos.OfType<SalidaOperador>().LastOrDefault(h => h.RondaId == origen && h.OperadorId == operadorId);
            if (vieja == null) return (false, $"No hay una operación de {nombre} en la ronda {Corto(origen)}.");
            var hallazgos = ProcesarSalidaOperador(RondaActual, operadorId, vieja.PromptCompleto, vieja.SalidaCruda, vieja.Html,
                Dominio.EtiquetasValidasDelOperador(operadorId, poolOperadores, sello), new CopiaDeSalida { RondaId = origen, SalidaOperadorId = vieja.Id });
            int invalidas = hallazgos.Count(h => h.EtiquetaInvalida);
            return (true, $"{nombre}: se reutilizó su operación de la ronda {Corto(origen)} ({hallazgos.Count} hallazgos{(invalidas > 0 ? $", {invalidas} con etiqueta inválida" : "")}). No hace falta pegarle la operación de nuevo.");
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
