//! PRU-001: `-autoprueba RUTA`, con el formato de Autoprueba.cs de la Unity y las comprobaciones que
//! el esqueleto ya puede hacer. Todo en una carpeta temporal nueva (INV-PRU-001).

use std::path::Path;
use std::time::{Duration, Instant};

use nucleo::json::Valor;
use paneles::{ESPERA_CORRER, Navegador, Panel, SWITCHES};

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
    let datos = std::env::temp_dir().join(format!(
        "cc-autoprueba-{}",
        crate::nuevo_id().replace('-', "")
    ));
    if let Err(e) = cuerpo(&mut a, ventana, &datos, arranque).await {
        a.anotar(
            false,
            "autoprueba",
            &format!("se cortó con una excepción: {e}"),
        );
    }
    // Revisión PART-011, hallazgo 10: la carpeta temporal no queda. Los paneles ya se soltaron con cuerpo;
    // el proceso del navegador tarda un poco en soltar sus archivos.
    let mut borrada = Err(String::new());
    for _ in 0..100 {
        borrada = std::fs::remove_dir_all(&datos).map_err(|e| e.to_string());
        if borrada.is_ok() || !datos.exists() {
            break;
        }
        let _ = paneles::dormir(Duration::from_millis(100)).await;
    }
    a.anotar(
        !datos.exists(),
        "carpeta temporal borrada",
        &format!("{}: {borrada:?}", datos.display()),
    );
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
    datos: &Path,
    arranque: Instant,
) -> Result<(), String> {
    let paginas = crate::escribir_paginas_de_prueba(datos)?;
    let navegador = Navegador::new(datos, Some(paginas));
    let panel =
        crate::crear_panel(&navegador, ventana, "prueba-a", (0.0, 0.0, 800.0, 600.0)).await?;
    let version = panel.version_del_navegador()?;
    a.anotar(true, "entorno", &format!("WebView2 {version}"));
    // ARR-006: la escala de la ventana de Slint es la que Windows da a su monitor; no se toca la configuración.
    let escala = ventana.scale_factor();
    let ppp = crate::ppp_de_la_ventana(ventana)?;
    a.anotar(
        (f64::from(escala) - f64::from(ppp) / 96.0).abs() < 0.001,
        "escala de la ventana",
        &format!("Slint {escala}, Windows {ppp} ppp"),
    );
    panel
        .navegar("https://cc-prueba.test/textarea.html")
        .await?;
    a.medido(&format!(
        "panel con su página {} ms después del arranque",
        arranque.elapsed().as_millis()
    ));

    let r = panel_basico(a, &panel, &version).await;
    a.grupo("panel", r);
    let r = nucleo(a, datos).await;
    a.grupo("núcleo", r);
    let r = techo_externo(a, &panel, &navegador, ventana).await;
    a.grupo("techo externo", r);
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

    // Revisión PART-011, hallazgo 9: la carga que termina es la de esta navegación, no la de una anterior.
    let anterior = p.navegar("https://cc-prueba.test/cierre.html");
    let propia = p.navegar("https://cc-prueba.test/textarea.html").await;
    drop(anterior);
    let donde = p
        .ejecutar("location.pathname + '|' + document.readyState")
        .await?;
    a.anotar(
        propia.is_ok() && donde == "\"/textarea.html|complete\"",
        "una navegación espera su propia carga",
        &format!("{propia:?}, al volver: {donde}"),
    );

    // Escribir y leer por pedido y consulta, con saltos de línea.
    let texto = "Primera línea con ñ y acentos: áéíóú\nSegunda línea\n\nCuarta, tras una vacía";
    let escrito = p
        .correr("escribir", SPEC_TEXTAREA, Some(texto), ESPERA_CORRER)
        .await?;
    let ok = matches!(&escrito, Valor::Objeto(o) if o.iter().any(|(k, v)| k.como_str() == Some("ok") && *v == Valor::Bool(true)));
    a.anotar(ok, "escribir", &format!("{escrito:?}"));
    let leido = match p
        .correr("leerCompositor", SPEC_TEXTAREA, None, ESPERA_CORRER)
        .await?
    {
        Valor::Texto(t) => t.para_mostrar().into_owned(),
        otro => format!("{otro:?}"),
    };
    let detalle = if leido == texto {
        format!("{} caracteres, idénticos", texto.encode_utf16().count())
    } else {
        format!("leyó: {leido}")
    };
    a.anotar(leido == texto, "leer el compositor", &detalle);
    let vacio = p
        .correr("chatVacio", SPEC_TEXTAREA, None, ESPERA_CORRER)
        .await?;
    a.anotar(
        vacio == Valor::Bool(true),
        "chat vacío",
        &format!("{vacio:?}"),
    );
    Ok(())
}

/// Una página colgada a propósito (15 s de bucle) en otro perfil: el techo la corta sin bloquear a los demás.
async fn techo_externo(
    a: &mut Anotador,
    p: &Panel,
    navegador: &Navegador,
    ventana: &slint::Window,
) -> Result<(), String> {
    let c = crate::crear_panel(navegador, ventana, "prueba-c", (0.0, 0.0, 800.0, 600.0)).await?;
    c.navegar("https://cc-prueba.test/textarea.html").await?;
    let reloj = Instant::now();
    let colgada = c.ejecutar_con_techo(
        "const hasta = Date.now() + 15000; while (Date.now() < hasta) {} 'fin'",
        Duration::from_secs(3),
    );
    paneles::dormir(Duration::from_millis(300)).await?;
    let otro = Instant::now();
    let respuesta = p.ejecutar("'responde'").await?;
    let ms_otro = otro.elapsed().as_millis();
    let corte = colgada.await;
    let ms_techo = reloj.elapsed().as_millis();
    a.anotar(
        corte.is_err() && (2_900..6_000).contains(&ms_techo),
        "techo externo sobre una página colgada",
        &format!(
            "cortó a los {ms_techo} ms: {}",
            corte.err().unwrap_or_else(|| "no cortó".into())
        ),
    );
    a.anotar(
        respuesta == "\"responde\"" && ms_otro < 1_500,
        "un panel colgado no bloquea a los demás",
        &format!("el otro panel respondió en {ms_otro} ms"),
    );

    // Revisión PART-011, hallazgo 3: el techo de correr se cumple aunque el ejecutar de adentro no vuelva.
    let antes = Instant::now();
    let r = c
        .correr("chatVacio", SPEC_TEXTAREA, None, Duration::from_secs(3))
        .await;
    let ms = antes.elapsed().as_millis();
    a.anotar(
        r.is_err() && (2_900..6_000).contains(&ms),
        "techo de una operación sobre una página colgada",
        &format!("cortó a los {ms} ms: {r:?}"),
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
