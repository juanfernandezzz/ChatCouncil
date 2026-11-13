//! PRU-001: `-autoprueba RUTA`, con el formato de Autoprueba.cs de la Unity y las comprobaciones que
//! el esqueleto ya puede hacer. Todo en una carpeta temporal nueva (INV-PRU-001).

use std::path::Path;
use std::rc::{Rc, Weak};
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

    let r = panel_basico(a, &panel, &version, &navegador, ventana, f64::from(escala)).await;
    a.grupo("panel", r);
    let r = adjuntar(a, &panel, datos).await;
    a.grupo("adjuntar", r);
    let r = nucleo(a, datos).await;
    a.grupo("núcleo", r);
    let r = perfiles(a, &panel, &navegador, ventana, datos).await;
    a.grupo("perfiles", r);
    let r = techo_externo(a, &panel, &navegador, ventana).await;
    a.grupo("techo externo", r);
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

/// PAN-013: en una página con un input de archivo, la página informa el nombre y el tamaño de lo adjuntado.
async fn adjuntar(a: &mut Anotador, p: &Panel, datos: &Path) -> Result<(), String> {
    let archivo = datos.join("adjunto.txt");
    let contenido = "Archivo de prueba del consejo, con ñ.\n";
    std::fs::write(&archivo, contenido).map_err(|e| e.to_string())?;
    p.navegar(&format!("{ORIGEN}adjuntar.html")).await?;
    let r = p.adjuntar(SPEC_TEXTAREA, &archivo).await;
    let informa = cadena(
        &p.ejecutar("document.getElementById('adjunto').textContent")
            .await?,
    )
    .unwrap_or_default();
    let esperado = format!("adjunto.txt|{}", contenido.len());
    a.anotar(
        r.is_ok() && informa == esperado,
        "adjuntar un archivo",
        &format!("{r:?}, la página informa \"{informa}\""),
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

    // Sin input de archivo, el error literal.
    p.navegar(&format!("{ORIGEN}textarea.html")).await?;
    let sin = p.adjuntar(SPEC_TEXTAREA, &archivo).await;
    a.anotar(
        sin.as_ref().err().map(String::as_str)
            == Some("No hay un <input type=file> en la página: no se puede adjuntar."),
        "adjuntar sin input avisa",
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
