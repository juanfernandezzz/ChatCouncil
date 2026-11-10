//! Texto de los hechos en WTF-8: UTF-8 más surrogates UTF-16 sueltos (ADR-0008, D12).
//! Los paneles pueden entregar un surrogate suelto; la Unity lo conserva y el registro también.

use std::borrow::Cow;

/// Bytes WTF-8. Un par de surrogates siempre queda unido como un solo carácter; solo los sueltos usan
/// la forma de 3 bytes ED A0..BF xx.
#[derive(Clone, Default, PartialEq, Eq, Hash)]
pub struct Texto(Vec<u8>);

/// El orden de string.CompareOrdinal de la Unity: por unidades UTF-16, no por bytes WTF-8.
impl Ord for Texto {
    fn cmp(&self, otro: &Self) -> std::cmp::Ordering {
        self.unidades().cmp(otro.unidades())
    }
}

impl PartialOrd for Texto {
    fn partial_cmp(&self, otro: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(otro))
    }
}

impl Texto {
    /// Desde UTF-16 sin pérdida: así entra el texto de los paneles.
    pub fn desde_utf16(unidades: &[u16]) -> Texto {
        let mut t = Texto::con_capacidad(unidades.len());
        for r in char::decode_utf16(unidades.iter().copied()) {
            match r {
                Ok(c) => t.empujar_str(c.encode_utf8(&mut [0; 4])),
                Err(e) => t.empujar_suelto(e.unpaired_surrogate()),
            }
        }
        t
    }

    /// El texto como &str, sin copia, si no trae surrogates sueltos.
    pub fn como_str(&self) -> Option<&str> {
        // Un surrogate en WTF-8 es UTF-8 inválido: validar alcanza para saber si hay alguno.
        std::str::from_utf8(&self.0).ok()
    }

    /// Para mostrar (interfaz, PDF): cada surrogate suelto pasa a U+FFFD. Nunca para guardar.
    pub fn para_mostrar(&self) -> Cow<'_, str> {
        match self.como_str() {
            Some(s) => Cow::Borrowed(s),
            None => Cow::Owned(String::from_utf16_lossy(&self.a_utf16())),
        }
    }

    /// Las unidades UTF-16, como las ve la Unity (largo, cortes por índice).
    pub fn a_utf16(&self) -> Vec<u16> {
        let mut u = Vec::with_capacity(self.0.len());
        u.extend(self.unidades());
        u
    }

    fn unidades(&self) -> impl Iterator<Item = u16> + '_ {
        self.puntos().flat_map(|c| {
            let par = if c >= 0x10000 {
                let c = c - 0x10000;
                [
                    Some(0xD800 | (c >> 10) as u16),
                    Some(0xDC00 | (c & 0x3FF) as u16),
                ]
            } else {
                [Some(c as u16), None]
            };
            par.into_iter().flatten()
        })
    }

    /// Los puntos de código, con los surrogates sueltos como su valor (D800..DFFF).
    pub(crate) fn puntos(&self) -> impl Iterator<Item = u32> + '_ {
        let b = &self.0;
        let mut i = 0;
        std::iter::from_fn(move || {
            let p = *b.get(i)? as u32;
            let (largo, inicial) = match p {
                0..=0x7F => (1, p),
                0xC0..=0xDF => (2, p & 0x1F),
                0xE0..=0xEF => (3, p & 0x0F),
                _ => (4, p & 0x07),
            };
            let c = b[i + 1..i + largo]
                .iter()
                .fold(inicial, |c, &x| (c << 6) | (x as u32 & 0x3F));
            i += largo;
            Some(c)
        })
    }

    pub(crate) fn bytes(&self) -> &[u8] {
        &self.0
    }

    pub(crate) fn con_capacidad(n: usize) -> Texto {
        Texto(Vec::with_capacity(n))
    }

    pub(crate) fn empujar_str(&mut self, s: &str) {
        self.0.extend_from_slice(s.as_bytes());
    }

    /// Agrega un punto de código o una unidad UTF-16; un surrogate bajo después de uno alto suelto los une.
    pub(crate) fn empujar(&mut self, c: u32) {
        let n = self.0.len();
        if (0xDC00..=0xDFFF).contains(&c)
            && n >= 3
            && self.0[n - 3] == 0xED
            && (0xA0..=0xAF).contains(&self.0[n - 2])
        {
            let alto =
                0xD000 | ((self.0[n - 2] as u32 & 0x3F) << 6) | (self.0[n - 1] as u32 & 0x3F);
            self.0.truncate(n - 3);
            let par = 0x10000 + ((alto - 0xD800) << 10) + (c - 0xDC00);
            return self.empujar_str(char::from_u32(par).unwrap().encode_utf8(&mut [0; 4]));
        }
        match char::from_u32(c) {
            Some(ch) => self.empujar_str(ch.encode_utf8(&mut [0; 4])),
            None => self.empujar_suelto(c as u16),
        }
    }

    fn empujar_suelto(&mut self, s: u16) {
        let s = s as u32;
        self.0.extend_from_slice(&[
            0xE0 | (s >> 12) as u8,
            0x80 | ((s >> 6) & 0x3F) as u8,
            0x80 | (s & 0x3F) as u8,
        ]);
    }
}

