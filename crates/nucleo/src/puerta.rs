//! La Puerta mínima (Puerta.cs de la Unity, D13): la conversación y la ronda en curso, y los comandos
//! que dejan sus hechos en el registro. REG-008 a REG-011, REG-014 a REG-016 y la operación (OPE-001,
//! OPE-002, OPE-012, OPE-013); el resto de la Puerta llega con las partes que portan sus etapas.

use crate::dominio;
use crate::json::Valor;
use crate::operacion::{self, EntradaSello, INTERVALO_MARCA, RespuestaParaOperar};
use crate::parseos;
use crate::prompts;
use crate::registro::{self, Hecho, RegistroLeido};
use crate::texto::Texto;
use std::collections::HashMap;
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
    integrador: Option<String>,
    total_operadores: usize,
    indice_ronda: i64,
    conversacion_actual: Option<String>,
    ronda_actual: Option<String>,
    ultima_lectura: Option<(String, u64, SystemTime, Rc<RegistroLeido>)>,
    /// Segundos al este de UTC de la hora local en ese instante: la de los nombres de archivo.
    desfase_local: fn(SystemTime) -> i64,
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
    /// `integrador` es el de los roles elegidos; `total_operadores`, el largo del pool de operadores.
    pub fn new(
        carpeta: PathBuf,
        nuevo_id: Box<dyn FnMut() -> String>,
        reloj: Box<dyn Fn() -> SystemTime>,
        activos: Vec<String>,
        integrador: Option<String>,
        total_operadores: usize,
    ) -> Puerta {
        Puerta {
            carpeta,
            nuevo_id,
            reloj,
            activos,
            integrador,
            total_operadores,
            indice_ronda: 0,
            conversacion_actual: None,
            ronda_actual: None,
            ultima_lectura: None,
            desfase_local: desfase_local_del_sistema,
        }
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
                        self.total_operadores,
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

    /// REG-016 (D13): vuelve a la etapa Pregunta sin escribir nada; la conversación sigue.
    pub fn abandonar_ronda(&mut self) {
        self.ronda_actual = None;
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
                    self.integrador
                        .as_deref()
                        .map_or(Valor::Nulo, |i| Valor::Texto(i.into())),
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
    /// `pool` es el de operadores en su orden fijo, de donde salen los P#.
    pub fn armar_operacion(
        &mut self,
        pool: &[&str],
        operador_id: &str,
        con_archivo: bool,
    ) -> io::Result<Operacion> {
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
        let cadena =
            |t: Option<&Texto>| t.map(|t| t.para_mostrar().to_string()).unwrap_or_default();
        let para_tabla: Vec<prompts::HallazgoParaTabla> =
            dominio::salidas_vigentes_de_ronda(&leido.hechos, &id)
                .iter()
                .flat_map(|s| {
                    s.hallazgos.iter().map(|h| prompts::HallazgoParaTabla {
                        hallazgo_id_original: cadena(h.texto("id")),
                        categoria: h.texto("categoria").cloned().unwrap_or_default(),
                        eje: h.texto("eje").cloned(),
                        etiquetas: match h.valor("etiquetas") {
                            Valor::Lista(l) => l
                                .iter()
                                .filter_map(|v| match v {
                                    Valor::Texto(t) => Some(t.clone()),
                                    _ => None,
                                })
                                .collect(),
                            _ => Vec::new(),
                        },
                        descripcion: h.texto("descripcion").cloned().unwrap_or_default(),
                        operador_id_original: cadena(s.operador_id),
                    })
                })
                .collect();
        let tabla = prompts::armar_tabla_hallazgos(&para_tabla, pool, semilla).map_err(falla)?;
        Ok((leido, ronda, pregunta, tabla))
    }

    /// INT-003: el prompt del integrador con la tabla de hallazgos de la ronda.
    pub fn armar_prompt_integrador(&mut self, pool: &[&str]) -> io::Result<Texto> {
        let (_, _, pregunta, tabla) = self.tabla_de_ronda(pool, "integrador")?;
        Ok(prompts::armar_prompt_integrador(
            &pregunta,
            &tabla.para_prompt,
        ))
    }

    /// VER-001, INT-006: la sección QUE CONVIENE RESCATAR del último informe del integrador, tal
    /// cual, y solo los H## que esa sección cita, en orden de primera aparición. Un H## que no está
    /// en la tabla no se inventa.
    pub fn armar_prompt_verificador(&mut self, pool: &[&str]) -> io::Result<Texto> {
        let (leido, ronda, pregunta, tabla) = self.tabla_de_ronda(pool, "verificador")?;
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
    pub fn armar_redactor(
        &mut self,
        pool: &[&str],
        verificadores: &[&str],
    ) -> io::Result<ArchivoRedactor> {
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
    pub fn ronda_nueva_con_respuestas_copiadas(&mut self, pool: &[&str]) -> io::Result<String> {
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
    pub fn reutilizar_operacion(
        &mut self,
        pool: &[&str],
        operador_id: &str,
    ) -> io::Result<(bool, String)> {
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
    use std::time::Duration;

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
            POOL.iter().map(|s| s.to_string()).collect(),
            Some("deepseek".into()),
            POOL.len(),
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
            r#"{"tipo":"condicion-proveedores-cargados","esquema":1,"id":"00000000-0000-4000-8000-000000000004","rondaId":"00000000-0000-4000-8000-000000000003","proveedores":["chatgpt","gemini","claude","grok","mistral","kimi","qwen"],"integrador":"deepseek","registradoEn":"2026-10-06T12:00:00.000Z"}"#,
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
            operaciones.push(p.armar_operacion(&pool, op, *op == "kimi").unwrap());
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
        let pool = pool_puerta();
        let pool: Vec<&str> = pool.iter().map(String::as_str).collect();
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
        let mensaje = p.ronda_nueva_con_respuestas_copiadas(&pool).unwrap();
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
        p.armar_operacion(&pool, "chatgpt", false).unwrap();
        let kimi = p.reutilizar_operacion(&pool, "kimi").unwrap();
        let chatgpt = p.reutilizar_operacion(&pool, "chatgpt").unwrap();
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
        let pool = pool_puerta();
        let pool: Vec<&str> = pool.iter().map(String::as_str).collect();
        let mut vacia = nueva_puerta(&c.0);
        assert_eq!(
            vacia.ronda_nueva_con_respuestas_copiadas(&pool).unwrap(),
            "No hay una ronda activa de la que copiar."
        );
        assert_eq!(
            vacia.reutilizar_operacion(&pool, "kimi").unwrap(),
            (false, "no hay una ronda activa".to_string())
        );
        let mut p = puerta_en_corrida(&c.0, &lineas_corrida()[..=12]);
        let antes = lineas(&c.0, CONVERSACION_CORRIDA);
        assert_eq!(
            p.reutilizar_operacion(&pool, "glm").unwrap(),
            (false, "\"GLM\" no es un operador del pool.".to_string())
        );
        assert_eq!(
            p.reutilizar_operacion(&pool, "kimi").unwrap(),
            (false, "Esta ronda todavía no tiene sello: pega primero la operación en algún panel («Pegar la operación aquí»).".to_string())
        );
        assert_eq!(lineas(&c.0, CONVERSACION_CORRIDA), antes);
    }

    #[test]
    fn parseos_la_ronda_copiada_conserva_un_surrogate_suelto_de_la_pregunta() {
        // revisión PART-005: Puerta.cs:753 pasa el string intacto a AbrirRonda.
        let c = Carpeta::nueva("operacion-reuso-surrogate");
        let pool = pool_puerta();
        let pool: Vec<&str> = pool.iter().map(String::as_str).collect();
        let mut corrida = lineas_corrida()[..=12].to_vec();
        corrida[1] = corrida[1].replace("\"prompt\":\"¿Qué", "\"prompt\":\"\\ud800¿Qué");
        let mut p = puerta_en_corrida(&c.0, &corrida);
        p.ronda_nueva_con_respuestas_copiadas(&pool).unwrap();
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
        let pool = pool_puerta();
        let pool: Vec<&str> = pool.iter().map(String::as_str).collect();
        let prompt_de = |i: usize| {
            hecho_de_corrida(&todas, i)
                .texto("promptCompleto")
                .cloned()
                .unwrap()
        };

        let c = Carpeta::nueva("roles-integrador");
        let mut p = puerta_en_corrida(&c.0, &todas[..49]);
        assert_eq!(p.armar_prompt_integrador(&pool).unwrap(), prompt_de(49));

        let c = Carpeta::nueva("roles-verificador");
        let mut p = puerta_en_corrida(&c.0, &todas[..=50]);
        let verificador = p.armar_prompt_verificador(&pool).unwrap();
        assert_eq!(verificador, prompt_de(51));
        assert_eq!(verificador, prompt_de(52));

        let c = Carpeta::nueva("roles-redactor");
        let mut p = puerta_en_corrida(&c.0, &todas[..=52]);
        // Los ids de la Unity: siete del armado de cuerpos (111 a 117) y el token (118).
        ids_desde(&mut p, 111);
        let antes = lineas(&c.0, CONVERSACION_CORRIDA);
        let r = p.armar_redactor(&pool, &["glm", "qwen"]).unwrap();
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
        let pool = pool_puerta();
        let pool: Vec<&str> = pool.iter().map(String::as_str).collect();
        let errores = |p: &mut Puerta| {
            [
                p.armar_prompt_integrador(&pool).unwrap_err().to_string(),
                p.armar_prompt_verificador(&pool).unwrap_err().to_string(),
                p.armar_redactor(&pool, &["glm", "qwen"])
                    .unwrap_err()
                    .to_string(),
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
        let pool = pool_puerta();
        let pool: Vec<&str> = pool.iter().map(String::as_str).collect();
        let c = Carpeta::nueva("roles-sin-informe");
        let mut p = puerta_en_corrida(&c.0, &todas[..49]);
        assert_eq!(
            p.armar_prompt_verificador(&pool).unwrap_err().to_string(),
            "la ronda todavía no tiene un informe del integrador capturado"
        );
        assert_eq!(
            p.armar_redactor(&pool, &["glm", "qwen"])
                .unwrap_err()
                .to_string(),
            "la ronda todavía no tiene un informe del integrador capturado"
        );
        let c = Carpeta::nueva("roles-sin-rescate");
        let mut p = puerta_en_corrida(&c.0, &todas[..=49]);
        assert_eq!(
            p.armar_prompt_verificador(&pool).unwrap_err().to_string(),
            "el informe del integrador no tiene la seccion QUE CONVIENE RESCATAR. Se capturó (primeros 100 caracteres): \"TITULO: Informe a medias Texto incompleto [H1].\""
        );
    }

    /// RED-003: sin verificación capturada el archivo se arma igual, lo dice, y se avisa.
    #[test]
    fn prompts_el_redactor_sin_verificacion_se_arma_y_avisa() {
        let todas = lineas_corrida();
        let pool = pool_puerta();
        let pool: Vec<&str> = pool.iter().map(String::as_str).collect();
        let c = Carpeta::nueva("roles-sin-verificacion");
        let mut p = puerta_en_corrida(&c.0, &todas[..=50]);
        let r = p.armar_redactor(&pool, &["glm", "qwen"]).unwrap();
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
        let pool = pool_puerta();
        let pool: Vec<&str> = pool.iter().map(String::as_str).collect();
        let error = |p: &mut Puerta| {
            p.armar_operacion(&pool, "chatgpt", false)
                .unwrap_err()
                .to_string()
        };

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
        let pool = pool_puerta();
        let pool: Vec<&str> = pool.iter().map(String::as_str).collect();
        let mut lineas_sin = todas[..=12].to_vec();
        lineas_sin[1] = lineas_sin[1].replace(
            "\"semilla\":\"00000000-0000-4000-8000-000000000002\"",
            "\"semilla\":null",
        );
        assert_ne!(lineas_sin[1], todas[1]);
        let mut p = puerta_en_corrida(&c.0, &lineas_sin);
        let antes = lineas(&c.0, CONVERSACION_CORRIDA);
        assert_eq!(
            p.armar_operacion(&pool, "chatgpt", false)
                .unwrap_err()
                .to_string(),
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
        let pool = pool_puerta();
        let pool: Vec<&str> = pool.iter().map(String::as_str).collect();
        let mut p = puerta_en_corrida(&c.0, &todas[..=12]);
        p.armar_operacion(&pool, "chatgpt", false).unwrap();
        let mismo = p.armar_operacion(&pool, "gemini", false);
        assert!(mismo.is_ok(), "el mismo sello recalculado coincide");
        let corregida = todas[10].replace("00000000-0000-4000-8000-000000000012", "corregida");
        assert_ne!(corregida, todas[10]);
        let hecho = registro::leer(&format!("{corregida}\n")).hechos.remove(0);
        registro::agregar(&c.0, CONVERSACION_CORRIDA, &hecho).unwrap();
        let antes = lineas(&c.0, CONVERSACION_CORRIDA);
        let e = p
            .armar_operacion(&pool, "claude", false)
            .unwrap_err()
            .to_string();
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
        let pool = pool_puerta();
        let pool: Vec<&str> = pool.iter().map(String::as_str).collect();
        let mut p = puerta_en_corrida(&c.0, &lineas_corrida()[..=12]);
        let antes = lineas(&c.0, CONVERSACION_CORRIDA);
        assert_eq!(
            p.armar_operacion(&pool, "deepseek", false)
                .unwrap_err()
                .to_string(),
            "\"DeepSeek\" no es un operador del pool: no tiene cuerpo que operar"
        );
        assert_eq!(
            p.armar_operacion(&pool, "nuevo", false)
                .unwrap_err()
                .to_string(),
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
                let o = p.armar_operacion(&pool, op, *op == "kimi").unwrap();
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
}
