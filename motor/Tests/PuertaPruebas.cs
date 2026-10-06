using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
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
                Referencias.Conocidos, new RolesElegidos("deepseek", "glm", "deepseek"), Referencias.PoolPuerta);
        }

        static (string, string) Confirmada(string _) => ("confirmada", null);

        // Una ronda entera con las corridas del BLUEPRINT: 7 cuerpos y 7 sellos; un informe
        // corto más una recaptura dan 2 hechos y gana el último; en la ronda nueva con las
        // respuestas copiadas, kimi se reutiliza y chatgpt se rechaza.
        [Test]
        public void UnaRondaEnteraDejaLosMismosHechosQueElTypeScript()
        {
            var puerta = NuevaPuerta();
            var lotes = (JObject)JsonEstricto.Leer(Referencias.LotesOperacion);
            List<Lectura> Lote(string nombre) => lotes[nombre].ToObject<List<Lectura>>();

            puerta.AbrirRonda(Referencias.PreguntaOperacion);
            puerta.RegistrarCapturas(Lote("investigacion"), Confirmada);
            string archivoKimi = null;
            foreach (var op in Referencias.PoolPuerta)
            {
                var operacion = puerta.ArmarOperacion(op, conArchivo: op == "kimi");
                puerta.OperacionPegada(operacion);
                if (op == "kimi") archivoKimi = operacion.NombreArchivo;
            }
            puerta.RegistrarCapturas(Lote("operadores1"), Confirmada);
            puerta.RegistrarCapturas(Lote("operadores2"), Confirmada);
            puerta.IntegradorPegado(puerta.ArmarPromptIntegrador());
            puerta.RegistrarCapturas(Lote("integradorCorto"), Confirmada);
            var recaptura = puerta.Recapturar("integrador", lotes["integradorCompleto"].ToObject<Lectura>());
            puerta.VerificadorPegado(puerta.ArmarPromptVerificador());
            puerta.RegistrarCapturas(Lote("verificador"), Confirmada);
            var redactor = puerta.ArmarRedactor();
            puerta.RedactorPegado(redactor);
            puerta.RegistrarCapturas(new List<Lectura> { JsonEstricto.Leer(Referencias.LecturaRedactorOperacion).ToObject<Lectura>() }, Confirmada);
            var primeraRonda = puerta.RondaActual;
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
    }
}
