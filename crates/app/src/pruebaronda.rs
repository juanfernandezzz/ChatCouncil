//! PRU-012, PRU-013 y PRU-016: `-pruebaronda RUTA`, el port de PruebaRonda.cs. El recorrido de las etapas
//! Pregunta e Investigación con los controles reales, sobre una carpeta de prueba (-datos), nunca la real, y
//! una página local por operador (ronda.html) en lugar de los proveedores. Lo que hace la persona en cada
//! página (enviar) y lo que hace el proveedor (responder) lo simula un script en la página; la app nunca
//! envía. Llega hasta «fin de la investigación» y sigue con el diálogo cancelado, abandonar la ronda,
//! capturar sin pegar y declarar la pregunta. PART-016 agrega la operación, los roles y el informe.

use std::path::Path;
use std::rc::Rc;
use std::time::{Duration, Instant};

use nucleo::json::{self, Valor};
use nucleo::puerta;
use nucleo::registro::{self, Hecho};
use slint::{ComponentHandle, Model};

use crate::autoprueba::Anotador;
use crate::interfaz::Interfaz;
use crate::lector;

const LA_PREGUNTA: &str =
    "Primera línea de la pregunta\nSegunda línea, con ñ y acentos: áéíóú\n\nCuarta, tras una vacía";
// D62: qwen verifica y perplexity investiga.
const POOL: [&str; 7] = [
    "chatgpt",
    "gemini",
    "claude",
    "grok",
    "mistral",
    "kimi",
    "perplexity",
];
const A_MANO: &str = "Pregunta escrita a mano en cada página";

async fn esperar(ms: u64) {
    let _ = paneles::dormir(Duration::from_millis(ms)).await;
}

/// Espera hasta que la condición se cumpla o pase el límite; dice si se cumplió.
async fn hasta(segundos: u64, mut condicion: impl FnMut() -> bool) -> bool {
    let limite = Instant::now() + Duration::from_secs(segundos);
    while Instant::now() < limite {
        if condicion() {
            return true;
        }
        esperar(200).await;
    }
    condicion()
}

fn respuesta_de(id: &str) -> String {
    format!(
        "Respuesta de {id}: {}",
        "un párrafo largo de prueba, con ñ y acentos. ".repeat(10)
    )
}

/// Una cadena JS con comillas, como JsonConvert.ToString.
fn cadena_js(s: &str) -> String {
    let mut b = Vec::new();
    json::escribir(&Valor::Texto(s.into()), &mut b);
    String::from_utf8(b).unwrap_or_default()
}

async fn en(i: &Interfaz, id: &str, js: &str) -> Result<String, String> {
    let p = i
        .panel_de(id)
        .ok_or_else(|| format!("no está el panel de {id}"))?;
    p.ejecutar(js).await
}

async fn compositor(i: &Interfaz, id: &str) -> String {
    match en(i, id, "document.getElementById('compositor').value")
        .await
        .ok()
        .and_then(|r| json::leer(&r))
    {
        Some(Valor::Texto(t)) => t.para_mostrar().into_owned(),
        _ => String::new(),
    }
}

/// Lo que hace la persona: enviar. El texto pasa al chat y aparece el botón de detener.
async fn enviar(i: &Interfaz, id: &str) -> Result<String, String> {
    en(i, id, "(() => { const c = document.getElementById('compositor'); const u = document.createElement('div'); u.className = 'usuario'; u.textContent = c.value; document.getElementById('chat').append(u); c.value = ''; const d = document.createElement('button'); d.id = 'detener'; document.body.append(d); return 'ok'; })()").await
}

/// Lo que hace el proveedor: responder y terminar.
async fn responder(i: &Interfaz, id: &str, texto: &str) -> Result<String, String> {
    let js = format!(
        "(() => {{ const r = document.createElement('div'); r.className = 'respuesta'; r.textContent = {}; document.getElementById('chat').append(r); document.getElementById('detener')?.remove(); return 'ok'; }})()",
        cadena_js(texto)
    );
    en(i, id, &js).await
}

async fn hechos(i: &Interfaz) -> Vec<Hecho> {
    let Some(r) = i.ronda.borrow().clone() else {
        return Vec::new();
    };
    r.nucleo
        .pedir(|p| p.leer_registro().map(|l| l.hechos.clone()))
        .await
        .ok()
        .and_then(Result::ok)
        .unwrap_or_default()
}

async fn ronda_actual(i: &Interfaz) -> Option<String> {
    let r = i.ronda.borrow().clone()?;
    r.nucleo
        .pedir(|p| p.ronda_actual().map(String::from))
        .await
        .ok()
        .flatten()
}

async fn lineas_del_registro(i: &Interfaz) -> usize {
    let Some(r) = i.ronda.borrow().clone() else {
        return 0;
    };
    let Some(c) = r
        .nucleo
        .pedir(|p| p.conversacion_actual().map(String::from))
        .await
        .ok()
        .flatten()
    else {
        return 0;
    };
    std::fs::read_to_string(registro::ruta_archivo(&i.datos, &c))
        .map(|t| t.lines().count())
        .unwrap_or(0)
}

fn de_tipo<'a>(h: &'a [Hecho], tipo: &str) -> Vec<&'a Hecho> {
    h.iter().filter(|x| x.tipo() == tipo).collect()
}

fn texto_de(h: &Hecho, campo: &str) -> Option<String> {
    h.texto(campo).map(|t| t.para_mostrar().into_owned())
}

fn continuidad(h: &Hecho) -> Option<String> {
    match h.valor("procedencia") {
        Valor::Objeto(v) => v.iter().find_map(|(k, x)| match x {
            Valor::Texto(t) if k.como_str() == Some("continuidad") => {
                Some(t.para_mostrar().into_owned())
            }
            _ => None,
        }),
        _ => None,
    }
}

fn estado_en_la_lista(i: &Interfaz, id: &str) -> String {
    i.filas
        .iter()
        .find(|f| f.id == id)
        .map(|f| f.estado.to_string())
        .unwrap_or_default()
}

fn estados_en_la_lista(i: &Interfaz) -> String {
    POOL.iter()
        .map(|id| format!("{id} {}", estado_en_la_lista(i, id)))
        .collect::<Vec<_>>()
        .join(", ")
}

pub async fn correr(i: Rc<Interfaz>, salida: &Path) -> i32 {
    let mut a = Anotador::default();
    a.linea(format!(
        "Prueba de la Ronda (T20), {}, {}, {}",
        crate::ahora_local(),
        std::env::consts::OS,
        env!("CARGO_PKG_VERSION")
    ));
    esperar(300).await;
    let r = recorrido(&mut a, &i, salida).await;
    a.grupo("prueba", r);
    let r = teclado_y_lector(&mut a, &i).await;
    a.grupo("secciones, accesibilidad y teclado", r);
    let r = caidas(&mut a, &i).await;
    a.grupo("caídas", r);
    let (texto, mut codigo) = a.cerrar();
    if let Err(e) = std::fs::write(salida, texto) {
        eprintln!("No se pudo escribir {}: {e}", salida.display());
        codigo = 1;
    }
    codigo
}

