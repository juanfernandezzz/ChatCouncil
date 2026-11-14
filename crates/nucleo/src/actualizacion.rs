//! Cuándo ofrecer una actualización y qué dice cada aviso: ARR-008, ARR-009 e INV-ARR-002 (Actualizacion.cs
//! y Actualizador.cs de la Unity). El CI numera cada compilación como 0.2.N (N = número de corrida) y publica
//! ese número en version.txt del Release; una compilación local lleva 0.1.0 y nunca ofrece nada.

/// Dónde publica el CI (D30): el Release propio de este repo.
pub const RELEASE: &str =
    "https://github.com/juanfernandezzz/ChatCouncil/releases/download/chatcouncil-v1/";
pub const ARCHIVO_VERSION: &str = "version.txt";
pub const ARCHIVO_INSTALADOR: &str = "ChatCouncilNueva-instalador.exe";

pub const BOTON_ACTUALIZAR: &str = "Actualizar";
pub const BOTON_REINTENTAR: &str = "Reintentar";
pub const INSTALANDO: &str = "Instalando… la app se reinicia sola.";
pub const SIN_DESCARGA: &str = "No se pudo descargar la actualización. Revisa tu conexión.";

pub fn es_nueva(actual: &str, publicada: &str) -> bool {
    let (Some(a), Some(p)) = (version(actual), version(publicada)) else {
        return false;
    };
    // Sin número de compilación (0.1.0 o «0.2») es una compilación local.
    a[2] > 0 && p > a
}

/// Como System.Version.TryParse: de 2 a 4 números separados por punto; lo que falta vale -1.
fn version(texto: &str) -> Option<[i64; 4]> {
    let partes: Vec<&str> = texto.trim().split('.').collect();
    if !(2..=4).contains(&partes.len()) {
        return None;
    }
    let mut v = [-1; 4];
    for (i, p) in partes.iter().enumerate() {
        if p.is_empty() || !p.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        v[i] = p.parse().ok()?;
    }
    Some(v)
}

pub fn aviso(nueva: &str, actual: &str) -> String {
    format!(
        "Hay una versión nueva ({nueva}); tienes la {actual}. La app se cierra y se vuelve a abrir; tus rondas se conservan."
    )
}

pub fn descargando(nueva: &str, porcentaje: u32) -> String {
    format!("Descargando la versión {nueva}… {porcentaje} %")
}

pub fn no_abre(codigo: i64) -> String {
    format!("No se pudo abrir el instalador (error {codigo}).")
}

#[cfg(test)]
mod pruebas {
    use super::*;

    // ARR-008 e INV-ARR-002: el vector de la Unity (SoloEsNuevaUnaVersionPublicadaMayor).
    #[test]
    fn solo_es_nueva_una_version_publicada_mayor() {
        assert!(es_nueva("0.2.5", "0.2.6"));
        assert!(
            es_nueva("0.2.9", "0.2.10"),
            "se compara por número, no por texto"
        );
        assert!(es_nueva("0.2.5", "0.3.1"));
        assert!(
            es_nueva(" 0.2.5 ", "0.2.6\n"),
            "version.txt trae salto de línea"
        );
        assert!(!es_nueva("0.2.5", "0.2.5"), "igual no ofrece");
        assert!(!es_nueva("0.2.6", "0.2.5"), "menor no ofrece");
    }

    #[test]
    fn una_compilacion_local_nunca_ofrece() {
        assert!(!es_nueva("0.1.0", "0.2.99"));
        assert!(!es_nueva("0.1.0", "9.9.9"));
    }

    #[test]
    fn lo_que_no_es_una_version_no_ofrece() {
        assert!(!es_nueva("0.2.5", ""));
        assert!(!es_nueva("0.2.5", "<html>404</html>"));
        assert!(!es_nueva("0.2.5", "0.2.x"));
        assert!(!es_nueva("", "0.2.6"));
        assert!(
            !es_nueva("0.2", "0.3"),
            "sin número de compilación es local"
        );
    }

    // ARR-008 y ARR-009: los textos de la Unity, literales.
    #[test]
    fn los_textos_son_los_de_la_unity() {
        assert_eq!(
            aviso("0.2.6", "0.2.5"),
            "Hay una versión nueva (0.2.6); tienes la 0.2.5. La app se cierra y se vuelve a abrir; tus rondas se conservan."
        );
        assert_eq!(
            descargando("0.2.6", 42),
            "Descargando la versión 0.2.6… 42 %"
        );
        assert_eq!(no_abre(5), "No se pudo abrir el instalador (error 5).");
        assert_eq!(BOTON_ACTUALIZAR, "Actualizar");
        assert_eq!(BOTON_REINTENTAR, "Reintentar");
        assert_eq!(INSTALANDO, "Instalando… la app se reinicia sola.");
        assert_eq!(
            SIN_DESCARGA,
            "No se pudo descargar la actualización. Revisa tu conexión."
        );
    }
}
