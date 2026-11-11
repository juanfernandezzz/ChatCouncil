//! La Puerta mínima (Puerta.cs de la Unity, D13): la conversación y la ronda en curso, y los comandos
//! que dejan sus hechos en el registro. REG-008 a REG-011, REG-014 a REG-016 y la operación (OPE-001,
//! OPE-002, OPE-012, OPE-013); el resto de la Puerta llega con las partes que portan sus etapas.

use crate::dominio;
use crate::informe;
use crate::json::Valor;
use crate::operacion::{self, EntradaSello, INTERVALO_MARCA, RespuestaParaOperar};
use crate::parseos;
use crate::prompts;
use crate::registro::{self, Hecho, RegistroLeido};
use crate::ronda::RolesElegidos;
use crate::texto::Texto;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::rc::Rc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// "yyyy-MM-ddTHH:mm:ss.fffZ" en UTC, como Puerta.Ahora.
pub fn formatear_utc(t: SystemTime) -> String {
    // Antes de 1970 los milisegundos son negativos y se redondean hacia abajo, como los ticks de .NET.
    let ms = match t.duration_since(UNIX_EPOCH) {
        Ok(d) => d.as_millis() as i64,
        Err(e) => {
            let d = e.duration();
            -(d.as_millis() as i64) - i64::from(d.subsec_nanos() % 1_000_000 != 0)
        }
    };
    let (dias, ms_dia) = (ms.div_euclid(86_400_000), ms.rem_euclid(86_400_000));
    // civil_from_days de Howard Hinnant: días desde 1970-01-01 a año, mes y día gregorianos.
    let z = dias + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    let (h, min, s, f) = (
        ms_dia / 3_600_000,
        ms_dia / 60_000 % 60,
        ms_dia / 1000 % 60,
        ms_dia % 1000,
    );
    format!("{y:04}-{m:02}-{d:02}T{h:02}:{min:02}:{s:02}.{f:03}Z")
}

/// Una ronda para la sección de rondas anteriores (D12).
#[derive(Debug, Clone, PartialEq)]
pub struct RondaAnterior {
    pub ronda_id: Option<Texto>,
    pub indice: i64,
    pub enviada_en: Option<Texto>,
    pub pregunta: Option<Texto>,
    pub etapa: &'static str,
    /// None si la ronda no tiene informe en la carpeta "informes".
    pub carpeta_informe: Option<PathBuf>,
}

pub struct Puerta {
    carpeta: PathBuf,
    nuevo_id: Box<dyn FnMut() -> String>,
    reloj: Box<dyn Fn() -> SystemTime>,
    activos: Vec<String>,
    roles: RolesElegidos,
    /// El pool de operadores en su orden fijo, de donde salen los P#.
    pool: Vec<String>,
    indice_ronda: i64,
    conversacion_actual: Option<String>,
    ronda_actual: Option<String>,
    ultima_lectura: Option<(String, u64, SystemTime, Rc<RegistroLeido>)>,
    /// Segundos al este de UTC de la hora local en ese instante: la de los nombres de archivo.
    desfase_local: fn(SystemTime) -> i64,
    // Lo último que se pegó en cada panel, en este proceso: es el promptCompleto de lo que se capture después.
    prompt_operador: HashMap<String, Texto>,
    prompt_integrador: Option<Texto>,
    prompt_verificador: Option<Texto>,
    prompt_redactor: Option<Texto>,
    marcas_redactor: Option<(String, String)>,
    sello_verificaciones: Option<Vec<(String, String)>>,
    // El informe armado en este proceso: el paso pasa a abrir su carpeta en vez de armar otro.
    informe_armado: Option<(String, PathBuf)>,
}

/// Lo que devuelve el script de página al leer un panel (Lectura de la Unity; los nombres son los
/// del contrato con la página).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Lectura {
    pub id: String,
    pub text: Texto,
    /// true generando, false terminado, None no observable.
    pub generating: Option<bool>,
    /// "element-gone" si el fin se observa, "quiescence" si se infiere; None si la lectura no lo dice.
    pub completion_kind: Option<String>,
    pub quiescence_ms: Option<i64>,
    pub model_label: Option<Texto>,
    pub user_text: Option<Texto>,
    pub fuentes_href: Option<i64>,
    pub html: Option<Texto>,
    pub error: Option<Texto>,
}

impl Lectura {
    pub fn con_error(&self, error: impl Into<Texto>) -> Lectura {
        Lectura {
            error: Some(error.into()),
            ..self.clone()
        }
    }

    /// El error, si no es nulo ni vacío (string.IsNullOrEmpty de la Unity).
    fn fallo(&self) -> Option<&Texto> {
        self.error.as_ref().filter(|e| !e.bytes().is_empty())
    }
}

/// El único paso siguiente de la etapa, que decide el motor, y lo que Juan hace a mano en ese momento.
#[derive(Debug, Clone, PartialEq)]
pub struct Paso {
    /// pregunta, investigacion, operacion, integracion, verificacion, redaccion o informe.
    pub etapa: &'static str,
    pub accion: &'static str,
    pub texto: &'static str,
    pub recordatorio: &'static str,
}

fn paso(etapa: &'static str, accion: &'static str, texto: &'static str) -> Paso {
    Paso {
        etapa,
        accion,
        texto,
        recordatorio: crate::ronda::recordatorio(etapa),
    }
}

/// Por debajo de esto una lectura no es una respuesta observable (test-runner.ts): qwen llegó a
/// devolver 3 caracteres como "terminado".
pub const UMBRAL_LECTURA_MINIMO: usize = 20;
/// La ronda de lo que se capturó sin haberlo enviado: el texto ya estaba en pantalla.
pub const PROMPT_SIN_RONDA: &str =
    "(capturado sin ronda de envio: el texto ya estaba en pantalla al presionar Leer/Capturar)";
/// Lo que se registra como prompt cuando la app se reinició entre pegar y capturar.
pub const PROMPT_NO_DISPONIBLE: &str = "(prompt no disponible: no se registró en este proceso — probablemente se reinició la app entre el envío y la captura)";
// Medido en la ronda de cierre: Mistral dejó como respuesta solo el aviso del canvas. No bloquea: deja constancia.
const RESPUESTA_CORTA: usize = 300;

fn strs(v: &[String]) -> Vec<&str> {
    v.iter().map(String::as_str).collect()
}

fn opcional(t: Option<&Texto>) -> Valor {
    t.map_or(Valor::Nulo, |t| Valor::Texto(t.clone()))
}

/// Lo que se pega en el panel de un operador (Puerta.Operacion).
#[derive(Debug, Clone, PartialEq)]
pub struct Operacion {
    pub operador_id: String,
    /// Lo que se pega: el prompt entero con sus marcas, o sin el cuerpo si va con archivo.
    pub texto: Texto,
    pub cuerpo_archivo: Option<Texto>,
    pub nombre_archivo: Option<String>,
    pub marcas: Vec<String>,
    /// El prompt tal como lo lee el operador, con el archivo adjunto incluido.
    pub prompt_completo: Texto,
}

/// El material de la ronda para el redactor, en un archivo con marcas, y el prompt que se pega
/// (Puerta.ArchivoRedactor).
#[derive(Debug, Clone, PartialEq)]
pub struct ArchivoRedactor {
    pub prompt: Texto,
    pub cuerpo_archivo: Texto,
    pub nombre_archivo: String,
    pub marca_primera: String,
    pub marca_ultima: String,
    /// D62: qué verificador es A y cuál B en este archivo: (etiqueta, verificadorId).
    pub sello_verificaciones: Vec<(String, String)>,
    /// Sin verificación capturada se arma igual y se avisa.
    pub aviso: Option<String>,
    /// Lo que se registra como promptCompleto de la respuesta del redactor.
    pub prompt_completo: Texto,
}

fn falla(mensaje: impl Into<String>) -> io::Error {
    io::Error::other(mensaje.into())
}

fn concatenar(partes: &[&Texto]) -> Texto {
    // Como por UTF-16, sin pasar por él: un surrogate suelto al final de una parte se une con el del
    // principio de la siguiente.
    let mut t = Texto::default();
    for p in partes {
        t.empujar_texto(p);
    }
    t
}

#[cfg(windows)]
fn desfase_local_del_sistema(t: SystemTime) -> i64 {
    #[repr(C)]
    struct FileTime {
        bajo: u32,
        alto: u32,
    }
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn FileTimeToLocalFileTime(utc: *const FileTime, local: *mut FileTime) -> i32;
    }
    // FILETIME: intervalos de 100 ns desde 1601-01-01. Usa el desfase vigente, el que importa para «ahora».
    let Ok(d) = t.duration_since(UNIX_EPOCH) else {
        return 0;
    };
    let utc = d.as_secs() * 10_000_000 + 116_444_736_000_000_000;
    let entrada = FileTime {
        bajo: utc as u32,
        alto: (utc >> 32) as u32,
    };
    let mut local = FileTime { bajo: 0, alto: 0 };
    // SAFETY: los dos punteros apuntan a FILETIME válidos durante la llamada.
    if unsafe { FileTimeToLocalFileTime(&entrada, &mut local) } == 0 {
        return 0;
    }
    let local = (u64::from(local.alto) << 32) | u64::from(local.bajo);
    (local as i64 - utc as i64) / 10_000_000
}

#[cfg(unix)]
fn desfase_local_del_sistema(t: SystemTime) -> i64 {
    use std::ffi::{c_char, c_int, c_long};
    // struct tm de glibc, musl, bionic y Darwin: nueve int, tm_gmtoff y tm_zone.
    #[repr(C)]
    struct Tm {
        campos: [c_int; 9],
        gmtoff: c_long,
        zona: *const c_char,
    }
    unsafe extern "C" {
        fn localtime_r(t: *const c_long, tm: *mut Tm) -> *mut Tm;
    }
    let s = match t.duration_since(UNIX_EPOCH) {
        Ok(d) => d.as_secs() as c_long,
        Err(e) => -(e.duration().as_secs() as c_long),
    };
    let mut tm = Tm {
        campos: [0; 9],
        gmtoff: 0,
        zona: std::ptr::null(),
    };
    // SAFETY: time_t es long en estas plataformas; los dos punteros son válidos durante la llamada.
    if unsafe { localtime_r(&s, &mut tm) }.is_null() {
        return 0;
    }
    i64::from(tm.gmtoff)
}

// shortcut: fuera de Windows y Unix la hora de los nombres de archivo es UTC; portar al sumar la plataforma.
#[cfg(not(any(windows, unix)))]
fn desfase_local_del_sistema(_: SystemTime) -> i64 {
    0
}

/// Los .jsonl de conversaciones/, en orden de nombre (el de NTFS, el que ve la Unity).
fn archivos_de_conversacion(carpeta: &Path) -> Vec<String> {
    let Ok(dir) = fs::read_dir(carpeta.join("conversaciones")) else {
        return Vec::new();
    };
    let mut ids: Vec<String> = dir
        .filter_map(|e| {
            e.ok()?
                .file_name()
                .into_string()
                .ok()?
                .strip_suffix(".jsonl")
                .map(String::from)
        })
        .collect();
    ids.sort();
    ids
}

fn texto_de(h: &Hecho, campo: &str) -> Option<Texto> {
    h.texto(campo).cloned()
}

/// Registro, ronda, pregunta efectiva y última respuesta de cada proveedor del pool.
type RondaPreparada = (Rc<RegistroLeido>, Hecho, Texto, HashMap<String, Hecho>);
// El registro leído, la ronda, la pregunta efectiva y la tabla H## de la ronda.
type DatosDeRol = (Rc<RegistroLeido>, Hecho, Texto, prompts::TablaHallazgos);

/// ParaTabla: los hallazgos vigentes de la ronda, de donde sale la tabla H##.
fn para_tabla(hechos: &[Hecho], ronda_id: &Texto) -> Vec<prompts::HallazgoParaTabla> {
    let cadena = |t: Option<&Texto>| t.map(|t| t.para_mostrar().to_string()).unwrap_or_default();
    dominio::salidas_vigentes_de_ronda(hechos, ronda_id)
        .iter()
        .flat_map(|s| {
            s.hallazgos.iter().map(|h| prompts::HallazgoParaTabla {
                hallazgo_id_original: cadena(h.texto("id")),
                categoria: h.texto("categoria").cloned().unwrap_or_default(),
                eje: h.texto("eje").cloned(),
                etiquetas: textos_de_lista(h.valor("etiquetas")),
                descripcion: h.texto("descripcion").cloned().unwrap_or_default(),
                operador_id_original: cadena(s.operador_id),
            })
        })
        .collect()
}

fn textos_de_lista(v: &Valor) -> Vec<Texto> {
    match v {
        Valor::Lista(l) => l
            .iter()
            .filter_map(|v| match v {
                Valor::Texto(t) => Some(t.clone()),
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    }
}

/// Un campo de texto dentro de un objeto del hecho (procedencia, selloVerificaciones).
fn texto_en<'a>(v: &'a Valor, nombre: &str) -> Option<&'a Texto> {
    match v {
        Valor::Objeto(o) => o.iter().find_map(|(n, v)| match v {
            Valor::Texto(t) if n.como_str() == Some(nombre) => Some(t),
            _ => None,
        }),
        _ => None,
    }
}

fn cadena_de(t: Option<&Texto>) -> String {
    t.map(|t| t.para_mostrar().into_owned()).unwrap_or_default()
}

/// Puerto PDF: imprime un Markdown a un PDF en la ruta dada; Err si no pudo (IPdf de la Unity).
pub trait Pdf {
    fn generar(&self, markdown: &Texto, ruta_pdf: &Path, titulo: &str) -> Result<(), String>;
}

/// Lo que devuelve ArmarInforme en la Unity.
#[derive(Debug, Clone, PartialEq)]
pub struct InformeArmado {
    pub ok: bool,
    pub mensaje: String,
    pub ruta: Option<PathBuf>,
    pub completo: bool,
}

/// Las URLs que se comprueban por ronda, como mucho (D62).
pub const TECHO_URLS_POR_RONDA: usize = 20;
const NOMBRE_FALTANTES: &str = "FALTAN - respuestas sin PDF.txt";

/// EscribirNuevo: nunca se sobrescribe un informe, que es un dato de investigación. UTF-8 sin BOM.
fn escribir_nuevo(ruta: &Path, texto: &Texto) -> io::Result<()> {
    use std::io::Write;
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(ruta)?
        .write_all(texto.para_mostrar().as_bytes())
}

/// EntregarCarpeta: la carpeta del informe. Una respuesta cuyo .md o PDF falla no se omite en
/// silencio: las demás se escriben igual y un archivo FALTAN las nombra (INF-008 a INF-010).
fn entregar_carpeta(
    dir_informes: &Path,
    nombre_base: &str,
    texto_informe: &Texto,
    respuestas: &[(String, String, Texto)],
    pdf: &dyn Pdf,
) -> io::Result<InformeArmado> {
    let carpeta_informe = dir_informes.join(nombre_base);
    if carpeta_informe.exists() {
        return Err(falla(format!(
            "ya existe la carpeta {}",
            carpeta_informe.display()
        )));
    }
    fs::create_dir_all(&carpeta_informe)?;
    let ruta_md = carpeta_informe.join(format!("{nombre_base}.md"));
    escribir_nuevo(&ruta_md, texto_informe)?;
    let fallo_informe = pdf
        .generar(
            texto_informe,
            &carpeta_informe.join(format!("{nombre_base}.pdf")),
            &format!("{nombre_base} — ChatCouncil"),
        )
        .err();

    let mut faltantes: Vec<(String, String)> = Vec::new();
    let mut fallo_subcarpeta = None;
    let mut nota_escrita = false;
    if !respuestas.is_empty() {
        let dir = carpeta_informe.join(informe::SUBCARPETA_RESPUESTAS);
        match fs::create_dir_all(&dir) {
            Err(e) => fallo_subcarpeta = Some(e.to_string()),
            Ok(()) => {
                for (archivo, titulo, markdown) in respuestas {
                    // El .md primero: es el texto, y otro modelo lo lee sin pasar por el PDF.
                    if let Err(e) = escribir_nuevo(&dir.join(format!("{archivo}.md")), markdown) {
                        faltantes
                            .push((archivo.clone(), format!("no se pudo escribir el .md ({e})")));
                    }
                    if let Err(e) =
                        pdf.generar(markdown, &dir.join(format!("{archivo}.pdf")), titulo)
                    {
                        faltantes
                            .push((archivo.clone(), format!("no se pudo generar el PDF ({e})")));
                    }
                }
                if !faltantes.is_empty() {
                    let mut nota = String::from(
                        "Estos archivos de respuesta de investigador no se pudieron escribir.\nEl texto de cada una sigue entero en el registro de la conversación.\n",
                    );
                    for (a, f) in &faltantes {
                        nota.push_str(&format!("\n- {a}: {f}"));
                    }
                    nota.push('\n');
                    // Si tampoco se puede escribir la nota, la cuenta igual va en el mensaje.
                    nota_escrita =
                        escribir_nuevo(&dir.join(NOMBRE_FALTANTES), &nota.into()).is_ok();
                }
            }
        }
    }

    // Se cuentan RESPUESTAS con algún fallo, no archivos: una puede fallar en el .md y en el PDF.
    let mut con_fallo: Vec<&str> = faltantes.iter().map(|(a, _)| a.as_str()).collect();
    con_fallo.dedup();
    let (total, con_fallo) = (respuestas.len(), con_fallo.len());
    let completas = total - con_fallo;
    let detalle = if total == 0 {
        "Sin respuestas de investigador en el registro de esta ronda.".to_string()
    } else if let Some(f) = &fallo_subcarpeta {
        format!(
            "NINGUNA de las {total} respuestas de investigador se escribió: no se pudo crear la subcarpeta \"{}\" ({f}). El texto de todas sigue entero en el registro.",
            informe::SUBCARPETA_RESPUESTAS
        )
    } else if con_fallo == 0 {
        format!("{completas} respuestas de investigador, cada una en .md y en PDF.")
    } else {
        format!(
            "{completas} de {total} respuestas completas; {con_fallo} con archivos faltantes{}.",
            if nota_escrita {
                format!(" (nombrados en \"{NOMBRE_FALTANTES}\")")
            } else {
                ", y la nota que los nombra tampoco se pudo escribir".to_string()
            }
        )
    };
    let carpeta = carpeta_informe.display();
    Ok(match fallo_informe {
        Some(f) => InformeArmado {
            ok: true,
            mensaje: format!(
                "Carpeta del informe: {carpeta}. El informe quedó solo en Markdown: no se pudo generar el PDF ({f}). {detalle}"
            ),
            ruta: Some(ruta_md),
            completo: false,
        },
        None => InformeArmado {
            ok: true,
            mensaje: format!(
                "Carpeta del informe: {carpeta}. El informe está en .md y en PDF. {detalle}"
            ),
            completo: faltantes.is_empty() && fallo_subcarpeta.is_none(),
            ruta: Some(carpeta_informe),
        },
    })
}

/// InformeIntegradorVigente: el texto del último informe del integrador de la ronda.
fn informe_vigente(leido: &RegistroLeido, ronda: &Hecho) -> io::Result<Texto> {
    let id = ronda.texto("id").cloned().unwrap_or_default();
    let h = dominio::ultimo_informe_integrador(&leido.hechos, &id)
        .ok_or_else(|| falla("la ronda todavía no tiene un informe del integrador capturado"))?;
    parseos::texto_del_informe_integrador(
        &h.texto("informeCrudo").cloned().unwrap_or_default(),
        h.texto("html"),
    )
}

impl Puerta {
    /// `pool` es el de operadores en su orden fijo, de donde salen los P#.
    pub fn new(
        carpeta: PathBuf,
        nuevo_id: Box<dyn FnMut() -> String>,
        reloj: Box<dyn Fn() -> SystemTime>,
        activos: Vec<String>,
        roles: RolesElegidos,
        pool: Vec<String>,
    ) -> Puerta {
        Puerta {
            carpeta,
            nuevo_id,
            reloj,
            activos,
            roles,
            pool,
            indice_ronda: 0,
            conversacion_actual: None,
            ronda_actual: None,
            ultima_lectura: None,
            desfase_local: desfase_local_del_sistema,
            prompt_operador: HashMap::new(),
            prompt_integrador: None,
            prompt_verificador: None,
            prompt_redactor: None,
            marcas_redactor: None,
            sello_verificaciones: None,
            informe_armado: None,
        }
    }

    /// La carpeta del informe de la ronda actual, si se armó en este proceso.
    pub fn carpeta_informe_armado(&self) -> Option<&Path> {
        self.informe_armado
            .as_ref()
            .filter(|(r, _)| self.ronda_actual.as_ref() == Some(r))
            .map(|(_, c)| c.as_path())
    }

    pub fn conversacion_actual(&self) -> Option<&str> {
        self.conversacion_actual.as_deref()
    }

    pub fn ronda_actual(&self) -> Option<&str> {
        self.ronda_actual.as_deref()
    }

    fn ahora(&self) -> String {
        formatear_utc((self.reloj)())
    }

    fn escribir(&self, hecho: &Hecho) -> io::Result<()> {
        registro::agregar(
            &self.carpeta,
            self.conversacion_actual
                .as_deref()
                .expect("sin conversación"),
            hecho,
        )
    }

