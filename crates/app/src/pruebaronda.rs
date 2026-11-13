//! PRU-012, PRU-013 y PRU-016: `-pruebaronda RUTA`, el port de PruebaRonda.cs. El recorrido de las etapas
//! Pregunta e Investigación con los controles reales, sobre una carpeta de prueba (-datos), nunca la real, y
//! una página local por operador (ronda.html) en lugar de los proveedores. Lo que hace la persona en cada
//! página (enviar) y lo que hace el proveedor (responder) lo simula un script en la página; la app nunca
//! envía. Llega hasta «fin de la investigación» y sigue con el diálogo cancelado, abandonar la ronda,
//! capturar sin pegar y declarar la pregunta. El recorrido de la operación es de PART-016.

use std::path::Path;
use std::rc::Rc;
use std::time::{Duration, Instant};

use nucleo::json::{self, Valor};
use nucleo::puerta;
use nucleo::registro::{self, Hecho};
use slint::Model;

use crate::autoprueba::Anotador;
use crate::interfaz::Interfaz;

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
    let r = recorrido(&mut a, &i).await;
    a.grupo("prueba", r);
    let (texto, mut codigo) = a.cerrar();
    if let Err(e) = std::fs::write(salida, texto) {
        eprintln!("No se pudo escribir {}: {e}", salida.display());
        codigo = 1;
    }
    codigo
}

async fn recorrido(a: &mut Anotador, i: &Rc<Interfaz>) -> Result<(), String> {
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
    // La Unity espera 2: su recorrido de la operación abre antes una ronda copiada. Sin ese recorrido
    // (PART-016) esta es la segunda ronda de la conversación, índice 1.
    a.anotar(
        sin_envio.and_then(|r| texto_de(r, "prompt")).as_deref() == Some(puerta::PROMPT_SIN_RONDA)
            && indice == Some(1)
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
