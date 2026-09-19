/**
 * renderer/main.ts — el compositor del consejo.
 *
 * ChatCouncil NO muestra las respuestas: las interfaces de los proveedores
 * SON los paneles y están abajo, con sus capacidades nativas a mano. Acá
 * viven el compositor único, el estado por proveedor y —más adelante— la
 * salida del análisis. Espejar el texto no aportaría ninguna capacidad
 * nativa y traería toda la fragilidad que costó la v2.
 *
 * Rediseño de la barra (decisión de Juan, 2026-09-19): siete botones, el
 * pegado deja de ser automático. Lo valioso de este instrumento es
 * automatizar la CAPTURA, no el INPUT — la captura funciona (9 de 9 en la
 * corrida real de Juan); el pegado llevaba semanas fallando de formas
 * distintas en cada proveedor. Ahora Juan controla cada pegado, panel por
 * panel si hace falta: el instrumento ofrece el botón, Juan decide cuándo y
 * dónde.
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
  /** Último mensaje del usuario, capturado junto con `text`. Ver `userMessage` de la spec. */
  userText?: string | null;
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
interface ResultadoCapturarUno {
  ok: boolean;
  error?: string;
  lectura?: Lectura;
}
interface CcBridge {
  investigadores: () => Promise<string[]>;
  integrador: () => Promise<string>;
  pegarPreguntaEnTodos: (prompt: string) => Promise<Resultado[]>;
  pegarPreguntaAqui: (prompt: string) => Promise<Resultado>;
  capturarTodos: () => Promise<Lectura[]>;
  capturarUno: () => Promise<ResultadoCapturarUno>;
  sesiones: () => Promise<{ id: string; cookies: number }[]>;
  sondear: () => Promise<Sondeo>;
  desplazar: (direccion: 1 | -1) => Promise<Posicion>;
  desplazarA: (x: number) => Promise<Posicion>;
  posicion: () => Promise<Posicion>;
  pegarOperacionEnTodos: () => Promise<ResultadoConsolidar>;
  pegarOperacionEstado: () => Promise<EstadoConsolidacion>;
  pegarOperacionAqui: () => Promise<ResultadoConsolidarUno>;
  pegarIntegrador: () => Promise<ResultadoIntegrador>;
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

// Cambio 6 — deepseek queda en gris a propósito: es el integrador, no un
// investigador de la Parte 1, así que "Pegar pregunta en todos" nunca lo
// toca y nunca recibe un ok/mal de difusión. Se lo etiqueta distinto para
// que ese gris no se lea como un fallo.
void Promise.all([window.cc.investigadores(), window.cc.integrador()]).then(([ids, integrador]) => {
  for (const id of ids) marcar(id, id === integrador ? "en espera (integrador, no investiga)" : "en espera");
  pintarPaneles();
});

/** Vive sólo mientras la app está abierta: se vuelve a preguntar al reiniciar. */
let noPreguntarMas = false;

function decir(texto: string, clase?: "ok" | "mal"): void {
  estado.textContent = texto;
  estado.className = clase ?? "";
}

const etiquetaEtapa = (etapa?: string): string => (etapa ? ` [etapa: ${etapa}]` : "");

/**
 * BOTÓN 1 — "Pegar pregunta en todos". Escribe en los ocho paneles del
 * pool (nunca deepseek) y registra la pregunta como la de la ronda. Nunca
 * envía — Juan revisa y envía a mano, uno por uno.
 */
async function pegarPreguntaEnTodos(prompt: string): Promise<void> {
  decir("Pegando la pregunta en el consejo…");
  const rs = await window.cc.pegarPreguntaEnTodos(prompt);
  const bien = rs.filter((r) => r.ok);
  const mal = rs.filter((r) => !r.ok);
  for (const r of rs) {
    if (r.ok) marcar(r.id, `pegado${r.modelLabel ? ` · ${r.modelLabel}` : ""}`, "ok");
    else marcar(r.id, r.error ?? "falló", "mal");
  }
  pintarPaneles();
  const detalle = rs
    .map((r) => (r.ok ? `  ${r.id}: pegado${r.modelLabel ? ` · ${r.modelLabel}` : ""}` : `  ${r.id}: ${r.error ?? "falló"}`))
    .join("\n");
  decir(
    `${bien.length} de ${rs.length} recibieron la pregunta pegada (sin enviar).\n${detalle}`,
    mal.length === 0 ? "ok" : mal.length === rs.length ? "mal" : undefined,
  );
}

$("pegar-pregunta-en-todos").addEventListener("click", () => {
  const prompt = $<HTMLTextAreaElement>("prompt").value.trim();
  if (!prompt) return;
  if (noPreguntarMas) {
    void pegarPreguntaEnTodos(prompt);
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
  if (prompt) void pegarPreguntaEnTodos(prompt);
});

/**
 * BOTÓN 2 — "Pegar pregunta aquí". Sólo en el panel al frente; si es
 * deepseek, no hace nada y avisa. No registra ronda: es un reintento
 * puntual, no una difusión nueva.
 */
$("pegar-pregunta-aqui").addEventListener("click", () => {
  const prompt = $<HTMLTextAreaElement>("prompt").value.trim();
  if (!prompt) return;
  decir("Pegando la pregunta en el panel al frente…");
  void window.cc.pegarPreguntaAqui(prompt).then((r) => {
    marcar(r.id, r.ok ? `pegado${r.modelLabel ? ` · ${r.modelLabel}` : ""}` : r.error ?? "falló", r.ok ? "ok" : "mal");
    pintarPaneles();
    decir(r.ok ? `${r.id}: pegado${r.modelLabel ? ` · ${r.modelLabel}` : ""}` : `${r.id}: ${r.error ?? "falló"}`, r.ok ? "ok" : "mal");
  });
});

/**
 * BOTÓN 6 — "Capturar todos". Lo que antes hacía el único botón "Capturar":
 * por cada panel, último mensaje del usuario, respuesta completa,
 * modelLabel. No navega, no recarga, no escribe en ningún compositor.
 * Cuota cero.
 */
$("capturar-todos").addEventListener("click", () => {
  void window.cc.capturarTodos().then((ls) => {
    for (const l of ls) {
      if (l.error) marcar(l.id, l.error, "mal");
      else marcar(l.id, `${l.text.length} car.${estadoLectura(l)}`, l.text.length > 0 ? "ok" : "");
    }
    pintarPaneles();
    const detalle = ls
      .map((l) => (l.error ? `  ${l.id}: ${l.error}` : `  ${l.id}: ${l.text.length} caracteres${estadoLectura(l)}`))
      .join("\n");
    // Aviso de la cobertura del riesgo de "sin historial": si los prompts de
    // usuario capturados no coinciden entre proveedores, se informa acá —
    // nunca bloquea, pero Juan tiene que verlo antes de comparar respuestas.
    const conPrompt = ls.filter((l) => typeof l.userText === "string" && l.userText.length > 0);
    let avisoPrompt = "";
    if (conPrompt.length >= 2) {
      const normalizado = (t: string): string => t.trim().replace(/\s+/g, " ").toLowerCase();
      const distintos = new Set(conPrompt.map((l) => normalizado(l.userText as string)));
      avisoPrompt =
        distintos.size > 1
          ? `\n\n⚠ Los prompts de usuario capturados NO coinciden entre proveedores (${distintos.size} versiones distintas) — revisar antes de comparar respuestas.`
          : `\n\nPrompt de usuario: coincide en los ${conPrompt.length} proveedores donde se pudo leer.`;
    }
    decir(`Captura:\n${detalle}${avisoPrompt}`, avisoPrompt.startsWith("\n\n⚠") ? "mal" : "ok");
  });
});

/**
 * BOTÓN 7 — "Capturar este panel". Sólo el panel al frente, con el tipo de
 * captura que corresponda a la etapa de la ronda. Existe para cuando un
 * panel falla y no hay que recapturar los nueve.
 */
$("capturar-uno").addEventListener("click", () => {
  void window.cc.capturarUno().then((r) => {
    if (!r.ok || !r.lectura) {
      decir(`No se pudo capturar este panel: ${r.error ?? "sin detalle"}`, "mal");
      return;
    }
    const l = r.lectura;
    if (l.error) marcar(l.id, l.error, "mal");
    else marcar(l.id, `${l.text.length} car.${estadoLectura(l)}`, l.text.length > 0 ? "ok" : "");
    pintarPaneles();
    decir(l.error ? `${l.id}: ${l.error}` : `${l.id}: ${l.text.length} caracteres${estadoLectura(l)}`, l.error ? "mal" : "ok");
  });
});

/**
 * BOTÓN 3 — "Pegar operación en todos" (antes "Consolidar respuestas").
 * Arma los 8 cuerpos, los escribe secuencial y al frente, sin enviar. Puede
 * tardar minutos (medido: ~150s los 8), así que se sondea el progreso — sin
 * señal de avance por dos minutos y medio se lee como cuelgue, y ya pasó en
 * esta fase.
 */
const botonPegarOperacionEnTodos = $<HTMLButtonElement>("pegar-operacion-en-todos");
let sondeoProgreso: ReturnType<typeof setInterval> | null = null;

function detenerSondeoProgreso(): void {
  if (sondeoProgreso !== null) {
    clearInterval(sondeoProgreso);
    sondeoProgreso = null;
  }
}

function detalleConsolidarPanel(p: ResultadoConsolidarPanel): string {
  return p.interrumpido
    ? `  ${p.operadorId}: interrumpido — ${p.error ?? ""}`
    : p.ok
      ? `  ${p.operadorId}: listo, integridad ${p.estadoIntegridad} (${p.marcasPresentes}/${p.marcasEsperadas} marcas)`
      : `  ${p.operadorId}: ${p.error ?? "falló"}`;
}

botonPegarOperacionEnTodos.addEventListener("click", () => {
  botonPegarOperacionEnTodos.disabled = true;
  decir("Pegando operación: armando los 8 cuerpos…");

  sondeoProgreso = setInterval(() => {
    void window.cc.pegarOperacionEstado().then((e) => {
      if (e.enCurso) {
        decir(`Pegando operación: panel ${e.indice} de ${e.total} (${e.operadorId ?? "…"})…`);
      }
    });
  }, 2000);

  void window.cc.pegarOperacionEnTodos().then((r) => {
    detenerSondeoProgreso();
    botonPegarOperacionEnTodos.disabled = false;

    if (r.error) {
      decir(`No se pudo pegar la operación: ${r.error}${etiquetaEtapa(r.etapa)}`, "mal");
      return;
    }
    for (const p of r.paneles) {
      if (p.interrumpido) marcar(p.operadorId, "interrumpido", "mal");
      else if (!p.ok) marcar(p.operadorId, p.error ?? "falló", "mal");
      else marcar(p.operadorId, `listo · ${p.estadoIntegridad} (${p.marcasPresentes}/${p.marcasEsperadas})`, p.estadoIntegridad === "completo" ? "ok" : "mal");
    }
    pintarPaneles();
    const detalle = r.paneles.map(detalleConsolidarPanel).join("\n");
    const avisoNav = r.navegacionesIntactas
      ? ""
      : "\n\n⚠ El contador de navegaciones cambió durante la operación — alguna vista pudo haberse recargado.";
    decir(`Pegar operación${etiquetaEtapa(r.etapa)}:\n${detalle}${avisoNav}`, r.ok && r.navegacionesIntactas ? "ok" : "mal");
  });
});

/**
 * BOTÓN 4 — "Pegar operación aquí" (antes "Consolidar este panel"). Igual
 * que el 3 pero sólo para el panel al frente: no re-arma el sello ni vuelve
 * a barajar, usa la misma ronda tal cual está.
 */
const botonPegarOperacionAqui = $<HTMLButtonElement>("pegar-operacion-aqui");
botonPegarOperacionAqui.addEventListener("click", () => {
  botonPegarOperacionAqui.disabled = true;
  decir("Pegando operación en el panel al frente…");
  void window.cc.pegarOperacionAqui().then((r) => {
    botonPegarOperacionAqui.disabled = false;
    if (!r.ok || !r.panel) {
      decir(`No se pudo pegar la operación en este panel: ${r.error ?? "sin detalle"}${etiquetaEtapa(r.etapa)}`, "mal");
      return;
    }
    const p = r.panel;
    marcar(p.operadorId, p.ok ? `listo · ${p.estadoIntegridad} (${p.marcasPresentes}/${p.marcasEsperadas})` : p.error ?? "falló", p.ok ? "ok" : "mal");
    pintarPaneles();
    decir(`${detalleConsolidarPanel(p).trim()}${etiquetaEtapa(r.etapa)}`, p.ok ? "ok" : "mal");
  });
});

/**
 * BOTÓN 5 — "Pegar integrador". Arma la tabla de hallazgos y el prompt del
 * integrador, y lo escribe en deepseek (el proceso principal lo trae al
 * frente si no es el panel visible). Nunca envía. No se bloquea por etapa:
 * si la ronda no llegó a "integracion" todavía, se hace igual y se avisa.
 */
$("pegar-integrador").addEventListener("click", () => {
  decir("Pegando el prompt del integrador…");
  void window.cc.pegarIntegrador().then((r) => {
    const id = r.operadorId ?? "deepseek";
    if (r.ok) marcar(id, `listo · entrega ${r.entregaExacta ? "exacta" : "con diferencias"} (${r.caracteresPresentes}/${r.caracteresEscritos})`, r.entregaExacta ? "ok" : "mal");
    else marcar(id, r.error ?? "falló", "mal");
    pintarPaneles();
    const avisoNav = r.navegacionesIntactas ? "" : "\n\n⚠ El contador de navegaciones cambió — el panel pudo haberse recargado.";
    decir(
      r.ok
        ? `${id}: listo, entrega ${r.entregaExacta ? "exacta" : "CON DIFERENCIAS"} (${r.caracteresPresentes}/${r.caracteresEscritos} caracteres)${etiquetaEtapa(r.etapa)}${avisoNav}`
        : `${id}: ${r.error ?? "falló"}${etiquetaEtapa(r.etapa)}`,
      r.ok && r.entregaExacta && r.navegacionesIntactas ? "ok" : "mal",
    );
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
