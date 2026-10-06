#!/usr/bin/env node
/**
 * Valores de referencia del código TypeScript actual, para que las pruebas del
 * motor en C# comprueben que el port conserva los algoritmos y el formato.
 * Ejecuta las funciones REALES (packages/ y el registro de apps/desktop) con
 * entradas fijas y escribe Tests/Referencias.g.cs. Determinista: ids y fechas
 * se fijan antes de importar, así dos corridas dan el mismo archivo byte a byte.
 * También escribe Runtime/Datos.g.cs: los prompts literales y specs.json, que
 * así nunca se copian a mano.
 *
 *   node motor/Dotnet~/referencias.mjs
 */
import { createRequire, register, syncBuiltinESMExports } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
register(pathToFileURL(join(RAIZ, "scripts/_ts-loader-hooks.mjs")).href, import.meta.url);

// Ids y fechas fijas: el registro real usa randomUUID() y new Date().
const crypto = createRequire(import.meta.url)("node:crypto");
let siguienteId = 0;
crypto.randomUUID = () => `00000000-0000-4000-8000-${String(++siguienteId).padStart(12, "0")}`;
syncBuiltinESMExports();
const FECHA = "2026-10-06T12:00:00.000Z";
const DateReal = Date;
globalThis.Date = class extends DateReal {
  constructor(...a) {
    super(...(a.length > 0 ? a : [FECHA]));
  }
  static now() {
    return DateReal.parse(FECHA);
  }
};

const importar = (ruta) => import(pathToFileURL(join(RAIZ, ruta)).href);
const analisis = await importar("packages/analysis/src/index.ts");
const dominio = await importar("packages/domain/src/index.ts");
const registro = await importar("apps/desktop/src/main/registro.ts");
const seleccion = await importar("apps/desktop/src/main/seleccion-proveedores.ts");

/** Literal de C#. JSON ya escapa lo que C# exige, salvo U+0085, U+2028 y U+2029, que C# toma como salto de línea. */
const cs = (s) =>
  s === null
    ? "null"
    : [0x85, 0x2028, 0x2029].reduce(
        (t, c) => t.split(String.fromCharCode(c)).join(String.fromCharCode(92) + "u" + c.toString(16).padStart(4, "0")),
        JSON.stringify(s),
      );
const LS = String.fromCharCode(0x2028);
const TEXTO_RARO = `comillas "dobles", barra \\ ñandú 😀 separador${LS}control${String.fromCharCode(1)} surrogate suelto ${String.fromCharCode(0xd800)} fin`;

// ---------------------------------------------------------------- semillas y barajado
const SEMILLAS = [
  ...["", "abc", "0f8fad5b-d9cb-469f-a165-70867728950e", "ñandú", "😀 con emoji", `salto${LS}de linea`],
  ...Array.from({ length: 44 }, (_, k) => `0f8fad5b-d9cb-469f-a165-${String(k).padStart(12, "0")}`),
];
const rango = (n) => Array.from({ length: n }, (_, i) => i);
// 8 es el pool; 100 hace correr mulberry32 99 veces por semilla. Más los bordes de uint.
const BARAJADOS = [
  ...SEMILLAS.flatMap((s) => [8, 100].map((n) => [analisis.hashSemilla(s), n])),
  ...[0, 1, 2 ** 31, 2 ** 32 - 1].flatMap((x) => [0, 1, 2, 8].map((n) => [x, n])),
].map(([semilla, n]) => ({ semilla, n, orden: analisis.seededShuffle(rango(n), semilla) }));

// ---------------------------------------------------------------- anonimización
// Casos del scrub donde las expresiones regulares de .NET y de JS (con /iu) difieren:
// pliegue de mayúsculas fuera de ASCII, letras fuera del plano básico, surrogates sueltos.
const c = (...cps) => String.fromCodePoint(...cps);
const TAPADOS = [
  "Soy Claude, un modelo de Anthropic.",
  "GPT-4o, GPT-5, GPT4 y GPT-5GPT",
  "chatgpt.com, OPENAI, gEmInI, xAI's, DeepSeek-R1, sonar-pro",
  `ClaudeAI, Claude${c(0xe9)}, ${c(0xe9)}Claude, 1Claude, Claude1, _Claude_`,
  `${c(0x17f)}onnet, Hai${c(0x212a)}u, Gem${c(0x130)}n${c(0x130)}, Gem${c(0x131)}n${c(0x131)}`,
  `${c(0x1d400)}Claude, ${c(0x1f600)}Claude, Claude${c(0x1d7cf)}, Claude${c(0x301)}`,
  `${String.fromCharCode(0xd800)}Claude ${String.fromCharCode(0xdc00)}Claude`,
  "Sin nombres de proveedor.",
];
const POOL = ["chatgpt", "gemini", "claude", "grok", "mistral", "kimi", "qwen", "deepseek"];
const respuesta = (id, text) => ({ panelSourceId: id, replyId: `r-${id}`, attemptId: `a-${id}`, displayName: id, text });
const ANONIMIZADOS = [
  [POOL.map((id, i) => respuesta(id, TAPADOS[i])), analisis.hashSemilla("semilla-fija")],
  [rango(27).map((k) => respuesta(`p${k}`, `respuesta ${k} de Grok`)), analisis.hashSemilla("abc")],
  [[], 0],
].map(([rs, semilla]) => ({ semilla, entrada: JSON.stringify(rs), esperado: JSON.stringify(analisis.anonymizeReplies(rs, true, semilla)) }));

const CODIGOS = [POOL, ["chatgpt", "gemini", "chatgpt"], []].map((ids) => ({ ids, codigos: [...analisis.codigosEstables(ids).entries()] }));

