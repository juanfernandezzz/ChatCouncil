using System.Collections.Generic;
using Newtonsoft.Json;

namespace ChatCouncil.Motor
{
    // Los dieciséis hechos del registro (packages/domain/src/index.ts). El orden
    // de las propiedades es el orden en que las escriben las funciones de
    // registro.ts: así una línea escrita acá es la misma que escribe Electron.
    // Los valores de texto como "observado" o "salida-operador" van como string,
    // igual que en el JSON: un enum agregaría una traducción sin ganar nada.

    public abstract class Hecho
    {
    }

    public sealed class Conversacion : Hecho
    {
        public string Tipo => "conversacion";
        public int Esquema { get; set; } = Dominio.VersionEsquema;
        public string Id { get; set; }
        public string CreadaEn { get; set; }
        public string Titulo { get; set; }
        public bool EsPrueba { get; set; }
    }

    public sealed class Ronda : Hecho
    {
        public string Tipo => "ronda";
        public int Esquema { get; set; } = Dominio.VersionEsquema;
        public string Id { get; set; }
        public string ConversacionId { get; set; }
        public int Indice { get; set; }
        public string Prompt { get; set; }
        public string EnviadaEn { get; set; }
        public string Semilla { get; set; }
    }

    public sealed class Intento : Hecho
    {
        public string Tipo => "intento";
        public int Esquema { get; set; } = Dominio.VersionEsquema;
        public string Id { get; set; }
        public string RondaId { get; set; }
        public string ProveedorId { get; set; }
        public bool Ok { get; set; }
        public string Error { get; set; }
        public string EnviadoEn { get; set; }
    }

    public sealed class Procedencia
    {
        public string ModelLabel { get; set; }
        public string ModelLabelLeidaEn { get; set; }
        /// <summary>"observado" o "inferido".</summary>
        public string FinDe { get; set; }
        public int? QuiescenceMs { get; set; }
        /// <summary>true generando, false terminado, null no observable.</summary>
        public bool? GenerandoAlLeer { get; set; }
        /// <summary>"confirmada", "refutada" o "indeterminada".</summary>
        public string Continuidad { get; set; }
        public string MetodoEscritura { get; set; }
        public string Panel { get; set; }
    }

    public sealed class CopiaDeRespuesta
    {
        public string RondaId { get; set; }
        public string RespuestaId { get; set; }
    }

    public sealed class Respuesta : Hecho
    {
        public string Tipo => "respuesta";
        public int Esquema { get; set; } = Dominio.VersionEsquema;
        public string Id { get; set; }
        public string RondaId { get; set; }
        public string ProveedorId { get; set; }
        public string TextoOriginal { get; set; }
        public string LeidaEn { get; set; }
        public string Error { get; set; }
        public Procedencia Procedencia { get; set; }
        public string PromptUsuarioLeido { get; set; }
        public bool? PromptCoincideEnPool { get; set; }
        public int? FuentesHref { get; set; }
        public string Html { get; set; }
        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public CopiaDeRespuesta CopiadaDe { get; set; }
    }

    public sealed class Cita : Hecho
    {
        public string Tipo => "cita";
        public int Esquema { get; set; } = Dominio.VersionEsquema;
        public string Id { get; set; }
        public string RespuestaId { get; set; }
        public string Url { get; set; }
        public string TextoVisible { get; set; }
        /// <summary>"cuerpo" o "panel-ancestro".</summary>
        public string DondeVive { get; set; }
    }

    public sealed class Sello : Hecho
    {
        public string Tipo => "sello";
        public int Esquema { get; set; } = Dominio.VersionEsquema;
        public string Id { get; set; }
        public string RondaId { get; set; }
        public string Label { get; set; }
        public string CodigoEstable { get; set; }
        public string PanelSourceId { get; set; }
        public string ReplyId { get; set; }
        public string AttemptId { get; set; }
    }

    public sealed class CopiaDeSalida
    {
        public string RondaId { get; set; }
        public string SalidaOperadorId { get; set; }
    }

    public sealed class SalidaOperador : Hecho
    {
        public string Tipo => "salida-operador";
        public int Esquema { get; set; } = Dominio.VersionEsquema;
        public string Id { get; set; }
        public string RondaId { get; set; }
        public string OperadorId { get; set; }
        public string PromptCompleto { get; set; }
        public string SalidaCruda { get; set; }
        public string RecibidaEn { get; set; }
        public string Html { get; set; }
        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public CopiaDeSalida CopiadaDe { get; set; }
    }

