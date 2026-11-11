//! PDF del informe con typst como librería (ADR-0003): Markdown -> marcado typst -> PDF Carta (612 x 792 pt).
//!
//! Todo texto del Markdown entra a typst como literal de cadena: lo escribió un modelo y nunca se interpreta como
//! marcado ni como código (INV-INF-002). El HTML crudo se ve escrito y las imágenes se escriben como texto: ninguna
//! dirección se pide.

use nucleo::puerta::Pdf;
use nucleo::texto::Texto;
use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};
use std::fmt::Write as _;
use std::io::Write as _;
use std::path::Path;
use std::sync::OnceLock;
use typst::diag::{FileError, FileResult, SourceDiagnostic};
use typst::foundations::{Bytes, Datetime};
use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};

/// Fuentes incrustadas: solo las que el informe usa. Libertinus Serif (SIL OFL 1.1) para el texto y DejaVu Sans Mono
/// (licencia Bitstream Vera, redistribución libre) para el código. Los índices son los de `typst_assets::fonts()`.
const FUENTES_USADAS: [usize; 10] = [0, 1, 2, 3, 4, 5, 13, 14, 15, 16];

/// Cuántos bytes de fuentes incrusta (para medir el peso que suman al binario).
pub fn bytes_de_fuentes() -> usize {
    FUENTES_USADAS
        .iter()
        .map(|&i| typst_assets::fonts().nth(i).map_or(0, <[u8]>::len))
        .sum()
}

struct Fijos {
    biblioteca: LazyHash<Library>,
    libro: LazyHash<FontBook>,
    fuentes: Vec<Font>,
}

fn fijos() -> &'static Fijos {
    static F: OnceLock<Fijos> = OnceLock::new();
    F.get_or_init(|| {
        let fuentes: Vec<Font> = FUENTES_USADAS
            .iter()
            .filter_map(|&i| typst_assets::fonts().nth(i))
            .filter_map(|b| Font::new(Bytes::new(b), 0))
            .collect();
        Fijos {
            biblioteca: LazyHash::new(Library::default()),
            libro: LazyHash::new(FontBook::from_fonts(&fuentes)),
            fuentes,
        }
    })
}

struct Mundo {
    id: FileId,
    fuente: Source,
}

impl World for Mundo {
    fn library(&self) -> &LazyHash<Library> {
        &fijos().biblioteca
    }
    fn book(&self) -> &LazyHash<FontBook> {
        &fijos().libro
    }
    fn main(&self) -> FileId {
        self.id
    }
    fn source(&self, id: FileId) -> FileResult<Source> {
        if id == self.id {
            Ok(self.fuente.clone())
        } else {
            Err(FileError::AccessDenied)
        }
    }
    // Ningún archivo del disco ni de la red: el documento solo contiene lo que se le arma.
    fn file(&self, _: FileId) -> FileResult<Bytes> {
        Err(FileError::AccessDenied)
    }
    fn font(&self, index: usize) -> Option<Font> {
        fijos().fuentes.get(index).cloned()
    }
    fn today(&self, _: Option<typst::foundations::Duration>) -> Option<Datetime> {
        None
    }
}

const PREAMBULO: &str = r##"#set page(paper: "us-letter", margin: 2cm, footer: context [
  #set text(8pt, fill: rgb("#666666"))
  #align(center)[ChatCouncil · página #counter(page).display() de #counter(page).final().first()]
])
#set text(font: "Libertinus Serif", size: 11pt, fill: rgb("#1a1a1a"), lang: "es")
#set par(justify: true, leading: 0.65em)
#show raw: set text(font: "DejaVu Sans Mono", size: 9pt)
#show raw.where(block: true): it => block(width: 100%, fill: rgb("#f0f0f0"), inset: 6pt, it)
#show heading.where(level: 1): it => block(below: 0.6em, width: 100%, stroke: (bottom: 1.5pt), inset: (bottom: 4pt), text(20pt, it.body))
#show heading.where(level: 2): it => block(above: 1.4em, below: 0.6em, width: 100%, stroke: (bottom: 0.5pt + rgb("#bbbbbb")), inset: (bottom: 3pt), text(14pt, it.body))
#show heading.where(level: 3): it => block(above: 1.1em, below: 0.5em, text(12pt, it.body))
#set table(inset: 5pt, stroke: 0.5pt + rgb("#bbbbbb"))
#show table: set text(9.5pt)
"##;

