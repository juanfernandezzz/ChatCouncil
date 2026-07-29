/**
 * chatgpt.ts — proveedor BYOA con transporte "page"
 * --------------------------------------------------
 * Primer proveedor del transporte `"page"` (E10, §0.16). A diferencia de
 * claude.ai, acá NO se reimplementa ningún endpoint interno: el ejecutor
 * genérico same-origin maneja la UI real, y el JS del propio sitio genera
 * los tokens anti-abuso (el sentinel de ChatGPT exige un proof-of-work por
 * turno, §0.15). Por eso este archivo no tiene dialecto: sólo una
 * ESPECIFICACIÓN DECLARATIVA del DOM.
 *
 * PROCEDENCIA DE LOS SELECTORES: derivados de la UI real en el Chrome de
 * Juan con la cuenta burner (§0.19), y validados de punta a punta en
 * §0.20 y §0.22 — prompt corto, prompt repetido en la misma conversación,
 * y respuesta larga.
 *
 * FRAGILIDAD ASUMIDA: si ChatGPT rediseña, estos selectores dejan de
 * matchear. El arreglo NO es recompilar la extensión: es editar el
 * `adapters.json` remoto, que pisa esta configuración (E11). Este archivo
 * es el valor por defecto embarcado, no la única fuente.
 *
 * NOTA (2026-07-25): al momento de escribirlo el compositor es ProseMirror
 * (`contenteditable`), NO un `<textarea>`, pese al id `#prompt-textarea`.
 */

import type { ByoaPageProviderConfig } from "./types";

const CHATGPT_ORIGIN = "https://chatgpt.com";

export const chatgptByoaProvider: ByoaPageProviderConfig = {
  authTransport: "page",
  id: "chatgpt",
  label: "ChatGPT",
  sessionOrigin: CHATGPT_ORIGIN,
  page: {
    newConversationUrl: `${CHATGPT_ORIGIN}/`,
    composer: { selector: "#prompt-textarea", kind: "contenteditable" },
    submit: { kind: "click", selector: 'button[data-testid="send-button"]' },
    responseRoot: { selector: "main" },
    // ChatGPT dejó de envolver el texto en `.markdown` (visto 2026-07-29,
    // round real p2b — la respuesta llegaba pero el extractor la reportaba
    // "sin contenido observable" a los 90s). El nodo con
    // data-message-author-role="assistant" ya trae SOLO el texto de la
    // respuesta en su textContent (confirmado en vivo: sin botones de
    // copiar/reintentar adentro), así que apuntar al nodo entero es más
    // robusto que perseguir la clase de turno del build de OpenAI.
    assistantMessage: {
      selector: '[data-message-author-role="assistant"]',
      pick: "last",
    },
    // El botón de detener existe mientras genera y desaparece al terminar.
    // `quiescenceMs` es la red obligatoria por si ese marcador cambia.
    completion: {
      kind: "element-gone",
      selector: 'button[data-testid="stop-button"]',
      quiescenceMs: 1500,
    },
    // Techos generosos a propósito: §0.20 midió el mismo turno en ~7 s y en
    // ~85 s según el estado de la pestaña, y §0.22 vio la cuenta degradarse
    // bajo uso intensivo. Se ajustan desde adapters.json sin recompilar.
    timeouts: {
      submitReadyMs: 8_000,
      submitConfirmMs: 10_000,
      emptyResponseMs: 90_000,
    },
  },
  notes:
    "Selectores derivados y validados en el navegador real 2026-07-25 (§0.19–§0.22). " +
    "Transporte page: el sentinel de OpenAI lo resuelve la propia pagina.",
};
