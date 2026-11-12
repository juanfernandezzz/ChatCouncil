//! Los paneles: las páginas de los proveedores en webviews hijos de la ventana de la app (ADR-0010).
//! Solo ejecuta. No expone enviar, clic ni teclas sobre la página, ni lectura de cookies o de
//! almacenamiento (ADR-0010, puntos 7 y 8): fuera de este crate solo existen las funciones de abajo.

use std::cell::{Cell, RefCell};
use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::rc::Rc;
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll, Waker};
use std::time::{Duration, Instant};

use nucleo::json::{self, Valor};
use nucleo::texto::Texto;
use wry::dpi::{LogicalPosition, LogicalSize};
use wry::raw_window_handle::HasWindowHandle;
use wry::{PageLoadEvent, Rect, WebContext, WebView, WebViewBuilder};

/// DAT-003: el script de página de la Unity, compilado e idéntico (datos/pagina/ORIGEN.md).
pub const PAGINA_JS: &str = include_str!("../../../datos/pagina/pagina.js");

/// PAN-001: los switches que mantienen activos los paneles ocultos, como en la Unity.
pub const SWITCHES: [&str; 3] = [
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
];

/// Los hosts con que se sirven las páginas de prueba (PRU-001).
pub const HOSTS_DE_PRUEBA: [&str; 2] = ["cc-prueba.test", "cc-otro.test"];

/// Techo de una ejecución de script y de una operación del script de página, como en la Unity.
const TECHO_EJECUTAR: Duration = Duration::from_secs(90);
const TECHO_CORRER: Duration = Duration::from_secs(30);

// ------------------------------------------------------------------ esperas sin tokio (ADR-0010, 2)

struct Estado<T> {
    valor: Option<Result<T, String>>,
    waker: Option<Waker>,
}

fn completar<T>(estado: &Mutex<Estado<T>>, valor: Result<T, String>) {
    let mut e = estado.lock().unwrap_or_else(|p| p.into_inner());
    if e.valor.is_none() {
        e.valor = Some(valor);
        if let Some(w) = e.waker.take() {
            w.wake();
        }
    }
}

/// El lado que responde. Si se suelta sin responder, la espera termina en error.
pub struct Enviador<T>(Arc<Mutex<Estado<T>>>);

/// Una espera de un solo valor que se puede `await` en el hilo de la interfaz.
pub struct Respuesta<T>(Arc<Mutex<Estado<T>>>);

pub fn canal<T>() -> (Enviador<T>, Respuesta<T>) {
    let estado = Arc::new(Mutex::new(Estado {
        valor: None,
        waker: None,
    }));
    (Enviador(estado.clone()), Respuesta(estado))
}

impl<T> Enviador<T> {
    pub fn enviar(self, valor: T) {
        completar(&self.0, Ok(valor));
    }

    pub fn fallar(self, error: impl Into<String>) {
        completar(&self.0, Err(error.into()));
    }
}

impl<T> Drop for Enviador<T> {
    fn drop(&mut self) {
        completar(&self.0, Err("se cortó sin respuesta".into()));
    }
}

impl<T> Future for Respuesta<T> {
    type Output = Result<T, String>;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let mut e = self.0.lock().unwrap_or_else(|p| p.into_inner());
        match e.valor.take() {
            Some(v) => Poll::Ready(v),
            None => {
                e.waker = Some(cx.waker().clone());
                Poll::Pending
            }
        }
    }
}

impl<T: Send + 'static> Respuesta<T> {
    /// Termina en error si no llegó nada antes del techo.
    pub fn con_techo(self, techo: Duration, error: String) -> Respuesta<T> {
        let estado = self.0.clone();
        // shortcut: un hilo por techo; si las esperas crecen, un solo temporizador compartido.
        std::thread::spawn(move || {
            std::thread::sleep(techo);
            completar(&estado, Err(error));
        });
        self
    }
}

/// Una pausa que no bloquea el hilo de la interfaz.
pub fn dormir(d: Duration) -> Respuesta<()> {
    let (enviar, respuesta) = canal();
    // shortcut: un hilo por pausa; en PART-013, con el puente completo, un temporizador del bucle.
    std::thread::spawn(move || {
        std::thread::sleep(d);
        enviar.enviar(());
    });
    respuesta
}