    public sealed class HallazgoHecho : Hecho
    {
        public string Tipo => "hallazgo";
        public int Esquema { get; set; } = Dominio.VersionEsquema;
        public string Id { get; set; }
        public string SalidaOperadorId { get; set; }
        public string Categoria { get; set; }
        public string Eje { get; set; }
        public List<string> Etiquetas { get; set; }
        public string Descripcion { get; set; }
        public bool EtiquetaInvalida { get; set; }
    }

    public sealed class InformeIntegrador : Hecho
    {
        public string Tipo => "informe-integrador";
        public int Esquema { get; set; } = Dominio.VersionEsquema;
        public string Id { get; set; }
        public string RondaId { get; set; }
        public string OperadorId { get; set; }
        public string PromptCompleto { get; set; }
        public string InformeCrudo { get; set; }
        public string Titulo { get; set; }
        public string RecibidaEn { get; set; }
        public string Html { get; set; }
    }

    public sealed class SalidaVerificador : Hecho
    {
        public string Tipo => "salida-verificador";
        public int Esquema { get; set; } = Dominio.VersionEsquema;
        public string Id { get; set; }
        public string RondaId { get; set; }
        public string VerificadorId { get; set; }
        public string PromptCompleto { get; set; }
        public string SalidaCruda { get; set; }
        public string RecibidaEn { get; set; }
        public string Html { get; set; }
    }

    public sealed class RespuestaRedactor : Hecho
    {
        public string Tipo => "respuesta-redactor";
        public int Esquema { get; set; } = Dominio.VersionEsquema;
        public string Id { get; set; }
        public string RondaId { get; set; }
        public string RedactorId { get; set; }
        public string PromptCompleto { get; set; }
        public string TextoCrudo { get; set; }
        public string Html { get; set; }
        public string MarcaPrimera { get; set; }
        public string MarcaUltima { get; set; }
        public string RecibidaEn { get; set; }
    }

    public sealed class UrlComprobada : Hecho
    {
        public string Tipo => "url-comprobada";
        public int Esquema { get; set; } = Dominio.VersionEsquema;
        public string Id { get; set; }
        public string RondaId { get; set; }
        public string SalidaVerificadorId { get; set; }
        public string Url { get; set; }
        /// <summary>Estado HTTP final; null = no resolvió.</summary>
        public int? Codigo { get; set; }
        public string Detalle { get; set; }
        public string ComprobadaEn { get; set; }
    }

    public sealed class CondicionHerramientas : Hecho
    {
        public string Tipo => "condicion-herramientas";
        public int Esquema { get; set; } = Dominio.VersionEsquema;
        public string Id { get; set; }
        public string RondaId { get; set; }
        public string ProveedorId { get; set; }
        public string Etapa { get; set; }
        public bool BusquedaWebActivada { get; set; }
        public string Fuente { get; set; }
        public string RegistradoEn { get; set; }
    }

    public sealed class ErrorCaptura : Hecho
    {
        public string Tipo => "error-captura";
        public int Esquema { get; set; } = Dominio.VersionEsquema;
        public string Id { get; set; }
        public string RondaId { get; set; }
        public string EtapaEsperada { get; set; }
        public string TipoCapturaIntentado { get; set; }
        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public string ProveedorId { get; set; }
        public string Detalle { get; set; }
        public string OcurridoEn { get; set; }
    }

    public sealed class PreguntaDeclarada : Hecho
    {
        public string Tipo => "pregunta-declarada";
        public int Esquema { get; set; } = Dominio.VersionEsquema;
        public string Id { get; set; }
        public string RondaId { get; set; }
        public string Texto { get; set; }
        public string DeclaradaEn { get; set; }
        public string Procedencia { get; set; } = "declarado-por-usuario";
    }

    public sealed class CondicionProveedoresCargados : Hecho
    {
        public string Tipo => "condicion-proveedores-cargados";
        public int Esquema { get; set; } = Dominio.VersionEsquema;
        public string Id { get; set; }
        public string RondaId { get; set; }
        public List<string> Proveedores { get; set; }
        public string Integrador { get; set; }
        public string RegistradoEn { get; set; }
    }
}
