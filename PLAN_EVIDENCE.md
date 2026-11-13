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

### PART-007

Máquina de la ronda portada: 38 pruebas ronda en verde (corrida entera y de nueve lecturas iguales a la Unity, umbral, aviso de prompts, reabierta con marcas del redactor, REG-016, RON-015/016, ESC-013); caso de falla sin pool: la operación se niega, no escribe y el paso sigue en capturar (rojo umbral→verde); gates fmt, clippy -D warnings, 133 pruebas workspace, nucleo sin dependencias; revisión ecc:rust-reviewer sin hallazgos de corrección; commit 39d44c6, CI https://github.com/juanfernandezzz/ChatCouncil/actions/runs/43060727695 success

Artifacts:
- cargo test -p nucleo ronda

### PART-008

Informe final en .md igual al de la Unity (vector InformeDeRonda) y PDF Carta con typst 0.15.1 en el crate informe-pdf: 16 pruebas informe del nucleo y 9 de informe-pdf en verde (INF-002 a INF-006, INF-008 a INF-014, INV-INF-001 a 003; cada pagina 612 x 792 pt y una /MediaBox por pagina); caso de falla: hallazgo citado inexistente se informa como en la Unity (rojo a verde, p008-rojo-referencia.txt y p008-verde-referencia.txt); D20: catch_unwind, temporal y renombrado sin pisar, solo http/https/mailto clicables, cobertura de glifos declarada (rojo a verde en p008-c1-*.txt y p008-c2-*.txt); zona horaria: sondeo con +14 h y -11 h, 145 pruebas pasan (p008-c3-rojo.txt); gates fmt, clippy -D warnings, test --workspace (154 pasan, 2 ignoradas), nucleo sin dependencias (p008-gates-d20.txt); revision ecc:rust-reviewer sin hallazgos de correccion, menores 2, 3 y 7 aplicados; medicion orientativa (D16): PDF de 70 paginas en frio 690, 691, 687 ms, mediana 690 ms, CPU 1 % antes y 21 % despues (p008-medicion.txt); comparacion contra M4: E8 (D16); commits 8554feb, 1efb87e, 08a9a80, 21629f6, 99574dd; CI https://github.com/juanfernandezzz/ChatCouncil/actions/runs/43151537888 success

Artifacts:
- cargo test -p nucleo informe
- cargo test -p informe-pdf
- cargo fmt --all --check
- cargo clippy --workspace -- -D warnings
- cargo test --workspace
- cargo tree -p nucleo -e normal
- cargo run --release -p informe-pdf --example medir

### PART-009

VER-009, INV-VER-002 e INV-VER-003 probados. nucleo/urls.rs decide que se pide (solo http/https, nunca local ni privada), HEAD con respaldo GET en un solo tiempo de 10 s, en paralelo, tope de 20 por verificacion, y una verificacion ya comprobada no vuelve a la red; el registro de la corrida entera queda igual byte a byte al de la Unity. Cliente en crates/verificacion (ureq 3.5.1 + rustls, sin tokio): sin cookies ni encabezados propios, 50 saltos, sin leer el cuerpo; 6 pruebas contra un servidor en 127.0.0.1 (200, 301, 404, HEAD rechazado, bucle de redirecciones, tiempo agotado, cuerpo sin leer). Caso de falla en rojo y verde: sin el tiempo el servidor mudo cuelga 5 s (p009-cliente-rojo.txt); tiempo agotado se informa 'sin respuesta en 10 s' como la Unity. Revision ecc:rust-reviewer: 10 hallazgos, 4 arreglados con rojo/verde (punto final en IPv4, IPv4 dentro de IPv6, host con % o controles, temporal ajeno del PDF); el resto reportado. Gates: fmt 0, clippy -D warnings 0, test --workspace 166 pasan 2 ignoradas, cargo tree -p nucleo -e normal sin dependencias. CI b0414f3 run 43155059278 success. Commits fa5d25d y b0414f3.

Artifacts:
- cargo test -p nucleo urls: 5 passed (C:\cc-target\tmp\p009-gates.txt)

### PART-010

AJU-001..010, INV-AJU-001/002, DIA-002/003/005 e INV-DIA-001 probados en nucleo/ajustes.rs y nucleo/diagnosticos.rs, como la Unity; armar el informe comprueba primero las URL (INF-001, INF-007). Caso de falla en rojo y verde: con un perfil falso (Cookies y Local State) ningun tramo de 8 bytes llega al diagnostico ni al mensaje (p010-rojo.txt, p010-verde.txt). Tabla de cobertura bench/resultados/e6-cobertura.txt: 147 requisitos, 137 de E6, 0 sin prueba; anotados INF-013 y DIA-001 para E7 y DIA-004 para E8 (no se prueban sin interfaz ni paneles). Mediciones en bench/resultados/e6-nucleo.json: PDF de 70 paginas en frio mediana 926 ms (822/926/1061, CPU 23-42 %, orientativo; serie previa 690 ms con CPU 1-21 %), en caliente 119 ms, armar el .md 20,5 ms; medir.exe 46.036.480 bytes, binario de prueba del nucleo 4.521.984. Revision ecc:rust-reviewer: sin criticos; arreglado con rojo/verde el proveedor que sale de diagnosticos/ (p010-revision-rojo.txt, p010-revision-verde.txt); el resto reportado. Gates: fmt 0, clippy -D warnings 0, test --workspace 180 pasan 2 ignoradas, cargo tree -p nucleo -e normal sin dependencias. CI 163544e run 43175448458 success. Commit 163544e.

