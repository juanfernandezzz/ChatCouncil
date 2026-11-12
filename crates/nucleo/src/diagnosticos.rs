//! Diagnósticos (DIA-002, DIA-003, DIA-005), como PantallaRonda.Diagnosticar de la Unity: lo que el
//! script de página encontró se guarda tal cual en un archivo de la carpeta de datos. Este módulo
//! solo escribe lo que recibe: nunca abre el perfil del navegador ni ningún otro archivo
//! (INV-DIA-001). El script de página (DIA-001) y abrir la carpeta son de los paneles (E7).

use crate::dominio::nombre_proveedor;
use crate::json::{self, Valor};
use crate::puerta::formatear_utc;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

pub const CARPETA: &str = "diagnosticos";
/// DIA-002: lo que se le da al script de página.
pub const ESPERA: Duration = Duration::from_secs(30);
// DIA-003.
pub const ITEM: &str = "Diagnóstico de selectores";
pub const MOTIVO_SIN_PAGINA: &str = "El panel no tiene su página abierta.";

/// DIA-005: la cabecera de un panel cuya página no se pudo abrir.
pub fn pagina_no_abierta(falla: &str) -> String {
    format!("La página no se pudo abrir: {falla} Prueba Más… → Recargar la página.")
}

/// DIA-002: el mensaje cuando el diagnóstico no se pudo hacer o guardar.
pub fn mensaje_de_falla(proveedor: &str, error: &str) -> String {
    format!(
        "No se pudo hacer el diagnóstico de {}: {error}",
        nombre_proveedor(proveedor)
    )
}

/// "yyyy-MM-dd-HHmmss" con la hora local, como DateTime.Now en el nombre del archivo.
pub fn sello(t: SystemTime, desfase_local_s: i64) -> String {
    let local = if desfase_local_s >= 0 {
        t + Duration::from_secs(desfase_local_s as u64)
    } else {
        t - Duration::from_secs(desfase_local_s.unsigned_abs())
    };
    let s = formatear_utc(local);
    format!("{}-{}{}{}", &s[..10], &s[11..13], &s[14..16], &s[17..19])
}

/// DIA-002: `diagnosticos/{proveedor}-{sello}.json`, UTF-8 sin BOM y con sangría, con el
/// proveedor, la versión de la app y el diagnóstico. Devuelve la ruta y el mensaje; Err trae el
/// mensaje de la falla.
pub fn guardar(
    carpeta_datos: &Path,
    proveedor: &str,
    version_app: &str,
    diagnostico: &Valor,
    sello: &str,
) -> Result<(PathBuf, String), String> {
    // El proveedor es parte de la ruta: no puede salir de diagnosticos/ (revisión PART-010).
    if proveedor.is_empty() || proveedor.starts_with('.') || proveedor.contains(['/', '\\', ':']) {
        return Err(mensaje_de_falla(proveedor, "proveedor inválido"));
    }
    let dir = carpeta_datos.join(CARPETA);
    let documento = Valor::Objeto(vec![
        ("proveedor".into(), Valor::Texto(proveedor.into())),
        ("app".into(), Valor::Texto(version_app.into())),
        ("diagnostico".into(), diagnostico.clone()),
    ]);
    let mut bytes = Vec::new();
    con_sangria(&documento, 0, &mut bytes);
    std::fs::create_dir_all(&dir).map_err(|e| mensaje_de_falla(proveedor, &e.to_string()))?;
    // Nunca se pisa uno anterior: con el nombre ocupado en ese segundo, «-2», «-3» y así (D21).
    let mut n = 1;
    let ruta = loop {
        let sufijo = if n == 1 {
            String::new()
        } else {
            format!("-{n}")
        };
        let ruta = dir.join(format!("{proveedor}-{sello}{sufijo}.json"));
        let abierto = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&ruta);
        match abierto.and_then(|mut f| f.write_all(&bytes)) {
            Ok(()) => break ruta,
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => n += 1,
            Err(e) => return Err(mensaje_de_falla(proveedor, &e.to_string())),
        }
    };
    let mensaje = format!(
        "Diagnóstico de {} guardado en {}. Mándalo junto con lo que pasó para que se corrijan los selectores.",
        nombre_proveedor(proveedor),
        ruta.display()
    );
    Ok((ruta, mensaje))
}

