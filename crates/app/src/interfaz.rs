//! PART-014: la interfaz de la app sobre la ventana de Slint. Los textos, las validaciones y la
//! apariencia salen de nucleo::ajustes y nucleo::ronda; el estado de la ronda, de la Puerta.
//! Es el port de Aplicacion.cs, Configuracion.cs y PantallaRonda.Armar de la Unity.

use std::cell::{Cell, RefCell};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::rc::{Rc, Weak};
use std::time::{Duration, Instant, SystemTime};

use nucleo::ajustes::{self, Apariencia};
use nucleo::datos;
use nucleo::dominio::{estado_de_sesion, nombre_proveedor};
use nucleo::puerta::{self, Lectura, Paso, Situacion};
use nucleo::ronda::{self, RolesElegidos};
use nucleo::texto::Texto;
use paneles::{EstadoPagina, Navegador, Panel};
use slint::{ComponentHandle, Model, ModelRc, SharedString, VecModel};

use crate::hilo::HiloNucleo;
use crate::ventana::{Anterior, Cuenta, Fila, Marca, Ventana};

/// IFZ-016: la página de las versiones publicadas.
pub const PAGINA_DE_VERSIONES: &str = "https://github.com/juanfernandezzz/ChatCouncil/releases";

/// IFZ-016: los crates enlazados y su licencia, de `cargo tree -p app -e normal`.
const LICENCIAS: &str = include_str!("licencias.txt");

pub struct Opciones {
    pub datos: PathBuf,
    /// -pruebainterfaz: cada proveedor abre chatgpt.html o popup.html de cc-prueba.test.
    pub prueba: bool,
    /// -paginasdeprueba: los operadores abren las siete páginas locales.
    pub paginas_de_prueba: bool,
    /// -pruebaronda: cada operador abre ronda.html?p={id} con la spec de la prueba (PruebaRonda.cs).
    pub prueba_ronda: bool,
}

/// PruebaRonda.Spec: la misma para los siete; el fin se observa porque desaparece el botón de detener.
pub const SPEC_DE_LA_PRUEBA: &str = "{\"composer\":{\"selector\":\"#compositor\",\"kind\":\"textarea\"},\"escritura\":\"insertText\",\"assistantMessage\":{\"selector\":\".respuesta\",\"pick\":\"last\"},\"userMessage\":{\"selector\":\".usuario\",\"pick\":\"first\"},\"completion\":{\"kind\":\"element-gone\",\"selector\":\"#detener\",\"quiescenceMs\":500},\"version\":1}";

/// La acción del diálogo abierto, con lo que quedó en el campo y en la casilla.
type Accion = Box<dyn FnOnce(&Rc<Interfaz>, String, bool)>;

/// El consejo de una ronda armada y sus paneles. La etapa y los estados no se guardan aquí: se le
/// piden a la Puerta cada vez (C2).
pub struct Ronda {
    pub nucleo: HiloNucleo,
    pub operadores: Vec<String>,
    pub funciones: Vec<(String, &'static str)>,
    roles: RolesElegidos,
    paneles: RefCell<HashMap<String, Rc<Panel>>>,
    visible: RefCell<Option<String>>,
    /// CAP-014: lo último que dijo cada página; el sondeo lo renueva y lo que no responde se quita.
    pagina: RefCell<HashMap<String, EstadoPagina>>,
    /// Las navegaciones de cada panel en la última captura: la continuidad de hilo (PantallaRonda.Contexto).
    navegaciones: RefCell<HashMap<String, u64>>,
    /// «No volver a avisar en esta sesión» del aviso de capacidades.
    aviso_omitido: Cell<bool>,
    ocupado: Cell<bool>,
}

impl Ronda {
    /// Operadores y roles, sin repetir: las filas de la lista.
    pub fn ids(&self) -> Vec<String> {
        let mut v = self.operadores.clone();
        for (id, _) in &self.funciones {
            if !v.contains(id) {
                v.push(id.clone());
            }
        }
        v
    }
}

pub struct Interfaz {
    pub ui: Ventana,
    pub datos: PathBuf,
    specs: String,
    pub conocidos: Vec<String>,
    prueba: bool,
    paginas_de_prueba: bool,
    prueba_ronda: bool,
    /// IFZ-024: la acción del diálogo abierto; cerrarlo sin aceptar la descarta (INV-IFZ-007).
    al_aceptar: RefCell<Option<Accion>>,
    yo: RefCell<Weak<Interfaz>>,
    primer_arranque: Cell<bool>,
    pub marcas: Rc<VecModel<Marca>>,
    pub cuentas: Rc<VecModel<Cuenta>>,
    pub filas: Rc<VecModel<Fila>>,
    paginas_cuenta: RefCell<HashMap<String, Rc<Panel>>>,
    cuenta_visible: RefCell<Option<String>>,
    abriendo: RefCell<HashSet<String>>,
    vueltas: RefCell<HashMap<String, u64>>,
    navegador: RefCell<Option<Rc<Navegador>>>,
    apariencia: Cell<Apariencia>,
    pub ronda: RefCell<Option<Rc<Ronda>>>,
    region: Cell<Option<&'static str>>,
    tamano: Cell<(f64, f64)>,
}

fn leer(ruta: &Path) -> Option<String> {
    std::fs::read_to_string(ruta).ok()
}

fn refs(v: &[String]) -> Vec<&str> {
    v.iter().map(String::as_str).collect()
}

fn texto(s: &str) -> SharedString {
    SharedString::from(s)
}

fn modelo<T: Clone + 'static>(v: &Rc<VecModel<T>>) -> ModelRc<T> {
    ModelRc::from(v.clone())
}

/// AJU-008: el tema del sistema (AppsUseLightTheme).
fn sistema_oscuro() -> bool {
    use windows::Win32::System::Registry::{HKEY_CURRENT_USER, RRF_RT_REG_DWORD, RegGetValueW};
    use windows::core::w;
    let mut valor: u32 = 1;
    let mut largo = std::mem::size_of::<u32>() as u32;
    // SAFETY: valor y largo viven durante la llamada y largo dice el tamaño de valor.
    let r = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            w!("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize"),
            w!("AppsUseLightTheme"),
            RRF_RT_REG_DWORD,
            None,
            Some((&raw mut valor).cast()),
            Some(&raw mut largo),
        )
    };
    ajustes::windows_en_oscuro(r.is_ok().then_some(valor))
}

/// Abre una carpeta o una dirección con el programa del sistema (Application.OpenURL).
fn abrir_en_el_sistema(destino: &str) -> Result<(), String> {
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    use windows::core::{HSTRING, w};
    // SAFETY: las cadenas viven durante la llamada; sin ventana dueña.
    let r = unsafe {
        ShellExecuteW(
            None,
            w!("open"),
            &HSTRING::from(destino),
            None,
            None,
            SW_SHOWNORMAL,
        )
    };
    // ShellExecuteW: un valor de 32 o menos es un código de error.
    if r.0 as isize > 32 {
        Ok(())
    } else {
        Err(format!("No se pudo abrir {destino}."))
    }
}

/// AJU-006 y AJU-008: la escala se fija antes de crear la ventana; con «El del sistema», la de Windows.
fn fijar_escala(texto: i64) {
    if texto == 0 {
        return;
    }
    // SAFETY: GetDpiForSystem no toma punteros.
    let ppp = unsafe { windows::Win32::UI::HiDpi::GetDpiForSystem() };
    let escala = ppp as f32 / 96.0 * ajustes::escala(texto, 1.0);
    // SAFETY: se llama al arrancar, antes de crear la ventana y el hilo del núcleo: no hay otros hilos que lean el entorno.
    unsafe { std::env::set_var("SLINT_SCALE_FACTOR", escala.to_string()) };
}

/// IFZ-016: «ChatCouncil, versión {v}.» y el aviso si las specs vienen de la carpeta de datos (ARR-004).
pub fn texto_de_version(specs_calientes: bool) -> String {
    format!(
        "ChatCouncil, versión {}.{}",
        env!("CARGO_PKG_VERSION"),
        if specs_calientes {
            " Usa el specs.json de la carpeta de datos (pruebas)."
        } else {
            ""
        }
    )
}

/// IFZ-016: las licencias de los crates enlazados y de las dos fuentes del PDF.
pub fn texto_de_licencias() -> String {
    let mut t = String::from(
        "ChatCouncil usa estas bibliotecas y fuentes de terceros. Cada una conserva su licencia, que se reproduce abajo.\n\nFuentes del informe en PDF: Libertinus Serif (SIL Open Font License 1.1) y DejaVu Sans Mono (licencia Bitstream Vera).\n\n",
    );
    for l in LICENCIAS.lines().filter(|l| !l.is_empty()) {
        t.push_str(&l.replacen('|', ": ", 1));
        t.push('\n');
    }
    t
}