// ---------------------------------------------------------------- cuerpo del operador
// Bordes donde .NET difiere de JS: \S (U+FEFF, U+0085), toLowerCase (İ, signo Kelvin),
// decodeURIComponent que tira, y el prefijo http(s) sin /u.
const NBSP = c(0xa0);
const LIMPIEZAS = [
  "https://ejemplo.org/a?utm_source=chatgpt.com&model=gpt-5.5#frag",
  "https://ejemplo.org/a?model=x&MODEL=y&%6Dodel=z&mo%zzdel=w&%E2%82model=u&&=v&model",
  "https://ejemplo.org/sin-query",
  "https://ejemplo.org/?#solo",
  "https://ejemplo.org/a#h?no=query",
  "https://ejemplo.org/a?ref=kimi",
].map((u) => [u, analisis.limpiarQueryWhitelist(u)]);
const FUGAS = [
  "sin urls",
  "ver https://platform.claude.com/docs/claude-prompting y HTTPS://CHATGPT.COM/share/x",
  "https://x.org/?ref=Kimi https://chat.z.ai/c/1 http://sub.claude.ai/ https://notclaude.ai/ https://claude.ai.evil.org/ https://kimi.ai",
  `https://ejemplo.org/?q=kim${c(0x130)} https://claude.a${c(0x130)}/ https://x.org/?a=${c(0x212a)}imi`,
  `http:// suelto, https://a.org/x${NBSP}y https://b.org/?q=glm${LS}https://c.org/?deepseek${c(0xfeff)}https://d.org/?x=qwen${c(0x85)}fin`,
  `http${c(0x17f)}://claude.ai/ y httpS://grok.com y http://https://gemini.google.com`,
].map((t) => [t, analisis.fugasDeProveedorEnUrls(t)]);
const ARMADOS = [
  ["texto de respuesta sin nada raro", ["https://arxiv.org/abs/2212.10001"]],
  ["texto", []],
  ["texto", ["https://ejemplo.org/a?utm_source=chatgpt.com&model=gpt-5.5", "https://otro.org/b?ref=x"]],
  ["texto de respuesta", ["https://chatgpt.com/share/abc123"]],
  ["texto con https://claude.ai/chat/1 adentro", []],
].map(([t, us]) => {
  try {
    return [t, us, analisis.armarCuerpoConFuentes(t, us), null];
  } catch (e) {
    return [t, us, null, e.message];
  }
});

const PALABRAS = ["la", "respuesta", "de", "Claude", "cita", "datos", `con${NBSP}espacio`, "y", "GPT-5", "sobre", "el", "tema\n"];
const textoDe = (n, k0) => {
  let s = "";
  for (let k = k0; s.length < n; k++) s += PALABRAS[k % PALABRAS.length] + " ";
  return s;
};
const MARCAS = [
  ["", "t", 10],
  ["hola mundo", "t", 1000],
  ["aaaa bbbbbbbbbbbbbbbbbbbb cc\ndd ee ff gg", "t", 10],
  ["x".repeat(25), "t", 10],
  ["0123456789 abc", "t", 10],
  [textoDe(3500, 0), "tok", 1000],
].map(([texto, token, intervalo]) => ({ texto, token, intervalo, ...analisis.insertarMarcasIntercaladas(texto, token, intervalo) }));

// Los cuatro casos de integridad del BLUEPRINT, más la respuesta vacía.
const { textoConMarcas: CON_MARCAS, marcas: MARCAS_10 } = analisis.insertarMarcasIntercaladas(textoDe(10000, 3), "tok");
const sinMarcas = (t, ...ms) => ms.reduce((s, m) => s.replace(m, ""), t);
const INTEGRIDADES = [
  ["completo", CON_MARCAS],
  ["recortado al 40 %", CON_MARCAS.slice(0, Math.floor(CON_MARCAS.length * 0.4))],
  ["sin la ultima marca", sinMarcas(CON_MARCAS, MARCAS_10.at(-1))],
  ["sin dos marcas no contiguas", sinMarcas(CON_MARCAS, MARCAS_10[2], MARCAS_10[4])],
  ["vacio", ""],
].map(([caso, respuesta]) => ({ caso, respuesta, ...analisis.evaluarIntegridad(respuesta, MARCAS_10) }));
const medio = CON_MARCAS.indexOf(MARCAS_10[4]) - 10;
const PERDIDAS = [CON_MARCAS, CON_MARCAS.slice(0, medio) + CON_MARCAS.slice(medio + 1), sinMarcas(CON_MARCAS, MARCAS_10[6])].map((final) => ({
  final,
  segmentos: JSON.stringify(analisis.localizarPerdida(CON_MARCAS, final, MARCAS_10)),
}));

// armarCuerposPorOperador con tokens fijos; el segundo caso filtra por host propio y tira.
const SEMILLA_CUERPOS = analisis.hashSemilla("semilla-fija");
const paraOperar = (id, i) => ({
  proveedorId: id,
  replyId: `r-${id}`,
  attemptId: `a-${id}`,
  texto: textoDe(600 + 150 * i, i),
  urlsCitadas: i % 3 === 0 ? [] : [`https://ejemplo.org/${id}?utm_source=${id}&model=m${i}`, "https://arxiv.org/abs/2212.10001"],
});
// ---------------------------------------------------------------- prompts literales (Runtime/Datos.g.cs)
// Las plantillas no se exportan: se recuperan armando cada prompt con los
// marcadores como valores, y con un centinela donde el valor es derivado.
const CENTINELA = `${String.fromCharCode(0)}CENTINELA${String.fromCharCode(0)}`;
const volver = (texto, centinela, marcador) => {
  const partes = texto.split(centinela);
  if (partes.length !== 2) throw new Error(`${marcador}: el centinela aparece ${partes.length - 1} veces`);
  return partes.join(marcador);
};
const rC = [{ etiqueta: CENTINELA, texto: CENTINELA }];
const hC = [{ id: CENTINELA, categoria: CENTINELA, eje: CENTINELA, etiquetas: [CENTINELA], descripcion: CENTINELA, operador: CENTINELA }];
const PLANTILLAS = {
  PlantillaOperacion: volver(analisis.armarPromptOperacion("{{PREGUNTA}}", rC), analisis.armarPromptOperacionConArchivo("", rC).cuerpoArchivo, "{{CUERPO}}"),
  PlantillaOperacionConArchivo: analisis.armarPromptOperacionConArchivo("{{PREGUNTA}}", []).prompt,
  PlantillaIntegrador: volver(analisis.armarPromptIntegrador("{{PREGUNTA}}", hC), analisis.tablaDe(hC), "{{HALLAZGOS}}"),
  PlantillaVerificador: volver(analisis.armarPromptVerificador("{{PREGUNTA}}", "{{RESCATE}}", hC), Array(4).fill(CENTINELA).join("|"), "{{HALLAZGOS}}"),
  PlantillaRedactor: analisis.armarPromptRedactor("{{PREGUNTA}}"),
};
const SPECS = readFileSync(join(RAIZ, "packages/providers/src/specs.json"), "utf8");

