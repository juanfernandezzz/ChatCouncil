/**
 * Fase 5 — el informe final también se entrega en PDF. El `.md` sigue siendo
 * el dato original; esto sólo lo presenta. El informe trae texto escrito por
 * modelos: el HTML crudo del Markdown se ESCAPA (se ve escrito), nunca se
 * inserta, y la ventana que imprime no corre JavaScript.
 */
import { BrowserWindow, shell } from "electron";
import { Marked } from "marked";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const escapar = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Bloques y fragmentos de HTML del Markdown pasan por `html()`: salen como texto.
const marked = new Marked({ renderer: { html: ({ text }) => escapar(text) } });

const PLANTILLA = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Informe de ronda — ChatCouncil</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; font-size: 11pt;
         line-height: 1.55; color: #1a1a1a; margin: 0; }
  h1 { font-size: 20pt; margin: 0 0 0.3em 0; padding-bottom: 0.3em;
       border-bottom: 2px solid #1a1a1a; }
  h2 { font-size: 14pt; margin: 1.6em 0 0.5em 0; padding-bottom: 0.2em;
       border-bottom: 1px solid #bbb; page-break-after: avoid; }
  h3 { font-size: 12pt; margin: 1.2em 0 0.4em 0; page-break-after: avoid; }
  p { margin: 0 0 0.7em 0; text-align: justify; }
  strong { color: #000; }
  blockquote { margin: 0.4em 0 1em 0; padding: 0.4em 0.9em;
               border-left: 3px solid #999; background: #f5f5f5;
               color: #333; }
  table { border-collapse: collapse; width: 100%; margin: 0.6em 0 1em 0;
          font-size: 9.5pt; page-break-inside: avoid; }
  th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left;
           vertical-align: top; }
  th { background: #eee; }
  code { font-family: Consolas, "Courier New", monospace; font-size: 9.5pt;
         background: #f0f0f0; padding: 0 2px; }
  ul, ol { margin: 0 0 0.8em 1.2em; padding: 0; }
  li { margin-bottom: 0.3em; }
</style>
</head>
<body>
{{CONTENIDO}}
</body>
</html>`;

const PIE =
  '<div style="width:100%;font-size:8px;color:#666;text-align:center;font-family:Georgia,serif;">ChatCouncil — página <span class="pageNumber"></span> de <span class="totalPages"></span></div>';

export function informeAHtml(markdown: string): string {
  // replace con función: un `$` del contenido no se interpreta como patrón.
  return PLANTILLA.replace("{{CONTENIDO}}", () => marked.parse(markdown, { async: false }));
}

/** Escribe `rutaPdf` a partir del Markdown. Tira si algo falla; el llamador decide. */
export async function generarPdfDeInforme(markdown: string, rutaPdf: string): Promise<void> {
  const html = informeAHtml(markdown);
  // Archivo temporal y no data: URL — los data: URL tienen tope de tamaño.
  const dirTmp = mkdtempSync(join(tmpdir(), "cc-informe-"));
  const w = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false },
  });
  try {
    const rutaHtml = join(dirTmp, "informe.html");
    writeFileSync(rutaHtml, html, "utf8");
    await w.loadFile(rutaHtml);
    const pdf = await w.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      margins: { top: 0.8, bottom: 0.8, left: 0.8, right: 0.8 },
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: PIE,
    });
    writeFileSync(rutaPdf, pdf, { flag: "wx" });
  } finally {
    w.destroy();
    // Un temporal que no se pudo borrar (EBUSY en Windows) no debe tapar el motivo real.
    try {
      rmSync(dirTmp, { recursive: true, force: true });
    } catch {
      /* queda en %TEMP% */
    }
  }
}

/**
 * Al lado del `.md` (ya guardado, no se toca) va el `.pdf` con el mismo nombre
 * y se abre ESE. Si el PDF falla, el `.md` queda y se abre la carpeta como
 * antes: nunca se pierde el informe por el PDF.
 */
export async function entregarPdfDeInforme(
  texto: string,
  rutaMd: string,
  generar: (md: string, rutaPdf: string) => Promise<void> = generarPdfDeInforme,
): Promise<{ ok: boolean; mensaje: string; ruta?: string }> {
  const rutaPdf = rutaMd.replace(/\.md$/, ".pdf");
  try {
    await generar(texto, rutaPdf);
  } catch (e) {
    shell.showItemInFolder(rutaMd);
    const motivo = e instanceof Error ? e.message : String(e);
    return { ok: true, mensaje: `Informe guardado solo en Markdown: no se pudo generar el PDF (${motivo}).`, ruta: rutaMd };
  }
  void shell.openPath(rutaPdf);
  return { ok: true, mensaje: `Informe guardado. Se abrió el PDF: ${rutaPdf}`, ruta: rutaPdf };
}
