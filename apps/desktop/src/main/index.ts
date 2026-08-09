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

import { app, BaseWindow, WebContentsView, ipcMain, session } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { appendFileSync } from "node:fs";

import { PROVIDER_SPECS } from "@chatcouncil/providers";

import { correrPruebaFase1, type LecturaProveedor, type ResultadoEnvio } from "./test-runner";
import { sondear } from "./probe";

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
const CANDIDATOS_SONDEO: { id: string; url: string }[] = [];

/**
 * Modo de arranque. Se lee de `process.argv` Y de `process.env`, y el
 * argumento es el camino principal a propósito: `CC_TEST=1 electron ...` es
 * sintaxis de shell POSIX y **no funciona en el `cmd.exe` de Windows**, que
 * es donde corre esto. Un script de npm con esa forma falla antes de arrancar
 * la app, con un error que no se parece en nada a la causa.
 */
const ARGV = process.argv.slice(1);
type Modo = "normal" | "test" | "probe" | "login";
const MODO: Modo = ARGV.includes("--cc-test") || process.env["CC_TEST"] === "1"
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
const SOLO = (ARGV.find((a) => a.startsWith("--cc-solo=")) ?? "").split("=")[1] ?? "";
const ACTIVOS: readonly ProviderId[] = SOLO
  ? INVESTIGADORES.filter((id) => id === SOLO)
  : INVESTIGADORES;

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
  void view.webContents.loadURL(url);
  return view;
}

function createWindow(): void {
  win = new BaseWindow({ width: VENTANA_W, height: VENTANA_H, title: "ChatCouncil" });
  // El pedido es sobre el CONTENIDO. `setContentSize` descuenta el marco; la
  // pantalla puede recortar igual, y por eso el sondeo informa el real.
  win.setContentSize(VENTANA_W, VENTANA_H);

  uiView = new WebContentsView({
    webPreferences: { preload: join(__dirname, "../preload/ui.cjs"), sandbox: true },
  });
  win.contentView.addChildView(uiView);
  void uiView.webContents.loadFile(join(__dirname, "../renderer/index.html"));

  for (const id of ACTIVOS) {
    const view = crearVista(id, PROVIDER_SPECS[id].newConversationUrl);
    vistas.push({ id, view });
    win.contentView.addChildView(view);
  }

  if (CON_CANDIDATOS) {
    for (const c of CANDIDATOS_SONDEO) {
      const view = crearVista(c.id, c.url);
      sondeos.push({ id: c.id, view });
      win.contentView.addChildView(view);
    }
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

async function sesiones(): Promise<{ id: string; cookies: number }[]> {
  return Promise.all(
    todas().map(async (v) => ({
      id: v.id,
      cookies: (await session.fromPartition(`persist:${v.id}`).cookies.get({})).length,
    })),
  );
}

function registrarIpc(): void {
  ipcMain.handle("cc:investigadores", () => ACTIVOS.slice());

  /**
   * DIFUSIÓN. Se lanzan todas en paralelo y se espera a todas, pero con
   * `allSettled`: **el fallo de un proveedor no puede tumbar la ronda**. El
   * que falla se reporta como fallo y los demás siguen. Nunca se simula un
   * resultado que no ocurrió.
   */
  ipcMain.handle("cc:difundir", async (_e, prompt: string) => difundir(prompt));

  ipcMain.handle("cc:leer", async () => leer());

  ipcMain.handle("cc:sesiones", async () => sesiones());
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

function emitir(etiqueta: string, cuerpo: unknown): void {
  const texto = `\n===${etiqueta}===\n${JSON.stringify(cuerpo, null, 2)}\n===FIN===\n`;
  process.stdout.write(texto);
  if (SALIDA) {
    try {
      appendFileSync(SALIDA, texto, "utf8");
    } catch (e) {
      // Se avisa y se sigue: el informe por stdout ya salió y perderlo por no
      // poder escribir un archivo sería peor que no tener el archivo.
      process.stdout.write(`\n[cc] no pude escribir --cc-salida: ${String(e)}\n`);
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
      process.stdout.write(`\n===CC_TEST_ERROR===\n"${SOLO}" no esta en INVESTIGADORES.\n`);
      return;
    }
    emitir("CC_TEST_JSON", await correrPruebaFase1({ sesiones, difundir, leer }));
  } catch (e) {
    process.stdout.write(`\n===CC_TEST_ERROR===\n${e instanceof Error ? e.stack : String(e)}\n`);
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
      ventanaPedida: `${VENTANA_W}x${VENTANA_H}`,
      ventanaReal: `${win!.getContentBounds().width}x${win!.getContentBounds().height}`,
      paneles: await sondear(
        todas().map((v) => {
          const spec = (
            PROVIDER_SPECS as Record<
              string,
              { composer?: { selector: string }; submit?: { selector?: string } } | undefined
            >
          )[v.id];
          const b = v.view.getBounds();
          return {
            id: v.id,
            panel: `${b.width}x${b.height}`,
            ejecutar: (fuente: string) => v.view.webContents.executeJavaScript(fuente, true),
            // Sólo se escribe donde hay un selector YA derivado. Un candidato
            // sin spec no se toca: no hay dónde escribir sin adivinar.
            ...(SONDEO_ESCRIBE && spec?.composer ? { composerSelector: spec.composer.selector } : {}),
            // El selector de envío NO se usa para enviar: se usa para CONTAR
            // cuántos nodos hay y cuántos están habilitados antes y después de
            // escribir. Es el efecto del editor que `writePrompt` nunca miró.
            ...(SONDEO_ESCRIBE && spec?.submit?.selector ? { submitSelector: spec.submit.selector } : {}),
          };
        }),
      ),
    });
  } catch (e) {
    process.stdout.write(`\n===CC_PROBE_ERROR===\n${e instanceof Error ? e.stack : String(e)}\n`);
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
  process.stdout.write(
    `\n===CC_LOGIN===\nVentana abierta con: ${todas().map((v) => v.id).join(", ")}.\n` +
      `Iniciar sesion en cada panel y cerrar la ventana. Las particiones son persistentes:\n` +
      `no hay que repetirlo en las corridas siguientes.\n`,
  );
}

void app.whenReady().then(() => {
  registrarIpc();
  createWindow();
  if (MODO === "test") void modoPrueba();
  if (MODO === "probe") void modoSondeo();
  if (MODO === "login") modoLogin();
  app.on("activate", () => {
    if (BaseWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
