mod autoprueba;
mod hilo;

use std::cell::{Cell, RefCell};
use std::hash::{BuildHasher, RandomState};
use std::path::{Path, PathBuf};
use std::rc::Rc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use paneles::{Navegador, Panel};

use crate::hilo::HiloNucleo;

slint::slint! {
    // ADR-0010, punto 11: «ChatCouncil (nueva)» hasta el relevo (E9).
    // ARR-007: con -autoprueba no se arma la interfaz; el panel va en una ventana sola.
    export component Lienzo inherits Window {
        title: "ChatCouncil (nueva)";
        width: 800px;
        height: 600px;
    }

    export component Ventana inherits Window {
        title: "ChatCouncil (nueva)";
        preferred-width: 1280px;
        preferred-height: 800px;
        out property <length> area-x: area.absolute-position.x;
        out property <length> area-y: area.absolute-position.y;
        out property <length> area-ancho: area.width;
        out property <length> area-alto: area.height;
        callback area-cambio();
        // El área del panel: el webview se reacomoda cuando cambia su tamaño.
        area := Rectangle {
            changed width => { root.area-cambio(); }
            changed height => { root.area-cambio(); }
        }
    }
}

/// Las páginas de prueba viajan dentro del ejecutable (ADR-0010, consecuencias) y se escriben en la
/// carpeta de datos que se esté usando, para servirlas como cc-prueba.test.
const PAGINAS_DE_PRUEBA: [(&str, &[u8]); 1] = [(
    "textarea.html",
    include_bytes!("../../../tests/paginas/textarea.html"),
)];

/// La página que abre el panel fuera de la autoprueba.
// shortcut: el esqueleto abre la página local de prueba; desde PART-012 los paneles abren los proveedores del consejo.
const PAGINA_DEL_ESQUELETO: &str = "https://cc-prueba.test/textarea.html";

fn main() {
    let arranque = Instant::now();
    let args: Vec<String> = std::env::args().collect();
    let codigo = match valor_de(&args, "-autoprueba") {
        Some(salida) => con_autoprueba(PathBuf::from(salida), arranque),
        None => {
            match carpeta_de_datos(&args, std::env::var_os("LOCALAPPDATA").map(PathBuf::from)) {
                Some(datos) => normal(datos),
                None => {
                    eprintln!("No se encontró la carpeta de datos: falta -datos y LOCALAPPDATA.");
                    1
                }
            }
        }
    };
    std::process::exit(codigo);
}

/// El valor que sigue a `nombre` en la línea de comandos.
fn valor_de<'a>(args: &'a [String], nombre: &str) -> Option<&'a str> {
    let i = args.iter().position(|a| a == nombre)?;
    args.get(i + 1).map(String::as_str)
}

/// ARR-001: la de `-datos` o, si no, `<LOCALAPPDATA>\ChatCouncil`.
fn carpeta_de_datos(args: &[String], local: Option<PathBuf>) -> Option<PathBuf> {
    valor_de(args, "-datos")
        .map(PathBuf::from)
        .or_else(|| local.map(|l| l.join("ChatCouncil")))
}

/// Un UUID v4 en minúsculas, como Guid.NewGuid() de la Unity.
fn nuevo_id() -> String {
    static CONTADOR: AtomicU64 = AtomicU64::new(0);
    let n = CONTADOR.fetch_add(1, Ordering::Relaxed);
    // shortcut: 128 bits de dos RandomState, con semilla aleatoria del sistema; si hiciera falta un generador auditado, el crate uuid.
    let alto = RandomState::new().hash_one((n, 0u8));
    let bajo = RandomState::new().hash_one((n, 1u8));
    let mut x = (u128::from(alto) << 64) | u128::from(bajo);
    x = (x & !(0xF << 76)) | (0x4 << 76);
    x = (x & !(0x3 << 62)) | (0x2 << 62);
    let h = format!("{x:032x}");
    format!(
        "{}-{}-{}-{}-{}",
        &h[..8],
        &h[8..12],
        &h[12..16],
        &h[16..20],
        &h[20..]
    )
}

/// La fecha y hora local, como `DateTime.Now:yyyy-MM-dd HH:mm:ss`.
fn ahora_local() -> String {
    let t = unsafe { windows::Win32::System::SystemInformation::GetLocalTime() };
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
        t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond
    )
}

fn escribir_paginas_de_prueba(datos: &Path) -> Result<PathBuf, String> {
    let carpeta =
        std::path::absolute(datos.join("paginas-de-prueba")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&carpeta).map_err(|e| e.to_string())?;
    for (nombre, bytes) in PAGINAS_DE_PRUEBA {
        std::fs::write(carpeta.join(nombre), bytes).map_err(|e| e.to_string())?;
    }
    Ok(carpeta)
}

/// Crea el panel en cuanto la ventana existe: su handle aparece recién después de una vuelta del
/// bucle tras show() (documentación de slint::Window::window_handle, 1.18).
async fn crear_panel(
    navegador: &mut Navegador,
    ventana: &slint::Window,
    rect: (f64, f64, f64, f64),
) -> Result<Panel, String> {
    let mut ultimo = String::new();
    for _ in 0..200 {
        match navegador.crear_panel(&ventana.window_handle(), rect) {
            Ok(p) => return Ok(p),
            Err(e) => ultimo = e,
        }
        paneles::dormir(Duration::from_millis(10)).await?;
    }
    Err(ultimo)
}

