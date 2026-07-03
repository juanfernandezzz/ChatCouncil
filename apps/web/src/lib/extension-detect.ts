import {
  BRIDGE_PORT_NAME,
  BRIDGE_PROTOCOL_VERSION,
  HANDSHAKE_TIMEOUT_MS,
  type BridgeResponse,
  type AdapterAvailability,
} from "@chatcouncil/shared";

/**
 * ID estable de la extension (Q8: autodistribucion con `key` fijada en
 * el manifest de WXT para que el ID no cambie entre builds). El valor
 * por defecto de abajo corresponde a la clave de DESARROLLO incluida en
 * apps/extension/wxt.config.ts — coinciden a proposito para que, en
 * local, "cargar descomprimida" + `pnpm dev` conecten sin configurar
 * nada. Al generar tu propia clave para distribucion real (ver
 * docs/DEPLOY.md), actualiza VITE_EXTENSION_ID (o .env) para que siga
 * coincidiendo.
 */
const EXTENSION_ID =
  (import.meta.env.VITE_EXTENSION_ID as string | undefined) ?? "bjplhepllcbcpnhnpnpmcecddbjmlpch";

const DOWNLOAD_URL =
  (import.meta.env.VITE_EXTENSION_DOWNLOAD_URL as string | undefined) ??
  "https://github.com/juanfernandezzz/ChatCouncil/releases";

export type ExtensionStatus =
  | { state: "checking" }
  | { state: "not-installed"; downloadUrl: string }
  | { state: "outdated"; downloadUrl: string }
  | { state: "connected"; extensionVersion: string; adapters: AdapterAvailability[] };

/**
 * Hace ping a la extension via chrome.runtime.connect (Q7/Q9). Si
 * chrome.runtime no existe (Firefox, o navegador sin la API), o si no
 * hay respuesta dentro de HANDSHAKE_TIMEOUT_MS, se asume "no instalada"
 * en vez de colgar la UI esperando indefinidamente.
 */
export function detectExtension(): Promise<ExtensionStatus> {
  return new Promise((resolve) => {
    const chromeRuntime = (globalThis as { chrome?: { runtime?: { connect?: unknown } } }).chrome
      ?.runtime;

    if (!chromeRuntime || typeof chromeRuntime.connect !== "function") {
      resolve({ state: "not-installed", downloadUrl: DOWNLOAD_URL });
      return;
    }

    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ state: "not-installed", downloadUrl: DOWNLOAD_URL });
      }
    }, HANDSHAKE_TIMEOUT_MS);

    try {
      const connect = chromeRuntime.connect as (
        id: string,
        opts: { name: string },
      ) => {
        postMessage: (msg: unknown) => void;
        onMessage: { addListener: (cb: (msg: BridgeResponse) => void) => void };
        onDisconnect: { addListener: (cb: () => void) => void };
      };

      const port = connect(EXTENSION_ID, { name: BRIDGE_PORT_NAME });

      port.onMessage.addListener((msg) => {
        if (settled) return;
        if (msg.type === "handshake:ack") {
          settled = true;
          clearTimeout(timeout);
          resolve({
            state: "connected",
            extensionVersion: msg.extensionVersion,
            adapters: msg.adapters,
          });
        } else if (msg.type === "handshake:reject" && msg.reason === "version-mismatch") {
          settled = true;
          clearTimeout(timeout);
          resolve({ state: "outdated", downloadUrl: DOWNLOAD_URL });
        }
      });

      port.onDisconnect.addListener(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve({ state: "not-installed", downloadUrl: DOWNLOAD_URL });
        }
      });

      port.postMessage({
        type: "handshake",
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        origin: window.location.origin,
      });
    } catch {
      // chrome.runtime.connect lanza sincronicamente si el ID no
      // corresponde a ninguna extension instalada.
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve({ state: "not-installed", downloadUrl: DOWNLOAD_URL });
      }
    }
  });
}
