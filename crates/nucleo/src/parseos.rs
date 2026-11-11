//! Port de Parseos.cs (hallazgos y verificación), TituloInforme.cs (título y sección de rescate),
//! TextoDeHtml.cs y Citas.cs. Sin dependencias (ADR-0008): cada expresión regular de la Unity va
//! escrita a mano sobre unidades UTF-16, como las cadenas de .NET, con su mismo retroceso.

use std::io;

use crate::json::Valor;
use crate::nfd::{CLASES, DESCOMPOSICION, PUNTOS};
use crate::registro::{Hecho, es_blanco};
use crate::texto::Texto;

type U = [u16];

const SALTO: u16 = b'\n' as u16;
const CR: u16 = b'\r' as u16;
const BARRA: u16 = b'|' as u16;
const ESTRELLA: u16 = b'*' as u16;
const COMILLA: u16 = b'"' as u16;
const APOSTROFO: u16 = b'\'' as u16;
const MENOR: u16 = b'<' as u16;
const MAYOR: u16 = b'>' as u16;
const BARRA_INCLINADA: u16 = b'/' as u16;
const IGUAL: u16 = b'=' as u16;
const DOS_PUNTOS: u16 = b':' as u16;

/// Js.EsBlanco sobre una unidad: la clase \s de JS (un surrogate nunca es blanco).
fn b(c: u16) -> bool {
    char::from_u32(c as u32).is_some_and(es_blanco)
}

/// [A-Za-z0-9_]: el lado "palabra" de Js.Borde.
fn pal(c: u16) -> bool {
    c < 128 && ((c as u8).is_ascii_alphanumeric() || c == b'_' as u16)
}

fn digito(c: u16) -> bool {
    (b'0' as u16..=b'9' as u16).contains(&c)
}

fn u(s: &str) -> Vec<u16> {
    s.encode_utf16().collect()
}

fn texto(s: &U) -> Texto {
    Texto::desde_utf16(s)
}

fn es(s: &U, lit: &str) -> bool {
    s.iter().copied().eq(lit.encode_utf16())
}

/// El literal ASCII exacto en s[i..].
fn en(s: &U, i: usize, lit: &str) -> bool {
    s.len() >= i + lit.len() && s[i..].iter().zip(lit.bytes()).all(|(&c, x)| c == x as u16)
}

/// Js.Ci: el literal ASCII en s[i..], con la otra caja solo en las letras ASCII.
fn ci(s: &U, i: usize, lit: &str) -> bool {
    s.len() >= i + lit.len()
        && s[i..]
            .iter()
            .zip(lit.bytes())
            .all(|(&c, x)| c < 128 && (c as u8).eq_ignore_ascii_case(&x))
}

fn saltar_blancos(s: &U, mut i: usize) -> usize {
    while i < s.len() && b(s[i]) {
        i += 1;
    }
    i
}

/// Js.Trim.
fn trim(s: &U) -> &U {
    let i = s.iter().position(|&c| !b(c)).unwrap_or(s.len());
    let j = s.iter().rposition(|&c| !b(c)).map_or(i, |j| j + 1);
    &s[i..j]
}

fn buscar(s: &U, desde: usize, lit: &str) -> Option<usize> {
    (desde..s.len()).find(|&k| en(s, k, lit))
}

fn buscar_ci(s: &U, desde: usize, lit: &str) -> Option<usize> {
    (desde..s.len()).find(|&k| ci(s, k, lit))
}

/// string.Replace(de, a), de izquierda a derecha y sin solaparse.
fn reemplazar(s: &U, de: &str, a: &str) -> Vec<u16> {
    let (de16, a16) = (u(de), u(a));
    let mut r = Vec::with_capacity(s.len());
    let mut i = 0;
    while i < s.len() {
        if s[i..].starts_with(&de16) {
            r.extend_from_slice(&a16);
            i += de16.len();
        } else {
            r.push(s[i]);
            i += 1;
        }
    }
    r
}

fn unir(lineas: &[&U]) -> Vec<u16> {
    let mut r = Vec::new();
    for (i, l) in lineas.iter().enumerate() {
        if i > 0 {
            r.push(SALTO);
        }
        r.extend_from_slice(l);
    }
    r
}

/// Js.ToUpperCase. Fuera de los casos especiales, char.ToUpperInvariant por unidad: Rust da la
/// mayúscula completa, así que solo se toma cuando es un único carácter del plano básico. Los
/// resultados solo se comparan contra texto ASCII, donde las dos tablas coinciden.
fn mayusculas(s: &U) -> Vec<u16> {
    let mut r = Vec::with_capacity(s.len());
    for &c in s {
        let especial: &[u16] = match c {
            0xDF => &[0x53, 0x53],
            0x131 => &[0x49],
            0x17F => &[0x53],
            0x149 => &[0x2BC, 0x4E],
            0x1F0 => &[0x4A, 0x30C],
            0x1E96 => &[0x48, 0x331],
            0x1E97 => &[0x54, 0x308],
            0x1E98 => &[0x57, 0x30A],
            0x1E99 => &[0x59, 0x30A],
            0x1E9A => &[0x41, 0x2BE],
            0xFB00 => &[0x46, 0x46],
            0xFB01 => &[0x46, 0x49],
            0xFB02 => &[0x46, 0x4C],
            0xFB03 => &[0x46, 0x46, 0x49],
            0xFB04 => &[0x46, 0x46, 0x4C],
            0xFB05 | 0xFB06 => &[0x53, 0x54],
            _ => &[],
        };
        if !especial.is_empty() {
            r.extend_from_slice(especial);
            continue;
        }
        r.push(char::from_u32(c as u32).map_or(c, |ch| {
            let mut m = ch.to_uppercase();
            match (m.next(), m.next()) {
                (Some(x), None) if (x as u32) < 0x10000 => x as u16,
                _ => c,
            }
        }));
    }
    r
}

/// Js.NormalizeNfd: descomposición canónica y orden canónico; un surrogate suelto queda igual y,
/// con clase 0, corta el orden como en la Unity.
fn nfd(s: &U) -> Vec<u16> {
    if s.iter().all(|&c| c < 0xC0) {
        return s.to_vec();
    }
    let mut p: Vec<u32> = Vec::with_capacity(s.len());
    for r in char::decode_utf16(s.iter().copied()) {
        let c = r.map_or_else(|e| e.unpaired_surrogate() as u32, |c| c as u32);
        if (0xAC00..=0xD7A3).contains(&c) {
            let i = c - 0xAC00;
            p.push(0x1100 + i / 588);
            p.push(0x1161 + i % 588 / 28);
            if i % 28 != 0 {
                p.push(0x11A7 + i % 28);
            }
        } else if let Ok(j) = DESCOMPOSICION.binary_search_by_key(&c, |d| d.0) {
            let (_, inicio, largo) = DESCOMPOSICION[j];
            p.extend_from_slice(&PUNTOS[inicio as usize..inicio as usize + largo as usize]);
        } else {
            p.push(c);
        }
    }
    let mut i = 0;
    while i < p.len() {
        let n = p[i..].iter().take_while(|&&c| clase(c) != 0).count();
        p[i..i + n].sort_by_key(|&c| clase(c));
        i += n.max(1);
    }
    let mut r = Vec::with_capacity(p.len());
    for c in p {
        match char::from_u32(c) {
            Some(ch) => r.extend_from_slice(ch.encode_utf16(&mut [0; 2])),
            None => r.push(c as u16),
        }
    }
    r
}

fn clase(c: u32) -> u8 {
    CLASES
        .binary_search_by(|&(desde, hasta, _)| {
            if hasta < c {
                std::cmp::Ordering::Less
            } else if desde > c {
                std::cmp::Ordering::Greater
            } else {
                std::cmp::Ordering::Equal
            }
        })
        .map_or(0, |i| CLASES[i].2)
}

/// Parseos.SplitCampos: exactamente n campos por "|", el último con el resto; None si faltan.
fn campos(l: &U, n: usize) -> Option<Vec<&U>> {
    let mut r = Vec::with_capacity(n);
    let mut desde = 0;
    for _ in 1..n {
        let i = desde + l[desde..].iter().position(|&c| c == BARRA)?;
        r.push(&l[desde..i]);
        desde = i + 1;
    }
    r.push(&l[desde..]);
    Some(r)
}

// ---------------------------------------------------------------- hallazgos (OPE-015)

const CATEGORIAS4: [&str; 5] = [
    "CONVERGENCIA",
    "DIVERGENCIA",
    "TENSION",
    "SINGULARIDAD",
    "AUSENCIA",
];
const CATEGORIAS_LIMITACION: [&str; 4] = [
    "LIMITACION:CORPUS",
    "LIMITACION:AMBIGUEDAD",
    "LIMITACION:TAREA",
    "LIMITACION:OTRA",
];

