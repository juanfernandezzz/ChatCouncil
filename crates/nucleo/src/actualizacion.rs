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

/// E5 (PART-027): el aviso al abrir. Lo capturado queda guardado; lo que un panel siga generando, no.
pub fn aviso(nueva: &str, actual: &str) -> String {
    format!(
        "Hay una versión nueva ({nueva}); tienes la {actual}. Lo capturado queda guardado; antes de actualizar, captura lo que un panel siga generando."
    )
}

pub const BUSCANDO: &str = "Buscando actualizaciones…";
pub const SIN_REVISION: &str =
    "No se pudo revisar si hay una versión nueva. Revisa tu conexión e inténtalo otra vez.";
pub const TITULO_VERSION_NUEVA: &str = "Hay una versión nueva";
pub const BOTON_ACTUALIZAR_AHORA: &str = "Actualizar ahora";
pub const BOTON_MAS_TARDE: &str = "Más tarde";

/// El resultado de «Buscar actualizaciones» (PART-027, D44).
#[derive(Debug, Clone, PartialEq)]
pub enum Busqueda {
    /// La versión actual no lleva número de compilación: no se busca nada.
    Local,
    /// Sin red, sin respuesta o con una respuesta que no es una versión.
    SinRed,
    AlDia,
    Nueva(String),
}

/// Qué pasó al buscar. `publicada` se llama solo si la compilación no es local, y devuelve el texto de
/// version.txt, o None sin red o sin respuesta. Una respuesta que no es una versión cuenta como sin red:
/// decir «al día» sobre un 404 sería mentir.
pub fn buscar(actual: &str, publicada: impl FnOnce() -> Option<String>) -> Busqueda {
    if !version(actual).is_some_and(|a| a[2] > 0) {
        return Busqueda::Local;
    }
    let Some(texto) = publicada() else {
        return Busqueda::SinRed;
    };
    let nueva = texto.trim();
    if version(nueva).is_none() {
        Busqueda::SinRed
    } else if es_nueva(actual, nueva) {
        Busqueda::Nueva(nueva.to_string())
    } else {
        Busqueda::AlDia
    }
}

/// La línea de estado bajo el botón; vacía con una versión nueva, que abre su ventana.
pub fn estado_de_busqueda(b: &Busqueda, actual: &str) -> String {
    match b {
        Busqueda::Local => {
            format!("Esta es una compilación local ({actual}): no busca actualizaciones.")
        }
        Busqueda::SinRed => SIN_REVISION.to_string(),
        Busqueda::AlDia => format!("Tienes la última versión ({actual})."),
        Busqueda::Nueva(_) => String::new(),
    }
}

/// El cuerpo de la ventana «Hay una versión nueva». La pregunta que se escribe sin pegar no se guarda
/// en disco (E1): por eso el texto la nombra.
pub fn cuerpo_version_nueva(nueva: &str, actual: &str) -> String {
    format!(
        "Hay una versión nueva ({nueva}); tienes la {actual}. Al actualizar, la app se cierra y se vuelve a abrir. Lo que ya capturaste queda guardado; se pierde la pregunta que hayas escrito sin pegar y la respuesta que un panel siga generando sin capturar. Si un panel está respondiendo, espera, captura y actualiza después."
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

    // PART-027 (E3): los cinco estados de «Buscar actualizaciones», con la versión publicada inyectada.
    #[test]
    fn buscar_actualizaciones_dice_cada_estado() {
        let sin_llamar = || -> Option<String> { panic!("una compilación local no busca") };
        assert_eq!(buscar("0.1.0", sin_llamar), Busqueda::Local);
        assert_eq!(buscar("0.2", sin_llamar), Busqueda::Local);
        assert_eq!(buscar("", sin_llamar), Busqueda::Local);
        assert_eq!(buscar("0.2.5", || None), Busqueda::SinRed);
        // Una página de error no es una versión: no se dice «al día» sobre ella.
        assert_eq!(
            buscar("0.2.5", || Some("<html>404</html>".into())),
            Busqueda::SinRed
        );
        assert_eq!(buscar("0.2.5", || Some("0.2.5\n".into())), Busqueda::AlDia);
        assert_eq!(buscar("0.2.6", || Some("0.2.5".into())), Busqueda::AlDia);
        assert_eq!(
            buscar("0.2.5", || Some("0.2.6\n".into())),
            Busqueda::Nueva("0.2.6".into())
        );
        let estado = |b| estado_de_busqueda(&b, "0.2.5");
        assert_eq!(
            estado_de_busqueda(&Busqueda::Local, "0.1.0"),
            "Esta es una compilación local (0.1.0): no busca actualizaciones."
        );
        assert_eq!(
            estado(Busqueda::SinRed),
            "No se pudo revisar si hay una versión nueva. Revisa tu conexión e inténtalo otra vez."
        );
        assert_eq!(estado(Busqueda::AlDia), "Tienes la última versión (0.2.5).");
        assert_eq!(estado(Busqueda::Nueva("0.2.6".into())), "");
        assert_eq!(BUSCANDO, "Buscando actualizaciones…");
        assert_eq!(TITULO_VERSION_NUEVA, "Hay una versión nueva");
        assert_eq!(BOTON_ACTUALIZAR_AHORA, "Actualizar ahora");
        assert_eq!(BOTON_MAS_TARDE, "Más tarde");
        assert_eq!(
            cuerpo_version_nueva("0.2.6", "0.2.5"),
            "Hay una versión nueva (0.2.6); tienes la 0.2.5. Al actualizar, la app se cierra y se vuelve a abrir. Lo que ya capturaste queda guardado; se pierde la pregunta que hayas escrito sin pegar y la respuesta que un panel siga generando sin capturar. Si un panel está respondiendo, espera, captura y actualiza después."
        );
    }

    // ARR-008 y ARR-009: los textos de la Unity, literales; el aviso al abrir cambió en PART-027 (E5).
    #[test]
    fn los_textos_son_los_de_la_unity() {
        assert_eq!(
            aviso("0.2.6", "0.2.5"),
            "Hay una versión nueva (0.2.6); tienes la 0.2.5. Lo capturado queda guardado; antes de actualizar, captura lo que un panel siga generando."
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
