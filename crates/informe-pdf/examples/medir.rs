//! Medición orientativa de D16: tiempo de convertir un .md a PDF Carta, tres corridas (la primera incluye el
//! arranque en frío de fuentes y biblioteca). Uso: cargo run --release -p informe-pdf --example medir -- <ruta.md>
use nucleo::texto::Texto;
use std::time::Instant;

fn main() {
    let ruta = std::env::args().nth(1).expect("ruta del .md");
    let md = Texto::from(std::fs::read_to_string(&ruta).expect("el .md"));
    println!(
        "md: {} bytes; fuentes incrustadas: {} bytes",
        md.para_mostrar().len(),
        informe_pdf::bytes_de_fuentes()
    );
    let mut ms = Vec::new();
    for i in 1..=3 {
        let t = Instant::now();
        let pdf = informe_pdf::pdf_bytes(&md, "Informe").expect("pdf");
        let dt = t.elapsed().as_secs_f64() * 1000.0;
        let paginas = pdf.windows(9).filter(|w| *w == b"/MediaBox").count();
        println!(
            "corrida {i}: {dt:.0} ms; {} bytes; {paginas} páginas",
            pdf.len()
        );
        ms.push(dt);
    }
    ms.sort_by(|a, b| a.partial_cmp(b).unwrap());
    println!(
        "mediana {:.0} ms; mín {:.0}; máx {:.0}",
        ms[1], ms[0], ms[2]
    );
}
