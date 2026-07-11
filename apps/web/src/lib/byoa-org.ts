import { bridgeClient } from "./bridge-client";

export interface ByoaOrganization {
  id: string;
  name: string;
}

/**
 * Detecta la sesión de un proveedor BYOA pidiendo `/api/organizations`
 * vía el puente (mismo patrón verificado en Fase 3 / ByoaTestPanel).
 * Devuelve la lista de organizaciones de la cuenta logueada, o rechaza
 * si la sesión no autenticó (respuesta no-JSON, típicamente HTML de
 * login) o el proxy falló.
 */
export function detectByoaOrganizations(sessionOrigin: string): Promise<ByoaOrganization[]> {
  return new Promise((resolve, reject) => {
    let buf = "";
    const requestId = bridgeClient.byoaProxy(
      { url: `${sessionOrigin}/api/organizations`, method: "GET", headers: { accept: "application/json" }, stream: false },
      {
        onChunk: (_seq, chunk) => {
          buf += chunk;
        },
        onDone: () => {
          try {
            const parsed: unknown = JSON.parse(buf);
            const list = Array.isArray(parsed) ? parsed : [];
            resolve(
              list.map((o) => {
                const rec = (o ?? {}) as Record<string, unknown>;
                return { id: String(rec.uuid ?? rec.id ?? "?"), name: String(rec.name ?? "(sin nombre)") };
              }),
            );
          } catch {
            reject(new Error("respuesta no-JSON (¿HTML de login?) — la sesión no autenticó"));
          }
        },
        onError: (message) => reject(new Error(message)),
        onAborted: () => reject(new Error("detección abortada")),
      },
    );
    void requestId;
  });
}
