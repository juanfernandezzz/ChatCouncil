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

### PART-004

Operacion portada al nucleo (operacion.rs, armar_operacion en puerta.rs): cuerpos anonimizados, marcas, barajado con semilla, codigos estables y control de fugas, con el mismo resultado que la Unity. OPE-001 a OPE-014 e INV-OPE-001 a INV-OPE-004 con prueba; vectores de la Unity en verde; caso de falla claude.ai/new bloquea con el aviso de la Unity. T3 medido con D15 (enmienda a ADR-0007): siete operaciones sobre las respuestas reales de la ronda 2026-11-10 (137299 unidades UTF-16), mediana 645.5 Mciclos, dispersion 4.7 %, reloj 338-351 ms. Paso B: sin idas y vueltas Texto/UTF-16 en el camino de la operacion, 1179.5 -> 880.5 Mciclos (-25.4 %, dispersion base 6.8 %). Notas: OPE-015 y OPE-016 trasladados a PART-005 (D14). T3 medido con D15 (enmienda a ADR-0007). CI 42876264759 y 42903180138 success.

Artifacts:
- cargo test -p nucleo operacion
- cargo test --release -p nucleo medicion -- --ignored --nocapture --test-threads=1
- cargo fmt --all --check
- cargo clippy --workspace --all-targets -- -D warnings
- cargo test --workspace
- cargo tree -p nucleo -e normal
- cargo check -p nucleo --target aarch64-linux-android
- https://github.com/juanfernandezzz/ChatCouncil/actions/runs/42876264759
- https://github.com/juanfernandezzz/ChatCouncil/actions/runs/42903180138

Files:
- crates/nucleo/src/operacion.rs, puerta.rs (armar_operacion, medicion D15), texto.rs (empujar_texto), dominio.rs, lib.rs
- docs/adr/0007-versiones-y-medicion.md (enmienda D15), docs/SEGUNDA-PASADA.md
- Commits 1991c84, cdb7074, 7097ea4, b894080

Notes:
- OPE-015 y OPE-016 trasladados a PART-005 (D14).
- T3 medido con D15 (enmienda a ADR-0007). Los ciclos del hilo siguen la carga de la maquina (1590 Mciclos con 94 % de CPU, 898 con 38 %); por eso se repite hasta que la dispersion baja del 10 %.

Checks (salida real, local desde C:\cc-repo, CARGO_TARGET_DIR=C:\cc-target):