async fn recorrido(a: &mut Anotador, i: &Rc<Interfaz>, salida: &Path) -> Result<(), String> {
    let ui = &i.ui;
    let paso = || ui.get_paso_texto().to_string();
    let resultado = || ui.get_resultado().to_string();

    // El primer arranque, con lo que viene marcado: los diez y los roles por defecto.
    ui.invoke_guardar();
    ui.invoke_empezar();
    let abiertos = hasta(60, || POOL.iter().all(|id| i.panel_de(id).is_some())).await;
    let operadores = i
        .ronda
        .borrow()
        .as_ref()
        .map(|r| r.operadores.clone())
        .unwrap_or_default();
    a.anotar(
        abiertos
            && operadores == POOL
            && ["deepseek", "glm", "qwen"]
                .iter()
                .all(|id| i.panel_de(id).is_none()),
        "paneles del pool",
        &format!(
            "operadores [{}]; sin página el integrador y los verificadores (historia 26)",
            operadores.join(",")
        ),
    );
    hasta(10, || paso() == "Pegar la pregunta en los paneles").await;
    a.anotar(
        paso() == "Pegar la pregunta en los paneles"
            && ui.get_barra_titulo() == "Pregunta · 1 de 7"
            && ui.get_etapa_pregunta()
            && ui.get_ancha(),
        "etapa Pregunta",
        &format!("\"{}\", campo de la pregunta a la vista", paso()),
    );

    ui.invoke_paso();
    hasta(5, || !resultado().is_empty()).await;
    a.anotar(
        resultado() == "Escribe la pregunta antes de pegarla." && ronda_actual(i).await.is_none(),
        "pregunta vacía",
        &format!("\"{}\", sin ronda", resultado()),
    );

    // Un borrador en Grok: no se escribe encima (historia 30).
    en(
        i,
        "grok",
        "document.getElementById('compositor').value = 'borrador mío'; 'ok'",
    )
    .await?;
    ui.set_pregunta(LA_PREGUNTA.into());
    ui.invoke_paso();
    hasta(5, || ui.get_capa_abierta()).await;
    let capa = ui.get_capa_abierta() && ui.get_dialogo_titulo() == "Antes de pegar la pregunta";
    let apartada = i.panel_visible().is_some_and(|p| p.rect_real().0 < 0);
    a.anotar(
        capa && apartada,
        "aviso de capacidades",
        &format!("diálogo abierto: {capa}; la página se aparta: {apartada}"),
    );
    ui.set_dialogo_casilla(true);
    ui.invoke_dialogo_aceptar();
    hasta(60, || resultado().starts_with("Pegada")).await;

    let h = hechos(i).await;
    let rondas = de_tipo(&h, "ronda");
    let condicion = de_tipo(&h, "condicion-proveedores-cargados");
    let intentos = de_tipo(&h, "intento");
    let prompt = rondas.first().and_then(|r| texto_de(r, "prompt"));
    let cargados = condicion
        .first()
        .map_or(0, |c| match c.valor("proveedores") {
            Valor::Lista(v) => v.len(),
            _ => 0,
        });
    let integrador = condicion.first().and_then(|c| texto_de(c, "integrador"));
    a.anotar(
        rondas.len() == 1
            && prompt.as_deref() == Some(LA_PREGUNTA)
            && cargados == 10
            && integrador.as_deref() == Some("deepseek"),
        "ronda abierta",
        &format!(
            "prompt idéntico: {}; condición: {cargados} cargados, integra {}",
            prompt.as_deref() == Some(LA_PREGUNTA),
            integrador.unwrap_or_default()
        ),
    );
    let ok = |x: &Hecho| x.valor("ok") == &Valor::Bool(true);
    let grok = intentos
        .iter()
        .find(|x| texto_de(x, "proveedorId").as_deref() == Some("grok"));
    let error_grok = grok.and_then(|g| texto_de(g, "error")).unwrap_or_default();
    a.anotar(
        intentos.len() == 7
            && intentos.iter().filter(|x| ok(x)).count() == 6
            && grok.is_some_and(|g| !ok(g))
            && error_grok.contains("borrador"),
        "un intento por proveedor",
        &format!(
            "{} intentos, {} bien; Grok: \"{error_grok}\"",
            intentos.len(),
            intentos.iter().filter(|x| ok(x)).count()
        ),
    );
    let mut pegadas = 0;
    for id in POOL.iter().filter(|id| **id != "grok") {
        if compositor(i, id).await == LA_PREGUNTA {
            pegadas += 1;
        }
    }
    let borrador = compositor(i, "grok").await == "borrador mío";
    a.anotar(
        pegadas == 6 && borrador,
        "saltos de línea y borrador",
        &format!(
            "pregunta idéntica en {pegadas} de 6; el borrador de Grok sigue intacto: {borrador}"
        ),
    );
    a.anotar(
        resultado() == "Pegada en 6 de 7. Los que fallaron dicen qué hacer en su cabecera.",
        "resultado del pegado",
        &resultado(),
    );
    // IFZ-001, IFZ-002 e IFZ-006: la barra pasa a Investigación, los seis pegados esperan que la persona
    // envíe y capturar queda deshabilitado con «(0)».
    let esperan = hasta(10, || {
        POOL.iter()
            .filter(|id| **id != "grok")
            .all(|id| estado_en_la_lista(i, id) == "Pegado, falta que envíes")
    })
    .await;
    a.anotar(
        esperan
            && ui.get_barra_titulo() == "Investigación · 2 de 7"
            && paso() == "Capturar los que terminaron (0)"
            && !ui.get_paso_habilitado(),
        "investigación sin enviar",
        &format!(
            "\"{}\", \"{}\" habilitado {}; {}",
            ui.get_barra_titulo(),
            paso(),
            ui.get_paso_habilitado(),
            estados_en_la_lista(i)
        ),
    );
    // INV-IFZ-006: cada fila trae el símbolo y la palabra, y el símbolo es el de su estado.
    let sin_par: Vec<String> = i
        .filas
        .iter()
        .filter(|f| {
            f.icono.is_empty()
                || f.estado.is_empty()
                || ![
                    "por-pegar",
                    "falta-enviar",
                    "respondiendo",
                    "terminado",
                    "capturado",
                    "problema",
                ]
                .contains(&f.icono.as_str())
        })
        .map(|f| f.id.to_string())
        .collect();
    a.anotar(
        sin_par.is_empty() && i.filas.row_count() == cargados,
        "símbolo y palabra",
        &format!(
            "{} filas; sin el par: [{}]",
            i.filas.row_count(),
            sin_par.join(",")
        ),
    );

    // Grok: qué pasó y qué hacer, y pegar solo ahí (historia 29), sin ronda ni intento nuevos.
    i.seleccionar("grok");
    hasta(30, || ui.get_accion_texto() == "Pegar la pregunta aquí").await;
    let problema = ui.get_cabecera_problema().to_string();
    let corto = ui.get_selector_problema().to_string();
    // IFZ-005: la cabecera y el selector dicen el proveedor, la palabra y la posición.
    a.anotar(
        ui.get_cabecera_titulo() == "Grok · Con problema"
            && ui.get_selector_texto() == "Grok · Con problema · 4 de 7"
            && ui.get_icono_visible() == "problema",
        "cabecera y selector",
        &format!(
            "\"{}\"; \"{}\"; símbolo {}",
            ui.get_cabecera_titulo(),
            ui.get_selector_texto(),
            ui.get_icono_visible()
        ),
    );
    a.anotar(
        problema.starts_with("La pregunta no se pegó: el compositor ya tenía texto")
            && corto == "No se pegó: pégala otra vez desde «Más…».",
        "problema en la cabecera y en el selector",
        &format!("cabecera \"{problema}\"; selector \"{corto}\""),
    );
    en(
        i,
        "grok",
        "document.getElementById('compositor').value = ''; 'ok'",
    )
    .await?;
    // Revisión PART-015: un doble clic hace una sola acción.
    ui.invoke_accion_panel();
    ui.invoke_accion_panel();
    hasta(30, || resultado().starts_with("Pegada en Grok")).await;
    esperar(1000).await;
    let h = hechos(i).await;
    let (n_intentos, n_rondas) = (de_tipo(&h, "intento").len(), de_tipo(&h, "ronda").len());
    a.anotar(
        compositor(i, "grok").await == LA_PREGUNTA
            && resultado().starts_with("Pegada en Grok")
            && n_intentos == 7
            && n_rondas == 1,
        "pegar en este panel",
        &format!(
            "\"{}\"; intentos {n_intentos}, rondas {n_rondas}",
            resultado()
        ),
    );

    // La persona envía en los siete; el indicador lo ve.
    for id in POOL {
        enviar(i, id).await?;
    }
    let respondiendo = hasta(30, || {
        POOL.iter()
            .filter(|id| **id != "grok")
            .all(|id| estado_en_la_lista(i, id) == "Respondiendo")
    })
    .await;
    a.anotar(
        respondiendo,
        "indicador: respondiendo",
        &estados_en_la_lista(i),
    );
    // ESC-006: con el mensaje ya enviado, repegar no duplica la pregunta ni deja intento nuevo.
    i.pegar_en_este("grok".into()).await;
    let n_intentos = de_tipo(&hechos(i).await, "intento").len();
    a.anotar(
        resultado()
            == "No se pegó en Grok: el chat ya tiene un mensaje enviado: no se vuelve a pegar para no duplicar la pregunta"
            && compositor(i, "grok").await.is_empty()
            && n_intentos == 7,
        "repegar con el mensaje ya enviado",
        &format!("\"{}\"; intentos {n_intentos}", resultado()),
    );

    // Responden todos menos Perplexity; Kimi, muy corto.
    for id in POOL.iter().filter(|id| **id != "perplexity") {
        let t = if *id == "kimi" {
            "Respuesta corta de Kimi, de menos de trescientos caracteres.".to_string()
        } else {
            respuesta_de(id)
        };
        responder(i, id, &t).await?;
    }
    let terminados = ["chatgpt", "gemini", "claude", "mistral", "kimi"];
    let listos = hasta(30, || {
        terminados
            .iter()
            .all(|id| estado_en_la_lista(i, id) == "Parece terminado")
            && estado_en_la_lista(i, "perplexity") == "Respondiendo"
            && paso() == "Capturar los que terminaron (5)"
    })
    .await;
    a.anotar(
        listos && ui.get_paso_habilitado() && !ui.get_ocupado(),
        "indicador: parece terminado",
        &format!("\"{}\"; {}", paso(), estados_en_la_lista(i)),
    );
    a.anotar(
        ui.get_contadores() == "Enviados 6 de 7 · Parecen terminados 5 · Capturados 0",
        "contadores",
        &ui.get_contadores(),
    );
    // IFZ-003: la clase angosta los dice en una línea corta.
    a.anotar(
        ui.get_contadores_angosta() == "6 de 7 enviados · 5 terminados",
        "contadores en la clase angosta",
        &ui.get_contadores_angosta(),
    );

    // INV-CAP-002: el estado solo avisa. Con cinco en «Parece terminado» y varios sondeos sin tocar nada,
    // el registro no tiene ninguna Respuesta.
    esperar(4 * paneles::SONDEO.as_millis() as u64).await;
    let solas = de_tipo(&hechos(i).await, "respuesta").len();
    a.anotar(
        solas == 0,
        "sin captura sola",
        &format!("respuestas tras cuatro sondeos sin tocar nada: {solas}"),
    );

    ui.invoke_paso();
    ui.invoke_paso();
    hasta(60, || resultado().starts_with("Capturados")).await;
    esperar(1000).await;
    let h = hechos(i).await;
    let respuestas = de_tipo(&h, "respuesta");
    let mut de: Vec<String> = respuestas
        .iter()
        .filter_map(|r| texto_de(r, "proveedorId"))
        .collect();
    de.sort();
    let mut esperados: Vec<String> = terminados.iter().map(|s| s.to_string()).collect();
    esperados.sort();
    a.anotar(
        de == esperados
            && respuestas.iter().all(|r| {
                r.valor("error") == &Valor::Nulo
                    && texto_de(r, "promptUsuarioLeido").as_deref() == Some(LA_PREGUNTA)
            }),
        "capturar los que terminaron",
        &format!("respuestas de [{}]; \"{}\"", de.join(","), resultado()),
    );
    // Que los prompts coincidan es una buena noticia: no va en el color del problema.
    let en_rojo = ui.get_resultado_problema();
    a.anotar(
        !en_rojo,
        "aviso de prompts que coinciden",
        if en_rojo {
            "marcado como problema"
        } else {
            "sin el color del problema"
        },
    );
    let chatgpt = respuestas
        .iter()
        .find(|r| texto_de(r, "proveedorId").as_deref() == Some("chatgpt"));
    let mut continuidades: Vec<String> = respuestas
        .iter()
        .map(|r| continuidad(r).unwrap_or_default())
        .collect();
    continuidades.dedup();
    a.anotar(
        chatgpt.and_then(|r| texto_de(r, "textoOriginal")) == Some(respuesta_de("chatgpt"))
            && continuidades == ["indeterminada"],
        "texto y procedencia",
        &format!("texto idéntico; continuidad {}", continuidades.join(",")),
    );
    let corta = de_tipo(&h, "error-captura")
        .into_iter()
        .find(|e| texto_de(e, "proveedorId").as_deref() == Some("kimi"))
        .and_then(|e| texto_de(e, "detalle"));
    a.anotar(
        corta.as_deref()
            == Some("respuesta sospechosamente corta: puede haber quedado fuera de la captura"),
        "respuesta corta marcada",
        corta.as_deref().unwrap_or("sin ErrorCaptura"),
    );
    // PRU-018: para las capturas de la etapa con un panel con problema.
    copiar(&i.datos, &con_sufijo(salida, ".investigacion")).map_err(|e| e.to_string())?;

    // Grok respondió después de pegar aquí: se captura solo ese panel.
    i.seleccionar("grok");
    hasta(30, || {
        ui.get_accion_texto().starts_with("Capturar este panel")
    })
    .await;
    ui.invoke_accion_panel();
    let mut h = Vec::new();
    for _ in 0..300 {
        h = hechos(i).await;
        if de_tipo(&h, "respuesta")
            .iter()
            .any(|r| texto_de(r, "proveedorId").as_deref() == Some("grok"))
        {
            break;
        }
        esperar(200).await;
    }
    let respuestas = de_tipo(&h, "respuesta");
    let de_grok = respuestas
        .iter()
        .filter(|r| texto_de(r, "proveedorId").as_deref() == Some("grok"))
        .count();
    a.anotar(
        de_grok == 1 && respuestas.len() == 6,
        "capturar este panel",
        &format!("Grok capturado; respuestas {}", respuestas.len()),
    );

    // Perplexity termina: la segunda captura confirma la continuidad (no navegó).
    responder(i, "perplexity", &respuesta_de("perplexity")).await?;
    hasta(30, || {
        paso() == "Capturar los que terminaron (1)" && !ui.get_ocupado()
    })
    .await;
    ui.invoke_paso();
    let mut tardia = None;
    for _ in 0..300 {
        tardia = de_tipo(&hechos(i).await, "respuesta")
            .into_iter()
            .find(|r| texto_de(r, "proveedorId").as_deref() == Some("perplexity"))
            .and_then(continuidad);
        if tardia.is_some() {
            break;
        }
        esperar(200).await;
    }
    a.anotar(
        tardia.as_deref() == Some("confirmada"),
        "continuidad confirmada",
        tardia.as_deref().unwrap_or("sin respuesta"),
    );
    let fin = hasta(30, || {
        ui.get_barra_titulo() == "Operación · 3 de 7"
            && paso() == "Pegar la operación en los paneles"
            && POOL
                .iter()
                .all(|id| estado_en_la_lista(i, id) == "Por pegar")
    })
    .await;
    a.anotar(
        fin && ui.get_paso_habilitado(),
        "fin de la investigación",
        &format!(
            "\"{}\", \"{}\"; {}",
            ui.get_barra_titulo(),
            paso(),
            estados_en_la_lista(i)
        ),
    );
    operacion(a, i, salida).await?;

    // PRU-016. Un diálogo cancelado no deja su acción: un «Aceptar» después no abandona nada.
    let antes = ronda_actual(i).await;
    i.dialogo_abandonar();
    ui.invoke_dialogo_cancelar();
    ui.invoke_dialogo_aceptar();
    esperar(500).await;
    let sigue = ronda_actual(i).await == antes && antes.is_some();
    a.anotar(
        sigue,
        "diálogo cancelado",
        &format!("la ronda sigue abierta: {sigue}"),
    );

    // Abandonar la ronda (D13): vuelve a Pregunta sin escribir nada.
    let lineas_antes = lineas_del_registro(i).await;
    i.dialogo_abandonar();
    ui.invoke_dialogo_aceptar();
    hasta(10, || paso() == "Pegar la pregunta en los paneles").await;
    let lineas_despues = lineas_del_registro(i).await;
    a.anotar(
        ronda_actual(i).await.is_none()
            && paso() == "Pegar la pregunta en los paneles"
            && lineas_despues == lineas_antes,
        "abandonar la ronda",
        &format!(
            "\"{}\"; líneas del registro {lineas_antes} → {lineas_despues}",
            paso()
        ),
    );

    // Capturar lo que ya está en pantalla, sin pegar, y declarar la pregunta (historia 40).
    for id in POOL {
        let js = format!(
            "(() => {{ document.getElementById('chat').innerHTML = ''; const u = document.createElement('div'); u.className = 'usuario'; u.textContent = {}; document.getElementById('chat').append(u); return 'ok'; }})()",
            cadena_js(A_MANO)
        );
        en(i, id, &js).await?;
    }
    for id in POOL {
        responder(i, id, &format!("{} (segunda)", respuesta_de(id))).await?;
    }
    i.capturar_todo().await;
    hasta(60, || paso() == "Declarar la pregunta de esta ronda").await;
    let h = hechos(i).await;
    let sin_envio = de_tipo(&h, "ronda").into_iter().last();
    let id_sin_envio = sin_envio.and_then(|r| texto_de(r, "id"));
    let de_esa = de_tipo(&h, "respuesta")
        .iter()
        .filter(|r| id_sin_envio.is_some() && texto_de(r, "rondaId") == id_sin_envio)
        .count();
    let indice = sin_envio.and_then(|r| r.entero("indice"));
    // Índice 2: el recorrido de la operación abrió antes una ronda copiada.
    a.anotar(
        sin_envio.and_then(|r| texto_de(r, "prompt")).as_deref() == Some(puerta::PROMPT_SIN_RONDA)
            && indice == Some(2)
            && de_esa == 7,
        "capturar sin pegar",
        &format!(
            "ronda {} con el marcador; {de_esa} respuestas; \"{}\"",
            indice.unwrap_or(0),
            paso()
        ),
    );
    ui.invoke_paso();
    hasta(10, || ui.get_capa_abierta() && ui.get_dialogo_con_campo()).await;
    ui.set_dialogo_campo(A_MANO.into());
    ui.invoke_dialogo_aceptar();
    hasta(10, || ui.get_barra_titulo() == "Operación · 3 de 7").await;
    let h = hechos(i).await;
    let declarada = de_tipo(&h, "pregunta-declarada");
    let texto = declarada.first().and_then(|d| texto_de(d, "texto"));
    let de_la_ronda = declarada.first().and_then(|d| texto_de(d, "rondaId"));
    a.anotar(
        declarada.len() == 1
            && texto.as_deref() == Some(A_MANO)
            && de_la_ronda == id_sin_envio
            && ui.get_barra_titulo() == "Operación · 3 de 7",
        "declarar la pregunta",
        &format!(
            "\"{}\"; \"{}\"",
            texto.unwrap_or_default(),
            ui.get_barra_titulo()
        ),
    );
    Ok(())
}

