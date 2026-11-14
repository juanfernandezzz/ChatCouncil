// D27, A1: la release no abre consola. Las pruebas internas escriben su archivo y dan su código igual.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod autoprueba;
mod hilo;
mod interfaz;
mod lector;
mod pruebainterfaz;
mod pruebaronda;
mod ventana;

use std::cell::Cell;
use std::hash::{BuildHasher, RandomState};
use std::path::{Path, PathBuf};
use std::rc::Rc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use paneles::{Navegador, Panel};
use slint::ComponentHandle;

use crate::ventana::Lienzo;

/// Las páginas de prueba viajan dentro del ejecutable (ADR-0010, consecuencias) y se escriben en la
/// carpeta de datos que se esté usando, para servirlas como cc-prueba.test.
const PAGINAS_DE_PRUEBA: [(&str, &[u8]); 12] = [
    (
        "adjuntar.html",
        include_bytes!("../../../tests/paginas/adjuntar.html"),
    ),
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
pub(crate) const PAGINAS_LOCALES: [&str; 7] = [
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
        Ok(Modo::PruebaInterfaz {
            datos,
            salida,
            fase,
        }) => con_pruebainterfaz(datos, salida, fase),
        Ok(Modo::PruebaRonda { datos, salida }) => con_pruebaronda(datos, salida),
        Ok(Modo::Normal {
            datos,
            paginas_de_prueba,
            importar,
        }) => normal(datos, paginas_de_prueba, importar),
        Err(e) => {
            eprintln!("{e}");
            1
        }
    };
    hilo::SALIENDO.store(true, std::sync::atomic::Ordering::SeqCst);
    std::process::exit(codigo);
}

#[derive(Debug, PartialEq)]
enum Modo {
    Autoprueba(PathBuf),
    /// PRU-T19: siempre con -datos, nunca sobre la carpeta real.
    PruebaInterfaz {
        datos: PathBuf,
        salida: PathBuf,
        fase: u32,
    },
    /// PRU-012: también siempre con -datos.
    PruebaRonda {
        datos: PathBuf,
        salida: PathBuf,
    },
    Normal {
        datos: PathBuf,
        paginas_de_prueba: bool,
        /// ADR-0006: sin -datos se importan las conversaciones de la Unity desde este LOCALAPPDATA.
        importar: Option<PathBuf>,
    },
}

