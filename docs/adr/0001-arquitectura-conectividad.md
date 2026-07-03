# ADR 0001 — Arquitectura de conectividad: BYOA agnóstico como vía principal

**Estado:** Aceptada · **Fecha:** 2026-07-02

## Contexto

ChatCouncil necesita ejecutar prompts contra múltiples LLMs en paralelo
sin backend pagado propio. Dos vías son posibles: BYOK (API keys del
usuario, simple de implementar, pero requiere que el usuario tenga o
pague acceso API a cada proveedor) y BYOA (reutilizar sesiones web ya
abiertas del usuario, sin costo API adicional, pero dependiente de
superficies no contractuales — DOM o endpoints internos de cada
webapp).

## Decisión

BYOA es la vía **principal**, no un complemento. Se rechaza
explícitamente simplificar a BYOK-only. La extensión de Chrome que
habilita BYOA se construye como un **runner agnóstico**: no contiene
lógica de proveedor hardcodeada. La estrategia por proveedor (`dom` |
`endpoint` | `hybrid`) la dicta un manifiesto remoto (`adapters.json`,
servido estático desde Netlify) que la extensión consulta en runtime.

La misma extensión, ya instalada para BYOA, se reutiliza como **proxy
de red local** para resolver los casos BYOK bloqueados por CORS
(DeepSeek, Perplexity, y cualquier otro que la matriz de capacidades
marque como bloqueado) — evita mantener dos mecanismos de transporte
distintos para dos problemas que en la práctica son el mismo (falta de
acceso directo desde el navegador).

## Por qué esto y no lo obvio-más-simple

Hardcodear selectores/endpoints por proveedor directamente en el
código de la extensión sería más rápido de escribir hoy, pero acopla
cada release de la extensión al ciclo de cambios de UIs de terceros que
no controlamos y que no avisan. Separar "qué hacer" (manifiesto remoto,
desplegable sin nuevo release) de "cómo ejecutarlo" (runner genérico en
la extensión) es lo que hace sostenible mantener 6+ adaptadores BYOA en
paralelo sin que cada rediseño de ChatGPT o Gemini obligue a una nueva
versión de la extensión.

## Consecuencias

- **Costo aceptado:** cada adaptador BYOA requiere ingeniería inversa
  activa y mantenimiento continuo (Fase 3 del blueprint). No hay forma
  de evitar esto dado el rechazo a BYOK-only — es el precio de la
  decisión, no un defecto de la implementación.
- El manifiesto remoto es una dependencia en runtime: si Netlify no
  responde, la extensión debe degradar a su último cache válido
  (Fase 1), no fallar por completo.
- La matriz de capacidades CORS (`packages/shared/src/capability-matrix.ts`)
  documenta explícitamente qué se verificó y con qué confianza — ver
  el ledger en `docs/BLUEPRINT.md` §0. Ningún proveedor se asume
  CORS-friendly sin evidencia.

## Alternativas consideradas y descartadas

- **BYOK-only:** descartada explícitamente por el propietario del
  producto — no es una opción abierta, no un trade-off a reevaluar.
- **Selectores/endpoints hardcodeados en la extensión:** descartada
  por el acoplamiento de release descrito arriba.
- **Un backend propio como proxy universal:** descartada por la
  restricción de "sin backend pagado"; Netlify Functions quedó
  evaluado y finalmente sin uso real en v1 (todo el tráfico de
  proveedor es cliente-a-proveedor o cliente-a-extensión, nunca pasa
  por un servidor nuestro).
