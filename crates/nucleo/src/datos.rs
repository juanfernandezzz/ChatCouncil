//! Datos idénticos a ChatCouncil-Unity, incrustados en el binario (openspec/specs/datos: DAT-001 y DAT-002).

/// packages/providers/src/specs.json, tal cual.
pub const SPECS_JSON: &str = include_str!("../../../datos/specs.json");
/// packages/analysis/src/prompt-*.ts, tal cual: de ahí salen los literales de los prompts.
pub const PROMPT_OPERACION: &str = include_str!("../../../datos/prompts/prompt-operacion.ts");
pub const PROMPT_INTEGRADOR: &str = include_str!("../../../datos/prompts/prompt-integrador.ts");
pub const PROMPT_VERIFICADOR: &str = include_str!("../../../datos/prompts/prompt-verificador.ts");
pub const PROMPT_REDACTOR: &str = include_str!("../../../datos/prompts/prompt-redactor.ts");

/// El literal `const NOMBRE = `…`;` de un archivo de prompt, sin tocar un carácter.
/// Devuelve None si no está o si el literal trae `\` o `${`, porque entonces su valor en JS no sería el texto crudo.
pub fn plantilla(fuente: &'static str, nombre: &str) -> Option<&'static str> {
    let marca = format!("\nconst {nombre} = `");
    let inicio = fuente.find(&marca)? + marca.len();
    let largo = fuente[inicio..].find('`')?;
    let texto = &fuente[inicio..inicio + largo];
    (!texto.contains('\\') && !texto.contains("${")).then_some(texto)
}

/// ARR-004: un specs.json de la carpeta de datos que sea un objeto JSON reemplaza al compilado
/// (Aplicacion.cs:70-81); si falta, no se lee o no es JSON, None.
pub fn specs_en_uso(carpeta_datos: &std::path::Path) -> Option<String> {
    let texto = std::fs::read_to_string(carpeta_datos.join("specs.json")).ok()?;
    // File.ReadAllText de la Unity quita la marca de orden de bytes.
    let texto = texto
        .strip_prefix('\u{feff}')
        .map(str::to_string)
        .unwrap_or(texto);
    matches!(
        crate::json::leer(&texto),
        Some(crate::json::Valor::Objeto(_))
    )
    .then_some(texto)
}

fn specs_de(specs: &str) -> Vec<(crate::texto::Texto, crate::json::Valor)> {
    use crate::json::Valor;
    let Some(Valor::Objeto(o)) = crate::json::leer(specs) else {
        return Vec::new();
    };
    o.into_iter()
        .find(|(k, _)| k.como_str() == Some("specs"))
        .and_then(|(_, v)| match v {
            Valor::Objeto(s) => Some(s),
            _ => None,
        })
        .unwrap_or_default()
}

fn spec(specs: &str, id: &str) -> Option<crate::json::Valor> {
    specs_de(specs)
        .into_iter()
        .find(|(k, _)| k.como_str() == Some(id))
        .map(|(_, v)| v)
}

/// Los proveedores salen de las specs, en el orden del pool (Roles.Conocidos); los que no son de
/// los diez van al final, en el orden del archivo.
pub fn ids_de_specs(specs: &str) -> Vec<String> {
    use crate::operacion::CONOCIDOS;
    let ids: Vec<String> = specs_de(specs)
        .iter()
        .filter_map(|(k, _)| k.como_str().map(str::to_string))
        .collect();
    let mut v: Vec<String> = CONOCIDOS
        .iter()
        .filter(|c| ids.iter().any(|i| i == *c))
        .map(|c| c.to_string())
        .collect();
    v.extend(ids.into_iter().filter(|i| !CONOCIDOS.contains(&i.as_str())));
    v
}

/// PART-030: una spec con `"enLaRonda": false` es solo un panel (Muse): no entra en la selección, los roles
/// ni el pool de la ronda.
fn en_la_ronda(specs: &str, id: &str) -> bool {
    use crate::json::Valor;
    !matches!(spec(specs, id), Some(Valor::Objeto(o))
        if o.iter().any(|(k, v)| k.como_str() == Some("enLaRonda") && *v == Valor::Bool(false)))
}

/// Los proveedores que pueden estar en una ronda: los de las specs menos los que son solo panel.
pub fn ids_de_la_ronda(specs: &str) -> Vec<String> {
    let mut v = ids_de_specs(specs);
    v.retain(|id| en_la_ronda(specs, id));
    v
}

/// Los que son solo panel, en el orden de las specs.
pub fn ids_solo_panel(specs: &str) -> Vec<String> {
    let mut v = ids_de_specs(specs);
    v.retain(|id| !en_la_ronda(specs, id));
    v
}

/// La spec de un proveedor, tal cual, en JSON compacto.
pub fn spec_de(specs: &str, id: &str) -> Option<String> {
    let mut b = Vec::new();
    crate::json::escribir(&spec(specs, id)?, &mut b);
    String::from_utf8(b).ok()
}

/// La página de conversación nueva del proveedor (newConversationUrl).
pub fn url_de(specs: &str, id: &str) -> Option<String> {
    match spec(specs, id)? {
        crate::json::Valor::Objeto(o) => o.into_iter().find_map(|(k, v)| match v {
            crate::json::Valor::Texto(t) if k.como_str() == Some("newConversationUrl") => {
                t.como_str().map(str::to_string)
            }
            _ => None,
        }),
        _ => None,
    }
}

/// PART-022, R17: cuántos bytes de archivo adjunto lee el proveedor, si se midió (limiteArchivoBytes).
pub fn limite_archivo_bytes(specs: &str, id: &str) -> Option<usize> {
    match spec(specs, id)? {
        crate::json::Valor::Objeto(o) => o.into_iter().find_map(|(k, v)| match v {
            crate::json::Valor::Entero(n) if k.como_str() == Some("limiteArchivoBytes") => {
                usize::try_from(n).ok()
            }
            _ => None,
        }),
        _ => None,
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn el_limite_de_archivo_solo_lo_tiene_deepseek() {
        assert_eq!(limite_archivo_bytes(SPECS_JSON, "deepseek"), Some(90000));
        assert_eq!(limite_archivo_bytes(SPECS_JSON, "kimi"), None);
        assert_eq!(limite_archivo_bytes(SPECS_JSON, "no-existe"), None);
    }

    #[test]
    fn los_proveedores_salen_de_las_specs_en_el_orden_del_pool() {
        // Muse es el proveedor 11, solo panel (PART-030): sale de las specs pero no entra en la ronda.
        let mut todos = crate::operacion::CONOCIDOS.map(String::from).to_vec();
        todos.push("muse".into());
        assert_eq!(ids_de_specs(SPECS_JSON), todos);
        assert_eq!(ids_de_la_ronda(SPECS_JSON), crate::operacion::CONOCIDOS);
        assert_eq!(ids_solo_panel(SPECS_JSON), ["muse"]);
        let otra = r#"{"specs":{"nuevo":{},"glm":{},"chatgpt":{}}}"#;
        assert_eq!(ids_de_specs(otra), ["chatgpt", "glm", "nuevo"]);
        assert!(ids_de_specs("no").is_empty());
    }

    #[test]
    fn la_spec_y_la_url_de_un_proveedor_salen_de_las_specs() {
        let s = r#"{"specs":{"x":{"newConversationUrl":"https://x.test/","a":1}}}"#;
        assert_eq!(
            spec_de(s, "x").as_deref(),
            Some(r#"{"newConversationUrl":"https://x.test/","a":1}"#)
        );
        assert_eq!(url_de(s, "x").as_deref(), Some("https://x.test/"));
        assert_eq!(spec_de(s, "y"), None);
    }

    #[test]
    fn un_specs_json_valido_en_la_carpeta_reemplaza_al_compilado() {
        // ARR-004 (Aplicacion.cs:70-81).
        let d = std::env::temp_dir().join(format!("cc-specs-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        assert_eq!(specs_en_uso(&d), None);
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("specs.json"), "{no es json").unwrap();
        assert_eq!(specs_en_uso(&d), None);
        std::fs::write(d.join("specs.json"), "[1]").unwrap();
        assert_eq!(specs_en_uso(&d), None);
        std::fs::write(d.join("specs.json"), r#"{"specs":{}}"#).unwrap();
        assert_eq!(specs_en_uso(&d).as_deref(), Some(r#"{"specs":{}}"#));
        std::fs::remove_dir_all(&d).unwrap();
    }
    use serde::de::IgnoredAny;
    use serde_json::Value;
    use sha2::{Digest, Sha256};
    use std::fs;

    const VECTORES: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../tests/vectores");

    fn sha256(texto: &str) -> String {
        Sha256::digest(texto.as_bytes())
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect()
    }

    fn vector(nombre: &str) -> String {
        fs::read_to_string(format!("{VECTORES}/{nombre}.json")).unwrap()
    }

    #[test]
    fn specs_json_coincide_con_dat_001() {
        assert_eq!(
            sha256(SPECS_JSON),
            "f5b40cdc06d3aca0fa8e09606afd2829374c67ff53379fbc89f9cc3d2bb5a791"
        );
    }

    #[test]
    fn prompts_coinciden_con_dat_002() {
        for (fuente, esperado) in [
            (
                PROMPT_OPERACION,
                "df13bb9edd20164f080734d2f04f8d422461be63bc3200e7ed6e36b6761f8ed9",
            ),
            (
                PROMPT_INTEGRADOR,
                "dc9afcae3f7f2327273fce5c50a7485362f72534ce224e3020749f6c981365a4",
            ),
            (
                PROMPT_VERIFICADOR,
                "615d7b3c527af5d83cdc1cfaffbd6eff98f24ac9427a7a19c0e777fc117a6618",
            ),
            (
                PROMPT_REDACTOR,
                "7475126cc2d653a2a203b466bd2c171bcc5447e5b1ecc7cfc2727302863a843d",
            ),
        ] {
            assert_eq!(sha256(fuente), esperado);
        }
    }

    /// PART-022, R33: el bloque de categorías es el mismo en las dos plantillas de operación.
    #[test]
    fn plantillas_de_operacion_comparten_el_bloque_de_categorias() {
        let bloque = |nombre: &str| {
            let t = plantilla(PROMPT_OPERACION, nombre)
                .expect(nombre)
                .to_string();
            let ini = t.find("LAS CINCO CATEGORIAS").expect("inicio");
            let fin = "Registrar una limitacion es tan valido como registrar un hallazgo.";
            let f = t.find(fin).expect("fin") + fin.len();
            t[ini..f].to_string()
        };
        assert_eq!(bloque("PLANTILLA"), bloque("PLANTILLA_CON_ARCHIVO"));
    }

    #[test]
    fn plantillas_se_leen_tal_cual() {
        for (fuente, nombre, inicio) in [
            (PROMPT_OPERACION, "PLANTILLA", "Vas a leer {{N}} respuestas"),
            (
                PROMPT_OPERACION,
                "PLANTILLA_CON_ARCHIVO",
                "Vas a leer {{N}} respuestas",
            ),
            (PROMPT_INTEGRADOR, "PLANTILLA", "Vas a leer una tabla"),
            (PROMPT_VERIFICADOR, "PLANTILLA", "Un grupo de sistemas"),
            (PROMPT_REDACTOR, "PLANTILLA", "Vas a escribir la respuesta"),
        ] {
            let texto = plantilla(fuente, nombre).expect(nombre);
            assert!(texto.starts_with(inicio), "{nombre}");
            assert!(texto.contains("{{PREGUNTA}}"), "{nombre}");
        }
        assert_eq!(plantilla(PROMPT_OPERACION, "NO_EXISTE"), None);
    }

    #[test]
    fn vectores_se_leen_y_cuentan() {
        let fuente: Value = serde_json::from_str(&vector("_fuente")).unwrap();
        assert_eq!(
            fuente["sha256"],
            "a0efb0939f967627a88c6694458e73e3737a5df5a61b707d65d25b842bcc2e5b"
        );
        let casos = fuente["casos"].as_object().unwrap();
        assert_eq!(casos.len(), 86);
        let mut total = 0;
        for (nombre, esperados) in casos {
            let texto = vector(nombre);
            // IgnoredAny cuenta sin decodificar: algunos casos traen surrogates solos (\ud800) que String no admite.
            let leidos = if texto.starts_with('[') {
                serde_json::from_str::<Vec<IgnoredAny>>(&texto)
                    .unwrap()
                    .len()
            } else {
                serde_json::from_str::<IgnoredAny>(&texto).unwrap();
                1
            };
            assert_eq!(Some(leidos as u64), esperados.as_u64(), "{nombre}");
            total += leidos;
        }
        assert_eq!(total, 679);
        let semillas: Vec<String> = serde_json::from_str(&vector("Semillas")).unwrap();
        assert_eq!(semillas[3], "ñandú");
        let hashes: Vec<u32> = serde_json::from_str(&vector("HashSemillas")).unwrap();
        assert_eq!(hashes[0], 2166136261);
    }
}
