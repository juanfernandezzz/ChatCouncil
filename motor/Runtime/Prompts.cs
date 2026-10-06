using System;
using System.Collections.Generic;
using System.Linq;

namespace ChatCouncil.Motor
{
    public sealed class HallazgoParaIntegrador
    {
        /// <summary>"H12".</summary>
        public string Id { get; set; }
        public string Categoria { get; set; }
        /// <summary>null en las líneas LIMITACION.</summary>
        public string Eje { get; set; }
        public IReadOnlyList<string> Etiquetas { get; set; }
        public string Descripcion { get; set; }
        /// <summary>"O4": el operador, anonimizado, que registró el hallazgo.</summary>
        public string Operador { get; set; }
    }

    public sealed class HallazgoParaVerificador
    {
        public string Id { get; set; }
        public string Categoria { get; set; }
        public string Eje { get; set; }
        public string Descripcion { get; set; }
    }

    public sealed class HallazgoParaTabla
    {
        /// <summary>El Id real del HallazgoHecho: nunca viaja al integrador, sirve para desanonimizar el informe.</summary>
        public string HallazgoIdOriginal { get; set; }
        public string Categoria { get; set; }
        public string Eje { get; set; }
        public IReadOnlyList<string> Etiquetas { get; set; }
        public string Descripcion { get; set; }
        /// <summary>El proveedor real del operador: nunca viaja al integrador.</summary>
        public string OperadorIdOriginal { get; set; }
    }

    // En el orden de los campos del TypeScript: el JSON sale igual.
    public sealed class FilaTabla
    {
        public string CodigoHallazgo { get; set; }
        public string HallazgoIdOriginal { get; set; }
        public string CodigoOperador { get; set; }
        public string OperadorIdOriginal { get; set; }
        public string Categoria { get; set; }
        public string Eje { get; set; }
        public IReadOnlyList<string> Etiquetas { get; set; }
        public string Descripcion { get; set; }
    }

    public sealed class TablaHallazgos
    {
        public List<FilaTabla> Filas { get; set; }
        /// <summary>Lo que recibe ArmarPromptIntegrador como {{HALLAZGOS}}.</summary>
        public List<HallazgoParaIntegrador> ParaPrompt { get; set; }
    }

    /// <summary>Lo que va en el archivo del redactor, ya en texto.</summary>
    public sealed class MaterialRedactor
    {
        /// <summary>El informe del integrador, re-derivado del html.</summary>
        public string Informe { get; set; }
        /// <summary>La salida cruda del verificador; null si no se capturó.</summary>
        public string Verificacion { get; set; }
        /// <summary>La tabla H## tal como la vio el integrador.</summary>
        public string Tabla { get; set; }
        /// <summary>Las siete respuestas, con la misma etiqueta P# que usa la tabla.</summary>
        public IReadOnlyList<(string Etiqueta, string Texto)> Respuestas { get; set; }
    }

    /// <summary>
    /// Port de prompt-operacion.ts, prompt-integrador.ts, prompt-verificador.ts y
    /// prompt-redactor.ts. Las plantillas son los literales de Datos.g.cs; sólo
    /// se sustituyen sus marcadores.
    /// </summary>
    public static class Prompts
    {
        // Partiendo y juntando, nunca con un reemplazo que interprete patrones, y en
        // UNA SOLA pasada: se parte por el primer marcador y los siguientes se
        // sustituyen dentro de cada parte, así lo insertado no se vuelve a recorrer.
        static string Sustituir(string texto, params (string Marcador, string Valor)[] pares) =>
            pares.Length == 0
                ? texto
                : string.Join(pares[0].Valor, texto.Split(new[] { pares[0].Marcador }, StringSplitOptions.None).Select(p => Sustituir(p, pares.Skip(1).ToArray())));

        static string CuerpoDe(IEnumerable<(string Etiqueta, string Texto)> respuestas) =>
            string.Join("\n\n", respuestas.Select(r => $"=== {r.Etiqueta} ===\n{r.Texto}"));

        public static string ArmarPromptOperacion(string pregunta, IReadOnlyList<(string Etiqueta, string Texto)> respuestas) =>
            Sustituir(Datos.PlantillaOperacion, ("{{PREGUNTA}}", pregunta), ("{{CUERPO}}", CuerpoDe(respuestas)));