/// Un hallazgo parseado, sin id ni salidaOperadorId: los pone quien escribe el hecho.
#[derive(Debug, Clone, PartialEq)]
pub struct Hallazgo {
    pub categoria: &'static str,
    pub eje: Option<Texto>,
    pub etiquetas: Vec<Texto>,
    pub descripcion: Texto,
    pub etiqueta_invalida: bool,
}

#[derive(Debug, Default, PartialEq)]
pub struct Hallazgos {
    pub hallazgos: Vec<Hallazgo>,
    /// Líneas no vacías que no calzaron con ningún prefijo o no traían los campos exigidos.
    pub lineas_descartadas: usize,
}

fn etiquetas(campo: &U) -> Vec<&U> {
    let t = trim(campo);
    if t.is_empty() || es(t, "—") || es(t, "-") || es(&mayusculas(t), "NINGUNA") {
        return Vec::new();
    }
    t.split(|&c| c == b',' as u16)
        .map(trim)
        .filter(|e| !e.is_empty())
        .collect()
}

fn prefijo(l: &U, prefijos: &[&'static str]) -> Option<&'static str> {
    prefijos
        .iter()
        .copied()
        .find(|p| en(l, 0, p) && (l.len() == p.len() || l[p.len()] == BARRA))
}

fn valida<S: AsRef<str>>(s: &U, validas: &[S]) -> bool {
    validas.iter().any(|v| es(s, v.as_ref()))
}

/// Parseos.ParsearHallazgos: `validas` son las etiquetas del cuerpo que recibió ESTE operador.
pub fn parsear_hallazgos<S: AsRef<str>>(salida: &Texto, validas: &[S]) -> Hallazgos {
    // Espacio duro a espacio antes de parsear, como la Unity.
    let s: Vec<u16> = salida
        .a_utf16()
        .into_iter()
        .map(|c| if c == 0xA0 { b' ' as u16 } else { c })
        .collect();
    let mut r = Hallazgos::default();
    for cruda in s.split(|&c| c == SALTO) {
        let linea = trim(cruda);
        if linea.is_empty() {
            continue;
        }
        let con_eje = prefijo(linea, &CATEGORIAS4);
        let categoria = con_eje.or_else(|| prefijo(linea, &CATEGORIAS_LIMITACION));
        let Some((categoria, c)) = categoria
            .and_then(|cat| Some((cat, campos(linea, if con_eje.is_some() { 4 } else { 3 })?)))
        else {
            r.lineas_descartadas += 1;
            continue;
        };
        let et = etiquetas(c[c.len() - 2]);
        r.hallazgos.push(Hallazgo {
            categoria,
            eje: con_eje.map(|_| texto(trim(c[1]))),
            etiqueta_invalida: et.iter().any(|e| !valida(e, validas)),
            etiquetas: et.iter().map(|e| texto(e)).collect(),
            descripcion: texto(trim(c[c.len() - 1])),
        });
    }
    r
}

// ---------------------------------------------------------------- verificación (VER-005)

const TIPOS: [&str; 4] = ["OFICIAL", "PRIMARIA", "ACADEMICA", "SECUNDARIA"];
const ANTERIOR: [(&str, &str); 3] = [
    ("VERIFICADO", "CONFIRMA"),
    ("CONTRADICHO", "CONTRADICE"),
    ("NO_VERIFICADO", "NO_ENCONTRADA"),
];
const PALABRAS: [&str; 8] = [
    "NO_ENCONTRADA",
    "NO_VERIFICADO",
    "VERIFICADO",
    "CONFIRMA",
    "CONTRADICE",
    "CONTRADICHO",
    "PUNTO_CIEGO",
    "PREGUNTA",
];

#[derive(Debug, Clone, PartialEq)]
pub struct Correspondencia {
    pub correspondencia: &'static str,
    /// Los tipos reconocidos, en el orden en que los escribió.
    pub tipos_fuente: Vec<&'static str>,
    /// Lo que escribió en el campo de tipo y no es ninguno de los cuatro: se conserva.
    pub tipos_no_reconocidos: Vec<Texto>,
    pub hallazgo_id: Texto,
    /// La primera URL http(s) del campo; None si no trae (siempre en NO_ENCONTRADA).
    pub url: Option<Texto>,
    /// La cita sin las comillas de afuera; en NO_ENCONTRADA, el motivo.
    pub texto: Texto,
    pub hallazgo_invalido: bool,
    /// La línea venía como VERIFICADO / CONTRADICHO / NO_VERIFICADO, sin campo de tipo.
    pub formato_anterior: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PuntoCiego {
    pub descripcion: Texto,
    pub url: Option<Texto>,
    pub tipos_fuente: Vec<&'static str>,
    pub tipos_no_reconocidos: Vec<Texto>,
}

#[derive(Debug, Default, PartialEq)]
pub struct Verificacion {
    pub correspondencias: Vec<Correspondencia>,
    pub puntos_ciegos: Vec<PuntoCiego>,
    pub preguntas: Vec<Texto>,
    pub lineas_descartadas: usize,
}

/// PrimeraUrlRe y PuntuacionFinal: la primera URL http(s) sin la puntuación final.
fn primera_url(campo: &U) -> Option<Texto> {
    for i in 0..campo.len() {
        if !ci(campo, i, "http") {
            continue;
        }
        let mut k = i + 4;
        if matches!(campo.get(k), Some(&(0x73 | 0x53))) {
            k += 1;
        }
        if !en(campo, k, "://") {
            continue;
        }
        k += 3;
        let n = campo[k..]
            .iter()
            .take_while(|&&c| !(b(c) || matches!(c, 0x3C | 0x3E | 0x22 | 0x27 | 0x60 | 0x7C)))
            .count();
        if n == 0 {
            continue;
        }
        let mut fin = k + n;
        while matches!(campo[fin - 1], 0x29 | 0x2E | 0x2C | 0x3B | 0x5D) {
            fin -= 1;
        }
        return Some(texto(&campo[i..fin]));
    }
    None
}

/// SinComillas: las comillas que envuelven la cita entera (^"+([^"]*)"+\z), nunca una suelta.
fn sin_comillas(t: &U) -> Texto {
    let t = trim(t);
    let a = t.iter().take_while(|&&c| c == COMILLA).count();
    let m = if a == t.len() {
        if a >= 2 { &t[..0] } else { t }
    } else {
        let z = t.iter().rev().take_while(|&&c| c == COMILLA).count();
        let medio = &t[a..t.len() - z];
        if a > 0 && z > 0 && !medio.contains(&COMILLA) {
            medio
        } else {
            t
        }
    };
    texto(trim(m))
}

/// SeparadorDeTipos como Regex.Split: [B]*(?:,|/|;|\+|[B]+y[B]+)[B]*, y ci.
fn partir_tipos(s: &U) -> Vec<&U> {
    let mut r = Vec::new();
    let (mut desde, mut i) = (0, 0);
    while i < s.len() {
        let k = saltar_blancos(s, i);
        let separa = k < s.len()
            && (matches!(s[k], 0x2C | 0x2F | 0x3B | 0x2B)
                || (k > i && matches!(s[k], 0x79 | 0x59) && s.get(k + 1).is_some_and(|&c| b(c))));
        if separa {
            r.push(&s[desde..i]);
            i = saltar_blancos(s, k + 1);
            desde = i;
        } else {
            i += 1;
        }
    }
    r.push(&s[desde..]);
    r
}

/// LeerTipos: "OFICIAL,PRIMARIA", "Académica", "oficial y primaria", "—": lo reconocido y lo que no.
fn leer_tipos(campo: Option<&U>) -> (Vec<&'static str>, Vec<Texto>) {
    let (mut reconocidos, mut no_reconocidos) = (Vec::new(), Vec::new());
    let Some(campo) = campo else {
        return (reconocidos, no_reconocidos);
    };
    let limpio: Vec<u16> = nfd(campo)
        .into_iter()
        .filter(|&c| !(0x300..=0x36F).contains(&c) && c != ESTRELLA)
        .collect();
    for p in partir_tipos(&limpio).into_iter().map(trim) {
        if p.is_empty() || p.iter().all(|&c| matches!(c, 0x2014 | 0x2013 | 0x2D)) {
            continue;
        }
        let mayus = mayusculas(p);
        match TIPOS.iter().find(|t| es(&mayus, t)) {
            None => no_reconocidos.push(texto(p)),
            Some(t) if !reconocidos.contains(t) => reconocidos.push(*t),
            Some(_) => {}
        }
    }
    (reconocidos, no_reconocidos)
}

/// HId: Js.Borde [hH][0-9]+ Js.Borde.
fn tiene_hid(s: &U) -> bool {
    (0..s.len()).any(|i| {
        (i == 0 || !pal(s[i - 1])) && matches!(s[i], 0x48 | 0x68) && {
            let n = s[i + 1..].iter().take_while(|&&c| digito(c)).count();
            n > 0 && s.get(i + 1 + n).is_none_or(|&c| !pal(c))
        }
    })
}

/// IdsDelCampo: los H## de un campo ("H13/H118 (parcial)" son dos); sin ninguno, el campo tal cual.
fn ids_del_campo(campo: &U) -> Vec<Vec<u16>> {
    let mut ids: Vec<Vec<u16>> = Vec::new();
    let mut i = 0;
    while i < campo.len() {
        if matches!(campo[i], 0x48 | 0x68) {
            let n = campo[i + 1..].iter().take_while(|&&c| digito(c)).count();
            if n > 0 {
                let id = mayusculas(&campo[i..i + 1 + n]);
                if !ids.contains(&id) {
                    ids.push(id);
                }
                i += 1 + n;
                continue;
            }
        }
        i += 1;
    }
    if ids.is_empty() {
        ids.push(trim(campo).to_vec());
    }
    ids
}

fn palabra_en(s: &U, i: usize) -> Option<usize> {
    PALABRAS.iter().find(|p| ci(s, i, p)).map(|p| p.len())
}

/// Vineta: ^[B>*#\-•0-9.)]+ seguido de una palabra clave; se quita el prefijo.
fn sin_vineta(l: &U) -> &U {
    let n = l
        .iter()
        .take_while(|&&c| {
            b(c) || digito(c) || matches!(c, 0x3E | 0x2A | 0x23 | 0x2D | 0x2022 | 0x2E | 0x29)
        })
        .count();
    if n > 0 && palabra_en(l, n).is_some() {
        &l[n..]
    } else {
        l
    }
}

/// Los inicios de Clave sin solaparse: (?<![A-Za-z_])(PALABRAS)\*{0,2}[B]*\|.
fn inicios_de_clave(l: &U) -> Vec<usize> {
    let mut r = Vec::new();
    let mut i = 0;
    while i < l.len() {
        let previo_libre = i == 0
            || !(l[i - 1] < 128
                && ((l[i - 1] as u8).is_ascii_alphabetic() || l[i - 1] == b'_' as u16));
        let fin = previo_libre
            .then(|| {
                PALABRAS.iter().find_map(|p| {
                    if !ci(l, i, p) {
                        return None;
                    }
                    let mut k = i + p.len();
                    let estrellas = l[k..]
                        .iter()
                        .take(2)
                        .take_while(|&&c| c == ESTRELLA)
                        .count();
                    k = saltar_blancos(l, k + estrellas);
                    (l.get(k) == Some(&BARRA)).then_some(k + 1)
                })
            })
            .flatten();
        match fin {
            Some(f) => {
                r.push(i);
                i = f;
            }
            None => i += 1,
        }
    }
    r
}

/// Seccion: corta en el primer "SECCIÓN n…" que llega hasta el final sin otro terminador de línea.
fn sin_seccion(seg: &U) -> &U {
    for i in 0..seg.len() {
        if ci(seg, i, "secci")
            && matches!(seg.get(i + 5), Some(&(0x6F | 0x4F | 0xF3 | 0xD3)))
            && ci(seg, i + 6, "n")
        {
            let k = saltar_blancos(seg, i + 7);
            if k > i + 7
                && k < seg.len()
                && digito(seg[k])
                && !seg[k + 1..]
                    .iter()
                    .any(|&c| matches!(c, 0x0A | 0x0D | 0x2028 | 0x2029))
            {
                return &seg[..i];
            }
        }
    }
    seg
}

/// NegritaAntesDeLaBarra: el primer \*\*[B]*\| pasa a "|".
fn sin_negrita_antes_de_la_barra(seg: &U) -> Vec<u16> {
    for i in 0..seg.len().saturating_sub(1) {
        if seg[i] == ESTRELLA && seg[i + 1] == ESTRELLA {
            let k = saltar_blancos(seg, i + 2);
            if seg.get(k) == Some(&BARRA) {
                let mut r = seg[..i].to_vec();
                r.extend_from_slice(&seg[k..]);
                return r;
            }
        }
    }
    seg.to_vec()
}

/// Segmentos: cada uno arranca en una palabra clave; None es prosa (se descarta).
fn segmentos(salida: &U) -> Vec<Option<Vec<u16>>> {
    let mut limpia: Vec<u16> = salida
        .iter()
        .map(|&c| match c {
            0xA0 => b' ' as u16,
            0x201C | 0x201D | 0xAB | 0xBB => COMILLA,
            _ => c,
        })
        .collect();
    limpia = reemplazar(&reemplazar(&limpia, "&quot;", "\""), "&#39;", "'");
    let mut r = Vec::new();
    for cruda in limpia.split(|&c| c == SALTO) {
        let l = sin_vineta(cruda);
        let inicios = inicios_de_clave(l);
        let Some(&primero) = inicios.first() else {
            if !trim(l).is_empty() {
                r.push(None);
            }
            continue;
        };
        if !trim(&l[..primero]).is_empty() {
            r.push(None);
        }
        for (n, &ini) in inicios.iter().enumerate() {
            let fin = inicios.get(n + 1).copied().unwrap_or(l.len());
            let seg = sin_negrita_antes_de_la_barra(sin_seccion(&l[ini..fin]));
            r.push(Some(trim(&seg).to_vec()));
        }
    }
    r
}

type CamposCorrespondencia<'a> = (Option<&'a U>, Vec<&'a U>);

/// Formato nuevo TIPOS|H##|URL|cita (NO_ENCONTRADA: TIPOS|H##|motivo); sin campo de tipo
/// (formato anterior, o un segundo campo con un H## y ningún tipo): H##|URL|cita.
fn campos_correspondencia(
    l: &U,
    con_url: bool,
    anterior: bool,
) -> Option<CamposCorrespondencia<'_>> {
    let segundo = campos(l, 3).map_or(&l[..0], |t| t[1]);
    let sin_tipo = anterior || (tiene_hid(segundo) && leer_tipos(Some(segundo)).0.is_empty());
    let c = campos(l, if con_url { 5 } else { 4 } - sin_tipo as usize)?;
    Some(if sin_tipo {
        (None, c[1..].to_vec())
    } else {
        (Some(c[1]), c[2..].to_vec())
    })
}

/// Parseos.ParsearVerificacion: `ids_validos` son los H## de la tabla de hallazgos de la ronda.
pub fn parsear_verificacion<S: AsRef<str>>(salida: &Texto, ids_validos: &[S]) -> Verificacion {
    let mut r = Verificacion::default();
    for seg in segmentos(&salida.a_utf16()) {
        let Some((linea, barra)) = seg.and_then(|l| {
            let b = l.iter().position(|&c| c == BARRA)?;
            Some((l, b))
        }) else {
            r.lineas_descartadas += 1;
            continue;
        };
        let palabra = mayusculas(trim(&linea[..barra]));
        let anterior = ANTERIOR
            .iter()
            .find(|(v, _)| es(&palabra, v))
            .map(|&(_, n)| n);
        let correspondencia = anterior.or_else(|| {
            ["CONFIRMA", "CONTRADICE", "NO_ENCONTRADA"]
                .into_iter()
                .find(|p| es(&palabra, p))
        });
        if let Some(corr) = correspondencia {
            let con_url = corr != "NO_ENCONTRADA";
            if let Some((tipos, resto)) =
                campos_correspondencia(&linea, con_url, anterior.is_some())
            {
                let (reconocidos, no_reconocidos) = leer_tipos(tipos);
                let url = if con_url { primera_url(resto[1]) } else { None };
                let t = if con_url {
                    sin_comillas(resto[2])
                } else {
                    texto(trim(resto[1]))
                };
                for id in ids_del_campo(resto[0]) {
                    r.correspondencias.push(Correspondencia {
                        correspondencia: corr,
                        tipos_fuente: reconocidos.clone(),
                        tipos_no_reconocidos: no_reconocidos.clone(),
                        hallazgo_invalido: !valida(&id, ids_validos),
                        hallazgo_id: texto(&id),
                        url: url.clone(),
                        texto: t.clone(),
                        formato_anterior: anterior.is_some(),
                    });
                }
                continue;
            }
        } else if es(&palabra, "PUNTO_CIEGO") {
            // Formato nuevo con tipo (4 campos); el anterior traía 3.
            if let Some(c) = campos(&linea, 4).or_else(|| campos(&linea, 3)) {
                let (tipos_fuente, tipos_no_reconocidos) = leer_tipos(c.get(3).copied());
                r.puntos_ciegos.push(PuntoCiego {
                    descripcion: texto(trim(c[1])),
                    url: primera_url(c[2]),
                    tipos_fuente,
                    tipos_no_reconocidos,
                });
                continue;
            }
        } else if es(&palabra, "PREGUNTA") {
            let t = trim(&linea[barra + 1..]);
            if !t.is_empty() {
                r.preguntas.push(texto(t));
                continue;
            }
        }
        r.lineas_descartadas += 1;
    }
    r
}

// ---------------------------------------------------------------- título y rescate (INT-005, INT-008)

/// SaltoDeLinea.Split: partir por \r?\n.
fn lineas(s: &U) -> Vec<&U> {
    let mut r = Vec::new();
    let mut desde = 0;
    for (i, &c) in s.iter().enumerate() {
        if c == SALTO {
            let fin = if i > desde && s[i - 1] == CR {
                i - 1
            } else {
                i
            };
            r.push(&s[desde..fin]);
            desde = i + 1;
        }
    }
    r.push(&s[desde..]);
    r
}

/// ^[B]*(?:#{1,6}[B]*)?(?:\*\*|__)?[B]*: donde sigue la palabra del encabezado.
fn tras_marcas_de_encabezado(l: &U) -> usize {
    let mut i = saltar_blancos(l, 0);
    let n = l[i..].iter().take_while(|&&c| c == b'#' as u16).count();
    if (1..=6).contains(&n) {
        i = saltar_blancos(l, i + n);
    }
    if en(l, i, "**") || en(l, i, "__") {
        i += 2;
    }
    saltar_blancos(l, i)
}

/// LineaTitulo: el grupo del título, sin recortar, si la línea es "TITULO: …".
fn linea_titulo(l: &U) -> Option<&U> {
    let i = tras_marcas_de_encabezado(l);
    if !(ci(l, i, "t")
        && matches!(l.get(i + 1), Some(&(0x69 | 0x49 | 0xED | 0xCD)))
        && ci(l, i + 2, "tulo"))
    {
        return None;
    }
    let i = saltar_blancos(l, i + 6);
    if l.get(i) != Some(&DOS_PUNTOS) {
        return None;
    }
    let p = saltar_blancos(l, i + 1);
    // (Punto*?)[B]*(?:\*\*|__)?[B]*\z: el grupo perezoso deja afuera el sufijo más largo.
    let mut k = l.len();
    while k > p && b(l[k - 1]) {
        k -= 1;
    }
    if k >= p + 2 && (en(l, k - 2, "**") || en(l, k - 2, "__")) {
        k -= 2;
        while k > p && b(l[k - 1]) {
            k -= 1;
        }
    }
    let g = &l[p..k];
    (!g.iter()
        .any(|&c| matches!(c, 0x0A | 0x0D | 0x2028 | 0x2029)))
    .then_some(g)
}

/// TituloInforme.ExtraerTituloDelInforme: solo mira la PRIMERA línea no vacía; sin título, None.
pub fn extraer_titulo_del_informe(informe: &Texto) -> (Option<Texto>, Texto) {
    let s = informe.a_utf16();
    let ls = lineas(&s);
    let Some(i) = ls.iter().position(|l| !trim(l).is_empty()) else {
        return (None, informe.clone());
    };
    let Some(g) = linea_titulo(ls[i]) else {
        return (None, informe.clone());
    };
    let titulo = trim(g);
    let cuerpo = unir(&ls[i + 1..]);
    // LineasEnBlancoIniciales: el tramo en blanco inicial hasta su último salto.
    let n = cuerpo.iter().take_while(|&&c| b(c)).count();
    let corte = cuerpo[..n]
        .iter()
        .rposition(|&c| c == SALTO)
        .map_or(0, |j| j + 1);
    // Un "TITULO:" sin nada detrás se saca igual, pero no inventa un título vacío.
    (
        (!titulo.is_empty()).then(|| texto(titulo)),
        texto(&cuerpo[corte..]),
    )
}

/// TituloInforme.EsParrafoTitulo.
pub fn es_parrafo_titulo(parrafo: &Texto) -> bool {
    linea_titulo(lineas(&parrafo.a_utf16())[0]).is_some()
}

fn encabezado_rescate(l: &U) -> bool {
    let mut i = tras_marcas_de_encabezado(l);
    if l.get(i) == Some(&(b'5' as u16)) {
        i = saltar_blancos(l, i + 1);
        if matches!(l.get(i), Some(&(0x2E | 0x29 | 0x2D))) {
            i += 1;
        }
        i = saltar_blancos(l, i);
    }
    if en(l, i, "**") || en(l, i, "__") {
        i += 2;
    }
    i = saltar_blancos(l, i);
    if !(ci(l, i, "qu") && matches!(l.get(i + 2), Some(&(0x65 | 0x45 | 0xE9 | 0xC9)))) {
        return false;
    }
    let k = saltar_blancos(l, i + 3);
    if k == i + 3 || !ci(l, k, "conviene") {
        return false;
    }
    let j = saltar_blancos(l, k + 8);
    j > k + 8 && ci(l, j, "rescatar") && l.get(j + 8).is_none_or(|&c| !pal(c))
}

/// TituloInforme.EsEncabezadoRescate.
pub fn es_encabezado_rescate(linea: &Texto) -> bool {
    encabezado_rescate(&linea.a_utf16())
}

/// TituloInforme.ExtraerSeccionRescate: None si el informe no la tiene o está vacía.
pub fn extraer_seccion_rescate(informe: &Texto) -> Option<Texto> {
    let s = informe.a_utf16();
    let ls = lineas(&s);
    let i = ls.iter().position(|l| encabezado_rescate(l))?;
    let cuerpo = unir(&ls[i + 1..]);
    let t = trim(&cuerpo);
    (!t.is_empty()).then(|| texto(t))
}

// ---------------------------------------------------------------- texto desde html (INT-009, VER-006)

const BLOQUES: [&str; 18] = [
    "p",
    "div",
    "li",
    "ol",
    "ul",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "pre",
    "blockquote",
    "tr",
    "table",
    "section",
    "article",
    "hr",
];
const VACIAS_HTML: [&str; 13] = [
    "img", "input", "br", "hr", "wbr", "area", "col", "embed", "source", "track", "meta", "link",
    "param",
];

/// Comentario: <!--[\s\S]*?--> fuera.
fn sin_comentarios(s: &U) -> Vec<u16> {
    let mut r = Vec::with_capacity(s.len());
    let mut i = 0;
    while i < s.len() {
        if en(s, i, "<!--")
            && let Some(j) = buscar(s, i + 4, "-->")
        {
            i = j + 3;
            continue;
        }
        r.push(s[i]);
        i += 1;
    }
    r
}

/// EstiloOScript: <style Borde …</style> y <script Borde …</script>, sin distinguir caja.
fn sin_estilos(s: &U) -> Vec<u16> {
    let mut r = Vec::with_capacity(s.len());
    let mut i = 0;
    'fuera: while i < s.len() {
        if s[i] == MENOR {
            for nombre in ["style", "script"] {
                let tras = i + 1 + nombre.len();
                if ci(s, i + 1, nombre)
                    && s.get(tras).is_none_or(|&c| !pal(c))
                    && let Some(j) = buscar_ci(s, tras, &format!("</{nombre}>"))
                {
                    i = j + nombre.len() + 3;
                    continue 'fuera;
                }
            }
        }
        r.push(s[i]);
        i += 1;
    }
    r
}

/// String.fromCodePoint de DesdePuntoDeCodigo: tira por encima de U+10FFFF (el RangeError de
/// TypeScript) y deja pasar un surrogate suelto.
fn desde_punto_de_codigo(digitos: &U, hex: bool) -> io::Result<Vec<u16>> {
    let sin_ceros = &digitos[digitos.iter().take_while(|&&c| c == b'0' as u16).count()..];
    let maximo = if hex { 6 } else { 7 };
    let punto = if sin_ceros.len() > maximo {
        u32::MAX
    } else {
        sin_ceros.iter().fold(0u32, |n, &c| {
            n * if hex { 16 } else { 10 }
                + char::from_u32(c as u32)
                    .and_then(|d| d.to_digit(16))
                    .unwrap_or(0)
        })
    };
    if punto > 0x10FFFF {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!(
                "punto de código fuera de rango: {}",
                String::from_utf16_lossy(digitos)
            ),
        ));
    }
    Ok(match char::from_u32(punto) {
        Some(c) => c.encode_utf16(&mut [0; 2]).to_vec(),
        None => vec![punto as u16],
    })
}

