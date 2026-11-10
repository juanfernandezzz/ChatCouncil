@PlannablePlan v0.1

ID=PART-005
PH=E6_NUCLEO_RUST
SCN=SCN-005
OUT=Parseos de hallazgos, verificación, referencias y título
DEP=[PART-002, PART-003]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- El núcleo lee las salidas de los modelos igual que la Unity: hallazgos con sus nueve categorías, verificaciones, referencias [H##] del integrador, título y sección de rescate, línea ARCHIVO y citas del redactor.

CTX:
- product: ChatCouncil (CONTEXT.md: hallazgo, integrador, verificador, redactor)
- phase: E6 (parte 5 de 10)
- prior: PART-002
- next: PART-006 prompts
- depends: crates/nucleo/src/puerta.rs (PART-003), para REG-017 (D13)
- spec: los requisitos de parseo en openspec/specs/captura, integrador, verificadores y redactor

C:
- mismas reglas de lectura que la Unity, incluidas sus tolerancias
- sin heurísticas nuevas

F:
- crates/nucleo/src/parseos.rs

T:
1 Implementar los requisitos de parseo de esas cuatro capacidades.
2 Pasar los vectores de parseo.

AC:
- Todos los requisitos de parseo tienen prueba y pasan.
- Los vectores de parseo de la Unity pasan todos.
- REG-017 (ronda nueva con respuestas copiadas: CopiadaDe y citas recalculadas con Citas.cs) tiene prueba y pasa, sobre puerta.rs (D13).
- Caso de falla: una línea con una categoría desconocida no se cuenta como hallazgo, igual que en la Unity.

V:
- cargo test -p nucleo parseos, con su salida.

DONE:
- append PLAN_EVIDENCE.md#PART-005: summary+files+checks+notes
- run plannable complete PART-005

S:
- si un vector no pasa y el código de la Unity no explica la diferencia, parar y reportar
