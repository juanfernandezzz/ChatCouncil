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

### PART-003

Registro append-only en JSONL portado con Texto WTF-8 y JSON a mano (D12, ADR-0008), sin dependencias de ejecucion en nucleo: las 29 lineas de RegistroLineas se reescriben byte a byte (incluidas las 3 con \ud800) y las 6 Lecturas coinciden. REG-012 y REG-013 como funciones puras en dominio.rs; REG-008 a REG-011 y REG-014 a REG-016 en puerta.rs (D13). Importacion de solo lectura con sha256 del origen igual antes y despues. Caso de falla: truncar una linea con el handle del registro da Acceso denegado y el sha256 queda igual (rojo con handle de escritura, verde con append). Registro real de 13,9 MB en copia temporal: 2211 de 2212 lineas identicas, la otra es de un esquema anterior a D62 y la Unity la reescribe igual. REG-017 trasladado a PART-005 (D13). CI 42855355924 success.

Artifacts:
- cargo test -p nucleo registro
- cargo test -p nucleo texto json dominio puerta
- rojo y verde de modificar_una_linea_del_registro_se_rechaza_y_el_archivo_queda_igual
- CC_REGISTRO_REAL=<copia temporal> cargo test -p nucleo un_registro_real -- --ignored
- cargo tree -p nucleo -e normal
- cargo fmt --all --check
- cargo clippy --workspace --all-targets -- -D warnings
- cargo test --workspace
- https://github.com/juanfernandezzz/ChatCouncil/actions/runs/42855355924

Files:
- crates/nucleo/src/texto.rs (Texto WTF-8), json.rs (JsonEstricto y Escapar a mano), registro.rs (16 tipos, leer, agregar append-only), importar.rs, dominio.rs (REG-012, REG-013, cargados, pregunta efectiva), puerta.rs (REG-008 a 011, 014 a 016), lib.rs
- docs/adr/0008-texto-wtf8.md
- plans/PART3_PLAN.ai.md (AC por D13), plans/PART5_PLAN.ai.md (DEP, CTX y AC de REG-017)
- Commit 6b725c3ca03075b322de2a5f787c2da8e0628bf9

Checks (salida real, local desde C:\cc-repo, CARGO_TARGET_DIR=C:\cc-target, rustc 1.99.1):

```
> cargo test -p nucleo registro -- --nocapture --test-threads=1
running 15 tests
test importar::pruebas::importar_registros_copia_lo_que_falta_y_no_toca_el_origen ... sha256 origen antes:   6090426cf82b8ffc0f68dd1a1562fb26e45d96029cc1be499edfad1348bbe09b
sha256 origen después: 6090426cf82b8ffc0f68dd1a1562fb26e45d96029cc1be499edfad1348bbe09b
ok
test puerta::pruebas::abandonar_la_ronda_vuelve_a_la_pregunta_sin_tocar_el_registro ... ok
test puerta::pruebas::el_registro_sin_cambios_no_se_vuelve_a_leer ... ok
test puerta::pruebas::la_ronda_activa_se_restaura_del_registro ... ok
test puerta::pruebas::las_rondas_anteriores_salen_del_registro_con_su_informe ... ok
test registro::pruebas::agregar_escribe_una_linea_al_final_sin_bom ... ok
test registro::pruebas::cada_tipo_de_hecho_se_lee_y_se_reescribe_byte_a_byte ... ok
test registro::pruebas::el_surrogate_suelto_llega_al_hecho_sin_perderse ... ok
test registro::pruebas::las_fechas_se_leen_como_texto_y_vuelven_identicas ... ok
test registro::pruebas::leer_cuenta_las_ilegibles_y_detecta_la_ultima_linea_incompleta ... ok
test registro::pruebas::modificar_una_linea_del_registro_se_rechaza_y_el_archivo_queda_igual ... sha256 antes:   94c59bb3aa9b9b4ae429d705a15773a7166303d7ab34b8c3f74c29754855b811
set_len(0) rechazado: Acceso denegado. (os error 5)
sha256 después: 94c59bb3aa9b9b4ae429d705a15773a7166303d7ab34b8c3f74c29754855b811
ok
test registro::pruebas::tipos_que_no_encajan_vuelven_ilegible_la_linea ... ok
test registro::pruebas::un_hecho_nuevo_usa_los_valores_por_defecto_de_la_unity ... ok
test registro::pruebas::un_registro_con_bom_no_aporta_hechos ... ok
test registro::pruebas::un_registro_real_se_reescribe_byte_a_byte ... ignored, necesita CC_REGISTRO_REAL con una copia temporal de un registro real
test result: ok. 14 passed; 0 failed; 1 ignored; 0 measured; 21 filtered out; finished in 0.20s
```

