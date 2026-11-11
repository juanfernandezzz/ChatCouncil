//! Lo que se deriva de los hechos del registro, sin guardarlo nunca como campo (Dominio.cs de la Unity).

use crate::registro::Hecho;
use crate::texto::Texto;

fn de_ronda<'a: 'b, 'b>(
    hechos: &'a [Hecho],
    tipo: &'b str,
    ronda_id: &'b Texto,
) -> impl DoubleEndedIterator<Item = &'a Hecho> + 'b {
    hechos
        .iter()
        .filter(move |h| h.tipo() == tipo && h.texto("rondaId") == Some(ronda_id))
}

/// REG-012: la etapa de la ronda sale de los hechos. Cuenta operadores DISTINTOS: un operador
/// recapturado no cuenta dos veces.
pub fn etapa_de_ronda(hechos: &[Hecho], ronda_id: &Texto, total_operadores: usize) -> &'static str {
    if de_ronda(hechos, "salida-verificador", ronda_id)
        .next()
        .is_some()
    {
        return "redaccion";
    }
    if de_ronda(hechos, "informe-integrador", ronda_id)
        .next()
        .is_some()
    {
        return "verificacion";
    }
    let mut operadores: Vec<Option<&Texto>> = de_ronda(hechos, "salida-operador", ronda_id)
        .map(|h| h.texto("operadorId"))
        .collect();
    operadores.sort();
    operadores.dedup();
    if operadores.len() >= total_operadores {
        return "integracion";
    }
    if de_ronda(hechos, "sello", ronda_id).next().is_some() {
        return "operacion";
    }
    "investigacion"
}

/// Qué tipo de hecho se captura en cada etapa; None para una etapa desconocida.
pub fn tipo_captura_de_etapa(etapa: &str) -> Option<&'static str> {
    Some(match etapa {
        "investigacion" => "respuesta",
        "operacion" => "salida-operador",
        "integracion" => "informe-integrador",
        "verificacion" => "salida-verificador",
        "redaccion" => "respuesta-redactor",
        _ => return None,
    })
}

#[derive(Debug, PartialEq)]
pub struct SalidaVigente<'a> {
    pub operador_id: Option<&'a Texto>,
    pub salida_id: Option<&'a Texto>,
    pub hallazgos: Vec<&'a Hecho>,
}

/// REG-013: la última salida de cada operador, en el orden de su primera captura, con sus hallazgos.
pub fn salidas_vigentes_de_ronda<'a>(
    hechos: &'a [Hecho],
    ronda_id: &Texto,
) -> Vec<SalidaVigente<'a>> {
    let mut ultima: Vec<(Option<&Texto>, &Hecho)> = Vec::new();
    for s in de_ronda(hechos, "salida-operador", ronda_id) {
        let op = s.texto("operadorId");
        match ultima.iter_mut().find(|(o, _)| *o == op) {
            Some(par) => par.1 = s,
            None => ultima.push((op, s)),
        }
    }
    ultima
        .into_iter()
        .map(|(op, s)| {
            let id = s.texto("id");
            SalidaVigente {
                operador_id: op,
                salida_id: id,
                hallazgos: hechos
                    .iter()
                    .filter(|h| h.tipo() == "hallazgo" && h.texto("salidaOperadorId") == id)
                    .collect(),
            }
        })
        .collect()
}

/// El informe vigente de la ronda: el último capturado.
pub fn ultimo_informe_integrador<'a>(hechos: &'a [Hecho], ronda_id: &Texto) -> Option<&'a Hecho> {
    de_ronda(hechos, "informe-integrador", ronda_id).next_back()
}

fn ultima_condicion<'a>(hechos: &'a [Hecho], ronda_id: &Texto) -> Option<&'a Hecho> {
    de_ronda(hechos, "condicion-proveedores-cargados", ronda_id).next_back()
}

/// El integrador registrado al abrir la ronda (REG-010), o None si la ronda es anterior a ese dato.
pub fn integrador_de_ronda<'a>(hechos: &'a [Hecho], ronda_id: &Texto) -> Option<&'a Texto> {
    ultima_condicion(hechos, ronda_id)?.texto("integrador")
}

/// Los proveedores cargados al abrir la ronda (REG-010), o None si la ronda es anterior a ese hecho.
pub fn proveedores_cargados_de_ronda<'a>(
    hechos: &'a [Hecho],
    ronda_id: &Texto,
) -> Option<&'a crate::json::Valor> {
    let v = ultima_condicion(hechos, ronda_id)?.valor("proveedores");
    (*v != crate::json::Valor::Nulo).then_some(v)
}