fn modo(args: &[String], local: Option<PathBuf>) -> Result<Modo, String> {
    let datos = carpeta_de_datos(args, local.clone())?;
    if let Some(salida) = valor_de(args, "-autoprueba")? {
        return Ok(Modo::Autoprueba(PathBuf::from(salida)));
    }
    if let Some(salida) = valor_de(args, "-pruebainterfaz")? {
        let datos = valor_de(args, "-datos")?
            .ok_or("-pruebainterfaz va solo con -datos sobre una carpeta temporal.")?;
        let fase = valor_de(args, "-fase")?
            .and_then(|f| f.parse().ok())
            .filter(|f| (1..=3).contains(f))
            .ok_or("-pruebainterfaz necesita -fase 1, 2 o 3.")?;
        return Ok(Modo::PruebaInterfaz {
            datos: PathBuf::from(datos),
            salida: PathBuf::from(salida),
            fase,
        });
    }
    if let Some(salida) = valor_de(args, "-pruebaronda")? {
        let datos = valor_de(args, "-datos")?
            .ok_or("-pruebaronda va solo con -datos sobre una carpeta temporal.")?;
        return Ok(Modo::PruebaRonda {
            datos: PathBuf::from(datos),
            salida: PathBuf::from(salida),
        });
    }
    let explicita = valor_de(args, "-datos")?.is_some();
    // Las páginas de prueba nunca van a la carpeta real: solo con una -datos explícita.
    let paginas_de_prueba = args.iter().any(|a| a == "-paginasdeprueba");
    if paginas_de_prueba && !explicita {
        return Err("-paginasdeprueba va solo con -datos sobre una carpeta temporal.".into());
    }
    datos
        .map(|datos| Modo::Normal {
            datos,
            paginas_de_prueba,
            importar: if explicita { None } else { local },
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

/// D27, A2: el registro de fallos, solo se agrega. Una línea con la fecha local y el tipo; nunca el
/// contenido de una página, una URL ni un dato de las cuentas. Si no se puede escribir, no hay a quién decirlo.
pub(crate) fn anotar_fallo(datos: &Path, tipo: &str) {
    use std::io::Write;
    let _ = std::fs::create_dir_all(datos);
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(datos.join("fallos.log"))
    {
        let _ = writeln!(f, "{} {tipo}", ahora_local());
    }
}

/// D27, A2: un pánico deja su línea en fallos.log (solo el archivo y la línea del código, no el mensaje,
/// que podría traer texto de una página) y sigue con el gancho de siempre.
pub(crate) fn registrar_panicos(datos: &Path) {
    let datos = datos.to_path_buf();
    let previo = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let lugar = info
            .location()
            // De una dependencia, la ruta trae la carpeta del usuario: queda desde el último «src».
            .map(|l| {
                let f = l.file().replace('\\', "/");
                let corto = f.rfind("/src/").map_or(f.as_str(), |i| &f[i + 1..]);
                format!(" en {corto}:{}", l.line())
            })
            .unwrap_or_default();
        anotar_fallo(&datos, &format!("pánico{lugar}"));
        previo(info);
    }));
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

/// La spec de un proveedor, tal cual specs.json, en JSON compacto.
fn spec_de(proveedor: &str) -> Option<String> {
    let todo = nucleo::json::leer(nucleo::datos::SPECS_JSON)?;
    let campo = |v: &nucleo::json::Valor, k: &str| match v {
        nucleo::json::Valor::Objeto(o) => o
            .iter()
            .find(|(n, _)| n.como_str() == Some(k))
            .map(|(_, v)| v.clone()),
        _ => None,
    };
    let s = campo(&campo(&todo, "specs")?, proveedor)?;
    let mut b = Vec::new();
    nucleo::json::escribir(&s, &mut b);
    String::from_utf8(b).ok()
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

/// Una prueba interna que corre con la interfaz armada y da el código de salida.
type Prueba =
    Box<dyn FnOnce(Rc<interfaz::Interfaz>) -> std::pin::Pin<Box<dyn Future<Output = i32>>>>;

/// Arma la interfaz y corre el bucle de la ventana; `prueba` corre dentro con la interfaz armada.
fn con_interfaz(o: interfaz::Opciones, prueba: Option<Prueba>) -> i32 {
    registrar_panicos(&o.datos);
    let i = match interfaz::Interfaz::armar(o) {
        Ok(i) => i,
        Err(e) => {
            eprintln!("{e}");
            return 1;
        }
    };
    let prueba_ninguna = prueba.is_none();
    let codigo = Rc::new(Cell::new(if prueba.is_some() { 1 } else { 0 }));
    if let Some(prueba) = prueba {
        let (c, x) = (codigo.clone(), i.clone());
        if let Err(e) = slint::spawn_local(async move {
            c.set(prueba(x).await);
            let _ = slint::quit_event_loop();
        }) {
            eprintln!("No se pudo empezar la prueba: {e}");
            return 1;
        }
    }
    // Las pruebas fijan su tamaño con set_size; una ventana maximizada lo ignoraría. Se maximiza ya
    // mostrada: run() aplica el tamaño preferido al mostrarla y pisaría el maximizado.
    if prueba_ninguna && area_de_trabajo().is_some_and(|(a, e)| abrir_maximizada(a, e)) {
        let ui = i.ui.as_weak();
        if let Err(e) = slint::spawn_local(async move {
            if let Some(ui) = ui.upgrade() {
                ui.window().set_maximized(true);
            }
        }) {
            eprintln!("No se pudo maximizar la ventana: {e}");
        }
    }
    if let Err(e) = i.ui.run() {
        eprintln!("El bucle de la ventana se cortó: {e}");
        return 1;
    }
    codigo.get()
}

fn con_pruebainterfaz(datos: PathBuf, salida: PathBuf, fase: u32) -> i32 {
    let o = interfaz::Opciones {
        datos,
        prueba: true,
        paginas_de_prueba: false,
        prueba_ronda: false,
    };
    con_interfaz(
        o,
        Some(Box::new(move |i| {
            Box::pin(async move { pruebainterfaz::correr(i, &salida, fase).await })
        })),
    )
}

fn con_pruebaronda(datos: PathBuf, salida: PathBuf) -> i32 {
    let o = interfaz::Opciones {
        datos,
        prueba: true,
        paginas_de_prueba: false,
        prueba_ronda: true,
    };
    con_interfaz(
        o,
        Some(Box::new(move |i| {
            Box::pin(async move { pruebaronda::correr(i, &salida).await })
        })),
    )
}

/// D26: el tamaño preferido (1280x800 lógicos, más unos 40 de barra de título y bordes) no cabe en el
/// área de trabajo (píxeles físicos): la ventana abre maximizada, como la Unity nunca se abre más grande
/// que la pantalla. Si no, la parte fuera de la pantalla no se dibuja y queda una banda vacía.
fn abrir_maximizada(area: (i32, i32), escala: f32) -> bool {
    let cabe = |logico: f32, fisico: i32| logico * escala <= fisico as f32;
    !(cabe(1280.0, area.0) && cabe(840.0, area.1))
}

/// El área de trabajo del monitor principal (sin la barra de tareas) y la escala del sistema.
#[cfg(windows)]
fn area_de_trabajo() -> Option<((i32, i32), f32)> {
    use windows::Win32::Foundation::RECT;
    use windows::Win32::UI::HiDpi::GetDpiForSystem;
    use windows::Win32::UI::WindowsAndMessaging::{
        SPI_GETWORKAREA, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS, SystemParametersInfoW,
    };
    let mut r = RECT::default();
    // SAFETY: SPI_GETWORKAREA escribe un RECT en el puntero, que apunta a `r`, vivo durante la llamada.
    unsafe {
        SystemParametersInfoW(
            SPI_GETWORKAREA,
            0,
            Some(&mut r as *mut RECT as *mut core::ffi::c_void),
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
        )
    }
    .ok()?;
    // SAFETY: sin argumentos ni estado; solo lee los ppp del sistema.
    let ppp = unsafe { GetDpiForSystem() };
    Some(((r.right - r.left, r.bottom - r.top), ppp as f32 / 96.0))
}

#[cfg(not(windows))]
fn area_de_trabajo() -> Option<((i32, i32), f32)> {
    None
}

fn normal(datos: PathBuf, paginas_de_prueba: bool, importar: Option<PathBuf>) -> i32 {
    if let Some(local) = importar
        && let Err(e) = interfaz::importar_de_la_unity(&local, &datos)
    {
        eprintln!("No se pudo importar el historial de la Unity: {e}");
    }
    con_interfaz(
        interfaz::Opciones {
            datos,
            prueba: false,
            paginas_de_prueba,
            prueba_ronda: false,
        },
        None,
    )
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
                paginas_de_prueba: false,
                importar: None,
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
                paginas_de_prueba: false,
                importar: Some(PathBuf::from(r"C:\L")),
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
                paginas_de_prueba: true,
                importar: None,
            })
        );
    }

    #[test]
    fn la_prueba_de_la_interfaz_va_solo_con_menos_datos_y_una_fase() {
        // B5: este lote nunca abre la app sin -datos.
        let local = Some(PathBuf::from(r"C:\L"));
        assert!(
            modo(
                &args(&["x", "-pruebainterfaz", "s.txt", "-fase", "1"]),
                local.clone()
            )
            .is_err()
        );
        assert!(
            modo(
                &args(&["x", "-pruebainterfaz", "s.txt", "-datos", r"C:	"]),
                local.clone()
            )
            .is_err()
        );
        assert!(
            modo(
                &args(&[
                    "x",
                    "-pruebainterfaz",
                    "s.txt",
                    "-datos",
                    r"C:	",
                    "-fase",
                    "4"
                ]),
                local.clone()
            )
            .is_err()
        );
        assert_eq!(
            modo(
                &args(&[
                    "x",
                    "-pruebainterfaz",
                    "s.txt",
                    "-datos",
                    r"C:	",
                    "-fase",
                    "2"
                ]),
                local
            ),
            Ok(Modo::PruebaInterfaz {
                datos: PathBuf::from(r"C:	"),
                salida: PathBuf::from("s.txt"),
                fase: 2,
            })
        );
    }

    #[test]
    fn abre_maximizada_si_el_tamano_preferido_no_cabe_en_la_pantalla() {
        // D26: 1366x768 con la barra de tareas deja 1366x728; 800 + 40 no caben.
        assert!(abrir_maximizada((1366, 728), 1.0));
        assert!(!abrir_maximizada((1920, 1040), 1.0));
        // A 150 %: 840 x 1,5 = 1260 > 1040.
        assert!(abrir_maximizada((1920, 1040), 1.5));
        assert!(!abrir_maximizada((2560, 1400), 1.25));
        assert!(abrir_maximizada((1279, 1400), 1.0));
        assert!(!abrir_maximizada((1280, 840), 1.0));
    }

    #[test]
    fn la_prueba_de_la_ronda_va_solo_con_menos_datos() {
        let local = Some(PathBuf::from(r"C:\L"));
        assert!(modo(&args(&["x", "-pruebaronda", "s.txt"]), local.clone()).is_err());
        assert_eq!(
            modo(
                &args(&["x", "-pruebaronda", "s.txt", "-datos", r"C:\t"]),
                local
            ),
            Ok(Modo::PruebaRonda {
                datos: PathBuf::from(r"C:\t"),
                salida: PathBuf::from("s.txt"),
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
