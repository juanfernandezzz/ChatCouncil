//! El puerto HTTP del núcleo con ureq y rustls (VER-009), como HttpSinCookies de la Unity
//! (unity/Assets/Interfaz/Adaptadores.cs:19-33): pide el estado siguiendo redirecciones, sin cookies
//! ni sesión de los paneles (INV-VER-002), sin encabezados propios y sin leer el cuerpo.

use nucleo::urls::Http;
use std::time::Duration;
use ureq::config::AutoHeaderValue;

pub struct HttpSinCookies {
    agente: ureq::Agent,
    proxy: ProxyDelSistema,
}

/// El proxy del sistema de Windows (Internet Settings: ProxyEnable, ProxyServer y ProxyOverride), el
/// que usa el HttpClient de la Unity (D21).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ProxyDelSistema {
    pub activo: bool,
    pub servidor: String,
    pub excepciones: String,
}

/// El proxy para una URL, como «http://host:puerto», o None si va directo.
pub fn proxy_para(proxy: &ProxyDelSistema, url: &str) -> Option<String> {
    if !proxy.activo {
        return None;
    }
    let (esquema, resto) = url.split_once("://")?;
    let autoridad = resto.split(['/', '?', '#']).next()?;
    let host = autoridad.rsplit('@').next()?;
    // «[::1]:80» o «host:80»: el nombre sin el puerto.
    let host = match host.strip_prefix('[') {
        Some(v6) => v6.split(']').next()?,
        None => host.split(':').next()?,
    }
    .to_ascii_lowercase();
    let exceptuado = proxy.excepciones.split(';').map(str::trim).any(|e| {
        if e.eq_ignore_ascii_case("<local>") {
            !host.contains('.')
        } else {
            !e.is_empty() && comodin(&e.to_ascii_lowercase(), &host)
        }
    });
    if exceptuado {
        return None;
    }
    // «host:puerto» vale para todo; «http=...;https=...», para su esquema.
    let servidor = proxy
        .servidor
        .split(';')
        .map(str::trim)
        .find_map(|s| match s.split_once('=') {
            None => Some(s),
            Some((e, v)) => e.eq_ignore_ascii_case(esquema).then_some(v),
        })
        .filter(|s| !s.is_empty())?;
    Some(if servidor.contains("://") {
        servidor.into()
    } else {
        format!("http://{servidor}")
    })
}

/// Una excepción de ProxyOverride: texto con «*» por cualquier tramo.
fn comodin(patron: &str, texto: &str) -> bool {
    match patron.split_once('*') {
        None => patron == texto,
        Some((antes, despues)) => texto.strip_prefix(antes).is_some_and(|r| {
            (0..=r.len())
                .filter(|i| r.is_char_boundary(*i))
                .any(|i| comodin(despues, &r[i..]))
        }),
    }
}

/// Lee Internet Settings del usuario. Solo lectura; si un valor falta o no se puede leer, sin proxy.
/// shortcut: la autoconfiguración (AutoConfigURL, PAC) no se porta; con ella el pedido va directo.
/// Portarla si Juan usa una red que la exija.
#[cfg(windows)]
pub fn proxy_del_sistema() -> ProxyDelSistema {
    use std::ffi::c_void;
    #[link(name = "advapi32")]
    unsafe extern "system" {
        fn RegGetValueW(
            clave: isize,
            subclave: *const u16,
            valor: *const u16,
            tipos: u32,
            tipo: *mut u32,
            datos: *mut c_void,
            largo: *mut u32,
        ) -> i32;
    }
    const HKEY_CURRENT_USER: isize = 0x8000_0001_u32 as i32 as isize;
    const RRF_RT_REG_SZ: u32 = 0x2;
    const RRF_RT_REG_DWORD: u32 = 0x10;
    let ancho = |s: &str| -> Vec<u16> { s.encode_utf16().chain([0]).collect() };
    let subclave = ancho(r"Software\Microsoft\Windows\CurrentVersion\Internet Settings");
    // Devuelve cuántos u16 se escribieron; None si el valor falta, es de otro tipo o no entra.
    let leer = |nombre: &str, tipos: u32, datos: &mut [u16]| -> Option<usize> {
        let nombre = ancho(nombre);
        let mut largo = (datos.len() * 2) as u32;
        // SAFETY: los punteros apuntan a memoria válida durante la llamada y «largo» trae el
        // tamaño en bytes de «datos»; la función no escribe más que eso.
        let r = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                subclave.as_ptr(),
                nombre.as_ptr(),
                tipos,
                std::ptr::null_mut(),
                datos.as_mut_ptr().cast(),
                &mut largo,
            )
        };
        (r == 0).then_some(largo as usize / 2)
    };
    // shortcut: un valor de más de 4096 caracteres se toma como vacío.
    let texto = |nombre: &str| {
        let mut datos = [0u16; 4096];
        leer(nombre, RRF_RT_REG_SZ, &mut datos)
            .map(|n| {
                String::from_utf16_lossy(&datos[..n])
                    .trim_end_matches('\0')
                    .to_string()
            })
            .unwrap_or_default()
    };
    let mut activo = [0u16; 2];
    ProxyDelSistema {
        activo: leer("ProxyEnable", RRF_RT_REG_DWORD, &mut activo).is_some() && activo != [0, 0],
        servidor: texto("ProxyServer"),
        excepciones: texto("ProxyOverride"),
    }
}