/// El nombre de un proveedor como lo ve Juan; un id desconocido sale con la inicial en mayúscula.
pub fn nombre_proveedor(id: &str) -> String {
    let conocido = match id {
        "chatgpt" => "ChatGPT",
        "gemini" => "Gemini",
        "claude" => "Claude",
        "grok" => "Grok",
        "mistral" => "Mistral",
        "glm" => "GLM",
        "kimi" => "Kimi",
        "qwen" => "Qwen",
        "deepseek" => "DeepSeek",
        _ => {
            let mut c = id.chars();
            return c
                .next()
                .map(|p| p.to_uppercase().chain(c).collect())
                .unwrap_or_default();
        }
    };
    conocido.to_string()
}

/// El marcador interno de una ronda capturada sin envío es texto no vacío y no es una pregunta.
pub fn es_pregunta_valida(texto: Option<&Texto>) -> bool {
    // Un surrogate suelto (U+FFFD en la vista) no es blanco ni "(" y corta la frase igual que en la Unity.
    let Some(texto) = texto else { return false };
    let vista = texto.para_mostrar();
    let t = vista.trim_matches(crate::registro::es_blanco);
    if t.is_empty() || t.starts_with('(') {
        return false;
    }
    // ToLowerInvariant de .NET: mapeo simple, U+0130 da "i".
    let minusculas: String = t
        .chars()
        .flat_map(|c| {
            if c == '\u{130}' {
                'i'.to_lowercase()
            } else {
                c.to_lowercase()
            }
        })
        .collect();
    !minusculas.contains("capturado sin ronda de envio")
}

/// La pregunta de la ronda: su prompt si es válido; si no, la última pregunta declarada válida.
pub fn pregunta_efectiva_de_ronda<'a>(hechos: &'a [Hecho], ronda: &'a Hecho) -> Option<&'a Texto> {
    let prompt = ronda.texto("prompt");
    if es_pregunta_valida(prompt) {
        return prompt;
    }
    let id = ronda.texto("id")?;
    let mut ultima: Option<&Hecho> = None;
    for d in de_ronda(hechos, "pregunta-declarada", id) {
        // string.CompareOrdinal con null: null es menor que todo texto.
        if ultima.is_none_or(|u| d.texto("declaradaEn") > u.texto("declaradaEn")) {
            ultima = Some(d);
        }
    }
    ultima
        .and_then(|u| u.texto("texto"))
        .filter(|t| es_pregunta_valida(Some(t)))
}

