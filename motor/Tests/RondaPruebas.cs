using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;

namespace ChatCouncil.Motor.Pruebas
{
    public class RondaPruebas
    {
        static readonly List<string> Pool7 = Referencias.PoolCuerpos.Take(7).ToList();

        [Test]
        public void LasCitasSonLasMismasQueEnTypeScript()
        {
            foreach (var (html, esperado) in Referencias.Citas)
            {
                int n = 0;
                var r = Citas.ExtraerCitas(html, "resp-1", () => $"c{++n}");
                var obtenido = Registro.AJson(new
                {
                    citas = r.Citas,
                    anclasVistas = r.AnclasVistas,
                    descartados = r.Descartados.Select(d => new { motivo = d.Motivo, href = d.Href }),
                });
                Assert.That(obtenido, Is.EqualTo(esperado), html);
            }
        }

        // T1: las cuatro reglas de descarte, cada una con su motivo.
        [Test]
        public void LosCuatroDescartesDeT1()
        {
            var r = Citas.ExtraerCitas("<a>x</a><a href=\"#\">x</a><a href=\"javascript:void(0)\">x</a><a href=\"/relativa\">x</a>", "r", () => "c");
            Assert.That(r.Citas, Is.Empty);
            Assert.That(r.Descartados.Select(d => d.Motivo), Is.EqualTo(new[] { "sin-href", "no-absoluta-http", "esquema-no-http", "no-absoluta-http" }));
        }

        // chatgpt: el chip inline vive en el cuerpo; la lista "Fuentes clave", en el panel.
        [Test]
        public void ElChipInlineEsCuerpoYLaListaDeFuentesClaveEsPanel()
        {
            var r = Citas.ExtraerCitas(Referencias.Citas[1].html, "r", () => "c");
            Assert.That(r.Citas.Select(c => c.DondeVive), Is.EqualTo(new[] { "cuerpo", "panel-ancestro" }));
        }

        [Test]
        public void LaTablaDeHallazgosEsLaMismaQueEnTypeScript()
        {
            var para = JsonEstricto.Leer(Referencias.ParaTabla).Select(h => new HallazgoParaTabla
            {
                HallazgoIdOriginal = (string)h["hallazgoIdOriginal"],
                Categoria = (string)h["categoria"],
                Eje = (string)h["eje"],
                Etiquetas = h["etiquetas"].Select(e => (string)e).ToList(),
                Descripcion = (string)h["descripcion"],
                OperadorIdOriginal = (string)h["operadorIdOriginal"],
            }).ToList();
            var t = Prompts.ArmarTablaHallazgos(para, Pool7, Anonimizacion.HashSemilla("semilla-fija"));
            Assert.That(Registro.AJson(new { filas = t.Filas, paraPrompt = t.ParaPrompt }), Is.EqualTo(Referencias.Tabla));

            para[0].OperadorIdOriginal = "deepseek";
            Assert.That(() => Prompts.ArmarTablaHallazgos(para.Take(1).ToList(), Pool7, 1u), Throws.InvalidOperationException.With.Message.EqualTo(Referencias.ErrorTabla));
        }

        // Un operador recapturado: la tabla usa su última salida, en el orden de su primera captura.
        [Test]
        public void LasSalidasVigentesSonLaUltimaDeCadaOperador()
        {
            var hechos = Registro.Leer(Referencias.RegistroVigentes).Hechos;
            var v = Dominio.SalidasVigentesDeRonda(hechos, "R");
            Assert.That(Registro.AJson(v.Select(s => new { operadorId = s.OperadorId, salidaId = s.SalidaId, hallazgos = s.Hallazgos })), Is.EqualTo(Referencias.Vigentes));
            Assert.That(Dominio.UltimoInformeIntegrador(hechos, "R").Id, Is.EqualTo(Referencias.UltimoIntegrador));
        }

        [Test]
        public void LasEtiquetasValidasSonLasDelPoolMenosLaPropia()
        {
            var sello = Pool7.Select((id, i) => new Sello { PanelSourceId = id, CodigoEstable = $"P{i + 1}" }).ToList();
            foreach (var (operador, validas) in Referencias.EtiquetasValidas)
                Assert.That(Dominio.EtiquetasValidasDelOperador(operador, Pool7, sello), Is.EqualTo(validas), operador);
            Assert.That(() => Dominio.EtiquetasValidasDelOperador("chatgpt", Pool7, sello.Skip(1).Take(2).ToList()),
                Throws.InvalidOperationException.With.Message.EqualTo(Referencias.ErrorEtiquetas));
        }

        [Test]
        public void LasLecturasSeClasificanPorEtapa()
        {
            var lecturas = new[] { "chatgpt", "gemini", "deepseek", "glm", "kimi" };
            foreach (var (etapa, operacion, integrador, verificador, redactor, comoRespuesta) in Referencias.Clasificaciones)
            {
                var c = Dominio.ClasificarLecturasPorEtapa(lecturas, x => x, etapa, Pool7, "deepseek", "glm", "kimi");
                Assert.That(c.Operacion, Is.EqualTo(operacion), etapa);
                Assert.That(c.Integrador, Is.EqualTo(integrador), etapa);
                Assert.That(c.Verificador, Is.EqualTo(verificador), etapa);
                Assert.That(c.Redactor, Is.EqualTo(redactor), etapa);
                Assert.That(c.ComoRespuesta, Is.EqualTo(comoRespuesta), etapa);
            }
        }

