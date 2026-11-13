//! Roles y selección de proveedores (Roles.cs de la Unity) y la guía de cada etapa de la ronda:
//! RON-001 a RON-008, RON-012, RON-016, RON-017 e INV-RON-001 e INV-RON-002. La máquina de la ronda
//! (captura, paso siguiente y estado de cada panel) vive en la Puerta.

use crate::json::{self, Valor};
use crate::texto::Texto;

/// RON-001: los diez, en el orden de la configuración y del pool.
pub use crate::operacion::CONOCIDOS;

/// El archivo aparte en la carpeta de datos, nunca el registro.
pub const ARCHIVO_SELECCION: &str = "seleccion-proveedores.json";

pub const ERROR_SELECCION_VACIA: &str = "Tienes que marcar al menos un proveedor.";
pub const ERROR_VERIFICADORES_IGUALES: &str =
    "Los dos verificadores tienen que ser proveedores distintos.";
pub const ERROR_ROLES_IGUALES: &str =
    "El integrador y los verificadores tienen que ser proveedores distintos.";
pub const ERROR_ROLES_DESMARCADOS: &str =
    "El integrador y los verificadores tienen que estar entre los proveedores cargados.";
pub const ERROR_REDACTOR_VERIFICADOR: &str =
    "El redactor y los verificadores tienen que ser proveedores distintos.";
pub const ERROR_REDACTOR_DESMARCADO: &str =
    "El redactor tiene que estar entre los proveedores cargados.";

/// RON-016 y RON-017: los diálogos de la interfaz, como textos del núcleo (E7 los muestra).
pub const DIALOGO_DECLARAR_TITULO: &str = "Declarar la pregunta de esta ronda";
pub const DIALOGO_DECLARAR_TEXTO: &str = "Las respuestas se capturaron sin pegar la pregunta con la app. Escribe la pregunta que hiciste: queda en el registro junto a la ronda, sin reescribirla.";
pub const DIALOGO_DECLARAR_BOTON: &str = "Declarar";
pub const DECLARADA_VACIA: &str = "La pregunta declarada no puede quedar vacía.";
pub const DECLARADA: &str = "Pregunta declarada.";
pub const DIALOGO_ABANDONAR_TITULO: &str = "Abandonar la ronda";
pub const DIALOGO_ABANDONAR_TEXTO: &str = "La ronda queda en el registro tal como está y vuelves a la etapa Pregunta. Si cierras la app antes de pegar la pregunta nueva, al abrirla vuelve esta ronda.";
pub const DIALOGO_ABANDONAR_BOTON: &str = "Abandonar la ronda";
pub const ABANDONADA: &str = "Ronda abandonada. Escribe la pregunta nueva.";

/// Quién integra, verifica (D62: dos) y redacta.
#[derive(Debug, Clone, PartialEq)]
pub struct RolesElegidos {
    pub integrador: String,
    pub verificador1: String,
    pub verificador2: String,
    pub redactor: String,
}

impl RolesElegidos {
    pub fn new(integrador: &str, verificador1: &str, verificador2: &str, redactor: &str) -> Self {
        RolesElegidos {
            integrador: integrador.into(),
            verificador1: verificador1.into(),
            verificador2: verificador2.into(),
            redactor: redactor.into(),
        }
    }

    /// RON-002: deepseek integra y redacta; glm y qwen verifican.
    pub fn por_defecto() -> Self {
        Self::new("deepseek", "glm", "qwen", "deepseek")
    }

    /// Los dos verificadores, en orden: el 1 es el que recibe el redactor.
    pub fn verificadores(&self) -> [&str; 2] {
        [&self.verificador1, &self.verificador2]
    }

    /// RON-008: los que trabajan en esa etapa de rol; ninguno en las de los operadores.
    pub fn de_la_etapa(&self, etapa: &str) -> Vec<&str> {
        match etapa {
            "integracion" => vec![&self.integrador],
            "verificacion" => self.verificadores().to_vec(),
            "redaccion" | "informe" => vec![&self.redactor],
            _ => Vec::new(),
        }
    }
}

fn campo<'a>(o: &'a [(Texto, Valor)], nombre: &str) -> Option<&'a Valor> {
    o.iter()
        .find(|(k, _)| k.como_str() == Some(nombre))
        .map(|(_, v)| v)
}

