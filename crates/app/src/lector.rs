//! PRU-017: lo que ve un lector de pantalla (IFZ-020 a 022) y las teclas reales (D49), para -pruebaronda.
//! La jerarquía se lee por UIA desde otro hilo, como Narrador: el hilo de la interfaz sigue atendiendo.

use windows::Win32::Foundation::HWND;
use windows::Win32::System::Com::{
    CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationInvokePattern,
    IUIAutomationTogglePattern, ToggleState_On, UIA_InvokePatternId, UIA_TogglePatternId,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE, KEYBD_EVENT_FLAGS, KEYBDINPUT, KEYEVENTF_KEYUP,
    MOUSE_EVENT_FLAGS, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEINPUT, SendInput,
    VIRTUAL_KEY,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GUITHREADINFO, GetForegroundWindow, GetGUIThreadInfo, SetCursorPos, SetForegroundWindow,
};

pub const BOTON: i32 = 50000;
pub const CASILLA: i32 = 50002;
pub const DESPLEGABLE: i32 = 50003;
pub const CAMPO: i32 = 50004;
const BARRA_DE_TITULO: i32 = 50037;

/// Un nodo de la jerarquía de la app, con su marco en píxeles de la pantalla.
pub struct Nodo {
    pub elemento: IUIAutomationElement,
    pub nombre: String,
    pub tipo: i32,
    pub ancho: i32,
    pub alto: i32,
    /// El centro, para un clic de verdad.
    pub centro: (i32, i32),
    pub habilitado: bool,
}

pub struct Uia {
    uia: IUIAutomation,
    raiz: IUIAutomationElement,
    ventana: isize,
}

impl Uia {
    /// Los nodos de la app, en orden del documento, sin entrar a otras ventanas nativas: la página del
    /// proveedor es otra ventana y no es parte de la jerarquía de la app (INV-IFZ-005).
    pub fn nodos(&self) -> Result<Vec<Nodo>, String> {
        // SAFETY: llamada COM sobre el IUIAutomation que este hilo creó y que no sale de él.
        let andar = unsafe { self.uia.ControlViewWalker() }.map_err(|e| e.to_string())?;
        let mut v = Vec::new();
        let mut pila = vec![self.raiz.clone()];
        while let Some(e) = pila.pop() {
            let mut hijos = Vec::new();
            // SAFETY: el recorredor y e son objetos COM vivos de este hilo.
            let mut h = unsafe { andar.GetFirstChildElement(&e) }.ok();
            while let Some(x) = h {
                // SAFETY: ídem, con x, el hermano anterior, vivo.
                h = unsafe { andar.GetNextSiblingElement(&x) }.ok();
                hijos.push(x);
            }
            for x in hijos.into_iter().rev() {
                // SAFETY: lectura de una propiedad de x, vivo en este hilo.
                let propia = unsafe { x.CurrentNativeWindowHandle() }
                    .map(|w| w.0 as isize)
                    .unwrap_or(0);
                // La barra de título y sus botones son del sistema, no de la app.
                // SAFETY: ídem.
                let titulo =
                    unsafe { x.CurrentControlType() }.is_ok_and(|t| t.0 == BARRA_DE_TITULO);
                if titulo || (propia != 0 && propia != self.ventana) {
                    continue;
                }
                pila.push(x);
            }
            if e != self.raiz {
                v.push(nodo(e)?);
            }
        }
        Ok(v)
    }

    pub fn activar(&self, e: &IUIAutomationElement) -> Result<(), String> {
        // SAFETY: el patrón es del elemento, vivo en este hilo.
        unsafe {
            let p: IUIAutomationInvokePattern = e
                .GetCurrentPatternAs(UIA_InvokePatternId)
                .map_err(|e| e.to_string())?;
            p.Invoke().map_err(|e| e.to_string())
        }
    }

    pub fn alternar(&self, e: &IUIAutomationElement) -> Result<(), String> {
        // SAFETY: ídem.
        unsafe {
            let p: IUIAutomationTogglePattern = e
                .GetCurrentPatternAs(UIA_TogglePatternId)
                .map_err(|e| e.to_string())?;
            p.Toggle().map_err(|e| e.to_string())
        }
    }

    pub fn marcado(&self, e: &IUIAutomationElement) -> Option<bool> {
        // SAFETY: ídem.
        unsafe {
            let p: IUIAutomationTogglePattern = e.GetCurrentPatternAs(UIA_TogglePatternId).ok()?;
            p.CurrentToggleState().ok().map(|s| s == ToggleState_On)
        }
    }

    /// El nodo que tiene el foco para el lector (el que Narrador lee).
    pub fn enfocado(&self) -> Result<Nodo, String> {
        // SAFETY: llamada COM de este hilo; el elemento que devuelve no sale de él.
        let e = unsafe { self.uia.GetFocusedElement() }.map_err(|e| e.to_string())?;
        nodo(e)
    }

    /// El mismo nodo para UIA: si la jerarquía se rearmó, el elemento de antes ya no es el de ahora.
    pub fn mismo(&self, a: &IUIAutomationElement, b: &IUIAutomationElement) -> bool {
        // SAFETY: ídem.
        unsafe { self.uia.CompareElements(a, b) }.is_ok_and(|r| r.as_bool())
    }
}

