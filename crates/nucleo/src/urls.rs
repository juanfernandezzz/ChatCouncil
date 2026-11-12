//! Comprobación del estado HTTP de las URL que cita un verificador (VER-009, INV-VER-003), como
//! Puerta.ComprobarUrl de la Unity. El cliente HTTP es un puerto: el núcleo no sale a la red.

use std::net::Ipv6Addr;
use std::time::{Duration, Instant};

/// Puerto HTTP (IHttp de la Unity): pide la URL siguiendo redirecciones y devuelve el código de
/// estado; Err con el motivo si no hubo respuesta dentro de `tiempo`. Sin cookies ni sesión de los
/// paneles (INV-VER-002), y sin leer el cuerpo.
pub trait Http: Sync {
    fn pedir(&self, url: &str, metodo: &str, tiempo: Duration) -> Result<u16, String>;
}

pub const MOTIVO_ESQUEMA: &str = "solo se comprueban direcciones http y https";
pub const MOTIVO_LOCAL: &str = "es una dirección local o de la red privada: no se comprueba";

/// HEAD y, si no da un 2xx o falla, GET, con un solo tiempo para los dos. El código queda None
/// cuando no hubo respuesta, con el motivo en el detalle.
pub fn comprobar_url(
    url: &str,
    http: &dyn Http,
    tiempo: Duration,
) -> (Option<i64>, Option<String>) {
    if let Some(motivo) = motivo_para_no_pedir(url) {
        return (None, Some(motivo.to_string()));
    }
    let inicio = Instant::now();
    let resta = || tiempo.saturating_sub(inicio.elapsed());
    let sin_respuesta = || {
        (
            None,
            Some(format!("sin respuesta en {} s", tiempo.as_secs_f64())),
        )
    };
    match http.pedir(url, "HEAD", tiempo) {
        Ok(c) if (200..=299).contains(&c) => return (Some(i64::from(c)), None),
        // HEAD rechazado: algunos sitios solo contestan GET.
        _ => {}
    }
    if resta().is_zero() {
        return sin_respuesta();
    }
    match http.pedir(url, "GET", resta()) {
        Ok(c) => (Some(i64::from(c)), None),
        Err(_) if resta().is_zero() => sin_respuesta(),
        Err(e) => (None, Some(e)),
    }
}

/// Por qué una URL no se pide, o None. Las escribe el verificador, que es un modelo: nada de lo que
/// escriba llega a esta máquina ni a la red local.
/// shortcut: un nombre público que resuelve a una IP privada (DNS rebinding) o que redirige a una
/// pasa, igual que en la Unity; cerrarlo exige mirar la IP al conectar, en el cliente HTTP.
pub fn motivo_para_no_pedir(url: &str) -> Option<&'static str> {
    let Some(host) = host_http(url) else {
        return Some(MOTIVO_ESQUEMA);
    };
    // Un punto final («localhost.», «127.0.0.1.») nombra lo mismo: la Unity lo dejaba pasar.
    let nombre = host.trim_end_matches('.');
    let local = if let Some(v6) = host.strip_prefix('[') {
        // Con zona («%eth0») o ilegible: no se pide.
        v6.parse::<Ipv6Addr>().map_or(true, es_local_v6)
    } else if let Some(v4) = ipv4(nombre) {
        es_local_v4(v4)
    } else {
        // Un «%» o un control en el host: no se adivina cómo lo leerá el cliente, no se pide.
        nombre.bytes().any(|b| b == b'%' || b <= b' ' || b == 0x7f)
            || !nombre.contains('.')
            || [".localhost", ".local", ".lan", ".internal", ".home.arpa"]
                .iter()
                .any(|s| nombre.ends_with(s))
    };
    local.then_some(MOTIVO_LOCAL)
}

/// El host en minúsculas de una URL absoluta http o https; el de una IPv6 conserva el «[» inicial.
fn host_http(url: &str) -> Option<String> {
    let minus = url.trim().to_ascii_lowercase();
    let resto = minus
        .strip_prefix("http://")
        .or_else(|| minus.strip_prefix("https://"))?;
    let autoridad = resto.split(['/', '?', '#', '\\']).next()?;
    let host = autoridad.rsplit('@').next()?;
    let host = match host.strip_prefix('[') {
        Some(v6) => format!("[{}", v6.split(']').next()?),
        // El puerto fuera.
        None => host.split(':').next()?.to_string(),
    };
    (!host.is_empty() && host != "[").then_some(host)
}

