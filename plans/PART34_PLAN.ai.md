@PlannablePlan v0.1

ID=PART-034
PH=POST_E9_PENDIENTES
SCN=SCN-034
OUT=La app se llama ChatCouncil en todo: ejecutable, carpeta, instalador y actualizador
DEP=[PART-033]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- La app se llama ChatCouncil en todo: ejecutable, carpeta, instalador y actualizador.

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: post-E9 (lote PART-032 a PART-035; decisiones D52, D53, D54)
- prior: PART-033 (D52.4, pedido de Juan)

C:
- pagina.js no cambia; el registro real solo se agrega; navegador\ no se lee ni se lista; sin envíos; no se tocan las cuentas
- compilar desde C:\cc-repo; git add por ruta; los textos van literales

F:
- crates/app/Cargo.toml
- instalador/ChatCouncil.iss
- crates/nucleo/src/actualizacion.rs
- .github/workflows/ci.yml y publicar.yml
- AGENTS.md, bench/medir.ps1, docs/adr/0010-arquitectura-de-la-app.md

T:
1 Respaldo del instalador de hoy.
2 Renombrar binario, .iss, actualizador y flujos; enmienda del ADR.
3 Prueba de migración en el CI, en rojo antes del verde.
4 Gates, revisión, evidence y complete.
5 PR B, merge y Release.
6 Actualizar la app real y comprobar el registro.

AC:
- ChatCouncil.exe, instalador\ChatCouncil.iss y ChatCouncil-instalador.exe; el Release se llama «ChatCouncil · instalador» y publica también el mismo instalador como ChatCouncilNueva-instalador.exe
- el actualizador nuevo baja ChatCouncil-instalador.exe
- en el CI, en una máquina limpia, instalar el viejo y después el nuevo deja solo Programs\ChatCouncil con ChatCouncil.exe, y la entrada de desinstalación y los accesos apuntan ahí. Caso de falla: con UsePreviousAppDir por defecto, el nuevo queda en la carpeta vieja
- en la app real, la actualización deja la versión nueva en Programs\ChatCouncil, sin la carpeta vieja; el registro real tiene el mismo sha256 antes y después, y un panel sigue con su sesión
- los archivos vivos no dicen ChatCouncilNueva, salvo lo que maneja la transición (la copia del instalador en publicar.yml y el borrado de la carpeta vieja en el .iss) y la enmienda del ADR; los registros históricos no se tocan

V:
- cargo fmt --check; cargo clippy -D warnings; cargo test --workspace; autoprueba, pruebainterfaz y pruebaronda; los gates de .github/workflows

DONE:
- append PLAN_EVIDENCE.md#PART-034: summary+files+checks+notes
- run plannable complete PART-034

S:
- si un gate, un hook o una prueba bloquea, parar esa parte y reportar