fn nodo(e: IUIAutomationElement) -> Result<Nodo, String> {
    // SAFETY: lecturas de un elemento vivo de este hilo.
    unsafe {
        let r = e.CurrentBoundingRectangle().map_err(|x| x.to_string())?;
        Ok(Nodo {
            nombre: e.CurrentName().map(|b| b.to_string()).unwrap_or_default(),
            tipo: e.CurrentControlType().map(|t| t.0).unwrap_or(0),
            ancho: r.right - r.left,
            alto: r.bottom - r.top,
            centro: ((r.left + r.right) / 2, (r.top + r.bottom) / 2),
            habilitado: e.CurrentIsEnabled().is_ok_and(|b| b.as_bool()),
            elemento: e,
        })
    }
}

/// Corre f con UIA en un hilo propio; el resultado se espera sin trabar la interfaz.
pub fn en_hilo<T: Send + 'static>(
    ventana: isize,
    f: impl FnOnce(&Uia) -> Result<T, String> + Send + 'static,
) -> std::thread::JoinHandle<Result<T, String>> {
    std::thread::spawn(move || {
        // SAFETY: COM se inicia en este hilo y los objetos no salen de él.
        unsafe {
            CoInitializeEx(None, COINIT_MULTITHREADED)
                .ok()
                .map_err(|e| e.to_string())?;
            let uia: IUIAutomation = CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)
                .map_err(|e| e.to_string())?;
            let raiz = uia
                .ElementFromHandle(HWND(ventana as *mut _))
                .map_err(|e| e.to_string())?;
            f(&Uia { uia, raiz, ventana })
        }
    })
}

/// El HWND de la ventana de Slint.
pub fn hwnd_de(ventana: &slint::Window) -> Option<isize> {
    use paneles::raw_window_handle::{HasWindowHandle, RawWindowHandle};
    let manija = ventana.window_handle();
    match manija.window_handle().ok()?.as_raw() {
        RawWindowHandle::Win32(w) => Some(w.hwnd.get()),
        _ => None,
    }
}

pub fn al_frente(ventana: isize) -> bool {
    // SAFETY: sin punteros; el HWND es el de la ventana de la app.
    unsafe {
        let _ = SetForegroundWindow(HWND(ventana as *mut _));
        GetForegroundWindow().0 as isize == ventana
    }
}

/// La ventana con el foco del teclado en el hilo de adelante: la de la app o una de la página.
pub fn foco() -> isize {
    let mut g = GUITHREADINFO {
        cbSize: size_of::<GUITHREADINFO>() as u32,
        ..Default::default()
    };
    // SAFETY: g vive durante la llamada y cbSize dice su tamaño.
    match unsafe { GetGUIThreadInfo(0, &mut g) } {
        Ok(()) => g.hwndFocus.0 as isize,
        Err(_) => 0,
    }
}

/// Teclas de verdad, como las pulsa la persona: las primeras quedan apretadas mientras se pulsa la última.
/// Solo si la app sigue al frente: si no, irían a la ventana que la persona tenga adelante.
pub fn teclas(ventana: isize, vks: &[u16]) -> bool {
    let una = |vk: u16, arriba: bool| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(vk),
                dwFlags: if arriba {
                    KEYEVENTF_KEYUP
                } else {
                    KEYBD_EVENT_FLAGS(0)
                },
                ..Default::default()
            },
        },
    };
    let mut v: Vec<INPUT> = vks.iter().map(|&k| una(k, false)).collect();
    v.extend(vks.iter().rev().map(|&k| una(k, true)));
    // SAFETY: sin punteros en GetForegroundWindow; las entradas son locales y del tamaño que se informa.
    unsafe {
        GetForegroundWindow().0 as isize == ventana
            && SendInput(&v, size_of::<INPUT>() as i32) as usize == v.len()
    }
}

/// Espera hasta `ms` un menú emergente de Windows (clase #32768) de este proceso y lo cierra con Escape.
/// Corre en otro hilo: mientras el menú está abierto, el hilo de la interfaz queda en su bucle.
pub fn cerrar_menu_emergente(ventana: isize, ms: u64) -> bool {
    use windows::Win32::UI::WindowsAndMessaging::{
        FindWindowExW, GetWindowThreadProcessId, IsWindowVisible,
    };
    let fin = std::time::Instant::now() + std::time::Duration::from_millis(ms);
    while std::time::Instant::now() < fin {
        // Recorre todos los menús emergentes (#32768): el primero puede ser de otro proceso.
        // SAFETY: la clase es una cadena constante; pid vive durante cada llamada.
        let de_la_app = unsafe {
            let mut h = HWND::default();
            let mut hallado = false;
            while !hallado {
                h = FindWindowExW(None, Some(h), windows::core::w!("#32768"), None)
                    .unwrap_or_default();
                if h.is_invalid() {
                    break;
                }
                let mut pid = 0;
                hallado = IsWindowVisible(h).as_bool()
                    && GetWindowThreadProcessId(h, Some(&mut pid)) != 0
                    && pid == std::process::id();
            }
            hallado
        };
        if de_la_app {
            return teclas(ventana, &[0x1B]);
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    false
}

/// Un clic izquierdo de verdad en ese punto de la pantalla, solo con la app al frente.
pub fn clic(ventana: isize, x: i32, y: i32) -> bool {
    let una = |f: MOUSE_EVENT_FLAGS| INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dwFlags: f,
                ..Default::default()
            },
        },
    };
    let v = [una(MOUSEEVENTF_LEFTDOWN), una(MOUSEEVENTF_LEFTUP)];
    // SAFETY: sin punteros en SetCursorPos; las entradas son locales y del tamaño que se informa.
    unsafe {
        GetForegroundWindow().0 as isize == ventana
            && SetCursorPos(x, y).is_ok()
            && SendInput(&v, size_of::<INPUT>() as i32) == 2
    }
}
