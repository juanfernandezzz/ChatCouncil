# ADR-0006 · Datos, registro y convivencia con ChatCouncil-Unity

- Estado: aceptado
- Fecha: 2026-11-10
- Decidió: Juan (E4: Q4, Q5, Q6, Q7 y Q10)

## Contexto

Las dos apps conviven en el mismo PC hasta el relevo (E9). El registro es append-only y es la evidencia de las investigaciones de Juan.

## Decisión

- Los datos de la app Unity pasan a AppData\LocalLow\ChatCouncil\ChatCouncil-Unity\ (la propia app los mueve al arrancar, D69).
- La app nueva guarda los suyos en AppData\Local\ChatCouncil\, e importa el historial de la Unity en modo solo lectura: nunca escribe en la carpeta de la Unity.
- El registro y las conversaciones siguen en JSONL, el mismo formato de hoy: es lo más rápido para el uso real (pocas escrituras por ronda) y permite importar copiando.
- La app nueva tiene su propio perfil de navegador; Juan inicia sesión una vez en los diez proveedores.
- Se llama «ChatCouncil (nueva)» hasta E9, con id cl.juanfernandez.chatcouncil, instalada por usuario y sin permisos de administrador.

## Consecuencias

- Un error de la app nueva no puede dañar el registro ni las sesiones de la Unity.
- Las dos apps pueden correr a la vez y medirse en la misma sesión.

## Qué la revisaría

Que leer el registro JSONL resulte lento en las mediciones de E6.
