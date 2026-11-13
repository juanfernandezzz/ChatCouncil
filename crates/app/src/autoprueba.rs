//! PRU-001: `-autoprueba RUTA`, con el formato de Autoprueba.cs de la Unity y las comprobaciones que
//! el esqueleto ya puede hacer. Todo en una carpeta temporal nueva (INV-PRU-001).

use std::collections::HashMap;
use std::path::Path;
use std::rc::{Rc, Weak};
use std::time::{Duration, Instant};

use nucleo::json::Valor;
use nucleo::texto::Texto;
use paneles::{ESPERA_CORRER, ESPERA_ESCRIBIR, Navegador, Panel, SWITCHES};

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

    /// Una línea que no es comprobación: el encabezado de la salida.
    pub fn linea(&mut self, texto: String) {
        self.lineas.push(texto);
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

    let r = panel_basico(a, &panel, &version, &navegador, ventana, f64::from(escala)).await;
    a.grupo("panel", r);
    let r = escritura(a, &navegador, ventana).await;
    a.grupo("escritura", r);
    let r = lectura(a, &navegador, ventana).await;
    a.grupo("lectura", r);
    let r = iframe_de_otro_origen(a, &navegador, ventana).await;
    a.grupo("iframe de otro origen", r);
    let r = adjuntar(a, &panel, datos).await;
    a.grupo("adjuntar", r);
    let r = compositor_recortado(a, &navegador, ventana).await;
    a.grupo("compositor recortado", r);
    let r = pdf(a, datos);
    a.grupo("pdf", r);
    let r = nucleo(a, datos).await;
    a.grupo("núcleo", r);
    let r = perfiles(a, &panel, &navegador, ventana, datos).await;
    a.grupo("perfiles", r);
    let r = techo_externo(a, &panel, &navegador, ventana).await;
    a.grupo("techo externo", r);
    let r = surrogate_suelto(a, &panel).await;
    a.grupo("surrogate suelto", r);
    let r = sondeo(a, &navegador, ventana).await;
    a.grupo("sondeo", r);
    Ok(())
}

/// Spec de Autoprueba.cs: la de un proveedor, tal cual specs.json.
fn spec(proveedor: &str) -> Result<String, String> {
    crate::spec_de(proveedor).ok_or_else(|| format!("specs.json no tiene la spec de {proveedor}"))
}

/// La spec con un campo cambiado, como malo["composer"]["selector"] = … en la Unity.
fn con_campo(spec: &str, ruta: &[&str], valor: Valor) -> Result<String, String> {
    let mut v = nucleo::json::leer(spec).ok_or("la spec no es JSON")?;
    let mut c = &mut v;
    for k in ruta {
        let Valor::Objeto(o) = c else {
            return Err(format!("la spec no es un objeto antes de {k}"));
        };
        c = &mut o
            .iter_mut()
            .find(|(n, _)| n.como_str() == Some(k))
            .ok_or_else(|| format!("la spec no tiene {k}"))?
            .1;
    }
    *c = valor;
    Ok(json(&v))
}

/// El valor como JSON compacto, como ToString(Formatting.None).
fn json(v: &Valor) -> String {
    let mut b = Vec::new();
    nucleo::json::escribir(v, &mut b);
    String::from_utf8_lossy(&b).into_owned()
}

/// El campo al final de la ruta, como l["archivos"]["leidos"].
fn en<'a>(v: &'a Valor, ruta: &[&str]) -> Option<&'a Valor> {
    ruta.iter().try_fold(v, |v, k| match v {
        Valor::Objeto(o) => o
            .iter()
            .find(|(n, _)| n.como_str() == Some(k))
            .map(|(_, v)| v),
        _ => None,
    })
}

/// (string) de un campo: el texto, o "" si falta o no es texto.
fn txt(v: Option<&Valor>) -> String {
    match v {
        Some(Valor::Texto(t)) => t.para_mostrar().into_owned(),
        _ => String::new(),
    }
}

fn num(v: Option<&Valor>) -> Option<i64> {
    match v {
        Some(Valor::Entero(n)) => Some(*n),
        _ => None,
    }
}

fn mostrar(t: &Option<Texto>) -> String {
    t.as_ref()
        .map_or("null".into(), |t| t.para_mostrar().into_owned())
}

/// Largo en unidades UTF-16, como string.Length.
fn largo(t: &Texto) -> usize {
    t.a_utf16().len()
}

/// Un panel nuevo en su perfil, con una página de prueba cargada (Paneles.Crear).
async fn abrir(
    navegador: &Navegador,
    ventana: &slint::Window,
    perfil: &str,
    pagina: &str,
) -> Result<Panel, String> {
    let p = crate::crear_panel(navegador, ventana, perfil, (0.0, 0.0, 800.0, 600.0)).await?;
    p.navegar(&format!("{ORIGEN}{pagina}")).await?;
    Ok(p)
}

