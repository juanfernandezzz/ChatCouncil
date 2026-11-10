@PlannablePlan v0.1

ID=PART-001
PH=E6_NUCLEO_RUST
SCN=SCN-001
OUT=Workspace Rust compila y prueba en CI
DEP=[]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- Un workspace de Cargo con los crates nucleo, paneles y app, que compila y corre sus pruebas en local y en GitHub Actions para Windows.

CTX:
- product: ChatCouncil, consejo de modelos de IA sobre las páginas reales de los proveedores (CONTEXT.md)
- phase: E6 · Núcleo Rust (parte 1 de 10)
- prior: none
- next: PART-002 datos y vectores de referencia
- decisions: ADR-0002 (compilar desde C:\cc-repo), ADR-0003, ADR-0004, ADR-0005, ADR-0007

C:
- crates/nucleo sin dependencias de interfaz ni de webviews
- crates/paneles y crates/app solo con un main mínimo que compila (sin funciones todavía)
- última versión estable de cada dependencia (ADR-0007)
- compilar siempre desde C:\cc-repo; CARGO_TARGET_DIR fuera del repo
- sin dependencias nuevas fuera de Slint y wry en sus crates

F:
- Cargo.toml (workspace)
- crates/nucleo/, crates/paneles/, crates/app/
- .github/workflows/ci.yml
- .gitignore

T:
1 Crear el workspace con los tres crates y Cargo.lock.
2 Agregar a nucleo una prueba trivial que pase.
3 Crear .github/workflows/ci.yml en windows-latest: cargo fmt --check, cargo clippy -- -D warnings, cargo test --workspace.
4 Agregar a .gitignore la carpeta prototipos/ (restos sin seguimiento de E3 y E4) y target/.

AC:
- cargo test --workspace pasa en local desde C:\cc-repo.
- El CI de GitHub Actions corre en verde en el push.
- Caso de falla: un error de formato introducido a propósito hace fallar cargo fmt --check en local (se revierte antes del commit).

V:
- cargo fmt --check, cargo clippy --workspace -- -D warnings, cargo test --workspace, con su salida.
- URL y resultado de la corrida de CI.

DONE:
- append PLAN_EVIDENCE.md#PART-001: summary+files+checks+notes
- run plannable complete PART-001

S:
- si el CI falla por el entorno de Windows de GitHub, parar y reportar
