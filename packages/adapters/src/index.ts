/**
 * @chatcouncil/adapters
 * ------------------------------------------------------------------
 * Implementaciones concretas por proveedor detrás del contrato
 * `Adapter` de @chatcouncil/shared. Límite arquitectónico (topología
 * del BLUEPRINT): nada en apps/web ni en apps/extension importa lógica
 * específica de un proveedor por fuera de este paquete.
 *
 * · BYOK (Fase 2): `./byok/*` — 5 proveedores de punta a punta
 *   (anthropic/google directos; openai/deepseek/perplexity vía proxy),
 *   builder de request cruda + parser SSE por dialecto, factory
 *   `createByokAdapter` que implementa el contrato con deps inyectadas,
 *   y el ALLOWLIST del proxy (fuente de verdad de Q11 — ver
 *   providers.ts y el Apéndice del BLUEPRINT).
 * · BYOA (Fase 3): pendiente de ingeniería inversa activa; nada acá se
 *   inventa por adelantado.
 *
 * (El export histórico `registeredAdapters` del scaffold se retiró en
 * Fase 2: era un placeholder vacío sin consumidores, reemplazado por el
 * registro real `BYOK_PROVIDERS` + `createByokAdapter`.)
 */

export * from "./byok/types";
export * from "./byok/sse";
export * from "./byok/openai-compat";
export * from "./byok/anthropic";
export * from "./byok/google";
export * from "./byok/providers";
export * from "./byok/adapter";
export * from "./byok/transports";
