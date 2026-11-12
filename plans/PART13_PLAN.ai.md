@PlannablePlan v0.1

ID=PART-013
PH=E7_INTERFAZ_Y_PANELES
SCN=SCN-013
OUT=Script de página por el puente: escribir sin enviar, leer, estado y diagnóstico
DEP=[PART-011, PART-012]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- La app usa todas las funciones del script de página de la Unity por el puente, con las specs reales, y nunca envía.

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: E7 (parte 3 de 8)
- prior: PART-012
- next: PART-014 secciones y Ajustes
- spec: openspec/specs/escritura-compositor/spec.md; openspec/specs/captura/spec.md; openspec/specs/diagnosticos/spec.md; openspec/specs/pruebas-internas/spec.md

C:
- el script de página no se modifica (DAT-003)
- nunca se escribe encima de un borrador; lo pegado se verifica, no se asume
- los textos cruzan el puente sin pérdida, incluido un surrogate suelto (D12)
- sin dato de la página no se inventa estado

F:
- crates/paneles/
- crates/app/ (grupos de la autoprueba)

T:
1 Puente tipado para escribir, leer el compositor, leer la respuesta con su HTML crudo, chat vacío, estado y diagnóstico, con sus techos de tiempo.
2 Lectura del informe en un iframe, incluido uno de otro origen.
3 Sondeo de estado cada 1,5 s, que borra el dato si la página no responde.
4 Grupos de la autoprueba: escritura con las specs reales, lectura y diagnóstico, iframe de otro origen, compositor recortado, adjunto, PDF y surrogate suelto.

AC:
- ESC-001, ESC-002, ESC-003, ESC-004, INV-ESC-001, INV-ESC-002, INV-ESC-003, CAP-001, CAP-002, CAP-014, INV-CAP-003, PRU-003, PRU-004, PRU-005 y PRU-008 tienen comprobación y pasan; también DIA-001, anotado desde E6.
- INV-ESC-001: una prueba fija la lista de funciones del script que la app llama contra la lista permitida; ninguna envía.
- PRU-005: el PDF de la autoprueba lo arma informe-pdf, empieza con «%PDF-» y pesa más de 1.000 bytes.
- Caso de falla: con un borrador en el compositor, escribir no lo pisa y devuelve «el compositor ya tenía texto: no se escribe encima de un borrador».

V:
- La app con -autoprueba completa, con su salida «Resultado: N/N».
- cargo test --workspace, con su salida.

DONE:
- append PLAN_EVIDENCE.md#PART-013: summary+files+checks+notes
- run plannable complete PART-013

S:
- si una función del script se comporta distinto que en la Unity sobre la misma página de prueba, parar y reportar