/// ADR-0006: sin -datos, al arrancar se copian las conversaciones de la Unity, solo leyendo su carpeta.
pub fn importar_de_la_unity(local_app_data: &Path, datos: &Path) -> std::io::Result<usize> {
    let Some(appdata) = local_app_data.parent() else {
        return Ok(0);
    };
    let origen = appdata
        .join("LocalLow")
        .join("ChatCouncil")
        .join("ChatCouncil-Unity");
    nucleo::importar::importar(&origen, datos)
}

impl Interfaz {
    pub fn armar(o: Opciones) -> Result<Rc<Interfaz>, String> {
        let apariencia =
            ajustes::leer_apariencia(leer(&o.datos.join(ajustes::ARCHIVO_APARIENCIA)).as_deref());
        fijar_escala(apariencia.texto);
        let ui = Ventana::new().map_err(|e| format!("No se pudo crear la ventana: {e}"))?;

        let calientes = datos::specs_en_uso(&o.datos);
        let specs = calientes
            .clone()
            .unwrap_or_else(|| datos::SPECS_JSON.to_string());
        let conocidos = datos::ids_de_specs(&specs);
        let contenido = leer(&o.datos.join(ronda::ARCHIVO_SELECCION));
        let primer_arranque = !o.datos.join(ronda::ARCHIVO_SELECCION).exists();
        let c = refs(&conocidos);
        let activos =
            ronda::leer_seleccion(contenido.as_deref(), &c).unwrap_or_else(|| conocidos.clone());
        let roles = ronda::leer_roles(contenido.as_deref(), &c);

        let marcas = Rc::new(VecModel::from(
            conocidos
                .iter()
                .map(|id| Marca {
                    id: texto(id),
                    nombre: texto(&nombre_proveedor(id)),
                    marcado: activos.contains(id),
                })
                .collect::<Vec<_>>(),
        ));
        let i = Interfaz {
            ui,
            datos: o.datos,
            specs,
            conocidos,
            prueba: o.prueba,
            paginas_de_prueba: o.paginas_de_prueba,
            prueba_ronda: o.prueba_ronda,
            al_aceptar: RefCell::default(),
            yo: RefCell::default(),
            primer_arranque: Cell::new(primer_arranque),
            marcas,
            cuentas: Rc::new(VecModel::default()),
            filas: Rc::new(VecModel::default()),
            paginas_cuenta: RefCell::default(),
            cuenta_visible: RefCell::default(),
            abriendo: RefCell::default(),
            vueltas: RefCell::default(),
            navegador: RefCell::default(),
            apariencia: Cell::new(apariencia),
            ronda: RefCell::default(),
            region: Cell::new(None),
            tamano: Cell::new((1000.0, 700.0)),
        };
        let ui = &i.ui;
        ui.set_primer_arranque(primer_arranque);
        ui.set_titulo_ajustes(texto(if primer_arranque {
            ajustes::TITULO_BIENVENIDA
        } else {
            ajustes::TITULO
        }));
        ui.set_bienvenida(texto(ajustes::BIENVENIDA));
        i.mostrar_paso(if primer_arranque { 1 } else { 0 });
        ui.set_marcas(modelo(&i.marcas));
        let nombres: Vec<SharedString> = i
            .conocidos
            .iter()
            .map(|id| texto(&nombre_proveedor(id)))
            .collect();
        ui.set_nombres(ModelRc::new(VecModel::from(nombres)));
        let indice = |id: &str| {
            i.conocidos
                .iter()
                .position(|c| c == id)
                .map_or(-1, |p| p as i32)
        };
        ui.set_idx_integrador(indice(&roles.integrador));
        ui.set_idx_verificador1(indice(&roles.verificador1));
        ui.set_idx_verificador2(indice(&roles.verificador2));
        ui.set_idx_redactor(indice(&roles.redactor));
        ui.set_etiquetas_rol(ModelRc::new(VecModel::from(
            ajustes::ETIQUETAS_DE_ROL.map(texto).to_vec(),
        )));
        ui.set_aviso_reabrir(texto(ajustes::AVISO_REABRIR));
        ui.set_texto_cuentas(texto(ajustes::TEXTO_CUENTAS));
        ui.set_texto_entrar(texto(ajustes::ENTRAR));
        ui.set_texto_ir_a_la_ronda(texto(ajustes::IR_A_LA_RONDA));
        i.armar_cuentas(&activos);
        ui.set_cuentas(modelo(&i.cuentas));
        ui.set_etiqueta_tema(texto(ajustes::ETIQUETA_TEMA));
        ui.set_etiqueta_tamano(texto(ajustes::ETIQUETA_TAMANO));
        ui.set_nombres_tema(ModelRc::new(VecModel::from(
            ajustes::NOMBRES_TEMA.map(texto).to_vec(),
        )));
        ui.set_nombres_tamano(ModelRc::new(VecModel::from(
            ajustes::TAMANOS
                .iter()
                .map(|t| texto(&ajustes::nombre_tamano(*t)))
                .collect::<Vec<_>>(),
        )));
        let pos = |v: &[&str], x: &str| v.iter().position(|t| *t == x).unwrap_or(0) as i32;
        ui.set_idx_tema(pos(&ajustes::TEMAS, apariencia.tema));
        ui.set_idx_tamano(
            ajustes::TAMANOS
                .iter()
                .position(|t| *t == apariencia.texto)
                .unwrap_or(0) as i32,
        );
        ui.invoke_aplicar_tema(ajustes::es_oscuro(apariencia.tema, sistema_oscuro()));
        let (que, como) = ajustes::textos_de_datos(false);
        ui.set_que_se_guarda(texto(que));
        ui.set_como_copiar(texto(como));
        ui.set_ruta_datos(texto(&i.datos.display().to_string()));
        ui.set_texto_copiar(texto(ajustes::COPIAR_LA_RUTA));
        ui.set_texto_abrir(texto(ajustes::ABRIR_LA_CARPETA));
        ui.set_puede_abrir(ajustes::se_puede_abrir_la_carpeta(false));
        ui.set_version(texto(&texto_de_version(calientes.is_some())));
        ui.set_licencias(texto(&texto_de_licencias()));
        ui.set_filas(modelo(&i.filas));
        ui.set_seccion(texto(if primer_arranque { "ajustes" } else { "ronda" }));

        let i = Rc::new(i);
        *i.yo.borrow_mut() = Rc::downgrade(&i);
        Interfaz::conectar_eventos(&i);
        if !primer_arranque {
            i.armar_ronda();
        }
        Ok(i)
    }

    fn conectar_eventos(i: &Rc<Interfaz>) {
        let ui = &i.ui;
        macro_rules! al {
            ($metodo:ident, |$x:ident $(, $a:ident: $t:ty)*| $cuerpo:expr) => {{
                let w: Weak<Interfaz> = Rc::downgrade(i);
                ui.$metodo(move |$($a: $t),*| {
                    if let Some($x) = w.upgrade() {
                        $cuerpo
                    }
                });
            }};
        }
        al!(on_guardar, |x| x.guardar());
        al!(on_entrar, |x, id: SharedString| x.entrar(id.to_string()));
        al!(on_comprobar, |x| {
            if let Some(id) = x.cuenta_visible.borrow().clone() {
                let x = x.clone();
                let _ = slint::spawn_local(async move { x.comprobar(&id).await });
            }
        });
        al!(on_volver, |x| x.volver());
        al!(on_empezar, |x| x.empezar());
        al!(on_apariencia_elegida, |x| x.apariencia_elegida());
        al!(on_copiar_ruta, |x| {
            x.ui.invoke_copiar();
            x.ui.set_texto_copiar(texto(ajustes::RUTA_COPIADA));
        });
        al!(on_abrir_carpeta, |x| {
            let _ = std::fs::create_dir_all(&x.datos);
            // La ruta tal cual: el file:// escapado de «Fernández» Windows no lo encuentra.
            if let Err(e) = abrir_en_el_sistema(&x.datos.display().to_string()) {
                x.ui.set_mensaje(texto(&e));
                x.ui.set_mensaje_problema(true);
            }
        });
        al!(on_abrir_informe, |_x, carpeta: SharedString| {
            if let Err(e) = abrir_en_el_sistema(&carpeta) {
                eprintln!("{e}");
            }
        });
        al!(on_ver_versiones, |_x| {
            if let Err(e) = abrir_en_el_sistema(PAGINA_DE_VERSIONES) {
                eprintln!("{e}");
            }
        });
        al!(on_seccion_cambiada, |x, s: SharedString| x
            .seccion_cambiada(&s));
        al!(on_tecla, |x, t: SharedString| x.tecla(&t));
        al!(on_seleccionar, |x, id: SharedString| x.seleccionar(&id));
        al!(on_area_cambio, |x| x.ubicar_ronda());
        al!(on_paso, |x| x.paso());
        al!(on_accion_panel, |x| x.accion_panel());
        al!(on_mover, |x, paso: i32| x.mover(paso));
        al!(on_dialogo_aceptar, |x| x.aceptar_dialogo());
        al!(on_dialogo_cancelar, |x| x.cerrar_capa());
        al!(on_cuenta_area_cambio, |x| x.ubicar_cuenta());
    }

