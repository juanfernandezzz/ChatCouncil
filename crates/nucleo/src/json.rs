//! JSON a mano, sin dependencias (D12, ADR-0008): el lector porta JsonEstricto.cs (semántica de
//! JSON.parse, un \uXXXX puede dejar un surrogate suelto) y `escapar` porta Registro.Escapar
//! (JSON.stringify: escapa comillas, barra, controles y surrogates sueltos; lo demás va crudo).

use crate::texto::Texto;

#[derive(Debug, Clone, PartialEq)]
pub enum Valor {
    Nulo,
    Bool(bool),
    Entero(i64),
    Real(f64),
    Texto(Texto),
    Lista(Vec<Valor>),
    /// En orden de aparición; con un nombre repetido gana el último, en la posición del primero.
    Objeto(Vec<(Texto, Valor)>),
}

/// Lee un valor JSON entero; None si no es JSON válido para JSON.parse.
pub fn leer(s: &str) -> Option<Valor> {
    let b = s.as_bytes();
    let mut i = 0;
    let v = valor(b, &mut i, 0)?;
    blancos(b, &mut i);
    (i == b.len()).then_some(v)
}

/// Tope de contenedores anidados. Ningún hecho pasa de tres niveles; la Unity rechaza las líneas más
/// hondas en Newtonsoft (MaxDepth 64) y sin tope la recursión desborda la pila.
const HONDURA_MAXIMA: usize = 64;

fn blancos(b: &[u8], i: &mut usize) {
    while matches!(b.get(*i), Some(b' ' | b'\t' | b'\n' | b'\r')) {
        *i += 1;
    }
}

fn valor(b: &[u8], i: &mut usize, abiertos: usize) -> Option<Valor> {
    blancos(b, i);
    match *b.get(*i)? {
        b'{' => objeto(b, i, abiertos),
        b'[' => lista(b, i, abiertos),
        b'"' => texto(b, i).map(Valor::Texto),
        b't' => palabra(b, i, b"true", Valor::Bool(true)),
        b'f' => palabra(b, i, b"false", Valor::Bool(false)),
        b'n' => palabra(b, i, b"null", Valor::Nulo),
        _ => numero(b, i),
    }
}

fn objeto(b: &[u8], i: &mut usize, abiertos: usize) -> Option<Valor> {
    if abiertos >= HONDURA_MAXIMA {
        return None;
    }
    let mut o: Vec<(Texto, Valor)> = Vec::new();
    *i += 1;
    blancos(b, i);
    if b.get(*i) == Some(&b'}') {
        *i += 1;
        return Some(Valor::Objeto(o));
    }
    loop {
        blancos(b, i);
        if b.get(*i) != Some(&b'"') {
            return None;
        }
        let nombre = texto(b, i)?;
        blancos(b, i);
        if b.get(*i) != Some(&b':') {
            return None;
        }
        *i += 1;
        let v = valor(b, i, abiertos + 1)?;
        match o.iter_mut().find(|(n, _)| *n == nombre) {
            Some(par) => par.1 = v,
            None => o.push((nombre, v)),
        }
        blancos(b, i);
        match b.get(*i) {
            Some(b',') => *i += 1,
            Some(b'}') => {
                *i += 1;
                return Some(Valor::Objeto(o));
            }
            _ => return None,
        }
    }
}

fn lista(b: &[u8], i: &mut usize, abiertos: usize) -> Option<Valor> {
    if abiertos >= HONDURA_MAXIMA {
        return None;
    }
    let mut a = Vec::new();
    *i += 1;
    blancos(b, i);
    if b.get(*i) == Some(&b']') {
        *i += 1;
        return Some(Valor::Lista(a));
    }
    loop {
        a.push(valor(b, i, abiertos + 1)?);
        blancos(b, i);
        match b.get(*i) {
            Some(b',') => *i += 1,
            Some(b']') => {
                *i += 1;
                return Some(Valor::Lista(a));
            }
            _ => return None,
        }
    }
}

