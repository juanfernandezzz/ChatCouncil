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

import { claudeByoaProvider } from "./claude";
import type { ByoaProviderConfig } from "./types";

export const BYOA_PROVIDERS: Record<string, ByoaProviderConfig> = {
  claude: claudeByoaProvider,
};

export const BYOA_PROVIDER_IDS: readonly string[] = Object.freeze(Object.keys(BYOA_PROVIDERS));

/** Orígenes de sesión admitidos por el proxy BYOA. Derivado, no duplicado. */
export const BYOA_SESSION_ALLOWED_ORIGINS: readonly string[] = Object.freeze(
  Object.values(BYOA_PROVIDERS).map((p) => new URL(p.sessionOrigin).origin),
);
