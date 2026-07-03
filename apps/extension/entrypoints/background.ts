import type { AdapterAvailability, BridgeRequest, BridgeResponse } from "@chatcouncil/shared";
import { BRIDGE_PORT_NAME, BRIDGE_PROTOCOL_VERSION } from "@chatcouncil/shared";

// `defineBackground` y `browser` son globals auto-importados por WXT
// (generados por `wxt prepare`, disparado via postinstall). No se
// importan explicitamente — es el estilo idiomatico del framework,
// confirmado contra un proyecto de referencia generado por su propio
// CLI antes de escribir este archivo.

export default defineBackground(() => {
  browser.runtime.onConnectExternal.addListener((port) => {
    if (port.name !== BRIDGE_PORT_NAME) {
      // Puerto de otro proposito conectandose por error/curiosidad:
      // lo ignoramos sin desconectar, para no romper otros usos futuros
      // del mismo runtime.onConnectExternal.
      return;
    }

    port.onMessage.addListener((message: BridgeRequest) => {
      switch (message.type) {
        case "handshake": {
          if (message.protocolVersion !== BRIDGE_PROTOCOL_VERSION) {
            const reject: BridgeResponse = {
              type: "handshake:reject",
              reason: "version-mismatch",
            };
            port.postMessage(reject);
            return;
          }

          // Fase 0: cero adaptadores BYOA implementados todavia (ver
          // docs/BLUEPRINT.md, Fase 3). Se declara una lista vacia en
          // vez de simular disponibilidad que no existe — la SPA debe
          // poder distinguir "extension conectada, sin adaptadores
          // listos" de "extension no instalada".
          const adapters: AdapterAvailability[] = [];

          const ack: BridgeResponse = {
            type: "handshake:ack",
            protocolVersion: BRIDGE_PROTOCOL_VERSION,
            extensionVersion: browser.runtime.getManifest().version,
            adapters,
          };
          port.postMessage(ack);
          return;
        }

        case "byoa:dispatch":
        case "byoa:abort":
        case "byok:proxy":
        case "byok:proxy-abort": {
          // Implementado en Fase 2 (byok:*) y Fase 3 (byoa:*). No se
          // responde nada todavia: un mensaje de error simulado seria
          // peor que el silencio, porque induciria a manejarlo como si
          // fuera un fallo real de la llamada en vez de una feature
          // pendiente.
          console.warn(`[chatcouncil-bridge] mensaje "${message.type}" aun no implementado`);
          return;
        }

        default: {
          const exhaustiveCheck: never = message;
          console.warn("[chatcouncil-bridge] mensaje desconocido", exhaustiveCheck);
        }
      }
    });
  });
});
