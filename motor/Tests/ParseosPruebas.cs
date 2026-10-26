using System;
using System.Linq;
using NUnit.Framework;

namespace ChatCouncil.Motor.Pruebas
{
    public class ParseosPruebas
    {
        [Test]
        public void ElTextoDesdeHtmlEsElMismoQueEnTypeScript()
        {
            foreach (var (html, texto) in Referencias.TextosHtml)
                Assert.That(TextoDeHtml.TextoDeHtmlEnBloques(html), Is.EqualTo(texto), html);
        }

        // Lo que motivó re-derivar del html: deepseek escribe cada sección en un <ol start>.
        [Test]
        public void LaListaOrdenadaRespetaSuStart()
        {
            Assert.That(TextoDeHtml.TextoDeHtmlEnBloques("<ol start=\"5\"><li><p>QUE CONVIENE RESCATAR</p></li></ol>"), Is.EqualTo("5. QUE CONVIENE RESCATAR"));
        }

        // Ronda real del 2026-10-25: "text", Copiar y Descargar del bloque de código de DeepSeek entraron al informe, y sus títulos y su tabla quedaron planos.
        [Test]
        public void ElCuerpoDelRedactorEnMarkdownSinLosControlesDeLaPagina()
        {
            const string html = "<h2>Fichas</h2><p>x</p><div class=\"md-code-block\"><div class=\"md-code-block-banner-wrap\"><div><span>text</span></div>"
                + "<div><div role=\"button\"><span>Copiar</span></div><button>Descargar</button></div></div><pre><span>linea 1</span>\n<span>linea 2</span></pre></div>"
                + "<table><thead><tr><th>Modelo</th><th>D1</th></tr></thead><tbody><tr><td>A|B</td><td>DROP</td></tr></tbody></table>";
            Assert.That(TextoDeHtml.TextoDeHtmlEnBloques(html, markdown: true),
                Is.EqualTo("#### Fichas\n\nx\n\n```\nlinea 1\nlinea 2\n```\n\n| Modelo | D1 |\n| --- | --- |\n| A\\|B | DROP |"));
            Assert.That(TextoDeHtml.TextoDeHtmlEnBloques(html), Is.EqualTo("Fichas\nx\nlinea 1\nlinea 2\nModelo | D1 |\nA|B | DROP |"));
        }

        // Ronda real del 2026-10-25: DeepSeek enlaza solo "Z.ai" y el control decía que el redactor había salido a la red.
        [Test]
        public void UnDominioDelMaterialEnlazadoSoloNoCuentaComoFueraDelMaterial()
        {
            const string html = "<p>ARCHIVO: x</p><p><a href=\"https://z.ai/\">Z.ai</a> y <a href=\"https://otro.org/\">otro.org</a></p>";
            var c = InformeFinal.ControlesRedaccion("", html, null, null, new string[0], new[] { "https://z.ai/blog/glm-5.3" });
            Assert.That((c.EnlacesExternos, c.EnlacesFueraDelMaterial), Is.EqualTo(((int?)2, (int?)1)));
        }

        // Ronda real del 2026-10-25: GLM dejó &#39; como texto y la cita "…" - fuente perdía solo su comilla de apertura.
        [Test]
        public void LaCitaDelVerificadorSinEntidadesYConSusComillas()
        {
            var r = Parseos.ParsearVerificacion("CONFIRMA|OFICIAL|H1|https://a.org|&quot;We&#39;re here\" - Anthropic, 2026\nCONFIRMA|OFICIAL|H2|https://b.org|\"solo la cita\"", new[] { "H1", "H2" });
            Assert.That(r.Correspondencias.Select(x => x.Texto), Is.EqualTo(new[] { "\"We're here\" - Anthropic, 2026", "solo la cita" }));
        }

        [Test]
        public void UnPuntoDeCodigoFueraDeRangoTiraComoEnTypeScript()
        {
            Assert.That(Referencias.ErrorHtml, Is.EqualTo("RangeError"));
            Assert.Throws<ArgumentOutOfRangeException>(() => TextoDeHtml.TextoDeHtmlEnBloques("<p>&#1114112;</p>"));
        }

        [Test]
        public void LosHallazgosSonLosMismosQueEnTypeScript()
        {
            var r = Parseos.ParsearHallazgos(Referencias.SalidaOperador, new[] { "P1", "P2", "P3", "P4", "P5", "P6" });
            var obtenido = Registro.AJson(new
            {
                hallazgos = r.Hallazgos.Select(h => new { h.Categoria, h.Eje, h.Etiquetas, h.Descripcion, h.EtiquetaInvalida }),
                lineasDescartadas = r.LineasDescartadas,
            });
            Assert.That(obtenido, Is.EqualTo(Referencias.HallazgosParseados));
        }

