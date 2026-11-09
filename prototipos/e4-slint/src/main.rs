// Prototipo desechable de E4: una ventana Slint con webviews hijos nativos de WebView2.
// Uso, igual que en E3:
//   e4_slint.exe slint diez <carpeta-de-datos> <url>            diez paneles (medición controlada y reacomodo)
//   e4_slint.exe slint <escribir|leer|pruebas|google|foco|foco-crudo> <carpeta-de-datos> <salida.json>
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")] // sin consola en release: un conhost ensuciaría el árbol medido

use std::{
    cell::RefCell,
    fs::OpenOptions,
    future::Future,
    io::{Read, Write},
    net::TcpListener,
    path::Path,
    pin::Pin,
    rc::Rc,
    sync::{Arc, Mutex},
    task::{Context, Poll, Waker},
    time::Duration,
};

use e4_ui::Consejo;
use serde_json::{Value, json};
use slint::{ComponentHandle, Timer};
use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
use windows_core::{HSTRING, PCWSTR};
use wry::{
    Rect, WebContext, WebView, WebViewBuilder, WebViewExtWindows,
    dpi::{LogicalPosition, LogicalSize},
    raw_window_handle::HasWindowHandle,
};

const PUERTO: u16 = 47831; // el de E3: el origen local tiene que ser el mismo entre corridas para el perfil persistente
const TEXTO_PRUEBA: &str = "Ñandú café — áéíóú ÁÉÍÓÚ ü ¿¡ y emojis 😀👍🏽🇨🇱";
const PAGINA: &str = r#"<!doctype html><meta charset="utf-8"><title>e4</title>
<body style="margin:0;padding:80px 8px 8px">
<textarea id="ta" rows="3" cols="40"></textarea>
<div id="ce" contenteditable="true" style="border:1px solid #888;min-height:40px"></div>
<div id="respuesta"><p>Hola <b>mundo</b> ñ 😀</p></div>
<input type="file" id="f">
<script>
// Como los compositores reales: un paste se inserta desde clipboardData.
for (const el of [document.getElementById('ta'), document.getElementById('ce')]) {
  el.addEventListener('paste', e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
}
</script>"#;
const LEER_PERFIL: &str = "JSON.stringify({cookie: document.cookie, localStorage: localStorage.getItem('cc_e3')})";

// Promesa mínima: un valor que llega por callback (wry, WebView2 o un Timer) y despierta la tarea de slint::spawn_local.
#[derive(Clone, Default)]
struct Promesa(Arc<Mutex<(Option<String>, Option<Waker>)>>);

impl Promesa {
    fn cumplir(&self, v: String) {
        let mut g = self.0.lock().unwrap();
        g.0 = Some(v);
        if let Some(w) = g.1.take() {
            w.wake();
        }
    }
}

impl Future for Promesa {
    type Output = String;
    fn poll(self: Pin<&mut Self>, cx: &mut Context) -> Poll<String> {
        let mut g = self.0.lock().unwrap();
        match g.0.take() {
            Some(v) => Poll::Ready(v),
            None => {
                g.1 = Some(cx.waker().clone());
                Poll::Pending
            }
        }
    }
}

async fn dormir(ms: u64) {
    let p = Promesa::default();
    let q = p.clone();
    Timer::single_shot(Duration::from_millis(ms), move || q.cumplir(String::new()));
    p.await;
}

// https://docs.rs/wry/0.57.1/wry/struct.WebView.html#method.evaluate_script_with_callback
// WebView2 devuelve el resultado serializado en JSON; los scripts devuelven JSON.stringify(...), así que hay dos capas.
async fn js(wv: &WebView, codigo: &str) -> Result<Value, String> {
    let p = Promesa::default();
    let q = p.clone();
    wv.evaluate_script_with_callback(codigo, move |r| q.cumplir(r)).map_err(|e| e.to_string())?;
    let crudo = p.await;
    let capa: Value = serde_json::from_str(&crudo).map_err(|e| format!("{e}: {crudo}"))?;
    Ok(match capa {
        Value::String(s) => serde_json::from_str(&s).unwrap_or(Value::String(s)),
        otro => otro,
    })
}

// DevTools Protocol por el controlador de WebView2 que expone wry en Windows:
// https://docs.rs/wry/0.57.1/wry/trait.WebViewExtWindows.html#tymethod.webview
// https://learn.microsoft.com/microsoft-edge/webview2/reference/win32/icorewebview2#calldevtoolsprotocolmethod
async fn cdp(wv: &WebView, metodo: &str, params: Value) -> Result<Value, String> {
    let p = Promesa::default();
    let q = p.clone();
    let manejador = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |hr, respuesta| {
        q.cumplir(match hr {
            Ok(()) => respuesta,
            Err(e) => json!({ "errorHresult": e.to_string() }).to_string(),
        });
        Ok(())
    }));
    let (m, a) = (HSTRING::from(metodo), HSTRING::from(params.to_string()));
    unsafe { wv.webview().CallDevToolsProtocolMethod(PCWSTR(m.as_ptr()), PCWSTR(a.as_ptr()), &manejador) }
        .map_err(|e| e.to_string())?;
    let r: Value = serde_json::from_str(&p.await).map_err(|e| e.to_string())?;
    match r.get("errorHresult") {
        Some(e) => Err(e.to_string()),
        None => Ok(r),
    }
}

