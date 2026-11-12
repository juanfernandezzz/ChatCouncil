//! PRU-001: `-autoprueba RUTA`, con el formato de Autoprueba.cs de la Unity y las comprobaciones que
//! el esqueleto ya puede hacer. Todo en una carpeta temporal nueva (INV-PRU-001).

use std::path::Path;
use std::time::Instant;

use nucleo::json::Valor;
use paneles::{Navegador, Panel, SWITCHES};

use crate::hilo::HiloNucleo;

/// La spec mínima que el script de página necesita para un textarea (la de Autoprueba.cs).
const SPEC_TEXTAREA: &str = "{\"composer\":{\"selector\":\"#compositor\",\"kind\":\"textarea\"},\"escritura\":\"insertText\",\"assistantMessage\":{\"selector\":\".respuesta\",\"pick\":\"last\"},\"completion\":{\"kind\":\"quiescence\",\"quiescenceMs\":10000},\"version\":1}";

#[derive(Default)]
pub struct Anotador {
    lineas: Vec<String>,
    pasadas: u32,
    total: u32,
}

impl Anotador {
    pub fn anotar(&mut self, ok: bool, nombre: &str, detalle: &str) {
        self.total += 1;
        if ok {
            self.pasadas += 1;
        }
        let marca = if ok { "OK" } else { "FALLA" };
        self.lineas.push(format!("{marca} {nombre}: {detalle}"));
    }

    /// INV-PRU-003: una medición se escribe pero no cuenta.
    pub fn medido(&mut self, texto: &str) {
        self.lineas.push(format!("MEDIDO {texto}"));
    }

    /// Un grupo que lanza queda como FALLA y los demás siguen.
    pub fn grupo(&mut self, nombre: &str, resultado: Result<(), String>) {
        if let Err(e) = resultado {
            self.anotar(false, nombre, &format!("se cortó con una excepción: {e}"));
        }
    }

    /// El texto del archivo de salida, con «Resultado: pasadas/total», y el código de salida.
    pub fn cerrar(mut self) -> (String, i32) {
        let codigo = if self.pasadas == self.total { 0 } else { 1 };
        self.lineas
            .push(format!("Resultado: {}/{}", self.pasadas, self.total));
        // Como File.WriteAllLines: cada línea con el salto del sistema.
        let salto = if cfg!(windows) { "\r\n" } else { "\n" };
        let mut texto = self.lineas.join(salto);
        texto.push_str(salto);
        (texto, codigo)
    }
}

pub async fn correr(ventana: &slint::Window, salida: &Path, arranque: Instant) -> i32 {
    let mut a = Anotador::default();
    a.lineas.push(format!(
        "Autoprueba del panel, {}, {}, {}",
        crate::ahora_local(),
        std::env::consts::OS,
        env!("CARGO_PKG_VERSION")
    ));
    if let Err(e) = cuerpo(&mut a, ventana, arranque).await {
        a.anotar(
            false,
            "autoprueba",
            &format!("se cortó con una excepción: {e}"),
        );
    }
    let (texto, codigo) = a.cerrar();
    match std::fs::write(salida, texto) {
        Ok(()) => codigo,
        Err(e) => {
            eprintln!("No se pudo escribir {}: {e}", salida.display());
            1
        }
    }
}

async fn cuerpo(
    a: &mut Anotador,
    ventana: &slint::Window,
    arranque: Instant,
) -> Result<(), String> {
    let datos = std::env::temp_dir().join(format!(
        "cc-autoprueba-{}",
        crate::nuevo_id().replace('-', "")
    ));
    let paginas = crate::escribir_paginas_de_prueba(&datos)?;
    let mut navegador = Navegador::new(&datos, Some(paginas));
    let panel = crate::crear_panel(&mut navegador, ventana, (0.0, 0.0, 800.0, 600.0)).await?;
    let version = panel.version_del_navegador()?;
    a.anotar(true, "entorno", &format!("WebView2 {version}"));
    panel
        .navegar("https://cc-prueba.test/textarea.html")
        .await?;
    a.medido(&format!(
        "panel con su página {} ms después del arranque",
        arranque.elapsed().as_millis()
    ));

    let r = panel_basico(a, &panel, &version).await;
    a.grupo("panel", r);
    let r = nucleo(a, &datos).await;
    a.grupo("núcleo", r);
    Ok(())
}

