//! La operación: anonimización y barajado (Anonimizacion.cs), cuerpos ciegos con marcas y control de
//! fugas (Cuerpos.cs) y su prompt (Prompts.cs:80-99). Todo se calcula en unidades UTF-16, como C#:
//! largos, cortes e índices son los de la Unity.

use crate::datos;
use crate::registro::es_blanco;
use crate::texto::Texto;
use std::collections::HashMap;

/// Términos que identifican proveedor, modelo o empresa.
pub const TERMINOS_BLOQUEADOS: [&str; 30] = [
    "Anthropic",
    "Claude",
    "Sonnet",
    "Opus",
    "Haiku",
    "OpenAI",
    "ChatGPT",
    "GPT-5",
    "GPT-4",
    "GPT",
    "Google",
    "Gemini",
    "DeepMind",
    "Bard",
    "DeepSeek",
    "Perplexity",
    "Sonar",
    "Mistral",
    "Groq",
    "Grok",
    "xAI",
    "OpenRouter",
    "GLM",
    "Zhipu",
    "Z.ai",
    "Qwen3",
    "Qwen",
    "Alibaba",
    "Kimi",
    "Moonshot",
];

/// Token uniforme: no insinúa el largo ni la inicial del término tapado.
pub const TOKEN_REDACCION: &str = "▮▮▮";

pub const INTERVALO_MARCA: usize = 1000;
const TOLERANCIA_MARCAS: usize = 3;

/// Roles.Conocidos: los ids que delatan al proveedor si aparecen en la query de una URL.
pub const CONOCIDOS: [&str; 10] = [
    "chatgpt",
    "gemini",
    "claude",
    "grok",
    "mistral",
    "glm",
    "kimi",
    "qwen",
    "deepseek",
    "perplexity",
];

/// newConversationUrl de los diez en specs.json: la interfaz de cada proveedor.
const DOMINIOS_PROPIOS: [&str; 10] = [
    "chatgpt.com",
    "chat.z.ai",
    "claude.ai",
    "gemini.google.com",
    "grok.com",
    "chat.mistral.ai",
    "chat.qwen.ai",
    "kimi.ai",
    "chat.deepseek.com",
    "perplexity.ai",
];

fn u(s: &str) -> Vec<u16> {
    s.encode_utf16().collect()
}

fn mostrar(u: &[u16]) -> String {
    String::from_utf16_lossy(u)
}

/// IndexOf ordinal desde `desde`.
fn buscar(t: &[u16], aguja: &[u16], desde: usize) -> Option<usize> {
    if aguja.is_empty() {
        return Some(desde);
    }
    t.get(desde..)?
        .windows(aguja.len())
        .position(|w| w == aguja)
        .map(|p| p + desde)
}

fn partir<'a>(t: &'a [u16], separador: &[u16]) -> Vec<&'a [u16]> {
    let mut partes = Vec::new();
    let mut desde = 0;
    while let Some(i) = buscar(t, separador, desde) {
        partes.push(&t[desde..i]);
        desde = i + separador.len();
    }
    partes.push(&t[desde..]);
    partes
}

/// Js.ToLowerCase: U+0130 da "i" + U+0307 y el signo Kelvin da "k"; lo demás, unidad por unidad.
pub(crate) fn minusculas(t: &[u16]) -> Vec<u16> {
    let mut s = Vec::with_capacity(t.len());
    for &c in t {
        match c {
            0x0130 => s.extend([b'i' as u16, 0x0307]),
            0x212A => s.push(b'k' as u16),
            _ => {
                let mut m = char::from_u32(c as u32)
                    .into_iter()
                    .flat_map(char::to_lowercase);
                match (m.next(), m.next()) {
                    (Some(l), None) if (l as u32) < 0x10000 => s.push(l as u32 as u16),
                    _ => s.push(c),
                }
            }
        }
    }
    s
}

// ------------------------------------------------------------------ anonimización

/// FNV-1a de 32 bits sobre unidades UTF-16 (como charCodeAt): la semilla de la ronda a número.
pub fn hash_semilla(semilla: &Texto) -> u32 {
    semilla.a_utf16().iter().fold(0x811c9dc5u32, |h, &c| {
        (h ^ c as u32).wrapping_mul(0x01000193)
    })
}

// Math.imul y >>> de JS son la aritmética de u32 con desborde.
fn mulberry32(a: &mut u32) -> f64 {
    *a = a.wrapping_add(0x6d2b79f5);
    let mut t = *a;
    t = (t ^ (t >> 15)).wrapping_mul(t | 1);
    t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
    f64::from(t ^ (t >> 14)) / 4294967296.0
}

/// Fisher-Yates con mulberry32. No toca la entrada.
pub fn barajar<T: Clone>(items: &[T], semilla: u32) -> Vec<T> {
    let mut salida = items.to_vec();
    let mut estado = semilla;
    for i in (1..salida.len()).rev() {
        let j = (mulberry32(&mut estado) * (i + 1) as f64).floor() as usize;
        salida.swap(i, j);
    }
    salida
}