fn fallida<T>(error: impl ToString) -> Respuesta<T> {
    let (enviar, respuesta) = canal();
    enviar.fallar(error.to_string());
    respuesta
}

// ------------------------------------------------------------------ navegador y panel

fn rectangulo(x: f64, y: f64, ancho: f64, alto: f64) -> Rect {
    Rect {
        position: LogicalPosition::new(x, y).into(),
        size: LogicalSize::new(ancho, alto).into(),
    }
}

/// PAN-001: un solo navegador, con su carpeta en `<datos>/navegador`.
pub struct Navegador {
    contexto: WebContext,
    paginas_de_prueba: Option<PathBuf>,
}

impl Navegador {
    /// `paginas_de_prueba`: la carpeta que se sirve como cc-prueba.test y cc-otro.test (solo las pruebas).
    pub fn new(datos: &Path, paginas_de_prueba: Option<PathBuf>) -> Navegador {
        Navegador {
            contexto: WebContext::new(Some(datos.join("navegador"))),
            paginas_de_prueba,
        }
    }

    /// Un panel hijo de la ventana, en el rectángulo dado en píxeles lógicos, todavía sin página.
    pub fn crear_panel(
        &mut self,
        ventana: &impl HasWindowHandle,
        (x, y, ancho, alto): (f64, f64, f64, f64),
    ) -> Result<Panel, String> {
        let carga: Rc<RefCell<Option<Enviador<()>>>> = Rc::default();
        let avisar = carga.clone();
        let constructor = WebViewBuilder::new_with_web_context(&mut self.contexto)
            .with_bounds(rectangulo(x, y, ancho, alto))
            .with_on_page_load_handler(move |evento, _url| {
                if let PageLoadEvent::Finished = evento
                    && let Some(e) = avisar.borrow_mut().take()
                {
                    e.enviar(());
                }
            });
        #[cfg(windows)]
        let constructor = {
            use wry::WebViewBuilderExtWindows;
            // Reemplaza los argumentos por defecto de wry: la Unity pasa solo los tres switches.
            constructor.with_additional_browser_args(SWITCHES.join(" "))
        };
        let webview = constructor
            .build_as_child(ventana)
            .map_err(|e| e.to_string())?;
        #[cfg(windows)]
        if let Some(carpeta) = &self.paginas_de_prueba {
            windows::servir_carpeta(&webview, carpeta)?;
        }
        Ok(Panel {
            webview,
            carga,
            siguiente_id: Cell::new(1),
        })
    }
}

pub struct Panel {
    webview: WebView,
    carga: Rc<RefCell<Option<Enviador<()>>>>,
    siguiente_id: Cell<u64>,
}

impl Panel {
    pub fn rect(&self, x: f64, y: f64, ancho: f64, alto: f64) -> Result<(), String> {
        self.webview
            .set_bounds(rectangulo(x, y, ancho, alto))
            .map_err(|e| e.to_string())
    }

    /// Navega y termina cuando la página terminó de cargar.
    pub fn navegar(&self, url: &str) -> Respuesta<()> {
        let (enviar, respuesta) = canal();
        *self.carga.borrow_mut() = Some(enviar);
        if let Err(e) = self.webview.load_url(url) {
            self.carga.borrow_mut().take();
            return fallida(e);
        }
        respuesta.con_techo(
            TECHO_EJECUTAR,
            format!("la página {url} no terminó de cargar"),
        )
    }

    /// Ejecuta un script en la página; responde el resultado como JSON.
    pub fn ejecutar(&self, js: &str) -> Respuesta<String> {
        let (enviar, respuesta) = canal();
        let enviar = Mutex::new(Some(enviar));
        let r = self
            .webview
            .evaluate_script_with_callback(js, move |resultado| {
                if let Some(e) = enviar.lock().unwrap_or_else(|p| p.into_inner()).take() {
                    e.enviar(resultado);
                }
            });
        match r {
            Ok(()) => respuesta.con_techo(TECHO_EJECUTAR, "el script no respondió".into()),
            Err(e) => fallida(e),
        }
    }

