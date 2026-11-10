@PlannablePlan v0.1

ID=PART-010
PH=E6_NUCLEO_RUST
SCN=SCN-010
OUT=Ajustes, diagnósticos y cierre medido del núcleo
DEP=[PART-008, PART-009]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- El núcleo guarda y lee los ajustes y escribe los diagnósticos como la Unity, y E6 cierra con todas las capacidades del núcleo probadas y medidas.

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: E6 (parte 10 de 10)
- prior: PART-008 y PART-009
- next: E7 (paneles e interfaz), a planificar al cerrar E6
- spec: openspec/specs/ajustes/spec.md y openspec/specs/diagnosticos/spec.md; criterio de hecho en docs/specs/E6-nucleo.md

C:
- los diagnósticos nunca incluyen credenciales, cookies ni contenido del perfil
- los ajustes viven en la carpeta de la app nueva (ADR-0006)

F:
- crates/nucleo/src/ajustes.rs
- crates/nucleo/src/diagnosticos.rs
- bench/resultados/e6-nucleo.json

T:
1 Implementar los requisitos e invariantes de ajustes y diagnósticos.
2 Comprobar el criterio de hecho de docs/specs/E6-nucleo.md: cada requisito de las capacidades cubiertas con su prueba.
3 Medir el tamaño del binario de prueba del núcleo y guardar las mediciones de E6.

AC:
- AJU-001 a AJU-010, INV-AJU-001, INV-AJU-002, DIA-001 a DIA-005 e INV-DIA-001 tienen prueba y pasan.
- INF-001 (armar el informe, con la comprobación de URL) e INF-007 (verificación en el informe, con el estado de cada URL) tienen prueba y pasan (D14).
- Una tabla de cobertura muestra cada requisito de las capacidades de E6 con el nombre de su prueba; ninguno queda sin prueba.
- Caso de falla: un diagnóstico generado en una prueba con un perfil falso no contiene ninguna cadena del perfil.

V:
- cargo test --workspace, con su salida.
- La tabla de cobertura y bench/resultados/e6-nucleo.json.

DONE:
- append PLAN_EVIDENCE.md#PART-010: summary+files+checks+notes
- run plannable complete PART-010

S:
- si un requisito de E6 no puede probarse sin interfaz ni paneles, anotarlo para E7 y reportarlo