    // ---------------------------------------------------------------- ajustes

    /// 0: ajustes, todo a la vista. 1 y 2: los pasos del primer arranque.
    fn mostrar_paso(&self, paso: u8) {
        self.ui.set_paso_guia(i32::from(paso));
        self.ui.set_texto_paso_guia(texto(ajustes::paso_guia(paso)));
    }

    fn armar_cuentas(&self, ids: &[String]) {
        self.cuentas.set_vec(
            ids.iter()
                .map(|id| Cuenta {
                    id: texto(id),
                    nombre: texto(&nombre_proveedor(id)),
                    estado: texto(ajustes::SIN_COMPROBAR),
                })
                .collect::<Vec<_>>(),
        );
    }

    fn id_de(&self, indice: i32) -> String {
        usize::try_from(indice)
            .ok()
            .and_then(|i| self.conocidos.get(i))
            .cloned()
            .unwrap_or_default()
    }

    /// AJU-002: valida con las reglas de nucleo::ronda; si pasan, escribe el archivo de selección.
    pub fn guardar(&self) {
        let marcados: Vec<String> = self
            .marcas
            .iter()
            .filter(|m| m.marcado)
            .map(|m| m.id.to_string())
            .collect();
        let ui = &self.ui;
        let roles = RolesElegidos::new(
            &self.id_de(ui.get_idx_integrador()),
            &self.id_de(ui.get_idx_verificador1()),
            &self.id_de(ui.get_idx_verificador2()),
            &self.id_de(ui.get_idx_redactor()),
        );
        let ahora = puerta::formatear_utc(SystemTime::now());
        match ajustes::guardar_seleccion(
            &self.datos,
            &refs(&self.conocidos),
            &refs(&marcados),
            &roles,
            &ahora,
        ) {
            Err(e) => {
                ui.set_mensaje(texto(&e));
                ui.set_mensaje_problema(true);
            }
            Ok(()) => {
                let (mensaje, paso) = ajustes::tras_guardar(self.primer_arranque.get());
                ui.set_mensaje(texto(mensaje));
                ui.set_mensaje_problema(false);
                self.armar_cuentas(&marcados);
                self.mostrar_paso(paso);
            }
        }
    }

    /// D25: la apariencia se guarda al elegir y se aplica la próxima vez que se abra la app.
    fn apariencia_elegida(&self) {
        let tema = ajustes::TEMAS[usize::try_from(self.ui.get_idx_tema()).unwrap_or(0).min(2)];
        let t = usize::try_from(self.ui.get_idx_tamano()).unwrap_or(0);
        let a = Apariencia {
            tema,
            texto: ajustes::TAMANOS[t.min(ajustes::TAMANOS.len() - 1)],
        };
        // Al cargar los valores del archivo también cambia el índice: eso no es una elección.
        if a == self.apariencia.get() {
            return;
        }
        // Solo lo que quedó en disco cuenta: si falla, elegir lo mismo de nuevo reintenta.
        let m = match ajustes::guardar_apariencia(&self.datos, a) {
            Ok(()) => {
                self.apariencia.set(a);
                ajustes::GUARDADO.to_string()
            }
            Err(e) => format!("No se pudo guardar en la carpeta de datos: {e}"),
        };
        self.ui.set_mensaje_apariencia(texto(&m));
    }

    fn navegador(&self) -> Result<Rc<Navegador>, String> {
        if let Some(n) = self.navegador.borrow().as_ref() {
            return Ok(n.clone());
        }
        let paginas = if self.prueba || self.paginas_de_prueba || self.prueba_ronda {
            Some(crate::escribir_paginas_de_prueba(&self.datos)?)
        } else {
            None
        };
        let n = Rc::new(Navegador::new(&self.datos, paginas));
        *self.navegador.borrow_mut() = Some(n.clone());
        Ok(n)
    }

    /// La página de cada proveedor: la de su spec, o una de prueba.
    fn url_de(&self, id: &str, indice: usize) -> String {
        if self.prueba_ronda {
            return format!("https://cc-prueba.test/ronda.html?p={id}");
        }
        if self.prueba {
            let pagina = if id == "chatgpt" {
                "chatgpt.html"
            } else {
                "popup.html"
            };
            return format!("https://cc-prueba.test/{pagina}");
        }
        if self.paginas_de_prueba {
            let p = crate::PAGINAS_LOCALES[indice % crate::PAGINAS_LOCALES.len()];
            return format!("https://cc-prueba.test/{p}");
        }
        datos::url_de(&self.specs, id).unwrap_or_else(|| "about:blank".into())
    }

    fn estado_cuenta(&self, id: &str, estado: &str) {
        for i in 0..self.cuentas.row_count() {
            if let Some(mut c) = self.cuentas.row_data(i)
                && c.id == id
            {
                c.estado = texto(estado);
                self.cuentas.set_row_data(i, c);
            }
        }
        if self.cuenta_visible.borrow().as_deref() == Some(id) {
            self.ui.set_cuenta_estado(texto(estado));
        }
    }

    /// PAN-007: muestra la página del proveedor para entrar a la cuenta, y comprueba la sesión.
    pub fn entrar(self: &Rc<Self>, id: String) {
        *self.cuenta_visible.borrow_mut() = Some(id.clone());
        self.ui.set_vista_cuenta(true);
        self.ui.set_cuenta_titulo(texto(&nombre_proveedor(&id)));
        self.estado_cuenta(&id, ajustes::ABRIENDO);
        let x = self.clone();
        let _ = slint::spawn_local(async move {
            if !x.paginas_cuenta.borrow().contains_key(&id) {
                // Un segundo «Entrar» mientras se crea la página no abre otra encima.
                if !x.abriendo.borrow_mut().insert(id.clone()) {
                    return;
                }
                let r = x.abrir_cuenta(&id).await;
                x.abriendo.borrow_mut().remove(&id);
                if let Err(e) = r {
                    x.estado_cuenta(&id, &ajustes::no_se_pudo_abrir(&e));
                    return;
                }
            }
            x.ubicar_cuenta();
            x.comprobar(&id).await;
        });
    }

    /// La página queda registrada en cuanto existe, antes de cargar: así se aparta o se reubica mientras
    /// carga. Si la carga falla se quita, y el próximo «Entrar» la abre de nuevo.
    async fn abrir_cuenta(&self, id: &str) -> Result<(), String> {
        let nav = self.navegador()?;
        let p = Rc::new(
            crate::crear_panel(&nav, self.ui.window(), "proveedores", self.area_cuenta()).await?,
        );
        self.paginas_cuenta
            .borrow_mut()
            .insert(id.to_string(), p.clone());
        self.ubicar_cuenta();
        let r = p.navegar(&self.url_de(id, 0)).await;
        if r.is_err() {
            self.paginas_cuenta.borrow_mut().remove(id);
        }
        r
    }

    /// PAN-006: con sesión si la página muestra el compositor de su spec; se le da un margen para montarlo.
    pub async fn comprobar(&self, id: &str) {
        let Some(p) = self.paginas_cuenta.borrow().get(id).cloned() else {
            return;
        };
        // Una comprobación más vieja que termina después de una nueva no pisa el estado.
        let vuelta = {
            let mut v = self.vueltas.borrow_mut();
            let n = v.entry(id.to_string()).or_insert(0);
            *n += 1;
            *n
        };
        let vigente = || self.vueltas.borrow().get(id) == Some(&vuelta);
        self.estado_cuenta(id, ajustes::COMPROBANDO);
        let spec = datos::spec_de(&self.specs, id).unwrap_or_default();
        let limite = Instant::now() + Duration::from_millis(ajustes::ESPERA_COMPOSITOR_MS);
        loop {
            let leido = p.leer_compositor(&spec).await;
            if !vigente() {
                return;
            }
            match leido {
                Err(e) => {
                    self.estado_cuenta(id, &ajustes::no_se_pudo_comprobar(&e));
                    return;
                }
                Ok(c) => {
                    let sesion = estado_de_sesion(c.as_ref());
                    if sesion == "con-sesion" || Instant::now() > limite {
                        self.estado_cuenta(id, ajustes::texto_de_sesion(sesion));
                        return;
                    }
                }
            }
            if paneles::dormir(Duration::from_millis(ajustes::REINTENTO_COMPOSITOR_MS))
                .await
                .is_err()
            {
                return;
            }
        }
    }

