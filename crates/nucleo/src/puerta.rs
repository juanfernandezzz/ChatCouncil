//! La Puerta mínima (Puerta.cs de la Unity, D13): la conversación y la ronda en curso, y los comandos
//! que dejan sus hechos en el registro. Solo REG-008 a REG-011 y REG-014 a REG-016; el resto de la
//! Puerta llega con las partes que portan sus etapas.

use crate::dominio;
use crate::json::Valor;
use crate::registro::{self, Hecho, RegistroLeido};
use crate::texto::Texto;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::rc::Rc;
use std::time::{SystemTime, UNIX_EPOCH};

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
        );
        // Vigente solo si su hecho quedó escrito: si no, las rondas irían a un registro sin conversación
        // y no se restaurarían (revisión PART-003; la Unity la fijaba antes de escribir).
        registro::agregar(&self.carpeta, &id, &h)?;
        self.conversacion_actual = Some(id);
        Ok(())
    }

    /// REG-010: escribe la Ronda con su semilla y, como condición suya, qué proveedores estaban
    /// cargados y quién integra.
    pub fn abrir_ronda(&mut self, prompt: &str) -> io::Result<String> {
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
        );
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
        );
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
            );
            self.escribir(&h)?;
        }
        Ok(())
    }
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
        let mut n = 0;
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
        registro::agregar(c, conversacion, &Hecho::nuevo(tipo, &v)).unwrap();
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
