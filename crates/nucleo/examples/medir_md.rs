//! Par sin typst del ejemplo `medir` de informe-pdf (D20): el núcleo arma solo un .md. La diferencia de tamaño
//! entre los dos ejecutables es lo que suma typst. Uso: cargo run --release -p nucleo --example medir_md -- <ruta.md>
use nucleo::informe::{RespuestaParaPdf, markdown_de_respuesta_investigador};
use nucleo::texto::Texto;

fn main() {
    let ruta = std::env::args().nth(1).expect("ruta del .md");
    let md = Texto::from(std::fs::read_to_string(&ruta).expect("el .md"));
    let r = RespuestaParaPdf {
        proveedor_id: "claude".into(),
        etiqueta_modelo: None,
        leida_en: "2026-11-10T00:00:00Z".into(),
        texto_original: md,
        error: None,
        fuentes_citadas: 0,
        fuentes_href: None,
        fin_de: None,
    };
    let salida = markdown_de_respuesta_investigador(&Texto::from("Pregunta".to_string()), &r);
    println!("md armado: {} bytes", salida.para_mostrar().len());
}
