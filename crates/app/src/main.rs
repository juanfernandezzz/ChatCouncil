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
const PAGINAS_DE_PRUEBA: [(&str, &[u8]); 11] = [
    (
        "chatgpt.html",
        include_bytes!("../../../tests/paginas/chatgpt.html"),
    ),
    (
        "cierre.html",
        include_bytes!("../../../tests/paginas/cierre.html"),
    ),
    (
        "emergente.html",
        include_bytes!("../../../tests/paginas/emergente.html"),
    ),
    (
        "informe.html",
        include_bytes!("../../../tests/paginas/informe.html"),
    ),
    (
        "kimi.html",
        include_bytes!("../../../tests/paginas/kimi.html"),
    ),
    (
        "kimink/embed.html",
        include_bytes!("../../../tests/paginas/kimink/embed.html"),
    ),
    (
        "mistral.html",
        include_bytes!("../../../tests/paginas/mistral.html"),
    ),
    (
        "popup.html",
        include_bytes!("../../../tests/paginas/popup.html"),
    ),
    (
        "recorte.html",
        include_bytes!("../../../tests/paginas/recorte.html"),
    ),
    (
        "ronda.html",
        include_bytes!("../../../tests/paginas/ronda.html"),
    ),
    (
        "textarea.html",
        include_bytes!("../../../tests/paginas/textarea.html"),
    ),
];

/// Las siete páginas locales que abre `-paginasdeprueba`, una por investigador del consejo.
const PAGINAS_LOCALES: [&str; 7] = [
    "textarea.html",
    "chatgpt.html",
    "mistral.html",
    "kimi.html",
    "recorte.html",
    "ronda.html",
    "informe.html",
];

fn main() {
    let arranque = Instant::now();
    let args: Vec<String> = std::env::args().collect();
    let codigo = match modo(&args, std::env::var_os("LOCALAPPDATA").map(PathBuf::from)) {
        Ok(Modo::Autoprueba(salida)) => con_autoprueba(salida, arranque),
        Ok(Modo::Normal {
            datos,
            paginas_de_prueba,
        }) => normal(datos, paginas_de_prueba),
        Err(e) => {
            eprintln!("{e}");
            1
        }
    };
    std::process::exit(codigo);
}

#[derive(Debug, PartialEq)]
enum Modo {
    Autoprueba(PathBuf),
    Normal {
        datos: PathBuf,
        paginas_de_prueba: bool,
    },
}

fn modo(args: &[String], local: Option<PathBuf>) -> Result<Modo, String> {
    let datos = carpeta_de_datos(args, local)?;
    if let Some(salida) = valor_de(args, "-autoprueba")? {
        return Ok(Modo::Autoprueba(PathBuf::from(salida)));
    }
    // Las páginas de prueba nunca van a la carpeta real: solo con una -datos explícita.
    let paginas_de_prueba = args.iter().any(|a| a == "-paginasdeprueba");
    if paginas_de_prueba && valor_de(args, "-datos")?.is_none() {
        return Err("-paginasdeprueba va solo con -datos sobre una carpeta temporal.".into());
    }
    datos
        .map(|datos| Modo::Normal {
            datos,
            paginas_de_prueba,
        })
        .ok_or_else(|| "No se encontró la carpeta de datos: falta -datos y LOCALAPPDATA.".into())
}

/// El valor que sigue a `nombre` en la línea de comandos. Una bandera sin su valor es un error: caer
/// al modo normal abriría la carpeta real (revisión PART-011).
fn valor_de<'a>(args: &'a [String], nombre: &str) -> Result<Option<&'a str>, String> {
    let Some(i) = args.iter().position(|a| a == nombre) else {
        return Ok(None);
    };
    match args.get(i + 1) {
        Some(v) if !v.starts_with('-') => Ok(Some(v)),
        _ => Err(format!("Falta el valor de {nombre}.")),
    }
}

/// ARR-001: la de `-datos` o, si no, `<LOCALAPPDATA>\ChatCouncil`.
fn carpeta_de_datos(args: &[String], local: Option<PathBuf>) -> Result<Option<PathBuf>, String> {
    Ok(valor_de(args, "-datos")?
        .map(PathBuf::from)
        .or_else(|| local.map(|l| l.join("ChatCouncil"))))
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
    // SAFETY: GetLocalTime no toma punteros y siempre devuelve un SYSTEMTIME válido (revisión PART-011, hallazgo 11).
    let t = unsafe { windows::Win32::System::SystemInformation::GetLocalTime() };
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
        t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond
    )
}

/// Los puntos por pulgada que Windows da al monitor de la ventana (GetDpiForWindow).
fn ppp_de_la_ventana(ventana: &slint::Window) -> Result<u32, String> {
    use paneles::raw_window_handle::{HasWindowHandle, RawWindowHandle};
    let manija = ventana.window_handle();
    let RawWindowHandle::Win32(w) = manija.window_handle().map_err(|e| e.to_string())?.as_raw()
    else {
        return Err("la ventana no es de Win32".into());
    };
    let hwnd = windows::Win32::Foundation::HWND(w.hwnd.get() as *mut _);
    // SAFETY: el HWND es el de la ventana de Slint, que está viva mientras dura esta llamada.
    Ok(unsafe { windows::Win32::UI::HiDpi::GetDpiForWindow(hwnd) })
}

fn escribir_paginas_de_prueba(datos: &Path) -> Result<PathBuf, String> {
    let carpeta =
        std::path::absolute(datos.join("paginas-de-prueba")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&carpeta).map_err(|e| e.to_string())?;
    for (nombre, bytes) in PAGINAS_DE_PRUEBA {
        let ruta = carpeta.join(nombre);
        if let Some(padre) = ruta.parent() {
            std::fs::create_dir_all(padre).map_err(|e| e.to_string())?;
        }
        std::fs::write(ruta, bytes).map_err(|e| e.to_string())?;
    }
    Ok(carpeta)
}