// Las mismas entradas para el TypeScript y el motor, con valores que traen marcadores y patrones de replace.
const PREGUNTAS = ["¿Qué dice la evidencia sobre X?", "con $& y $` y $' y {{CUERPO}} y {{HALLAZGOS}} y {{RESCATE}} y {{PREGUNTA}} adentro"];
const RESCATE = "rescate con {{HALLAZGOS}} y $& [H1]";
const ETIQUETADAS = [
  { etiqueta: "P1", texto: "uno $& {{PREGUNTA}}" },
  { etiqueta: "P3", texto: `dos\ncon ${LS} y {{CUERPO}}` },
];
const H_INTEGRADOR = [
  { id: "H1", categoria: "CONVERGENCIA", eje: "HECHOS", etiquetas: ["P1", "P3"], descripcion: "d $' x", operador: "O1" },
  { id: "H2", categoria: "LIMITACION:TAREA", eje: null, etiquetas: [], descripcion: "l {{HALLAZGOS}}", operador: "O2" },
];
const H_VERIFICADOR = H_INTEGRADOR.map(({ id, categoria, eje, descripcion }) => ({ id, categoria, eje, descripcion }));
const PROMPTS = PREGUNTAS.map((p) => {
  const archivo = analisis.armarPromptOperacionConArchivo(p, ETIQUETADAS);
  return [
    p,
    analisis.armarPromptOperacion(p, ETIQUETADAS),
    archivo.prompt,
    archivo.cuerpoArchivo,
    analisis.armarPromptIntegrador(p, H_INTEGRADOR),
    analisis.armarPromptVerificador(p, RESCATE, H_VERIFICADOR),
    analisis.armarPromptRedactor(p),
  ];
});
const MATERIAL = { informe: "INFORME {{PREGUNTA}}", verificacion: "CONFIRMA|OFICIAL|H1|https://a.org|\"c\"", tabla: analisis.tablaDe(H_INTEGRADOR), respuestas: ETIQUETADAS };
const ARCHIVOS_REDACTOR = [MATERIAL, { ...MATERIAL, verificacion: null }].map((m) => [JSON.stringify(m), analisis.armarArchivoRedactor(m)]);
const ROLES = [seleccion.INTEGRADOR_POR_DEFECTO, seleccion.VERIFICADOR_POR_DEFECTO, seleccion.REDACTOR_POR_DEFECTO];

// ---------------------------------------------------------------- parseos y texto desde html
// Bordes de las expresiones de JS sin /u: \s, ".", $, \b, /i sin pliegue fuera de ASCII,
// toUpperCase (ı, ſ, ß, ﬁ), normalize con surrogates sueltos, CRLF y U+2028.
const HTMLS = [
  `<ol start="5"><li><p>QUE CONVIENE RESCATAR</p></li></ol><p>texto</p>`,
  `<h3>TITULO: Un t${c(0xed)}tulo</h3><p>Hola&nbsp;mundo &amp;amp; &lt;b&gt; &quot;x&quot; &#39;y&#39; &apos;z&apos; &#241; &#xF1; &#X1F600; &#55296; &amp;nbsp;</p><ul><li>uno</li><li><p>dos</p></li></ul><ol><li>a</li><li>b</li></ol><table><tr><td>c1</td><th>c2</th></tr></table>br<br>fin<br/>x</br>y`,
  `<!-- comentario --><style>p{}</style><SCRIPT>x</script><Style>y</STYLE><styles>visible</styles><style>sin cierre`,
  `<p>a   </p>\n\n\n\n<p>b\t</p>   \n<pre>  c${c(0xa0)}\t \nd</pre>`,
  `<OL START=3><LI>x<LI>y</OL><ol start = "0012"><li>z</li></ol><ol start="99"><li>w</li></ol>`,
  `a < b <!DOCTYPE html> <3 <li>suelto</li> <p start="2">p</p>`,
  `<ol><li>a<ul><li>b</li></ul></li><li>c</li></ol></ul></ol><li>fuera</li>`,
  `<p>${LS}linea${c(0xfeff)}</p><div>${c(0x2029)}</div>`,
];
const TEXTOS_HTML = HTMLS.map((h) => [h, analisis.textoDeHtmlEnBloques(h)]);
let errorHtml = null;
try {
  analisis.textoDeHtmlEnBloques("<p>&#1114112;</p>");
} catch (e) {
  errorHtml = e.constructor.name;
}

const SALIDA_OPERADOR = [
  "Razonamiento previo en prosa.",
  "CONVERGENCIA|HECHOS|P1,P3,P6|las tres dan la misma fecha",
  `DIVERGENCIA|FUENTES|P2, P5 ,|citan medios${NBSP}distintos | con barra`,
  "TENSION|CONCLUSIONES|P1,P9|coinciden pero recomiendan opuesto",
  "  SINGULARIDAD|CONCLUSIONES|P4|solo P4\r",
  "AUSENCIA|HECHOS|—|ninguna trae cifras",
  "AUSENCIA|HECHOS|nınguna|con i sin punto",
  "AUSENCIA|HECHOS||vacio",
  "LIMITACION:CORPUS|P2,P5|no pude leer parte",
  "LIMITACION:AMBIGUEDAD|-|ambiguo",
  "LIMITACION:TAREA|NINGUNA|no entiendo",
  "LIMITACION:OTRA|P3|otra",
  "CONVERGENCIA",
  "CONVERGENCIA|HECHOS|P1",
  "LIMITACION:OTRA|P3",
  "CONVERGENCIAX|HECHOS|P1|no es prefijo",
  "convergencia|HECHOS|P1|minusculas",
  `${c(0xfeff)}CONVERGENCIA|HECHOS|P2|con BOM`,
  "",
  "Prosa final.",
].join("\n");
const HALLAZGOS_PARSEADOS = JSON.stringify(analisis.parsearHallazgos(SALIDA_OPERADOR, ["P1", "P2", "P3", "P4", "P5", "P6"]));

