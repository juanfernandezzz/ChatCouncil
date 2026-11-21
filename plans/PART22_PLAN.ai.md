@PlannablePlan v0.1

ID=PART-022
PH=E9_RECORRIDO_REAL
SCN=SCN-022
OUT=Plan de mejora de la ronda E9 aplicado y medido
DEP=[PART-021]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- Aplicar el plan de mejora de la ronda E9 (R01 a R33) con medición antes y después.

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: E9 (lote único PART-022 a PART-024; decisiones D35, D36, D37 y D38; D38 manda donde chocan)
- prior: PART-021
- next: PART-023: prueba de roles, selectores y renombre
- fuente: el prompt del lote (pasos A a L); el detalle literal vive ahí

C:
- pagina.js no cambia (sha256 39b048ce…5161)
- nada fuera del lote; si un gate o un hook frena, parar y reportar
- datos de las cuentas de Juan nunca en informes ni en el repo; solo números y estados
- git add por ruta; una rama part-022-024; Juan hace el merge

F:
- ver el prompt del lote

T:
1 Pasos A a D del prompt: medición base, prompts B1 a B6, núcleo y app C1 a C12, medición posterior.

AC:
- Antes/después en bench/resultados/e9-ronda-base.json; cada ID nuevo con prueba en rojo y después verde.
- caso de falla: se detiene y se reporta, sin tocar lo que está fuera del alcance

V:
- cargo test; autoprueba; pruebaronda; pruebainterfaz; fmt --check; clippy -D warnings; sha256 de pagina.js

DONE:
- append PLAN_EVIDENCE.md#PART-022: summary+files+checks+notes
- run plannable complete PART-022

S:
- si un gate o un hook frena, parar y reportar
- si C12 encuentra otro uso de la selección sin abrir, parar y reportar
