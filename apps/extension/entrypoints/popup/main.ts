import { BRIDGE_PROTOCOL_VERSION } from "@chatcouncil/shared";
import type { DiagRequest, DiagSnapshot } from "@/lib/offscreen-protocol";

/**
 * Popup de diagnóstico (Fase 1). Read-only. Pide al service worker un
 * snapshot y lo muestra: versión, protocolo, Ports conectados, offscreen
 * vivo, frescura del manifiesto. Es la ayuda para cuando el handshake
 * falla y el usuario no tiene forma de saber por qué desde la SPA sola.
 *
 * IMPORTANTE: el popup refleja lo que ve el SW; no hace un probe propio
 * del Port SPA↔SW (ese Port pertenece a la página web).
 *
 * Vanilla TS a propósito: es un panel diminuto; agregarle React sería
 * peso muerto y una dependencia nueva en la extensión.
 */

const rowsEl = document.getElementById("rows")!;
const versionEl = document.getElementById("version")!;
const noteEl = document.getElementById("note")!;
const refreshEl = document.getElementById("refresh") as HTMLButtonElement;

function row(k: string, v: string, cls = ""): string {
  return `<div class="row"><span class="k">${k}</span><span class="v ${cls}">${v}</span></div>`;
}

function relTime(ms: number | null): string {
  if (ms == null) return "nunca";
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return `hace ${s}s`;
  return `hace ${Math.round(s / 60)}m`;
}

function render(diag: DiagSnapshot | null): void {
  if (!diag) {
    versionEl.textContent = "service worker no responde";
    rowsEl.innerHTML = row("estado", "sin respuesta", "bad");
    noteEl.textContent =
      "El service worker no contestó. Puede estar reiniciándose: reabrí el popup en un segundo.";
    return;
  }

  const versionOk = diag.protocolVersion === BRIDGE_PROTOCOL_VERSION;
  versionEl.textContent = `v${diag.extensionVersion} · protocolo ${diag.protocolVersion}`;

  const portDot =
    diag.connectedPorts > 0
      ? `<span class="dot" style="background:var(--emerald)"></span>`
      : `<span class="dot" style="background:var(--amber)"></span>`;

  const manifestCls = diag.manifest.source === "network" ? "ok" : diag.manifest.source === "cache" ? "warn" : "bad";

  rowsEl.innerHTML = [
    row(
      "protocolo",
      versionOk ? "compatible" : `esperado ${BRIDGE_PROTOCOL_VERSION}`,
      versionOk ? "ok" : "bad",
    ),
    row("pestañas SPA conectadas", `${portDot}${diag.connectedPorts}`),
    row("offscreen", diag.offscreenAlive ? "vivo" : "dormido", diag.offscreenAlive ? "ok" : "warn"),
    row(
      "manifiesto",
      `${diag.manifest.source} · ${diag.manifest.providerCount} prov.`,
      manifestCls,
    ),
    row("último fetch", `${relTime(diag.manifest.fetchedAt)}${diag.manifest.fresh ? " (fresco)" : ""}`),
  ].join("");

  noteEl.textContent = versionOk
    ? "Puente en línea. Refleja el estado del service worker."
    : "Versión de protocolo desajustada: actualizá extensión y SPA a la misma versión.";
}

async function refresh(): Promise<void> {
  const req: DiagRequest = { target: "sw", kind: "diag:get" };
  try {
    const diag = (await browser.runtime.sendMessage(req)) as DiagSnapshot | undefined;
    render(diag ?? null);
  } catch {
    render(null);
  }
}

refreshEl.addEventListener("click", () => {
  void refresh();
});
void refresh();
