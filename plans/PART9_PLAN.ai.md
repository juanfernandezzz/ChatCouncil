@PlannablePlan v0.1

ID=PART-009
PH=E6_NUCLEO_RUST
SCN=SCN-009
OUT=Verificación de URL por HTTP como la Unity
DEP=[PART-006]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- El núcleo comprueba el estado HTTP de las URL citadas igual que la Unity, sin volver a la red por las ya comprobadas.

CTX:
- product: ChatCouncil (CONTEXT.md: verificador, informe)
- phase: E6 (parte 9 de 10)
- prior: PART-006
- next: PART-010 ajustes y diagnósticos
- spec: requisitos de verificación de URL en openspec/specs/verificadores y informe-final

C:
- solo se pide el estado HTTP, como la Unity
- sin credenciales ni cookies en las peticiones
- las pruebas usan un servidor local; ninguna prueba depende de internet

F:
- crates/nucleo/src/urls.rs

T:
1 Implementar los requisitos de verificación de URL.
2 Pruebas con un servidor local que responde 200, 301, 404 y tiempo agotado.

AC:
- Todos los requisitos de verificación de URL tienen prueba y pasan.
- Una URL ya comprobada no genera una segunda petición.
- Caso de falla: un tiempo agotado se informa igual que en la Unity, sin colgar la ronda.

V:
- cargo test -p nucleo urls, con su salida.

DONE:
- append PLAN_EVIDENCE.md#PART-009: summary+files+checks+notes
- run plannable complete PART-009

S:
- si la Unity hace algo más que pedir el estado HTTP, parar y reportar
