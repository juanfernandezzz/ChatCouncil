using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;

namespace ChatCouncil.Motor.Pruebas
{
    public class InformePruebas
    {
        static string Armar(int caso) => InformeFinal.Armar(JsonEstricto.Leer(Referencias.InformesFinales[caso].entrada).ToObject<InformeFinalInput>());

        [Test]
        public void ElInformeFinalEsElMismoQueArmaElTypeScript()
        {
            for (int i = 0; i < Referencias.InformesFinales.Length; i++)
                Assert.That(Armar(i), Is.EqualTo(Referencias.InformesFinales[i].informe), Referencias.InformesFinales[i].entrada);
        }

        // Parte 2 de guard:trazabilidad, sobre el informe que arma el motor.
        [Test]
        public void ElInformeMarcaCadaReferenciaYPublicaLaClaveDeLosP()
        {
            var texto = Armar(0);
            Assert.That(texto, Does.Contain("[CONFIRMA H1 ✓]"));
            Assert.That(texto, Does.Contain("[H2 ✓]"));
            Assert.That(texto, Does.Contain("[CONFIRMA H999 ✗ referencia inexistente]"));
            Assert.That(texto, Does.Contain("[H888 ✗ referencia inexistente]"));
            Assert.That(texto, Does.Contain("| P3 | Claude |"));
            Assert.That(texto, Does.Contain("| (sin sello) | Mistral |"));
        }

        // Sin integrador, tabla vacía, integrador sin referencias y sin respuestas.
        [Test]
        public void NingunaSeccionQuedaVacia()
        {
            for (int caso = 0; caso <= 4; caso++)
            {
                var vacias = new List<string>();
                string actual = null;
                var cuerpo = new List<string>();
                void Cerrar()
                {
                    if (actual != null && string.Concat(cuerpo).Trim().Length == 0) vacias.Add(actual);
                }
                foreach (var linea in Armar(caso).Split('\n'))
                {
                    if (linea.StartsWith("## "))
                    {
                        Cerrar();
                        actual = linea;
                        cuerpo.Clear();
                    }
                    else if (actual != null) cuerpo.Add(linea);
                }
                Cerrar();
                Assert.That(vacias, Is.Empty, $"caso {caso}");
            }
            Assert.That(Armar(1), Does.Not.Contain("referencio todos los hallazgos"));
            Assert.That(Armar(4), Does.Not.Contain("|---|"));
        }

        [Test]
        public void LasMarcasDeIntegridadSeQuitanYSeDeclaran()
        {
            Assert.That(Armar(5), Does.Not.Contain("[[CC-MARCA"));
            Assert.That(Armar(5), Does.Match(@"Se quitaron \d+ marca\(s\) de integridad"));
            Assert.That(Armar(2), Does.Not.Contain("Se quitaron"));
        }

        [Test]
        public void LaVerificacionParaElInformeEsLaMismaQueEnTypeScript()
        {
            var salida = (SalidaVerificador)Registro.Leer(Referencias.SalidaVerificadorInforme).Hechos.Single();
            var hallazgos = JsonEstricto.Leer(Referencias.HallazgosInforme).ToObject<List<HallazgoResuelto>>();
            foreach (var (urls, techo, esperado) in Referencias.VerificacionesInforme)
            {
                var lineas = JsonEstricto.Leer(urls).Select(u => Registro.AJson(u));
                var comprobadas = Registro.Leer(string.Join("\n", lineas)).Hechos.Cast<UrlComprobada>().ToList();
                Assert.That(Registro.AJson(InformeFinal.VerificacionParaInforme(salida, comprobadas, hallazgos, techo)), Is.EqualTo(esperado), urls);
            }
        }

        [Test]
        public void LosControlesDelRedactorSonLosMismosQueEnTypeScript()
        {
            foreach (var (respuesta, material, controles, lineas) in Referencias.Controles)
            {
                var r = JsonEstricto.Leer(respuesta);
                var c = InformeFinal.ControlesRedaccion((string)r["textoCrudo"], (string)r["html"], (string)r["marcaPrimera"], (string)r["marcaUltima"], new[] { "H1", "H2" }, material);
                Assert.That(Registro.AJson(c), Is.EqualTo(controles), respuesta);
                Assert.That(InformeFinal.LineasDeControl(c), Is.EqualTo(lineas), respuesta);
            }
        }

        [Test]
        public void ElDocumentoDeCadaRespuestaEsElMismoQueEnTypeScript()
        {
            foreach (var (respuesta, markdown) in Referencias.RespuestasPdf)
                Assert.That(InformeFinal.MarkdownDeRespuestaInvestigador("¿Pregunta?", JsonEstricto.Leer(respuesta).ToObject<RespuestaParaPdf>()), Is.EqualTo(markdown));
            foreach (var (indice, id, archivo, nombre) in Referencias.NombresRespuesta)
            {
                Assert.That(InformeFinal.NombreArchivoRespuesta(indice, id), Is.EqualTo(archivo), id);
                Assert.That(Dominio.NombreProveedor(id), Is.EqualTo(nombre), id);
            }
        }
    }
}
