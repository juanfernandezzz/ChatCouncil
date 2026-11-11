//! Núcleo de ChatCouncil: lógica sin interfaz ni webviews.

pub mod datos;
pub mod dominio;
pub mod importar;
pub mod json;
mod nfd;
pub mod operacion;
pub mod parseos;
pub mod prompts;
pub mod puerta;
pub mod registro;
pub mod ronda;
pub mod texto;

#[cfg(test)]
mod pruebas {
    #[test]
    fn el_workspace_corre_pruebas() {
        assert_eq!(1 + 1, 2);
    }
}
