//! PRU-T19: `-pruebainterfaz RUTA -fase N`, el port de PruebaInterfaz.cs. Maneja los controles reales
//! de la interfaz sobre una carpeta de prueba (-datos), nunca la real, con páginas locales en lugar de
//! los proveedores. Tres fases, cada una en un arranque distinto con la misma carpeta:
//! 1, primer arranque: las combinaciones inválidas se rechazan con su texto y no escriben nada; una
//!    válida escribe el archivo; la sesión se deduce del compositor; se siembra una ronda en el registro.
//! 2, al reabrir: la Ronda usa el consejo guardado y restaura la ronda activa; un cambio en Ajustes se
//!    guarda y no se aplica hasta reabrir.
//! 3, al reabrir otra vez: el cambio quedó aplicado.

use std::path::Path;
use std::rc::Rc;
use std::time::{Duration, Instant, SystemTime};

use nucleo::ajustes;
use nucleo::puerta::Puerta;
use nucleo::ronda::{self, RolesElegidos};
use slint::platform::{Key, WindowEvent};
use slint::{ComponentHandle, Model, SharedString};

use crate::autoprueba::Anotador;
use crate::interfaz::Interfaz;

const OPERADORES_ESPERADOS: [&str; 6] =
    ["chatgpt", "gemini", "glm", "qwen", "deepseek", "perplexity"];

async fn esperar(ms: u64) {
    let _ = paneles::dormir(Duration::from_millis(ms)).await;
}

/// Espera hasta que la condición se cumpla o pase el límite.
async fn hasta(segundos: u64, mut condicion: impl FnMut() -> bool) {
    let limite = Instant::now() + Duration::from_secs(segundos);
    while Instant::now() < limite && !condicion() {
        esperar(100).await;
    }
}

pub async fn correr(i: Rc<Interfaz>, salida: &Path, fase: u32) -> i32 {
    let mut a = Anotador::default();
    a.linea(format!(
        "Prueba de la interfaz (T19), fase {fase}, {}, {}, {}",
        crate::ahora_local(),
        std::env::consts::OS,
        env!("CARGO_PKG_VERSION")
    ));
    esperar(300).await; // que se arme el diseño
    let r = match fase {
        1 => fase1(&mut a, &i).await,
        2 => fase2(&mut a, &i).await,
        _ => fase3(&mut a, &i).await,
    };
    a.grupo("prueba", r);
    let (texto, mut codigo) = a.cerrar();
    if let Err(e) = std::fs::write(salida, texto) {
        eprintln!("No se pudo escribir {}: {e}", salida.display());
        codigo = 1;
    }
    codigo
}

fn seleccion(i: &Interfaz) -> std::path::PathBuf {
    i.datos.join(ronda::ARCHIVO_SELECCION)
}

/// El consejo válido de la fase 1: todos menos Mistral.
fn marcados(i: &Interfaz) -> Vec<String> {
    i.conocidos
        .iter()
        .filter(|id| *id != "mistral")
        .cloned()
        .collect()
}

fn indice(i: &Interfaz, id: &str) -> i32 {
    i.conocidos
        .iter()
        .position(|c| c == id)
        .map_or(-1, |p| p as i32)
}

fn poner(i: &Interfaz, marcados: &[&str], ri: &str, v1: &str, v2: &str, rr: &str) {
    for n in 0..i.marcas.row_count() {
        if let Some(mut m) = i.marcas.row_data(n) {
            m.marcado = marcados.contains(&m.id.as_str());
            i.marcas.set_row_data(n, m);
        }
    }
    i.ui.set_idx_integrador(indice(i, ri));
    i.ui.set_idx_verificador1(indice(i, v1));
    i.ui.set_idx_verificador2(indice(i, v2));
    i.ui.set_idx_redactor(indice(i, rr));
}

fn estado_cuenta(i: &Interfaz, id: &str) -> String {
    i.cuentas
        .iter()
        .find(|c| c.id == id)
        .map(|c| c.estado.to_string())
        .unwrap_or_default()
}

/// Como el toque en «Entrar»: espera hasta que el estado deje de ser provisional (60 s, como la Unity).
async fn entrar_y_esperar(i: &Rc<Interfaz>, id: &str) -> String {
    i.ui.invoke_entrar(SharedString::from(id));
    let provisional = |t: &str| {
        t == ajustes::SIN_COMPROBAR || t == ajustes::ABRIENDO || t == ajustes::COMPROBANDO
    };
    hasta(60, || !provisional(&estado_cuenta(i, id))).await;
    estado_cuenta(i, id)
}

fn opcion(m: slint::ModelRc<SharedString>, indice: i32) -> String {
    usize::try_from(indice)
        .ok()
        .and_then(|n| m.row_data(n))
        .map(|s| s.to_string())
        .unwrap_or_default()
}