/// Crea el panel en cuanto la ventana existe: su handle aparece recién después de una vuelta del
/// bucle tras show() (documentación de slint::Window::window_handle, 1.18).
async fn crear_panel(
    navegador: &Navegador,
    ventana: &slint::Window,
    perfil: &str,
    rect: (f64, f64, f64, f64),
) -> Result<Panel, String> {
    let mut ultimo = String::new();
    for _ in 0..200 {
        match navegador.crear_panel(&ventana.window_handle(), perfil, rect) {
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

/// El primer panel ocupa el área; los demás van fuera de la ventana con su tamaño, no a 0×0, para que
/// una SPA siga montando (PantallaRonda.Ubicar).
fn ubicar(ui: &Ventana, paneles: &[Panel]) {
    let (x, y, ancho, alto) = area(ui);
    for (i, p) in paneles.iter().enumerate() {
        let r = if i == 0 {
            p.rect(x, y, ancho, alto)
        } else {
            p.rect(-ancho - 100.0, 0.0, ancho, alto)
        };
        if let Err(e) = r {
            eprintln!("No se pudo reacomodar el panel: {e}");
        }
    }
}

fn normal(datos: PathBuf, paginas_de_prueba: bool) -> i32 {
    let ui = match Ventana::new() {
        Ok(ui) => ui,
        Err(e) => {
            eprintln!("No se pudo crear la ventana: {e}");
            return 1;
        }
    };
    let _nucleo = HiloNucleo::iniciar(datos.clone());
    let abiertos: Rc<RefCell<Vec<Panel>>> = Rc::default();

    let (w, a) = (ui.as_weak(), abiertos.clone());
    ui.on_area_cambio(move || {
        if let Some(ui) = w.upgrade() {
            ubicar(&ui, &a.borrow());
        }
    });

    let (w, a) = (ui.as_weak(), abiertos.clone());
    let apertura = slint::spawn_local(async move {
        let Some(ui) = w.upgrade() else { return };
        let r = async {
            // Revisión PART-011, hallazgo 4: solo con -paginasdeprueba se escriben y se sirven las páginas de prueba.
            let (navegador, urls) = if paginas_de_prueba {
                let carpeta = escribir_paginas_de_prueba(&datos)?;
                let urls = PAGINAS_LOCALES.map(|p| format!("https://cc-prueba.test/{p}"));
                (Navegador::new(&datos, Some(carpeta)), urls.to_vec())
            } else {
                // shortcut: un panel en blanco; desde PART-014 los paneles abren los proveedores del consejo.
                (
                    Navegador::new(&datos, None),
                    vec!["about:blank".to_string()],
                )
            };
            let mut cargas = Vec::new();
            for url in &urls {
                let panel = crear_panel(&navegador, ui.window(), "proveedores", area(&ui)).await?;
                cargas.push(panel.navegar(url));
                a.borrow_mut().push(panel);
                ubicar(&ui, &a.borrow());
            }
            // Como Paneles.EsperarCarga: una página que tarda no descarta su panel.
            for (carga, url) in cargas.into_iter().zip(&urls) {
                if let Err(e) = carga.await {
                    eprintln!("{url}: {e}");
                }
            }
            Ok::<_, String>(())
        }
        .await;
        if let Err(e) = r {
            eprintln!("No se pudieron abrir los paneles: {e}");
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
            modo(&a, Some(r"C:\L".into())),
            Ok(Modo::Normal {
                datos: PathBuf::from(r"C:\x"),
                paginas_de_prueba: false
            })
        );
    }

    #[test]
    fn sin_menos_datos_es_la_de_appdata_local() {
        let a = args(&["ChatCouncilNueva.exe"]);
        assert_eq!(
            modo(&a, Some(r"C:\L".into())),
            Ok(Modo::Normal {
                datos: PathBuf::from(r"C:\L\ChatCouncil"),
                paginas_de_prueba: false
            })
        );
        assert!(modo(&a, None).is_err());
    }

    #[test]
    fn menos_autoprueba_da_la_ruta_de_salida() {
        assert_eq!(
            modo(&args(&["x", "-autoprueba", "salida.txt"]), None),
            Ok(Modo::Autoprueba(PathBuf::from("salida.txt")))
        );
    }

    #[test]
    fn una_bandera_sin_su_valor_nunca_cae_a_la_carpeta_real() {
        // Revisión PART-011: sin esto, «-autoprueba» o «-datos» solos abrían <LOCALAPPDATA>\ChatCouncil.
        let local = Some(PathBuf::from(r"C:\L"));
        for a in [
            &["x", "-autoprueba"][..],
            &["x", "-datos"],
            &["x", "-datos", "-autoprueba", "salida.txt"],
            &["x", "-autoprueba", "-datos", r"C:\x"],
        ] {
            let r = modo(&args(a), local.clone());
            assert!(r.is_err(), "{a:?} dio {r:?}");
        }
    }

    #[test]
    fn las_paginas_de_prueba_van_solo_con_una_carpeta_de_datos_explicita() {
        // Revisión PART-011, hallazgo 4.
        let local = Some(PathBuf::from(r"C:\L"));
        assert!(modo(&args(&["x", "-paginasdeprueba"]), local.clone()).is_err());
        assert_eq!(
            modo(&args(&["x", "-datos", r"C:\t", "-paginasdeprueba"]), local),
            Ok(Modo::Normal {
                datos: PathBuf::from(r"C:\t"),
                paginas_de_prueba: true
            })
        );
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
