/**
 * preload/ui.ts — puente mínimo entre la interfaz propia y el proceso principal.
 * Con `contextIsolation` y `sandbox` activos, el renderer no habla IPC directo:
 * se le expone una superficie chica y explícita.
 */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("cc", {
  investigadores: (): Promise<string[]> => ipcRenderer.invoke("cc:investigadores"),
  difundir: (prompt: string): Promise<unknown[]> => ipcRenderer.invoke("cc:difundir", prompt),
  leer: (): Promise<unknown[]> => ipcRenderer.invoke("cc:leer"),
  sesiones: (): Promise<{ id: string; cookies: number }[]> => ipcRenderer.invoke("cc:sesiones"),
  /**
   * Sondeo de SÓLO LECTURA sobre las vistas que ya están abiertas. No navega
   * y no escribe en ningún compositor: la garantía es estructural y vive en
   * `sondeoVivo()` del proceso principal, no acá.
   */
  sondear: (): Promise<{ ok: boolean; ruta: string | null; paneles: number; error?: string }> =>
    ipcRenderer.invoke("cc:sondear"),
});