/// OPE-015 (Dominio.EtiquetasValidasDelOperador): los P# válidos para UN operador, el código estable
/// de cada proveedor del pool menos el suyo (exclusión de autoevaluación), desde el Sello persistido;
/// si el sello repite un proveedor, gana la última entrada. Sin código para alguno, el error de la Unity.
pub fn etiquetas_validas_del_operador(
    operador_id: &str,
    pool: &[&str],
    sello: &[&Hecho],
) -> Result<Vec<String>, String> {
    pool.iter()
        .filter(|id| **id != operador_id)
        .map(|id| {
            sello
                .iter()
                .rev()
                .find(|s| s.texto("panelSourceId").and_then(Texto::como_str) == Some(id))
                .and_then(|s| s.texto("codigoEstable"))
                .filter(|c| !c.bytes().is_empty())
                // Los códigos los genera la operación ("P1"…), nunca con surrogates.
                .map(|c| c.para_mostrar().into_owned())
                .ok_or_else(|| format!("no hay codigo estable de sello para el proveedor {id}"))
        })
        .collect()
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::json::{Valor, vector};
    use crate::registro::leer;
    use crate::registro::pruebas::{campo, lista, str_de};

    fn r() -> Texto {
        "R".into()
    }

    #[test]
    fn la_etapa_sale_de_los_hechos_y_cuenta_operadores_distintos() {
        let casos = vector("Etapas");
        assert_eq!(lista(&casos).len(), 7);
        for caso in lista(&casos) {
            let registro = str_de(campo(caso, "registro"));
            let etapa = etapa_de_ronda(&leer(registro).hechos, &r(), 7);
            assert_eq!(etapa, str_de(campo(caso, "etapa")), "{registro}");
            assert_eq!(
                tipo_captura_de_etapa(etapa),
                Some(str_de(campo(caso, "captura")))
            );
        }
        assert_eq!(tipo_captura_de_etapa("otra"), None);
    }

    #[test]
    fn las_salidas_vigentes_son_la_ultima_de_cada_operador() {
        let registro = vector("RegistroVigentes");
        let hechos = leer(str_de(&registro)).hechos;
        let mut json = Vec::new();
        json.push(b'[');
        for (i, s) in salidas_vigentes_de_ronda(&hechos, &r()).iter().enumerate() {
            if i > 0 {
                json.push(b',');
            }
            json.extend_from_slice(b"{\"operadorId\":");
            crate::json::escapar(s.operador_id.unwrap(), &mut json);
            json.extend_from_slice(b",\"salidaId\":");
            crate::json::escapar(s.salida_id.unwrap(), &mut json);
            json.extend_from_slice(b",\"hallazgos\":[");
            for (j, h) in s.hallazgos.iter().enumerate() {
                if j > 0 {
                    json.push(b',');
                }
                json.extend(h.a_linea());
            }
            json.extend_from_slice(b"]}");
        }
        json.push(b']');
        assert_eq!(
            String::from_utf8(json).unwrap(),
            str_de(&vector("Vigentes"))
        );
        let ultimo = ultimo_informe_integrador(&hechos, &r()).unwrap();
        assert_eq!(
            ultimo.texto("id").unwrap().como_str(),
            Some(str_de(&vector("UltimoIntegrador")))
        );
    }

    #[test]
    fn el_integrador_y_los_cargados_son_los_de_la_ultima_condicion() {
        let casos = vector("Cargados");
        assert_eq!(lista(&casos).len(), 3);
        for caso in lista(&casos) {
            let registro = str_de(campo(caso, "registro"));
            let hechos = leer(registro).hechos;
            let integrador = integrador_de_ronda(&hechos, &r())
                .map(|t| Valor::Texto(t.clone()))
                .unwrap_or(Valor::Nulo);
            assert_eq!(integrador, *campo(caso, "integrador"), "{registro}");
            assert_eq!(
                proveedores_cargados_de_ronda(&hechos, &r()).unwrap_or(&Valor::Nulo),
                campo(caso, "cargados"),
                "{registro}"
            );
        }
    }

    #[test]
    fn la_pregunta_efectiva_rechaza_el_marcador_y_usa_la_ultima_declarada() {
        let casos = vector("PreguntasEfectivas");
        assert_eq!(lista(&casos).len(), 5);
        for caso in lista(&casos) {
            let registro = str_de(campo(caso, "registro"));
            let hechos = leer(registro).hechos;
            let ronda = hechos.iter().find(|h| h.tipo() == "ronda").unwrap();
            let esperado = match campo(caso, "esperado") {
                Valor::Nulo => None,
                v => Some(crate::registro::pruebas::texto_de(v)),
            };
            assert_eq!(
                pregunta_efectiva_de_ronda(&hechos, ronda),
                esperado,
                "{registro}"
            );
        }
        let casos = vector("PreguntasValidas");
        assert_eq!(lista(&casos).len(), 6);
        for caso in lista(&casos) {
            let t = crate::registro::pruebas::texto_de(campo(caso, "texto"));
            assert_eq!(
                Valor::Bool(es_pregunta_valida(Some(t))),
                *campo(caso, "valida"),
                "{t:?}"
            );
        }
    }

    #[test]
    fn parseos_las_etiquetas_validas_salen_del_sello_sin_la_del_operador() {
        let pool_cuerpos = vector("PoolCuerpos");
        let pool: Vec<&str> = lista(&pool_cuerpos)[..7].iter().map(str_de).collect();
        let sello: Vec<Hecho> = pool
            .iter()
            .enumerate()
            .map(|(i, p)| {
                Hecho::nuevo(
                    "sello",
                    &[
                        ("panelSourceId", Valor::Texto((*p).into())),
                        ("codigoEstable", Valor::Texto(format!("P{}", i + 1).into())),
                    ],
                )
                .unwrap()
            })
            .collect();
        let refs: Vec<&Hecho> = sello.iter().collect();
        for caso in lista(&vector("EtiquetasValidas")) {
            let op = str_de(campo(caso, "operador"));
            let esperadas: Vec<&str> = lista(campo(caso, "validas")).iter().map(str_de).collect();
            assert_eq!(
                etiquetas_validas_del_operador(op, &pool, &refs).unwrap(),
                esperadas,
                "{op}"
            );
        }
        assert_eq!(
            etiquetas_validas_del_operador("chatgpt", &pool, &refs[1..3]).unwrap_err(),
            str_de(&vector("ErrorEtiquetas"))
        );
    }
}
