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