    fn area_cuenta(&self) -> (f64, f64, f64, f64) {
        let ui = &self.ui;
        (
            f64::from(ui.get_cuenta_x()),
            f64::from(ui.get_cuenta_y()),
            f64::from(ui.get_cuenta_ancho()),
            f64::from(ui.get_cuenta_alto()),
        )
    }

    /// La página de la cuenta va encima del rectángulo de la vista; las demás, fuera de la ventana.
    fn ubicar_cuenta(&self) {
        let visible = self.cuenta_visible.borrow().clone();
        let (x, y, w, h) = self.area_cuenta();
        let mostrar = self.ui.get_seccion() == "ajustes"
            && self.ui.get_vista_cuenta()
            && !self.ui.get_cajon_abierto()
            && w > 0.0;
        for (id, p) in self.paginas_cuenta.borrow().iter() {
            let r = if mostrar && visible.as_deref() == Some(id) {
                p.rect(x, y, w, h).map(|()| p.frente())
            } else {
                apartar(p)
            };
            if let Err(e) = r {
                eprintln!("No se pudo reacomodar la página de {id}: {e}");
            }
        }
    }

    /// Las páginas nativas no son parte del árbol: al salir de la vista se esconden.
    fn ocultar_cuentas(&self) {
        for p in self.paginas_cuenta.borrow().values() {
            let _ = apartar(p);
        }
    }

    pub fn volver(&self) {
        self.ocultar_cuentas();
        *self.cuenta_visible.borrow_mut() = None;
        self.ui.set_vista_cuenta(false);
    }

    /// Desde acá la sección es Ajustes: los cambios siguientes se aplican al reabrir.
    pub fn empezar(&self) {
        self.ocultar_cuentas();
        self.primer_arranque.set(false);
        self.ui.set_primer_arranque(false);
        self.ui.set_titulo_ajustes(texto(ajustes::TITULO));
        self.ui.set_mensaje(SharedString::new());
        self.mostrar_paso(0);
        self.armar_ronda();
        self.ui.invoke_ir(texto("ronda"));
    }

    fn seccion_cambiada(&self, seccion: &str) {
        if seccion != "ajustes" {
            self.ocultar_cuentas();
        }
        if seccion == "historial" {
            self.armar_historial();
        }
        self.ubicar_ronda();
        self.ubicar_cuenta();
    }

    /// IFZ-014: las rondas de este aparato, la más nueva primero.
    fn armar_historial(&self) {
        let Some(r) = self.ronda.borrow().clone() else {
            self.ui
                .set_anteriores(ModelRc::new(VecModel::<Anterior>::default()));
            return;
        };
        let w = self.ui.as_weak();
        let respuesta = r.nucleo.pedir(|p| p.rondas_anteriores());
        let _ = slint::spawn_local(async move {
            let Ok(rondas) = respuesta.await else { return };
            let Some(ui) = w.upgrade() else { return };
            let filas: Vec<Anterior> = rondas
                .iter()
                .map(|a| {
                    let (pregunta, detalle) = a.lineas(puerta::desfase_local_del_sistema, false);
                    Anterior {
                        id: texto(
                            &a.ronda_id
                                .as_ref()
                                .map(|t| t.para_mostrar().into_owned())
                                .unwrap_or_default(),
                        ),
                        pregunta: texto(&pregunta),
                        detalle: texto(&detalle),
                        carpeta: texto(
                            &a.carpeta_informe
                                .as_ref()
                                .map(|c| c.display().to_string())
                                .unwrap_or_default(),
                        ),
                    }
                })
                .collect();
            ui.set_anteriores(ModelRc::new(VecModel::from(filas)));
        });
    }

    // ---------------------------------------------------------------- teclado (D49)

    fn tecla(&self, t: &str) {
        let en_ronda = self.ui.get_seccion() == "ronda" && !self.primer_arranque.get();
        match t {
            "F1" if en_ronda => self.mover(-1),
            "F2" if en_ronda => self.mover(1),
            // F3 es el paso siguiente: lo conecta PART-015.
            "F4" => self.region(1),
            "F5" => self.region(-1),
            _ => {}
        }
    }

