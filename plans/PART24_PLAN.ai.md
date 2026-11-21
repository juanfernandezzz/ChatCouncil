@PlannablePlan v0.1

ID=PART-024
PH=E9_RECORRIDO_REAL
SCN=SCN-024
OUT=Unity desinstalada y limpiada con respaldo comprobado
DEP=[PART-023]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- Desinstalar la Unity y limpiar restos tras respaldar sus datos de investigación.

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: E9 (lote único PART-022 a PART-024; decisiones D35, D36, D37 y D38; D38 manda donde chocan)
- prior: PART-023
- next: Cierre del lote e informe
- fuente: el prompt del lote (pasos A a L); el detalle literal vive ahí

C:
- pagina.js no cambia (sha256 39b048ce…5161)
- nada fuera del lote; si un gate o un hook frena, parar y reportar
- datos de las cuentas de Juan nunca en informes ni en el repo; solo números y estados
- git add por ruta; una rama part-022-024; Juan hace el merge

F:
- ver el prompt del lote

T:
1 Pasos J a L del prompt: inventario, respaldo, lista aprobada por Juan, desinstalación, borrado y documentos del relevo.

AC:
- Respaldo zip comprobado por huellas; solo se borra lo aprobado en K1; REAL y la app nueva intactos.
- caso de falla: se detiene y se reporta, sin tocar lo que está fuera del alcance

V:
- cargo test; autoprueba; pruebaronda; pruebainterfaz; fmt --check; clippy -D warnings; sha256 de pagina.js

DONE:
- append PLAN_EVIDENCE.md#PART-024: summary+files+checks+notes
- run plannable complete PART-024

S:
- si un gate o un hook frena, parar y reportar
- sin «sí» de Juan en K1 no se borra nada; archivo distinto con mismo nombre en J2: parar
