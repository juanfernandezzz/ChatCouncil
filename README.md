# ChatCouncil

Herramienta de investigación para analizar, comparar sesgos y evaluar
respuestas de múltiples LLMs en simultáneo. SPA + extensión de Chrome,
sin backend pagado.

- **Vía principal — BYOA:** la extensión entrega sesiones ya abiertas
  de tus LLMs, como runner agnóstico dirigido por un manifiesto remoto.
- **Vía secundaria — BYOK:** tus propias API keys; la misma extensión
  actúa de proxy local donde el proveedor bloquea CORS.

Ver `docs/BLUEPRINT.md` para el plan completo y `docs/adr/` para el
razonamiento detrás de las decisiones que no se reabren.

## Estructura

```
apps/web         → SPA (Vite + React + TS + Tailwind v4 + Zustand + Dexie)
apps/extension    → extensión de Chrome (WXT, MV3)
packages/shared   → contratos: protocolo del puente, adapter, matriz de capacidades
packages/adapters → implementaciones por proveedor (vacío por ahora, Fase 2/3)
packages/ui       → design tokens y primitivas visuales
docs/             → blueprint, guía de deploy, ADRs
```

## Requisitos

- Node ≥ 20.19 (ver `.nvmrc`)
- pnpm 11.x (`corepack enable` si no lo tenés instalado global)

## Quickstart

```bash
pnpm install

# SPA en http://localhost:5173
pnpm dev

# Extensión (en otra terminal)
pnpm dev:ext
# luego: chrome://extensions → Modo desarrollador → Cargar descomprimida
#        → apps/extension/.output/chrome-mv3
```

Con la clave de desarrollo que ya viene en el repo, el ID de la
extensión coincide con el que la SPA espera — no hace falta configurar
nada para ver el badge de conexión pasar a "conectado". Antes de
distribuir la extensión a alguien más, ver `docs/DEPLOY.md` § 4 para
generar tu propia clave.

## Scripts útiles

| Comando | Qué hace |
|---|---|
| `pnpm build` | build de todos los packages + la SPA |
| `pnpm build:web` / `pnpm build:ext` | build individual |
| `pnpm zip:ext` | empaqueta la extensión (`apps/extension/.output/*.zip`) |
| `pnpm -r run typecheck` | `tsc --noEmit` en todo el workspace |
| `pnpm lint` / `pnpm test` | stubs por ahora — se completan en Fase 9 |

## Estado

Fase 0 (scaffold) completa y verificada — ver el ledger en
`docs/BLUEPRINT.md` §0 para el detalle de qué se instaló, compiló y
comprobó antes de esta entrega. Fases 1–9 son el trabajo que sigue, en
orden estricto de dependencias.