fn con_autoprueba(salida: PathBuf, arranque: Instant) -> i32 {
    let ui = match Lienzo::new() {
        Ok(ui) => ui,
        Err(e) => {
            eprintln!("No se pudo crear la ventana: {e}");
            return 1;
        }
    };
    let codigo = Rc::new(Cell::new(1));
    let c = codigo.clone();
    let ventana = ui.clone_strong();
    let corrida = slint::spawn_local(async move {
        c.set(autoprueba::correr(ventana.window(), &salida, arranque).await);
        let _ = slint::quit_event_loop();
    });
    if let Err(e) = corrida
        .map_err(|e| e.to_string())
        .and_then(|_| ui.run().map_err(|e| e.to_string()))
    {
        eprintln!("El bucle de la ventana se cortó: {e}");
        return 1;
    }
    codigo.get()
}

fn area(ui: &Ventana) -> (f64, f64, f64, f64) {
    (
        f64::from(ui.get_area_x()),
        f64::from(ui.get_area_y()),
        f64::from(ui.get_area_ancho()),
        f64::from(ui.get_area_alto()),
    )
}

fn normal(datos: PathBuf) -> i32 {
    let ui = match Ventana::new() {
        Ok(ui) => ui,
        Err(e) => {
            eprintln!("No se pudo crear la ventana: {e}");
            return 1;
        }
    };
    let _nucleo = HiloNucleo::iniciar(datos.clone());
    // El navegador vive mientras viva su panel.
    let abierto: Rc<RefCell<Option<(Navegador, Panel)>>> = Rc::default();

    let (w, a) = (ui.as_weak(), abierto.clone());
    ui.on_area_cambio(move || {
        if let (Some(ui), Some((_, panel))) = (w.upgrade(), a.borrow().as_ref()) {
            let (x, y, ancho, alto) = area(&ui);
            if let Err(e) = panel.rect(x, y, ancho, alto) {
                eprintln!("No se pudo reacomodar el panel: {e}");
            }
        }
    });

    let (w, a) = (ui.as_weak(), abierto.clone());
    let apertura = slint::spawn_local(async move {
        let Some(ui) = w.upgrade() else { return };
        let r = async {
            let paginas = escribir_paginas_de_prueba(&datos)?;
            let mut navegador = Navegador::new(&datos, Some(paginas));
            let panel = crear_panel(&mut navegador, ui.window(), area(&ui)).await?;
            panel.navegar(PAGINA_DEL_ESQUELETO).await?;
            Ok::<_, String>((navegador, panel))
        }
        .await;
        match r {
            Ok(par) => *a.borrow_mut() = Some(par),
            Err(e) => eprintln!("No se pudo abrir el panel: {e}"),
        }
    });
    if let Err(e) = apertura
        .map_err(|e| e.to_string())
        .and_then(|_| ui.run().map_err(|e| e.to_string()))
    {
        eprintln!("El bucle de la ventana se cortó: {e}");
        return 1;
    }
    0
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use std::path::PathBuf;

    fn args(a: &[&str]) -> Vec<String> {
        a.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn la_carpeta_de_datos_es_la_de_menos_datos() {
        // ARR-001
        let a = args(&["ChatCouncilNueva.exe", "-datos", r"C:\x"]);
        assert_eq!(
            carpeta_de_datos(&a, Some(r"C:\L".into())),
            Some(PathBuf::from(r"C:\x"))
        );
    }

    #[test]
    fn sin_menos_datos_es_la_de_appdata_local() {
        let a = args(&["ChatCouncilNueva.exe"]);
        assert_eq!(
            carpeta_de_datos(&a, Some(r"C:\L".into())),
            Some(PathBuf::from(r"C:\L\ChatCouncil"))
        );
        assert_eq!(carpeta_de_datos(&a, None), None);
    }

    #[test]
    fn menos_autoprueba_da_la_ruta_de_salida() {
        assert_eq!(
            valor_de(&args(&["x", "-autoprueba", "salida.txt"]), "-autoprueba"),
            Some("salida.txt")
        );
        assert_eq!(valor_de(&args(&["x", "-autoprueba"]), "-autoprueba"), None);
    }

    #[test]
    fn un_id_nuevo_es_un_uuid_v4_distinto_cada_vez() {
        let a = nuevo_id();
        let b = nuevo_id();
        assert_ne!(a, b);
        let partes: Vec<&str> = a.split('-').collect();
        assert_eq!(
            partes.iter().map(|p| p.len()).collect::<Vec<_>>(),
            [8, 4, 4, 4, 12]
        );
        assert!(partes[2].starts_with('4'));
        assert!(matches!(partes[3].as_bytes()[0], b'8' | b'9' | b'a' | b'b'));
        assert!(
            a.bytes()
                .all(|c| c == b'-' || c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
        );
    }
}
