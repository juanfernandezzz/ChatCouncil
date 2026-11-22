//! PART-022 (A2 y D1): cuentas de la ronda E9 sobre una COPIA del registro. Nunca imprime ni guarda
//! contenido de las cuentas de Juan: solo números y nombres de estado. Es la misma prueba antes y después
//! de los cambios, para que el antes/después salga del mismo código de medición.
//!
//! Uso (desde C:\cc-repo):
//!   CC_E9_SALIDA=<json> cargo test -p nucleo --release medir_ronda_e9 -- --ignored --nocapture
//! CC_E9_REGISTRO es la copia del .jsonl (por defecto C:\cc-target\tmp\e9-registro.jsonl).

use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::time::{Duration, UNIX_EPOCH};

use crate::dominio;
use crate::operacion::{self, CONOCIDOS};
use crate::parseos;
use crate::puerta::Puerta;
use crate::registro::{self, Hecho};
use crate::ronda::RolesElegidos;
use crate::texto::Texto;

const EJES: [&str; 3] = ["HECHOS", "FUENTES", "CONCLUSIONES"];

/// R04: una cifra, una fecha (que siempre trae cifras) o una URL.
fn tiene_dato(d: &str) -> bool {
    let m = d.to_lowercase();
    d.bytes().any(|b| b.is_ascii_digit()) || m.contains("http") || m.contains("www.")
}

fn es_de(h: &Hecho, tipo: &str, ronda: &Texto) -> bool {
    h.tipo() == tipo && h.texto("rondaId") == Some(ronda)
}

#[derive(Default)]
struct Operador {
    hallazgos_registrados: usize,
    hallazgos_parser: usize,
    lineas_descartadas: usize,
    etiquetas_invalidas: usize,
    ejes_invalidos: usize,
    lectura: String,
    filas_sin_juntar: usize,
    filas_identicas: usize,
    con_operacion_p: usize,
    con_dato: usize,
}

fn json_operadores(m: &BTreeMap<String, Operador>) -> String {
    let mut s = String::from("{");
    for (i, (op, o)) in m.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        s.push_str(&format!(
            "\"{op}\":{{\"hallazgos_registrados\":{},\"hallazgos_parser\":{},\"lineas_descartadas\":{},\"etiquetas_invalidas\":{},\"ejes_invalidos\":{},\"lectura_archivo\":\"{}\",\"filas_sin_juntar\":{},\"filas_identicas\":{},\"con_operacion_p\":{},\"con_dato\":{}}}",
            o.hallazgos_registrados,
            o.hallazgos_parser,
            o.lineas_descartadas,
            o.etiquetas_invalidas,
            o.ejes_invalidos,
            o.lectura,
            o.filas_sin_juntar,
            o.filas_identicas,
            o.con_operacion_p,
            o.con_dato
        ));
    }
    s.push('}');
    s
}