// ---------------------------------------------------------------- la operación (PRU-014)

/// Abre ese menú y dice si el renglón está habilitado (None si no está); con `pulsar`, lo elige.
fn renglon(i: &Rc<Interfaz>, cual: &str, texto: &str, pulsar: bool) -> Option<bool> {
    i.abrir_menu(cual);
    let fila = i.menu.iter().position(|r| r.texto == texto);
    let habilitado = fila
        .and_then(|f| i.menu.row_data(f))
        .map(|r| r.motivo.is_empty());
    i.ui.set_menu_abierto(false);
    if let (true, Some(f), Some(true)) = (pulsar, fila, habilitado) {
        i.menu_item(f as i32);
    }
    habilitado
}

fn operacion_de(i: &Interfaz, id: &str) -> Option<nucleo::puerta::Operacion> {
    i.ronda
        .borrow()
        .as_ref()
        .and_then(|r| r.operaciones.borrow().get(id).cloned())
}

async fn texto_en(i: &Interfaz, id: &str, js: &str) -> String {
    match en(i, id, js).await.ok().and_then(|r| json::leer(&r)) {
        Some(Valor::Texto(t)) => t.para_mostrar().into_owned(),
        _ => String::new(),
    }
}

async fn chat_vacio(i: &Interfaz, id: &str) -> bool {
    en(
        i,
        id,
        "document.querySelectorAll('#chat .usuario, #chat .respuesta').length === 0",
    )
    .await
    .as_deref()
        == Ok("true")
}

/// Lo que haría Juan: abrir una conversación nueva en ese panel y esperar a que cargue vacía.
async fn abrir_conversacion_nueva(a: &mut Anotador, i: &Interfaz, id: &str) -> Result<(), String> {
    let p = i
        .panel_de(id)
        .ok_or_else(|| format!("no está el panel de {id}"))?;
    p.navegar(&format!("https://cc-prueba.test/ronda.html?p={id}"))
        .await?;
    let limite = Instant::now() + Duration::from_secs(20);
    while !(chat_vacio(i, id).await && compositor(i, id).await.is_empty()) {
        if Instant::now() > limite {
            a.anotar(
                false,
                &format!("conversación nueva de {id}"),
                "no quedó vacía en 20 s",
            );
            break;
        }
        esperar(200).await;
    }
    Ok(())
}

