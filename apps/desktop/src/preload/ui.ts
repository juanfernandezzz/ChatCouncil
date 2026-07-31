/**
 * preload/ui.ts — puente mínimo entre la interfaz propia y el proceso principal.
 * Con `contextIsolation` y `sandbox` activos, el renderer no habla IPC directo:
 * se le expone una superficie chica y explícita.
 */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("cc", {
  send: (prompt: string): Promise<unknown> => ipcRenderer.invoke("cc:send", prompt),
  read: (): Promise<unknown> => ipcRenderer.invoke("cc:read"),
  sessionInfo: (): Promise<{ partition: string; cookieCount: number }> =>
    ipcRenderer.invoke("cc:session-info"),
});
