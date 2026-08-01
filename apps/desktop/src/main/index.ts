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

/** Los candidatos sólo se abren cuando se los va a reconocer o loguear. */
const CON_CANDIDATOS = MODO === "probe" || MODO === "login";

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
 * Grilla lo más cuadrada posible. Con 2 proveedores da dos columnas; con 4,
 * dos por dos. La disposición se DERIVA de la cantidad, así que sumar un
 * investigador no obliga a tocar el layout.
 */
function layout(): void {
  if (!win || !uiView) return;
  const { width, height } = win.getContentBounds();
  uiView.setBounds({ x: 0, y: 0, width, height: UI_HEIGHT });

  const abiertas = todas();
  const n = abiertas.length;
  if (n === 0) return;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const w = Math.floor(width / cols);
  const h = Math.floor(Math.max(0, height - UI_HEIGHT) / rows);

  abiertas.forEach((v, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    v.view.setBounds({ x: c * w, y: UI_HEIGHT + r * h, width: w, height: h });
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
  win = new BaseWindow({ width: 1600, height: 1000, title: "ChatCouncil" });

  uiView = new WebContentsView({
    webPreferences: { preload: join(__dirname, "../preload/ui.cjs"), sandbox: true },
  });
  win.contentView.addChildView(uiView);
  void uiView.webContents.loadFile(join(__dirname, "../renderer/index.html"));

  for (const id of INVESTIGADORES) {
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
  ipcMain.handle("cc:investigadores", () => INVESTIGADORES.slice());

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

function emitir(etiqueta: string, cuerpo: unknown): void {
  process.stdout.write(`\n===${etiqueta}===\n${JSON.stringify(cuerpo, null, 2)}\n===FIN===\n`);
}

/**
 * Modo de verificación autónoma (`--cc-test`). Corre la secuencia completa,
 * imprime el informe por stdout y cierra. Existe porque las herramientas de
 * navegador del agente no pueden tocar una ventana de Electron: en vez de
 * delegar la prueba en una persona, la app se vuelve scriptable.
 */
async function modoPrueba(): Promise<void> {
  try {
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
      paneles: await sondear(
        todas().map((v) => ({
          id: v.id,
          ejecutar: (fuente: string) => v.view.webContents.executeJavaScript(fuente, true),
        })),
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
