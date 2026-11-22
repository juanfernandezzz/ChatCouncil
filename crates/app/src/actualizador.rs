//! ARR-008 y ARR-009 (Actualizador.cs de la Unity): al abrir, busca version.txt en el Release; si hay una versión
//! mayor, un aviso arriba la ofrece. Nunca instala sola (INV-ARR-001: podría haber una ronda en curso): solo el
//! botón «Actualizar» baja el instalador y lo corre con /SILENT; la app se cierra y el instalador la reabre.
//! La lógica de qué ofrecer y los textos están en nucleo::actualizacion; la red, en verificacion.

use std::path::Path;
use std::time::Duration;

use nucleo::actualizacion as act;
use slint::{ComponentHandle, Weak};
use verificacion::HttpSinCookies;

use crate::ventana::Ventana;

/// ARR-008: el techo de la búsqueda de version.txt.
const TECHO_VERSION: Duration = Duration::from_secs(15);
/// Como el HttpClient de la Unity: 10 minutos para bajar el instalador.
const TECHO_DESCARGA: Duration = Duration::from_secs(600);

/// Busca la versión publicada en otro hilo y, solo si es mayor, muestra el aviso. Sin red o sin Release no
/// pasa nada. Se llama una vez, con la interfaz armada y fuera de toda prueba (ARR-007).
pub(crate) fn iniciar(ui: &Ventana) {
    let debil = ui.as_weak();
    ui.on_aviso_accion({
        let debil = debil.clone();
        move || descargar(debil.clone())
    });
    std::thread::spawn(move || {
        let url = format!("{}{}", act::RELEASE, act::ARCHIVO_VERSION);
        let Some(publicada) = HttpSinCookies::nuevo().texto(&url, TECHO_VERSION) else {
            return;
        };
        let nueva = publicada.trim().to_string();
        let actual = env!("CARGO_PKG_VERSION");
        if !act::es_nueva(actual, &nueva) {
            return;
        }
        let _ = debil.upgrade_in_event_loop(move |ui| {
            ui.set_aviso_nueva(nueva.as_str().into());
            mostrar(&ui, &act::aviso(&nueva, actual), act::BOTON_ACTUALIZAR);
        });
    });
}

fn mostrar(ui: &Ventana, texto: &str, boton: &str) {
    ui.set_aviso_visible(true);
    ui.set_aviso_texto(texto.into());
    ui.set_aviso_boton(boton.into());
    ui.set_aviso_progreso(-1.0);
}

/// El botón: baja el instalador al temporal con la barra de avance y lo corre. En el hilo de la
/// interfaz; la descarga va en otro.
fn descargar(debil: Weak<Ventana>) {
    let Some(ui) = debil.upgrade() else {
        return;
    };
    let nueva = ui.get_aviso_nueva().to_string();
    ui.set_aviso_boton("".into());
    ui.set_aviso_progreso(0.0);
    ui.set_aviso_texto(act::descargando(&nueva, 0).into());
    let destino = std::env::temp_dir().join(act::ARCHIVO_INSTALADOR);
    std::thread::spawn(move || {
        let url = format!("{}{}", act::RELEASE, act::ARCHIVO_INSTALADOR);
        let mut vista = u32::MAX;
        let r =
            HttpSinCookies::nuevo().descargar(&url, &destino, TECHO_DESCARGA, |leido, total| {
                let p = (leido * 100).checked_div(total).unwrap_or(0).min(100) as u32;
                if p == vista {
                    return;
                }
                vista = p;
                let nueva = nueva.clone();
                let _ = debil.upgrade_in_event_loop(move |ui| {
                    ui.set_aviso_progreso(p as f32 / 100.0);
                    ui.set_aviso_texto(act::descargando(&nueva, p).into());
                });
            });
        let _ = debil.upgrade_in_event_loop(move |ui| match r {
            Err(_) => mostrar(&ui, act::SIN_DESCARGA, act::BOTON_REINTENTAR),
            Ok(()) => instalar(&ui, &destino),
        });
    });
}

fn instalar(ui: &Ventana, instalador: &Path) {
    ui.set_aviso_texto(act::INSTALANDO.into());
    let codigo = lanzar(instalador);
    if codigo <= 32 {
        mostrar(ui, &act::no_abre(codigo), act::BOTON_REINTENTAR);
    } else {
        let _ = slint::quit_event_loop();
    }
}

