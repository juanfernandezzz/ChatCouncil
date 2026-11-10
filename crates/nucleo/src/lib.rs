//! Núcleo de ChatCouncil: lógica sin interfaz ni webviews.

pub mod datos;

#[cfg(test)]
mod pruebas {
    #[test]
    fn el_workspace_corre_pruebas() {
        assert_eq!(1 + 1, 2);
    }
}