impl From<&str> for Texto {
    fn from(s: &str) -> Texto {
        Texto(s.as_bytes().to_vec())
    }
}

impl From<String> for Texto {
    fn from(s: String) -> Texto {
        Texto(s.into_bytes())
    }
}

impl std::fmt::Debug for Texto {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}", self.para_mostrar())
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn ida_y_vuelta_con_surrogates_sueltos() {
        // alto suelto, par válido (😀), bajo suelto, alto al final
        let u: Vec<u16> = vec![0x61, 0xD800, 0x62, 0xD83D, 0xDE00, 0xDC00, 0xD801];
        let t = Texto::desde_utf16(&u);
        assert_eq!(t.a_utf16(), u);
        assert_eq!(t.como_str(), None);
        assert_eq!(t.bytes().len(), 1 + 3 + 1 + 4 + 3 + 3);
    }

    #[test]
    fn el_caso_comun_no_copia() {
        let s = String::from("ñandú 😀");
        let puntero = s.as_ptr();
        let t = Texto::from(s);
        assert_eq!(t.como_str(), Some("ñandú 😀"));
        assert_eq!(t.como_str().unwrap().as_ptr(), puntero);
        assert!(matches!(t.para_mostrar(), Cow::Borrowed("ñandú 😀")));
        assert_eq!(
            Texto::desde_utf16(&"ñandú 😀".encode_utf16().collect::<Vec<_>>()),
            t
        );
    }

    #[test]
    fn la_vista_para_mostrar_cambia_cada_suelto_por_un_fffd() {
        let t = Texto::desde_utf16(&[0x61, 0xD800, 0x62, 0xDC00]);
        assert_eq!(t.para_mostrar(), "a\u{FFFD}b\u{FFFD}");
    }

    #[test]
    fn empujar_une_un_par_que_llega_partido() {
        let mut t = Texto::default();
        t.empujar(0xD83D);
        t.empujar(0xDE00);
        assert_eq!(t.como_str(), Some("😀"));
    }

    #[test]
    fn el_orden_es_el_de_las_unidades_utf16_como_compare_ordinal() {
        // revisión PART-003: en bytes WTF-8 U+FF5E < 😀, en UTF-16 (CompareOrdinal) es al revés.
        assert!(Texto::from("\u{FF5E}") > Texto::from("😀"));
        assert!(Texto::desde_utf16(&[0xDC00]) > Texto::from("😀"));
        assert!(Texto::from("a") < Texto::from("b"));
        assert!(Texto::from("ab") > Texto::from("a"));
    }
}