const SALIDA_VERIFICADOR = [
  "Voy a revisar las fuentes. Primero la sección 1.",
  `CONFIRMA|OFICIAL,PRIMARIA|H12|https://boe.es/ley?x=1).|&quot;cita textual&quot;`,
  `- confirma|Acad${c(0xe9)}mica|H13/H118 (parcial)|https://a.org/b|${c(0x201c)}cita tipogr${c(0xe1)}fica${c(0x201d)}`,
  `1. **CONTRADICE**|SECUNDARIA|H24|https://x.org|${c(0xab)}lo que dice${c(0xbb)}`,
  "NO_ENCONTRADA|—|H58|no encontré una fuente",
  "NO_ENCONTRADA|H59|sin campo de tipo",
  "CONFIRMA|H60|https://c.org|\"formato nuevo sin tipo\"",
  "CONFIRMA|oficial y primaria / ACADEMICA; secundaria+inventado|H999|https://d.org|\"h inexistente\"",
  `CONFIRMA|o${c(0xfb01)}cial, ${c(0x17f)}ecundaria, ofic${c(0x131)}al, PRIMARIA${String.fromCharCode(0xd800)}|H12|https://e.org|"tipos raros"`,
  "VERIFICADO|H12|https://viejo.org|\"formato anterior\"",
  "NO_VERIFICADO|H13|motivo anterior",
  "CONTRADICHO|H24|https://viejo.org/2|\"anterior contradice\"",
  "texto previo CONFIRMA|OFICIAL|H12|https://f.org|\"en medio\" y PREGUNTA|otra en la misma linea",
  "* PUNTO_CIEGO|falta la norma local|https://g.org|OFICIAL",
  "PUNTO_CIEGO|sin fuente para esto|sin fuente",
  "PUNTO_CIEGO|tres campos|https://h.org",
  "PREGUNTA|¿Qué pasa en otro país?",
  "PREGUNTA|",
  "CONFIRMA|OFICIAL|H12|https://i.org|\"cita\" SECCIÓN 2 — PUNTOS CIEGOS",
  "CONFIRMA|OFICIAL|H12|https://j.org|\"cita\" seccion 3 resto\r",
  `PREGUNTA|con separador${LS}de linea`,
  "## CONFIRMA |OFICIAL|H12|https://k.org|\"con espacio antes de la barra\"",
  "CONFIRMA|OFICIAL",
  "Prosa final sin palabras clave.",
].join("\n");
const VERIFICACION_PARSEADA = JSON.stringify(analisis.parsearVerificacion(SALIDA_VERIFICADOR, ["H12", "H13", "H24", "H58", "H59", "H60"]));

const INFORME_SEMBRADO = [
  "TITULO: divergencias sobre una dosis",
  "Primer parrafo con una referencia valida sobre una convergencia. [H1]",
  "Segundo parrafo, apoyado en dos hallazgos distintos de la tabla. [H2] [H3]",
  "5. QUE CONVIENE RESCATAR\nLo firme: las respuestas coinciden en esto y ninguna lo contradice. [H4]",
  "Este parrafo de la seccion 5 no trae ninguna referencia y por eso tiene que fallar el gate.",
  "LA TABLA NO ALCANZA para determinar el origen de una de las divergencias, y este parrafo no necesita referencia.",
  "Ultimo parrafo con una referencia inventada que no existe en la tabla. [H999]",
].join("\n\n");
const INFORMES = [
  INFORME_SEMBRADO,
  INFORME_SEMBRADO.split("\n").join("\r\n"),
  `**T${c(0xcd)}TULO:** Otro\n${NBSP}\nPárrafo [H1][h2] [H12]\n \t\n\nTITULO: no es el primero`,
  `Sin titulo\n\n\n\nLA TABLA NO ALCANZA y algo\n\n${LS}\n\nfin [H3]`,
];
const TRAZABILIDADES = INFORMES.map((t) => [t, JSON.stringify(analisis.parsearReferenciasIntegrador(t, ["H1", "H2", "H3", "H4"]))]);