```
== Lote anterior (1991c84)
$ cargo fmt --all --check
exit=0
$ cargo clippy --workspace --all-targets -- -D warnings
    Checking nucleo v0.1.0 (C:\Users\Juan Fernández\Documents\Proyectos\ChatCouncil\crates\nucleo)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 1.94s
exit=0
$ cargo tree -p nucleo -e normal
nucleo v0.1.0 (C:\Users\Juan Fernández\Documents\Proyectos\ChatCouncil\crates\nucleo)
exit=0
$ cargo check -p nucleo --target aarch64-linux-android
    Checking nucleo v0.1.0 (C:\Users\Juan Fernández\Documents\Proyectos\ChatCouncil\crates\nucleo)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.93s
exit=0
$ cargo test -p nucleo operacion -- --nocapture
resultado: Err("cuerpo anonimizado filtra identidad de proveedor por URL (1): https://claude.ai/new")
test operacion::pruebas::operacion_caso_de_falla_claude_ai_new_bloquea_con_el_aviso_de_la_unity ... ok
test operacion::pruebas::operacion_el_barajado_es_el_de_la_unity_y_no_toca_la_entrada ... ok
test operacion::pruebas::operacion_anonimizar_da_etiquetas_textos_sello_y_conteo_de_la_unity ... ok
test operacion::pruebas::operacion_el_cuerpo_con_fuentes_es_el_de_la_unity ... ok
test operacion::pruebas::operacion_el_cuerpo_limpio_pasa_y_el_que_delata_al_proveedor_tira ... ok
test operacion::pruebas::operacion_el_hash_de_la_semilla_es_el_de_la_unity ... ok
test operacion::pruebas::operacion_el_barajado_es_uniforme ... ok
test operacion::pruebas::operacion_la_comprobacion_cruzada_tira_si_el_cuerpo_incluye_la_respuesta_propia ... ok
test operacion::pruebas::operacion_la_integridad_distingue_completo_truncado_e_indeterminado ... ok
test operacion::pruebas::operacion_la_query_solo_conserva_model ... ok
test operacion::pruebas::operacion_las_fugas_son_las_de_la_unity ... ok
test operacion::pruebas::operacion_las_marcas_van_en_el_primer_blanco_despues_del_intervalo ... ok
test operacion::pruebas::operacion_los_codigos_estables_siguen_el_orden_del_pool ... ok
test operacion::pruebas::operacion_la_perdida_se_localiza_en_el_segmento_que_cambio ... ok
test operacion::pruebas::operacion_los_prompts_de_operacion_son_los_de_la_unity ... ok
test operacion::pruebas::operacion_los_terminos_se_tapan_por_punto_de_codigo ... ok
test operacion::pruebas::operacion_terminos_token_y_conocidos_son_los_de_la_unity ... ok
test operacion::pruebas::operacion_un_enlace_a_la_interfaz_del_proveedor_sigue_siendo_fuga ... ok
test operacion::pruebas::operacion_una_fuente_de_docs_o_blog_de_un_proveedor_no_es_fuga ... ok
test operacion::pruebas::operacion_un_marcador_dentro_de_la_pregunta_queda_literal ... ok
test operacion::pruebas::operacion_los_cuerpos_son_los_de_la_unity ... ok
test puerta::pruebas::operacion_sin_ronda_sin_pregunta_o_con_faltantes_se_niega_con_el_motivo_de_la_unity ... ok
test puerta::pruebas::operacion_un_operador_fuera_del_pool_no_tiene_cuerpo ... ok
test puerta::pruebas::operacion_una_ronda_sin_semilla_se_niega_y_no_escribe_sello ... ok
test operacion::pruebas::operacion_cada_cuerpo_excluye_la_respuesta_de_su_operador ... ok
el sello ya persistido para la ronda 00000000-0000-4000-8000-000000000003 no coincide con el que se acaba de calcular (la etiqueta "Modelo G" no coincide: persistido {codigoEstable:P6, panelSourceId:kimi, replyId:00000000-0000-4000-8000-000000000012, attemptId:00000000-0000-4000-8000-000000000012} vs calculado {codigoEstable:P6, panelSourceId:kimi, replyId:corregida, attemptId:corregida}) — posible cambio en las respuestas, la semilla o el orden del pool entre consolidaciones. No se escribió nada.
test puerta::pruebas::operacion_con_el_sello_ya_escrito_una_respuesta_cambiada_se_niega_sin_escribir ... ok
test puerta::pruebas::operacion_la_corrida_de_la_unity_da_los_mismos_sellos_y_prompts ... ok
test result: ok. 27 passed; 0 failed; 0 ignored; 0 measured; 44 filtered out; finished in 1.17s
$ cargo test --workspace
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 70 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 1.67s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
exit=0

== Linea base D15 del paso B (codigo 1991c84+cdb7074), intentos 1 a 4; vale el 3
D15: mediana 1006.7 Mciclos, dispersion 13.2 % (no vale, repetir)
D15: mediana 1375.2 Mciclos, dispersion 23.9 % (no vale, repetir)
D15: mediana 1179.5 Mciclos, dispersion 6.8 % (vale)
D15: mediana 1010.0 Mciclos, dispersion 23.4 % (no vale, repetir)

== Con el cambio del paso B, intentos 1 a 3
D15: mediana 880.5 Mciclos, dispersión 2.2 % (vale)
D15: mediana 652.2 Mciclos, dispersión 15.1 % (no vale, repetir)
D15: mediana 644.9 Mciclos, dispersión 3.3 % (vale)

== T3 final (b894080)
> cargo test --release -p nucleo medicion -- --ignored --nocapture --test-threads=1
test puerta::pruebas::operacion_medicion_con_las_respuestas_de_la_ronda_2026_11_10 ... respuestas: 7, unidades UTF-16: 137299
corrida 1: siete operaciones 659.0 Mciclos, reloj 351.18 ms, CPU de la máquina 40.9 % (chatgpt 106.1 Mciclos 108.12 ms, gemini 94.9 Mciclos 43.93 ms, claude 94.2 Mciclos 41.44 ms, grok 87.8 Mciclos 37.97 ms, mistral 84.2 Mciclos 36.95 ms, kimi 87.7 Mciclos 38.14 ms, perplexity 83.8 Mciclos 36.13 ms)
corrida 2: siete operaciones 628.8 Mciclos, reloj 337.74 ms, CPU de la máquina 27.5 % (chatgpt 105.0 Mciclos 107.74 ms, gemini 83.8 Mciclos 39.65 ms, claude 83.7 Mciclos 36.19 ms, grok 84.6 Mciclos 37.16 ms, mistral 84.8 Mciclos 36.58 ms, kimi 85.7 Mciclos 36.93 ms, perplexity 81.7 Mciclos 35.24 ms)
corrida 3: siete operaciones 645.5 Mciclos, reloj 349.02 ms, CPU de la máquina 55.4 % (chatgpt 120.7 Mciclos 116.78 ms, gemini 91.0 Mciclos 44.31 ms, claude 89.0 Mciclos 38.46 ms, grok 82.1 Mciclos 35.24 ms, mistral 76.4 Mciclos 33.38 ms, kimi 84.6 Mciclos 36.92 ms, perplexity 81.8 Mciclos 35.59 ms)
D15: mediana 645.5 Mciclos, dispersión 4.7 % (vale)
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 72 filtered out; finished in 1.10s

== Este lote (b894080)
$ cargo fmt --all --check
exit=0
$ cargo clippy --workspace --all-targets -- -D warnings
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.31s
exit=0
$ cargo test --workspace
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 71 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out; finished in 1.29s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
$ cargo test -p nucleo operacion
test operacion::pruebas::operacion_caso_de_falla_claude_ai_new_bloquea_con_el_aviso_de_la_unity ... ok
test operacion::pruebas::operacion_anonimizar_da_etiquetas_textos_sello_y_conteo_de_la_unity ... ok
test operacion::pruebas::operacion_el_barajado_es_el_de_la_unity_y_no_toca_la_entrada ... ok
test operacion::pruebas::operacion_el_cuerpo_con_fuentes_es_el_de_la_unity ... ok
test operacion::pruebas::operacion_el_cuerpo_limpio_pasa_y_el_que_delata_al_proveedor_tira ... ok
test operacion::pruebas::operacion_el_hash_de_la_semilla_es_el_de_la_unity ... ok
test operacion::pruebas::operacion_el_barajado_es_uniforme ... ok
test operacion::pruebas::operacion_la_integridad_distingue_completo_truncado_e_indeterminado ... ok
test operacion::pruebas::operacion_la_comprobacion_cruzada_tira_si_el_cuerpo_incluye_la_respuesta_propia ... ok
test operacion::pruebas::operacion_la_query_solo_conserva_model ... ok
test operacion::pruebas::operacion_las_fugas_son_las_de_la_unity ... ok
test operacion::pruebas::operacion_las_marcas_van_en_el_primer_blanco_despues_del_intervalo ... ok
test operacion::pruebas::operacion_los_codigos_estables_siguen_el_orden_del_pool ... ok
test operacion::pruebas::operacion_los_prompts_de_operacion_son_los_de_la_unity ... ok
test operacion::pruebas::operacion_la_perdida_se_localiza_en_el_segmento_que_cambio ... ok
test operacion::pruebas::operacion_los_terminos_se_tapan_por_punto_de_codigo ... ok
test operacion::pruebas::operacion_terminos_token_y_conocidos_son_los_de_la_unity ... ok
test operacion::pruebas::operacion_un_enlace_a_la_interfaz_del_proveedor_sigue_siendo_fuga ... ok
test operacion::pruebas::operacion_un_marcador_dentro_de_la_pregunta_queda_literal ... ok
test operacion::pruebas::operacion_una_fuente_de_docs_o_blog_de_un_proveedor_no_es_fuga ... ok
test operacion::pruebas::operacion_los_cuerpos_son_los_de_la_unity ... ok
test puerta::pruebas::operacion_medicion_con_las_respuestas_de_la_ronda_2026_11_10 ... ignored
test puerta::pruebas::operacion_sin_ronda_sin_pregunta_o_con_faltantes_se_niega_con_el_motivo_de_la_unity ... ok
test operacion::pruebas::operacion_cada_cuerpo_excluye_la_respuesta_de_su_operador ... ok
test puerta::pruebas::operacion_un_operador_fuera_del_pool_no_tiene_cuerpo ... ok
test puerta::pruebas::operacion_una_ronda_sin_semilla_se_niega_y_no_escribe_sello ... ok
test puerta::pruebas::operacion_con_el_sello_ya_escrito_una_respuesta_cambiada_se_niega_sin_escribir ... ok
test puerta::pruebas::operacion_la_corrida_de_la_unity_da_los_mismos_sellos_y_prompts ... ok
test result: ok. 27 passed; 0 failed; 1 ignored; 0 measured; 45 filtered out; finished in 0.97s
$ cargo tree -p nucleo -e normal
nucleo v0.1.0 (C:\Users\Juan Fernández\Documents\Proyectos\ChatCouncil\crates\nucleo)
$ cargo check -p nucleo --target aarch64-linux-android
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.10s

== CI
42876264759 (1991c84) success; 42903180138 (b894080) success, job rust success
```