    /// REG-008: el registro de la conversación en curso; se relee solo si el archivo cambió de largo o
    /// de fecha. Dos lecturas sin cambios devuelven la misma instancia.
    pub fn leer_registro(&mut self) -> io::Result<Rc<RegistroLeido>> {
        let Some(conversacion) = self.conversacion_actual.clone() else {
            return Ok(Rc::default());
        };
        let meta = match fs::metadata(registro::ruta_archivo(&self.carpeta, &conversacion)) {
            Ok(m) => m,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Rc::default()),
            Err(e) => return Err(e),
        };
        let (largo, fecha) = (meta.len(), meta.modified()?);
        if let Some((c, l, f, r)) = &self.ultima_lectura
            && *c == conversacion
            && *l == largo
            && *f == fecha
        {
            return Ok(Rc::clone(r));
        }
        // Se mide antes de leer: si el archivo crece en el medio, la próxima llamada ve otro largo y relee.
        let leido = Rc::new(registro::leer_archivo(&self.carpeta, &conversacion)?);
        self.ultima_lectura = Some((conversacion, largo, fecha, Rc::clone(&leido)));
        Ok(leido)
    }

    /// REG-014: al arrancar, la última ronda (por índice) de la conversación no de prueba más nueva
    /// (por creadaEn). Solo lee; un archivo que no se puede leer se salta.
    pub fn restaurar_ronda_activa(&mut self) {
        let mut mejor: Option<(Option<Texto>, String, Hecho)> = None;
        for id in archivos_de_conversacion(&self.carpeta) {
            let Ok(leido) = registro::leer_archivo(&self.carpeta, &id) else {
                continue;
            };
            let id_t = Texto::from(id.as_str());
            let Some(conversacion) = leido
                .hechos
                .iter()
                .find(|h| h.tipo() == "conversacion" && h.texto("id") == Some(&id_t))
            else {
                continue;
            };
            if conversacion.valor("esPrueba") == &Valor::Bool(true) {
                continue;
            }
            let mut ultima: Option<&Hecho> = None;
            for r in leido
                .hechos
                .iter()
                .filter(|h| h.tipo() == "ronda" && h.texto("conversacionId") == Some(&id_t))
            {
                if ultima.is_none_or(|u| r.entero("indice") > u.entero("indice")) {
                    ultima = Some(r);
                }
            }
            let Some(ultima) = ultima else { continue };
            let creada = texto_de(conversacion, "creadaEn");
            if mejor.as_ref().is_none_or(|(c, _, _)| creada > *c) {
                mejor = Some((creada, id, ultima.clone()));
            }
        }
        let Some((_, id, ronda)) = mejor else { return };
        self.conversacion_actual = Some(id);
        self.ronda_actual = ronda.texto("id").map(|t| t.para_mostrar().into_owned());
        self.indice_ronda = ronda.entero("indice").unwrap_or(0) + 1;
    }

    /// REG-015: las rondas de este aparato, la más nueva primero, sin las conversaciones de prueba.
    pub fn rondas_anteriores(&self) -> Vec<RondaAnterior> {
        let mut informes: Vec<(PathBuf, String)> = Vec::new();
        if let Ok(dir) = fs::read_dir(self.carpeta.join("informes")) {
            let mut carpetas: Vec<PathBuf> = dir
                .filter_map(|e| e.ok().map(|e| e.path()))
                .filter(|p| p.is_dir())
                .collect();
            carpetas.sort();
            for c in carpetas {
                let md = c.join(format!(
                    "{}.md",
                    c.file_name().unwrap_or_default().to_string_lossy()
                ));
                // Un .md que otro programa tiene abierto no bloquea a los demás.
                if let Ok(b) = fs::read(&md) {
                    informes.push((c, String::from_utf8_lossy(&b).replace("\r\n", "\n")));
                }
            }
        }
        let mut rondas = Vec::new();
        for id in archivos_de_conversacion(&self.carpeta) {
            let Ok(leido) = registro::leer_archivo(&self.carpeta, &id) else {
                continue;
            };
            let hechos = &leido.hechos;
            let id_t = Texto::from(id.as_str());
            let es_real = hechos
                .iter()
                .find(|h| h.tipo() == "conversacion" && h.texto("id") == Some(&id_t))
                .is_some_and(|c| c.valor("esPrueba") == &Valor::Bool(false));
            if !es_real {
                continue;
            }
            for r in hechos
                .iter()
                .filter(|h| h.tipo() == "ronda" && h.texto("conversacionId") == Some(&id_t))
            {
                let ronda_id = texto_de(r, "id");
                let marca = format!(
                    "Ronda: {}\n",
                    ronda_id
                        .as_ref()
                        .map(|t| t.para_mostrar())
                        .unwrap_or_default()
                );
                rondas.push(RondaAnterior {
                    indice: r.entero("indice").unwrap_or(0),
                    enviada_en: texto_de(r, "enviadaEn"),
                    pregunta: dominio::pregunta_efectiva_de_ronda(hechos, r)
                        .or(r.texto("prompt"))
                        .cloned(),
                    etapa: dominio::etapa_de_ronda(
                        hechos,
                        ronda_id.as_ref().unwrap_or(&Texto::default()),
                        self.pool.len(),
                    ),
                    carpeta_informe: informes
                        .iter()
                        .rev()
                        .find(|(_, t)| t.contains(&marca))
                        .map(|(c, _)| c.clone()),
                    ronda_id,
                });
            }
        }
        // Orden estable, como OrderByDescending(enviadaEn, Ordinal).ThenByDescending(indice).
        rondas.sort_by(|a, b| {
            b.enviada_en
                .cmp(&a.enviada_en)
                .then(b.indice.cmp(&a.indice))
        });
        rondas
    }

    /// REG-016 (D13): vuelve a la etapa Pregunta sin escribir nada y olvida lo pegado en esta ronda;
    /// la conversación sigue.
    pub fn abandonar_ronda(&mut self) {
        self.ronda_actual = None;
        self.prompt_operador.clear();
        self.prompt_integrador = None;
        self.prompt_verificador = None;
        self.prompt_redactor = None;
        self.marcas_redactor = None;
        self.sello_verificaciones = None;
    }

    /// REG-009: la conversación de la app nunca es de prueba.
    fn asegurar_conversacion(&mut self) -> io::Result<()> {
        if self.conversacion_actual.is_some() {
            return Ok(());
        }
        let id = (self.nuevo_id)();
        let h = Hecho::nuevo(
            "conversacion",
            &[
                ("id", Valor::Texto(id.as_str().into())),
                ("creadaEn", Valor::Texto(self.ahora().into())),
                ("esPrueba", Valor::Bool(false)),
            ],
        )?;
        // Vigente solo si su hecho quedó escrito: si no, las rondas irían a un registro sin conversación
        // y no se restaurarían (revisión PART-003; la Unity la fijaba antes de escribir).
        registro::agregar(&self.carpeta, &id, &h)?;
        self.conversacion_actual = Some(id);
        Ok(())
    }

    /// REG-010: escribe la Ronda con su semilla y, como condición suya, qué proveedores estaban
    /// cargados y quién integra.
    pub fn abrir_ronda(&mut self, prompt: impl Into<Texto>) -> io::Result<String> {
        self.asegurar_conversacion()?;
        let semilla = (self.nuevo_id)();
        let id = (self.nuevo_id)();
        let conversacion = self.conversacion_actual.clone().unwrap_or_default();
        let ronda = Hecho::nuevo(
            "ronda",
            &[
                ("id", Valor::Texto(id.as_str().into())),
                ("conversacionId", Valor::Texto(conversacion.into())),
                ("indice", Valor::Entero(self.indice_ronda)),
                ("prompt", Valor::Texto(prompt.into())),
                ("enviadaEn", Valor::Texto(self.ahora().into())),
                ("semilla", Valor::Texto(semilla.into())),
            ],
        )?;
        self.escribir(&ronda)?;
        self.indice_ronda += 1;
        let condicion = Hecho::nuevo(
            "condicion-proveedores-cargados",
            &[
                ("id", Valor::Texto((self.nuevo_id)().into())),
                ("rondaId", Valor::Texto(id.as_str().into())),
                (
                    "proveedores",
                    Valor::Lista(
                        self.activos
                            .iter()
                            .map(|a| Valor::Texto(a.as_str().into()))
                            .collect(),
                    ),
                ),
                (
                    "integrador",
                    Valor::Texto(self.roles.integrador.as_str().into()),
                ),
                ("registradoEn", Valor::Texto(self.ahora().into())),
            ],
        )?;
        self.escribir(&condicion)?;
        self.ronda_actual = Some(id.clone());
        Ok(id)
    }

    /// REG-011: un intento por proveedor, también los que fallaron. Sin ronda abierta es un error.
    pub fn registrar_intentos(
        &mut self,
        resultados: &[(&str, bool, Option<&str>)],
    ) -> io::Result<()> {
        let ronda_id = self.ronda_actual.clone().ok_or_else(|| {
            io::Error::other("no hay una ronda abierta para registrar los intentos")
        })?;
        let ahora = self.ahora();
        for (proveedor, ok, error) in resultados {
            let h = Hecho::nuevo(
                "intento",
                &[
                    ("id", Valor::Texto((self.nuevo_id)().into())),
                    ("rondaId", Valor::Texto(ronda_id.as_str().into())),
                    ("proveedorId", Valor::Texto((*proveedor).into())),
                    ("ok", Valor::Bool(*ok)),
                    (
                        "error",
                        error.map_or(Valor::Nulo, |e| Valor::Texto(e.into())),
                    ),
                    ("enviadoEn", Valor::Texto(ahora.as_str().into())),
                ],
            )?;
            self.escribir(&h)?;
        }
        Ok(())
    }

    /// OPE-001: la ronda en curso con su pregunta y la última respuesta de cada proveedor del pool; se
    /// niega con el motivo exacto si falta algo.
    fn preparar_ronda(&mut self, pool: &[&str]) -> io::Result<RondaPreparada> {
        let (Some(_), Some(ronda_id)) = (&self.conversacion_actual, self.ronda_actual.clone())
        else {
            return Err(falla(
                "no hay una ronda activa: captura las respuestas del pool antes de pegar la operación",
            ));
        };
        let leido = self.leer_registro()?;
        let id = Texto::from(ronda_id.as_str());
        let ronda = leido
            .hechos
            .iter()
            .find(|h| h.tipo() == "ronda" && h.texto("id") == Some(&id))
            .ok_or_else(|| falla("no se encontró la ronda actual en el registro"))?
            .clone();
        let pregunta = dominio::pregunta_efectiva_de_ronda(&leido.hechos, &ronda)
            .cloned()
            .ok_or_else(|| {
                falla(format!(
                    "la ronda {ronda_id} no tiene pregunta registrada: declárala antes de pegar la operación"
                ))
            })?;
        // UltimaPorProveedor: gana la última captura de cada uno.
        let mut ultimas: HashMap<String, Hecho> = HashMap::new();
        for r in leido
            .hechos
            .iter()
            .filter(|h| h.tipo() == "respuesta" && h.texto("rondaId") == Some(&id))
        {
            if let Some(p) = r.texto("proveedorId").and_then(Texto::como_str)
                && pool.contains(&p)
            {
                ultimas.insert(p.to_string(), r.clone());
            }
        }
        let faltantes: Vec<&str> = pool
            .iter()
            .copied()
            .filter(|p| !ultimas.contains_key(*p))
            .collect();
        if !faltantes.is_empty() {
            return Err(falla(format!(
                "faltan respuestas capturadas en esta ronda: {}. Usa \"Capturar\" antes de pegar la operación",
                faltantes.join(", ")
            )));
        }
        Ok((leido, ronda, pregunta, ultimas))
    }

    /// OPE-002 y OPE-012: los cuerpos con la semilla persistida de la ronda. La primera vez escribe el
    /// sello; después lo compara con el recién calculado y, si discrepa, se niega sin escribir nada.
    fn armar_y_persistir_cuerpos(
        &mut self,
        pool: &[&str],
    ) -> io::Result<(Texto, operacion::CuerposPorOperador)> {
        let (leido, ronda, pregunta, ultimas) = self.preparar_ronda(pool)?;
        let ronda_id = ronda.texto("id").cloned().unwrap_or_default();
        let resultado = self.cuerpos_de_ronda(&leido, &ronda, &ultimas, pool)?;
        let existente: Vec<&Hecho> = leido
            .hechos
            .iter()
            .filter(|h| h.tipo() == "sello" && h.texto("rondaId") == Some(&ronda_id))
            .collect();
        if !existente.is_empty() {
            if let Some(motivo) = discrepancia_de_sello(&existente, &resultado.sello) {
                return Err(falla(format!(
                    "el sello ya persistido para la ronda {} no coincide con el que se acaba de calcular ({motivo}) — posible cambio en las respuestas, la semilla o el orden del pool entre consolidaciones. No se escribió nada.",
                    ronda_id.para_mostrar()
                )));
            }
            return Ok((pregunta, resultado));
        }
        for s in &resultado.sello {
            let h = Hecho::nuevo(
                "sello",
                &[
                    ("id", Valor::Texto((self.nuevo_id)().into())),
                    ("rondaId", Valor::Texto(ronda_id.clone())),
                    ("label", Valor::Texto(s.label.as_str().into())),
                    (
                        "codigoEstable",
                        Valor::Texto(s.codigo_estable.as_str().into()),
                    ),
                    (
                        "panelSourceId",
                        Valor::Texto(s.panel_source_id.as_str().into()),
                    ),
                    ("replyId", Valor::Texto(s.reply_id.clone())),
                    ("attemptId", Valor::Texto(s.attempt_id.clone())),
                ],
            )?;
            self.escribir(&h)?;
        }
        Ok((pregunta, resultado))
    }

    /// ArmarCuerposDeRonda: los cuerpos de todos los operadores con la semilla persistida de la
    /// ronda, sin escribir nada.
    fn cuerpos_de_ronda(
        &mut self,
        leido: &RegistroLeido,
        ronda: &Hecho,
        ultimas: &HashMap<String, Hecho>,
        pool: &[&str],
    ) -> io::Result<operacion::CuerposPorOperador> {
        // Sin semilla no hay barajado que reproducir, y simular uno inventaría un dato.
        let Some(semilla) = ronda.texto("semilla") else {
            return Err(falla(format!(
                "ronda {} no tiene semilla persistida: no se puede armar un cuerpo anonimizado reproducible sobre una ronda sin semilla.",
                ronda
                    .texto("id")
                    .cloned()
                    .unwrap_or_default()
                    .para_mostrar()
            )));
        };
        let mut urls_por: HashMap<&Texto, Vec<Texto>> = HashMap::new();
        for c in leido.hechos.iter().filter(|h| h.tipo() == "cita") {
            if let (Some(r), Some(u)) = (c.texto("respuestaId"), c.texto("url")) {
                urls_por.entry(r).or_default().push(u.clone());
            }
        }
        let para_operar: Vec<RespuestaParaOperar> = pool
            .iter()
            .map(|p| {
                let r = &ultimas[*p];
                let id = r.texto("id").cloned().unwrap_or_default();
                RespuestaParaOperar {
                    proveedor_id: p.to_string(),
                    urls_citadas: urls_por.get(&id).cloned().unwrap_or_default(),
                    reply_id: id.clone(),
                    attempt_id: id,
                    texto: r.texto("textoOriginal").cloned().unwrap_or_default(),
                }
            })
            .collect();
        let nuevo_id = &mut self.nuevo_id;
        operacion::armar_cuerpos_por_operador(
            &para_operar,
            pool,
            operacion::hash_semilla(semilla),
            &mut || nuevo_id(),
        )
        .map_err(falla)
    }

    // "AAAA-MM-DD-HHMM" con la hora local, para los nombres de archivo que ve Juan.
    fn sello_de_archivo(&self) -> String {
        let t = (self.reloj)();
        let d = (self.desfase_local)(t);
        let local = if d >= 0 {
            t + Duration::from_secs(d as u64)
        } else {
            t - Duration::from_secs(d.unsigned_abs())
        };
        let s = formatear_utc(local);
        format!("{}-{}{}", &s[..10], &s[11..13], &s[14..16])
    }

    /// OPE-013: la operación de un panel, pegada (el prompt entero con sus marcas) o con archivo (el
    /// prompt sin cuerpo, y el cuerpo con sus marcas en un .txt). Escribe el sello la primera vez.
    pub fn armar_operacion(
        &mut self,
        operador_id: &str,
        con_archivo: bool,
    ) -> io::Result<Operacion> {
        let pool = self.pool.clone();
        let pool = &strs(&pool)[..];
        if !pool.contains(&operador_id) {
            return Err(falla(format!(
                "\"{}\" no es un operador del pool: no tiene cuerpo que operar",
                dominio::nombre_proveedor(operador_id)
            )));
        }
        let (pregunta, resultado) = self.armar_y_persistir_cuerpos(pool)?;
        let cuerpo = resultado
            .cuerpos
            .iter()
            .find(|c| c.operador_id == operador_id)
            .expect("un cuerpo por operador del pool");
        let token = (self.nuevo_id)();
        let marca_fin = format!("[[CC-MARCA-FIN-{token}]]");
        // Cuerpo y marcas siguen en UTF-16 hasta el final: un solo paso a Texto.
        if con_archivo {
            let codigo = &resultado
                .sello
                .iter()
                .find(|s| s.panel_source_id == operador_id)
                .expect("una entrada del sello por operador")
                .codigo_estable;
            let prompt = operacion::prompt_con_archivo(&pregunta);
            let (mut unidades, mut marcas) = operacion::marcas_intercaladas(
                &operacion::cuerpo_de(&cuerpo.respuestas_para_operador),
                &token,
                INTERVALO_MARCA,
            );
            unidades.extend(format!("\n{marca_fin}\n").encode_utf16());
            marcas.push(marca_fin);
            let archivo = Texto::desde_utf16(&unidades);
            let nombre = format!("operacion-{codigo}-{}.txt", self.sello_de_archivo());
            let cabecera = Texto::from(format!("\n\n=== ARCHIVO ADJUNTO: {nombre} ===\n"));
            return Ok(Operacion {
                operador_id: operador_id.to_string(),
                prompt_completo: concatenar(&[&prompt, &cabecera, &archivo]),
                texto: prompt,
                cuerpo_archivo: Some(archivo),
                nombre_archivo: Some(nombre),
                marcas,
            });
        }
        // Las marcas van sobre el texto ENTERO; sin salto final, que cada editor trata distinto.
        let (mut unidades, mut marcas) = operacion::marcas_intercaladas(
            &operacion::prompt_operacion_utf16(&pregunta, &cuerpo.respuestas_para_operador),
            &token,
            INTERVALO_MARCA,
        );
        unidades.extend(format!("\n{marca_fin}").encode_utf16());
        marcas.push(marca_fin);
        let completo = Texto::desde_utf16(&unidades);
        Ok(Operacion {
            operador_id: operador_id.to_string(),
            texto: completo.clone(),
            cuerpo_archivo: None,
            nombre_archivo: None,
            marcas,
            prompt_completo: completo,
        })
    }

    /// TablaDeRonda (INT-001, INT-002): la tabla de hallazgos de la ronda tal como la ve el
    /// integrador; el verificador y el redactor citan sus H##.
    fn tabla_de_ronda(&mut self, pool: &[&str], rol: &str) -> io::Result<DatosDeRol> {
        let (Some(_), Some(ronda_id)) = (&self.conversacion_actual, self.ronda_actual.clone())
        else {
            return Err(falla("no hay una ronda activa"));
        };
        let leido = self.leer_registro()?;
        let id = Texto::from(ronda_id.as_str());
        let ronda = leido
            .hechos
            .iter()
            .find(|h| h.tipo() == "ronda" && h.texto("id") == Some(&id))
            .ok_or_else(|| falla("no se encontró la ronda actual en el registro"))?
            .clone();
        let Some(semilla) = ronda.texto("semilla").map(operacion::hash_semilla) else {
            return Err(falla("la ronda no tiene semilla persistida"));
        };
        let pregunta = dominio::pregunta_efectiva_de_ronda(&leido.hechos, &ronda)
            .cloned()
            .ok_or_else(|| {
                falla(format!(
                    "la ronda {ronda_id} no tiene pregunta registrada válida: declárala antes de pegar el {rol}"
                ))
            })?;
        let tabla = prompts::armar_tabla_hallazgos(&para_tabla(&leido.hechos, &id), pool, semilla)
            .map_err(falla)?;
        Ok((leido, ronda, pregunta, tabla))
    }

    /// INT-003: el prompt del integrador con la tabla de hallazgos de la ronda.
    pub fn armar_prompt_integrador(&mut self) -> io::Result<Texto> {
        let pool = self.pool.clone();
        let (_, _, pregunta, tabla) = self.tabla_de_ronda(&strs(&pool), "integrador")?;
        Ok(prompts::armar_prompt_integrador(
            &pregunta,
            &tabla.para_prompt,
        ))
    }

    /// VER-001, INT-006: la sección QUE CONVIENE RESCATAR del último informe del integrador, tal
    /// cual, y solo los H## que esa sección cita, en orden de primera aparición. Un H## que no está
    /// en la tabla no se inventa.
    pub fn armar_prompt_verificador(&mut self) -> io::Result<Texto> {
        let pool = self.pool.clone();
        let (leido, ronda, pregunta, tabla) = self.tabla_de_ronda(&strs(&pool), "verificador")?;
        let crudo = informe_vigente(&leido, &ronda)?;
        let Some(rescate) =
            parseos::extraer_seccion_rescate(&parseos::extraer_titulo_del_informe(&crudo).1)
        else {
            let mut plano = Vec::new();
            let mut previo_blanco = false;
            for c in crudo.a_utf16() {
                let blanco = char::from_u32(c as u32).is_some_and(registro::es_blanco);
                if !blanco {
                    plano.push(c);
                } else if !previo_blanco {
                    plano.push(b' ' as u16);
                }
                previo_blanco = blanco;
            }
            let inicio = parseos::trim(&plano);
            return Err(falla(format!(
                "el informe del integrador no tiene la seccion QUE CONVIENE RESCATAR. Se capturó (primeros 100 caracteres): \"{}\"",
                Texto::desde_utf16(&inicio[..inicio.len().min(100)]).para_mostrar()
            )));
        };
        let mut ids: Vec<String> = Vec::new();
        for id in parseos::referencias_h(&rescate.a_utf16()) {
            if !ids.contains(&id) {
                ids.push(id);
            }
        }
        let hallazgos: Vec<&prompts::HallazgoParaIntegrador> = ids
            .iter()
            .filter_map(|id| tabla.para_prompt.iter().find(|h| &h.id == id))
            .collect();
        Ok(prompts::armar_prompt_verificador(
            &pregunta, &rescate, &hallazgos,
        ))
    }

    /// RED-001 a RED-004: el archivo del redactor (informe, verificaciones anonimizadas, la tabla
    /// H## y las respuestas con sus P#, con marcas) y su prompt. Sin verificación se arma igual y
    /// se avisa. No escribe nada.
    pub fn armar_redactor(&mut self) -> io::Result<ArchivoRedactor> {
        let pool = self.pool.clone();
        let pool = &strs(&pool)[..];
        let roles = self.roles.clone();
        let verificadores = &roles.verificadores()[..];
        let (leido, ronda, pregunta, tabla) = self.tabla_de_ronda(pool, "redactor")?;
        let informe = informe_vigente(&leido, &ronda)?;
        let ronda_id = ronda.texto("id").cloned().unwrap_or_default();
        // D62 (revisada): las verificaciones vigentes, anonimizadas y barajadas con la semilla (A y B).
        let salidas = dominio::verificaciones_vigentes(&leido.hechos, &ronda_id, verificadores)
            .into_iter()
            .map(|s| {
                Ok((
                    s.texto("verificadorId")
                        .map(|t| t.para_mostrar().to_string())
                        .unwrap_or_default(),
                    parseos::texto_de_la_salida_verificador(
                        &s.texto("salidaCruda").cloned().unwrap_or_default(),
                        s.texto("html"),
                    )?,
                ))
            })
            .collect::<io::Result<Vec<_>>>()?;
        let (verificaciones, sello) = operacion::anonimizar_verificaciones(
            &salidas,
            &ronda.texto("semilla").cloned().unwrap_or_default(),
        );
        let (leido, ronda, _, ultimas) = self.preparar_ronda(pool)?;
        let respuestas = self
            .cuerpos_de_ronda(&leido, &ronda, &ultimas, pool)?
            .respuestas_todas;
        let material = prompts::MaterialRedactor {
            informe,
            verificaciones,
            tabla: prompts::tabla_de(&tabla.para_prompt),
            respuestas,
        };
        let token = (self.nuevo_id)();
        let (mut unidades, marcas) = operacion::marcas_intercaladas(
            &prompts::armar_archivo_redactor(&material).a_utf16(),
            &token,
            INTERVALO_MARCA,
        );
        let marca_fin = format!("[[CC-MARCA-FIN-{token}]]");
        unidades.extend(format!("\n{marca_fin}\n").encode_utf16());
        let archivo = Texto::desde_utf16(&unidades);
        let nombre = format!("redactor-{}.txt", self.sello_de_archivo());
        let prompt = prompts::armar_prompt_redactor(&pregunta);
        let cabecera = Texto::from(format!("\n\n=== ARCHIVO ADJUNTO: {nombre} ===\n"));
        Ok(ArchivoRedactor {
            prompt_completo: concatenar(&[&prompt, &cabecera, &archivo]),
            prompt,
            cuerpo_archivo: archivo,
            nombre_archivo: nombre,
            marca_primera: marcas.first().cloned().unwrap_or_else(|| marca_fin.clone()),
            marca_ultima: marca_fin,
            aviso: sello.is_empty().then(|| {
                "No hay verificación capturada en esta ronda: el archivo lo dice y el redactor trabaja sin ella.".to_string()
            }),
            sello_verificaciones: sello,
        })
    }

    /// ArmarInforme (INF-002 a INF-011): el informe de la ronda y su carpeta en «informes»: el .md
    /// y su PDF, y una subcarpeta con la respuesta de cada investigador. Las URLs salen de las
    /// url-comprobada del registro: comprobarlas antes es INF-001.
    pub fn armar_informe(&mut self, pdf: &dyn Pdf) -> InformeArmado {
        self.armar_informe_o_fallar(pdf)
            .unwrap_or_else(|e| InformeArmado {
                ok: false,
                mensaje: format!("No se pudo armar el informe final: {e}"),
                ruta: None,
                completo: false,
            })
    }

    fn armar_informe_o_fallar(&mut self, pdf: &dyn Pdf) -> io::Result<InformeArmado> {
        let sin_ronda = || InformeArmado {
            ok: false,
            mensaje: "No hay una ronda activa para armar el informe.".into(),
            ruta: None,
            completo: false,
        };
        let (Some(conversacion), Some(ronda_id)) =
            (self.conversacion_actual.clone(), self.ronda_actual.clone())
        else {
            return Ok(sin_ronda());
        };
        let leido = self.leer_registro()?;
        let hechos = &leido.hechos;
        let id = Texto::from(ronda_id.as_str());
        let Some(ronda) = hechos
            .iter()
            .find(|h| h.tipo() == "ronda" && h.texto("id") == Some(&id))
        else {
            return Ok(sin_ronda());
        };
        let pool_propio = self.pool.clone();
        let pool = &strs(&pool_propio)[..];
        let roles = self.roles.clone();

        let semilla = ronda.texto("semilla").cloned().unwrap_or_default();
        let sello: Vec<&Hecho> = hechos.iter().filter(|h| es_de(h, "sello", &id)).collect();
        // UltimaPorProveedor: en el orden de la primera captura de cada uno; gana la última.
        let mut del_pool: Vec<&Hecho> = Vec::new();
        for r in hechos.iter().filter(|h| es_de(h, "respuesta", &id)) {
            let p = r.texto("proveedorId");
            if !p
                .and_then(Texto::como_str)
                .is_some_and(|p| pool.contains(&p))
            {
                continue;
            }
            match del_pool.iter_mut().find(|x| x.texto("proveedorId") == p) {
                Some(x) => *x = r,
                None => del_pool.push(r),
            }
        }
        let ids_respuesta: HashSet<&Texto> =
            del_pool.iter().filter_map(|r| r.texto("id")).collect();
        let citas: Vec<&Hecho> = hechos
            .iter()
            .filter(|h| {
                h.tipo() == "cita"
                    && h.texto("respuestaId")
                        .is_some_and(|r| ids_respuesta.contains(r))
            })
            .collect();
        let citas_de = |r: &Hecho| {
            citas
                .iter()
                .filter(|c| c.texto("respuestaId") == r.texto("id"))
                .count()
        };
        let vigentes = dominio::salidas_vigentes_de_ronda(hechos, &id);
        let tabla = prompts::armar_tabla_hallazgos(
            &para_tabla(hechos, &id),
            pool,
            operacion::hash_semilla(&semilla),
        )
        .map_err(falla)?;
        // Un operador nunca desaparece del informe por haber fallado o no dar hallazgos: los tres estados son hechos.
        let participacion = pool
            .iter()
            .map(|op| {
                let v = vigentes
                    .iter()
                    .find(|v| v.operador_id.and_then(Texto::como_str) == Some(*op));
                let s = v.and_then(|v| {
                    hechos
                        .iter()
                        .find(|h| h.tipo() == "salida-operador" && h.texto("id") == v.salida_id)
                });
                let (estado, detalle) = match (v, s) {
                    (Some(v), Some(_)) if !v.hallazgos.is_empty() => {
                        ("ok", format!("{} hallazgos", v.hallazgos.len()))
                    }
                    (Some(_), Some(s)) => {
                        let descartadas = dominio::etiquetas_validas_del_operador(op, pool, &sello)
                            .map_or(0, |e| {
                                parseos::parsear_hallazgos(
                                    &s.texto("salidaCruda").cloned().unwrap_or_default(),
                                    &e,
                                )
                                .lineas_descartadas
                            });
                        (
                            "sin-hallazgos",
                            format!(
                                "0 hallazgos parseables ({descartadas} líneas de la salida cruda descartadas)"
                            ),
                        )
                    }
                    _ => (
                        "fallo",
                        "no se capturó salida: no hay salida de operador en el registro".into(),
                    ),
                };
                informe::ParticipacionOperador {
                    operador_id: op.to_string(),
                    estado: estado.into(),
                    detalle,
                }
            })
            .collect();

        let informe_integrador = dominio::ultimo_informe_integrador(hechos, &id);
        let pregunta = dominio::pregunta_efectiva_de_ronda(hechos, ronda)
            .or(ronda.texto("prompt"))
            .cloned()
            .unwrap_or_default();
        let salidas_verificador =
            dominio::verificaciones_vigentes(hechos, &id, &roles.verificadores());
        let urls: Vec<&Hecho> = hechos
            .iter()
            .filter(|h| es_de(h, "url-comprobada", &id))
            .collect();

        // Desanonimizar: P# → proveedor con el sello, O# → operador con la tabla.
        let mut proveedor_de_codigo: HashMap<String, String> = HashMap::new();
        let mut codigo_de_proveedor: HashMap<String, Option<String>> = HashMap::new();
        for s in &sello {
            let panel = cadena_de(s.texto("panelSourceId"));
            let codigo = s.texto("codigoEstable").map(|t| cadena_de(Some(t)));
            if let Some(c) = &codigo {
                proveedor_de_codigo.insert(c.clone(), panel.clone());
            }
            codigo_de_proveedor.insert(panel, codigo);
        }
        let hallazgos: Vec<informe::HallazgoResuelto> = tabla
            .filas
            .iter()
            .map(|f| informe::HallazgoResuelto {
                codigo: f.codigo_hallazgo.clone(),
                categoria: f.categoria.clone(),
                eje: f.eje.clone(),
                respuestas_reales: f
                    .etiquetas
                    .iter()
                    .filter_map(|p| p.como_str().and_then(|p| proveedor_de_codigo.get(p)))
                    .cloned()
                    .collect(),
                descripcion: f.descripcion.clone(),
                operador_real: f.operador_id_original.clone(),
            })
            .collect();
        let ids_validos: Vec<&str> = tabla
            .filas
            .iter()
            .map(|f| f.codigo_hallazgo.as_str())
            .collect();
        let texto_integrador = informe_integrador
            .map(|h| {
                parseos::texto_del_informe_integrador(
                    &h.texto("informeCrudo").cloned().unwrap_or_default(),
                    h.texto("html"),
                )
            })
            .transpose()?;
        let redaccion = match hechos.iter().rfind(|h| es_de(h, "respuesta-redactor", &id)) {
            None => None,
            Some(r) => {
                let urls_del_material: Vec<Texto> = citas
                    .iter()
                    .filter_map(|c| c.texto("url").cloned())
                    .collect();
                let c = prompts::controles_redaccion(
                    &r.texto("textoCrudo").cloned().unwrap_or_default(),
                    r.texto("html"),
                    r.texto("marcaPrimera").and_then(Texto::como_str),
                    r.texto("marcaUltima").and_then(Texto::como_str),
                    &ids_validos,
                    &urls_del_material,
                )?;
                Some(informe::RedaccionParaInforme {
                    redactor_id: cadena_de(r.texto("redactorId")),
                    controles: prompts::lineas_de_control(&c),
                    cuerpo: c.cuerpo,
                    sello_verificaciones: match r.valor("selloVerificaciones") {
                        Valor::Lista(l) => l
                            .iter()
                            .map(|x| {
                                (
                                    cadena_de(texto_en(x, "etiqueta")),
                                    cadena_de(texto_en(x, "verificadorId")),
                                )
                            })
                            .collect(),
                        _ => Vec::new(),
                    },
                })
            }
        };
        let verificaciones = salidas_verificador
            .iter()
            .map(|s| {
                informe::verificacion_para_informe(s, &urls, &hallazgos, Some(TECHO_URLS_POR_RONDA))
            })
            .collect::<io::Result<Vec<_>>>()?;
        let cargados: Option<Vec<String>> = dominio::proveedores_cargados_de_ronda(hechos, &id)
            .map(|v| {
                textos_de_lista(v)
                    .iter()
                    .map(|t| cadena_de(Some(t)))
                    .collect()
            });
        let texto = informe::armar(&informe::InformeFinalInput {
            pregunta: pregunta.clone(),
            fecha: self.ahora(),
            conversacion_id: conversacion,
            ronda_id: ronda_id.clone(),
            referencias_en_orden: texto_integrador
                .as_ref()
                .map(|t| {
                    parseos::parsear_referencias_integrador(t, &ids_validos)
                        .referencias
                        .into_iter()
                        .map(|r| informe::ReferenciaResuelta {
                            codigo: r.hallazgo_id,
                            existe: !r.referencia_invalida,
                        })
                        .collect()
                })
                .unwrap_or_default(),
            informe_integrador_crudo: texto_integrador.clone(),
            hallazgos,
            participacion_operadores: participacion,
            condiciones: del_pool
                .iter()
                .map(|r| {
                    let p = cadena_de(r.texto("proveedorId"));
                    informe::CondicionProveedor {
                        etiqueta_modelo: texto_en(r.valor("procedencia"), "modelLabel").cloned(),
                        caracteres_respuesta: r
                            .texto("textoOriginal")
                            .map_or(0, Texto::largo_utf16),
                        fuentes_citadas: citas_de(r),
                        codigo_estable: codigo_de_proveedor.get(&p).cloned().flatten(),
                        proveedor_id: p,
                    }
                })
                .collect(),
            integridad_entrega:
                "no persistida en el registro (se informa en pantalla al pegar cada panel)".into(),
            semilla,
            proveedores_cargados_incompletos: cargados
                .filter(|c| pool.iter().any(|p| !c.iter().any(|x| x == p))),
            integrador: informe_integrador
                .and_then(|h| h.texto("operadorId"))
                .or_else(|| dominio::integrador_de_ronda(hechos, &id))
                .map(|t| cadena_de(Some(t))),
            verificaciones,
            redaccion,
        });

        // El nombre: fecha y hora locales y el título del integrador (o las primeras palabras de la pregunta).
        let dir = self.carpeta.join("informes");
        fs::create_dir_all(&dir)?;
        let titulo = match informe_integrador {
            None => None,
            Some(h) if h.texto("html").is_some_and(|t| !t.bytes().is_empty()) => texto_integrador
                .as_ref()
                .and_then(|t| parseos::extraer_titulo_del_informe(t).0),
            Some(h) => h.texto("titulo").cloned().or_else(|| {
                parseos::extraer_titulo_del_informe(
                    &h.texto("informeCrudo").cloned().unwrap_or_default(),
                )
                .0
            }),
        };
        // D47: ninguna ruta de la carpeta pasa de 259 caracteres (MAX_PATH). Las más largas son el PDF, que repite
        // el nombre, y la nota de faltantes; se reservan " (999)" y "AAAA-MM-DD HHMM - ".
        // shortcut: con la carpeta "informes" en más de ~168 caracteres no entra ningún título y va el de reserva, que puede
        // dejar la nota de faltantes fuera del límite; mover la carpeta de datos más arriba si alguien la tiene tan honda.
        let unidades = |s: &str| s.encode_utf16().count() as i64;
        let libre = 259 - unidades(&std::path::absolute(&dir)?.to_string_lossy());
        let nombre_max = ((libre - 6) / 2)
            .min(libre - 3 - unidades(informe::SUBCARPETA_RESPUESTAS) - unidades(NOMBRE_FALTANTES))
            - 6;
        let s = self.sello_de_archivo();
        let sello_local = format!("{} {}", &s[..10], &s[11..]);
        let base = parseos::nombre_base_de_informe(
            titulo.as_ref(),
            &pregunta,
            &sello_local,
            (nombre_max - 18).max(0) as usize,
        );
        let nombre = parseos::nombre_libre_de_informe(&base, |n| {
            let n = n.para_mostrar();
            dir.join(&*n).is_dir()
                || dir.join(format!("{n}.md")).is_file()
                || dir.join(format!("{n}.pdf")).is_file()
        })
        .map_err(falla)?
        .para_mostrar()
        .into_owned();
        // Las respuestas de los INVESTIGADORES a la pregunta, en el orden del pool; nunca las salidas de operador.
        let mut respuestas = Vec::new();
        for (i, op) in pool.iter().enumerate() {
            let Some(r) = del_pool
                .iter()
                .find(|r| r.texto("proveedorId").and_then(Texto::como_str) == Some(*op))
            else {
                continue;
            };
            let procedencia = r.valor("procedencia");
            respuestas.push((
                informe::nombre_archivo_respuesta(i, op),
                format!(
                    "{} — respuesta de investigador",
                    dominio::nombre_proveedor(op)
                ),
                informe::markdown_de_respuesta_investigador(
                    &pregunta,
                    &informe::RespuestaParaPdf {
                        proveedor_id: op.to_string(),
                        etiqueta_modelo: texto_en(procedencia, "modelLabel").cloned(),
                        leida_en: cadena_de(r.texto("leidaEn")),
                        texto_original: r.texto("textoOriginal").cloned().unwrap_or_default(),
                        error: r.texto("error").cloned(),
                        fuentes_citadas: citas_de(r),
                        fuentes_href: r.entero("fuentesHref"),
                        fin_de: texto_en(procedencia, "finDe").map(|t| cadena_de(Some(t))),
                    },
                ),
            ));
        }
        let entrega = entregar_carpeta(&dir, &nombre, &texto, &respuestas, pdf)?;
        self.informe_armado = Some((ronda_id, dir.join(&nombre)));
        Ok(entrega)
    }

    /// OPE-015 (ProcesarSalidaOperador): la salida del operador y un hecho por hallazgo, parseados
    /// contra las etiquetas de ESTE operador.
    #[allow(clippy::too_many_arguments)]
    fn procesar_salida_operador(
        &mut self,
        ronda_id: &str,
        operador_id: &str,
        prompt: Valor,
        salida_cruda: &Texto,
        html: Valor,
        validas: &[String],
        copiada_de: Option<Valor>,
    ) -> io::Result<parseos::Hallazgos> {
        let salida_id = (self.nuevo_id)();
        let mut campos = vec![
            ("id", Valor::Texto(salida_id.as_str().into())),
            ("rondaId", Valor::Texto(ronda_id.into())),
            ("operadorId", Valor::Texto(operador_id.into())),
            ("promptCompleto", prompt),
            ("salidaCruda", Valor::Texto(salida_cruda.clone())),
            ("recibidaEn", Valor::Texto(self.ahora().into())),
            ("html", html),
        ];
        if let Some(c) = copiada_de {
            campos.push(("copiadaDe", c));
        }
        self.escribir(&Hecho::nuevo("salida-operador", &campos)?)?;
        let parseo = parseos::parsear_hallazgos(salida_cruda, validas);
        for h in &parseo.hallazgos {
            let hecho = Hecho::nuevo(
                "hallazgo",
                &[
                    ("id", Valor::Texto((self.nuevo_id)().into())),
                    ("salidaOperadorId", Valor::Texto(salida_id.as_str().into())),
                    ("categoria", Valor::Texto(h.categoria.into())),
                    ("eje", h.eje.clone().map_or(Valor::Nulo, Valor::Texto)),
                    (
                        "etiquetas",
                        Valor::Lista(h.etiquetas.iter().cloned().map(Valor::Texto).collect()),
                    ),
                    ("descripcion", Valor::Texto(h.descripcion.clone())),
                    ("etiquetaInvalida", Valor::Bool(h.etiqueta_invalida)),
                ],
            )?;
            self.escribir(&hecho)?;
        }
        Ok(parseo)
    }

    /// REG-017: una ronda nueva con la misma pregunta y la última respuesta de cada proveedor del pool,
    /// copiada y marcada copiadaDe, con sus citas vueltas a derivar del mismo html. La ronda anterior
    /// queda intacta. Las negativas son mensajes, como en la Unity; un error es de escritura.
    pub fn ronda_nueva_con_respuestas_copiadas(&mut self) -> io::Result<String> {
        let pool = self.pool.clone();
        let pool = &strs(&pool)[..];
        let (Some(_), Some(ronda_id)) = (&self.conversacion_actual, self.ronda_actual.clone())
        else {
            return Ok("No hay una ronda activa de la que copiar.".into());
        };
        let leido = self.leer_registro()?;
        let id = Texto::from(ronda_id.as_str());
        let Some(anterior) = leido
            .hechos
            .iter()
            .find(|h| h.tipo() == "ronda" && h.texto("id") == Some(&id))
        else {
            return Ok("No se encontró la ronda activa en el registro.".into());
        };
        let Some(pregunta) = dominio::pregunta_efectiva_de_ronda(&leido.hechos, anterior) else {
            return Ok(
                "La ronda activa no tiene una pregunta registrada válida: no se puede repetir."
                    .into(),
            );
        };
        // UltimaPorProveedor: la última de cada proveedor, en el orden de su primera captura.
        let mut ultimas: Vec<&Hecho> = Vec::new();
        for r in leido.hechos.iter().filter(|h| {
            h.tipo() == "respuesta"
                && h.texto("rondaId") == Some(&id)
                && h.texto("proveedorId")
                    .and_then(Texto::como_str)
                    .is_some_and(|p| pool.contains(&p))
        }) {
            match ultimas
                .iter_mut()
                .find(|u| u.texto("proveedorId") == r.texto("proveedorId"))
            {
                Some(u) => *u = r,
                None => ultimas.push(r),
            }
        }
        if ultimas.is_empty() {
            return Ok("La ronda activa no tiene respuestas del pool para copiar.".into());
        }
        let nueva = self.abrir_ronda(pregunta.clone())?;
        for r in &ultimas {
            let copia_id = (self.nuevo_id)();
            let mut campos: Vec<(&str, Valor)> = [
                "proveedorId",
                "textoOriginal",
                "leidaEn",
                "error",
                "procedencia",
                "promptUsuarioLeido",
                "promptCoincideEnPool",
                "fuentesHref",
                "html",
            ]
            .into_iter()
            .map(|k| (k, r.valor(k).clone()))
            .collect();
            campos.extend([
                ("id", Valor::Texto(copia_id.as_str().into())),
                ("rondaId", Valor::Texto(nueva.as_str().into())),
                (
                    "copiadaDe",
                    Valor::Objeto(vec![
                        ("rondaId".into(), r.valor("rondaId").clone()),
                        ("respuestaId".into(), r.valor("id").clone()),
                    ]),
                ),
            ]);
            self.escribir(&Hecho::nuevo("respuesta", &campos)?)?;
            if let Some(html) = r.texto("html") {
                let nuevo_id = &mut self.nuevo_id;
                let citas = parseos::extraer_citas(html, &copia_id, &mut || nuevo_id())?;
                for c in &citas.citas {
                    self.escribir(c)?;
                }
            }
        }
        Ok(format!(
            "Ronda nueva abierta ({}) con {} respuestas copiadas de la ronda {}. Recaptura con \"Capturar este panel\" lo que quieras corregir.",
            corto(&nueva),
            ultimas.len(),
            corto(&ronda_id)
        ))
    }

    /// OPE-016: reutilizar la operación de un operador desde la ronda de la que se copiaron las
    /// respuestas. Solo vale si todo lo que ese operador lee (el pool menos la suya) son copias sin
    /// cambios; los hallazgos se vuelven a derivar contra el sello de esta ronda.
    pub fn reutilizar_operacion(&mut self, operador_id: &str) -> io::Result<(bool, String)> {
        let pool = self.pool.clone();
        let pool = &strs(&pool)[..];
        let (Some(_), Some(ronda_id)) = (&self.conversacion_actual, self.ronda_actual.clone())
        else {
            return Ok((false, "no hay una ronda activa".into()));
        };
        let nombre = dominio::nombre_proveedor(operador_id);
        if !pool.contains(&operador_id) {
            return Ok((false, format!("\"{nombre}\" no es un operador del pool.")));
        }
        let leido = self.leer_registro()?;
        let id = Texto::from(ronda_id.as_str());
        let sello: Vec<&Hecho> = leido
            .hechos
            .iter()
            .filter(|h| h.tipo() == "sello" && h.texto("rondaId") == Some(&id))
            .collect();
        if sello.is_empty() {
            return Ok((
                false,
                "Esta ronda todavía no tiene sello: pega primero la operación en algún panel («Pegar la operación aquí»).".into(),
            ));
        }
        let mut vigentes: HashMap<&str, &Hecho> = HashMap::new();
        for r in leido
            .hechos
            .iter()
            .filter(|h| h.tipo() == "respuesta" && h.texto("rondaId") == Some(&id))
        {
            if let Some(p) = r.texto("proveedorId").and_then(Texto::como_str) {
                vigentes.insert(p, r);
            }
        }
        let leidas: Vec<&str> = pool.iter().copied().filter(|p| *p != operador_id).collect();
        let copia = |p: &str| {
            vigentes
                .get(p)
                .map(|r| r.valor("copiadaDe"))
                .filter(|c| **c != Valor::Nulo)
        };
        let cambiadas: Vec<String> = leidas
            .iter()
            .filter(|p| copia(p).is_none())
            .map(|p| dominio::nombre_proveedor(p))
            .collect();
        if !cambiadas.is_empty() {
            return Ok((
                false,
                format!(
                    "No se puede reutilizar: {nombre} lee respuestas que cambiaron en esta ronda ({}). Tiene que operar de nuevo.",
                    cambiadas.join(", ")
                ),
            ));
        }
        let mut origenes: Vec<&Valor> = Vec::new();
        for p in &leidas {
            let Some(Valor::Objeto(c)) = copia(p) else {
                continue;
            };
            let o = c
                .iter()
                .find(|(k, _)| k.como_str() == Some("rondaId"))
                .map_or(&Valor::Nulo, |(_, v)| v);
            if !origenes.contains(&o) {
                origenes.push(o);
            }
        }
        if origenes.len() != 1 {
            return Ok((
                false,
                format!(
                    "Las respuestas copiadas vienen de {} rondas distintas: no hay una operación anterior equivalente.",
                    origenes.len()
                ),
            ));
        }
        let origen = origenes[0].clone();
        let origen_corto = match &origen {
            Valor::Texto(t) => corto(&t.para_mostrar()),
            _ => String::new(),
        };
        let Some(vieja) = leido.hechos.iter().rev().find(|h| {
            h.tipo() == "salida-operador"
                && h.valor("rondaId") == &origen
                && h.texto("operadorId").and_then(Texto::como_str) == Some(operador_id)
        }) else {
            return Ok((
                false,
                format!("No hay una operación de {nombre} en la ronda {origen_corto}."),
            ));
        };
        let validas =
            dominio::etiquetas_validas_del_operador(operador_id, pool, &sello).map_err(falla)?;
        // ParsearHallazgos de la Unity con salidaCruda null tira: aquí, antes de escribir nada.
        let salida = vieja
            .texto("salidaCruda")
            .cloned()
            .ok_or_else(|| falla("la operación anterior no tiene salidaCruda"))?;
        let copiada_de = Valor::Objeto(vec![
            ("rondaId".into(), origen.clone()),
            ("salidaOperadorId".into(), vieja.valor("id").clone()),
        ]);
        let hallazgos = self.procesar_salida_operador(
            &ronda_id,
            operador_id,
            vieja.valor("promptCompleto").clone(),
            &salida,
            vieja.valor("html").clone(),
            &validas,
            Some(copiada_de),
        )?;
        let invalidas = hallazgos
            .hallazgos
            .iter()
            .filter(|h| h.etiqueta_invalida)
            .count();
        let extra = if invalidas > 0 {
            format!(", {invalidas} con etiqueta inválida")
        } else {
            String::new()
        };
        Ok((
            true,
            format!(
                "{nombre}: se reutilizó su operación de la ronda {origen_corto} ({} hallazgos{extra}). No hace falta pegarle la operación de nuevo.",
                hallazgos.hallazgos.len()
            ),
        ))
    }
}

