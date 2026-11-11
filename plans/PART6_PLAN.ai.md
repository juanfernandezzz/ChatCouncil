@PlannablePlan v0.1

ID=PART-006
PH=E6_NUCLEO_RUST
SCN=SCN-006
OUT=Prompts del integrador, verificadores y redactor armados igual
DEP=[PART-004, PART-005]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- El núcleo arma los prompts de integración, verificación y redacción con los literales de DAT-002, igual que la Unity.

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: E6 (parte 6 de 10)
- prior: PART-004 y PART-005
- next: PART-007 ronda
- spec: openspec/specs/integrador, verificadores y redactor (requisitos de armado de prompts)

C:
- sustitución de marcadores de una sola pasada
- tope de 20 URL por verificación (RESUELTO VER-01)
- el texto armado es igual carácter por carácter al de la Unity

F:
- crates/nucleo/src/prompts.rs

T:
1 Implementar el armado de los tres prompts.
2 Pasar los vectores de armado de prompts.

AC:
- Los prompts armados son idénticos a los vectores de la Unity.
- INT-001, INT-002, INT-003, VER-001, RED-001, RED-002, RED-003, RED-004, INV-INT-001, INV-VER-001 e INV-RED-001 tienen prueba y pasan.
- INT-007, RED-006, RED-007 e INV-RED-002, que leen la tabla H## o el archivo del redactor armados en esta parte, tienen prueba y pasan (D14).
- INT-006 (informe vigente), VER-007 (verificaciones vigentes en orden), ESC-010 (verificación de la operación escrita; faltaba en PART-004) y ESC-011 (prompt de rol verificado por igualdad) tienen prueba y pasan (D18).
- DAT-001 y DAT-002 (faltaban en PART-002) tienen su prueba de hash nombrada en la tabla de requisito → prueba de esta parte (D18).
- Caso de falla: un marcador presente dentro del texto sustituido no se vuelve a sustituir.

V:
- cargo test -p nucleo prompts, con su salida.

DONE:
- append PLAN_EVIDENCE.md#PART-006: summary+files+checks+notes
- run plannable complete PART-006

S:
- si un prompt armado difiere en un carácter, parar y reportar la diferencia
