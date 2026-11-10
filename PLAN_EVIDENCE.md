# PLAN_EVIDENCE.md

Project: ChatCouncil

## Evidence Log

### PART-001

Workspace Cargo con nucleo, paneles y app; fmt, clippy -D warnings y test pasan en local desde C:\cc-repo y en CI windows-latest (run 42763215168, success, commit 9151ca5). Caso de falla: formato roto a proposito hace fallar cargo fmt --check (exit 1), revertido y en verde (exit 0).

Artifacts:
- cargo fmt --all --check
- cargo clippy --workspace -- -D warnings
- cargo test --workspace
- https://github.com/juanfernandezzz/ChatCouncil/actions/runs/42763215168

Files:
- Cargo.toml, Cargo.lock
- crates/nucleo/Cargo.toml, crates/nucleo/src/lib.rs
- crates/paneles/Cargo.toml, crates/paneles/src/main.rs
- crates/app/Cargo.toml, crates/app/src/main.rs
- .github/workflows/ci.yml, .gitignore

Checks (salida real, local desde C:\cc-repo, CARGO_TARGET_DIR=C:\cc-target, rustc 1.99.1):

```
> cargo fmt --all --check
fmt exit 0
> cargo clippy --workspace -- -D warnings
    Checking app v0.1.0 (C:\cc-repo\crates\app)
    Checking nucleo v0.1.0 (C:\cc-repo\crates\nucleo)
    Checking paneles v0.1.0 (C:\cc-repo\crates\paneles)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 1.94s
clippy exit 0
> cargo test --workspace
     Running unittests src\lib.rs (C:\cc-target\debug\deps\nucleo-c7f96f65130d0db5.exe)
running 1 test
test pruebas::el_workspace_corre_pruebas ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
(app, paneles y Doc-tests nucleo: 0 tests, ok)
test exit 0
```

Caso de falla (rojo y verde):

```
--- ROJO --- (assert_eq!( 1+1,2 ); introducido a propósito)
Diff in ...\crates\nucleo\src\lib.rs:4:
-        assert_eq!( 1+1,2 );
+        assert_eq!(1 + 1, 2);
fmt exit 1
revertido idéntico: True
--- VERDE ---
fmt exit 0
```

CI: https://github.com/juanfernandezzz/ChatCouncil/actions/runs/42763215168 · success · 9151ca554c1cdfd8f4e862cbebb8eff2ac81833a · checkout@v7, rustup, fmt, clippy y test en success.

Notes:
- paneles y app quedan sin dependencias: Slint y wry entran con sus partes, para que el CI de esta parte no compile dependencias sin uso.
- El código se subió antes que esta evidencia, porque el AC del CI necesita el push.