/// Decimal (&#n;) o Hexadecimal (&#xh;), cada aparición de izquierda a derecha.
fn numericas(t: &U, hex: bool) -> io::Result<Vec<u16>> {
    let mut r = Vec::with_capacity(t.len());
    let mut i = 0;
    while i < t.len() {
        if en(t, i, "&#") {
            let k = i + 2 + (hex && matches!(t.get(i + 2), Some(&(0x78 | 0x58)))) as usize;
            let n = t[k..]
                .iter()
                .take_while(|&&c| {
                    if hex {
                        c < 128 && (c as u8).is_ascii_hexdigit()
                    } else {
                        digito(c)
                    }
                })
                .count();
            if (!hex || k > i + 2) && n > 0 && t.get(k + n) == Some(&(b';' as u16)) {
                r.extend(desde_punto_de_codigo(&t[k..k + n], hex)?);
                i = k + n + 1;
                continue;
            }
        }
        r.push(t[i]);
        i += 1;
    }
    Ok(r)
}

fn decodificar(s: &U) -> io::Result<Vec<u16>> {
    let mut t = s.to_vec();
    for (de, a) in [
        ("&nbsp;", " "),
        ("&lt;", "<"),
        ("&gt;", ">"),
        ("&quot;", "\""),
        ("&#39;", "'"),
        ("&apos;", "'"),
    ] {
        t = reemplazar(&t, de, a);
    }
    t = numericas(&t, false)?;
    t = numericas(&t, true)?;
    Ok(reemplazar(&t, "&amp;", "&"))
}

