/**
 * renderer/main.ts — el compositor del consejo.
 *
 * ChatCouncil NO muestra las respuestas: las interfaces de los proveedores
 * SON los paneles y están abajo, con sus capacidades nativas a mano. Acá
 * viven el compositor único, el estado por proveedor y —más adelante— la
 * salida del análisis. Espejar el texto no aportaría ninguna capacidad
 * nativa y traería toda la fragilidad que costó la v2.
 */

interface Resultado {
  id: string;
  ok?: boolean;
  error?: string;
  modelLabel?: string | null;
}
interface Lectura {
  id: string;
  text: string;
  /** `true` generando, `false` terminado, **`null` no observable**. */
  generating: boolean | null;
  completionKind?: "element-gone" | "quiescence";
  error?: string;
}

/**
 * Un fin de respuesta INFERIDO no se muestra igual que uno observado. Decir
 * "listo" cuando en realidad es "dejo de crecer" le da al panel una certeza
 * que nadie midio.
 */
function estadoLectura(l: Lectura): string {
  if (l.generating === true) return " (generando)";
  if (l.generating === null) return " (fin inferido)";
  return "";
}
interface Sondeo {
  ok: boolean;
  ruta: string | null;
  paneles: number;
  error?: string;
}
interface Posicion {
  scrollX: number;
  anchoTotal: number;
  ventanaAncho: number;
}
interface CcBridge {
  investigadores: () => Promise<string[]>;
  difundir: (prompt: string) => Promise<Resultado[]>;
  leer: () => Promise<Lectura[]>;
  sesiones: () => Promise<{ id: string; cookies: number }[]>;
  sondear: () => Promise<Sondeo>;
  desplazar: (direccion: 1 | -1) => Promise<Posicion>;
  desplazarA: (x: number) => Promise<Posicion>;
  posicion: () => Promise<Posicion>;
}
declare global {
  interface Window {
    cc: CcBridge;
  }
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const estado = $("estado");
const paneles = $("paneles");
const dialogo = $<HTMLDialogElement>("confirmacion");

/**
 * Estado por panel, DERIVADO de la lista de investigadores que da el proceso
 * principal. No hay una lista paralela acá: pedirla es la única forma de que
 * sumar un investigador no obligue a tocar dos lugares (BLUEPRINT §7.2).
 */
const estadoPanel = new Map<string, { texto: string; clase: "" | "ok" | "mal" }>();

function pintarPaneles(): void {
  paneles.textContent = "";
  for (const [id, e] of estadoPanel) {
    const chip = document.createElement("span");
    chip.className = `chip ${e.clase}`.trim();
    chip.textContent = `${id} · ${e.texto}`;
    paneles.appendChild(chip);
  }
}

function marcar(id: string, texto: string, clase: "" | "ok" | "mal" = ""): void {
  estadoPanel.set(id, { texto, clase });
}

void window.cc.investigadores().then((ids) => {
  for (const id of ids) marcar(id, "en espera");
  pintarPaneles();
});

/** Vive sólo mientras la app está abierta: se vuelve a preguntar al reiniciar. */
let noPreguntarMas = false;

function decir(texto: string, clase?: "ok" | "mal"): void {
  estado.textContent = texto;
  estado.className = clase ?? "";
}

async function difundir(prompt: string): Promise<void> {
  decir("Enviando al consejo…");
  const rs = await window.cc.difundir(prompt);
  const bien = rs.filter((r) => r.ok);
  const mal = rs.filter((r) => !r.ok);
  for (const r of rs) {
    if (r.ok) marcar(r.id, `enviado${r.modelLabel ? ` · ${r.modelLabel}` : ""}`, "ok");
    else marcar(r.id, r.error ?? "falló", "mal");
  }
  pintarPaneles();
  const detalle = rs
    .map((r) =>
      r.ok
        ? `  ${r.id}: enviado${r.modelLabel ? ` · ${r.modelLabel}` : ""}`
        : `  ${r.id}: ${r.error ?? "falló"}`,
    )
    .join("\n");
  decir(
    `${bien.length} de ${rs.length} recibieron el prompt.\n${detalle}`,
    mal.length === 0 ? "ok" : mal.length === rs.length ? "mal" : undefined,
  );
}

$("enviar").addEventListener("click", () => {
  const prompt = $<HTMLTextAreaElement>("prompt").value.trim();
  if (!prompt) return;
  if (noPreguntarMas) {
    void difundir(prompt);
    return;
  }
  dialogo.showModal();
});

$("cancelar").addEventListener("click", () => {
  dialogo.close();
});

$("confirmar").addEventListener("click", () => {
  noPreguntarMas = $<HTMLInputElement>("no-preguntar").checked;
  dialogo.close();
  const prompt = $<HTMLTextAreaElement>("prompt").value.trim();
  if (prompt) void difundir(prompt);
});

$("leer").addEventListener("click", () => {
  void window.cc.leer().then((ls) => {
    for (const l of ls) {
      if (l.error) marcar(l.id, l.error, "mal");
      else marcar(l.id, `${l.text.length} car.${estadoLectura(l)}`, l.text.length > 0 ? "ok" : "");
    }
    pintarPaneles();
    const detalle = ls
      .map((l) =>
        l.error
          ? `  ${l.id}: ${l.error}`
          : `  ${l.id}: ${l.text.length} caracteres${estadoLectura(l)}`,
      )
      .join("\n");
    decir(`Lectura para análisis:\n${detalle}`);
  });
});

$("sesiones").addEventListener("click", () => {
  void window.cc.sesiones().then((ss) => {
    for (const s of ss) marcar(s.id, `${s.cookies} cookies`, s.cookies > 0 ? "ok" : "mal");
    pintarPaneles();
    const detalle = ss
      .map((s) => `  ${s.id}: ${s.cookies} cookies${s.cookies === 0 ? "  ← sin sesión, inicia sesión en su panel" : ""}`)
      .join("\n");
    decir(`Sesiones persistentes:\n${detalle}`, ss.every((s) => s.cookies > 0) ? "ok" : undefined);
  });
});

/**
 * SONDEAR — mira el DOM de los paneles TAL COMO ESTAN AHORA.
 *
 * Es el unico camino que puede observar un panel con conversacion viva o con
 * una respuesta a medio generar. `--cc-probe` arranca un proceso, navega y
 * mira a los 20 s: la pantalla en la que varios fallos NO ocurren.
 *
 * No navega, no recarga y no escribe en ningun compositor. Deja el informe
 * crudo en un archivo y muestra la ruta: un crudo transcrito a mano no es una
 * salida real (§7.39).
 */
$("sondear").addEventListener("click", () => {
  const boton = $<HTMLButtonElement>("sondear");
  boton.disabled = true;
  decir("Sondeando los paneles tal como estan ahora… (solo lectura, no envia nada)");
  void window.cc
    .sondear()
    .then((s) => {
      if (!s.ok) {
        decir(`El sondeo fallo: ${s.error ?? "sin detalle"}`, "mal");
        return;
      }
      decir(`Sondeo de ${s.paneles} panel/es guardado en:\n  ${s.ruta ?? "(sin ruta)"}`, "ok");
    })
    .finally(() => {
      boton.disabled = false;
    });
});

/**
 * Desplazamiento horizontal de la fila de paneles. Cada panel ocupa el ancho
 * ENTERO de la ventana (decisión de Juan, 2026-08-13): las flechas avanzan
 * un panel entero —el proveedor siguiente o el anterior— y la barra de
 * scroll de abajo permite el ajuste FINO entre esos pasos, para ver por
 * ejemplo la mitad de un panel y la mitad del siguiente. Ninguna de las dos
 * navega ni recarga —el proceso principal sólo mueve `setBounds`— así que la
 * continuidad de hilo de cada panel no se toca.
 */
const izquierda = document.getElementById("desplazar-izquierda") as HTMLButtonElement | null;
const derecha = document.getElementById("desplazar-derecha") as HTMLButtonElement | null;
const barra = document.getElementById("barra-scroll") as HTMLInputElement | null;

/** Refleja el estado de posición en la barra, sin re-disparar su propio evento. */
function pintarPosicion(p: Posicion): void {
  if (!barra) return;
  const max = Math.max(0, p.anchoTotal - p.ventanaAncho);
  barra.max = String(max);
  barra.disabled = max <= 0;
  if (document.activeElement !== barra) barra.value = String(p.scrollX);
}

izquierda?.addEventListener("click", () => void window.cc.desplazar(-1).then(pintarPosicion));
derecha?.addEventListener("click", () => void window.cc.desplazar(1).then(pintarPosicion));
barra?.addEventListener("input", () => {
  void window.cc.desplazarA(Number(barra.value)).then(pintarPosicion);
});

void window.cc.posicion().then(pintarPosicion);
// La ventana puede resize (y con ella el ancho de cada panel y el máximo de
// scroll): se vuelve a consultar la posición para que la barra no quede con
// límites viejos.
window.addEventListener("resize", () => void window.cc.posicion().then(pintarPosicion));

export {};
