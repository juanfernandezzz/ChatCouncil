/**
 * Transporte directo (fetch desde la SPA) — Fase 2, E2a/E3
 * ------------------------------------------------------------------
 * Para proveedores CORS-directos (anthropic/google) la SPA les habla
 * sin puente: menos partes móviles por request y el probe de E7 mide
 * exactamente este camino. El transporte proxy (puente) vive en
 * apps/web (`byok-client.ts`) porque depende de bridge-client.
 *
 * Decodificación: `TextDecoder` en modo streaming — un code point UTF-8
 * partido entre dos reads NO se corrompe (el decoder retiene los bytes
 * incompletos hasta el read siguiente; `decode()` final drena la cola).
 * Errores HTTP: status + snippet corto del cuerpo (los proveedores no
 * ecoan la llave en sus errores); JAMÁS se incluyen headers de request.
 */

import type { ByokTransport } from "./types";

const ERROR_SNIPPET_MAX = 400;

export const directFetchTransport: ByokTransport = {
  async run(req, onText, signal) {
    const res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      signal,
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
    });
    if (!res.ok) {
      let snippet = "";
      try {
        snippet = (await res.text()).slice(0, ERROR_SNIPPET_MAX);
      } catch {
        // cuerpo ilegible: el status solo ya es diagnóstico
      }
      throw new Error(`HTTP ${res.status}${snippet ? ` — ${snippet}` : ""}`);
    }
    if (!req.stream || !res.body) {
      onText(await res.text());
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) onText(decoder.decode(value, { stream: true }));
    }
    const tail = decoder.decode();
    if (tail) onText(tail);
  },
};
