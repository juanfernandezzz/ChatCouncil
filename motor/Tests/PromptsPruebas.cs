using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace ChatCouncil.Motor.Pruebas
{
    public class PromptsPruebas
    {
        static List<(string Etiqueta, string Texto)> Etiquetadas(JToken a) => a.Select(r => ((string)r["etiqueta"], (string)r["texto"])).ToList();

        static readonly List<(string Etiqueta, string Texto)> RespuestasEtiquetadas = Etiquetadas(JsonEstricto.Leer(Referencias.Etiquetadas));

        static readonly List<HallazgoParaIntegrador> HallazgosIntegrador = JsonEstricto.Leer(Referencias.HallazgosIntegrador).Select(h => new HallazgoParaIntegrador
        {
            Id = (string)h["id"],
            Categoria = (string)h["categoria"],
            Eje = (string)h["eje"],
            Etiquetas = h["etiquetas"].Select(e => (string)e).ToList(),
            Descripcion = (string)h["descripcion"],
            Operador = (string)h["operador"],
        }).ToList();

        [Test]
        public void LosPromptsSonLosMismosQueArmaElTypeScript()
        {
            var paraVerificador = HallazgosIntegrador.Select(h => new HallazgoParaVerificador { Id = h.Id, Categoria = h.Categoria, Eje = h.Eje, Descripcion = h.Descripcion }).ToList();
            foreach (var (pregunta, operacion, conArchivo, cuerpoArchivo, integrador, verificador, redactor) in Referencias.Prompts)
            {
                Assert.That(Prompts.ArmarPromptOperacion(pregunta, RespuestasEtiquetadas), Is.EqualTo(operacion), pregunta);
                var a = Prompts.ArmarPromptOperacionConArchivo(pregunta, RespuestasEtiquetadas);
                Assert.That(a.Prompt, Is.EqualTo(conArchivo), pregunta);
                Assert.That(a.CuerpoArchivo, Is.EqualTo(cuerpoArchivo), pregunta);
                Assert.That(Prompts.ArmarPromptIntegrador(pregunta, HallazgosIntegrador), Is.EqualTo(integrador), pregunta);
                Assert.That(Prompts.ArmarPromptVerificador(pregunta, Referencias.Rescate, paraVerificador), Is.EqualTo(verificador), pregunta);
                Assert.That(Prompts.ArmarPromptRedactor(pregunta), Is.EqualTo(redactor), pregunta);
            }
        }

        // La lección del {{CONTENIDO}} del PDF: lo insertado no se vuelve a recorrer.
        [Test]
        public void UnMarcadorDentroDeLaPreguntaQuedaLiteral()
        {
            var pregunta = Referencias.Prompts[1].pregunta;
            Assert.That(Prompts.ArmarPromptOperacion(pregunta, RespuestasEtiquetadas), Does.Contain(pregunta));
            Assert.That(Prompts.ArmarPromptVerificador("p", Referencias.Rescate, new List<HallazgoParaVerificador>()), Does.Contain(Referencias.Rescate));
        }

        [Test]
        public void ElArchivoDelRedactorEsElMismoQueArmaElTypeScript()
        {
            foreach (var (material, archivo) in Referencias.ArchivosRedactor)
            {
                var m = JsonEstricto.Leer(material);
                var obtenido = Prompts.ArmarArchivoRedactor(new MaterialRedactor
                {
                    Informe = (string)m["informe"],
                    Verificacion = (string)m["verificacion"],
                    Tabla = (string)m["tabla"],
                    Respuestas = Etiquetadas(m["respuestas"]),
                });
                Assert.That(obtenido, Is.EqualTo(archivo));
            }
        }

        // Port de guard:specs: lo que el script de página espera de cada spec.
        [Test]
        public void LasSpecsCumplenElContrato()
        {
            var fallos = new List<string>();
            var specs = (JObject)JsonEstricto.Leer(Datos.Specs)["specs"];
            foreach (var p in specs.Properties())
            {
                var (id, s) = (p.Name, (JObject)p.Value);
                foreach (var campo in new[] { "newConversationUrl", "composer", "submit", "assistantMessage", "completion" })
                    if (!Existe(s[campo])) fallos.Add($"{id}: falta {campo}");
                if (!new[] { "insertText", "pegado", "lineaSuave", "lineaParrafo" }.Contains(s["escritura"]?.Type == JTokenType.String ? (string)s["escritura"] : null))
                    fallos.Add($"{id}: escritura no válida");
                if (!Existe(s["completion"])) continue;
                var c = s["completion"];
                var kind = c["kind"]?.Type == JTokenType.String ? (string)c["kind"] : null;
                bool esNumero = c["quiescenceMs"]?.Type == JTokenType.Integer || c["quiescenceMs"]?.Type == JTokenType.Float;
                if (kind == "element-gone")
                {
                    if (!(c["selector"]?.Type == JTokenType.String && ((string)c["selector"]).Length > 0)) fallos.Add($"{id}: element-gone sin selector");
                }
                else if (kind == "quiescence")
                {
                    if (!(esNumero && (double)c["quiescenceMs"] >= 10000)) fallos.Add($"{id}: quiescence con menos de 10000 ms");
                    if (!(s["_notaFin"]?.Type == JTokenType.String && ((string)s["_notaFin"]).Length > 0)) fallos.Add($"{id}: quiescence sin _notaFin");
                }
                else fallos.Add($"{id}: completion.kind {kind} no existe");
                if (!esNumero) fallos.Add($"{id}: quiescenceMs no es un número");
                if (Registro.AJson(s).Contains("aria-label=") && s["_notaIdioma"]?.Type != JTokenType.String) fallos.Add($"{id}: aria-label sin _notaIdioma");
            }
            foreach (var p in specs.Properties())
            {
                var s = (JObject)p.Value;
                if (Verdadero(s["modelLabel"])) continue;
                if (!(s["_notaModelo"]?.Type == JTokenType.String && Js.Trim((string)s["_notaModelo"]).Length >= 40)) fallos.Add($"{p.Name}: sin modelLabel ni _notaModelo");
            }
            Assert.That(fallos, Is.Empty);
            Assert.That(specs.Count, Is.EqualTo(10), "D62: perplexity es el décimo");
        }

        // spec[campo] == null de JS: ni ausente ni null.
        static bool Existe(JToken t) => t != null && t.Type != JTokenType.Null;

        static bool Verdadero(JToken t)
        {
            if (!Existe(t)) return false;
            switch (t.Type)
            {
                case JTokenType.String: return ((string)t).Length > 0;
                case JTokenType.Boolean: return (bool)t;
                case JTokenType.Integer:
                case JTokenType.Float: return (double)t != 0 && !double.IsNaN((double)t);
                default: return true;
            }
        }

        // T21: lo que quedó en el compositor después de pegar la operación, como lo verificaba
        // escribirYVerificarOperacion de Electron: las diez cadenas del prompt (sin las marcas, que
        // pueden partirlas) y después la igualdad carácter por carácter, con \r\n y el espacio duro normalizados.
        [Test]
        public void LaOperacionEscritaSeVerificaComoEnElectron()
        {
            var (pegado, _) = Cuerpos.InsertarMarcasIntercaladas(Prompts.ArmarPromptOperacion("¿La pregunta?", RespuestasEtiquetadas), "t");
            var (conArchivo, _) = Prompts.ArmarPromptOperacionConArchivo("¿La pregunta?", RespuestasEtiquetadas);
            Assert.That(Cuerpos.VerificarEscritura(pegado, pegado), Is.Null);
            Assert.That(Cuerpos.VerificarEscritura(conArchivo, conArchivo), Is.Null);

            var duro = ((char)0xA0).ToString();
            Assert.That(Cuerpos.VerificarEscritura(pegado, pegado.Replace("\n", "\r\n").Replace(" ", duro)), Is.Null);

            var partido = pegado.Replace("LIMITACION:CORPUS", "LIMITACION:\n[[CC-MARCA-099-t]]\nCORPUS");
            Assert.That(Cuerpos.VerificarEscritura(partido, partido), Is.Null);

            Assert.That(Cuerpos.VerificarEscritura(pegado, pegado.Replace("DIVERGENCIA", "DIVERGENC1A")), Is.EqualTo("prompt incompleto: faltan DIVERGENCIA"));

            var lineas = pegado.Split('\n').Length;
            Assert.That(Cuerpos.VerificarEscritura(pegado, pegado + "x"),
                Is.EqualTo($"el compositor no es igual al prompt: {lineas} de {lineas} líneas, {pegado.Length + 1} de {pegado.Length} caracteres"));
        }

        // T22: el prompt de un rol no lleva las cadenas de la operación; se verifica solo la igualdad
        // (pegarEnPanelDeRol de Electron), con la misma normalización.
        [Test]
        public void ElPromptDeUnRolSeVerificaPorIgualdad()
        {
            var prompt = Prompts.ArmarPromptRedactor("¿La pregunta?");
            Assert.That(Cuerpos.VerificarIgualdad(prompt, prompt.Replace("\n", "\r\n").Replace(" ", ((char)0xA0).ToString())), Is.Null);
            var lineas = prompt.Split('\n').Length;
            Assert.That(Cuerpos.VerificarIgualdad(prompt, prompt.Substring(1)),
                Is.EqualTo($"el compositor no es igual al prompt: {lineas} de {lineas} líneas, {prompt.Length - 1} de {prompt.Length} caracteres"));
            Assert.That(Cuerpos.VerificarIgualdad(prompt, ""), Is.EqualTo($"el compositor no es igual al prompt: 0 de {lineas} líneas, 0 de {prompt.Length} caracteres"));
        }

        [Test]
        public void LosRolesPorDefectoSonLosDeLaVersionElectronYCumplenSusReglas()
        {
            Assert.That(new[] { Roles.IntegradorPorDefecto, Roles.Verificador1PorDefecto, Roles.Verificador2PorDefecto, Roles.RedactorPorDefecto },
                Is.EqualTo(Referencias.RolesPorDefecto));
            var ids = ((JObject)JsonEstricto.Leer(Datos.Specs)["specs"]).Properties().Select(p => p.Name).ToList();
            Assert.That(ids, Is.EquivalentTo(Roles.Conocidos), "specs.json y los conocidos son los mismos diez");
            var verificadores = new[] { Roles.Verificador1PorDefecto, Roles.Verificador2PorDefecto };
            Assert.That(verificadores, Is.Unique);
            Assert.That(verificadores, Does.Not.Contain(Roles.IntegradorPorDefecto).And.Not.Contain(Roles.RedactorPorDefecto));
            // Si el redactor no fuera el integrador, saldría un proveedor del pool de siete.
            Assert.That(Roles.RedactorPorDefecto, Is.EqualTo(Roles.IntegradorPorDefecto));
        }
    }
}