/// Una IPv4 como la lee el sistema al conectar: de una a cuatro partes, cada una decimal, octal
/// (0…) o hexadecimal (0x…); la última llena los bytes que falten («2130706433», «0x7f.1»).
fn ipv4(host: &str) -> Option<[u8; 4]> {
    let partes: Vec<u64> = host
        .split('.')
        .map(|p| {
            if let Some(h) = p.strip_prefix("0x") {
                u64::from_str_radix(h, 16).ok()
            } else if p.len() > 1 && p.starts_with('0') {
                u64::from_str_radix(p, 8).ok()
            } else if !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()) {
                p.parse().ok()
            } else {
                None
            }
        })
        .collect::<Option<_>>()?;
    let (ultima, primeras) = partes.split_last()?;
    if primeras.len() > 3
        || primeras.iter().any(|&p| p > 255)
        || *ultima >= 1 << (8 * (4 - primeras.len()))
    {
        return None;
    }
    let mut n = *ultima;
    for (i, p) in primeras.iter().enumerate() {
        n |= p << (8 * (3 - i));
    }
    Some((n as u32).to_be_bytes())
}

// Bucle local, sin especificar, privadas (RFC 1918 y 4193), de enlace local, la compartida del
// operador (100.64/10), multidifusión y de 240/4 en adelante (reservadas y difusión).
fn es_local_v4(b: [u8; 4]) -> bool {
    b[0] == 0
        || b[0] == 10
        || b[0] == 127
        || b[0] >= 224
        || (b[0] == 172 && (16..=31).contains(&b[1]))
        || (b[0] == 192 && b[1] == 168)
        || (b[0] == 169 && b[1] == 254)
        || (b[0] == 100 && (64..=127).contains(&b[1]))
}

fn es_local_v6(ip: Ipv6Addr) -> bool {
    if let Some(v4) = ip.to_ipv4_mapped() {
        return es_local_v4(v4.octets());
    }
    let g = ip.segments();
    let v4 = |a: u16, b: u16| es_local_v4([(a >> 8) as u8, a as u8, (b >> 8) as u8, b as u8]);
    // Una IPv4 dentro de una IPv6: compatible (::/96, con :: y ::1), NAT64 (64:ff9b::/96) y 6to4.
    if g[..6] == [0; 6] || g[..6] == [0x64, 0xff9b, 0, 0, 0, 0] {
        return v4(g[6], g[7]);
    }
    if g[0] == 0x2002 {
        return v4(g[1], g[2]);
    }
    let s = g[0];
    s & 0xffc0 == 0xfe80 // enlace local
        || s & 0xffc0 == 0xfec0 // de sitio
        || s & 0xff00 == 0xff00 // multidifusión
        || s & 0xfe00 == 0xfc00 // privadas (RFC 4193)
}

#[cfg(test)]
pub(crate) mod pruebas {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// El HttpFalso de la Unity (PuertaPruebas.cs:42).
    #[derive(Default)]
    pub(crate) struct HttpFalso {
        pub pedidos: AtomicUsize,
    }

    impl Http for HttpFalso {
        fn pedir(&self, url: &str, metodo: &str, _: Duration) -> Result<u16, String> {
            self.pedidos.fetch_add(1, Ordering::SeqCst);
            if url.contains("x.invalid") {
                Err("ENOTFOUND".into())
            } else if url.contains("404") {
                Ok(404)
            } else if url.contains("sin-head") {
                Ok(if metodo == "HEAD" { 405 } else { 200 })
            } else {
                Ok(200)
            }
        }
    }

    /// Un puerto que nunca contesta: solo lo corta el tiempo.
    struct HttpMudo;

    impl Http for HttpMudo {
        fn pedir(&self, _: &str, _: &str, tiempo: Duration) -> Result<u16, String> {
            std::thread::sleep(tiempo);
            Err("cancelado".into())
        }
    }

    const DIEZ: Duration = Duration::from_secs(10);