/// Un texto como literal de cadena typst: entre comillas, con `\` y `"` escapados. Dentro de una cadena nada se
/// interpreta, así que un `#` o un `$` del modelo se ven tal cual.
fn literal(s: &str, fuera: &mut String) {
    fuera.push('"');
    for c in s.chars() {
        match c {
            '\\' => fuera.push_str("\\\\"),
            '"' => fuera.push_str("\\\""),
            '\r' => {}
            c => fuera.push(c),
        }
    }
    fuera.push('"');
}

fn texto(s: &str, fuera: &mut String) {
    fuera.push('#');
    literal(s, fuera);
}

/// Markdown a marcado typst. Los saltos simples son líneas sueltas, como en la Unity (`breaks: true`).
pub fn a_typst(markdown: &str) -> String {
    let mut o = String::with_capacity(markdown.len() * 2 + 1024);
    o.push_str(PREAMBULO);
    let opciones = Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH;
    let mut imagen: Option<(String, String)> = None; // (dirección, texto alternativo)
    let mut codigo: Option<String> = None;
    for e in Parser::new_ext(markdown, opciones) {
        if let Some((_, alt)) = imagen.as_mut() {
            match &e {
                Event::Text(t) | Event::Code(t) => alt.push_str(t),
                Event::End(TagEnd::Image) => {
                    let (dir, alt) = imagen.take().unwrap();
                    let escrito = if alt.is_empty() {
                        dir
                    } else {
                        format!("{alt}: {dir}")
                    };
                    texto(&escrito, &mut o);
                }
                _ => {}
            }
            continue;
        }
        if let Some(c) = codigo.as_mut() {
            match &e {
                Event::Text(t) => c.push_str(t),
                Event::End(TagEnd::CodeBlock) => {
                    let c = codigo.take().unwrap();
                    o.push_str("#raw(");
                    literal(c.trim_end_matches('\n'), &mut o);
                    o.push_str(", block: true)\n\n");
                }
                _ => {}
            }
            continue;
        }
        match e {
            Event::Start(t) => match t {
                Tag::Paragraph => {}
                Tag::Heading { level, .. } => {
                    let _ = write!(o, "#heading(level: {})[", level as usize);
                }
                Tag::BlockQuote(_) => o.push_str(
                    "#block(width: 100%, inset: (x: 9pt, y: 5pt), fill: rgb(\"#f5f5f5\"), stroke: (left: 2pt + rgb(\"#999999\")))[",
                ),
                Tag::CodeBlock(_) => codigo = Some(String::new()),
                Tag::List(None) => o.push_str("#list("),
                Tag::List(Some(n)) => {
                    let _ = write!(o, "#enum(start: {n}, ");
                }
                Tag::Item => o.push('['),
                Tag::Table(al) => {
                    o.push_str("#table(columns: (");
                    for _ in 0..al.len().max(1) {
                        o.push_str("1fr,");
                    }
                    o.push_str("), ");
                }
                Tag::TableHead => o.push_str("table.header("),
                Tag::TableRow => {}
                Tag::TableCell => o.push('['),
                Tag::Emphasis => o.push_str("#emph["),
                Tag::Strong => o.push_str("#strong["),
                Tag::Strikethrough => o.push_str("#strike["),
                Tag::Link { dest_url, .. } if !dest_url.trim().is_empty() => {
                    o.push_str("#link(");
                    literal(&dest_url, &mut o);
                    o.push_str(")[");
                }
                Tag::Image { dest_url, .. } => imagen = Some((dest_url.to_string(), String::new())),
                _ => o.push_str("#["),
            },
            Event::End(t) => match t {
                TagEnd::Paragraph | TagEnd::Heading(_) | TagEnd::BlockQuote(_) => {
                    o.push_str(if matches!(t, TagEnd::Paragraph) { "\n\n" } else { "]\n\n" })
                }
                TagEnd::List(_) | TagEnd::Table => o.push_str(")\n\n"),
                TagEnd::Item | TagEnd::TableCell => o.push_str("],"),
                TagEnd::TableHead => o.push_str("),"),
                TagEnd::TableRow => {}
                _ => o.push(']'),
            },
            // HTML crudo: escrito, nunca insertado.
            Event::Text(t) | Event::Html(t) | Event::InlineHtml(t) => texto(&t, &mut o),
            Event::Code(t) => {
                o.push_str("#raw(");
                literal(&t, &mut o);
                o.push(')');
            }
            Event::SoftBreak | Event::HardBreak => o.push_str("#linebreak()"),
            Event::Rule => o.push_str("#line(length: 100%, stroke: 0.5pt)\n\n"),
            Event::InlineMath(t) | Event::DisplayMath(t) => texto(&t, &mut o),
            Event::FootnoteReference(t) => texto(&format!("[{t}]"), &mut o),
            Event::TaskListMarker(h) => texto(if h { "[x] " } else { "[ ] " }, &mut o),
        }
    }
    o
}