/// Fuera de Windows: sin proxy. Cada plataforma tiene el suyo; se porta al sumarla.
#[cfg(not(windows))]
pub fn proxy_del_sistema() -> ProxyDelSistema {
    ProxyDelSistema::default()
}

impl HttpSinCookies {
    pub fn nuevo() -> Self {
        Self::con_proxy(proxy_del_sistema())
    }

    /// Con la configuración de proxy dada: las pruebas la inyectan y no leen el registro real.
    pub fn con_proxy(proxy: ProxyDelSistema) -> Self {
        let config = ureq::Agent::config_builder()
            // Un 404 es un resultado, no un error: lo que se pide es el código.
            .http_status_as_error(false)
            // Los 50 saltos del HttpClient de .NET; al agotarlos queda el último 3xx, como allá.
            .max_redirects(50)
            .max_redirects_will_error(false)
            // El HttpClient de la Unity no manda User-Agent, Accept ni Accept-Encoding.
            .user_agent(AutoHeaderValue::None)
            .accept(AutoHeaderValue::None)
            .accept_encoding(AutoHeaderValue::None)
            // Sin esto ureq toma HTTP_PROXY, HTTPS_PROXY y ALL_PROXY del entorno.
            .proxy(None)
            .build();
        // ureq se compila sin «cookies»: no hay frasco de cookies que guardar ni que mandar.
        Self {
            agente: config.into(),
            proxy,
        }
    }
}

impl Default for HttpSinCookies {
    fn default() -> Self {
        Self::nuevo()
    }
}