fn texto(b: &[u8], i: &mut usize) -> Option<Texto> {
    *i += 1;
    let mut t = Texto::default();
    loop {
        // Tramo sin comillas, barras ni controles: se copia de una vez (los bytes ≥ 0x80 son UTF-8 válido).
        let inicio = *i;
        while matches!(b.get(*i), Some(&c) if c != b'"' && c != b'\\' && c >= b' ') {
            *i += 1;
        }
        if *i > inicio {
            t.empujar_str(std::str::from_utf8(&b[inicio..*i]).ok()?);
        }
        let c = *b.get(*i)?;
        *i += 1;
        match c {
            b'"' => return Some(t),
            b'\\' => {}
            _ => return None, // carácter de control sin escapar
        }
        let e = *b.get(*i)?;
        *i += 1;
        let simple = match e {
            b'"' => '"',
            b'\\' => '\\',
            b'/' => '/',
            b'b' => '\u{8}',
            b'f' => '\u{c}',
            b'n' => '\n',
            b'r' => '\r',
            b't' => '\t',
            b'u' => {
                let hex = b.get(*i..*i + 4)?;
                if !hex.iter().all(u8::is_ascii_hexdigit) {
                    return None;
                }
                let codigo = u32::from_str_radix(std::str::from_utf8(hex).ok()?, 16).ok()?;
                *i += 4;
                t.empujar(codigo); // un surrogate suelto queda tal cual, como en JSON.parse
                continue;
            }
            _ => return None,
        };
        t.empujar(simple as u32);
    }
}

fn digito(b: &[u8], i: usize) -> bool {
    b.get(i).is_some_and(u8::is_ascii_digit)
}

fn numero(b: &[u8], i: &mut usize) -> Option<Valor> {
    let inicio = *i;
    if b.get(*i) == Some(&b'-') {
        *i += 1;
    }
    if b.get(*i) == Some(&b'0') {
        *i += 1;
    } else if digito(b, *i) {
        while digito(b, *i) {
            *i += 1;
        }
    } else {
        return None;
    }
    let mut entero = true;
    if b.get(*i) == Some(&b'.') {
        entero = false;
        *i += 1;
        if !digito(b, *i) {
            return None;
        }
        while digito(b, *i) {
            *i += 1;
        }
    }
    if matches!(b.get(*i), Some(b'e' | b'E')) {
        entero = false;
        *i += 1;
        if matches!(b.get(*i), Some(b'+' | b'-')) {
            *i += 1;
        }
        if !digito(b, *i) {
            return None;
        }
        while digito(b, *i) {
            *i += 1;
        }
    }
    let s = std::str::from_utf8(&b[inicio..*i]).ok()?;
    if entero && let Ok(n) = s.parse::<i64>() {
        return Some(Valor::Entero(n));
    }
    s.parse::<f64>().ok().map(Valor::Real)
}

fn palabra(b: &[u8], i: &mut usize, p: &[u8], v: Valor) -> Option<Valor> {
    if b.get(*i..*i + p.len())? != p {
        return None;
    }
    *i += p.len();
    Some(v)
}

/// Escribe el texto entre comillas exactamente como JSON.stringify (y Registro.Escapar de la Unity).
pub fn escapar(t: &Texto, salida: &mut Vec<u8>) {
    let b = t.bytes();
    salida.push(b'"');
    let mut i = 0;
    while i < b.len() {
        let c = b[i];
        let corto: Option<&[u8]> = match c {
            b'"' => Some(b"\\\""),
            b'\\' => Some(b"\\\\"),
            0x08 => Some(b"\\b"),
            0x0C => Some(b"\\f"),
            b'\n' => Some(b"\\n"),
            b'\r' => Some(b"\\r"),
            b'\t' => Some(b"\\t"),
            _ => None,
        };
        if let Some(e) = corto {
            salida.extend_from_slice(e);
            i += 1;
        } else if c < 0x20 {
            salida.extend_from_slice(format!("\\u{:04x}", c).as_bytes());
            i += 1;
        } else if c == 0xED && b.get(i + 1).is_some_and(|&x| x >= 0xA0) {
            // En WTF-8 un surrogate siempre está suelto: los pares se guardan unidos.
            let s = 0xD000 | ((b[i + 1] as u32 & 0x3F) << 6) | (b[i + 2] as u32 & 0x3F);
            salida.extend_from_slice(format!("\\u{:04x}", s).as_bytes());
            i += 3;
        } else {
            salida.push(c);
            i += 1;
        }
    }
    salida.push(b'"');
}

