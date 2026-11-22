@PlannablePlan v0.1

ID=PART-023
PH=E9_RECORRIDO_REAL
SCN=SCN-023
OUT=Roles, selectores y renombre probados en un perfil de prueba
DEP=[PART-022]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- Probar selectores y roles GLM/Qwen en un perfil de prueba y renombrar lo visible a ChatCouncil.

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: E9 (lote único PART-022 a PART-024; decisiones D35, D36, D37 y D38; D38 manda donde chocan)
- prior: PART-022
- next: PART-024: relevo de la Unity
- fuente: el prompt del lote (pasos A a L); el detalle literal vive ahí

C:
- pagina.js no cambia (sha256 39b048ce…5161)
- nada fuera del lote; si un gate o un hook frena, parar y reportar
- datos de las cuentas de Juan nunca en informes ni en el repo; solo números y estados
- git add por ruta; una rama part-022-024; Juan hace el merge

F:
- ver el prompt del lote

T:
1 Pasos E a I del prompt: perfil de prueba, selectores, prueba de roles, renombre, revisión, PR y publicación.

AC:
- Selectores validados con la app; tabla de roles G3; renombre visible; PR abierto y publicado.
- caso de falla: se detiene y se reporta, sin tocar lo que está fuera del alcance

V:
- cargo test; autoprueba; pruebaronda; pruebainterfaz; fmt --check; clippy -D warnings; sha256 de pagina.js

DONE:
- append PLAN_EVIDENCE.md#PART-023: summary+files+checks+notes
- run plannable complete PART-023

S:
- si un gate o un hook frena, parar y reportar
- parar en E4, F3, F6, G2 (seis envíos) e I4 hasta que Juan responda; el perfil real nunca con puerto de depuración
