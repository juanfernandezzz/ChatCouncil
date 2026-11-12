@PlannablePlan v0.1

ID=PART-016
PH=E7_INTERFAZ_Y_PANELES
SCN=SCN-016
OUT=La Ronda en pantalla: operación, roles e informe
DEP=[PART-015]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- La ronda llega de la operación al informe en pantalla, con cada pegado verificado y el informe armado sin trabar la interfaz.

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: E7 (parte 6 de 8)
- prior: PART-015
- next: PART-017 menús, teclado y lector
- spec: openspec/specs/escritura-compositor/spec.md; openspec/specs/integrador/spec.md; openspec/specs/verificadores/spec.md; openspec/specs/interfaz/spec.md; openspec/specs/informe-final/spec.md; openspec/specs/pruebas-internas/spec.md

C:
- antes de la operación y de cada rol, conversación nueva comprobada vacía
- nunca se pega un prompt vacío; el adjunto va después del texto verificado
- armar el informe corre fuera del hilo de la interfaz
- las copias de evidencia nunca llevan navegador/

F:
- crates/app/

T:
1 Operación: aviso una vez por ronda, de a un panel al frente, con archivo o como texto, y usar la operación anterior.
2 Roles: filas de los roles, pegar el prompt del integrador, de los dos verificadores y del redactor, y repetir la verificación de un panel.
3 Informe: armarlo, abrir la carpeta al terminar y el botón «Abrir carpeta».
4 -pruebaronda: operación, roles e informe, con sus copias de evidencia.

AC:
- ESC-007, ESC-008, ESC-009, ESC-012, INT-004, INV-INT-002, VER-002, VER-008, IFZ-004, PRU-014, PRU-015, PRU-018 e INV-PRU-002 tienen comprobación y pasan; también INF-013, anotado desde E6.
- -pruebaronda termina en «Resultado: N/N» con código 0.
- Caso de falla: una conversación nueva que no queda vacía no se pega, con el texto literal de ESC-007.

V:
- La app con -pruebaronda completa, con su salida y las tres carpetas de evidencia.
- cargo test --workspace, con su salida.

DONE:
- append PLAN_EVIDENCE.md#PART-016: summary+files+checks+notes
- run plannable complete PART-016

S:
- si un paso de la prueba de la ronda exige enviar desde la app, parar y reportar: el envío lo simula la página de prueba
