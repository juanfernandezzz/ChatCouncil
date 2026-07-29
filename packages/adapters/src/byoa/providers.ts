/**
 * Registro BYOA de Fase 3 (camino B+) — @chatcouncil/adapters
 * ------------------------------------------------------------------
 * BYOA = "Bring Your Own Account": la extensión opera sobre la SESIÓN que
 * el usuario ya tiene abierta y logueada en su navegador (misma cuenta,
 * mismo sentido que Playwright/Selenium sobre una sesión propia). A
 * diferencia de BYOK, acá NO hay llave: la auth va por la cookie de
 * sesión httpOnly del proveedor, que el navegador adjunta en runtime — el
 * código nunca la lee ni la loggea.
 *
 * El primer (y único, en esta fase) proveedor es `claude` (claude.ai),
 * cuyo dialecto con estado vive en `./claude`. El contrato de tipos vive
 * en `./types` y la máquina que encadena crear-conversación + completion
 * en `./adapter` (`createByoaAdapter`). byoa NO importa key-vault (no hay
 * llaves BYOA).
 *
 * ── ALLOWLIST DE SESIÓN (espejo 1:1 de host_permissions) ───────────
 * `BYOA_SESSION_ALLOWED_ORIGINS` es LA fuente de verdad que
 * `background.ts` aplica por mensaje para el proxy BYOA. Vive EN CÓDIGO a
 * propósito, igual que `BYOK_PROXY_ALLOWED_ORIGINS`: el manifiesto remoto
 * (adapters.json) sólo puede APAGAR proveedores, jamás agregar un host de
 * sesión. `host_permissions` en wxt.config.ts DEBE espejar esta lista 1:1.
 */

import { chatgptByoaProvider } from "./chatgpt";
import { glmByoaProvider } from "./glm";
import { claudeByoaProvider } from "./claude";
import type { ByoaProviderConfig } from "./types";

export const BYOA_PROVIDERS: Record<string, ByoaProviderConfig> = {
  claude: claudeByoaProvider,
  chatgpt: chatgptByoaProvider,
  glm: glmByoaProvider,
};

export const BYOA_PROVIDER_IDS: readonly string[] = Object.freeze(Object.keys(BYOA_PROVIDERS));

/**
 * Orígenes admitidos por el proxy BYOA. Derivado, no duplicado.
 *
 * SÓLO proveedores de transporte "cookie" (E8 consciente del transporte,
 * §0.26): son los únicos que hacen fetch cross-origin desde el offscreen y
 * por lo tanto los únicos que necesitan `host_permissions`. Meter acá un
 * proveedor "page" le daría acceso de proxy que no usa y rompería el
 * espejo 1:1 con el manifiesto.
 */
export const BYOA_SESSION_ALLOWED_ORIGINS: readonly string[] = Object.freeze(
  Object.values(BYOA_PROVIDERS)
    .filter((p) => p.authTransport === "cookie")
    .map((p) => new URL(p.sessionOrigin).origin),
);

/**
 * Orígenes de los proveedores de transporte "page". NO van a
 * `host_permissions`: §0.18 verificó que el transporte "page" no lo
 * necesita, porque el trabajo ocurre DENTRO de la página y alcanza con el
 * `matches` del content script.
 */
export const BYOA_PAGE_ORIGINS: readonly string[] = Object.freeze(
  Object.values(BYOA_PROVIDERS)
    .filter((p) => p.authTransport === "page")
    .map((p) => new URL(p.sessionOrigin).origin),
);

/**
 * Patrones de match para el content script del ejecutor. El entrypoint los
 * IMPORTA en vez de repetirlos, así que el espejo con los proveedores
 * "page" es ESTRUCTURAL y no puede desincronizarse en silencio — que es
 * justo el riesgo de deriva registrado en §0.15 para la lista manual de
 * `host_permissions`.
 */
export const BYOA_PAGE_MATCH_PATTERNS: readonly string[] = Object.freeze(
  BYOA_PAGE_ORIGINS.map((o) => `${o}/*`),
);