async fn panel_basico(a: &mut Anotador, p: &Panel, version: &str) -> Result<(), String> {
    // PAN-001: los tres switches, leídos por el sistema operativo en el proceso del navegador.
    let linea = p.linea_de_comandos_del_navegador()?;
    let faltan: Vec<&str> = SWITCHES
        .into_iter()
        .filter(|s| !linea.contains(s))
        .collect();
    let detalle = if faltan.is_empty() {
        "los tres están en la línea de comandos del proceso del navegador".to_string()
    } else {
        format!("faltan: {} | línea: {linea}", faltan.join(", "))
    };
    a.anotar(faltan.is_empty(), "argumentos de no limitación", &detalle);

    // INV-PAN-002: el user agent es el de Edge de este navegador. Chromium lo reduce: la versión va
    // como «Edg/<mayor>.0.0.0» (medido: WebView2 157.0.4341.46 informa Edg/157.0.0.0).
    let ua = match nucleo::json::leer(&p.ejecutar("navigator.userAgent").await?) {
        Some(Valor::Texto(t)) => t.para_mostrar().into_owned(),
        otro => return Err(format!("navigator.userAgent no es texto: {otro:?}")),
    };
    let mayor = version.split('.').next().unwrap_or_default();
    a.anotar(
        ua.ends_with(&format!("Edg/{mayor}.0.0.0")),
        "user agent sin tocar",
        &ua,
    );

    // Escribir y leer por pedido y consulta, con saltos de línea.
    let texto = "Primera línea con ñ y acentos: áéíóú\nSegunda línea\n\nCuarta, tras una vacía";
    let escrito = p.correr("escribir", SPEC_TEXTAREA, Some(texto)).await?;
    let ok = matches!(&escrito, Valor::Objeto(o) if o.iter().any(|(k, v)| k.como_str() == Some("ok") && *v == Valor::Bool(true)));
    a.anotar(ok, "escribir", &format!("{escrito:?}"));
    let leido = match p.correr("leerCompositor", SPEC_TEXTAREA, None).await? {
        Valor::Texto(t) => t.para_mostrar().into_owned(),
        otro => format!("{otro:?}"),
    };
    let detalle = if leido == texto {
        format!("{} caracteres, idénticos", texto.encode_utf16().count())
    } else {
        format!("leyó: {leido}")
    };
    a.anotar(leido == texto, "leer el compositor", &detalle);
    let vacio = p.correr("chatVacio", SPEC_TEXTAREA, None).await?;
    a.anotar(
        vacio == Valor::Bool(true),
        "chat vacío",
        &format!("{vacio:?}"),
    );
    Ok(())
}

/// Una orden al núcleo, en su hilo, con su respuesta (ADR-0010, punto 2).
async fn nucleo(a: &mut Anotador, datos: &Path) -> Result<(), String> {
    let hilo = HiloNucleo::iniciar(datos.to_path_buf());
    let antes = Instant::now();
    let etapa = hilo
        .pedir(|p| {
            p.paso_siguiente()
                .map(|s| s.etapa)
                .map_err(|e| e.to_string())
        })
        .await??;
    let ida_y_vuelta = antes.elapsed();
    a.anotar(
        etapa == "pregunta",
        "orden al núcleo",
        &format!("paso siguiente: {etapa}"),
    );
    a.medido(&format!(
        "orden al núcleo de ida y vuelta: {} µs",
        ida_y_vuelta.as_micros()
    ));
    Ok(())
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn un_grupo_que_lanza_queda_como_falla_y_los_demas_siguen() {
        let mut a = Anotador::default();
        a.grupo("panel", Err("se rompió".into()));
        a.anotar(true, "núcleo", "paso siguiente: pregunta");
        let (texto, codigo) = a.cerrar();
        let lineas: Vec<&str> = texto.lines().collect();
        assert_eq!(
            lineas,
            [
                "FALLA panel: se cortó con una excepción: se rompió",
                "OK núcleo: paso siguiente: pregunta",
                "Resultado: 1/2",
            ]
        );
        assert_eq!(codigo, 1);
    }

    #[test]
    fn una_medicion_nunca_cuenta_para_el_resultado() {
        // INV-PRU-003
        let mut a = Anotador::default();
        a.anotar(true, "entorno", "WebView2 1");
        a.medido("arranque hasta la ventana: 300 ms");
        let (texto, codigo) = a.cerrar();
        let lineas: Vec<&str> = texto.lines().collect();
        assert_eq!(
            lineas,
            [
                "OK entorno: WebView2 1",
                "MEDIDO arranque hasta la ventana: 300 ms",
                "Resultado: 1/1",
            ]
        );
        assert_eq!(codigo, 0);
    }
}
