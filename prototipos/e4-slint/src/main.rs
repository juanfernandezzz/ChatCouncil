// Prototipo desechable de E4: una ventana Slint con diez webviews hijos nativos de WebView2.
// Uso, igual que en E3: e4_slint.exe slint diez <carpeta-de-datos> <url>
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")] // sin consola en release: un conhost ensuciaría el árbol medido

use std::{cell::RefCell, rc::Rc, time::Duration};

use e4_ui::Consejo;
use slint::{ComponentHandle, Timer, Weak};
use wry::{
    Rect, WebContext, WebView, WebViewBuilder,
    dpi::{LogicalPosition, LogicalSize},
    raw_window_handle::HasWindowHandle,
};

// https://docs.rs/slint/1.18.1/slint/struct.Window.html#method.window_handle
// El manejador «may only become available after the window has been created by the window manager»; hasta entonces da WindowHandleError(NotSupported).
// Reintento de un solo disparo: un temporizador repetido seguiría despertando el bucle durante la medición.
fn crear_paneles(debil: Weak<Consejo>, datos: String, url: String, webviews: Rc<RefCell<Vec<WebView>>>) {
    let ui = debil.unwrap();
    let ventana = ui.window().window_handle();
    if HasWindowHandle::window_handle(&ventana).is_err() {
        Timer::single_shot(Duration::from_millis(10), move || crear_paneles(debil, datos, url, webviews));
        return;
    }
    let (ancho, alto) = (ui.get_panel_ancho() as f64, ui.get_panel_alto() as f64);
    // https://docs.rs/wry/0.57.1/wry/struct.WebContext.html
    let mut contexto = WebContext::new(Some(datos.into()));
    for i in 0..10 {
        // https://docs.rs/wry/0.57.1/wry/struct.WebViewBuilder.html#method.build_as_child
        let webview = WebViewBuilder::new_with_web_context(&mut contexto)
            .with_url(url.as_str())
            .with_bounds(Rect {
                position: LogicalPosition::new((i % 5) as f64 * ancho, (i / 5) as f64 * alto).into(),
                size: LogicalSize::new(ancho, alto).into(),
            })
            .build_as_child(&ventana)
            .unwrap();
        webviews.borrow_mut().push(webview);
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let [_, _, modo, datos, url] = args.as_slice() else {
        panic!("uso: e4_slint slint diez <carpeta-de-datos> <url>");
    };
    assert_eq!(modo, "diez");

    let ui = Consejo::new().unwrap();
    ui.window().set_position(slint::PhysicalPosition::new(10, 10)); // el origen del runner de Flutter en E3
    ui.show().unwrap();

    let webviews = Rc::new(RefCell::new(Vec::new()));
    let (debil, datos, url, guardados) = (ui.as_weak(), datos.clone(), url.clone(), webviews.clone());
    Timer::single_shot(Duration::ZERO, move || crear_paneles(debil, datos, url, guardados));

    slint::run_event_loop().unwrap();
    drop(webviews); // cierra los webviews antes de salir: la medición espera a que el árbol quede vacío
}