/// ShellExecuteW devuelve más de 32 si lanzó el programa (su documentación). El instalador corre sin
/// preguntas y con su ventana de avance; él cierra esta app si sigue abierta y la reabre.
fn lanzar(instalador: &Path) -> i64 {
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    use windows::core::{HSTRING, PCWSTR, w};
    // SAFETY: ShellExecuteW solo lee las cadenas, que viven hasta que la llamada vuelve.
    let r = unsafe {
        ShellExecuteW(
            None,
            w!("open"),
            &HSTRING::from(instalador.as_os_str()),
            w!("/SILENT"),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    r.0 as isize as i64
}

#[cfg(test)]
mod pruebas {
    use std::fs;

    fn leer(ruta: &str) -> String {
        let r = format!("{}/../../{ruta}", env!("CARGO_MANIFEST_DIR"));
        fs::read_to_string(&r).unwrap_or_else(|e| panic!("{r}: {e}"))
    }

    fn iss() -> String {
        leer("instalador/ChatCouncilNueva.iss")
    }

    // ARR-011: sin administrador, en español, escritorio opcional, sin el reinicio de Inno y la app
    // relanzada con los permisos de la persona tras la instalación silenciosa.
    #[test]
    fn el_instalador_es_por_usuario_en_espanol_y_relanza_sin_elevacion() {
        let s = iss();
        assert!(s.contains("\nPrivilegesRequired=lowest\n"));
        assert!(s.contains("\nRestartApplications=no\n"));
        assert!(s.contains("Spanish.isl"));
        assert!(s.contains("Description: \"Crear un acceso directo en el escritorio\""));
        assert!(s.contains("Flags: nowait runasoriginaluser; Check: WizardSilent"));
        assert!(s.contains("AppId=cl.juanfernandez.chatcouncil\n"));
        assert!(s.contains("AppName=ChatCouncil\n"));
        // D38.2: el nombre visible es ChatCouncil y el instalador borra los accesos viejos «(nueva)».
        assert!(s.contains("AppVerName=ChatCouncil {#Version}\n"));
        assert!(s.contains("[InstallDelete]"));
        assert!(s.contains("Name: \"{userdesktop}\\ChatCouncil (nueva).lnk\""));
        assert!(!s.contains("Name: \"{group}\\ChatCouncil (nueva)\""));
        // Una app nueva y la Unity conviven: ni el AppId ni la carpeta de la Unity.
        assert!(!s.contains("8C2B4E57"));
        assert!(!s.contains("DefaultDirName={autopf}\\ChatCouncil\n"));
    }

    // D38.2: el grupo de Inicio es el del nombre nuevo aunque haya una instalación anterior con otro grupo.
    #[test]
    fn el_instalador_no_reutiliza_el_grupo_anterior() {
        let s = iss();
        assert!(s.contains(
            "DefaultGroupName=ChatCouncil
"
        ));
        assert!(s.contains("UsePreviousGroup=no"));
    }

    // ARR-012: el aviso literal si falta WebView2 y la oferta de abrir la descarga; la instalación sigue igual.
    #[test]
    fn el_instalador_avisa_si_falta_webview2() {
        let s = iss();
        assert!(s.contains("ChatCouncil necesita Microsoft Edge WebView2 Runtime, que no está en este equipo. Sin él, los paneles no se abren."));
        assert!(s.contains("MB_YESNO"));
        assert!(s.contains("{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"));
        assert!(s.contains("Result := True;"));
    }

    // DIA-004: el acceso «ChatCouncil (depuración)» y abrir-depurando.bat con el puerto local de WebView2.
    #[test]
    fn el_instalador_deja_el_acceso_de_depuracion() {
        let s = iss();
        assert!(s.contains(
            "Name: \"{group}\\ChatCouncil (depuración)\"; Filename: \"{app}\\abrir-depurando.bat\""
        ));
        assert!(s.contains("Source: \"abrir-depurando.bat\""));
        let b = leer("instalador/abrir-depurando.bat");
        assert!(b.contains("--remote-debugging-port=9222"));
        assert!(b.contains("ChatCouncilNueva.exe"));
        assert!(
            b.is_ascii(),
            "un .bat con tildes se rompe en la consola de Windows"
        );
    }

    // INV-ARR-001: la actualización solo arranca con el botón. La búsqueda de `iniciar` no llama a
    // `lanzar`; la única llamada a `lanzar` está en `instalar`, a la que solo llega `descargar`, que solo
    // corre desde `on_aviso_accion`.
    #[test]
    fn solo_el_boton_instala() {
        let fuente = include_str!("actualizador.rs");
        let codigo = fuente.split("#[cfg(test)]").next().unwrap();
        assert_eq!(
            codigo.matches("lanzar(").count(),
            2,
            "su definición y la de instalar"
        );
        assert_eq!(
            codigo.matches("instalar(").count(),
            2,
            "su definición y la de descargar"
        );
        assert_eq!(
            codigo.matches("descargar(").count(),
            3,
            "su definición, el botón y la llamada a la red"
        );
        assert!(codigo.contains("on_aviso_accion"));
    }
}