### PART-005

Parseos de hallazgos, verificación, título, rescate, texto desde html y citas portados de la Unity con sus vectores; OPE-015/OPE-016/REG-017 en Puerta con las 83 líneas de la corrida idénticas; caso de falla rojo/verde; revisión: 1 corrección (surrogate en la ronda copiada) rojo/verde en 7bc1e44; gates y CI verdes

Artifacts:
- == Caso de falla rojo (sin la comprobación de prefijo exacto en la categoría)
$ cargo test -p nucleo parseos_una_linea_con_categoria_desconocida
test parseos::pruebas::parseos_una_linea_con_categoria_desconocida_no_se_cuenta_como_hallazgo ... FAILED
thread 'parseos::pruebas::parseos_una_linea_con_categoria_desconocida_no_se_cuenta_como_hallazgo' (8880) panicked at crates\nucleo\src\parseos.rs:1630:9:
assertion `left == right` failed
  left: 2
 right: 1
test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 86 filtered out; finished in 0.00s
== Verde (restaurada)
test parseos::pruebas::parseos_una_linea_con_categoria_desconocida_no_se_cuenta_como_hallazgo ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 86 filtered out; finished in 0.00s
== Revisión PART-005, hallazgo 1, rojo
> cargo test -p nucleo parseos_la_ronda_copiada_conserva (antes de corregir)
test puerta::pruebas::parseos_la_ronda_copiada_conserva_un_surrogate_suelto_de_la_pregunta ... FAILED
thread 'puerta::pruebas::parseos_la_ronda_copiada_conserva_un_surrogate_suelto_de_la_pregunta' (13104) panicked at crates\nucleo\src\puerta.rs:1660:9:
assertion `left == right` failed
  left: "�¿Qué dice la evidencia sobre la dosis?"
 right: "�¿Qué dice la evidencia sobre la dosis?"
