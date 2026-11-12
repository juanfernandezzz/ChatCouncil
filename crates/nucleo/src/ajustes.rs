//! Ajustes y preferencias (AJU-001 a AJU-010), como Configuracion.cs y Aplicacion.Apariencia de la
//! Unity: el consejo, la apariencia y los textos de la sección. Todo vive en archivos de la carpeta
//! de datos, fuera del registro (INV-AJU-001). Dibujar y navegar es de la interfaz (E7).

use crate::json::{self, Valor};
use crate::ronda::{self, RolesElegidos};
use std::io;
use std::path::Path;

// AJU-001: las cuatro listas de roles, en orden.
pub const ETIQUETAS_DE_ROL: [&str; 4] = [
    "Integrador: lee la tabla de hallazgos y escribe el informe",
    "Verificador 1: revisa las fuentes con búsqueda web",
    "Verificador 2: revisa las mismas fuentes por separado, para comparar",
    "Redactor: escribe la respuesta final; puede ser el integrador",
];

// AJU-002 y AJU-003.
pub const GUARDADO_PRIMER_ARRANQUE: &str = "Guardado.";
pub const GUARDADO: &str = "Guardado. Se aplica la próxima vez que abras ChatCouncil.";
pub const AVISO_REABRIR: &str = "Los cambios se aplican la próxima vez que abras ChatCouncil.";

// AJU-004.
pub const BIENVENIDA: &str = "Antes de la primera ronda, elige tu consejo y entra a tu cuenta en cada proveedor. Después puedes cambiarlo en Ajustes.";
pub const IR_A_LA_RONDA: &str = "Ir a la ronda";
pub const TITULO: &str = "Ajustes";

// AJU-005.
pub const TEXTO_CUENTAS: &str = "Entra a tu cuenta en la página de cada proveedor. ChatCouncil no ve tu contraseña: sabe que la sesión está abierta porque la página muestra dónde escribir.";
pub const ENTRAR: &str = "Entrar";

// AJU-009.
pub const COPIAR_LA_RUTA: &str = "Copiar la ruta";
pub const RUTA_COPIADA: &str = "Ruta copiada";
pub const ABRIR_LA_CARPETA: &str = "Abrir la carpeta";

/// AJU-004: el rótulo del paso de la guía; 0 es Ajustes, con todo a la vista.
pub fn paso_guia(paso: u8) -> &'static str {
    match paso {
        1 => "Paso 1 de 2: tu consejo",
        2 => "Paso 2 de 2: tus cuentas",
        _ => "",
    }
}

/// AJU-002 y AJU-004: tras guardar, el mensaje y el paso que sigue (2 en el primer arranque).
pub fn tras_guardar(primer_arranque: bool) -> (&'static str, u8) {
    if primer_arranque {
        (GUARDADO_PRIMER_ARRANQUE, 2)
    } else {
        (GUARDADO, 0)
    }
}

/// AJU-002 e INV-AJU-002: valida y escribe `seleccion-proveedores.json` (UTF-8 sin BOM). Con un
/// error de validación no se escribe nada.
pub fn guardar_seleccion(
    carpeta_datos: &Path,
    conocidos: &[&str],
    marcados: &[&str],
    roles: &RolesElegidos,
    guardado_en: &str,
) -> Result<(), String> {
    let contenido = ronda::guardar(conocidos, marcados, roles, guardado_en)?;
    std::fs::create_dir_all(carpeta_datos)
        .and_then(|()| std::fs::write(carpeta_datos.join(ronda::ARCHIVO_SELECCION), contenido))
        .map_err(|e| format!("No se pudo guardar en la carpeta de datos: {e}"))
}

/// AJU-009 y AJU-010: qué se guarda y cómo copiarlo, según el aparato.
pub fn textos_de_datos(android: bool) -> (&'static str, &'static str) {
    if android {
        (
            "Las rondas, los informes y estos ajustes se guardan solo en este teléfono, en esta carpeta. Las sesiones de tus cuentas quedan dentro de la app.",
            "Para hacer una copia, conecta el teléfono a una computadora por USB y copia la carpeta entera.",
        )
    } else {
        (
            "Las rondas, los informes, estos ajustes y las sesiones de tus cuentas se guardan solo en este aparato, en esta carpeta:",
            "Para hacer una copia, cierra ChatCouncil y copia la carpeta entera a otro disco. Lleva las sesiones de tus cuentas: guárdala donde nadie más pueda abrirla.",
        )
    }
}

/// AJU-010: en Android no hay «Abrir la carpeta».
pub fn se_puede_abrir_la_carpeta(android: bool) -> bool {
    !android
}

// ---------------------------------------------------------------- apariencia (AJU-006 a AJU-008)