fn intentar(r: Result<Value, String>) -> Value {
    r.unwrap_or_else(|e| json!({ "error": e }))
}

async fn esperar_carga(wv: &WebView) -> Result<(), String> {
    for _ in 0..120 {
        // about:blank también llega a «complete» antes de que WebView2 navegue a la URL inicial.
        if let Ok(Value::String(s)) = js(wv, "location.href === 'about:blank' ? 'vacia' : document.readyState").await {
            if s == "complete" {
                return Ok(());
            }
        }
        dormir(500).await;
    }
    Err("la página no terminó de cargar en 60 s".into())
}

async fn pruebas(wv: &WebView, datos: &str) -> Value {
    let t = serde_json::to_string(TEXTO_PRUEBA).unwrap();
    let compositor = intentar(
        js(wv, &format!(r#"(() => {{
    const t = {t};
    const leer = el => el.tagName === 'TEXTAREA' ? el.value : el.textContent;
    const probar = (el, modo) => {{
      el.focus();
      if (el.tagName === 'TEXTAREA') el.value = ''; else el.textContent = '';
      if (modo === 'insertText') document.execCommand('insertText', false, t);
      else {{ const dt = new DataTransfer(); dt.setData('text/plain', t);
             el.dispatchEvent(new ClipboardEvent('paste', {{clipboardData: dt, bubbles: true, cancelable: true}})); }}
      const v = leer(el);
      return {{igual: v === t, leidos: [...v].length, esperados: [...t].length}};
    }};
    const ta = document.getElementById('ta'), ce = document.getElementById('ce');
    return JSON.stringify({{textareaInsertText: probar(ta, 'insertText'), textareaPaste: probar(ta, 'paste'),
                           contenteditableInsertText: probar(ce, 'insertText'), contenteditablePaste: probar(ce, 'paste')}});
  }})()"#))
        .await,
    );
    let dom = intentar(
        js(wv, "JSON.stringify({texto: document.querySelector('#respuesta').innerText, html: document.querySelector('#respuesta').outerHTML})")
            .await
            .map(|mut r| {
                r["textoIgual"] = json!(r["texto"] == "Hola mundo ñ 😀");
                r["htmlTraeNegrita"] = json!(r["html"].as_str().unwrap_or("").contains("<b>mundo</b>"));
                r
            }),
    );
    let adjunto = Path::new(datos).join("e4-adjunto.txt");
    std::fs::write(&adjunto, "adjunto de prueba E4\n").unwrap();
    let archivo = intentar(
        async {
            let doc = cdp(wv, "DOM.getDocument", json!({})).await?;
            let q = cdp(wv, "DOM.querySelector", json!({ "nodeId": doc["root"]["nodeId"], "selector": "#f" })).await?;
            cdp(wv, "DOM.setFileInputFiles", json!({ "files": [adjunto.to_string_lossy()], "nodeId": q["nodeId"] })).await?;
            let mut r = js(wv, "JSON.stringify({n: document.getElementById('f').files.length, nombre: document.getElementById('f').files[0]?.name, bytes: document.getElementById('f').files[0]?.size})").await?;
            r["esperado"] = json!({ "nombre": "e4-adjunto.txt", "bytes": std::fs::metadata(&adjunto).unwrap().len() });
            Ok(r)
        }
        .await,
    );
    json!({ "compositor": compositor, "dom": dom, "archivo": archivo })
}

