//! El registro: una línea de JSON por hecho, append-only (Registro.cs y Hechos.cs de la Unity).
//! Los dieciséis tipos salen de una tabla de esquemas: el orden de los campos es el orden en que los
//! escribe la Unity, así una línea escrita acá es byte a byte la misma.

use crate::json::{self, Valor};
use crate::texto::Texto;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

pub const VERSION_ESQUEMA: i64 = 1;

#[derive(Debug, Clone, Copy, PartialEq)]
enum Clase {
    /// string: null por defecto.
    Texto,
    /// string con valor por defecto si falta.
    TextoDefecto(&'static str),
    /// int: 0 por defecto, null no se acepta.
    Entero,
    /// int con 1 por defecto: la versión del esquema.
    Esquema,
    EnteroNulo,
    /// bool: false por defecto, null no se acepta.
    Bool,
    BoolNulo,
    /// List<string>: null por defecto.
    ListaTexto,
    /// Objeto anidado (todos sus campos aceptan null): null por defecto.
    Objeto(&'static [Campo]),
    /// Lista de objetos anidados: null por defecto.
    ListaObjetos(&'static [Campo]),
}

#[derive(Debug, PartialEq)]
struct Campo {
    nombre: &'static str,
    clase: Clase,
    /// [JsonProperty(NullValueHandling = Ignore)]: con null no se escribe.
    omitir_nulo: bool,
}

const fn c(nombre: &'static str, clase: Clase) -> Campo {
    Campo {
        nombre,
        clase,
        omitir_nulo: false,
    }
}

const fn omitible(nombre: &'static str, clase: Clase) -> Campo {
    Campo {
        nombre,
        clase,
        omitir_nulo: true,
    }
}

use Clase::*;

const PROCEDENCIA: &[Campo] = &[
    c("modelLabel", Texto),
    c("modelLabelLeidaEn", Texto),
    c("finDe", Texto),
    c("quiescenceMs", EnteroNulo),
    c("generandoAlLeer", BoolNulo),
    c("continuidad", Texto),
    c("metodoEscritura", Texto),
    c("panel", Texto),
];
const COPIA_RESPUESTA: &[Campo] = &[c("rondaId", Texto), c("respuestaId", Texto)];
const COPIA_SALIDA: &[Campo] = &[c("rondaId", Texto), c("salidaOperadorId", Texto)];
const ETIQUETA_VERIFICADOR: &[Campo] = &[c("etiqueta", Texto), c("verificadorId", Texto)];

/// Los dieciséis tipos; todos empiezan con esquema e id (tipo se escribe antes, desde el nombre).
const TIPOS: &[(&str, &[Campo])] = &[
    (
        "conversacion",
        &[
            c("esquema", Esquema),
            c("id", Texto),
            c("creadaEn", Texto),
            c("titulo", Texto),
            c("esPrueba", Bool),
        ],
    ),
    (
        "ronda",
        &[
            c("esquema", Esquema),
            c("id", Texto),
            c("conversacionId", Texto),
            c("indice", Entero),
            c("prompt", Texto),
            c("enviadaEn", Texto),
            c("semilla", Texto),
        ],
    ),
    (
        "intento",
        &[
            c("esquema", Esquema),
            c("id", Texto),
            c("rondaId", Texto),
            c("proveedorId", Texto),
            c("ok", Bool),
            c("error", Texto),
            c("enviadoEn", Texto),
        ],
    ),
    (
        "respuesta",
        &[
            c("esquema", Esquema),
            c("id", Texto),
            c("rondaId", Texto),
            c("proveedorId", Texto),
            c("textoOriginal", Texto),
            c("leidaEn", Texto),
            c("error", Texto),
            c("procedencia", Objeto(PROCEDENCIA)),
            c("promptUsuarioLeido", Texto),
            c("promptCoincideEnPool", BoolNulo),
            c("fuentesHref", EnteroNulo),
            c("html", Texto),
            omitible("copiadaDe", Objeto(COPIA_RESPUESTA)),
        ],
    ),
    (
        "cita",
        &[
            c("esquema", Esquema),
            c("id", Texto),
            c("respuestaId", Texto),
            c("url", Texto),
            c("textoVisible", Texto),
            c("dondeVive", Texto),
        ],
    ),
    (
        "sello",
        &[
            c("esquema", Esquema),
            c("id", Texto),
            c("rondaId", Texto),
            c("label", Texto),
            c("codigoEstable", Texto),
            c("panelSourceId", Texto),
            c("replyId", Texto),
            c("attemptId", Texto),
        ],
    ),
    (
        "salida-operador",
        &[
            c("esquema", Esquema),
            c("id", Texto),
            c("rondaId", Texto),
            c("operadorId", Texto),
            c("promptCompleto", Texto),
            c("salidaCruda", Texto),
            c("recibidaEn", Texto),
            c("html", Texto),
            omitible("copiadaDe", Objeto(COPIA_SALIDA)),
        ],
    ),
    (
        "hallazgo",
        &[
            c("esquema", Esquema),
            c("id", Texto),
            c("salidaOperadorId", Texto),
            c("categoria", Texto),
            c("eje", Texto),
            c("etiquetas", ListaTexto),
            c("descripcion", Texto),
            c("etiquetaInvalida", Bool),
        ],
    ),
    (
        "informe-integrador",
        &[
            c("esquema", Esquema),
            c("id", Texto),
            c("rondaId", Texto),
            c("operadorId", Texto),
            c("promptCompleto", Texto),
            c("informeCrudo", Texto),
            c("titulo", Texto),
            c("recibidaEn", Texto),
            c("html", Texto),
        ],
    ),
    (
        "salida-verificador",
        &[
            c("esquema", Esquema),
            c("id", Texto),
            c("rondaId", Texto),
            c("verificadorId", Texto),
            c("promptCompleto", Texto),
            c("salidaCruda", Texto),
            c("recibidaEn", Texto),
            c("html", Texto),
        ],
    ),
    (
        "respuesta-redactor",
        &[
            c("esquema", Esquema),
            c("id", Texto),
            c("rondaId", Texto),
            c("redactorId", Texto),
            c("promptCompleto", Texto),
            c("textoCrudo", Texto),
            c("html", Texto),
            c("marcaPrimera", Texto),
            c("marcaUltima", Texto),
            c("selloVerificaciones", ListaObjetos(ETIQUETA_VERIFICADOR)),
            c("recibidaEn", Texto),
        ],
    ),
    (
        "url-comprobada",
        &[
            c("esquema", Esquema),
            c("id", Texto),
            c("rondaId", Texto),
            c("salidaVerificadorId", Texto),
            c("url", Texto),
            c("codigo", EnteroNulo),
            c("detalle", Texto),
            c("comprobadaEn", Texto),
        ],
    ),
    (
        "condicion-herramientas",
        &[
            c("esquema", Esquema),
            c("id", Texto),
            c("rondaId", Texto),
            c("proveedorId", Texto),
            c("etapa", Texto),
            c("busquedaWebActivada", Bool),
            c("fuente", Texto),
            c("registradoEn", Texto),
        ],
    ),
    (
        "error-captura",
        &[
            c("esquema", Esquema),
            c("id", Texto),
            c("rondaId", Texto),
            c("etapaEsperada", Texto),
            c("tipoCapturaIntentado", Texto),
            omitible("proveedorId", Texto),
            c("detalle", Texto),
            c("ocurridoEn", Texto),
        ],
    ),
    (
        "pregunta-declarada",
        &[
            c("esquema", Esquema),
            c("id", Texto),
            c("rondaId", Texto),
            c("texto", Texto),
            c("declaradaEn", Texto),
            c("procedencia", TextoDefecto("declarado-por-usuario")),
        ],
    ),
    (
        "condicion-proveedores-cargados",
        &[
            c("esquema", Esquema),
            c("id", Texto),
            c("rondaId", Texto),
            c("proveedores", ListaTexto),
            c("integrador", Texto),
            c("registradoEn", Texto),
        ],
    ),
];

/// Un hecho del registro: su tipo y un valor por campo, en el orden del esquema.
#[derive(Debug, Clone, PartialEq)]
pub struct Hecho {
    tipo: &'static str,
    campos: &'static [Campo],
    valores: Vec<Valor>,
}

fn defecto(clase: Clase) -> Valor {
    match clase {
        TextoDefecto(d) => Valor::Texto(d.into()),
        Entero => Valor::Entero(0),
        Esquema => Valor::Entero(VERSION_ESQUEMA),
        Bool => Valor::Bool(false),
        _ => Valor::Nulo,
    }
}

fn buscar<'a>(objeto: &'a [(Texto, Valor)], nombre: &str) -> Option<&'a Valor> {
    objeto
        .iter()
        .find(|(n, _)| n.bytes() == nombre.as_bytes())
        .map(|(_, v)| v)
}

/// Lleva un valor leído a la clase del campo, como ToObject de Newtonsoft; None si no encaja.
// shortcut: no coerciona entre tipos (número a string, "3" a int) ni empareja nombres sin distinguir
// mayúsculas como Newtonsoft; la Unity nunca escribe así. Si aparece un registro así, portarlo.
fn normalizar(clase: Clase, v: Option<&Valor>) -> Option<Valor> {
    let Some(v) = v else {
        return Some(defecto(clase));
    };
    let entero = |v: &Valor| match *v {
        Valor::Entero(n) if i32::try_from(n).is_ok() => Some(Valor::Entero(n)),
        Valor::Real(r) if r.fract() == 0.0 && r.abs() <= i32::MAX as f64 => {
            Some(Valor::Entero(r as i64))
        }
        _ => None,
    };
    match (clase, v) {
        (Entero | Esquema | Bool, Valor::Nulo) => None,
        (_, Valor::Nulo) => Some(Valor::Nulo),
        (Texto | TextoDefecto(_), Valor::Texto(_)) | (Bool | BoolNulo, Valor::Bool(_)) => {
            Some(v.clone())
        }
        (Entero | Esquema | EnteroNulo, _) => entero(v),
        (ListaTexto, Valor::Lista(l))
            if l.iter().all(|x| matches!(x, Valor::Texto(_) | Valor::Nulo)) =>
        {
            Some(v.clone())
        }
        (Objeto(sub), Valor::Objeto(o)) => objeto(sub, o),
        (ListaObjetos(sub), Valor::Lista(l)) => l
            .iter()
            .map(|x| match x {
                Valor::Nulo => Some(Valor::Nulo),
                Valor::Objeto(o) => objeto(sub, o),
                _ => None,
            })
            .collect::<Option<Vec<_>>>()
            .map(Valor::Lista),
        _ => None,
    }
}

/// Un objeto anidado con sus campos en el orden del esquema; las claves desconocidas se ignoran.
fn objeto(campos: &[Campo], o: &[(Texto, Valor)]) -> Option<Valor> {
    campos
        .iter()
        .map(|c| {
            Some((
                Texto::from(c.nombre),
                normalizar(c.clase, buscar(o, c.nombre))?,
            ))
        })
        .collect::<Option<Vec<_>>>()
        .map(Valor::Objeto)
}

impl Hecho {
    /// Un hecho nuevo con los valores dados y el resto por defecto. Un tipo o campo desconocido es un
    /// error de programación.
    pub fn nuevo(tipo: &str, valores: &[(&str, Valor)]) -> Hecho {
        let (tipo, campos) = *TIPOS
            .iter()
            .find(|(t, _)| *t == tipo)
            .expect("tipo de hecho desconocido");
        let mut h = Hecho {
            tipo,
            campos,
            valores: campos.iter().map(|c| defecto(c.clase)).collect(),
        };
        for (nombre, v) in valores {
            let i = campos
                .iter()
                .position(|c| c.nombre == *nombre)
                .expect("campo desconocido");
            h.valores[i] = v.clone();
        }
        h
    }