    /// Una operación del script de página (escribir, leerCompositor, chatVacio…), como Paneles.cs:
    /// inyecta el script si la página no lo tiene, lo pide y consulta cada 100 ms hasta el techo.
    pub async fn correr(&self, op: &str, spec: &str, texto: Option<&str>) -> Result<Valor, String> {
        if self.ejecutar("typeof window.__cc").await? != "\"object\"" {
            let r = self.ejecutar(&format!("{PAGINA_JS}\n;'ok'")).await?;
            if r != "\"ok\"" {
                return Err(format!("el script de página no cargó: {r}"));
            }
        }
        let id = format!("pedido-{}", self.siguiente_id.get());
        self.siguiente_id.set(self.siguiente_id.get() + 1);
        let mut pedido = b"{\"id\":".to_vec();
        json::escapar(&id.as_str().into(), &mut pedido);
        pedido.extend_from_slice(b",\"op\":");
        json::escapar(&op.into(), &mut pedido);
        pedido.extend_from_slice(b",\"spec\":");
        pedido.extend_from_slice(spec.as_bytes());
        if let Some(t) = texto {
            pedido.extend_from_slice(b",\"texto\":");
            json::escapar(&t.into(), &mut pedido);
        }
        pedido.push(b'}');
        let pedir = llamada("pedir", &String::from_utf8_lossy(&pedido));
        let r = self.ejecutar(&pedir).await?;
        if r != "\"ok\"" {
            return Err(format!("el script de página no tomó el pedido: {r}"));
        }
        let consultar = llamada("consultar", &id);
        let inicio = Instant::now();
        loop {
            let crudo = self.ejecutar(&consultar).await?;
            let estado = json::leer(&crudo)
                .and_then(|v| match v {
                    Valor::Texto(t) => t.como_str().and_then(json::leer),
                    _ => None,
                })
                .ok_or_else(|| format!("consultar respondió algo que no es JSON: {crudo}"))?;
            match texto_de(campo(&estado, "estado")).as_deref() {
                Some("listo") => {
                    return Ok(campo(&estado, "resultado").cloned().unwrap_or(Valor::Nulo));
                }
                Some("error") => {
                    return Err(texto_de(campo(&estado, "error")).unwrap_or_default());
                }
                _ => {}
            }
            if inicio.elapsed() > TECHO_CORRER {
                return Err(format!(
                    "{op}: la página no respondió en {} s",
                    TECHO_CORRER.as_secs()
                ));
            }
            dormir(Duration::from_millis(100)).await?;
        }
    }

    /// La versión del navegador, como la informa WebView2.
    #[cfg(windows)]
    pub fn version_del_navegador(&self) -> Result<String, String> {
        windows::version(&self.webview)
    }

    /// La línea de comandos del proceso del navegador, leída del sistema operativo.
    #[cfg(windows)]
    pub fn linea_de_comandos_del_navegador(&self) -> Result<String, String> {
        windows::linea_de_comandos(&self.webview)
    }
}

/// `window.__cc.<funcion>("<argumento>")`, con el argumento escapado como JSON.stringify.
fn llamada(funcion: &str, argumento: &str) -> String {
    let mut js = format!("window.__cc.{funcion}(").into_bytes();
    json::escapar(&Texto::from(argumento), &mut js);
    js.push(b')');
    String::from_utf8_lossy(&js).into_owned()
}

fn campo<'a>(objeto: &'a Valor, nombre: &str) -> Option<&'a Valor> {
    match objeto {
        Valor::Objeto(campos) => campos
            .iter()
            .find(|(k, _)| k.como_str() == Some(nombre))
            .map(|(_, v)| v),
        _ => None,
    }
}

fn texto_de(v: Option<&Valor>) -> Option<String> {
    match v {
        Some(Valor::Texto(t)) => Some(t.para_mostrar().into_owned()),
        _ => None,
    }
}

#[cfg(windows)]
mod windows {
    use std::path::Path;