async fn operacion(a: &mut Anotador, i: &Rc<Interfaz>, salida: &Path) -> Result<(), String> {
    let ui = &i.ui;
    let paso = || ui.get_paso_texto().to_string();
    let resultado = || ui.get_resultado().to_string();
    let ronda = ronda_actual(i).await.ok_or("sin ronda abierta")?;
    // La página de Mistral carga siempre con un mensaje: la conversación «nueva» no queda vacía.
    i.sucios.borrow_mut().insert("mistral".into());
    let nav_antes: Vec<u64> = POOL
        .iter()
        .map(|id| i.panel_de(id).map_or(0, |p| p.navegaciones()))
        .collect();

    // Volver atrás: con la investigación cerrada se ofrece corregirla; la operación todavía no.
    let ci = renglon(i, "panel", "Corregir la investigación…", false);
    let co = renglon(i, "panel", "Corregir la operación…", false);
    a.anotar(
        ci == Some(true) && co == Some(false),
        "corregir una fase cerrada",
        &format!("investigación: {ci:?}; operación: {co:?}"),
    );

    // ESC-008: el aviso; pegar en los siete, de a uno y con el panel al frente.
    ui.invoke_paso();
    hasta(5, || ui.get_capa_abierta()).await;
    let aviso = ui.get_capa_abierta()
        && ui.get_dialogo_titulo() == "Antes de pegar la operación"
        && ui.get_dialogo_casilla_texto() == "Pegarla como texto, sin archivo";
    a.anotar(
        aviso,
        "aviso de la operación",
        &format!(
            "diálogo «{}», casilla «{}»",
            ui.get_dialogo_titulo(),
            ui.get_dialogo_casilla_texto()
        ),
    );
    ui.invoke_dialogo_aceptar();
    hasta(240, || resultado().starts_with("Operación pegada")).await;
    a.anotar(
        resultado()
            == "Operación pegada en 6 de 7. No se pegó en: Mistral; cada uno dice qué pasó. Comprueba que el archivo quedó adjunto, revísala y envíala.",
        "resultado de la operación",
        &resultado(),
    );

    // ESC-007, ESC-009 y ESC-012: una navegación, vacía, el texto idéntico al armado y el archivo adjunto.
    let mut bien = Vec::new();
    for (n, id) in POOL.iter().enumerate().filter(|(_, id)| **id != "mistral") {
        let Some(op) = operacion_de(i, id) else {
            continue;
        };
        let navs = i.panel_de(id).map_or(0, |p| p.navegaciones()) - nav_antes[n];
        let vacio = chat_vacio(i, id).await;
        let adjunto = texto_en(i, id, "document.getElementById('archivo').textContent").await;
        let nombre = op.nombre_archivo.clone().unwrap_or_default();
        let en_disco = std::fs::read(i.datos.join("operaciones").join(&nombre)).ok();
        let cuerpo = op
            .cuerpo_archivo
            .as_ref()
            .map(|c| c.para_mostrar().into_owned());
        let igual = match (&en_disco, &cuerpo) {
            (Some(b), Some(c)) => b.as_slice() == c.as_bytes(),
            _ => false,
        };
        if navs == 1
            && vacio
            && compositor(i, id).await == op.texto.para_mostrar()
            && igual
            && en_disco.is_some_and(|b| adjunto == format!("{nombre}|{}", b.len()))
        {
            bien.push(*id);
        }
    }
    a.anotar(
        bien.len() == 6,
        "conversación nueva de la app, texto y archivo",
        &format!("{} de 6: [{}]", bien.len(), bien.join(",")),
    );
    let h = hechos(i).await;
    let sellos = de_la_ronda(&h, "sello", &ronda).len();
    a.anotar(
        sellos == 7,
        "sello de la ronda",
        &format!("{sellos} etiquetas"),
    );

    let i_mistral = POOL.iter().position(|x| *x == "mistral").unwrap_or(0);
    i.seleccionar("mistral");
    esperar(300).await;
    let problema = ui.get_cabecera_problema().to_string();
    let navs = i.panel_de("mistral").map_or(0, |p| p.navegaciones()) - nav_antes[i_mistral];
    a.anotar(
        estado_en_la_lista(i, "mistral") == "Con problema"
            && problema
                .starts_with("La operación no se pegó: la conversación nueva no quedó vacía")
            && compositor(i, "mistral").await.is_empty()
            && operacion_de(i, "mistral").is_none()
            && navs == 1,
        "conversación que no queda vacía: no se pega",
        &format!(
            "«{}»; {problema}; navegaciones {navs}",
            estado_en_la_lista(i, "mistral")
        ),
    );

    // Mistral otra vez, en una conversación nueva y por la vía del texto: el aviso ya se dio en esta ronda.
    i.sucios.borrow_mut().remove("mistral");
    abrir_conversacion_nueva(a, i, "mistral").await?;
    renglon(i, "panel", crate::interfaz::PEGAR_OPERACION_TEXTO, true);
    let sin_aviso = !ui.get_capa_abierta();
    hasta(60, || resultado().starts_with("Operación pegada en 1 de 1")).await;
    hasta(15, || {
        estado_en_la_lista(i, "mistral") == "Pegado, falta que envíes"
    })
    .await;
    let op = operacion_de(i, "mistral");
    let texto_op = op
        .as_ref()
        .map(|o| o.texto.para_mostrar().into_owned())
        .unwrap_or_default();
    a.anotar(
        sin_aviso
            && op.as_ref().is_some_and(|o| o.cuerpo_archivo.is_none())
            && texto_op.contains("[[CC-MARCA-")
            && compositor(i, "mistral").await == texto_op
            && estado_en_la_lista(i, "mistral") == "Pegado, falta que envíes",
        "operación como texto, con el aviso una vez por ronda",
        &format!(
            "sin aviso: {sin_aviso}; «{}»; «{}»",
            resultado(),
            estado_en_la_lista(i, "mistral")
        ),
    );

    // Los siete envían y responden con un hallazgo; la captura los registra como operación.
    for id in POOL {
        enviar(i, id).await?;
    }
    for id in POOL {
        let t = format!(
            "CONVERGENCIA|ALCANCE|P1,P2|Las respuestas coinciden en el punto central ({id})."
        );
        responder(i, id, &t).await?;
    }
    hasta(30, || paso() == "Capturar los que terminaron (7)").await;
    ui.invoke_paso();
    hasta(60, || ui.get_barra_titulo() == "Integración · 4 de 7").await;
    let h = hechos(i).await;
    let salidas = de_la_ronda(&h, "salida-operador", &ronda);
    let ids_salidas: Vec<String> = salidas.iter().filter_map(|s| texto_de(s, "id")).collect();
    let hallazgos = de_tipo(&h, "hallazgo")
        .iter()
        .filter(|x| texto_de(x, "salidaOperadorId").is_some_and(|s| ids_salidas.contains(&s)))
        .count();
    let prompts_iguales = salidas.iter().all(|s| {
        let op = texto_de(s, "operadorId").and_then(|o| operacion_de(i, &o));
        op.is_some_and(|o| {
            texto_de(s, "promptCompleto") == Some(o.prompt_completo.para_mostrar().into_owned())
        })
    });
    let con_archivo = salidas
        .iter()
        .find(|s| texto_de(s, "operadorId").as_deref() == Some("chatgpt"))
        .and_then(|s| texto_de(s, "promptCompleto"))
        .is_some_and(|p| p.contains("=== ARCHIVO ADJUNTO:"));
    a.anotar(
        salidas.len() == 7
            && prompts_iguales
            && hallazgos == 7
            && con_archivo
            && ui.get_barra_titulo() == "Integración · 4 de 7",
        "capturar la operación",
        &format!(
            "{} salidas con su prompt ({prompts_iguales}), {hallazgos} hallazgos; «{}»",
            salidas.len(),
            ui.get_barra_titulo()
        ),
    );

    roles(a, i, salida, &ronda).await?;

    // Ronda nueva con las respuestas copiadas, y un operador que reutiliza su operación.
    renglon(i, "ronda", "Ronda nueva con las respuestas copiadas", true);
    hasta(5, || ui.get_capa_abierta()).await;
    ui.invoke_dialogo_aceptar();
    hasta(30, || resultado().starts_with("Ronda nueva abierta")).await;
    let copiada = ronda_actual(i).await.unwrap_or_default();
    let h = hechos(i).await;
    let copias = de_la_ronda(&h, "respuesta", &copiada);
    let de_la_anterior = copias.iter().all(|r| match r.valor("copiadaDe") {
        Valor::Objeto(v) => v.iter().any(|(k, x)| {
            k.como_str() == Some("rondaId") && *x == Valor::Texto(ronda.as_str().into())
        }),
        _ => false,
    });
    hasta(10, || ui.get_barra_titulo() == "Operación · 3 de 7").await;
    a.anotar(
        copiada != ronda
            && resultado().starts_with("Ronda nueva abierta")
            && copias.len() == 7
            && de_la_anterior
            && ui.get_barra_titulo() == "Operación · 3 de 7",
        "ronda nueva con las respuestas copiadas",
        &format!(
            "«{}»; {} copias; «{}»",
            resultado(),
            copias.len(),
            ui.get_barra_titulo()
        ),
    );
    let reabiertos = hasta(90, || {
        POOL.iter().all(|id| i.panel_de(id).is_some())
            && ["deepseek", "glm", "qwen"]
                .iter()
                .all(|id| i.panel_de(id).is_none())
    })
    .await;
    let (en_la_vista, visible) = i
        .ronda
        .borrow()
        .as_ref()
        .map(|r| (r.en_la_vista(), r.visible.borrow().clone()))
        .unwrap_or_default();
    a.anotar(
        reabiertos && en_la_vista == POOL && visible.as_deref().is_some_and(|v| POOL.contains(&v)),
        "ronda nueva: se cierran los roles y se reabren los investigadores",
        &format!(
            "en la vista [{}], visible {}",
            en_la_vista.join(","),
            visible.unwrap_or_default()
        ),
    );
    // Reutilizar necesita el sello de la ronda nueva: primero se pega en un panel y el aviso vuelve.
    abrir_conversacion_nueva(a, i, "gemini").await?;
    i.seleccionar("gemini");
    hasta(30, || ui.get_accion_texto() == puerta::PEGAR_OPERACION_AQUI).await;
    ui.invoke_accion_panel();
    hasta(5, || ui.get_capa_abierta()).await;
    let de_nuevo =
        ui.get_capa_abierta() && ui.get_dialogo_titulo() == "Antes de pegar la operación";
    a.anotar(
        de_nuevo,
        "el aviso vuelve en la ronda nueva",
        &format!("diálogo abierto: {de_nuevo}"),
    );
    ui.invoke_dialogo_aceptar();
    hasta(60, || resultado().starts_with("Operación pegada en 1 de 1")).await;
    i.seleccionar("chatgpt");
    esperar(300).await;
    renglon(i, "panel", crate::interfaz::USAR_ANTERIOR, true);
    hasta(10, || resultado().starts_with("ChatGPT: se reutilizó")).await;
    hasta(10, || estado_en_la_lista(i, "chatgpt") == "Capturado").await;
    let h = hechos(i).await;
    let reusada = de_la_ronda(&h, "salida-operador", &copiada)
        .into_iter()
        .any(|x| texto_de(x, "operadorId").as_deref() == Some("chatgpt"));
    a.anotar(
        resultado().starts_with("ChatGPT: se reutilizó")
            && reusada
            && estado_en_la_lista(i, "chatgpt") == "Capturado",
        "usar la operación anterior",
        &format!("«{}»; «{}»", resultado(), estado_en_la_lista(i, "chatgpt")),
    );
    Ok(())
}

// ---------------------------------------------------------------- los roles y el informe (PRU-015)

/// Lo que hace el rol: responder en párrafos, como los proveedores que dejan cada línea en un <p>.
async fn responder_en_parrafos(i: &Interfaz, id: &str, lineas: &[&str]) -> Result<String, String> {
    let lista = Valor::Lista(lineas.iter().map(|l| Valor::Texto((*l).into())).collect());
    let mut b = Vec::new();
    json::escribir(&lista, &mut b);
    let js = format!(
        "(() => {{ const r = document.createElement('div'); r.className = 'respuesta'; for (const l of {}) {{ const p = document.createElement('p'); p.textContent = l; r.append(p); }} document.getElementById('chat').append(r); document.getElementById('detener')?.remove(); return 'ok'; }})()",
        String::from_utf8_lossy(&b)
    );
    en(i, id, &js).await
}

async fn armado(i: &Interfaz, etapa: &'static str) -> String {
    let Some(r) = i.ronda.borrow().clone() else {
        return String::new();
    };
    r.nucleo
        .pedir(move |p| match etapa {
            "integracion" => p.armar_prompt_integrador(),
            "verificacion" => p.armar_prompt_verificador(),
            _ => p.armar_redactor().map(|a| a.prompt),
        })
        .await
        .ok()
        .and_then(Result::ok)
        .map(|t| t.para_mostrar().into_owned())
        .unwrap_or_default()
}

fn de_la_ronda<'a>(h: &'a [Hecho], tipo: &str, ronda: &str) -> Vec<&'a Hecho> {
    de_tipo(h, tipo)
        .into_iter()
        .filter(|x| texto_de(x, "rondaId").as_deref() == Some(ronda))
        .collect()
}