    pub fn tipo(&self) -> &'static str {
        self.tipo
    }

    pub fn valor(&self, nombre: &str) -> &Valor {
        let i = self
            .campos
            .iter()
            .position(|c| c.nombre == nombre)
            .expect("campo desconocido");
        &self.valores[i]
    }

    pub fn texto(&self, nombre: &str) -> Option<&Texto> {
        match self.valor(nombre) {
            Valor::Texto(t) => Some(t),
            _ => None,
        }
    }

    pub fn entero(&self, nombre: &str) -> Option<i64> {
        match self.valor(nombre) {
            Valor::Entero(n) => Some(*n),
            _ => None,
        }
    }

    /// Una línea del registro, sin el salto final: igual que Registro.ALinea de la Unity.
    pub fn a_linea(&self) -> Vec<u8> {
        let mut s = Vec::with_capacity(256);
        s.extend_from_slice(b"{\"tipo\":");
        json::escapar(&Texto::from(self.tipo), &mut s);
        escribir_campos(self.campos, &self.valores, &mut s);
        s.push(b'}');
        s
    }

    fn desde_linea(linea: &str) -> Option<Hecho> {
        let Valor::Objeto(o) = json::leer(linea)? else {
            return None;
        };
        let Some(Valor::Texto(tipo)) = buscar(&o, "tipo") else {
            return None;
        };
        let (tipo, campos) = *TIPOS.iter().find(|(t, _)| t.as_bytes() == tipo.bytes())?;
        let valores = campos
            .iter()
            .map(|c| normalizar(c.clase, buscar(&o, c.nombre)))
            .collect::<Option<_>>()?;
        Some(Hecho {
            tipo,
            campos,
            valores,
        })
    }
}

