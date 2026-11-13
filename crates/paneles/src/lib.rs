//! Los paneles: las páginas de los proveedores en webviews hijos de la ventana de la app (ADR-0010).
//! Solo ejecuta. No expone enviar, clic ni teclas sobre la página, ni lectura de cookies o de
//! almacenamiento (ADR-0010, puntos 7 y 8): fuera de este crate solo existen las funciones de abajo.

use std::cell::{Cell, RefCell};
use std::collections::BinaryHeap;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::rc::Rc;
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::task::{Context, Poll, Waker};
use std::time::{Duration, Instant};

use nucleo::json::{self, Valor};
use nucleo::texto::Texto;
use wry::dpi::{LogicalPosition, LogicalSize};
pub use wry::raw_window_handle;
use wry::raw_window_handle::HasWindowHandle;
use wry::{Rect, WebContext, WebView, WebViewBuilder};

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
/// La espera de una navegación (Paneles.EsperaMs) y, por defecto, de una operación del script de página.
const ESPERA: Duration = Duration::from_secs(30);
pub const ESPERA_CORRER: Duration = ESPERA;

// ------------------------------------------------------------------ esperas sin tokio (ADR-0010, 2)

struct Estado<T> {
    valor: Option<Result<T, String>>,
    waker: Option<Waker>,
    /// Ya se entregó el valor: lo que llegue después (un techo vencido) se descarta.
    entregada: bool,
}

fn completar<T>(estado: &Mutex<Estado<T>>, valor: Result<T, String>) {
    let mut e = estado.lock().unwrap_or_else(|p| p.into_inner());
    if e.valor.is_none() && !e.entregada {
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
        entregada: false,
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
        if e.entregada {
            // Revisión PART-011, hallazgo 7: sondear de nuevo no deja la espera colgada.
            return Poll::Ready(Err("la respuesta ya se entregó".into()));
        }
        match e.valor.take() {
            Some(v) => {
                e.entregada = true;
                Poll::Ready(v)
            }
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
        programar(techo, move || completar(&estado, Err(error)));
        self
    }
}

/// Una pausa que no bloquea el hilo de la interfaz.
pub fn dormir(d: Duration) -> Respuesta<()> {
    let (enviar, respuesta) = canal();
    programar(d, move || enviar.enviar(()));
    respuesta
}

// Revisión PART-011, hallazgo 2: todas las pausas y los techos comparten un solo hilo «temporizador».
struct Alarma {
    cuando: Instant,
    orden: u64,
    accion: Box<dyn FnOnce() + Send>,
}

impl PartialEq for Alarma {
    fn eq(&self, otra: &Self) -> bool {
        (self.cuando, self.orden) == (otra.cuando, otra.orden)
    }
}
impl Eq for Alarma {}
impl PartialOrd for Alarma {
    fn partial_cmp(&self, otra: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(otra))
    }
}
impl Ord for Alarma {
    /// Al revés: el montículo de la biblioteca da primero la mayor, y aquí va primero la que vence antes.
    fn cmp(&self, otra: &Self) -> std::cmp::Ordering {
        (otra.cuando, otra.orden).cmp(&(self.cuando, self.orden))
    }
}

type Alarmas = (Mutex<(BinaryHeap<Alarma>, u64)>, Condvar);

fn programar(en: Duration, accion: impl FnOnce() + Send + 'static) {
    static RELOJ: OnceLock<Alarmas> = OnceLock::new();
    let mut nuevo = false;
    let reloj = RELOJ.get_or_init(|| {
        nuevo = true;
        Default::default()
    });
    if nuevo {
        // Sin el hilo ninguna espera vencería: es un fallo del sistema, no algo que la app pueda seguir sin él.
        std::thread::Builder::new()
            .name("temporizador".into())
            .spawn(|| sonar(reloj))
            .expect("no se pudo crear el hilo del temporizador");
    }
    let (alarmas, aviso) = reloj;
    let mut g = alarmas.lock().unwrap_or_else(|p| p.into_inner());
    let orden = g.1;
    g.1 += 1;
    g.0.push(Alarma {
        cuando: Instant::now() + en,
        orden,
        accion: Box::new(accion),
    });
    aviso.notify_one();
}

