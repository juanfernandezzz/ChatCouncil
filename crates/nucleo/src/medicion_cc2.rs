//! PART-036 (B3): bytes y sha256 de los archivos que la app adjunta al integrador y al redactor de CC-2, armados
//! con el mismo camino que usa la app (Puerta::armar_integrador y Puerta::armar_redactor) sobre una COPIA del
//! registro. Solo escribe números (CC2_SALIDA); el contenido de las cuentas de Juan nunca se imprime ni se guarda.
//!
//! Uso (desde C:\cc-repo):
//!   $env:CC2_REGISTRO='C:\cc-target\tmp\cc2-copia\registro.jsonl'; $env:CC2_RONDA='0e319605-36e7-47ad-90aa-f8e0e6dda488'
//!   $env:CC2_SALIDA='bench\resultados\cc2-archivos.json'; cargo test -p nucleo medir_archivos_cc2 -- --ignored

use std::fs;
use std::time::{Duration, UNIX_EPOCH};

use sha2::{Digest, Sha256};

use crate::datos;
use crate::operacion::CONOCIDOS;
use crate::puerta::{ArchivoRedactor, Puerta};
use crate::registro;
use crate::ronda::RolesElegidos;
use crate::texto::Texto;

fn sha(b: &[u8]) -> String {
    Sha256::digest(b)
        .iter()
        .map(|x| format!("{x:02x}"))
        .collect()
}

fn medida(rol: &str, proveedor: &str, a: &ArchivoRedactor) -> String {
    let bytes = a.peso_del_archivo();
    let limite = datos::limite_archivo_bytes(datos::SPECS_JSON, proveedor);
    let pct = limite.map_or("null".to_string(), |l| {
        format!("{:.1}", bytes as f64 * 100.0 / l as f64)
    });
    format!(
        "\"{rol}\":{{\"proveedor\":\"{proveedor}\",\"bytesUtf8\":{bytes},\"lineas\":{},\"sha256\":\"{}\",\"limiteArchivoBytes\":{},\"porcentajeDelLimite\":{pct}}}",
        a.cuerpo_archivo.para_mostrar().lines().count(),
        sha(a.cuerpo_archivo.bytes()),
        limite.map_or("null".to_string(), |l| l.to_string())
    )
}

#[test]
#[ignore = "mide la copia del registro de CC-2; ver el uso arriba"]
fn medir_archivos_cc2() {
    let origen = std::env::var("CC2_REGISTRO").expect("CC2_REGISTRO: la copia del registro");
    let esperada = std::env::var("CC2_RONDA").expect("CC2_RONDA: la ronda de CC-2");
    let salida = std::env::var("CC2_SALIDA").expect("CC2_SALIDA: el .json de números");
    let bytes = fs::read(&origen).expect("la copia del registro");
    let antes = sha(&bytes);
    let leido = registro::leer(&String::from_utf8_lossy(&bytes));
    let hechos = &leido.hechos;
    let conversacion = hechos
        .iter()
        .find(|h| h.tipo() == "conversacion")
        .and_then(|h| h.texto("id"))
        .expect("una conversación")
        .para_mostrar()
        .into_owned();
    let carpeta = std::env::temp_dir().join(format!("cc-cc2-{}", std::process::id()));
    fs::create_dir_all(carpeta.join("conversaciones")).unwrap();
    fs::write(registro::ruta_archivo(&carpeta, &conversacion), &bytes).unwrap();
    // El pool sale como en la app (hilo.rs): de los roles, no de los sellos; CC-2 no tiene sellos.
    let roles = RolesElegidos::por_defecto();
    let pool = crate::ronda::pool_de_investigadores(&crate::ronda::CONOCIDOS, &roles);
    assert!(!pool.is_empty(), "el pool no puede quedar vacío");
    let mut n = 0u64;
    let (integrador, redactor) = (roles.integrador.clone(), roles.redactor.clone());
    let mut puerta = Puerta::new(
        carpeta.clone(),
        Box::new(move || {
            n += 1;
            format!("00000000-0000-4000-8000-{n:012}")
        }),
        Box::new(|| UNIX_EPOCH + Duration::from_secs(1_800_000_000)),
        CONOCIDOS.iter().map(|s| s.to_string()).collect(),
        roles,
        pool,
    );
    puerta.restaurar_ronda_activa();
    assert_eq!(
        puerta.ronda_actual(),
        Some(esperada.as_str()),
        "la ronda activa de la copia"
    );
    // Lo que alimenta la tabla del integrador: las salidas vigentes de los operadores de la ronda y sus hallazgos.
    let vigentes =
        crate::dominio::salidas_vigentes_de_ronda(hechos, &Texto::from(esperada.as_str()));
    let hallazgos: usize = vigentes.iter().map(|s| s.hallazgos.len()).sum();
    let i = puerta.armar_integrador().expect("armar el integrador");
    // CC-2 no llegó a capturar el informe del integrador: sin él el camino de la app no arma el archivo del redactor.
    let r = puerta.armar_redactor();
    let despues = sha(&fs::read(&origen).unwrap());
    assert_eq!(antes, despues, "la copia no cambia");
    fs::write(
        &salida,
        format!(
            "{{\"ronda\":\"{esperada}\",\"shaCopiaAntes\":\"{antes}\",\"shaCopiaDespues\":\"{despues}\",\"salidasVigentesDeOperadores\":{},\"hallazgosEnLaTabla\":{hallazgos},{},{}}}\n",
            vigentes.len(),
            medida("integrador", &integrador, &i),
            match &r {
                Ok(r) => medida("redactor", &redactor, r),
                Err(e) => format!("\"redactor\":{{\"proveedor\":\"{redactor}\",\"error\":\"{e}\"}}"),
            }
        ),
    )
    .unwrap();
    let _ = fs::remove_dir_all(&carpeta);
}