fn comprobar_ronda(a: &mut Anotador, i: &Interfaz, nombre: &str, operadores: &[&str]) {
    // D62: las filas de los roles son las tres del consejo (la Unity esperaba solo claude y grok).
    let esperadas: Vec<&str> = operadores
        .iter()
        .copied()
        .chain(["claude", "grok", "kimi"])
        .collect();
    let filas: Vec<String> = i.filas.iter().map(|f| f.id.to_string()).collect();
    let integrador = i
        .filas
        .iter()
        .find(|f| f.id == "claude")
        .map(|f| f.estado.to_string())
        .unwrap_or_default();
    a.anotar(
        filas == esperadas && integrador == "Integra y redacta",
        nombre,
        &format!("filas [{}], Claude: \"{integrador}\"", filas.join(",")),
    );
}

// ---------------------------------------------------------------- fase 1

async fn fase1(a: &mut Anotador, i: &Rc<Interfaz>) -> Result<(), String> {
    let ui = &i.ui;
    a.anotar(
        !seleccion(i).exists()
            && ui.get_primer_arranque()
            && ui.get_seccion() == "ajustes"
            && !ui.get_riel_visible(),
        "primer arranque",
        &format!(
            "sin archivo de selección arranca la guía, sin riel (sección visible: {})",
            if ui.get_seccion() == "ajustes" {
                "configuración"
            } else {
                "ronda"
            }
        ),
    );
    a.anotar(
        ui.get_texto_paso_guia() == "Paso 1 de 2: tu consejo" && ui.get_paso_guia() == 1,
        "paso 1",
        &ui.get_texto_paso_guia(),
    );

    // T24: F1 llevaba a la Ayuda, y en la clase ancha, sin riel, la persona quedaba sin salida.
    let f1: SharedString = Key::F1.into();
    ui.window()
        .dispatch_event(WindowEvent::KeyPressed { text: f1.clone() });
    ui.window()
        .dispatch_event(WindowEvent::KeyReleased { text: f1 });
    esperar(100).await;
    a.anotar(
        ui.get_seccion() == "ajustes",
        "F1 en la guía no la deja",
        &format!(
            "configuración visible: {}; ayuda visible: {}",
            ui.get_seccion() == "ajustes",
            ui.get_seccion() == "ayuda"
        ),
    );

    type Combinacion<'a> = (&'a [&'a str], &'a str, &'a str, &'a str, &'a str, &'a str);
    let invalidas: [Combinacion; 6] = [
        (
            &[],
            "deepseek",
            "glm",
            "qwen",
            "deepseek",
            ronda::ERROR_SELECCION_VACIA,
        ),
        (
            &["chatgpt", "glm", "qwen"],
            "deepseek",
            "glm",
            "glm",
            "deepseek",
            ronda::ERROR_VERIFICADORES_IGUALES,
        ),
        (
            &["chatgpt", "glm", "qwen"],
            "glm",
            "glm",
            "qwen",
            "glm",
            ronda::ERROR_ROLES_IGUALES,
        ),
        (
            &["chatgpt", "glm", "qwen"],
            "deepseek",
            "glm",
            "qwen",
            "deepseek",
            ronda::ERROR_ROLES_DESMARCADOS,
        ),
        (
            &["chatgpt", "deepseek", "glm", "qwen"],
            "deepseek",
            "glm",
            "qwen",
            "qwen",
            ronda::ERROR_REDACTOR_VERIFICADOR,
        ),
        (
            &["chatgpt", "deepseek", "glm", "qwen"],
            "deepseek",
            "glm",
            "qwen",
            "kimi",
            ronda::ERROR_REDACTOR_DESMARCADO,
        ),
    ];
    for (m, ri, v1, v2, rr, error) in invalidas {
        poner(i, m, ri, v1, v2, rr);
        ui.invoke_guardar();
        esperar(50).await;
        let mensaje = ui.get_mensaje();
        let escrito = seleccion(i).exists();
        a.anotar(
            mensaje == error && ui.get_mensaje_problema() && !escrito,
            "combinación inválida",
            &format!(
                "[{}] {ri}/{v1}/{v2}/{rr}: \"{mensaje}\"{}",
                m.join(","),
                if escrito {
                    " y escribió el archivo"
                } else {
                    ""
                }
            ),
        );
    }

    let validos = marcados(i);
    let v: Vec<&str> = validos.iter().map(String::as_str).collect();
    poner(i, &v, "claude", "grok", "kimi", "claude");
    ui.invoke_guardar();
    esperar(50).await;
    let contenido = std::fs::read_to_string(seleccion(i)).ok();
    let c: Vec<&str> = i.conocidos.iter().map(String::as_str).collect();
    let leidos = ronda::leer_seleccion(contenido.as_deref(), &c);
    let roles = ronda::leer_roles(contenido.as_deref(), &c);
    let mensaje = ui.get_mensaje();
    a.anotar(
        leidos.as_ref() == Some(&validos)
            && roles == RolesElegidos::new("claude", "grok", "kimi", "claude")
            && mensaje == "Guardado.",
        "combinación válida",
        &format!(
            "\"{mensaje}\"; archivo: {}",
            contenido
                .as_deref()
                .map_or("no existe".into(), |t| t.replace('\n', " "))
        ),
    );
    a.anotar(ui.get_paso_guia() == 2, "paso 2", &ui.get_texto_paso_guia());

    let con_sesion = entrar_y_esperar(i, "chatgpt").await;
    a.anotar(
        con_sesion == "Sesión abierta",
        "sesión deducida, con compositor",
        &con_sesion,
    );
    ui.invoke_volver();
    let sin_sesion = entrar_y_esperar(i, "glm").await;
    a.anotar(
        sin_sesion.starts_with("Sin sesión"),
        "sesión deducida, sin compositor",
        &sin_sesion,
    );
    ui.invoke_volver();

    // Una ronda en el registro, para que el arranque siguiente la restaure.
    let pool = ronda::pool_de_investigadores(&c, &roles);
    let mut puerta = Puerta::new(
        i.datos.clone(),
        Box::new(crate::nuevo_id),
        Box::new(SystemTime::now),
        leidos.unwrap_or_default(),
        roles,
        pool,
    );
    puerta
        .abrir_ronda("Pregunta de prueba de T19")
        .map_err(|e| format!("no se pudo sembrar la ronda: {e}"))?;
    drop(puerta);

    ui.invoke_empezar();
    esperar(200).await;
    // En la clase compacta (el teléfono) no hay riel: se navega con el botón Menú, que abre el cajón (D3).
    let compacta = ui.get_compacta();
    let navegacion = compacta || ui.get_riel_visible();
    a.anotar(
        ui.get_seccion() == "ronda" && !ui.get_primer_arranque() && navegacion,
        "fin de la guía",
        &format!(
            "la Ronda queda a la vista, con {}",
            if compacta {
                "el botón del cajón"
            } else {
                "el riel"
            }
        ),
    );
    comprobar_ronda(
        a,
        i,
        "ronda con el consejo recién guardado",
        &OPERADORES_ESPERADOS,
    );

    // IFZ-014: la ronda sembrada aparece en el historial, sin informe.
    ui.invoke_ir(SharedString::from("historial"));
    hasta(10, || ui.get_anteriores().row_count() > 0).await;
    let filas: Vec<_> = ui.get_anteriores().iter().collect();
    let pregunta = filas
        .first()
        .map(|f| f.pregunta.to_string())
        .unwrap_or_default();
    let detalle = filas
        .first()
        .map(|f| f.detalle.to_string())
        .unwrap_or_default();
    a.anotar(
        filas.len() == 1
            && pregunta == "Pregunta de prueba de T19"
            && detalle.ends_with(" · llegó a Investigación · sin informe"),
        "historial con la ronda sembrada",
        &format!("{} filas; \"{pregunta}\", \"{detalle}\"", filas.len()),
    );
    ui.invoke_ir(SharedString::from("ronda"));
    // Para la fase 2: unas preferencias con un tamaño que no es un número (T24: la app no arrancaba).
    std::fs::write(
        i.datos.join(ajustes::ARCHIVO_APARIENCIA),
        "{\"tema\":\"oscuro\",\"texto\":\"abc\"}",
    )
    .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------- fase 2

async fn fase2(a: &mut Anotador, i: &Rc<Interfaz>) -> Result<(), String> {
    let ui = &i.ui;
    a.anotar(
        !ui.get_primer_arranque() && ui.get_seccion() == "ronda",
        "reabrir",
        "con archivo de selección arranca en la Ronda, sin la guía",
    );
    let tema = opcion(ui.get_nombres_tema(), ui.get_idx_tema());
    let tamano = opcion(ui.get_nombres_tamano(), ui.get_idx_tamano());
    a.anotar(
        tema == "Oscuro" && tamano == "El del sistema",
        "un tamaño ilegible: el del sistema, y el tema se conserva",
        &format!("tema «{tema}», texto «{tamano}»"),
    );
    comprobar_ronda(
        a,
        i,
        "el consejo guardado se aplica al reabrir",
        &OPERADORES_ESPERADOS,
    );
    hasta(10, || {
        ui.get_paso_texto() == "Capturar los que terminaron (0)"
    })
    .await;
    let titulo = ui.get_barra_titulo();
    let paso = ui.get_paso_texto();
    a.anotar(
        titulo == "Investigación · 2 de 7" && paso == "Capturar los que terminaron (0)",
        "ronda activa restaurada",
        &format!("\"{titulo}\", \"{paso}\""),
    );

    ui.invoke_ir(SharedString::from("ajustes"));
    esperar(50).await;
    let marcas: Vec<String> = i
        .marcas
        .iter()
        .filter(|m| m.marcado)
        .map(|m| m.id.to_string())
        .collect();
    let nombre = |idx: i32| opcion(ui.get_nombres(), idx);
    let (ri, v1, v2, rr) = (
        nombre(ui.get_idx_integrador()),
        nombre(ui.get_idx_verificador1()),
        nombre(ui.get_idx_verificador2()),
        nombre(ui.get_idx_redactor()),
    );
    a.anotar(
        ui.get_seccion() == "ajustes"
            && marcas == marcados(i)
            && ri == "Claude"
            && v1 == "Grok"
            && v2 == "Kimi"
            && rr == "Claude",
        "ajustes con lo guardado",
        &format!("[{}] {ri}/{v1}/{v2}/{rr}", marcas.join(",")),
    );
    let ruta = ui.get_ruta_datos();
    a.anotar(
        ui.get_seccion() == "ajustes" && ruta == i.datos.display().to_string(),
        "carpeta de datos",
        &ruta,
    );

    for n in 0..i.marcas.row_count() {
        if let Some(mut m) = i.marcas.row_data(n)
            && m.id == "qwen"
        {
            m.marcado = false;
            i.marcas.set_row_data(n, m);
        }
    }
    ui.invoke_guardar();
    esperar(50).await;
    let mensaje = ui.get_mensaje();
    a.anotar(mensaje == ajustes::GUARDADO, "cambio guardado", &mensaje);

    // D25: un cambio de apariencia se guarda y avisa; el tema no cambia antes de reabrir.
    let antes = ui.get_oscuro_aplicado();
    ui.set_idx_tema(1);
    ui.invoke_apariencia_elegida();
    esperar(50).await;
    let aviso = ui.get_mensaje_apariencia();
    let despues = ui.get_oscuro_aplicado();
    a.anotar(
        aviso == ajustes::GUARDADO && antes && despues,
        "un cambio de apariencia no se aplica antes de reabrir",
        &format!("\"{aviso}\"; oscuro antes {antes}, después {despues}"),
    );

    ui.invoke_ir(SharedString::from("ronda"));
    esperar(50).await;
    comprobar_ronda(
        a,
        i,
        "el cambio no se aplica antes de reabrir",
        &OPERADORES_ESPERADOS,
    );
    // Para la fase 3: un archivo con el tema y sin el tamaño; el tema se conserva.
    std::fs::write(
        i.datos.join(ajustes::ARCHIVO_APARIENCIA),
        "{\"tema\":\"oscuro\"}",
    )
    .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------- fase 3

async fn fase3(a: &mut Anotador, i: &Rc<Interfaz>) -> Result<(), String> {
    let ui = &i.ui;
    let sin_qwen: Vec<&str> = OPERADORES_ESPERADOS
        .iter()
        .copied()
        .filter(|id| *id != "qwen")
        .collect();
    comprobar_ronda(a, i, "el cambio se aplica al reabrir", &sin_qwen);
    let tema = opcion(ui.get_nombres_tema(), ui.get_idx_tema());
    let tamano = opcion(ui.get_nombres_tamano(), ui.get_idx_tamano());
    a.anotar(
        tema == "Oscuro" && tamano == "El del sistema",
        "preferencias sin el tamaño: el tema se conserva",
        &format!("tema «{tema}», texto «{tamano}»"),
    );
    let oscuro = ui.get_oscuro_aplicado();
    a.anotar(
        oscuro,
        "el tema guardado se aplica al reabrir",
        &format!("oscuro: {oscuro}"),
    );

    // IFZ-013: en la clase compacta no hay riel; el cajón aparta la página y se cierra al elegir.
    hasta(30, || i.panel_visible().is_some()).await;
    ui.window().set_size(slint::LogicalSize::new(500.0, 800.0));
    hasta(5, || ui.get_compacta()).await;
    let sin_riel = ui.get_compacta() && !ui.get_riel_visible();
    ui.set_cajon_abierto(true);
    esperar(200).await;
    let apartada = i.panel_visible().is_some_and(|p| p.rect_real().0 < 0);
    ui.invoke_ir(SharedString::from("historial"));
    esperar(50).await;
    a.anotar(
        sin_riel && apartada && !ui.get_cajon_abierto() && ui.get_seccion() == "historial",
        "cajón en la clase compacta",
        &format!(
            "compacta sin riel: {sin_riel}; página apartada: {apartada}; cajón abierto: {}; sección: {}",
            ui.get_cajon_abierto(),
            ui.get_seccion()
        ),
    );
    Ok(())
}