async fn roles(
    a: &mut Anotador,
    i: &Rc<Interfaz>,
    salida: &Path,
    ronda: &str,
) -> Result<(), String> {
    let ui = &i.ui;
    let paso = || ui.get_paso_texto().to_string();
    let resultado = || ui.get_resultado().to_string();
    let titulo = || ui.get_barra_titulo().to_string();
    let habilitado = || ui.get_paso_habilitado() && !ui.get_ocupado();
    let pegado = || {
        (resultado().starts_with("Prompt pegado") || resultado().starts_with("No se"))
            && !ui.get_ocupado()
    };
    let roles = ["deepseek", "glm", "qwen"];
    let en_la_vista = || {
        i.ronda
            .borrow()
            .as_ref()
            .map(|r| r.en_la_vista())
            .unwrap_or_default()
    };
    let visible = || {
        i.ronda
            .borrow()
            .as_ref()
            .and_then(|r| r.visible.borrow().clone())
            .unwrap_or_default()
    };
    let servidor = Servidor::nuevo().map_err(|e| e.to_string())?;

    // Integración: los siete ya dejaron todo en el registro; sus páginas se cierran y se abren los tres roles.
    let cambio = hasta(90, || {
        POOL.iter().all(|id| i.panel_de(id).is_none())
            && roles.iter().all(|id| i.panel_de(id).is_some())
            // La página existe antes de que el rol entre al recorrido.
            && en_la_vista().len() == roles.len()
    })
    .await;
    a.anotar(
        cambio && en_la_vista() == roles && !ui.get_investigadores_visibles(),
        "segunda parte: se cierran los investigadores y se abren los roles",
        &format!(
            "cerrados: {} de 7; en el recorrido [{}]",
            POOL.iter().filter(|id| i.panel_de(id).is_none()).count(),
            en_la_vista().join(",")
        ),
    );
    hasta(10, || {
        estado_en_la_lista(i, "deepseek").starts_with("Integra y redacta")
    })
    .await;
    a.anotar(
        titulo() == "Integración · 4 de 7"
            && paso() == "Pegar el prompt del integrador"
            && habilitado()
            && estado_en_la_lista(i, "deepseek").starts_with("Integra y redacta"),
        "etapa Integración",
        &format!(
            "«{}», «{}»; «{}»",
            titulo(),
            paso(),
            estado_en_la_lista(i, "deepseek")
        ),
    );
    ui.invoke_paso();
    hasta(90, pegado).await;
    let prompt_integrador = armado(i, "integracion").await;
    let deepseek_pegado = "Integra y redacta · Pegado, falta que envíes";
    hasta(10, || estado_en_la_lista(i, "deepseek") == deepseek_pegado).await;
    let vacio = chat_vacio(i, "deepseek").await;
    a.anotar(
        resultado() == "Prompt pegado en DeepSeek. Revísalo y envíalo."
            && vacio
            && !prompt_integrador.is_empty()
            && compositor(i, "deepseek").await == prompt_integrador
            && visible() == "deepseek"
            && en_la_vista().len() == 3
            && estado_en_la_lista(i, "deepseek") == deepseek_pegado,
        "pegar el integrador",
        &format!(
            "«{}»; chat nuevo vacío: {vacio}; a la vista {}, {} en el recorrido; «{}»",
            resultado(),
            visible(),
            en_la_vista().len(),
            estado_en_la_lista(i, "deepseek")
        ),
    );

    enviar(i, "deepseek").await?;
    responder_en_parrafos(
        i,
        "deepseek",
        &[
            "TITULO: Informe de prueba",
            "1. TIPOS DE DIVERGENCIA",
            "No hay divergencias de fondo [H2].",
            "5. QUE CONVIENE RESCATAR",
            "Lo firme está en [H1].",
        ],
    )
    .await?;
    hasta(30, || {
        paso() == "Capturar el informe del integrador" && habilitado()
    })
    .await;
    ui.invoke_paso();
    hasta(60, || titulo() == "Verificación · 5 de 7").await;
    let h = hechos(i).await;
    let informe = de_la_ronda(&h, "informe-integrador", ronda)
        .into_iter()
        .last();
    let capturado = "Integra y redacta · Capturado";
    hasta(10, || estado_en_la_lista(i, "deepseek") == capturado).await;
    let titulo_informe = informe
        .and_then(|x| texto_de(x, "titulo"))
        .unwrap_or_default();
    a.anotar(
        titulo_informe == "Informe de prueba"
            && informe
                .and_then(|x| texto_de(x, "promptCompleto"))
                .as_deref()
                == Some(prompt_integrador.as_str())
            && estado_en_la_lista(i, "deepseek") == capturado,
        "capturar el integrador",
        &format!(
            "título «{titulo_informe}»; «{}»",
            estado_en_la_lista(i, "deepseek")
        ),
    );

    // INT-005: recapturar el integrador después de su etapa; gana el último.
    responder_en_parrafos(
        i,
        "deepseek",
        &[
            "TITULO: Informe recapturado",
            "5. QUE CONVIENE RESCATAR",
            "Lo firme está en [H1] y en [H2].",
        ],
    )
    .await?;
    renglon(i, "ronda", "Recapturar el informe del integrador", true);
    hasta(60, || resultado().contains("recaptur") && !ui.get_ocupado()).await;
    let h = hechos(i).await;
    let informes = de_la_ronda(&h, "informe-integrador", ronda);
    a.anotar(
        informes.len() == 2
            && informes
                .last()
                .and_then(|x| texto_de(x, "titulo"))
                .as_deref()
                == Some("Informe recapturado")
            && resultado().starts_with("DeepSeek: integrador recapturado"),
        "recapturar el integrador",
        &format!("«{}»; {} informes", resultado(), informes.len()),
    );

    // VER-002 (D62): el mismo prompt, que cita lo que rescata el último informe, en los dos verificadores.
    a.anotar(
        paso() == "Pegar el prompt del verificador" && habilitado(),
        "etapa Verificación",
        &format!("«{}»", paso()),
    );
    ui.invoke_paso();
    hasta(120, pegado).await;
    let prompt_verificador = armado(i, "verificacion").await;
    a.anotar(
        resultado() == "Prompt pegado en GLM y Qwen. Revísalo y envíalo."
            && compositor(i, "glm").await == prompt_verificador
            && compositor(i, "qwen").await == prompt_verificador
            && prompt_verificador.contains("[H2]")
            && visible() == "qwen"
            && en_la_vista().len() == 3,
        "pegar en los dos verificadores",
        &format!(
            "«{}»; a la vista {}, {} en el recorrido",
            resultado(),
            visible(),
            en_la_vista().len()
        ),
    );
    enviar(i, "glm").await?;
    enviar(i, "qwen").await?;
    let puerto = servidor.puerto;
    let b = format!("http://127.0.0.1:{puerto}");
    // Las del servidor local no se piden: las formas raras de 127.0.0.1 prueban el analizador de URL.
    let lineas_glm = [
        "Reviso las fuentes.".to_string(),
        format!("CONFIRMA|OFICIAL|H1|{b}/ok|\"cita\""),
        "CONTRADICE|SECUNDARIA|H2|https://x.invalid/p|\"otra\"".to_string(),
        format!("CONFIRMA|PRIMARIA|H1|{b}/404|\"no está\""),
        format!("CONFIRMA|OFICIAL|H2|http://0x7f.0.0.1:{puerto}/hex|\"hex\""),
        format!("CONFIRMA|OFICIAL|H1|http://2130706433:{puerto}/entero|\"entero\""),
    ];
    let refs: Vec<&str> = lineas_glm.iter().map(String::as_str).collect();
    responder_en_parrafos(i, "glm", &refs).await?;
    esperar(2 * paneles::SONDEO.as_millis() as u64).await;
    let espera_al_otro = !(paso() == "Capturar la verificación" && habilitado());
    // El botón del panel tampoco se lleva al que sigue respondiendo.
    i.seleccionar("glm");
    let boton_listo = hasta(30, || {
        ui.get_accion_texto().starts_with("Capturar este panel")
    })
    .await;
    ui.invoke_accion_panel();
    hasta(10, || resultado().starts_with("Falta que termine")).await;
    let h = hechos(i).await;
    let sin_verificacion = de_la_ronda(&h, "salida-verificador", ronda).is_empty();
    a.anotar(
        boton_listo
            && resultado() == "Falta que termine Qwen: las verificaciones se capturan juntas."
            && sin_verificacion,
        "capturar un verificador espera al otro",
        &format!(
            "botón: {boton_listo}; «{}»; sin verificaciones: {sin_verificacion}",
            resultado()
        ),
    );
    let ok_qwen = format!("CONFIRMA|OFICIAL|H1|{b}/ok|\"la misma\"");
    responder_en_parrafos(i, "qwen", &["Verifico por mi cuenta.", &ok_qwen]).await?;
    hasta(30, || paso() == "Capturar la verificación" && habilitado()).await;
    ui.invoke_paso();
    hasta(60, || titulo() == "Redacción · 6 de 7").await;
    let h = hechos(i).await;
    let verificaciones = de_la_ronda(&h, "salida-verificador", ronda);
    let de_quien: Vec<String> = verificaciones
        .iter()
        .filter_map(|v| texto_de(v, "verificadorId"))
        .collect();
    let prompts = verificaciones
        .iter()
        .all(|v| texto_de(v, "promptCompleto").as_deref() == Some(prompt_verificador.as_str()));
    hasta(10, || {
        estado_en_la_lista(i, "qwen") == "Verifica · Capturado"
    })
    .await;
    a.anotar(
        espera_al_otro
            && de_quien == ["glm", "qwen"]
            && prompts
            && estado_en_la_lista(i, "glm") == "Verifica · Capturado"
            && estado_en_la_lista(i, "qwen") == "Verifica · Capturado",
        "capturar las dos verificaciones",
        &format!(
            "esperó al segundo: {espera_al_otro}; [{}]; prompts idénticos: {prompts}; «{}», «{}»",
            de_quien.join(","),
            estado_en_la_lista(i, "glm"),
            estado_en_la_lista(i, "qwen")
        ),
    );

    // Redacción: el prompt y el archivo adjunto.
    a.anotar(
        paso() == "Pegar el prompt y el archivo del redactor" && habilitado(),
        "etapa Redacción",
        &format!("«{}»", paso()),
    );
    ui.invoke_paso();
    hasta(90, pegado).await;
    let archivos: Vec<std::path::PathBuf> = std::fs::read_dir(i.datos.join("redactor"))
        .map(|d| d.flatten().map(|e| e.path()).collect())
        .unwrap_or_default();
    let adjunto = texto_en(
        i,
        "deepseek",
        "document.getElementById('archivo').textContent",
    )
    .await;
    let esperado = match archivos.as_slice() {
        [uno] => format!(
            "{}|{}",
            uno.file_name().unwrap_or_default().to_string_lossy(),
            std::fs::metadata(uno).map_or(0, |m| m.len())
        ),
        _ => "-".into(),
    };
    let con_marca = archivos
        .first()
        .and_then(|a| std::fs::read_to_string(a).ok())
        .is_some_and(|t| t.contains("[[CC-MARCA-FIN-"));
    a.anotar(
        resultado()
            == "Prompt pegado en DeepSeek. Comprueba que el archivo quedó adjunto, revísalo y envíalo."
            && compositor(i, "deepseek").await == armado(i, "redaccion").await
            && adjunto == esperado
            && con_marca,
        "pegar el redactor con el adjunto",
        &format!("«{}»; adjunto «{adjunto}», esperado «{esperado}»", resultado()),
    );
    enviar(i, "deepseek").await?;
    // La imagen apunta al servidor local: el PDF no la pide, la escribe como texto.
    let imagen = format!("![figura]({b}/imagen)");
    responder_en_parrafos(
        i,
        "deepseek",
        &[
            "Respuesta del redactor para la persona.",
            "Lo firme está en [H1].",
            &imagen,
        ],
    )
    .await?;
    hasta(30, || {
        paso() == "Capturar la respuesta del redactor" && habilitado()
    })
    .await;
    ui.invoke_paso();
    hasta(60, || titulo() == "Informe · 7 de 7").await;
    let h = hechos(i).await;
    let redaccion = de_la_ronda(&h, "respuesta-redactor", ronda)
        .into_iter()
        .last();
    let marca = redaccion
        .and_then(|r| texto_de(r, "marcaUltima"))
        .unwrap_or_default();
    hasta(10, || paso() == "Armar el informe" && habilitado()).await;
    a.anotar(
        marca.starts_with("[[CC-MARCA-FIN-") && paso() == "Armar el informe" && habilitado(),
        "capturar el redactor",
        &format!("marca última {marca}; «{}»", paso()),
    );

    // INF-013: las URLs locales sin pedir, la carpeta con .md y PDF, y la carpeta que se abre.
    *i.carpeta_abierta.borrow_mut() = None;
    ui.invoke_paso();
    hasta(300, || {
        (resultado().starts_with("Carpeta del informe") || resultado().starts_with("No se pudo"))
            && !ui.get_ocupado()
    })
    .await;
    let h = hechos(i).await;
    let comprobadas = de_la_ronda(&h, "url-comprobada", ronda);
    let urls: Vec<String> = comprobadas
        .iter()
        .map(|u| {
            format!(
                "{} {} ({})",
                texto_de(u, "url").unwrap_or_default(),
                u.entero("codigo")
                    .map_or("sin código".into(), |c| c.to_string()),
                texto_de(u, "detalle").unwrap_or_default()
            )
        })
        .collect();
    let locales = comprobadas
        .iter()
        .filter(|u| texto_de(u, "detalle").as_deref() == Some(nucleo::urls::MOTIVO_LOCAL))
        .count();
    let pedidos = servidor.pedidos();
    // Cada verificador comprueba sus URLs (D62): 5 de GLM y la /ok de Qwen.
    a.anotar(
        comprobadas.len() == 6
            && comprobadas.iter().all(|u| u.entero("codigo").is_none())
            && locales == 5
            && pedidos.is_empty(),
        "las URLs locales y la imagen del PDF no se piden",
        &format!(
            "{}; pedidos al servidor: {}",
            urls.join("; "),
            pedidos.join("; ")
        ),
    );
    let informes = i.datos.join("informes");
    let carpetas = || -> Vec<std::path::PathBuf> {
        std::fs::read_dir(&informes)
            .map(|d| {
                d.flatten()
                    .map(|e| e.path())
                    .filter(|p| p.is_dir())
                    .collect()
            })
            .unwrap_or_default()
    };
    let carpeta = carpetas().first().cloned().unwrap_or_default();
    let nombre = carpeta
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    let md = std::fs::read_to_string(carpeta.join(format!("{nombre}.md"))).unwrap_or_default();
    let pdf = std::fs::read(carpeta.join(format!("{nombre}.pdf"))).unwrap_or_default();
    let paginas = cajas_de_pagina(&pdf);
    a.anotar(
        carpetas().len() == 1
            && nombre.ends_with("Informe recapturado")
            && md.contains("Respuesta del redactor para la persona.")
            && pdf.starts_with(b"%PDF-")
            && pdf.len() > 1000
            && !paginas.is_empty()
            && paginas.iter().all(|p| p == "[0 0 612 792]"),
        "informe en .md y PDF, en Carta",
        &format!(
            "carpeta «{nombre}»; .md {} caracteres; PDF {} bytes; páginas {paginas:?}",
            md.chars().count(),
            pdf.len()
        ),
    );
    let respuestas = carpeta.join(nucleo::informe::SUBCARPETA_RESPUESTAS);
    let de_ext = |ext: &str, minimo: u64| {
        std::fs::read_dir(&respuestas).map_or(0, |d| {
            d.flatten()
                .filter(|e| {
                    e.path().extension().is_some_and(|x| x == ext)
                        && e.metadata().is_ok_and(|m| m.len() > minimo)
                })
                .count()
        })
    };
    let (mds, pdfs) = (de_ext("md", 0), de_ext("pdf", 1000));
    a.anotar(
        mds == 7 && pdfs == 7,
        "respuestas de los investigadores",
        &format!("{mds} .md y {pdfs} PDF"),
    );
    let g = md.find("## Verificación de fuentes — GLM (");
    let q = md.find("## Verificación de fuentes — Qwen (");
    a.anotar(
        matches!((g, q), (Some(g), Some(q)) if g < q),
        "las dos verificaciones en el informe, con su nombre",
        &format!("GLM: {}; Qwen: {}", g.is_some(), q.is_some()),
    );
    let abierta = i.carpeta_abierta.borrow().clone();
    a.anotar(
        abierta.as_deref() == Some(carpeta.as_path())
            && resultado().ends_with("URLs de los verificadores: responden 0 de 6.")
            && !ui.get_resultado_problema(),
        "la carpeta se abre al terminar",
        &format!("abierta {abierta:?}; «{}»", resultado()),
    );
    *i.carpeta_abierta.borrow_mut() = None;
    hasta(10, || paso() == "Abrir carpeta" && habilitado()).await;
    let abrir_listo = paso() == "Abrir carpeta" && habilitado();
    ui.invoke_paso();
    hasta(10, || i.carpeta_abierta.borrow().is_some()).await;
    let abierta = i.carpeta_abierta.borrow().clone();
    let n_carpetas = carpetas().len();
    a.anotar(
        abrir_listo && abierta.as_deref() == Some(carpeta.as_path()) && n_carpetas == 1,
        "el botón pasa a abrir la carpeta, sin armar otro informe",
        &format!("«{}»; abierta {abierta:?}; carpetas {n_carpetas}", paso()),
    );

    // El adaptador real, directo contra el servidor local: el código de cada método, sin cookies.
    let http = verificacion::HttpSinCookies::nuevo();
    let mut codigos = Vec::new();
    for (ruta, metodo) in [
        ("/ok", "HEAD"),
        ("/sin-head", "HEAD"),
        ("/sin-head", "GET"),
        ("/404", "GET"),
    ] {
        let c = nucleo::urls::Http::pedir(
            &http,
            &format!("{b}{ruta}"),
            metodo,
            Duration::from_secs(10),
        );
        codigos.push(format!(
            "{metodo} {ruta} {}",
            c.map_or_else(|e| e, |c| c.to_string())
        ));
    }
    let mut pedidos = servidor.pedidos();
    pedidos.sort();
    a.anotar(
        codigos
            == [
                "HEAD /ok 200",
                "HEAD /sin-head 405",
                "GET /sin-head 200",
                "GET /404 404",
            ]
            && pedidos == ["GET /404", "GET /sin-head", "HEAD /ok", "HEAD /sin-head"],
        "el adaptador HTTP, sin cookies",
        &format!(
            "{}; el servidor vio {}",
            codigos.join("; "),
            pedidos.join("; ")
        ),
    );
    // PRU-018: para las capturas de la etapa Informe.
    copiar(&informes, &con_sufijo(salida, ".informe")).map_err(|e| e.to_string())?;
    copiar(&i.datos, &con_sufijo(salida, ".roles")).map_err(|e| e.to_string())?;

    // En la segunda parte no hay investigadores detrás de los roles: ocultarlos no se ofrece.
    let ocultar = renglon(i, "ronda", "Ocultar los paneles de los roles", false);
    a.anotar(
        ocultar.is_none()
            && POOL.iter().all(|id| i.panel_de(id).is_none())
            && estado_en_la_lista(i, "glm") == "Verifica · Capturado"
            && estado_en_la_lista(i, "qwen") == "Verifica · Capturado",
        "los investigadores siguen cerrados y no se ofrece ocultar los roles",
        &format!(
            "sin «Ocultar»: {}; abiertos {} de 7",
            ocultar.is_none(),
            POOL.iter().filter(|id| i.panel_de(id).is_some()).count()
        ),
    );
    Ok(())
}