fn mensajes<'a>(e: impl IntoIterator<Item = &'a SourceDiagnostic>) -> String {
    e.into_iter()
        .map(|d| d.message.to_string())
        .collect::<Vec<_>>()
        .join("; ")
}

fn compilar(markdown: &Texto, titulo: &str) -> Result<typst_layout::PagedDocument, String> {
    // typst trabaja con String: un sustituto suelto se ve como U+FFFD en el PDF (el .md conserva los bytes).
    let md = markdown.para_mostrar();
    let mut fuente = a_typst(&md);
    // El título va en los metadatos del PDF, como literal.
    fuente.push_str("#set document(title: ");
    literal(titulo, &mut fuente);
    fuente.push_str(
        ")
",
    );
    let id = RootedPath::new(
        VirtualRoot::Project,
        VirtualPath::new("informe.typ").map_err(|e| e.to_string())?,
    )
    .intern();
    let mundo = Mundo {
        id,
        fuente: Source::new(id, fuente),
    };
    typst::compile::<typst_layout::PagedDocument>(&mundo)
        .output
        .map_err(|e| mensajes(&e))
}

/// El PDF del informe en memoria.
pub fn pdf_bytes(markdown: &Texto, titulo: &str) -> Result<Vec<u8>, String> {
    let documento = compilar(markdown, titulo)?;
    typst_pdf::pdf(&documento, &typst_pdf::PdfOptions::default()).map_err(|e| mensajes(&e))
}

/// El puerto PDF del núcleo con typst. Un PDF que ya existe no se pisa: es un dato de investigación.
pub struct PdfTypst;

impl Pdf for PdfTypst {
    fn generar(&self, markdown: &Texto, ruta_pdf: &Path, titulo: &str) -> Result<(), String> {
        let bytes = pdf_bytes(markdown, titulo)?;
        let mut f = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(ruta_pdf)
            .map_err(|e| format!("{}: {e}", ruta_pdf.display()))?;
        f.write_all(&bytes).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use std::path::PathBuf;

    fn informe_real() -> Texto {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../docs/investigacion/2026-11-10-alternativas-ui");
        let md = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().path())
            .find(|p| p.extension().is_some_and(|x| x == "md"))
            .expect("el informe de docs/investigacion");
        Texto::from(std::fs::read_to_string(md).unwrap())
    }

