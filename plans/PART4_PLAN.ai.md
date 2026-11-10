@PlannablePlan v0.1

ID=PART-004
PH=E6_NUCLEO_RUST
SCN=SCN-004
OUT=Operación con cuerpos, marcas, anonimización, barajado y control de fugas
DEP=[PART-002]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- El núcleo arma la operación igual que la Unity: cuerpos anonimizados, marcas, barajado con semilla y control de fugas de identidad por URL.

CTX:
- product: ChatCouncil (CONTEXT.md: operación)
- phase: E6 (parte 4 de 10)
- prior: PART-002
- next: PART-005 parseos
- spec: openspec/specs/operacion/spec.md

C:
- mismo resultado que la Unity para la misma entrada y semilla
- la sustitución de marcadores es de una sola pasada
- el control de fugas usa las listas de hosts y rutas permitidas de la Unity, sin ampliarlas

F:
- crates/nucleo/src/operacion.rs

T:
1 Implementar los requisitos e invariantes de openspec/specs/operacion/spec.md.
2 Pasar los vectores de cuerpos, marcas, anonimización, barajado y fugas.
3 Medir el tiempo de armar una operación con siete respuestas del tamaño de la ronda del 2026-11-10.

AC:
- Todos los requisitos e invariantes de operacion tienen prueba y pasan.
- Los vectores de la Unity para esas funciones pasan todos.
- Caso de falla: una URL de un host de interfaz (por ejemplo claude.ai/new) bloquea la operación con el mismo aviso que la Unity.

V:
- cargo test -p nucleo operacion, con su salida.
- Tiempo medido, con la regla de medición de ADR-0007.

DONE:
- append PLAN_EVIDENCE.md#PART-004: summary+files+checks+notes
- run plannable complete PART-004

S:
- si un vector no pasa y el código de la Unity no explica la diferencia, parar y reportar