Caso de falla (rojo y verde):

```
--- ROJO (abrir_para_agregar con write(true) en vez de append(true)) ---
running 1 test
sha256 antes:   857be951d0d24141ed616135a3c1b7afdec285a5b689cb600df24b72619e387b
thread 'registro::pruebas::modificar_una_linea_del_registro_se_rechaza_y_el_archivo_queda_igual' (12124) panicked at crates\nucleo\src\registro.rs:670:34:
truncar una línea del registro tiene que fallar: ()
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace
registro::pruebas::modificar_una_linea_del_registro_se_rechaza_y_el_archivo_queda_igual --- FAILED
failures:
failures:
    registro::pruebas::modificar_una_linea_del_registro_se_rechaza_y_el_archivo_queda_igual
test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 35 filtered out; finished in 0.05s
error: test failed, to rerun pass `-p nucleo --lib`
--- VERDE (append(true), restaurado) ---
running 1 test
sha256 antes:   94c59bb3aa9b9b4ae429d705a15773a7166303d7ab34b8c3f74c29754855b811
set_len(0) rechazado: Acceso denegado. (os error 5)
sha256 después: 94c59bb3aa9b9b4ae429d705a15773a7166303d7ab34b8c3f74c29754855b811
.
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 35 filtered out; finished in 0.01s
```

Registro real (copia temporal de d4fc7e58-....jsonl de la Unity; solo números y nombres de claves):

```
línea 625 (respuesta-redactor): claves originales ["tipo", "esquema", "id", "rondaId", "redactorId", "promptCompleto", "textoCrudo", "html", "marcaPrimera", "marcaUltima", "recibidaEn"] · reescritas ["tipo", "esquema", "id", "rondaId", "redactorId", "promptCompleto", "textoCrudo", "html", "marcaPrimera", "marcaUltima", "selloVerificaciones", "recibidaEn"]
líneas legibles que no se reescriben igual: 1
bytes 13917723 · hechos 2212 · reescritos idénticos 2211 · ilegibles 0 · tipos distintos 14
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 35 filtered out; finished in 5.22s
origen después: 81a46358fd5b68c5afeb8f7c2f0f611758ae579480093db7c1388658ae6ae74a
origen antes:   81a46358fd5b68c5afeb8f7c2f0f611758ae579480093db7c1388658ae6ae74a
copia temporal borrada al terminar
```

```
> cargo tree -p nucleo -e normal
nucleo v0.1.0 (C:\Users\Juan Fernández\Documents\Proyectos\ChatCouncil\crates\nucleo)
> cargo fmt --all --check            -> exit 0
> cargo clippy --workspace --all-targets -- -D warnings -> exit 0
> cargo test --workspace             -> nucleo 35 passed, 1 ignored; app, paneles 0; exit 0
```

CI: https://github.com/juanfernandezzz/ChatCouncil/actions/runs/42855355924 · success · 6b725c3ca03075b322de2a5f787c2da8e0628bf9

Notes:
- REG-017 trasladado a PART-005 (D13).
- En Windows el handle de agregar manda seek+write al final y rechaza set_len; la prueba del caso de falla es cfg(windows). En Linux O_APPEND permite ftruncate: no verificado en otras plataformas.
- La lectura no coerciona tipos como Newtonsoft (número a texto, "3" a int) ni empareja claves sin distinguir mayúsculas: queda como shortcut comentado en registro.rs; la Unity nunca escribe así.
- La Puerta recibe el integrador y el largo del pool en vez de RolesElegidos y el pool, que llegan con sus partes.