/// Control: role="button" o una class con code-block-banner (esa parte, con su caja exacta).
fn es_control(a: &U) -> bool {
    (0..a.len()).any(|i| {
        if i > 0 && pal(a[i - 1]) {
            return false;
        }
        let valor = |largo: usize| {
            let k = saltar_blancos(a, i + largo);
            (a.get(k) == Some(&IGUAL)).then(|| saltar_blancos(a, k + 1))
        };
        let boton = ci(a, i, "role")
            && valor(4)
                .is_some_and(|k| en(a, k, "\"") && ci(a, k + 1, "button") && en(a, k + 7, "\""));
        boton
            || ci(a, i, "class")
                && valor(5).is_some_and(|k| {
                    a.get(k) == Some(&COMILLA) && {
                        let fin = a[k + 1..]
                            .iter()
                            .position(|&c| c == COMILLA)
                            .map_or(a.len(), |p| k + 1 + p);
                        buscar(&a[..fin], k + 1, "code-block-banner").is_some()
                    }
                })
    })
}

/// Start: Borde start[B]*=[B]*"?([0-9]+); sin él, 1; un número que no cabe, long.MaxValue.
fn inicio_de_lista(a: &U) -> i64 {
    for i in 0..a.len() {
        if (i > 0 && pal(a[i - 1])) || !ci(a, i, "start") {
            continue;
        }
        let k = saltar_blancos(a, i + 5);
        if a.get(k) != Some(&IGUAL) {
            continue;
        }
        let mut k = saltar_blancos(a, k + 1);
        if a.get(k) == Some(&COMILLA) && a.get(k + 1).is_some_and(|&c| digito(c)) {
            k += 1;
        }
        let n = a[k..].iter().take_while(|&&c| digito(c)).count();
        if n > 0 {
            return String::from_utf16_lossy(&a[k..k + n])
                .parse()
                .unwrap_or(i64::MAX);
        }
    }
    1
}

