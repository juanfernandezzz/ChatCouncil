using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace ChatCouncil.Motor.Pruebas
{
    public class AnonimizacionPruebas
    {
        static readonly int[] Pool = Enumerable.Range(0, 8).ToArray();

        [Test]
        public void ElHashDeLaSemillaEsElMismoQueEnTypeScript()
        {
            Assert.That(Referencias.Semillas.Select(Anonimizacion.HashSemilla), Is.EqualTo(Referencias.HashSemillas));
        }

        [Test]
        public void ElBarajadoEsElMismoQueEnTypeScript()
        {
            foreach (var (semilla, n, orden) in Referencias.Barajados)
                Assert.That(Anonimizacion.Barajar(Enumerable.Range(0, n).ToArray(), semilla), Is.EqualTo(orden), $"semilla {semilla}, n {n}");
        }

        [Test]
        public void ElBarajadoEsDeterministaYNoTocaLaEntrada()
        {
            var entrada = Pool.ToArray();
            var primero = Anonimizacion.Barajar(entrada, 12345u);
            Assert.That(Anonimizacion.Barajar(entrada, 12345u), Is.EqualTo(primero));
            Assert.That(entrada, Is.EqualTo(Pool));
        }

        // BLUEPRINT, revisión del barajado: con 8 elementos, dos barajados
        // independientes coinciden en 1 posición de media.
        [Test]
        public void ElBarajadoEsUniforme()
        {
            var ordenes = SemillasDePrueba(200).Select(s => Anonimizacion.Barajar(Pool, s)).ToList();
            long coincidencias = 0, pares = 0;
            for (int a = 0; a < ordenes.Count; a++)
                for (int b = a + 1; b < ordenes.Count; b++, pares++)
                    coincidencias += Pool.Count(i => ordenes[a][i] == ordenes[b][i]);
            var media = (double)coincidencias / pares;
            TestContext.WriteLine($"Media de coincidencias: {media:F3} sobre {pares} pares.");
            Assert.That(media, Is.EqualTo(1.00).Within(0.15));
        }

        // Lo que importa para el sesgo de posición: sobre 400 barajados, cada
        // elemento cae en cada posición unas 50 veces (±26, unos 4 desvíos).
        // Con estas semillas da mínimo 37 y máximo 76, igual que el TypeScript.
        // El margen es estrecho para 64 celdas: un barajado con azar criptográfico
        // se sale en el 0,45 % de las tandas (medido sobre 2.000), y el total de
        // 800.000 barajados no muestra sesgo (chi² 58,2 con 49 gl). No es motivo
        // para cambiar las semillas.
        [Test]
        public void CadaElementoCaeParejoEnCadaPosicion()
        {
            var celdas = new int[8, 8];
            foreach (var s in SemillasDePrueba(400))
            {
                var orden = Anonimizacion.Barajar(Pool, s);
                for (int pos = 0; pos < 8; pos++) celdas[orden[pos], pos]++;
            }
            var valores = celdas.Cast<int>().ToList();
            TestContext.WriteLine($"Celdas: mínimo {valores.Min()}, máximo {valores.Max()}.");
            Assert.That(valores, Is.All.InRange(24, 76));
        }

        static IEnumerable<uint> SemillasDePrueba(int cuantas) =>
            Enumerable.Range(0, cuantas).Select(k => Anonimizacion.HashSemilla($"semilla-de-prueba-{k}"));

        [Test]
        public void LaListaDeTerminosYElTokenSonLosDeTypeScript()
        {
            Assert.That(Anonimizacion.TerminosBloqueados, Is.EqualTo(Referencias.TerminosBloqueados));
            Assert.That(Anonimizacion.TokenRedaccion, Is.EqualTo(Referencias.TokenRedaccion));
        }

        [Test]
        public void AnonimizarDaLasMismasEtiquetasTextosSelloYConteoQueTypeScript()
        {
            foreach (var (semilla, entrada, esperado) in Referencias.Anonimizados)
            {
                var respuestas = ((JArray)JsonEstricto.Leer(entrada))
                    .Select(r => ((string)r["panelSourceId"], (string)r["replyId"], (string)r["attemptId"], (string)r["text"]))
                    .ToList();
                var a = Anonimizacion.AnonimizarRespuestas(respuestas, semilla);
                var obtenido = Registro.AJson(new
                {
                    labeled = a.Etiquetadas.Select(e => new { label = e.Label, text = e.Texto }),
                    seal = a.Sello.Select(s => new { s.Label, s.PanelSourceId, s.ReplyId, s.AttemptId }),
                    redactions = a.Redacciones.Select(r => new { label = r.Label, count = r.Cuenta }),
                });
                Assert.That(obtenido, Is.EqualTo(esperado));
            }
        }

        [Test]
        public void LosCodigosEstablesSiguenElOrdenDelPool()
        {
            foreach (var (ids, claves, codigos) in Referencias.Codigos)
            {
                var mapa = Anonimizacion.CodigosEstables(ids);
                Assert.That(mapa.Keys, Is.EquivalentTo(claves));
                Assert.That(claves.Select(k => mapa[k]), Is.EqualTo(codigos));
            }
        }
    }
}
