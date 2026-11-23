@PlannablePlan v0.1

ID=PART-028
PH=POST_E9_PENDIENTES
SCN=SCN-028
OUT=Arrastres de PART-027
DEP=[PART-027]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- Cerrar los arrastres de la auditoría D45: reglas de AGENTS.md, limpieza que faltó y los hallazgos 2, 3, 4, 6, 7 y 8 de la revisión de PART-027; probar «Actualizar» y «Buscar actualizaciones» en la app real.

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: post-E9 (lote PART-028, desatendido; decisiones D43.1, D45)
- prior: PART-027 (control de lectura, Buscar actualizaciones, limpieza)
- next: ronda CC-2 (objeto 3), cuando Juan entregue los textos de los investigadores
- fuente: el prompt del lote (Partes 0, A, B, C y D); los textos se copian literal
- Juan no está: lo que lo necesitaría se salta, se anota y el lote sigue

C:
- pagina.js no cambia; el repo, el Release y el tag chatcouncil-v1 de ChatCouncil-Unity no se tocan
- no terminar procesos de la app que no lanzó Code; no leer, copiar ni listar navegador\
- compilar siempre desde C:\cc-repo; git add por ruta, nunca -A
- el registro de investigación no cambia de formato (append-only)

F:
- AGENTS.md, PLAN_EVIDENCE.md, PLAN_STATE.md
- crates/app/src/actualizador.rs, interfaz.rs, ventana.rs, pruebainterfaz.rs
- crates/nucleo/src/operacion.rs (sondeo y texto de la revisión)
- bench/resultados/part-028-sondeo.json, docs/revisiones/PART-028-rust-reviewer.md

T:
1 A AGENTS.md (reglas D45) y evidencia de PART-027 corregida, commit directo a main.
2 B Borrar prototipos/, la copia vieja del contenedor de Claude y las sesiones viejas, con comprobaciones.
3 C2 Medir el sondeo de 1500 ms (lectura de .marcas y parseo del HTML); cachear solo si pasa de 16 ms.
4 C3 a C8 Hallazgos 6, 7, 3, 4 y 8, con rojo primero; 1 y 5 quedan como están.
5 C9 a C11 Gates, revisión independiente, PR, merge con el CI en verde y publicar en verde.
6 D Probar en la app real «Actualizar», «Buscar actualizaciones» y la línea de estado.

AC:
- «Buscando actualizaciones…» no se queda pegado: a los 15 s sin respuesta dice el texto de falla literal
- la línea de estado de Buscar actualizaciones se limpia al salir de Ayuda
- solo «Actualizar» y «Actualizar ahora» llevan al instalador (actualizador.rs e interfaz.rs)
- la ventana «versión nueva» tiene prueba: textos, foco en «Más tarde», Esc cierra sin instalar

V:
- cargo test; autoprueba; pruebaronda; pruebainterfaz; fmt --check; clippy -D warnings

DONE:
- append PLAN_EVIDENCE.md#PART-028: summary+files+checks+notes
- run plannable complete PART-028

S:
- si un gate o un hook frena, anotar, saltar lo que dependa y seguir
- no leer ni copiar navegador\, cookies ni credenciales