#[cfg(test)]
pub(crate) fn vector(nombre: &str) -> Valor {
    let ruta = format!(
        "{}/../../tests/vectores/{nombre}.json",
        env!("CARGO_MANIFEST_DIR")
    );
    leer(&std::fs::read_to_string(ruta).unwrap()).expect("vector ilegible")
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn t(s: &str) -> Texto {
        Texto::from(s)
    }

    #[test]
    fn lee_como_json_parse() {
        assert_eq!(
            leer(r#" {"a":[1,-2.5e1,true,null],"b":"x\/\u00f1"} "#),
            Some(Valor::Objeto(vec![
                (
                    t("a"),
                    Valor::Lista(vec![
                        Valor::Entero(1),
                        Valor::Real(-25.0),
                        Valor::Bool(true),
                        Valor::Nulo
                    ])
                ),
                (t("b"), Valor::Texto(t("x/ñ"))),
            ]))
        );
        // nombre repetido: gana el último, en la posición del primero
        assert_eq!(
            leer(r#"{"a":1,"b":2,"a":3}"#),
            Some(Valor::Objeto(vec![
                (t("a"), Valor::Entero(3)),
                (t("b"), Valor::Entero(2))
            ]))
        );
    }

    #[test]
    fn rechaza_lo_que_json_parse_rechaza() {
        for malo in [
            "",
            "{'a':1}",
            "{\"a\":1} x",
            "[1,]",
            "01",
            "\"\u{1}\"",
            "\"\\x\"",
            "\"\\u12g4\"",
            "1.",
            "-",
            "nul",
            "\u{a0}1",
            "/*c*/1",
        ] {
            assert_eq!(leer(malo), None, "{malo:?}");
        }
    }

    #[test]
    fn un_surrogate_suelto_se_lee_y_se_reescribe_igual() {
        let v = leer(r#""a\ud800b\ud83d\ude00\udc00""#).unwrap();
        let Valor::Texto(x) = v else { panic!() };
        assert_eq!(
            x.a_utf16(),
            vec![0x61, 0xD800, 0x62, 0xD83D, 0xDE00, 0xDC00]
        );
        let mut s = Vec::new();
        escapar(&x, &mut s);
        assert_eq!(String::from_utf8(s).unwrap(), "\"a\\ud800b😀\\udc00\"");
    }

    #[test]
    fn escapa_como_json_stringify() {
        let mut s = Vec::new();
        escapar(
            &t("\"\\\u{8}\u{c}\n\r\t\u{1}\u{1f}\u{7f} ñ\u{2028}/"),
            &mut s,
        );
        assert_eq!(
            String::from_utf8(s).unwrap(),
            "\"\\\"\\\\\\b\\f\\n\\r\\t\\u0001\\u001f\u{7f} ñ\u{2028}/\""
        );
    }

    #[test]
    fn un_anidamiento_profundo_es_ilegible_y_no_tumba_el_proceso() {
        // revisión PART-003: sin tope, esto desborda la pila.
        assert_eq!(leer(&"[".repeat(200_000)), None);
        assert_eq!(leer(&"{\"a\":".repeat(100_000)), None);
        let hondo = format!("{}{}", "[".repeat(64), "]".repeat(64));
        assert!(leer(&hondo).is_some());
    }
}