/// TextoDeHtml.TextoDeHtmlEnBloques: un salto por bloque y el número de cada ítem de <ol>
/// (respetando start). Con markdown (el cuerpo del redactor), también títulos, tablas y código.
pub fn texto_de_html_en_bloques(html: &Texto, markdown: bool) -> io::Result<Texto> {
    let s = sin_estilos(&sin_comentarios(&html.a_utf16()));
    let mut listas: Vec<(bool, i64)> = Vec::new();
    let mut salida: Vec<u16> = Vec::with_capacity(s.len());
    // Justo después de "5. " (o "- ") el <p> del ítem no corta la línea.
    let mut tras_prefijo = false;
    let mut saltar: Option<(String, i32)> = None;
    let mut en_celda = false;
    let mut encabezados = 0;
    let mut i = 0;
    while i < s.len() {
        if s[i] != MENOR {
            // ([^<]+)
            let j = s[i..]
                .iter()
                .position(|&c| c == MENOR)
                .map_or(s.len(), |p| i + p);
            let crudo = &s[i..j];
            i = j;
            if saltar.is_some() {
                continue;
            }
            let t = decodificar(crudo)?;
            if markdown && en_celda {
                salida.extend(reemplazar(&t, "|", "\\|"));
            } else {
                salida.extend(t);
            }
            tras_prefijo = false;
            continue;
        }
        // <(/?)([A-Za-z0-9]+)([^>]*)>; un "<" que no abre etiqueta se saltea.
        let cierre = s.get(i + 1) == Some(&BARRA_INCLINADA);
        let ini = i + 1 + cierre as usize;
        let n = s[ini..]
            .iter()
            .take_while(|&&c| c < 128 && (c as u8).is_ascii_alphanumeric())
            .count();
        let Some(mayor) = (n > 0)
            .then(|| {
                s[ini + n..]
                    .iter()
                    .position(|&c| c == MAYOR)
                    .map(|p| ini + n + p)
            })
            .flatten()
        else {
            i += 1;
            continue;
        };
        let tag = String::from_utf16_lossy(&s[ini..ini + n]).to_ascii_lowercase();
        let atributos = &s[ini + n..mayor];
        i = mayor + 1;
        if let Some((t, n)) = &mut saltar {
            if *t == tag {
                *n += if cierre { -1 } else { 1 };
            }
            if *n == 0 {
                saltar = None;
            }
            continue;
        }
        if !cierre && (tag == "button" || es_control(atributos)) {
            if !VACIAS_HTML.contains(&tag.as_str()) && atributos.last() != Some(&BARRA_INCLINADA) {
                saltar = Some((tag, 1));
            }
            continue;
        }
        if tag == "br" {
            salida.push(SALTO);
            continue;
        }
        if cierre && (tag == "td" || tag == "th") {
            salida.extend(u(" | "));
            en_celda = false;
            continue;
        }
        if markdown {
            if tag == "td" || tag == "th" {
                en_celda = true;
                if tag == "th" {
                    encabezados += 1;
                }
                continue;
            }
            if en_celda {
                continue;
            }
            let nivel = tag
                .strip_prefix('h')
                .filter(|d| d.len() == 1)
                .and_then(|d| d.parse::<usize>().ok());
            if let Some(nivel) = nivel.filter(|n| (1..=6).contains(n)) {
                if cierre {
                    salida.extend(u("\n\n"));
                } else {
                    salida.extend(u(&format!("\n\n{} ", "#".repeat((nivel + 2).min(6)))));
                }
                continue;
            }
            if tag == "pre" {
                salida.extend(u(if cierre { "\n```\n\n" } else { "\n\n```\n" }));
                continue;
            }
            if tag == "table" {
                salida.extend(u("\n\n"));
                continue;
            }
            if tag == "tr" {
                // Cada fila abre su línea; una línea en blanco entre filas partiría la tabla.
                if !cierre {
                    salida.extend(u("\n| "));
                } else {
                    if encabezados > 0 {
                        salida.extend(u(&format!("\n|{}", " --- |".repeat(encabezados))));
                    }
                    encabezados = 0;
                }
                continue;
            }
        }
        if !BLOQUES.contains(&tag.as_str()) || (tras_prefijo && !cierre) {
            continue;
        }
        if salida.last().is_some_and(|&c| c != SALTO) {
            salida.push(SALTO);
        }
        if cierre {
            if tag == "ol" || tag == "ul" {
                listas.pop();
            }
            continue;
        }
        if tag == "ol" || tag == "ul" {
            listas.push((tag == "ol", inicio_de_lista(atributos)));
        } else if tag == "li" {
            if let Some((ordenada, n)) = listas.last_mut() {
                if *ordenada {
                    salida.extend(u(&format!("{n}. ")));
                    // long de C#, sin chequeo: pasado el máximo da la vuelta.
                    *n = n.wrapping_add(1);
                } else {
                    salida.extend(u("- "));
                }
            }
            tras_prefijo = !listas.is_empty();
        }
    }
    let mut unido = Vec::with_capacity(salida.len());
    for (k, l) in salida.split(|&c| c == SALTO).enumerate() {
        if k > 0 {
            unido.push(SALTO);
        }
        let fin = l.len()
            - l.iter()
                .rev()
                .take_while(|&&c| c == b' ' as u16 || c == b'\t' as u16)
                .count();
        unido.extend_from_slice(&l[..fin]);
    }
    // TresSaltos: \n{3,} a \n\n.
    let mut r = Vec::with_capacity(unido.len());
    let mut saltos = 0;
    for c in unido {
        saltos = if c == SALTO { saltos + 1 } else { 0 };
        if saltos <= 2 {
            r.push(c);
        }
    }
    Ok(texto(trim(&r)))
}

