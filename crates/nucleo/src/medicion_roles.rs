//! PART-023 G1: arma T2 (integrador) y T3 (redactor) con la ronda E9, sobre una COPIA del registro, y los
//! escribe en CC_ROLES_SALIDA (por defecto C:\cc-target\tmp\prueba-roles). Cada caso: prompt, archivo adjunto
//! y marcas esperadas. Esto es contenido de las cuentas de Juan: nunca se imprime, solo se escribe a esa carpeta.
//!
//! Uso (desde C:\cc-repo): cargo test -p nucleo --release armar_materiales_roles -- --ignored
//! CC_E9_REGISTRO es la copia del .jsonl (por defecto C:\cc-target\tmp\e9-registro.jsonl).

use std::fs;
use std::time::{Duration, UNIX_EPOCH};

use crate::operacion::CONOCIDOS;
use crate::puerta::{ArchivoRedactor, Puerta};
use crate::registro;
use crate::ronda::RolesElegidos;

fn escribir(dir: &std::path::Path, caso: &str, a: &ArchivoRedactor) {
    fs::write(
        dir.join(format!("{caso}-prompt.txt")),
        a.prompt.para_mostrar().as_ref(),
    )
    .unwrap();
    fs::write(
        dir.join(&a.nombre_archivo),
        a.cuerpo_archivo.para_mostrar().as_ref(),
    )
    .unwrap();
    fs::write(
        dir.join(format!("{caso}-meta.json")),
        format!(
            "{{\"archivo\":\"{}\",\"bytes_archivo\":{},\"chars_prompt\":{},\"marca_primera\":\"{}\",\"marca_ultima\":\"{}\"}}",
            a.nombre_archivo,
            a.peso_del_archivo(),
            a.prompt.largo_utf16(),
            a.marca_primera,
            a.marca_ultima
        ),
    )
    .unwrap();
}

#[test]
#[ignore = "arma los materiales de la prueba de roles con la copia del registro E9; ver el uso arriba"]
fn armar_materiales_roles() {
    let origen = std::env::var("CC_E9_REGISTRO")
        .unwrap_or_else(|_| r"C:\cc-target\tmp\e9-registro.jsonl".into());
    let salida = std::path::PathBuf::from(
        std::env::var("CC_ROLES_SALIDA")
            .unwrap_or_else(|_| r"C:\cc-target\tmp\prueba-roles".into()),
    );
    fs::create_dir_all(&salida).unwrap();
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
    let carpeta = std::env::temp_dir().join(format!("cc-roles-{}", std::process::id()));
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
    // Solo los sellos de la ronda E9: los de otras rondas del registro agregarían proveedores al pool.
    let mut pool: Vec<String> = Vec::new();
    for s in hechos.iter().filter(|h| {
        h.tipo() == "sello"
            && h.texto("rondaId")
                .map(|t| t.para_mostrar().into_owned())
                .as_deref()
                == Some(ronda_id.as_str())
    }) {
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
    escribir(
        &salida,
        "t2",
        &puerta.armar_integrador().expect("armar el integrador"),
    );
    escribir(
        &salida,
        "t3",
        &puerta.armar_redactor().expect("armar el redactor"),
    );
    let _ = fs::remove_dir_all(&carpeta);
}