#[test]
#[ignore = "mide la copia del registro de la ronda E9; ver el uso arriba"]
fn medir_ronda_e9() {
    let origen = std::env::var("CC_E9_REGISTRO")
        .unwrap_or_else(|_| r"C:\cc-target\tmp\e9-registro.jsonl".into());
    let destino = std::env::var("CC_E9_SALIDA").expect("CC_E9_SALIDA: dónde guardar el json");
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
    let carpeta = std::env::temp_dir().join(format!("cc-medicion-e9-{}", std::process::id()));
    let _ = fs::remove_dir_all(&carpeta);
    fs::create_dir_all(carpeta.join("conversaciones")).unwrap();
    fs::write(registro::ruta_archivo(&carpeta, &conversacion), &bytes).unwrap();

    // La ronda E9 es la última de la conversación: el pool es el del sello persistido, en el orden de CONOCIDOS.
    let ronda_id = hechos
        .iter()
        .rfind(|h| h.tipo() == "ronda")
        .and_then(|h| h.texto("id"))
        .expect("una ronda")
        .para_mostrar()
        .into_owned();
    assert!(ronda_id.starts_with("8cc12458"), "no es la ronda E9");
    let id = Texto::from(ronda_id.as_str());
    let sello: Vec<&Hecho> = hechos.iter().filter(|h| es_de(h, "sello", &id)).collect();
    let mut pool: Vec<String> = Vec::new();
    for s in &sello {
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
    let pool_refs: Vec<&str> = pool.iter().map(String::as_str).collect();

    let operaciones =
        std::env::var("CC_E9_OPERACIONES").map_or_else(|_| carpeta.join("operaciones"), Into::into);
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
        pool.clone(),
    );
    puerta.restaurar_ronda_activa();
    assert_eq!(puerta.ronda_actual(), Some(ronda_id.as_str()));

    let vigentes = dominio::salidas_vigentes_de_ronda(hechos, &id);
    let mut por_operador: BTreeMap<String, Operador> = BTreeMap::new();
    let mut vistas: HashSet<(String, String)> = HashSet::new();
    for v in &vigentes {
        let op = v.operador_id.unwrap().para_mostrar().into_owned();
        let salida = hechos
            .iter()
            .find(|h| h.tipo() == "salida-operador" && h.texto("id") == v.salida_id)
            .expect("la salida vigente");
        let cruda = salida.texto("salidaCruda").cloned().unwrap_or_default();
        let validas =
            dominio::etiquetas_validas_del_operador(&op, &pool_refs, &sello).unwrap_or_default();
        let r = parseos::parsear_hallazgos(&cruda, &validas);
        let o = por_operador.entry(op.clone()).or_default();
        o.hallazgos_registrados = v.hallazgos.len();
        o.hallazgos_parser = r.hallazgos.len();
        o.lineas_descartadas = r.lineas_descartadas;
        o.etiquetas_invalidas = r.hallazgos.iter().filter(|h| h.etiqueta_invalida).count();
        o.ejes_invalidos = r
            .hallazgos
            .iter()
            .filter(|h| {
                h.eje.as_ref().is_some_and(|e| {
                    !EJES.contains(&e.para_mostrar().trim().to_uppercase().as_str())
                })
            })
            .count();
        // PART-026 (4.3): las marcas salen del .marcas guardado junto al adjunto (CC_E9_OPERACIONES
        // es la carpeta operaciones/); sin él, solo se sabe si trae la línea ARCHIVO.
        let prompt = salida.texto("promptCompleto").cloned().unwrap_or_default();
        o.lectura = operacion::lectura_de_operador(&operaciones, &prompt, &cruda, None).to_string();
        // Filas idénticas: iguales en todo salvo el ID, dentro de un mismo operador.
        for h in &v.hallazgos {
            let g = |c: &str| {
                h.texto(c)
                    .map(|t| t.para_mostrar().into_owned())
                    .unwrap_or_default()
            };
            let desc = g("descripcion");
            o.filas_sin_juntar += 1;
            if !vistas.insert((
                op.clone(),
                format!(
                    "{}|{}|{:?}|{desc}",
                    g("categoria"),
                    g("eje"),
                    h.valor("etiquetas")
                ),
            )) {
                o.filas_identicas += 1;
            }
            o.con_operacion_p += desc.contains("operacion-P") as usize;
            o.con_dato += tiene_dato(&desc) as usize;
        }
    }

    // Lo que arma la app y sus bytes.
    let integrador = puerta.armar_integrador();
    let redactor = puerta.armar_redactor();
    let suma = |f: fn(&Operador) -> usize| por_operador.values().map(f).sum::<usize>();
    let (total, identicas) = (suma(|o| o.filas_sin_juntar), suma(|o| o.filas_identicas));
    let (con_dato, con_op_p) = (suma(|o| o.con_dato), suma(|o| o.con_operacion_p));
    let registrados = suma(|o| o.hallazgos_registrados);
    let pct = if registrados == 0 {
        0.0
    } else {
        con_dato as f64 * 100.0 / registrados as f64
    };
    let (integrador_bytes, integrador_utf16, integrador_archivo) = match &integrador {
        Ok(a) => (
            a.prompt_completo.bytes().len() as i64,
            a.prompt_completo.largo_utf16() as i64,
            a.peso_del_archivo() as i64,
        ),
        Err(_) => (-1, -1, -1),
    };
    let redactor_bytes = redactor
        .as_ref()
        .map_or(-1, |r| r.cuerpo_archivo.bytes().len() as i64);
    let json = format!(
        "{{\"ronda\":\"8cc12458\",\"operadores\":{},\"totales\":{{\"filas_sin_juntar\":{total},\"filas_identicas\":{identicas},\"hallazgos_registrados\":{registrados},\"con_operacion_p\":{con_op_p},\"con_dato\":{con_dato},\"pct_con_dato\":{pct:.1}}},\"bytes\":{{\"prompt_integrador\":{integrador_bytes},\"prompt_integrador_utf16\":{integrador_utf16},\"archivo_integrador\":{integrador_archivo},\"archivo_redactor\":{redactor_bytes}}}}}",
        json_operadores(&por_operador),
    );
    fs::write(&destino, &json).unwrap();
    println!("{json}");
    let _ = fs::remove_dir_all(&carpeta);
}
