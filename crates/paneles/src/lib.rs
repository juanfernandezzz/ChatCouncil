//! Los paneles: las páginas de los proveedores en webviews hijos de la ventana de la app (ADR-0010).
//! Solo ejecuta. No expone enviar, clic ni teclas sobre la página, ni lectura de cookies o de
//! almacenamiento (ADR-0010, puntos 7 y 8): fuera de este crate solo existen las funciones de abajo.

use std::cell::{Cell, RefCell};
use std::collections::BinaryHeap;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::rc::{Rc, Weak};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::task::{Context, Poll, Waker};
use std::time::{Duration, Instant};

use nucleo::json::{self, Valor};
use nucleo::texto::Texto;
use wry::dpi::{LogicalPosition, LogicalSize};
pub use wry::raw_window_handle;
use wry::raw_window_handle::{HasWindowHandle, RawWindowHandle};
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
        let padre = match ventana.window_handle().map_err(|e| e.to_string())?.as_raw() {
            RawWindowHandle::Win32(h) => h.hwnd.get(),
            _ => 0,
        };
        let comun = Rc::new(Comun {
            contexto: self.contexto.clone(),
            paginas_de_prueba: self.paginas_de_prueba.clone(),
            perfil: perfil.to_string(),
            padre,
        });
        let emergente = Rc::default();
        let mut contexto = self.contexto.borrow_mut();
        let constructor = WebViewBuilder::new_with_web_context(&mut contexto)
            .with_bounds(rectangulo(x, y, ancho, alto));
        let webview = preparar(constructor, &comun, &emergente)
            .build_as_child(ventana)
            .map_err(|e| e.to_string())?;
        drop(contexto);
        enganchar(webview, &comun, emergente, None)
    }
}

/// Lo que comparten un panel y las emergentes que abre (PAN-004: el mismo perfil).
struct Comun {
    contexto: Rc<RefCell<WebContext>>,
    paginas_de_prueba: Option<PathBuf>,
    perfil: String,
    /// La ventana de la app: a ella vuelven el Tab que sale de la página y F1 a F5 (PAN-012).
    padre: isize,
}

/// La última emergente que abrió un panel. Débil: la emergente es de windows::EMERGENTES hasta que se cierra.
type Emergente = Rc<RefCell<Weak<Panel>>>;

/// Lo que se fija antes de crear el webview: perfil, switches y ventanas emergentes.
fn preparar<'a>(
    constructor: WebViewBuilder<'a>,
    comun: &Rc<Comun>,
    emergente: &Emergente,
) -> WebViewBuilder<'a> {
    #[cfg(windows)]
    {
        use wry::{NewWindowResponse, WebViewBuilderExtWindows};
        let (comun2, emergente) = (comun.clone(), emergente.clone());
        // Reemplaza los argumentos por defecto de wry: la Unity pasa solo los tres switches.
        constructor
            .with_additional_browser_args(SWITCHES.join(" "))
            .with_profile_name(&comun.perfil)
            .with_new_window_req_handler(move |_, pedido| {
                match windows::abrir_emergente(&comun2, pedido) {
                    Ok(panel) => {
                        let webview = panel.vista();
                        let panel = Rc::new(panel);
                        *emergente.borrow_mut() = Rc::downgrade(&panel);
                        windows::registrar(panel);
                        NewWindowResponse::Create { webview }
                    }
                    Err(e) => {
                        eprintln!("No se pudo abrir la ventana emergente: {e}");
                        NewWindowResponse::Deny
                    }
                }
            })
    }
    #[cfg(not(windows))]
    {
        let _ = (comun, emergente);
        constructor
    }
}

/// Lo que se engancha al webview ya creado: contadores, teclado y páginas de prueba.
fn enganchar(
    webview: WebView,
    comun: &Rc<Comun>,
    emergente: Emergente,
    #[cfg(windows)] ventana: Option<windows::VentanaPropia>,
    #[cfg(not(windows))] ventana: Option<()>,
) -> Result<Panel, String> {
    let nav = Rc::<RefCell<Navegaciones>>::default();
    #[cfg(windows)]
    let contenedor = {
        windows::seguir_navegaciones(&webview, &nav)?;
        windows::teclado(&webview, comun.padre)?;
        if let Some(v) = &ventana {
            windows::cerrar_con_la_pagina(&webview, v)?;
        }
        if let Some(carpeta) = &comun.paginas_de_prueba {
            windows::servir_carpeta(&webview, carpeta)?;
        }
        windows::contenedor(&webview)?
    };
    #[cfg(not(windows))]
    let contenedor = 0;
    Ok(Panel {
        webview,
        nav,
        siguiente_id: Cell::new(1),
        emergente,
        contenedor,
        de_prueba: comun.paginas_de_prueba.is_some(),
        _ventana: ventana,
        _contexto: comun.contexto.clone(),
    })
}