    /// Las regiones a la vista, en orden: riel, guía, lista, la página y abajo.
    fn regiones(&self) -> Vec<&'static str> {
        let ui = &self.ui;
        let mut v = Vec::new();
        if ui.get_riel_visible() {
            v.push("riel");
        }
        match ui.get_seccion().as_str() {
            "ronda" if ui.get_ancha() => v.extend(["guia", "lista", "pagina"]),
            "ronda" => v.extend(["pagina", "abajo"]),
            "ajustes" if ui.get_vista_cuenta() => v.extend(["barra", "cuenta-pagina"]),
            "ajustes" => v.push("formulario"),
            _ => {}
        }
        v
    }

    /// F4 y F5: la región siguiente o la anterior. La página nativa recibe el foco del panel.
    fn region(&self, paso: i32) {
        let r = self.regiones();
        if r.is_empty() {
            return;
        }
        let n = r.len() as i32;
        let actual = self
            .region
            .get()
            .and_then(|a| r.iter().position(|x| *x == a))
            .map_or(if paso > 0 { -1 } else { 0 }, |a| a as i32);
        for i in 1..=n {
            let nombre = r[(actual + paso * i).rem_euclid(n) as usize];
            let ok = match nombre {
                "pagina" => self.panel_visible().is_some_and(|p| p.foco().is_ok()),
                "cuenta-pagina" => {
                    let id = self.cuenta_visible.borrow().clone();
                    id.and_then(|id| self.paginas_cuenta.borrow().get(&id).cloned())
                        .is_some_and(|p| p.foco().is_ok())
                }
                otra => self.ui.invoke_enfocar(texto(otra)),
            };
            if ok {
                self.region.set(Some(nombre));
                return;
            }
        }
    }

    // ---------------------------------------------------------------- ronda

    /// El consejo del archivo de selección (o todos con los roles por defecto) y la ronda activa del registro.
    fn armar_ronda(&self) {
        // Un diálogo abierto era de la ronda anterior: su acción no pasa a la nueva.
        self.cerrar_capa();
        let contenido = leer(&self.datos.join(ronda::ARCHIVO_SELECCION));
        let c = refs(&self.conocidos);
        let activos = ronda::leer_seleccion(contenido.as_deref(), &c)
            .unwrap_or_else(|| self.conocidos.clone());
        let roles = ronda::leer_roles(contenido.as_deref(), &c);
        let pool = ronda::pool_de_investigadores(&c, &roles);
        // La pregunta va solo a los operadores cargados, nunca a los roles (historia 26).
        let operadores: Vec<String> = pool
            .iter()
            .filter(|id| activos.contains(id))
            .cloned()
            .collect();
        let funciones = ronda::funciones_de_roles(&roles);
        let nucleo = HiloNucleo::con_consejo(self.datos.clone(), activos, roles.clone(), pool);
        let r = Rc::new(Ronda {
            nucleo,
            visible: RefCell::new(operadores.first().cloned()),
            operadores,
            funciones,
            roles,
            paneles: RefCell::default(),
            pagina: RefCell::default(),
            navegaciones: RefCell::default(),
            aviso_omitido: Cell::new(false),
            ocupado: Cell::new(false),
        });
        let mut filas: Vec<Fila> = r
            .operadores
            .iter()
            .map(|id| Fila {
                id: texto(id),
                nombre: texto(&nombre_proveedor(id)),
                estado: SharedString::new(),
                icono: SharedString::new(),
                rol: false,
                visible: true,
                actual: false,
            })
            .collect();
        filas.extend(r.funciones.iter().map(|(id, f)| Fila {
            id: texto(id),
            nombre: texto(&nombre_proveedor(id)),
            estado: texto(f),
            icono: SharedString::new(),
            rol: true,
            // Los roles en la lista solo mientras están en el recorrido (D42); eso es de PART-017.
            visible: false,
            actual: false,
        }));
        self.filas.set_vec(filas);
        self.ui
            .set_titulo_investigadores(texto(&format!("Investigación ({})", r.operadores.len())));
        self.ui.set_roles_visibles(false);
        *self.ronda.borrow_mut() = Some(r);
        self.refrescar();
        self.abrir_paneles();
    }

    fn area_ronda(&self) -> (f64, f64, f64, f64) {
        let ui = &self.ui;
        (
            f64::from(ui.get_area_x()),
            f64::from(ui.get_area_y()),
            f64::from(ui.get_area_ancho()),
            f64::from(ui.get_area_alto()),
        )
    }

    pub fn panel_de(&self, id: &str) -> Option<Rc<Panel>> {
        let r = self.ronda.borrow().clone()?;
        r.paneles.borrow().get(id).cloned()
    }

    pub fn panel_visible(&self) -> Option<Rc<Panel>> {
        let r = self.ronda.borrow().clone()?;
        let id = r.visible.borrow().clone()?;
        r.paneles.borrow().get(&id).cloned()
    }

    /// Las páginas van apiladas sobre el área; la del panel visible, al frente. Fuera de la Ronda o con
    /// el cajón abierto se apartan: van encima de todo lo que dibuja Slint.
    pub fn ubicar_ronda(&self) {
        let Some(r) = self.ronda.borrow().clone() else {
            return;
        };
        let (x, y, w, h) = self.area_ronda();
        if w > 0.0 && h > 0.0 {
            self.tamano.set((w, h));
        }
        let mostrar = self.ui.get_seccion() == "ronda"
            && !self.ui.get_cajon_abierto()
            && !self.ui.get_capa_abierta()
            && w > 0.0;
        let visible = r.visible.borrow().clone();
        let (ancho, alto) = self.tamano.get();
        for (id, p) in r.paneles.borrow().iter() {
            let res = if mostrar && visible.as_deref() == Some(id) {
                p.rect(x, y, w, h).map(|()| p.frente())
            } else {
                // Fuera de la ventana con su tamaño, no a 0×0: así una SPA sigue montando (PantallaRonda.Ubicar).
                p.rect(-ancho - 100.0, 0.0, ancho, alto)
            };
            if let Err(e) = res {
                eprintln!("No se pudo reacomodar el panel de {id}: {e}");
            }
        }
    }

    pub fn seleccionar(&self, id: &str) {
        if let Some(r) = self.ronda.borrow().as_ref() {
            *r.visible.borrow_mut() = Some(id.to_string());
        }
        self.ui.set_accion_texto(SharedString::new());
        self.ubicar_ronda();
        self.refrescar();
    }

    /// F1 y F2: el panel anterior o el siguiente de los que están en el recorrido.
    pub fn mover(&self, paso: i32) {
        let Some(r) = self.ronda.borrow().clone() else {
            return;
        };
        let en_la_vista = &r.operadores;
        if en_la_vista.is_empty() {
            return;
        }
        let n = en_la_vista.len() as i32;
        let actual = r
            .visible
            .borrow()
            .as_ref()
            .and_then(|v| en_la_vista.iter().position(|x| x == v))
            .map_or(-1, |i| i as i32);
        let i = (actual + paso).rem_euclid(n);
        self.seleccionar(&en_la_vista[i as usize]);
    }

    /// Pide a la Puerta el paso y el estado de cada panel y los pone a la vista (C2: nada se guarda aquí).
    pub fn refrescar(&self) {
        let Some(r) = self.ronda.borrow().clone() else {
            return;
        };
        let ids = r.ids();
        let pedido: Vec<(String, Option<bool>, Option<String>)> = {
            let pagina = r.pagina.borrow();
            ids.iter()
                .map(|id| {
                    let e = pagina.get(id);
                    (
                        id.clone(),
                        e.and_then(|e| e.generando),
                        e.and_then(|e| e.fin.clone()),
                    )
                })
                .collect()
        };
        let visible = r.visible.borrow().clone();
        let respuesta = r.nucleo.pedir(move |p| {
            let paso = p.paso_siguiente()?;
            let estados = pedido
                .iter()
                .map(|(id, generando, fin)| p.estado_de_panel(id, *generando, fin.as_deref()))
                .collect::<std::io::Result<Vec<&'static str>>>()?;
            let situacion = match visible.and_then(|v| pedido.iter().position(|x| x.0 == v)) {
                Some(i) => p.situacion_de_panel(
                    &pedido[i].0,
                    paso.etapa,
                    estados[i],
                    pedido[i].2.is_some(),
                )?,
                None => Situacion::default(),
            };
            Ok::<_, std::io::Error>((paso, estados, situacion))
        });
        let w = self.ui.as_weak();
        let filas = self.filas.clone();
        let _ = slint::spawn_local(async move {
            let Some(ui) = w.upgrade() else { return };
            match respuesta.await.and_then(|x| x.map_err(|e| e.to_string())) {
                Ok((paso, estados, situacion)) => {
                    mostrar_ronda(&ui, &filas, &r, &ids, &paso, &estados, &situacion)
                }
                Err(e) => {
                    ui.set_resultado(texto(&e));
                    ui.set_resultado_problema(true);
                }
            }
        });
    }

    /// Abre una página por operador, apiladas en el área de la página.
    fn abrir_paneles(&self) {
        let Some(r) = self.ronda.borrow().clone() else {
            return;
        };
        let nav = match self.navegador() {
            Ok(n) => n,
            Err(e) => {
                let m = format!("No se pudieron abrir los paneles: {e}");
                self.ui.set_resultado(texto(&m));
                self.ui.set_resultado_problema(true);
                return;
            }
        };
        let urls: Vec<(String, String)> = r
            .operadores
            .iter()
            .enumerate()
            .map(|(i, id)| (id.clone(), self.url_de(id, i)))
            .collect();
        let w = self.ui.as_weak();
        let yo = self.yo();
        let _ = slint::spawn_local(async move {
            let mut cargas = Vec::new();
            for (id, url) in &urls {
                let Some(ui) = w.upgrade() else { return };
                let area = (
                    f64::from(ui.get_area_x()),
                    f64::from(ui.get_area_y()),
                    f64::from(ui.get_area_ancho()).max(1.0),
                    f64::from(ui.get_area_alto()).max(1.0),
                );
                match crate::crear_panel(&nav, ui.window(), "proveedores", area).await {
                    Ok(p) => {
                        cargas.push((url.clone(), p.navegar(url)));
                        r.paneles.borrow_mut().insert(id.clone(), Rc::new(p));
                        ui.invoke_area_cambio();
                    }
                    Err(e) => {
                        let m = format!(
                            "No se pudo abrir la página de {}: {e}",
                            nombre_proveedor(id)
                        );
                        ui.set_resultado(texto(&m));
                        ui.set_resultado_problema(true);
                    }
                }
            }
            // Como Paneles.EsperarCarga: una página que tarda no descarta su panel.
            for (url, carga) in cargas {
                if let Err(e) = carga.await {
                    eprintln!("{url}: {e}");
                }
            }
            if let Some(x) = yo.upgrade() {
                x.refrescar();
            }
            sondear(yo, r).await;
        });
    }

    /// Un Weak de sí misma para las tareas que siguen después de esta llamada.
    fn yo(&self) -> Weak<Interfaz> {
        self.yo.borrow().clone()
    }

    fn spec_de(&self, id: &str) -> String {
        if self.prueba_ronda {
            return SPEC_DE_LA_PRUEBA.into();
        }
        datos::spec_de(&self.specs, id).unwrap_or_default()
    }

    fn resultado(&self, texto_: &str, problema: bool) {
        self.ui.set_resultado(texto(texto_));
        self.ui.set_resultado_problema(problema);
    }

    fn ocupar(&self, r: &Ronda, si: bool) {
        r.ocupado.set(si);
        self.ui.set_ocupado(si);
    }

    /// Una acción de la persona a la vez: se toma antes del primer await, así un doble clic o una tecla
    /// repetida no abre dos rondas ni registra dos veces. Con un diálogo abierto no se toma.
    fn tomar(&self) -> Option<Rc<Ronda>> {
        let r = self.ronda.borrow().clone()?;
        if r.ocupado.get() || self.ui.get_capa_abierta() {
            return None;
        }
        self.ocupar(&r, true);
        Some(r)
    }

    // ---------------------------------------------------------------- acciones (PantallaRonda.Paso)

    /// El botón del paso: lo que corresponde lo dice la Puerta.
    pub fn paso(&self) {
        let Some(r) = self.tomar() else {
            return;
        };
        let yo = self.yo();
        let respuesta = r.nucleo.pedir(|p| p.paso_siguiente());
        let _ = slint::spawn_local(async move {
            let Some(x) = yo.upgrade() else { return };
            match respuesta.await.and_then(|p| p.map_err(|e| e.to_string())) {
                Err(e) => x.resultado(&e, true),
                Ok(paso) => match paso.accion {
                    "pegar-pregunta" => x.clone().pegar_pregunta().await,
                    "capturar" if paso.etapa == "investigacion" || paso.etapa == "operacion" => {
                        match x.estados(&r).await {
                            Ok(e) => {
                                let terminados = e
                                    .into_iter()
                                    .filter(|(id, e)| r.operadores.contains(id) && terminado(e))
                                    .map(|(id, _)| id)
                                    .collect();
                                x.capturar(terminados).await;
                            }
                            Err(e) => x.resultado(&e, true),
                        }
                    }
                    "declarar-pregunta" => {
                        x.ocupar(&r, false);
                        x.dialogo_declarar();
                    }
                    // La operación, los roles y el informe son de PART-016.
                    _ => {}
                },
            }
            x.ocupar(&r, false);
            x.refrescar();
        });
    }

    /// El estado de cada panel con lo último que dijo su página.
    async fn estados(&self, r: &Ronda) -> Result<Vec<(String, &'static str)>, String> {
        let pedido: Vec<(String, Option<bool>, Option<String>)> = {
            let pagina = r.pagina.borrow();
            r.ids()
                .into_iter()
                .map(|id| {
                    let e = pagina.get(&id);
                    let (g, f) = (e.and_then(|e| e.generando), e.and_then(|e| e.fin.clone()));
                    (id, g, f)
                })
                .collect()
        };
        r.nucleo
            .pedir(move |p| {
                pedido
                    .iter()
                    .map(|(id, g, f)| Ok((id.clone(), p.estado_de_panel(id, *g, f.as_deref())?)))
                    .collect::<std::io::Result<Vec<_>>>()
            })
            .await
            .and_then(|x| x.map_err(|e| e.to_string()))
    }

    /// El botón de la cabecera: pegar aquí o capturar este panel.
    pub fn accion_panel(&self) {
        let accion = self.ui.get_accion_texto();
        let Some(r) = self.tomar() else {
            return;
        };
        let Some(id) = r.visible.borrow().clone() else {
            return self.ocupar(&r, false);
        };
        let yo = self.yo();
        let _ = slint::spawn_local(async move {
            let Some(x) = yo.upgrade() else { return };
            if accion == puerta::PEGAR_AQUI {
                x.pegar_en_este(id).await;
            } else if accion.starts_with(puerta::CAPTURAR_ESTE) {
                x.capturar(vec![id]).await;
            }
            x.ocupar(&r, false);
            x.refrescar();
        });
    }

    /// ESC-005: pegar en los operadores, después del aviso de capacidades, que se puede omitir en esta sesión.
    async fn pegar_pregunta(self: Rc<Self>) {
        let Some(r) = self.ronda.borrow().clone() else {
            return;
        };
        let pregunta = self.ui.get_pregunta().to_string();
        if pregunta.trim().is_empty() {
            return self.resultado("Escribe la pregunta antes de pegarla.", true);
        }
        if r.aviso_omitido.get() {
            return self.difundir(pregunta).await;
        }
        // El diálogo suelta la acción; «Pegar en los n» la vuelve a tomar.
        self.ocupar(&r, false);
        let difundir = move |x: &Rc<Interfaz>| {
            let Some(r) = x.tomar() else { return };
            let x = x.clone();
            let _ = slint::spawn_local(async move {
                x.clone().difundir(pregunta).await;
                x.ocupar(&r, false);
                x.refrescar();
            });
        };
        let n = r.operadores.len();
        self.abrir_dialogo(
            "Antes de pegar la pregunta",
            &format!("En cada panel, activa a mano la búsqueda web o la investigación profunda del proveedor. En investigación profunda el aviso de terminado es una estimación: captura cuando veas el informe completo. La app pega la pregunta en los {n} paneles; tú la revisas y la envías en cada uno."),
            false,
            Some("No volver a avisar en esta sesión"),
            &format!("Pegar en los {n}"),
            Box::new(move |x, _, marcada| {
                r.aviso_omitido.set(marcada);
                difundir(x);
            }),
        );
    }

    /// Escribe sin enviar en un panel; un fallo dice por qué.
    async fn escribir_en(&self, r: &Ronda, id: &str, pregunta: &Texto) -> Result<(), String> {
        let Some(p) = r.paneles.borrow().get(id).cloned() else {
            return Err("el panel no está abierto".into());
        };
        p.escribir(&self.spec_de(id), pregunta, paneles::ESPERA_ESCRIBIR)
            .await
    }

    /// Pega en todos a la vez (techo de 60 s cada uno); un fallo no tumba a los demás. Después abre la ronda
    /// y registra un intento por proveedor.
    async fn difundir(self: Rc<Self>, pregunta: String) {
        let Some(r) = self.ronda.borrow().clone() else {
            return;
        };
        self.resultado("Pegando la pregunta…", false);
        self.refrescar();
        let t = Texto::from(pregunta.as_str());
        let tareas: Vec<_> = r
            .operadores
            .iter()
            .map(|id| {
                let (x, r, id, t) = (self.clone(), r.clone(), id.clone(), t.clone());
                slint::spawn_local(async move {
                    let res = x.escribir_en(&r, &id, &t).await;
                    (id, res.err())
                })
            })
            .collect();
        let mut resultados: Vec<(String, Option<String>)> = Vec::new();
        for (tarea, id) in tareas.into_iter().zip(&r.operadores) {
            resultados.push(match tarea {
                Ok(t) => t.await,
                Err(e) => (id.clone(), Some(e.to_string())),
            });
        }
        let n = resultados.len();
        let ok = resultados.iter().filter(|(_, e)| e.is_none()).count();
        let registro = resultados.clone();
        let hecho = r
            .nucleo
            .pedir(move |p| {
                p.abrir_ronda(pregunta.as_str())?;
                let v: Vec<(&str, bool, Option<&str>)> = registro
                    .iter()
                    .map(|(id, e)| (id.as_str(), e.is_none(), e.as_deref()))
                    .collect();
                p.registrar_intentos(&v)
            })
            .await
            .and_then(|x| x.map_err(|e| e.to_string()));
        match hecho {
            Err(e) => self.resultado(&e, true),
            Ok(()) if ok == n => self.resultado(
                &format!("Pegada en los {ok} paneles. Revísala y envíala en cada uno."),
                false,
            ),
            Ok(()) => self.resultado(
                &format!("Pegada en {ok} de {n}. Los que fallaron dicen qué hacer en su cabecera."),
                true,
            ),
        }
        self.refrescar();
    }

    /// ESC-006: repega en el panel visible la pregunta de la ronda, sin ronda nueva ni intento; nunca encima
    /// de un mensaje enviado ni de un borrador.
    async fn pegar_en_este(&self, id: String) {
        let Some(r) = self.ronda.borrow().clone() else {
            return;
        };
        let pregunta = match r
            .nucleo
            .pedir(|p| p.pregunta_de_la_ronda())
            .await
            .and_then(|x| x.map_err(|e| e.to_string()))
        {
            Ok(Some(t)) => t,
            Ok(None) => return self.resultado("Esta ronda no tiene una pregunta que pegar.", true),
            Err(e) => return self.resultado(&e, true),
        };
        self.refrescar();
        let panel = r.paneles.borrow().get(&id).cloned();
        // Sin poder mirar el chat queda la otra defensa: escribir no pisa un compositor con texto.
        let enviada = match &panel {
            Some(p) => p.chat_vacio(&self.spec_de(&id)).await == Ok(Some(false)),
            None => false,
        };
        let res = if enviada {
            Err("el chat ya tiene un mensaje enviado: no se vuelve a pegar para no duplicar la pregunta".into())
        } else {
            self.escribir_en(&r, &id, &pregunta).await
        };
        let nombre = nombre_proveedor(&id);
        match res {
            Ok(()) => self.resultado(&format!("Pegada en {nombre}. Revísala y envíala."), false),
            Err(e) => self.resultado(&format!("No se pegó en {nombre}: {e}"), true),
        }
        self.refrescar();
    }

    /// CAP-003 e INV-CAP-002: lee esos paneles en paralelo (techo de 60 s) y los registra según la etapa del
    /// registro. Solo se llama desde un pedido de la persona.
    pub async fn capturar(&self, ids: Vec<String>) {
        let Some(r) = self.ronda.borrow().clone() else {
            return;
        };
        if ids.is_empty() {
            return;
        }
        self.resultado("Capturando…", false);
        self.refrescar();
        let tareas: Vec<_> = ids
            .iter()
            .map(|id| {
                let panel = r.paneles.borrow().get(id).cloned();
                let (id, spec) = (id.clone(), self.spec_de(id));
                slint::spawn_local(async move {
                    match panel {
                        Some(p) => p.leer(&id, &spec).await,
                        None => sin_panel(&id),
                    }
                })
            })
            .collect();
        let mut lecturas = Vec::new();
        for (t, id) in tareas.into_iter().zip(&ids) {
            lecturas.push(match t {
                Ok(t) => t.await,
                Err(e) => sin_panel(id).con_error(e.to_string()),
            });
        }
        // La continuidad de hilo y el tamaño del panel al capturar (PantallaRonda.Contexto).
        let contexto: HashMap<String, (Option<String>, Option<String>)> = {
            let paneles = r.paneles.borrow();
            let previas = r.navegaciones.borrow();
            ids.iter()
                .map(|id| {
                    let c = match paneles.get(id) {
                        None => (Some("indeterminada".into()), None),
                        Some(p) => {
                            let continuidad = match previas.get(id) {
                                None => "indeterminada",
                                Some(n) if *n == p.navegaciones() => "confirmada",
                                Some(_) => "refutada",
                            };
                            let (_, _, w, h) = p.rect_real();
                            (
                                Some(continuidad.into()),
                                (w > 0).then(|| format!("{w}x{h}")),
                            )
                        }
                    };
                    (id.clone(), c)
                })
                .collect()
        };
        let enviadas = lecturas.clone();
        let registro = r
            .nucleo
            .pedir(move |p| {
                let c = |id: &str| {
                    contexto
                        .get(id)
                        .cloned()
                        .unwrap_or((Some("indeterminada".into()), None))
                };
                p.registrar_capturas(&enviadas, &c)
            })
            .await
            .and_then(|x| x.map_err(|e| e.to_string()));
        if registro.is_ok() {
            for (id, p) in r.paneles.borrow().iter() {
                r.navegaciones
                    .borrow_mut()
                    .insert(id.clone(), p.navegaciones());
            }
        }
        match registro {
            Err(e) => self.resultado(&e, true),
            Ok((_, aviso)) => {
                let filas: Vec<(String, usize, bool)> = lecturas
                    .iter()
                    .map(|l| {
                        let largo = l.text.largo_utf16();
                        let fallida = l.error.as_ref().is_some_and(|e| e.largo_utf16() > 0)
                            || largo < puerta::UMBRAL_LECTURA_MINIMO;
                        (nombre_proveedor(&l.id), largo, fallida)
                    })
                    .collect();
                let (t, problema) = texto_de_captura(&filas, &aviso);
                self.resultado(&t, problema);
            }
        }
        self.refrescar();
    }

    /// «Capturar lo que ya está en los paneles»: todos los operadores, aunque no se haya pegado nada.
    /// La entrada del menú «Ronda…» llega con PART-016.
    pub async fn capturar_todo(&self) {
        let Some(r) = self.tomar() else {
            return;
        };
        self.capturar(r.operadores.clone()).await;
        self.ocupar(&r, false);
        self.refrescar();
    }

    pub fn dialogo_declarar(&self) {
        if self
            .ronda
            .borrow()
            .as_ref()
            .is_some_and(|r| r.ocupado.get())
        {
            return;
        }
        self.abrir_dialogo(
            ronda::DIALOGO_DECLARAR_TITULO,
            ronda::DIALOGO_DECLARAR_TEXTO,
            true,
            None,
            ronda::DIALOGO_DECLARAR_BOTON,
            Box::new(|x, campo, _| {
                if campo.trim().is_empty() {
                    return x.resultado(ronda::DECLARADA_VACIA, true);
                }
                let Some(r) = x.ronda.borrow().clone() else {
                    return;
                };
                let x = x.clone();
                let respuesta = r
                    .nucleo
                    .pedir(move |p| p.declarar_pregunta(campo.as_str()).map(|_| ()));
                let _ = slint::spawn_local(async move {
                    match respuesta.await.and_then(|v| v.map_err(|e| e.to_string())) {
                        Ok(()) => x.resultado(ronda::DECLARADA, false),
                        Err(e) => x.resultado(&e, true),
                    }
                    x.refrescar();
                });
            }),
        );
    }

    /// D13: la ronda queda en el registro tal como está y se vuelve a Pregunta. La entrada del menú
    /// «Ronda…» llega con PART-016.
    pub fn dialogo_abandonar(&self) {
        if self
            .ronda
            .borrow()
            .as_ref()
            .is_some_and(|r| r.ocupado.get())
        {
            return;
        }
        self.abrir_dialogo(
            ronda::DIALOGO_ABANDONAR_TITULO,
            ronda::DIALOGO_ABANDONAR_TEXTO,
            false,
            None,
            ronda::DIALOGO_ABANDONAR_BOTON,
            Box::new(|x, _, _| {
                let Some(r) = x.ronda.borrow().clone() else {
                    return;
                };
                let x = x.clone();
                let respuesta = r.nucleo.pedir(|p| p.abandonar_ronda());
                let _ = slint::spawn_local(async move {
                    match respuesta.await {
                        Ok(()) => {
                            r.navegaciones.borrow_mut().clear();
                            r.pagina.borrow_mut().clear();
                            x.resultado(ronda::ABANDONADA, false);
                        }
                        Err(e) => x.resultado(&e, true),
                    }
                    x.refrescar();
                });
            }),
        );
    }

    // ---------------------------------------------------------------- diálogo (IFZ-024)

    /// Un aviso o una pregunta antes de un paso: la página se aparta mientras está abierto.
    fn abrir_dialogo(
        &self,
        titulo: &str,
        texto_: &str,
        con_campo: bool,
        casilla: Option<&str>,
        aceptar: &str,
        accion: Accion,
    ) {
        let ui = &self.ui;
        ui.set_dialogo_titulo(texto(titulo));
        ui.set_dialogo_texto(texto(texto_));
        ui.set_dialogo_con_campo(con_campo);
        ui.set_dialogo_campo(SharedString::new());
        ui.set_dialogo_casilla_texto(texto(casilla.unwrap_or("")));
        ui.set_dialogo_casilla(false);
        ui.set_dialogo_aceptar_texto(texto(aceptar));
        *self.al_aceptar.borrow_mut() = Some(accion);
        ui.set_capa_abierta(true);
        self.ubicar_ronda();
    }

    /// «Cancelar», el fondo o el cierre tras aceptar: un diálogo cerrado no deja su acción para el siguiente.
    pub fn cerrar_capa(&self) {
        *self.al_aceptar.borrow_mut() = None;
        self.ui.set_capa_abierta(false);
        self.ubicar_ronda();
    }

    pub fn aceptar_dialogo(&self) {
        let accion = self.al_aceptar.borrow_mut().take();
        let campo = self.ui.get_dialogo_campo().to_string();
        let casilla = self.ui.get_dialogo_casilla();
        self.cerrar_capa();
        if let (Some(a), Some(x)) = (accion, self.yo().upgrade()) {
            a(&x, campo, casilla);
        }
    }
}