const TITULOS = [
  "TITULO: Un titulo\n\ncuerpo",
  "\n\n  **TÍTULO:** Algo con negritas **\n\n\ncuerpo",
  "# Título: con almohadilla\r\n\r\ncuerpo",
  "TITULO:\ncuerpo sin titulo",
  "Sin linea de titulo\nTITULO: en medio",
  "  __titulo :  bajo guiones __",
  `TITULO: con${LS}separador`,
  "",
].map((t) => [t, JSON.stringify(analisis.extraerTituloDelInforme(t)), analisis.esParrafoTitulo(t)]);
const RESCATES = [
  "1. TIPOS\nx\n5. QUE CONVIENE RESCATAR\nLo firme [H1]\n\nOtro [H2]",
  "## Qué conviene rescatar\n  cuerpo  ",
  "**5) Que conviene rescatar**\r\ncuerpo crlf",
  "5 - QUÉ CONVIENE RESCATAR:\n\n",
  "qué conviene rescatarlo\nno es encabezado",
  "sin seccion",
].map((t) => [t, analisis.extraerSeccionRescate(t)]);
const ENCABEZADOS = ["5. QUE CONVIENE RESCATAR", "### Qué conviene rescatar", "Que conviene rescatar_", "QUE  CONVIENE\tRESCATAR!", "5.QUE CONVIENE RESCATAR"].map((l) => [l, analisis.esEncabezadoRescate(l)]);
const LIMPIEZAS_TITULO = [
  'Un "título": con/prohibidos*?<>|\\ y —guiones– ',
  `con${String.fromCharCode(1)}control${String.fromCharCode(0x7f)}  y   ${NBSP}espacios...`,
  "x".repeat(79) + "😀" + " fin",
  " . . ",
].map((t) => [t, analisis.limpiarTituloParaArchivo(t)]);
const DESDE_PREGUNTAS = ["  una dos  tres\tcuatro\ncinco seis siete ocho", "", `uno${NBSP}dos`].map((p) => [p, analisis.tituloDesdePregunta(p)]);
const AHORA = new Date(2026, 9, 6, 9, 5);
const NOMBRES_BASE = [
  [null, "¿Qué dice la evidencia sobre la dosis?"],
  ["Título: del integrador", "pregunta"],
  ["   ", "  "],
  [null, "*?"],
].map(([titulo, pregunta]) => [titulo, pregunta, analisis.nombreBaseDeInforme({ titulo, pregunta, ahora: AHORA })]);
const OCUPADOS = ["base", "base (2)", "base (3)"];
const NOMBRE_LIBRE = analisis.nombreLibreDeInforme("base", (n) => OCUPADOS.includes(n));

const CUERPOS = [
  POOL.map(paraOperar),
  POOL.map((id, i) => (id === "grok" ? { ...paraOperar(id, i), urlsCitadas: ["https://grok.com/share/1"] } : paraOperar(id, i))),
].map((rs) => {
  let n = 0;
  try {
    return { entrada: JSON.stringify(rs), esperado: JSON.stringify(analisis.armarCuerposPorOperador(rs, POOL, SEMILLA_CUERPOS, () => `tok${++n}`)), error: null };
  } catch (e) {
    return { entrada: JSON.stringify(rs), esperado: null, error: e.message };
  }
});

// ---------------------------------------------------------------- registro
// Un hecho de cada uno de los dieciséis tipos, escrito por las funciones reales.
const dir = mkdtempSync(join(tmpdir(), "cc-referencias-"));
const conv = registro.crearConversacion(dir, false);
const ronda = registro.escribirRonda(dir, conv, 0, `Pregunta con ${TEXTO_RARO}`, "semilla-fija");
registro.escribirCondicionProveedoresCargados(dir, conv, ronda, ["chatgpt", "gemini", "deepseek"], "deepseek");
registro.escribirIntentos(dir, conv, ronda, [
  { id: "chatgpt", ok: true },
  { id: "gemini", ok: false, error: "compositor no encontrado" },
]);
registro.escribirRespuestas(
  dir,
  conv,
  ronda,
  [
    {
      id: "chatgpt",
      text: `Respuesta ${TEXTO_RARO}`,
      userText: "Pregunta",
      generating: false,
      completionKind: "element-gone",
      quiescenceMs: 1500,
      modelLabel: "GPT",
      html: '<div><p>Hola <a href="https://ejemplo.org/a?utm_source=chatgpt.com">Fuente: titulo</a></p><h3>Fuentes clave</h3><ul><li><a href="https://otro.org/b">Otro — dato</a></li></ul></div>',
      fuentesHref: 2,
    },
    { id: "gemini", text: "", userText: null, generating: null, modelLabel: null, html: null, error: "lectura vacia" },
  ],
  () => ({ continuidad: "indeterminada", panel: "1366x570" }),
);
const hechos0 = registro.leerRegistroDeArchivo(dir, conv).hechos;
const ronda2 = registro.escribirRonda(dir, conv, 1, "Pregunta", "semilla-2");
registro.copiarRespuestas(dir, conv, ronda2, hechos0.filter((h) => h.tipo === "respuesta").slice(0, 1));
registro.escribirSello(dir, conv, ronda, [
  { label: "Modelo A", codigoEstable: "P1", panelSourceId: "chatgpt", replyId: "r1", attemptId: "r1" },
]);
registro.escribirPreguntaDeclarada(dir, conv, ronda, "Pregunta declarada");
const so = registro.escribirSalidaOperador(dir, conv, ronda, "chatgpt", "prompt", "CONVERGENCIA|HECHOS|P2|d", "<p>x</p>");
registro.escribirSalidaOperador(dir, conv, ronda2, "chatgpt", "prompt", "salida", null, { rondaId: ronda, salidaOperadorId: so.id });
registro.escribirHallazgos(dir, conv, so.id, [
  { categoria: "CONVERGENCIA", eje: "HECHOS", etiquetas: ["P2", "P3"], descripcion: "d", etiquetaInvalida: false },
  { categoria: "LIMITACION:TAREA", eje: null, etiquetas: [], descripcion: "l", etiquetaInvalida: true },
]);
registro.escribirInformeIntegrador(dir, conv, ronda, "deepseek", "prompt", "TITULO: Un titulo\n\nTexto [H1]", null);
registro.escribirInformeIntegrador(dir, conv, ronda, "deepseek", "prompt", "plano", "<p>TITULO: Otro</p><p>Texto</p>");
registro.escribirSalidaVerificador(dir, conv, ronda, "glm", "prompt", 'CONFIRMA|OFICIAL|H1|https://a.org|"c"', null);
registro.escribirRespuestaRedactor(dir, conv, ronda, "deepseek", "prompt", "ARCHIVO: x", null, {
  primera: "[[CC-MARCA-0000-t]]",
  ultima: "[[CC-MARCA-FIN-t]]",
});
registro.escribirRespuestaRedactor(dir, conv, ronda, "deepseek", "prompt", "texto", "<p>t</p>", null);
registro.escribirUrlComprobada(dir, conv, { rondaId: ronda, salidaVerificadorId: "v", url: "https://a.org", codigo: 200, detalle: null, comprobadaEn: FECHA });
registro.escribirUrlComprobada(dir, conv, { rondaId: ronda, salidaVerificadorId: "v", url: "https://b.invalid", codigo: null, detalle: "ENOTFOUND", comprobadaEn: FECHA });
registro.escribirCondicionHerramientas(dir, conv, ronda, "chatgpt", "investigacion", true, "declarado");
registro.escribirErrorCaptura(dir, conv, ronda, "operacion", "salida-operador", "sin proveedor");
registro.escribirErrorCaptura(dir, conv, ronda, "integracion", "informe-integrador", "con proveedor", "deepseek");
const LINEAS = readFileSync(join(dir, "conversaciones", `${conv}.jsonl`), "utf8").split("\n").filter((l) => l.length > 0);
rmSync(dir, { recursive: true, force: true });