        [Test]
        public void LaSeleccionYLosRolesSeLeenComoEnTypeScript()
        {
            foreach (var (contenido, seleccion, roles) in Referencias.Selecciones)
            {
                Assert.That(Registro.AJson(Roles.LeerSeleccion(contenido, Referencias.Conocidos)), Is.EqualTo(seleccion), contenido);
                var r = Roles.Leer(contenido, Referencias.Conocidos);
                Assert.That(Registro.AJson(new { integrador = r.Integrador, verificador = r.Verificador, redactor = r.Redactor }), Is.EqualTo(roles), contenido);
            }
        }

        // Los casos del BLUEPRINT: selección vacía, roles iguales o desmarcados, redactor = verificador rechazado.
        [Test]
        public void LaSeleccionSeValidaComoEnTypeScript()
        {
            foreach (var (marcados, integrador, verificador, redactor, esperado) in Referencias.Guardados)
            {
                var error = Roles.ValidarSeleccion(Referencias.Conocidos, marcados, integrador, verificador, redactor);
                Assert.That(Registro.AJson(error == null ? (object)new { ok = true } : new { ok = false, error }), Is.EqualTo(esperado));
            }
        }

        // INVESTIGADORES de index.ts: el orden en que la configuración muestra a los nueve.
        [Test]
        public void LosConocidosSonLosDeTypeScript() => Assert.That(Roles.Conocidos, Is.EqualTo(Referencias.Conocidos));

        // T19: lo que la configuración escribe es lo que el arranque lee, y una selección inválida no se escribe.
        [Test]
        public void LaSeleccionGuardadaSeLeeIgualAlReabrir()
        {
            foreach (var (marcados, integrador, verificador, redactor, _) in Referencias.Guardados)
            {
                var (error, contenido) = Roles.Guardar(Referencias.Conocidos, marcados, integrador, verificador, redactor, "2026-10-10T12:00:00.000Z");
                Assert.That(error, Is.EqualTo(Roles.ValidarSeleccion(Referencias.Conocidos, marcados, integrador, verificador, redactor)));
                if (error != null)
                {
                    Assert.That(contenido, Is.Null, error);
                    continue;
                }
                Assert.That(Roles.LeerSeleccion(contenido, Referencias.Conocidos), Is.EqualTo(Referencias.Conocidos.Where(marcados.Contains)));
                var r = Roles.Leer(contenido, Referencias.Conocidos);
                Assert.That((r.Integrador, r.Verificador, r.Redactor), Is.EqualTo((integrador, verificador, redactor)));
            }
        }

        // El mismo formato que JSON.stringify(..., null, 2) de seleccion-proveedores.ts.
        [Test]
        public void LaSeleccionSeEscribeConElFormatoDeTypeScript()
        {
            var (_, contenido) = Roles.Guardar(Referencias.Conocidos, new[] { "glm", "chatgpt" }, "chatgpt", "glm", "chatgpt", "2026-10-10T12:00:00.000Z");
            Assert.That(contenido, Is.EqualTo(
                "{\n  \"proveedores\": [\n    \"chatgpt\",\n    \"glm\"\n  ],\n  \"integrador\": \"chatgpt\",\n  \"verificador\": \"glm\",\n" +
                "  \"redactor\": \"chatgpt\",\n  \"guardadoEn\": \"2026-10-10T12:00:00.000Z\"\n}"));
        }

        // D10: la sesión se deduce de la página (el compositor está o no), sin leer cookies.
        [Test]
        public void LaSesionSeDeduceDelCompositor()
        {
            Assert.That(Dominio.EstadoDeSesion(JsonEstricto.Leer("\"\"")), Is.EqualTo("con-sesion"));
            Assert.That(Dominio.EstadoDeSesion(JsonEstricto.Leer("\"borrador\"")), Is.EqualTo("con-sesion"));
            Assert.That(Dominio.EstadoDeSesion(JsonEstricto.Leer("null")), Is.EqualTo("sin-sesion"));
            Assert.That(Dominio.EstadoDeSesion(null), Is.EqualTo("sin-sesion"));
        }

        [Test]
        public void ElPoolSonTodosMenosLosRoles()
        {
            foreach (var (roles, pool) in Referencias.Pooles)
            {
                var r = JsonEstricto.Leer(roles);
                var elegidos = new RolesElegidos((string)r["integrador"], (string)r["verificador"], (string)r["redactor"]);
                Assert.That(Roles.PoolDeInvestigadores(Referencias.Conocidos, elegidos), Is.EqualTo(pool), roles);
            }
        }
    }
}
