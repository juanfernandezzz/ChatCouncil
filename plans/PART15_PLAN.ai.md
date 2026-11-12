@PlannablePlan v0.1

ID=PART-015
PH=E7_INTERFAZ_Y_PANELES
SCN=SCN-015
OUT=La Ronda en pantalla: pregunta e investigación
DEP=[PART-014]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- La persona escribe la pregunta, la pega en los paneles, ve el estado de cada uno y captura cuando ella decide.

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: E7 (parte 5 de 8)
- prior: PART-014
- next: PART-016 operación, roles e informe
- spec: openspec/specs/interfaz/spec.md; openspec/specs/escritura-compositor/spec.md; openspec/specs/captura/spec.md; openspec/specs/pruebas-internas/spec.md

C:
- el estado de la ronda sale del núcleo (ADR-0010, punto 6)
- la app nunca envía y nunca captura sola: el estado solo avisa
- el estado de un panel nunca se distingue solo por color

F:
- crates/app/
- tests/paginas/ (páginas de la prueba de la ronda)

T:
1 Guía de siete etapas, barra, lista de paneles con símbolo y palabra, cabecera, selector, contadores y botón del paso.
2 Campo de la pregunta con su asa; diálogo propio con Cancelar.
3 Pegar en todos y repegar en uno; capturar los que terminaron, en paralelo.
4 Abandonar la ronda y declarar la pregunta.
5 -pruebaronda RUTA hasta «fin de la investigación», más diálogo, abandonar y declarar.

AC:
- IFZ-001, IFZ-002, IFZ-003, IFZ-005, IFZ-006, IFZ-007, IFZ-012, IFZ-023, IFZ-024, INV-IFZ-006, INV-IFZ-007, ESC-005, ESC-006, CAP-003, INV-CAP-002, PRU-012, PRU-013 y PRU-016 tienen comprobación y pasan.
- Caso de falla: con un panel en «Parece terminado» y varios sondeos sin tocar nada, el registro no tiene la Respuesta.

V:
- La app con -pruebaronda, con las líneas hasta «OK fin de la investigación» y las de PRU-016.
- cargo test --workspace, con su salida.

DONE:
- append PLAN_EVIDENCE.md#PART-015: summary+files+checks+notes
- run plannable complete PART-015

S:
- si la interfaz necesita del núcleo un dato que no expone, agregarlo al núcleo con su prueba y anotarlo; si cambia un vector, parar y reportar
