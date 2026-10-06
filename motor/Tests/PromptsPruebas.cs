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
            Assert.That(specs.Count, Is.EqualTo(9));
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

        [Test]
        public void LosRolesPorDefectoSonLosDeLaVersionElectronYCumplenSusReglas()
        {
            Assert.That(new[] { Roles.IntegradorPorDefecto, Roles.VerificadorPorDefecto, Roles.RedactorPorDefecto }, Is.EqualTo(Referencias.RolesPorDefecto));
            var ids = ((JObject)JsonEstricto.Leer(Datos.Specs)["specs"]).Properties().Select(p => p.Name).ToList();
            Assert.That(ids, Does.Contain(Roles.IntegradorPorDefecto).And.Contain(Roles.VerificadorPorDefecto).And.Contain(Roles.RedactorPorDefecto));
            Assert.That(Roles.IntegradorPorDefecto, Is.Not.EqualTo(Roles.VerificadorPorDefecto));
            Assert.That(Roles.RedactorPorDefecto, Is.Not.EqualTo(Roles.VerificadorPorDefecto));
            // Si el redactor no fuera el integrador, saldría un proveedor del pool de siete.
            Assert.That(Roles.RedactorPorDefecto, Is.EqualTo(Roles.IntegradorPorDefecto));
        }
    }
}
