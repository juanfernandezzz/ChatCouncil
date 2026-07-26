/**
 * provider-windows.ts — orquestación de las ventanas de proveedor
 * ---------------------------------------------------------------
 * Fase 11, Round A p2b (§0.24). Abre y cierra una ventana por proveedor
 * para el transporte `"page"`.
 *
 * POR QUÉ VENTANAS Y NO PESTAÑAS (decisión forzada, §0.23 + §0.24): el
 * ejecutor vive dentro de la página del proveedor y necesita que esa
 * página NO esté oculta. En una sola ventana sólo una pestaña es visible
 * por vez, así que seis proveedores en pestañas dejarían cinco ocultos y
 * en el régimen degradado — que §0.23 declaró NO DETERMINISTA tras medir
 * el mismo experimento con resultados opuestos (§0.20 vs §0.22). La única
 * disposición en la que los seis están simultáneamente visibles es una
 * ventana chica por proveedor.
 *
 * POR QUÉ `focused: false` ES SEGURO: medido en la máquina de Juan
 * (§0.24) — 45 segundos sostenidos con `visibilityState: "visible"` y
 * `document.hasFocus() === false`, con la cadencia de muestreo intacta en
 * 3 s exactos. Visible sin foco no sufre ni pausa ni estrangulamiento, así
 * que la persona puede trabajar en la SPA con el foco puesto ahí mientras
 * los proveedores generan.
 *
 * LÍMITES: este módulo NO sabe nada de ningún proveedor — recibe orígenes
 * y devuelve identificadores (Q1, runner agnóstico). No lee cookies, no
 * toca sesiones, no inyecta nada: sólo administra ventanas.
 */

/** Marcador para el gate de artefacto (ASCII, §0.19). */
export const PROVIDER_WINDOWS_MARKER = "provider-windows-v1";

export interface ProviderWindowRef {
  providerId: string;
  windowId: number;
  tabId: number;
}

export interface TileGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Reparte `count` ventanas en una grilla dentro del área disponible.
 *
 * Las ventanas pueden ser CHICAS: al ejecutor no le importa el tamaño,
 * sólo que la superficie no esté oculta. Se prefiere una grilla lo más
 * cuadrada posible para que ninguna quede degenerada.
 */
export function tileGeometries(
  count: number,
  area: { left: number; top: number; width: number; height: number },
): TileGeometry[] {
  if (count <= 0) return [];
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const w = Math.floor(area.width / cols);
  const h = Math.floor(area.height / rows);
  const out: TileGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    out.push({ left: area.left + c * w, top: area.top + r * h, width: w, height: h });
  }
  return out;
}

const open = new Map<string, ProviderWindowRef>();

/**
 * Abre la ventana de un proveedor. Idempotente: si ya hay una abierta
 * para ese proveedor, la reutiliza en vez de acumular ventanas huérfanas.
 */
export async function openProviderWindow(
  providerId: string,
  url: string,
  geometry: TileGeometry,
): Promise<ProviderWindowRef> {
  const existing = open.get(providerId);
  if (existing) {
    try {
      await browser.windows.get(existing.windowId);
      return existing;
    } catch {
      open.delete(providerId);
    }
  }

  const win = await browser.windows.create({
    url,
    type: "popup",
    // Clave: visible pero SIN robar el foco. Ver la cabecera.
    focused: false,
    left: geometry.left,
    top: geometry.top,
    width: geometry.width,
    height: geometry.height,
  });

  // El tipo de `windows.create` admite undefined: la ventana puede no
  // crearse (politica del navegador, perfil cerrado). Se falla explicito.
  const tab = win?.tabs?.[0];
  if (win?.id === undefined || tab?.id === undefined) {
    throw new Error(`no se pudo abrir la ventana del proveedor ${providerId}`);
  }
  const ref: ProviderWindowRef = { providerId, windowId: win.id, tabId: tab.id };
  open.set(providerId, ref);
  return ref;
}

/** Cierra la ventana de un proveedor. No falla si ya no existe. */
export async function closeProviderWindow(providerId: string): Promise<void> {
  const ref = open.get(providerId);
  if (!ref) return;
  open.delete(providerId);
  try {
    await browser.windows.remove(ref.windowId);
  } catch {
    // ya la cerró la persona: no es un error
  }
}

export function listProviderWindows(): ProviderWindowRef[] {
  return [...open.values()];
}

/** Olvida una ventana que la persona cerró a mano. */
export function forgetProviderWindow(windowId: number): void {
  for (const [id, ref] of open) {
    if (ref.windowId === windowId) open.delete(id);
  }
}
