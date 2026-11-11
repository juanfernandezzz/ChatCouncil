//! Port de Prompts.cs (la tabla H## y O##, los prompts del integrador, el verificador y el redactor, y
//! el archivo del redactor) y de los controles de la redacción de InformeFinal.cs. Los textos de los
//! prompts salen de datos/ (DAT-002); la sustitución es la de una sola pasada de operacion.rs.

use std::collections::HashMap;
use std::io;

use crate::datos;
use crate::operacion;
use crate::parseos;
use crate::texto::Texto;

/// Una fila de la tabla tal como la recibe el integrador: H##, el operador como O##.
#[derive(Debug, Clone, PartialEq)]
pub struct HallazgoParaIntegrador {
    pub id: String,
    pub categoria: Texto,
    pub eje: Option<Texto>,
    pub etiquetas: Vec<Texto>,
    pub descripcion: Texto,
    pub operador: String,
}

/// Un hallazgo de la salida vigente de un operador, antes de codificarlo.
#[derive(Debug, Clone, PartialEq)]
pub struct HallazgoParaTabla {
    pub hallazgo_id_original: String,
    pub categoria: Texto,
    pub eje: Option<Texto>,
    pub etiquetas: Vec<Texto>,
    pub descripcion: Texto,
    pub operador_id_original: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FilaTabla {
    pub codigo_hallazgo: String,
    pub hallazgo_id_original: String,
    pub codigo_operador: String,
    pub operador_id_original: String,
    pub categoria: Texto,
    pub eje: Option<Texto>,
    pub etiquetas: Vec<Texto>,
    pub descripcion: Texto,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TablaHallazgos {
    pub filas: Vec<FilaTabla>,
    pub para_prompt: Vec<HallazgoParaIntegrador>,
}

/// Lo que lee el redactor, en el orden que describe su prompt.
#[derive(Debug, Clone, PartialEq)]
pub struct MaterialRedactor {
    pub informe: Texto,
    /// (A|B, texto) ya anonimizadas.
    pub verificaciones: Vec<(String, Texto)>,
    pub tabla: Texto,
    /// (P#, texto) de todo el pool.
    pub respuestas: Vec<(String, Texto)>,
}

/// Los controles MECÁNICOS sobre la respuesta del redactor (RED-006): ninguno juzga el contenido.
#[derive(Debug, Clone, PartialEq)]
pub struct ControlesRedaccion {
    /// entero, no-pudo-leer, marcas-distintas, sin-linea o sin-marcas-registradas.
    pub lectura_archivo: &'static str,
    /// None sin html capturado.
    pub enlaces_externos: Option<usize>,
    /// None sin html o sin material con que comparar.
    pub enlaces_fuera_del_material: Option<usize>,
    pub hallazgos_inexistentes: Vec<String>,
    pub cuerpo: Texto,
}

type U = [u16];

const SALTO: u16 = b'\n' as u16;
const COMILLA: u16 = b'"' as u16;
const BARRA: u16 = b'/' as u16;

fn u(s: &str) -> Vec<u16> {
    s.encode_utf16().collect()
}

/// string.Join sobre Texto: un surrogate suelto de la frontera se une como en UTF-16.
fn unir<'a>(partes: impl IntoIterator<Item = &'a Texto>, separador: &str) -> Texto {
    let mut t = Texto::default();
    for (i, p) in partes.into_iter().enumerate() {
        if i > 0 {
            t.empujar_str(separador);
        }
        t.empujar_texto(p);
    }
    t
}

fn armar(fuente: &'static str, pares: &[(&str, &Texto)]) -> Texto {
    let plantilla =
        u(datos::plantilla(fuente, "PLANTILLA").expect("plantilla de rol en datos/prompts"));
    let valores: Vec<Vec<u16>> = pares.iter().map(|(_, v)| v.a_utf16()).collect();
    let pares: Vec<(&str, &[u16])> = pares
        .iter()
        .zip(&valores)
        .map(|((m, _), v)| (*m, v.as_slice()))
        .collect();
    Texto::desde_utf16(&operacion::sustituir(&plantilla, &pares))
}

/// Lo que recibe el integrador como {{HALLAZGOS}}: H##|CATEGORIA|EJE|P#,P#|DESCRIPCION|O##.
pub fn tabla_de(hallazgos: &[HallazgoParaIntegrador]) -> Texto {
    let (vacio, guion) = (Texto::default(), Texto::from("—"));
    let filas: Vec<Texto> = hallazgos
        .iter()
        .map(|h| {
            let etiquetas = if h.etiquetas.is_empty() {
                guion.clone()
            } else {
                unir(&h.etiquetas, ",")
            };
            let (id, operador) = (Texto::from(h.id.as_str()), Texto::from(h.operador.as_str()));
            let eje = h.eje.as_ref().unwrap_or(&vacio);
            unir(
                [
                    &id,
                    &h.categoria,
                    eje,
                    &etiquetas,
                    &h.descripcion,
                    &operador,
                ],
                "|",
            )
        })
        .collect();
    unir(&filas, "\n")
}

/// INT-003: {{PREGUNTA}} y {{HALLAZGOS}} en la plantilla del integrador.
pub fn armar_prompt_integrador(pregunta: &Texto, hallazgos: &[HallazgoParaIntegrador]) -> Texto {
    armar(
        datos::PROMPT_INTEGRADOR,
        &[
            ("{{PREGUNTA}}", pregunta),
            ("{{HALLAZGOS}}", &tabla_de(hallazgos)),
        ],
    )
}

/// VER-001: el rescate tal cual y solo los hallazgos que cita, en su orden: H##|CATEGORIA|EJE|DESCRIPCION.
pub fn armar_prompt_verificador(
    pregunta: &Texto,
    rescate: &Texto,
    hallazgos: &[&HallazgoParaIntegrador],
) -> Texto {
    let vacio = Texto::default();
    let filas: Vec<Texto> = hallazgos
        .iter()
        .map(|h| {
            let id = Texto::from(h.id.as_str());
            let eje = h.eje.as_ref().unwrap_or(&vacio);
            unir([&id, &h.categoria, eje, &h.descripcion], "|")
        })
        .collect();
    armar(
        datos::PROMPT_VERIFICADOR,
        &[
            ("{{PREGUNTA}}", pregunta),
            ("{{RESCATE}}", rescate),
            ("{{HALLAZGOS}}", &unir(&filas, "\n")),
        ],
    )
}

/// RED-004: {{PREGUNTA}} en la plantilla del redactor.
pub fn armar_prompt_redactor(pregunta: &Texto) -> Texto {
    armar(datos::PROMPT_REDACTOR, &[("{{PREGUNTA}}", pregunta)])
}

/// INT-001 (armar-tabla-hallazgos.ts): H## es el orden de persistencia, nunca barajado; O## es el
/// operador barajado con la semilla de la ronda y el pool en su orden fijo.
pub fn armar_tabla_hallazgos(
    hallazgos: &[HallazgoParaTabla],
    pool_operadores: &[&str],
    semilla: u32,
) -> Result<TablaHallazgos, String> {
    let mut codigo_de: HashMap<&str, String> = HashMap::new();
    for (i, p) in operacion::barajar(pool_operadores, semilla)
        .into_iter()
        .enumerate()
    {
        codigo_de.insert(p, format!("O{}", i + 1));
    }
    let filas = hallazgos
        .iter()
        .enumerate()
        .map(|(i, h)| {
            let codigo = codigo_de
                .get(h.operador_id_original.as_str())
                .ok_or_else(|| {
                    format!(
                        "hallazgo {}: operador \"{}\" no está en el pool de operadores",
                        h.hallazgo_id_original, h.operador_id_original
                    )
                })?;
            Ok(FilaTabla {
                codigo_hallazgo: format!("H{}", i + 1),
                hallazgo_id_original: h.hallazgo_id_original.clone(),
                codigo_operador: codigo.clone(),
                operador_id_original: h.operador_id_original.clone(),
                categoria: h.categoria.clone(),
                eje: h.eje.clone(),
                etiquetas: h.etiquetas.clone(),
                descripcion: h.descripcion.clone(),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let para_prompt = filas
        .iter()
        .map(|f| HallazgoParaIntegrador {
            id: f.codigo_hallazgo.clone(),
            categoria: f.categoria.clone(),
            eje: f.eje.clone(),
            etiquetas: f.etiquetas.clone(),
            descripcion: f.descripcion.clone(),
            operador: f.codigo_operador.clone(),
        })
        .collect();
    Ok(TablaHallazgos { filas, para_prompt })
}

/// RED-001: el archivo del redactor, en el orden que describe su prompt. Las marcas las intercala
/// quien llama.
pub fn armar_archivo_redactor(m: &MaterialRedactor) -> Texto {
    let mut partes: Vec<Texto> = vec!["===== INFORME =====".into(), m.informe.clone()];
    if m.verificaciones.is_empty() {
        partes.push("===== VERIFICACION =====".into());
        partes.push("(sin verificacion capturada en esta ronda)".into());
    }
    for (etiqueta, texto) in &m.verificaciones {
        partes.push(format!("===== VERIFICACION {etiqueta} =====").into());
        partes.push(texto.clone());
    }
    partes.extend([
        "===== HALLAZGOS =====".into(),
        "H##|CATEGORIA|EJE|RESPUESTAS|DESCRIPCION|OPERADOR".into(),
        m.tabla.clone(),
        "===== RESPUESTAS =====".into(),
        Texto::desde_utf16(&operacion::cuerpo_de(&m.respuestas)),
    ]);
    unir(&partes, "\n\n")
}

// ---------------------------------------------------------------- controles de la redacción (RED-006)

/// Marca: \[\[CC-[^\]]+\]\], de izquierda a derecha.
fn marcas_cc(s: &U) -> Vec<&U> {
    let mut r = Vec::new();
    let mut i = 0;
    while i < s.len() {
        if parseos::en(s, i, "[[CC-")
            && let Some(j) = s[i + 5..]
                .iter()
                .position(|&c| c == b']' as u16)
                .map(|k| i + 5 + k)
            && j > i + 5
            && s.get(j + 1) == Some(&(b']' as u16))
        {
            r.push(&s[i..j + 2]);
            i = j + 2;
            continue;
        }
        i += 1;
    }
    r
}

/// (?i:href)[B]*=[B]*"((?i:http)[sS]?:[^"]*)" en s[p..]: dónde empieza y termina el grupo.
fn href_en(s: &U, p: usize) -> Option<(usize, usize)> {
    if !parseos::ci(s, p, "href") {
        return None;
    }
    let k = parseos::saltar_blancos(s, p + 4);
    if s.get(k) != Some(&(b'=' as u16)) {
        return None;
    }
    let k = parseos::saltar_blancos(s, k + 1);
    if s.get(k) != Some(&COMILLA) || !parseos::ci(s, k + 1, "http") {
        return None;
    }
    let mut j = k + 5;
    if matches!(s.get(j), Some(&c) if c == b's' as u16 || c == b'S' as u16) {
        j += 1;
    }
    if s.get(j) != Some(&(b':' as u16)) {
        return None;
    }
    let cierre = j + 1 + s[j + 1..].iter().position(|&c| c == COMILLA)?;
    Some((k + 1, cierre))
}

/// Enlace: <[aA]Borde[^>]*(?i:href)…: el [^>]* codicioso se queda con el ÚLTIMO href de la etiqueta.
fn enlaces(s: &U) -> Vec<&U> {
    let mut r = Vec::new();
    let mut i = 0;
    'buscar: while i < s.len() {
        if s[i] == b'<' as u16
            && matches!(s.get(i + 1), Some(&c) if c == b'a' as u16 || c == b'A' as u16)
            && !s.get(i + 2).is_some_and(|&c| parseos::pal(c))
        {
            let desde = i + 2;
            let hasta = s[desde..]
                .iter()
                .position(|&c| c == b'>' as u16)
                .map_or(s.len(), |k| desde + k);
            for p in (desde..hasta).rev() {
                if let Some((g0, g1)) = href_en(s, p) {
                    r.push(&s[g0..g1]);
                    i = g1 + 1;
                    continue 'buscar;
                }
            }
        }
        i += 1;
    }
    r
}

/// ClaveDeUrl: origen y ruta sin query ni fragmento, con esquema y host en minúsculas.
fn clave_de_url(url: &U) -> Vec<u16> {
    let t = parseos::trim(url);
    let t = &t[..t.iter().position(|&c| c == b'#' as u16).unwrap_or(t.len())];
    let t = &t[..t.iter().position(|&c| c == b'?' as u16).unwrap_or(t.len())];
    let n = t
        .iter()
        .take_while(|&&c| c < 128 && (c as u8).is_ascii_alphabetic())
        .count();
    let mut r = if n > 0 && parseos::en(t, n, "://") {
        let fin = t[n + 3..]
            .iter()
            .position(|&c| c == BARRA)
            .map_or(t.len(), |k| n + 3 + k);
        [operacion::minusculas(&t[..fin]), t[fin..].to_vec()].concat()
    } else {
        t.to_vec()
    };
    while r.last() == Some(&BARRA) {
        r.pop();
    }
    r
}

/// SoloOrigen: ^[a-z]+://[^/]*\z.
fn solo_origen(k: &U) -> bool {
    let n = k
        .iter()
        .take_while(|&&c| c < 128 && (c as u8).is_ascii_lowercase())
        .count();
    n > 0 && parseos::en(k, n, "://") && !k[n + 3..].contains(&BARRA)
}

/// CodigoH dentro de cada Corchetes: \[[^\]\n]*\] y adentro Borde H[0-9]+ Borde.
fn codigos_entre_corchetes(s: &U) -> Vec<String> {
    let mut r = Vec::new();
    let mut i = 0;
    while i < s.len() {
        if s[i] == b'[' as u16
            && let Some(j) = s[i + 1..]
                .iter()
                .position(|&c| c == b']' as u16 || c == SALTO)
                .map(|k| i + 1 + k)
            && s[j] == b']' as u16
        {
            let g = &s[i..=j];
            let mut k = 0;
            while k < g.len() {
                let fin = k
                    + 1
                    + g[k + 1..]
                        .iter()
                        .take_while(|&&c| parseos::digito(c))
                        .count();
                if g[k] == b'H' as u16
                    && (k == 0 || !parseos::pal(g[k - 1]))
                    && fin > k + 1
                    && g.get(fin).is_none_or(|&c| !parseos::pal(c))
                {
                    r.push(String::from_utf16_lossy(&g[k..fin]));
                    k = fin;
                } else {
                    k += 1;
                }
            }
            i = j + 1;
            continue;
        }
        i += 1;
    }
    r
}

/// InformeFinal.ControlesRedaccion: si leyó el archivo entero, si trae enlaces que el material no
/// tenía y si cita hallazgos que no existen (RED-006, INV-RED-002). El cuerpo va en Markdown y sin
/// la línea ARCHIVO (RED-007).
pub fn controles_redaccion(
    texto_crudo: &Texto,
    html: Option<&Texto>,
    marca_primera: Option<&str>,
    marca_ultima: Option<&str>,
    ids_validos: &[&str],
    urls_del_material: &[Texto],
) -> io::Result<ControlesRedaccion> {
    let html = html.filter(|h| !h.bytes().is_empty());
    let (texto, md) = match html {
        Some(h) => (
            parseos::texto_de_html_en_bloques(h, false)?,
            parseos::texto_de_html_en_bloques(h, true)?,
        ),
        None => (texto_crudo.clone(), texto_crudo.clone()),
    };
    let (texto, md) = (texto.a_utf16(), md.a_utf16());
    let primera = texto
        .split(|&c| c == SALTO)
        .map(parseos::trim)
        .find(|l| !l.is_empty())
        .unwrap_or_default();
    let estrellas = primera.iter().take_while(|&&c| c == b'*' as u16).count();
    let lectura = if !parseos::ci(primera, estrellas, "ARCHIVO:") {
        "sin-linea"
    } else if (0..primera.len()).any(|k| parseos::ci(primera, k, "no pude leer")) {
        "no-pudo-leer"
    } else if let (Some(p), Some(u)) = (marca_primera, marca_ultima) {
        let marcas = marcas_cc(primera);
        match (marcas.first(), marcas.last()) {
            (Some(a), Some(z)) if parseos::es(a, p) && parseos::es(z, u) => "entero",
            _ => "marcas-distintas",
        }
    } else {
        "sin-marcas-registradas"
    };

    let hrefs = html.map(|h| {
        enlaces(&h.a_utf16())
            .into_iter()
            .map(clave_de_url)
            .collect::<Vec<_>>()
    });
    let del_material: Vec<Vec<u16>> = urls_del_material
        .iter()
        .map(|m| clave_de_url(&m.a_utf16()))
        .collect();
    // Un dominio sin ruta ("Z.ai" que DeepSeek enlaza solo) está en el material si el material trae
    // páginas de ese sitio.
    let en_material = |k: &Vec<u16>| {
        del_material.contains(k)
            || (solo_origen(k)
                && del_material
                    .iter()
                    .any(|d| d.len() > k.len() && d.starts_with(k) && d[k.len()] == BARRA))
    };
    let mut inexistentes: Vec<String> = Vec::new();
    for codigo in codigos_entre_corchetes(&texto) {
        if !ids_validos.contains(&codigo.as_str()) && !inexistentes.contains(&codigo) {
            inexistentes.push(codigo);
        }
    }
    let cuerpo = if lectura == "sin-linea" {
        Texto::desde_utf16(&md)
    } else {
        let lineas: Vec<&U> = md.split(|&c| c == SALTO).collect();
        let desde = lineas
            .iter()
            .position(|l| !parseos::trim(l).is_empty())
            .map_or(0, |i| i + 1);
        Texto::desde_utf16(parseos::trim(&lineas[desde..].join(&SALTO)))
    };
    Ok(ControlesRedaccion {
        lectura_archivo: lectura,
        enlaces_externos: hrefs.as_ref().map(Vec::len),
        enlaces_fuera_del_material: match &hrefs {
            Some(h) if !urls_del_material.is_empty() => {
                Some(h.iter().filter(|k| !en_material(k)).count())
            }
            _ => None,
        },
        hallazgos_inexistentes: inexistentes,
        cuerpo,
    })
}

fn enlaces_n(n: usize) -> String {
    if n == 1 {
        "1 enlace externo".into()
    } else {
        format!("{n} enlaces externos")
    }
}

/// InformeFinal.LineasDeControl: las tres líneas que van bajo el encabezado del redactor.
pub fn lineas_de_control(c: &ControlesRedaccion) -> Vec<String> {
    let lectura = match c.lectura_archivo {
        "entero" => {
            "Leyó el archivo entero: la primera línea trae la primera y la última marca correctas."
        }
        "no-pudo-leer" => "No pudo leer el archivo: respondió \"no pude leer el archivo adjunto\".",
        "marcas-distintas" => {
            "Las marcas de la primera línea no son las del archivo: leyó parcial o resumió."
        }
        "sin-linea" => {
            "Se saltó la primera línea ARCHIVO: no se puede saber si leyó el archivo entero."
        }
        "sin-marcas-registradas" => {
            "No se puede comprobar la lectura: la app se reinició entre pegar y capturar."
        }
        otra => unreachable!("lectura del archivo desconocida: {otra}"),
    };
    // Lo que se mide son ENLACES en el html, no una salida a la red: solo uno que el material no
    // traía es indicio.
    let enlaces = match (c.enlaces_externos, c.enlaces_fuera_del_material) {
        (None, _) => "- Sin html capturado: no se puede saber si salió a la red.".to_string(),
        (Some(0), _) => {
            "- Ningún enlace externo en lo capturado: nada indica que haya salido a la red."
                .to_string()
        }
        (Some(n), None) => format!(
            "- {} en lo capturado, sin el material de la ronda con que compararlos: no se puede decir si salió a la red o si cita enlaces del material.",
            enlaces_n(n)
        ),
        (Some(n), Some(0)) => format!(
            "- {} en lo capturado, y {} en el material de la ronda: nada indica que haya salido a la red.",
            enlaces_n(n),
            if n == 1 { "estaba" } else { "todos estaban" }
        ),
        (Some(n), Some(f)) => format!(
            "- {} en lo capturado, y {} en el material de la ronda: o salió a la red, o {} de memoria. Lo que cite de {} no sale del material.",
            enlaces_n(n),
            if f == 1 {
                "1 no estaba".to_string()
            } else {
                format!("{f} no estaban")
            },
            if f == 1 {
                "lo escribió"
            } else {
                "los escribió"
            },
            if f == 1 {
                "ese enlace".to_string()
            } else {
                format!("esos {f}")
            }
        ),
    };
    vec![
        format!("- {lectura}"),
        enlaces,
        if c.hallazgos_inexistentes.is_empty() {
            "- Todos los hallazgos que cita existen en la tabla.".to_string()
        } else {
            format!(
                "- Cita hallazgos que no existen en la tabla: {}.",
                c.hallazgos_inexistentes.join(", ")
            )
        },
    ]
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::json::{self, Valor, vector};
    use crate::registro::pruebas::{campo, lista, str_de, texto_de};

    fn t(s: &str) -> Texto {
        Texto::from(s)
    }

    fn obj(campos: Vec<(&str, Valor)>) -> Valor {
        Valor::Objeto(campos.into_iter().map(|(k, v)| (t(k), v)).collect())
    }

    fn vt(x: &Texto) -> Valor {
        Valor::Texto(x.clone())
    }

    fn vs(x: &str) -> Valor {
        Valor::Texto(t(x))
    }

    fn opcional(v: &Valor) -> Option<Texto> {
        match v {
            Valor::Nulo => None,
            v => Some(texto_de(v).clone()),
        }
    }

    fn textos(v: &Valor) -> Vec<Texto> {
        lista(v).iter().map(|e| texto_de(e).clone()).collect()
    }

    fn leer(nombre: &str) -> Valor {
        json::leer(str_de(&vector(nombre))).unwrap()
    }

    fn contiene(a: &Texto, b: &Texto) -> bool {
        let (a, b) = (a.a_utf16(), b.a_utf16());
        a.windows(b.len()).any(|w| w == b)
    }

    fn hallazgos_integrador() -> Vec<HallazgoParaIntegrador> {
        lista(&leer("HallazgosIntegrador"))
            .iter()
            .map(|h| HallazgoParaIntegrador {
                id: str_de(campo(h, "id")).into(),
                categoria: texto_de(campo(h, "categoria")).clone(),
                eje: opcional(campo(h, "eje")),
                etiquetas: textos(campo(h, "etiquetas")),
                descripcion: texto_de(campo(h, "descripcion")).clone(),
                operador: str_de(campo(h, "operador")).into(),
            })
            .collect()
    }

    fn etiquetadas(v: &Valor) -> Vec<(String, Texto)> {
        lista(v)
            .iter()
            .map(|r| {
                (
                    str_de(campo(r, "etiqueta")).into(),
                    texto_de(campo(r, "texto")).clone(),
                )
            })
            .collect()
    }

    /// INT-003, VER-001, RED-004 e INV-VER-001: los tres prompts de rol, carácter por carácter.
    #[test]
    fn prompts_los_de_los_roles_son_los_mismos_que_en_la_unity() {
        let hallazgos = hallazgos_integrador();
        let para_verificador: Vec<&HallazgoParaIntegrador> = hallazgos.iter().collect();
        let rescate = texto_de(&vector("Rescate")).clone();
        for caso in lista(&vector("Prompts")) {
            let pregunta = texto_de(campo(caso, "pregunta"));
            assert_eq!(
                armar_prompt_integrador(pregunta, &hallazgos),
                *texto_de(campo(caso, "integrador")),
                "integrador: {pregunta:?}"
            );
            assert_eq!(
                armar_prompt_verificador(pregunta, &rescate, &para_verificador),
                *texto_de(campo(caso, "verificador")),
                "verificador: {pregunta:?}"
            );
            assert_eq!(
                armar_prompt_redactor(pregunta),
                *texto_de(campo(caso, "redactor")),
                "redactor: {pregunta:?}"
            );
        }
    }

    /// Caso de falla del plan: la pregunta y el rescate traen {{PREGUNTA}}, {{HALLAZGOS}} y
    /// {{RESCATE}}; lo insertado no se vuelve a recorrer y queda literal.
    #[test]
    fn prompts_un_marcador_dentro_del_texto_sustituido_no_se_vuelve_a_sustituir() {
        let pregunta = texto_de(campo(&lista(&vector("Prompts"))[1], "pregunta")).clone();
        let rescate = texto_de(&vector("Rescate")).clone();
        let hallazgos = hallazgos_integrador();
        assert!(contiene(
            &armar_prompt_integrador(&pregunta, &hallazgos),
            &pregunta
        ));
        assert!(contiene(&armar_prompt_redactor(&pregunta), &pregunta));
        let verificador = armar_prompt_verificador(&pregunta, &rescate, &[]);
        assert!(contiene(&verificador, &pregunta));
        assert!(contiene(&verificador, &rescate));
        assert!(contiene(
            &armar_prompt_verificador(&t("p"), &rescate, &[]),
            &rescate
        ));
    }

    fn para_tabla() -> Vec<HallazgoParaTabla> {
        lista(&leer("ParaTabla"))
            .iter()
            .map(|h| HallazgoParaTabla {
                hallazgo_id_original: str_de(campo(h, "hallazgoIdOriginal")).into(),
                categoria: texto_de(campo(h, "categoria")).clone(),
                eje: opcional(campo(h, "eje")),
                etiquetas: textos(campo(h, "etiquetas")),
                descripcion: texto_de(campo(h, "descripcion")).clone(),
                operador_id_original: str_de(campo(h, "operadorIdOriginal")).into(),
            })
            .collect()
    }

    fn eje(e: &Option<Texto>) -> Valor {
        e.as_ref().map_or(Valor::Nulo, vt)
    }

    fn etiquetas(e: &[Texto]) -> Valor {
        Valor::Lista(e.iter().map(vt).collect())
    }

    /// INT-001 e INV-INT-001: H## en orden de persistencia, O## barajado con la semilla; el id real
    /// del operador nunca llega a la fila del prompt.
    #[test]
    fn prompts_la_tabla_de_hallazgos_es_la_misma_que_en_la_unity() {
        let pool: Vec<String> = lista(&vector("PoolCuerpos"))
            .iter()
            .take(7)
            .map(|p| str_de(p).to_string())
            .collect();
        let pool: Vec<&str> = pool.iter().map(String::as_str).collect();
        let mut para = para_tabla();
        let tabla =
            armar_tabla_hallazgos(&para, &pool, operacion::hash_semilla(&t("semilla-fija")))
                .unwrap();
        let obtenido = obj(vec![
            (
                "filas",
                Valor::Lista(
                    tabla
                        .filas
                        .iter()
                        .map(|f| {
                            obj(vec![
                                ("codigoHallazgo", vs(&f.codigo_hallazgo)),
                                ("hallazgoIdOriginal", vs(&f.hallazgo_id_original)),
                                ("codigoOperador", vs(&f.codigo_operador)),
                                ("operadorIdOriginal", vs(&f.operador_id_original)),
                                ("categoria", vt(&f.categoria)),
                                ("eje", eje(&f.eje)),
                                ("etiquetas", etiquetas(&f.etiquetas)),
                                ("descripcion", vt(&f.descripcion)),
                            ])
                        })
                        .collect(),
                ),
            ),
            (
                "paraPrompt",
                Valor::Lista(
                    tabla
                        .para_prompt
                        .iter()
                        .map(|h| {
                            obj(vec![
                                ("id", vs(&h.id)),
                                ("categoria", vt(&h.categoria)),
                                ("eje", eje(&h.eje)),
                                ("etiquetas", etiquetas(&h.etiquetas)),
                                ("descripcion", vt(&h.descripcion)),
                                ("operador", vs(&h.operador)),
                            ])
                        })
                        .collect(),
                ),
            ),
        ]);
        assert_eq!(obtenido, leer("Tabla"));

        para[0].operador_id_original = "deepseek".into();
        assert_eq!(
            armar_tabla_hallazgos(&para[..1], &pool, 1),
            Err(str_de(&vector("ErrorTabla")).to_string())
        );
    }

    /// RED-001: el archivo del redactor, con y sin verificaciones.
    #[test]
    fn prompts_el_archivo_del_redactor_es_el_mismo_que_en_la_unity() {
        for caso in lista(&vector("ArchivosRedactor")) {
            let m = json::leer(str_de(campo(caso, "material"))).unwrap();
            let material = MaterialRedactor {
                informe: texto_de(campo(&m, "informe")).clone(),
                verificaciones: etiquetadas(campo(&m, "verificaciones")),
                tabla: texto_de(campo(&m, "tabla")).clone(),
                respuestas: etiquetadas(campo(&m, "respuestas")),
            };
            assert_eq!(
                armar_archivo_redactor(&material),
                *texto_de(campo(caso, "archivo"))
            );
        }
    }

    fn controles_como_json(c: &ControlesRedaccion) -> Valor {
        let n = |x: Option<usize>| x.map_or(Valor::Nulo, |n| Valor::Entero(n as i64));
        obj(vec![
            ("lecturaArchivo", vs(c.lectura_archivo)),
            ("enlacesExternos", n(c.enlaces_externos)),
            ("enlacesFueraDelMaterial", n(c.enlaces_fuera_del_material)),
            (
                "hallazgosInexistentes",
                Valor::Lista(c.hallazgos_inexistentes.iter().map(|h| vs(h)).collect()),
            ),
            ("cuerpo", vt(&c.cuerpo)),
        ])
    }

    /// RED-006 e INV-RED-002: lectura, enlaces y H## inexistentes, y sus tres líneas.
    #[test]
    fn prompts_los_controles_del_redactor_son_los_mismos_que_en_la_unity() {
        for caso in lista(&vector("Controles")) {
            let r = json::leer(str_de(campo(caso, "respuesta"))).unwrap();
            let html = opcional(campo(&r, "html"));
            let marca = |k| opcional(campo(&r, k)).map(|m| m.para_mostrar().into_owned());
            let (primera, ultima) = (marca("marcaPrimera"), marca("marcaUltima"));
            let c = controles_redaccion(
                texto_de(campo(&r, "textoCrudo")),
                html.as_ref(),
                primera.as_deref(),
                ultima.as_deref(),
                &["H1", "H2"],
                &textos(campo(caso, "material")),
            )
            .unwrap();
            let esperado = json::leer(str_de(campo(caso, "controles"))).unwrap();
            assert_eq!(controles_como_json(&c), esperado, "{r:?}");
            let lineas: Vec<&str> = lista(campo(caso, "lineas")).iter().map(str_de).collect();
            assert_eq!(lineas_de_control(&c), lineas, "{r:?}");
        }
    }

    /// RED-007: DeepSeek enlaza solo "Z.ai"; el material trae páginas de ese sitio.
    #[test]
    fn prompts_un_dominio_del_material_enlazado_solo_no_cuenta_como_fuera_del_material() {
        let html = t(
            "<p>ARCHIVO: x</p><p><a href=\"https://z.ai/\">Z.ai</a> y <a href=\"https://otro.org/\">otro.org</a></p>",
        );
        let c = controles_redaccion(
            &t(""),
            Some(&html),
            None,
            None,
            &[],
            &[t("https://z.ai/blog/glm-5.3")],
        )
        .unwrap();
        assert_eq!(
            (c.enlaces_externos, c.enlaces_fuera_del_material),
            (Some(2), Some(1))
        );
    }
}
