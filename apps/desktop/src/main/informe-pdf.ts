/**
 * Fase 5 — el informe final también se entrega en PDF. El `.md` sigue siendo
 * el dato original; esto sólo lo presenta. El informe trae texto escrito por
 * modelos: el HTML crudo del Markdown se ESCAPA (se ve escrito), nunca se
 * inserta, y la ventana que imprime no corre JavaScript.
 */
import { BrowserWindow, shell } from "electron";
import { Marked } from "marked";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SUBCARPETA_RESPUESTAS } from "@chatcouncil/analysis";

const escapar = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Bloques y fragmentos de HTML del Markdown pasan por `html()`: salen como texto.
const marked = new Marked({ renderer: { html: ({ text }) => escapar(text) } });

const PLANTILLA = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>{{TITULO}}</title>
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

export function informeAHtml(markdown: string, titulo = "Informe de ronda — ChatCouncil"): string {
  // replace con función: un `$` del contenido no se interpreta como patrón.
  return PLANTILLA.replace("{{TITULO}}", () => escapar(titulo)).replace("{{CONTENIDO}}", () =>
    marked.parse(markdown, { async: false }),
  );
}

/** Escribe `rutaPdf` a partir del Markdown. Tira si algo falla; el llamador decide. */
export async function generarPdfDeInforme(markdown: string, rutaPdf: string, titulo?: string): Promise<void> {
  const html = informeAHtml(markdown, titulo);
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
 * Fase 5 (decisión de Juan, 2026-09-26) — el informe final se entrega como una
 * CARPETA, no como dos archivos sueltos:
 *
 *   AAAA-MM-DD HHMM — <titulo>/
 *     AAAA-MM-DD HHMM — <titulo>.md      ← el dato original
 *     AAAA-MM-DD HHMM — <titulo>.pdf     ← el mismo informe, para leer
 *     Respuestas de los investigadores/
 *       1 — chatgpt.pdf … 8 — qwen.pdf   ← las respuestas A LA PREGUNTA
 *
 * Carpeta y no ZIP: se escribe en el disco local de Juan, donde una carpeta se
 * abre de un clic y un ZIP habría que descomprimirlo para leer nada.
 *
 * ORDEN DELIBERADO: primero el `.md`, que es el dato canónico; después los
 * PDF, que son presentación. Si un PDF falla, el informe ya está en el disco y
 * NO se pierde — igual que antes de este cambio. Cada respuesta se convierte
 * por separado: una que falle no se lleva a las demás, y las que falten quedan
 * NOMBRADAS en un archivo de texto dentro de la subcarpeta, nunca ausentes en
 * silencio.
 */
export interface RespuestaEnCarpeta {
  /** Nombre del archivo SIN extensión, ya limpio (`nombreArchivoRespuesta`). */
  nombreArchivo: string;
  /** Título de la ventana/documento del PDF. */
  titulo: string;
  markdown: string;
}

const NOMBRE_FALTANTES = "FALTAN — respuestas sin PDF.txt";

export async function entregarCarpetaDeInforme(
  params: {
    /** La carpeta `informes` de `userData`; tiene que existir. */
    dirInformes: string;
    /** Nombre base YA libre (`nombreLibreDeInforme`): nombra la carpeta y los dos archivos del informe. */
    nombreBase: string;
    textoInforme: string;
    respuestas: readonly RespuestaEnCarpeta[];
  },
  generar: (md: string, rutaPdf: string, titulo?: string) => Promise<void> = generarPdfDeInforme,
): Promise<{ ok: boolean; mensaje: string; ruta?: string }> {
  // Sin `recursive`: si la carpeta ya existe, tira antes de tocar nada — el
  // mismo motivo que el flag `wx` del `.md`.
  const carpeta = join(params.dirInformes, params.nombreBase);
  mkdirSync(carpeta);

  const rutaMd = join(carpeta, `${params.nombreBase}.md`);
  writeFileSync(rutaMd, params.textoInforme, { encoding: "utf8", flag: "wx" });

  const rutaPdf = join(carpeta, `${params.nombreBase}.pdf`);
  let pdfDelInforme: string | null = null;
  let falloInforme = "";
  try {
    await generar(params.textoInforme, rutaPdf, `${params.nombreBase} — ChatCouncil`);
    pdfDelInforme = rutaPdf;
  } catch (e) {
    falloInforme = e instanceof Error ? e.message : String(e);
  }

  const faltantes: string[] = [];
  if (params.respuestas.length > 0) {
    const dirRespuestas = join(carpeta, SUBCARPETA_RESPUESTAS);
    try {
      mkdirSync(dirRespuestas);
      for (const r of params.respuestas) {
        try {
          await generar(r.markdown, join(dirRespuestas, `${r.nombreArchivo}.pdf`), r.titulo);
        } catch (e) {
          faltantes.push(`${r.nombreArchivo}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (faltantes.length > 0) {
        // Una respuesta que falta tiene que estar NOMBRADA en la carpeta: sin
        // esto, la subcarpeta incompleta se lee como "ese proveedor no participó".
        const nota = [
          "Estas respuestas de investigador no se pudieron convertir a PDF.",
          "El texto de cada una sigue entero en el registro de la conversacion.",
          "",
          ...faltantes.map((f) => `- ${f}`),
          "",
        ].join("\n");
        try {
          writeFileSync(join(dirRespuestas, NOMBRE_FALTANTES), nota, { encoding: "utf8", flag: "wx" });
        } catch {
          /* la cuenta igual va en el mensaje de pantalla */
        }
      }
    } catch (e) {
      faltantes.push(`no se pudo crear la subcarpeta: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const hechas = params.respuestas.length - faltantes.length;
  const detalleRespuestas =
    params.respuestas.length === 0
      ? "Sin respuestas de investigador en el registro de esta ronda."
      : faltantes.length === 0
        ? `${hechas} respuestas de investigador en PDF.`
        : `${hechas} de ${params.respuestas.length} respuestas en PDF (las que faltan estan nombradas en "${NOMBRE_FALTANTES}").`;

  if (pdfDelInforme === null) {
    shell.showItemInFolder(rutaMd);
    return {
      ok: true,
      mensaje: `Carpeta del informe: ${carpeta}. El informe quedo solo en Markdown: no se pudo generar el PDF (${falloInforme}). ${detalleRespuestas}`,
      ruta: rutaMd,
    };
  }
  void shell.openPath(pdfDelInforme);
  return { ok: true, mensaje: `Carpeta del informe: ${carpeta}. Se abrio el PDF del informe. ${detalleRespuestas}`, ruta: carpeta };
}
