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
});