        // Siembra del BLUEPRINT: TENSION se lee como categoría y P9, que no estaba en el cuerpo, queda marcada.
        [Test]
        public void TensionSeLeeYUnaEtiquetaInexistenteQuedaMarcada()
        {
            var tension = Parseos.ParsearHallazgos(Referencias.SalidaOperador, new[] { "P1", "P2", "P3", "P4", "P5", "P6" }).Hallazgos.Single(h => h.Categoria == "TENSION");
            Assert.That(tension.Etiquetas, Is.EqualTo(new[] { "P1", "P9" }));
            Assert.That(tension.EtiquetaInvalida, Is.True);
        }

        [Test]
        public void LaVerificacionEsLaMismaQueEnTypeScript()
        {
            var r = Parseos.ParsearVerificacion(Referencias.SalidaVerificador, new[] { "H12", "H13", "H24", "H58", "H59", "H60" });
            Assert.That(Registro.AJson(r), Is.EqualTo(Referencias.VerificacionParseada));
        }

        [Test]
        public void LaTrazabilidadEsLaMismaQueEnTypeScript()
        {
            foreach (var (informe, esperado) in Referencias.Trazabilidades)
                Assert.That(Registro.AJson(Parseos.ParsearReferenciasIntegrador(informe, new[] { "H1", "H2", "H3", "H4" })), Is.EqualTo(esperado), informe);
        }

        // guard:trazabilidad: 7 párrafos; falla el de la sección 5 sin referencias; TITULO y
        // LA TABLA NO ALCANZA quedan exentos; H999 se conserva marcada sin perder su párrafo.
        [Test]
        public void ElInformeSembradoDeGuardTrazabilidad()
        {
            var r = Parseos.ParsearReferenciasIntegrador(Referencias.Trazabilidades[0].informe, new[] { "H1", "H2", "H3", "H4" });
            Assert.That(r.Parrafos, Has.Count.EqualTo(7));
            Assert.That(r.ParrafosSinReferencias, Is.EqualTo(new[] { 4 }));
            Assert.That(r.Parrafos[0].EsTitulo, Is.True);
            Assert.That(r.Parrafos[5].EsLaTablaNoAlcanza, Is.True);
            Assert.That(r.Referencias.Single(x => x.HallazgoId == "H999").ReferenciaInvalida, Is.True);
            Assert.That(r.Parrafos[6].SinReferencias, Is.False);
        }

        [Test]
        public void ElTituloYLaSeccionDeRescateSonLosMismosQueEnTypeScript()
        {
            foreach (var (informe, titulo, esParrafoTitulo) in Referencias.Titulos)
            {
                var t = TituloInforme.ExtraerTituloDelInforme(informe);
                Assert.That(Registro.AJson(new { titulo = t.Titulo, cuerpo = t.Cuerpo }), Is.EqualTo(titulo), informe);
                Assert.That(TituloInforme.EsParrafoTitulo(informe), Is.EqualTo(esParrafoTitulo), informe);
            }
            foreach (var (informe, rescate) in Referencias.Rescates)
                Assert.That(TituloInforme.ExtraerSeccionRescate(informe), Is.EqualTo(rescate), informe);
            foreach (var (linea, es) in Referencias.EncabezadosRescate)
                Assert.That(TituloInforme.EsEncabezadoRescate(linea), Is.EqualTo(es), linea);
        }

        [Test]
        public void ElNombreDelInformeEsElMismoQueEnTypeScript()
        {
            foreach (var (titulo, limpio) in Referencias.LimpiezasTitulo)
                Assert.That(TituloInforme.LimpiarTituloParaArchivo(titulo), Is.EqualTo(limpio), titulo);
            foreach (var (pregunta, titulo) in Referencias.TitulosDesdePregunta)
                Assert.That(TituloInforme.TituloDesdePregunta(pregunta), Is.EqualTo(titulo), pregunta);
            var ahora = new DateTime(2026, 10, 6, 9, 5, 0, DateTimeKind.Local);
            foreach (var (titulo, pregunta, nombre) in Referencias.NombresBase)
                Assert.That(TituloInforme.NombreBaseDeInforme(titulo, pregunta, ahora), Is.EqualTo(nombre));
            var ocupados = new[] { "base", "base (2)", "base (3)" };
            Assert.That(TituloInforme.NombreLibreDeInforme("base", ocupados.Contains), Is.EqualTo(Referencias.NombreLibre));
            Assert.Throws<InvalidOperationException>(() => TituloInforme.NombreLibreDeInforme("base", _ => true));
        }
    }
}