/// CAP-014: una vuelta cada 1500 ms mientras la Ronda está a la vista (PantallaRonda.Sondear). El estado solo
/// avisa: nunca captura (INV-CAP-002).
async fn sondear(yo: Weak<Interfaz>, r: Rc<Ronda>) {
    let mut estados = HashMap::new();
    loop {
        let Some(x) = yo.upgrade() else { return };
        // Una ronda armada de nuevo trae su propio sondeo.
        if !x.ronda.borrow().as_ref().is_some_and(|v| Rc::ptr_eq(v, &r)) {
            return;
        }
        if x.ui.get_seccion() == "ronda" {
            let vivos: Vec<(String, Rc<Panel>, String)> = r
                .paneles
                .borrow()
                .iter()
                .map(|(id, p)| (id.clone(), p.clone(), x.spec_de(id)))
                .collect();
            drop(x);
            let lista: Vec<(&str, &Panel, &str)> = vivos
                .iter()
                .map(|(id, p, s)| (id.as_str(), &**p, s.as_str()))
                .collect();
            paneles::sondear(&lista, &mut estados).await;
            *r.pagina.borrow_mut() = estados.clone();
            let Some(x) = yo.upgrade() else { return };
            x.refrescar();
        } else {
            drop(x);
        }
        if paneles::dormir(paneles::SONDEO).await.is_err() {
            eprintln!("El reloj de los paneles se detuvo: el sondeo de estado se corta.");
            return;
        }
    }
}

