using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace ChatCouncil.Motor.Pruebas
{
    public class CuerpoOperadorPruebas
    {
        [Test]
        public void LaQuerySoloConservaModel()
        {
            foreach (var (url, limpia) in Referencias.Limpiezas)
                Assert.That(Cuerpos.LimpiarQueryListaBlanca(url), Is.EqualTo(limpia), url);
        }

        [Test]
        public void LasFugasSonLasMismasQueEnTypeScript()
        {
            foreach (var (texto, fugas) in Referencias.Fugas)
                Assert.That(Cuerpos.FugasDeProveedorEnUrls(texto), Is.EqualTo(fugas), texto);
        }

        // Regla 4 de guard:sellado.
        [Test]
        public void ElCuerpoLimpioPasaYElQueDelataAlProveedorTira()
        {
            Assert.DoesNotThrow(() => Cuerpos.ArmarCuerpoConFuentes("texto de respuesta sin nada raro", new[] { "https://arxiv.org/abs/2212.10001" }));
            Assert.Throws<InvalidOperationException>(() => Cuerpos.ArmarCuerpoConFuentes("texto de respuesta", new[] { "https://chatgpt.com/share/abc123" }));
        }

        // Ronda real d4fc7e58 (2026-10-23): estas fuentes de docs y blog frenaban la operación en los 7 operadores.
        // Solo un enlace a la INTERFAZ del proveedor delata (decisión de Juan del 2026-10-23, BLUEPRINT T3, regla 1).
        [TestCase("https://learn.chatgpt.com/guides/best-practices,")]
        [TestCase("https://platform.kimi.ai/docs/guide/use-thinking-models")]
        [TestCase("https://www.kimi.ai/blog/")]
        [TestCase("https://www.kimi.ai/blog/kimi-k2-6#:~:text=open")]
        [TestCase("https://kimi.ai/blog")]
        [TestCase("https://platform.claude.com/docs/claude-prompting")]
        [TestCase("http://sub.claude.ai/")]
        [TestCase("https://ai.google.dev/gemini-api/docs")]
        [TestCase("https://www.kimi.ai/blogs-de-otro")] // no es /blog: sigue siendo la interfaz
        public void UnaFuenteDeDocsOBlogDeUnProveedorNoEsFuga(string url)
        {
            var esperado = url.EndsWith("blogs-de-otro", StringComparison.Ordinal) ? new List<string> { url } : new List<string>();
            Assert.That(Cuerpos.FugasDeProveedorEnUrls($"ver {url} y sigue"), Is.EqualTo(esperado), url);
        }

        [TestCase("https://chatgpt.com/share/abc123")]
        [TestCase("https://chatgpt.com/c/6812")]
        [TestCase("https://www.chatgpt.com/c/6812")]
        [TestCase("https://CLAUDE.AI/chat/1")]
        [TestCase("https://chat.z.ai/c/1")]
        [TestCase("https://gemini.google.com/app/abc")]
        [TestCase("https://grok.com/share/x")]
        [TestCase("https://chat.mistral.ai/chat/1")]
        [TestCase("https://chat.qwen.ai/c/1")]
        [TestCase("https://www.kimi.ai/chat/d1")]
        [TestCase("https://kimi.ai")]
        [TestCase("https://chat.deepseek.com/a/chat/s/1")]
        public void UnEnlaceALaInterfazDelProveedorSigueSiendoFuga(string url)
        {
            Assert.That(Cuerpos.FugasDeProveedorEnUrls($"ver {url} y sigue"), Is.EqualTo(new List<string> { url }), url);
            Assert.Throws<InvalidOperationException>(() => Cuerpos.ArmarCuerpoConFuentes("texto", new[] { url }));
        }

        [Test]
        public void ElCuerpoConFuentesEsElMismoQueEnTypeScript()
        {
            foreach (var (texto, urls, cuerpo, error) in Referencias.Armados)
            {
                if (error == null) Assert.That(Cuerpos.ArmarCuerpoConFuentes(texto, urls), Is.EqualTo(cuerpo));
                else Assert.That(() => Cuerpos.ArmarCuerpoConFuentes(texto, urls), Throws.InvalidOperationException.With.Message.EqualTo(error));
            }
        }

        [Test]
        public void LasMarcasVanEnElPrimerBlancoDespuesDelIntervalo()
        {
            foreach (var (texto, token, intervalo, conMarcas, marcas) in Referencias.Marcas)
            {
                var r = Cuerpos.InsertarMarcasIntercaladas(texto, token, intervalo);
                Assert.That(r.TextoConMarcas, Is.EqualTo(conMarcas), texto);
                Assert.That(r.Marcas, Is.EqualTo(marcas), texto);
            }
        }

        [Test]
        public void LaIntegridadDistingueCompletoTruncadoEIndeterminado()
        {
            Assert.That(Referencias.Integridades.Select(i => i.estado), Is.EqualTo(new[] { "completo", "truncado", "truncado", "indeterminado", "truncado" }));
            foreach (var (caso, respuesta, estado, esperadas, presentes, faltantes) in Referencias.Integridades)
            {
                var r = Cuerpos.EvaluarIntegridad(respuesta, Referencias.MarcasIntegridad);
                Assert.That((r.Estado, r.MarcasEsperadas, r.MarcasPresentes), Is.EqualTo((estado, esperadas, presentes)), caso);
                Assert.That(r.Faltantes, Is.EqualTo(faltantes), caso);
            }
        }

        [Test]
        public void LaPerdidaSeLocalizaEnElSegmentoQueCambio()
        {
            foreach (var (final, segmentos) in Referencias.Perdidas)
            {
                var r = Cuerpos.LocalizarPerdida(Referencias.ConMarcas, final, Referencias.MarcasIntegridad);
                var obtenido = Registro.AJson(r.Select(s => new { indice = s.Indice, largoOriginal = s.LargoOriginal, largoFinal = s.LargoFinal, delta = s.Delta }));
                Assert.That(obtenido, Is.EqualTo(segmentos));
            }
        }

        [Test]
        public void LosCuerposSonLosMismosQueEnTypeScript()
        {
            foreach (var (entrada, esperado, error) in Referencias.Cuerpos)
            {
                var respuestas = ((JArray)JsonEstricto.Leer(entrada)).Select(r => new RespuestaParaOperar
                {
                    ProveedorId = (string)r["proveedorId"],
                    ReplyId = (string)r["replyId"],
                    AttemptId = (string)r["attemptId"],
                    Texto = (string)r["texto"],
                    UrlsCitadas = r["urlsCitadas"].Select(u => (string)u).ToList(),
                }).ToList();
                int n = 0;
                CuerposPorOperador Armar() => Cuerpos.ArmarCuerposPorOperador(respuestas, Referencias.PoolCuerpos, Referencias.SemillaCuerpos, () => $"tok{++n}");
                if (error != null)
                {
                    Assert.That(() => Armar(), Throws.InvalidOperationException.With.Message.EqualTo(error));
                    continue;
                }
                var a = Armar();
                var obtenido = Registro.AJson(new
                {
                    cuerpos = a.Cuerpos.Select(k => new { k.OperadorId, k.Cuerpo, k.Marcas, k.ProveedoresIncluidos, respuestasParaOperador = Etiquetadas(k.RespuestasParaOperador) }),
                    sello = a.Sello.Select(s => new { s.Label, s.PanelSourceId, s.ReplyId, s.AttemptId, s.CodigoEstable }),
                    respuestasTodas = Etiquetadas(a.RespuestasTodas),
                });
                Assert.That(obtenido, Is.EqualTo(esperado));
            }
        }

        static object Etiquetadas(IEnumerable<(string Etiqueta, string Texto)> xs) => xs.Select(x => new { etiqueta = x.Etiqueta, texto = x.Texto });

        static string Texto(int largo) => string.Concat(Enumerable.Repeat("palabra ", largo / 8));

        // Si la exclusión de autoevaluación fallara, el cuerpo traería la
        // respuesta propia: 6 marcas de más contra "pool menos la propia".
        [Test]
        public void LaComprobacionCruzadaTiraSiElCuerpoIncluyeLaRespuestaPropia()
        {
            var sinPropia = Cuerpos.InsertarMarcasIntercaladas(Texto(14000), "t").Marcas.Count;
            var conPropia = Cuerpos.InsertarMarcasIntercaladas(Texto(14000) + Texto(6000), "t").Marcas.Count;
            Assert.DoesNotThrow(() => Cuerpos.ComprobarExclusion("chatgpt", sinPropia, 14000));
            Assert.Throws<InvalidOperationException>(() => Cuerpos.ComprobarExclusion("chatgpt", conPropia, 14000));
        }

        // Con respuestas de tamaño real (5.000 caracteres, 5 marcas cada una) la
        // comprobación cruzada de ArmarCuerposPorOperador sí puede ver una
        // respuesta propia incluida; con las de la referencia, de ~1.000, no.
        [Test]
        public void CadaCuerpoExcluyeLaRespuestaDeSuOperador()
        {
            var pool = Referencias.PoolCuerpos;
            var respuestas = pool.Select(id => new RespuestaParaOperar
            {
                ProveedorId = id, ReplyId = "r-" + id, AttemptId = "a-" + id, Texto = Texto(5000), UrlsCitadas = new string[0],
            }).ToList();
            var a = Cuerpos.ArmarCuerposPorOperador(respuestas, pool, 7u, () => "t");
            foreach (var k in a.Cuerpos)
                Assert.That(k.ProveedoresIncluidos, Is.EquivalentTo(pool.Where(id => id != k.OperadorId)), k.OperadorId);
        }
    }
}