/// RON-005: los proveedores guardados, en el orden de `conocidos`; None si no hay archivo, es
/// ilegible o no queda ninguno: se cargan todos.
pub fn leer_seleccion(contenido: Option<&str>, conocidos: &[&str]) -> Option<Vec<String>> {
    let Some(Valor::Objeto(o)) = json::leer(contenido?) else {
        return None;
    };
    let Some(Valor::Lista(proveedores)) = campo(&o, "proveedores") else {
        return None;
    };
    let validos: Vec<String> = conocidos
        .iter()
        .filter(|id| {
            proveedores
                .iter()
                .any(|p| matches!(p, Valor::Texto(t) if t.como_str() == Some(**id)))
        })
        .map(|id| id.to_string())
        .collect();
    (!validos.is_empty()).then_some(validos)
}

/// RON-005: cada rol cae a su defecto si falta o no es conocido; si dos de integrador y
/// verificadores coinciden vuelven todos los defectos; un redactor ausente o igual a un verificador
/// pasa a ser el integrador. Un archivo anterior a D62 trae "verificador": es el 1.
pub fn leer_roles(contenido: Option<&str>, conocidos: &[&str]) -> RolesElegidos {
    let defecto = RolesElegidos::por_defecto();
    let Some(json) = contenido.and_then(json::leer) else {
        return defecto;
    };
    let o: &[(Texto, Valor)] = match &json {
        Valor::Nulo => return defecto,
        Valor::Objeto(o) => o,
        _ => &[],
    };
    let valido = |nombre: &str, por_defecto: &str| match campo(o, nombre) {
        Some(Valor::Texto(t)) if t.como_str().is_some_and(|s| conocidos.contains(&s)) => {
            t.para_mostrar().into_owned()
        }
        _ => por_defecto.to_string(),
    };
    // verificador1 ?? verificador de TypeScript: solo un null o un campo ausente pasan al viejo.
    let campo1 = match campo(o, "verificador1") {
        None | Some(Valor::Nulo) => "verificador",
        _ => "verificador1",
    };
    let integrador = valido("integrador", &defecto.integrador);
    let verificador1 = valido(campo1, &defecto.verificador1);
    let verificador2 = valido("verificador2", &defecto.verificador2);
    if integrador == verificador1 || integrador == verificador2 || verificador1 == verificador2 {
        return defecto;
    }
    let redactor = valido("redactor", &integrador);
    let redactor = if redactor == verificador1 || redactor == verificador2 {
        integrador.clone()
    } else {
        redactor
    };
    RolesElegidos {
        integrador,
        verificador1,
        verificador2,
        redactor,
    }
}

/// RON-006 e INV-RON-002: el error que impide guardar esta selección, o None.
pub fn validar_seleccion(
    conocidos: &[&str],
    marcados: &[&str],
    roles: &RolesElegidos,
) -> Option<&'static str> {
    let validos: Vec<&str> = conocidos
        .iter()
        .copied()
        .filter(|c| marcados.contains(c))
        .collect();
    let [v1, v2] = roles.verificadores();
    let (i, r) = (roles.integrador.as_str(), roles.redactor.as_str());
    if validos.is_empty() {
        Some(ERROR_SELECCION_VACIA)
    } else if v1 == v2 {
        Some(ERROR_VERIFICADORES_IGUALES)
    } else if i == v1 || i == v2 {
        Some(ERROR_ROLES_IGUALES)
    } else if ![i, v1, v2].iter().all(|x| validos.contains(x)) {
        Some(ERROR_ROLES_DESMARCADOS)
    } else if r == v1 || r == v2 {
        Some(ERROR_REDACTOR_VERIFICADOR)
    } else if !validos.contains(&r) {
        Some(ERROR_REDACTOR_DESMARCADO)
    } else {
        None
    }
}

/// RON-007: el contenido del archivo de selección (sin escribirlo), con sangría de dos espacios y
/// LF como JSON.stringify(..., null, 2); o el error que impide guardarlo.
pub fn guardar(
    conocidos: &[&str],
    marcados: &[&str],
    roles: &RolesElegidos,
    guardado_en: &str,
) -> Result<String, &'static str> {
    if let Some(e) = validar_seleccion(conocidos, marcados, roles) {
        return Err(e);
    }
    let cadena = |s: &str| {
        let mut b = Vec::new();
        json::escapar(&Texto::from(s), &mut b);
        String::from_utf8(b).expect("escapar deja UTF-8 si la entrada lo es")
    };
    let proveedores: Vec<String> = conocidos
        .iter()
        .filter(|c| marcados.contains(c))
        .map(|c| format!("    {}", cadena(c)))
        .collect();
    let [v1, v2] = roles.verificadores();
    Ok(format!(
        "{{\n  \"proveedores\": [\n{}\n  ],\n  \"integrador\": {},\n  \"verificador1\": {},\n  \"verificador2\": {},\n  \"redactor\": {},\n  \"guardadoEn\": {}\n}}",
        proveedores.join(",\n"),
        cadena(&roles.integrador),
        cadena(v1),
        cadena(v2),
        cadena(&roles.redactor),
        cadena(guardado_en)
    ))
}

