/**
 * main/index.ts — proceso principal
 * ----------------------------------
 * Fase 1: N vistas de proveedor en una ventana, cada una con su partición de
 * sesión, más el compositor único que difunde a todas.
 *
 * Lo que la Fase 0 dejó probado y acá sólo se multiplica: una vista embebida
 * NO es un iframe —tiene su propio documento de nivel superior—, así que las
 * cookies se calculan contra el proveedor y la sesión persiste. Verificado
 * con 72 cookies sobreviviendo al cierre completo de la app.
 */

import { app, BaseWindow, WebContentsView, ipcMain, screen, session } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { Server } from "node:http";

import { PROVIDER_SPECS } from "@chatcouncil/providers";
import type { Procedencia } from "@chatcouncil/domain";

import { correrPruebaFase1, type LecturaProveedor, type ResultadoEnvio } from "./test-runner";
import { sondear } from "./probe";
import {
  crearConversacion,
  escribirIntentos,
  escribirRespuestas,
  escribirRonda,
  leerRegistroDeArchivo,
} from "./registro";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Investigadores activos. **El número no se codifica en ningún lado** —fue un
 * requisito que la v2 escribió y violó tres veces— así que todo lo que sigue
 * se deriva de esta lista: la grilla, la difusión y el estado.
 */
const INVESTIGADORES = ["chatgpt", "glm", "claude", "gemini"] as const;
type ProviderId = (typeof INVESTIGADORES)[number];

/**
 * Candidatos a investigador, para los modos de reconocimiento y de login.
 * Son una lista SEPARADA a propósito: todavía no tienen spec, así que no
 * pueden difundir ni leer, y meterlos en `INVESTIGADORES` con una spec de
 * relleno ensuciaría la única fuente de verdad de los selectores.
 *
 * Cuando un candidato tenga su spec derivada, se muda a `INVESTIGADORES` y
 * sale de acá. La partición `persist:` es la misma en ambos casos, así que el
 * login hecho durante el reconocimiento se reutiliza intacto.
 */
const CANDIDATOS_SONDEO: { id: string; url: string }[] = [
  // URLs CONFIRMADAS cargándolas el 2026-08-10 y mirando la URL final: ninguna
  // de las dos redirige. `chat.qwen.ai/` responde con título "Qwen Studio";
  // `www.kimi.com/` conserva el `www` y responde con su portada. Iban sin
  // verificar en la tarea, así que se verificaron antes de escribirlas: una URL
  // que redirige deja la partición apuntando a un origen distinto del que uno
  // cree, y eso recién se nota cuando la sesión no aparece.
  { id: "qwen", url: "https://chat.qwen.ai/" },
  { id: "kimi", url: "https://www.kimi.com/" },
  // Verificadas el 2026-08-13 cargándolas y mirando `location.href` final.
  // grok.com y chat.mistral.ai NO redirigen. chat.deepseek.com SI redirige a
  // /sign_in — se usa la URL final, no la que estaba supuesta en la tarea.
  { id: "grok", url: "https://grok.com/" },
  { id: "mistral", url: "https://chat.mistral.ai/" },
  { id: "deepseek", url: "https://chat.deepseek.com/sign_in" },
];

/**
 * Modo de arranque. Se lee de `process.argv` Y de `process.env`, y el
 * argumento es el camino principal a propósito: `CC_TEST=1 electron ...` es
 * sintaxis de shell POSIX y **no funciona en el `cmd.exe` de Windows**, que
 * es donde corre esto. Un script de npm con esa forma falla antes de arrancar
 * la app, con un error que no se parece en nada a la causa.
 */
/**
 * IDENTIDAD DE LA APLICACIÓN. Va antes que todo lo demás a propósito.
 *
 * Medido el 2026-08-02: `app.getPath("userData")` devolvía
 * `AppData\\Roaming\\Electron` — la carpeta POR DEFECTO de Electron, no una
 * carpeta de ChatCouncil. Pasa porque al arrancar con `electron out/main/index.js`
 * Electron no toma el nombre del paquete y cae en su nombre genérico.
 *
 * Dos consecuencias, y ninguna era visible:
 *  1. Las sesiones `persist:` de los cuatro investigadores viven en una carpeta
 *     COMPARTIDA con cualquier otra aplicación de Electron que se corra en
 *     modo desarrollo en esta máquina. Es la explicación más plausible del
 *     login que desapareció, aunque no está demostrada.
 *  2. La persistencia de la Fase 2 —decisión 1, archivo de texto en
 *     `userData`— iba a escribir los datos de investigación en esa misma
 *     carpeta genérica. Eso hay que arreglarlo ANTES de escribir el primer
 *     dato, no después.
 *
 * `setName` y `setPath` tienen que correr antes de que se cree cualquier
 * sesión: una vez que una partición se abrió, ya quedó apuntada a la ruta
 * vieja.
 *
 * COSTO ACEPTADO: la carpeta cambia, así que los logins actuales quedan atrás
 * y hay que entrar una vez más. No se mueven las particiones viejas a mano:
 * viven mezcladas con las de otras aplicaciones en la carpeta genérica, y
 * separarlas a ojo es más riesgoso que un login.
 */
/**
 * CERROJO DE INSTANCIA ÚNICA.
 *
 * Dos procesos de Electron sobre la MISMA partición `persist:` escriben la
 * misma base de sesión al mismo tiempo, y esa base se corrompe. El 2026-08-02
 * Chromium reportó una base corrupta en la partición de claude, la borró para
 * recuperarse —que es lo correcto de su parte— y con eso se fue la sesión:
 * claude.ai rebotó `/new` a `/logout` porque el token ya no valía.
 *
 * El flujo de trabajo de este proyecto produce esa condición sola: Juan abre
 * la aplicación para entrar en las cuentas y el agente corre sondeos en otro
 * proceso. Las corridas del arnés son secuenciales, así que el cerrojo no
 * estorba; lo único que impide es justo lo que rompe.
 */
if (!app.requestSingleInstanceLock()) {
  decirPorSalida(
    "\n===CC_INSTANCIA===\nYa hay una instancia de ChatCouncil abierta. Dos procesos sobre la misma\n" +
      "particion corrompen la base de sesion y se pierden los logins. Cierra la otra ventana\n" +
      "e intenta de nuevo.\n",
  );
  app.exit(1);
}

app.setName("ChatCouncil");
app.setPath("userData", join(app.getPath("appData"), "ChatCouncil"));

const ARGV = process.argv.slice(1);
type Modo = "normal" | "test" | "probe" | "login" | "sesion" | "historial";

/**
 * `--cc-historial=<id>` vuelca UNA conversación por stdout como JSON, leída
 * con `leerRegistro` del paquete de dominio. No abre ninguna ventana ni
 * proveedor: es puro almacén, así que corre y sale.
 */
const HISTORIAL_ID = (ARGV.find((a) => a.startsWith("--cc-historial=")) ?? "").split("=")[1] ?? "";

/**
 * `--cc-sesion=escribir` / `--cc-sesion=leer`: banco de pruebas de
 * PERSISTENCIA, sin cuentas y sin humano.
 *
 * Existe porque comprobar si una sesión sobrevive al cierre exigía que Juan
 * entrara a mano en cuatro proveedores, cerrara la ventana y esperara — un
 * viaje de ida y vuelta por cada intento de arreglo. Eso hace imposible
 * iterar.
 *
 * Lo que hay que probar no es el login: es que algo escrito en una partición
 * `persist:` siga ahí después de cerrar. Eso se prueba con una cookie propia y
 * un reloj. `escribir` deja una cookie marcada en las cuatro particiones y
 * cierra por el camino normal; `leer` la busca en un proceso nuevo. Si
 * sobrevive, el mecanismo funciona y recién ahí vale la pena gastar un login
 * de verdad.
 *
 * La cookie es nuestra, en `https://localhost/`, y no toca ninguna credencial.
 */