/// PAN-005: `/(logout|log-out|signout|sign-out)(\b|/|\?|$)`, sin distinguir mayúsculas, como panel.cpp.
fn es_cierre_de_sesion(url: &str) -> bool {
    let url = url.to_ascii_lowercase();
    let b = url.as_bytes();
    b.iter().enumerate().any(|(i, &c)| {
        c == b'/'
            && ["logout", "log-out", "signout", "sign-out"]
                .iter()
                .any(|w| {
                    let fin = i + 1 + w.len();
                    // \b de ECMAScript tras la palabra: lo que sigue no es [A-Za-z0-9_]; «/», «?» y el final ya lo cumplen.
                    b[i + 1..].starts_with(w.as_bytes())
                        && b.get(fin)
                            .is_none_or(|&s| !(s.is_ascii_alphanumeric() || s == b'_'))
                })
    })
}

/// Lo que cuentan los eventos de navegación del panel, como panel.cpp.
#[derive(Default)]
struct Navegaciones {
    iniciadas: u64,
    terminadas: u64,
    /// Navegaciones canceladas por ir a un cierre de sesión (PAN-005).
    bloqueadas: u64,
    ultima_bloqueada: String,
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
    /// La última ventana emergente que abrió (window.open), en su mismo perfil.
    emergente: Emergente,
    /// La ventana hija donde wry pone el webview: con ella se apila, se mide y se sabe si sigue abierto.
    contenedor: isize,
    /// Abierto con las páginas de prueba: solo así se puede borrar el perfil entero.
    de_prueba: bool,
    /// Revisión PART-011, hallazgo 5: los campos se sueltan en orden, así el contexto sobrevive al webview,
    /// y la ventana propia de una emergente se cierra después de soltar su webview.
    #[cfg(windows)]
    _ventana: Option<windows::VentanaPropia>,
    #[cfg(not(windows))]
    _ventana: Option<()>,
    _contexto: Rc<RefCell<WebContext>>,
}

impl Panel {
    pub fn rect(&self, x: f64, y: f64, ancho: f64, alto: f64) -> Result<(), String> {
        self.webview
            .set_bounds(rectangulo(x, y, ancho, alto))
            .map_err(|e| e.to_string())
    }

