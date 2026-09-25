/**
 * preload/ui.ts — puente mínimo entre la interfaz propia y el proceso principal.
 * Con `contextIsolation` y `sandbox` activos, el renderer no habla IPC directo:
 * se le expone una superficie chica y explícita.
 */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("cc", {
  investigadores: (): Promise<string[]> => ipcRenderer.invoke("cc:investigadores"),
  /** Cambio 6 — cuál de los `investigadores()` es el integrador (deepseek): no investiga, sólo informa. */
  integrador: (): Promise<string> => ipcRenderer.invoke("cc:integrador"),
  /**
   * Rediseño de la barra (2026-09-19, decisión de Juan): siete botones, el
   * pegado deja de ser automático — el instrumento ofrece el botón, Juan
   * decide cuándo y dónde. "Pegar pregunta en todos" escribe en los ocho del
   * pool (nunca deepseek) y registra la pregunta de la ronda. Nunca envía.
   */
  pegarPreguntaEnTodos: (prompt: string): Promise<unknown[]> => ipcRenderer.invoke("cc:pegar-pregunta-en-todos", prompt),
  /** Lo mismo, pero SÓLO en el panel al frente. Si es deepseek, no hace nada y avisa. Nunca envía, no registra ronda. */
  pegarPreguntaAqui: (prompt: string): Promise<ResultadoEnvioUno> => ipcRenderer.invoke("cc:pegar-pregunta-aqui", prompt),
  /** Lecturas de los nueve + el aviso de prompts (vacío fuera de la etapa de investigación). */
  capturarTodos: (): Promise<{ lecturas: unknown[]; aviso: string }> => ipcRenderer.invoke("cc:capturar-todos"),
  /** Captura SÓLO el panel al frente, con el tipo de captura que corresponda a la etapa de la ronda. */
  capturarUno: (): Promise<ResultadoCapturarUno> => ipcRenderer.invoke("cc:capturar-uno"),
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
   * T5, renombrado en el rediseño de la barra — "Pegar operación en todos".
   * Arma los 8 cuerpos, anonimiza, baraja, persiste el sello, y los escribe
   * SECUENCIAL Y AL FRENTE en su panel — sin enviar nada. Puede tardar
   * minutos (medido: ~150s para los 8); el renderer sondea
   * `pegarOperacionEstado` mientras tanto.
   */
  pegarOperacionEnTodos: (): Promise<ResultadoConsolidar> => ipcRenderer.invoke("cc:pegar-operacion-en-todos"),
  /** Progreso de "Pegar operación en todos" en curso — sondeo, no evento empujado. */
  pegarOperacionEstado: (): Promise<EstadoConsolidacion> => ipcRenderer.invoke("cc:pegar-operacion-estado"),
  /**
   * Cambio 4, renombrado — "Pegar operación aquí": mismo prompt de
   * operación, pero sólo para el panel al frente. Misma ronda, misma
   * semilla — no vuelve a barajar.
   */
  pegarOperacionAqui: (): Promise<ResultadoConsolidarUno> => ipcRenderer.invoke("cc:pegar-operacion-aqui"),
  /**
   * Rediseño de la barra — "Pegar integrador": arma la tabla de hallazgos y
   * el prompt del integrador, y lo escribe en deepseek (lo trae al frente si
   * no es el panel visible). Antes sólo alcanzable por `--cc-integrador=<id>`.
   */
  pegarIntegrador: (): Promise<ResultadoIntegrador> => ipcRenderer.invoke("cc:pegar-integrador"),
  /** Objetivo E — arma el informe final de la ronda activa y lo guarda en `informes/`. */
  armarInformeFinal: (): Promise<{ ok: boolean; mensaje: string; ruta?: string }> => ipcRenderer.invoke("cc:armar-informe-final"),
  /** Objetivo 3 — ventana de progreso de "Pegar operación en todos": estado actual y actualizaciones. */
  progresoEstado: (): Promise<unknown> => ipcRenderer.invoke("cc:progreso-estado"),
  alProgreso: (fn: (estado: unknown) => void): void => {
    ipcRenderer.on("cc:progreso", (_e, estado: unknown) => fn(estado));
  },
  /** Objetivo D — el menú "Ventana" pide acá que se corra la acción de un solo panel. */
  alMenu: (fn: (accion: string) => void): void => {
    ipcRenderer.on("cc:menu", (_e, accion: string) => fn(accion));
  },
  /** Ventana "Proveedores al iniciar": lee/guarda el archivo aparte de selección. Se aplica al reiniciar. */
  seleccionLeer: (): Promise<{ conocidos: string[]; marcados: string[]; integrador: string }> =>
    ipcRenderer.invoke("cc:seleccion-leer"),
  seleccionGuardar: (marcados: string[], integrador: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke("cc:seleccion-guardar", marcados, integrador),
});

interface ResultadoConsolidarPanel {
  operadorId: string;
  ok: boolean;
  error?: string;
  estadoIntegridad: string;
  marcasEsperadas: number;
  marcasPresentes: number;
  promptCompleto: boolean;
  faltantesPrompt: string[];
  interrumpido: boolean;
  chatNuevoOk: boolean;
}
interface ResultadoConsolidar {
  ok: boolean;
  error?: string;
  paneles: ResultadoConsolidarPanel[];
  navegacionesIntactas: boolean;
  etapa?: string;
}
interface ResultadoConsolidarUno {
  ok: boolean;
  error?: string;
  panel?: ResultadoConsolidarPanel;
  etapa?: string;
}
interface EstadoConsolidacion {
  enCurso: boolean;
  indice: number;
  total: number;
  operadorId: string | null;
}
interface ResultadoEnvioUno {
  id: string;
  ok?: boolean;
  error?: string;
  modelLabel?: string | null;
}
interface ResultadoCapturarUno {
  ok: boolean;
  error?: string;
  lectura?: { id: string; text: string; error?: string; generating: boolean | null };
}
interface ResultadoIntegrador {
  ok: boolean;
  error?: string;
  operadorId?: string;
  caracteresEscritos: number;
  caracteresPresentes: number;
  entregaExacta: boolean;
  navegacionesIntactas: boolean;
  etapa?: string;
}

interface Posicion {
  scrollX: number;
  anchoTotal: number;
  ventanaAncho: number;
}
