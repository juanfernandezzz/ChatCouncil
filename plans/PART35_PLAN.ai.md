@PlannablePlan v0.1

ID=PART-035
PH=POST_E9_PENDIENTES
SCN=SCN-035
OUT=README con la skill obligatoria en los siete; Muse se llama «Muse»; Muse como integrador guardado
DEP=[PART-034]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- README con la skill obligatoria en los siete; Muse se llama «Muse»; Muse como integrador guardado.

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: post-E9 (lote PART-032 a PART-035; decisiones D52, D53, D54)
- prior: PART-034 (D53, D54)

C:
- pagina.js no cambia; el registro real solo se agrega; navegador\ no se lee ni se lista; sin envíos; no se tocan las cuentas
- compilar desde C:\cc-repo; git add por ruta; los textos van literales

F:
- README.md
- datos/specs.json
- crates/nucleo/src/dominio.rs
- crates/app/src/pruebainterfaz.rs

T:
1 README literal.
2 «Muse (Meta)» pasa a «Muse», prueba en rojo antes.
3 Gates, revisión, evidence.
4 PR C, merge, Release y actualización de la app real.
5 Roles guardados en la app real.

AC:
- README.md existe con el texto literal del prompt
- la app muestra «Muse» en la lista de paneles y en la selección de roles; ningún archivo vivo dice «Muse (Meta)». Caso de falla: la prueba de pruebainterfaz que busca «Muse» en rojo antes del cambio
- la selección de roles de la app real queda: integrador Muse, redactor GLM, verificadores Qwen y DeepSeek

V:
- cargo fmt --check; cargo clippy -D warnings; cargo test --workspace; autoprueba, pruebainterfaz y pruebaronda; los gates de .github/workflows

DONE:
- append PLAN_EVIDENCE.md#PART-035: summary+files+checks+notes
- run plannable complete PART-035

S:
- si un gate, un hook o una prueba bloquea, parar esa parte y reportar