fn vacio(t: Option<&Texto>) -> bool {
    t.is_none_or(|t| t.bytes().is_empty())
}

/// TextoDeHtml.TextoDelInformeIntegrador: el re-derivado del html, o el crudo si no hay html.
pub fn texto_del_informe_integrador(crudo: &Texto, html: Option<&Texto>) -> io::Result<Texto> {
    match html {
        Some(h) if !vacio(html) => texto_de_html_en_bloques(h, false),
        _ => Ok(crudo.clone()),
    }
}

/// TextoDeHtml.TextoDeLaSalidaVerificador: el crudo con saltos ya trae sus bloques y no trae el
/// razonamiento que el html sí guarda; el html solo rescata las capturas sin saltos.
pub fn texto_de_la_salida_verificador(crudo: &Texto, html: Option<&Texto>) -> io::Result<Texto> {
    match html {
        Some(h) if !vacio(html) && !crudo.bytes().contains(&b'\n') => {
            texto_de_html_en_bloques(h, false)
        }
        _ => Ok(crudo.clone()),
    }
}

// ---------------------------------------------------------------- citas (CAP-011)

/// Sin cierre propio: nunca aparecen como </tag> y no empujan la pila de ancestros.
const VACIAS_CITAS: [&str; 14] = [
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source",
    "track", "wbr",
];

/// Lo que devuelve Citas.ExtraerCitas: una cita por APARICIÓN, las anclas vistas y los descartes.
#[derive(Debug, Default)]
pub struct Citas {
    pub citas: Vec<Hecho>,
    pub anclas_vistas: usize,
    /// (motivo, href crudo o "").
    pub descartados: Vec<(&'static str, Texto)>,
}

struct Etiqueta<'a> {
    nombre: String,
    cierre: bool,
    atributos: &'a U,
    termina_en_barra: bool,
    fin: usize,
}

/// Etiqueta: </?([a-zA-Z][a-zA-Z0-9-]*)((?:[B]+[^<>]*?)?)/?> en s[i..], con s[i] == '<'.
fn etiqueta_en(s: &U, i: usize) -> Option<Etiqueta<'_>> {
    let cierre = s.get(i + 1) == Some(&BARRA_INCLINADA);
    let k = i + 1 + cierre as usize;
    if !s
        .get(k)
        .is_some_and(|&c| c < 128 && (c as u8).is_ascii_alphabetic())
    {
        return None;
    }
    let n = 1 + s[k + 1..]
        .iter()
        .take_while(|&&c| c < 128 && ((c as u8).is_ascii_alphanumeric() || c == b'-' as u16))
        .count();
    let tras = k + n;
    let mayor = tras + s[tras..].iter().position(|&c| c == MAYOR || c == MENOR)?;
    if s[mayor] == MENOR {
        return None;
    }
    let contenido = &s[tras..mayor];
    let atributos = match contenido {
        [] | [BARRA_INCLINADA] => &contenido[..0],
        [c, ..] if b(*c) => contenido
            .strip_suffix(&[BARRA_INCLINADA])
            .unwrap_or(contenido),
        _ => return None,
    };
    Some(Etiqueta {
        nombre: String::from_utf16_lossy(&s[k..tras]).to_ascii_lowercase(),
        cierre,
        atributos,
        termina_en_barra: s[mayor - 1] == BARRA_INCLINADA,
        fin: mayor + 1,
    })
}

/// Atributo: ([a-zA-Z_:][-a-zA-Z0-9_:.]*)[B]*=[B]*("…"|'…'), con la clave en minúsculas; una
/// clave repetida se queda con el último valor.
fn atributos(a: &U) -> Vec<(String, &U)> {
    let mut r: Vec<(String, &U)> = Vec::new();
    let mut i = 0;
    while i < a.len() {
        let Some((clave, valor, fin)) = atributo_en(a, i) else {
            i += 1;
            continue;
        };
        match r.iter_mut().find(|(k, _)| *k == clave) {
            Some(e) => e.1 = valor,
            None => r.push((clave, valor)),
        }
        i = fin;
    }
    r
}

fn atributo_en(a: &U, i: usize) -> Option<(String, &U, usize)> {
    let ascii = |c: u16, f: fn(&u8) -> bool| c < 128 && f(&(c as u8));
    let c = *a.get(i)?;
    if !(ascii(c, u8::is_ascii_alphabetic) || c == b'_' as u16 || c == DOS_PUNTOS) {
        return None;
    }
    let n = 1 + a[i + 1..]
        .iter()
        .take_while(|&&c| {
            ascii(c, u8::is_ascii_alphanumeric) || matches!(c, 0x2D | 0x5F | 0x3A | 0x2E)
        })
        .count();
    let k = saltar_blancos(a, i + n);
    if a.get(k) != Some(&IGUAL) {
        return None;
    }
    let k = saltar_blancos(a, k + 1);
    let q = *a.get(k)?;
    if q != COMILLA && q != APOSTROFO {
        return None;
    }
    let cierre = k + 1 + a[k + 1..].iter().position(|&c| c == q)?;
    Some((
        String::from_utf16_lossy(&a[i..i + n]).to_ascii_lowercase(),
        &a[k + 1..cierre],
        cierre + 1,
    ))
}

/// ContenedorDeFuentes: Borde(fuentes?|sources?|referenc\w*|bibliograf\w*)Borde, sin distinguir caja.
fn menciona_fuentes(v: &U) -> bool {
    let fin = |k: usize| v.get(k).is_none_or(|&c| !pal(c));
    (0..v.len()).any(|i| {
        let palabra = |p: &str| {
            ci(v, i, p) && {
                let k = i + p.len();
                fin(k) || (matches!(v.get(k), Some(&(0x73 | 0x53))) && fin(k + 1))
            }
        };
        (i == 0 || !pal(v[i - 1]))
            && (palabra("fuente")
                || palabra("source")
                || ci(v, i, "referenc")
                || ci(v, i, "bibliograf"))
    })
}

fn es_contenedor_de_fuentes(atributos: &[(String, &U)]) -> bool {
    atributos
        .iter()
        .any(|(k, v)| (k == "class" || k == "id" || k.starts_with("data-")) && menciona_fuentes(v))
}

/// TituloDeFuentes: ^(fuentes?( claves?)?|referencias?|sources?|references?|citas?|bibliograf[ií]a)\s*:?$/i
fn titulo_de_fuentes(t: &U) -> bool {
    let mut t = t.strip_suffix(&[DOS_PUNTOS]).unwrap_or(t);
    while t.last().is_some_and(|&c| b(c)) {
        t = &t[..t.len() - 1];
    }
    let l: Vec<u16> = t
        .iter()
        .map(|&c| match c {
            0x41..=0x5A => c + 0x20,
            0xCD => 0xED,
            _ => c,
        })
        .collect();
    [
        "fuente",
        "fuentes",
        "fuente clave",
        "fuente claves",
        "fuentes clave",
        "fuentes claves",
        "referencia",
        "referencias",
        "source",
        "sources",
        "reference",
        "references",
        "cita",
        "citas",
        "bibliografia",
        "bibliografía",
    ]
    .iter()
    .any(|x| es(&l, x))
}

fn decodificar_entidades(s: &U) -> Vec<u16> {
    let mut t = s.to_vec();
    for (de, a) in [
        ("&amp;", "&"),
        ("&lt;", "<"),
        ("&gt;", ">"),
        ("&quot;", "\""),
        ("&#39;", "'"),
        ("&nbsp;", " "),
    ] {
        t = reemplazar(&t, de, a);
    }
    t
}

/// TextoVisibleDe: etiquetas a espacio, entidades, blancos colapsados y recortado.
fn texto_visible(fragmento: &U) -> Vec<u16> {
    let mut sin_etiquetas = Vec::with_capacity(fragmento.len());
    let mut i = 0;
    while i < fragmento.len() {
        if fragmento[i] == MENOR
            && let Some(p) = fragmento[i..].iter().position(|&c| c == MAYOR)
        {
            sin_etiquetas.push(b' ' as u16);
            i += p + 1;
            continue;
        }
        sin_etiquetas.push(fragmento[i]);
        i += 1;
    }
    let mut r: Vec<u16> = Vec::with_capacity(sin_etiquetas.len());
    for c in decodificar_entidades(&sin_etiquetas) {
        if !b(c) {
            r.push(c);
        } else if r.last() != Some(&(b' ' as u16)) {
            r.push(b' ' as u16);
        }
    }
    trim(&r).to_vec()
}

/// HastaElCierre: el texto desde `desde` hasta el primer </nombre[B]*>; "" si no cierra.
fn hasta_el_cierre<'a>(s: &'a U, desde: usize, nombre: &str) -> &'a U {
    (desde..s.len())
        .find(|&k| {
            en(s, k, "</")
                && ci(s, k + 2, nombre)
                && s.get(saltar_blancos(s, k + 2 + nombre.len())) == Some(&MAYOR)
        })
        .map_or(&s[..0], |k| &s[desde..k])
}

