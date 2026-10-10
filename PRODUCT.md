# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

Una sola interfaz en Unity UI Toolkit para Windows (.exe) y Android (.apk). Se adapta por
clase de tamaño de ventana (compacta, mediana, expandida), no por sistema operativo: Juan pidió
el código lo más unificado posible (2026-10-10). Las guías de Fluent (Windows) y de Material 3
(Android) son fuentes de criterio; ver `docs/FASE6-SPEC.md`, "La interfaz".

## Users

Profesionales que investigan: clínicos, académicos y analistas, con cuentas propias en los
proveedores de IA (BYOA). Trabajan en sesiones largas y leen textos extensos. Juan, psicólogo
clínico, es el primer usuario, pero la interfaz no sigue sus preferencias ni su costumbre con la
versión Electron (enmienda de la spec del 2026-10-06).

Las rondas completas se hacen tanto en el PC como en el teléfono, con el mismo peso (Juan,
2026-10-10). Cada aparato guarda solo sus rondas: no hay sincronización.

## Product Purpose

Responder una pregunta de investigación con un método de consejo de modelos: siete modelos de
lenguaje responden en sus páginas web reales, cada uno evalúa a ciegas a los otros seis, y un
integrador, un verificador y un redactor arman un informe trazable hasta el dato crudo.

Éxito: una ronda completa sin romper el diseño ciego, sin depender de la memoria de quien la
corre, y un informe en disco (`.md` y `.pdf`) con cada afirmación rastreable.

## Positioning

La app no llama a ninguna API ni guarda credenciales. Usa las páginas reales de cada proveedor
con las cuentas de la persona, guía la ronda paso a paso y hace todo lo que no es enviar. La
evaluación cruzada a ciegas, la trazabilidad y el registro append-only son el mecanismo.

## Operating Context

- Una ronda tiene siete etapas: Pregunta, Investigación, Operación, Integración, Verificación,
  Redacción e Informe. En Electron son más de treinta acciones manuales.
- Los paneles son las páginas nativas de los proveedores (WebView2 y Android System WebView).
  Unity no puede dibujar encima de ellas: mientras dura un diálogo, la página se aparta.
- Los cuerpos de la operación llegan a 180.000 caracteres; en ese caso van como archivo
  adjunto.
- Hay nueve proveedores; un consejo usa siete.

## Capabilities and Constraints

- **Lo esencial no se toca desde la interfaz:** el envío siempre a mano; la captura nunca
  automática; la pregunta nunca va a los roles; el chat nuevo se comprueba antes de pegar; lo
  imposible por datos se bloquea.
- **El paso siguiente lo decide el motor**; la interfaz decide cómo se muestra.
- **Estado de cada panel con símbolo, color y texto**, siempre los tres.
- Toda acción del motor tiene un lugar alcanzable en las dos plataformas (lista en la spec).
- UI Toolkit, con una sola hoja USS de tokens.
- Sin credenciales: nunca leer ni registrar cookies, tokens ni contraseñas; no se cambia el
  user agent.
- **Decisiones abiertas para T18:** la arquitectura de información, la navegación, si los
  botones se bloquean fuera de su etapa, qué capacidades del inventario candidato entran y la
  dirección visual.

## Brand Commitments

- El nombre **ChatCouncil** es fijo (Juan, 2026-10-10).
- Ni la palabra "consejo" en la interfaz, ni la marca gráfica y los colores de `packages/ui`,
  ni las notas estéticas del BLUEPRINT §2 son compromisos: son antecedentes y se deciden con
  evidencia. Lo que sigue vigente (`docs/AGENTES.md`): en el texto en español la palabra
  "council" no aparece; si el concepto se nombra como tal, se dice "consejo".
- Textos en español neutral, con "tú".

## Evidence on Hand

- La versión Electron funcionando (`apps/desktop`), como antecedente, no como modelo.
- La especificación (`docs/FASE6-SPEC.md`), el plan (`docs/FASE6-PLAN.md`) y el BLUEPRINT.
- El motor portado y medido (`motor/`), y las autopruebas del panel en las dos plataformas
  (`docs/evidencia/fase6/`).
- No hay estudios con usuarios, testimonios ni métricas de uso: no se inventan.

## Product Principles

1. El método manda: la interfaz puede cambiar cómo se ve, nunca lo que el método exige.
2. Un solo paso siguiente a la vista, decidido por el motor.
3. Nada falla en silencio: cada riesgo para el diseño ciego se ve antes de que ocurra.
4. Cada decisión de interfaz tiene criterio y fuente, no costumbre.
5. Una interfaz, dos tamaños: el mismo código sirve al PC y al teléfono.

## Accessibility & Inclusion

WCAG 2.2 AA como piso: contraste medido, foco visible, orden lógico, nombre accesible, objetivos
táctiles de al menos 44 px en el teléfono. Textos largos: la legibilidad se elige por evidencia.