fn sonar((alarmas, aviso): &Alarmas) -> ! {
    loop {
        let mut g = alarmas.lock().unwrap_or_else(|p| p.into_inner());
        let alarma = loop {
            let ahora = Instant::now();
            match g.0.peek().map(|a| a.cuando) {
                None => g = aviso.wait(g).unwrap_or_else(|p| p.into_inner()),
                Some(cuando) if cuando > ahora => {
                    g = aviso
                        .wait_timeout(g, cuando - ahora)
                        .unwrap_or_else(|p| p.into_inner())
                        .0;
                }
                Some(_) => break g.0.pop(),
            }
        };
        drop(g);
        if let Some(a) = alarma {
            (a.accion)();
        }
    }
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
    contexto: Rc<RefCell<WebContext>>,
    paginas_de_prueba: Option<PathBuf>,
}

impl Navegador {
    /// `paginas_de_prueba`: la carpeta que se sirve como cc-prueba.test y cc-otro.test (solo las pruebas).
    pub fn new(datos: &Path, paginas_de_prueba: Option<PathBuf>) -> Navegador {
        Navegador {
            contexto: Rc::new(RefCell::new(WebContext::new(Some(datos.join("navegador"))))),
            paginas_de_prueba,
        }
    }

    /// Un panel hijo de la ventana, en el rectángulo dado en píxeles lógicos, todavía sin página.
    pub fn crear_panel(
        &self,
        ventana: &impl HasWindowHandle,
        perfil: &str,
        (x, y, ancho, alto): (f64, f64, f64, f64),
    ) -> Result<Panel, String> {
        let mut contexto = self.contexto.borrow_mut();
        let constructor = WebViewBuilder::new_with_web_context(&mut contexto)
            .with_bounds(rectangulo(x, y, ancho, alto));
        #[cfg(windows)]
        let constructor = {
            use wry::WebViewBuilderExtWindows;
            // Reemplaza los argumentos por defecto de wry: la Unity pasa solo los tres switches.
            constructor
                .with_additional_browser_args(SWITCHES.join(" "))
                .with_profile_name(perfil)
        };
        let webview = constructor
            .build_as_child(ventana)
            .map_err(|e| e.to_string())?;
        drop(contexto);
        let nav = Rc::<RefCell<Navegaciones>>::default();
        #[cfg(windows)]
        {
            windows::seguir_navegaciones(&webview, &nav)?;
            if let Some(carpeta) = &self.paginas_de_prueba {
                windows::servir_carpeta(&webview, carpeta)?;
            }
        }
        Ok(Panel {
            webview,
            nav,
            siguiente_id: Cell::new(1),
            _contexto: self.contexto.clone(),
        })
    }
}

/// Lo que cuentan los eventos de navegación del panel, como panel.cpp.
#[derive(Default)]
struct Navegaciones {
    iniciadas: u64,
    terminadas: u64,
    /// La espera de `navegar` y el id de la navegación que le toca, en cuanto empieza.
    espera: Option<(Option<u64>, Enviador<()>)>,
}

impl Navegaciones {
    /// Una navegación nueva (no una redirección) empezó.
    fn empezo(&mut self, id: u64) {
        self.iniciadas += 1;
        if let Some((esperada, _)) = &mut self.espera {
            *esperada = Some(id);
        }
    }

    /// Una navegación terminó; si es la que espera `navegar`, devuelve a quién avisar.
    // Revisión PART-011, hallazgo 9: la de una navegación anterior trae otro id y no resuelve la nueva.
    fn termino(&mut self, id: u64) -> Option<Enviador<()>> {
        self.terminadas += 1;
        match self.espera {
            Some((Some(esperada), _)) if esperada == id => self.espera.take().map(|(_, e)| e),
            _ => None,
        }
    }
}

pub struct Panel {
    webview: WebView,
    nav: Rc<RefCell<Navegaciones>>,
    siguiente_id: Cell<u64>,
    /// Revisión PART-011, hallazgo 5: los campos se sueltan en orden, así el contexto sobrevive al webview.
    _contexto: Rc<RefCell<WebContext>>,
}