impl Http for HttpSinCookies {
    fn pedir(&self, url: &str, metodo: &str, tiempo: Duration) -> Result<u16, String> {
        let pedido = if metodo == "HEAD" {
            self.agente.head(url)
        } else {
            self.agente.get(url)
        };
        // El cuerpo no se lee: la respuesta se suelta en cuanto llegan los encabezados.
        // shortcut: el proxy se elige por la URL pedida; una redirección a otro esquema o a una
        // excepción sigue por el mismo. Elegirlo por salto si aparece un proxy por esquema real.
        // Un proxy mal escrito es un error: el pedido no sale directo (revisión cierre E6).
        let proxy = proxy_para(&self.proxy, url)
            .map(|p| ureq::Proxy::new(&p).map_err(|e| format!("proxy inválido: {e}")))
            .transpose()?;
        pedido
            .config()
            .timeout_global(Some(tiempo))
            .proxy(proxy)
            .build()
            .call()
            .map(|r| r.status().as_u16())
            .map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use std::io::{BufRead, BufReader, Write};
    use std::net::{TcpListener, TcpStream};
    use std::sync::{Arc, Mutex};
    use std::time::Instant;

    /// Un pedido como lo vio el servidor: método, ruta y nombres de encabezados en minúsculas.
    type Vistos = Arc<Mutex<Vec<(String, String, Vec<String>)>>>;

    /// Un servidor en 127.0.0.1 que levanta la propia prueba: ninguna sale a internet.
    fn servidor() -> (String, Vistos) {
        let escucha = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", escucha.local_addr().unwrap());
        let vistos: Vistos = Arc::default();
        let v = vistos.clone();
        std::thread::spawn(move || {
            for conexion in escucha.incoming().flatten() {
                let v = v.clone();
                std::thread::spawn(move || atender(conexion, &v));
            }
        });
        (base, vistos)
    }

    fn atender(mut conexion: TcpStream, vistos: &Vistos) {
        let mut lector = BufReader::new(conexion.try_clone().unwrap());
        atender_pedido(&mut lector, &mut conexion, vistos);
    }

    fn atender_pedido(
        lector: &mut BufReader<TcpStream>,
        conexion: &mut TcpStream,
        vistos: &Vistos,
    ) {
        let mut linea = String::new();
        if lector.read_line(&mut linea).unwrap_or(0) == 0 {
            return;
        }
        let mut partes = linea.split_whitespace();
        let (metodo, ruta) = (
            partes.next().unwrap_or("").to_string(),
            partes.next().unwrap_or("").to_string(),
        );
        let mut encabezados = Vec::new();
        loop {
            let mut l = String::new();
            if lector.read_line(&mut l).unwrap_or(0) == 0 || l.trim().is_empty() {
                break;
            }
            encabezados.push(l.split(':').next().unwrap().to_ascii_lowercase());
        }
        vistos
            .lock()
            .unwrap()
            .push((metodo.clone(), ruta.clone(), encabezados));
        // Como proxy: abre el túnel y atiende lo que venga por él.
        if metodo == "CONNECT" {
            let _ = conexion.write_all(
                b"HTTP/1.1 200 Connection established

",
            );
            return atender_pedido(lector, conexion, vistos);
        }
        let respuesta = match (ruta.as_str(), metodo.as_str()) {
            ("/404", _) => "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n",
            ("/sin-head", "HEAD") => "HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\n",
            ("/redirige", _) => {
                "HTTP/1.1 301 Moved Permanently\r\nLocation: /200\r\nContent-Length: 0\r\n"
            }
            ("/bucle", _) => "HTTP/1.1 302 Found\r\nLocation: /bucle\r\nContent-Length: 0\r\n",
            ("/pone-cookie", _) => {
                "HTTP/1.1 200 OK\r\nSet-Cookie: sesion=de-prueba; Path=/\r\nContent-Length: 0\r\n"
            }
            // Promete un cuerpo enorme y nunca lo manda: quien lo lea se queda esperando.
            ("/cuerpo", "GET") => "HTTP/1.1 200 OK\r\nContent-Length: 100000000\r\n",
            ("/lenta", _) => {
                std::thread::sleep(Duration::from_secs(5));
                return;
            }
            _ => "HTTP/1.1 200 OK\r\nContent-Length: 0\r\n",
        };
        let _ = conexion.write_all(format!("{respuesta}Connection: close\r\n\r\n").as_bytes());
        if ruta == "/cuerpo" {
            std::thread::sleep(Duration::from_secs(5));
        }
    }

    const TIEMPO: Duration = Duration::from_secs(10);

    fn sin_proxy() -> HttpSinCookies {
        HttpSinCookies::con_proxy(ProxyDelSistema::default())
    }

    fn proxy(servidor: &str, excepciones: &str) -> ProxyDelSistema {
        ProxyDelSistema {
            activo: true,
            servidor: servidor.into(),
            excepciones: excepciones.into(),
        }
    }

    // D21: qué proxy le toca a cada URL según Internet Settings.
    #[test]
    fn proxy_el_del_sistema_se_elige_por_esquema_y_con_excepciones() {
        let url = "https://ejemplo.com/a?b=1";
        // Sin proxy: desactivado o sin servidor.
        assert_eq!(proxy_para(&ProxyDelSistema::default(), url), None);
        let apagado = ProxyDelSistema {
            activo: false,
            ..proxy("p:8080", "")
        };
        assert_eq!(proxy_para(&apagado, url), None);
        assert_eq!(proxy_para(&proxy("", ""), url), None);
        // Simple: el mismo para todo.
        let simple = Some("http://p.local:8080".to_string());
        assert_eq!(proxy_para(&proxy("p.local:8080", ""), url), simple);
        assert_eq!(
            proxy_para(&proxy("p.local:8080", ""), "http://ejemplo.com"),
            simple
        );
        // Por esquema; uno sin entrada va directo.
        let por = proxy("http=a:80;https=b:443;socks=c:1080", "");
        assert_eq!(proxy_para(&por, url), Some("http://b:443".into()));
        assert_eq!(
            proxy_para(&por, "HTTP://ejemplo.com/"),
            Some("http://a:80".into())
        );
        assert_eq!(proxy_para(&proxy("http=a:80", ""), url), None);
        // Excepciones: nombres, comodines y <local> (un nombre sin punto).
        let con = proxy("p:8080", "*.interno.cl; Ejemplo.com ;10.*;<local>");
        assert_eq!(proxy_para(&con, url), None);
        assert_eq!(proxy_para(&con, "http://a.b.interno.cl:8443/x"), None);
        assert_eq!(proxy_para(&con, "http://usuario@10.1.2.3/"), None);
        assert_eq!(proxy_para(&con, "http://intranet/"), None);
        assert_eq!(
            proxy_para(&con, "http://otro.com/"),
            Some("http://p:8080".into())
        );
        assert_eq!(
            proxy_para(&con, "http://interno.cl.otro.com/"),
            Some("http://p:8080".into())
        );
    }

    // D21: con el proxy del sistema el pedido sale por él; una excepción va directo.
    #[test]
    fn proxy_el_pedido_pasa_por_el_proxy_del_sistema() {
        let (base, vistos) = servidor();
        let servidor_proxy = base.trim_start_matches("http://");
        let http = HttpSinCookies::con_proxy(proxy(servidor_proxy, "127.0.0.1"));
        assert_eq!(
            http.pedir("http://ejemplo.invalid/por-proxy", "GET", TIEMPO),
            Ok(200)
        );
        assert_eq!(http.pedir(&format!("{base}/404"), "GET", TIEMPO), Ok(404));
        let pedidos: Vec<String> = vistos
            .lock()
            .unwrap()
            .iter()
            .map(|v| format!("{} {}", v.0, v.1))
            .collect();
        assert_eq!(
            pedidos,
            ["CONNECT ejemplo.invalid:80", "GET /por-proxy", "GET /404"]
        );
    }

    // Revisión cierre E6: un proxy del sistema mal escrito es un error; el pedido no sale directo.
    #[test]
    fn proxy_uno_invalido_no_se_salta() {
        let (base, vistos) = servidor();
        let http = HttpSinCookies::con_proxy(proxy("proxy corp:8080", ""));
        let e = http
            .pedir(&format!("{base}/404"), "GET", TIEMPO)
            .unwrap_err();
        assert!(e.starts_with("proxy inválido: "), "{e}");
        assert!(vistos.lock().unwrap().is_empty());
    }

    // Lee el registro real, sin cambiarlo: se corre a mano y solo muestra números.
    #[test]
    #[ignore]
    fn proxy_del_sistema_se_lee_sin_fallar() {
        let p = proxy_del_sistema();
        println!(
            "activo: {}; servidor: {} caracteres; excepciones: {} caracteres",
            p.activo,
            p.servidor.len(),
            p.excepciones.len()
        );
    }

    // D21: HTTP_PROXY, HTTPS_PROXY y ALL_PROXY del proceso ya no se usan.
    #[test]
    fn proxy_las_variables_de_entorno_no_se_usan() {
        let (base, vistos) = servidor();
        for nombre in ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"] {
            // SAFETY: solo cambia el entorno de este proceso de prueba; ningún otro hilo lo lee
            // una vez hecho el cambio de D21.
            unsafe { std::env::set_var(nombre, &base) };
        }
        let r = sin_proxy().pedir("http://ejemplo.invalid/directo", "GET", TIEMPO);
        assert!(r.is_err(), "{r:?}");
        assert!(vistos.lock().unwrap().is_empty(), "el pedido fue al proxy");
    }