    /// Navega y termina cuando esta navegación terminó de cargar (Paneles.Navegar, 30 s). Un cierre de
    /// sesión se bloquea antes de navegar, porque WebView2 cuenta Navigate como iniciada por la persona.
    /// La navegación empieza al llamar, aunque no se espere el resultado.
    pub fn navegar(&self, url: &str) -> impl Future<Output = Result<(), String>> + 'static {
        let bloqueada = format!("La navegación a {url} se bloqueó: es un cierre de sesión.");
        let (nav, antes) = (self.nav.clone(), self.bloqueadas());
        let carga = if es_cierre_de_sesion(url) {
            let mut n = self.nav.borrow_mut();
            n.bloqueadas += 1;
            n.ultima_bloqueada = url.to_string();
            fallida(bloqueada.clone())
        } else {
            let (enviar, respuesta) = canal();
            self.nav.borrow_mut().espera = Some((None, enviar));
            match self.webview.load_url(url) {
                Ok(()) => respuesta.con_techo(
                    ESPERA,
                    format!(
                        "No se pudo navegar a {url}: sin respuesta en {} s.",
                        segundos(ESPERA)
                    ),
                ),
                Err(e) => {
                    self.nav.borrow_mut().espera.take();
                    fallida(e)
                }
            }
        };
        async move {
            carga.await?;
            // WebView2 da por terminada también la navegación cancelada: sin esto, una bloqueada pasaría por éxito.
            if nav.borrow().bloqueadas > antes {
                return Err(bloqueada);
            }
            Ok(())
        }
    }

    /// Recarga desde el navegador, sin depender de un script de la página, y espera a que termine.
    pub fn recargar(&self) -> Respuesta<()> {
        let (enviar, respuesta) = canal();
        self.nav.borrow_mut().espera = Some((None, enviar));
        if let Err(e) = self.webview.reload() {
            self.nav.borrow_mut().espera.take();
            return fallida(e);
        }
        respuesta.con_techo(
            ESPERA,
            format!(
                "No se pudo recargar: sin respuesta en {} s.",
                segundos(ESPERA)
            ),
        )
    }

    /// Espera la primera carga de un panel que abrió la página (una emergente). Si pasa la espera,
    /// el panel se queda y la página termina sola, como Panel.EsperarCarga.
    pub async fn esperar_carga(&self) {
        let limite = Instant::now() + ESPERA;
        while self.nav.borrow().terminadas == 0 && Instant::now() < limite {
            let _ = dormir(Duration::from_millis(50)).await;
        }
    }

    /// Navegaciones del marco principal que empezaron (las bloqueadas no cuentan).
    pub fn navegaciones(&self) -> u64 {
        self.nav.borrow().iniciadas
    }

    /// Navegaciones canceladas por ir a un cierre de sesión.
    pub fn bloqueadas(&self) -> u64 {
        self.nav.borrow().bloqueadas
    }

    pub fn ultima_bloqueada(&self) -> String {
        self.nav.borrow().ultima_bloqueada.clone()
    }

    /// La última ventana emergente que abrió este panel, o ninguna.
    pub fn emergente(&self) -> Option<Rc<Panel>> {
        self.emergente.borrow().upgrade()
    }

    /// Pone el foco del teclado dentro de la página (WCAG 2.1.1).
    pub fn foco(&self) -> Result<(), String> {
        self.webview.focus().map_err(|e| e.to_string())
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

    /// El perfil según WebView2, no el nombre que se pidió.
    #[cfg(windows)]
    pub fn perfil(&self) -> Result<String, String> {
        windows::perfil(&self.webview)
    }

    /// Los paneles se apilan en el mismo rectángulo: el activo pasa arriba, sin ocultar los demás.
    #[cfg(windows)]
    pub fn frente(&self) {
        windows::apilar(self.contenedor, true);
    }

    #[cfg(windows)]
    pub fn atras(&self) {
        windows::apilar(self.contenedor, false);
    }

    /// Medido con el orden real de las ventanas: ¿es el primer panel desde arriba?
    #[cfg(windows)]
    pub fn es_frente(&self) -> bool {
        windows::es_frente(self.contenedor)
    }

    /// El rectángulo de la ventana del panel en píxeles de la ventana que lo contiene.
    #[cfg(windows)]
    pub fn rect_real(&self) -> (i32, i32, i32, i32) {
        windows::rect_real(self.contenedor)
    }

    /// false cuando el panel se cerró (también una emergente con window.close()).
    #[cfg(windows)]
    pub fn abierto(&self) -> bool {
        windows::existe(self.contenedor)
    }

    /// Un método del protocolo de DevTools sobre este panel; responde el JSON de la respuesta.
    #[cfg(windows)]
    pub fn devtools(&self, metodo: &str, parametros: &str) -> Respuesta<String> {
        match windows::devtools(&self.webview, metodo, parametros) {
            Ok(r) => r.con_techo(
                TECHO_EJECUTAR,
                format!(
                    "No se pudo llamar a DevTools {metodo}: sin respuesta en {} s.",
                    segundos(TECHO_EJECUTAR)
                ),
            ),
            Err(e) => fallida(e),
        }
    }

    /// Borra todos los datos de navegación del perfil de este panel (cookies, almacenamiento, caché).
    #[cfg(windows)]
    pub fn borrar_datos(&self) -> Respuesta<()> {
        if !self.de_prueba {
            // TEXTO-PENDIENTE
            return fallida(
                "Borrar todos los datos del perfil solo se permite en las pruebas: en el perfil real cerraría todas las sesiones.",
            );
        }
        match windows::borrar_datos(&self.webview) {
            Ok(r) => r.con_techo(
                TECHO_EJECUTAR,
                format!(
                    "No se pudo borrar los datos del perfil: sin respuesta en {} s.",
                    segundos(TECHO_EJECUTAR)
                ),
            ),
            Err(e) => fallida(e),
        }
    }

    /// INV-PAN-003: borra solo lo que guardó el sitio de esa URL; en el perfil compartido, la sesión de un
    /// proveedor sin tocar la de Google ni la de los demás.
    #[cfg(windows)]
    pub fn borrar_sitio(&self, url: &str) -> Respuesta<String> {
        let origen = match origen(url) {
            Ok(o) => o,
            Err(e) => return fallida(e),
        };
        let mut p = b"{\"origin\":".to_vec();
        json::escapar(&origen.as_str().into(), &mut p);
        p.extend_from_slice(b",\"storageTypes\":\"all\"}");
        self.devtools("Storage.clearDataForOrigin", &String::from_utf8_lossy(&p))
    }

    /// PAN-013: adjunta un archivo al `<input type=file>` que elige el script de página, con
    /// DOM.setFileInputFiles de DevTools (ADR-0010, punto 10), sin abrir el selector.
    #[cfg(windows)]
    pub async fn adjuntar(&self, spec: &str, ruta: &Path) -> Result<(), String> {
        if !ruta.is_file() {
            // TEXTO-PENDIENTE
            return Err(format!(
                "No existe el archivo {}: no se puede adjuntar.",
                ruta.display()
            ));
        }
        let input = self.correr("inputArchivo", spec, None, ESPERA).await?;
        if campo(&input, "encontrado") != Some(&Valor::Bool(true)) {
            return Err("No hay un <input type=file> en la página: no se puede adjuntar.".into());
        }
        let selector = texto_de(campo(&input, "selector")).unwrap_or_default();
        let ruta = std::path::absolute(ruta).map_err(|e| e.to_string())?;
        let nodo = |respuesta: &str, donde: &[&str]| {
            let v = json::leer(respuesta);
            let n = donde
                .iter()
                .fold(v.as_ref(), |v, k| v.and_then(|v| campo(v, k)));
            match n {
                Some(Valor::Entero(n)) if *n > 0 => Ok(*n),
                _ => Err(format!("DevTools no dio el nodo del input: {respuesta}")),
            }
        };
        let documento = self.devtools("DOM.getDocument", "{}").await?;
        let raiz = nodo(&documento, &["root", "nodeId"])?;
        let mut p = format!("{{\"nodeId\":{raiz},\"selector\":").into_bytes();
        json::escapar(&selector.as_str().into(), &mut p);
        p.push(b'}');
        let hallado = self
            .devtools("DOM.querySelector", &String::from_utf8_lossy(&p))
            .await?;
        let input = nodo(&hallado, &["nodeId"])?;
        let mut p = b"{\"files\":[".to_vec();
        json::escapar(&ruta.to_string_lossy().as_ref().into(), &mut p);
        p.extend_from_slice(format!("],\"nodeId\":{input}}}").as_bytes());
        self.devtools("DOM.setFileInputFiles", &String::from_utf8_lossy(&p))
            .await?;
        Ok(())
    }

    #[cfg(windows)]
    fn vista(&self) -> webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2 {
        use wry::WebViewExtWindows;
        self.webview.webview()
    }
}

