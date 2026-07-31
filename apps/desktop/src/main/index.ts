/**
 * main/index.ts — proceso principal, Fase 0
 * ------------------------------------------
 * Verifica TRES cosas y sólo tres (BLUEPRINT v3, Fase 0):
 *   1. La sesión del proveedor persiste entre reinicios de la app.
 *   2. Se puede inyectar el prompt en la vista embebida.
 *   3. Se puede leer la respuesta.
 *
 * Nada más. Si alguna falla, se sabe con un día de trabajo y no con tres
 * semanas — que es exactamente lo que costó no hacer esto en la v2.
 */

import { app, BaseWindow, WebContentsView, ipcMain, session } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { PROVIDER_SPECS } from "@chatcouncil/providers";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Único proveedor de la Fase 0. */
const PROVIDER_ID = "glm" as const;

/**
 * ESTO ES LA PRUEBA 1. El prefijo `persist:` es lo que hace que las cookies
 * sobrevivan al cierre de la app: sin él, la partición es en memoria y hay
 * que loguearse en cada arranque.
 *
 * Además, una partición POR PROVEEDOR resuelve algo que en un perfil de
 * navegador era imposible: convivir cuentas distintas por proveedor (la
 * burner en uno, las pagas en otros) sin que se pisen.
 */
const PARTITION = `persist:${PROVIDER_ID}`;

/** Alto de la franja de la interfaz propia; el resto es la vista del proveedor. */
const UI_HEIGHT = 220;

let providerView: WebContentsView | null = null;

function layout(win: BaseWindow, uiView: WebContentsView, provView: WebContentsView): void {
  const { width, height } = win.getContentBounds();
  uiView.setBounds({ x: 0, y: 0, width, height: UI_HEIGHT });
  provView.setBounds({ x: 0, y: UI_HEIGHT, width, height: Math.max(0, height - UI_HEIGHT) });
}

function createWindow(): void {
  const win = new BaseWindow({ width: 1400, height: 950, title: "ChatCouncil — Fase 0" });

  // --- interfaz propia -----------------------------------------------------
  const uiView = new WebContentsView({
    webPreferences: { preload: join(__dirname, "../preload/ui.cjs"), sandbox: true },
  });
  win.contentView.addChildView(uiView);
  void uiView.webContents.loadFile(join(__dirname, "../renderer/index.html"));

  // --- vista del proveedor -------------------------------------------------
  // NO es un iframe: es un contexto de navegación con su propio documento de
  // nivel superior. Por eso las cookies se calculan contra el proveedor y la
  // sesión funciona — lo que la medición del 2026-07-29 demostró imposible
  // dentro de una webapp.
  const provSession = session.fromPartition(PARTITION);
  providerView = new WebContentsView({
    webPreferences: {
      session: provSession,
      preload: join(__dirname, "../preload/provider.cjs"),
      sandbox: true,
      contextIsolation: true,
    },
  });
  win.contentView.addChildView(providerView);
  void providerView.webContents.loadURL(PROVIDER_SPECS[PROVIDER_ID].newConversationUrl);

  layout(win, uiView, providerView);
  win.on("resize", () => {
    layout(win, uiView, providerView!);
  });

  // --- puente interfaz ↔ proveedor -----------------------------------------
  ipcMain.handle("cc:spec", () => PROVIDER_SPECS[PROVIDER_ID]);

  ipcMain.handle("cc:send", async (_e, prompt: string) => {
    if (!providerView) throw new Error("la vista del proveedor no está lista");
    // El preload del proveedor expone la operación; acá sólo se la invoca.
    const spec = JSON.stringify(PROVIDER_SPECS[PROVIDER_ID]);
    return providerView.webContents.executeJavaScript(
      `window.__ccProvider.run(${spec}, ${JSON.stringify(prompt)})`,
      true,
    );
  });

  ipcMain.handle("cc:read", async () => {
    if (!providerView) throw new Error("la vista del proveedor no está lista");
    const spec = JSON.stringify(PROVIDER_SPECS[PROVIDER_ID]);
    return providerView.webContents.executeJavaScript(`window.__ccProvider.read(${spec})`, true);
  });

  /** PRUEBA 1, medida y no supuesta: cuántas cookies tiene la partición. */
  ipcMain.handle("cc:session-info", async () => {
    const cookies = await provSession.cookies.get({});
    return { partition: PARTITION, cookieCount: cookies.length };
  });
}

void app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BaseWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