/// ClasificarHref: el motivo de descarte, o None si el href es una URL http(s) absoluta.
fn clasificar_href(crudo: Option<&U>) -> Option<&'static str> {
    let Some(crudo) = crudo else {
        return Some("sin-href");
    };
    let decodificado = decodificar_entidades(crudo);
    let href = trim(&decodificado);
    if href.is_empty() {
        Some("href-vacio")
    } else if ["javascript:", "mailto:", "tel:", "data:"]
        .iter()
        .any(|e| ci(href, 0, e))
    {
        Some("esquema-no-http")
    } else if !(ci(href, 0, "http")
        && (en(href, 4, "://")
            || (matches!(href.get(4), Some(&(0x73 | 0x53))) && en(href, 5, "://"))))
    {
        Some("no-absoluta-http")
    } else {
        None
    }
}

/// Citas.ExtraerCitas: las citas del html de una respuesta (nunca del texto: no arrastra href),
/// en un solo recorrido con la pila de ancestros abiertos que decide dondeVive.
pub fn extraer_citas(
    html: &Texto,
    respuesta_id: &str,
    nuevo_id: &mut dyn FnMut() -> String,
) -> io::Result<Citas> {
    let s = html.a_utf16();
    let mut r = Citas::default();
    let mut pila: Vec<String> = Vec::new();
    let mut contenedor: Option<usize> = None;
    // Un título ya CERRADO ("<h2>Referencias</h2>") sigue marcando lo que viene después.
    let mut seccion_de_fuentes = false;
    let mut i = 0;
    while let Some(p) = s[i..].iter().position(|&c| c == MENOR) {
        let Some(e) = etiqueta_en(&s, i + p) else {
            i += p + 1;
            continue;
        };
        i = e.fin;
        let autocerrada = e.termina_en_barra || VACIAS_CITAS.contains(&e.nombre.as_str());
        if e.cierre {
            if e.nombre == "a" {
                continue; // ya se resolvió al abrir
            }
            if let Some(j) = pila.iter().rposition(|t| *t == e.nombre) {
                pila.truncate(j);
                if contenedor.is_some_and(|d| d >= pila.len()) {
                    contenedor = None;
                }
            }
            continue;
        }
        let atrs = atributos(e.atributos);
        let es_titulo = matches!(e.nombre.as_bytes(), [b'h', b'1'..=b'6']);
        if es_titulo && !autocerrada {
            seccion_de_fuentes =
                titulo_de_fuentes(&texto_visible(hasta_el_cierre(&s, e.fin, &e.nombre)));
        }
        if e.nombre == "a" {
            r.anclas_vistas += 1;
            let href = atrs.iter().find(|(k, _)| k == "href").map(|(_, v)| *v);
            match clasificar_href(href) {
                Some(motivo) => r.descartados.push((motivo, texto(href.unwrap_or(&[])))),
                None => {
                    let url = texto(trim(&decodificar_entidades(href.unwrap_or(&[]))));
                    let visible = texto(&texto_visible(hasta_el_cierre(&s, e.fin, "a")));
                    let donde = if seccion_de_fuentes || contenedor.is_some() {
                        "panel-ancestro"
                    } else {
                        "cuerpo"
                    };
                    r.citas.push(Hecho::nuevo(
                        "cita",
                        &[
                            ("id", Valor::Texto(nuevo_id().into())),
                            ("respuestaId", Valor::Texto(respuesta_id.into())),
                            ("url", Valor::Texto(url)),
                            ("textoVisible", Valor::Texto(visible)),
                            ("dondeVive", Valor::Texto(donde.into())),
                        ],
                    )?);
                }
            }
            // El <a> no se apila: su </a> no tiene que desapilar nada.
            continue;
        }
        if !autocerrada {
            pila.push(e.nombre);
            if contenedor.is_none() && es_contenedor_de_fuentes(&atrs) {
                contenedor = Some(pila.len() - 1);
            }
        }
    }
    Ok(r)
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::json::{self, vector};
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

    fn vo(x: &Option<Texto>) -> Valor {
        x.as_ref().map_or(Valor::Nulo, vt)
    }

    fn vs(x: &[&str]) -> Valor {
        Valor::Lista(x.iter().map(|s| Valor::Texto(t(s))).collect())
    }

    fn vl(x: &[Texto]) -> Valor {
        Valor::Lista(x.iter().map(vt).collect())
    }

    fn esperado(nombre: &str) -> Valor {
        json::leer(str_de(&vector(nombre))).expect("vector con JSON ilegible")
    }

    fn json_de(v: &Valor) -> Valor {
        json::leer(texto_de(v).como_str().expect("JSON con surrogates")).expect("JSON ilegible")
    }

    const P1_A_P6: [&str; 6] = ["P1", "P2", "P3", "P4", "P5", "P6"];

    fn hallazgos_como_json(r: &Hallazgos) -> Valor {
        obj(vec![
            (
                "hallazgos",
                Valor::Lista(
                    r.hallazgos
                        .iter()
                        .map(|h| {
                            obj(vec![
                                ("categoria", Valor::Texto(t(h.categoria))),
                                ("eje", vo(&h.eje)),
                                ("etiquetas", vl(&h.etiquetas)),
                                ("descripcion", vt(&h.descripcion)),
                                ("etiquetaInvalida", Valor::Bool(h.etiqueta_invalida)),
                            ])
                        })
                        .collect(),
                ),
            ),
            (
                "lineasDescartadas",
                Valor::Entero(r.lineas_descartadas as i64),
            ),
        ])
    }

    #[test]
    fn parseos_los_hallazgos_son_los_mismos_que_en_la_unity() {
        let r = parsear_hallazgos(texto_de(&vector("SalidaOperador")), &P1_A_P6);
        assert_eq!(hallazgos_como_json(&r), esperado("HallazgosParseados"));
    }

    #[test]
    fn parseos_una_linea_con_categoria_desconocida_no_se_cuenta_como_hallazgo() {
        let r = parsear_hallazgos(
            &t("CONVERGENCIAX|HECHOS|P1|no es prefijo\nCONVERGENCIA|HECHOS|P1|si"),
            &P1_A_P6,
        );
        assert_eq!(r.hallazgos.len(), 1);
        assert_eq!(r.hallazgos[0].descripcion, t("si"));
        assert_eq!(r.lineas_descartadas, 1);
    }

    #[test]
    fn parseos_tension_se_lee_y_una_etiqueta_inexistente_queda_marcada() {
        let r = parsear_hallazgos(texto_de(&vector("SalidaOperador")), &P1_A_P6);
        let tension: Vec<_> = r
            .hallazgos
            .iter()
            .filter(|h| h.categoria == "TENSION")
            .collect();
        assert_eq!(tension.len(), 1);
        assert_eq!(tension[0].etiquetas, vec![t("P1"), t("P9")]);
        assert!(tension[0].etiqueta_invalida);
    }

    fn tipos_como_json(rec: &[&str], norec: &[Texto]) -> [(&'static str, Valor); 2] {
        [("tiposFuente", vs(rec)), ("tiposNoReconocidos", vl(norec))]
    }

    fn verificacion_como_json(r: &Verificacion) -> Valor {
        let correspondencias = r
            .correspondencias
            .iter()
            .map(|c| {
                let [tf, tn] = tipos_como_json(&c.tipos_fuente, &c.tipos_no_reconocidos);
                obj(vec![
                    ("correspondencia", Valor::Texto(t(c.correspondencia))),
                    tf,
                    tn,
                    ("hallazgoId", vt(&c.hallazgo_id)),
                    ("url", vo(&c.url)),
                    ("texto", vt(&c.texto)),
                    ("hallazgoInvalido", Valor::Bool(c.hallazgo_invalido)),
                    ("formatoAnterior", Valor::Bool(c.formato_anterior)),
                ])
            })
            .collect();
        let puntos = r
            .puntos_ciegos
            .iter()
            .map(|p| {
                let [tf, tn] = tipos_como_json(&p.tipos_fuente, &p.tipos_no_reconocidos);
                obj(vec![
                    ("descripcion", vt(&p.descripcion)),
                    ("url", vo(&p.url)),
                    tf,
                    tn,
                ])
            })
            .collect();
        obj(vec![
            ("correspondencias", Valor::Lista(correspondencias)),
            ("puntosCiegos", Valor::Lista(puntos)),
            ("preguntas", vl(&r.preguntas)),
            (
                "lineasDescartadas",
                Valor::Entero(r.lineas_descartadas as i64),
            ),
        ])
    }

    #[test]
    fn parseos_la_verificacion_es_la_misma_que_en_la_unity() {
        let ids = ["H12", "H13", "H24", "H58", "H59", "H60"];
        let r = parsear_verificacion(texto_de(&vector("SalidaVerificador")), &ids);
        assert_eq!(verificacion_como_json(&r), esperado("VerificacionParseada"));
    }

    #[test]
    fn parseos_la_cita_del_verificador_sin_entidades_y_con_sus_comillas() {
        let r = parsear_verificacion(
            &t(
                "CONFIRMA|OFICIAL|H1|https://a.org|&quot;We&#39;re here\" - Anthropic, 2026\nCONFIRMA|OFICIAL|H2|https://b.org|\"solo la cita\"",
            ),
            &["H1", "H2"],
        );
        let textos: Vec<_> = r.correspondencias.iter().map(|c| c.texto.clone()).collect();
        assert_eq!(
            textos,
            vec![t("\"We're here\" - Anthropic, 2026"), t("solo la cita")]
        );
    }

    #[test]
    fn parseos_nfd_descompone_ordena_y_deja_el_surrogate_suelto() {
        // é precompuesta, Hangul algorítmico, dos marcas fuera de orden y un surrogate suelto.
        let entrada = [0xE9, 0xAC01, 0x61, 0x323, 0x301, 0x302, 0xD800, 0x301];
        assert_eq!(
            nfd(&entrada),
            vec![
                0x65, 0x301, 0x1100, 0x1161, 0x11A8, 0x61, 0x323, 0x301, 0x302, 0xD800, 0x301
            ]
        );
        let orden = [0xE1, 0x323];
        assert_eq!(nfd(&orden), vec![0x61, 0x323, 0x301]);
    }

    #[test]
    fn parseos_el_titulo_y_la_seccion_de_rescate_son_los_mismos_que_en_la_unity() {
        for caso in lista(&vector("Titulos")) {
            let informe = texto_de(campo(caso, "informe"));
            let (titulo, cuerpo) = extraer_titulo_del_informe(informe);
            let obtenido = obj(vec![("titulo", vo(&titulo)), ("cuerpo", vt(&cuerpo))]);
            assert_eq!(obtenido, json_de(campo(caso, "titulo")), "{informe:?}");
            assert_eq!(
                Valor::Bool(es_parrafo_titulo(informe)),
                *campo(caso, "esParrafoTitulo"),
                "{informe:?}"
            );
        }
        for caso in lista(&vector("Rescates")) {
            let informe = texto_de(campo(caso, "informe"));
            let esperado = match campo(caso, "rescate") {
                Valor::Nulo => None,
                v => Some(texto_de(v).clone()),
            };
            assert_eq!(extraer_seccion_rescate(informe), esperado, "{informe:?}");
        }
        for caso in lista(&vector("EncabezadosRescate")) {
            let linea = texto_de(campo(caso, "linea"));
            assert_eq!(
                Valor::Bool(es_encabezado_rescate(linea)),
                *campo(caso, "es"),
                "{linea:?}"
            );
        }
    }

    #[test]
    fn parseos_el_texto_desde_html_es_el_mismo_que_en_la_unity() {
        for caso in lista(&vector("TextosHtml")) {
            let html = texto_de(campo(caso, "html"));
            assert_eq!(
                &texto_de_html_en_bloques(html, false).unwrap(),
                texto_de(campo(caso, "texto")),
                "{html:?}"
            );
        }
        let lista_start = texto_de_html_en_bloques(
            &t("<ol start=\"5\"><li><p>QUE CONVIENE RESCATAR</p></li></ol>"),
            false,
        );
        assert_eq!(lista_start.unwrap(), t("5. QUE CONVIENE RESCATAR"));
    }

    #[test]
    fn parseos_un_punto_de_codigo_fuera_de_rango_tira_como_en_la_unity() {
        assert_eq!(str_de(&vector("ErrorHtml")), "RangeError");
        let e = texto_de_html_en_bloques(&t("<p>&#1114112;</p>"), false).unwrap_err();
        assert_eq!(e.kind(), io::ErrorKind::InvalidData);
        assert!(texto_de_html_en_bloques(&t("<p>&#x10FFFF;</p>"), false).is_ok());
    }

    #[test]
    fn parseos_la_verificacion_capturada_por_bloques_no_trae_el_razonamiento() {
        let html = t(
            "<div><div class=\"thinking-chain-container\"><p>borrador|H9</p></div><p>CONFIRMA|H1</p><p>CONTRADICE|H2</p></div>",
        );
        assert_eq!(
            texto_de_la_salida_verificador(&t("CONFIRMA|H1\nCONTRADICE|H2"), Some(&html)).unwrap(),
            t("CONFIRMA|H1\nCONTRADICE|H2")
        );
        assert_eq!(
            texto_de_la_salida_verificador(&t("borrador|H9CONFIRMA|H1CONTRADICE|H2"), Some(&html))
                .unwrap(),
            t("borrador|H9\nCONFIRMA|H1\nCONTRADICE|H2")
        );
        assert_eq!(
            texto_del_informe_integrador(&t("crudo"), Some(&t(""))).unwrap(),
            t("crudo")
        );
        assert_eq!(
            texto_del_informe_integrador(&t("crudo"), Some(&t("<p>a</p><p>b</p>"))).unwrap(),
            t("a\nb")
        );
    }

    #[test]
    fn parseos_el_cuerpo_del_redactor_en_markdown_sin_los_controles_de_la_pagina() {
        let html = t(concat!(
            "<h2>Fichas</h2><p>x</p><div class=\"md-code-block\"><div class=\"md-code-block-banner-wrap\"><div><span>text</span></div>",
            "<div><div role=\"button\"><span>Copiar</span></div><button>Descargar</button></div></div><pre><span>linea 1</span>\n<span>linea 2</span></pre></div>",
            "<table><thead><tr><th>Modelo</th><th>D1</th></tr></thead><tbody><tr><td>A|B</td><td>DROP</td></tr></tbody></table>"
        ));
        assert_eq!(
            texto_de_html_en_bloques(&html, true).unwrap(),
            t(
                "#### Fichas\n\nx\n\n```\nlinea 1\nlinea 2\n```\n\n| Modelo | D1 |\n| --- | --- |\n| A\\|B | DROP |"
            )
        );
        assert_eq!(
            texto_de_html_en_bloques(&html, false).unwrap(),
            t("Fichas\nx\nlinea 1\nlinea 2\nModelo | D1 |\nA|B | DROP |")
        );
    }

    fn citas_como_json(r: &Citas) -> Valor {
        obj(vec![
            (
                "citas",
                Valor::Lista(
                    r.citas
                        .iter()
                        .map(|h| json::leer(std::str::from_utf8(&h.a_linea()).unwrap()).unwrap())
                        .collect(),
                ),
            ),
            ("anclasVistas", Valor::Entero(r.anclas_vistas as i64)),
            (
                "descartados",
                Valor::Lista(
                    r.descartados
                        .iter()
                        .map(|(m, h)| obj(vec![("motivo", Valor::Texto(t(m))), ("href", vt(h))]))
                        .collect(),
                ),
            ),
        ])
    }

    #[test]
    fn parseos_las_citas_son_las_mismas_que_en_la_unity() {
        for caso in lista(&vector("Citas")) {
            let html = texto_de(campo(caso, "html"));
            let mut n = 0;
            let r = extraer_citas(html, "resp-1", &mut || {
                n += 1;
                format!("c{n}")
            })
            .unwrap();
            assert_eq!(
                citas_como_json(&r),
                json_de(campo(caso, "esperado")),
                "{html:?}"
            );
        }
    }

    #[test]
    fn parseos_los_cuatro_descartes_y_el_chip_inline_contra_la_lista_de_fuentes() {
        let r = extraer_citas(
            &t("<a>x</a><a href=\"#\">x</a><a href=\"javascript:void(0)\">x</a><a href=\"/relativa\">x</a>"),
            "r",
            &mut || "c".into(),
        )
        .unwrap();
        assert!(r.citas.is_empty());
        let motivos: Vec<_> = r.descartados.iter().map(|d| d.0).collect();
        assert_eq!(
            motivos,
            [
                "sin-href",
                "no-absoluta-http",
                "esquema-no-http",
                "no-absoluta-http"
            ]
        );

        let citas = vector("Citas");
        let chatgpt = texto_de(campo(&lista(&citas)[1], "html"));
        let r = extraer_citas(chatgpt, "r", &mut || "c".into()).unwrap();
        let donde: Vec<_> = r
            .citas
            .iter()
            .map(|c| c.texto("dondeVive").unwrap().clone())
            .collect();
        assert_eq!(donde, vec![t("cuerpo"), t("panel-ancestro")]);
    }
}
