//! InformeFinal de la Unity: el informe se arma en código, nunca con un modelo. Junta datos ya
//! resueltos en el formato exacto y no decide nada (INF-002 a INF-007, INF-011).
//!
//! Los textos se recorren en bytes WTF-8: corchetes, saltos, «H» y dígitos son ASCII, y en WTF-8
//! un byte ASCII nunca aparece dentro de un punto de varios bytes, así que la regla es la misma
//! que la de la Unity sobre UTF-16 sin pasar por UTF-16.

use std::collections::{HashMap, HashSet};
use std::io;

use crate::dominio::nombre_proveedor;
use crate::parseos;
use crate::registro::{self, Hecho};
use crate::texto::Texto;

#[derive(Debug, Clone, PartialEq)]
pub struct HallazgoResuelto {
    pub codigo: String,
    pub categoria: Texto,
    pub eje: Option<Texto>,
    pub respuestas_reales: Vec<String>,
    pub descripcion: Texto,
    pub operador_real: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ReferenciaResuelta {
    pub codigo: String,
    pub existe: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CondicionProveedor {
    pub proveedor_id: String,
    pub etiqueta_modelo: Option<Texto>,
    /// Unidades UTF-16, el .Length de la Unity.
    pub caracteres_respuesta: usize,
    pub fuentes_citadas: usize,
    pub codigo_estable: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ParticipacionOperador {
    pub operador_id: String,
    /// ok, sin-hallazgos o fallo.
    pub estado: String,
    pub detalle: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RedaccionParaInforme {
    pub redactor_id: String,
    pub controles: Vec<String>,
    pub cuerpo: Texto,
    /// D62: (etiqueta, verificadorId) de las verificaciones A y B que recibió; vacía = sin clave.
    pub sello_verificaciones: Vec<(String, String)>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ItemVerificacion {
    pub correspondencia: String,
    pub tipos_fuente: Vec<String>,
    pub tipos_no_reconocidos: Vec<Texto>,
    pub formato_anterior: bool,
    pub hallazgo_id: Texto,
    pub descripcion: Option<Texto>,
    pub url: Option<Texto>,
    pub comprobacion: String,
    pub texto: Texto,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PuntoCiegoInforme {
    pub descripcion: Texto,
    pub url: Option<Texto>,
    pub tipos_fuente: Vec<String>,
    pub tipos_no_reconocidos: Vec<Texto>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct VerificacionParaInforme {
    /// El proveedor que verificó: su nombre va en los encabezados cuando hay dos (D62).
    pub verificador_id: String,
    pub aviso_sin_comprobar: Option<String>,
    pub items: Vec<ItemVerificacion>,
    pub puntos_ciegos: Vec<PuntoCiegoInforme>,
    pub preguntas: Vec<Texto>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct InformeFinalInput {
    pub pregunta: Texto,
    pub fecha: String,
    pub conversacion_id: String,
    pub ronda_id: String,
    pub informe_integrador_crudo: Option<Texto>,
    pub referencias_en_orden: Vec<ReferenciaResuelta>,
    pub hallazgos: Vec<HallazgoResuelto>,
    pub participacion_operadores: Vec<ParticipacionOperador>,
    pub condiciones: Vec<CondicionProveedor>,
    pub integridad_entrega: String,
    pub semilla: Texto,
    pub proveedores_cargados_incompletos: Option<Vec<String>>,
    pub integrador: Option<String>,
    /// Una por verificador, el 1 primero; vacía = no hubo verificación.
    pub verificaciones: Vec<VerificacionParaInforme>,
    pub redaccion: Option<RedaccionParaInforme>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RespuestaParaPdf {
    pub proveedor_id: String,
    pub etiqueta_modelo: Option<Texto>,
    pub leida_en: String,
    pub texto_original: Texto,
    pub error: Option<Texto>,
    pub fuentes_citadas: usize,
    pub fuentes_href: Option<i64>,
    pub fin_de: Option<String>,
}

const ENCABEZADO_REDACCION: &str = "## Respuesta a la pregunta (aporte del redactor)";
const ENCABEZADO_RESCATE: &str = "## Qué conviene rescatar";
const ENCABEZADO_VERIFICACION: &str =
    "## Verificación de fuentes (aporte de un modelo con búsqueda, no verificado por el consejo)";
const ENCABEZADO_PUNTOS_CIEGOS: &str =
    "## Puntos ciegos y preguntas derivadas (aporte del verificador)";
const SIN_INFORME_INTEGRADOR: &str = "No se capturo informe del integrador para esta ronda.";
const SIN_TABLA: &str =
    "La tabla de hallazgos de esta ronda está vacía: ningún operador dejó hallazgos parseables.";

/// Nombre literal de la subcarpeta, dentro de la carpeta del informe.
pub const SUBCARPETA_RESPUESTAS: &str = "Respuestas de los investigadores";

/// Un Texto armado por tramos.
struct T(Texto);

impl T {
    fn de(s: &str) -> T {
        T(Texto::from(s))
    }
    fn s(mut self, s: &str) -> T {
        self.0.empujar_str(s);
        self
    }
    fn t(mut self, t: &Texto) -> T {
        self.0.empujar_texto(t);
        self
    }
}

fn unir(partes: &[Texto], sep: &str) -> Texto {
    let mut r = Texto::con_capacidad(partes.iter().map(|p| p.bytes().len() + sep.len()).sum());
    for (i, p) in partes.iter().enumerate() {
        if i > 0 {
            r.empujar_str(sep);
        }
        r.empujar_texto(p);
    }
    r
}

fn pal(c: u8) -> bool {
    c.is_ascii_alphanumeric() || c == b'_'
}

/// MarcarReferencias: cada H## de cada grupo entre corchetes ([H12], [CONFIRMA H12]) queda
/// «H## ✓» o «H## ✗ referencia inexistente» (INF-003).
fn marcar_referencias(texto: &Texto, existentes: &HashSet<&str>) -> Texto {
    let s = texto.bytes();
    let mut r = Texto::con_capacidad(s.len() + 64);
    let mut desde = 0;
    let mut i = 0;
    while i < s.len() {
        // Corchetes: \[[^\]\n]*\]
        let cierre = (s[i] == b'[')
            .then(|| s[i + 1..].iter().position(|&c| c == b']' || c == b'\n'))
            .flatten()
            .map(|k| i + 1 + k)
            .filter(|&j| s[j] == b']');
        let Some(j) = cierre else {
            i += 1;
            continue;
        };
        // CodigoH dentro del grupo: Borde H[0-9]+ Borde.
        let mut k = i + 1;
        while k < j {
            let fin = k
                + 1
                + s[k + 1..j]
                    .iter()
                    .take_while(|c| c.is_ascii_digit())
                    .count();
            if s[k] == b'H' && !pal(s[k - 1]) && fin > k + 1 && !pal(s[fin]) {
                r.empujar_wtf8(&s[desde..fin]);
                let codigo = std::str::from_utf8(&s[k..fin]).unwrap();
                r.empujar_str(if existentes.contains(codigo) {
                    " ✓"
                } else {
                    " ✗ referencia inexistente"
                });
                desde = fin;
                k = fin;
            } else {
                k += 1;
            }
        }
        i = j + 1;
    }
    r.empujar_wtf8(&s[desde..]);
    r
}

/// [[CC-[^\]\n]*\]\] desde i; devuelve dónde termina.
fn marca_cc(s: &[u8], i: usize) -> Option<usize> {
    if !s[i..].starts_with(b"[[CC-") {
        return None;
    }
    let j = i + 5 + s[i + 5..].iter().position(|&c| c == b']' || c == b'\n')?;
    s[j..].starts_with(b"]]").then_some(j + 2)
}

fn espacios(s: &[u8], mut i: usize) -> usize {
    while i < s.len() && (s[i] == b' ' || s[i] == b'\t') {
        i += 1;
    }
    i
}

/// SinMarcasDeIntegridad: las [[CC-MARCA-…]] se quitan del informe (nunca del registro) y se
/// cuentan; primero la que ocupa su propia línea, con su salto (INF-004).
fn sin_marcas_de_integridad(texto: &Texto) -> (Texto, usize) {
    let mut quitadas = 0;
    // (?:\A|(?<=[\n\r  ]))[ \t]*\[\[CC-[^\]\n]*\]\][ \t]*\n
    let s = texto.bytes();
    let mut a = Texto::con_capacidad(s.len());
    let (mut desde, mut i) = (0, 0);
    while i < s.len() {
        let inicio_de_linea = i == 0
            || matches!(s[i - 1], b'\n' | b'\r')
            || (i >= 3 && s[i - 3] == 0xE2 && s[i - 2] == 0x80 && matches!(s[i - 1], 0xA8 | 0xA9));
        let fin = inicio_de_linea
            .then(|| marca_cc(s, espacios(s, i)))
            .flatten()
            .map(|j| espacios(s, j))
            .filter(|&j| s.get(j) == Some(&b'\n'));
        match fin {
            Some(j) => {
                a.empujar_wtf8(&s[desde..i]);
                quitadas += 1;
                i = j + 1;
                desde = i;
            }
            None => i += 1,
        }
    }
    a.empujar_wtf8(&s[desde..]);
    // [ \t]*\[\[CC-[^\]\n]*\]\]
    let s = a.bytes();
    let mut b = Texto::con_capacidad(s.len());
    let (mut desde, mut i) = (0, 0);
    while i < s.len() {
        match marca_cc(s, espacios(s, i)) {
            Some(j) => {
                b.empujar_wtf8(&s[desde..i]);
                quitadas += 1;
                i = j;
                desde = j;
            }
            None => i += 1,
        }
    }
    b.empujar_wtf8(&s[desde..]);
    (b, quitadas)
}

fn entrada_hallazgo(h: &HallazgoResuelto) -> Texto {
    let mut l = T::de("**").s(&h.codigo).s("** — ").t(&h.categoria);
    if let Some(eje) = &h.eje {
        l = l.s(" · ").t(eje);
    }
    l = l
        .s("\nRegistrado por: ")
        .s(&nombre_proveedor(&h.operador_real));
    if !h.respuestas_reales.is_empty() {
        let nombres: Vec<String> = h
            .respuestas_reales
            .iter()
            .map(|p| nombre_proveedor(p))
            .collect();
        l = l
            .s("\nRespuestas que lo sostienen: ")
            .s(&nombres.join(", "));
    }
    l.s("\n> ").t(&h.descripcion).0
}

fn fila_condicion(c: &CondicionProveedor) -> Texto {
    let etiqueta = c
        .etiqueta_modelo
        .clone()
        .unwrap_or_else(|| "(no observada)".into());
    T::de("| ")
        .s(c.codigo_estable.as_deref().unwrap_or("(sin sello)"))
        .s(" | ")
        .s(&nombre_proveedor(&c.proveedor_id))
        .s(" | ")
        .t(&etiqueta)
        .s(&format!(
            " | {} | {} |",
            c.caracteres_respuesta, c.fuentes_citadas
        ))
        .0
}

fn tipos_legibles(tipos: &[String], no_reconocidos: &[Texto], sin_fuente: &str) -> Texto {
    let mut partes = Vec::new();
    if !tipos.is_empty() {
        partes.push(Texto::from(tipos.join(", ")));
    }
    if !no_reconocidos.is_empty() {
        partes.push(
            T::de("tipo no reconocido: ")
                .t(&unir(no_reconocidos, ", "))
                .0,
        );
    }
    if partes.is_empty() {
        sin_fuente.into()
    } else {
        unir(&partes, "; ")
    }
}

/// nombre None = un solo verificador: los encabezados de siempre (D62).
fn secciones_verificacion(v: &VerificacionParaInforme, nombre: Option<&str>) -> Vec<Texto> {
    let items: Vec<Texto> = v
        .items
        .iter()
        .map(|i| {
            let tipos = if i.formato_anterior {
                "tipo de fuente no registrado (formato anterior)".into()
            } else {
                tipos_legibles(
                    &i.tipos_fuente,
                    &i.tipos_no_reconocidos,
                    if i.correspondencia == "NO_ENCONTRADA" {
                        "sin fuente"
                    } else {
                        "tipo no declarado"
                    },
                )
            };
            let descripcion = i
                .descripcion
                .clone()
                .unwrap_or_else(|| "(ese hallazgo no existe en la tabla de la ronda)".into());
            let mut l = T::de(&i.correspondencia)
                .s(" · ")
                .t(&tipos)
                .s(" — [")
                .t(&i.hallazgo_id)
                .s("] ")
                .t(&descripcion);
            l = match &i.url {
                None => l.s("\nFuente: sin fuente — ").t(&i.texto),
                Some(u) => l.s("\nFuente: ").t(u).s(" — ").s(&i.comprobacion),
            };
            if i.url.is_some() && !i.texto.bytes().is_empty() {
                l = l.s("\n> ").t(&i.texto);
            }
            l.0
        })
        .collect();
    let mut aportes: Vec<Texto> = v
        .puntos_ciegos
        .iter()
        .map(|p| {
            let l = T::de("- Punto ciego: ").t(&p.descripcion);
            match &p.url {
                None => l.s(" — Fuente: sin fuente").0,
                Some(u) => {
                    l.s(" — Fuente: ")
                        .t(u)
                        .s(" (")
                        .t(&tipos_legibles(
                            &p.tipos_fuente,
                            &p.tipos_no_reconocidos,
                            "tipo no declarado",
                        ))
                        .s(")")
                        .0
                }
            }
        })
        .collect();
    aportes.extend(
        v.preguntas
            .iter()
            .map(|q| T::de("- Pregunta derivada: ").t(q).0),
    );
    let mut r: Vec<Texto> = vec![
        match nombre {
            None => ENCABEZADO_VERIFICACION.into(),
            Some(n) => format!("## Verificación de fuentes — {n} (aporte de un modelo con búsqueda, no verificado por el consejo)").into(),
        },
        "".into(),
    ];
    if let Some(aviso) = v.aviso_sin_comprobar.as_deref().filter(|a| !a.is_empty()) {
        r.extend([aviso.into(), "".into()]);
    }
    r.extend([
        if items.is_empty() {
            "El verificador no registró líneas de correspondencia con la fuente.".into()
        } else {
            unir(&items, "\n\n")
        },
        "".into(),
        match nombre {
            None => ENCABEZADO_PUNTOS_CIEGOS.into(),
            Some(n) => {
                format!("## Puntos ciegos y preguntas derivadas — {n} (aporte del verificador)")
                    .into()
            }
        },
        "".into(),
        if aportes.is_empty() {
            "El verificador no registró puntos ciegos ni preguntas derivadas.".into()
        } else {
            unir(&aportes, "\n")
        },
        "".into(),
    ]);
    r
}

/// InformeFinal.Armar: el .md del informe, en el orden de INF-002.
pub fn armar(input: &InformeFinalInput) -> Texto {
    let existentes: HashSet<&str> = input.hallazgos.iter().map(|h| h.codigo.as_str()).collect();
    // La línea "TITULO:" pasa a ser el encabezado y no se muestra en la lectura del integrador.
    let (titulo, cuerpo_integrador) = match &input.informe_integrador_crudo {
        Some(crudo) => {
            let (t, c) = parseos::extraer_titulo_del_informe(crudo);
            (t, Some(c))
        }
        None => (None, None),
    };
    let lectura = match &cuerpo_integrador {
        None => SIN_INFORME_INTEGRADOR.into(),
        Some(c) => marcar_referencias(c, &existentes),
    };
    // La sección 5 del integrador va al principio: es lo que lee quien hizo la pregunta.
    let rescate = cuerpo_integrador
        .as_ref()
        .and_then(parseos::extraer_seccion_rescate)
        .map(|r| marcar_referencias(&r, &existentes));

    // Referenciados: solo los que existen, en orden de primera aparición.
    let mut referenciados = Vec::new();
    let mut vistos: HashSet<&str> = HashSet::new();
    for r in &input.referencias_en_orden {
        if !r.existe || !vistos.insert(r.codigo.as_str()) {
            continue;
        }
        if let Some(h) = input.hallazgos.iter().find(|h| h.codigo == r.codigo) {
            referenciados.push(h);
        }
    }
    let no_referenciados: Vec<&HallazgoResuelto> = input
        .hallazgos
        .iter()
        .filter(|h| !vistos.contains(h.codigo.as_str()))
        .collect();
    let limitaciones: Vec<&HallazgoResuelto> = input
        .hallazgos
        .iter()
        .filter(|h| h.categoria.bytes().starts_with(b"LIMITACION:"))
        .collect();
    let entradas = |hs: &[&HallazgoResuelto]| {
        unir(
            &hs.iter().map(|h| entrada_hallazgo(h)).collect::<Vec<_>>(),
            "\n\n",
        )
    };

    // Sin tabla, sin integrador o sin referencias se dicen por separado: un encabezado en blanco no
    // se distingue de un defecto de armado.
    let sin_tabla = input.hallazgos.is_empty();
    let seccion_referenciados: Texto = if sin_tabla {
        SIN_TABLA.into()
    } else if !referenciados.is_empty() {
        entradas(&referenciados)
    } else if cuerpo_integrador.is_none() {
        format!(
            "{SIN_INFORME_INTEGRADOR} Sin informe no hay referencias que resolver: los {} hallazgos de la tabla están completos en \"Hallazgos no referenciados\".",
            input.hallazgos.len()
        )
        .into()
    } else {
        "El integrador no referencio ningun hallazgo de la tabla.".into()
    };
    let seccion_no_referenciados: Texto = if sin_tabla {
        SIN_TABLA.into()
    } else if !no_referenciados.is_empty() {
        entradas(&no_referenciados)
    } else {
        "El integrador referencio todos los hallazgos.".into()
    };
    let seccion_limitaciones: Texto = if sin_tabla {
        SIN_TABLA.into()
    } else if !limitaciones.is_empty() {
        entradas(&limitaciones)
    } else {
        "Ningun operador registro limitaciones.".into()
    };
    let seccion_participacion: Texto = if input.participacion_operadores.is_empty() {
        "No hay operadores registrados para esta ronda.".into()
    } else {
        input
            .participacion_operadores
            .iter()
            .map(|p| {
                format!(
                    "**{}** — {}: {}",
                    nombre_proveedor(&p.operador_id),
                    p.estado,
                    p.detalle
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
            .into()
    };

    let mut partes: Vec<Texto> = vec![
        match &titulo {
            None => "# Informe de ronda".into(),
            Some(t) => T::de("# ").t(t).0,
        },
        "".into(),
    ];
    if let Some(r) = &input.redaccion {
        partes.extend([
            ENCABEZADO_REDACCION.into(),
            "".into(),
            format!(
                "Aporte de un solo modelo ({}), basado en el análisis que sigue. No es un resultado del consejo.",
                nombre_proveedor(&r.redactor_id)
            )
            .into(),
            "".into(),
        ]);
        if !r.sello_verificaciones.is_empty() {
            let clave: Vec<String> = r
                .sello_verificaciones
                .iter()
                .map(|(etiqueta, id)| format!("{etiqueta} = {}", nombre_proveedor(id)))
                .collect();
            partes.extend([
                format!(
                    "Clave de las verificaciones que cita: {}.",
                    clave.join(", ")
                )
                .into(),
                "".into(),
            ]);
        }
        partes.extend(r.controles.iter().map(|c| Texto::from(c.as_str())));
        partes.extend([
            "".into(),
            marcar_referencias(&r.cuerpo, &existentes),
            "".into(),
        ]);
    }
    if let Some(r) = rescate {
        partes.extend([ENCABEZADO_RESCATE.into(), "".into(), r, "".into()]);
    }
    let dos = input.verificaciones.len() > 1;
    for v in &input.verificaciones {
        let nombre = dos.then(|| nombre_proveedor(&v.verificador_id));
        partes.extend(secciones_verificacion(v, nombre.as_deref()));
    }
    partes.extend([
        T::de("**Pregunta:** ").t(&input.pregunta).0,
        format!("**Fecha:** {}", input.fecha).into(),
        "**Eje de registro:** los tres (HECHOS, FUENTES, CONCLUSIONES)".into(),
        "".into(),
        "## Lectura del integrador".into(),
        "".into(),
        lectura,
        "".into(),
        "## Participación de operadores".into(),
        "".into(),
        seccion_participacion,
        "".into(),
        "## Hallazgos referenciados".into(),
        "".into(),
        seccion_referenciados,
        "".into(),
        "## Hallazgos no referenciados".into(),
        "".into(),
        seccion_no_referenciados,
        "".into(),
        "## Limitaciones registradas por los operadores".into(),
        "".into(),
        seccion_limitaciones,
        "".into(),
        "## Condiciones de la ronda".into(),
        "".into(),
    ]);
    // Sin respuestas no se imprime una tabla con encabezado y ninguna fila.
    if input.condiciones.is_empty() {
        partes.push("No hay respuestas de investigador en el registro de esta ronda.".into());
    } else {
        partes.extend([
            "La columna Código es la clave de los [P#] que aparecen en el texto del".into(),
            "redactor y del integrador: es el código estable del sello de esta ronda.".into(),
            "".into(),
            "| Código | Proveedor | Etiqueta de modelo | Caracteres de su respuesta | Fuentes citadas |".into(),
            "|---|---|---|---|---|".into(),
            unir(
                &input
                    .condiciones
                    .iter()
                    .map(fila_condicion)
                    .collect::<Vec<_>>(),
                "\n",
            ),
        ]);
    }
    let integrador = match input.integrador.as_deref().filter(|i| !i.is_empty()) {
        None => "(no registrado)".to_string(),
        Some(i) => nombre_proveedor(i),
    };
    partes.extend([
        "".into(),
        format!("Conversación: {}", input.conversacion_id).into(),
        format!("Ronda: {}", input.ronda_id).into(),
        "".into(),
        format!("Integrador de esta ronda: {integrador}").into(),
        "".into(),
    ]);
    if let Some(cargados) = &input.proveedores_cargados_incompletos {
        partes.push("Proveedores cargados en esta ronda:".into());
        partes.extend(
            cargados
                .iter()
                .map(|p| Texto::from(format!("- {}", nombre_proveedor(p)))),
        );
        partes.push("".into());
    }
    partes.extend([
        format!("**Integridad de entrega:** {}", input.integridad_entrega).into(),
        T::de("**Semilla de la ronda:** ").t(&input.semilla).0,
        "".into(),
        "## Lo que este informe no dice".into(),
        "".into(),
        "Este informe describe cómo se relacionan siete respuestas entre sí. No".into(),
        "determina cuál es correcta. La verificación mecánica comprueba que una fuente".into(),
        "existe y coincide, no que sostenga la afirmación. El informe del integrador es".into(),
        "una afirmación de un modelo con su procedencia registrada, no un resultado".into(),
        "verificado. Las limitaciones completas del instrumento están en".into(),
        "docs/LIMITACIONES.md.".into(),
    ]);

    // Las marcas se quitan al final, de una pasada: entran por tres caminos.
    let (texto, quitadas) = sin_marcas_de_integridad(&unir(&partes, "\n"));
    if quitadas == 0 {
        return texto;
    }
    T(texto)
        .s(&format!(
            "\n\nSe quitaron {quitadas} marca(s) de integridad [[CC-...]] del texto de este informe:\n\
             son instrumentación del archivo que leyeron los modelos, no contenido. El texto\n\
             crudo con las marcas sigue intacto en el registro de la conversación."
        ))
        .0
}

fn otras(n: usize) -> String {
    if n == 1 {
        "la otra sale".into()
    } else {
        format!("las otras {n} salen")
    }
}

/// InformeFinal.VerificacionParaInforme: la salida del verificador resuelta para el informe, cada
/// H## con la descripción de la tabla y cada URL con su comprobación mecánica. Dice por qué quedaron
/// URLs «sin comprobar» y nombra el techo solo si de verdad se alcanzó (INF-007).
pub fn verificacion_para_informe(
    salida: &Hecho,
    urls: &[&Hecho],
    hallazgos: &[HallazgoResuelto],
    techo_urls: Option<usize>,
) -> io::Result<VerificacionParaInforme> {
    let descripcion: HashMap<&str, &Texto> = hallazgos
        .iter()
        .map(|h| (h.codigo.as_str(), &h.descripcion))
        .collect();
    let codigos: Vec<&str> = hallazgos.iter().map(|h| h.codigo.as_str()).collect();
    let id = salida.texto("id");
    let mut comprobada: HashMap<&Texto, Option<i64>> = HashMap::new();
    for u in urls.iter().filter(|u| u.texto("salidaVerificadorId") == id) {
        if let Some(url) = u.texto("url") {
            comprobada.insert(url, u.entero("codigo"));
        }
    }
    let p = parseos::parsear_verificacion(
        &parseos::texto_de_la_salida_verificador(
            &salida.texto("salidaCruda").cloned().unwrap_or_default(),
            salida.texto("html"),
        )?,
        &codigos,
    );

    let mut distintas: Vec<&Texto> = Vec::new();
    for v in &p.correspondencias {
        if let Some(u) = v
            .url
            .as_ref()
            .filter(|_| v.correspondencia != "NO_ENCONTRADA")
            && !distintas.contains(&u)
        {
            distintas.push(u);
        }
    }
    let (unicas, n) = (distintas.len(), comprobada.len());
    let faltan = unicas as i64 - n as i64;
    let aviso = if unicas == 0 || faltan <= 0 {
        None
    } else if n == 0 {
        Some(format!(
            "Ninguna de las {unicas} URL de esta seccion se comprobo con codigo: las {unicas} salen \"sin comprobar\"."
        ))
    } else if let Some(techo) = techo_urls.filter(|&t| n >= t) {
        Some(format!(
            "El verificador cito {unicas} URL distintas y la comprobacion mecanica tiene un techo de {techo} por ronda: se comprobaron {n} y {} \"sin comprobar\" POR EL TECHO, no por haber fallado.",
            otras(faltan as usize)
        ))
    } else {
        Some(format!(
            "Se {} de las {unicas} URL distintas de esta seccion; {} \"sin comprobar\" porque el registro no tiene una comprobacion para {}.",
            if n == 1 {
                "comprobo 1".to_string()
            } else {
                format!("comprobaron {n}")
            },
            otras(faltan as usize),
            if faltan == 1 { "ella" } else { "ellas" }
        ))
    };

    let a_strings = |v: &[&'static str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
    Ok(VerificacionParaInforme {
        verificador_id: salida
            .texto("verificadorId")
            .map(|t| t.para_mostrar().into_owned())
            .unwrap_or_default(),
        aviso_sin_comprobar: aviso,
        items: p
            .correspondencias
            .iter()
            .map(|v| ItemVerificacion {
                correspondencia: v.correspondencia.into(),
                tipos_fuente: a_strings(&v.tipos_fuente),
                tipos_no_reconocidos: v.tipos_no_reconocidos.clone(),
                formato_anterior: v.formato_anterior,
                hallazgo_id: v.hallazgo_id.clone(),
                descripcion: v
                    .hallazgo_id
                    .como_str()
                    .and_then(|h| descripcion.get(h))
                    .map(|d| (*d).clone()),
                url: v.url.clone(),
                comprobacion: match v.url.as_ref().and_then(|u| comprobada.get(u)) {
                    None => "sin comprobar".into(),
                    Some(None) => "no resuelve".into(),
                    Some(Some(c)) => format!("responde {c}"),
                },
                texto: v.texto.clone(),
            })
            .collect(),
        puntos_ciegos: p
            .puntos_ciegos
            .iter()
            .map(|c| PuntoCiegoInforme {
                descripcion: c.descripcion.clone(),
                url: c.url.clone(),
                tipos_fuente: a_strings(&c.tipos_fuente),
                tipos_no_reconocidos: c.tipos_no_reconocidos.clone(),
            })
            .collect(),
        preguntas: p.preguntas,
    })
}

/// Js.Trim sobre el Texto, sin pasar por UTF-16.
fn recortar(t: &Texto) -> Texto {
    let s = t.bytes();
    let blanco_en = |i: usize| {
        let n = match s[i] {
            0..=0x7F => 1,
            0xC0..=0xDF => 2,
            0xE0..=0xEF => 3,
            _ => 4,
        };
        std::str::from_utf8(&s[i..(i + n).min(s.len())])
            .ok()
            .and_then(|c| c.chars().next())
            .is_some_and(registro::es_blanco)
            .then_some(n)
    };
    let mut i = 0;
    while i < s.len()
        && let Some(n) = blanco_en(i)
    {
        i += n;
    }
    let mut j = s.len();
    while j > i {
        let k = (i..j).rev().find(|&k| s[k] & 0xC0 != 0x80).unwrap_or(i);
        if blanco_en(k).is_none() {
            break;
        }
        j = k;
    }
    let mut r = Texto::con_capacidad(j - i);
    r.empujar_wtf8(&s[i..j]);
    r
}

/// InformeFinal.MarkdownDeRespuestaInvestigador: el texto entero y sin tocar; una respuesta no
/// capturada no se omite, dice que no hay texto (INF-011).
pub fn markdown_de_respuesta_investigador(pregunta: &Texto, r: &RespuestaParaPdf) -> Texto {
    let cuerpo = recortar(&r.texto_original);
    let etiqueta = r
        .etiqueta_modelo
        .clone()
        .unwrap_or_else(|| "(no observada)".into());
    let mut l = T::de("# ")
        .s(&nombre_proveedor(&r.proveedor_id))
        .s("\n\n**Etiqueta de modelo:** ")
        .t(&etiqueta)
        .s(&format!(
            "\n**Leida:** {}\n**Caracteres:** {}\n**Fuentes citadas (verificables):** {}\n**Enlaces en el DOM:** {}\n**Fin de respuesta:** {}",
            r.leida_en,
            r.texto_original.largo_utf16(),
            r.fuentes_citadas,
            r.fuentes_href
                .map_or("(no contados)".to_string(), |n| n.to_string()),
            r.fin_de.as_deref().unwrap_or_default()
        ));
    if let Some(e) = &r.error {
        l = l.s("\n**Error registrado en la captura:** ").t(e);
    }
    l = l
        .s("\n\n## Pregunta\n\n")
        .t(pregunta)
        .s("\n\n## Respuesta\n\n");
    l = if cuerpo.bytes().is_empty() {
        l.s("No se capturo texto de esta respuesta.")
    } else {
        l.t(&cuerpo)
    };
    l.s("\n\n---\n\n\
         Texto capturado tal cual de la interfaz del proveedor, sin corregir ni recortar.\n\
         Este documento es la respuesta a la pregunta, no la evaluacion que este\n\
         proveedor hizo de las respuestas de los demas.")
        .0
}

/// «n - Proveedor», sin extensión: el número conserva el orden del pool en el explorador.
pub fn nombre_archivo_respuesta(indice_en_pool: usize, proveedor_id: &str) -> String {
    let limpio =
        parseos::limpiar_titulo_para_archivo(&nombre_proveedor(proveedor_id).as_str().into(), 80);
    let limpio = limpio.para_mostrar();
    format!(
        "{} - {}",
        indice_en_pool + 1,
        if limpio.is_empty() {
            "proveedor"
        } else {
            &limpio
        }
    )
}

#[cfg(test)]
pub(crate) mod pruebas {
    use super::*;
    use crate::json::{self, Valor, vector};
    use crate::registro::pruebas::{campo, lista, str_de};

    fn opc<'a>(v: &'a Valor, k: &str) -> Option<&'a Valor> {
        let Valor::Objeto(o) = v else {
            panic!("se esperaba objeto")
        };
        o.iter()
            .find(|(n, _)| n.como_str() == Some(k))
            .map(|(_, v)| v)
            .filter(|v| **v != Valor::Nulo)
    }
    fn tx(v: &Valor) -> Texto {
        match v {
            Valor::Texto(t) => t.clone(),
            _ => panic!("se esperaba texto: {v:?}"),
        }
    }
    fn st(v: &Valor) -> String {
        str_de(v).to_string()
    }
    fn n(v: &Valor) -> usize {
        match v {
            Valor::Entero(n) => *n as usize,
            _ => panic!("se esperaba entero"),
        }
    }
    fn strs(v: &Valor) -> Vec<String> {
        lista(v).iter().map(st).collect()
    }
    fn txs(v: &Valor) -> Vec<Texto> {
        lista(v).iter().map(tx).collect()
    }

    pub(crate) fn de_hallazgo(h: &Valor) -> HallazgoResuelto {
        HallazgoResuelto {
            codigo: st(campo(h, "codigo")),
            categoria: tx(campo(h, "categoria")),
            eje: opc(h, "eje").map(tx),
            respuestas_reales: strs(campo(h, "respuestasReales")),
            descripcion: tx(campo(h, "descripcion")),
            operador_real: st(campo(h, "operadorReal")),
        }
    }

    pub(crate) fn de_verificacion(v: &Valor) -> VerificacionParaInforme {
        VerificacionParaInforme {
            verificador_id: st(campo(v, "verificadorId")),
            aviso_sin_comprobar: opc(v, "avisoSinComprobar").map(st),
            items: lista(campo(v, "items"))
                .iter()
                .map(|i| ItemVerificacion {
                    correspondencia: st(campo(i, "correspondencia")),
                    tipos_fuente: strs(campo(i, "tiposFuente")),
                    tipos_no_reconocidos: txs(campo(i, "tiposNoReconocidos")),
                    formato_anterior: campo(i, "formatoAnterior") == &Valor::Bool(true),
                    hallazgo_id: tx(campo(i, "hallazgoId")),
                    descripcion: opc(i, "descripcion").map(tx),
                    url: opc(i, "url").map(tx),
                    comprobacion: st(campo(i, "comprobacion")),
                    texto: tx(campo(i, "texto")),
                })
                .collect(),
            puntos_ciegos: lista(campo(v, "puntosCiegos"))
                .iter()
                .map(|p| PuntoCiegoInforme {
                    descripcion: tx(campo(p, "descripcion")),
                    url: opc(p, "url").map(tx),
                    tipos_fuente: strs(campo(p, "tiposFuente")),
                    tipos_no_reconocidos: txs(campo(p, "tiposNoReconocidos")),
                })
                .collect(),
            preguntas: txs(campo(v, "preguntas")),
        }
    }

    fn de_entrada(e: &Valor) -> InformeFinalInput {
        InformeFinalInput {
            pregunta: tx(campo(e, "pregunta")),
            fecha: st(campo(e, "fecha")),
            conversacion_id: st(campo(e, "conversacionId")),
            ronda_id: st(campo(e, "rondaId")),
            informe_integrador_crudo: opc(e, "informeIntegradorCrudo").map(tx),
            referencias_en_orden: lista(campo(e, "referenciasEnOrden"))
                .iter()
                .map(|r| ReferenciaResuelta {
                    codigo: st(campo(r, "codigo")),
                    existe: campo(r, "existe") == &Valor::Bool(true),
                })
                .collect(),
            hallazgos: lista(campo(e, "hallazgos"))
                .iter()
                .map(de_hallazgo)
                .collect(),
            participacion_operadores: lista(campo(e, "participacionOperadores"))
                .iter()
                .map(|p| ParticipacionOperador {
                    operador_id: st(campo(p, "operadorId")),
                    estado: st(campo(p, "estado")),
                    detalle: st(campo(p, "detalle")),
                })
                .collect(),
            condiciones: lista(campo(e, "condiciones"))
                .iter()
                .map(|c| CondicionProveedor {
                    proveedor_id: st(campo(c, "proveedorId")),
                    etiqueta_modelo: opc(c, "etiquetaModelo").map(tx),
                    caracteres_respuesta: n(campo(c, "caracteresRespuesta")),
                    fuentes_citadas: n(campo(c, "fuentesCitadas")),
                    codigo_estable: opc(c, "codigoEstable").map(st),
                })
                .collect(),
            integridad_entrega: st(campo(e, "integridadEntrega")),
            semilla: tx(campo(e, "semilla")),
            proveedores_cargados_incompletos: opc(e, "proveedoresCargadosIncompletos").map(strs),
            integrador: opc(e, "integrador").map(st),
            verificaciones: opc(e, "verificaciones")
                .map(|v| lista(v).iter().map(de_verificacion).collect())
                .unwrap_or_default(),
            redaccion: opc(e, "redaccion").map(|r| RedaccionParaInforme {
                redactor_id: st(campo(r, "redactorId")),
                controles: strs(campo(r, "controles")),
                cuerpo: tx(campo(r, "cuerpo")),
                sello_verificaciones: opc(r, "selloVerificaciones")
                    .map(|s| {
                        lista(s)
                            .iter()
                            .map(|x| (st(campo(x, "etiqueta")), st(campo(x, "verificadorId"))))
                            .collect()
                    })
                    .unwrap_or_default(),
            }),
        }
    }

    /// Una lista JSON de objetos como líneas JSONL, para leerla con registro::leer.
    fn en_lineas(lista_json: &str) -> String {
        let (mut r, mut prof, mut en_cadena, mut escape) = (String::new(), 0, false, false);
        for c in lista_json
            .trim()
            .trim_start_matches('[')
            .trim_end_matches(']')
            .chars()
        {
            match c {
                _ if escape => escape = false,
                '\\' if en_cadena => escape = true,
                '"' => en_cadena = !en_cadena,
                '{' if !en_cadena => prof += 1,
                '}' if !en_cadena => prof -= 1,
                ',' if !en_cadena && prof == 0 => {
                    r.push('\n');
                    continue;
                }
                _ => {}
            }
            r.push(c);
        }
        r + "\n"
    }

    fn casos() -> Vec<(Valor, Texto)> {
        lista(&vector("InformesFinales"))
            .iter()
            .map(|c| {
                (
                    json::leer(str_de(campo(c, "entrada"))).unwrap(),
                    tx(campo(c, "informe")),
                )
            })
            .collect()
    }

    fn armar_caso(i: usize) -> String {
        armar(&de_entrada(&casos()[i].0))
            .para_mostrar()
            .into_owned()
    }

    // INF-002, INF-005, INF-006: el informe es byte a byte el de la Unity en los nueve casos.
    #[test]
    fn informe_final_es_el_mismo_que_arma_la_unity() {
        let casos = casos();
        assert_eq!(casos.len(), 9);
        for (entrada, esperado) in &casos {
            let armado = armar(&de_entrada(entrada));
            assert_eq!(
                armado.para_mostrar(),
                esperado.para_mostrar(),
                "{entrada:?}"
            );
            assert_eq!(armado.bytes(), esperado.bytes());
        }
    }

    // INF-003 e INF-006; caso de falla de PART-008: un hallazgo citado que no existe en la tabla se
    // informa con la cruz, como en la Unity.
    #[test]
    fn informe_marca_cada_referencia_y_publica_la_clave_de_los_p() {
        let texto = armar_caso(0);
        for esperado in [
            "[CONFIRMA H1 ✓]",
            "[H2 ✓]",
            "[CONFIRMA H999 ✗ referencia inexistente]",
            "[H888 ✗ referencia inexistente]",
            "| P3 | Claude |",
            "| (sin sello) | Mistral |",
        ] {
            assert!(texto.contains(esperado), "{esperado}");
        }
    }

    // INF-002: ninguna sección queda vacía, sin integrador, con tabla vacía, sin referencias ni
    // respuestas.
    #[test]
    fn informe_ninguna_seccion_queda_vacia() {
        for caso in 0..=4 {
            let texto = armar_caso(caso);
            let mut vacias = Vec::new();
            let mut actual: Option<&str> = None;
            let mut cuerpo = String::new();
            let mut cerrar = |actual: Option<&str>, cuerpo: &str| {
                if let Some(a) = actual
                    && Texto::from(cuerpo).bytes().is_empty()
                        | recortar(&cuerpo.into()).bytes().is_empty()
                {
                    vacias.push(a.to_string());
                }
            };
            for linea in texto.split('\n') {
                if linea.starts_with("## ") {
                    cerrar(actual, &cuerpo);
                    actual = Some(linea);
                    cuerpo.clear();
                } else if actual.is_some() {
                    cuerpo.push_str(linea);
                }
            }
            cerrar(actual, &cuerpo);
            assert!(vacias.is_empty(), "caso {caso}: {vacias:?}");
        }
        assert!(!armar_caso(1).contains("referencio todos los hallazgos"));
        assert!(!armar_caso(4).contains("|---|"));
    }

    // INF-004: las marcas de integridad se quitan y se declaran.
    #[test]
    fn informe_las_marcas_de_integridad_se_quitan_y_se_declaran() {
        let con = armar_caso(5);
        assert!(!con.contains("[[CC-MARCA"));
        let declarada = con
            .split("Se quitaron ")
            .nth(1)
            .and_then(|r| r.split(' ').next())
            .and_then(|n| n.parse::<usize>().ok());
        assert_eq!(declarada, Some(6));
        assert!(con.contains("marca(s) de integridad"));
        assert!(!armar_caso(2).contains("Se quitaron"));
    }

    // Las marcas: la sola en su línea se va con su salto, también tras \r, U+2028 y U+2029.
    #[test]
    fn informe_las_marcas_solas_en_su_linea_se_van_con_su_salto() {
        let (t, n) = sin_marcas_de_integridad(
            &"a\n  [[CC-x]] \nb\r[[CC-y]]\nc\u{2028}[[CC-z]]\nd [[CC-w]] e".into(),
        );
        assert_eq!(
            (t.para_mostrar().into_owned(), n),
            ("a\nb\rc\u{2028}d e".to_string(), 4)
        );
    }

    // INF-007: la verificación resuelta para el informe es la de la Unity.
    #[test]
    fn informe_la_verificacion_para_el_informe_es_la_misma_que_en_la_unity() {
        let salida = registro::leer(&format!(
            "{}\n",
            str_de(&vector("SalidaVerificadorInforme"))
        ))
        .hechos
        .remove(0);
        let hallazgos: Vec<HallazgoResuelto> =
            lista(&json::leer(str_de(&vector("HallazgosInforme"))).unwrap())
                .iter()
                .map(de_hallazgo)
                .collect();
        let casos = vector("VerificacionesInforme");
        assert_eq!(lista(&casos).len(), 6);
        for caso in lista(&casos) {
            let leidas = registro::leer(&en_lineas(str_de(campo(caso, "urls")))).hechos;
            let urls: Vec<&Hecho> = leidas.iter().collect();
            let techo = opc(caso, "techo").map(n);
            let esperado = de_verificacion(&json::leer(str_de(campo(caso, "esperado"))).unwrap());
            assert_eq!(
                verificacion_para_informe(&salida, &urls, &hallazgos, techo).unwrap(),
                esperado,
                "{caso:?}"
            );
        }
    }

    // INF-011 y RON-015: el documento de cada respuesta y su nombre de archivo son los de la Unity.
    #[test]
    fn informe_el_documento_de_cada_respuesta_es_el_mismo_que_en_la_unity() {
        let casos = vector("RespuestasPdf");
        assert_eq!(lista(&casos).len(), 2);
        for caso in lista(&casos) {
            let r = json::leer(str_de(campo(caso, "respuesta"))).unwrap();
            let r = RespuestaParaPdf {
                proveedor_id: st(campo(&r, "proveedorId")),
                etiqueta_modelo: opc(&r, "etiquetaModelo").map(tx),
                leida_en: st(campo(&r, "leidaEn")),
                texto_original: tx(campo(&r, "textoOriginal")),
                error: opc(&r, "error").map(tx),
                fuentes_citadas: n(campo(&r, "fuentesCitadas")),
                fuentes_href: opc(&r, "fuentesHref").map(|v| n(v) as i64),
                fin_de: opc(&r, "finDe").map(st),
            };
            assert_eq!(
                markdown_de_respuesta_investigador(&"¿Pregunta?".into(), &r).bytes(),
                tx(campo(caso, "markdown")).bytes()
            );
        }
        let nombres = vector("NombresRespuesta");
        assert_eq!(lista(&nombres).len(), 5);
        for caso in lista(&nombres) {
            let id = str_de(campo(caso, "id"));
            assert_eq!(
                nombre_archivo_respuesta(n(campo(caso, "indice")), id),
                str_de(campo(caso, "archivo"))
            );
            assert_eq!(nombre_proveedor(id), str_de(campo(caso, "nombre")));
        }
    }
}