/// ESC-001 a ESC-004, como Autoprueba.Escritura: escribir y leer de vuelta en cada tipo de compositor.
async fn escritura(
    a: &mut Anotador,
    navegador: &Navegador,
    ventana: &slint::Window,
) -> Result<(), String> {
    let base = "Línea uno, con ñ: áéíóú ü\nLínea dos\n\nLínea cuatro, tras una vacía\n  sangría de dos espacios";
    let texto = Texto::from(base);
    // chatgpt y mistral: ProseMirror, un párrafo por línea.
    for (perfil, proveedor, nombre) in [
        (
            "prueba-e1",
            "chatgpt",
            "escritura por párrafos en contenteditable (spec chatgpt)",
        ),
        (
            "prueba-e2",
            "mistral",
            "escritura por párrafos (spec mistral)",
        ),
    ] {
        let p = abrir(navegador, ventana, perfil, &format!("{proveedor}.html")).await?;
        let s = spec(proveedor)?;
        let e = p.escribir(&s, &texto, ESPERA_CORRER).await;
        let leido = p.leer_compositor(&s).await?;
        let igual = leido.as_ref() == Some(&texto);
        let detalle = if igual {
            format!("{} caracteres, idénticos", largo(&texto))
        } else {
            format!("escribir {e:?}, leyó: {}", mostrar(&leido))
        };
        a.anotar(e.is_ok() && igual, nombre, &detalle);
    }
    // Saltos de Windows (\r\n), como una pregunta pegada del portapapeles: cada \r no puede volverse otro salto.
    let con_crlf = Texto::from(format!(
        "{}\r\n\r\nFinal tras una línea vacía",
        base.replace('\n', "\r\n")
    ));
    for proveedor in ["chatgpt", "mistral"] {
        let p = abrir(
            navegador,
            ventana,
            &format!("prueba-crlf-{proveedor}"),
            &format!("{proveedor}.html"),
        )
        .await?;
        let s = spec(proveedor)?;
        let e = p.escribir(&s, &con_crlf, ESPERA_CORRER).await;
        let leido = p.leer_compositor(&s).await?;
        let l = leido.clone().unwrap_or_default();
        let verificado = nucleo::operacion::verificar_igualdad(&con_crlf, &l);
        let sin_cr = leido.is_some() && !l.para_mostrar().contains('\r');
        let detalle = verificado
            .clone()
            .unwrap_or_else(|| format!("{} caracteres, igual al texto con \\n", largo(&l)));
        a.anotar(
            e.is_ok() && verificado.is_none() && sin_cr,
            &format!("saltos \\r\\n sin líneas de más (spec {proveedor})"),
            &detalle,
        );
    }
    // Una skill elegida en el sitio es una píldora no editable en el compositor: no es un borrador y se conserva.
    let p = abrir(navegador, ventana, "prueba-e2b", "mistral.html").await?;
    let s = spec("mistral")?;
    let selector = nucleo::json::leer(&s)
        .and_then(|v| en(&v, &["composer", "selector"]).cloned())
        .ok_or("la spec de mistral no tiene composer.selector")?;
    p.ejecutar(&format!(
        "document.querySelector({}).innerHTML = '<p><span contenteditable=\"false\">deep-research</span> </p>'; 'ok'",
        json(&selector)
    ))
    .await?;
    let e = p.escribir(&s, &texto, ESPERA_CORRER).await;
    let leido = p.leer_compositor(&s).await?;
    let pildora = p
        .ejecutar("!!document.querySelector('[contenteditable=\"false\"]')")
        .await?
        == "true";
    let recortado = leido
        .as_ref()
        .is_some_and(|l| l.para_mostrar().trim() == base);
    a.anotar(
        e.is_ok() && recortado && pildora,
        "escritura junto a una skill elegida (píldora no editable)",
        &format!(
            "ok {}, píldora conservada {pildora}, leyó: {}",
            e.is_ok(),
            mostrar(&leido)
        ),
    );
    drop(p);
    // kimi: editor que procesa el pegado él mismo. 180.000 caracteres con las marcas del motor.
    let p = abrir(navegador, ventana, "prueba-e3", "kimi.html").await?;
    let s = spec("kimi")?;
    let (mut cuerpo, mut unidades) = (String::new(), 0);
    for i in 0.. {
        if unidades >= 180_000 {
            break;
        }
        let linea = format!(
            "Línea {i:05}: el cuerpo de prueba lleva ñ, acentos (áéíóú) y comillas \"dobles\".{}",
            if i % 17 == 16 { "\n\n" } else { "\n" }
        );
        unidades += linea.encode_utf16().count();
        cuerpo.push_str(&linea);
    }
    let (con_marcas, marcas) = nucleo::operacion::insertar_marcas_intercaladas(
        &Texto::from(cuerpo),
        "autoprueba",
        nucleo::operacion::INTERVALO_MARCA,
    );
    let reloj = Instant::now();
    let e = p.escribir(&s, &con_marcas, Duration::from_secs(120)).await;
    let leido = p.leer_compositor(&s).await?.unwrap_or_default();
    let integridad = nucleo::operacion::evaluar_integridad(&leido, &marcas);
    a.anotar(
        e.is_ok() && leido == con_marcas && integridad.estado == "completo",
        "pegado de 180.000 caracteres con marcas (spec kimi)",
        &format!(
            "{} caracteres, {} marcas, integridad {} ({}/{}), idéntico: {}, leídos {}, {} ms",
            largo(&con_marcas),
            marcas.len(),
            integridad.estado,
            integridad.presentes,
            integridad.esperadas,
            leido == con_marcas,
            largo(&leido),
            reloj.elapsed().as_millis()
        ),
    );
    drop(p);
    // ESC-002: con un borrador en el compositor, escribir avisa y no lo toca.
    let p = abrir(navegador, ventana, "prueba-e4", "textarea.html").await?;
    p.ejecutar("document.getElementById('compositor').value = 'Borrador de Juan'; 'ok'")
        .await?;
    let e = p.escribir(SPEC_TEXTAREA, &texto, ESPERA_ESCRIBIR).await;
    let queda = p.leer_compositor(SPEC_TEXTAREA).await?;
    a.anotar(
        e.as_ref().err().map(String::as_str)
            == Some("el compositor ya tenía texto: no se escribe encima de un borrador")
            && queda == Some(Texto::from("Borrador de Juan")),
        "escribir no pisa un borrador",
        &format!(
            "escribir {e:?}, el compositor quedó con: {}",
            mostrar(&queda)
        ),
    );
    Ok(())
}

