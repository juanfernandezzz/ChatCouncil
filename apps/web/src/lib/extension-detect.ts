/**
 * @deprecated Fase 1. La detección de una sola pasada fue reemplazada por
 * el cliente PERSISTENTE `bridgeClient` (./bridge-client), que además de
 * detectar mantiene la conexión, reconecta con backoff y reanuda streams
 * preservando contenido. Este módulo queda sólo como reexport de
 * compatibilidad; el código nuevo debe importar de "./bridge-client".
 */
import { bridgeClient, type ExtensionStatus } from "./bridge-client";

export { bridgeClient, type ExtensionStatus, type StreamHandlers } from "./bridge-client";

/**
 * @deprecated Usar `bridgeClient.connect()` + `bridgeClient.onStatus(cb)`.
 * Se conserva para no romper llamadores antiguos: resuelve con el primer
 * estado que deje de ser "checking".
 */
export function detectExtension(): Promise<ExtensionStatus> {
  return new Promise((resolve) => {
    bridgeClient.connect();
    const unsub = bridgeClient.onStatus((s) => {
      if (s.state !== "checking") {
        unsub();
        resolve(s);
      }
    });
  });
}