/// El contexto de cada lectura al capturar: la continuidad y el panel de ese proveedor.
pub type Contexto<'a> = &'a dyn Fn(&str) -> (Option<String>, Option<String>);

fn es_de(h: &Hecho, tipo: &str, ronda: &Texto) -> bool {
    h.tipo() == tipo && h.texto("rondaId") == Some(ronda)
}

fn sin_formato_de_verificacion(l: &Lectura) -> io::Result<Option<&'static str>> {
    let texto = parseos::texto_de_la_salida_verificador(&l.text, l.html.as_ref())?;
    Ok(parseos::parsear_verificacion::<&str>(&texto, &[])
        .correspondencias
        .is_empty()
        .then_some("la respuesta no trae ninguna línea de verificación en el formato pedido (¿investigación profunda?): repite la verificación de este panel con solo búsqueda web"))
}

impl Puerta {
    /// CAP-001 a CAP-006 (RegistrarCapturas): guarda un lote de lecturas según la etapa de la ronda,
    /// que dice el registro y nunca el contenido del panel. Sin ronda abierta abre una con el
    /// marcador: lo que está en pantalla se guarda igual. Una lectura por debajo del umbral nunca se
    /// guarda como respuesta buena. Devuelve la etapa y el aviso de los prompts.
    pub fn registrar_capturas(
        &mut self,
        lecturas_crudas: &[Lectura],
        contexto: Contexto,
    ) -> io::Result<(&'static str, String)> {
        let lecturas: Vec<Lectura> = lecturas_crudas
            .iter()
            .map(|l| {
                let largo = l.text.largo_utf16();
                if largo < UMBRAL_LECTURA_MINIMO && l.fallo().is_none() {
                    l.con_error(format!("lectura por debajo del umbral ({largo} de {UMBRAL_LECTURA_MINIMO} caracteres): no genero una respuesta observable, no se guarda como valida"))
                } else {
                    l.clone()
                }
            })
            .collect();
        if self.ronda_actual.is_none() {
            self.abrir_ronda(PROMPT_SIN_RONDA)?;
        }
        let ronda_id = self.ronda_actual.clone().unwrap_or_default();
        let id = Texto::from(ronda_id.as_str());
        let leido = self.leer_registro()?;
        let hechos = &leido.hechos;
        let etapa = dominio::etapa_de_ronda(hechos, &id, self.pool.len());
        let sello: Vec<&Hecho> = hechos.iter().filter(|h| es_de(h, "sello", &id)).collect();
        let pool = self.pool.clone();
        let pool = strs(&pool);
        let roles = self.roles.clone();
        let verificadores = roles.verificadores();
        let c = dominio::clasificar_lecturas_por_etapa(
            &lecturas,
            |l| l.id.as_str(),
            etapa,
            &pool,
            &roles.integrador,
            &verificadores,
            &roles.redactor,
        );
        let (mut como_respuesta, mut operacion) = (c.como_respuesta, c.operacion);
        // Sin sello la operación no está armada: capturar a un investigador recaptura su respuesta (la última gana).
        let recaptura = etapa == "operacion" && sello.is_empty();
        if recaptura {
            como_respuesta.append(&mut operacion);
        }
        if !como_respuesta.is_empty() {
            self.escribir_respuestas(&ronda_id, &como_respuesta, contexto)?;
        }
        if etapa == "investigacion" || recaptura {
            for l in &como_respuesta {
                if l.fallo().is_none() && l.text.largo_utf16() < RESPUESTA_CORTA {
                    self.escribir_error_captura(
                        &ronda_id,
                        etapa,
                        "respuesta",
                        "respuesta sospechosamente corta: puede haber quedado fuera de la captura"
                            .into(),
                        Some(&l.id),
                    )?;
                }
            }
        }
        // Un fallo al capturar una lectura nunca se adivina ni se descarta en silencio: queda como ErrorCaptura.
        for l in operacion.iter().filter(|l| l.fallo().is_none()) {
            match dominio::etiquetas_validas_del_operador(&l.id, &pool, &sello) {
                Err(e) => self.escribir_error_captura(
                    &ronda_id,
                    etapa,
                    "salida-operador",
                    e.into(),
                    None,
                )?,
                Ok(validas) => {
                    let prompt = self
                        .prompt_operador
                        .get(&l.id)
                        .cloned()
                        .unwrap_or_else(|| PROMPT_NO_DISPONIBLE.into());
                    self.procesar_salida_operador(
                        &ronda_id,
                        &l.id,
                        Valor::Texto(prompt),
                        &l.text,
                        opcional(l.html.as_ref()),
                        &validas,
                        None,
                    )?;
                }
            }
        }
        let no_disponible = || Valor::Texto(PROMPT_NO_DISPONIBLE.into());
        match etapa {
            "integracion" => {
                let prompt = self
                    .prompt_integrador
                    .clone()
                    .map_or_else(no_disponible, Valor::Texto);
                self.rol(
                    &ronda_id,
                    etapa,
                    c.integrador,
                    ("informe-integrador", "integrador", &roles.integrador),
                    |s, l| s.escribir_informe_integrador(&ronda_id, l, prompt),
                )?;
            }
            "verificacion" => {
                for (v, lectura) in verificadores.iter().zip(c.verificadores) {
                    let sin_formato = match lectura {
                        Some(l) if l.fallo().is_none() => {
                            sin_formato_de_verificacion(l)?.map(|e| l.con_error(e))
                        }
                        _ => None,
                    };
                    let prompt = self
                        .prompt_verificador
                        .clone()
                        .map_or_else(no_disponible, Valor::Texto);
                    self.rol(
                        &ronda_id,
                        etapa,
                        sin_formato.as_ref().or(lectura),
                        ("salida-verificador", "verificador", v),
                        |s, l| s.escribir_salida_verificador(&ronda_id, l, prompt),
                    )?;
                }
            }
            "redaccion" => {
                let previo = hechos
                    .iter()
                    .rev()
                    .find(|h| es_de(h, "respuesta-redactor", &id));
                self.rol(
                    &ronda_id,
                    etapa,
                    c.redactor,
                    ("respuesta-redactor", "redactor", &roles.redactor),
                    |s, l| s.escribir_respuesta_redactor(&ronda_id, l, previo),
                )?;
            }
            _ => {}
        }
        Ok((
            etapa,
            aviso_prompts_de_captura(lecturas.iter().map(|l| l.user_text.as_ref()), etapa),
        ))
    }