// ---------------------------------------------------------------- leerRegistro
const valido = LINEAS.slice(0, 3).join("\n");
const LECTURAS = [
  LINEAS.join("\n") + "\n",
  `${valido}\n{"tipo":"ronda","esq`,
  `${valido}\nno es json\n${LINEAS[3]}`,
  `${valido}\n{'tipo':'ronda','esquema':1}\n{"tipo":"ronda"} // comentario\n${LINEAS[3]}`,
  `${valido}\r\n123\r\n\r\n   \r\n{"tipo":"otro"}\r\n${"x".repeat(250)}\r\n${LINEAS[4]}\r\n`,
  "",
].map((entrada) => {
  const r = dominio.leerRegistro(entrada);
  return { entrada, hechos: r.hechos.length, ilegibles: r.lineasIlegibles, ultima: r.ultimaLineaIncompleta };
});

// ---------------------------------------------------------------- etapa
const h = (o) => JSON.stringify({ esquema: 1, id: "x", ...o });
const salida = (op, r = "R") => h({ tipo: "salida-operador", rondaId: r, operadorId: op, promptCompleto: "", salidaCruda: "", recibidaEn: FECHA });
const OPS = ["chatgpt", "gemini", "claude", "grok", "mistral", "kimi", "qwen"];
const ESCENARIOS_ETAPA = [
  [h({ tipo: "ronda", id: "R" })],
  [h({ tipo: "sello", rondaId: "R" })],
  [h({ tipo: "sello", rondaId: "R" }), ...OPS.slice(0, 6).map((o) => salida(o)), salida("chatgpt")],
  [h({ tipo: "sello", rondaId: "R" }), ...OPS.map((o) => salida(o))],
  [...OPS.map((o) => salida(o)), h({ tipo: "informe-integrador", rondaId: "R" })],
  [h({ tipo: "informe-integrador", rondaId: "R" }), h({ tipo: "salida-verificador", rondaId: "R" })],
  [h({ tipo: "salida-verificador", rondaId: "OTRA" }), h({ tipo: "sello", rondaId: "OTRA" })],
].map((lineas) => {
  const texto = lineas.join("\n");
  const etapa = dominio.etapaDeRonda(dominio.leerRegistro(texto).hechos, "R", 7);
  return { texto, etapa, captura: dominio.tipoCapturaDeEtapa(etapa) };
});

// ---------------------------------------------------------------- pregunta efectiva
const declarada = (texto, en) => h({ tipo: "pregunta-declarada", rondaId: "R", texto, declaradaEn: en, procedencia: "declarado-por-usuario" });
const MARCADOR = "(capturado sin ronda de envio: el texto ya estaba en pantalla al presionar Leer/Capturar)";
const ESCENARIOS_PREGUNTA = [
  ["Una pregunta real", []],
  [MARCADOR, []],
  [MARCADOR, [declarada("Vieja", "2026-01-01T00:00:00.000Z"), declarada("Nueva", "2026-02-01T00:00:00.000Z"), declarada("Del medio", "2026-01-15T00:00:00.000Z")]],
  [MARCADOR, [declarada("(no vale)", "2026-01-01T00:00:00.000Z")]],
  ["   ", [declarada("Declarada", "2026-01-01T00:00:00.000Z")]],
].map(([prompt, extra]) => {
  const rondaH = { tipo: "ronda", esquema: 1, id: "R", conversacionId: "C", indice: 0, prompt, enviadaEn: FECHA, semilla: null };
  const texto = [JSON.stringify(rondaH), ...extra].join("\n");
  return { texto, esperado: dominio.preguntaEfectivaDeRonda(dominio.leerRegistro(texto).hechos, rondaH) };
});
const VALIDAS = ["", "  ", MARCADOR, "Hola", "texto Capturado Sin Ronda De Envio adentro", " (x)"].map((t) => [t, dominio.esPreguntaValida(t)]);

// ---------------------------------------------------------------- procedencia
const PROCEDENCIAS = [
  [{ modelLabel: "GPT", completionKind: "element-gone", quiescenceMs: 1500, generating: false }, { ahora: FECHA, continuidad: "confirmada", metodoEscritura: null, panel: "1x1" }],
  [{ generating: null }, { ahora: FECHA, continuidad: "indeterminada", metodoEscritura: "paste", panel: null }],
  [{ modelLabel: null, completionKind: "quiescence", quiescenceMs: 20000, generating: true }, { ahora: FECHA, continuidad: "refutada", metodoEscritura: "execCommand", panel: "2x2" }],
].map(([lectura, contexto]) => ({ lectura: JSON.stringify(lectura), contexto: JSON.stringify(contexto), esperado: JSON.stringify(dominio.derivarProcedencia(lectura, contexto)) }));

// ---------------------------------------------------------------- roles de la ronda
const cond = (prov, integ) => h({ tipo: "condicion-proveedores-cargados", rondaId: "R", proveedores: prov, ...(integ ? { integrador: integ } : {}), registradoEn: FECHA });
const ESCENARIOS_CARGADOS = [[], [cond(["a"], "deepseek"), cond(["a", "b"], "glm")], [cond(["a"])]].map((lineas) => {
  const hs = dominio.leerRegistro(lineas.join("\n")).hechos;
  return { texto: lineas.join("\n"), integrador: dominio.integradorDeRonda(hs, "R"), cargados: dominio.proveedoresCargadosDeRonda(hs, "R") };
});

