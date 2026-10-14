using System;
using System.IO;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using ChatCouncil.Motor;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace ChatCouncil.Interfaz
{
    using Panel = ChatCouncil.Panel.Panel;

    /// <summary>
    /// El puerto HTTP de la comprobación de URLs (historia 60): sin cookies ni sesión de los paneles, siguiendo
    /// redirecciones, y sin leer el cuerpo (se pide hasta las cabeceras y se suelta).
    /// </summary>
    public sealed class HttpSinCookies : IHttp
    {
        // El tiempo lo pone la Puerta con el token: aquí no hay otro tope que lo acorte.
        static readonly HttpClient Cliente = new HttpClient(new HttpClientHandler { UseCookies = false, AllowAutoRedirect = true })
        {
            Timeout = Timeout.InfiniteTimeSpan,
        };

        public async Task<int> Pedir(string url, string metodo, CancellationToken cancelar)
        {
            using (var pedido = new HttpRequestMessage(new HttpMethod(metodo), url))
            using (var respuesta = await Cliente.SendAsync(pedido, HttpCompletionOption.ResponseHeadersRead, cancelar))
                return (int)respuesta.StatusCode;
        }
    }

    /// <summary>
    /// El puerto PDF (D40): el Markdown pasa a HTML con marked 18.0.14, en una página en blanco de un panel oculto con
    /// su propio perfil, y el panel lo imprime en Carta. El HTML crudo del Markdown se escapa: lo escribió un modelo y
    /// se ve escrito, nunca se inserta.
    /// </summary>
    public sealed class PdfEnPanel : IPdf
    {
        // overflow-wrap break-word: un trozo sin cortes más ancho que la página se recortaría en silencio (medido:
        // 124 de 240 caracteres perdidos); pre-wrap por lo mismo en los bloques. print-color-adjust deja los fondos,
        // que la impresión del panel no pide. El pie numera las páginas: el informe se cita (historia 61).
        const string Estilo =
            "@page { margin: 2cm; @bottom-center { content: \"ChatCouncil · página \" counter(page) \" de \" counter(pages); font: 8pt Georgia, serif; color: #666; } } " +
            "* { -webkit-print-color-adjust: exact; print-color-adjust: exact; } " +
            "body { font-family: Georgia, \"Times New Roman\", serif; font-size: 11pt; line-height: 1.55; color: #1a1a1a; margin: 0; overflow-wrap: break-word; } " +
            "h1 { font-size: 20pt; margin: 0 0 0.3em 0; padding-bottom: 0.3em; border-bottom: 2px solid #1a1a1a; } " +
            "h2 { font-size: 14pt; margin: 1.6em 0 0.5em 0; padding-bottom: 0.2em; border-bottom: 1px solid #bbb; page-break-after: avoid; } " +
            "h3 { font-size: 12pt; margin: 1.2em 0 0.4em 0; page-break-after: avoid; } " +
            "p { margin: 0 0 0.7em 0; text-align: justify; } strong { color: #000; } " +
            "blockquote { margin: 0.4em 0 1em 0; padding: 0.4em 0.9em; border-left: 3px solid #999; background: #f5f5f5; color: #333; } " +
            "table { border-collapse: collapse; width: 100%; margin: 0.6em 0 1em 0; font-size: 9.5pt; page-break-inside: avoid; } " +
            "th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; vertical-align: top; } th { background: #eee; } " +
            "code { font-family: Consolas, \"Courier New\", monospace; font-size: 9.5pt; background: #f0f0f0; padding: 0 2px; } " +
            "pre { white-space: pre-wrap; margin: 0.4em 0 1em 0; padding: 0.5em 0.7em; background: #f0f0f0; border-left: 3px solid #ddd; } " +
            "pre code { background: none; padding: 0; } ul, ol { margin: 0 0 0.8em 1.2em; padding: 0; } li { margin-bottom: 0.3em; }";

        // breaks: el informe usa saltos simples como líneas sueltas (un operador o un hallazgo por línea); sin esto se
        // juntan en un párrafo. Se arma concatenando, no reemplazando marcadores: un título con "{{CONTENIDO}}" no
        // puede reentrar (spec).
        const string Escribir = @"((md, titulo, estilo) => {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/""/g, '&quot;').replace(/'/g, '&#39;');
  const m = new marked.Marked({ breaks: true, renderer: { html: ({ text }) => esc(text) } });
  const html = '<!DOCTYPE html><html lang=""es""><head><meta charset=""utf-8""><title>' + esc(titulo) + '</title><style>' + estilo + '</style></head><body>' + m.parse(md, { async: false }) + '</body></html>';
  document.open(); document.write(html); document.close();
  return 'ok';
})";

        static string marked;
        readonly Func<Task<Panel>> panel;

        public PdfEnPanel(Func<Task<Panel>> panel) => this.panel = panel;

        public async Task Generar(string markdown, string rutaPdf, string titulo)
        {
            // Un PDF que ya existe no se pisa: es un dato de investigación.
            if (File.Exists(rutaPdf)) throw new IOException("ya existe " + rutaPdf);
            var p = await panel();
            await p.Navegar("about:blank");
            marked = marked ?? Resources.Load<TextAsset>("Interfaz/marked").text;
            var r = await p.Ejecutar($"{marked}\n;{Escribir}({JsonConvert.ToString(markdown)}, {JsonConvert.ToString(titulo)}, {JsonConvert.ToString(Estilo)})");
            if ((string)JToken.Parse(r) != "ok") throw new InvalidOperationException("la página del PDF no se armó: " + r);
            await p.ImprimirPdf(rutaPdf);
        }
    }
}