    /// La captura de un rol: sin su panel o con la lectura fallida queda un ErrorCaptura.
    /// `quien` es (tipo de captura, nombre del rol, id del proveedor).
    fn rol(
        &mut self,
        ronda_id: &str,
        etapa: &str,
        lectura: Option<&Lectura>,
        (tipo, nombre_rol, id): (&str, &str, &str),
        escribir: impl FnOnce(&mut Self, &Lectura) -> io::Result<()>,
    ) -> io::Result<()> {
        match lectura {
            None => self.escribir_error_captura(
                ronda_id,
                etapa,
                tipo,
                format!("el panel del {nombre_rol} ({id}) no estaba abierto al capturar").into(),
                Some(id),
            ),
            Some(l) => match l.fallo() {
                Some(e) => {
                    self.escribir_error_captura(ronda_id, etapa, tipo, e.clone(), Some(&l.id))
                }
                None => escribir(self, l),
            },
        }
    }

    fn escribir_respuestas(
        &mut self,
        ronda_id: &str,
        lecturas: &[&Lectura],
        contexto: Contexto,
    ) -> io::Result<()> {
        let ahora = self.ahora();
        let coincide = prompt_coincide_en_pool(lecturas.iter().map(|l| l.user_text.as_ref()));
        for l in lecturas {
            let (continuidad, panel) = contexto(&l.id);
            // metodoEscritura null: la escritura no informa con qué método entró el texto, y afirmarlo sería simular un dato.
            let procedencia = dominio::derivar_procedencia(
                l.model_label.as_ref(),
                l.completion_kind.as_deref(),
                l.quiescence_ms,
                l.generating,
                &ahora,
                continuidad.as_deref(),
                None,
                panel.as_deref(),
            );
            let respuesta_id = (self.nuevo_id)();
            let h = Hecho::nuevo(
                "respuesta",
                &[
                    ("id", Valor::Texto(respuesta_id.as_str().into())),
                    ("rondaId", Valor::Texto(ronda_id.into())),
                    ("proveedorId", Valor::Texto(l.id.as_str().into())),
                    ("textoOriginal", Valor::Texto(l.text.clone())),
                    ("leidaEn", Valor::Texto(ahora.as_str().into())),
                    ("error", opcional(l.error.as_ref())),
                    ("procedencia", procedencia),
                    ("promptUsuarioLeido", opcional(l.user_text.as_ref())),
                    (
                        "promptCoincideEnPool",
                        coincide.map_or(Valor::Nulo, Valor::Bool),
                    ),
                    (
                        "fuentesHref",
                        l.fuentes_href.map_or(Valor::Nulo, Valor::Entero),
                    ),
                    ("html", opcional(l.html.as_ref())),
                ],
            )?;
            self.escribir(&h)?;
            // Las citas se derivan del html en la misma escritura: si la regla cambia, se re-derivan sin tocar la Respuesta.
            if let Some(html) = &l.html {
                let nuevo_id = &mut self.nuevo_id;
                let citas = parseos::extraer_citas(html, &respuesta_id, &mut || nuevo_id())?;
                for c in &citas.citas {
                    self.escribir(c)?;
                }
            }
        }
        Ok(())
    }

    fn escribir_error_captura(
        &mut self,
        ronda_id: &str,
        etapa: &str,
        tipo: &str,
        detalle: Texto,
        proveedor_id: Option<&str>,
    ) -> io::Result<()> {
        let h = Hecho::nuevo(
            "error-captura",
            &[
                ("id", Valor::Texto((self.nuevo_id)().into())),
                ("rondaId", Valor::Texto(ronda_id.into())),
                ("etapaEsperada", Valor::Texto(etapa.into())),
                ("tipoCapturaIntentado", Valor::Texto(tipo.into())),
                (
                    "proveedorId",
                    proveedor_id
                        .filter(|p| !p.is_empty())
                        .map_or(Valor::Nulo, |p| Valor::Texto(p.into())),
                ),
                ("detalle", Valor::Texto(detalle)),
                ("ocurridoEn", Valor::Texto(self.ahora().into())),
            ],
        )?;
        self.escribir(&h)
    }

    fn escribir_informe_integrador(
        &mut self,
        ronda_id: &str,
        l: &Lectura,
        prompt: Valor,
    ) -> io::Result<()> {
        let id = (self.nuevo_id)();
        let titulo = parseos::extraer_titulo_del_informe(&parseos::texto_del_informe_integrador(
            &l.text,
            l.html.as_ref(),
        )?)
        .0;
        let h = Hecho::nuevo(
            "informe-integrador",
            &[
                ("id", Valor::Texto(id.into())),
                ("rondaId", Valor::Texto(ronda_id.into())),
                ("operadorId", Valor::Texto(l.id.as_str().into())),
                ("promptCompleto", prompt),
                ("informeCrudo", Valor::Texto(l.text.clone())),
                ("titulo", opcional(titulo.as_ref())),
                ("recibidaEn", Valor::Texto(self.ahora().into())),
                ("html", opcional(l.html.as_ref())),
            ],
        )?;
        self.escribir(&h)
    }

    fn escribir_salida_verificador(
        &mut self,
        ronda_id: &str,
        l: &Lectura,
        prompt: Valor,
    ) -> io::Result<()> {
        let h = Hecho::nuevo(
            "salida-verificador",
            &[
                ("id", Valor::Texto((self.nuevo_id)().into())),
                ("rondaId", Valor::Texto(ronda_id.into())),
                ("verificadorId", Valor::Texto(l.id.as_str().into())),
                ("promptCompleto", prompt),
                ("salidaCruda", Valor::Texto(l.text.clone())),
                ("recibidaEn", Valor::Texto(self.ahora().into())),
                ("html", opcional(l.html.as_ref())),
            ],
        )?;
        self.escribir(&h)
    }

    /// Las marcas y el prompt pegados en este proceso, o los de la redacción anterior si la app se
    /// reinició.
    fn escribir_respuesta_redactor(
        &mut self,
        ronda_id: &str,
        l: &Lectura,
        previo: Option<&Hecho>,
    ) -> io::Result<()> {
        let no_vacia = |k: &str| {
            previo
                .and_then(|p| p.texto(k))
                .filter(|t| !t.bytes().is_empty())
                .cloned()
        };
        let (primera, ultima) = match &self.marcas_redactor {
            Some((a, b)) => (
                Valor::Texto(a.as_str().into()),
                Valor::Texto(b.as_str().into()),
            ),
            None => match (no_vacia("marcaPrimera"), no_vacia("marcaUltima")) {
                (Some(a), Some(b)) => (Valor::Texto(a), Valor::Texto(b)),
                _ => (Valor::Nulo, Valor::Nulo),
            },
        };
        let prompt = self
            .prompt_redactor
            .clone()
            .or_else(|| previo.and_then(|p| p.texto("promptCompleto")).cloned())
            .unwrap_or_else(|| PROMPT_NO_DISPONIBLE.into());
        let sello = match &self.sello_verificaciones {
            Some(s) => Valor::Lista(
                s.iter()
                    .map(|(e, v)| {
                        Valor::Objeto(vec![
                            ("etiqueta".into(), Valor::Texto(e.as_str().into())),
                            ("verificadorId".into(), Valor::Texto(v.as_str().into())),
                        ])
                    })
                    .collect(),
            ),
            None => previo.map_or(Valor::Nulo, |p| p.valor("selloVerificaciones").clone()),
        };
        let h = Hecho::nuevo(
            "respuesta-redactor",
            &[
                ("id", Valor::Texto((self.nuevo_id)().into())),
                ("rondaId", Valor::Texto(ronda_id.into())),
                ("redactorId", Valor::Texto(l.id.as_str().into())),
                ("promptCompleto", Valor::Texto(prompt)),
                ("textoCrudo", Valor::Texto(l.text.clone())),
                ("html", opcional(l.html.as_ref())),
                ("marcaPrimera", primera),
                ("marcaUltima", ultima),
                ("selloVerificaciones", sello),
                ("recibidaEn", Valor::Texto(self.ahora().into())),
            ],
        )?;
        self.escribir(&h)
    }

    /// OPE-014: la operación de la ronda ya se armó (hay sello): desde ahí capturar a un operador
    /// registra su operación.
    pub fn operacion_armada(&mut self) -> io::Result<bool> {
        let Some(ronda) = self.ronda_actual.clone() else {
            return Ok(false);
        };
        let id = Texto::from(ronda.as_str());
        Ok(self
            .leer_registro()?
            .hechos
            .iter()
            .any(|h| es_de(h, "sello", &id)))
    }

    /// La operación quedó pegada en su panel: lo que ese operador devuelva se registra con este prompt.
    pub fn operacion_pegada(&mut self, operacion: &Operacion) {
        self.prompt_operador.insert(
            operacion.operador_id.clone(),
            operacion.prompt_completo.clone(),
        );
    }

    pub fn integrador_pegado(&mut self, prompt: Texto) {
        self.prompt_integrador = Some(prompt);
    }

    pub fn verificador_pegado(&mut self, prompt: Texto) {
        self.prompt_verificador = Some(prompt);
    }

    pub fn redactor_pegado(&mut self, archivo: &ArchivoRedactor) {
        self.prompt_redactor = Some(archivo.prompt_completo.clone());
        self.marcas_redactor = Some((archivo.marca_primera.clone(), archivo.marca_ultima.clone()));
        self.sello_verificaciones = Some(archivo.sello_verificaciones.clone());
    }

    /// INT-005, VER-005: recapturar el integrador o el verificador sin mirar la etapa. Agrega un
    /// hecho; el registro no se reescribe y todo usa el último de la ronda.
    pub fn recapturar(&mut self, rol: &str, lectura: &Lectura) -> io::Result<(bool, String)> {
        let (Some(_), Some(ronda_id)) = (&self.conversacion_actual, self.ronda_actual.clone())
        else {
            return Ok((false, "no hay una ronda activa".into()));
        };
        let leido = self.leer_registro()?;
        let tipo = match rol {
            "integrador" => "informe-integrador",
            "verificador" => "salida-verificador",
            _ => return Err(falla(format!("no se recaptura el rol \"{rol}\""))),
        };
        let largo = lectura.text.largo_utf16();
        // Una lectura fallida o bajo el umbral nunca reemplaza a la buena: queda como ErrorCaptura, y el último bueno sigue siendo el que vale.
        let error: Option<Texto> = match lectura.fallo() {
            Some(e) => Some(e.clone()),
            None if largo < UMBRAL_LECTURA_MINIMO => Some(
                format!(
                    "lectura por debajo del umbral ({largo} de {UMBRAL_LECTURA_MINIMO} caracteres)"
                )
                .into(),
            ),
            None if rol == "verificador" => sin_formato_de_verificacion(lectura)?.map(Texto::from),
            None => None,
        };
        let id = Texto::from(ronda_id.as_str());
        let nombre = dominio::nombre_proveedor(&lectura.id);
        if let Some(e) = error {
            let etapa = dominio::etapa_de_ronda(&leido.hechos, &id, self.pool.len());
            let mensaje = format!("{nombre}: el {rol} no se recapturó ({})", e.para_mostrar());
            self.escribir_error_captura(&ronda_id, etapa, tipo, e, Some(&lectura.id))?;
            return Ok((false, mensaje));
        }
        let previos: Vec<&Hecho> = leido
            .hechos
            .iter()
            .filter(|h| es_de(h, tipo, &id))
            .collect();
        let Some(ultimo) = previos.last() else {
            return Ok((
                false,
                if rol == "integrador" {
                    "No hay un informe de integrador en esta ronda todavía. Usa \"Pegar integrador\"."
                } else {
                    "No hay una verificación en esta ronda todavía. Usa \"Pegar verificación\"."
                }
                .into(),
            ));
        };
        let pegado = if rol == "integrador" {
            &self.prompt_integrador
        } else {
            &self.prompt_verificador
        };
        let prompt = pegado
            .clone()
            .map_or_else(|| ultimo.valor("promptCompleto").clone(), Valor::Texto);
        if rol == "integrador" {
            self.escribir_informe_integrador(&ronda_id, lectura, prompt)?;
        } else {
            self.escribir_salida_verificador(&ronda_id, lectura, prompt)?;
        }
        Ok((
            true,
            format!(
                "{nombre}: {rol} recapturado, {largo} caracteres ({} en el registro; se usa el último)",
                previos.len() + 1
            ),
        ))
    }

    /// REG-012: la pregunta real de una ronda capturada sin envío. La Ronda no se reescribe: se
    /// agrega este hecho aparte, declarado por el usuario.
    pub fn declarar_pregunta(&mut self, texto: impl Into<Texto>) -> io::Result<Hecho> {
        let ronda_id = self
            .ronda_actual
            .clone()
            .ok_or_else(|| falla("no hay una ronda activa a la que declararle la pregunta"))?;
        let h = Hecho::nuevo(
            "pregunta-declarada",
            &[
                ("id", Valor::Texto((self.nuevo_id)().into())),
                ("rondaId", Valor::Texto(ronda_id.into())),
                ("texto", Valor::Texto(texto.into())),
                ("declaradaEn", Valor::Texto(self.ahora().into())),
            ],
        )?;
        self.escribir(&h)?;
        Ok(h)
    }

    /// RON-003 (PasoSiguiente): el único paso siguiente, que sale del registro y de lo pegado en
    /// esta sesión; nunca de la interfaz.
    pub fn paso_siguiente(&mut self) -> io::Result<Paso> {
        let (Some(_), Some(ronda_id)) = (&self.conversacion_actual, self.ronda_actual.clone())
        else {
            return Ok(paso(
                "pregunta",
                "pegar-pregunta",
                "Pegar la pregunta en los paneles",
            ));
        };
        let leido = self.leer_registro()?;
        let hechos = &leido.hechos;
        let id = Texto::from(ronda_id.as_str());
        let de = |tipo: &'static str, campo: &'static str| {
            hechos
                .iter()
                .filter(move |h| es_de(h, tipo, &id))
                .filter_map(move |h| h.texto(campo).and_then(Texto::como_str))
        };
        Ok(
            match dominio::etapa_de_ronda(hechos, &Texto::from(ronda_id.as_str()), self.pool.len())
            {
                "investigacion" => {
                    // Solo una respuesta válida completa al operador: una captura con error (0 caracteres) no cuenta.
                    let capturados: HashSet<&str> = hechos
                        .iter()
                        .filter(|h| {
                            es_de(h, "respuesta", &Texto::from(ronda_id.as_str()))
                                && h.texto("error").is_none_or(|e| e.bytes().is_empty())
                        })
                        .filter_map(|h| h.texto("proveedorId").and_then(Texto::como_str))
                        .collect();
                    let ronda = hechos.iter().find(|h| {
                        h.tipo() == "ronda"
                            && h.texto("id") == Some(&Texto::from(ronda_id.as_str()))
                    });
                    if !self.pool.iter().all(|p| capturados.contains(p.as_str())) {
                        paso("investigacion", "capturar", "Capturar los que terminaron")
                    } else if ronda
                        .is_none_or(|r| dominio::pregunta_efectiva_de_ronda(hechos, r).is_none())
                    {
                        paso(
                            "investigacion",
                            "declarar-pregunta",
                            "Declarar la pregunta de esta ronda",
                        )
                    } else {
                        paso(
                            "operacion",
                            "pegar-operacion",
                            "Pegar la operación en los paneles",
                        )
                    }
                }
                "operacion" => {
                    let con_salida: HashSet<&str> = de("salida-operador", "operadorId").collect();
                    let falta_pegar = self.pool.iter().any(|op| {
                        !con_salida.contains(op.as_str()) && !self.prompt_operador.contains_key(op)
                    });
                    if falta_pegar {
                        paso(
                            "operacion",
                            "pegar-operacion",
                            "Pegar la operación en los paneles",
                        )
                    } else {
                        paso("operacion", "capturar", "Capturar los que terminaron")
                    }
                }
                "integracion" if self.prompt_integrador.is_none() => paso(
                    "integracion",
                    "pegar-integrador",
                    "Pegar el prompt del integrador",
                ),
                "integracion" => paso(
                    "integracion",
                    "capturar",
                    "Capturar el informe del integrador",
                ),
                "verificacion" if self.prompt_verificador.is_none() => paso(
                    "verificacion",
                    "pegar-verificacion",
                    "Pegar el prompt del verificador",
                ),
                "verificacion" => paso("verificacion", "capturar", "Capturar la verificación"),
                _ if de("respuesta-redactor", "id").next().is_some() => {
                    if self.carpeta_informe_armado().is_some() {
                        paso("informe", "abrir-carpeta", "Abrir carpeta")
                    } else {
                        paso("informe", "armar-informe", "Armar el informe")
                    }
                }
                _ if self.prompt_redactor.is_none() => paso(
                    "redaccion",
                    "pegar-redactor",
                    "Pegar el prompt y el archivo del redactor",
                ),
                _ => paso(
                    "redaccion",
                    "capturar",
                    "Capturar la respuesta del redactor",
                ),
            },
        )
    }