    // VER-009: PuertaPruebas.cs:278 (CadaUrlSeComprueba).
    #[test]
    fn urls_cada_url_se_comprueba() {
        let http = HttpFalso::default();
        let ok = |c: i64| (Some(c), None);
        assert_eq!(comprobar_url("https://a.org", &http, DIEZ), ok(200));
        assert_eq!(comprobar_url("https://b.org/404", &http, DIEZ), ok(404));
        assert_eq!(
            comprobar_url("https://c.org/sin-head", &http, DIEZ),
            ok(200)
        );
        assert_eq!(
            comprobar_url("https://x.invalid/p", &http, DIEZ),
            (None, Some("ENOTFOUND".into()))
        );
    }

    // Caso de falla de PART-009: un tiempo agotado se informa como en la Unity y no cuelga la ronda.
    #[test]
    fn urls_un_tiempo_agotado_se_informa_como_en_la_unity() {
        let inicio = Instant::now();
        assert_eq!(
            comprobar_url("https://lenta.org", &HttpMudo, Duration::from_millis(50)),
            (None, Some("sin respuesta en 0.05 s".into()))
        );
        assert!(
            inicio.elapsed() < Duration::from_secs(2),
            "un solo tiempo para HEAD y GET"
        );
        // Con el tiempo de la app el mensaje dice 10, sin decimales.
        assert_eq!(format!("{} s", DIEZ.as_secs_f64()), "10 s");
    }

    // INV-VER-003: PuertaPruebas.cs:291 (LasUrlsLocalesOConOtroEsquemaNoSePiden).
    #[test]
    fn urls_las_locales_o_con_otro_esquema_no_se_piden() {
        let http = HttpFalso::default();
        for url in [
            "http://localhost:8080/x",
            "http://sub.localhost/",
            "http://127.0.0.1/",
            "http://127.8.9.10/",
            "http://0.0.0.0/",
            "http://10.1.2.3/",
            "http://172.16.0.1/",
            "http://172.31.255.255/",
            "http://192.168.1.1/",
            "http://169.254.169.254/latest/meta-data",
            "http://100.64.0.1/",
            "http://[::1]/",
            "http://[::]/",
            "http://[fe80::1]/",
            "http://[fc00::1]/",
            "http://[fd12:3456::1]/",
            "http://[::ffff:127.0.0.1]/",
            "http://[::ffff:192.168.0.1]/",
            "http://0x7f.0.0.1/",
            "http://2130706433/",
            "http://017700000001/",
            "http://intranet/",
            "http://impresora.local/",
            "HTTP://LOCALHOST/",
            "http://255.255.255.255/",
            "http://224.0.0.1/",
            "http://239.255.255.250:1900/",
            "http://[ff02::1]/",
            "http://nas.lan/",
            "http://router.home.arpa/",
            "http://api.internal/",
            // Más allá de la Unity: formas que nombran lo mismo.
            "http://localhost./",
            "http://127.1/",
            "http://usuario:clave@127.0.0.1/",
            "http://a.org@10.0.0.1/",
            "http://[fe80::1%25eth0]/",
            "http://127.0.0.1\\@a.org/",
            // Revisión PART-009: un punto final, una IPv4 dentro de una IPv6 y un host con «%» o controles.
            "http://127.0.0.1./",
            "http://10.0.0.1../",
            "http://[::127.0.0.1]/",
            "http://[64:ff9b::7f00:1]/",
            "http://[2002:a00:1::]/",
            "http://%31%32%37.0.0.1/",
            "http://127.0.0.1\t/",
        ] {
            assert_eq!(
                comprobar_url(url, &http, DIEZ),
                (None, Some(MOTIVO_LOCAL.into())),
                "{url}"
            );
        }
        for url in [
            "file:///C:/Windows/win.ini",
            "ftp://a.org/x",
            "javascript:alert(1)",
            "data:text/plain,hola",
            "a.org/sin-esquema",
            "",
            "http://",
        ] {
            assert_eq!(
                comprobar_url(url, &http, DIEZ),
                (None, Some(MOTIVO_ESQUEMA.into())),
                "{url}"
            );
        }
        assert_eq!(
            http.pedidos.load(Ordering::SeqCst),
            0,
            "ninguna sale a la red"
        );
        for url in [
            "https://a.org",
            "http://172.32.0.1/",
            "http://11.0.0.1/",
            "http://[2606:4700::1111]/",
            "http://[2002:b00:1::]/",
            "http://11.0.0.1./",
            "HTTPS://A.ORG/x",
        ] {
            assert_eq!(comprobar_url(url, &http, DIEZ), (Some(200), None), "{url}");
        }
    }
}