// ---------------------------------------------------------------- archivo
const arr = (xs) => xs.map(cs).join(",\n            ");
const strs = (xs) => `new string[] { ${xs.map(cs).join(", ")} }`;
const archivo = `// Generado por motor/Dotnet~/referencias.mjs a partir del código TypeScript. No editar a mano.
namespace ChatCouncil.Motor.Pruebas
{
    public static class Referencias
    {
        public static readonly string[] Semillas = { ${SEMILLAS.map(cs).join(", ")} };
        public static readonly uint[] HashSemillas = { ${SEMILLAS.map((s) => `${analisis.hashSemilla(s)}u`).join(", ")} };

        /// <summary>seededShuffle([0..n-1], semilla).</summary>
        public static readonly (uint semilla, int n, int[] orden)[] Barajados = {
            ${BARAJADOS.map((b) => `(${b.semilla}u, ${b.n}, new int[] { ${b.orden.join(", ")} })`).join(",\n            ")}
        };

        public static readonly string[] TerminosBloqueados = { ${analisis.PROVIDER_NAME_BLOCKLIST.map(cs).join(", ")} };
        public const string TokenRedaccion = ${cs(analisis.REDACTION_TOKEN)};

        /// <summary>Entrada y salida de anonymizeReplies(respuestas, true, semilla), como JSON.</summary>
        public static readonly (uint semilla, string entrada, string esperado)[] Anonimizados = {
            ${ANONIMIZADOS.map((a) => `(${a.semilla}u, ${cs(a.entrada)}, ${cs(a.esperado)})`).join(",\n            ")}
        };

        public static readonly (string[] ids, string[] claves, string[] codigos)[] Codigos = {
            ${CODIGOS.map((k) => `(${strs(k.ids)}, ${strs(k.codigos.map(([id]) => id))}, ${strs(k.codigos.map(([, p]) => p))})`).join(",\n            ")}
        };

        public static readonly (string url, string limpia)[] Limpiezas = {
            ${LIMPIEZAS.map(([u, l]) => `(${cs(u)}, ${cs(l)})`).join(",\n            ")}
        };

        public static readonly (string texto, string[] fugas)[] Fugas = {
            ${FUGAS.map(([t, f]) => `(${cs(t)}, ${strs(f)})`).join(",\n            ")}
        };

        /// <summary>armarCuerpoConFuentes: el cuerpo, o el mensaje con que tira.</summary>
        public static readonly (string texto, string[] urls, string cuerpo, string error)[] Armados = {
            ${ARMADOS.map(([t, us, cuerpo, error]) => `(${cs(t)}, ${strs(us)}, ${cs(cuerpo)}, ${cs(error)})`).join(",\n            ")}
        };

        public static readonly (string texto, string token, int intervalo, string conMarcas, string[] marcas)[] Marcas = {
            ${MARCAS.map((m) => `(${cs(m.texto)}, ${cs(m.token)}, ${m.intervalo}, ${cs(m.textoConMarcas)}, ${strs(m.marcas)})`).join(",\n            ")}
        };

        public static readonly string ConMarcas = ${cs(CON_MARCAS)};
        public static readonly string[] MarcasIntegridad = ${strs(MARCAS_10)};

        public static readonly (string caso, string respuesta, string estado, int esperadas, int presentes, int[] faltantes)[] Integridades = {
            ${INTEGRIDADES.map((r) => `(${cs(r.caso)}, ${cs(r.respuesta)}, ${cs(r.estado)}, ${r.marcasEsperadas}, ${r.marcasPresentes}, new int[] { ${r.faltantes.join(", ")} })`).join(",\n            ")}
        };

        /// <summary>localizarPerdida(ConMarcas, final, MarcasIntegridad), como JSON.</summary>
        public static readonly (string final, string segmentos)[] Perdidas = {
            ${PERDIDAS.map((p) => `(${cs(p.final)}, ${cs(p.segmentos)})`).join(",\n            ")}
        };

        public const uint SemillaCuerpos = ${SEMILLA_CUERPOS}u;
        public static readonly string[] PoolCuerpos = ${strs(POOL)};

        /// <summary>armarCuerposPorOperador con tokens tok1, tok2…: la salida como JSON, o el mensaje con que tira.</summary>
        public static readonly (string entrada, string esperado, string error)[] Cuerpos = {
            ${CUERPOS.map((k) => `(${cs(k.entrada)}, ${cs(k.esperado)}, ${cs(k.error)})`).join(",\n            ")}
        };

        public const string Rescate = ${cs(RESCATE)};
        public const string Etiquetadas = ${cs(JSON.stringify(ETIQUETADAS))};
        public const string HallazgosIntegrador = ${cs(JSON.stringify(H_INTEGRADOR))};

        /// <summary>Los prompts armados por el TypeScript para cada pregunta, con Etiquetadas, HallazgosIntegrador y Rescate.</summary>
        public static readonly (string pregunta, string operacion, string operacionConArchivo, string cuerpoArchivo, string integrador, string verificador, string redactor)[] Prompts = {
            ${PROMPTS.map((p) => `(${p.map(cs).join(", ")})`).join(",\n            ")}
        };

        public static readonly (string material, string archivo)[] ArchivosRedactor = {
            ${ARCHIVOS_REDACTOR.map(([m, t]) => `(${cs(m)}, ${cs(t)})`).join(",\n            ")}
        };

        /// <summary>Integrador, verificador y redactor por defecto de seleccion-proveedores.ts.</summary>
        public static readonly string[] RolesPorDefecto = ${strs(ROLES)};

        public static readonly (string html, string texto)[] TextosHtml = {
            ${TEXTOS_HTML.map(([h, t]) => `(${cs(h)}, ${cs(t)})`).join(",\n            ")}
        };
        /// <summary>Lo que tira textoDeHtmlEnBloques con &amp;#1114112; (un punto de código fuera de rango).</summary>
        public const string ErrorHtml = ${cs(errorHtml)};

        public const string SalidaOperador = ${cs(SALIDA_OPERADOR)};
        /// <summary>parsearHallazgos(SalidaOperador, P1..P6) como JSON.</summary>
        public const string HallazgosParseados = ${cs(HALLAZGOS_PARSEADOS)};

        public const string SalidaVerificador = ${cs(SALIDA_VERIFICADOR)};
        /// <summary>parsearVerificacion(SalidaVerificador, H12, H13, H24, H58, H59, H60) como JSON.</summary>
        public const string VerificacionParseada = ${cs(VERIFICACION_PARSEADA)};

        /// <summary>parsearReferenciasIntegrador(informe, H1..H4) como JSON; el primero es el informe sembrado de guard:trazabilidad.</summary>
        public static readonly (string informe, string esperado)[] Trazabilidades = {
            ${TRAZABILIDADES.map(([t, e]) => `(${cs(t)}, ${cs(e)})`).join(",\n            ")}
        };

        /// <summary>extraerTituloDelInforme como JSON y esParrafoTitulo.</summary>
        public static readonly (string informe, string titulo, bool esParrafoTitulo)[] Titulos = {
            ${TITULOS.map(([t, e, p]) => `(${cs(t)}, ${cs(e)}, ${p})`).join(",\n            ")}
        };

        public static readonly (string informe, string rescate)[] Rescates = {
            ${RESCATES.map(([t, r]) => `(${cs(t)}, ${cs(r)})`).join(",\n            ")}
        };

        public static readonly (string linea, bool es)[] EncabezadosRescate = {
            ${ENCABEZADOS.map(([l, e]) => `(${cs(l)}, ${e})`).join(",\n            ")}
        };

        public static readonly (string titulo, string limpio)[] LimpiezasTitulo = {
            ${LIMPIEZAS_TITULO.map(([t, l]) => `(${cs(t)}, ${cs(l)})`).join(",\n            ")}
        };

        public static readonly (string pregunta, string titulo)[] TitulosDesdePregunta = {
            ${DESDE_PREGUNTAS.map(([p, t]) => `(${cs(p)}, ${cs(t)})`).join(",\n            ")}
        };

        /// <summary>nombreBaseDeInforme con ahora = 2026-10-06 09:05 local.</summary>
        public static readonly (string titulo, string pregunta, string nombre)[] NombresBase = {
            ${NOMBRES_BASE.map(([t, p, n]) => `(${cs(t)}, ${cs(p)}, ${cs(n)})`).join(",\n            ")}
        };

        /// <summary>nombreLibreDeInforme("base") con "base", "base (2)" y "base (3)" ocupados.</summary>
        public const string NombreLibre = ${cs(NOMBRE_LIBRE)};

        /// <summary>Un hecho de cada tipo, escrito por las funciones reales de registro.ts.</summary>
        public static readonly string[] RegistroLineas = {
            ${arr(LINEAS)}
        };

        public static readonly (string entrada, int hechos, int[] numeros, string[] contenidos, bool ultima)[] Lecturas = {
            ${LECTURAS.map((l) => `(${cs(l.entrada)}, ${l.hechos}, new int[] { ${l.ilegibles.map((i) => i.numero).join(", ")} }, new string[] { ${l.ilegibles.map((i) => cs(i.contenido)).join(", ")} }, ${l.ultima})`).join(",\n            ")}
        };

        public static readonly (string registro, string etapa, string captura)[] Etapas = {
            ${ESCENARIOS_ETAPA.map((e) => `(${cs(e.texto)}, ${cs(e.etapa)}, ${cs(e.captura)})`).join(",\n            ")}
        };

        public static readonly (string registro, string esperado)[] PreguntasEfectivas = {
            ${ESCENARIOS_PREGUNTA.map((e) => `(${cs(e.texto)}, ${cs(e.esperado)})`).join(",\n            ")}
        };

        public static readonly (string texto, bool valida)[] PreguntasValidas = {
            ${VALIDAS.map(([t, v]) => `(${cs(t)}, ${v})`).join(",\n            ")}
        };

        public static readonly (string lectura, string contexto, string esperado)[] Procedencias = {
            ${PROCEDENCIAS.map((p) => `(${cs(p.lectura)}, ${cs(p.contexto)}, ${cs(p.esperado)})`).join(",\n            ")}
        };

        public static readonly (string registro, string integrador, string[] cargados)[] Cargados = {
            ${ESCENARIOS_CARGADOS.map((e) => `(${cs(e.texto)}, ${cs(e.integrador)}, ${e.cargados === null ? "null" : `new string[] { ${e.cargados.map(cs).join(", ")} }`})`).join(",\n            ")}
        };
    }
}
`;
writeFileSync(join(AQUI, "..", "Tests", "Referencias.g.cs"), archivo, "utf8");

const datos = `// Generado por motor/Dotnet~/referencias.mjs a partir del código TypeScript. No editar a mano.
namespace ChatCouncil.Motor
{
    /// <summary>
    /// Los prompts literales y specs.json de la versión Electron, tomados por
    /// script del código que los usa. Son datos de investigación: no se tocan.
    /// </summary>
    public static class Datos
    {
${Object.entries(PLANTILLAS).map(([k, v]) => `        public const string ${k} = ${cs(v)};`).join("\n")}

        /// <summary>packages/providers/src/specs.json, el archivo entero.</summary>
        public const string Specs = ${cs(SPECS)};
    }
}
`;
writeFileSync(join(AQUI, "..", "Runtime", "Datos.g.cs"), datos, "utf8");
console.log(`Referencias.g.cs escrito: ${SEMILLAS.length} semillas, ${BARAJADOS.length} barajados, ${ANONIMIZADOS.length} anonimizados, ${LINEAS.length} lineas de registro, ${LECTURAS.length} lecturas, ${ESCENARIOS_ETAPA.length} etapas.`);
