@PlannablePlan v0.1

ID=PART-008
PH=E6_NUCLEO_RUST
SCN=SCN-008
OUT=Informe final en .md y PDF Carta con typst, medido contra M4
DEP=[PART-007]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- El núcleo arma el informe final en .md igual que la Unity y lo convierte a PDF tamaño Carta con typst.

CTX:
- product: ChatCouncil (CONTEXT.md: informe)
- phase: E6 (parte 8 de 10)
- prior: PART-007
- next: PART-009 verificación de URL
- spec: openspec/specs/informe-final/spec.md (incluye INF-014: páginas 612 x 792 pt)
- decisions: ADR-0003 (typst; mismo contenido, diseño mejorable)
- línea base: M4 = 3,74 s (rearmado, ChatCouncil-Unity 0.1.40)

C:
- el .md es igual al de la Unity para la misma ronda
- el PDF tiene el mismo contenido que el .md

F:
- crates/nucleo/src/informe.rs
- crates/nucleo/src/pdf.rs

T:
1 Implementar los requisitos de openspec/specs/informe-final/spec.md para el .md.
2 Generar el PDF con typst desde el .md.
3 Medir el tiempo de armar .md y PDF con la ronda del 2026-11-10, tres corridas, contra M4.

AC:
- El .md armado con los datos de la ronda del 2026-11-10 es igual al de docs/investigacion/ (o la diferencia está explicada por un requisito de openspec).
- INF-002 a INF-006, INF-008 a INF-014 e INV-INF-001 a INV-INF-003 tienen prueba y pasan; INF-001 e INF-007, que usan la comprobación de URL de PART-009, van en PART-010 (D14).
- Cada página del PDF mide 612 x 792 pt.
- Caso de falla: un hallazgo citado que no existe en la tabla se informa como en la Unity.

V:
- cargo test -p nucleo informe, con su salida.
- MediaBox de cada página del PDF generado.
- Tiempo de las tres corridas y su mediana frente a 3,74 s, con la regla de medición de ADR-0007.

DONE:
- append PLAN_EVIDENCE.md#PART-008: summary+files+checks+notes
- run plannable complete PART-008

S:
- si typst no puede reproducir algún contenido del informe, parar y reportar con un ejemplo