/// CAP-001, CAP-014 y DIA-001, como Autoprueba.Lectura.
async fn lectura(
    a: &mut Anotador,
    navegador: &Navegador,
    ventana: &slint::Window,
) -> Result<(), String> {
    // chatgpt: mensaje de usuario, enlaces de fuente, informe en iframe, generando (está el botón de detener).
    let c = abrir(navegador, ventana, "prueba-l1", "chatgpt.html").await?;
    let s = spec("chatgpt")?;
    let vacio = c.chat_vacio(&s).await?;
    a.anotar(
        vacio == Some(false),
        "chat con mensajes no está vacío",
        &format!("chatVacio = {vacio:?}"),
    );
    let l = c.correr("leer", &s, None, ESPERA_CORRER).await?;
    let verdad = |k| en(&l, &[k]) == Some(&Valor::Bool(true));
    a.anotar(
        txt(en(&l, &["userText"])) == "Pregunta de prueba"
            && num(en(&l, &["fuentesHref"])) == Some(2)
            && verdad("informeEnIframe")
            && verdad("generating"),
        "lectura tipo chatgpt",
        &format!(
            "userText {}, fuentesHref {:?}, informeEnIframe {:?}, generating {:?}",
            txt(en(&l, &["userText"])),
            num(en(&l, &["fuentesHref"])),
            en(&l, &["informeEnIframe"]),
            en(&l, &["generating"])
        ),
    );
    // Estado de generación en el tiempo: con el botón de detener, generando; sin él y con texto, fin observado.
    let antes = c.estado(&s).await?;
    c.ejecutar("document.querySelector('[data-testid=\"stop-button\"]').remove(); 'ok'")
        .await?;
    let despues = c.estado(&s).await?;
    let crudo = c.correr("estado", &s, None, ESPERA_CORRER).await?;
    a.anotar(
        antes.generando == Some(true)
            && antes.fin.is_none()
            && despues.fin.as_deref() == Some("observado")
            && num(en(&crudo, &["largo"])).unwrap_or(0) > 0,
        "estado de generación",
        &format!("antes {antes:?}, después {}", json(&crudo)),
    );
    // Diagnóstico de selectores, de solo lectura.
    let d = c.diagnostico(&s).await?;
    let sel = |k| num(en(&d, &["selectores", k]));
    let iframes: Vec<String> = match en(&d, &["iframes"]) {
        Some(Valor::Lista(l)) => l.iter().map(|f| txt(en(f, &["origen"]))).collect(),
        _ => Vec::new(),
    };
    a.anotar(
        sel("composer.selector") == Some(1)
            && sel("assistantMessage.selector") == Some(1)
            && sel("userMessage.selector") == Some(1)
            && iframes
                .iter()
                .any(|f| f == "https://cc-otro.test/informe.html"),
        "diagnóstico de selectores",
        &format!(
            "selectores {}, iframes {}",
            en(&d, &["selectores"]).map(json).unwrap_or_default(),
            iframes.join(", ")
        ),
    );
    let malo = con_campo(
        &s,
        &["composer", "selector"],
        Valor::Texto("[[no es un selector".into()),
    )?;
    let dm = c.diagnostico(&malo).await?;
    let invalido = txt(en(&dm, &["selectores", "composer.selector"]));
    a.anotar(
        invalido == "invalido",
        "diagnóstico con un selector inválido",
        &format!("composer.selector = {invalido}"),
    );
    drop(c);
    // kimi: exclude sobre una copia, html crudo sin recortes, y los dos archivos leídos de su iframe.
    let k = abrir(navegador, ventana, "prueba-l2", "kimi.html").await?;
    let l = k
        .correr("leer", &spec("kimi")?, None, Duration::from_secs(60))
        .await?;
    let (texto, html) = (txt(en(&l, &["text"])), txt(en(&l, &["html"])));
    a.anotar(
        !texto.contains("Copiar y compartir")
            && html.contains("Copiar y compartir")
            && texto.contains("Respuesta de Kimi"),
        "lectura con exclude y html crudo (spec kimi)",
        &format!(
            "el texto excluye el bloque: {}, el html lo conserva: {}",
            !texto.contains("Copiar y compartir"),
            html.contains("Copiar y compartir")
        ),
    );
    let (leidos, total) = (
        num(en(&l, &["archivos", "leidos"])),
        num(en(&l, &["archivos", "total"])),
    );
    a.anotar(
        leidos == Some(2)
            && total == Some(2)
            && texto.contains("CONTENIDO DEL ARCHIVO 1")
            && texto.contains("CONTENIDO DEL ARCHIVO 2")
            && texto.contains("=== ARCHIVO: dos.md ==="),
        "archivos de kimi",
        &format!("leídos {leidos:?}/{total:?}"),
    );
    drop(k);
    // mistral: el mensaje y después el canvas; el html guarda los dos, el canvas queda cerrado, y la etiqueta de modelo.
    let m = abrir(navegador, ventana, "prueba-l3", "mistral.html").await?;
    let l = m
        .correr("leer", &spec("mistral")?, None, ESPERA_CORRER)
        .await?;
    let cerrado = cadena(
        &m.ejecutar("document.getElementById('chat-side-panel').innerHTML")
            .await?,
    );
    let (texto, html) = (txt(en(&l, &["text"])), txt(en(&l, &["html"])));
    a.anotar(
        texto.starts_with("Aviso: la respuesta")
            && texto.find("TEXTO DEL CANVAS").is_some_and(|i| i > 0)
            && html.contains("Aviso: la respuesta")
            && html.contains("TEXTO DEL CANVAS")
            && cerrado.as_deref() == Some("")
            && txt(en(&l, &["modelLabel"])) == "Rápido",
        "canvas de mistral",
        &format!(
            "texto \"{texto}\", canvas cerrado después: {}, modelLabel {}",
            cerrado.as_deref() == Some(""),
            txt(en(&l, &["modelLabel"]))
        ),
    );
    Ok(())
}