    fn carpeta(nombre: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("informe-pdf-{nombre}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    // INF-014: cada página mide 612 x 792 pt.
    #[test]
    fn informe_cada_pagina_es_carta() {
        let doc = compilar(&informe_real(), "Informe").unwrap();
        assert!(
            doc.pages().len() > 1,
            "el informe real ocupa varias páginas"
        );
        for (i, p) in doc.pages().iter().enumerate() {
            let t = p.frame.size();
            assert_eq!(
                (t.x.to_pt().round(), t.y.to_pt().round()),
                (612.0, 792.0),
                "página {}",
                i + 1
            );
        }
        let pdf = pdf_bytes(&informe_real(), "Informe").unwrap();
        assert!(pdf.starts_with(b"%PDF-"));
        let marcas = pdf.windows(9).filter(|w| *w == b"/MediaBox").count();
        assert_eq!(
            marcas,
            doc.pages().len(),
            "una /MediaBox por página en el PDF"
        );
    }

    // INV-INF-002: el HTML y las imágenes que escribió un modelo se ven escritos; ni se insertan ni se piden.
    // `file()` del mundo niega todo: si el marcado se interpretara, la compilación fallaría.
    #[test]
    fn informe_html_imagenes_y_codigo_typst_del_modelo_se_escriben() {
        let md = "# Título #import \"@preview/x:1.0.0\": *\n\n<img src=\"http://127.0.0.1:9/x.png\"> y <script>alert(1)</script>\n\n\
                  ![gráfico](http://127.0.0.1:9/g.png)\n\n#image(\"/etc/passwd\") $ x^2 $ `#raw` \\ \"comillas\" @ref <lab>\n\n\
                  | a | b |\n|---|---|\n| #read(\"/x\") | 2 |\n\n```\n#include \"/x\"\n```\n\n- uno\n- dos\n\n1. tres\n";
        let tipo = a_typst(md);
        assert!(
            !tipo.contains("#image(\"/etc"),
            "la dirección del modelo no es una llamada"
        );
        pdf_bytes(&Texto::from(md.to_string()), "t").expect("compila: nada se interpretó");
    }

    // Un sustituto suelto (WTF-8) no rompe el PDF.
    #[test]
    fn informe_un_sustituto_suelto_no_rompe_el_pdf() {
        let mut u: Vec<u16> = "antes ".encode_utf16().collect();
        u.push(0xD800);
        u.extend(" después".encode_utf16());
        let t = Texto::desde_utf16(&u);
        assert!(t.como_str().is_none());
        assert!(pdf_bytes(&t, "t").is_ok());
    }

    // INV-INF-001: un PDF que ya existe no se pisa.
    #[test]
    fn informe_un_pdf_existente_no_se_pisa() {
        let d = carpeta("existente");
        let ruta = d.join("a.pdf");
        std::fs::write(&ruta, b"dato de investigacion").unwrap();
        let r = PdfTypst.generar(&Texto::from("# hola".to_string()), &ruta, "t");
        assert!(r.is_err());
        assert_eq!(std::fs::read(&ruta).unwrap(), b"dato de investigacion");
        let nuevo = d.join("b.pdf");
        PdfTypst
            .generar(&Texto::from("# hola".to_string()), &nuevo, "t")
            .unwrap();
        assert!(std::fs::read(&nuevo).unwrap().starts_with(b"%PDF-"));
    }

    // Revisión PART-008: los enlaces que escribe un modelo no deben tumbar el PDF entero.
    #[test]
    fn informe_enlaces_raros_de_un_modelo_no_tumban_el_pdf() {
        let md = "[a](javascript:alert(1)) [b](file:///c:/x) [c](#ancla) [d](no es url) [e](<>) [f](/ruta) [g](mailto:x@y.z) [h](http://)
";
        pdf_bytes(&Texto::from(md.to_string()), "t").expect("los enlaces raros compilan");
    }
}
