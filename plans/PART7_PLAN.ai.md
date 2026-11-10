@PlannablePlan v0.1

ID=PART-007
PH=E6_NUCLEO_RUST
SCN=SCN-007
OUT=Máquina de etapas de la ronda con roles 7-1-2-1
DEP=[PART-003, PART-006]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- El núcleo lleva una ronda completa por sus etapas, con roles y selección de proveedores como la Unity, y expone su estado para la interfaz.

CTX:
- product: ChatCouncil (CONTEXT.md: ronda, etapa, esquema 7-1-2-1)
- phase: E6 (parte 7 de 10)
- prior: PART-003 y PART-006
- next: PART-008 informe
- spec: openspec/specs/ronda/spec.md

C:
- el núcleo nunca envía: cada envío es una acción del usuario que llega como evento
- la captura ocurre solo cuando el usuario la pide
- restaurar una ronda en curso desde el registro, como la Unity

F:
- crates/nucleo/src/ronda.rs

T:
1 Implementar los requisitos e invariantes de openspec/specs/ronda/spec.md.
2 Prueba de una ronda completa con respuestas de ejemplo tomadas de la ronda del 2026-11-10 (docs/investigacion/), sin paneles.

AC:
- Todos los requisitos e invariantes de ronda tienen prueba y pasan.
- La ronda de prueba llega de la pregunta al informe con los mismos roles por defecto que la Unity (diez proveedores; verificadores glm y qwen).
- Caso de falla: un intento de avanzar sin la acción del usuario que la etapa exige se rechaza y el estado no cambia.
- REG-016 completo: AbandonarRonda limpia también los prompts armados, y la Puerta recibe RolesElegidos y la lista del pool en vez del integrador y el largo del pool (D13; PART-003, decisión 6).

V:
- cargo test -p nucleo ronda, con su salida.

DONE:
- append PLAN_EVIDENCE.md#PART-007: summary+files+checks+notes
- run plannable complete PART-007

S:
- si un requisito de ronda depende de la interfaz o de los paneles, implementarlo como evento del núcleo y anotarlo; si no se puede, parar y reportar