pub const ARCHIVO_APARIENCIA: &str = "apariencia.json";
pub const TEMAS: [&str; 3] = ["sistema", "claro", "oscuro"];
pub const NOMBRES_TEMA: [&str; 3] = ["El del sistema", "Claro", "Oscuro"];
/// 0 es el del sistema; el resto, porcentajes. 200 % es el tope de WCAG 1.4.4.
pub const TAMANOS: [i64; 5] = [0, 100, 125, 150, 200];
pub const ETIQUETA_TEMA: &str = "Tema";
pub const ETIQUETA_TAMANO: &str = "Tamaño del texto y de los controles";

pub fn nombre_tamano(tamano: i64) -> String {
    if tamano == 0 {
        NOMBRES_TEMA[0].into()
    } else {
        format!("{tamano} %")
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Apariencia {
    pub tema: &'static str,
    pub texto: i64,
}

impl Default for Apariencia {
    fn default() -> Self {
        Apariencia {
            tema: TEMAS[0],
            texto: TAMANOS[0],
        }
    }
}

/// AJU-007: sin archivo, ilegible o con un valor de otro tipo, las del sistema; nunca un error.
pub fn leer_apariencia(contenido: Option<&str>) -> Apariencia {
    let Some(Valor::Objeto(o)) = contenido.and_then(json::leer) else {
        return Apariencia::default();
    };
    let campo = |n: &str| {
        o.iter()
            .find(|(k, _)| k.como_str() == Some(n))
            .map(|x| &x.1)
    };
    let tema = match campo("tema") {
        // Una lista o un objeto donde va el tema: el archivo entero no vale, como en la Unity.
        Some(Valor::Lista(_) | Valor::Objeto(_)) => return Apariencia::default(),
        Some(Valor::Texto(t)) => TEMAS.iter().find(|x| t.como_str() == Some(x)),
        _ => None,
    };
    let texto = match campo("texto") {
        Some(Valor::Entero(n)) if TAMANOS.contains(n) => *n,
        _ => TAMANOS[0],
    };
    Apariencia {
        tema: tema.copied().unwrap_or(TEMAS[0]),
        texto,
    }
}

/// AJU-006: `apariencia.json`, en una línea como la Unity. Se aplica al elegir, sin Guardar; si no
/// se puede escribir, la interfaz la aplica igual y la próxima vez vuelve la anterior.
pub fn guardar_apariencia(carpeta_datos: &Path, a: Apariencia) -> io::Result<()> {
    std::fs::write(
        carpeta_datos.join(ARCHIVO_APARIENCIA),
        format!("{{\"tema\":\"{}\",\"texto\":{}}}", a.tema, a.texto),
    )
}

/// AJU-006 y AJU-008: oscuro si se eligió, o si se sigue al sistema y el sistema lo está.
pub fn es_oscuro(tema: &str, sistema_oscuro: bool) -> bool {
    tema == "oscuro" || tema == "sistema" && sistema_oscuro
}

/// AJU-008: Windows está en oscuro si `AppsUseLightTheme` vale 0; sin el valor, claro.
pub fn windows_en_oscuro(apps_use_light_theme: Option<u32>) -> bool {
    apps_use_light_theme == Some(0)
}

/// AJU-006 y AJU-008: todo crece junto; el del sistema sigue su escala de fuente, entre 1 y 2.
pub fn escala(texto: i64, escala_del_sistema: f32) -> f32 {
    if texto == 0 {
        escala_del_sistema.clamp(1.0, 2.0)
    } else {
        texto as f32 / 100.0
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::operacion::CONOCIDOS;
    use std::fs;
    use std::path::PathBuf;

    fn carpeta(nombre: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("cc-ajustes-{nombre}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    const AHORA: &str = "2026-10-06T12:00:00.000Z";

    // AJU-001: sin archivo, los diez marcados y los roles por defecto; las cuatro listas de roles.
    #[test]
    fn ajustes_sin_archivo_estan_los_diez_y_los_roles_por_defecto() {
        assert_eq!(CONOCIDOS.len(), 10);
        // None es «se cargan todos» (RON-005).
        assert_eq!(ronda::leer_seleccion(None, &CONOCIDOS), None);
        assert_eq!(
            ronda::leer_roles(None, &CONOCIDOS),
            RolesElegidos::new("deepseek", "glm", "qwen", "deepseek")
        );
        assert_eq!(ETIQUETAS_DE_ROL.len(), 4);
        assert!(ETIQUETAS_DE_ROL[0].starts_with("Integrador: "));
        assert!(ETIQUETAS_DE_ROL[3].ends_with("puede ser el integrador"));
    }

    // AJU-002, AJU-003 y AJU-005: se escribe sin BOM con el formato de la Unity; lo guardado es lo
    // que se lee al reabrir, y las cuentas son solo los proveedores marcados.
    #[test]
    fn ajustes_la_seleccion_se_guarda_y_se_aplica_al_reabrir() {
        let d = carpeta("guardar");
        let marcados: Vec<&str> = CONOCIDOS.iter().copied().filter(|c| *c != "kimi").collect();
        let roles = RolesElegidos::new("claude", "glm", "qwen", "claude");
        // La carpeta de datos se crea si falta.
        let datos = d.join("datos");
        assert_eq!(
            guardar_seleccion(&datos, &CONOCIDOS, &marcados, &roles, AHORA),
            Ok(())
        );
        let bytes = fs::read(datos.join(ronda::ARCHIVO_SELECCION)).unwrap();
        assert!(!bytes.starts_with(&[0xEF, 0xBB, 0xBF]), "sin BOM");
        let contenido = String::from_utf8(bytes).unwrap();
        assert_eq!(
            contenido,
            ronda::guardar(&CONOCIDOS, &marcados, &roles, AHORA).unwrap()
        );
        assert!(contenido.contains("\"guardadoEn\": \"2026-10-06T12:00:00.000Z\""));
        // Al reabrir: el consejo y los roles guardados; Kimi no está entre las cuentas.
        let leidos = ronda::leer_seleccion(Some(&contenido), &CONOCIDOS).unwrap();
        assert_eq!(leidos, marcados);
        assert!(!leidos.iter().any(|c| c == "kimi"));
        assert_eq!(ronda::leer_roles(Some(&contenido), &CONOCIDOS), roles);
        assert_eq!(tras_guardar(true), ("Guardado.", 2));
        assert_eq!(
            tras_guardar(false),
            (
                "Guardado. Se aplica la próxima vez que abras ChatCouncil.",
                0
            )
        );
        let _ = fs::remove_dir_all(&d);
    }

    // INV-AJU-002: una selección inválida nunca se escribe; AJU-002: una carpeta que no se puede
    // escribir se informa.
    #[test]
    fn ajustes_una_seleccion_invalida_nunca_se_escribe() {
        let d = carpeta("invalida");
        let iguales = RolesElegidos::new("deepseek", "glm", "glm", "deepseek");
        assert_eq!(
            guardar_seleccion(&d, &CONOCIDOS, &CONOCIDOS, &iguales, AHORA),
            Err(ronda::ERROR_VERIFICADORES_IGUALES.to_string())
        );
        assert_eq!(
            guardar_seleccion(&d, &CONOCIDOS, &[], &RolesElegidos::por_defecto(), AHORA),
            Err(ronda::ERROR_SELECCION_VACIA.to_string())
        );
        assert_eq!(fs::read_dir(&d).unwrap().count(), 0, "no se escribió nada");
        // Un archivo donde va la carpeta de datos.
        fs::write(d.join("ocupada"), "x").unwrap();
        let e = guardar_seleccion(
            &d.join("ocupada"),
            &CONOCIDOS,
            &CONOCIDOS,
            &RolesElegidos::por_defecto(),
            AHORA,
        )
        .unwrap_err();
        assert!(
            e.starts_with("No se pudo guardar en la carpeta de datos: "),
            "{e}"
        );
        let _ = fs::remove_dir_all(&d);
    }

    // AJU-004: los textos de la guía de dos pasos.
    #[test]
    fn ajustes_la_guia_tiene_dos_pasos() {
        assert_eq!(paso_guia(1), "Paso 1 de 2: tu consejo");
        assert_eq!(paso_guia(2), "Paso 2 de 2: tus cuentas");
        assert_eq!(paso_guia(0), "");
        assert!(BIENVENIDA.starts_with("Antes de la primera ronda, elige tu consejo"));
        assert_eq!((IR_A_LA_RONDA, TITULO), ("Ir a la ronda", "Ajustes"));
        assert!(TEXTO_CUENTAS.contains("ChatCouncil no ve tu contraseña"));
    }

    // AJU-006: las opciones, y lo elegido se conserva al reabrir.
    #[test]
    fn ajustes_la_apariencia_se_guarda_al_elegir_y_se_conserva() {
        assert_eq!(NOMBRES_TEMA, ["El del sistema", "Claro", "Oscuro"]);
        assert_eq!(
            TAMANOS.map(nombre_tamano),
            ["El del sistema", "100 %", "125 %", "150 %", "200 %"]
        );
        let d = carpeta("apariencia");
        let elegida = Apariencia {
            tema: "oscuro",
            texto: 150,
        };
        guardar_apariencia(&d, elegida).unwrap();
        let contenido = fs::read_to_string(d.join(ARCHIVO_APARIENCIA)).unwrap();
        assert_eq!(contenido, r#"{"tema":"oscuro","texto":150}"#);
        assert_eq!(leer_apariencia(Some(&contenido)), elegida);
        assert!(es_oscuro(elegida.tema, false));
        assert_eq!(escala(elegida.texto, 1.0), 1.5);
        let _ = fs::remove_dir_all(&d);
    }

    // AJU-007: una apariencia ilegible nunca impide arrancar.
    #[test]
    fn ajustes_una_apariencia_ilegible_da_las_del_sistema() {
        let sistema = Apariencia::default();
        assert_eq!((sistema.tema, sistema.texto), ("sistema", 0));
        for contenido in [
            None,
            Some("x"),
            Some(""),
            Some("[]"),
            Some("null"),
            Some(r#"{"tema":["oscuro"],"texto":150}"#),
            Some(r#"{"tema":{},"texto":150}"#),
            Some(r#"{"tema":"violeta","texto":"150"}"#),
            Some(r#"{"tema":5,"texto":110}"#),
            Some(r#"{"tema":null,"texto":1.5}"#),
        ] {
            assert_eq!(leer_apariencia(contenido), sistema, "{contenido:?}");
        }
        // Cada valor se salva por separado, como en la Unity.
        assert_eq!(
            leer_apariencia(Some(r#"{"tema":"claro","texto":"grande"}"#)),
            Apariencia {
                tema: "claro",
                texto: 0
            }
        );
        assert_eq!(
            leer_apariencia(Some(r#"{"tema":7,"texto":200}"#)),
            Apariencia {
                tema: "sistema",
                texto: 200
            }
        );
    }

    // AJU-008: el tema y el tamaño del sistema.
    #[test]
    fn ajustes_el_del_sistema_sigue_al_sistema() {
        assert!(windows_en_oscuro(Some(0)));
        assert!(!windows_en_oscuro(Some(1)));
        assert!(!windows_en_oscuro(None), "sin el valor, claro");
        assert!(es_oscuro("sistema", true));
        assert!(!es_oscuro("sistema", false));
        assert!(!es_oscuro("claro", true));
        assert!(es_oscuro("oscuro", false));
        assert_eq!(escala(0, 0.85), 1.0);
        assert_eq!(escala(0, 1.3), 1.3);
        assert_eq!(escala(0, 3.0), 2.0);
        assert_eq!(escala(200, 1.3), 2.0);
    }

    // AJU-009 y AJU-010: los textos de «Tus datos» en cada aparato.
    #[test]
    fn ajustes_tus_datos_dice_lo_de_cada_aparato() {
        let (que, como) = textos_de_datos(false);
        assert!(que.ends_with("se guardan solo en este aparato, en esta carpeta:"));
        assert!(como.ends_with("guárdala donde nadie más pueda abrirla."));
        assert!(se_puede_abrir_la_carpeta(false));
        let (que, como) = textos_de_datos(true);
        assert!(que.ends_with("Las sesiones de tus cuentas quedan dentro de la app."));
        assert!(como.starts_with("Para hacer una copia, conecta el teléfono"));
        assert!(!se_puede_abrir_la_carpeta(true));
        assert_eq!(
            (COPIAR_LA_RUTA, RUTA_COPIADA, ABRIR_LA_CARPETA),
            ("Copiar la ruta", "Ruta copiada", "Abrir la carpeta")
        );
    }

    // INV-AJU-001: la selección y la apariencia nunca van al registro.
    #[test]
    fn ajustes_nada_va_al_registro() {
        let d = carpeta("registro");
        let registros = [d.join("a.jsonl"), d.join("conversaciones").join("b.jsonl")];
        fs::create_dir_all(d.join("conversaciones")).unwrap();
        for r in &registros {
            fs::write(r, "{\"tipo\":\"ronda\"}\n").unwrap();
        }
        let jsonl = |d: &Path| {
            let mut v: Vec<(PathBuf, u64)> = Vec::new();
            let mut pendientes = vec![d.to_path_buf()];
            while let Some(c) = pendientes.pop() {
                for e in fs::read_dir(c).unwrap().flatten() {
                    let m = e.metadata().unwrap();
                    if m.is_dir() {
                        pendientes.push(e.path());
                    } else if e.path().extension().is_some_and(|x| x == "jsonl") {
                        v.push((e.path(), m.len()));
                    }
                }
            }
            v.sort();
            v
        };
        let antes = jsonl(&d);
        assert_eq!(antes.len(), 2);
        guardar_seleccion(
            &d,
            &CONOCIDOS,
            &CONOCIDOS,
            &RolesElegidos::por_defecto(),
            AHORA,
        )
        .unwrap();
        guardar_apariencia(
            &d,
            Apariencia {
                tema: "claro",
                texto: 125,
            },
        )
        .unwrap();
        assert_eq!(jsonl(&d), antes, "ningún .jsonl cambió ni apareció");
        let _ = fs::remove_dir_all(&d);
    }
}