/// CAP-002, como Autoprueba.IframeDeOtroOrigen, y la lectura entera de PantallaRonda.Leer sobre la misma página.
async fn iframe_de_otro_origen(
    a: &mut Anotador,
    navegador: &Navegador,
    ventana: &slint::Window,
) -> Result<(), String> {
    let c = abrir(navegador, ventana, "prueba-i", "chatgpt.html").await?;
    let real = spec("chatgpt")?;
    // La real es el dominio de OpenAI.
    let s = con_campo(
        &real,
        &["informeEnIframe", "frameUrl"],
        Valor::Texto("cc-otro.test".into()),
    )?;
    // El iframe carga después que la página.
    let _ = paneles::dormir(Duration::from_millis(500)).await;
    let informe = c.leer_informe_en_iframe(&s).await?;
    let ok = informe.as_ref().is_some_and(|(t, h)| {
        t.para_mostrar().starts_with("INFORME DE PRUEBA")
            && h.para_mostrar().contains("_reportPage_")
    });
    let detalle = match &informe {
        Some((t, _)) => format!("texto \"{}\"", t.para_mostrar()),
        None => "no se encontró el informe".into(),
    };
    a.anotar(ok, "script en un iframe de otro origen", &detalle);
    let l = c.leer("chatgpt", &s).await;
    let (texto, html) = (
        l.text.para_mostrar().into_owned(),
        l.html
            .as_ref()
            .map(|h| h.para_mostrar().into_owned())
            .unwrap_or_default(),
    );
    a.anotar(
        l.error.is_none()
            && texto.contains("INFORME DE PRUEBA")
            && !texto.starts_with("INFORME DE PRUEBA")
            && html.contains("_reportPage_"),
        "la lectura junta la respuesta y el informe del iframe",
        &format!("error {:?}, texto \"{texto}\"", l.error),
    );
    // Sin ese iframe, la burbuja sola no pasa por respuesta.
    let l = c.leer("chatgpt", &real).await;
    let error = mostrar(&l.error);
    a.anotar(
        error.starts_with("el informe de ChatGPT está en un iframe ("),
        "un informe en un iframe que no se pudo leer queda como error",
        &error,
    );
    Ok(())
}

/// Como Autoprueba.CompositorRecortado: el estado da scroll al contenedor que recorta el compositor e informa el zoom.
async fn compositor_recortado(
    a: &mut Anotador,
    navegador: &Navegador,
    ventana: &slint::Window,
) -> Result<(), String> {
    let c = abrir(navegador, ventana, "prueba-r", "recorte.html").await?;
    // #prompt-textarea, como la página.
    let s = spec("chatgpt")?;
    let mut estado = None;
    // Uno por llamada: la tercera ya no cambia nada.
    for _ in 0..3 {
        estado = Some(c.estado(&s).await?);
    }
    let overflow = cadena(&c.ejecutar("JSON.stringify([getComputedStyle(document.getElementById('contenedor')).overflowY, getComputedStyle(document.getElementById('afuera')).overflowY])").await?).unwrap_or_default();
    let alcanzable = c.ejecutar("(() => { const c = document.getElementById('contenedor'); c.scrollTop = c.scrollHeight; const b = document.getElementById('enviar').getBoundingClientRect(); return b.bottom <= c.getBoundingClientRect().bottom; })()").await? == "true";
    a.anotar(
        overflow == "[\"auto\",\"hidden\"]" && alcanzable,
        "el contenedor que recorta el compositor gana scroll; el que no recorta, no",
        &format!("overflow-y (contenedor, afuera) {overflow}, botón alcanzable {alcanzable}"),
    );
    let zoom = estado.and_then(|e| e.zoom);
    a.anotar(
        zoom == Some(100),
        "el estado informa el zoom del panel",
        &format!("zoom {zoom:?}"),
    );
    Ok(())
}

/// PRU-005: el PDF del informe lo arma informe-pdf (en la Unity, ImprimirPdf del panel).
fn pdf(a: &mut Anotador, datos: &Path) -> Result<(), String> {
    let markdown = Texto::from(
        "# Informe de prueba\n\nUn párrafo con ñ y acentos: áéíóú.\n\n- Un punto\n- Otro punto\n",
    );
    let ruta = datos.join("cc-autoprueba.pdf");
    std::fs::write(&ruta, informe_pdf::pdf_bytes(&markdown, "Autoprueba")?)
        .map_err(|e| e.to_string())?;
    let bytes = std::fs::read(&ruta).unwrap_or_default();
    let cabecera = String::from_utf8_lossy(&bytes[..bytes.len().min(5)]).into_owned();
    a.anotar(
        ruta.exists() && cabecera == "%PDF-" && bytes.len() > 1000,
        "PDF",
        &format!(
            "existe {}, cabecera \"{cabecera}\", {} bytes",
            ruta.exists(),
            bytes.len()
        ),
    );
    Ok(())
}