    // VER-009: el estado de 200 y 404; HEAD y GET llegan como tales; el 301 se sigue.
    #[test]
    fn http_pide_el_estado_y_sigue_las_redirecciones() {
        let (base, vistos) = servidor();
        let http = sin_proxy();
        assert_eq!(http.pedir(&format!("{base}/200"), "HEAD", TIEMPO), Ok(200));
        assert_eq!(http.pedir(&format!("{base}/404"), "GET", TIEMPO), Ok(404));
        assert_eq!(
            http.pedir(&format!("{base}/sin-head"), "HEAD", TIEMPO),
            Ok(405)
        );
        assert_eq!(
            http.pedir(&format!("{base}/sin-head"), "GET", TIEMPO),
            Ok(200)
        );
        assert_eq!(
            http.pedir(&format!("{base}/redirige"), "HEAD", TIEMPO),
            Ok(200)
        );
        let pedidos: Vec<(String, String)> = vistos
            .lock()
            .unwrap()
            .iter()
            .map(|(m, r, _)| (m.clone(), r.clone()))
            .collect();
        let par = |m: &str, r: &str| (m.to_string(), r.to_string());
        assert_eq!(
            pedidos,
            [
                par("HEAD", "/200"),
                par("GET", "/404"),
                par("HEAD", "/sin-head"),
                par("GET", "/sin-head"),
                par("HEAD", "/redirige"),
                par("HEAD", "/200"),
            ]
        );
    }