impl Panel {
    pub fn rect(&self, x: f64, y: f64, ancho: f64, alto: f64) -> Result<(), String> {
        self.webview
            .set_bounds(rectangulo(x, y, ancho, alto))
            .map_err(|e| e.to_string())
    }

    /// Navega y termina cuando esta navegación terminó de cargar (Paneles.Navegar, 30 s).
    pub fn navegar(&self, url: &str) -> Respuesta<()> {
        let (enviar, respuesta) = canal();
        self.nav.borrow_mut().espera = Some((None, enviar));
        if let Err(e) = self.webview.load_url(url) {
            self.nav.borrow_mut().espera.take();
            return fallida(e);
        }
        respuesta.con_techo(
            ESPERA,
            format!(
                "No se pudo navegar a {url}: sin respuesta en {} s.",
                segundos(ESPERA)
            ),
        )
    }
    /// Ejecuta un script en la página; responde el resultado como JSON. Un panel colgado corta a los 90 s.
    pub fn ejecutar(&self, js: &str) -> Respuesta<String> {
        self.ejecutar_con_techo(js, TECHO_EJECUTAR)
    }

    /// Como `ejecutar`, con otro techo (Paneles.Ejecutar con techoMs).
    pub fn ejecutar_con_techo(&self, js: &str, techo: Duration) -> Respuesta<String> {
        let error = format!(
            "No se pudo ejecutar un script: sin respuesta en {} s.",
            segundos(techo)
        );
        self.ejecutar_o(js, techo, error)
    }

