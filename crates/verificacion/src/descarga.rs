//! ARR-008 y ARR-009: version.txt y el instalador del Release, con el mismo agente que las URLs de los
//! verificadores (proxy del sistema, sin cookies), como el HttpClient de Actualizador.cs.

use crate::{HttpSinCookies, proxy_para};
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use std::time::Duration;

impl HttpSinCookies {
    /// GET que solo da el cuerpo de un 2xx; cualquier otra cosa es un error con su motivo.
    fn pedir_cuerpo(
        &self,
        url: &str,
        tiempo: Duration,
    ) -> Result<ureq::http::Response<ureq::Body>, String> {
        let proxy = proxy_para(&self.proxy, url)
            .map(|p| ureq::Proxy::new(&p).map_err(|e| format!("proxy inválido: {e}")))
            .transpose()?;
        let r = self
            .agente
            .get(url)
            .config()
            .timeout_global(Some(tiempo))
            .proxy(proxy)
            .build()
            .call()
            .map_err(|e| e.to_string())?;
        if r.status().is_success() {
            Ok(r)
        } else {
            Err(format!("HTTP {}", r.status().as_u16()))
        }
    }

    /// ARR-008: el texto de un archivo del Release. Sin red, sin Release o con una respuesta rota da
    /// None: no se le avisa a nadie.
    pub fn texto(&self, url: &str, tiempo: Duration) -> Option<String> {
        self.pedir_cuerpo(url, tiempo)
            .ok()?
            .into_body()
            .read_to_string()
            .ok()
    }

    /// ARR-009: baja el archivo a `destino` avisando `(leído, total)`; el total es 0 si el servidor no
    /// lo dijo. Una descarga que queda corta es un error.
    pub fn descargar(
        &self,
        url: &str,
        destino: &Path,
        tiempo: Duration,
        mut avance: impl FnMut(u64, u64),
    ) -> Result<(), String> {
        let r = self.pedir_cuerpo(url, tiempo)?;
        let total = r.body().content_length().unwrap_or(0);
        let mut origen = r.into_body().into_reader();
        let mut archivo = File::create(destino).map_err(|e| e.to_string())?;
        let mut bloque = vec![0u8; 81920];
        let mut leido = 0u64;
        loop {
            let n = origen.read(&mut bloque).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            archivo.write_all(&bloque[..n]).map_err(|e| e.to_string())?;
            leido += n as u64;
            avance(leido, total);
        }
        if total > 0 && leido != total {
            return Err("descarga incompleta".into());
        }
        Ok(())
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use std::io::{BufRead, BufReader};
    use std::net::TcpListener;

    /// Un servidor en 127.0.0.1 que contesta con lo dado a cada pedido; ninguna prueba sale a internet.
    fn servidor(respuesta: &'static [u8]) -> String {
        let escucha = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", escucha.local_addr().unwrap());
        std::thread::spawn(move || {
            for mut c in escucha.incoming().flatten() {
                let mut lector = BufReader::new(c.try_clone().unwrap());
                let mut linea = String::new();
                while lector.read_line(&mut linea).is_ok_and(|n| n > 2) {
                    linea.clear();
                }
                let _ = c.write_all(respuesta);
            }
        });
        base
    }

    fn http() -> HttpSinCookies {
        HttpSinCookies::con_proxy(crate::ProxyDelSistema::default())
    }

    fn carpeta(nombre: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("cc-descarga-{nombre}-{}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    const SEG: Duration = Duration::from_secs(5);

    #[test]
    fn texto_trae_el_cuerpo_de_un_200() {
        let base =
            servidor(b"HTTP/1.1 200 OK\r\nContent-Length: 6\r\nConnection: close\r\n\r\n0.2.7\n");
        assert_eq!(
            http().texto(&format!("{base}/version.txt"), SEG).as_deref(),
            Some("0.2.7\n")
        );
    }

    // ARR-008: sin Release (404) o sin red no se muestra nada.
    #[test]
    fn texto_sin_release_o_sin_red_da_none() {
        let base =
            servidor(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        assert_eq!(http().texto(&format!("{base}/version.txt"), SEG), None);
        // Un puerto donde nadie escucha.
        let libre = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/version.txt", libre.local_addr().unwrap());
        drop(libre);
        assert_eq!(http().texto(&url, SEG), None);
    }

    #[test]
    fn descargar_avisa_el_avance_y_deja_el_archivo() {
        let base = servidor(
            b"HTTP/1.1 200 OK\r\nContent-Length: 10\r\nConnection: close\r\n\r\n0123456789",
        );
        let d = carpeta("ok");
        let destino = d.join("instalador.exe");
        let mut vistos = Vec::new();
        http()
            .descargar(&format!("{base}/i.exe"), &destino, SEG, |l, t| {
                vistos.push((l, t))
            })
            .unwrap();
        assert_eq!(std::fs::read(&destino).unwrap(), b"0123456789");
        assert_eq!(vistos.last(), Some(&(10, 10)));
        let _ = std::fs::remove_dir_all(&d);
    }

    // ARR-009: una descarga que queda corta es un error, no un instalador a medias.
    #[test]
    fn descargar_incompleta_es_un_error() {
        let base =
            servidor(b"HTTP/1.1 200 OK\r\nContent-Length: 10\r\nConnection: close\r\n\r\n01234");
        let d = carpeta("corta");
        let r = http().descargar(&format!("{base}/i.exe"), &d.join("i.exe"), SEG, |_, _| {});
        assert!(r.is_err(), "{r:?}");
        let _ = std::fs::remove_dir_all(&d);
    }
}