    /// RON-004 (EstadoDePanel): el estado de un panel en la etapa actual. Lo que dice la página
    /// (generando, cómo se supo el fin) entra como parámetro; lo demás sale del registro y de lo
    /// pegado en esta sesión.
    pub fn estado_de_panel(
        &mut self,
        proveedor_id: &str,
        generando: Option<bool>,
        fin: Option<&str>,
    ) -> io::Result<&'static str> {
        let (Some(_), Some(ronda_id)) = (&self.conversacion_actual, self.ronda_actual.clone())
        else {
            return Ok("por-pegar");
        };
        let leido = self.leer_registro()?;
        let hechos = &leido.hechos;
        let id = Texto::from(ronda_id.as_str());
        let mut etapa = dominio::etapa_de_ronda(hechos, &id, self.pool.len());
        // Con la investigación completa el paso ya es la operación, aunque el registro no tenga todavía sello:
        // sin esto, cada operador seguía "capturado" por su respuesta y no había nada que pegar.
        if etapa == "investigacion" && self.paso_siguiente()?.etapa == "operacion" {
            etapa = "operacion";
        }
        let suyo = |h: &Hecho, tipo: &str, campo: &str| {
            es_de(h, tipo, &id) && h.texto(campo).and_then(Texto::como_str) == Some(proveedor_id)
        };
        let hay = |tipo: &str, campo: &str| hechos.iter().any(|h| suyo(h, tipo, campo));
        let (capturado, problema, pegado) = match etapa {
            "investigacion" => {
                let ultimo =
                    |tipo: &str| hechos.iter().rev().find(|h| suyo(h, tipo, "proveedorId"));
                let (intento, respuesta) = (ultimo("intento"), ultimo("respuesta"));
                let con_error = |r: &Hecho| r.texto("error").is_some_and(|e| !e.bytes().is_empty());
                let ok = |i: &Hecho| i.valor("ok") == &Valor::Bool(true);
                (
                    respuesta.is_some_and(|r| !con_error(r)),
                    respuesta.map_or(intento.is_some_and(|i| !ok(i)), con_error),
                    intento.is_some_and(ok),
                )
            }
            "operacion" => (
                hay("salida-operador", "operadorId"),
                false,
                self.prompt_operador.contains_key(proveedor_id),
            ),
            _ => {
                let de_la_etapa = self.roles.de_la_etapa(etapa).contains(&proveedor_id);
                // T22: quien no es el rol de esta etapa ya terminó lo suyo (un operador o un rol anterior): capturado si dejó su hecho.
                let capturado = if de_la_etapa {
                    etapa == "redaccion" && hay("respuesta-redactor", "redactorId")
                } else {
                    hay("salida-operador", "operadorId")
                        || hay("informe-integrador", "operadorId")
                        || hay("salida-verificador", "verificadorId")
                };
                let problema = hechos.iter().any(|h| {
                    suyo(h, "error-captura", "proveedorId")
                        && h.texto("etapaEsperada").and_then(Texto::como_str) == Some(etapa)
                });
                let pegado = de_la_etapa
                    && match etapa {
                        "integracion" => self.prompt_integrador.is_some(),
                        "verificacion" => self.prompt_verificador.is_some(),
                        _ => self.prompt_redactor.is_some(),
                    };
                (capturado, problema, pegado)
            }
        };
        Ok(if capturado {
            "capturado"
        } else if problema {
            "con-problema"
        } else if generando == Some(true) {
            "respondiendo"
        } else if pegado && fin == Some("observado") {
            "parece-terminado-observado"
        } else if pegado && fin == Some("deducido") {
            "parece-terminado-deducido"
        } else if pegado {
            "pegado-falta-enviar"
        } else {
            "por-pegar"
        })
    }
}

// El mismo prompt, no el mismo byte: espacios de más y mayúsculas no son la señal.
fn normalizar_prompt(t: &Texto) -> Vec<u16> {
    let u = t.a_utf16();
    let mut plano = Vec::with_capacity(u.len());
    let mut previo_blanco = false;
    for &c in parseos::trim(&u) {
        let blanco = char::from_u32(c as u32).is_some_and(registro::es_blanco);
        if !blanco {
            plano.push(c);
        } else if !previo_blanco {
            plano.push(b' ' as u16);
        }
        previo_blanco = blanco;
    }
    operacion::minusculas(&plano)
}

/// true si todos los prompts leídos son el mismo; false si hay dos distintos; None si hay menos de dos.
fn prompt_coincide_en_pool<'a>(prompts: impl Iterator<Item = Option<&'a Texto>>) -> Option<bool> {
    // Sin espacios y por contención: cada sitio agrega su texto ("Tú dijiste", "…Mostrar más") o pierde saltos (ronda 417be423).
    let sin: Vec<Vec<u16>> = prompts
        .flatten()
        .filter(|t| !t.bytes().is_empty())
        .map(|t| {
            let mut n = normalizar_prompt(t);
            n.retain(|&c| c != b' ' as u16);
            n
        })
        .collect();
    if sin.len() < 2 {
        return None;
    }
    let corto = sin.iter().min_by_key(|t| t.len())?;
    Some(
        sin.iter()
            .all(|t| corto.is_empty() || t.windows(corto.len()).any(|w| w == &corto[..])),
    )
}

/// CAP-008 (AvisoPromptsDeCaptura): el aviso de "Capturar" sobre si los prompts coinciden. Solo en
/// investigación, donde todos reciben la misma pregunta; en operación cada operador recibe a
/// propósito un texto distinto. "" = sin aviso.
pub fn aviso_prompts_de_captura<'a>(
    prompts: impl IntoIterator<Item = Option<&'a Texto>>,
    etapa: &str,
) -> String {
    if etapa != "investigacion" {
        return String::new();
    }
    let con_prompt: Vec<&Texto> = prompts
        .into_iter()
        .flatten()
        .filter(|t| !t.bytes().is_empty())
        .collect();
    if con_prompt.len() < 2 {
        return String::new();
    }
    let distintos = con_prompt
        .iter()
        .map(|t| normalizar_prompt(t))
        .collect::<HashSet<_>>()
        .len();
    if distintos > 1 {
        format!(
            "⚠ Los prompts de usuario capturados NO coinciden entre proveedores ({distintos} versiones distintas) — revisar antes de comparar respuestas."
        )
    } else {
        format!(
            "Prompt de usuario: coincide en los {} proveedores donde se pudo leer.",
            con_prompt.len()
        )
    }
}

/// Corto: los primeros 8 caracteres (unidades UTF-16, como Substring) de un id.
fn corto(id: &str) -> String {
    String::from_utf16_lossy(&id.encode_utf16().take(8).collect::<Vec<u16>>())
}