test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 90 filtered out; finished in 0.16s
error: test failed, to rerun pass `-p nucleo --lib`
== Revisión PART-005, hallazgo 1, verde
> cargo test -p nucleo parseos_la_ronda_copiada_conserva (después de corregir)
test puerta::pruebas::parseos_la_ronda_copiada_conserva_un_surrogate_suelto_de_la_pregunta ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 90 filtered out; finished in 0.22s
== Gates (7bc1e44)
$ cargo fmt --all --check
exit=0
$ cargo clippy --workspace --all-targets -- -D warnings
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 1.85s
exit=0
$ cargo test --workspace
     Running unittests src\main.rs (C:/cc-target\debug\deps\app-cd3acd9fad645514.exe)
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
     Running unittests src\lib.rs (C:/cc-target\debug\deps\nucleo-53d05d404b816f44.exe)
test result: ok. 89 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out; finished in 1.27s
     Running unittests src\main.rs (C:/cc-target\debug\deps\paneles-d348e8139be3bf52.exe)
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
exit=0
$ cargo tree -p nucleo -e normal
nucleo v0.1.0 (C:\Users\Juan Fernández\Documents\Proyectos\ChatCouncil\crates\nucleo)
$ cargo test -p nucleo parseos
test dominio::pruebas::parseos_las_etiquetas_validas_salen_del_sello_sin_la_del_operador ... ok
test parseos::pruebas::parseos_el_cuerpo_del_redactor_en_markdown_sin_los_controles_de_la_pagina ... ok
test parseos::pruebas::parseos_el_titulo_y_la_seccion_de_rescate_son_los_mismos_que_en_la_unity ... ok
test parseos::pruebas::parseos_el_texto_desde_html_es_el_mismo_que_en_la_unity ... ok
test parseos::pruebas::parseos_la_verificacion_capturada_por_bloques_no_trae_el_razonamiento ... ok
test parseos::pruebas::parseos_la_cita_del_verificador_sin_entidades_y_con_sus_comillas ... ok
test parseos::pruebas::parseos_los_cuatro_descartes_y_el_chip_inline_contra_la_lista_de_fuentes ... ok
test parseos::pruebas::parseos_la_verificacion_es_la_misma_que_en_la_unity ... ok
test parseos::pruebas::parseos_los_hallazgos_son_los_mismos_que_en_la_unity ... ok
test parseos::pruebas::parseos_nfd_descompone_ordena_y_deja_el_surrogate_suelto ... ok
test parseos::pruebas::parseos_tension_se_lee_y_una_etiqueta_inexistente_queda_marcada ... ok
test parseos::pruebas::parseos_un_punto_de_codigo_fuera_de_rango_tira_como_en_la_unity ... ok
test parseos::pruebas::parseos_las_citas_son_las_mismas_que_en_la_unity ... ok
test parseos::pruebas::parseos_una_linea_con_categoria_desconocida_no_se_cuenta_como_hallazgo ... ok
test puerta::pruebas::parseos_reuso_sin_ronda_sin_sello_o_fuera_del_pool_se_niega_sin_escribir ... ok
test puerta::pruebas::parseos_la_ronda_copiada_conserva_un_surrogate_suelto_de_la_pregunta ... ok
test puerta::pruebas::parseos_reuso_la_ronda_copiada_y_la_operacion_reutilizada_son_las_de_la_unity ... ok
test result: ok. 17 passed; 0 failed; 0 ignored; 0 measured; 74 filtered out; finished in 0.63s
$ cargo check -p nucleo --target aarch64-linux-android
    Checking nucleo v0.1.0 (C:\Users\Juan Fernández\Documents\Proyectos\ChatCouncil\crates\nucleo)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 3.95s

