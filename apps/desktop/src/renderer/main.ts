/**
 * renderer/main.ts — interfaz mínima de la Fase 0.
 *
 * Deliberadamente fea y chica: su único trabajo es ejercitar las tres
 * verificaciones. La interfaz de verdad llega en la Fase 1, y el rediseño
 * estético en la Fase 6.
 */

interface CcBridge {
  send: (prompt: string) => Promise<{ ok: boolean; error?: string; modelLabel?: string | null }>;
  read: () => Promise<{ text: string; generating: boolean; modelLabel: string | null }>;
  sessionInfo: () => Promise<{ partition: string; cookieCount: number }>;
}
declare global {
  interface Window {
    cc: CcBridge;
  }
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const estado = $("estado");

function decir(texto: string, clase?: "ok" | "mal"): void {
  estado.textContent = texto;
  estado.className = clase ?? "";
}

$("enviar").addEventListener("click", () => {
  const prompt = $<HTMLTextAreaElement>("prompt").value.trim();
  if (!prompt) return;
  decir("Enviando…");
  void window.cc
    .send(prompt)
    .then((r) =>
      r.ok
        ? decir(`PRUEBA 2 OK — el prompt entró.\nModelo según la UI: ${r.modelLabel ?? "(no declarado)"}`, "ok")
        : decir(`PRUEBA 2 FALLÓ — ${r.error ?? "sin detalle"}`, "mal"),
    )
    .catch((e: unknown) => {
      decir(`Error: ${e instanceof Error ? e.message : String(e)}`, "mal");
    });
});

$("leer").addEventListener("click", () => {
  void window.cc
    .read()
    .then((r) => {
      const estadoGen = r.generating ? "generando todavía" : "terminó";
      decir(
        r.text.length > 0
          ? `PRUEBA 3 OK — ${r.text.length} caracteres leídos (${estadoGen}).\n\n${r.text.slice(0, 400)}`
          : `PRUEBA 3 — sin texto todavía (${estadoGen}).`,
        r.text.length > 0 ? "ok" : undefined,
      );
    })
    .catch((e: unknown) => {
      decir(`Error: ${e instanceof Error ? e.message : String(e)}`, "mal");
    });
});

$("sesion").addEventListener("click", () => {
  void window.cc.sessionInfo().then((s) => {
    decir(
      s.cookieCount > 0
        ? `PRUEBA 1 — la partición "${s.partition}" tiene ${s.cookieCount} cookies.\nCerrá y volvé a abrir la app: si el número se mantiene y seguís logueado, la sesión persiste.`
        : `PRUEBA 1 — la partición "${s.partition}" está vacía. Logueate en el panel de abajo y volvé a consultar.`,
      s.cookieCount > 0 ? "ok" : undefined,
    );
  });
});

export {};