const SESION = /^(escribir|leer)$/.exec((ARGV.find((a) => a.startsWith("--cc-sesion=")) ?? "").split("=")[1] ?? "");
const MODO: Modo = HISTORIAL_ID
  ? "historial"
  : SESION
  ? "sesion"
  : ARGV.includes("--cc-test") || process.env["CC_TEST"] === "1"
  ? "test"
  : ARGV.includes("--cc-probe") || process.env["CC_PROBE"] === "1"
    ? "probe"
    : ARGV.includes("--cc-login") || process.env["CC_LOGIN"] === "1"
      ? "login"
      : "normal";

/**
 * `--cc-probe-escribe`: el sondeo escribe un marcador neutro antes de mirar,
 * porque hay controles que sólo existen con texto en el compositor. OPT-IN y
 * nunca por defecto. Sigue sin enviar: ni un clic en un control de envío ni
 * una tecla, y limpia el compositor antes de devolver.
 */
const SONDEO_ESCRIBE = ARGV.includes("--cc-probe-escribe") || process.env["CC_PROBE_ESCRIBE"] === "1";

/**
 * `--cc-compositor=<id>:<selector>` (repetible) — selector de compositor para
 * un CANDIDATO, que por definición todavía no tiene spec.
 *
 * Existe por un orden obligado que no se puede saltear. Hay controles que sólo
 * existen con texto en el compositor —Gemini muestra el micrófono en vez del
 * botón de enviar mientras está vacío (§7.25)—, así que derivar el control de
 * envío exige escribir; y `--cc-probe-escribe` sólo escribe donde hay un
 * selector YA derivado, que sale de la spec. Un candidato no tiene spec, así
 * que quedaba trabado: no se puede derivar el envío sin escribir, y no se puede
 * escribir sin la spec que el envío completa.
 *
 * La salida NO es meter una spec de relleno en `specs.json`: eso ensucia la
 * única fuente de verdad de los selectores, que es justo el motivo por el que
 * los candidatos viven en una lista aparte. El selector derivado en la corrida
 * anterior viaja por la línea de comandos, se usa para esa corrida y no queda
 * escrito en ningún lado.
 *
 * No debilita ninguna garantía: sigue sin haber clic y sin tecla, así que sigue
 * sin enviar. Lo único que habilita es escribir texto donde ya se sabe que hay
 * un cuadro de texto.
 */
const COMPOSITORES_CLI = new Map<string, string>();
for (const a of ARGV) {
  if (!a.startsWith("--cc-compositor=")) continue;
  const v = a.slice("--cc-compositor=".length);
  const corte = v.indexOf(":");
  // Se corta en el PRIMER ":" porque el id no lo lleva nunca y el selector sí
  // puede (`:hover`, `:nth-child`). Al revés, un selector con pseudoclase se
  // partiría al medio y el sondeo escribiría en cualquier lado.
  if (corte <= 0) continue;
  COMPOSITORES_CLI.set(v.slice(0, corte), v.slice(corte + 1));
}

/** Los candidatos sólo se abren cuando se los va a reconocer o loguear. */
const CON_CANDIDATOS = MODO === "probe" || MODO === "login";

/**
 * `--cc-solo=<id>` abre UN solo investigador.
 *
 * Existe para separar dos causas que producen el mismo sintoma: un defecto
 * estructural del proveedor, o contencion entre cuatro aplicaciones pesadas
 * difundidas en paralelo dentro de un mismo proceso. Si un proveedor falla
 * igual estando solo, no era contencion. Es una linea de comando en vez de
 * una hipotesis.
 */
/**
 * `--cc-solo=<id>[,<id>…]` — acepta una LISTA y filtra investigadores **y
 * candidatos**, no sólo investigadores.
 *
 * Filtraba únicamente `INVESTIGADORES`, y con eso no había forma de abrir un
 * candidato solo: el modo login abría los seis, y sobre la pantalla de 1366 px
 * de Juan seis paneles dan ~225 px cada uno. 225 px es ancho hostil para una
 * pantalla de inicio de sesión —varias esconden el formulario o lo mandan a un
 * flujo distinto—, así que el único paso humano de la fase se hacía en las
 * peores condiciones posibles. Con dos paneles son ~675 px.
 */
