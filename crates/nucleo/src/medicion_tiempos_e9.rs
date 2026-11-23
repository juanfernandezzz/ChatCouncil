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
    // PART-026 (4.4): solo los sellos de la ronda medida; con los de todas las rondas el pool no es el de la ronda.
    let id_ronda = Texto::from(ronda_id.as_str());
    for s in hechos
        .iter()
        .filter(|h| h.tipo() == "sello" && h.texto("rondaId") == Some(&id_ronda))
    {
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

/// PART-026 (4.5): cuánto tarda `situacion_de_panel` por panel con los 10 paneles y el registro E9
/// («con-problema» en la investigación y «capturado» en la operación). Cinco repeticiones por ruta en el
/// mismo proceso: la repetición 1 de la primera ruta es en FRÍO (lee el registro entero, una sola vez);
/// las demás van con la lectura ya en caché. La mediana de 5 es, por eso, un valor en caliente.
///
/// Uso (desde C:\cc-repo): CC_E9_SITUACION=<salida.txt> cargo test -p nucleo --release medir_situacion_e9 -- --ignored
#[test]
#[ignore = "mide la copia del registro de la ronda E9; ver el uso arriba"]
fn medir_situacion_e9() {
    let origen = std::env::var("CC_E9_REGISTRO")
        .unwrap_or_else(|_| r"C:\cc-target\tmp\e9-registro.jsonl".into());
    let salida = std::env::var("CC_E9_SITUACION").expect("CC_E9_SITUACION: dónde anotar");
    let bytes = fs::read(&origen).expect("la copia del registro");
    let leido = registro::leer(&String::from_utf8_lossy(&bytes));
    let conversacion = leido
        .hechos
        .iter()
        .find(|h| h.tipo() == "conversacion")
        .and_then(|h| h.texto("id"))
        .expect("una conversación")
        .para_mostrar()
        .into_owned();
    let carpeta = std::env::temp_dir().join(format!("cc-situacion-e9-{}", std::process::id()));
    let _ = fs::remove_dir_all(&carpeta);
    fs::create_dir_all(carpeta.join("conversaciones")).unwrap();
    fs::write(registro::ruta_archivo(&carpeta, &conversacion), &bytes).unwrap();
    let mut n = 0u64;
    let todos: Vec<String> = CONOCIDOS.iter().map(|s| s.to_string()).collect();
    let mut puerta = Puerta::new(
        carpeta.clone(),
        Box::new(move || {
            n += 1;
            format!("00000000-0000-4000-8000-{n:012}")
        }),
        Box::new(|| UNIX_EPOCH + Duration::from_secs(1_800_000_000)),
        todos.clone(),
        RolesElegidos::por_defecto(),
        todos.clone(),
    );
    puerta.restaurar_ronda_activa();
    assert!(puerta.ronda_actual().is_some());
    let mut lineas = String::new();
    for (etapa, estado) in [
        ("investigacion", "con-problema"),
        ("operacion", "capturado"),
    ] {
        for repeticion in 1..=5 {
            let t = Instant::now();
            for id in &todos {
                puerta.situacion_de_panel(id, etapa, estado, true).unwrap();
            }
            let total = t.elapsed().as_secs_f64() * 1e3;
            lineas.push_str(&format!(
                "{etapa}/{estado} repeticion={repeticion} paneles={} total_ms={total:.3} por_panel_ms={:.3} bytes_registro={}\n",
                todos.len(),
                total / todos.len() as f64,
                bytes.len()
            ));
        }
    }
    fs::write(&salida, lineas).unwrap();
    let _ = fs::remove_dir_all(&carpeta);
}

/// PART-028 (C2, hallazgo 2): lo que cuesta, en cada sondeo de 1500 ms, la lectura de `.marcas` y el parseo de la
/// salida y del HTML (`operacion::lectura_registrada`) con la ronda E9 copiada. Las operaciones de esa ronda son
/// anteriores a 0.2.16 y no tienen `.marcas`: se escriben en la COPIA, sacadas de las marcas que ya trae cada archivo.
/// Veinte sondeos por panel. El sondeo real mira un solo panel (el visible); el peor caso son los 7 juntos.
/// También mide `situacion_de_panel` entera (operación/capturado) para los mismos paneles. Solo escribe números.
///
/// Uso (desde C:\cc-repo): CC_E9_SONDEO=<salida.json> cargo test -p nucleo --release medir_sondeo_e9 -- --ignored
/// CC_E9_REGISTRO y CC_E9_OPERACIONES son las copias (por defecto en C:\cc-target\tmp).
#[test]
#[ignore = "mide la copia de la ronda E9; ver el uso arriba"]
fn medir_sondeo_e9() {
    use crate::operacion;
    use std::collections::BTreeMap;
    let origen = std::env::var("CC_E9_REGISTRO")
        .unwrap_or_else(|_| r"C:\cc-target\tmp\e9-registro.jsonl".into());
    let ops_origen = std::env::var("CC_E9_OPERACIONES")
        .unwrap_or_else(|_| r"C:\cc-target\tmp\e9-operaciones".into());
    let salida = std::env::var("CC_E9_SONDEO").expect("CC_E9_SONDEO: dónde anotar");
    let bytes = fs::read(&origen).expect("la copia del registro");
    let leido = registro::leer(&String::from_utf8_lossy(&bytes));
    let carpeta = std::env::temp_dir().join(format!("cc-sondeo-e9-{}", std::process::id()));
    let _ = fs::remove_dir_all(&carpeta);
    let ops = carpeta.join("operaciones");
    fs::create_dir_all(&ops).unwrap();
    fs::create_dir_all(carpeta.join("conversaciones")).unwrap();
    for e in fs::read_dir(&ops_origen).expect("la copia de operaciones") {
        let e = e.unwrap();
        let destino = ops.join(e.file_name());
        fs::copy(e.path(), &destino).unwrap();
        // shortcut: las marcas se sacan del texto del archivo (todas empiezan por [[CC-MARCA-); alcanza para medir.
        let texto = String::from_utf8_lossy(&fs::read(&destino).unwrap()).into_owned();
        let (mut marcas, mut resto) = (Vec::new(), texto.as_str());
        while let Some(i) = resto.find("[[CC-MARCA-") {
            let s = &resto[i..];
            let Some(f) = s.find("]]") else { break };
            marcas.push(s[..f + 2].to_string());
            resto = &s[f + 2..];
        }
        operacion::guardar_marcas(&destino, &marcas).unwrap();
    }
    // Lo último registrado por cada operador.
    let mut por_operador = BTreeMap::new();
    for h in leido
        .hechos
        .iter()
        .filter(|h| h.tipo() == "salida-operador")
    {
        if let Some(id) = h.texto("operadorId") {
            por_operador.insert(id.para_mostrar().into_owned(), h);
        }
    }
    let salidas: Vec<_> = por_operador.values().collect();
    assert!(
        !salidas.is_empty(),
        "la ronda E9 no trae salidas de operador"
    );
    let mediana = |v: &mut Vec<f64>| {
        v.sort_by(|a, b| a.partial_cmp(b).unwrap());
        v[v.len() / 2]
    };
    let (mut por_llamada, mut solo_marcas, mut por_sondeo) = (vec![], vec![], vec![]);
    let mut con_lectura = 0;
    for _ in 0..20 {
        let mut suma = 0.0;
        for h in &salidas {
            let (Some(prompt), Some(cruda)) = (h.texto("promptCompleto"), h.texto("salidaCruda"))
            else {
                continue;
            };
            let t = Instant::now();
            let r = operacion::lectura_registrada(&ops, prompt, cruda, h.texto("html"));
            let ms = t.elapsed().as_secs_f64() * 1e3;
            con_lectura += usize::from(r.is_some());
            por_llamada.push(ms);
            suma += ms;
            let t = Instant::now();
            let _ = operacion::nombre_de_archivo_adjunto(prompt)
                .and_then(|n| operacion::leer_marcas(&ops.join(n)));
            solo_marcas.push(t.elapsed().as_secs_f64() * 1e3);
        }
        por_sondeo.push(suma);
    }
    // La función completa que corre el sondeo, con los mismos paneles.
    let conversacion = leido
        .hechos
        .iter()
        .find(|h| h.tipo() == "conversacion")
        .and_then(|h| h.texto("id"))
        .expect("una conversación")
        .para_mostrar()
        .into_owned();
    fs::write(registro::ruta_archivo(&carpeta, &conversacion), &bytes).unwrap();
    let mut n = 0u64;
    let todos: Vec<String> = CONOCIDOS.iter().map(|s| s.to_string()).collect();
    let mut puerta = Puerta::new(
        carpeta.clone(),
        Box::new(move || {
            n += 1;
            format!("00000000-0000-4000-8000-{n:012}")
        }),
        Box::new(|| UNIX_EPOCH + Duration::from_secs(1_800_000_000)),
        todos.clone(),
        RolesElegidos::por_defecto(),
        todos.clone(),
    );
    puerta.restaurar_ronda_activa();
    let ids: Vec<String> = por_operador.keys().cloned().collect();
    let mut situacion = vec![];
    for _ in 0..20 {
        let t = Instant::now();
        for id in &ids {
            puerta
                .situacion_de_panel(id, "operacion", "capturado", true)
                .unwrap();
        }
        situacion.push(t.elapsed().as_secs_f64() * 1e3);
    }
    let json = format!(
        "{{\n  \"paneles\": {},\n  \"sondeos\": 20,\n  \"llamadas_con_lectura\": {con_lectura},\n  \"lectura_registrada_por_panel_ms_mediana\": {:.4},\n  \"leer_marcas_por_panel_ms_mediana\": {:.4},\n  \"lectura_registrada_7_paneles_ms_mediana\": {:.4},\n  \"lectura_registrada_7_paneles_ms_maximo\": {:.4},\n  \"situacion_de_panel_7_paneles_ms_mediana\": {:.4},\n  \"bytes_registro\": {}\n}}\n",
        salidas.len(),
        mediana(&mut por_llamada),
        mediana(&mut solo_marcas),
        mediana(&mut por_sondeo.clone()),
        por_sondeo.iter().cloned().fold(0.0, f64::max),
        mediana(&mut situacion),
        bytes.len()
    );
    fs::write(&salida, json).unwrap();
    let _ = fs::remove_dir_all(&carpeta);
}