/// Formatting.Indented de Newtonsoft: dos espacios y CRLF.
/// shortcut: un real sale como lo escribe Rust, no con el formato «R» de .NET; el script de página
/// solo manda enteros, textos y booleanos. Si llega a mandar reales, igualar el formato.
fn con_sangria(v: &Valor, nivel: usize, s: &mut Vec<u8>) {
    let salto = |s: &mut Vec<u8>, n: usize| {
        s.extend_from_slice(b"\r\n");
        s.resize(s.len() + 2 * n, b' ');
    };
    match v {
        Valor::Nulo => s.extend_from_slice(b"null"),
        Valor::Bool(b) => s.extend_from_slice(if *b { b"true" } else { b"false" }),
        Valor::Entero(n) => s.extend_from_slice(n.to_string().as_bytes()),
        Valor::Real(r) => s.extend_from_slice(format!("{r:?}").as_bytes()),
        Valor::Texto(t) => json::escapar(t, s),
        Valor::Lista(l) if l.is_empty() => s.extend_from_slice(b"[]"),
        Valor::Objeto(o) if o.is_empty() => s.extend_from_slice(b"{}"),
        Valor::Lista(l) => {
            s.push(b'[');
            for (i, x) in l.iter().enumerate() {
                if i > 0 {
                    s.push(b',');
                }
                salto(s, nivel + 1);
                con_sangria(x, nivel + 1, s);
            }
            salto(s, nivel);
            s.push(b']');
        }
        Valor::Objeto(o) => {
            s.push(b'{');
            for (i, (k, x)) in o.iter().enumerate() {
                if i > 0 {
                    s.push(b',');
                }
                salto(s, nivel + 1);
                json::escapar(k, s);
                s.extend_from_slice(b": ");
                con_sangria(x, nivel + 1, s);
            }
            salto(s, nivel);
            s.push(b'}');
        }
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use std::fs;
    use std::time::UNIX_EPOCH;

    fn carpeta(nombre: &str) -> PathBuf {
        let d =
            std::env::temp_dir().join(format!("cc-diagnosticos-{nombre}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    const DIAGNOSTICO: &str = r#"{"composer":{"selector":"div[contenteditable]","cuenta":1},"assistantMessage":{"selector":"]]","cuenta":"invalido"},"iframes":[],"shadowRoots":0,"cuadros":[{"tag":"textarea","visible":true}]}"#;

    // DIA-002: el archivo, su nombre, su contenido y el mensaje.
    #[test]
    fn diagnosticos_el_archivo_queda_en_la_carpeta_de_datos() {
        let d = carpeta("guardar");
        // Las 12:00:05 UTC del 2026-10-06, a -3 h: las 09:00:05 locales.
        let t = UNIX_EPOCH + Duration::from_secs(1_791_288_005);
        assert_eq!(formatear_utc(t), "2026-10-06T12:00:05.000Z");
        let sello = sello(t, -3 * 3600);
        assert_eq!(sello, "2026-10-06-090005");
        let (ruta, mensaje) = guardar(
            &d,
            "chatgpt",
            "0.1.0",
            &json::leer(DIAGNOSTICO).unwrap(),
            &sello,
        )
        .unwrap();
        assert_eq!(
            ruta,
            d.join("diagnosticos")
                .join("chatgpt-2026-10-06-090005.json")
        );
        assert_eq!(
            mensaje,
            format!(
                "Diagnóstico de ChatGPT guardado en {}. Mándalo junto con lo que pasó para que se corrijan los selectores.",
                ruta.display()
            )
        );
        let bytes = fs::read(&ruta).unwrap();
        assert!(!bytes.starts_with(&[0xEF, 0xBB, 0xBF]), "sin BOM");
        assert_eq!(
            String::from_utf8(bytes).unwrap(),
            [
                "{",
                "  \"proveedor\": \"chatgpt\",",
                "  \"app\": \"0.1.0\",",
                "  \"diagnostico\": {",
                "    \"composer\": {",
                "      \"selector\": \"div[contenteditable]\",",
                "      \"cuenta\": 1",
                "    },",
                "    \"assistantMessage\": {",
                "      \"selector\": \"]]\",",
                "      \"cuenta\": \"invalido\"",
                "    },",
                "    \"iframes\": [],",
                "    \"shadowRoots\": 0,",
                "    \"cuadros\": [",
                "      {",
                "        \"tag\": \"textarea\",",
                "        \"visible\": true",
                "      }",
                "    ]",
                "  }",
                "}",
            ]
            .join("\r\n")
        );
        assert_eq!(ESPERA, Duration::from_secs(30));
        let _ = fs::remove_dir_all(&d);
    }

    // DIA-002: si no se puede guardar, el mensaje de la falla.
    #[test]
    fn diagnosticos_una_falla_al_guardar_se_informa() {
        let d = carpeta("falla");
        // Un archivo donde va la carpeta «diagnosticos».
        fs::write(d.join("diagnosticos"), "x").unwrap();
        let e = guardar(&d, "kimi", "0.1.0", &Valor::Nulo, "2026-10-06-090005").unwrap_err();
        assert!(
            e.starts_with("No se pudo hacer el diagnóstico de Kimi: "),
            "{e}"
        );
        assert_eq!(
            mensaje_de_falla("grok", "tiempo agotado"),
            "No se pudo hacer el diagnóstico de Grok: tiempo agotado"
        );
        let _ = fs::remove_dir_all(&d);
    }

    // Revisión PART-010: el proveedor es parte de la ruta y no puede salir de diagnosticos/.
    #[test]
    fn diagnosticos_un_proveedor_que_sale_de_la_carpeta_se_rechaza() {
        let d = carpeta("ruta");
        for malo in ["", "../fuera", r"..\fuera", "a/b", "a:b", ".oculto"] {
            let e = guardar(&d, malo, "0.1.0", &Valor::Nulo, "2026-10-06-090005").unwrap_err();
            assert!(e.ends_with("proveedor inválido"), "{malo}: {e}");
        }
        assert_eq!(fs::read_dir(&d).unwrap().count(), 0, "no se escribió nada");
        let _ = fs::remove_dir_all(&d);
    }

    // D21: dos diagnósticos del mismo proveedor en el mismo segundo no se pisan.
    #[test]
    fn diagnosticos_dos_en_el_mismo_segundo_no_se_pisan() {
        let d = carpeta("mismo-segundo");
        let sello = "2026-10-06-090005";
        let guardar_uno = |n: i64| {
            guardar(&d, "glm", "0.1.0", &Valor::Entero(n), sello)
                .unwrap()
                .0
        };
        let rutas = [guardar_uno(1), guardar_uno(2), guardar_uno(3)];
        let dir = d.join("diagnosticos");
        assert_eq!(
            rutas,
            [
                dir.join("glm-2026-10-06-090005.json"),
                dir.join("glm-2026-10-06-090005-2.json"),
                dir.join("glm-2026-10-06-090005-3.json"),
            ]
        );
        for (ruta, n) in rutas.iter().zip(1..) {
            let texto = fs::read_to_string(ruta).unwrap();
            assert!(texto.contains(&format!("\"diagnostico\": {n}")), "{texto}");
        }
        let _ = fs::remove_dir_all(&d);
    }

    // DIA-003 y DIA-005: los textos del ítem deshabilitado y de la página que no abrió.
    #[test]
    fn diagnosticos_los_textos_del_panel_sin_pagina() {
        assert_eq!(ITEM, "Diagnóstico de selectores");
        assert_eq!(MOTIVO_SIN_PAGINA, "El panel no tiene su página abierta.");
        assert_eq!(
            pagina_no_abierta("ERR_NAME_NOT_RESOLVED."),
            "La página no se pudo abrir: ERR_NAME_NOT_RESOLVED. Prueba Más… → Recargar la página."
        );
    }

    // INV-DIA-001 y caso de falla de PART-010: con un perfil falso al lado, ningún tramo de sus
    // archivos aparece en el diagnóstico ni en el mensaje, y el perfil queda como estaba.
    #[test]
    fn diagnosticos_nada_del_perfil_llega_al_diagnostico() {
        let d = carpeta("perfil");
        let perfil = d.join("navegador").join("Default");
        fs::create_dir_all(&perfil).unwrap();
        // Bytes que no salen de ningún otro lado: 256 valores revueltos, dos veces.
        let cookies: Vec<u8> = (0..512u32).map(|i| (i * 167 + 13) as u8).collect();
        let estado =
            b"{\"os_crypt\":{\"encrypted_key\":\"clave-falsa-de-prueba-ZXCVBNM\"}}".to_vec();
        fs::write(perfil.join("Cookies"), &cookies).unwrap();
        fs::write(d.join("navegador").join("Local State"), &estado).unwrap();

        // En Windows el archivo queda abierto sin compartir: quien intente leerlo, falla.
        #[cfg(windows)]
        let _cerrojo = {
            use std::os::windows::fs::OpenOptionsExt;
            fs::OpenOptions::new()
                .read(true)
                .share_mode(0)
                .open(perfil.join("Cookies"))
                .unwrap()
        };

        let (ruta, mensaje) = guardar(
            &d,
            "claude",
            "0.1.0",
            &json::leer(DIAGNOSTICO).unwrap(),
            "2026-10-06-090005",
        )
        .unwrap();

        let mut salida = fs::read(&ruta).unwrap();
        salida.extend_from_slice(mensaje.as_bytes());
        for (nombre, secreto) in [("Cookies", &cookies), ("Local State", &estado)] {
            for tramo in secreto.windows(8) {
                assert!(
                    !salida.windows(8).any(|v| v == tramo),
                    "un tramo de {nombre} llegó a la salida"
                );
            }
        }
        // Lo único nuevo en la carpeta de datos es el diagnóstico.
        let nombres = |p: &Path| {
            let mut v: Vec<String> = fs::read_dir(p)
                .unwrap()
                .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
                .collect();
            v.sort();
            v
        };
        assert_eq!(nombres(&d), ["diagnosticos", "navegador"]);
        assert_eq!(
            nombres(&d.join("diagnosticos")),
            ["claude-2026-10-06-090005.json"]
        );
        assert_eq!(nombres(&perfil), ["Cookies"]);
        #[cfg(windows)]
        drop(_cerrojo);
        assert_eq!(fs::read(perfil.join("Cookies")).unwrap(), cookies);
        let _ = fs::remove_dir_all(&d);
    }
}