    /// Ejecuta con `techo`; si vence, responde `error`.
    fn ejecutar_o(&self, js: &str, techo: Duration, error: String) -> Respuesta<String> {
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
            Ok(()) => respuesta.con_techo(techo, error),

            Err(e) => fallida(e),
        }
    }

    /// Una operación del script de página (escribir, leerCompositor, chatVacio…), como Paneles.cs:
    /// inyecta el script si la página no lo tiene, lo pide y consulta cada 100 ms hasta el techo.
    pub async fn correr(
        &self,
        op: &str,
        spec: &str,
        texto: Option<&str>,
        espera: Duration,
    ) -> Result<Valor, String> {
        // Revisión PART-011, hallazgo 3: cada script de adentro corta en lo que le queda a la operación,
        // así una página colgada no estira la espera hasta el techo de 90 s de cada ejecutar.
        let limite = Instant::now() + espera;
        let vencida = format!("pagina.js, {op}: sin resultado en {} s.", espera.as_secs());
        let ejecutar = |js: &str| {
            let resta = limite.saturating_duration_since(Instant::now());
            self.ejecutar_o(js, resta.min(TECHO_EJECUTAR), vencida.clone())
        };
        if ejecutar("typeof window.__cc").await? != "\"object\"" {
            let r = ejecutar(&format!("{PAGINA_JS}\n;'ok'")).await?;
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
        let r = ejecutar(&pedir).await?;
        if r != "\"ok\"" {
            return Err(format!("el script de página no tomó el pedido: {r}"));
        }
        let consultar = llamada("consultar", &id);
        loop {
            let crudo = ejecutar(&consultar).await?;
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
            let resta = limite.saturating_duration_since(Instant::now());
            if resta.is_zero() {
                return Err(vencida);
            }
            dormir(resta.min(Duration::from_millis(100))).await?;
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

/// Los segundos como `{ms / 1000.0:0.#}` de C#: «3», «0.5», «90».
fn segundos(d: Duration) -> String {
    let s = format!("{:.1}", d.as_secs_f64());
    s.strip_suffix(".0").map(str::to_string).unwrap_or(s)
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
    use std::cell::RefCell;
    use std::path::Path;
    use std::rc::Rc;

    use ::windows::Wdk::System::Threading::{
        NtQueryInformationProcess, ProcessCommandLineInformation,
    };
    use ::windows::Win32::Foundation::{CloseHandle, UNICODE_STRING};
    use ::windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
    use ::windows::core::{BOOL, HSTRING, Interface, PWSTR};
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW, ICoreWebView2_3,
    };
    use webview2_com::{NavigationCompletedEventHandler, NavigationStartingEventHandler};
    use wry::{WebView, WebViewExtWindows};

    use super::Navegaciones;

    /// Los contadores de panel.cpp, con el id de cada navegación para que `navegar` espere la suya.
    pub(crate) fn seguir_navegaciones(
        webview: &WebView,
        nav: &Rc<RefCell<Navegaciones>>,
    ) -> Result<(), String> {
        let vista = webview.webview();
        let mut token = 0i64;
        let n = nav.clone();
        let empieza = NavigationStartingEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else { return Ok(()) };
            let (mut redirigida, mut id) = (BOOL::default(), 0u64);
            // SAFETY: args es válido mientras dura el evento y los punteros son variables locales.
            unsafe {
                args.IsRedirected(&mut redirigida)?;
                args.NavigationId(&mut id)?;
            }
            // Las redirecciones de una misma navegación no suman: el contador es de navegaciones nuevas.
            if !redirigida.as_bool() {
                n.borrow_mut().empezo(id);
            }
            Ok(())
        }));
        let n = nav.clone();
        let termina = NavigationCompletedEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else { return Ok(()) };
            let mut id = 0u64;
            // SAFETY: args es válido mientras dura el evento y el puntero es una variable local.
            unsafe { args.NavigationId(&mut id)? };
            let avisar = n.borrow_mut().termino(id);
            if let Some(e) = avisar {
                e.enviar(());
            }
            Ok(())
        }));
        // SAFETY: la vista vive tanto como el webview, que es dueño de los manejadores.
        unsafe {
            vista
                .add_NavigationStarting(&empieza, &mut token)
                .and_then(|()| vista.add_NavigationCompleted(&termina, &mut token))
        }
        .map_err(|e| e.to_string())
    }

    pub(crate) fn servir_carpeta(webview: &WebView, carpeta: &Path) -> Result<(), String> {
        let wv: ICoreWebView2_3 = webview.webview().cast().map_err(|e| e.to_string())?;
        for host in super::HOSTS_DE_PRUEBA {
            // SAFETY: los HSTRING viven durante la llamada; la vista es válida mientras viva el webview.
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
        // SAFETY: WebView2 escribe una cadena propia en v, que take_pwstr libera.
        unsafe { webview.environment().BrowserVersionString(&mut v) }.map_err(|e| e.to_string())?;
        Ok(webview2_com::take_pwstr(v))
    }

    /// Como LineaDeComandos de panel.cpp: NtQueryInformationProcess con ProcessCommandLineInformation.
    pub(crate) fn linea_de_comandos(webview: &WebView) -> Result<String, String> {
        let mut pid = 0u32;
        // SAFETY: el puntero es una variable local.
        unsafe { webview.webview().BrowserProcessId(&mut pid) }.map_err(|e| e.to_string())?;
        // SAFETY: OpenProcess no toma punteros; el handle se cierra abajo.
        let proceso = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }
            .map_err(|e| e.to_string())?;
        // u64 para que UNICODE_STRING quede alineado al principio del búfer.
        let mut bufer = vec![0u64; 8192];
        let mut largo = 0u32;
        // SAFETY: el búfer es propio, escribible y del largo que se informa.
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
            // SAFETY: con éxito, el búfer empieza con un UNICODE_STRING alineado (búfer de u64).
            let u = unsafe { &*(bufer.as_ptr() as *const UNICODE_STRING) };
            // Revisión PART-011, hallazgo 6: from_raw_parts no acepta un puntero nulo, ni con largo 0.
            if u.Buffer.is_null() || u.Length == 0 {
                Ok(String::new())
            } else {
                // SAFETY: Buffer apunta dentro del mismo búfer, a Length bytes de UTF-16 que el sistema escribió.
                let unidades =
                    unsafe { std::slice::from_raw_parts(u.Buffer.0, usize::from(u.Length) / 2) };
                Ok(String::from_utf16_lossy(unidades))
            }
        } else {
            Err(format!(
                "NtQueryInformationProcess devolvió {:#x}",
                estado.0
            ))
        };
        // SAFETY: el handle es el que abrió OpenProcess y no se usa después.
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

    /// Los hilos vivos de este proceso, contados por el sistema operativo.
    #[cfg(windows)]
    fn hilos_del_proceso() -> usize {
        use ::windows::Win32::Foundation::CloseHandle;
        use ::windows::Win32::System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, TH32CS_SNAPTHREAD, THREADENTRY32, Thread32First, Thread32Next,
        };
        let pid = std::process::id();
        // SAFETY: la foto es un handle propio que se cierra al final; THREADENTRY32 lleva su dwSize.
        unsafe {
            let foto = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0).unwrap();
            let mut e = THREADENTRY32 {
                dwSize: std::mem::size_of::<THREADENTRY32>() as u32,
                ..Default::default()
            };
            let mut n = 0;
            let mut hay = Thread32First(foto, &mut e).is_ok();
            while hay {
                if e.th32OwnerProcessID == pid {
                    n += 1;
                }
                hay = Thread32Next(foto, &mut e).is_ok();
            }
            let _ = CloseHandle(foto);
            n
        }
    }

    #[cfg(windows)]
    #[test]
    fn las_esperas_comparten_un_solo_hilo() {
        // Revisión PART-011, hallazgo 2: 30 s de sondeo cada 100 ms dejaban unos 300 hilos dormidos.
        let antes = hilos_del_proceso();
        let pausas: Vec<_> = (0..300).map(|_| dormir(Duration::from_secs(5))).collect();
        let techos: Vec<_> = (0..300)
            .map(|_| {
                canal::<()>()
                    .1
                    .con_techo(Duration::from_secs(5), "techo".into())
            })
            .collect();
        let despues = hilos_del_proceso();
        assert!(
            despues <= antes + 10,
            "antes {antes} hilos, con 600 esperas {despues}"
        );
        drop((pausas, techos));
    }

    #[test]
    fn una_espera_corta_vence_antes_que_una_larga_anotada_primero() {
        let _larga = canal::<()>()
            .1
            .con_techo(Duration::from_secs(20), "larga".into());
        let inicio = Instant::now();
        assert_eq!(
            esperar_en_el_hilo(dormir(Duration::from_millis(50))),
            Ok(())
        );
        let ms = inicio.elapsed().as_millis();
        assert!((40..1000).contains(&ms), "la pausa de 50 ms tardó {ms} ms");
    }

    #[test]
    fn una_respuesta_ya_entregada_no_queda_pendiente_para_siempre() {
        // Revisión PART-011, hallazgo 7.
        let (enviar, mut respuesta) = canal::<u32>();
        enviar.enviar(7);
        let waker = Waker::from(Arc::new(Despertador(std::thread::current())));
        let mut cx = Context::from_waker(&waker);
        assert_eq!(Pin::new(&mut respuesta).poll(&mut cx), Poll::Ready(Ok(7)));
        assert!(matches!(
            Pin::new(&mut respuesta).poll(&mut cx),
            Poll::Ready(Err(_))
        ));
    }

    #[test]
    fn un_techo_corta_una_respuesta_que_no_llega() {
        let (enviar, respuesta) = canal::<u32>();
        let inicio = Instant::now();
        let r =
            esperar_en_el_hilo(respuesta.con_techo(Duration::from_millis(100), "venció".into()));
        assert_eq!(r, Err("venció".into()));
        assert!(inicio.elapsed() < Duration::from_secs(2));
        drop(enviar);
    }

    #[test]
    fn la_carga_de_una_navegacion_anterior_no_resuelve_la_nueva() {
        // Revisión PART-011, hallazgo 9.
        let mut n = Navegaciones::default();
        n.empezo(1);
        let (enviar, _respuesta) = canal::<()>();
        n.espera = Some((None, enviar));
        assert!(
            n.termino(1).is_none(),
            "terminó la anterior antes de que empiece la nueva"
        );
        n.empezo(2);
        assert!(n.termino(1).is_none(), "una carga vieja tardía");
        assert!(n.termino(2).is_some());
        assert_eq!((n.iniciadas, n.terminadas), (2, 3));
    }

    #[test]
    fn los_segundos_se_escriben_como_en_la_unity() {
        assert_eq!(segundos(Duration::from_secs(3)), "3");
        assert_eq!(segundos(Duration::from_millis(500)), "0.5");
        assert_eq!(segundos(Duration::from_secs(90)), "90");
    }
}