/// El origen de una URL (esquema y autoridad), como Uri.GetLeftPart(UriPartial.Authority).
/// Sin usuario ni clave y sin el puerto por defecto, que Uri también quita; sin esquema o sin host, error.
fn origen(url: &str) -> Result<String, String> {
    let error = || format!("La URL {url} no tiene esquema y host: no se puede borrar su sitio.");
    let (esquema, resto) = url.split_once("://").ok_or_else(error)?;
    let autoridad = resto.split(['/', '?', '#']).next().unwrap_or_default();
    let host = autoridad.rsplit_once('@').map_or(autoridad, |(_, h)| h);
    let (esquema, host) = (esquema.to_ascii_lowercase(), host.to_ascii_lowercase());
    let host = match esquema.as_str() {
        "https" => host.strip_suffix(":443"),
        "http" => host.strip_suffix(":80"),
        _ => None,
    }
    .unwrap_or(&host);
    if esquema.is_empty() || host.is_empty() || host.starts_with(':') {
        return Err(error());
    }
    Ok(format!("{esquema}://{host}"))
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
    use std::ffi::c_void;
    use std::num::NonZeroIsize;
    use std::path::Path;
    use std::rc::Rc;
    use std::sync::OnceLock;

    use ::windows::Wdk::System::Threading::{
        NtQueryInformationProcess, ProcessCommandLineInformation,
    };
    use ::windows::Win32::Foundation::{
        CloseHandle, HWND, LPARAM, LRESULT, POINT, RECT, UNICODE_STRING, WPARAM,
    };
    use ::windows::Win32::Graphics::Gdi::MapWindowPoints;
    use ::windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use ::windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
    use ::windows::Win32::UI::Input::KeyboardAndMouse::{
        INPUT, INPUT_0, INPUT_KEYBOARD, KEYBD_EVENT_FLAGS, KEYBDINPUT, KEYEVENTF_KEYUP, SendInput,
        SetFocus, VIRTUAL_KEY, VK_F1, VK_F5,
    };
    use ::windows::Win32::UI::WindowsAndMessaging::{
        CW_USEDEFAULT, CreateWindowExW, DefWindowProcW, DestroyWindow, GW_HWNDFIRST, GW_HWNDNEXT,
        GetClassNameW, GetParent, GetWindow, GetWindowRect, HWND_BOTTOM, HWND_TOP, IDC_ARROW,
        IsWindow, LoadCursorW, PostMessageW, RegisterClassW, SWP_NOACTIVATE, SWP_NOMOVE,
        SWP_NOSIZE, SWP_SHOWWINDOW, SetWindowPos, WINDOW_EX_STYLE, WM_CLOSE, WNDCLASSW,
        WS_OVERLAPPEDWINDOW, WS_VISIBLE,
    };
    use ::windows::core::{BOOL, HSTRING, Interface, PWSTR, w};
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW, COREWEBVIEW2_KEY_EVENT_KIND,
        COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN, ICoreWebView2_3, ICoreWebView2_13,
        ICoreWebView2Profile2,
    };
    use webview2_com::{
        AcceleratorKeyPressedEventHandler, CallDevToolsProtocolMethodCompletedHandler,
        ClearBrowsingDataCompletedHandler, MoveFocusRequestedEventHandler,
        NavigationCompletedEventHandler, NavigationStartingEventHandler,
        WindowCloseRequestedEventHandler,
    };
    use wry::raw_window_handle::{
        HandleError, HasWindowHandle, RawWindowHandle, Win32WindowHandle, WindowHandle,
    };
    use wry::{
        NewWindowFeatures, WebView, WebViewBuilder, WebViewBuilderExtWindows, WebViewExtWindows,
    };

    use super::{Navegaciones, Respuesta, canal};

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
            let (mut redirigida, mut persona, mut id) = (BOOL::default(), BOOL::default(), 0u64);
            let mut uri = PWSTR::null();
            // SAFETY: args es válido mientras dura el evento y los punteros son variables locales;
            // WebView2 escribe en uri una cadena propia, que take_pwstr libera.
            let uri = unsafe {
                args.IsRedirected(&mut redirigida)?;
                args.IsUserInitiated(&mut persona)?;
                args.NavigationId(&mut id)?;
                args.Uri(&mut uri)?;
                webview2_com::take_pwstr(uri)
            };
            // PAN-005: un cierre de sesión se cancela salvo que lo inicie la persona y no sea una redirección.
            if super::es_cierre_de_sesion(&uri) && !(persona.as_bool() && !redirigida.as_bool()) {
                // SAFETY: args es válido mientras dura el evento.
                unsafe { args.SetCancel(true)? };
                let mut n = n.borrow_mut();
                n.bloqueadas += 1;
                n.ultima_bloqueada = uri;
                return Ok(());
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

    pub(crate) fn perfil(webview: &WebView) -> Result<String, String> {
        let mut nombre = PWSTR::null();
        // SAFETY: la vista es válida mientras viva el webview; WebView2 escribe una cadena propia en nombre.
        unsafe {
            let vista: ICoreWebView2_13 = webview.webview().cast().map_err(|e| e.to_string())?;
            vista
                .Profile()
                .and_then(|p| p.ProfileName(&mut nombre))
                .map_err(|e| e.to_string())?;
        }
        Ok(webview2_com::take_pwstr(nombre))
    }

    pub(crate) fn contenedor(webview: &WebView) -> Result<isize, String> {
        let mut hwnd = HWND::default();
        // SAFETY: el puntero es una variable local.
        unsafe { webview.controller().ParentWindow(&mut hwnd) }.map_err(|e| e.to_string())?;
        Ok(hwnd.0 as isize)
    }

    fn hwnd(h: isize) -> HWND {
        HWND(h as *mut c_void)
    }

    /// CC_Frente y CC_Atras de panel.cpp.
    pub(crate) fn apilar(contenedor: isize, frente: bool) {
        let (lugar, mostrar) = if frente {
            (HWND_TOP, SWP_SHOWWINDOW)
        } else {
            (HWND_BOTTOM, SWP_NOACTIVATE)
        };
        // SAFETY: SetWindowPos no toma punteros; con una ventana que ya no existe solo falla.
        unsafe {
            let _ = SetWindowPos(
                hwnd(contenedor),
                Some(lugar),
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | mostrar,
            );
        }
    }

    fn es_panel(h: HWND) -> bool {
        let mut clase = [0u16; 32];
        // SAFETY: el búfer es propio y se informa su largo.
        let n = unsafe { GetClassNameW(h, &mut clase) } as usize;
        String::from_utf16_lossy(&clase[..n]) == "WRY_WEBVIEW"
    }

    /// CC_EsFrente: el primer panel desde arriba entre las ventanas hermanas.
    pub(crate) fn es_frente(contenedor: isize) -> bool {
        // SAFETY: GetWindow solo lee el orden de las ventanas; sin más, devuelve un error que corta el recorrido.
        unsafe {
            let mut h = GetWindow(hwnd(contenedor), GW_HWNDFIRST).ok();
            while let Some(v) = h {
                if es_panel(v) {
                    return v == hwnd(contenedor);
                }
                h = GetWindow(v, GW_HWNDNEXT).ok();
            }
        }
        false
    }

    /// CC_RectReal: el rectángulo de la ventana del panel en coordenadas de la ventana que lo contiene.
    pub(crate) fn rect_real(contenedor: isize) -> (i32, i32, i32, i32) {
        let mut r = RECT::default();
        // SAFETY: r es una variable local, del tamaño de dos POINT como pide MapWindowPoints.
        unsafe {
            if GetWindowRect(hwnd(contenedor), &mut r).is_err() {
                return (0, 0, 0, 0);
            }
            let padre = GetParent(hwnd(contenedor)).ok();
            let puntos = std::slice::from_raw_parts_mut((&raw mut r).cast::<POINT>(), 2);
            MapWindowPoints(None, padre, puntos);
        }
        (r.left, r.top, r.right - r.left, r.bottom - r.top)
    }

    pub(crate) fn existe(contenedor: isize) -> bool {
        // SAFETY: IsWindow acepta cualquier valor y solo responde si es una ventana viva.
        unsafe { IsWindow(Some(hwnd(contenedor))).as_bool() }
    }

    /// PAN-012, como panel.cpp: el Tab que sale de la página devuelve el foco a la app, y F1 a F5 se le
    /// entregan como teclas de verdad. Alt+F4 llega como tecla de sistema y sigue su camino.
    pub(crate) fn teclado(webview: &WebView, padre: isize) -> Result<(), String> {
        let controlador = webview.controller();
        let sale = MoveFocusRequestedEventHandler::create(Box::new(move |_, args| {
            if let Some(args) = args {
                // SAFETY: SetFocus no toma punteros; args es válido mientras dura el evento.
                unsafe {
                    let _ = SetFocus(Some(hwnd(padre)));
                    args.SetHandled(true)?;
                }
            }
            Ok(())
        }));
        let tecla = AcceleratorKeyPressedEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else { return Ok(()) };
            let (mut tipo, mut vk) = (COREWEBVIEW2_KEY_EVENT_KIND::default(), 0u32);
            // SAFETY: args es válido mientras dura el evento y los punteros son variables locales.
            unsafe {
                args.KeyEventKind(&mut tipo)?;
                args.VirtualKey(&mut vk)?;
            }
            if tipo == COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN
                && (u32::from(VK_F1.0)..=u32::from(VK_F5.0)).contains(&vk)
            {
                let tecla = |arriba: bool| INPUT {
                    r#type: INPUT_KEYBOARD,
                    Anonymous: INPUT_0 {
                        ki: KEYBDINPUT {
                            wVk: VIRTUAL_KEY(vk as u16),
                            dwFlags: if arriba {
                                KEYEVENTF_KEYUP
                            } else {
                                KEYBD_EVENT_FLAGS(0)
                            },
                            ..Default::default()
                        },
                    },
                };
                // SAFETY: las entradas son locales y del tamaño que se informa; args vive durante el evento.
                unsafe {
                    let _ = SetFocus(Some(hwnd(padre)));
                    // Sin rojo posible: SendInput solo falla si otra app bloquea la entrada (UIPI).
                    if SendInput(&[tecla(false), tecla(true)], size_of::<INPUT>() as i32) != 2 {
                        eprintln!("No se pudo reenviar la tecla {vk} a la app.");
                    }
                    args.SetHandled(true)?;
                }
            }
            Ok(())
        }));
        let mut token = 0i64;
        // SAFETY: el controlador vive tanto como el webview, que es dueño de los manejadores.
        unsafe {
            controlador
                .add_MoveFocusRequested(&sale, &mut token)
                .and_then(|()| controlador.add_AcceleratorKeyPressed(&tecla, &mut token))
        }
        .map_err(|e| e.to_string())
    }

    /// La ventana propia de una emergente; se cierra al soltarla.
    pub(crate) struct VentanaPropia(isize);

    impl Drop for VentanaPropia {
        fn drop(&mut self) {
            // SAFETY: es la ventana que creó abrir_emergente; IsWindow evita destruir un handle reusado.
            unsafe {
                if IsWindow(Some(hwnd(self.0))).as_bool() {
                    let _ = DestroyWindow(hwnd(self.0));
                }
            }
        }
    }

    impl HasWindowHandle for VentanaPropia {
        fn window_handle(&self) -> Result<WindowHandle<'_>, HandleError> {
            let h = NonZeroIsize::new(self.0).ok_or(HandleError::Unavailable)?;
            // SAFETY: la ventana vive mientras viva self, que es su dueño.
            Ok(unsafe {
                WindowHandle::borrow_raw(RawWindowHandle::Win32(Win32WindowHandle::new(h)))
            })
        }
    }

    thread_local! {
        /// Las emergentes abiertas, como el mapa de panel.cpp: cada una vive hasta que se cierra su ventana.
        static EMERGENTES: RefCell<Vec<Rc<super::Panel>>> = const { RefCell::new(Vec::new()) };
    }

    pub(crate) fn registrar(panel: Rc<super::Panel>) {
        EMERGENTES.with_borrow_mut(|v| v.push(panel));
    }

    unsafe extern "system" fn proc_emergente(h: HWND, m: u32, w: WPARAM, l: LPARAM) -> LRESULT {
        if m == WM_CLOSE {
            // Como Liberar(id) de panel.cpp: soltar el panel cierra el webview y destruye la ventana.
            let es =
                |p: &Rc<super::Panel>| p._ventana.as_ref().is_some_and(|v| v.0 == h.0 as isize);
            let panel =
                EMERGENTES.with_borrow_mut(|v| v.iter().position(es).map(|i| v.swap_remove(i)));
            if panel.is_some() {
                drop(panel);
                return LRESULT(0);
            }
        }
        // SAFETY: los argumentos son los que Windows pasó al procedimiento de la ventana.
        unsafe { DefWindowProcW(h, m, w, l) }
    }

    /// PAN-004, como NewWindowRequested de panel.cpp: una ventana propia de 520x680 (o el tamaño que pida la
    /// página, con mínimo 400x500), con la app como dueña, y en ella un webview del mismo perfil y entorno.
    pub(crate) fn abrir_emergente(
        comun: &Rc<super::Comun>,
        pedido: NewWindowFeatures,
    ) -> Result<super::Panel, String> {
        static CLASE: OnceLock<()> = OnceLock::new();
        let clase = w!("ChatCouncilEmergente");
        // SAFETY: GetModuleHandleW(None) es este ejecutable; la clase se registra una sola vez.
        let instancia = unsafe { GetModuleHandleW(None) }.map_err(|e| e.to_string())?;
        CLASE.get_or_init(|| {
            let wc = WNDCLASSW {
                lpfnWndProc: Some(proc_emergente),
                hInstance: instancia.into(),
                // SAFETY: un cursor del sistema.
                hCursor: unsafe { LoadCursorW(None, IDC_ARROW) }.unwrap_or_default(),
                lpszClassName: clase,
                ..Default::default()
            };
            // SAFETY: wc vive durante la llamada y su nombre es estático.
            unsafe { RegisterClassW(&wc) };
        });
        let (ancho, alto) = match pedido.size {
            Some(t) => ((t.width as i32).max(400), (t.height as i32).max(500)),
            None => (520, 680),
        };
        // SAFETY: la clase está registrada; los textos son estáticos; el dueño es la ventana de la app.
        let ventana = unsafe {
            CreateWindowExW(
                WINDOW_EX_STYLE(0),
                clase,
                w!("ChatCouncil"),
                WS_OVERLAPPEDWINDOW | WS_VISIBLE,
                CW_USEDEFAULT,
                CW_USEDEFAULT,
                ancho,
                alto,
                Some(hwnd(comun.padre)),
                None,
                Some(instancia.into()),
                None,
            )
        }
        .map_err(|e| e.to_string())?;
        let ventana = VentanaPropia(ventana.0 as isize);
        let emergente = Rc::default();
        let constructor = WebViewBuilder::new().with_environment(pedido.opener.environment);
        // Sin with_bounds: wry llena la ventana propia y la sigue al cambiar de tamaño.
        let webview = super::preparar(constructor, comun, &emergente)
            .build(&ventana)
            .map_err(|e| e.to_string())?;
        super::enganchar(webview, comun, emergente, Some(ventana))
    }

    /// window.close() en una emergente cierra su ventana propia, como panel.cpp (wry solo cierra la hija).
    pub(crate) fn cerrar_con_la_pagina(
        webview: &WebView,
        ventana: &VentanaPropia,
    ) -> Result<(), String> {
        let v = ventana.0;
        let cierra = WindowCloseRequestedEventHandler::create(Box::new(move |_, _| {
            // SAFETY: PostMessageW no toma punteros; si la ventana ya no existe, solo falla.
            unsafe {
                let _ = PostMessageW(Some(hwnd(v)), WM_CLOSE, WPARAM(0), LPARAM(0));
            }
            Ok(())
        }));
        let mut token = 0i64;
        // SAFETY: la vista vive tanto como el webview, que es dueño del manejador.
        unsafe {
            webview
                .webview()
                .add_WindowCloseRequested(&cierra, &mut token)
        }
        .map_err(|e| e.to_string())
    }

    pub(crate) fn devtools(
        webview: &WebView,
        metodo: &str,
        parametros: &str,
    ) -> Result<Respuesta<String>, String> {
        let (enviar, respuesta) = canal();
        let listo = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |r, json| {
            match r {
                Ok(()) => enviar.enviar(json),
                Err(e) => enviar.fallar(format!("DevTools falló: {e}")),
            }
            Ok(())
        }));
        // SAFETY: los HSTRING viven durante la llamada; la vista es válida mientras viva el webview.
        unsafe {
            webview.webview().CallDevToolsProtocolMethod(
                &HSTRING::from(metodo),
                &HSTRING::from(parametros),
                &listo,
            )
        }
        .map_err(|e| format!("CallDevToolsProtocolMethod falló: {e}"))?;
        Ok(respuesta)
    }

    pub(crate) fn borrar_datos(webview: &WebView) -> Result<Respuesta<()>, String> {
        let (enviar, respuesta) = canal();
        let listo = ClearBrowsingDataCompletedHandler::create(Box::new(move |r| {
            match r {
                Ok(()) => enviar.enviar(()),
                Err(e) => enviar.fallar(format!("ClearBrowsingDataAll falló: {e}")),
            }
            Ok(())
        }));
        // SAFETY: la vista es válida mientras viva el webview; el manejador vive hasta que WebView2 lo suelta.
        unsafe {
            let vista: ICoreWebView2_13 = webview.webview().cast().map_err(|e| e.to_string())?;
            let perfil: ICoreWebView2Profile2 = vista
                .Profile()
                .and_then(|p| p.cast())
                .map_err(|e| e.to_string())?;
            perfil.ClearBrowsingDataAll(&listo)
        }
        .map_err(|e| format!("ClearBrowsingDataAll falló: {e}"))?;
        Ok(respuesta)
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
    fn los_cierres_de_sesion_se_reconocen_como_en_panel_cpp() {
        // PAN-005: /(logout|log-out|signout|sign-out)(\b|/|\?|$), sin distinguir mayúsculas.
        for si in [
            "https://cc-prueba.test/logout",
            "https://cc-prueba.test/auth/sign-out?vuelta=1",
            "https://cc-prueba.test/signout",
            "https://x.test/Log-Out/",
            "https://x.test/LOGOUT#a",
            "https://x.test/sign-out.html",
            // Revisión PART-012: la regex de panel.cpp mira la URL entera, también la consulta con «/» literal.
            "https://x.test/a?next=/logout",
        ] {
            assert!(es_cierre_de_sesion(si), "{si}");
        }
        for no in [
            "https://cc-prueba.test/cierre.html?ir=%2Flogout",
            "https://x.test/logouts",
            "https://x.test/signout_x",
            "https://x.test/logout1",
            "https://x.test/milogout",
            "https://x.test/new",
            // Revisión PART-012: como la regex, no decodifica: %6C no es «l».
            "https://x.test/%6Cogout",
        ] {
            assert!(!es_cierre_de_sesion(no), "{no}");
        }
    }

    #[test]
    fn el_origen_es_esquema_y_autoridad() {
        assert_eq!(
            origen("https://CC-Prueba.test/textarea.html?x=1").as_deref(),
            Ok("https://cc-prueba.test")
        );
        assert_eq!(
            origen("https://x.test:8443").as_deref(),
            Ok("https://x.test:8443")
        );
        // Revisión PART-012, hallazgo 2: un origen de DevTools no lleva usuario ni el puerto por defecto,
        // y una URL sin esquema es un error, como new Uri(url) en la Unity.
        assert_eq!(
            origen("https://u:clave@x.test/a").as_deref(),
            Ok("https://x.test")
        );
        assert_eq!(
            origen("https://x.test:443/").as_deref(),
            Ok("https://x.test")
        );
        assert_eq!(origen("http://x.test:80").as_deref(), Ok("http://x.test"));
        assert!(origen("x.test/p").is_err());
        assert!(origen("https:///p").is_err());
    }

    #[test]
    fn los_segundos_se_escriben_como_en_la_unity() {
        assert_eq!(segundos(Duration::from_secs(3)), "3");
        assert_eq!(segundos(Duration::from_millis(500)), "0.5");
        assert_eq!(segundos(Duration::from_secs(90)), "90");
    }
}