/// Como Autoprueba.SurrogateSuelto: un surrogate suelto de la página llega intacto por el puente.
async fn surrogate_suelto(a: &mut Anotador, p: &Panel) -> Result<(), String> {
    p.navegar(&format!("{ORIGEN}textarea.html")).await?;
    // Se arma en la página con fromCharCode y aquí por unidades UTF-16: ningún literal lo lleva.
    const EN_PAGINA: &str =
        "'a' + String.fromCharCode(0xD800) + 'b' + String.fromCharCode(0xDC00) + 'c'";
    let esperado = Texto::desde_utf16(&[0x61, 0xD800, 0x62, 0xDC00, 0x63]);
    let codigos = |t: Option<&Texto>| match t {
        Some(t) => t
            .a_utf16()
            .iter()
            .map(|c| format!("{c:04X}"))
            .collect::<Vec<_>>()
            .join(" "),
        None => "null".into(),
    };
    // 1. El camino de producción: pagina.js responde con JSON.stringify, que escapa el surrogate en ASCII.
    p.ejecutar(&format!(
        "document.getElementById('compositor').value = {EN_PAGINA}; 'ok'"
    ))
    .await?;
    let por_script = p.leer_compositor(SPEC_TEXTAREA).await?;
    a.anotar(
        por_script.as_ref() == Some(&esperado),
        "surrogate suelto llega intacto por pagina.js",
        &format!(
            "esperado {}, llegó {}",
            codigos(Some(&esperado)),
            codigos(por_script.as_ref())
        ),
    );
    // 2. Un script que pasa su resultado por JSON.stringify en la página (lo que hace el lector del iframe).
    let crudo = p
        .ejecutar_con_techo(
            &format!("JSON.stringify({EN_PAGINA})"),
            Duration::from_secs(10),
        )
        .await?;
    let envuelto = match nucleo::json::leer(&crudo) {
        Some(Valor::Texto(t)) => match t.como_str().and_then(nucleo::json::leer) {
            Some(Valor::Texto(t)) => Some(t),
            _ => None,
        },
        _ => None,
    };
    a.anotar(
        envuelto.as_ref() == Some(&esperado),
        "surrogate suelto llega intacto con JSON.stringify en la página",
        &format!(
            "esperado {}, llegó {}",
            codigos(Some(&esperado)),
            codigos(envuelto.as_ref())
        ),
    );
    // 3. Texto fuera del plano básico (un emoji, par de surrogates) de ida y vuelta por el puente.
    let con_emoji = Texto::from("antes \u{1F600} después");
    // escribir no pisa un compositor con texto.
    p.ejecutar("document.getElementById('compositor').value = ''; 'ok'")
        .await?;
    let escrito = p.escribir(SPEC_TEXTAREA, &con_emoji, ESPERA_CORRER).await;
    let emoji = p.leer_compositor(SPEC_TEXTAREA).await?;
    a.anotar(
        escrito.is_ok() && emoji.as_ref() == Some(&con_emoji),
        "texto fuera del plano básico llega intacto",
        &format!(
            "escribir {escrito:?}, esperado {}, llegó {}",
            codigos(Some(&con_emoji)),
            codigos(emoji.as_ref())
        ),
    );
    // 4. Medido, no exigido: el mismo texto devuelto crudo por ExecuteScript. Va último por si deja algo colgado.
    match p
        .ejecutar_con_techo(EN_PAGINA, Duration::from_secs(5))
        .await
    {
        Ok(crudo) => {
            let t = match nucleo::json::leer(&crudo) {
                Some(Valor::Texto(t)) => Some(t),
                _ => None,
            };
            a.medido(&format!(
                "resultado crudo con un surrogate suelto: llegó {}",
                codigos(t.as_ref())
            ));
        }
        Err(e) => a.medido(&format!(
            "resultado crudo con un surrogate suelto: ExecuteScript no devuelve nada ({e})"
        )),
    }
    Ok(())
}

/// CAP-014 e INV-CAP-003: el sondeo descarta el dato de una página que no responde y lo recupera cuando vuelve.
async fn sondeo(
    a: &mut Anotador,
    navegador: &Navegador,
    ventana: &slint::Window,
) -> Result<(), String> {
    let c = abrir(navegador, ventana, "prueba-s", "chatgpt.html").await?;
    let s = spec("chatgpt")?;
    let mut estados = HashMap::new();
    paneles::sondear(&[("chatgpt", &c, &s)], &mut estados).await;
    let antes = estados.get("chatgpt").cloned();
    // La página se cuelga 8 s a propósito: el estado no responde en su techo de 5 s.
    let reloj = Instant::now();
    let colgada = c.ejecutar_con_techo(
        "const hasta = Date.now() + 8000; while (Date.now() < hasta) {} 'fin'",
        Duration::from_secs(1),
    );
    let _ = paneles::dormir(Duration::from_millis(300)).await;
    let vuelta = Instant::now();
    paneles::sondear(&[("chatgpt", &c, &s)], &mut estados).await;
    let ms = vuelta.elapsed().as_millis();
    let colgado = estados.get("chatgpt").cloned();
    let _ = colgada.await;
    a.anotar(
        antes.is_some() && colgado.is_none(),
        "el sondeo descarta el dato de una página que no responde",
        &format!("antes {antes:?}, colgada {colgado:?}, la vuelta tardó {ms} ms"),
    );
    let resta = Duration::from_millis(8500).saturating_sub(reloj.elapsed());
    let _ = paneles::dormir(resta).await;
    paneles::sondear(&[("chatgpt", &c, &s)], &mut estados).await;
    let vuelve = estados.get("chatgpt").cloned();
    a.anotar(
        vuelve.is_some(),
        "el sondeo recupera el dato cuando la página vuelve",
        &format!("después {vuelve:?}"),
    );
    Ok(())
}