        /// <summary>
        /// La vía de archivo: el prompt se pega sin el cuerpo, y el cuerpo (con sus
        /// separadores === P# ===) va en el archivo. Las marcas las intercala quien llama.
        /// </summary>
        public static (string Prompt, string CuerpoArchivo) ArmarPromptOperacionConArchivo(string pregunta, IReadOnlyList<(string Etiqueta, string Texto)> respuestas) =>
            (Sustituir(Datos.PlantillaOperacionConArchivo, ("{{PREGUNTA}}", pregunta)), CuerpoDe(respuestas));

        public static string TablaDe(IEnumerable<HallazgoParaIntegrador> hallazgos) =>
            string.Join("\n", hallazgos.Select(h =>
                string.Join("|", h.Id, h.Categoria, h.Eje ?? "", h.Etiquetas.Count == 0 ? "—" : string.Join(",", h.Etiquetas), h.Descripcion, h.Operador)));

        public static string ArmarPromptIntegrador(string pregunta, IReadOnlyList<HallazgoParaIntegrador> hallazgos) =>
            Sustituir(Datos.PlantillaIntegrador, ("{{PREGUNTA}}", pregunta), ("{{HALLAZGOS}}", TablaDe(hallazgos)));

        /// <summary>
        /// "rescate" es la sección QUE CONVIENE RESCATAR del integrador, tal cual;
        /// "hallazgos", sólo los que esa sección referencia, en su orden.
        /// </summary>
        public static string ArmarPromptVerificador(string pregunta, string rescate, IReadOnlyList<HallazgoParaVerificador> hallazgos) =>
            Sustituir(Datos.PlantillaVerificador,
                ("{{PREGUNTA}}", pregunta),
                ("{{RESCATE}}", rescate),
                ("{{HALLAZGOS}}", string.Join("\n", hallazgos.Select(h => string.Join("|", h.Id, h.Categoria, h.Eje ?? "", h.Descripcion)))));

        /// <summary>
        /// La tabla que recibe el integrador (armar-tabla-hallazgos.ts). H## es el
        /// orden de persistencia, nunca barajado; O## es el operador, barajado con la
        /// semilla de la ronda y el pool en su orden fijo: el integrador no puede
        /// saber qué operador registró qué.
        /// </summary>
        public static TablaHallazgos ArmarTablaHallazgos(IReadOnlyList<HallazgoParaTabla> hallazgos, IReadOnlyList<string> poolOperadores, uint semilla)
        {
            var codigoOperadorDe = new Dictionary<string, string>();
            var barajados = Anonimizacion.Barajar(poolOperadores, semilla);
            for (int i = 0; i < barajados.Count; i++) codigoOperadorDe[barajados[i]] = $"O{i + 1}";
            var filas = hallazgos.Select((h, i) => new FilaTabla
            {
                CodigoHallazgo = $"H{i + 1}",
                HallazgoIdOriginal = h.HallazgoIdOriginal,
                CodigoOperador = codigoOperadorDe.TryGetValue(h.OperadorIdOriginal, out var codigo)
                    ? codigo
                    : throw new InvalidOperationException($"hallazgo {h.HallazgoIdOriginal}: operador \"{h.OperadorIdOriginal}\" no está en el pool de operadores"),
                OperadorIdOriginal = h.OperadorIdOriginal,
                Categoria = h.Categoria,
                Eje = h.Eje,
                Etiquetas = h.Etiquetas,
                Descripcion = h.Descripcion,
            }).ToList();
            var paraPrompt = filas.Select(f => new HallazgoParaIntegrador
            {
                Id = f.CodigoHallazgo,
                Categoria = f.Categoria,
                Eje = f.Eje,
                Etiquetas = f.Etiquetas,
                Descripcion = f.Descripcion,
                Operador = f.CodigoOperador,
            }).ToList();
            return new TablaHallazgos { Filas = filas, ParaPrompt = paraPrompt };
        }

        public static string ArmarPromptRedactor(string pregunta) => Sustituir(Datos.PlantillaRedactor, ("{{PREGUNTA}}", pregunta));

        /// <summary>El archivo del redactor, en el orden que describe su prompt. Las marcas las intercala quien llama.</summary>
        public static string ArmarArchivoRedactor(MaterialRedactor m) =>
            string.Join("\n\n",
                "===== INFORME =====",
                m.Informe,
                "===== VERIFICACION =====",
                m.Verificacion ?? "(sin verificacion capturada en esta ronda)",
                "===== HALLAZGOS =====",
                "H##|CATEGORIA|EJE|RESPUESTAS|DESCRIPCION|OPERADOR",
                m.Tabla,
                "===== RESPUESTAS =====",
                CuerpoDe(m.Respuestas));
    }
}
