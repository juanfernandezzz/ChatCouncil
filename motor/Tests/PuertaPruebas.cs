using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace ChatCouncil.Motor.Pruebas
{
    public class PuertaPruebas
    {
        string carpeta;

        [SetUp]
        public void CrearCarpeta()
        {
            carpeta = Path.Combine(Path.GetTempPath(), "cc-puerta-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(carpeta);
        }

        [TearDown]
        public void BorrarCarpeta() => Directory.Delete(carpeta, true);

        // Ids y reloj fijos, como los que fija el script de referencias: 09:00 a −3 h son
        // las 12:00 UTC del registro y la hora local de los nombres de archivo, en cualquier máquina.
        Puerta NuevaPuerta()
        {
            int n = 0;
            return new Puerta(carpeta, () => $"00000000-0000-4000-8000-{++n:D12}", () => new DateTimeOffset(2026, 10, 6, 9, 0, 0, TimeSpan.FromHours(-3)),
                Referencias.Conocidos, new RolesElegidos("deepseek", "glm", "qwen", "deepseek"), Referencias.PoolPuerta);
        }

        static (string, string) Confirmada(string _) => ("confirmada", null);

        // Una ronda entera con las corridas del BLUEPRINT: 7 cuerpos y 7 sellos; un informe
        // corto más una recaptura dan 2 hechos y gana el último; en la ronda nueva con las
        // respuestas copiadas, kimi se reutiliza y chatgpt se rechaza.
        // El puerto HTTP falso del script de referencias: 200, 404, HEAD rechazado y un host que no resuelve.
        sealed class HttpFalso : IHttp
        {
            public int Pedidos;

            public Task<int> Pedir(string url, string metodo, CancellationToken cancelar)
            {
                Pedidos++;
                if (url.Contains("x.invalid")) throw new HttpRequestException("ENOTFOUND");
                if (url.Contains("404")) return Task.FromResult(404);
                if (url.Contains("sin-head")) return Task.FromResult(metodo == "HEAD" ? 405 : 200);
                return Task.FromResult(200);
            }
        }

        // Guarda los PDF pedidos; si se le dice, falla en uno.
        sealed class PdfFalso : IPdf
        {
            public readonly List<(string Ruta, string Titulo)> Pedidos = new List<(string, string)>();
            public string FallarEn;

            public Task Generar(string markdown, string rutaPdf, string titulo)
            {
                Pedidos.Add((rutaPdf, titulo));
                if (FallarEn != null && rutaPdf.Contains(FallarEn)) throw new InvalidOperationException("la impresora de prueba falló");
                File.WriteAllText(rutaPdf, "%PDF falso");
                return Task.CompletedTask;
            }
        }

        // Medido en la ronda real de Juan (2026-10-22): seis capturas de chatgpt en 0 caracteres quedaron como
        // respuestas con error y la investigación se cerró con 6 de 7. Una captura inválida no completa a nadie.
        [Test]
        public void UnaCapturaConErrorNoCierraLaInvestigacion()
        {
            var puerta = NuevaPuerta();
            var lotes = (JObject)JsonEstricto.Leer(Referencias.LotesOperacion);
            var lecturas = lotes["investigacion"].ToObject<List<Lectura>>();
            var vacia = lecturas.First(l => l.Id == "chatgpt");
            var original = vacia.Text;
            vacia.Text = "";
            puerta.AbrirRonda(Referencias.PreguntaOperacion);
            puerta.RegistrarCapturas(lecturas, Confirmada);
            Assert.That(puerta.PasoSiguiente().Etapa, Is.EqualTo("investigacion"));
            Assert.That(puerta.PasoSiguiente().Accion, Is.EqualTo("capturar"));
            Assert.That(puerta.EstadoDePanel("chatgpt", null, null), Is.EqualTo("con-problema"));

            vacia.Text = original;
            puerta.RegistrarCapturas(new List<Lectura> { vacia }, Confirmada);
            Assert.That(puerta.PasoSiguiente().Etapa, Is.EqualTo("operacion"), "con la recaptura válida, la investigación sí se cierra");
        }

        [Test]
        public async Task UnaRondaEnteraDejaLosMismosHechosQueElTypeScript()
        {
            var puerta = NuevaPuerta();
            var lotes = (JObject)JsonEstricto.Leer(Referencias.LotesOperacion);
            List<Lectura> Lote(string nombre) => lotes[nombre].ToObject<List<Lectura>>();
            var pasos = new List<string> { puerta.PasoSiguiente().Accion };
            void Paso() => pasos.Add(puerta.PasoSiguiente().Accion);

            puerta.AbrirRonda(Referencias.PreguntaOperacion);
            Paso();
            puerta.RegistrarCapturas(Lote("investigacion"), Confirmada);
            Paso();
            string archivoKimi = null;
            foreach (var op in Referencias.PoolPuerta)
            {
                var operacion = puerta.ArmarOperacion(op, conArchivo: op == "kimi");
                puerta.OperacionPegada(operacion);
                if (op == "kimi") archivoKimi = operacion.NombreArchivo;
            }
            Paso();
            Assert.That(puerta.EstadoDePanel("chatgpt", null, null), Is.EqualTo("pegado-falta-enviar"));
            Assert.That(puerta.EstadoDePanel("chatgpt", true, null), Is.EqualTo("respondiendo"));
            Assert.That(puerta.EstadoDePanel("chatgpt", false, "deducido"), Is.EqualTo("parece-terminado-deducido"));
            puerta.RegistrarCapturas(Lote("operadores1"), Confirmada);
            Paso();
            Assert.That(puerta.EstadoDePanel("chatgpt", false, "observado"), Is.EqualTo("capturado"));
            Assert.That(puerta.EstadoDePanel("claude", false, "observado"), Is.EqualTo("parece-terminado-observado"));
            puerta.RegistrarCapturas(Lote("operadores2"), Confirmada);
            Paso();
            puerta.IntegradorPegado(puerta.ArmarPromptIntegrador());
            Paso();
            puerta.RegistrarCapturas(Lote("integradorCorto"), Confirmada);
            Paso();
            var recaptura = puerta.Recapturar("integrador", lotes["integradorCompleto"].ToObject<Lectura>());
            puerta.VerificadorPegado(puerta.ArmarPromptVerificador());
            Paso();
            puerta.RegistrarCapturas(Lote("verificador"), Confirmada);
            Paso();
            var redactor = puerta.ArmarRedactor();
            puerta.RedactorPegado(redactor);
            Paso();
            puerta.RegistrarCapturas(new List<Lectura> { JsonEstricto.Leer(Referencias.LecturaRedactorOperacion).ToObject<Lectura>() }, Confirmada);
            Paso();
            var primeraRonda = puerta.RondaActual;

            // T11: las URLs una sola vez por verificación, y el informe con su carpeta.
            var http = new HttpFalso();
            var urls = await puerta.ComprobarUrls(http);
            int pedidos = http.Pedidos;
            var segunda = await puerta.ComprobarUrls(http);
            var pdf = new PdfFalso();
            var informe = await puerta.ArmarInforme(http, pdf);
            // D62: las de cada verificación, la del verificador 1 (glm) primero; a.org se comprueba en las dos.
            Assert.That(urls.Urls.Select(u => (u.Url, u.Codigo, u.Detalle)), Is.EqualTo(new[]
            {
                ("https://a.org", (int?)200, (string)null), ("https://x.invalid/p", null, "ENOTFOUND"),
                ("https://b.org/404", 404, null), ("https://c.org/sin-head", 200, null),
                ("https://a.org", 200, null), ("https://d.org/otra", 200, null),
            }));
            // D62 (revisada): las dos verificaciones, sin nombre, como A y B; la clave queda con la respuesta del redactor.
            Assert.That(redactor.CuerpoArchivo, Does.Contain("Reviso.").And.Contain("Verifico por mi cuenta.")
                .And.Contain("===== VERIFICACION A =====").And.Contain("===== VERIFICACION B ====="), "el redactor recibe las dos verificaciones");
            Assert.That(redactor.SelloVerificaciones.Select(s => s.VerificadorId), Is.EquivalentTo(new[] { "glm", "qwen" }));
            Assert.That(urls.Urls, Has.Count.EqualTo(Referencias.UrlsComprobadas));
            Assert.That(segunda.YaComprobadas, Is.EqualTo(Referencias.SegundaComprobacionSinRed));
            Assert.That(http.Pedidos, Is.EqualTo(pedidos), "la segunda comprobación y el informe no salen a la red");
            var carpetaInforme = Path.Combine(carpeta, "informes", Referencias.NombreBaseInforme);
            Assert.That(informe.Ok && informe.Completo, Is.True, informe.Mensaje);
            Assert.That(File.ReadAllText(Path.Combine(carpetaInforme, Referencias.NombreBaseInforme + ".md")), Is.EqualTo(Referencias.InformeDeRonda));
            foreach (var (archivo, titulo, markdown) in Referencias.RespuestasDeCarpeta)
            {
                Assert.That(File.ReadAllText(Path.Combine(carpetaInforme, InformeFinal.SubcarpetaRespuestas, archivo + ".md")), Is.EqualTo(markdown), archivo);
                Assert.That(pdf.Pedidos, Does.Contain((Path.Combine(carpetaInforme, InformeFinal.SubcarpetaRespuestas, archivo + ".pdf"), titulo)));
            }
            // El motor no abre nada (D41): la carpeta la abre la interfaz.
            Assert.That(informe.Mensaje, Is.EqualTo($"Carpeta del informe: {carpetaInforme}. El informe está en .md y en PDF. 7 respuestas de investigador, cada una en .md y en PDF."));
            // Armado el informe, el paso es abrir su carpeta, no armar otro.
            Paso();
            Assert.That(puerta.CarpetaInformeArmado, Is.EqualTo(carpetaInforme));

            Assert.That(pasos, Is.EqualTo(new[]
            {
                "pegar-pregunta", "capturar", "pegar-operacion", "capturar", "capturar", "pegar-integrador", "capturar",
                "pegar-verificacion", "capturar", "pegar-redactor", "capturar", "armar-informe", "abrir-carpeta",
            }));
            puerta.RondaNuevaConRespuestasCopiadas();
            puerta.RegistrarCapturas(Lote("kimiNueva"), Confirmada);
            puerta.OperacionPegada(puerta.ArmarOperacion("chatgpt", conArchivo: false));
            var reusoKimi = puerta.ReutilizarOperacion("kimi");
            var reusoChatgpt = puerta.ReutilizarOperacion("chatgpt");

            Assert.That(Lineas(puerta), Is.EqualTo(Referencias.CorridaOperacionLineas));
            Assert.That(archivoKimi, Is.EqualTo(Referencias.ArchivoKimi));
            Assert.That(redactor.NombreArchivo, Is.EqualTo(Referencias.ArchivoRedactor));
            Assert.That(recaptura, Is.EqualTo((true, Referencias.MensajeRecaptura)));
            Assert.That(reusoKimi, Is.EqualTo((Referencias.ReusoKimiOk, Referencias.MensajeReusoKimi)));
            Assert.That(reusoChatgpt, Is.EqualTo((Referencias.ReusoChatgptOk, Referencias.MensajeReusoChatgpt)));

            var hechos = puerta.LeerRegistro().Hechos;
            Assert.That(hechos.OfType<Sello>().Count(s => s.RondaId == primeraRonda), Is.EqualTo(7));
            Assert.That(hechos.OfType<InformeIntegrador>().Count(), Is.EqualTo(2));
            Assert.That(Dominio.UltimoInformeIntegrador(hechos, primeraRonda).Titulo, Is.EqualTo("La dosis"));
        }

        // El sello se escribe la primera vez; si después cambia una respuesta, la operación se niega y no escribe nada.
        [Test]
        public void ConElSelloYaEscritoUnaRespuestaDistintaHaceQueLaOperacionSeNiegue()
        {
            var puerta = NuevaPuerta();
            puerta.AbrirRonda("¿Pregunta?");
            puerta.RegistrarCapturas(((JObject)JsonEstricto.Leer(Referencias.LotesOperacion))["investigacion"].ToObject<List<Lectura>>(), Confirmada);
            puerta.ArmarOperacion("chatgpt", conArchivo: false);
            puerta.ArmarOperacion("gemini", conArchivo: true);
            Assert.That(puerta.LeerRegistro().Hechos.OfType<Sello>().Count(), Is.EqualTo(7));

            Registro.Agregar(carpeta, puerta.ConversacionActual, new Respuesta
            {
                Id = "corregida", RondaId = puerta.RondaActual, ProveedorId = "kimi", TextoOriginal = "otra", LeidaEn = "x", Procedencia = new Procedencia(),
            });
            int antes = Lineas(puerta).Count;
            Assert.That(() => puerta.ArmarOperacion("chatgpt", conArchivo: false),
                Throws.InvalidOperationException.With.Message.StartsWith("el sello ya persistido para la ronda").And.Message.EndsWith("No se escribió nada."));
            Assert.That(Lineas(puerta).Count, Is.EqualTo(antes));
        }

        // Un puerto que nunca contesta: sólo lo corta el tiempo.
        sealed class HttpMudo : IHttp
        {
            public async Task<int> Pedir(string url, string metodo, CancellationToken cancelar)
            {
                await Task.Delay(Timeout.Infinite, cancelar);
                return 0;
            }
        }

        [Test]
        public async Task CadaUrlSeComprueba()
        {
            var http = new HttpFalso();
            Assert.That(await Puerta.ComprobarUrl("https://a.org", http, TimeSpan.FromSeconds(10)), Is.EqualTo(((int?)200, (string)null)));
            Assert.That(await Puerta.ComprobarUrl("https://b.org/404", http, TimeSpan.FromSeconds(10)), Is.EqualTo(((int?)404, (string)null)));
            Assert.That(await Puerta.ComprobarUrl("https://c.org/sin-head", http, TimeSpan.FromSeconds(10)), Is.EqualTo(((int?)200, (string)null)));
            Assert.That(await Puerta.ComprobarUrl("https://x.invalid/p", http, TimeSpan.FromSeconds(10)), Is.EqualTo(((int?)null, "ENOTFOUND")));
            Assert.That(await Puerta.ComprobarUrl("https://lenta.org", new HttpMudo(), TimeSpan.FromMilliseconds(50)), Is.EqualTo(((int?)null, "sin respuesta en 0.05 s")));
        }

        // T24: las URLs las escribe el verificador, que es un modelo. Pedirlas a la máquina o a la red local las expone
        // a lo que el modelo escriba; tampoco se sigue un esquema que no sea http o https. Ninguna sale a la red.
        [Test]
        public async Task LasUrlsLocalesOConOtroEsquemaNoSePiden()
        {
            const string local = "es una dirección local o de la red privada: no se comprueba";
            const string esquema = "solo se comprueban direcciones http y https";
            var http = new HttpFalso();
            foreach (var url in new[]
            {
                "http://localhost:8080/x", "http://sub.localhost/", "http://127.0.0.1/", "http://127.8.9.10/", "http://0.0.0.0/",
                "http://10.1.2.3/", "http://172.16.0.1/", "http://172.31.255.255/", "http://192.168.1.1/", "http://169.254.169.254/latest/meta-data",
                "http://100.64.0.1/", "http://[::1]/", "http://[::]/", "http://[fe80::1]/", "http://[fc00::1]/", "http://[fd12:3456::1]/",
                "http://[::ffff:127.0.0.1]/", "http://[::ffff:192.168.0.1]/", "http://0x7f.0.0.1/", "http://2130706433/", "http://017700000001/",
                "http://intranet/", "http://impresora.local/", "HTTP://LOCALHOST/", "http://255.255.255.255/", "http://224.0.0.1/",
                "http://239.255.255.250:1900/", "http://[ff02::1]/", "http://nas.lan/", "http://router.home.arpa/", "http://api.internal/",
            })
                Assert.That(await Puerta.ComprobarUrl(url, http, TimeSpan.FromSeconds(10)), Is.EqualTo(((int?)null, local)), url);
            foreach (var url in new[] { "file:///C:/Windows/win.ini", "ftp://a.org/x", "javascript:alert(1)", "data:text/plain,hola", "a.org/sin-esquema", "" })
                Assert.That(await Puerta.ComprobarUrl(url, http, TimeSpan.FromSeconds(10)), Is.EqualTo(((int?)null, esquema)), url);
            Assert.That(http.Pedidos, Is.EqualTo(0));
            foreach (var url in new[] { "https://a.org", "http://172.32.0.1/", "http://11.0.0.1/", "http://[2606:4700::1111]/", "HTTPS://A.ORG/x" })
                Assert.That(await Puerta.ComprobarUrl(url, http, TimeSpan.FromSeconds(10)), Is.EqualTo(((int?)200, (string)null)), url);
        }

        // Una respuesta que no llega a PDF tiene que quedar nombrada en la carpeta: si no, se lee como que ese proveedor no participó.
        [Test]
        public async Task SiFallaElPdfDeUnaRespuestaLasDemasSeEscribenYFaltanLaNombra()
        {
            var puerta = NuevaPuerta();
            puerta.AbrirRonda("¿Pregunta de prueba?");
            puerta.RegistrarCapturas(((JObject)JsonEstricto.Leer(Referencias.LotesOperacion))["investigacion"].ToObject<List<Lectura>>(), Confirmada);
            var pdf = new PdfFalso { FallarEn = "4 - Grok.pdf" };
            var r = await puerta.ArmarInforme(new HttpFalso(), pdf);
            var respuestas = Path.Combine(r.Ruta, InformeFinal.SubcarpetaRespuestas);
            Assert.That(Directory.GetFiles(respuestas, "*.md"), Has.Length.EqualTo(7));
            Assert.That(Directory.GetFiles(respuestas, "*.pdf"), Has.Length.EqualTo(6));
            Assert.That(File.ReadAllText(Path.Combine(respuestas, "FALTAN - respuestas sin PDF.txt")), Does.Contain("- 4 - Grok: no se pudo generar el PDF (la impresora de prueba falló)"));
            Assert.That(r.Mensaje, Does.EndWith("6 de 7 respuestas completas; 1 con archivos faltantes (nombrados en \"FALTAN - respuestas sin PDF.txt\")."));
            Assert.That(r.Completo, Is.False, "un informe con archivos faltantes no está completo");
        }

        // D47: medido en T22, una carpeta de datos honda y un título largo dejaban rutas de 260 caracteres o más, y
        // Windows no las escribe (MAX_PATH): faltaban PDF y la nota que los nombra. El título se acorta para que entren.
        [Test]
        public async Task NingunaRutaDelInformePasaDe259Caracteres()
        {
            var raiz = carpeta;
            carpeta = Path.Combine(raiz, new string('d', 150 - raiz.Length));
            Directory.CreateDirectory(carpeta);
            try
            {
                var puerta = NuevaPuerta();
                puerta.AbrirRonda("¿Cuáles investigaciones longitudinales comparables documentan efectos persistentes?");
                puerta.RegistrarCapturas(((JObject)JsonEstricto.Leer(Referencias.LotesOperacion))["investigacion"].ToObject<List<Lectura>>(), Confirmada);
                var r = await puerta.ArmarInforme(new HttpFalso(), new PdfFalso());
                var rutas = Directory.GetFiles(Path.Combine(carpeta, "informes"), "*", SearchOption.AllDirectories);
                Assert.That(r.Ok && r.Completo, Is.True, r.Mensaje);
                Assert.That(rutas, Has.Length.EqualTo(16));
                Assert.That(rutas.Max(x => x.Length), Is.LessThanOrEqualTo(259), rutas.OrderByDescending(x => x.Length).First());
                Assert.That(Path.GetFileName(r.Ruta), Does.StartWith("2026-10-06 0900 - ¿Cuáles"), "el título se acorta, no se pierde");
            }
            finally
            {
                carpeta = raiz;
            }
        }

        // T23 (D12): las rondas de este aparato, la más nueva primero, con su fecha, su pregunta, la etapa a la
        // que llegaron y la carpeta de su informe (por la línea "Ronda: <id>" del .md); sin las de prueba.
        [Test]
        public async Task LasRondasAnterioresSalenDelRegistroConSuInforme()
        {
            var puerta = NuevaPuerta();
            Assert.That(puerta.RondasAnteriores(), Is.Empty);
            puerta.AbrirRonda("¿Primera pregunta?");
            puerta.RegistrarCapturas(((JObject)JsonEstricto.Leer(Referencias.LotesOperacion))["investigacion"].ToObject<List<Lectura>>(), Confirmada);
            var primera = puerta.RondaActual;
            var informe = await puerta.ArmarInforme(new HttpFalso(), new PdfFalso());
            puerta.AbandonarRonda();
            puerta.AbrirRonda("¿Segunda pregunta?");
            Registro.Agregar(carpeta, "prueba", new Conversacion { Id = "prueba", CreadaEn = "2026-10-06T12:00:00.000Z", EsPrueba = true });
            Registro.Agregar(carpeta, "prueba", new Ronda { Id = "r-prueba", ConversacionId = "prueba", Indice = 0, Prompt = "no va", EnviadaEn = "2026-10-06T12:00:00.000Z" });

            var rondas = puerta.RondasAnteriores();
            Assert.That(rondas.Select(r => (r.RondaId, r.Pregunta, r.Etapa, r.CarpetaInforme)), Is.EqualTo(new[]
            {
                (puerta.RondaActual, "¿Segunda pregunta?", "investigacion", (string)null),
                (primera, "¿Primera pregunta?", "investigacion", informe.Ruta),
            }));
            Assert.That(rondas[1].EnviadaEn, Is.EqualTo("2026-10-06T12:00:00.000Z"));
        }

        // T24: un archivo que no se puede leer (otro programa lo tiene abierto) no rompe el historial: se salta, como
        // en RestaurarRondaActiva, y las demás rondas salen igual. Lo mismo con el .md de un informe.
        [Test]
        public async Task UnArchivoIlegibleNoRompeElHistorial()
        {
            var puerta = NuevaPuerta();
            puerta.AbrirRonda("¿Primera pregunta?");
            puerta.RegistrarCapturas(((JObject)JsonEstricto.Leer(Referencias.LotesOperacion))["investigacion"].ToObject<List<Lectura>>(), Confirmada);
            var informe = await puerta.ArmarInforme(new HttpFalso(), new PdfFalso());
            var primera = puerta.RondaActual;
            var archivoPrimera = Registro.RutaArchivo(carpeta, puerta.ConversacionActual);
            Registro.Agregar(carpeta, "otra", new Conversacion { Id = "otra", CreadaEn = "2026-10-07T12:00:00.000Z" });
            Registro.Agregar(carpeta, "otra", new Ronda { Id = "r-otra", ConversacionId = "otra", Indice = 0, Prompt = "¿Otra?", EnviadaEn = "2026-10-07T12:00:00.000Z" });

            var md = Directory.GetFiles(informe.Ruta, "*.md").Single();
            using (new FileStream(md, FileMode.Open, FileAccess.Read, FileShare.None))
                Assert.That(puerta.RondasAnteriores().Select(r => (r.RondaId, r.CarpetaInforme)), Is.EqualTo(new[] { ("r-otra", (string)null), (primera, (string)null) }));
            using (new FileStream(archivoPrimera, FileMode.Open, FileAccess.Read, FileShare.None))
                Assert.That(puerta.RondasAnteriores().Select(r => r.RondaId), Is.EqualTo(new[] { "r-otra" }));
            // Un editor que guarda el .md con CRLF no lo separa de su ronda.
            File.WriteAllText(md, File.ReadAllText(md).Replace("\n", "\r\n"));
            Assert.That(puerta.RondasAnteriores().Single(r => r.RondaId == primera).CarpetaInforme, Is.EqualTo(informe.Ruta));
        }

        // T22: en las etapas de los roles, un operador que ya operó y un rol cuya etapa pasó están capturados;
        // el rol de la etapa sigue su propio estado (aunque el redactor sea el mismo integrador).
        [Test]
        public void EnLasEtapasDeLosRolesLoYaCapturadoSigueCapturado()
        {
            var puerta = NuevaPuerta();
            var lotes = (JObject)JsonEstricto.Leer(Referencias.LotesOperacion);
            List<Lectura> Lote(string nombre) => lotes[nombre].ToObject<List<Lectura>>();
            puerta.AbrirRonda(Referencias.PreguntaOperacion);
            puerta.RegistrarCapturas(Lote("investigacion"), Confirmada);
            foreach (var op in Referencias.PoolPuerta) puerta.OperacionPegada(puerta.ArmarOperacion(op, conArchivo: false));
            puerta.RegistrarCapturas(Lote("operadores1"), Confirmada);
            puerta.RegistrarCapturas(Lote("operadores2"), Confirmada);
            Assert.That(puerta.PasoSiguiente().Etapa, Is.EqualTo("integracion"));
            Assert.That(puerta.EstadoDePanel("chatgpt", null, null), Is.EqualTo("capturado"));
            Assert.That(puerta.EstadoDePanel("deepseek", null, null), Is.EqualTo("por-pegar"));
            Assert.That(puerta.EstadoDePanel("glm", null, null), Is.EqualTo("por-pegar"));

            puerta.IntegradorPegado(puerta.ArmarPromptIntegrador());
            Assert.That(puerta.EstadoDePanel("deepseek", false, "observado"), Is.EqualTo("parece-terminado-observado"));
            puerta.RegistrarCapturas(new List<Lectura> { lotes["integradorCompleto"].ToObject<Lectura>() }, Confirmada);
            Assert.That(puerta.PasoSiguiente().Etapa, Is.EqualTo("verificacion"));
            Assert.That(puerta.EstadoDePanel("chatgpt", null, null), Is.EqualTo("capturado"));
            Assert.That(puerta.EstadoDePanel("glm", null, null), Is.EqualTo("por-pegar"));
            Assert.That(puerta.EstadoDePanel("deepseek", null, null), Is.EqualTo("capturado"));

            puerta.VerificadorPegado(puerta.ArmarPromptVerificador());
            puerta.RegistrarCapturas(Lote("verificador"), Confirmada);
            Assert.That(puerta.PasoSiguiente().Etapa, Is.EqualTo("redaccion"));
            Assert.That(puerta.EstadoDePanel("glm", null, null), Is.EqualTo("capturado"));
            Assert.That(puerta.EstadoDePanel("deepseek", null, null), Is.EqualTo("por-pegar"), "el redactor es el integrador: su etapa vuelve a empezar");

            puerta.RedactorPegado(puerta.ArmarRedactor());
            puerta.RegistrarCapturas(new List<Lectura> { JsonEstricto.Leer(Referencias.LecturaRedactorOperacion).ToObject<Lectura>() }, Confirmada);
            Assert.That(puerta.PasoSiguiente().Etapa, Is.EqualTo("informe"));
            Assert.That(puerta.EstadoDePanel("deepseek", null, null), Is.EqualTo("capturado"));
            Assert.That(puerta.EstadoDePanel("chatgpt", null, null), Is.EqualTo("capturado"));
        }

        // T22: una recaptura que falla o queda bajo el umbral no reemplaza al informe bueno: queda como ErrorCaptura
        // (recapturarRol de Electron), y el último informe sigue siendo el anterior.
        [Test]
        public void UnaRecapturaFallidaQuedaComoErrorYNoReemplaza()
        {
            var puerta = NuevaPuerta();
            var lotes = (JObject)JsonEstricto.Leer(Referencias.LotesOperacion);
            List<Lectura> Lote(string nombre) => lotes[nombre].ToObject<List<Lectura>>();
            puerta.AbrirRonda(Referencias.PreguntaOperacion);
            puerta.RegistrarCapturas(Lote("investigacion"), Confirmada);
            foreach (var op in Referencias.PoolPuerta) puerta.OperacionPegada(puerta.ArmarOperacion(op, conArchivo: false));
            puerta.RegistrarCapturas(Lote("operadores1"), Confirmada);
            puerta.RegistrarCapturas(Lote("operadores2"), Confirmada);
            puerta.IntegradorPegado(puerta.ArmarPromptIntegrador());
            puerta.RegistrarCapturas(new List<Lectura> { lotes["integradorCompleto"].ToObject<Lectura>() }, Confirmada);

            var fallida = puerta.Recapturar("integrador", new Lectura { Id = "deepseek", Text = "", Error = "el panel no está abierto" });
            var corta = puerta.Recapturar("integrador", new Lectura { Id = "deepseek", Text = "corto" });
            var hechos = puerta.LeerRegistro().Hechos;
            Assert.That(fallida, Is.EqualTo((false, "DeepSeek: el integrador no se recapturó (el panel no está abierto)")));
            Assert.That(corta.Ok, Is.False);
            Assert.That(hechos.OfType<InformeIntegrador>().Count(), Is.EqualTo(1));
            Assert.That(Dominio.UltimoInformeIntegrador(hechos, puerta.RondaActual).Titulo, Is.EqualTo("La dosis"));
            Assert.That(hechos.OfType<ErrorCaptura>().Where(e => e.TipoCapturaIntentado == "informe-integrador").Select(e => e.ProveedorId), Is.EqualTo(new[] { "deepseek", "deepseek" }));
        }

        // Una respuesta guardada con error o un envío fallido es un panel con problema, no uno capturado.
        [Test]
        public void ElEstadoDeCadaPanelSaleDelRegistro()
        {
            var puerta = NuevaPuerta();
            puerta.AbrirRonda("¿Pregunta de prueba?");
            Assert.That(puerta.EstadoDePanel("chatgpt", null, null), Is.EqualTo("por-pegar"));
            puerta.RegistrarIntentos(JsonEstricto.Leer(Referencias.Intentos9).Select(i => ((string)i["id"], (bool)i["ok"], (string)i["error"])).ToList());
            Assert.That(puerta.EstadoDePanel("chatgpt", null, null), Is.EqualTo("pegado-falta-enviar"));
            Assert.That(puerta.EstadoDePanel("grok", null, null), Is.EqualTo("con-problema"));
            var contexto = (JObject)JsonEstricto.Leer(Referencias.Contexto9);
            var lecturas = JsonEstricto.Leer(Referencias.Lecturas9).ToObject<List<Lectura>>();
            (string, string) Contexto(string id) => ((string)contexto[id]["continuidad"], (string)contexto[id]["panel"]);
            // Con la investigación todavía abierta: capturado, y con problema la lectura que falló.
            puerta.RegistrarCapturas(lecturas.Where(l => l.Id == "chatgpt" || l.Id == "claude").ToList(), Contexto);
            Assert.That(puerta.EstadoDePanel("chatgpt", false, "observado"), Is.EqualTo("capturado"));
            Assert.That(puerta.EstadoDePanel("claude", false, "observado"), Is.EqualTo("con-problema"));
            // El resto del pool capturado, pero claude sigue con su captura fallida: la investigación no se cierra
            // (todos los investigadores, no casi todos; antes pasaba a la operación con 6 de 7).
            puerta.RegistrarCapturas(lecturas.Where(l => l.Id != "chatgpt" && l.Id != "claude").ToList(), Contexto);
            Assert.That(puerta.PasoSiguiente().Etapa, Is.EqualTo("investigacion"));
            Assert.That(puerta.EstadoDePanel("chatgpt", false, "observado"), Is.EqualTo("capturado"));
            Assert.That(puerta.EstadoDePanel("claude", false, "observado"), Is.EqualTo("con-problema"));
        }

        // T21: con la investigación completa el paso siguiente ya es la operación, aunque el registro no tenga
        // todavía sello. El estado del panel sigue a ese paso: por pegar, no "capturado" por su respuesta.
        [Test]
        public void ElEstadoDelPanelSigueAlPasoCuandoEmpiezaLaOperacion()
        {
            var puerta = NuevaPuerta();
            puerta.AbrirRonda("¿Pregunta de prueba?");
            puerta.RegistrarCapturas(Referencias.PoolPuerta.Select(id => new Lectura { Id = id, Text = new string('x', 400) }).ToList(), _ => ("indeterminada", null));
            Assert.That(puerta.PasoSiguiente().Etapa, Is.EqualTo("operacion"));
            Assert.That(puerta.EstadoDePanel("chatgpt", false, "observado"), Is.EqualTo("por-pegar"));
            puerta.OperacionPegada(puerta.ArmarOperacion("chatgpt", conArchivo: false));
            Assert.That(puerta.EstadoDePanel("chatgpt", false, "observado"), Is.EqualTo("parece-terminado-observado"));
        }

        [Test]
        public void SinLasRespuestasDelPoolLaOperacionSeNiega()
        {
            var puerta = NuevaPuerta();
            puerta.AbrirRonda("¿Pregunta?");
            puerta.RegistrarCapturas(new List<Lectura> { new Lectura { Id = "chatgpt", Text = new string('x', 400) } }, Confirmada);
            Assert.That(() => puerta.ArmarOperacion("chatgpt", conArchivo: false),
                Throws.InvalidOperationException.With.Message.StartsWith("faltan respuestas capturadas en esta ronda: gemini, claude"));
        }

        List<string> Lineas(Puerta puerta) =>
            File.ReadAllText(Registro.RutaArchivo(carpeta, puerta.ConversacionActual)).Split('\n').Where(l => l.Length > 0).ToList();

        [Test]
        public void ElUmbralDeLecturaEsElDeLaVersionElectron()
        {
            Assert.That(Puerta.UmbralLecturaMinimo, Is.EqualTo(Referencias.UmbralLecturaMinimo));
        }

        // La corrida simulada: nueve lecturas sembradas dejan en el registro los mismos
        // hechos, byte a byte, que la versión Electron con las mismas entradas.
        [Test]
        public void LaCorridaDeNueveLecturasDejaLosMismosHechosQueElTypeScript()
        {
            var puerta = NuevaPuerta();
            puerta.AbrirRonda("¿Pregunta de prueba?");
            puerta.RegistrarIntentos(JsonEstricto.Leer(Referencias.Intentos9).Select(i => ((string)i["id"], (bool)i["ok"], (string)i["error"])).ToList());
            var contexto = (JObject)JsonEstricto.Leer(Referencias.Contexto9);
            var lecturas = JsonEstricto.Leer(Referencias.Lecturas9).ToObject<List<Lectura>>();
            var captura = puerta.RegistrarCapturas(lecturas, id => ((string)contexto[id]["continuidad"], (string)contexto[id]["panel"]));
            puerta.DeclararPregunta("Pregunta declarada de verdad");

            Assert.That(Lineas(puerta), Is.EqualTo(Referencias.CorridaLineas));
            Assert.That(captura.Etapa, Is.EqualTo(Referencias.CorridaEtapa));
            Assert.That(captura.Aviso, Is.EqualTo(Referencias.CorridaAviso));
            var conteo = Registro.Leer(string.Join("\n", Lineas(puerta))).Hechos.GroupBy(h => h.GetType().Name).ToDictionary(g => g.Key, g => g.Count());
            Assert.That(conteo, Is.EquivalentTo(new Dictionary<string, int>
            {
                ["Conversacion"] = 1, ["Ronda"] = 1, ["CondicionProveedoresCargados"] = 1, ["Intento"] = 9,
                ["Respuesta"] = 9, ["Cita"] = 2, ["ErrorCaptura"] = 2, ["PreguntaDeclarada"] = 1,
            }));
        }

        // Capturar sin haber enviado: lo que ya está en pantalla se guarda igual, en una
        // ronda con el marcador, y la pregunta declarada pasa a ser la pregunta efectiva.
        [Test]
        public void SinRondaAbiertaLaCapturaAbreUnaConElMarcadorYLaPreguntaSeDeclara()
        {
            var puerta = NuevaPuerta();
            puerta.RegistrarCapturas(new List<Lectura> { new Lectura { Id = "chatgpt", Text = new string('x', 400) } }, _ => ("indeterminada", null));
            var hechos = Registro.Leer(string.Join("\n", Lineas(puerta))).Hechos;
            var ronda = hechos.OfType<Ronda>().Single();
            Assert.That(ronda.Prompt, Is.EqualTo(Puerta.PromptSinRonda));
            Assert.That(Dominio.PreguntaEfectivaDeRonda(hechos, ronda), Is.Null);

            puerta.DeclararPregunta("La pregunta real");
            hechos = Registro.Leer(string.Join("\n", Lineas(puerta))).Hechos;
            Assert.That(Dominio.PreguntaEfectivaDeRonda(hechos, ronda), Is.EqualTo("La pregunta real"));
        }

        // D13: abandonar vuelve a la etapa Pregunta sin escribir nada; la abandonada queda en el
        // registro y la ronda nueva sigue la numeración en la misma conversación. Límite medido:
        // si la app se reabre antes de pegar la pregunta nueva, vuelve la abandonada.
        [Test]
        public void AbandonarLaRondaVuelveALaPreguntaSinTocarElRegistro()
        {
            var puerta = NuevaPuerta();
            var abandonada = puerta.AbrirRonda("la primera");
            puerta.RegistrarIntentos(new[] { ("chatgpt", true, (string)null) });
            var antes = Lineas(puerta).ToList();
            var conversacion = puerta.ConversacionActual;

            puerta.AbandonarRonda();
            Assert.That(puerta.PasoSiguiente().Etapa, Is.EqualTo("pregunta"));
            Assert.That(puerta.RondaActual, Is.Null);
            Assert.That(Lineas(puerta), Is.EqualTo(antes));

            var reabierta = NuevaPuerta();
            reabierta.RestaurarRondaActiva();
            Assert.That(reabierta.RondaActual, Is.EqualTo(abandonada));

            var nueva = puerta.AbrirRonda("la segunda");
            var rondas = Registro.Leer(string.Join("\n", Lineas(puerta))).Hechos.OfType<Ronda>().ToList();
            Assert.That(puerta.ConversacionActual, Is.EqualTo(conversacion));
            Assert.That(rondas.Select(r => (r.Id, r.Indice)), Is.EqualTo(new[] { (abandonada, 0), (nueva, 1) }));
        }

        [Test]
        public void DeclararSinRondaAbiertaSeNiega()
        {
            Assert.Throws<InvalidOperationException>(() => NuevaPuerta().DeclararPregunta("x"));
        }

        // Al reabrir la app: la última ronda de la última conversación que no es de prueba,
        // y la ronda siguiente sigue la numeración.
        [Test]
        public void LaRondaActivaSeRestauraDelRegistro()
        {
            void Conversacion(string id, string creadaEn, bool esPrueba, params int[] indices)
            {
                Registro.Agregar(carpeta, id, new Conversacion { Id = id, CreadaEn = creadaEn, EsPrueba = esPrueba });
                foreach (var i in indices)
                    Registro.Agregar(carpeta, id, new Ronda { Id = $"{id}-r{i}", ConversacionId = id, Indice = i, Prompt = "p", EnviadaEn = creadaEn });
            }
            Conversacion("vieja", "2026-10-01T10:00:00.000Z", false, 0);
            Conversacion("real", "2026-10-05T10:00:00.000Z", false, 1, 0);
            Conversacion("prueba", "2026-10-06T10:00:00.000Z", true, 0);
            Conversacion("sin-rondas", "2026-10-06T11:00:00.000Z", false);
            File.WriteAllText(Path.Combine(carpeta, "conversaciones", "ilegible.jsonl"), "no es json\n");

            var puerta = NuevaPuerta();
            puerta.RestaurarRondaActiva();
            Assert.That(puerta.ConversacionActual, Is.EqualTo("real"));
            Assert.That(puerta.RondaActual, Is.EqualTo("real-r1"));

            var nueva = puerta.AbrirRonda("otra");
            var ronda = Registro.Leer(string.Join("\n", Lineas(puerta))).Hechos.OfType<Ronda>().Single(r => r.Id == nueva);
            Assert.That(ronda.Indice, Is.EqualTo(2));
        }

        [Test]
        public void ElAvisoDePromptsEsElMismoQueEnTypeScript()
        {
            foreach (var (textos, etapa, aviso) in Referencias.AvisosPrompts)
                Assert.That(Puerta.AvisoPromptsDeCaptura(textos, etapa), Is.EqualTo(aviso), string.Join("|", textos));
        }

        // T24: el registro no se vuelve a leer si no cambió. Medido: 284 ms por lectura de 11,5 MB, y la interfaz lo
        // consulta unas 21 veces cada 1,5 s. Lo que agrega otro escritor (el registro solo crece) se ve en la siguiente.
        [Test]
        public void ElRegistroSinCambiosNoSeVuelveALeer()
        {
            var puerta = NuevaPuerta();
            puerta.AbrirRonda("¿Pregunta?");
            var primera = puerta.LeerRegistro();
            Assert.That(puerta.LeerRegistro(), Is.SameAs(primera));
            Registro.Agregar(carpeta, puerta.ConversacionActual, new PreguntaDeclarada { Id = "otra", RondaId = puerta.RondaActual, Texto = "x", DeclaradaEn = "y" });
            var despues = puerta.LeerRegistro();
            Assert.That(despues, Is.Not.SameAs(primera));
            Assert.That(despues.Hechos.Count, Is.EqualTo(primera.Hechos.Count + 1));
            puerta.DeclararPregunta("de la puerta");
            Assert.That(puerta.LeerRegistro().Hechos.OfType<PreguntaDeclarada>().Count(), Is.EqualTo(2));
        }
    }
}