/// Una entrada del sello: etiqueta → panel. Sin id ni rondaId, que los pone quien lo escribe.
#[derive(Debug, Clone, PartialEq)]
pub struct EntradaSello {
    pub label: String,
    pub codigo_estable: String,
    pub panel_source_id: String,
    pub reply_id: Texto,
    pub attempt_id: Texto,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RespuestaParaOperar {
    pub proveedor_id: String,
    pub reply_id: Texto,
    pub attempt_id: Texto,
    pub texto: Texto,
    pub urls_citadas: Vec<Texto>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Anonimizado {
    pub etiquetadas: Vec<(String, Texto)>,
    /// Sin código estable: lo pone armar_cuerpos_por_operador.
    pub sello: Vec<EntradaSello>,
    /// Solo las etiquetas con al menos un término tapado.
    pub redacciones: Vec<(String, usize)>,
}

/// anonymizeReplies: baraja, etiqueta «Modelo A».. en el orden barajado y tapa los términos.
pub fn anonimizar_respuestas(respuestas: &[RespuestaParaOperar], semilla: u32) -> Anonimizado {
    let mut a = Anonimizado {
        etiquetadas: Vec::new(),
        sello: Vec::new(),
        redacciones: Vec::new(),
    };
    let refs: Vec<&RespuestaParaOperar> = respuestas.iter().collect();
    for (i, r) in barajar(&refs, semilla).into_iter().enumerate() {
        let label = format!("Modelo {}", (b'A' + (i % 26) as u8) as char);
        let (texto, cuenta) = tapar(&r.texto.a_utf16());
        a.etiquetadas
            .push((label.clone(), Texto::desde_utf16(&texto)));
        a.sello.push(EntradaSello {
            label: label.clone(),
            codigo_estable: String::new(),
            panel_source_id: r.proveedor_id.clone(),
            reply_id: r.reply_id.clone(),
            attempt_id: r.attempt_id.clone(),
        });
        if cuenta > 0 {
            a.redacciones.push((label, cuenta));
        }
    }
    a
}

/// /(?<![\p{L}\p{N}])(?:términos)(?![\p{L}\p{N}])/giu: límites por punto de código, los largos primero.
fn tapar(t: &[u16]) -> (Vec<u16>, usize) {
    let mut por_largo = TERMINOS_BLOQUEADOS;
    // Estable, como OrderByDescending: «GPT-4» se prueba antes que «GPT».
    por_largo.sort_by_key(|x| std::cmp::Reverse(x.len()));
    let token = u(TOKEN_REDACCION);
    let (mut s, mut cuenta, mut i) = (Vec::with_capacity(t.len()), 0, 0);
    while i < t.len() {
        let termino = if hay_letra_o_numero_antes(t, i) {
            None
        } else {
            por_largo.iter().find(|x| coincide_en(t, i, x))
        };
        match termino {
            None => {
                s.push(t[i]);
                i += 1;
            }
            Some(x) => {
                s.extend_from_slice(&token);
                cuenta += 1;
                i += x.len();
            }
        }
    }
    (s, cuenta)
}

fn coincide_en(t: &[u16], i: usize, termino: &str) -> bool {
    let fin = i + termino.len();
    fin <= t.len()
        && termino
            .bytes()
            .zip(&t[i..fin])
            .all(|(a, &b)| plegar(b) == a.to_ascii_lowercase() as u16)
        && (fin == t.len() || !es_letra_o_numero(t, fin))
}

// Pliegue simple de Unicode, el de /i con /u: fuera de ASCII solo ſ y el signo Kelvin dan una letra ASCII.
fn plegar(c: u16) -> u16 {
    match c {
        0x41..=0x5A => c + 32,
        0x017F => b's' as u16,
        0x212A => b'k' as u16,
        _ => c,
    }
}

fn es_alto(c: u16) -> bool {
    (0xD800..0xDC00).contains(&c)
}

fn es_bajo(c: u16) -> bool {
    (0xDC00..0xE000).contains(&c)
}

fn hay_letra_o_numero_antes(t: &[u16], i: usize) -> bool {
    if i == 0 {
        return false;
    }
    let mut k = i - 1;
    if k > 0 && es_bajo(t[k]) && es_alto(t[k - 1]) {
        k -= 1;
    }
    es_letra_o_numero(t, k)
}

/// \p{L} o \p{N} del punto de código en `i` (el par de surrogates entero).
fn es_letra_o_numero(t: &[u16], i: usize) -> bool {
    let c = t[i] as u32;
    let punto = if es_alto(t[i]) && i + 1 < t.len() && es_bajo(t[i + 1]) {
        0x10000 + ((c - 0xD800) << 10) + (t[i + 1] as u32 - 0xDC00)
    } else {
        c
    };
    // shortcut: is_alphanumeric es Alphabetic + N, y Alphabetic suma Other_Alphabetic (marcas
    // combinantes como U+0345, letras en círculo) a \p{L}; si un texto real lo pide, tabla de categorías.
    char::from_u32(punto).is_some_and(char::is_alphanumeric)
}

/// P1..Pn en el orden fijo del pool; un id repetido se queda con su última posición.
pub fn codigos_estables(ids: &[&str]) -> HashMap<String, String> {
    ids.iter()
        .enumerate()
        .map(|(i, id)| (id.to_string(), format!("P{}", i + 1)))
        .collect()
}

// ------------------------------------------------------------------ fuentes y fugas

/// Quita todo parámetro de query salvo «model»; el fragmento queda tal cual.
pub fn limpiar_query_lista_blanca(url: &Texto) -> Texto {
    Texto::desde_utf16(&limpiar_query(&url.a_utf16()))
}

fn limpiar_query(url: &[u16]) -> Vec<u16> {
    let Some(q) = url.iter().position(|&c| c == b'?' as u16) else {
        return url.to_vec();
    };
    let h = url[q..]
        .iter()
        .position(|&c| c == b'#' as u16)
        .map(|p| p + q);
    let query = &url[q + 1..h.unwrap_or(url.len())];
    let conservados: Vec<&[u16]> = query
        .split(|&c| c == b'&' as u16)
        .filter(|par| {
            !par.is_empty() && es_model(par.split(|&c| c == b'=' as u16).next().unwrap_or(&[]))
        })
        .collect();
    let mut s = url[..q].to_vec();
    if !conservados.is_empty() {
        s.push(b'?' as u16);
        s.extend(conservados.join(&(b'&' as u16)));
    }
    s.extend_from_slice(h.map_or(&[][..], |h| &url[h..]));
    s
}

/// Uri.UnescapeDataString(nombre) == "model": un escape mal formado queda literal, y uno que da un
/// byte no ASCII ya no puede ser «model».
fn es_model(nombre: &[u16]) -> bool {
    let hex = |c: u16| char::from_u32(c as u32).and_then(|c| c.to_digit(16));
    let mut b = Vec::with_capacity(nombre.len());
    let mut i = 0;
    while i < nombre.len() {
        if nombre[i] > 0x7F {
            return false;
        }
        if nombre[i] == b'%' as u16
            && i + 2 < nombre.len()
            && let (Some(a), Some(z)) = (hex(nombre[i + 1]), hex(nombre[i + 2]))
        {
            b.push((a * 16 + z) as u8);
            i += 3;
            continue;
        }
        b.push(nombre[i] as u8);
        i += 1;
    }
    b == b"model"
}

/// Las URL http(s) del texto que delatan al proveedor: por host de interfaz, o por el id de un
/// proveedor en la query. Reproduce /https?:\/\/\S+/gi.
pub fn fugas_de_proveedor_en_urls(texto: &Texto) -> Vec<Texto> {
    fugas(&texto.a_utf16())
        .iter()
        .map(|f| Texto::desde_utf16(f))
        .collect()
}

fn fugas(t: &[u16]) -> Vec<Vec<u16>> {
    let mut fugas = Vec::new();
    let mut i = 0;
    while i < t.len() {
        let prefijo = largo_prefijo_http(t, i);
        if prefijo == 0 {
            i += 1;
            continue;
        }
        let mut fin = i + prefijo;
        while fin < t.len() && !char::from_u32(t[fin] as u32).is_some_and(es_blanco) {
            fin += 1;
        }
        if fin == i + prefijo {
            i += 1;
            continue;
        }
        let url = &t[i..fin];
        let query = query_de(url);
        if es_interfaz_propia(url)
            || (!query.is_empty()
                && CONOCIDOS
                    .iter()
                    .any(|id| buscar(&query, &u(id), 0).is_some()))
        {
            fugas.push(url.to_vec());
        }
        i = fin;
    }
    fugas
}

// «http://» o «https://» sin distinguir mayúsculas ASCII (la /i sin /u no pliega ſ a s).
fn largo_prefijo_http(t: &[u16], i: usize) -> usize {
    if i + 7 > t.len()
        || !t[i..i + 4]
            .iter()
            .zip(b"http")
            .all(|(&c, &h)| c < 0x80 && (c as u8).to_ascii_lowercase() == h)
    {
        return 0;
    }
    let mut k = i + 4;
    if t[k] == b's' as u16 || t[k] == b'S' as u16 {
        k += 1;
    }
    if k + 3 <= t.len() && t[k..k + 3] == u("://")[..] {
        k + 3 - i
    } else {
        0
    }
}

fn host_de(url: &[u16]) -> Vec<u16> {
    let l = minusculas(url);
    let sin = l
        .strip_prefix(&u("https://")[..])
        .or_else(|| l.strip_prefix(&u("http://")[..]))
        .unwrap_or(&l);
    let fin = sin
        .iter()
        .position(|&c| c == b'/' as u16 || c == b'?' as u16 || c == b'#' as u16);
    sin[..fin.unwrap_or(sin.len())].to_vec()
}

// La interfaz es el host de la app o su www.: un subdominio de docs (learn., platform.) es una fuente más.
fn es_interfaz_propia(url: &[u16]) -> bool {
    let host = host_de(url);
    if !DOMINIOS_PROPIOS
        .iter()
        .any(|d| host == u(d) || host == u(&format!("www.{d}")))
    {
        return false;
    }
    // shortcut: solo /blog (www.kimi.ai, 2026-10-23), /help-center (2026-10-27) y /hub (2026-11-02,
    // www.perplexity.ai) medidos como contenido público en un host de interfaz; sumar rutas si aparecen otras.
    let desde = buscar(url, &u("//"), 0).unwrap_or(0) + 2 + host.len();
    let l = minusculas(url);
    let ruta = l.get(desde..).unwrap_or(&[]);
    !["/blog", "/help-center", "/hub"].iter().any(|r| {
        let r = u(r);
        ruta == &r[..]
            || ["/", "?", "#"]
                .iter()
                .any(|c| ruta.starts_with(&[&r[..], &u(c)[..]].concat()))
    })
}

fn query_de(url: &[u16]) -> Vec<u16> {
    let Some(q) = url.iter().position(|&c| c == b'?' as u16) else {
        return Vec::new();
    };
    let h = url[q..]
        .iter()
        .position(|&c| c == b'#' as u16)
        .map_or(url.len(), |p| p + q);
    minusculas(&url[q + 1..h])
}

fn unir_fugas(f: &[Vec<u16>]) -> String {
    f.iter().map(|x| mostrar(x)).collect::<Vec<_>>().join(" | ")
}

/// El texto más sus fuentes con la query limpia. Error si el cuerpo armado todavía delata al
/// proveedor: nunca devuelve un cuerpo que no pasó su propia verificación.
pub fn armar_cuerpo_con_fuentes(texto: &Texto, urls: &[Texto]) -> Result<Texto, String> {
    cuerpo_con_fuentes(&texto.a_utf16(), urls).map(|c| Texto::desde_utf16(&c))
}

fn cuerpo_con_fuentes(texto: &[u16], urls: &[Texto]) -> Result<Vec<u16>, String> {
    let mut cuerpo = texto.to_vec();
    if !urls.is_empty() {
        cuerpo.extend(u("\n\nFuentes citadas:"));
        for url in urls {
            cuerpo.extend(u("\n- "));
            cuerpo.extend(limpiar_query(&url.a_utf16()));
        }
    }
    let f = fugas(&cuerpo);
    if !f.is_empty() {
        return Err(format!(
            "cuerpo anonimizado filtra identidad de proveedor por URL ({}): {}",
            f.len(),
            unir_fugas(&f)
        ));
    }
    Ok(cuerpo)
}

// ------------------------------------------------------------------ marcas e integridad

/// [[CC-MARCA-NNNN-token]] en su propia línea en el primer espacio o salto a partir de cada
/// `intervalo` caracteres, nunca en medio de una palabra; si el tramo no tiene ninguno, al final.
pub fn insertar_marcas_intercaladas(
    texto: &Texto,
    token: &str,
    intervalo: usize,
) -> (Texto, Vec<String>) {
    let (t, marcas) = marcas_intercaladas(&texto.a_utf16(), token, intervalo);
    (Texto::desde_utf16(&t), marcas)
}

pub(crate) fn marcas_intercaladas(
    t: &[u16],
    token: &str,
    intervalo: usize,
) -> (Vec<u16>, Vec<String>) {
    let (mut s, mut marcas, mut pos) = (Vec::with_capacity(t.len() + t.len() / 20), Vec::new(), 0);
    while pos < t.len() {
        let mut corte = (pos + intervalo).min(t.len());
        while corte < t.len() && t[corte] != b' ' as u16 && t[corte] != b'\n' as u16 {
            corte += 1;
        }
        let marca = format!("[[CC-MARCA-{:04}-{token}]]", marcas.len());
        s.extend_from_slice(&t[pos..corte]);
        s.push(b'\n' as u16);
        s.extend(marca.encode_utf16());
        s.push(b'\n' as u16);
        marcas.push(marca);
        pos = corte;
    }
    (s, marcas)
}

#[derive(Debug, Clone, PartialEq)]
pub struct Integridad {
    pub estado: &'static str,
    pub esperadas: usize,
    pub presentes: usize,
    pub faltantes: Vec<usize>,
}

/// «completo» con todas las marcas; «truncado» si faltan en un tramo contiguo; «indeterminado» si
/// faltan dispersas.
pub fn evaluar_integridad(respuesta: &Texto, marcas: &[String]) -> Integridad {
    // Las marcas son ASCII: buscarlas en los bytes WTF-8 da lo mismo que en UTF-16.
    let b = respuesta.bytes();
    let faltantes: Vec<usize> = (0..marcas.len())
        .filter(|&i| {
            // Una marca vacía está siempre, como Contains("") en la Unity; windows(0) entraría en pánico.
            !(marcas[i].is_empty()
                || b.windows(marcas[i].len())
                    .any(|w| w == marcas[i].as_bytes()))
        })
        .collect();
    let estado = if faltantes.is_empty() {
        "completo"
    } else if faltantes.windows(2).all(|p| p[1] == p[0] + 1) {
        "truncado"
    } else {
        "indeterminado"
    };
    Integridad {
        estado,
        esperadas: marcas.len(),
        presentes: marcas.len() - faltantes.len(),
        faltantes,
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Perdida {
    pub indice: usize,
    pub largo_original: usize,
    pub largo_final: usize,
    pub delta: i64,
}

/// Los segmentos entre marcas cuyo largo cambió. Solo tiene sentido con integridad «completo».
pub fn localizar_perdida(original: &Texto, final_: &Texto, marcas: &[String]) -> Vec<Perdida> {
    let marcas: Vec<Vec<u16>> = marcas.iter().map(|m| u(m)).collect();
    let partir_por_marcas = |t: &[u16]| {
        let (mut largos, mut desde) = (Vec::new(), 0);
        for m in &marcas {
            let Some(i) = buscar(t, m, desde) else { break };
            largos.push(i - desde);
            desde = i + m.len();
        }
        largos.push(t.len() - desde);
        largos
    };
    let o = partir_por_marcas(&original.a_utf16());
    let f = partir_por_marcas(&final_.a_utf16());
    (0..o.len().max(f.len()))
        .filter_map(|i| {
            let (lo, lf) = (
                o.get(i).copied().unwrap_or(0),
                f.get(i).copied().unwrap_or(0),
            );
            (lo != lf).then(|| Perdida {
                indice: i,
                largo_original: lo,
                largo_final: lf,
                delta: lf as i64 - lo as i64,
            })
        })
        .collect()
}

/// Comprobación cruzada de la exclusión de autoevaluación: lo esperado sale del pool menos la
/// respuesta propia, nunca de lo que el cuerpo terminó incluyendo.
pub fn comprobar_exclusion(
    operador_id: &str,
    marcas_reales: usize,
    tamano_esperado: usize,
) -> Result<(), String> {
    let esperadas = ((tamano_esperado as f64 / INTERVALO_MARCA as f64).round() as usize).max(1);
    if marcas_reales.abs_diff(esperadas) > TOLERANCIA_MARCAS {
        return Err(format!(
            "cuerpo de {operador_id}: {marcas_reales} marcas, esperadas ~{esperadas} (±{TOLERANCIA_MARCAS}) a partir de \"pool menos la respuesta propia\" — posible fallo de exclusión de autoevaluación u otro cambio en qué se incluye."
        ));
    }
    Ok(())
}

// ------------------------------------------------------------------ cuerpos por operador

#[derive(Debug, Clone, PartialEq)]
pub struct CuerpoOperador {
    /// El proveedor que VA A OPERAR este cuerpo.
    pub operador_id: String,
    pub cuerpo: Texto,
    /// Las intercaladas y al final la de FIN.
    pub marcas: Vec<String>,
    /// Solo para verificar la exclusión; nunca es lo que el operador lee.
    pub proveedores_incluidos: Vec<String>,
    /// Código estable P# y texto limpio de fuentes, sin marcas: lo que arma el prompt de operación.
    pub respuestas_para_operador: Vec<(String, Texto)>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CuerposPorOperador {
    pub cuerpos: Vec<CuerpoOperador>,
    pub sello: Vec<EntradaSello>,
    /// Todo el pool, en el orden barajado: lo que lee el redactor.
    pub respuestas_todas: Vec<(String, Texto)>,
}

/// Los cuerpos de todos los operadores. `respuestas` es exactamente el pool y `pool_orden` el mismo
/// conjunto en el orden declarado, de donde salen los P#. El token va inyectado para las pruebas.
pub fn armar_cuerpos_por_operador(
    respuestas: &[RespuestaParaOperar],
    pool_orden: &[&str],
    semilla: u32,
    generar_token: &mut dyn FnMut() -> String,
) -> Result<CuerposPorOperador, String> {
    let mut a = anonimizar_respuestas(respuestas, semilla);
    let urls_por: HashMap<&str, &[Texto]> = respuestas
        .iter()
        .map(|r| (r.proveedor_id.as_str(), r.urls_citadas.as_slice()))
        .collect();
    // Cada respuesta tal como entra al cuerpo: texto ya anonimizado más la lista de fuentes.
    let mut limpios = Vec::with_capacity(a.etiquetadas.len());
    let mut largo_por: HashMap<&str, usize> = HashMap::new();
    for ((_, texto), s) in a.etiquetadas.iter().zip(&a.sello) {
        let urls = urls_por
            .get(s.panel_source_id.as_str())
            .copied()
            .unwrap_or(&[]);
        let c = cuerpo_con_fuentes(&texto.a_utf16(), urls)?;
        largo_por.insert(&s.panel_source_id, c.len());
        limpios.push(c);
    }
    // Cada respuesta limpia pasa a Texto una sola vez; los cuerpos de los operadores la clonan.
    let limpios_texto: Vec<Texto> = limpios.iter().map(|c| Texto::desde_utf16(c)).collect();
    let suma_total: usize = largo_por.values().sum();
    let codigos = codigos_estables(pool_orden);
    let codigo_de = |id: &str| codigos.get(id).cloned().unwrap_or_default();

    let mut cuerpos = Vec::with_capacity(pool_orden.len());
    for &operador in pool_orden {
        let (mut bloques, mut incluidos, mut para_operador) = (Vec::new(), Vec::new(), Vec::new());
        for ((s, limpio), limpio_texto) in a.sello.iter().zip(&limpios).zip(&limpios_texto) {
            if s.panel_source_id == operador {
                continue; // exclusión de autoevaluación
            }
            bloques.push([u(&format!("### Respuesta {}\n", s.label)), limpio.clone()].concat());
            incluidos.push(s.panel_source_id.clone());
            // El prompt de operación promete «P1 a P7»: el operador lee el código estable.
            para_operador.push((codigo_de(&s.panel_source_id), limpio_texto.clone()));
        }
        let token = generar_token();
        let (con_marcas, mut marcas) =
            marcas_intercaladas(&bloques.join(&u("\n\n")[..]), &token, INTERVALO_MARCA);
        let fin = format!("[[CC-MARCA-FIN-{token}]]");
        let cuerpo = [con_marcas, u(&format!("\n{fin}\n"))].concat();
        comprobar_exclusion(
            operador,
            marcas.len(),
            suma_total - largo_por.get(operador).copied().unwrap_or(0),
        )?;
        let f = fugas(&cuerpo);
        if !f.is_empty() {
            return Err(format!(
                "cuerpo del operador {operador} filtra identidad de proveedor por URL: {}",
                unir_fugas(&f)
            ));
        }
        marcas.push(fin);
        cuerpos.push(CuerpoOperador {
            operador_id: operador.to_string(),
            cuerpo: Texto::desde_utf16(&cuerpo),
            marcas,
            proveedores_incluidos: incluidos,
            respuestas_para_operador: para_operador,
        });
    }
    for s in &mut a.sello {
        s.codigo_estable = codigo_de(&s.panel_source_id);
    }
    let respuestas_todas = a
        .sello
        .iter()
        .zip(limpios_texto)
        .map(|(s, c)| (s.codigo_estable.clone(), c))
        .collect();
    Ok(CuerposPorOperador {
        cuerpos,
        sello: a.sello,
        respuestas_todas,
    })
}

// ------------------------------------------------------------------ prompt de operación

// Partiendo y juntando, en una sola pasada: lo insertado no se vuelve a recorrer.
pub(crate) fn sustituir(texto: &[u16], pares: &[(&str, &[u16])]) -> Vec<u16> {
    let Some(((marcador, valor), resto)) = pares.split_first() else {
        return texto.to_vec();
    };
    partir(texto, &u(marcador))
        .iter()
        .map(|p| sustituir(p, resto))
        .collect::<Vec<_>>()
        .join(*valor)
}

pub(crate) fn cuerpo_de(respuestas: &[(String, Texto)]) -> Vec<u16> {
    respuestas
        .iter()
        .map(|(e, t)| [u(&format!("=== {e} ===\n")), t.a_utf16()].concat())
        .collect::<Vec<_>>()
        .join(&u("\n\n")[..])
}

fn plantilla(nombre: &str) -> Vec<u16> {
    u(datos::plantilla(datos::PROMPT_OPERACION, nombre)
        .expect("plantilla de operación en datos/prompts"))
}

pub fn armar_prompt_operacion(pregunta: &Texto, respuestas: &[(String, Texto)]) -> Texto {
    Texto::desde_utf16(&prompt_operacion_utf16(pregunta, respuestas))
}

/// El prompt de operación en unidades UTF-16, para intercalarle las marcas sin pasar por Texto.
pub(crate) fn prompt_operacion_utf16(pregunta: &Texto, respuestas: &[(String, Texto)]) -> Vec<u16> {
    sustituir(
        &plantilla("PLANTILLA"),
        &[
            ("{{PREGUNTA}}", &pregunta.a_utf16()),
            ("{{CUERPO}}", &cuerpo_de(respuestas)),
        ],
    )
}

pub(crate) fn prompt_con_archivo(pregunta: &Texto) -> Texto {
    Texto::desde_utf16(&sustituir(
        &plantilla("PLANTILLA_CON_ARCHIVO"),
        &[("{{PREGUNTA}}", &pregunta.a_utf16())],
    ))
}

/// La vía de archivo: el prompt sin el cuerpo, y el cuerpo con sus separadores === P# ===. Las
/// marcas las intercala quien llama.
pub fn armar_prompt_operacion_con_archivo(
    pregunta: &Texto,
    respuestas: &[(String, Texto)],
) -> (Texto, Texto) {
    (
        prompt_con_archivo(pregunta),
        Texto::desde_utf16(&cuerpo_de(respuestas)),
    )
}

/// Las diez cadenas que tiene que contener el prompt de operación (REQUISITOS_PROMPT_OPERACION).
pub const REQUISITOS_PROMPT_OPERACION: [&str; 10] = [
    "CONVERGENCIA",
    "DIVERGENCIA",
    "TENSION",
    "SINGULARIDAD",
    "AUSENCIA",
    "LIMITACION:CORPUS",
    "LIMITACION:AMBIGUEDAD",
    "LIMITACION:TAREA",
    "LIMITACION:OTRA",
    "LA PREGUNTA ORIGINAL FUE:",
];

const CR: u16 = b'\r' as u16;
const LF: u16 = b'\n' as u16;

/// \r\n → \n (sin solaparse).
fn sin_cr(t: &[u16]) -> Vec<u16> {
    let mut r = Vec::with_capacity(t.len());
    for (i, &c) in t.iter().enumerate() {
        if !(c == CR && t.get(i + 1) == Some(&LF)) {
            r.push(c);
        }
    }
    r
}

/// Cuerpos.Normalizar: \r\n → \n y el espacio duro a espacio.
fn normalizar(t: &[u16]) -> Vec<u16> {
    let mut r = sin_cr(t);
    for c in &mut r {
        if *c == 0xA0 {
            *c = b' ' as u16;
        }
    }
    r
}

/// MarcaConSaltos: \n\[\[CC-MARCA-[^\]\n]*\]\]\n? fuera.
fn sin_marcas_con_saltos(t: &[u16]) -> Vec<u16> {
    let inicio: Vec<u16> = "\n[[CC-MARCA-".encode_utf16().collect();
    let mut r = Vec::with_capacity(t.len());
    let mut i = 0;
    while i < t.len() {
        if t[i..].starts_with(&inicio) {
            let j = i + inicio.len();
            let k = j + t[j..]
                .iter()
                .take_while(|&&c| c != b']' as u16 && c != LF)
                .count();
            if t.get(k) == Some(&(b']' as u16)) && t.get(k + 1) == Some(&(b']' as u16)) {
                i = k + 2 + usize::from(t.get(k + 2) == Some(&LF));
                continue;
            }
        }
        r.push(t[i]);
        i += 1;
    }
    r
}

/// Cuerpos.VerificarEscritura (ESC-010, T21): el error de la operación escrita en el compositor, o
/// None si quedó bien. Primero las diez cadenas, buscadas sin las marcas que pueden partirlas;
/// después la igualdad.
pub fn verificar_escritura(esperado: &Texto, leido: &Texto) -> Option<String> {
    let sin_marcas = sin_marcas_con_saltos(&normalizar(&leido.a_utf16()));
    let faltantes: Vec<&str> = REQUISITOS_PROMPT_OPERACION
        .into_iter()
        .filter(|r| {
            let r: Vec<u16> = r.encode_utf16().collect();
            !sin_marcas.windows(r.len()).any(|w| w == r)
        })
        .collect();
    if !faltantes.is_empty() {
        return Some(format!(
            "prompt incompleto: faltan {}",
            faltantes.join(", ")
        ));
    }
    verificar_igualdad(esperado, leido)
}

/// Cuerpos.VerificarIgualdad (ESC-011, T22): la igualdad carácter por carácter con \r\n y el
/// espacio duro normalizados; las cuentas son de unidades UTF-16, como string.Length.
pub fn verificar_igualdad(esperado: &Texto, leido: &Texto) -> Option<String> {
    let (esperado, leido) = (esperado.a_utf16(), leido.a_utf16());
    let final_ = normalizar(&leido);
    if final_ == normalizar(&esperado) {
        return None;
    }
    let saltos = |t: &[u16]| t.iter().filter(|&&c| c == LF).count() + 1;
    let lineas_prompt = saltos(&sin_cr(&esperado));
    let lineas_compositor = if final_.is_empty() {
        0
    } else {
        saltos(&final_)
    };
    Some(format!(
        "el compositor no es igual al prompt: {lineas_compositor} de {lineas_prompt} líneas, {} de {} caracteres",
        final_.len(),
        esperado.len()
    ))
}

/// Las verificaciones etiquetadas (A, B) y su sello (etiqueta, verificadorId).
pub type VerificacionesAnonimas = (Vec<(String, Texto)>, Vec<(String, String)>);

/// Anonimizacion.AnonimizarVerificaciones (D62, RED-002): las verificaciones para el redactor con
/// los términos tapados y barajadas con una semilla derivada de la ronda, A y B. El sello es
/// (etiqueta, verificadorId).
pub fn anonimizar_verificaciones(
    salidas: &[(String, Texto)],
    semilla_ronda: &Texto,
) -> VerificacionesAnonimas {
    let respuestas: Vec<RespuestaParaOperar> = salidas
        .iter()
        .map(|(id, texto)| RespuestaParaOperar {
            proveedor_id: id.clone(),
            reply_id: Texto::default(),
            attempt_id: Texto::default(),
            texto: texto.clone(),
            urls_citadas: Vec::new(),
        })
        .collect();
    let mut semilla = semilla_ronda.clone();
    semilla.empujar_str("|verificaciones");
    let a = anonimizar_respuestas(&respuestas, hash_semilla(&semilla));
    let etiqueta = |label: &str| label["Modelo ".len()..].to_string();
    (
        a.etiquetadas
            .into_iter()
            .map(|(l, t)| (etiqueta(&l), t))
            .collect(),
        a.sello
            .into_iter()
            .map(|s| (etiqueta(&s.label), s.panel_source_id))
            .collect(),
    )
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::json::{self, Valor, vector};
    use crate::registro::pruebas::{campo, lista, str_de, texto_de};

    fn t(s: &str) -> Texto {
        Texto::from(s)
    }

    fn entero(v: &Valor) -> i64 {
        match v {
            Valor::Entero(n) => *n,
            _ => panic!("se esperaba entero: {v:?}"),
        }
    }

    fn textos(v: &Valor) -> Vec<Texto> {
        lista(v).iter().map(|x| texto_de(x).clone()).collect()
    }

    fn strs(v: &Valor) -> Vec<String> {
        lista(v).iter().map(|x| str_de(x).to_string()).collect()
    }

    fn obj(campos: Vec<(&str, Valor)>) -> Valor {
        Valor::Objeto(campos.into_iter().map(|(k, v)| (t(k), v)).collect())
    }

    fn vt(x: &Texto) -> Valor {
        Valor::Texto(x.clone())
    }

    fn vs(x: &str) -> Valor {
        Valor::Texto(t(x))
    }

    fn vn(n: usize) -> Valor {
        Valor::Entero(n as i64)
    }

    fn json_de(v: &Valor) -> Valor {
        json::leer(str_de(v)).expect("JSON del vector")
    }

    fn etiquetadas(xs: &[(String, Texto)]) -> Valor {
        Valor::Lista(
            xs.iter()
                .map(|(e, x)| obj(vec![("etiqueta", vs(e)), ("texto", vt(x))]))
                .collect(),
        )
    }

    fn sello(s: &[EntradaSello], con_codigo: bool) -> Valor {
        Valor::Lista(
            s.iter()
                .map(|s| {
                    let mut c = vec![
                        ("label", vs(&s.label)),
                        ("panelSourceId", vs(&s.panel_source_id)),
                        ("replyId", vt(&s.reply_id)),
                        ("attemptId", vt(&s.attempt_id)),
                    ];
                    if con_codigo {
                        c.push(("codigoEstable", vs(&s.codigo_estable)));
                    }
                    obj(c)
                })
                .collect(),
        )
    }

    /// Anonimizados usa panelSourceId/text; Cuerpos, proveedorId/texto/urlsCitadas.
    fn respuestas_de(entrada: &Valor, cuerpos: bool) -> Vec<RespuestaParaOperar> {
        let (id, texto) = if cuerpos {
            ("proveedorId", "texto")
        } else {
            ("panelSourceId", "text")
        };
        lista(entrada)
            .iter()
            .map(|r| RespuestaParaOperar {
                proveedor_id: str_de(campo(r, id)).into(),
                reply_id: texto_de(campo(r, "replyId")).clone(),
                attempt_id: texto_de(campo(r, "attemptId")).clone(),
                texto: texto_de(campo(r, texto)).clone(),
                urls_citadas: if cuerpos {
                    textos(campo(r, "urlsCitadas"))
                } else {
                    Vec::new()
                },
            })
            .collect()
    }

    fn pool_cuerpos() -> Vec<String> {
        strs(&vector("PoolCuerpos"))
    }

    /// Referencias.g.cs:203 (SemillaCuerpos): constante de la Unity, sin vector propio.
    const SEMILLA_CUERPOS: u32 = 3680786241;

    #[test]
    fn operacion_el_hash_de_la_semilla_es_el_de_la_unity() {
        let obtenidos: Vec<i64> = lista(&vector("Semillas"))
            .iter()
            .map(|s| hash_semilla(texto_de(s)) as i64)
            .collect();
        let esperados: Vec<i64> = lista(&vector("HashSemillas")).iter().map(entero).collect();
        assert!(!obtenidos.is_empty());
        assert_eq!(obtenidos, esperados);
    }

    #[test]
    fn operacion_el_barajado_es_el_de_la_unity_y_no_toca_la_entrada() {
        let v = vector("Barajados");
        assert!(!lista(&v).is_empty());
        for caso in lista(&v) {
            let semilla = entero(campo(caso, "semilla")) as u32;
            let n = entero(campo(caso, "n")) as usize;
            let orden: Vec<usize> = lista(campo(caso, "orden"))
                .iter()
                .map(|x| entero(x) as usize)
                .collect();
            let entrada: Vec<usize> = (0..n).collect();
            assert_eq!(
                barajar(&entrada, semilla),
                orden,
                "semilla {semilla}, n {n}"
            );
            assert_eq!(entrada, (0..n).collect::<Vec<_>>());
        }
    }

    fn semillas_de_prueba(cuantas: usize) -> Vec<u32> {
        (0..cuantas)
            .map(|k| hash_semilla(&t(&format!("semilla-de-prueba-{k}"))))
            .collect()
    }

    #[test]
    fn operacion_el_barajado_es_uniforme() {
        let pool: Vec<usize> = (0..8).collect();
        let ordenes: Vec<Vec<usize>> = semillas_de_prueba(200)
            .iter()
            .map(|&s| barajar(&pool, s))
            .collect();
        let (mut coincidencias, mut pares) = (0u64, 0u64);
        for a in 0..ordenes.len() {
            for b in a + 1..ordenes.len() {
                pares += 1;
                coincidencias += (0..8).filter(|&i| ordenes[a][i] == ordenes[b][i]).count() as u64;
            }
        }
        let media = coincidencias as f64 / pares as f64;
        assert!((media - 1.0).abs() <= 0.15, "media {media}");
        let mut celdas = [[0u32; 8]; 8];
        for s in semillas_de_prueba(400) {
            for (pos, &e) in barajar(&pool, s).iter().enumerate() {
                celdas[e][pos] += 1;
            }
        }
        assert!(celdas.iter().flatten().all(|&c| (24..=76).contains(&c)));
    }

    #[test]
    fn operacion_terminos_token_y_conocidos_son_los_de_la_unity() {
        assert_eq!(strs(&vector("TerminosBloqueados")), TERMINOS_BLOQUEADOS);
        assert_eq!(str_de(&vector("TokenRedaccion")), TOKEN_REDACCION);
        assert_eq!(strs(&vector("Conocidos")), CONOCIDOS);
    }

    #[test]
    fn operacion_anonimizar_da_etiquetas_textos_sello_y_conteo_de_la_unity() {
        let v = vector("Anonimizados");
        assert!(!lista(&v).is_empty());
        for caso in lista(&v) {
            let semilla = entero(campo(caso, "semilla")) as u32;
            let a = anonimizar_respuestas(
                &respuestas_de(&json_de(campo(caso, "entrada")), false),
                semilla,
            );
            let obtenido = obj(vec![
                (
                    "labeled",
                    Valor::Lista(
                        a.etiquetadas
                            .iter()
                            .map(|(l, x)| obj(vec![("label", vs(l)), ("text", vt(x))]))
                            .collect(),
                    ),
                ),
                ("seal", sello(&a.sello, false)),
                (
                    "redactions",
                    Valor::Lista(
                        a.redacciones
                            .iter()
                            .map(|(l, n)| obj(vec![("label", vs(l)), ("count", vn(*n))]))
                            .collect(),
                    ),
                ),
            ]);
            assert_eq!(obtenido, json_de(campo(caso, "esperado")));
        }
    }

    #[test]
    fn operacion_los_terminos_se_tapan_por_punto_de_codigo() {
        let tapado = |s: &str| {
            let (x, n) = tapar(&u(s));
            (mostrar(&x), n)
        };
        assert_eq!(tapado("Claude dice"), ("▮▮▮ dice".into(), 1));
        // 𝐀 (letra) y 𝟏 (dígito) vienen en pares de surrogates: el límite se mira por punto de código.
        assert_eq!(tapado("𝐀Claude y Claude𝟏"), ("𝐀Claude y Claude𝟏".into(), 0));
        assert_eq!(tapado("GPT-4o y GPT-5"), ("▮▮▮-4o y ▮▮▮".into(), 2));
    }

    #[test]
    fn operacion_los_codigos_estables_siguen_el_orden_del_pool() {
        let v = vector("Codigos");
        assert!(!lista(&v).is_empty());
        for caso in lista(&v) {
            let ids = strs(campo(caso, "ids"));
            let mapa = codigos_estables(&ids.iter().map(String::as_str).collect::<Vec<_>>());
            let claves = strs(campo(caso, "claves"));
            assert_eq!(mapa.len(), claves.len());
            let codigos: Vec<&str> = claves.iter().map(|k| mapa[k].as_str()).collect();
            assert_eq!(codigos, strs(campo(caso, "codigos")));
        }
    }

    #[test]
    fn operacion_la_query_solo_conserva_model() {
        let v = vector("Limpiezas");
        assert!(!lista(&v).is_empty());
        for caso in lista(&v) {
            let url = texto_de(campo(caso, "url"));
            assert_eq!(
                &limpiar_query_lista_blanca(url),
                texto_de(campo(caso, "limpia")),
                "{url:?}"
            );
        }
    }

    #[test]
    fn operacion_las_fugas_son_las_de_la_unity() {
        let v = vector("Fugas");
        assert!(!lista(&v).is_empty());
        for caso in lista(&v) {
            let texto = texto_de(campo(caso, "texto"));
            assert_eq!(
                fugas_de_proveedor_en_urls(texto),
                textos(campo(caso, "fugas")),
                "{texto:?}"
            );
        }
    }

    #[test]
    fn operacion_una_fuente_de_docs_o_blog_de_un_proveedor_no_es_fuga() {
        for url in [
            "https://learn.chatgpt.com/guides/best-practices,",
            "https://platform.kimi.ai/docs/guide/use-thinking-models",
            "https://www.kimi.ai/blog/",
            "https://www.kimi.ai/blog/kimi-k2-6#:~:text=open",
            "https://kimi.ai/blog",
            "https://platform.claude.com/docs/claude-prompting",
            "http://sub.claude.ai/",
            "https://ai.google.dev/gemini-api/docs",
        ] {
            let texto = t(&format!("ver {url} y sigue"));
            assert_eq!(
                fugas_de_proveedor_en_urls(&texto),
                Vec::<Texto>::new(),
                "{url}"
            );
        }
        // /blogs-de-otro no es /blog: sigue siendo la interfaz.
        let url = "https://www.kimi.ai/blogs-de-otro";
        assert_eq!(
            fugas_de_proveedor_en_urls(&t(&format!("ver {url} y sigue"))),
            vec![t(url)]
        );
    }

    #[test]
    fn operacion_un_enlace_a_la_interfaz_del_proveedor_sigue_siendo_fuga() {
        for url in [
            "https://chatgpt.com/share/abc123",
            "https://chatgpt.com/c/6812",
            "https://www.chatgpt.com/c/6812",
            "https://CLAUDE.AI/chat/1",
            "https://chat.z.ai/c/1",
            "https://gemini.google.com/app/abc",
            "https://grok.com/share/x",
            "https://chat.mistral.ai/chat/1",
            "https://chat.qwen.ai/c/1",
            "https://www.kimi.ai/chat/d1",
            "https://kimi.ai",
            "https://chat.deepseek.com/a/chat/s/1",
        ] {
            let texto = t(&format!("ver {url} y sigue"));
            assert_eq!(fugas_de_proveedor_en_urls(&texto), vec![t(url)], "{url}");
        }
    }

    #[test]
    fn operacion_el_cuerpo_limpio_pasa_y_el_que_delata_al_proveedor_tira() {
        let limpio = armar_cuerpo_con_fuentes(
            &t("texto de respuesta sin nada raro"),
            &[t("https://arxiv.org/abs/2212.10001")],
        );
        assert!(limpio.is_ok());
        let delator = armar_cuerpo_con_fuentes(
            &t("texto de respuesta"),
            &[t("https://chatgpt.com/share/abc123")],
        );
        assert!(delator.is_err());
    }

    /// AC de PART-004: una URL de la interfaz de un proveedor (claude.ai/new) bloquea la operación
    /// con el mismo aviso que la Unity.
    #[test]
    fn operacion_caso_de_falla_claude_ai_new_bloquea_con_el_aviso_de_la_unity() {
        let r =
            armar_cuerpo_con_fuentes(&t("Respuesta con fuente."), &[t("https://claude.ai/new")]);
        println!("resultado: {r:?}");
        assert_eq!(
            r,
            Err("cuerpo anonimizado filtra identidad de proveedor por URL (1): https://claude.ai/new".into())
        );
    }

    #[test]
    fn operacion_el_cuerpo_con_fuentes_es_el_de_la_unity() {
        let v = vector("Armados");
        assert!(!lista(&v).is_empty());
        for caso in lista(&v) {
            let r = armar_cuerpo_con_fuentes(
                texto_de(campo(caso, "texto")),
                &textos(campo(caso, "urls")),
            );
            match campo(caso, "error") {
                Valor::Nulo => assert_eq!(&r.unwrap(), texto_de(campo(caso, "cuerpo"))),
                e => assert_eq!(r.unwrap_err(), str_de(e)),
            }
        }
    }

    #[test]
    fn operacion_las_marcas_van_en_el_primer_blanco_despues_del_intervalo() {
        let v = vector("Marcas");
        assert!(!lista(&v).is_empty());
        for caso in lista(&v) {
            let texto = texto_de(campo(caso, "texto"));
            let (con, marcas) = insertar_marcas_intercaladas(
                texto,
                str_de(campo(caso, "token")),
                entero(campo(caso, "intervalo")) as usize,
            );
            assert_eq!(&con, texto_de(campo(caso, "conMarcas")), "{texto:?}");
            assert_eq!(marcas, strs(campo(caso, "marcas")), "{texto:?}");
        }
        // OPE-010: 3.500 caracteres llevan 4 marcas.
        let (_, m) =
            insertar_marcas_intercaladas(&t(&"palabra ".repeat(3500 / 8)), "t", INTERVALO_MARCA);
        assert_eq!(m.len(), 4);
    }

    #[test]
    fn operacion_la_integridad_distingue_completo_truncado_e_indeterminado() {
        let v = vector("Integridades");
        let marcas = strs(&vector("MarcasIntegridad"));
        let estados: Vec<&str> = lista(&v)
            .iter()
            .map(|c| str_de(campo(c, "estado")))
            .collect();
        assert_eq!(
            estados,
            [
                "completo",
                "truncado",
                "truncado",
                "indeterminado",
                "truncado"
            ]
        );
        for caso in lista(&v) {
            let r = evaluar_integridad(texto_de(campo(caso, "respuesta")), &marcas);
            let nombre = str_de(campo(caso, "caso"));
            assert_eq!(r.estado, str_de(campo(caso, "estado")), "{nombre}");
            assert_eq!(
                r.esperadas as i64,
                entero(campo(caso, "esperadas")),
                "{nombre}"
            );
            assert_eq!(
                r.presentes as i64,
                entero(campo(caso, "presentes")),
                "{nombre}"
            );
            let faltantes: Vec<usize> = lista(campo(caso, "faltantes"))
                .iter()
                .map(|x| entero(x) as usize)
                .collect();
            assert_eq!(r.faltantes, faltantes, "{nombre}");
        }
    }

    #[test]
    fn operacion_la_perdida_se_localiza_en_el_segmento_que_cambio() {
        let v = vector("Perdidas");
        let marcas = strs(&vector("MarcasIntegridad"));
        let original = vector("ConMarcas");
        assert!(!lista(&v).is_empty());
        for caso in lista(&v) {
            let r = localizar_perdida(texto_de(&original), texto_de(campo(caso, "final")), &marcas);
            let obtenido = Valor::Lista(
                r.iter()
                    .map(|p| {
                        obj(vec![
                            ("indice", vn(p.indice)),
                            ("largoOriginal", vn(p.largo_original)),
                            ("largoFinal", vn(p.largo_final)),
                            ("delta", Valor::Entero(p.delta)),
                        ])
                    })
                    .collect(),
            );
            assert_eq!(obtenido, json_de(campo(caso, "segmentos")));
        }
    }

    #[test]
    fn operacion_la_comprobacion_cruzada_tira_si_el_cuerpo_incluye_la_respuesta_propia() {
        let marcas = |largo: usize| {
            insertar_marcas_intercaladas(&t(&"palabra ".repeat(largo / 8)), "t", INTERVALO_MARCA)
                .1
                .len()
        };
        assert!(comprobar_exclusion("chatgpt", marcas(14000), 14000).is_ok());
        let e = comprobar_exclusion("chatgpt", marcas(20000), 14000).unwrap_err();
        assert!(e.starts_with("cuerpo de chatgpt: "), "{e}");
        assert!(
            e.contains("marcas, esperadas ~14 (±3) a partir de \"pool menos la respuesta propia\""),
            "{e}"
        );
    }

    #[test]
    fn operacion_cada_cuerpo_excluye_la_respuesta_de_su_operador() {
        let pool = pool_cuerpos();
        let pool: Vec<&str> = pool.iter().map(String::as_str).collect();
        let respuestas: Vec<RespuestaParaOperar> = pool
            .iter()
            .map(|id| RespuestaParaOperar {
                proveedor_id: id.to_string(),
                reply_id: t(&format!("r-{id}")),
                attempt_id: t(&format!("a-{id}")),
                texto: t(&"palabra ".repeat(5000 / 8)),
                urls_citadas: vec![],
            })
            .collect();
        let a = armar_cuerpos_por_operador(&respuestas, &pool, 7, &mut || "t".into()).unwrap();
        assert_eq!(a.cuerpos.len(), pool.len());
        for k in &a.cuerpos {
            let mut incluidos = k.proveedores_incluidos.clone();
            incluidos.sort();
            let mut esperados: Vec<String> = pool
                .iter()
                .filter(|id| **id != k.operador_id)
                .map(|s| s.to_string())
                .collect();
            esperados.sort();
            assert_eq!(incluidos, esperados, "{}", k.operador_id);
        }
    }

    #[test]
    fn operacion_los_cuerpos_son_los_de_la_unity() {
        let v = vector("Cuerpos");
        let pool = pool_cuerpos();
        let pool: Vec<&str> = pool.iter().map(String::as_str).collect();
        assert!(!lista(&v).is_empty());
        for caso in lista(&v) {
            let respuestas = respuestas_de(&json_de(campo(caso, "entrada")), true);
            let mut n = 0;
            let r = armar_cuerpos_por_operador(&respuestas, &pool, SEMILLA_CUERPOS, &mut || {
                n += 1;
                format!("tok{n}")
            });
            if let e @ Valor::Texto(_) = campo(caso, "error") {
                assert_eq!(r.unwrap_err(), str_de(e));
                continue;
            }
            let a = r.unwrap();
            let cuerpos = a
                .cuerpos
                .iter()
                .map(|k| {
                    obj(vec![
                        ("operadorId", vs(&k.operador_id)),
                        ("cuerpo", vt(&k.cuerpo)),
                        (
                            "marcas",
                            Valor::Lista(k.marcas.iter().map(|m| vs(m)).collect()),
                        ),
                        (
                            "proveedoresIncluidos",
                            Valor::Lista(k.proveedores_incluidos.iter().map(|m| vs(m)).collect()),
                        ),
                        (
                            "respuestasParaOperador",
                            etiquetadas(&k.respuestas_para_operador),
                        ),
                    ])
                })
                .collect();
            let obtenido = obj(vec![
                ("cuerpos", Valor::Lista(cuerpos)),
                ("sello", sello(&a.sello, true)),
                ("respuestasTodas", etiquetadas(&a.respuestas_todas)),
            ]);
            assert_eq!(obtenido, json_de(campo(caso, "esperado")));
        }
    }

    fn respuestas_etiquetadas() -> Vec<(String, Texto)> {
        lista(&json_de(&vector("Etiquetadas")))
            .iter()
            .map(|r| {
                (
                    str_de(campo(r, "etiqueta")).to_string(),
                    texto_de(campo(r, "texto")).clone(),
                )
            })
            .collect()
    }

    #[test]
    fn operacion_los_prompts_de_operacion_son_los_de_la_unity() {
        let v = vector("Prompts");
        let respuestas = respuestas_etiquetadas();
        assert!(!lista(&v).is_empty());
        for caso in lista(&v) {
            let pregunta = texto_de(campo(caso, "pregunta"));
            assert_eq!(
                &armar_prompt_operacion(pregunta, &respuestas),
                texto_de(campo(caso, "operacion"))
            );
            let (prompt, archivo) = armar_prompt_operacion_con_archivo(pregunta, &respuestas);
            assert_eq!(&prompt, texto_de(campo(caso, "operacionConArchivo")));
            assert_eq!(&archivo, texto_de(campo(caso, "cuerpoArchivo")));
        }
    }

    #[test]
    fn operacion_un_marcador_dentro_de_la_pregunta_queda_literal() {
        let v = vector("Prompts");
        let pregunta = texto_de(campo(&lista(&v)[1], "pregunta"));
        let prompt = armar_prompt_operacion(pregunta, &respuestas_etiquetadas());
        assert!(prompt.para_mostrar().contains(&*pregunta.para_mostrar()));
    }

    fn reemplazar(x: &Texto, de: &str, a: &str) -> Texto {
        Texto::from(x.como_str().expect("prompt sin surrogates").replace(de, a))
    }

    fn unidades(x: &Texto) -> usize {
        x.a_utf16().len()
    }

    fn lineas(x: &Texto) -> usize {
        x.a_utf16().iter().filter(|&&c| c == b'\n' as u16).count() + 1
    }

    // ESC-010 (T21): las diez cadenas sin las marcas, que pueden partirlas; después la igualdad
    // carácter por carácter, con \r\n y el espacio duro normalizados.
    #[test]
    fn prompts_la_operacion_escrita_se_verifica_como_en_la_unity() {
        let pregunta = t("¿La pregunta?");
        let respuestas = respuestas_etiquetadas();
        let (pegado, _) = insertar_marcas_intercaladas(
            &armar_prompt_operacion(&pregunta, &respuestas),
            "t",
            INTERVALO_MARCA,
        );
        let (con_archivo, _) = armar_prompt_operacion_con_archivo(&pregunta, &respuestas);
        assert_eq!(verificar_escritura(&pegado, &pegado), None);
        assert_eq!(verificar_escritura(&con_archivo, &con_archivo), None);
        let duro = reemplazar(&reemplazar(&pegado, "\n", "\r\n"), " ", "\u{A0}");
        assert_eq!(verificar_escritura(&pegado, &duro), None);
        let partido = reemplazar(
            &pegado,
            "LIMITACION:CORPUS",
            "LIMITACION:\n[[CC-MARCA-099-t]]\nCORPUS",
        );
        assert_eq!(verificar_escritura(&partido, &partido), None);
        assert_eq!(
            verificar_escritura(&pegado, &reemplazar(&pegado, "DIVERGENCIA", "DIVERGENC1A")),
            Some("prompt incompleto: faltan DIVERGENCIA".into())
        );
        let mut mas = pegado.clone();
        mas.empujar_str("x");
        let (l, n) = (lineas(&pegado), unidades(&pegado));
        assert_eq!(
            verificar_escritura(&pegado, &mas),
            Some(format!(
                "el compositor no es igual al prompt: {l} de {l} líneas, {} de {n} caracteres",
                n + 1
            ))
        );
    }

    // ESC-011 (T22): el prompt de un rol se verifica solo por igualdad, con la misma normalización.
    #[test]
    fn prompts_el_de_un_rol_se_verifica_por_igualdad() {
        let prompt = crate::prompts::armar_prompt_redactor(&t("¿La pregunta?"));
        let duro = reemplazar(&reemplazar(&prompt, "\n", "\r\n"), " ", "\u{A0}");
        assert_eq!(verificar_igualdad(&prompt, &duro), None);
        let (l, n) = (lineas(&prompt), unidades(&prompt));
        let sin_primero = Texto::desde_utf16(&prompt.a_utf16()[1..]);
        assert_eq!(
            verificar_igualdad(&prompt, &sin_primero),
            Some(format!(
                "el compositor no es igual al prompt: {l} de {l} líneas, {} de {n} caracteres",
                n - 1
            ))
        );
        assert_eq!(
            verificar_igualdad(&prompt, &Texto::default()),
            Some(format!(
                "el compositor no es igual al prompt: 0 de {l} líneas, 0 de {n} caracteres"
            ))
        );
    }

    // D62 (RED-002): las verificaciones al redactor sin nombres, barajadas con la semilla de la
    // ronda, A y B.
    #[test]
    fn prompts_las_verificaciones_se_anonimizan_como_en_la_unity() {
        let v = vector("VerificacionesAnonimas");
        assert!(!lista(&v).is_empty());
        for caso in lista(&v) {
            let entrada: Vec<(String, Texto)> = lista(&json_de(campo(caso, "salidas")))
                .iter()
                .map(|s| {
                    (
                        str_de(campo(s, "verificadorId")).to_string(),
                        texto_de(campo(s, "texto")).clone(),
                    )
                })
                .collect();
            let semilla = texto_de(campo(caso, "semilla"));
            let (verificaciones, sello) = anonimizar_verificaciones(&entrada, semilla);
            let obtenido = obj(vec![
                ("verificaciones", etiquetadas(&verificaciones)),
                (
                    "sello",
                    Valor::Lista(
                        sello
                            .iter()
                            .map(|(e, id)| {
                                obj(vec![("etiqueta", vs(e)), ("verificadorId", vs(id))])
                            })
                            .collect(),
                    ),
                ),
            ]);
            assert_eq!(obtenido, json_de(campo(caso, "esperado")), "{semilla:?}");
        }
    }

    #[test]
    fn una_marca_vacia_cuenta_como_presente_como_contains_de_la_unity() {
        // revisión PART-004 (F5): Cuerpos.cs usa respuesta.Contains(marca), que da true con "".
        let i = evaluar_integridad(&Texto::from("abc"), &["".to_string()]);
        assert_eq!(i.estado, "completo");
        assert_eq!(i.presentes, 1);
    }
}