const SOLO_LISTA = ((ARGV.find((a) => a.startsWith("--cc-solo=")) ?? "").split("=")[1] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * `--cc-solo-candidatos` — atajo para "abrí sólo los que todavía no tienen
 * spec". Se DERIVA de `CANDIDATOS_SONDEO` en vez de repetir los ids: una lista
 * paralela a un registro termina desincronizándose, y en este proyecto ya pasó
 * tres veces con la misma lista. Sumar un candidato sigue siendo agregarlo
 * arriba y nada más.
 */
const SOLO_CANDIDATOS = ARGV.includes("--cc-solo-candidatos") || process.env["CC_SOLO_CANDIDATOS"] === "1";

const SELECCION: readonly string[] = SOLO_CANDIDATOS ? CANDIDATOS_SONDEO.map((c) => c.id) : SOLO_LISTA;
const SOLO = SELECCION.join(",");

const ACTIVOS: readonly ProviderId[] =
  SELECCION.length > 0 ? INVESTIGADORES.filter((id) => SELECCION.includes(id)) : INVESTIGADORES;

/**
 * `--cc-salida=<ruta>` escribe además el informe a un archivo (append).
 * `--cc-ventana=<ancho>x<alto>` fuerza el tamaño del ÁREA DE CONTENIDO, no el
 * del marco. Antes fijaba el marco, y en Windows eso restaba unos 16 px de
 * ancho y 39 de alto: pedir 350x700 daba paneles de 334x529 y nadie sabía por
 * qué. El tamaño pedido y el REAL se informan los dos, porque la pantalla
 * puede recortar el pedido igual (una petición de 1600 sobre una pantalla de
 * 1366 termina en 1350, y esa diferencia pasó inadvertida una corrida entera).
 *
 * Existe porque el tamaño del PANEL es una variable de la prueba, no un
 * detalle estetico: con cuatro vistas en grilla cada panel mide alrededor de
 * 800x434, y varias interfaces cambian de layout —o directamente de
 * atributos— por debajo de cierto ancho. Correr uno solo a pantalla completa
 * y cuatro en grilla compara dos cosas distintas sin decirlo.
 */
const VENTANA = /^(\d+)x(\d+)$/.exec((ARGV.find((a) => a.startsWith("--cc-ventana=")) ?? "").split("=")[1] ?? "");
const VENTANA_W = VENTANA ? Number(VENTANA[1]) : 1600;
const VENTANA_H = VENTANA ? Number(VENTANA[2]) : 1000;

/** Alto de la franja de la interfaz propia; el resto se reparte entre las vistas. */
const UI_HEIGHT = 132;

interface Vista {
  id: string;
  view: WebContentsView;
}

let win: BaseWindow | null = null;
let uiView: WebContentsView | null = null;

/** Investigadores con spec: son los únicos que difunden y se leen. */
const vistas: { id: ProviderId; view: WebContentsView }[] = [];
/** Candidatos sin spec: sólo se los mira o se los loguea. */
const sondeos: Vista[] = [];

const todas = (): Vista[] => [...vistas, ...sondeos];

/**
 * TODAS las particiones que la aplicación puede tener con sesión iniciada.
 *
 * Se deriva de las dos listas y no se escribe a mano. Importa porque el
 * volcado de cierre y el censo recorrían sólo `INVESTIGADORES`: en cuanto un
 * candidato tiene login —que es exactamente lo que va a pasar con qwen y
 * kimi—, ese login no se volcaría al salir y se perdería. Es la lección 50
 * literal: el volcado enganchado en un subconjunto deja afuera justo al que
 * más lo necesita, y el síntoma —"nunca me guardó la sesión"— no se parece en
 * nada a la causa.
 *
 * No depende de qué vistas estén abiertas en ESTA corrida: si Juan entró a
 * qwen con `--cc-solo-candidatos` y después abre la app normal, la partición
 * de qwen sigue existiendo y tiene que volcarse igual.
 */
const PARTICIONES_CONOCIDAS: readonly string[] = [
  ...INVESTIGADORES,
  ...CANDIDATOS_SONDEO.map((c) => c.id),
];

/**
 * ALMACEN — estado de la conversación en curso de este proceso.
 *
 * Una corrida de la app (o del arnés) es UNA conversación: se crea sola, la
 * primera vez que algo se difunde. `indiceRonda` numera las rondas de esa
 * conversación y `rondaActualId` es el enganche entre `difundir` (que abre
 * la ronda) y la escritura de las respuestas que llegan después, cuando la
 * lectura se asienta.
 */
let conversacionActual: string | null = null;
let indiceRonda = 0;
let rondaActualId: string | null = null;

/**
 * Continuidad NO se infiere del texto (BLUEPRINT / contrato Fase 2): se
 * deriva de un hecho del proceso — si la vista navegó o se recargó desde la
 * ronda anterior. `did-navigate` cubre ambos: una recarga es una navegación
 * al mismo URL. `contadorNavegaciones` cuenta esos eventos por proveedor;
 * `navegacionesEnRondaAnterior` es la foto de ese contador al cerrar la
 * ronda anterior, para comparar en la próxima.
 */
const contadorNavegaciones = new Map<string, number>();
const navegacionesEnRondaAnterior = new Map<string, number>();

function continuidadDe(id: string): Procedencia["continuidad"] {
  const actual = contadorNavegaciones.get(id) ?? 0;
  const previa = navegacionesEnRondaAnterior.get(id);
  if (previa === undefined) return "indeterminada";
  return previa === actual ? "confirmada" : "refutada";
}

/**
 * DIAGNÓSTICO DE LA ETIQUETA DE MODELO — archivo APARTE del registro.
 *
 * Va aparte a propósito, y el motivo no es de orden sino de contrato: el
 * registro `conversaciones/<id>.jsonl` es el dato de investigación de Juan y es
 * append-only con un esquema declarado. Un volcado de DOM no es un hecho de la
 * investigación: es instrumental, cambia con el instrumento, y meterlo ahí
 * ensucia el dato canónico con algo que mañana se borra.
 *
 * QUÉ CONTESTA, y por qué no se puede contestar de otra manera. El camino real
 * guarda `GeminiFlash-Lite`; el sondeo, con el MISMO selector y la MISMA
 * extracción, lee `Gemini 3.5 Flash-Lite`. Medido sobre los nueve crudos del
 * árbol el 2026-08-10, lo que separa los dos resultados es el estado del
 * compositor —11 de 11 corridas, sin excepción— y no las cookies ni el ancho.
 * `readModelLabel` corre DESPUÉS del envío, o sea del lado degradado, y el
 * sondeo no puede llegar ahí porque tiene prohibido enviar.
 *
 * Así que el dato sólo puede producirlo una ronda REAL. Esto lo instrumenta y
 * lo deja escrito; NO arregla nada, porque arreglar antes de medir ya costó
 * dos rondas enteras en este proyecto.
 */
function registrarDiagnosticoEtiqueta(
  momento: "envio" | "lectura",
  filas: readonly { id: string; modelLabel?: string | null; modelLabelDesglose?: unknown }[],
): void {
  const conDesglose = filas.filter((f) => f.modelLabelDesglose != null);
  if (conDesglose.length === 0) return;
  try {
    const dir = join(app.getPath("userData"), "diagnostico");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const cuando = new Date().toISOString();
    for (const f of conDesglose) {
      appendFileSync(
        join(dir, "etiqueta-modelo.jsonl"),
        JSON.stringify({
          tipo: "etiqueta-modelo",
          cuando,
          momento,
          proveedorId: f.id,
          conversacionId: conversacionActual,
          rondaId: rondaActualId,
          rondasEnviadas: indiceRonda,
          panel: panelDe(f.id),
          // Lo que se GUARDÓ en la procedencia, al lado del subárbol del que
          // salió: sin las dos cosas juntas no se puede decir cuál de los dos
          // se degradó.
          modelLabel: f.modelLabel ?? null,
          desglose: f.modelLabelDesglose,
        }) + "\n",
        "utf8",
      );
    }
  } catch (e) {
    // Se avisa y se sigue. Perder una ronda real de Juan porque no se pudo
    // escribir un archivo de diagnóstico seria cambiar el dato por el
    // instrumento.
    decirPorSalida(`\n[cc] no pude escribir el diagnostico de etiqueta: ${String(e)}\n`);
  }
}

function panelDe(id: string): string | null {
  const v = todas().find((x) => x.id === id);
  if (!v) return null;
  const b = v.view.getBounds();
  return `${b.width}x${b.height}`;
}

function asegurarConversacion(esPrueba: boolean): string {
  if (!conversacionActual) {
    conversacionActual = crearConversacion(app.getPath("userData"), esPrueba);
  }
  return conversacionActual;
}

/** `cc:difundir` escribe: la ronda y un intento por proveedor, incluidos los que fallaron. */
async function difundirConRegistro(prompt: string, esPrueba: boolean): Promise<ResultadoEnvio[]> {
  const conv = asegurarConversacion(esPrueba);
  const resultados = await difundir(prompt);
  rondaActualId = escribirRonda(app.getPath("userData"), conv, indiceRonda++, prompt, null);
  escribirIntentos(app.getPath("userData"), conv, rondaActualId, resultados);
  registrarDiagnosticoEtiqueta("envio", resultados);
  return resultados;
}

/**
 * `cc:leer` escribe: una respuesta por proveedor, con procedencia derivada
 * por `derivarProcedencia` (Fase 2). Sin una ronda abierta no hay a qué
 * enganchar la respuesta, así que se omite la escritura — sigue devolviendo
 * la lectura igual.
 */
function registrarRespuestasDeRondaActual(lecturas: readonly LecturaProveedor[]): void {
  // El diagnóstico se escribe SIEMPRE, aunque no haya ronda abierta a la que
  // enganchar la respuesta: es un archivo aparte y su valor no depende del
  // registro. Justo la lectura huérfana —leer sin haber difundido en este
  // proceso— es un estado que interesa poder mirar.
  registrarDiagnosticoEtiqueta("lectura", lecturas);
  if (!conversacionActual || !rondaActualId) return;
  escribirRespuestas(app.getPath("userData"), conversacionActual, rondaActualId, lecturas, (id) => ({
    continuidad: continuidadDe(id),
    panel: panelDe(id),
  }));
  for (const id of ACTIVOS) {
    navegacionesEnRondaAnterior.set(id, contadorNavegaciones.get(id) ?? 0);
  }
}

/**
 * Disposición: UNA FILA HORIZONTAL, un panel por investigador.
 *
 * Antes era la grilla más cuadrada posible (`ceil(sqrt(n))` columnas), que con
 * cuatro daba dos por dos. Juan la cambió a fila el 2026-08-01. Sigue sin
 * codificarse ninguna cantidad: la fila se deriva de la lista igual que antes,
 * y sumar un investigador es agregarlo ahí y nada más.
 *
 * LO QUE EL CAMBIO CUESTA, Y HAY QUE TENERLO A LA VISTA (§7.29: el tamaño del
 * panel es una VARIABLE DE LA PRUEBA, no un detalle estético). Con la ventana
 * por defecto de 1600 y cuatro investigadores, cada panel pasa de ~800x434 a
 * ~400x868. 400 px de ancho es ancho de teléfono: varias interfaces cambian de
 * layout, esconden la barra superior —donde vive la etiqueta de modelo— o
 * cambian atributos por debajo de ese umbral. Por eso el sondeo reporta con
 * qué ancho de panel se tomó cada muestra.
 */
const DISPOSICION = "fila-horizontal";

function layout(): void {
  if (!win || !uiView) return;
  const { width, height } = win.getContentBounds();
  uiView.setBounds({ x: 0, y: 0, width, height: UI_HEIGHT });

  const abiertas = todas();
  const n = abiertas.length;
  if (n === 0) return;
  const w = Math.floor(width / n);
  const h = Math.max(0, height - UI_HEIGHT);

  abiertas.forEach((v, i) => {
    v.view.setBounds({ x: i * w, y: UI_HEIGHT, width: w, height: h });
  });
}

/** Navegaciones a cierre de sesión que se frenaron. Va al informe del sondeo. */
const redireccionesBloqueadas: { id: string; destino: string; cuando: string }[] = [];

function crearVista(id: string, url: string): WebContentsView {
  // Una partición POR PROVEEDOR: además de aislar cookies, permite convivir
  // cuentas distintas (la burner en uno, las pagas en otros) sin que se pisen
  // — algo imposible en un mismo perfil de navegador.
  const sesion = session.fromPartition(`persist:${id}`);
  const view = new WebContentsView({
    webPreferences: {
      session: sesion,
      preload: join(__dirname, "../preload/provider.cjs"),
      sandbox: true,
      contextIsolation: true,
    },
  });
  /**
   * NUNCA seguir una navegación a un endpoint de CIERRE DE SESIÓN.
   *
   * Esto no es una precaución teórica: es la explicación de por qué las
   * sesiones se venían cayendo. Cuando el token está a medio validar,
   * `claude.ai/new` REDIRIGE a `claude.ai/logout`, y esa página no es un
   * cartel: **cierra la sesión de verdad**, del lado del servidor y borrando
   * cookies. Cada sondeo que caía ahí destruía el login que estaba tratando de
   * medir. Juan veía las cuatro sesiones abiertas en pantalla, el agente corría
   * un sondeo, y a partir de ahí no había sesión — no porque no se hubiera
   * guardado, sino porque MIRARLA la rompía.
   *
   * Se bloquean la navegación y la redirección, y el hecho queda registrado
   * para que aparezca en el informe en vez de pasar callado.
   */
  const CIERRE_DE_SESION = /\/(logout|log-out|signout|sign-out)(\b|\/|\?|$)/i;
  const frenar = (evento: { preventDefault: () => void }, destino: string): void => {
    if (!CIERRE_DE_SESION.test(destino)) return;
    evento.preventDefault();
    redireccionesBloqueadas.push({ id, destino, cuando: new Date().toISOString() });
    decirPorSalida(
      `\n[cc] BLOQUEADA una navegacion a cierre de sesion en ${id}: ${destino}\n` +
        `[cc] La sesion sigue viva. Esa pagina la habria cerrado de verdad.\n`,
    );
  };
  view.webContents.on("will-navigate", (e, destino) => frenar(e, destino));
  view.webContents.on("will-redirect", (e, destino) => frenar(e, destino));

  void view.webContents.loadURL(url);
  return view;
}

function createWindow(): void {
  win = new BaseWindow({ width: VENTANA_W, height: VENTANA_H, title: "ChatCouncil" });
  // El pedido es sobre el CONTENIDO. `setContentSize` descuenta el marco; la
  // pantalla puede recortar igual, y por eso el sondeo informa el real.
  // Limitado al AREA UTIL de la pantalla. Sin esto, pedir 1600 sobre una
  // pantalla de 1366 abre una ventana que se sale por la derecha: para medir
  // da igual —el DOM recibe el ancho entero— pero para usar la aplicacion los
  // paneles de la derecha quedan cortados. Se informa el pedido y el real, asi
  // que el recorte nunca es silencioso.
  const util = screen.getPrimaryDisplay().workAreaSize;
  win.setContentSize(Math.min(VENTANA_W, util.width), Math.min(VENTANA_H, util.height));

  uiView = new WebContentsView({
    webPreferences: { preload: join(__dirname, "../preload/ui.cjs"), sandbox: true },
  });
  win.contentView.addChildView(uiView);
  void uiView.webContents.loadFile(join(__dirname, "../renderer/index.html"));

  for (const id of ACTIVOS) {
    const view = crearVista(id, PROVIDER_SPECS[id].newConversationUrl);
    vistas.push({ id, view });
    win.contentView.addChildView(view);
    // Continuidad se deriva de esto, no del texto: cada navegación —incluida
    // una recarga, que navega al mismo URL— cuenta acá.
    contadorNavegaciones.set(id, 0);
    view.webContents.on("did-navigate", () => {
      contadorNavegaciones.set(id, (contadorNavegaciones.get(id) ?? 0) + 1);
    });
  }

  if (CON_CANDIDATOS) {
    // El mismo filtro que los investigadores: sin esto `--cc-solo` no podía
    // acotar el modo login a los candidatos, que es justo para lo que hace
    // falta acotarlo.
    const candidatos =
      SELECCION.length > 0 ? CANDIDATOS_SONDEO.filter((c) => SELECCION.includes(c.id)) : CANDIDATOS_SONDEO;
    for (const c of candidatos) {
      const view = crearVista(c.id, c.url);
      sondeos.push({ id: c.id, view });
      win.contentView.addChildView(view);
    }
  }

  // Un id pedido que no existe en NINGUNA de las dos listas se avisa. Sin esto,
  // un tipeo abre cero paneles y la ventana vacia se lee como "la aplicacion no
  // arranco": otra vez dos estados distintos colapsados en un mismo sintoma.
  const conocidos = new Set<string>([...INVESTIGADORES, ...CANDIDATOS_SONDEO.map((c) => c.id)]);
  const desconocidos = SELECCION.filter((id) => !conocidos.has(id));
  if (desconocidos.length > 0) {
    decirPorSalida(
      `\n[cc] --cc-solo pidio ${desconocidos.join(", ")}, que no esta en INVESTIGADORES ` +
        `(${INVESTIGADORES.join(", ")}) ni en CANDIDATOS_SONDEO ` +
        `(${CANDIDATOS_SONDEO.map((c) => c.id).join(", ") || "vacio"}).\n`,
    );
  }

  layout();
  win.on("resize", layout);
}

async function difundir(prompt: string): Promise<ResultadoEnvio[]> {
  const resultados = await Promise.allSettled(
    vistas.map((v) => {
      const spec = JSON.stringify(PROVIDER_SPECS[v.id]);
      return v.view.webContents.executeJavaScript(
        `window.__ccProvider.run(${spec}, ${JSON.stringify(prompt)})`,
        true,
      );
    }),
  );
  return vistas.map((v, i) => {
    const r = resultados[i]!;
    // El `id` va DESPUÉS del spread, igual que en `leer`: el preload no lo
    // conoce, y si algún día viniera con uno, el nuestro es el bueno.
    return r.status === "fulfilled"
      ? { ...(r.value as ResultadoEnvio), id: v.id }
      : {
          id: v.id,
          ok: false,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        };
  });
}

async function leer(): Promise<LecturaProveedor[]> {
  const lecturas = await Promise.allSettled(
    vistas.map((v) => {
      const spec = JSON.stringify(PROVIDER_SPECS[v.id]);
      return v.view.webContents.executeJavaScript(`window.__ccProvider.read(${spec})`, true);
    }),
  );
  return vistas.map((v, i) => {
    const r = lecturas[i]!;
    return r.status === "fulfilled"
      ? { ...(r.value as LecturaProveedor), id: v.id }
      : { id: v.id, text: "", generating: false, modelLabel: null, error: String(r.reason) };
  });
}

/**
 * CENSO DE SESIÓN. Sólo CANTIDADES: nunca nombres, dominios ni valores de
 * cookie. Es la línea dura del proyecto y no se cruza ni para diagnosticar.
 *
 * `cookies` a secas venía siendo un indicador flojo que usábamos como si
 * fuera prueba: que haya cookies no quiere decir que haya sesión válida, y
 * tampoco distingue las que sobreviven al cierre de las que no.
 *
 * `deSesion` son las que NO tienen fecha de expiración. Chromium las borra al
 * terminar la sesión del navegador, o sea en cada cierre del proceso. Si el
 * token de un proveedor es de ese tipo, la sesión andaría perfecto mientras la
 * ventana está abierta y desaparecería en el proceso siguiente — que es
 * exactamente el cuadro que estamos viendo, y que ningún arreglo de volcado
 * puede tocar porque no es un problema de escritura.
 */
async function sesiones(): Promise<
  { id: string; cookies: number; deSesion: number; persistentes: number }[]
> {
  return Promise.all(
    todas().map(async (v) => {
      const cs = await session.fromPartition(`persist:${v.id}`).cookies.get({});
      const deSesion = cs.filter((c) => c.expirationDate === undefined).length;
      return { id: v.id, cookies: cs.length, deSesion, persistentes: cs.length - deSesion };
    }),
  );
}

/**
 * Censo tomado JUSTO ANTES de cerrar, con la sesión todavía viva.
 *
 * Es el dato que falta para cerrar el diagnóstico. Hasta ahora sólo mirábamos
 * el censo al ARRANCAR un proceso nuevo, y con eso no se puede distinguir dos
 * cosas muy distintas: que el login haya escrito y después se haya perdido, o
 * que el login nunca haya llegado a esa partición. Comparando el censo al
 * cerrar con el del arranque siguiente, la diferencia lo dice sola.
 */
async function censoAlCerrar(): Promise<void> {
  try {
    const censo = await Promise.all(
      // Incluye a los candidatos: el censo al cerrar es el que dice si un login
      // llegó a escribirse, y el login de qwen y kimi es justamente el que hay
      // que poder comprobar.
      PARTICIONES_CONOCIDAS.map(async (id) => {
        const cs = await session.fromPartition(`persist:${id}`).cookies.get({});
        return {
          id,
          cookies: cs.length,
          deSesion: cs.filter((c) => c.expirationDate === undefined).length,
        };
      }),
    );
    emitir("CC_CENSO_JSON", { momento: "antes-de-cerrar", rutaDatos: app.getPath("userData"), censo });
  } catch (e) {
    decirPorSalida(`\n[cc] no pude tomar el censo antes de cerrar: ${String(e)}\n`);
  }
}

function registrarIpc(): void {
  ipcMain.handle("cc:investigadores", () => ACTIVOS.slice());

  /**
   * DIFUSIÓN. Se lanzan todas en paralelo y se espera a todas, pero con
   * `allSettled`: **el fallo de un proveedor no puede tumbar la ronda**. El
   * que falla se reporta como fallo y los demás siguen. Nunca se simula un
   * resultado que no ocurrió.
   */
  ipcMain.handle("cc:difundir", async (_e, prompt: string) => difundirConRegistro(prompt, false));

  ipcMain.handle("cc:leer", async () => {
    const lecturas = await leer();
    registrarRespuestasDeRondaActual(lecturas);
    return lecturas;
  });

  ipcMain.handle("cc:sesiones", async () => sesiones());

  ipcMain.handle("cc:sondear", async () => sondeoVivo());
}

/**
 * SONDEO A PEDIDO SOBRE LA VENTANA VIVA (decisión de Juan, 2026-08-10).
 *
 * POR QUÉ EXISTE, y conviene tenerlo escrito porque el motivo no es cómodo.
 * `--cc-probe` arranca un proceso, navega a la pantalla de conversación nueva,
 * duerme 20 s, mira y cierra. O sea que **sólo puede observar la página recién
 * cargada y sin conversación**, y hay fallos que no ocurren en ese estado.
 *
 * El caso que lo forzó, con las mediciones adelante: la etiqueta de modelo de
 * gemini. El mismo selector —`div[data-test-id="logo-pill-label-container"]`,
 * `matches: 1`— devolvió "Gemini 3.5 Flash-Lite" en CINCO sondeos y
 * "GeminiFlash-Lite" en el registro del camino real, con la MISMA extracción
 * (`textContent.trim()`) de los dos lados. El número no se pierde al
 * concatenar: el nodo que lo lleva no está en el DOM cuando se lee. Y el
 * sondeo no podía verlo porque miraba la única pantalla en la que el fallo no
 * pasa. Es §7.24 literal: un diagnóstico tomado en un estado que no existe en
 * el momento del fallo no vale.
 *
 * El mismo instrumento hace falta para la Fase 3: si qwen o kimi tienen un
 * indicador observable de "corrida profunda en curso", sólo existe MIENTRAS
 * la corrida ocurre, o sea nunca en una página recién cargada.
 *
 * DOS GARANTÍAS, y las dos son estructurales, no promesas:
 *
 *  1. **No navega.** Corre `executeJavaScript` sobre las vistas que ya están
 *     abiertas. Ninguna vista se recarga, así que el contador de navegaciones
 *     no se mueve y la continuidad de hilo no se rompe por mirar.
 *  2. **No escribe NUNCA.** Los descriptores que se le pasan a `sondear()` van
 *     SIN `composerSelector` y SIN `submitSelector`, y sin esos campos la
 *     fuente inyectada recibe `null` y ni siquiera entra al bloque de
 *     escritura. Acá esa garantía es más importante que en `--cc-probe`: el
 *     compositor de Juan puede tener un borrador a medio escribir, y la
 *     medición de escritura lo borraría.
 *
 * La salida va a un ARCHIVO en la carpeta de datos, no sólo a stdout. Cuando
 * Juan abre la aplicación con el lanzador no hay una terminal donde leer nada,
 * y §7.39 ya dejó registrado que un crudo transcrito a mano no es una salida
 * real. El informe se adjunta; no se cuenta.
 */
async function sondeoVivo(): Promise<{
  ok: boolean;
  ruta: string | null;
  paneles: number;
  error?: string;
}> {
  try {
    const informe = {
      // "sondeo-vivo" y no "vivo": este literal es ADEMAS el marcador de
      // guard:artefacto para esta capacidad, y un marcador tiene que ser una
      // subcadena que el codigo contenga por UN solo motivo. "sondeos" a secas
      // no servia: el proceso principal ya tiene una variable con ese nombre,
      // asi que el gate habria pasado por el motivo equivocado (§7.35).
      momento: "sondeo-vivo",
      cuando: new Date().toISOString(),
      disposicion: DISPOSICION,
      rutaDatos: app.getPath("userData"),
      ventanaPedida: `${VENTANA_W}x${VENTANA_H}`,
      ventanaReal: win ? `${win.getContentBounds().width}x${win.getContentBounds().height}` : null,
      // Con qué estado de conversación se tomó la muestra. Sin esto, un sondeo
      // vivo y uno de arranque se leen como comparables y no lo son: es la
      // variable entera que este modo existe para poder mover.
      conversacionActual,
      rondasEnviadas: indiceRonda,
      redireccionesBloqueadas,
      sesiones: await sesiones(),
      paneles: await sondear(
        todas().map((v) => {
          const b = v.view.getBounds();
          const spec = (PROVIDER_SPECS as Record<string, { modelLabel?: { selector: string } } | undefined>)[v.id];
          // SIN composerSelector y SIN submitSelector: es lo que hace que este
          // camino sea de sólo lectura por construcción y no por promesa.
          //
          // `modelLabelSelector` SÍ va, y no debilita nada: es un
          // `querySelectorAll` más una lectura de texto y de atributos de la
          // lista blanca. Es además el único modo que puede mirar el pill con
          // una conversación viva, que es el estado en el que la etiqueta de
          // gemini se degrada.
          return {
            id: v.id,
            panel: `${b.width}x${b.height}`,
            ejecutar: (fuente: string) => v.view.webContents.executeJavaScript(fuente, true),
            ...(spec?.modelLabel ? { modelLabelSelector: spec.modelLabel.selector } : {}),
          };
        }),
      ),
    };
    const dir = join(app.getPath("userData"), "sondeos");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const ruta = join(dir, `sondeo-${informe.cuando.replace(/[:.]/g, "-")}.json`);
    writeFileSync(ruta, JSON.stringify(informe, null, 2), "utf8");
    emitir("CC_SONDEO_VIVO_JSON", informe);
    return { ok: true, ruta, paneles: informe.paneles.length };
  } catch (e) {
    // Nunca se simula un resultado: si falló, se dice que falló y por qué.
    return { ok: false, ruta: null, paneles: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * `--cc-salida=<ruta>` escribe ADEMÁS el informe a un archivo, APPEND.
 *
 * Existe porque dos rondas seguidas de reconocimiento llegaron resumidas: el
 * bloque crudo es largo, se pierde al copiar y pegar, y un resumen no sirve
 * de base — la regla del proyecto es salidas reales, y un resumen es
 * exactamente lo que la regla excluye. Con un archivo, el crudo se adjunta en
 * vez de transcribirse. `append` para que varias corridas se acumulen solas.
 */
const SALIDA = (ARGV.find((a) => a.startsWith("--cc-salida=")) ?? "").split("=")[1] ?? "";

/**
 * ESCRITURA A stdout QUE NO PUEDE TUMBAR EL PROCESO.
 *
 * Medido el 2026-08-10, y es un defecto de verdad, no una precaución. Al correr
 * `--cc-probe` con la salida canalizada a `head`, `head` cierra el pipe al
 * llegar a su límite y el `process.stdout.write` siguiente falla con
 * `EPIPE: broken pipe`. Como nadie lo capturaba, salía como **excepción no
 * atrapada del proceso principal**: cuadro de error de Electron y muerte del
 * proceso.
 *
 * Lo grave no es el cuadro. Es que ese camino de salida **no pasa por
 * `before-quit`**, o sea que se saltea el volcado de sesión — el mismo agujero
 * que en §7.50 y §7.53 costó los logins de los cuatro proveedores. Un proceso
 * que muere por no poder escribir en una terminal se lleva puestas las
 * credenciales que estaba a punto de guardar.
 *
 * Dos cierres, porque el fallo llega por dos vías distintas: el `write`
 * sincrónico lanza, y el stream además emite `error` de forma asincrónica. Se
 * atienden las dos y se sigue: perder una línea de informe es aceptable, perder
 * la sesión no. El informe crudo va igual a `--cc-salida` y, en el sondeo vivo,
 * al archivo de `sondeos/`.
 */
process.stdout.on("error", () => {
  /* pipe cerrado del otro lado: no hay a dónde escribir, y no es motivo para morir */
});

function decirPorSalida(texto: string): void {
  try {
    process.stdout.write(texto);
  } catch (e) {
    /* idem: la salida es un canal de informe, no el trabajo */
  }
}

/**
 * CIERRE LIMPIO — un solo punto de salida para toda la aplicación.
 *
 * Chromium escribe cookies, localStorage e IndexedDB de forma ASINCRÓNICA.
 * Salir sin forzar el volcado deja escrituras a la mitad, y una base a medio
 * escribir es una base corrupta.
 *
 * La versión anterior enganchaba el volcado sólo en `--cc-test` y
 * `--cc-probe`, cada uno en su propio `finally`. Eso dejaba afuera justo el
 * camino que más lo necesita: en `--cc-login` el proceso no cierra solo, lo
 * cierra Juan con la X, y ese cierre disparaba `window-all-closed` →
 * `app.quit()` sin pasar por ningún volcado. Medido: después de un login
 * completo en los cuatro, las cookies siguieron en 10 / 27 / 13 / 6 — los
 * mismos números que en la carpeta recién creada. El login no se perdió
 * después: **nunca llegó a escribirse**.
 *
 * Por eso el enganche va en `before-quit`, que es por donde pasan TODAS las
 * salidas: la X de la ventana, el `quit` de los modos scriptables, y
 * cualquier otro que se agregue después. Un punto, no tres.
 *
 * Sobre la espera: `flushStorageData()` NO devuelve promesa —es de disparar y
 * olvidar— así que envolverlo en `Promise.all` daba una seguridad falsa: la
 * versión anterior parecía esperar el volcado y en realidad sólo esperaba su
 * propio `setTimeout`. Acá se dice lo que hay: se dispara el volcado de las
 * cuatro particiones y se espera un margen fijo, generoso a propósito porque
 * IndexedDB tarda más que las cookies.
 */
const MARGEN_VOLCADO_MS = 2500;
let cerrando = false;

app.on("before-quit", (evento) => {
  if (cerrando) return;
  cerrando = true;
  evento.preventDefault();
  try {
    // Primero se cierran los WebContents. Mientras una vista sigue viva,
    // Chromium puede tener escrituras en vuelo que el volcado no alcanza.
    for (const v of todas()) {
      try { v.view.webContents.close(); } catch (e) { /* ya destruido */ }
    }
    // Todas las conocidas, no sólo los investigadores: qwen y kimi son
    // candidatos y van a tener login (§7.50).
    for (const id of PARTICIONES_CONOCIDAS) {
      session.fromPartition(`persist:${id}`).flushStorageData();
    }
  } catch (e) {
    decirPorSalida(`\n[cc] fallo el volcado de sesion: ${String(e)}\n`);
  }
  decirPorSalida(`\n===CC_CIERRE===\nVolcando sesiones, ${MARGEN_VOLCADO_MS} ms.\n`);
  // El censo se toma ANTES de que el volcado termine y antes de salir: es la
  // unica ventana en la que la sesion todavia esta viva y se puede contar.
  void censoAlCerrar();
  // `app.quit()` y NO `app.exit()`. `exit` mata el proceso de una y saltea el
  // desmontaje ordenado de Chromium, que es justo la parte que termina de
  // escribir las bases a disco: usarlo para "asegurar" el volcado lo impedia.
  // Con `cerrando` ya en true, esta segunda vuelta por `before-quit` sale
  // enseguida y el cierre sigue su curso normal.
  setTimeout(() => app.quit(), MARGEN_VOLCADO_MS);
});

function emitir(etiqueta: string, cuerpo: unknown): void {
  const texto = `\n===${etiqueta}===\n${JSON.stringify(cuerpo, null, 2)}\n===FIN===\n`;
  decirPorSalida(texto);
  if (SALIDA) {
    try {
      appendFileSync(SALIDA, texto, "utf8");
    } catch (e) {
      // Se avisa y se sigue: el informe por stdout ya salió y perderlo por no
      // poder escribir un archivo sería peor que no tener el archivo.
      decirPorSalida(`\n[cc] no pude escribir --cc-salida: ${String(e)}\n`);
    }
  }
}

/**
 * Modo de verificación autónoma (`--cc-test`). Corre la secuencia completa,
 * imprime el informe por stdout y cierra. Existe porque las herramientas de
 * navegador del agente no pueden tocar una ventana de Electron: en vez de
 * delegar la prueba en una persona, la app se vuelve scriptable.
 */
async function modoPrueba(): Promise<void> {
  try {
    if (SOLO && ACTIVOS.length === 0) {
      decirPorSalida(`\n===CC_TEST_ERROR===\n"${SOLO}" no esta en INVESTIGADORES.\n`);
      return;
    }
    emitir(
      "CC_TEST_JSON",
      await correrPruebaFase1({
        sesiones,
        // `esPrueba: true` — el arnés escribe en el MISMO almacén que el
        // camino real, marcado como corrida de prueba, nunca en uno paralelo.
        difundir: (prompt) => difundirConRegistro(prompt, true),
        leer,
        registrarRespuestas: registrarRespuestasDeRondaActual,
      }),
    );
  } catch (e) {
    decirPorSalida(`\n===CC_TEST_ERROR===\n${e instanceof Error ? e.stack : String(e)}\n`);
  } finally {
    app.quit();
  }
}

/**
 * Modo de reconocimiento (`--cc-probe`). Espera a que carguen las páginas y
 * emite el esqueleto estructural de los nodos candidatos, para derivar las
 * specs que faltan sin pedirle a nadie una captura de DevTools.
 */
async function modoSondeo(): Promise<void> {
  try {
    // 20s en vez de 12s: la etiqueta de modelo de Claude carga async DESPUÉS
    // del render inicial (compositor y envío ya estaban listos a los 12s,
    // pero la etiqueta con el nombre del modelo todavía no existía en el DOM).
    await new Promise((r) => setTimeout(r, 20_000));
    emitir("CC_PROBE_JSON", {
      sesiones: await sesiones(),
      modo: SONDEO_ESCRIBE ? "con-texto" : "reposo",
      // Con qué disposición y con qué ventana se tomó la muestra. Sin esto, dos
      // sondeos del mismo proveedor a anchos distintos se leen como si fueran
      // comparables, y no lo son (§7.29).
      disposicion: DISPOSICION,
      // DÓNDE viven las sesiones. Diagnóstico: el 2026-08-02 una apertura desde
      // el lanzador no encontró ningún login, y las particiones `persist:` son
      // las mismas en los dos modos. Si dos aperturas informan rutas distintas,
      // ahí está la causa; si informan la misma, la causa es otra y hay que
      // buscarla en otro lado. Es una ruta de carpeta, no una credencial.
      rutaDatos: app.getPath("userData"),
      redireccionesBloqueadas,
      ventanaPedida: `${VENTANA_W}x${VENTANA_H}`,
      ventanaReal: `${win!.getContentBounds().width}x${win!.getContentBounds().height}`,
      paneles: await sondear(
        todas().map((v) => {
          const spec = (
            PROVIDER_SPECS as Record<
              string,
              {
                composer?: { selector: string };
                submit?: { selector?: string };
                modelLabel?: { selector: string };
              } | undefined
            >
          )[v.id];
          const b = v.view.getBounds();
          return {
            id: v.id,
            panel: `${b.width}x${b.height}`,
            ejecutar: (fuente: string) => v.view.webContents.executeJavaScript(fuente, true),
            // Va SIEMPRE, escriba o no el sondeo: consultar el selector de la
            // spec directo es lo unico que separa "el selector dejo de
            // matchear" de "matchea y el texto se degrado".
            ...(spec?.modelLabel ? { modelLabelSelector: spec.modelLabel.selector } : {}),
            // Sólo se escribe donde hay un selector YA derivado: el de la spec,
            // o el que `--cc-compositor=` pasa para un candidato que todavía no
            // la tiene. Nunca uno adivinado.
            ...(SONDEO_ESCRIBE && (COMPOSITORES_CLI.get(v.id) ?? spec?.composer?.selector)
              ? { composerSelector: (COMPOSITORES_CLI.get(v.id) ?? spec?.composer?.selector) as string }
              : {}),
            // El selector de envío NO se usa para enviar: se usa para CONTAR
            // cuántos nodos hay y cuántos están habilitados antes y después de
            // escribir. Es el efecto del editor que `writePrompt` nunca miró.
            ...(SONDEO_ESCRIBE && spec?.submit?.selector ? { submitSelector: spec.submit.selector } : {}),
          };
        }),
      ),
    });
  } catch (e) {
    decirPorSalida(`\n===CC_PROBE_ERROR===\n${e instanceof Error ? e.stack : String(e)}\n`);
  } finally {
    app.quit();
  }
}

/**
 * Modo de login (`--cc-login`). Abre investigadores y candidatos y NO cierra:
 * es el único paso humano de la fase, porque el agente nunca maneja
 * credenciales. Como las particiones son `persist:`, se hace una sola vez.
 */
function modoLogin(): void {
  decirPorSalida(
    `\n===CC_LOGIN===\nVentana abierta con: ${todas().map((v) => v.id).join(", ")}.\n` +
      `Iniciar sesion en cada panel y cerrar la ventana. Las particiones son persistentes:\n` +
      `no hay que repetirlo en las corridas siguientes.\n`,
  );
}

/**
 * Modo de historial (`--cc-historial=<id>`). Vuelca por stdout, como JSON, el
 * registro completo de una conversación — leído con `leerRegistro` del
 * paquete de dominio, la misma función que valida el archivo en cualquier
 * otro lugar que lo lea. Las líneas ilegibles se REPORTAN dentro del volcado,
 * nunca se saltean en silencio: son parte de la respuesta, no un detalle de
 * implementación que se traga.
 */
function modoHistorial(): void {
  try {
    emitir("CC_HISTORIAL_JSON", leerRegistroDeArchivo(app.getPath("userData"), HISTORIAL_ID));
  } catch (e) {
    decirPorSalida(`\n===CC_HISTORIAL_ERROR===\n${e instanceof Error ? e.stack : String(e)}\n`);
  } finally {
    app.quit();
  }
}

/**
 * Servidor HTTP efímero en loopback, sólo para el banco de pruebas de
 * `localStorage`. `about:blank` tiene origen opaco y Chromium deshabilita
 * `localStorage` ahí ("Storage is disabled", medido) — hace falta un origen
 * real para que la API exista. `https://localhost/` sin servidor detrás falla
 * la navegación y deja el documento en blanco de antes, con el mismo problema.
 * Un servidor propio en `127.0.0.1` da un origen real sin salir a la red ni
 * depender de que haya algo escuchando en el puerto 443.
 */
// Puerto FIJO, a propósito: `localStorage` está particionado por origen, y
// `escribir` y `leer` son dos procesos distintos. Con puerto 0 (aleatorio)
// cada corrida cae en un origen `http://127.0.0.1:<puerto>` diferente y la
// clave nunca coincide entre escritura y lectura — medido, daba
// `sobrevivioLs: false` en las cuatro particiones con la cookie sí viva.
const PUERTO_LS = 47_365;
let servidorPruebaLs: Server | null = null;
async function servidorLs(): Promise<string> {
  if (!servidorPruebaLs) {
    servidorPruebaLs = createServer((_req, res) => res.end("<!doctype html><title>cc</title>"));
    await new Promise<void>((resolve) => servidorPruebaLs!.listen(PUERTO_LS, "127.0.0.1", resolve));
  }
  return `http://127.0.0.1:${PUERTO_LS}/`;
}

/**
 * Ejecuta `fuente` en una `WebContentsView` oculta —nunca agregada a ninguna
 * ventana— cargada sobre la partición dada, y la destruye al terminar. Sirve
 * para tocar `localStorage`, que sólo existe con un documento cargado —no hay
 * API de Electron para leerlo sin una página—, sin abrir ningún proveedor
 * real: la página es un placeholder en blanco servido por loopback, nadie ve
 * nada y no hay clic ni tecla sobre un compositor.
 *
 * `webContents.create()` existía para esto pero ya no es API pública en esta
 * versión de Electron (33); `WebContentsView` sin agregar a una ventana es el
 * reemplazo soportado y es la misma clase que ya usa el resto del archivo.
 */
async function enPaginaEnBlanco<T>(particion: string, fuente: string): Promise<T> {
  const sesion = session.fromPartition(particion);
  const view = new WebContentsView({ webPreferences: { session: sesion } });
  try {
    await view.webContents.loadURL(await servidorLs());
    return (await view.webContents.executeJavaScript(fuente, true)) as T;
  } finally {
    try { view.webContents.close(); } catch (e) { /* ya destruido */ }
  }
}

/**
 * Banco de pruebas de persistencia. No abre ninguna página ni toca cuentas:
 * escribe o lee una cookie propia y una clave de `localStorage` en cada
 * partición, y sale por el camino de cierre normal, que es exactamente el
 * camino bajo prueba.
 *
 * La cookie sola no alcanza: un login real también escribe `localStorage` e
 * `IndexedDB`, que tardan más en volcarse a disco y son los que se venían
 * corrompiendo. `localStorage` se prueba acá con `about:blank`; la cookie
 * cubre además el volcado de la base de sesión de red.
 */
/**
 * PARTICIONES SINTÉTICAS para el banco de pruebas.
 *
 * El banco escribía y leía sobre `persist:chatgpt`, `persist:claude` y las
 * otras dos: **las particiones reales de Juan**. Cada corrida abría, escribía
 * y cerraba sobre las cuentas de verdad, y el propio BLUEPRINT ya tenía
 * registrado (§7.48) que abrir y cerrar en sucesión rápida sobre la misma
 * partición corrompe la base de sesión. O sea: el instrumento hecho para no
 * tocar las cuentas las estaba tocando en cada corrida, y una tanda de
 * medición del 2026-08-09 terminó con los cuatro proveedores deslogueados.
 *
 * Desde acá el banco NUNCA toca una partición real. Prueba el mecanismo, y el
 * mecanismo es el mismo: `persist:` es `persist:`.
 */
const PARTICIONES_DE_PRUEBA = ["pruebas-a", "pruebas-b", "pruebas-c", "pruebas-d"] as const;

async function modoSesion(): Promise<void> {
  const URL_PRUEBA = "https://localhost/";
  const NOMBRE = "cc_persistencia";
  // El literal va INLINE en cada uso, no por constante: el gate evalúa la
  // excepción línea por línea, así que la línea que toca `localStorage` tiene
  // que llevar el marcador encima. Es a propósito: obliga a que cada acceso
  // quede marcado y auditable de un vistazo.
  const CLAVE_LS = "cc_persistencia_ls";
  try {
    if (SESION![1] === "escribir") {
      const sello = String(Date.now());
      for (const id of PARTICIONES_DE_PRUEBA) {
        await session.fromPartition(`persist:${id}`).cookies.set({
          url: URL_PRUEBA,
          name: NOMBRE,
          value: sello,
          expirationDate: Math.floor(Date.now() / 1000) + 31536000,
        });
        await enPaginaEnBlanco(`persist:${id}`, `localStorage.setItem("cc_persistencia_ls", ${JSON.stringify(sello)})`);
      }
      emitir("CC_SESION_JSON", { accion: "escribir", sello, rutaDatos: app.getPath("userData") });
    } else {
      const leidas = [];
      for (const id of PARTICIONES_DE_PRUEBA) {
        const s2 = session.fromPartition(`persist:${id}`);
        const cs = await s2.cookies.get({ url: URL_PRUEBA, name: NOMBRE });
        const selloLs = await enPaginaEnBlanco<string | null>(
          `persist:${id}`,
          `localStorage.getItem("cc_persistencia_ls")`,
        );
        leidas.push({
          id,
          sobrevivio: cs.length > 0,
          sello: cs[0]?.value ?? null,
          cookiesTotales: (await s2.cookies.get({})).length,
          sobrevivioLs: selloLs !== null,
          selloLs,
        });
      }
      emitir("CC_SESION_JSON", { accion: "leer", rutaDatos: app.getPath("userData"), particiones: leidas });
    }
  } catch (e) {
    decirPorSalida(`\n===CC_SESION_ERROR===\n${e instanceof Error ? e.stack : String(e)}\n`);
  } finally {
    servidorPruebaLs?.close();
    app.quit();
  }
}

void app.whenReady().then(() => {
  registrarIpc();
  // `sesion` no abre ninguna página de proveedor —ni falta le hace: sólo
  // toca cookies y `localStorage` propios— así que se salta `createWindow()`
  // y con eso la carga por red de las cuatro páginas reales, que no aporta
  // nada a esta prueba y sólo agrega tiempo y una fuente más de fallos.
  if (MODO !== "sesion" && MODO !== "historial") createWindow();
  if (MODO === "test") void modoPrueba();
  if (MODO === "probe") void modoSondeo();
  if (MODO === "login") modoLogin();
  if (MODO === "sesion") void modoSesion();
  if (MODO === "historial") modoHistorial();
  app.on("activate", () => {
    if (BaseWindow.getAllWindows().length === 0) createWindow();
  });
});

// La X de la ventana. `app.quit()` pasa por `before-quit`, así que este
// camino también vuelca la sesión antes de salir — que es exactamente el que
// se usa para hacer login.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