async fn correr_modo(modo: &str, wv: &WebView, datos: &str) -> Value {
    if let Err(e) = esperar_carga(wv).await {
        return json!({ "error": e });
    }
    match modo {
        "escribir" => {
            let r = intentar(js(wv, &format!("document.cookie = 'cc_e3=persistente; max-age=86400; path=/'; localStorage.setItem('cc_e3', 'persistente'); {LEER_PERFIL}")).await);
            dormir(5000).await; // deja que WebView2 baje cookies y almacenamiento a disco
            r
        }
        "leer" => intentar(js(wv, LEER_PERFIL).await),
        "pruebas" => pruebas(wv, datos).await,
        "google" => {
            dormir(6000).await;
            intentar(js(wv, r#"JSON.stringify({host: location.host, ruta: location.pathname, titulo: document.title,
        disallowedUseragent: document.documentElement.innerText.includes('disallowed_useragent'),
        avisoInseguro: /no (es|sea) seguro|may not be secure/i.test(document.documentElement.innerText),
        campoCorreo: !!document.querySelector('input[type=email]')})"#).await)
        }
        _ => json!({ "error": format!("modo desconocido: {modo}") }),
    }
}

fn servir_pagina() {
    let l = TcpListener::bind(("127.0.0.1", PUERTO)).expect("puerto 47831 ocupado");
    std::thread::spawn(move || {
        // Un hilo por conexión: WebView2 abre preconexiones que no envían nada y bloquearían el read de las demás.
        for mut c in l.incoming().flatten() {
            std::thread::spawn(move || {
                let mut b = [0u8; 4096];
                let _ = c.read(&mut b);
                let _ = write!(c, "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{PAGINA}", PAGINA.len());
            });
        }
    });
}

fn marco(ui: &Consejo, i: usize) -> Rect {
    let (an, al, y0) = (ui.get_panel_ancho() as f64, ui.get_panel_alto() as f64, ui.get_alto_barra() as f64);
    Rect {
        position: LogicalPosition::new((i % 5) as f64 * an, y0 + (i / 5) as f64 * al).into(),
        size: LogicalSize::new(an, al).into(),
    }
}

