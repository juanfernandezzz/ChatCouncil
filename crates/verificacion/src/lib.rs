//! El puerto HTTP del núcleo con ureq y rustls (VER-009), como HttpSinCookies de la Unity
//! (unity/Assets/Interfaz/Adaptadores.cs:19-33): pide el estado siguiendo redirecciones, sin cookies
//! ni sesión de los paneles (INV-VER-002), sin encabezados propios y sin leer el cuerpo.

use nucleo::urls::Http;
use std::time::Duration;
use ureq::config::AutoHeaderValue;

pub struct HttpSinCookies {
    agente: ureq::Agent,
}

impl HttpSinCookies {
    pub fn nuevo() -> Self {
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
            .build();
        // ureq se compila sin «cookies»: no hay frasco de cookies que guardar ni que mandar.
        Self {
            agente: config.into(),
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
        pedido
            .config()
            .timeout_global(Some(tiempo))
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

    // VER-009: el estado de 200 y 404; HEAD y GET llegan como tales; el 301 se sigue.
    #[test]
    fn http_pide_el_estado_y_sigue_las_redirecciones() {
        let (base, vistos) = servidor();
        let http = HttpSinCookies::nuevo();
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
        let http = HttpSinCookies::nuevo();
        assert_eq!(http.pedir(&format!("{base}/bucle"), "GET", TIEMPO), Ok(302));
        assert_eq!(vistos.lock().unwrap().len(), 51, "el pedido y 50 saltos");
    }

    // INV-VER-002: ningún pedido lleva cookies, credenciales ni encabezados propios, ni siquiera
    // después de que el servidor mandó una cookie.
    #[test]
    fn http_ningun_pedido_lleva_cookies_ni_credenciales() {
        let (base, vistos) = servidor();
        let http = HttpSinCookies::nuevo();
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
        let r = HttpSinCookies::nuevo().pedir(
            &format!("{base}/lenta"),
            "HEAD",
            Duration::from_millis(300),
        );
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
            HttpSinCookies::nuevo().pedir(&format!("{base}/cuerpo"), "GET", TIEMPO),
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
            nucleo::urls::comprobar_url(&format!("{base}/200"), &HttpSinCookies::nuevo(), TIEMPO),
            (None, Some(nucleo::urls::MOTIVO_LOCAL.to_string()))
        );
        assert!(vistos.lock().unwrap().is_empty());
    }
}