/// RON-003 e INV-RON-001: todos, en su orden, menos los roles.
pub fn pool_de_investigadores(todos: &[&str], roles: &RolesElegidos) -> Vec<String> {
    todos
        .iter()
        .filter(|id| {
            **id != roles.integrador
                && !roles.verificadores().contains(id)
                && **id != roles.redactor
        })
        .map(|id| id.to_string())
        .collect()
}

/// RON-012: el recordatorio literal de cada etapa.
pub fn recordatorio(etapa: &str) -> &'static str {
    match etapa {
        "pregunta" => {
            "Escribe la pregunta. La app la pega en cada panel; tú la revisas y la envías."
        }
        "investigacion" => {
            "En cada panel, activa la búsqueda web o la investigación profunda del proveedor, revisa y envía tú. Antes de capturar, abre el panel de fuentes."
        }
        "operacion" => {
            "En cada panel, activa el razonamiento, sin búsqueda web. Revisa la operación y envíala tú. Si va con archivo, comprueba que quedó adjunto."
        }
        "integracion" => {
            "En el panel del integrador, activa el razonamiento, sin búsqueda web. Revisa el prompt y envíalo tú."
        }
        "verificacion" => {
            "En el panel de cada verificador, activa la búsqueda web y el razonamiento, no la investigación profunda (devuelve un informe, no las líneas que pide el prompt); revisa y envía tú."
        }
        "redaccion" => {
            "En el panel del redactor, activa el razonamiento, sin búsqueda web. Comprueba que el archivo quedó adjunto y envía tú."
        }
        "informe" => "La carpeta del informe se abre al terminar.",
        _ => panic!("etapa desconocida: {etapa}"),
    }
}

/// RON-016 (el diálogo «Declarar la pregunta» de PantallaRonda): una pregunta en blanco no se
/// escribe. Devuelve el mensaje de la interfaz; Err si es el de error.
pub fn declarar(
    puerta: &mut crate::puerta::Puerta,
    texto: &Texto,
) -> std::io::Result<Result<&'static str, &'static str>> {
    // string.IsNullOrWhiteSpace: un surrogate suelto no es blanco.
    if texto
        .puntos()
        .all(|c| char::from_u32(c).is_some_and(char::is_whitespace))
    {
        return Ok(Err(DECLARADA_VACIA));
    }
    puerta.declarar_pregunta(texto.clone())?;
    Ok(Ok(DECLARADA))
}

/// Las siete etapas, en orden, y su nombre a la vista (PantallaRonda.cs:31).
pub const ETAPAS: [&str; 7] = [
    "pregunta",
    "investigacion",
    "operacion",
    "integracion",
    "verificacion",
    "redaccion",
    "informe",
];
pub const NOMBRES_ETAPA: [&str; 7] = [
    "Pregunta",
    "Investigación",
    "Operación",
    "Integración",
    "Verificación",
    "Redacción",
    "Informe",
];

pub fn nombre_de_etapa(etapa: &str) -> &'static str {
    ETAPAS
        .iter()
        .position(|e| *e == etapa)
        .map_or("", |i| NOMBRES_ETAPA[i])
}

/// La barra de la Ronda: «{Etapa} · {n} de 7» (PantallaRonda.cs:437).
pub fn titulo_de_etapa(etapa: &str) -> String {
    let i = ETAPAS.iter().position(|e| *e == etapa);
    // La etapa sale de etapa_de_ronda, que solo da valores de ETAPAS; en compilación de prueba se exige.
    debug_assert!(i.is_some(), "etapa desconocida: {etapa}");
    let i = i.unwrap_or(0);
    format!("{} · {} de {}", NOMBRES_ETAPA[i], i + 1, ETAPAS.len())
}

/// Los roles de la ronda sin repetir proveedor (integrador, verificadores, redactor) y la función de
/// cada uno en su fila (PantallaRonda.cs:96 y 202-206).
pub fn funciones_de_roles(roles: &RolesElegidos) -> Vec<(String, &'static str)> {
    let mismo = roles.redactor == roles.integrador;
    let mut v: Vec<(String, &'static str)> = Vec::new();
    // Como el diccionario de la Unity: la última asignación gana y el orden es el de la primera.
    let mut poner = |id: &str, f: &'static str| match v.iter_mut().find(|(i, _)| i == id) {
        Some(x) => x.1 = f,
        None => v.push((id.to_string(), f)),
    };
    let integra = if mismo {
        "Integra y redacta"
    } else {
        "Integra"
    };
    poner(&roles.integrador, integra);
    for id in roles.verificadores() {
        poner(id, "Verifica");
    }
    poner(&roles.redactor, if mismo { integra } else { "Redacta" });
    v
}