fn escribir_campos(campos: &[Campo], valores: &[Valor], s: &mut Vec<u8>) {
    for (c, v) in campos.iter().zip(valores) {
        if c.omitir_nulo && *v == Valor::Nulo {
            continue;
        }
        s.push(b',');
        s.push(b'"');
        s.extend_from_slice(c.nombre.as_bytes());
        s.extend_from_slice(b"\":");
        escribir(c.clase, v, s);
    }
}

fn escribir(clase: Clase, v: &Valor, s: &mut Vec<u8>) {
    match v {
        Valor::Nulo => s.extend_from_slice(b"null"),
        Valor::Bool(b) => s.extend_from_slice(if *b { b"true" } else { b"false" }),
        Valor::Entero(n) => s.extend_from_slice(n.to_string().as_bytes()),
        Valor::Real(_) => unreachable!("ningún campo del registro es real"),
        Valor::Texto(t) => json::escapar(t, s),
        Valor::Lista(l) => {
            s.push(b'[');
            for (i, x) in l.iter().enumerate() {
                if i > 0 {
                    s.push(b',');
                }
                escribir(clase, x, s);
            }
            s.push(b']');
        }
        Valor::Objeto(o) => {
            let (Objeto(sub) | ListaObjetos(sub)) = clase else {
                unreachable!("objeto fuera de esquema")
            };
            let valores: Vec<Valor> = sub
                .iter()
                .map(|c| buscar(o, c.nombre).cloned().unwrap_or(Valor::Nulo))
                .collect();
            let mut cuerpo = Vec::new();
            escribir_campos(sub, &valores, &mut cuerpo);
            s.push(b'{');
            s.extend_from_slice(cuerpo.strip_prefix(b",").unwrap_or(&cuerpo));
            s.push(b'}');
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct LineaIlegible {
    pub numero: usize,
    /// Hasta 200 unidades UTF-16, como Substring(0, 200).
    pub contenido: Texto,
}

#[derive(Debug, Default, Clone, PartialEq)]
pub struct RegistroLeido {
    pub hechos: Vec<Hecho>,
    /// Se cuentan y se devuelven, nunca se saltean en silencio.
    pub lineas_ilegibles: Vec<LineaIlegible>,
    /// true si la ÚNICA ilegible es la última: la firma de un corte a mitad de escritura.
    pub ultima_linea_incompleta: bool,
}

/// Js.EsBlanco: la clase \s de JS.
pub(crate) fn es_blanco(c: char) -> bool {
    matches!(c, '\u{9}'..='\u{d}' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

pub fn leer(contenido: &str) -> RegistroLeido {
    let mut r = RegistroLeido::default();
    let mut ultimo_no_vacio = None;
    for (i, linea) in contenido.split('\n').enumerate() {
        if linea.chars().all(es_blanco) {
            continue;
        }
        ultimo_no_vacio = Some(i);
        match Hecho::desde_linea(linea) {
            Some(h) => r.hechos.push(h),
            None => {
                let u: Vec<u16> = linea.encode_utf16().take(200).collect();
                r.lineas_ilegibles.push(LineaIlegible {
                    numero: i + 1,
                    contenido: Texto::desde_utf16(&u),
                });
            }
        }
    }
    r.ultima_linea_incompleta = r.lineas_ilegibles.len() == 1
        && Some(r.lineas_ilegibles[0].numero) == ultimo_no_vacio.map(|i| i + 1);
    r
}

/// conversaciones/<id>.jsonl dentro de la carpeta de datos.
pub fn ruta_archivo(carpeta: &Path, conversacion_id: &str) -> PathBuf {
    carpeta
        .join("conversaciones")
        .join(format!("{conversacion_id}.jsonl"))
}

/// El registro de una conversación; vacío si el archivo no existe. Los bytes se decodifican tal cual:
/// un BOM queda como U+FEFF y cuenta como línea ilegible, igual que en la Unity.
pub fn leer_archivo(carpeta: &Path, conversacion_id: &str) -> io::Result<RegistroLeido> {
    match fs::read(ruta_valida(carpeta, conversacion_id)?) {
        Ok(b) => Ok(leer(&String::from_utf8_lossy(&b))),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(RegistroLeido::default()),
        Err(e) => Err(e),
    }
}

/// El único modo de abrir un registro para escribir: solo agregar al final. En Windows este handle
/// manda toda escritura al final y rechaza truncar.
fn abrir_para_agregar(ruta: &Path) -> io::Result<File> {
    OpenOptions::new()
        .append(true)
        .read(true)
        .create(true)
        .open(ruta)
}

/// El id es parte de la ruta: no puede salir de conversaciones/ (revisión PART-003).
fn ruta_valida(carpeta: &Path, conversacion_id: &str) -> io::Result<PathBuf> {
    if conversacion_id.is_empty()
        || conversacion_id.starts_with('.')
        || conversacion_id.contains(['/', '\\', ':'])
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "id de conversación inválido",
        ));
    }
    Ok(ruta_archivo(carpeta, conversacion_id))
}

/// Una línea completa por hecho, al final del archivo, en una sola escritura: el registro nunca se
/// reescribe. Si la última línea quedó cortada, el hecho empieza en una línea propia (revisión PART-003;
/// la Unity lo pegaba a la línea cortada y ambos quedaban ilegibles).
pub fn agregar(carpeta: &Path, conversacion_id: &str, hecho: &Hecho) -> io::Result<()> {
    let ruta = ruta_valida(carpeta, conversacion_id)?;
    fs::create_dir_all(carpeta.join("conversaciones"))?;
    let mut f = abrir_para_agregar(&ruta)?;
    let mut linea = Vec::new();
    if f.seek(SeekFrom::End(0))? > 0 {
        let mut ultimo = [0u8];
        f.seek(SeekFrom::End(-1))?;
        f.read_exact(&mut ultimo)?;
        if ultimo[0] != b'\n' {
            linea.push(b'\n');
        }
    }
    linea.extend(hecho.a_linea());
    linea.push(b'\n');
    f.write_all(&linea)
}

#[cfg(test)]
pub(crate) mod pruebas {
    use super::*;
    use crate::json::vector;

    pub(crate) fn texto_de(v: &Valor) -> &Texto {
        match v {
            Valor::Texto(t) => t,
            _ => panic!("se esperaba texto: {v:?}"),
        }
    }

    pub(crate) fn str_de(v: &Valor) -> &str {
        texto_de(v).como_str().expect("texto con surrogates")
    }

    pub(crate) fn campo<'a>(v: &'a Valor, nombre: &str) -> &'a Valor {
        let Valor::Objeto(o) = v else {
            panic!("se esperaba objeto")
        };
        buscar(o, nombre).expect(nombre)
    }

    pub(crate) fn lista(v: &Valor) -> &[Valor] {
        match v {
            Valor::Lista(l) => l,
            _ => panic!("se esperaba lista"),
        }
    }

    #[test]
    fn cada_tipo_de_hecho_se_lee_y_se_reescribe_byte_a_byte() {
        let lineas = vector("RegistroLineas");
        let lineas = lista(&lineas);
        assert_eq!(lineas.len(), 29);
        let mut tipos = std::collections::BTreeSet::new();
        let mut con_surrogate = Vec::new();
        for (i, l) in lineas.iter().enumerate() {
            let l = str_de(l);
            if l.contains("\\ud800") {
                con_surrogate.push(i);
            }
            let r = leer(l);
            assert!(r.lineas_ilegibles.is_empty(), "{l}");
            assert_eq!(r.hechos.len(), 1, "{l}");
            assert_eq!(r.hechos[0].a_linea(), l.as_bytes(), "línea {i}");
            tipos.insert(r.hechos[0].tipo());
        }
        assert_eq!(tipos.len(), 16);
        assert_eq!(con_surrogate, [1, 5, 10]);
    }

    #[test]
    fn el_surrogate_suelto_llega_al_hecho_sin_perderse() {
        let lineas = vector("RegistroLineas");
        let r = leer(str_de(&lista(&lineas)[1]));
        let prompt = r.hechos[0].texto("prompt").unwrap();
        assert!(prompt.a_utf16().contains(&0xD800));
        assert_eq!(prompt.como_str(), None);
    }

    #[test]
    fn leer_cuenta_las_ilegibles_y_detecta_la_ultima_linea_incompleta() {
        let casos = vector("Lecturas");
        let casos = lista(&casos);
        assert_eq!(casos.len(), 6);
        for caso in casos {
            let entrada = str_de(campo(caso, "entrada"));
            let r = leer(entrada);
            assert_eq!(
                Valor::Entero(r.hechos.len() as i64),
                *campo(caso, "hechos"),
                "{entrada}"
            );
            let numeros: Vec<Valor> = r
                .lineas_ilegibles
                .iter()
                .map(|l| Valor::Entero(l.numero as i64))
                .collect();
            assert_eq!(numeros, lista(campo(caso, "numeros")), "{entrada}");
            let contenidos: Vec<Valor> = r
                .lineas_ilegibles
                .iter()
                .map(|l| Valor::Texto(l.contenido.clone()))
                .collect();
            assert_eq!(contenidos, lista(campo(caso, "contenidos")), "{entrada}");
            assert_eq!(
                Valor::Bool(r.ultima_linea_incompleta),
                *campo(caso, "ultima"),
                "{entrada}"
            );
        }
    }

    #[test]
    fn un_hecho_nuevo_usa_los_valores_por_defecto_de_la_unity() {
        let h = Hecho::nuevo("pregunta-declarada", &[("id", Valor::Texto("p".into()))]);
        assert_eq!(
            String::from_utf8(h.a_linea()).unwrap(),
            r#"{"tipo":"pregunta-declarada","esquema":1,"id":"p","rondaId":null,"texto":null,"declaradaEn":null,"procedencia":"declarado-por-usuario"}"#
        );
        let e = Hecho::nuevo("error-captura", &[]);
        assert!(
            !String::from_utf8(e.a_linea())
                .unwrap()
                .contains("proveedorId")
        );
    }

    #[test]
    fn tipos_que_no_encajan_vuelven_ilegible_la_linea() {
        for malo in [
            r#"{"tipo":"otro"}"#,
            r#"{"tipo":3}"#,
            r#"[1]"#,
            r#"{"tipo":"intento","ok":null}"#,
            r#"{"tipo":"ronda","indice":"3"}"#,
            r#"{"tipo":"ronda","indice":3000000000}"#,
            r#"{"tipo":"respuesta","procedencia":"x"}"#,
        ] {
            assert_eq!(leer(malo).lineas_ilegibles.len(), 1, "{malo}");
        }
        // claves desconocidas se ignoran; un objeto sin campos sale con sus valores por defecto
        assert_eq!(
            leer(r#"{"tipo":"ronda","otra":1}"#).hechos[0].entero("esquema"),
            Some(1)
        );
    }

    #[test]
    fn agregar_escribe_una_linea_al_final_sin_bom() {
        let dir = std::env::temp_dir().join(format!("cc-registro-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let a = Hecho::nuevo("conversacion", &[("id", Valor::Texto("c".into()))]);
        let b = Hecho::nuevo("ronda", &[("id", Valor::Texto("r".into()))]);
        agregar(&dir, "c", &a).unwrap();
        agregar(&dir, "c", &b).unwrap();
        let bytes = fs::read(ruta_archivo(&dir, "c")).unwrap();
        let mut esperado = a.a_linea();
        esperado.push(b'\n');
        esperado.extend(b.a_linea());
        esperado.push(b'\n');
        assert_eq!(bytes, esperado);
        assert_eq!(leer_archivo(&dir, "c").unwrap().hechos, vec![a, b]);
        assert_eq!(
            leer_archivo(&dir, "no-existe").unwrap(),
            RegistroLeido::default()
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    fn sha256(b: &[u8]) -> String {
        use sha2::{Digest, Sha256};
        Sha256::digest(b)
            .iter()
            .map(|x| format!("{x:02x}"))
            .collect()
    }

    fn carpeta_temporal(nombre: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("cc-registro-{nombre}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn las_fechas_se_leen_como_texto_y_vuelven_identicas() {
        let l = r#"{"tipo":"conversacion","esquema":1,"id":"c","creadaEn":"2026-10-06T09:00:00.000-03:00","titulo":null,"esPrueba":false}"#;
        let h = &leer(l).hechos[0];
        assert_eq!(
            h.texto("creadaEn").unwrap().como_str(),
            Some("2026-10-06T09:00:00.000-03:00")
        );
        assert_eq!(h.a_linea(), l.as_bytes());
    }

    #[test]
    fn un_registro_con_bom_no_aporta_hechos() {
        let dir = carpeta_temporal("bom");
        let h = Hecho::nuevo("conversacion", &[("id", Valor::Texto("c".into()))]);
        fs::create_dir_all(dir.join("conversaciones")).unwrap();
        let mut b = vec![0xEF, 0xBB, 0xBF];
        b.extend(h.a_linea());
        b.push(b'\n');
        fs::write(ruta_archivo(&dir, "c"), b).unwrap();
        let r = leer_archivo(&dir, "c").unwrap();
        assert!(r.hechos.is_empty());
        assert_eq!(r.lineas_ilegibles.len(), 1);
        assert!(
            r.lineas_ilegibles[0]
                .contenido
                .a_utf16()
                .starts_with(&[0xFEFF])
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    /// Caso de falla del AC: modificar una línea ya escrita se rechaza con error y el archivo queda igual.
    #[cfg(windows)]
    #[test]
    fn modificar_una_linea_del_registro_se_rechaza_y_el_archivo_queda_igual() {
        use std::io::{Seek, SeekFrom};
        let dir = carpeta_temporal("falla");
        agregar(
            &dir,
            "c",
            &Hecho::nuevo("conversacion", &[("id", Valor::Texto("c".into()))]),
        )
        .unwrap();
        agregar(
            &dir,
            "c",
            &Hecho::nuevo("ronda", &[("id", Valor::Texto("r".into()))]),
        )
        .unwrap();
        let ruta = ruta_archivo(&dir, "c");
        let antes = sha256(&fs::read(&ruta).unwrap());
        println!("sha256 antes:   {antes}");
        // Reescribir la primera línea = truncar y volver a escribir; el handle del registro no deja truncar.
        let mut f = abrir_para_agregar(&ruta).unwrap();
        let error = f
            .set_len(0)
            .expect_err("truncar una línea del registro tiene que fallar");
        println!("set_len(0) rechazado: {error}");
        assert_eq!(error.kind(), io::ErrorKind::PermissionDenied);
        f.seek(SeekFrom::Start(0)).unwrap();
        drop(f);
        let despues = sha256(&fs::read(&ruta).unwrap());
        println!("sha256 después: {despues}");
        assert_eq!(antes, despues);
        fs::remove_dir_all(&dir).unwrap();
    }

    /// T3: un registro real de la Unity, copiado antes a una carpeta temporal (CC_REGISTRO_REAL = ruta
    /// del .jsonl copiado). Cada línea legible se reescribe byte a byte. No imprime contenido.
    #[test]
    #[ignore = "necesita CC_REGISTRO_REAL con una copia temporal de un registro real"]
    fn un_registro_real_se_reescribe_byte_a_byte() {
        let ruta = std::env::var("CC_REGISTRO_REAL").expect("CC_REGISTRO_REAL");
        let bytes = fs::read(&ruta).unwrap();
        let antes = sha256(&bytes);
        let texto = String::from_utf8_lossy(&bytes);
        let r = leer(&texto);
        // Solo números de línea y nombres de claves: nunca valores del registro real.
        let claves = |l: &[u8]| -> Vec<String> {
            match json::leer(std::str::from_utf8(l).unwrap_or("")) {
                Some(Valor::Objeto(o)) => o
                    .iter()
                    .map(|(k, _)| k.para_mostrar().into_owned())
                    .collect(),
                _ => vec!["(no es objeto)".into()],
            }
        };
        let (mut legibles, mut identicas) = (0, 0);
        let mut distintas: Vec<(usize, &str, Vec<String>, Vec<String>)> = Vec::new();
        for (i, linea) in texto
            .split('\n')
            .enumerate()
            .filter(|(_, l)| !l.chars().all(es_blanco))
        {
            if let Some(h) = Hecho::desde_linea(linea) {
                legibles += 1;
                let nueva = h.a_linea();
                if nueva == linea.as_bytes() {
                    identicas += 1;
                } else {
                    let releida = Hecho::desde_linea(std::str::from_utf8(&nueva).unwrap());
                    assert!(
                        releida.as_ref() == Some(&h),
                        "línea {}: la reescritura pierde un valor",
                        i + 1
                    );
                    distintas.push((i + 1, h.tipo(), claves(linea.as_bytes()), claves(&nueva)));
                }
            }
        }
        for (n, tipo, original, reescrita) in distintas.iter().take(5) {
            println!(
                "línea {n} ({tipo}): claves originales {original:?} · reescritas {reescrita:?}"
            );
        }
        println!(
            "líneas legibles que no se reescriben igual: {}",
            distintas.len()
        );
        let tipos: std::collections::BTreeSet<&str> = r.hechos.iter().map(Hecho::tipo).collect();
        println!(
            "bytes {} · hechos {} · reescritos idénticos {} · ilegibles {} · tipos distintos {}",
            bytes.len(),
            r.hechos.len(),
            identicas,
            r.lineas_ilegibles.len(),
            tipos.len()
        );
        assert_eq!(legibles, r.hechos.len());
        // Una línea de un esquema anterior (le falta un campo que se agregó después) la Unity también la
        // reescribe con ese campo en null: se acepta solo eso, sin perder ningún valor.
        for (n, _, original, reescrita) in &distintas {
            let mut resto = reescrita.iter();
            assert!(
                original.iter().all(|k| resto.any(|r| r == k)),
                "línea {n}: cambia algo más que un campo agregado"
            );
        }
        assert_eq!(sha256(&fs::read(&ruta).unwrap()), antes, "leer no escribe");
    }

    #[test]
    fn agregar_tras_una_linea_cortada_no_pega_el_hecho_nuevo() {
        // revisión PART-003: el hecho nuevo empieza en su propia línea aunque la anterior quedó cortada.
        let dir = std::env::temp_dir().join(format!("cc-registro-corte-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("conversaciones")).unwrap();
        fs::write(ruta_archivo(&dir, "c"), "{\"tipo\":\"ron").unwrap();
        let a = Hecho::nuevo("conversacion", &[("id", Valor::Texto("c".into()))]);
        agregar(&dir, "c", &a).unwrap();
        let r = leer_archivo(&dir, "c").unwrap();
        assert_eq!(r.hechos, vec![a.clone()]);
        assert_eq!(r.lineas_ilegibles.len(), 1);
        // con el archivo bien terminado no se agrega ningún salto de más
        agregar(&dir, "c", &a).unwrap();
        let mut fin = a.a_linea();
        fin.push(b'\n');
        let bytes = fs::read(ruta_archivo(&dir, "c")).unwrap();
        assert!(bytes.ends_with(&[b"\n".as_slice(), &fin].concat()));
        assert!(!bytes.ends_with(&[b"\n\n".as_slice(), &fin].concat()));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn un_id_de_conversacion_no_sale_de_la_carpeta_del_registro() {
        // revisión PART-003: el id forma parte de la ruta.
        let dir = std::env::temp_dir().join(format!("cc-registro-id-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let a = Hecho::nuevo("conversacion", &[("id", Valor::Texto("c".into()))]);
        for malo in ["../fuera", r"..\fuera", "a/b", r"C:\x", "..", ""] {
            let e = agregar(&dir, malo, &a).unwrap_err();
            assert_eq!(e.kind(), io::ErrorKind::InvalidInput, "{malo:?}");
            assert_eq!(
                leer_archivo(&dir, malo).unwrap_err().kind(),
                io::ErrorKind::InvalidInput
            );
        }
        assert!(!dir.join("fuera.jsonl").exists());
        agregar(&dir, "00000000-0000-4000-8000-000000000001", &a).unwrap();
        let _ = fs::remove_dir_all(&dir);
    }
}