const ORIGEN: &str = "https://cc-prueba.test/";

/// El texto de un resultado JSON de ejecutar; None si es null o no es texto.
fn cadena(json: &str) -> Option<String> {
    match nucleo::json::leer(json) {
        Some(Valor::Texto(t)) => Some(t.para_mostrar().into_owned()),
        _ => None,
    }
}

/// Uri.EscapeDataString: todo menos las letras, los dígitos y «-._~» va como %XX.
fn escapar_url(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                char::from(b).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

async fn panel_basico(
    a: &mut Anotador,
    p: &Panel,
    version: &str,
    navegador: &Navegador,
    ventana: &slint::Window,
    escala: f64,
) -> Result<(), String> {
    // El perfil lo informa WebView2, no se repite el que se pidió.
    let perfil = p.perfil()?;
    a.anotar(
        perfil == "prueba-a",
        "perfil",
        &format!("el navegador dice \"{perfil}\""),
    );

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

    // Escribir y leer por pedido y consulta, con saltos de línea, sin navegar.
    let nav_antes = p.navegaciones();
    let texto = "Primera línea con ñ y acentos: áéíóú\nSegunda línea\n\nCuarta, tras una vacía";
    let escrito = p
        .correr(
            "escribir",
            SPEC_TEXTAREA,
            Some(&texto.into()),
            ESPERA_CORRER,
        )
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
    a.anotar(
        p.navegaciones() == nav_antes,
        "escribir no navega",
        &format!(
            "navegaciones antes {nav_antes}, después {}",
            p.navegaciones()
        ),
    );

    // El zoom que informa el estado de la página, sin tocar: 100.
    let estado = p
        .correr("estado", SPEC_TEXTAREA, None, ESPERA_CORRER)
        .await?;
    let zoom = match &estado {
        Valor::Objeto(o) => o
            .iter()
            .find(|(k, _)| k.como_str() == Some("zoom"))
            .map(|(_, v)| v.clone()),
        _ => None,
    };
    a.anotar(
        zoom == Some(Valor::Entero(100)),
        "zoom informado",
        &format!("el estado dice {zoom:?}"),
    );

    // IFZ-005: Ctrl + rueda cambia el zoom del panel, como en la Unity.
    let zoom_teclas = p.zoom_con_teclas();
    a.anotar(
        zoom_teclas == Ok(true),
        "Ctrl + rueda cambia el zoom",
        &format!("IsZoomControlEnabled {zoom_teclas:?}"),
    );

    // Contador de navegaciones: una navegación de verdad suma una.
    p.navegar(&format!("{ORIGEN}cierre.html")).await?;
    a.anotar(
        p.navegaciones() == nav_antes + 1,
        "contador de navegaciones",
        &format!("antes {nav_antes}, después de navegar {}", p.navegaciones()),
    );

    // PAN-005: un cierre de sesión que la página pide sola (sin gesto) se cancela y el panel se queda
    // donde estaba. Solo cuenta la navegación a cierre.html.
    for destino in ["/logout", "/auth/sign-out?vuelta=1"] {
        let (nav, bloqueadas) = (p.navegaciones(), p.bloqueadas());
        // El intento de la página se bloquea mientras carga y navegar lo informa.
        let _ = p
            .navegar(&format!("{ORIGEN}cierre.html?ir={}", escapar_url(destino)))
            .await;
        paneles::dormir(Duration::from_millis(1500)).await?;
        let url = cadena(&p.ejecutar("location.pathname").await?).unwrap_or_default();
        let ok = p.bloqueadas() == bloqueadas + 1
            && p.navegaciones() == nav + 1
            && url == "/cierre.html";
        a.anotar(
            ok,
            &format!("bloqueo de {destino}"),
            &format!(
                "bloqueadas {bloqueadas}→{}, navegaciones {nav}→{}, página {url}, última bloqueada {}",
                p.bloqueadas(),
                p.navegaciones(),
                p.ultima_bloqueada()
            ),
        );
    }

    // Navegar desde la app a un cierre de sesión no puede pasar por éxito.
    let aviso = p.navegar(&format!("{ORIGEN}signout")).await;
    a.anotar(
        aviso.is_err(),
        "navegar a un cierre de sesión avisa",
        &aviso
            .err()
            .unwrap_or_else(|| "navegar devolvió éxito".into()),
    );

    // Frente y detrás: dos paneles en el mismo rectángulo, medido con el orden real de las ventanas.
    let b = crate::crear_panel(navegador, ventana, "prueba-b", (0.0, 0.0, 800.0, 600.0)).await?;
    b.navegar(&format!("{ORIGEN}textarea.html")).await?;
    b.frente();
    a.anotar(
        b.es_frente() && !p.es_frente(),
        "frente",
        &format!(
            "b al frente: {}, a al frente: {}",
            b.es_frente(),
            p.es_frente()
        ),
    );
    b.atras();
    a.anotar(
        p.es_frente() && !b.es_frente(),
        "detrás",
        &format!("después de mandar b atrás, a al frente: {}", p.es_frente()),
    );
    // En píxeles de la ventana: 800×600 lógicos por la escala del monitor.
    let esperado = (
        0,
        0,
        (800.0 * escala).round() as i32,
        (600.0 * escala).round() as i32,
    );
    let r = p.rect_real();
    a.anotar(
        r == esperado,
        "rectángulo",
        &format!("la ventana del panel mide {r:?}"),
    );

    // PAN-011: un panel oculto se va fuera de la ventana con su tamaño, nunca a 0x0, y sigue respondiendo.
    b.rect(-900.0, 0.0, 800.0, 600.0)?;
    let fuera = b.rect_real();
    let responde = b.ejecutar("'sigue'").await?;
    a.anotar(
        fuera.0 < 0 && (fuera.2, fuera.3) == (esperado.2, esperado.3) && responde == "\"sigue\"",
        "panel oculto fuera de la ventana",
        &format!("mide {fuera:?} y responde {responde}"),
    );
    Ok(())
}

/// PAN-013 (D25): el archivo se suelta sobre el compositor con un arrastre simulado, como Paneles.Adjuntar.
/// La página informa nombre y tamaño de lo que recibió; adjuntar.html no tiene input, como Gemini.
async fn adjuntar(a: &mut Anotador, p: &Panel, datos: &Path) -> Result<(), String> {
    let archivo = datos.join("adjunto.txt");
    let contenido = "Archivo de prueba del consejo, con ñ.\n";
    std::fs::write(&archivo, contenido).map_err(|e| e.to_string())?;
    let esperado = format!("adjunto.txt|{}", contenido.len());

    // Portada de Autoprueba.Adjunto: la página tipo ChatGPT con la spec real.
    p.navegar(&format!("{ORIGEN}chatgpt.html")).await?;
    let r = p.adjuntar(&spec("chatgpt")?, &archivo).await;
    let visto = cadena(
        &p.ejecutar("document.getElementById('archivo').textContent")
            .await?,
    )
    .unwrap_or_default();
    a.anotar(
        r.is_ok() && visto == esperado,
        "adjunto soltado sobre el compositor (DevTools)",
        &format!("{r:?}, la página recibió \"{visto}\", se esperaba \"{esperado}\""),
    );

    p.navegar(&format!("{ORIGEN}adjuntar.html")).await?;
    let r = p.adjuntar(SPEC_TEXTAREA, &archivo).await;
    let visto = cadena(
        &p.ejecutar("document.getElementById('adjunto').textContent")
            .await?,
    )
    .unwrap_or_default();
    a.anotar(
        r.is_ok() && visto == esperado,
        "adjunto soltado en una página sin input de archivo",
        &format!("{r:?}, la página recibió \"{visto}\""),
    );

    // Revisión PART-012, hallazgo 8: un archivo que no existe no se adjunta en silencio.
    let falta = datos.join("no-existe.txt");
    let r = p.adjuntar(SPEC_TEXTAREA, &falta).await;
    a.anotar(
        r.as_ref()
            .err()
            .is_some_and(|e| e.starts_with("No existe el archivo ")),
        "adjuntar un archivo que no existe avisa",
        &format!("{r:?}"),
    );

    // Sin compositor, el error literal de Paneles.Adjuntar.
    let sin = p
        .adjuntar(
            &con_campo(
                SPEC_TEXTAREA,
                &["composer", "selector"],
                Valor::Texto("#no-esta".into()),
            )?,
            &archivo,
        )
        .await;
    a.anotar(
        sin.as_ref().err().map(String::as_str)
            == Some("No está el compositor: no hay dónde soltar el archivo."),
        "adjuntar sin compositor avisa",
        &format!("{sin:?}"),
    );
    Ok(())
}

/// Marca sintética en el almacenamiento del origen de prueba, en perfiles temporales: mide perfiles, no lee nada real.
const LEER_MARCA: &str = "localStorage.getItem('cc-marca')";

/// La última emergente del panel, distinta de `anterior`, en hasta 15 s.
async fn esperar_emergente(
    p: &Panel,
    anterior: Option<&Weak<Panel>>,
) -> Result<Option<Weak<Panel>>, String> {
    let reloj = Instant::now();
    while reloj.elapsed() < Duration::from_secs(15) {
        if let Some(e) = p.emergente()
            && anterior.is_none_or(|w| !std::ptr::eq(w.as_ptr(), Rc::as_ptr(&e)))
        {
            e.esperar_carga().await;
            return Ok(Some(Rc::downgrade(&e)));
        }
        paneles::dormir(Duration::from_millis(100)).await?;
    }
    Ok(None)
}

async fn perfiles(
    a: &mut Anotador,
    p: &Panel,
    navegador: &Navegador,
    ventana: &slint::Window,
    datos: &Path,
) -> Result<(), String> {
    p.navegar(&format!("{ORIGEN}emergente.html")).await?;
    p.ejecutar("localStorage.setItem('cc-marca', 'perfil-a'); 'ok'")
        .await?;

    // PAN-004: la emergente, en el mismo perfil, con window.opener, y se cierra con window.close().
    p.ejecutar("document.getElementById('abrir').click(); 'ok'")
        .await?;
    let reloj = Instant::now();
    let mut e = p.emergente();
    while e.is_none() && reloj.elapsed() < Duration::from_secs(15) {
        paneles::dormir(Duration::from_millis(100)).await?;
        e = p.emergente();
    }
    let Some(e) = e else {
        a.anotar(false, "ventana emergente", "no apareció en 15 s");
        return Ok(());
    };
    e.esperar_carga().await;
    let opener = cadena(
        &e.ejecutar("window.opener ? window.opener.location.origin : null")
            .await?,
    );
    let marca = cadena(&e.ejecutar(LEER_MARCA).await?);
    let perfil = e.perfil()?;
    a.anotar(
        opener.as_deref() == Some("https://cc-prueba.test")
            && marca.as_deref() == Some("perfil-a")
            && perfil == "prueba-a",
        "ventana emergente con opener en el mismo perfil",
        &format!(
            "opener {}, perfil {perfil}, marca del perfil {}",
            opener.as_deref().unwrap_or("null"),
            marca.as_deref().unwrap_or("null")
        ),
    );
    e.ejecutar("document.getElementById('cerrar').click(); 'ok'")
        .await?;
    let reloj = Instant::now();
    while e.abierto() && reloj.elapsed() < Duration::from_secs(5) {
        paneles::dormir(Duration::from_millis(100)).await?;
    }
    a.anotar(
        !e.abierto(),
        "la emergente se cierra con window.close()",
        &format!("abierta después: {}", e.abierto()),
    );
    // Revisión PART-012, hallazgo 3: como Liberar de panel.cpp, la emergente cerrada se suelta entera.
    drop(e);
    a.anotar(
        p.emergente().is_none(),
        "la emergente cerrada se libera",
        &format!("el panel todavía la tiene: {}", p.emergente().is_some()),
    );
    // Dos window.open seguidas: la segunda no cierra la primera (panel.cpp guarda cada una hasta que se cierra).
    // Se guardan débiles: solo el panel decide cuánto viven.
    p.ejecutar("document.getElementById('abrir').click(); 'ok'")
        .await?;
    let primera = esperar_emergente(p, None).await?;
    p.ejecutar("document.getElementById('abrir').click(); 'ok'")
        .await?;
    let segunda = esperar_emergente(p, primera.as_ref()).await?;
    let abierta = |w: &Option<Weak<Panel>>| {
        w.as_ref()
            .and_then(Weak::upgrade)
            .is_some_and(|x| x.abierto())
    };
    a.anotar(
        abierta(&primera) && abierta(&segunda),
        "una segunda emergente no cierra la primera",
        &format!(
            "primera abierta: {}, segunda abierta: {}",
            abierta(&primera),
            abierta(&segunda)
        ),
    );
    for w in [primera, segunda].into_iter().flatten() {
        if let Some(x) = w.upgrade() {
            x.ejecutar("window.close(); 'ok'").await?;
        }
    }

    // Aislamiento: otro perfil, mismo origen, no ve la marca.
    let b = crate::crear_panel(navegador, ventana, "prueba-b", (-900.0, 0.0, 800.0, 600.0)).await?;
    b.navegar(&format!("{ORIGEN}textarea.html")).await?;
    let otra = cadena(&b.ejecutar(LEER_MARCA).await?);
    a.anotar(
        otra.is_none(),
        "aislamiento entre dos perfiles",
        &format!(
            "prueba-b ve la marca de prueba-a: {}",
            otra.as_deref().unwrap_or("null")
        ),
    );
    drop(b);

    // INV-PAN-003: en el perfil compartido se borra solo el sitio; otro host del perfil sigue.
    const MARCA_Y_GALLETA: &str =
        "(localStorage.getItem('cc-marca') || '') + '|' + document.cookie";
    p.ejecutar("document.cookie = 'cc-galleta=a; max-age=3600; path=/'; 'ok'")
        .await?;
    p.navegar("https://cc-otro.test/textarea.html").await?;
    p.ejecutar("localStorage.setItem('cc-marca', 'otro'); document.cookie = 'cc-galleta=b; max-age=3600; path=/'; 'ok'")
        .await?;
    p.borrar_sitio(&format!("{ORIGEN}textarea.html")).await?;
    let del_otro = cadena(&p.ejecutar(MARCA_Y_GALLETA).await?).unwrap_or_default();
    p.navegar(&format!("{ORIGEN}textarea.html")).await?;
    let del_propio = cadena(&p.ejecutar(MARCA_Y_GALLETA).await?).unwrap_or_default();
    a.anotar(
        del_propio == "|" && del_otro == "otro|cc-galleta=b",
        "borrado de un solo sitio",
        &format!("propio \"{del_propio}\", el otro \"{del_otro}\""),
    );

    // Revisión PART-012, hallazgo 7: sin las páginas de prueba, borrar el perfil entero se niega.
    let sin_paginas = Navegador::new(datos, None);
    let c = crate::crear_panel(
        &sin_paginas,
        ventana,
        "prueba-c",
        (-900.0, 0.0, 800.0, 600.0),
    )
    .await?;
    let negado = c.borrar_datos().await;
    a.anotar(
        negado.is_err(),
        "borrar el perfil entero se niega sin las páginas de prueba",
        &format!("{negado:?}"),
    );
    drop(c);

    // Borrado de los datos del perfil.
    p.borrar_datos().await?;
    p.navegar(&format!("{ORIGEN}textarea.html")).await?;
    let despues = cadena(&p.ejecutar(LEER_MARCA).await?);
    a.anotar(
        despues.is_none(),
        "borrado de los datos del perfil",
        &format!(
            "marca después de borrar: {}",
            despues.as_deref().unwrap_or("null")
        ),
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

    // Medido, no exigido: cuánto tarda en volver una página recargada con el bucle en curso.
    let recarga = Instant::now();
    let vuelta = async {
        c.recargar().await?;
        c.ejecutar_con_techo("'vuelve'", Duration::from_secs(3))
            .await
    }
    .await;
    a.medido(&format!(
        "recargar una página trabada: {} a los {} ms del bucle de 15 s (recarga {} ms){}",
        if vuelta.as_deref() == Ok("\"vuelve\"") {
            "respondió"
        } else {
            "no respondió"
        },
        reloj.elapsed().as_millis(),
        recarga.elapsed().as_millis(),
        vuelta
            .as_ref()
            .err()
            .map(|e| format!(": {e}"))
            .unwrap_or_default()
    ));
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