    use ::windows::Wdk::System::Threading::{
        NtQueryInformationProcess, ProcessCommandLineInformation,
    };
    use ::windows::Win32::Foundation::{CloseHandle, UNICODE_STRING};
    use ::windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
    use ::windows::core::{HSTRING, Interface, PWSTR};
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW, ICoreWebView2_3,
    };
    use wry::{WebView, WebViewExtWindows};

    pub(crate) fn servir_carpeta(webview: &WebView, carpeta: &Path) -> Result<(), String> {
        let wv: ICoreWebView2_3 = webview.webview().cast().map_err(|e| e.to_string())?;
        for host in super::HOSTS_DE_PRUEBA {
            unsafe {
                wv.SetVirtualHostNameToFolderMapping(
                    &HSTRING::from(host),
                    &HSTRING::from(carpeta.as_os_str()),
                    COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW,
                )
            }
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub(crate) fn version(webview: &WebView) -> Result<String, String> {
        let mut v = PWSTR::null();
        unsafe { webview.environment().BrowserVersionString(&mut v) }.map_err(|e| e.to_string())?;
        Ok(webview2_com::take_pwstr(v))
    }

    /// Como LineaDeComandos de panel.cpp: NtQueryInformationProcess con ProcessCommandLineInformation.
    pub(crate) fn linea_de_comandos(webview: &WebView) -> Result<String, String> {
        let mut pid = 0u32;
        unsafe { webview.webview().BrowserProcessId(&mut pid) }.map_err(|e| e.to_string())?;
        let proceso = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }
            .map_err(|e| e.to_string())?;
        // u64 para que UNICODE_STRING quede alineado al principio del búfer.
        let mut bufer = vec![0u64; 8192];
        let mut largo = 0u32;
        let estado = unsafe {
            NtQueryInformationProcess(
                proceso,
                ProcessCommandLineInformation,
                bufer.as_mut_ptr().cast(),
                (bufer.len() * 8) as u32,
                &mut largo,
            )
        };
        let linea = if estado.is_ok() {
            let u = unsafe { &*(bufer.as_ptr() as *const UNICODE_STRING) };
            let unidades =
                unsafe { std::slice::from_raw_parts(u.Buffer.0, usize::from(u.Length) / 2) };
            Ok(String::from_utf16_lossy(unidades))
        } else {
            Err(format!(
                "NtQueryInformationProcess devolvió {:#x}",
                estado.0
            ))
        };
        unsafe {
            let _ = CloseHandle(proceso);
        }
        linea
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use sha2::{Digest, Sha256};
    use std::sync::Arc;
    use std::task::{Context, Poll, Wake, Waker};

    #[test]
    fn pagina_js_es_identico_al_de_la_unity() {
        // DAT-003: el sha256 anotado en datos/pagina/ORIGEN.md.
        let sha: String = Sha256::digest(PAGINA_JS.as_bytes())
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        assert_eq!(
            sha,
            "39b048ce1545cf1d6fcb16f3c4e55f65c882d9cd9dc0d1dea261ed8daec15161"
        );
    }

    struct Despertador(std::thread::Thread);
    impl Wake for Despertador {
        fn wake(self: Arc<Self>) {
            self.0.unpark();
        }
    }

    /// Espera una Respuesta en el hilo de la prueba, como lo haría el bucle de la interfaz.
    pub(crate) fn esperar_en_el_hilo<T>(mut r: Respuesta<T>) -> Result<T, String> {
        let waker = Waker::from(Arc::new(Despertador(std::thread::current())));
        let mut cx = Context::from_waker(&waker);
        loop {
            match std::pin::Pin::new(&mut r).poll(&mut cx) {
                Poll::Ready(v) => return v,
                Poll::Pending => std::thread::park(),
            }
        }
    }

    #[test]
    fn una_respuesta_llega_desde_otro_hilo() {
        let (enviar, respuesta) = canal::<u32>();
        std::thread::spawn(move || enviar.enviar(7));
        assert_eq!(esperar_en_el_hilo(respuesta), Ok(7));
    }

    #[test]
    fn una_respuesta_sin_enviador_es_un_error() {
        let (enviar, respuesta) = canal::<u32>();
        drop(enviar);
        assert!(esperar_en_el_hilo(respuesta).is_err());
    }
}