/// Las /MediaBox del PDF, sin espacios de más: «[0 0 612 792]» es Carta (D40).
fn cajas_de_pagina(pdf: &[u8]) -> Vec<String> {
    let t = String::from_utf8_lossy(pdf);
    t.match_indices("/MediaBox")
        .filter_map(|(n, _)| {
            let resto = &t[n + 9..];
            let (a, b) = (resto.find('[')?, resto.find(']')?);
            let dentro: Vec<&str> = resto[a + 1..b].split_whitespace().collect();
            Some(format!("[{}]", dentro.join(" ")))
        })
        .collect()
}

/// Un servidor HTTP en 127.0.0.1 para la comprobación de URLs con el adaptador real: /404 da 404,
/// /sin-head rechaza HEAD con 405, lo demás 200. Anota método y ruta, y «cookie» si el pedido trae cookies.
// shortcut: el hilo que atiende queda vivo hasta que sale la app; es una prueba de una sola corrida.
struct Servidor {
    puerto: u16,
    pedidos: std::sync::Arc<std::sync::Mutex<Vec<String>>>,
}

impl Servidor {
    fn nuevo() -> std::io::Result<Self> {
        let escucha = std::net::TcpListener::bind("127.0.0.1:0")?;
        let puerto = escucha.local_addr()?.port();
        let pedidos = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let anotar = pedidos.clone();
        std::thread::spawn(move || {
            for c in escucha.incoming().flatten() {
                atender(c, &anotar);
            }
        });
        Ok(Self { puerto, pedidos })
    }

    fn pedidos(&self) -> Vec<String> {
        self.pedidos.lock().map(|p| p.clone()).unwrap_or_default()
    }
}

fn atender(c: std::net::TcpStream, pedidos: &std::sync::Mutex<Vec<String>>) {
    use std::io::{BufRead, Write};
    let mut lector = std::io::BufReader::new(&c);
    let mut primera = String::new();
    let _ = lector.read_line(&mut primera);
    let mut cookie = false;
    loop {
        let mut h = String::new();
        if lector.read_line(&mut h).unwrap_or(0) == 0 || h.trim().is_empty() {
            break;
        }
        cookie |= h.to_ascii_lowercase().starts_with("cookie:");
    }
    let partes: Vec<&str> = primera.split_whitespace().collect();
    let [metodo, ruta, ..] = partes.as_slice() else {
        return;
    };
    if let Ok(mut p) = pedidos.lock() {
        p.push(format!(
            "{metodo} {ruta}{}",
            if cookie { " cookie" } else { "" }
        ));
    }
    let codigo = match (*metodo, *ruta) {
        (_, "/404") => 404,
        ("HEAD", "/sin-head") => 405,
        _ => 200,
    };
    let _ = (&c).write_all(
        format!("HTTP/1.1 {codigo} Prueba\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            .as_bytes(),
    );
}

fn con_sufijo(salida: &Path, sufijo: &str) -> std::path::PathBuf {
    let mut s = salida.as_os_str().to_owned();
    s.push(sufijo);
    s.into()
}

/// PRU-018 e INV-PRU-002: la copia de evidencia nunca lleva el perfil del navegador.
fn copiar(desde: &Path, hasta: &Path) -> std::io::Result<()> {
    for e in std::fs::read_dir(desde)? {
        let e = e?;
        if e.file_name().to_string_lossy().starts_with("navegador") {
            continue;
        }
        let destino = hasta.join(e.file_name());
        if e.file_type()?.is_dir() {
            copiar(&e.path(), &destino)?;
        } else {
            std::fs::create_dir_all(hasta)?;
            std::fs::copy(e.path(), destino)?;
        }
    }
    Ok(())
}

/// D27, A2: se cae el renderer del panel a la vista y la cabecera lo dice; se cae el navegador entero y los
/// paneles se abren de nuevo, con el resultado que lo dice.
async fn caidas(a: &mut Anotador, i: &Rc<Interfaz>) -> Result<(), String> {
    let ui = &i.ui;
    let id = i
        .ronda
        .borrow()
        .as_ref()
        .and_then(|r| r.visible.borrow().clone())
        .ok_or("sin panel a la vista".to_string())?;
    let p = i
        .panel_de(&id)
        .ok_or("sin el panel a la vista".to_string())?;
    let antes = p.caidas();
    drop(p.devtools("Page.crash", "{}"));
    let esperado = format!(
        "La página de {} se cerró sola y se volvió a abrir.",
        nucleo::dominio::nombre_proveedor(&id)
    );
    let avisa = hasta(20, || ui.get_cabecera_problema() == esperado.as_str()).await;
    a.anotar(
        avisa && p.caidas() == antes + 1,
        "la cabecera avisa la caída del renderer",
        &format!(
            "caídas {antes} → {}; \"{}\"",
            p.caidas(),
            ui.get_cabecera_problema()
        ),
    );

    drop(p.devtools("Browser.close", "{}"));
    let reabiertos = hasta(60, || {
        POOL.iter().all(|x| {
            i.panel_de(x)
                .is_some_and(|n| !Rc::ptr_eq(&n, &p) && !n.navegador_caido())
        })
    })
    .await;
    let mut vuelve = String::new();
    for _ in 0..50 {
        vuelve = en(i, &id, "1 + 1").await.unwrap_or_default();
        if vuelve == "2" {
            break;
        }
        esperar(200).await;
    }
    let resultado = ui.get_resultado().to_string();
    a.anotar(
        reabiertos
            && vuelve == "2"
            && resultado == "El navegador de los paneles se cerró solo y se volvió a abrir.",
        "los paneles vuelven tras la caída del navegador",
        &format!("reabiertos {reabiertos}; 1 + 1 = {vuelve}; \"{resultado}\""),
    );
    Ok(())
}

// ---------------------------------------------------------------- secciones, accesibilidad y teclado (PRU-017)

const F1: u16 = 0x70;
const F2: u16 = 0x71;
const F3: u16 = 0x72;
const F4: u16 = 0x73;
const F5: u16 = 0x74;
const TAB: u16 = 0x09;
const ENTER: u16 = 0x0D;
const CTRL: u16 = 0x11;
const MAYUS: u16 = 0x10;
const ALT: u16 = 0x12;

/// Lo que se lee de un nodo, sin el elemento COM, que no cruza de hilo.
struct Visto {
    nombre: String,
    tipo: i32,
    ancho: i32,
    alto: i32,
}

/// Espera el hilo de UIA sin trabar la interfaz, que es la que le responde.
async fn esperar_hilo<T>(h: std::thread::JoinHandle<Result<T, String>>) -> Result<T, String> {
    if !hasta(60, || h.is_finished()).await {
        return Err("UIA no respondió en 60 s".into());
    }
    h.join().map_err(|_| "el hilo de UIA se cayó".to_string())?
}

async fn uia<T: Send + 'static>(
    ventana: isize,
    f: impl FnOnce(&lector::Uia) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    esperar_hilo(lector::en_hilo(ventana, f)).await
}

