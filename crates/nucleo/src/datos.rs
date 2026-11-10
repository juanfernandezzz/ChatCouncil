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

#[cfg(test)]
mod pruebas {
    use super::*;
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
            "23f6142a766d2052bcb7b5ce9bed7ed6b84e1687e9605181e500aa5a442829ba"
        );
    }

    #[test]
    fn prompts_coinciden_con_dat_002() {
        for (fuente, esperado) in [
            (
                PROMPT_OPERACION,
                "d633e7551b6d3ff0f0f04efd02e18225a82f907114bc70585faf22c0670b9302",
            ),
            (
                PROMPT_INTEGRADOR,
                "838ba7b42d0a317f6d2a8de00da9a02d665da8afb978c14ae5e81c4021708e23",
            ),
            (
                PROMPT_VERIFICADOR,
                "615d7b3c527af5d83cdc1cfaffbd6eff98f24ac9427a7a19c0e777fc117a6618",
            ),
            (
                PROMPT_REDACTOR,
                "c3963ba140cbf07e9419658130071b908bd3b4856aa51b238258a370ac7bb8fb",
            ),
        ] {
            assert_eq!(sha256(fuente), esperado);
        }
    }

    #[test]
    fn plantillas_se_leen_tal_cual() {
        for (fuente, nombre, inicio) in [
            (PROMPT_OPERACION, "PLANTILLA", "Vas a leer seis respuestas"),
            (
                PROMPT_OPERACION,
                "PLANTILLA_CON_ARCHIVO",
                "Vas a leer seis respuestas",
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