fn discrepancia_de_sello(persistido: &[&Hecho], calculado: &[EntradaSello]) -> Option<String> {
    if persistido.len() != calculado.len() {
        return Some(format!(
            "el sello persistido tiene {} entradas y el recién calculado tiene {}",
            persistido.len(),
            calculado.len()
        ));
    }
    let por_label: HashMap<&Texto, &Hecho> = persistido
        .iter()
        .filter_map(|s| Some((s.texto("label")?, *s)))
        .collect();
    let ver = |h: &Hecho, k: &str| {
        h.texto(k)
            .map(|t| t.para_mostrar().into_owned())
            .unwrap_or_default()
    };
    for c in calculado {
        let Some(p) = por_label.get(&Texto::from(c.label.as_str())) else {
            return Some(format!(
                "el sello recién calculado tiene la etiqueta \"{}\", que no está en el persistido",
                c.label
            ));
        };
        let igual = |k: &str, v: &Texto| p.texto(k) == Some(v);
        if !igual("codigoEstable", &c.codigo_estable.as_str().into())
            || !igual("panelSourceId", &c.panel_source_id.as_str().into())
            || !igual("replyId", &c.reply_id)
            || !igual("attemptId", &c.attempt_id)
        {
            return Some(format!(
                "la etiqueta \"{}\" no coincide: persistido {{codigoEstable:{}, panelSourceId:{}, replyId:{}, attemptId:{}}} vs calculado {{codigoEstable:{}, panelSourceId:{}, replyId:{}, attemptId:{}}}",
                c.label,
                ver(p, "codigoEstable"),
                ver(p, "panelSourceId"),
                ver(p, "replyId"),
                ver(p, "attemptId"),
                c.codigo_estable,
                c.panel_source_id,
                c.reply_id.para_mostrar(),
                c.attempt_id.para_mostrar()
            ));
        }
    }
    None
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::registro::pruebas::str_de;
    use std::cell::RefCell;
    use std::time::Duration;

    /// Guarda los PDF pedidos; si se le dice, falla en uno (PdfFalso de la Unity).
    #[derive(Default)]
    struct PdfFalso {
        pedidos: RefCell<Vec<(PathBuf, String)>>,
        fallar_en: Option<&'static str>,
    }

    impl Pdf for PdfFalso {
        fn generar(&self, _: &Texto, ruta: &Path, titulo: &str) -> Result<(), String> {
            self.pedidos
                .borrow_mut()
                .push((ruta.to_path_buf(), titulo.to_string()));
            if self
                .fallar_en
                .is_some_and(|f| ruta.to_string_lossy().contains(f))
            {
                return Err("la impresora de prueba falló".into());
            }
            fs::write(ruta, "%PDF falso").map_err(|e| e.to_string())
        }
    }

    fn agregar_lineas(c: &Path, p: &Puerta, lineas: &str) {
        use std::io::Write;
        fs::OpenOptions::new()
            .append(true)
            .open(registro::ruta_archivo(c, p.conversacion_actual().unwrap()))
            .unwrap()
            .write_all(lineas.as_bytes())
            .unwrap();
    }

    const POOL: [&str; 7] = [
        "chatgpt", "gemini", "claude", "grok", "mistral", "kimi", "qwen",
    ];

    struct Carpeta(PathBuf);

    impl Carpeta {
        fn nueva(nombre: &str) -> Carpeta {
            let p = std::env::temp_dir().join(format!("cc-puerta-{nombre}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&p);
            fs::create_dir_all(&p).unwrap();
            Carpeta(p)
        }
    }

    impl Drop for Carpeta {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    /// Ids y reloj fijos, como NuevaPuerta de las pruebas de la Unity: las 12:00 UTC del 2026-10-06.
    fn nueva_puerta(carpeta: &Path) -> Puerta {
        puerta_con_ids_desde(carpeta, 1)
    }

    fn puerta_con_ids_desde(carpeta: &Path, primero: u64) -> Puerta {
        let mut n = primero - 1;
        Puerta::new(
            carpeta.to_path_buf(),
            Box::new(move || {
                n += 1;
                format!("00000000-0000-4000-8000-{n:012}")
            }),
            Box::new(|| UNIX_EPOCH + Duration::from_secs(1_791_288_000)),
            crate::operacion::CONOCIDOS
                .iter()
                .map(|s| s.to_string())
                .collect(),
            RolesElegidos::new("deepseek", "glm", "qwen", "deepseek"),
            pool_puerta(),
        )
    }

    fn lineas(c: &Path, conversacion: &str) -> Vec<u8> {
        fs::read(registro::ruta_archivo(c, conversacion)).unwrap()
    }

    fn agregar(c: &Path, conversacion: &str, tipo: &str, campos: &[(&str, &str)]) {
        let mut v: Vec<(&str, Valor)> = campos
            .iter()
            .map(|(k, x)| (*k, Valor::Texto((*x).into())))
            .collect();
        if tipo == "conversacion" {
            v.push((
                "esPrueba",
                Valor::Bool(campos.iter().any(|(k, x)| *k == "titulo" && *x == "prueba")),
            ));
            v.retain(|(k, _)| *k != "titulo");
        }
        if let Some(i) = campos.iter().find(|(k, _)| *k == "indice") {
            v.retain(|(k, _)| *k != "indice");
            v.push(("indice", Valor::Entero(i.1.parse().unwrap())));
        }
        registro::agregar(c, conversacion, &Hecho::nuevo(tipo, &v).unwrap()).unwrap();
    }

    #[test]
    fn la_hora_se_escribe_como_la_unity() {
        assert_eq!(
            formatear_utc(UNIX_EPOCH + Duration::from_secs(1_791_288_000)),
            "2026-10-06T12:00:00.000Z"
        );
        assert_eq!(
            formatear_utc(UNIX_EPOCH + Duration::from_millis(951_782_400_123)),
            "2000-02-29T00:00:00.123Z"
        );
        assert_eq!(formatear_utc(UNIX_EPOCH), "1970-01-01T00:00:00.000Z");
    }

    #[test]
    fn abrir_ronda_escribe_conversacion_real_ronda_con_semilla_y_cargados() {
        let c = Carpeta::nueva("abrir");
        let mut p = nueva_puerta(&c.0);
        let id = p.abrir_ronda("¿Pregunta?").unwrap();
        assert_eq!(id, "00000000-0000-4000-8000-000000000003");
        let texto = String::from_utf8(lineas(&c.0, p.conversacion_actual().unwrap())).unwrap();
        let esperado = [
            r#"{"tipo":"conversacion","esquema":1,"id":"00000000-0000-4000-8000-000000000001","creadaEn":"2026-10-06T12:00:00.000Z","titulo":null,"esPrueba":false}"#,
            r#"{"tipo":"ronda","esquema":1,"id":"00000000-0000-4000-8000-000000000003","conversacionId":"00000000-0000-4000-8000-000000000001","indice":0,"prompt":"¿Pregunta?","enviadaEn":"2026-10-06T12:00:00.000Z","semilla":"00000000-0000-4000-8000-000000000002"}"#,
            r#"{"tipo":"condicion-proveedores-cargados","esquema":1,"id":"00000000-0000-4000-8000-000000000004","rondaId":"00000000-0000-4000-8000-000000000003","proveedores":["chatgpt","gemini","claude","grok","mistral","glm","kimi","qwen","deepseek","perplexity"],"integrador":"deepseek","registradoEn":"2026-10-06T12:00:00.000Z"}"#,
            "",
        ]
        .join("\n");
        assert_eq!(texto, esperado);
        let hechos = registro::leer(&texto).hechos;
        let r = Texto::from(id.as_str());
        assert_eq!(
            dominio::integrador_de_ronda(&hechos, &r).and_then(Texto::como_str),
            Some("deepseek")
        );
    }

    #[test]
    fn los_intentos_se_registran_tambien_los_fallidos_y_sin_ronda_es_error() {
        let c = Carpeta::nueva("intentos");
        let mut p = nueva_puerta(&c.0);
        assert!(p.registrar_intentos(&[("chatgpt", true, None)]).is_err());
        assert!(
            !c.0.join("conversaciones").exists(),
            "sin ronda no se escribe nada"
        );
        p.abrir_ronda("¿Pregunta?").unwrap();
        let resultados: Vec<(&str, bool, Option<&str>)> = POOL
            .iter()
            .map(|id| match *id {
                "gemini" | "grok" => (*id, false, Some("no se pudo pegar")),
                _ => (*id, true, None),
            })
            .collect();
        p.registrar_intentos(&resultados).unwrap();
        let hechos = registro::leer_archivo(&c.0, p.conversacion_actual().unwrap())
            .unwrap()
            .hechos;
        let intentos: Vec<&Hecho> = hechos.iter().filter(|h| h.tipo() == "intento").collect();
        assert_eq!(intentos.len(), 7);
        assert_eq!(
            intentos
                .iter()
                .filter(|h| h.valor("ok") == &Valor::Bool(false))
                .count(),
            2
        );
        assert_eq!(
            String::from_utf8(intentos[1].a_linea()).unwrap(),
            r#"{"tipo":"intento","esquema":1,"id":"00000000-0000-4000-8000-000000000006","rondaId":"00000000-0000-4000-8000-000000000003","proveedorId":"gemini","ok":false,"error":"no se pudo pegar","enviadoEn":"2026-10-06T12:00:00.000Z"}"#
        );
    }

    #[test]
    fn el_registro_sin_cambios_no_se_vuelve_a_leer() {
        let c = Carpeta::nueva("cache");
        let mut p = nueva_puerta(&c.0);
        p.abrir_ronda("¿Pregunta?").unwrap();
        let primera = p.leer_registro().unwrap();
        assert!(Rc::ptr_eq(&p.leer_registro().unwrap(), &primera));
        let conversacion = p.conversacion_actual().unwrap().to_string();
        let ronda = p.ronda_actual().unwrap().to_string();
        agregar(
            &c.0,
            &conversacion,
            "pregunta-declarada",
            &[
                ("id", "otra"),
                ("rondaId", &ronda),
                ("texto", "x"),
                ("declaradaEn", "y"),
            ],
        );
        let despues = p.leer_registro().unwrap();
        assert!(!Rc::ptr_eq(&despues, &primera));
        assert_eq!(despues.hechos.len(), primera.hechos.len() + 1);
    }

    #[test]
    fn la_ronda_activa_se_restaura_del_registro() {
        let c = Carpeta::nueva("restaurar");
        let conv = |id: &str, creada: &str, prueba: bool, indices: &[i64]| {
            let titulo = if prueba { "prueba" } else { "real" };
            agregar(
                &c.0,
                id,
                "conversacion",
                &[("id", id), ("creadaEn", creada), ("titulo", titulo)],
            );
            for i in indices {
                let rid = format!("{id}-r{i}");
                let idx = i.to_string();
                agregar(
                    &c.0,
                    id,
                    "ronda",
                    &[
                        ("id", &rid),
                        ("conversacionId", id),
                        ("indice", &idx),
                        ("prompt", "p"),
                        ("enviadaEn", creada),
                    ],
                );
            }
        };
        conv("vieja", "2026-10-01T10:00:00.000Z", false, &[0]);
        conv("real", "2026-10-05T10:00:00.000Z", false, &[1, 0]);
        conv("prueba", "2026-10-06T10:00:00.000Z", true, &[0]);
        conv("sin-rondas", "2026-10-06T11:00:00.000Z", false, &[]);
        fs::write(
            c.0.join("conversaciones").join("ilegible.jsonl"),
            "no es json\n",
        )
        .unwrap();
        let antes = archivos_de_conversacion(&c.0)
            .iter()
            .map(|id| lineas(&c.0, id))
            .collect::<Vec<_>>();

        let mut p = nueva_puerta(&c.0);
        p.restaurar_ronda_activa();
        assert_eq!(p.conversacion_actual(), Some("real"));
        assert_eq!(p.ronda_actual(), Some("real-r1"));
        assert_eq!(
            archivos_de_conversacion(&c.0)
                .iter()
                .map(|id| lineas(&c.0, id))
                .collect::<Vec<_>>(),
            antes,
            "restaurar no escribe"
        );

        let nueva = p.abrir_ronda("otra").unwrap();
        let hechos = registro::leer_archivo(&c.0, "real").unwrap().hechos;
        let ronda = hechos
            .iter()
            .find(|h| h.texto("id").and_then(Texto::como_str) == Some(nueva.as_str()))
            .unwrap();
        assert_eq!(ronda.entero("indice"), Some(2));
    }

    #[test]
    fn abandonar_la_ronda_vuelve_a_la_pregunta_sin_tocar_el_registro() {
        let c = Carpeta::nueva("abandonar");
        let mut p = nueva_puerta(&c.0);
        let abandonada = p.abrir_ronda("la primera").unwrap();
        p.registrar_intentos(&[("chatgpt", true, None)]).unwrap();
        let conversacion = p.conversacion_actual().unwrap().to_string();
        let antes = lineas(&c.0, &conversacion);

        p.abandonar_ronda();
        assert_eq!(p.ronda_actual(), None);
        assert_eq!(lineas(&c.0, &conversacion), antes);

        let mut reabierta = nueva_puerta(&c.0);
        reabierta.restaurar_ronda_activa();
        assert_eq!(reabierta.ronda_actual(), Some(abandonada.as_str()));

        let nueva = p.abrir_ronda("la segunda").unwrap();
        assert_eq!(p.conversacion_actual(), Some(conversacion.as_str()));
        let hechos = registro::leer_archivo(&c.0, &conversacion).unwrap().hechos;
        let rondas: Vec<(String, i64)> = hechos
            .iter()
            .filter(|h| h.tipo() == "ronda")
            .map(|h| {
                (
                    h.texto("id").unwrap().para_mostrar().into_owned(),
                    h.entero("indice").unwrap(),
                )
            })
            .collect();
        assert_eq!(rondas, vec![(abandonada, 0), (nueva, 1)]);
    }

    fn crear_informe(c: &Path, nombre: &str, ronda: &str) -> PathBuf {
        let dir = c.join("informes").join(nombre);
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join(format!("{nombre}.md")),
            format!("# Informe\n\nRonda: {ronda}\nmás texto\n"),
        )
        .unwrap();
        dir
    }

    #[test]
    fn las_rondas_anteriores_salen_del_registro_con_su_informe() {
        let c = Carpeta::nueva("anteriores");
        let mut p = nueva_puerta(&c.0);
        assert!(p.rondas_anteriores().is_empty());
        let primera = p.abrir_ronda("¿Primera pregunta?").unwrap();
        let informe = crear_informe(&c.0, "2026-10-06 0900 primera", &primera);
        p.abandonar_ronda();
        let segunda = p.abrir_ronda("¿Segunda pregunta?").unwrap();
        let conversacion = p.conversacion_actual().unwrap().to_string();
        // Un sello en la segunda la lleva a operación; la etapa sale del registro.
        agregar(
            &c.0,
            &conversacion,
            "sello",
            &[("id", "s"), ("rondaId", &segunda)],
        );
        agregar(
            &c.0,
            "prueba",
            "conversacion",
            &[
                ("id", "prueba"),
                ("creadaEn", "2026-10-06T12:00:00.000Z"),
                ("titulo", "prueba"),
            ],
        );
        agregar(
            &c.0,
            "prueba",
            "ronda",
            &[
                ("id", "r-prueba"),
                ("conversacionId", "prueba"),
                ("indice", "0"),
                ("prompt", "no va"),
            ],
        );

        let rondas = p.rondas_anteriores();
        let resumen: Vec<(String, String, &str, Option<PathBuf>)> = rondas
            .iter()
            .map(|r| {
                let s = |t: &Option<Texto>| t.as_ref().unwrap().para_mostrar().into_owned();
                (
                    s(&r.ronda_id),
                    s(&r.pregunta),
                    r.etapa,
                    r.carpeta_informe.clone(),
                )
            })
            .collect();
        assert_eq!(
            resumen,
            vec![
                (segunda, "¿Segunda pregunta?".to_string(), "operacion", None),
                (
                    primera,
                    "¿Primera pregunta?".to_string(),
                    "investigacion",
                    Some(informe)
                ),
            ]
        );
        assert_eq!(
            rondas[1].enviada_en.as_ref().and_then(Texto::como_str),
            Some("2026-10-06T12:00:00.000Z")
        );
    }

    #[cfg(windows)]
    #[test]
    fn un_archivo_ilegible_no_rompe_el_historial() {
        use std::os::windows::fs::OpenOptionsExt;
        let bloquear = |ruta: &Path| {
            fs::OpenOptions::new()
                .read(true)
                .share_mode(0)
                .open(ruta)
                .unwrap()
        };
        let c = Carpeta::nueva("ilegible");
        let mut p = nueva_puerta(&c.0);
        let primera = p.abrir_ronda("¿Primera pregunta?").unwrap();
        let informe = crear_informe(&c.0, "informe-primera", &primera);
        let archivo_primera = registro::ruta_archivo(&c.0, p.conversacion_actual().unwrap());
        agregar(
            &c.0,
            "otra",
            "conversacion",
            &[("id", "otra"), ("creadaEn", "2026-10-07T12:00:00.000Z")],
        );
        agregar(
            &c.0,
            "otra",
            "ronda",
            &[
                ("id", "r-otra"),
                ("conversacionId", "otra"),
                ("indice", "0"),
                ("prompt", "¿Otra?"),
                ("enviadaEn", "2026-10-07T12:00:00.000Z"),
            ],
        );
        let ids = |p: &Puerta| -> Vec<(String, Option<PathBuf>)> {
            p.rondas_anteriores()
                .into_iter()
                .map(|r| {
                    (
                        r.ronda_id.unwrap().para_mostrar().into_owned(),
                        r.carpeta_informe,
                    )
                })
                .collect()
        };

        let md = informe.join("informe-primera.md");
        {
            let _cerrado = bloquear(&md);
            assert_eq!(
                ids(&p),
                vec![("r-otra".into(), None), (primera.clone(), None)]
            );
        }
        {
            let _cerrado = bloquear(&archivo_primera);
            assert_eq!(ids(&p), vec![("r-otra".into(), None)]);
            let mut q = nueva_puerta(&c.0);
            q.restaurar_ronda_activa();
            assert_eq!(q.ronda_actual(), Some("r-otra"));
        }
        // Un editor que guarda el .md con CRLF no lo separa de su ronda.
        let texto = fs::read_to_string(&md).unwrap().replace('\n', "\r\n");
        fs::write(&md, texto).unwrap();
        assert_eq!(
            ids(&p).into_iter().find(|(r, _)| *r == primera).unwrap().1,
            Some(informe)
        );
    }

    #[test]
    fn una_escritura_fallida_no_deja_la_conversacion_a_medias() {
        // revisión PART-003: si el hecho conversacion no se escribió, la conversación no queda vigente.
        let c = Carpeta::nueva("falla");
        fs::write(c.0.join("conversaciones"), "bloquea la carpeta").unwrap();
        let mut p = nueva_puerta(&c.0);
        assert!(p.abrir_ronda("pregunta").is_err());
        fs::remove_file(c.0.join("conversaciones")).unwrap();
        let id = p.abrir_ronda("pregunta").unwrap();
        let mut q = nueva_puerta(&c.0);
        q.restaurar_ronda_activa();
        assert_eq!(q.ronda_actual(), Some(id.as_str()));
        let r = q.leer_registro().unwrap();
        let ronda = r.hechos.iter().find(|h| h.tipo() == "ronda").unwrap();
        assert_eq!(ronda.entero("indice"), Some(0));
    }

    // ------------------------------------------------------------ operación

    const CONVERSACION_CORRIDA: &str = "00000000-0000-4000-8000-000000000001";
    const RONDA_CORRIDA: &str = "00000000-0000-4000-8000-000000000003";

    fn strs_del_vector(nombre: &str) -> Vec<String> {
        use crate::registro::pruebas::{lista, str_de};
        lista(&crate::json::vector(nombre))
            .iter()
            .map(|l| str_de(l).to_string())
            .collect()
    }

    fn lineas_corrida() -> Vec<String> {
        strs_del_vector("CorridaOperacionLineas")
    }

    fn pool_puerta() -> Vec<String> {
        strs_del_vector("PoolPuerta")
    }

    /// El registro de la corrida hasta sus respuestas (líneas 0 a `hasta`), con la puerta en su ronda,
    /// ids desde el 15 y la hora local a −3 h, como NuevaPuerta de la Unity.
    fn puerta_en_corrida(c: &Path, lineas: &[String]) -> Puerta {
        fs::create_dir_all(c.join("conversaciones")).unwrap();
        let mut texto = lineas.join("\n");
        texto.push('\n');
        fs::write(registro::ruta_archivo(c, CONVERSACION_CORRIDA), texto).unwrap();
        let mut p = puerta_con_ids_desde(c, 15);
        p.desfase_local = |_| -3 * 3600;
        p.restaurar_ronda_activa();
        assert_eq!(p.ronda_actual(), Some(RONDA_CORRIDA));
        p
    }

    #[test]
    fn operacion_la_corrida_de_la_unity_da_los_mismos_sellos_y_prompts() {
        let c = Carpeta::nueva("operacion-corrida");
        let todas = lineas_corrida();
        let pool = pool_puerta();
        let pool: Vec<&str> = pool.iter().map(String::as_str).collect();
        let mut p = puerta_en_corrida(&c.0, &todas[..=12]);
        let mut operaciones = Vec::new();
        for op in &pool {
            operaciones.push(p.armar_operacion(op, *op == "kimi").unwrap());
        }
        let escritas: Vec<String> = String::from_utf8(lineas(&c.0, CONVERSACION_CORRIDA))
            .unwrap()
            .lines()
            .map(String::from)
            .collect();
        assert_eq!(
            escritas.len(),
            20,
            "solo la primera operación escribe el sello"
        );
        assert_eq!(
            escritas[13..20],
            todas[13..20],
            "los siete sellos, byte a byte"
        );
        let hechos = registro::leer(&format!("{}\n", todas.join("\n"))).hechos;
        let es = |h: &Hecho, k: &str, v: &str| h.texto(k).and_then(Texto::como_str) == Some(v);
        for o in &operaciones {
            let salida = hechos
                .iter()
                .find(|h| {
                    h.tipo() == "salida-operador"
                        && es(h, "rondaId", RONDA_CORRIDA)
                        && es(h, "operadorId", &o.operador_id)
                })
                .unwrap();
            assert_eq!(
                Some(&o.prompt_completo),
                salida.texto("promptCompleto"),
                "{}",
                o.operador_id
            );
        }
        let kimi = operaciones
            .iter()
            .find(|o| o.operador_id == "kimi")
            .unwrap();
        assert_eq!(
            kimi.nombre_archivo.as_deref(),
            Some(crate::registro::pruebas::str_de(&crate::json::vector(
                "ArchivoKimi"
            )))
        );
        assert!(
            operaciones
                .iter()
                .all(|o| o.marcas.last().unwrap().starts_with("[[CC-MARCA-FIN-"))
        );
    }

    /// REG-017 y OPE-016 sobre la corrida de la Unity: ronda nueva con las respuestas copiadas (líneas
    /// 60 a 70), kimi recapturada (71), la operación de chatgpt escribe el sello (72 a 78) y kimi
    /// reutiliza la suya (79 a 82); chatgpt no puede, porque lee la de kimi, que cambió.
    #[test]
    fn parseos_reuso_la_ronda_copiada_y_la_operacion_reutilizada_son_las_de_la_unity() {
        let c = Carpeta::nueva("operacion-reuso");
        let todas = lineas_corrida();
        let mut p = puerta_en_corrida(&c.0, &todas[..=59]);
        // Los cargados de la puerta de la Unity: los de la condición de la primera ronda (línea 2).
        let condicion = registro::leer(&format!(
            "{}
",
            todas[2]
        ))
        .hechos;
        p.activos = crate::registro::pruebas::lista(condicion[0].valor("proveedores"))
            .iter()
            .map(|v| crate::registro::pruebas::str_de(v).to_string())
            .collect();
        let mut n = 125u64;
        p.nuevo_id = Box::new(move || {
            n += 1;
            format!("00000000-0000-4000-8000-{n:012}")
        });
        let mensaje = p.ronda_nueva_con_respuestas_copiadas().unwrap();
        assert_eq!(
            mensaje,
            "Ronda nueva abierta (00000000) con 7 respuestas copiadas de la ronda 00000000. Recaptura con \"Capturar este panel\" lo que quieras corregir."
        );
        // La captura de kimi no es de esta parte: entra su línea tal cual y consume su id.
        let ruta = registro::ruta_archivo(&c.0, CONVERSACION_CORRIDA);
        let mut archivo = fs::read(&ruta).unwrap();
        archivo.extend_from_slice(
            format!(
                "{}
",
                todas[71]
            )
            .as_bytes(),
        );
        fs::write(&ruta, archivo).unwrap();
        (p.nuevo_id)();
        p.armar_operacion("chatgpt", false).unwrap();
        let kimi = p.reutilizar_operacion("kimi").unwrap();
        let chatgpt = p.reutilizar_operacion("chatgpt").unwrap();
        let escritas: Vec<String> = String::from_utf8(lineas(&c.0, CONVERSACION_CORRIDA))
            .unwrap()
            .lines()
            .map(String::from)
            .collect();
        assert_eq!(escritas.len(), todas.len());
        for (i, (e, t)) in escritas.iter().zip(&todas).enumerate().skip(60) {
            assert_eq!(e, t, "línea {i}");
        }
        let str_de =
            |n: &str| crate::registro::pruebas::str_de(&crate::json::vector(n)).to_string();
        assert_eq!(kimi, (true, str_de("MensajeReusoKimi")));
        assert_eq!(chatgpt, (false, str_de("MensajeReusoChatgpt")));
    }

    #[test]
    fn parseos_reuso_sin_ronda_sin_sello_o_fuera_del_pool_se_niega_sin_escribir() {
        let c = Carpeta::nueva("operacion-reuso-negativas");
        let mut vacia = nueva_puerta(&c.0);
        assert_eq!(
            vacia.ronda_nueva_con_respuestas_copiadas().unwrap(),
            "No hay una ronda activa de la que copiar."
        );
        assert_eq!(
            vacia.reutilizar_operacion("kimi").unwrap(),
            (false, "no hay una ronda activa".to_string())
        );
        let mut p = puerta_en_corrida(&c.0, &lineas_corrida()[..=12]);
        let antes = lineas(&c.0, CONVERSACION_CORRIDA);
        assert_eq!(
            p.reutilizar_operacion("glm").unwrap(),
            (false, "\"GLM\" no es un operador del pool.".to_string())
        );
        assert_eq!(
            p.reutilizar_operacion("kimi").unwrap(),
            (false, "Esta ronda todavía no tiene sello: pega primero la operación en algún panel («Pegar la operación aquí»).".to_string())
        );
        assert_eq!(lineas(&c.0, CONVERSACION_CORRIDA), antes);
    }

    #[test]
    fn parseos_la_ronda_copiada_conserva_un_surrogate_suelto_de_la_pregunta() {
        // revisión PART-005: Puerta.cs:753 pasa el string intacto a AbrirRonda.
        let c = Carpeta::nueva("operacion-reuso-surrogate");
        let mut corrida = lineas_corrida()[..=12].to_vec();
        corrida[1] = corrida[1].replace("\"prompt\":\"¿Qué", "\"prompt\":\"\\ud800¿Qué");
        let mut p = puerta_en_corrida(&c.0, &corrida);
        p.ronda_nueva_con_respuestas_copiadas().unwrap();
        let leido = p.leer_registro().unwrap();
        let prompts: Vec<&Texto> = leido
            .hechos
            .iter()
            .filter(|h| h.tipo() == "ronda")
            .filter_map(|h| h.texto("prompt"))
            .collect();
        assert_eq!(prompts.len(), 2);
        assert_eq!(prompts[0].a_utf16()[0], 0xD800);
        assert_eq!(prompts[1], prompts[0]);
    }

    // ------------------------------------------------------------ roles (PART-006)

    fn hecho_de_corrida(todas: &[String], i: usize) -> Hecho {
        registro::leer(&format!("{}\n", todas[i])).hechos.remove(0)
    }

    fn ids_desde(p: &mut Puerta, primero: u64) {
        let mut n = primero - 1;
        p.nuevo_id = Box::new(move || {
            n += 1;
            format!("00000000-0000-4000-8000-{n:012}")
        });
    }

    /// INT-003, VER-001 y RED-001 a RED-004 sobre la corrida de la Unity: cada prompt es el
    /// promptCompleto que la Unity registró, byte a byte. Línea 49: informe sin rescate; 50: el
    /// recapturado; 51 y 52: las verificaciones de glm y qwen; 53: la respuesta del redactor.
    #[test]
    fn prompts_los_de_los_roles_en_la_corrida_son_los_de_la_unity() {
        let todas = lineas_corrida();
        let prompt_de = |i: usize| {
            hecho_de_corrida(&todas, i)
                .texto("promptCompleto")
                .cloned()
                .unwrap()
        };

        let c = Carpeta::nueva("roles-integrador");
        let mut p = puerta_en_corrida(&c.0, &todas[..49]);
        assert_eq!(p.armar_prompt_integrador().unwrap(), prompt_de(49));

        let c = Carpeta::nueva("roles-verificador");
        let mut p = puerta_en_corrida(&c.0, &todas[..=50]);
        let verificador = p.armar_prompt_verificador().unwrap();
        assert_eq!(verificador, prompt_de(51));
        assert_eq!(verificador, prompt_de(52));

        let c = Carpeta::nueva("roles-redactor");
        let mut p = puerta_en_corrida(&c.0, &todas[..=52]);
        // Los ids de la Unity: siete del armado de cuerpos (111 a 117) y el token (118).
        ids_desde(&mut p, 111);
        let antes = lineas(&c.0, CONVERSACION_CORRIDA);
        let r = p.armar_redactor().unwrap();
        let respuesta = hecho_de_corrida(&todas, 53);
        assert_eq!(r.prompt_completo, prompt_de(53));
        let texto = |k: &str| respuesta.texto(k).and_then(Texto::como_str).unwrap();
        assert_eq!(r.marca_primera, texto("marcaPrimera"));
        assert_eq!(r.marca_ultima, texto("marcaUltima"));
        let sello: Vec<(String, String)> =
            crate::registro::pruebas::lista(respuesta.valor("selloVerificaciones"))
                .iter()
                .map(|s| {
                    let campo = |k| {
                        crate::registro::pruebas::str_de(crate::registro::pruebas::campo(s, k))
                            .to_string()
                    };
                    (campo("etiqueta"), campo("verificadorId"))
                })
                .collect();
        assert_eq!(r.sello_verificaciones, sello);
        assert_eq!(
            r.nombre_archivo,
            crate::registro::pruebas::str_de(&crate::json::vector("ArchivoRedactor"))
        );
        assert_eq!(r.aviso, None);
        assert_eq!(
            lineas(&c.0, CONVERSACION_CORRIDA),
            antes,
            "armar los roles no escribe"
        );
    }

    /// INT-002: sin ronda, sin semilla o sin pregunta válida, ningún rol se arma.
    #[test]
    fn prompts_los_roles_sin_ronda_semilla_o_pregunta_se_niegan_con_el_motivo_de_la_unity() {
        let todas = lineas_corrida();
        let errores = |p: &mut Puerta| {
            [
                p.armar_prompt_integrador().unwrap_err().to_string(),
                p.armar_prompt_verificador().unwrap_err().to_string(),
                p.armar_redactor().unwrap_err().to_string(),
            ]
        };

        let c = Carpeta::nueva("roles-sin-ronda");
        assert_eq!(
            errores(&mut nueva_puerta(&c.0)),
            ["no hay una ronda activa"; 3]
        );

        let c = Carpeta::nueva("roles-sin-semilla");
        let mut sin_semilla = todas[..=52].to_vec();
        sin_semilla[1] = sin_semilla[1].replace(
            "\"semilla\":\"00000000-0000-4000-8000-000000000002\"",
            "\"semilla\":null",
        );
        assert_ne!(sin_semilla[1], todas[1]);
        assert_eq!(
            errores(&mut puerta_en_corrida(&c.0, &sin_semilla)),
            ["la ronda no tiene semilla persistida"; 3]
        );

        let c = Carpeta::nueva("roles-sin-pregunta");
        let mut sin_pregunta = todas[..=52].to_vec();
        sin_pregunta[1] = sin_pregunta[1].replace(
            "\"prompt\":\"¿Qué dice la evidencia sobre la dosis?\"",
            "\"prompt\":\"\"",
        );
        assert_ne!(sin_pregunta[1], todas[1]);
        assert_eq!(
            errores(&mut puerta_en_corrida(&c.0, &sin_pregunta)),
            ["integrador", "verificador", "redactor"].map(|rol| format!(
                "la ronda {RONDA_CORRIDA} no tiene pregunta registrada válida: declárala antes de pegar el {rol}"
            ))
        );
    }

    /// INT-006: el verificador necesita un informe con la sección de rescate; sin ella, el error
    /// muestra el comienzo de lo capturado.
    #[test]
    fn prompts_el_verificador_sin_informe_o_sin_rescate_se_niega() {
        let todas = lineas_corrida();
        let c = Carpeta::nueva("roles-sin-informe");
        let mut p = puerta_en_corrida(&c.0, &todas[..49]);
        assert_eq!(
            p.armar_prompt_verificador().unwrap_err().to_string(),
            "la ronda todavía no tiene un informe del integrador capturado"
        );
        assert_eq!(
            p.armar_redactor().unwrap_err().to_string(),
            "la ronda todavía no tiene un informe del integrador capturado"
        );
        let c = Carpeta::nueva("roles-sin-rescate");
        let mut p = puerta_en_corrida(&c.0, &todas[..=49]);
        assert_eq!(
            p.armar_prompt_verificador().unwrap_err().to_string(),
            "el informe del integrador no tiene la seccion QUE CONVIENE RESCATAR. Se capturó (primeros 100 caracteres): \"TITULO: Informe a medias Texto incompleto [H1].\""
        );
    }

    /// RED-003: sin verificación capturada el archivo se arma igual, lo dice, y se avisa.
    #[test]
    fn prompts_el_redactor_sin_verificacion_se_arma_y_avisa() {
        let todas = lineas_corrida();
        let c = Carpeta::nueva("roles-sin-verificacion");
        let mut p = puerta_en_corrida(&c.0, &todas[..=50]);
        let r = p.armar_redactor().unwrap();
        assert!(r.sello_verificaciones.is_empty());
        assert_eq!(
            r.aviso.as_deref(),
            Some(
                "No hay verificación capturada en esta ronda: el archivo lo dice y el redactor trabaja sin ella."
            )
        );
        assert!(
            r.cuerpo_archivo
                .para_mostrar()
                .contains("===== VERIFICACION =====\n\n(sin verificacion capturada en esta ronda)")
        );
        assert!(
            r.cuerpo_archivo
                .para_mostrar()
                .ends_with(&format!("\n{}\n", r.marca_ultima))
        );
    }

    #[test]
    fn operacion_sin_ronda_sin_pregunta_o_con_faltantes_se_niega_con_el_motivo_de_la_unity() {
        let error = |p: &mut Puerta| p.armar_operacion("chatgpt", false).unwrap_err().to_string();

        let c = Carpeta::nueva("operacion-sin-ronda");
        assert_eq!(
            error(&mut nueva_puerta(&c.0)),
            "no hay una ronda activa: captura las respuestas del pool antes de pegar la operación"
        );

        // PuertaPruebas:510: solo chatgpt capturado.
        let c = Carpeta::nueva("operacion-faltantes");
        let todas = lineas_corrida();
        let mut p = puerta_en_corrida(&c.0, &todas[..=5]);
        let antes = lineas(&c.0, CONVERSACION_CORRIDA);
        assert_eq!(
            error(&mut p),
            "faltan respuestas capturadas en esta ronda: gemini, claude, grok, mistral, kimi, perplexity. Usa \"Capturar\" antes de pegar la operación"
        );
        assert_eq!(
            lineas(&c.0, CONVERSACION_CORRIDA),
            antes,
            "no se escribe nada"
        );

        let c = Carpeta::nueva("operacion-sin-pregunta");
        let mut sin_pregunta = todas[..=12].to_vec();
        sin_pregunta[1] = sin_pregunta[1].replace(
            "\"prompt\":\"¿Qué dice la evidencia sobre la dosis?\"",
            "\"prompt\":\"\"",
        );
        assert_ne!(sin_pregunta[1], todas[1]);
        let mut p = puerta_en_corrida(&c.0, &sin_pregunta);
        assert_eq!(
            error(&mut p),
            format!(
                "la ronda {RONDA_CORRIDA} no tiene pregunta registrada: declárala antes de pegar la operación"
            )
        );
    }

    #[test]
    fn operacion_una_ronda_sin_semilla_se_niega_y_no_escribe_sello() {
        // INV-OPE-004
        let c = Carpeta::nueva("operacion-sin-semilla");
        let todas = lineas_corrida();
        let mut lineas_sin = todas[..=12].to_vec();
        lineas_sin[1] = lineas_sin[1].replace(
            "\"semilla\":\"00000000-0000-4000-8000-000000000002\"",
            "\"semilla\":null",
        );
        assert_ne!(lineas_sin[1], todas[1]);
        let mut p = puerta_en_corrida(&c.0, &lineas_sin);
        let antes = lineas(&c.0, CONVERSACION_CORRIDA);
        assert_eq!(
            p.armar_operacion("chatgpt", false).unwrap_err().to_string(),
            format!(
                "ronda {RONDA_CORRIDA} no tiene semilla persistida: no se puede armar un cuerpo anonimizado reproducible sobre una ronda sin semilla."
            )
        );
        assert_eq!(lineas(&c.0, CONVERSACION_CORRIDA), antes, "sin sello");
    }

    #[test]
    fn operacion_con_el_sello_ya_escrito_una_respuesta_cambiada_se_niega_sin_escribir() {
        // PuertaPruebas:248: después del sello, kimi se recaptura con otra respuesta.
        let c = Carpeta::nueva("operacion-sello");
        let todas = lineas_corrida();
        let mut p = puerta_en_corrida(&c.0, &todas[..=12]);
        p.armar_operacion("chatgpt", false).unwrap();
        let mismo = p.armar_operacion("gemini", false);
        assert!(mismo.is_ok(), "el mismo sello recalculado coincide");
        let corregida = todas[10].replace("00000000-0000-4000-8000-000000000012", "corregida");
        assert_ne!(corregida, todas[10]);
        let hecho = registro::leer(&format!("{corregida}\n")).hechos.remove(0);
        registro::agregar(&c.0, CONVERSACION_CORRIDA, &hecho).unwrap();
        let antes = lineas(&c.0, CONVERSACION_CORRIDA);
        let e = p.armar_operacion("claude", false).unwrap_err().to_string();
        println!("{e}");
        assert!(e.starts_with(&format!(
            "el sello ya persistido para la ronda {RONDA_CORRIDA} no coincide con el que se acaba de calcular (la etiqueta \"Modelo G\" no coincide: persistido {{codigoEstable:P6, panelSourceId:kimi, replyId:00000000-0000-4000-8000-000000000012"
        )), "{e}");
        assert!(e.ends_with("No se escribió nada."), "{e}");
        assert_eq!(
            lineas(&c.0, CONVERSACION_CORRIDA),
            antes,
            "no se escribió nada"
        );
    }

    #[test]
    fn operacion_un_operador_fuera_del_pool_no_tiene_cuerpo() {
        let c = Carpeta::nueva("operacion-fuera");
        let mut p = puerta_en_corrida(&c.0, &lineas_corrida()[..=12]);
        let antes = lineas(&c.0, CONVERSACION_CORRIDA);
        assert_eq!(
            p.armar_operacion("deepseek", false)
                .unwrap_err()
                .to_string(),
            "\"DeepSeek\" no es un operador del pool: no tiene cuerpo que operar"
        );
        assert_eq!(
            p.armar_operacion("nuevo", false).unwrap_err().to_string(),
            "\"Nuevo\" no es un operador del pool: no tiene cuerpo que operar"
        );
        assert_eq!(lineas(&c.0, CONVERSACION_CORRIDA), antes);
    }

    /// Ciclos de CPU del hilo actual (D15, enmienda a ADR-0007) y tiempos de la máquina
    /// (inactivo, total) en intervalos de 100 ns, para la CPU de la máquina durante la medición.
    #[cfg(windows)]
    fn ciclos_del_hilo() -> Option<u64> {
        #[link(name = "kernel32")]
        unsafe extern "system" {
            fn GetCurrentThread() -> *mut std::ffi::c_void;
            fn QueryThreadCycleTime(hilo: *mut std::ffi::c_void, ciclos: *mut u64) -> i32;
        }
        let mut ciclos = 0u64;
        // SAFETY: el seudo-handle del hilo actual siempre es válido; el puntero apunta a un u64 vivo.
        (unsafe { QueryThreadCycleTime(GetCurrentThread(), &mut ciclos) } != 0).then_some(ciclos)
    }

    #[cfg(windows)]
    fn tiempos_de_la_maquina() -> Option<(u64, u64)> {
        #[link(name = "kernel32")]
        unsafe extern "system" {
            fn GetSystemTimes(inactivo: *mut u64, kernel: *mut u64, usuario: *mut u64) -> i32;
        }
        let (mut inactivo, mut kernel, mut usuario) = (0u64, 0u64, 0u64);
        // SAFETY: FILETIME es un u64 alineado; los tres punteros viven durante la llamada.
        let ok = unsafe { GetSystemTimes(&mut inactivo, &mut kernel, &mut usuario) } != 0;
        // El tiempo de kernel ya incluye el inactivo.
        ok.then_some((inactivo, kernel + usuario))
    }

    // Fuera de Windows la medición queda como no medida: falta el equivalente por plataforma
    // (docs/SEGUNDA-PASADA.md).
    #[cfg(not(windows))]
    fn ciclos_del_hilo() -> Option<u64> {
        None
    }

    #[cfg(not(windows))]
    fn tiempos_de_la_maquina() -> Option<(u64, u64)> {
        None
    }

    /// PART-004 T3: armar la operación de los siete del pool con los textos reales de la ronda del
    /// 2026-11-10 (docs/investigacion), medida con D15 (ciclos del hilo, mediana de 3, dispersión
    /// ≤ 10 %). Se corre a mano, en release:
    /// cargo test --release -p nucleo medicion -- --ignored --nocapture --test-threads=1
    #[test]
    #[ignore]
    fn operacion_medicion_con_las_respuestas_de_la_ronda_2026_11_10() {
        let carpeta = Path::new(env!("CARGO_MANIFEST_DIR")).join(
            "../../docs/investigacion/2026-11-10-alternativas-ui/Respuestas de los investigadores",
        );
        let archivos = [
            ("chatgpt", "1 - ChatGPT.md"),
            ("gemini", "2 - Gemini.md"),
            ("claude", "3 - Claude.md"),
            ("grok", "4 - Grok.md"),
            ("mistral", "5 - Mistral.md"),
            ("kimi", "6 - Kimi.md"),
            ("perplexity", "7 - Perplexity.md"),
        ];
        let mut todas = lineas_corrida()[..=12].to_vec();
        let mut unidades = 0;
        for linea in todas.iter_mut() {
            let h = registro::leer(&format!("{linea}\n")).hechos.remove(0);
            if h.tipo() != "respuesta" {
                continue;
            }
            let Some((_, nombre)) = archivos
                .iter()
                .find(|(id, _)| h.texto("proveedorId").and_then(Texto::como_str) == Some(*id))
            else {
                continue;
            };
            let nuevo: Texto = fs::read_to_string(carpeta.join(nombre))
                .unwrap()
                .as_str()
                .into();
            unidades += nuevo.a_utf16().len();
            let (mut viejo_json, mut nuevo_json) = (Vec::new(), Vec::new());
            crate::json::escapar(h.texto("textoOriginal").unwrap(), &mut viejo_json);
            crate::json::escapar(&nuevo, &mut nuevo_json);
            let (viejo_json, nuevo_json) = (
                String::from_utf8(viejo_json).unwrap(),
                String::from_utf8(nuevo_json).unwrap(),
            );
            assert_eq!(linea.matches(&viejo_json).count(), 1);
            *linea = linea.replace(&viejo_json, &nuevo_json);
        }
        println!("respuestas: 7, unidades UTF-16: {unidades}");
        let pool = pool_puerta();
        let pool: Vec<&str> = pool.iter().map(String::as_str).collect();
        let Some(_) = ciclos_del_hilo() else {
            println!("no medido: sin ciclos del hilo en esta plataforma (D15)");
            return;
        };
        let mut totales = Vec::new();
        for corrida in 1..=3 {
            let c = Carpeta::nueva(&format!("operacion-medicion-{corrida}"));
            let mut p = puerta_en_corrida(&c.0, &todas);
            let maquina_antes = tiempos_de_la_maquina().unwrap();
            let reloj = std::time::Instant::now();
            let ciclos_antes = ciclos_del_hilo().unwrap();
            let mut detalle = Vec::new();
            for op in &pool {
                let (t, k) = (std::time::Instant::now(), ciclos_del_hilo().unwrap());
                let o = p.armar_operacion(op, *op == "kimi").unwrap();
                let ciclos = ciclos_del_hilo().unwrap() - k;
                detalle.push(format!(
                    "{op} {:.1} Mciclos {:.2} ms",
                    ciclos as f64 / 1e6,
                    t.elapsed().as_secs_f64() * 1000.0
                ));
                assert!(o.prompt_completo.a_utf16().len() > unidades / 2);
            }
            let ciclos = ciclos_del_hilo().unwrap() - ciclos_antes;
            let ms = reloj.elapsed().as_secs_f64() * 1000.0;
            let maquina_despues = tiempos_de_la_maquina().unwrap();
            let total = maquina_despues.1 - maquina_antes.1;
            let ocupado = total - (maquina_despues.0 - maquina_antes.0);
            println!(
                "corrida {corrida}: siete operaciones {:.1} Mciclos, reloj {ms:.2} ms, CPU de la máquina {:.1} % ({})",
                ciclos as f64 / 1e6,
                100.0 * ocupado as f64 / total.max(1) as f64,
                detalle.join(", ")
            );
            totales.push(ciclos);
        }
        totales.sort_unstable();
        let mediana = totales[1];
        let dispersion = 100.0 * (totales[2] - totales[0]) as f64 / mediana as f64;
        println!(
            "D15: mediana {:.1} Mciclos, dispersión {dispersion:.1} % ({})",
            mediana as f64 / 1e6,
            if dispersion <= 10.0 {
                "vale"
            } else {
                "no vale, repetir"
            }
        );
    }

    #[test]
    fn concatenar_une_los_surrogates_sueltos_de_la_frontera_como_la_unity() {
        let t = |u: &[u16]| Texto::desde_utf16(u);
        // alto suelto al final + bajo suelto al principio = un solo carácter (😀)
        let unido = concatenar(&[&t(&[0x61, 0xD83D]), &t(&[0xDE00, 0x62])]);
        assert_eq!(unido, Texto::from("a😀b"));
        assert_eq!(unido.a_utf16(), [0x61, 0xD83D, 0xDE00, 0x62]);
        // sin par en la frontera, cada suelto queda suelto; U+D7FF (ED 9F BF) no es un surrogate
        let sueltos = concatenar(&[&t(&[0xDC00]), &t(&[0xD800]), &t(&[0xD7FF, 0xD801])]);
        assert_eq!(sueltos.a_utf16(), [0xDC00, 0xD800, 0xD7FF, 0xD801]);
        assert_eq!(
            concatenar(&[&Texto::from("ñ"), &Texto::default(), &Texto::from("ú")]),
            Texto::from("ñú")
        );
    }

    #[test]
    fn la_hora_antes_de_1970_no_se_vuelve_1970() {
        // revisión PART-003
        assert_eq!(
            formatear_utc(UNIX_EPOCH - Duration::from_millis(1)),
            "1969-12-31T23:59:59.999Z"
        );
        assert_eq!(
            formatear_utc(UNIX_EPOCH - Duration::from_micros(1500)),
            "1969-12-31T23:59:59.998Z"
        );
    }

    // ------------------------------------------------------------ captura (PART-007)

    fn confirmada(_: &str) -> (Option<String>, Option<String>) {
        (Some("confirmada".into()), None)
    }

    fn indeterminada(_: &str) -> (Option<String>, Option<String>) {
        (Some("indeterminada".into()), None)
    }

    /// Algunos vectores son un JSON dentro de un string (JsonEstricto.Leer de la Unity).
    fn json_de(nombre: &str) -> Valor {
        match crate::json::vector(nombre) {
            Valor::Texto(t) => crate::json::leer(t.como_str().unwrap()).unwrap(),
            v => v,
        }
    }

    fn opt<'a>(v: &'a Valor, k: &str) -> Option<&'a Valor> {
        match v {
            Valor::Objeto(o) => o
                .iter()
                .find(|(n, _)| n.como_str() == Some(k))
                .map(|(_, x)| x)
                .filter(|x| **x != Valor::Nulo),
            _ => None,
        }
    }

    fn lectura(v: &Valor) -> Lectura {
        let texto = |k| opt(v, k).map(|x| registro::pruebas::texto_de(x).clone());
        let cadena = |k| opt(v, k).map(|x| registro::pruebas::str_de(x).to_string());
        let entero = |k| match opt(v, k) {
            Some(Valor::Entero(n)) => Some(*n),
            _ => None,
        };
        Lectura {
            id: cadena("id").unwrap(),
            text: texto("text").unwrap_or_default(),
            generating: match opt(v, "generating") {
                Some(Valor::Bool(b)) => Some(*b),
                _ => None,
            },
            completion_kind: cadena("completionKind"),
            quiescence_ms: entero("quiescenceMs"),
            model_label: texto("modelLabel"),
            user_text: texto("userText"),
            fuentes_href: entero("fuentesHref"),
            html: texto("html"),
            error: texto("error"),
        }
    }

    fn lote(lotes: &Valor, nombre: &str) -> Vec<Lectura> {
        registro::pruebas::lista(registro::pruebas::campo(lotes, nombre))
            .iter()
            .map(lectura)
            .collect()
    }

    fn pregunta_operacion() -> String {
        registro::pruebas::str_de(&crate::json::vector("PreguntaOperacion")).to_string()
    }

    fn lineas_de(c: &Path, p: &Puerta) -> Vec<String> {
        String::from_utf8(lineas(c, p.conversacion_actual().unwrap()))
            .unwrap()
            .lines()
            .map(String::from)
            .collect()
    }

    fn hechos_de(c: &Path, p: &Puerta) -> Vec<Hecho> {
        registro::leer_archivo(c, p.conversacion_actual().unwrap())
            .unwrap()
            .hechos
    }

    fn de_tipo<'a>(hechos: &'a [Hecho], tipo: &'a str) -> impl Iterator<Item = &'a Hecho> {
        hechos.iter().filter(move |h| h.tipo() == tipo)
    }

    fn s<'a>(h: &'a Hecho, k: &str) -> Option<&'a str> {
        h.texto(k).and_then(Texto::como_str)
    }

    /// La ronda hasta la integración: investigación, operación pegada y capturada en dos lotes.
    fn ronda_hasta_la_integracion(c: &Path) -> (Puerta, Valor) {
        let mut p = nueva_puerta(c);
        let lotes = json_de("LotesOperacion");
        p.abrir_ronda(pregunta_operacion()).unwrap();
        p.registrar_capturas(&lote(&lotes, "investigacion"), &confirmada)
            .unwrap();
        for op in pool_puerta() {
            let o = p.armar_operacion(&op, false).unwrap();
            p.operacion_pegada(&o);
        }
        p.registrar_capturas(&lote(&lotes, "operadores1"), &confirmada)
            .unwrap();
        p.registrar_capturas(&lote(&lotes, "operadores2"), &confirmada)
            .unwrap();
        (p, lotes)
    }

    // Medido en la ronda real (2026-10-22): seis capturas de chatgpt en 0 caracteres cerraron la investigación con 6 de 7.
    #[test]
    fn ronda_una_captura_con_error_no_cierra_la_investigacion() {
        let c = Carpeta::nueva("captura-error");
        let mut p = nueva_puerta(&c.0);
        let mut lecturas = lote(&json_de("LotesOperacion"), "investigacion");
        let i = lecturas.iter().position(|l| l.id == "chatgpt").unwrap();
        let original = std::mem::take(&mut lecturas[i].text);
        p.abrir_ronda(pregunta_operacion()).unwrap();
        p.registrar_capturas(&lecturas, &confirmada).unwrap();
        let paso = p.paso_siguiente().unwrap();
        assert_eq!((paso.etapa, paso.accion), ("investigacion", "capturar"));
        assert_eq!(
            p.estado_de_panel("chatgpt", None, None).unwrap(),
            "con-problema"
        );

        lecturas[i].text = original;
        p.registrar_capturas(&lecturas[i..=i], &confirmada).unwrap();
        assert_eq!(
            p.paso_siguiente().unwrap().etapa,
            "operacion",
            "con la recaptura válida, la investigación sí se cierra"
        );
    }

    // Ronda 417be423: Qwen en investigación profunda devolvió un ensayo sin una sola línea de verificación.
    #[test]
    fn ronda_una_verificacion_sin_lineas_no_se_guarda_como_valida() {
        let c = Carpeta::nueva("verificacion-sin-lineas");
        let (mut p, lotes) = ronda_hasta_la_integracion(&c.0);
        let prompt = p.armar_prompt_integrador().unwrap();
        p.integrador_pegado(prompt);
        p.registrar_capturas(&lote(&lotes, "integradorCorto"), &confirmada)
            .unwrap();
        p.recapturar(
            "integrador",
            &lectura(registro::pruebas::campo(&lotes, "integradorCompleto")),
        )
        .unwrap();
        let prompt = p.armar_prompt_verificador().unwrap();
        p.verificador_pegado(prompt);
        let mut verificadores = lote(&lotes, "verificador");
        let ensayo = verificadores.last_mut().unwrap();
        ensayo.text = "Deep Research Completed\nResumen\nUn ensayo largo sobre las fuentes, sin ninguna línea en el formato pedido.".into();
        ensayo.html = None;
        let ensayo = ensayo.clone();
        p.registrar_capturas(&verificadores, &confirmada).unwrap();
        let hechos = hechos_de(&c.0, &p);
        assert!(
            !de_tipo(&hechos, "salida-verificador")
                .any(|h| s(h, "verificadorId") == Some(&ensayo.id))
        );
        assert!(
            de_tipo(&hechos, "error-captura").any(|h| s(h, "proveedorId") == Some(&ensayo.id)
                && s(h, "detalle").unwrap().contains("formato pedido"))
        );
        assert!(
            !p.recapturar("verificador", &ensayo).unwrap().0,
            "recapturarlo tampoco lo guarda"
        );
    }

    // Ronda 417be423: la investigación profunda de Claude se capturó a medias y la ronda ya estaba en la operación.
    #[test]
    fn ronda_antes_de_armar_la_operacion_capturar_recaptura_la_investigacion() {
        let c = Carpeta::nueva("recaptura-investigacion");
        let mut p = nueva_puerta(&c.0);
        p.abrir_ronda(pregunta_operacion()).unwrap();
        let investigacion = lote(&json_de("LotesOperacion"), "investigacion");
        p.registrar_capturas(&investigacion, &confirmada).unwrap();
        let mut nueva = investigacion[0].clone();
        nueva
            .text
            .empujar_str("\n\nEl informe completo, que faltaba en la primera captura.");
        p.registrar_capturas(std::slice::from_ref(&nueva), &confirmada)
            .unwrap();
        let hechos = hechos_de(&c.0, &p);
        let suyas: Vec<&Hecho> = de_tipo(&hechos, "respuesta")
            .filter(|h| s(h, "proveedorId") == Some(&nueva.id))
            .collect();
        assert_eq!(suyas.len(), 2);
        assert!(
            s(suyas[1], "textoOriginal")
                .unwrap()
                .ends_with("faltaba en la primera captura.")
        );
        assert_eq!(de_tipo(&hechos, "salida-operador").count(), 0);
        assert!(!p.operacion_armada().unwrap());
        p.armar_operacion(&pool_puerta()[0], false).unwrap();
        assert!(
            p.operacion_armada().unwrap(),
            "con el sello, capturar vuelve a ser la operación"
        );
    }

    /// Una ronda entera con las corridas de la Unity. Las líneas de url-comprobada (y sus 6 ids) son de
    /// PART-009 y el informe de PART-008: aquí se saltan y el resto se compara byte a byte.
    /// Una puerta con la ronda abierta y las siete respuestas de la investigación.
    fn con_investigacion(c: &Path, pregunta: &str) -> Puerta {
        let mut p = nueva_puerta(c);
        // Sin esto el sello del nombre depende de la zona horaria de la máquina (0900 aquí, 1200 en el CI).
        p.desfase_local = |_| -3 * 3600;
        p.abrir_ronda(pregunta).unwrap();
        p.registrar_capturas(
            &lote(&json_de("LotesOperacion"), "investigacion"),
            &confirmada,
        )
        .unwrap();
        p
    }

    // INF-009 e INF-010: una respuesta que no llega a PDF queda nombrada en la carpeta; si no, se
    // lee como que ese proveedor no participó.
    #[test]
    fn informe_si_falla_el_pdf_de_una_respuesta_las_demas_se_escriben_y_faltan_la_nombra() {
        let c = Carpeta::nueva("informe-pdf-falla");
        let mut p = con_investigacion(&c.0, "¿Pregunta de prueba?");
        let pdf = PdfFalso {
            fallar_en: Some("4 - Grok.pdf"),
            ..Default::default()
        };
        let r = p.armar_informe(&pdf);
        let respuestas = r
            .ruta
            .as_ref()
            .unwrap()
            .join(informe::SUBCARPETA_RESPUESTAS);
        let con = |ext: &str| {
            fs::read_dir(&respuestas)
                .unwrap()
                .filter(|e| {
                    e.as_ref()
                        .unwrap()
                        .path()
                        .extension()
                        .is_some_and(|x| x == ext)
                })
                .count()
        };
        assert_eq!((con("md"), con("pdf")), (7, 6));
        assert!(
            fs::read_to_string(respuestas.join("FALTAN - respuestas sin PDF.txt"))
                .unwrap()
                .contains("- 4 - Grok: no se pudo generar el PDF (la impresora de prueba falló)")
        );
        assert!(r.mensaje.ends_with(
            "6 de 7 respuestas completas; 1 con archivos faltantes (nombrados en \"FALTAN - respuestas sin PDF.txt\")."
        ), "{}", r.mensaje);
        assert!(
            !r.completo,
            "un informe con archivos faltantes no está completo"
        );
    }

    // INF-009: si falla el PDF del informe, queda el .md y se dice.
    #[test]
    fn informe_si_falla_el_pdf_del_informe_queda_el_md_y_se_dice() {
        let c = Carpeta::nueva("informe-pdf-principal");
        let mut p = con_investigacion(&c.0, "¿Pregunta de prueba?");
        let pdf = PdfFalso {
            fallar_en: Some("Pregunta de prueba.pdf"),
            ..Default::default()
        };
        let r = p.armar_informe(&pdf);
        assert!(r.ok && !r.completo);
        assert!(
            r.ruta
                .as_ref()
                .unwrap()
                .extension()
                .is_some_and(|x| x == "md")
        );
        assert!(r.mensaje.contains(
            "El informe quedó solo en Markdown: no se pudo generar el PDF (la impresora de prueba falló)."
        ), "{}", r.mensaje);
    }

    // D47: ninguna ruta de la carpeta pasa de 259 caracteres (MAX_PATH); el título se acorta, no se pierde.
    #[test]
    fn informe_ninguna_ruta_pasa_de_259_caracteres() {
        let raiz = Carpeta::nueva("informe-rutas");
        let largo = raiz.0.to_string_lossy().encode_utf16().count();
        let honda = raiz
            .0
            .join("d".repeat(150usize.saturating_sub(largo).max(1)));
        fs::create_dir_all(&honda).unwrap();
        let mut p = con_investigacion(
            &honda,
            "¿Cuáles investigaciones longitudinales comparables documentan efectos persistentes?",
        );
        let r = p.armar_informe(&PdfFalso::default());
        assert!(r.ok && r.completo, "{}", r.mensaje);
        let mut rutas = Vec::new();
        let mut pendientes = vec![honda.join("informes")];
        while let Some(d) = pendientes.pop() {
            for e in fs::read_dir(d).unwrap() {
                let e = e.unwrap().path();
                if e.is_dir() {
                    pendientes.push(e);
                } else {
                    rutas.push(e.to_string_lossy().encode_utf16().count());
                }
            }
        }
        assert_eq!(rutas.len(), 16);
        assert!(rutas.iter().all(|&n| n <= 259), "{rutas:?}");
        let nombre = r
            .ruta
            .unwrap()
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        assert!(
            nombre.starts_with("2026-10-06 0900 - ¿Cuáles"),
            "{nombre:?} en {honda:?}"
        );
    }

    // INV-INF-001: un informe nunca se sobrescribe; armarlo otra vez usa el nombre libre siguiente.
    #[test]
    fn informe_nunca_se_sobrescribe() {
        let c = Carpeta::nueva("informe-dos-veces");
        let mut p = con_investigacion(&c.0, "¿Pregunta de prueba?");
        let primera = p.armar_informe(&PdfFalso::default()).ruta.unwrap();
        let md = primera.join(format!(
            "{}.md",
            primera.file_name().unwrap().to_string_lossy()
        ));
        fs::write(&md, "editado por Juan").unwrap();
        let segunda = p.armar_informe(&PdfFalso::default());
        assert!(segunda.ok, "{}", segunda.mensaje);
        assert_eq!(
            segunda.ruta.unwrap().file_name().unwrap().to_string_lossy(),
            format!("{} (2)", primera.file_name().unwrap().to_string_lossy())
        );
        assert_eq!(fs::read_to_string(&md).unwrap(), "editado por Juan");
    }

    #[test]
    fn informe_sin_ronda_activa_se_niega() {
        let c = Carpeta::nueva("informe-sin-ronda");
        let r = nueva_puerta(&c.0).armar_informe(&PdfFalso::default());
        assert_eq!(
            (r.ok, r.mensaje.as_str(), r.ruta),
            (
                false,
                "No hay una ronda activa para armar el informe.",
                None
            )
        );
        assert!(!c.0.join("informes").exists());
    }

    #[test]
    fn ronda_entera_deja_los_mismos_hechos_que_la_unity() {
        use std::cell::Cell;
        use std::rc::Rc;
        let c = Carpeta::nueva("ronda-entera");
        let contador = Rc::new(Cell::new(0u64));
        let n = contador.clone();
        let mut p = Puerta::new(
            c.0.clone(),
            Box::new(move || {
                n.set(n.get() + 1);
                format!("00000000-0000-4000-8000-{:012}", n.get())
            }),
            Box::new(|| UNIX_EPOCH + Duration::from_secs(1_791_288_000)),
            crate::operacion::CONOCIDOS
                .iter()
                .map(|s| s.to_string())
                .collect(),
            RolesElegidos::new("deepseek", "glm", "qwen", "deepseek"),
            pool_puerta(),
        );
        p.desfase_local = |_| -3 * 3600;
        let lotes = json_de("LotesOperacion");
        let mut pasos = vec![p.paso_siguiente().unwrap().accion];
        macro_rules! paso {
            () => {
                pasos.push(p.paso_siguiente().unwrap().accion)
            };
        }
        p.abrir_ronda(pregunta_operacion()).unwrap();
        paso!();
        p.registrar_capturas(&lote(&lotes, "investigacion"), &confirmada)
            .unwrap();
        paso!();
        let mut archivo_kimi = None;
        for op in pool_puerta() {
            let o = p.armar_operacion(&op, op == "kimi").unwrap();
            p.operacion_pegada(&o);
            if op == "kimi" {
                archivo_kimi = o.nombre_archivo.clone();
            }
        }
        paso!();
        let estado = |p: &mut Puerta, id, g, f| p.estado_de_panel(id, g, f).unwrap();
        assert_eq!(estado(&mut p, "chatgpt", None, None), "pegado-falta-enviar");
        assert_eq!(estado(&mut p, "chatgpt", Some(true), None), "respondiendo");
        assert_eq!(
            estado(&mut p, "chatgpt", Some(false), Some("deducido")),
            "parece-terminado-deducido"
        );
        p.registrar_capturas(&lote(&lotes, "operadores1"), &confirmada)
            .unwrap();
        paso!();
        assert_eq!(
            estado(&mut p, "chatgpt", Some(false), Some("observado")),
            "capturado"
        );
        assert_eq!(
            estado(&mut p, "claude", Some(false), Some("observado")),
            "parece-terminado-observado"
        );
        p.registrar_capturas(&lote(&lotes, "operadores2"), &confirmada)
            .unwrap();
        paso!();
        let prompt = p.armar_prompt_integrador().unwrap();
        p.integrador_pegado(prompt);
        paso!();
        p.registrar_capturas(&lote(&lotes, "integradorCorto"), &confirmada)
            .unwrap();
        paso!();
        let recaptura = p
            .recapturar(
                "integrador",
                &lectura(registro::pruebas::campo(&lotes, "integradorCompleto")),
            )
            .unwrap();
        let prompt = p.armar_prompt_verificador().unwrap();
        p.verificador_pegado(prompt);
        paso!();
        p.registrar_capturas(&lote(&lotes, "verificador"), &confirmada)
            .unwrap();
        paso!();
        let redactor = p.armar_redactor().unwrap();
        p.redactor_pegado(&redactor);
        paso!();
        p.registrar_capturas(
            &[lectura(&json_de("LecturaRedactorOperacion"))],
            &confirmada,
        )
        .unwrap();
        paso!();
        let primera = Texto::from(p.ronda_actual().unwrap());
        assert_eq!(
            pasos,
            [
                "pegar-pregunta",
                "capturar",
                "pegar-operacion",
                "capturar",
                "capturar",
                "pegar-integrador",
                "capturar",
                "pegar-verificacion",
                "capturar",
                "pegar-redactor",
                "capturar",
                "armar-informe",
            ]
        );
        // Las url-comprobada que escribe ComprobarUrls en la Unity (INF-001, PART-010), tal cual y
        // con sus ids: el informe las lee del registro.
        let todas = lineas_corrida();
        let urls: String = todas
            .iter()
            .filter(|l| l.starts_with(r#"{"tipo":"url-comprobada""#))
            .map(|l| format!("{l}\n"))
            .collect();
        agregar_lineas(&c.0, &p, &urls);
        contador.set(contador.get() + 6);
        // T11: el informe con su carpeta (INF-002, INF-005, INF-008, INF-011).
        let pdf = PdfFalso::default();
        let informe = p.armar_informe(&pdf);
        let nombre = str_de(&crate::json::vector("NombreBaseInforme")).to_string();
        let carpeta_informe = c.0.join("informes").join(&nombre);
        assert!(informe.ok && informe.completo, "{}", informe.mensaje);
        assert_eq!(
            fs::read_to_string(carpeta_informe.join(format!("{nombre}.md"))).unwrap(),
            str_de(&crate::json::vector("InformeDeRonda"))
        );
        let respuestas = crate::json::vector("RespuestasDeCarpeta");
        let subcarpeta = carpeta_informe.join(informe::SUBCARPETA_RESPUESTAS);
        for r in registro::pruebas::lista(&respuestas) {
            let archivo = str_de(registro::pruebas::campo(r, "archivo"));
            assert_eq!(
                fs::read_to_string(subcarpeta.join(format!("{archivo}.md"))).unwrap(),
                str_de(registro::pruebas::campo(r, "markdown")),
                "{archivo}"
            );
            assert!(pdf.pedidos.borrow().contains(&(
                subcarpeta.join(format!("{archivo}.pdf")),
                str_de(registro::pruebas::campo(r, "titulo")).to_string()
            )));
        }
        // El motor no abre nada (D41): la carpeta la abre la interfaz.
        assert_eq!(
            informe.mensaje,
            format!(
                "Carpeta del informe: {}. El informe está en .md y en PDF. 7 respuestas de investigador, cada una en .md y en PDF.",
                carpeta_informe.display()
            )
        );
        // Armado el informe, el paso es abrir su carpeta, no armar otro.
        paso!();
        assert_eq!(pasos.last(), Some(&"abrir-carpeta"));
        assert_eq!(p.carpeta_informe_armado(), Some(carpeta_informe.as_path()));
        p.ronda_nueva_con_respuestas_copiadas().unwrap();
        p.registrar_capturas(&lote(&lotes, "kimiNueva"), &confirmada)
            .unwrap();
        let o = p.armar_operacion("chatgpt", false).unwrap();
        p.operacion_pegada(&o);
        p.reutilizar_operacion("kimi").unwrap();
        p.reutilizar_operacion("chatgpt").unwrap();

        assert_eq!(urls.lines().count(), 6);
        let escritas = lineas_de(&c.0, &p);
        assert_eq!(escritas.len(), todas.len());
        for (i, (a, b)) in escritas.iter().zip(&todas).enumerate() {
            assert_eq!(a, b, "línea {i}");
        }
        assert_eq!(
            archivo_kimi.as_deref(),
            Some(registro::pruebas::str_de(&crate::json::vector(
                "ArchivoKimi"
            )))
        );
        assert_eq!(
            recaptura,
            (
                true,
                registro::pruebas::str_de(&crate::json::vector("MensajeRecaptura")).to_string()
            )
        );
        let hechos = hechos_de(&c.0, &p);
        assert_eq!(
            de_tipo(&hechos, "sello")
                .filter(|h| h.texto("rondaId") == Some(&primera))
                .count(),
            7
        );
        assert_eq!(de_tipo(&hechos, "informe-integrador").count(), 2);
        assert_eq!(
            dominio::ultimo_informe_integrador(&hechos, &primera).and_then(|h| s(h, "titulo")),
            Some("La dosis")
        );
    }

    // T22: un operador que ya operó y un rol cuya etapa pasó están capturados; el rol de la etapa sigue su estado.
    #[test]
    fn ronda_en_las_etapas_de_los_roles_lo_ya_capturado_sigue_capturado() {
        let c = Carpeta::nueva("roles-capturados");
        let (mut p, lotes) = ronda_hasta_la_integracion(&c.0);
        let estado = |p: &mut Puerta, id, g, f| p.estado_de_panel(id, g, f).unwrap();
        assert_eq!(p.paso_siguiente().unwrap().etapa, "integracion");
        assert_eq!(estado(&mut p, "chatgpt", None, None), "capturado");
        assert_eq!(estado(&mut p, "deepseek", None, None), "por-pegar");
        assert_eq!(estado(&mut p, "glm", None, None), "por-pegar");

        let prompt = p.armar_prompt_integrador().unwrap();
        p.integrador_pegado(prompt);
        assert_eq!(
            estado(&mut p, "deepseek", Some(false), Some("observado")),
            "parece-terminado-observado"
        );
        p.registrar_capturas(
            &[lectura(registro::pruebas::campo(
                &lotes,
                "integradorCompleto",
            ))],
            &confirmada,
        )
        .unwrap();
        assert_eq!(p.paso_siguiente().unwrap().etapa, "verificacion");
        assert_eq!(estado(&mut p, "chatgpt", None, None), "capturado");
        assert_eq!(estado(&mut p, "glm", None, None), "por-pegar");
        assert_eq!(estado(&mut p, "deepseek", None, None), "capturado");

        let prompt = p.armar_prompt_verificador().unwrap();
        p.verificador_pegado(prompt);
        p.registrar_capturas(&lote(&lotes, "verificador"), &confirmada)
            .unwrap();
        assert_eq!(p.paso_siguiente().unwrap().etapa, "redaccion");
        assert_eq!(estado(&mut p, "glm", None, None), "capturado");
        assert_eq!(
            estado(&mut p, "deepseek", None, None),
            "por-pegar",
            "el redactor es el integrador: su etapa vuelve a empezar"
        );

        let redactor = p.armar_redactor().unwrap();
        p.redactor_pegado(&redactor);
        p.registrar_capturas(
            &[lectura(&json_de("LecturaRedactorOperacion"))],
            &confirmada,
        )
        .unwrap();
        assert_eq!(p.paso_siguiente().unwrap().etapa, "informe");
        assert_eq!(estado(&mut p, "deepseek", None, None), "capturado");
        assert_eq!(estado(&mut p, "chatgpt", None, None), "capturado");
    }

    // T22: una recaptura que falla o queda bajo el umbral no reemplaza al informe bueno.
    #[test]
    fn ronda_una_recaptura_fallida_queda_como_error_y_no_reemplaza() {
        let c = Carpeta::nueva("recaptura-fallida");
        let (mut p, lotes) = ronda_hasta_la_integracion(&c.0);
        let prompt = p.armar_prompt_integrador().unwrap();
        p.integrador_pegado(prompt);
        p.registrar_capturas(
            &[lectura(registro::pruebas::campo(
                &lotes,
                "integradorCompleto",
            ))],
            &confirmada,
        )
        .unwrap();
        let deepseek = |text: &str| Lectura {
            id: "deepseek".into(),
            text: text.into(),
            ..Lectura::default()
        };
        let fallida = p
            .recapturar(
                "integrador",
                &deepseek("").con_error("el panel no está abierto"),
            )
            .unwrap();
        let corta = p.recapturar("integrador", &deepseek("corto")).unwrap();
        let hechos = hechos_de(&c.0, &p);
        assert_eq!(
            fallida,
            (
                false,
                "DeepSeek: el integrador no se recapturó (el panel no está abierto)".into()
            )
        );
        assert!(!corta.0);
        assert_eq!(de_tipo(&hechos, "informe-integrador").count(), 1);
        let ronda = Texto::from(p.ronda_actual().unwrap());
        assert_eq!(
            dominio::ultimo_informe_integrador(&hechos, &ronda).and_then(|h| s(h, "titulo")),
            Some("La dosis")
        );
        let errores: Vec<Option<&str>> = de_tipo(&hechos, "error-captura")
            .filter(|h| s(h, "tipoCapturaIntentado") == Some("informe-integrador"))
            .map(|h| s(h, "proveedorId"))
            .collect();
        assert_eq!(errores, [Some("deepseek"), Some("deepseek")]);
        assert!(
            p.recapturar("redactor", &deepseek("x")).is_err(),
            "otro rol no se recaptura"
        );
    }

    fn registrar_intentos9(p: &mut Puerta) {
        let intentos: Vec<(String, bool, Option<String>)> =
            registro::pruebas::lista(&json_de("Intentos9"))
                .iter()
                .map(|i| {
                    (
                        registro::pruebas::str_de(registro::pruebas::campo(i, "id")).to_string(),
                        opt(i, "ok") == Some(&Valor::Bool(true)),
                        opt(i, "error").map(|e| registro::pruebas::str_de(e).to_string()),
                    )
                })
                .collect();
        let intentos: Vec<(&str, bool, Option<&str>)> = intentos
            .iter()
            .map(|(a, b, e)| (a.as_str(), *b, e.as_deref()))
            .collect();
        p.registrar_intentos(&intentos).unwrap();
    }

    fn contexto9(id: &str) -> (Option<String>, Option<String>) {
        let c = json_de("Contexto9");
        let de = opt(&c, id).unwrap();
        let k = |k| opt(de, k).map(|v| registro::pruebas::str_de(v).to_string());
        (k("continuidad"), k("panel"))
    }

    fn lecturas9() -> Vec<Lectura> {
        registro::pruebas::lista(&json_de("Lecturas9"))
            .iter()
            .map(lectura)
            .collect()
    }

    // Una respuesta guardada con error o un envío fallido es un panel con problema, no uno capturado.
    #[test]
    fn ronda_el_estado_de_cada_panel_sale_del_registro() {
        let c = Carpeta::nueva("estado-panel");
        let mut p = nueva_puerta(&c.0);
        p.abrir_ronda("¿Pregunta de prueba?").unwrap();
        let estado = |p: &mut Puerta, id, g, f| p.estado_de_panel(id, g, f).unwrap();
        assert_eq!(estado(&mut p, "chatgpt", None, None), "por-pegar");
        registrar_intentos9(&mut p);
        assert_eq!(estado(&mut p, "chatgpt", None, None), "pegado-falta-enviar");
        assert_eq!(estado(&mut p, "grok", None, None), "con-problema");
        let (dos, resto): (Vec<Lectura>, Vec<Lectura>) = lecturas9()
            .into_iter()
            .partition(|l| l.id == "chatgpt" || l.id == "claude");
        p.registrar_capturas(&dos, &contexto9).unwrap();
        let obs = Some("observado");
        assert_eq!(estado(&mut p, "chatgpt", Some(false), obs), "capturado");
        assert_eq!(estado(&mut p, "claude", Some(false), obs), "con-problema");
        // Todos los investigadores, no casi todos: con claude fallido la investigación no se cierra.
        p.registrar_capturas(&resto, &contexto9).unwrap();
        assert_eq!(p.paso_siguiente().unwrap().etapa, "investigacion");
        assert_eq!(estado(&mut p, "chatgpt", Some(false), obs), "capturado");
        assert_eq!(estado(&mut p, "claude", Some(false), obs), "con-problema");
    }

    fn x400(id: &str) -> Lectura {
        Lectura {
            id: id.into(),
            text: "x".repeat(400).into(),
            ..Lectura::default()
        }
    }

    // T21: con la investigación completa el paso ya es la operación aunque no haya sello: el panel está por pegar.
    #[test]
    fn ronda_el_estado_del_panel_sigue_al_paso_cuando_empieza_la_operacion() {
        let c = Carpeta::nueva("panel-sigue-paso");
        let mut p = nueva_puerta(&c.0);
        p.abrir_ronda("¿Pregunta de prueba?").unwrap();
        let lecturas: Vec<Lectura> = pool_puerta().iter().map(|id| x400(id)).collect();
        p.registrar_capturas(&lecturas, &indeterminada).unwrap();
        assert_eq!(p.paso_siguiente().unwrap().etapa, "operacion");
        let obs = Some("observado");
        assert_eq!(
            p.estado_de_panel("chatgpt", Some(false), obs).unwrap(),
            "por-pegar"
        );
        let o = p.armar_operacion("chatgpt", false).unwrap();
        // ESC-013: armada no es pegada; solo la que la interfaz verificó en el panel se marca.
        assert_eq!(
            p.estado_de_panel("chatgpt", Some(false), obs).unwrap(),
            "por-pegar"
        );
        p.operacion_pegada(&o);
        assert_eq!(
            p.estado_de_panel("chatgpt", Some(false), obs).unwrap(),
            "parece-terminado-observado"
        );
    }

    // Caso de falla de PART-007: sin las respuestas del pool la operación se niega, no escribe y el paso sigue en capturar.
    #[test]
    fn ronda_sin_las_respuestas_del_pool_la_operacion_se_niega() {
        let c = Carpeta::nueva("sin-pool");
        let mut p = nueva_puerta(&c.0);
        p.abrir_ronda("¿Pregunta?").unwrap();
        p.registrar_capturas(&[x400("chatgpt")], &confirmada)
            .unwrap();
        let antes = lineas_de(&c.0, &p);
        let e = p.armar_operacion("chatgpt", false).unwrap_err().to_string();
        assert!(
            e.starts_with("faltan respuestas capturadas en esta ronda: gemini, claude"),
            "{e}"
        );
        assert_eq!(lineas_de(&c.0, &p), antes, "no se escribió nada");
        assert_eq!(p.paso_siguiente().unwrap().accion, "capturar");
    }

    #[test]
    fn ronda_el_umbral_de_lectura_es_el_de_la_unity() {
        assert_eq!(UMBRAL_LECTURA_MINIMO, 20);
    }

    // La corrida simulada: nueve lecturas dejan los mismos hechos, byte a byte, que la Unity.
    #[test]
    fn ronda_la_corrida_de_nueve_lecturas_deja_los_mismos_hechos_que_la_unity() {
        let c = Carpeta::nueva("corrida-nueve");
        let mut p = nueva_puerta(&c.0);
        p.abrir_ronda("¿Pregunta de prueba?").unwrap();
        registrar_intentos9(&mut p);
        let (etapa, aviso) = p.registrar_capturas(&lecturas9(), &contexto9).unwrap();
        p.declarar_pregunta("Pregunta declarada de verdad").unwrap();
        let esperadas = strs_del_vector("CorridaLineas");
        let escritas = lineas_de(&c.0, &p);
        assert_eq!(escritas.len(), esperadas.len());
        for (i, (a, b)) in escritas.iter().zip(&esperadas).enumerate() {
            assert_eq!(a, b, "línea {i}");
        }
        let vector = |n| registro::pruebas::str_de(&crate::json::vector(n)).to_string();
        assert_eq!(etapa, vector("CorridaEtapa"));
        assert_eq!(aviso, vector("CorridaAviso"));
        let hechos = hechos_de(&c.0, &p);
        let mut conteo = std::collections::BTreeMap::new();
        for h in &hechos {
            *conteo.entry(h.tipo().to_string()).or_insert(0) += 1;
        }
        let esperado: std::collections::BTreeMap<String, i32> = [
            ("conversacion", 1),
            ("ronda", 1),
            ("condicion-proveedores-cargados", 1),
            ("intento", 9),
            ("respuesta", 9),
            ("cita", 2),
            ("error-captura", 2),
            ("pregunta-declarada", 1),
        ]
        .into_iter()
        .map(|(k, v)| (k.to_string(), v))
        .collect();
        assert_eq!(conteo, esperado);
    }

    // Capturar sin haber enviado: se guarda en una ronda con el marcador y la pregunta declarada pasa a ser la efectiva.
    #[test]
    fn ronda_sin_abrir_la_captura_abre_una_con_el_marcador_y_la_pregunta_se_declara() {
        let c = Carpeta::nueva("sin-ronda");
        let mut p = nueva_puerta(&c.0);
        p.registrar_capturas(&[x400("chatgpt")], &indeterminada)
            .unwrap();
        let hechos = hechos_de(&c.0, &p);
        let rondas: Vec<&Hecho> = de_tipo(&hechos, "ronda").collect();
        assert_eq!(rondas.len(), 1);
        assert_eq!(s(rondas[0], "prompt"), Some(PROMPT_SIN_RONDA));
        assert_eq!(
            dominio::pregunta_efectiva_de_ronda(&hechos, rondas[0]),
            None
        );

        p.declarar_pregunta("La pregunta real").unwrap();
        let hechos = hechos_de(&c.0, &p);
        let ronda = de_tipo(&hechos, "ronda").next().unwrap();
        assert_eq!(
            dominio::pregunta_efectiva_de_ronda(&hechos, ronda).and_then(Texto::como_str),
            Some("La pregunta real")
        );
    }

    // REG-016: abandonar vuelve a la Pregunta y olvida lo pegado; la ronda nueva no hereda prompts.
    #[test]
    fn ronda_abandonada_olvida_los_prompts_pegados() {
        let c = Carpeta::nueva("abandonar-prompts");
        let (mut p, _) = ronda_hasta_la_integracion(&c.0);
        let prompt = p.armar_prompt_integrador().unwrap();
        p.integrador_pegado(prompt);
        assert_eq!(p.paso_siguiente().unwrap().accion, "capturar");
        p.abandonar_ronda();
        assert_eq!(p.paso_siguiente().unwrap().accion, "pegar-pregunta");
        assert!(p.prompt_operador.is_empty());
        assert_eq!(
            (
                &p.prompt_integrador,
                &p.prompt_verificador,
                &p.prompt_redactor,
                &p.marcas_redactor,
                &p.sello_verificaciones
            ),
            (&None, &None, &None, &None, &None)
        );
    }

    // RON-015: el nombre visible de los diez conocidos; un id sin entrada sale con la inicial en mayúscula.
    #[test]
    fn ronda_el_nombre_visible_de_los_diez_conocidos() {
        let nombres: Vec<String> = crate::operacion::CONOCIDOS
            .iter()
            .map(|id| dominio::nombre_proveedor(id))
            .collect();
        assert_eq!(
            nombres,
            [
                "ChatGPT",
                "Gemini",
                "Claude",
                "Grok",
                "Mistral",
                "GLM",
                "Kimi",
                "Qwen",
                "DeepSeek",
                "Perplexity"
            ]
        );
    }

    /// La ronda hasta la redacción: integrador y verificadores capturados, el redactor sin pegar.
    fn ronda_hasta_la_redaccion(c: &Path) -> Puerta {
        let (mut p, lotes) = ronda_hasta_la_integracion(c);
        let prompt = p.armar_prompt_integrador().unwrap();
        p.integrador_pegado(prompt);
        p.registrar_capturas(
            &[lectura(registro::pruebas::campo(
                &lotes,
                "integradorCompleto",
            ))],
            &confirmada,
        )
        .unwrap();
        let prompt = p.armar_prompt_verificador().unwrap();
        p.verificador_pegado(prompt);
        p.registrar_capturas(&lote(&lotes, "verificador"), &confirmada)
            .unwrap();
        p
    }

    /// La app reabierta: otra Puerta sobre el mismo registro, sin nada pegado en este proceso.
    fn reabierta(c: &Path) -> Puerta {
        let mut q = puerta_con_ids_desde(c, 1000);
        q.restaurar_ronda_activa();
        q
    }

    // RED-005 y ARR-003: reabierta la app, la ronda vuelve con su etapa y el redactor usa las marcas,
    // el prompt y el sello de la redacción anterior; sin redacción anterior quedan vacíos.
    #[test]
    fn ronda_reabierta_retoma_su_etapa_y_el_redactor_usa_las_marcas_anteriores() {
        let redactor = || lectura(&json_de("LecturaRedactorOperacion"));
        let campos = |h: &Hecho| {
            [
                "marcaPrimera",
                "marcaUltima",
                "promptCompleto",
                "selloVerificaciones",
            ]
            .map(|k| h.valor(k).clone())
        };

        let c = Carpeta::nueva("reabierta-con-marcas");
        let mut p = ronda_hasta_la_redaccion(&c.0);
        let archivo = p.armar_redactor().unwrap();
        p.redactor_pegado(&archivo);
        p.registrar_capturas(&[redactor()], &confirmada).unwrap();
        let mut q = reabierta(&c.0);
        assert_eq!(q.ronda_actual(), p.ronda_actual());
        let paso = q.paso_siguiente().unwrap();
        assert_eq!((paso.etapa, paso.accion), ("informe", "armar-informe"));
        q.registrar_capturas(&[redactor()], &confirmada).unwrap();
        let hechos = hechos_de(&c.0, &q);
        let r: Vec<&Hecho> = de_tipo(&hechos, "respuesta-redactor").collect();
        assert_eq!(r.len(), 2);
        assert_eq!(campos(r[1]), campos(r[0]));
        assert!(s(r[0], "marcaUltima").is_some_and(|m| !m.is_empty()));

        let c = Carpeta::nueva("reabierta-sin-marcas");
        drop(ronda_hasta_la_redaccion(&c.0));
        let mut q = reabierta(&c.0);
        let paso = q.paso_siguiente().unwrap();
        assert_eq!((paso.etapa, paso.accion), ("redaccion", "pegar-redactor"));
        q.registrar_capturas(&[redactor()], &confirmada).unwrap();
        let hechos = hechos_de(&c.0, &q);
        let r = de_tipo(&hechos, "respuesta-redactor").next().unwrap();
        assert_eq!(
            campos(r),
            [
                Valor::Nulo,
                Valor::Nulo,
                Valor::Texto(PROMPT_NO_DISPONIBLE.into()),
                Valor::Nulo
            ]
        );
    }

    // RON-016: una pregunta declarada en blanco no se escribe; un surrogate suelto no es blanco.
    #[test]
    fn ronda_la_pregunta_declarada_en_blanco_no_se_escribe() {
        let c = Carpeta::nueva("declarar-blanco");
        let mut p = nueva_puerta(&c.0);
        p.abrir_ronda("¿Pregunta?").unwrap();
        let antes = lineas_de(&c.0, &p);
        for blanco in ["", "  \n\t\u{3000}"] {
            assert_eq!(
                crate::ronda::declarar(&mut p, &blanco.into()).unwrap(),
                Err(crate::ronda::DECLARADA_VACIA)
            );
        }
        assert_eq!(lineas_de(&c.0, &p), antes, "no se escribió nada");
        let suelto = Texto::desde_utf16(&[0x20, 0xD800]);
        assert_eq!(
            crate::ronda::declarar(&mut p, &suelto).unwrap(),
            Ok(crate::ronda::DECLARADA)
        );
        let hechos = hechos_de(&c.0, &p);
        let declarada = de_tipo(&hechos, "pregunta-declarada").next().unwrap();
        assert_eq!(declarada.texto("texto"), Some(&suelto));
    }

    #[test]
    fn ronda_declarar_sin_ronda_abierta_se_niega() {
        let c = Carpeta::nueva("declarar-sin-ronda");
        assert!(nueva_puerta(&c.0).declarar_pregunta("x").is_err());
    }

    #[test]
    fn ronda_el_aviso_de_prompts_es_el_de_la_unity() {
        use crate::registro::pruebas::{campo, lista, str_de};
        for caso in lista(&json_de("AvisosPrompts")) {
            let textos: Vec<Option<Texto>> = lista(campo(caso, "textos"))
                .iter()
                .map(|t| match t {
                    Valor::Texto(t) => Some(t.clone()),
                    _ => None,
                })
                .collect();
            assert_eq!(
                aviso_prompts_de_captura(
                    textos.iter().map(Option::as_ref),
                    str_de(campo(caso, "etapa"))
                ),
                str_de(campo(caso, "aviso")),
                "{textos:?}"
            );
        }
    }
}