async fn vistos(ventana: isize) -> Result<Vec<Visto>, String> {
    uia(ventana, |u| {
        Ok(u.nodos()?
            .into_iter()
            .map(|n| Visto {
                nombre: n.nombre,
                tipo: n.tipo,
                ancho: n.ancho,
                alto: n.alto,
            })
            .collect())
    })
    .await
}

/// Activa por UIA, como Narrador, el primer nodo de ese tipo cuyo nombre cumple la condición.
async fn activar_por_uia(
    ventana: isize,
    tipo: i32,
    cond: impl Fn(&str) -> bool + Send + 'static,
) -> Result<String, String> {
    uia(ventana, move |u| {
        let n = u
            .nodos()?
            .into_iter()
            .find(|n| n.tipo == tipo && cond(&n.nombre))
            .ok_or("sin el nodo")?;
        u.activar(&n.elemento)?;
        Ok(n.nombre)
    })
    .await
}

/// Teclas de verdad con la ventana al frente; da tiempo a que la interfaz las procese.
async fn pulsar(ventana: isize, vks: &[u16]) -> bool {
    let ok = lector::al_frente(ventana) && lector::teclas(ventana, vks);
    esperar(500).await;
    ok
}

async fn pagina_con_foco(i: &Interfaz, id: &str) -> bool {
    en(i, id, "document.hasFocus()").await.as_deref() == Ok("true")
}

/// El foco dentro de la página del panel visible, como lo deja F4.
async fn entrar_a_la_pagina(i: &Interfaz, id: &str) -> bool {
    let ok = i.panel_visible().is_some_and(|p| p.foco().is_ok());
    i.region.set(Some("pagina"));
    let mut dentro = false;
    for _ in 0..25 {
        dentro = pagina_con_foco(i, id).await;
        if dentro {
            break;
        }
        esperar(200).await;
    }
    ok && dentro
}

/// Los píxeles del anillo de foco (#3A79E0, con 6 de tolerancia por el suavizado) en la ventana.
fn pixeles_de_foco(ui: &crate::ventana::Ventana) -> Result<usize, String> {
    let foto = ui.window().take_snapshot().map_err(|e| e.to_string())?;
    let cerca = |a: u8, b: u8| a.abs_diff(b) <= 6;
    Ok(foto
        .as_slice()
        .iter()
        .filter(|p| cerca(p.r, 0x3A) && cerca(p.g, 0x79) && cerca(p.b, 0xE0))
        .count())
}

/// En Operación, el paso es pegar: la primera vez en la ronda abre el aviso (ESC-008). Con el aviso abierto,
/// F2 no mueve el panel (IFZ-008: sin capa abierta). Se cancela sin pegar.
async fn f3_abre_el_aviso(i: &Interfaz, ventana: isize) -> bool {
    let ui = &i.ui;
    let abierto = hasta(5, || {
        ui.get_capa_abierta() && ui.get_dialogo_aceptar_texto() == "Entendido, pegar"
    })
    .await;
    if !abierto {
        return false;
    }
    let visible = || {
        i.ronda
            .borrow()
            .as_ref()
            .and_then(|r| r.visible.borrow().clone())
    };
    let antes = visible();
    pulsar(ventana, &[F2]).await;
    pulsar(ventana, &[CTRL, TAB]).await;
    let quieto = visible() == antes && ui.get_capa_abierta();
    ui.invoke_dialogo_cancelar();
    esperar(300).await;
    quieto && !ui.get_capa_abierta()
}