== CI
42969722729 (7bc1e44) success, job rust success: https://github.com/juanfernandezzz/ChatCouncil/actions/runs/42969722729

### PART-006

Prompts del integrador, los verificadores y el redactor, archivo del redactor con marcas, ControlesRedaccion, trazabilidad (INT-006), verificaciones vigentes (VER-007), verificación de lo escrito (ESC-010, ESC-011) y nombre del informe, portados de la Unity e iguales a sus vectores carácter por carácter; sustitución de una sola pasada con caso de falla rojo/verde; DAT-001/DAT-002 mapeados a specs_json_coincide_con_dat_001 y prompts_coinciden_con_dat_002; el tope de 20 URL (VER-01) es de la verificación de URL (PART-009), no de los prompts; revisión aprobada sin correcciones; gates y CI verdes

Artifacts:
- == Caso de falla rojo (sustituir de varias pasadas, temporal)
$ cargo test -p nucleo prompts
test operacion::pruebas::operacion_los_prompts_de_operacion_son_los_de_la_unity ... FAILED
test prompts::pruebas::prompts_los_de_los_roles_son_los_mismos_que_en_la_unity ... FAILED
test prompts::pruebas::prompts_un_marcador_dentro_del_texto_sustituido_no_se_vuelve_a_sustituir ... FAILED
thread 'prompts::pruebas::prompts_un_marcador_dentro_del_texto_sustituido_no_se_vuelve_a_sustituir' (9828) panicked at crates\nucleo\src\prompts.rs:659:9:
assertion failed: contiene(&armar_prompt_integrador(&pregunta, &hallazgos), &pregunta)
test result: FAILED. 17 passed; 3 failed; 0 ignored; 0 measured; 88 filtered out; finished in 0.69s
== Verde (sustituir de una pasada restaurado)
$ cargo test -p nucleo prompts
test datos::pruebas::prompts_coinciden_con_dat_002 ... ok
test dominio::pruebas::prompts_las_verificaciones_vigentes_van_en_el_orden_de_los_verificadores ... ok
test operacion::pruebas::operacion_los_prompts_de_operacion_son_los_de_la_unity ... ok
test operacion::pruebas::prompts_el_de_un_rol_se_verifica_por_igualdad ... ok
test operacion::pruebas::prompts_las_verificaciones_se_anonimizan_como_en_la_unity ... ok
test parseos::pruebas::prompts_el_informe_sembrado_de_guard_trazabilidad ... ok
test parseos::pruebas::prompts_la_trazabilidad_es_la_misma_que_en_la_unity ... ok
test parseos::pruebas::prompts_el_nombre_del_informe_es_el_mismo_que_en_la_unity ... ok
test operacion::pruebas::prompts_la_operacion_escrita_se_verifica_como_en_la_unity ... ok
test prompts::pruebas::prompts_el_archivo_del_redactor_es_el_mismo_que_en_la_unity ... ok
test prompts::pruebas::prompts_la_tabla_de_hallazgos_es_la_misma_que_en_la_unity ... ok
test prompts::pruebas::prompts_los_controles_del_redactor_son_los_mismos_que_en_la_unity ... ok
test prompts::pruebas::prompts_un_dominio_del_material_enlazado_solo_no_cuenta_como_fuera_del_material ... ok
test prompts::pruebas::prompts_los_de_los_roles_son_los_mismos_que_en_la_unity ... ok
test prompts::pruebas::prompts_un_marcador_dentro_del_texto_sustituido_no_se_vuelve_a_sustituir ... ok
test puerta::pruebas::prompts_el_verificador_sin_informe_o_sin_rescate_se_niega ... ok
test puerta::pruebas::prompts_el_redactor_sin_verificacion_se_arma_y_avisa ... ok
test puerta::pruebas::prompts_los_de_los_roles_en_la_corrida_son_los_de_la_unity ... ok
test puerta::pruebas::prompts_los_roles_sin_ronda_semilla_o_pregunta_se_niegan_con_el_motivo_de_la_unity ... ok
test puerta::pruebas::operacion_la_corrida_de_la_unity_da_los_mismos_sellos_y_prompts ... ok
test result: ok. 20 passed; 0 failed; 0 ignored; 0 measured; 88 filtered out; finished in 1.19s
$ cargo fmt --all --check
exit=0
$ cargo clippy --workspace --all-targets -- -D warnings
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.31s
$ cargo test --workspace
     Running unittests src\main.rs (C:/cc-target\debug\deps\app-cd3acd9fad645514.exe)
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
     Running unittests src\lib.rs (C:/cc-target\debug\deps\nucleo-53d05d404b816f44.exe)
test result: ok. 106 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out; finished in 1.84s
     Running unittests src\main.rs (C:/cc-target\debug\deps\paneles-d348e8139be3bf52.exe)
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
exit=0
$ cargo tree -p nucleo -e normal
nucleo v0.1.0 (C:\Users\Juan Fernández\Documents\Proyectos\ChatCouncil\crates\nucleo)

== Revisión ecc:rust-reviewer: aprobado, sin hallazgos de corrección ni de seguridad de datos; 2 de diseño y 3 de estilo reportados sin aplicar

== CI
42988568859 (3e34faf) success, job rust success: https://github.com/juanfernandezzz/ChatCouncil/actions/runs/42988568859
