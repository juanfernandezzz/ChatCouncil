@PlannablePlan v0.1

ID=PART-029
PH=POST_E9_PENDIENTES
SCN=SCN-029
OUT=Skills como texto extra
DEP=[PART-028]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- Que la invocación de una skill al comienzo del texto no cuente como texto distinto, ni en «Enviar a todos» ni en el aviso de mensaje distinto (D46.3).

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: post-E9 (lote PART-029, PART-030 y ronda CC-2; decisiones D43.1, D46, D47, D48)
- prior: PART-028 (arrastres D45)
- next: PART-030 (Muse como proveedor)
- fuente: el prompt del lote (Parte 1A)
- Juan solo está en la Parte 2 (cuando escribe «muse») y en la Parte 3 (cuando escribe «ronda»); lo que lo necesitaría fuera de esos momentos se salta, se anota y el lote sigue

C:
- pagina.js no cambia; el repo, el Release y el tag chatcouncil-v1 de ChatCouncil-Unity no se tocan
- no terminar procesos de la app que no lanzó Code; no leer, copiar ni listar navegador\
- compilar siempre desde C:\cc-repo; git add por ruta, nunca -A
- el registro de investigación no cambia de formato (append-only)

F:
- crates/nucleo/src/puerta.rs (sin_invocaciones_de_skill y R18)
- datos/pagina/enviar.js, datos/pagina/ORIGEN.md
- crates/app/src/pruebaronda.rs
- openspec/specs/escritura-compositor/spec.md (ESC-018)
- docs/revisiones/PART-029-rust-reviewer.md

T:
1 Restos y diagnóstico del registro real (solo cuentas y largos).
2 Pruebas en rojo y arreglo en el núcleo y en enviar.js.
3 Gates, revisión independiente, PR, merge con el CI en verde y publicar en verde.

AC:
- «/research-protocol <pregunta>», «@research-protocol <pregunta>» y «/plugin:skill <pregunta>» coinciden
- «/research-protocol <otra cosa>» no coincide; «/ruta/archivo» no se toca
- en pruebaronda, «Enviar a todos» envía con la invocación delante de lo pegado

V:
- cargo test; autoprueba; pruebaronda; pruebainterfaz; fmt --check; clippy -D warnings

DONE:
- append PLAN_EVIDENCE.md#PART-029: summary+files+checks+notes
- run plannable complete PART-029

S:
- si un gate o un hook frena, anotar, saltar lo que dependa y seguir
- no leer ni copiar navegador\, cookies ni credenciales