async fn teclado_y_lector(a: &mut Anotador, i: &Rc<Interfaz>) -> Result<(), String> {
    let ui = &i.ui;
    let w = lector::hwnd_de(ui.window()).ok_or("sin el HWND de la ventana")?;
    let r = i.ronda.borrow().clone().ok_or("sin ronda")?;
    let visible = || r.visible.borrow().clone().unwrap_or_default();
    let resultado = || ui.get_resultado().to_string();
    let nombre = |id: &str| nucleo::dominio::nombre_proveedor(id);

    // Historial (IFZ-014): las tres rondas de la prueba, la actual (la más nueva) primero, y el informe de la
    // primera, que se abre.
    let actual = ronda_actual(i).await.unwrap_or_default();
    ui.invoke_ir("historial".into());
    hasta(10, || ui.get_anteriores().row_count() > 0).await;
    let anteriores: Vec<_> = ui.get_anteriores().iter().collect();
    let carpeta = anteriores
        .iter()
        .map(|f| f.carpeta.to_string())
        .find(|c| !c.is_empty())
        .unwrap_or_default();
    *i.carpeta_abierta.borrow_mut() = None;
    ui.invoke_abrir_informe(carpeta.as_str().into());
    hasta(5, || i.carpeta_abierta.borrow().is_some()).await;
    let abierta = i.carpeta_abierta.borrow().clone();
    let primera = anteriores
        .first()
        .map(|f| f.id.to_string())
        .unwrap_or_default();
    a.anotar(
        anteriores.len() == 3
            && !actual.is_empty()
            && primera == actual
            && !carpeta.is_empty()
            && abierta.as_deref() == Some(Path::new(&carpeta)),
        "el historial, la más nueva primero, con el informe que se abre",
        &format!(
            "{} rondas; la primera {primera}, la actual {actual}; abierta {abierta:?}",
            anteriores.len()
        ),
    );

    // La Ayuda se abre desde el riel (por UIA, como Narrador) y no con F1.
    let f1 = pulsar(w, &[F1]).await;
    let tras_f1 = ui.get_seccion().to_string();
    let riel = activar_por_uia(w, lector::BOTON, |n| n == "Ayuda").await;
    hasta(5, || ui.get_seccion() == "ayuda").await;
    let version = ui.get_version().to_string();
    a.anotar(
        f1 && tras_f1 == "historial"
            && riel.is_ok()
            && ui.get_seccion() == "ayuda"
            && version.starts_with(&format!(
                "ChatCouncil, versión {}.",
                env!("CARGO_PKG_VERSION")
            )),
        "la Ayuda se abre desde el riel y no con F1",
        &format!("tras F1 «{tras_f1}»; riel {riel:?}; «{version}»"),
    );

    // WCAG 2.5.8: los controles a la vista, en las cuatro secciones, por su marco en UIA.
    let escala = ui.window().scale_factor();
    let minimo = (48.0 * escala).floor() as i32 - 1;
    let (mut contados, mut chicos) = (0, Vec::new());
    for s in ["ronda", "historial", "ajustes", "ayuda"] {
        ui.invoke_ir(s.into());
        esperar(700).await;
        for v in vistos(w).await? {
            let control = [
                lector::BOTON,
                lector::CASILLA,
                lector::DESPLEGABLE,
                lector::CAMPO,
            ]
            .contains(&v.tipo);
            if control && v.ancho > 0 && v.alto > 0 {
                contados += 1;
                if v.ancho.min(v.alto) < minimo {
                    chicos.push(format!("{s}: «{}» {}×{}", v.nombre, v.ancho, v.alto));
                }
            }
        }
    }
    a.anotar(
        contados > 0 && chicos.is_empty(),
        "objetivos de 48 dp en las cuatro secciones",
        &format!(
            "{contados} controles; escala {escala}; menores que {minimo} px: [{}]",
            chicos.join("; ")
        ),
    );

    // IFZ-022: una casilla de Ajustes cambia desde el lector, y vuelve.
    ui.invoke_ir("ajustes".into());
    esperar(500).await;
    let casilla = uia(w, |u| {
        let n = u
            .nodos()?
            .into_iter()
            .find(|n| n.tipo == lector::CASILLA && n.habilitado)
            .ok_or("sin casillas")?;
        let antes = u.marcado(&n.elemento);
        u.alternar(&n.elemento)?;
        std::thread::sleep(Duration::from_millis(400));
        let medio = u.marcado(&n.elemento);
        u.alternar(&n.elemento)?;
        std::thread::sleep(Duration::from_millis(400));
        Ok((n.nombre, antes, medio, u.marcado(&n.elemento)))
    })
    .await;
    a.anotar(
        matches!(&casilla, Ok((_, Some(x), Some(y), Some(z))) if x != y && x == z),
        "una casilla de Ajustes cambia desde el lector",
        &format!("{casilla:?}"),
    );

    // IFZ-020, 021 e INV-IFZ-005: la jerarquía de la Ronda.
    ui.invoke_ir("ronda".into());
    esperar(700).await;
    let nodos = vistos(w).await?;
    let paso_txt = ui.get_paso_texto().to_string();
    let boton = |n: &str| {
        nodos
            .iter()
            .any(|v| v.tipo == lector::BOTON && v.nombre == n && v.ancho > 0)
    };
    let nombres: Vec<String> = r.en_la_vista().iter().map(|id| nombre(id)).collect();
    let filas = nombres.iter().all(|n| {
        nodos
            .iter()
            .any(|v| v.tipo == lector::BOTON && v.nombre.starts_with(&format!("{n}, ")))
    });
    let actual = nodos.iter().find(|v| v.nombre.ends_with(", etapa actual"));
    let sueltos: Vec<&str> = nodos
        .iter()
        .filter(|v| nombres.contains(&v.nombre) || v.nombre.contains("Página del proveedor"))
        .map(|v| v.nombre.as_str())
        .collect();
    let ceros = nodos.iter().filter(|v| v.ancho <= 0 || v.alto <= 0).count();
    a.anotar(
        boton(&paso_txt) && boton("Ronda…") && filas && actual.is_some() && sueltos.is_empty() && ceros == 0,
        "la jerarquía para el lector de pantalla",
        &format!(
            "{} nodos; paso «{paso_txt}» {}; «Ronda…» {}; filas de [{}] {filas}; «{}»; sueltos {sueltos:?}; de tamaño cero {ceros}",
            nodos.len(),
            boton(&paso_txt),
            boton("Ronda…"),
            nombres.join(", "),
            actual.map_or("", |v| v.nombre.as_str())
        ),
    );

    // INV-IFZ-004: un texto nuevo no rearma la jerarquía.
    let h = lector::en_hilo(w, |u| {
        let buscar = || {
            u.nodos().and_then(|v| {
                v.into_iter()
                    .find(|n| n.tipo == lector::BOTON && n.nombre == "Ronda…")
                    .ok_or("sin «Ronda…»".to_string())
            })
        };
        let antes = buscar()?;
        std::thread::sleep(Duration::from_millis(1500));
        Ok(u.mismo(&antes.elemento, &buscar()?.elemento))
    });
    esperar(600).await;
    let viejo = ui.get_resultado();
    ui.set_resultado("Un texto nuevo para el lector.".into());
    let mismo = esperar_hilo(h).await;
    ui.set_resultado(viejo);
    a.anotar(
        mismo == Ok(true),
        "un texto nuevo no rearma la jerarquía",
        &format!("el mismo nodo «Ronda…»: {mismo:?}"),
    );

    // IFZ-022: activar una fila desde el lector la pone a la vista.
    let otro = r
        .en_la_vista()
        .into_iter()
        .find(|id| *id != visible())
        .ok_or("un solo panel en la vista")?;
    let prefijo = format!("{}, ", nombre(&otro));
    let fila = activar_por_uia(w, lector::BOTON, move |n| n.starts_with(&prefijo)).await;
    hasta(5, || visible() == otro).await;
    a.anotar(
        fila.is_ok() && visible() == otro,
        "activar una fila desde el lector la pone a la vista",
        &format!("{fila:?}; a la vista {}", visible()),
    );

    // Mantenimiento del panel visible (DIA-001).
    let id = visible();
    let n = nombre(&id);
    let recargar = renglon(i, "panel", "Recargar la página", true);
    let esperado = format!("Se recargó la página de {n}.");
    hasta(30, || resultado() == esperado).await;
    a.anotar(
        recargar == Some(true) && resultado() == esperado,
        "recargar la página",
        &format!("«{}»", resultado()),
    );

    let dir = i.datos.join("diagnosticos");
    let antes: Vec<_> = std::fs::read_dir(&dir)
        .map(|d| d.flatten().map(|e| e.path()).collect())
        .unwrap_or_default();
    *i.carpeta_abierta.borrow_mut() = None;
    let diag = renglon(i, "panel", "Diagnóstico de selectores", true);
    hasta(30, || {
        resultado().starts_with(&format!("Diagnóstico de {n} guardado en "))
    })
    .await;
    let nuevos: Vec<_> = std::fs::read_dir(&dir)
        .map(|d| {
            d.flatten()
                .map(|e| e.path())
                .filter(|p| !antes.contains(p))
                .collect()
        })
        .unwrap_or_default();
    let valido = nuevos.first().and_then(|p| std::fs::read_to_string(p).ok()).is_some_and(|t| {
        matches!(json::leer(&t), Some(Valor::Objeto(c)) if c.iter().any(|(k, _)| k.para_mostrar() == "diagnostico"))
    });
    let abierta = i.carpeta_abierta.borrow().clone();
    a.anotar(
        diag == Some(true)
            && nuevos.len() == 1
            && valido
            && abierta.as_deref() == Some(dir.as_path()),
        "el diagnóstico en un archivo",
        &format!(
            "archivos nuevos {nuevos:?}; JSON con «diagnostico» {valido}; abierta {abierta:?}"
        ),
    );

    en(i, &id, "localStorage.setItem('cc-sesion', '1'); 'ok'").await?;
    let cerrar = renglon(i, "panel", "Cerrar la sesión de este panel…", true);
    let titulo = ui.get_dialogo_titulo().to_string();
    ui.invoke_dialogo_aceptar();
    let esperado = format!("Sesión de {n} cerrada. Entra con la cuenta que quieras en su página.");
    hasta(30, || resultado() == esperado).await;
    let mut queda = "1".to_string();
    for _ in 0..25 {
        if en(i, &id, "localStorage.getItem('cc-sesion')")
            .await
            .as_deref()
            == Ok("null")
        {
            queda = String::new();
            break;
        }
        esperar(200).await;
    }
    a.anotar(
        cerrar == Some(true)
            && titulo == format!("Cerrar la sesión de {n}")
            && resultado() == esperado
            && queda.is_empty(),
        "el cierre de sesión borra lo que el sitio guardó",
        &format!(
            "«{titulo}»; «{}»; lo guardado sigue: {}",
            resultado(),
            !queda.is_empty()
        ),
    );

    // D49 con teclas de verdad, con la ventana al frente.
    let v0 = visible();
    let ct = pulsar(w, &[CTRL, TAB]).await;
    let v1 = visible();
    let foco_app = lector::foco() == w;
    let cmt = pulsar(w, &[CTRL, MAYUS, TAB]).await;
    let v2 = visible();
    a.anotar(
        ct && cmt && v1 != v0 && v2 == v0 && foco_app,
        "Ctrl+Tab y Ctrl+Mayús+Tab cambian el panel sin mover el foco",
        &format!("{v0} → {v1} → {v2}; foco en la app {foco_app}"),
    );

    let f2 = pulsar(w, &[F2]).await;
    let v1 = visible();
    let f1 = pulsar(w, &[F1]).await;
    let v2 = visible();
    let paso_antes = ui.get_paso_texto().to_string();
    let f3 = pulsar(w, &[F3]).await;
    let aviso = f3_abre_el_aviso(i, w).await;
    a.anotar(
        f2 && f1
            && f3
            && v1 != v0
            && v2 == v0
            && paso_antes == "Pegar la operación en los paneles"
            && aviso,
        "F3, F2 y F1",
        &format!(
            "F2 {v0} → {v1}; F1 → {v2}; F3 sobre «{paso_antes}» abre el aviso de la operación y ni F2 ni Ctrl+Tab actúan con él abierto: {aviso}"
        ),
    );

    // El anillo de foco: F4 desde ninguna región lleva el foco al riel.
    i.region.set(None);
    let mut camino = Vec::new();
    let mut anillo = Err("sin F4".to_string());
    for _ in 0..5 {
        pulsar(w, &[F4]).await;
        camino.push(i.region.get().unwrap_or("-"));
        if camino.len() == 1 {
            anillo = pixeles_de_foco(ui);
        }
    }
    a.anotar(
        matches!(anillo, Ok(n) if n > 0),
        "el foco visible con el color 3A79E0",
        &format!("píxeles #3A79E0 con el riel enfocado: {anillo:?}"),
    );
    let id = visible();
    let dentro = pagina_con_foco(i, &id).await;
    pulsar(w, &[F4]).await;
    let sale_f4 = i.region.get().unwrap_or("-");
    let app_f4 = lector::foco() == w && !pagina_con_foco(i, &id).await;
    pulsar(w, &[F5]).await;
    let entra_f5 = i.region.get().unwrap_or("-");
    let dentro_f5 = pagina_con_foco(i, &id).await;
    pulsar(w, &[F5]).await;
    let sale_f5 = i.region.get().unwrap_or("-");
    let app_f5 = lector::foco() == w;
    a.anotar(
        camino == ["riel", "guia", "lista", "cabecera", "pagina"]
            && dentro
            && sale_f4 == "riel"
            && app_f4
            && entra_f5 == "pagina"
            && dentro_f5
            && sale_f5 == "cabecera"
            && app_f5,
        "F4 y F5 entran a la página y salen a la región siguiente o la anterior",
        &format!(
            "F4: {} (página con foco {dentro}); F4 → {sale_f4} (app {app_f4}); F5 → {entra_f5} (página {dentro_f5}); F5 → {sale_f5} (app {app_f5})",
            camino.join(" → ")
        ),
    );

    // F1, F2 y F3 desde la página: la página devuelve la tecla a la app.
    let v0 = visible();
    let e2 = entrar_a_la_pagina(i, &v0).await;
    pulsar(w, &[F2]).await;
    let v1 = visible();
    let e1 = entrar_a_la_pagina(i, &v1).await;
    pulsar(w, &[F1]).await;
    let v2 = visible();
    let e3 = entrar_a_la_pagina(i, &v2).await;
    pulsar(w, &[F3]).await;
    let aviso = f3_abre_el_aviso(i, w).await;
    a.anotar(
        e2 && e1 && e3 && v1 != v0 && v2 == v0 && aviso,
        "F1, F2 y F3 desde la página",
        &format!("dentro {e2}/{e1}/{e3}; F2 {v0} → {v1}; F1 → {v2}; F3 abre el aviso: {aviso}"),
    );

    // Tab que sale: pasado el último control de la página, el foco vuelve a la app.
    let id = visible();
    let dentro = entrar_a_la_pagina(i, &id).await;
    let mut tabs = 0;
    while tabs < 25 && lector::foco() != w {
        pulsar(w, &[TAB]).await;
        tabs += 1;
    }
    let sale = lector::foco() == w && !pagina_con_foco(i, &id).await;
    a.anotar(
        dentro && sale,
        "Tab que sale de la página",
        &format!("dentro {dentro}; vuelve a la app tras {tabs} Tab: {sale}"),
    );

    // Un clic de verdad en la app con el foco en la página: el teclado vuelve a la app. Sin esto, la
    // interfaz marca el control tocado y lo que se escribe va a la página escondida.
    let id = visible();
    let dentro = entrar_a_la_pagina(i, &id).await;
    let (x, y) = uia(w, |u| {
        u.nodos()?
            .into_iter()
            .find(|n| n.tipo == lector::BOTON && n.nombre == "Ronda")
            .map(|n| n.centro)
            .ok_or_else(|| "sin el botón Ronda del riel".to_string())
    })
    .await?;
    let clic = lector::al_frente(w) && lector::clic(w, x, y);
    esperar(500).await;
    let vuelve = lector::foco() == w && !pagina_con_foco(i, &id).await;
    a.anotar(
        dentro && clic && vuelve,
        "un clic en la app le devuelve el teclado",
        &format!("dentro {dentro}; clic {clic}; teclado en la app: {vuelve}"),
    );

    // Enter sobre una fila: F4 hasta la lista, Tab a la primera fila y Enter.
    let primera = i
        .filas
        .iter()
        .filter(|f| f.visible && !f.rol)
        .chain(i.filas.iter().filter(|f| f.visible && f.rol))
        .map(|f| f.id.to_string())
        .next()
        .ok_or("sin filas a la vista")?;
    let otra = r
        .en_la_vista()
        .into_iter()
        .find(|id| *id != primera)
        .ok_or("un solo panel en la vista")?;
    i.seleccionar(&otra);
    i.region.set(Some("guia"));
    pulsar(w, &[F4]).await;
    let en_lista = i.region.get() == Some("lista");
    pulsar(w, &[TAB]).await;
    pulsar(w, &[ENTER]).await;
    a.anotar(
        en_lista && visible() == primera,
        "Enter sobre una fila",
        &format!(
            "en la lista {en_lista}; {otra} → {} (primera fila {primera})",
            visible()
        ),
    );

    // INV-IFZ-002: con Alt, F4 no es de la app y pide cerrar la ventana.
    let pedido = Rc::new(std::cell::Cell::new(false));
    let p = pedido.clone();
    ui.window().on_close_requested(move || {
        p.set(true);
        slint::CloseRequestResponse::KeepWindowShown
    });
    let region_antes = i.region.get();
    let alt = pulsar(w, &[ALT, F4]).await;
    hasta(5, || pedido.get()).await;
    ui.window()
        .on_close_requested(|| slint::CloseRequestResponse::HideWindow);
    a.anotar(
        alt && pedido.get() && i.region.get() == region_antes,
        "con Alt pulsado, F4 no lo toma la app y la ventana se cierra",
        &format!(
            "cierre pedido {}; región {region_antes:?} → {:?}",
            pedido.get(),
            i.region.get()
        ),
    );
    Ok(())
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn la_copia_de_evidencia_no_lleva_el_navegador() {
        // INV-PRU-002.
        let base = std::env::temp_dir().join(format!("cc-copiar-{}", std::process::id()));
        let desde = base.join("datos");
        std::fs::create_dir_all(desde.join("navegador")).unwrap();
        std::fs::create_dir_all(desde.join("registro")).unwrap();
        std::fs::write(desde.join("navegador").join("x"), "perfil").unwrap();
        std::fs::write(desde.join("registro").join("y"), "hechos").unwrap();
        let hasta = base.join("copia");
        copiar(&desde, &hasta).unwrap();
        assert!(!hasta.join("navegador").exists());
        assert_eq!(
            std::fs::read_to_string(hasta.join("registro").join("y")).unwrap(),
            "hechos"
        );
        std::fs::remove_dir_all(&base).unwrap();
    }
}