Artifacts:
- cargo test --workspace: nucleo 164 passed, informe-pdf 10, verificacion 6 (C:\cc-target\tmp\p010-gates.txt)

### PART-011

Esqueleto de E7 probado: ventana Slint y panel wry comparten ventana y bucle de eventos (ADR-0010). paneles como biblioteca (navegador en <datos>/navegador con tres switches, panel hijo, navegar, ejecutar, correr el script de pagina por pedido y consulta, cc-prueba.test); datos/pagina/pagina.js identico a la Unity (sha256 39b048ce...5161, prueba DAT-003); app ChatCouncilNueva con area que se reacomoda, carpeta de datos (-datos o LOCALAPPDATA), Puerta en su hilo y -autoprueba RUTA (PRU-001). Autoprueba 7/7 codigo 0 en local (WebView2 157.0.4341.46) y en CI (156.0.4314.58); caso de falla real: UA reducido dio 6/7 codigo 1, rojo a verde; paso de CI probado en rojo (sin archivo, codigo 1) y verde. Revision ecc:rust-reviewer: 11 hallazgos; arreglado con rojo/verde una bandera sin valor que caia a la carpeta real (5dbd7ff); el resto reportado. Mediciones orientativas (D16) en bench/resultados/e7-esqueleto.json: exe 10.822.144 B, ventana mediana 865 ms, RAM app 56 MB, WebView2 7 procesos 323 MB, CPU en reposo app 0 ms en 30 s. Gates: fmt 0, clippy --all-targets -D warnings 0, test --workspace (app 8, informe-pdf 10, nucleo 172 y 4 ign., paneles 3, verificacion 10 y 1 ign.), cargo tree -p nucleo -e normal solo nucleo. Commits 08ceeac, bbf5a47, 5dbd7ff, 9fca766; CI https://github.com/juanfernandezzz/ChatCouncil/actions/runs/43326911323 success.

Artifacts:
- cargo fmt --all --check: 0
- cargo clippy --workspace --all-targets -- -D warnings: 0
- cargo test --workspace: 203 passed, 5 ignored (C:\cc-target\tmp\p011-gates.txt)
- cargo tree -p nucleo -e normal: nucleo v0.1.0 (C:\cc-repo\crates\nucleo)
- ChatCouncilNueva.exe -autoprueba: Resultado 7/7, codigo 0 (local y CI run 43326911323)
- medir-e7.ps1: bench/resultados/e7-esqueleto.json

### PART-012

Paneles completos con paridad de panel.cpp: perfiles por proveedor, emergentes en el mismo perfil (registro hasta WM_CLOSE, una segunda no cierra la primera), foco y teclas (Tab y F1-F5 vuelven a la app, B2 con agent-desktop y capturas), cierres de sesion bloqueados, borrado por sitio con origen como Uri.GetLeftPart, borrar el perfil entero solo con paginas de prueba, adjuntar por DOM.setFileInputFiles (aviso si el archivo no existe), PAN-014 en informe-pdf. Autoprueba 35/35 codigo 0 en local (WebView2 157.0.4341.46) y en CI. Revision ecc:rust-reviewer: 8 hallazgos mas bajos; arreglados con rojo/verde origen (unit test), emergente liberada, segunda emergente, borrar perfil sin paginas de prueba, adjuntar inexistente (autoprueba 31/35 rojo -> 35/35); SendInput registrado, arreglado sin rojo; Tab/F en emergentes y adjuntar por arrastre van a Serie E (E1, E2). Gates: fmt 0, clippy -D warnings 0, test --workspace 214 passed 5 ignored, cargo tree -p nucleo solo nucleo. Commit fc22ac7; CI https://github.com/juanfernandezzz/ChatCouncil/actions/runs/43367294457 success.

Artifacts:
- cargo fmt --all --check: 0
- cargo clippy --workspace --all-targets -- -D warnings: 0
- cargo test --workspace: 214 passed, 5 ignored
- cargo tree -p nucleo -e normal: nucleo v0.1.0
- ChatCouncilNueva.exe -autoprueba: Resultado 35/35, codigo 0 (C:\cc-target\tmp\autoprueba-revision-012-verde.txt; CI run 43367294457)
- rojo: C:\cc-target\tmp\autoprueba-revision-012-rojo.txt (31/35) y revision-012-rojo-origen.txt
- B2: C:\cc-target\tmp\b2-log.txt, b2-antes.png, b2-despues-teclas.png
