@PlannablePlan v0.1

ID=PART-027
PH=POST_E9_PENDIENTES
SCN=SCN-027
OUT=Control de lectura del operador y buscar actualizaciones
DEP=[PART-026]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- Al capturar la operación de un panel, la app aplica a la línea ARCHIVO del operador el control de lectura del redactor y avisa si no leyó el archivo entero; Ayuda gana el botón «Buscar actualizaciones»; el repo queda limpio de lo que nada usa (D41 a D44).

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: post-E9 (lote PART-027; decisiones D41 a D44)
- prior: PART-026 (marcas junto al archivo de operación, nombre único del integrador)
- next: ronda CC-2 (objeto 3), cuando Juan entregue los textos de los investigadores
- fuente: el prompt del lote (Partes D, E y F); los textos se copian literal
- agent-desktop no funciona en este equipo: el estado hereda un DACL con Authenticated Users y la herramienta lo rechaza; cambiarlo exige tocar permisos, que el lote prohíbe. Se salta C y G1

C:
- pagina.js no cambia; el repo y el Release de ChatCouncil-Unity no se tocan
- nada fuera del lote; si un gate o un hook frena, anotar y seguir sin preguntar a Juan
- compilar siempre desde C:\cc-repo
- el registro de investigación no cambia de formato (append-only)
- ninguna prueba toca la red real ni instala nada (ARR-007)
- git add por ruta, nunca -A

F:
- crates/nucleo/src/puerta.rs, operacion.rs, informe.rs, actualizacion.rs
- crates/app/src/ventana.rs, actualizador.rs, interfaz.rs, pruebaronda.rs, pruebainterfaz.rs
- openspec/specs/arranque-actualizacion/spec.md

T:
1 D2 a D5 Control de lectura: leer el .marcas al capturar y aplicar lineas_de_control a la línea ARCHIVO; cabecera del panel (D3) e informe (D4); sin .marcas, como hoy (D5). Pruebas en rojo primero (D6).
2 E1 a E5 Botón «Buscar actualizaciones» con estados buscando, compilación local, sin red, al día y versión nueva; ventana «Hay una versión nueva»; aviso al abrir con el texto nuevo.
3 E6 ARR nuevo en la spec del actualizador, con pruebas: estados en el núcleo (versiones inyectadas) y ventana en pruebainterfaz.
4 E7 a E9 Gates, revisión independiente (ponytail-review y ecc:rust-reviewer, docs/revisiones/PART-027-rust-reviewer.md), PR y merge con el CI en verde, publicar en verde.
5 F Limpieza total con repo-cleanup en la rama part-027-limpieza.

AC:
- marcas correctas: sin aviso; marcas distintas: el aviso de D3; sin línea ARCHIVO: «Se saltó la primera línea ARCHIVO…»
- el botón muestra cada estado con su texto literal; la versión nueva se instala solo con «Actualizar ahora»; foco inicial en «Más tarde» y Esc cierra sin instalar
- caso de falla: sin red muestra el mensaje de revisión y no instala nada

V:
- cargo test; autoprueba; pruebaronda; pruebainterfaz; fmt --check; clippy -D warnings; sha256 de pagina.js

DONE:
- append PLAN_EVIDENCE.md#PART-027: summary+files+checks+notes
- run plannable complete PART-027

S:
- si un gate o un hook frena, anotar, saltar lo que dependa y seguir
- no leer ni copiar navegador/, cookies ni credenciales