/// La lectura de un panel que no está abierto (PantallaRonda.Leer).
fn sin_panel(id: &str) -> Lectura {
    Lectura {
        id: id.into(),
        generating: Some(false),
        error: Some("el panel no está abierto".into()),
        ..Default::default()
    }
}

/// «1.234»: el separador de miles de la Unity (InvariantCulture con «.»).
fn con_miles(n: usize) -> String {
    let d = n.to_string();
    let mut s = String::new();
    for (i, c) in d.chars().enumerate() {
        if i > 0 && (d.len() - i).is_multiple_of(3) {
            s.push('.');
        }
        s.push(c);
    }
    s
}

/// El resultado de una captura: cuánto trajo cada uno, los que fallaron y el aviso de la Puerta. Es problema
/// si alguno falló o si el aviso empieza con la señal de advertencia (U+26A0).
fn texto_de_captura(filas: &[(String, usize, bool)], aviso: &str) -> (String, bool) {
    let fallidas: Vec<&str> = filas.iter().filter(|f| f.2).map(|f| f.0.as_str()).collect();
    let largos: Vec<String> = filas
        .iter()
        .filter(|f| !fallidas.contains(&f.0.as_str()))
        .map(|f| format!("{} {}", f.0, con_miles(f.1)))
        .collect();
    let mut t = format!(
        "Capturados {} de {}",
        filas.len() - fallidas.len(),
        filas.len()
    );
    if largos.is_empty() {
        t.push('.');
    } else {
        t.push_str(&format!(" ({} caracteres).", largos.join(" · ")));
    }
    if !fallidas.is_empty() {
        t.push_str(&format!(" Con problema: {}.", fallidas.join(", ")));
    }
    if !aviso.is_empty() {
        t.push(' ');
        t.push_str(aviso);
    }
    (t, !fallidas.is_empty() || aviso.starts_with('\u{26A0}'))
}

