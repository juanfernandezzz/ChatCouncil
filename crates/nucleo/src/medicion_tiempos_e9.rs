//! PART-022 D3: cuánto tarda armar la tabla (integrador y redactor) y el informe con la ronda E9, sobre una
//! COPIA del registro. Es el mismo archivo antes y después de los cambios: una muestra por proceso, en
//! intercalado ABAB. Nunca imprime contenido de las cuentas de Juan.
//!
//! Uso (desde C:\cc-repo): CC_E9_TIEMPOS=<salida.txt> cargo test -p nucleo --release medir_tiempos_e9 -- --ignored
//! CC_E9_REGISTRO es la copia del .jsonl (por defecto C:\cc-target\tmp\e9-registro.jsonl).

use std::fs;
use std::path::Path;
use std::time::{Duration, Instant, UNIX_EPOCH};

use crate::operacion::CONOCIDOS;
use crate::puerta::{Pdf, Puerta};
use crate::registro;
use crate::ronda::RolesElegidos;
use crate::texto::Texto;
use crate::urls::Http;

struct PdfNulo;
impl Pdf for PdfNulo {
    fn generar(&self, _: &Texto, _: &Path, _: &str) -> Result<(), String> {
        Ok(())
    }
}

struct HttpNulo;
impl Http for HttpNulo {
    fn pedir(&self, _: &str, _: &str, _: Duration) -> Result<u16, String> {
        Ok(200)
    }
}

#[test]
#[ignore = "mide la copia del registro de la ronda E9; ver el uso arriba"]
fn medir_tiempos_e9() {
    let origen = std::env::var("CC_E9_REGISTRO")
        .unwrap_or_else(|_| r"C:\cc-target\tmp\e9-registro.jsonl".into());
    let salida = std::env::var("CC_E9_TIEMPOS").expect("CC_E9_TIEMPOS: dónde anotar");
    let bytes = fs::read(&origen).expect("la copia del registro");
    let leido = registro::leer(&String::from_utf8_lossy(&bytes));
    let hechos = &leido.hechos;
    let conversacion = hechos
        .iter()
        .find(|h| h.tipo() == "conversacion")
        .and_then(|h| h.texto("id"))
        .expect("una conversación")
        .para_mostrar()
        .into_owned();
    let carpeta = std::env::temp_dir().join(format!("cc-tiempos-e9-{}", std::process::id()));
    let _ = fs::remove_dir_all(&carpeta);
    fs::create_dir_all(carpeta.join("conversaciones")).unwrap();
    fs::write(registro::ruta_archivo(&carpeta, &conversacion), &bytes).unwrap();
    let ronda_id = hechos
        .iter()
        .rfind(|h| h.tipo() == "ronda")
        .and_then(|h| h.texto("id"))
        .expect("una ronda")
        .para_mostrar()
        .into_owned();
    let mut pool: Vec<String> = Vec::new();
    for s in hechos.iter().filter(|h| h.tipo() == "sello") {
        let p = s
            .texto("panelSourceId")
            .unwrap()
            .para_mostrar()
            .into_owned();
        if !pool.contains(&p) {
            pool.push(p);
        }
    }
    pool.sort_by_key(|p| CONOCIDOS.iter().position(|c| c == p));
    let mut n = 0u64;
    let mut puerta = Puerta::new(
        carpeta.clone(),
        Box::new(move || {
            n += 1;
            format!("00000000-0000-4000-8000-{n:012}")
        }),
        Box::new(|| UNIX_EPOCH + Duration::from_secs(1_800_000_000)),
        CONOCIDOS.iter().map(|s| s.to_string()).collect(),
        RolesElegidos::por_defecto(),
        pool,
    );
    puerta.restaurar_ronda_activa();
    assert_eq!(puerta.ronda_actual(), Some(ronda_id.as_str()));

    let t = Instant::now();
    let integrador = puerta.armar_prompt_integrador();
    let t_integrador = t.elapsed();
    let t = Instant::now();
    let redactor = puerta.armar_redactor();
    let t_redactor = t.elapsed();
    let t = Instant::now();
    let informe = puerta.armar_informe(&HttpNulo, &PdfNulo);
    let t_informe = t.elapsed();
    let linea = format!(
        "integrador_ms={:.3} redactor_ms={:.3} informe_ms={:.3} ok={}/{}/{}\n",
        t_integrador.as_secs_f64() * 1e3,
        t_redactor.as_secs_f64() * 1e3,
        t_informe.as_secs_f64() * 1e3,
        integrador.is_ok(),
        redactor.is_ok(),
        informe.ok
    );
    use std::io::Write;
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&salida)
        .unwrap()
        .write_all(linea.as_bytes())
        .unwrap();
    let _ = fs::remove_dir_all(&carpeta);
}