/// IFZ-005: el símbolo de IconoEstado y la palabra de cada estado de `Puerta::estado_de_panel`.
pub fn icono_y_palabra(estado: &str) -> (&'static str, &'static str) {
    match estado {
        "por-pegar" => ("por-pegar", "Por pegar"),
        "pegado-falta-enviar" => ("falta-enviar", "Pegado, falta que envíes"),
        "respondiendo" => ("respondiendo", "Respondiendo"),
        "parece-terminado-observado" | "parece-terminado-deducido" => {
            ("terminado", "Parece terminado")
        }
        "capturado" => ("capturado", "Capturado"),
        "con-problema" => ("problema", "Con problema"),
        _ => ("", ""),
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn el_titulo_de_la_barra_dice_la_etapa_y_su_numero() {
        assert_eq!(titulo_de_etapa("investigacion"), "Investigación · 2 de 7");
        assert_eq!(titulo_de_etapa("pregunta"), "Pregunta · 1 de 7");
        assert_eq!(titulo_de_etapa("informe"), "Informe · 7 de 7");
        assert_eq!(nombre_de_etapa("verificacion"), "Verificación");
    }

    #[test]
    fn cada_estado_de_panel_tiene_su_simbolo_y_su_palabra() {
        assert_eq!(icono_y_palabra("por-pegar"), ("por-pegar", "Por pegar"));
        assert_eq!(
            icono_y_palabra("pegado-falta-enviar"),
            ("falta-enviar", "Pegado, falta que envíes")
        );
        assert_eq!(
            icono_y_palabra("respondiendo"),
            ("respondiendo", "Respondiendo")
        );
        assert_eq!(
            icono_y_palabra("parece-terminado-observado"),
            ("terminado", "Parece terminado")
        );
        assert_eq!(
            icono_y_palabra("parece-terminado-deducido"),
            ("terminado", "Parece terminado")
        );
        assert_eq!(icono_y_palabra("capturado"), ("capturado", "Capturado"));
        assert_eq!(
            icono_y_palabra("con-problema"),
            ("problema", "Con problema")
        );
        assert_eq!(icono_y_palabra("otro"), ("", ""));
    }

    #[test]
    fn cada_rol_de_la_ronda_tiene_su_funcion_sin_repetir_proveedor() {
        let r = RolesElegidos::new("claude", "grok", "kimi", "claude");
        assert_eq!(
            funciones_de_roles(&r),
            vec![
                ("claude".to_string(), "Integra y redacta"),
                ("grok".into(), "Verifica"),
                ("kimi".into(), "Verifica")
            ]
        );
        let r = RolesElegidos::new("deepseek", "glm", "qwen", "kimi");
        assert_eq!(
            funciones_de_roles(&r),
            vec![
                ("deepseek".to_string(), "Integra"),
                ("glm".into(), "Verifica"),
                ("qwen".into(), "Verifica"),
                ("kimi".into(), "Redacta")
            ]
        );
    }
    use crate::json::vector;
    use crate::registro::pruebas::{campo as de, lista, str_de};

    fn strs(v: &Valor) -> Vec<&str> {
        lista(v).iter().map(str_de).collect()
    }

    fn opcion(v: &Valor) -> Option<&str> {
        match v {
            Valor::Nulo => None,
            v => Some(str_de(v)),
        }
    }

    fn roles_de(v: &Valor) -> RolesElegidos {
        RolesElegidos::new(
            str_de(de(v, "integrador")),
            str_de(de(v, "verificador1")),
            str_de(de(v, "verificador2")),
            str_de(de(v, "redactor")),
        )
    }

    #[test]
    fn ronda_los_conocidos_son_los_de_typescript() {
        assert_eq!(strs(&vector("Conocidos")), CONOCIDOS);
    }

    #[test]
    fn ronda_los_roles_por_defecto_son_los_de_la_version_electron() {
        let d = RolesElegidos::por_defecto();
        assert_eq!(
            strs(&vector("RolesPorDefecto")),
            [
                d.integrador.as_str(),
                &d.verificador1,
                &d.verificador2,
                &d.redactor
            ]
        );
        assert_eq!(validar_seleccion(&CONOCIDOS, &CONOCIDOS, &d), None);
    }

    #[test]
    fn ronda_la_seleccion_y_los_roles_se_leen_como_en_typescript() {
        let v = vector("Selecciones");
        assert_eq!(lista(&v).len(), 18);
        for caso in lista(&v) {
            let contenido = opcion(de(caso, "contenido"));
            let esperada = json::leer(str_de(de(caso, "seleccion"))).unwrap();
            let leida = leer_seleccion(contenido, &CONOCIDOS).map_or(Valor::Nulo, |l| {
                Valor::Lista(l.iter().map(|s| Valor::Texto(s.as_str().into())).collect())
            });
            assert_eq!(leida, esperada, "{contenido:?}");
            let roles = json::leer(str_de(de(caso, "roles"))).unwrap();
            assert_eq!(
                leer_roles(contenido, &CONOCIDOS),
                roles_de(&roles),
                "{contenido:?}"
            );
        }
    }

    #[test]
    fn ronda_la_seleccion_se_valida_y_se_guarda_como_en_typescript() {
        let v = vector("Guardados");
        assert_eq!(lista(&v).len(), 12);
        for caso in lista(&v) {
            let marcados = strs(de(caso, "marcados"));
            let roles = roles_de(caso);
            let error = validar_seleccion(&CONOCIDOS, &marcados, &roles);
            let esperado = json::leer(str_de(de(caso, "esperado"))).unwrap();
            let ok = de(&esperado, "ok") == &Valor::Bool(true);
            assert_eq!(error.is_none(), ok);
            if !ok {
                assert_eq!(error, opcion(de(&esperado, "error")));
            }
            // T19: lo que se escribe es lo que el arranque lee; una selección inválida no se escribe.
            match guardar(&CONOCIDOS, &marcados, &roles, "2026-10-10T12:00:00.000Z") {
                Err(e) => assert_eq!(Some(e), error),
                Ok(contenido) => {
                    let esperada: Vec<String> = CONOCIDOS
                        .iter()
                        .filter(|c| marcados.contains(c))
                        .map(|c| c.to_string())
                        .collect();
                    assert_eq!(leer_seleccion(Some(&contenido), &CONOCIDOS), Some(esperada));
                    assert_eq!(leer_roles(Some(&contenido), &CONOCIDOS), roles);
                }
            }
        }
    }

    #[test]
    fn ronda_la_seleccion_se_escribe_con_el_formato_de_typescript() {
        let roles = RolesElegidos::new("chatgpt", "glm", "qwen", "chatgpt");
        assert_eq!(
            guardar(
                &CONOCIDOS,
                &["qwen", "glm", "chatgpt"],
                &roles,
                "2026-10-10T12:00:00.000Z"
            )
            .unwrap(),
            "{\n  \"proveedores\": [\n    \"chatgpt\",\n    \"glm\",\n    \"qwen\"\n  ],\n  \"integrador\": \"chatgpt\",\n  \"verificador1\": \"glm\",\n  \"verificador2\": \"qwen\",\n  \"redactor\": \"chatgpt\",\n  \"guardadoEn\": \"2026-10-10T12:00:00.000Z\"\n}"
        );
    }

    #[test]
    fn ronda_el_pool_son_todos_menos_los_roles() {
        let v = vector("Pooles");
        for caso in lista(&v) {
            let roles = roles_de(&json::leer(str_de(de(caso, "roles"))).unwrap());
            assert_eq!(
                pool_de_investigadores(&CONOCIDOS, &roles),
                strs(de(caso, "pool"))
            );
        }
        let d = leer_roles(None, &CONOCIDOS);
        assert_eq!(
            pool_de_investigadores(&CONOCIDOS, &d),
            [
                "chatgpt",
                "gemini",
                "claude",
                "grok",
                "mistral",
                "kimi",
                "perplexity"
            ]
        );
    }

    #[test]
    fn ronda_cada_etapa_tiene_sus_roles_y_su_recordatorio() {
        let d = RolesElegidos::por_defecto();
        let etapas = [
            ("pregunta", vec![]),
            ("investigacion", vec![]),
            ("operacion", vec![]),
            ("integracion", vec!["deepseek"]),
            ("verificacion", vec!["glm", "qwen"]),
            ("redaccion", vec!["deepseek"]),
            ("informe", vec!["deepseek"]),
        ];
        for (etapa, roles) in etapas {
            assert_eq!(d.de_la_etapa(etapa), roles, "{etapa}");
            assert!(!recordatorio(etapa).is_empty());
        }
        assert_eq!(
            recordatorio("verificacion"),
            "En el panel de cada verificador, activa la búsqueda web y el razonamiento, no la investigación profunda (devuelve un informe, no las líneas que pide el prompt); revisa y envía tú."
        );
    }
}
