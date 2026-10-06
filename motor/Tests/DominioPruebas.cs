using System.Linq;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace ChatCouncil.Motor.Pruebas
{
    public class DominioPruebas
    {
        [Test]
        public void ElEsquemaEsElMismoQueElDeLaVersionElectron()
        {
            Assert.That(Dominio.VersionEsquema, Is.EqualTo(1));
        }

        [Test]
        public void CadaTipoDeHechoSeLeeYSeReescribeIgualQueLoEscribeLaVersionElectron()
        {
            foreach (var linea in Referencias.RegistroLineas)
            {
                var leido = Registro.Leer(linea);
                Assert.That(leido.LineasIlegibles, Is.Empty, linea);
                Assert.That(leido.Hechos, Has.Count.EqualTo(1), linea);
                Assert.That(Registro.ALinea(leido.Hechos[0]), Is.EqualTo(linea));
            }
        }

        [Test]
        public void LeerCuentaLasIlegiblesYDetectaLaUltimaLineaIncompleta()
        {
            foreach (var (entrada, hechos, numeros, contenidos, ultima) in Referencias.Lecturas)
            {
                var leido = Registro.Leer(entrada);
                Assert.That(leido.Hechos, Has.Count.EqualTo(hechos), entrada);
                Assert.That(leido.LineasIlegibles.Select(l => l.Numero), Is.EqualTo(numeros), entrada);
                Assert.That(leido.LineasIlegibles.Select(l => l.Contenido), Is.EqualTo(contenidos), entrada);
                Assert.That(leido.UltimaLineaIncompleta, Is.EqualTo(ultima), entrada);
            }
        }

        [Test]
        public void LaEtapaSaleDeLosHechosYCuentaOperadoresDistintos()
        {
            foreach (var (registro, etapa, captura) in Referencias.Etapas)
            {
                var hechos = Registro.Leer(registro).Hechos;
                Assert.That(Dominio.EtapaDeRonda(hechos, "R", 7), Is.EqualTo(etapa), registro);
                Assert.That(Dominio.TipoCapturaDeEtapa(etapa), Is.EqualTo(captura));
            }
        }

        [Test]
        public void LaPreguntaEfectivaRechazaElMarcadorYUsaLaUltimaDeclarada()
        {
            foreach (var (registro, esperado) in Referencias.PreguntasEfectivas)
            {
                var hechos = Registro.Leer(registro).Hechos;
                var ronda = hechos.OfType<Ronda>().Single();
                Assert.That(Dominio.PreguntaEfectivaDeRonda(hechos, ronda), Is.EqualTo(esperado), registro);
            }
            foreach (var (texto, valida) in Referencias.PreguntasValidas)
                Assert.That(Dominio.EsPreguntaValida(texto), Is.EqualTo(valida), texto);
        }

        [Test]
        public void LaProcedenciaDistingueFinObservadoDeInferido()
        {
            foreach (var (lectura, contexto, esperado) in Referencias.Procedencias)
            {
                var l = (JObject)JsonEstricto.Leer(lectura);
                var c = (JObject)JsonEstricto.Leer(contexto);
                var p = Dominio.DerivarProcedencia(
                    (string)l["modelLabel"], (string)l["completionKind"], (int?)l["quiescenceMs"], (bool?)l["generating"],
                    (string)c["ahora"], (string)c["continuidad"], (string)c["metodoEscritura"], (string)c["panel"]);
                Assert.That(Registro.AJson(p), Is.EqualTo(esperado));
            }
        }

        [Test]
        public void ElIntegradorYLosCargadosSonLosDeLaUltimaCondicion()
        {
            foreach (var (registro, integrador, cargados) in Referencias.Cargados)
            {
                var hechos = Registro.Leer(registro).Hechos;
                Assert.That(Dominio.IntegradorDeRonda(hechos, "R"), Is.EqualTo(integrador), registro);
                Assert.That(Dominio.ProveedoresCargadosDeRonda(hechos, "R"), Is.EqualTo(cargados), registro);
            }
        }
    }
}