/// Aparta una página fuera de la ventana con su tamaño (Configuracion.Ocultar).
fn apartar(p: &Panel) -> Result<(), String> {
    let (x, _, ancho, alto) = p.rect_real();
    if x < 0 {
        return Ok(());
    }
    let (ancho, alto) = (
        if ancho > 0 { f64::from(ancho) } else { 1000.0 },
        if alto > 0 { f64::from(alto) } else { 700.0 },
    );
    p.rect(-ancho - 100.0, 0.0, ancho, alto)
}

fn terminado(estado: &str) -> bool {
    estado.starts_with("parece-terminado")
}

/// PantallaRonda.Refrescar: la etapa, el paso, los contadores y las filas, todo de la Puerta.
fn mostrar_ronda(
    ui: &Ventana,
    filas: &VecModel<Fila>,
    r: &Ronda,
    ids: &[String],
    paso: &Paso,
    estados: &[&'static str],
    situacion: &Situacion,
) {
    let estado_de = |id: &str| {
        ids.iter()
            .position(|x| x == id)
            .map_or("por-pegar", |i| estados[i])
    };
    let actual = ronda::ETAPAS
        .iter()
        .position(|e| *e == paso.etapa)
        .unwrap_or(0);
    ui.set_etapa_actual(actual as i32);
    ui.set_etapa_pregunta(paso.etapa == "pregunta");
    ui.set_barra_titulo(texto(&ronda::titulo_de_etapa(paso.etapa)));
    let de_operadores: Vec<&str> = r.operadores.iter().map(|id| estado_de(id)).collect();
    let enviados = de_operadores
        .iter()
        .filter(|e| **e == "respondiendo" || terminado(e) || **e == "capturado")
        .count();
    let terminados = de_operadores.iter().filter(|e| terminado(e)).count();
    let capturados = de_operadores.iter().filter(|e| **e == "capturado").count();
    let del_paso = r.roles.de_la_etapa(paso.etapa);
    let paneles = r.paneles.borrow();
    let rol_listo = !del_paso.is_empty()
        && del_paso.iter().all(|id| {
            paneles.contains_key(*id) && {
                let e = estado_de(id);
                terminado(e) || e == "con-problema"
            }
        });
    let (texto_paso, habilitado) = puerta::texto_del_paso(paso, terminados, rol_listo);
    ui.set_paso_texto(texto(&texto_paso));
    ui.set_paso_habilitado(habilitado);
    ui.set_ocupado(r.ocupado.get());
    ui.set_frase(texto(paso.recordatorio));
    let n = r.operadores.len();
    let investigacion = paso.etapa == "investigacion";
    ui.set_contadores(texto(&if investigacion {
        format!(
            "Enviados {enviados} de {n} · Parecen terminados {terminados} · Capturados {capturados}"
        )
    } else {
        String::new()
    }));
    ui.set_contadores_angosta(texto(&if investigacion {
        format!("{enviados} de {n} enviados · {terminados} terminados")
    } else {
        String::new()
    }));
    let visible = r.visible.borrow().clone();
    for i in 0..filas.row_count() {
        let Some(mut f) = filas.row_data(i) else {
            continue;
        };
        let (icono, palabra) = ronda::icono_y_palabra(estado_de(&f.id));
        if !f.rol {
            f.estado = texto(palabra);
        }
        f.icono = texto(icono);
        f.actual = visible.as_deref() == Some(f.id.as_str());
        filas.set_row_data(i, f);
    }
    if let Some(v) = visible {
        let (icono, palabra) = ronda::icono_y_palabra(estado_de(&v));
        let nombre = nombre_proveedor(&v);
        ui.set_icono_visible(texto(icono));
        // Como los navegadores, el zoom solo se muestra cuando no es el 100 %.
        let zoom = match r.pagina.borrow().get(&v).and_then(|e| e.zoom) {
            Some(z) if z != 100 => format!(" · Zoom {z} %"),
            _ => String::new(),
        };
        ui.set_cabecera_titulo(texto(&format!("{nombre} · {palabra}{zoom}")));
        let en_la_vista = &r.operadores;
        let i = en_la_vista
            .iter()
            .position(|x| *x == v)
            .map_or(0, |i| i + 1);
        ui.set_selector_texto(texto(&format!(
            "{nombre} · {palabra} · {i} de {}",
            en_la_vista.len()
        )));
        ui.set_cabecera_problema(texto(situacion.problema.as_deref().unwrap_or("")));
        ui.set_selector_problema(texto(situacion.corto.unwrap_or("")));
        // «Capturar este panel (Investigación)»: la captura dice en qué fase se registra (ConFase).
        let accion = match situacion.accion {
            Some(puerta::CAPTURAR_ESTE) => format!(
                "{} ({})",
                puerta::CAPTURAR_ESTE,
                ronda::nombre_de_etapa(paso.etapa)
            ),
            Some(a) => a.to_string(),
            None => String::new(),
        };
        ui.set_accion_texto(texto(&accion));
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn el_resumen_de_la_captura_dice_largos_problemas_y_avisos() {
        assert_eq!(con_miles(0), "0");
        assert_eq!(con_miles(999), "999");
        assert_eq!(con_miles(1234), "1.234");
        assert_eq!(con_miles(1234567), "1.234.567");
        let filas = [
            ("ChatGPT".to_string(), 1234, false),
            ("Kimi".to_string(), 60, false),
            ("Grok".to_string(), 0, true),
        ];
        assert_eq!(
            texto_de_captura(&filas, "Prompt de usuario: coincide."),
            (
                "Capturados 2 de 3 (ChatGPT 1.234 · Kimi 60 caracteres). Con problema: Grok. Prompt de usuario: coincide.".to_string(),
                true
            )
        );
        assert_eq!(
            texto_de_captura(&filas[..1], "\u{26A0} difiere"),
            (
                "Capturados 1 de 1 (ChatGPT 1.234 caracteres). \u{26A0} difiere".to_string(),
                true
            )
        );
        assert_eq!(
            texto_de_captura(&filas[2..], ""),
            ("Capturados 0 de 1. Con problema: Grok.".to_string(), true)
        );
        assert!(!texto_de_captura(&filas[..1], "").1);
    }

    fn temporal(nombre: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("cc-{nombre}-{}", crate::nuevo_id()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn sin_menos_datos_se_importan_solo_las_conversaciones_de_la_unity() {
        // ADR-0006 y B5: el origen se lee y nunca se toca; navegador/ no se abre.
        let raiz = temporal("importar");
        let local = raiz.join("AppData").join("Local");
        let unity = raiz
            .join("AppData")
            .join("LocalLow")
            .join("ChatCouncil")
            .join("ChatCouncil-Unity");
        std::fs::create_dir_all(unity.join("conversaciones")).unwrap();
        std::fs::create_dir_all(unity.join("navegador")).unwrap();
        std::fs::write(unity.join("conversaciones").join("a.jsonl"), "{}\n").unwrap();
        std::fs::write(unity.join("navegador").join("Cookies"), "x").unwrap();
        let datos = local.join("ChatCouncil");
        assert_eq!(importar_de_la_unity(&local, &datos).unwrap(), 1);
        assert_eq!(
            std::fs::read_to_string(datos.join("conversaciones").join("a.jsonl")).unwrap(),
            "{}\n"
        );
        assert!(!datos.join("navegador").exists());
        assert!(unity.join("conversaciones").join("a.jsonl").exists());
        assert_eq!(importar_de_la_unity(&local, &datos).unwrap(), 0);
        std::fs::remove_dir_all(&raiz).unwrap();
    }

    #[test]
    fn la_version_avisa_las_specs_de_la_carpeta_de_datos() {
        // ARR-004 e IFZ-016
        let v = env!("CARGO_PKG_VERSION");
        assert_eq!(
            texto_de_version(false),
            format!("ChatCouncil, versión {v}.")
        );
        assert_eq!(
            texto_de_version(true),
            format!(
                "ChatCouncil, versión {v}. Usa el specs.json de la carpeta de datos (pruebas)."
            )
        );
    }

    #[test]
    fn las_licencias_traen_las_fuentes_y_los_crates_enlazados() {
        let t = texto_de_licencias();
        // D26: la introducción y la línea de las fuentes, literales.
        assert!(t.starts_with(
            "ChatCouncil usa estas bibliotecas y fuentes de terceros. Cada una conserva su licencia, que se reproduce abajo.

Fuentes del informe en PDF: Libertinus Serif (SIL Open Font License 1.1) y DejaVu Sans Mono (licencia Bitstream Vera).
"
        ));
        assert!(t.lines().any(|l| l.starts_with("slint v")));
        assert!(t.lines().any(|l| l.starts_with("wry v")));
    }
}
