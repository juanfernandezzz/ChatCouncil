#!/usr/bin/env node
/**
 * Valores de referencia del código TypeScript actual, para que las pruebas del
 * motor en C# comprueben que el port conserva los algoritmos y el formato.
 * Ejecuta las funciones REALES (packages/ y el registro de apps/desktop) con
 * entradas fijas y escribe Tests/Referencias.g.cs. Determinista: ids y fechas
 * se fijan antes de importar, así dos corridas dan el mismo archivo byte a byte.
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

/** Literal de C#. JSON ya escapa lo que C# exige, salvo U+2028/U+2029, que C# toma como salto de línea. */
const cs = (s) =>
  s === null
    ? "null"
    : [0x2028, 0x2029].reduce(
        (t, c) => t.split(String.fromCharCode(c)).join(String.fromCharCode(92) + "u" + c.toString(16)),
        JSON.stringify(s),
      );
const LS = String.fromCharCode(0x2028);
const TEXTO_RARO = `comillas "dobles", barra \\ ñandú 😀 separador${LS}control${String.fromCharCode(1)} surrogate suelto ${String.fromCharCode(0xd800)} fin`;

// ---------------------------------------------------------------- semillas
const SEMILLAS = ["", "abc", "0f8fad5b-d9cb-469f-a165-70867728950e", "ñandú", "😀 con emoji", `salto${LS}de linea`];

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
const archivo = `// Generado por motor/Dotnet~/referencias.mjs a partir del código TypeScript. No editar a mano.
namespace ChatCouncil.Motor.Pruebas
{
    public static class Referencias
    {
        public static readonly string[] Semillas = { ${SEMILLAS.map(cs).join(", ")} };
        public static readonly uint[] HashSemillas = { ${SEMILLAS.map((s) => `${analisis.hashSemilla(s)}u`).join(", ")} };

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
console.log(`Referencias.g.cs escrito: ${SEMILLAS.length} semillas, ${LINEAS.length} lineas de registro, ${LECTURAS.length} lecturas, ${ESCENARIOS_ETAPA.length} etapas.`);
