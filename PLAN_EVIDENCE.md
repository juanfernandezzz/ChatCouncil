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

### PART-002

specs.json y los cuatro prompt-*.ts copiados byte a byte (sha256 = DAT-001 y DAT-002) e incrustados en nucleo con include_str!; plantilla() devuelve los cinco literales tal cual. herramientas/extraer-vectores.mjs convirtio Referencias.g.cs (sha256 a0efb093...) en 86 JSON, 679 casos, iguales al conteo independiente. Caso de falla: un caracter cambiado en prompt-redactor.ts hace fallar la prueba de hash; revertido y en verde. CI 42765339914 success.

Artifacts:
- cargo test -p nucleo datos
- conteo de casos Referencias.g.cs contra tests/vectores (contar-casos.ps1)
- cargo fmt --all --check
- cargo clippy --workspace --all-targets -- -D warnings
- cargo test --workspace
- https://github.com/juanfernandezzz/ChatCouncil/actions/runs/42765339914

Files:
- datos/specs.json; datos/prompts/prompt-operacion.ts, prompt-integrador.ts, prompt-verificador.ts, prompt-redactor.ts
- crates/nucleo/src/datos.rs, crates/nucleo/src/lib.rs, crates/nucleo/Cargo.toml (dev: serde 1.0.229, serde_json 1.0.154, sha2 0.11.1), Cargo.lock
- herramientas/extraer-vectores.mjs
- tests/vectores/: 86 archivos <Funcion>.json y _fuente.json

Checks (salida real, local desde C:\cc-repo, CARGO_TARGET_DIR=C:\cc-target, rustc 1.99.1):

```
> cargo test -p nucleo datos
running 4 tests
test datos::pruebas::plantillas_se_leen_tal_cual ... ok
test datos::pruebas::specs_json_coincide_con_dat_001 ... ok
test datos::pruebas::prompts_coinciden_con_dat_002 ... ok
test datos::pruebas::vectores_se_leen_y_cuentan ... ok
test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 1 filtered out; finished in 0.05s
> node herramientas/extraer-vectores.mjs <ChatCouncil-Unity>/motor/Tests/Referencias.g.cs
sha256 a0efb0939f967627a88c6694458e73e3737a5df5a61b707d65d25b842bcc2e5b
86 funciones, 679 casos
> contar-casos.ps1 (cuenta en el .cs por líneas y literales, sin el script)
funciones: 86 en Referencias.g.cs, 86 archivos de función en tests/vectores
casos: 679
distintos: 0
> cargo fmt --all --check            -> exit 0
> cargo clippy --workspace --all-targets -- -D warnings -> exit 0
> cargo test --workspace             -> nucleo 5 passed; app, paneles 0; exit 0
```

Caso de falla (rojo y verde):

```
--- ROJO (respuesta -> respuestA en la PLANTILLA de datos/prompts/prompt-redactor.ts) ---
test datos::pruebas::plantillas_se_leen_tal_cual ... FAILED
test datos::pruebas::prompts_coinciden_con_dat_002 ... FAILED
  left: "971990b8c883bf5ffdf4654c020c828182515897a1c8667b75ba3671ce710f7d"
 right: "c3963ba140cbf07e9419658130071b908bd3b4856aa51b238258a370ac7bb8fb"
test result: FAILED. 2 passed; 2 failed
revertido idéntico: True
--- VERDE ---
test result: ok. 4 passed; 0 failed
```

CI: https://github.com/juanfernandezzz/ChatCouncil/actions/runs/42765339914 · success · 7e0fbc2360a42e00a9313633e41eec5728eef34d · fmt, clippy y test en success (datos: 4 ok).

Notes:
- Los prompt-*.ts se copian enteros: DAT-002 da el sha256 del archivo, y plantilla() saca cada literal sin reescribirlo (rechaza literales con \ o ${).
- 19 líneas de vectores traen surrogates solos (\ud800, \ud83d), igual que en JS; la prueba los cuenta con IgnoredAny porque String de Rust no los admite.
- El repo ChatCouncil-Unity quedó sin cambios (git status vacío).
