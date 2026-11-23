# Revisión PART-027 · limpieza total (repo-cleanup)

## Qué pidió la skill y no se hizo (LÍMITES del lote)
- Archivar antes de borrar, crear `docs/cleanup-reports/`, mover/reorganizar archivos, actualizar `.gitignore`, crear tags y preguntar al usuario: fuera del lote (D42.4, F4, LÍMITES). El historial de git conserva lo borrado.

## Borrado (1 archivo)
| Ruta | Motivo |
|---|---|
| `docs/D18-asignacion.tsv` | Tabla de asignación de requisitos de la decisión D18 (252 líneas). Ningún archivo lo cita por ruta ni por nombre; ninguna prueba ni el CI lo lee. Recuperable con `git show c1135df:docs/D18-asignacion.tsv`. |

## Revisado y conservado
| Ruta | Por qué se queda |
|---|---|
| `prototipos/` (397 MB, sin versionar) | `bench/resultados/e3-controlada.json` (protegido) apunta a rutas dentro. No está en git: borrarlo no se puede deshacer. **Decisión para Juan.** |
| `herramientas/extraer-vectores.mjs` | Lo cita `plans/PART2_PLAN.ai.md` (protegido). |
| `docs/specs/E6, E7, E8` | Los citan `plans/PART10, 11, 18, 19, 20`. |
| `docs/E7-requisitos.md` | Lo citan `docs/specs/E7` y `E8`. |
| `docs/agents/*` | Los cita `CLAUDE.md`. |
| `docs/investigacion/` | Lo leen pruebas de `informe-pdf` y de `nucleo`. |
| `.impeccable/` | Caché sin versionar de un hook; se recrea. No aporta borrarlo. |

## Código muerto y dependencias
- `cargo clippy --workspace -- -D warnings`: sin avisos de código sin uso. No se quitó código.
- `cargo machete --with-metadata` (0.10.1): «didn't find any unused dependencies». Cargo.toml y Cargo.lock sin cambios.

## Medición (F7), una corrida de cada una, orientativa (D16)
Método: `cargo build --release -p app` desde `C:\cc-repo` con `CARGO_TARGET_DIR` nuevo y vacío para cada corrida (`rel-antes`, `rel-despues`), tiempo con Stopwatch de PowerShell, tamaño de `ChatCouncilNueva.exe`. Sin otras cargas de compilación durante cada corrida.
| | Antes | Después |
|---|---|---|
| Compilación limpia | 1922 s | 1871 s |
| Ejecutable | 58 599 424 bytes | 58 599 424 bytes |
El cambio no toca Rust: la diferencia de tiempo (51 s) es ruido, no una mejora. El tamaño es idéntico.

## Revisión ponytail-review del PR 6 (fe2b3dd..main)
Veredicto: Ship, sin bugs ni riesgos de seguridad ni pérdida de datos. Pendientes, ninguno bloquea:
1. `lectura_registrada` duplica a `lectura_de_operador` (operacion.rs); unificar (-8 líneas).
2. `situacion_de_panel` lee `.marcas` y parsea el HTML completo en cada sondeo de 1500 ms; sin medición. Pasar `html: None` o cachear.
3. `solo_el_boton_instala` cuenta texto solo en actualizador.rs; falta comprobar el único llamador en interfaz.rs.
4. La prueba de la ventana no cubre el camino `ofrecer` (otro diálogo abierto).
5. `texto_de_lectura` es pública con `unreachable!`; falta una prueba con los cinco valores.
6. «Buscando…» queda pegado si el hilo muere (muy improbable).
7. La línea «Tienes la última versión» no se limpia al salir de Ayuda.
8. Mayúscula tras los dos puntos en el aviso de lectura.

## Validación
fmt --check, clippy -D warnings y cargo test --workspace en verde tras el borrado.
