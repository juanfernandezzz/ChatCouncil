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

        // Ids y reloj fijos, como los que fija el script de referencias.
        Puerta NuevaPuerta()
        {
            int n = 0;
            return new Puerta(carpeta, () => $"00000000-0000-4000-8000-{++n:D12}", () => new DateTime(2026, 10, 6, 12, 0, 0, DateTimeKind.Utc),
                Referencias.Conocidos, new RolesElegidos("deepseek", "glm", "deepseek"), Referencias.PoolPuerta);
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
