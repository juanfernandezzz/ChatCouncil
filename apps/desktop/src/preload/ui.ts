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
  /** Desplaza la fila un PANEL ENTERO (paginado). Nunca navega. */
  desplazar: (direccion: 1 | -1): Promise<Posicion> => ipcRenderer.invoke("cc:desplazar", direccion),
  /** Desplaza a una posición ABSOLUTA en píxeles (barra de scroll fina). */
  desplazarA: (x: number): Promise<Posicion> => ipcRenderer.invoke("cc:desplazarA", x),
  /** Estado actual de desplazamiento, para dibujar la barra sin moverse primero. */
  posicion: (): Promise<Posicion> => ipcRenderer.invoke("cc:posicion"),
  /**
   * T5 — "Consolidar respuestas". Arma los 8 cuerpos, anonimiza, baraja,
   * persiste el sello, y los escribe SECUENCIAL Y AL FRENTE en su panel —
   * sin enviar nada. Puede tardar minutos (medido: ~150s para los 8); el
   * renderer sondea `consolidarEstado` mientras tanto.
   */
  consolidar: (): Promise<ResultadoConsolidar> => ipcRenderer.invoke("cc:consolidar"),
  /** Progreso de la consolidación en curso — sondeo, no evento empujado. */
  consolidarEstado: (): Promise<EstadoConsolidacion> => ipcRenderer.invoke("cc:consolidar-estado"),
});

interface ResultadoConsolidarPanel {
  operadorId: string;
  ok: boolean;
  error?: string;
  estadoIntegridad: string;
  marcasEsperadas: number;
  marcasPresentes: number;
  interrumpido: boolean;
}
interface ResultadoConsolidar {
  ok: boolean;
  error?: string;
  paneles: ResultadoConsolidarPanel[];
  navegacionesIntactas: boolean;
}
interface EstadoConsolidacion {
  enCurso: boolean;
  indice: number;
  total: number;
  operadorId: string | null;
}

interface Posicion {
  scrollX: number;
  anchoTotal: number;
  ventanaAncho: number;
}