    // Una cadena de redirecciones sin fin termina sola, con el último 3xx, como el HttpClient de .NET.
    #[test]
    fn http_un_bucle_de_redirecciones_termina_con_el_ultimo_3xx() {
        let (base, vistos) = servidor();
        let http = sin_proxy();
        assert_eq!(http.pedir(&format!("{base}/bucle"), "GET", TIEMPO), Ok(302));
        assert_eq!(vistos.lock().unwrap().len(), 51, "el pedido y 50 saltos");
    }

    // INV-VER-002: ningún pedido lleva cookies, credenciales ni encabezados propios, ni siquiera
    // después de que el servidor mandó una cookie.
    #[test]
    fn http_ningun_pedido_lleva_cookies_ni_credenciales() {
        let (base, vistos) = servidor();
        let http = sin_proxy();
        assert_eq!(
            http.pedir(&format!("{base}/pone-cookie"), "GET", TIEMPO),
            Ok(200)
        );
        assert_eq!(http.pedir(&format!("{base}/200"), "HEAD", TIEMPO), Ok(200));
        assert_eq!(http.pedir(&format!("{base}/200"), "GET", TIEMPO), Ok(200));
        for (metodo, ruta, encabezados) in vistos.lock().unwrap().iter() {
            assert_eq!(encabezados, &["host"], "{metodo} {ruta}");
        }
    }

    // Caso de falla de PART-009: un servidor que no contesta corta en el tiempo dado, sin colgar.
    #[test]
    fn http_un_servidor_que_no_contesta_corta_en_el_tiempo_dado() {
        let (base, _) = servidor();
        let inicio = Instant::now();
        let r = sin_proxy().pedir(&format!("{base}/lenta"), "HEAD", Duration::from_millis(300));
        assert!(r.is_err(), "{r:?}");
        assert!(
            inicio.elapsed() < Duration::from_secs(3),
            "{:?}",
            inicio.elapsed()
        );
    }

    // VER-009: el cuerpo no se lee; un GET vuelve con los encabezados aunque el cuerpo no llegue.
    #[test]
    fn http_el_cuerpo_no_se_lee() {
        let (base, _) = servidor();
        let inicio = Instant::now();
        assert_eq!(
            sin_proxy().pedir(&format!("{base}/cuerpo"), "GET", TIEMPO),
            Ok(200)
        );
        assert!(
            inicio.elapsed() < Duration::from_secs(3),
            "{:?}",
            inicio.elapsed()
        );
    }

    // El puerto con el núcleo: una dirección local nunca llega al cliente (INV-VER-003), y el tiempo
    // agotado se informa como en la Unity.
    #[test]
    fn http_con_el_nucleo_lo_local_no_se_pide() {
        let (base, vistos) = servidor();
        assert_eq!(
            nucleo::urls::comprobar_url(&format!("{base}/200"), &sin_proxy(), TIEMPO),
            (None, Some(nucleo::urls::MOTIVO_LOCAL.to_string()))
        );
        assert!(vistos.lock().unwrap().is_empty());
    }
}
