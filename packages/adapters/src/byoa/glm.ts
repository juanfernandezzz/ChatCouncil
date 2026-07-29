/**
 * glm.ts — proveedor BYOA con transporte "page"
 * ----------------------------------------------
 * Tercer investigador del consejo (§0.28). Como ChatGPT, no tiene dialecto:
 * sólo una especificación declarativa del DOM.
 *
 * PROCEDENCIA: selectores derivados de la UI real de chat.z.ai en el Chrome
 * de Juan, con su sesión activa (§0.35). No adivinados — cada uno se
 * verificó inspeccionando el DOM, y el ciclo de `completion` se confirmó
 * observando aparecer y desaparecer el botón de detener.
 *
 * TRAMPA QUE ESTE PROVEEDOR DESTAPÓ. GLM inyecta un bloque colapsable de
 * "Thought Process" DENTRO del mismo contenedor que la respuesta final, así
 * que leer `textContent` del contenedor arrastraba el razonamiento pegado al
 * texto limpio. Por eso `exclude`: se sigue apuntando al contenedor y se le
 * resta el bloque de pensamiento. Es el segundo proveedor seguido cuyo
 * selector "obvio" venía con ruido estructural — el primero fue ChatGPT con
 * `.markdown`.
 */

import type { ByoaPageProviderConfig } from "./types";

const GLM_ORIGIN = "https://chat.z.ai";

export const glmByoaProvider: ByoaPageProviderConfig = {
  authTransport: "page",
  id: "glm",
  label: "GLM",
  sessionOrigin: GLM_ORIGIN,
  page: {
    newConversationUrl: `${GLM_ORIGIN}/`,
    composer: { selector: "#chat-input", kind: "textarea" },
    submit: { kind: "click", selector: "#send-message-button" },
    responseRoot: { selector: "#messages-container" },
    assistantMessage: {
      selector: ".chat-assistant .markdown-prose",
      pick: "last",
      // Ver la nota de cabecera: el razonamiento vive dentro del contenedor.
      exclude: [".thinking-chain-container"],
    },
    // El botón de detener existe mientras genera —incluido durante la fase
    // de "Thought Process", antes de que aparezca texto— y desaparece al
    // terminar. `quiescenceMs` es la red obligatoria.
    completion: {
      kind: "element-gone",
      selector: '[aria-label="Stop"]',
      quiescenceMs: 1200,
    },
    // Techos generosos: GLM puede pasar un rato "pensando" antes del primer
    // carácter, y ese silencio no es un estancamiento.
    timeouts: {
      submitReadyMs: 8_000,
      submitConfirmMs: 12_000,
      emptyResponseMs: 120_000,
    },
    // Muestra "GLM-5.2"; sirve para detectar deriva de versión (§0.28).
    modelLabel: { selector: 'button[aria-label="Select a model"]' },
  },
  notes:
    "Selectores derivados de la UI real 2026-07-29 (§0.35). El contenedor de respuesta " +
    "incluye el bloque de razonamiento: se descarta via exclude.",
};