// Deja en <datos>\reacomodo.jsonl el área cliente y los límites que WebView2 informa para cada panel, en píxeles físicos.
fn anotar_reacomodo(ui: &Consejo, webviews: &[WebView], datos: &str) {
    let escala = ui.window().scale_factor() as f64;
    let tam = ui.window().size();
    let paneles: Vec<Value> = webviews
        .iter()
        .filter_map(|w| w.bounds().ok())
        .map(|r| {
            let (p, s) = (r.position.to_physical::<i32>(escala), r.size.to_physical::<u32>(escala));
            json!([p.x, p.y, s.width, s.height])
        })
        .collect();
    let linea = json!({ "cliente": [tam.width, tam.height], "escala": escala, "maximizada": ui.window().is_maximized(), "paneles": paneles });
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(Path::new(datos).join("reacomodo.jsonl")) {
        let _ = writeln!(f, "{linea}");
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let [_, _, modo, datos, cuarto] = args.as_slice() else {
        panic!("uso: e4_slint slint <modo> <carpeta-de-datos> <url|salida.json>");
    };
    let (modo, datos, cuarto) = (modo.clone(), datos.clone(), cuarto.clone());
    std::fs::create_dir_all(&datos).unwrap();
    let foco = modo.starts_with("foco");
    let url = match modo.as_str() {
        "diez" => cuarto.clone(),
        "google" => "https://accounts.google.com/".into(),
        _ => {
            servir_pagina();
            format!("http://127.0.0.1:{PUERTO}/")
        }
    };

    let ui = Consejo::new().unwrap();
    ui.set_diez(modo == "diez");
    ui.set_barra(foco);
    ui.window().set_position(slint::PhysicalPosition::new(10, 10)); // el origen del runner de Flutter en E3
    let webviews: Rc<RefCell<Vec<WebView>>> = Rc::new(RefCell::new(Vec::new()));

    let (debil, ws, d) = (ui.as_weak(), webviews.clone(), datos.clone());
    ui.on_reacomodar(move || {
        let (Some(ui), Ok(ws)) = (debil.upgrade(), ws.try_borrow()) else { return };
        if ws.is_empty() {
            return;
        }
        for (i, w) in ws.iter().enumerate() {
            let _ = w.set_bounds(marco(&ui, i));
        }
        anotar_reacomodo(&ui, &ws, &d);
    });
    // https://docs.rs/wry/0.57.1/wry/struct.WebView.html#method.focus_parent
    // En «foco», al enfocar el campo Slint se devuelve el foco del teclado a la ventana; «foco-crudo» lo deja como está.
    let ws = webviews.clone();
    let arreglo = modo == "foco";
    ui.on_campo_enfocado(move || {
        if arreglo && let Ok(ws) = ws.try_borrow() {
            for w in ws.iter() {
                let _ = w.focus_parent();
            }
        }
    });
    ui.show().unwrap();

    let (debil, ws) = (ui.as_weak(), webviews.clone());
    slint::spawn_local(async move {
        let ui = debil.unwrap();
        // https://docs.rs/slint/1.18.1/slint/struct.Window.html#method.window_handle
        // El manejador «may only become available after the window has been created by the window manager».
        while HasWindowHandle::window_handle(&ui.window().window_handle()).is_err() {
            dormir(10).await;
        }
        let ventana = ui.window().window_handle();
        // https://docs.rs/wry/0.57.1/wry/struct.WebContext.html
        let mut contexto = WebContext::new(Some(datos.clone().into()));
        for i in 0..if modo == "diez" { 10 } else { 1 } {
            // https://docs.rs/wry/0.57.1/wry/struct.WebViewBuilder.html#method.build_as_child
            let w = WebViewBuilder::new_with_web_context(&mut contexto)
                .with_url(url.as_str())
                .with_bounds(marco(&ui, i))
                .build_as_child(&ventana)
                .unwrap();
            ws.borrow_mut().push(w);
        }
        anotar_reacomodo(&ui, &ws.borrow(), &datos);
        if modo == "diez" {
            return;
        }
        let wv = &ws.borrow()[0];
        if foco {
            // Estado para la prueba de foco: lo lee el script mientras agent-desktop escribe con el teclado.
            let _ = esperar_carga(wv).await;
            loop {
                let pagina = intentar(js(wv, "JSON.stringify({textarea: document.getElementById('ta').value, activo: document.activeElement && document.activeElement.id, documentoConFoco: document.hasFocus()})").await);
                let estado = json!({ "plugin": "slint", "modo": modo, "resultado": { "pagina": pagina, "slint": ui.get_texto_slint().as_str(),"campoSlintConFoco": ui.get_campo_con_foco() } });
                let _ = std::fs::write(&cuarto, serde_json::to_string_pretty(&estado).unwrap());
                dormir(500).await;
            }
        }
        let r = correr_modo(&modo, wv, &datos).await;
        std::fs::write(&cuarto, serde_json::to_string_pretty(&json!({ "plugin": "slint", "modo": modo, "resultado": r })).unwrap()).unwrap();
        let _ = slint::quit_event_loop();
    })
    .unwrap();

    slint::run_event_loop().unwrap();
    drop(webviews); // cierra los webviews antes de salir: la medición espera a que el árbol quede vacío
}
