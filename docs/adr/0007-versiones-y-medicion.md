# ADR-0007 · Versiones y medición

- Estado: aceptado
- Fecha: 2026-11-10
- Decidió: Juan (E4: Q8 y Q11); regla de medición de Claude (2026-11-09)

## Decisión

- Todo lo que usa solo este proyecto va en su última versión estable: Rust (canal stable en rust-toolchain.toml), crates, Slint, wry, Build Tools, plannable (tarea programada «plannable-actualizar»), agent-desktop y gh. Se revisa al empezar cada etapa. La app ChatCouncil-Unity y su repo no se actualizan.
- Cada medición registra las versiones con que se hizo. La comparación final contra la Unity (E8) mide las dos apps en la misma sesión.
- Antes de medir: la app Claude minimizada y la CPU de la máquina en reposo registrada; si supera el 10 %, la medición no vale y se repite.

## Consecuencias

- Una actualización puede cambiar un número entre mediciones de días distintos; por eso las comparaciones que deciden se hacen en la misma sesión.

## Enmienda · 2026-11-10 · D15 · Medición de funciones puras del núcleo

Una función pura del núcleo (sin interfaz, red ni disco en el tramo medido) se mide por los ciclos de CPU del hilo que la corre (QueryThreadCycleTime en Windows), mediana de 3 corridas en release, con el tiempo de reloj y la CPU de la máquina anotados al lado. Esos ciclos solo cuentan mientras el hilo corre, así que la carga de otros procesos casi no los altera, y la medición vale aunque la máquina pase del 10 %. Si la dispersión entre las 3 corridas (máximo menos mínimo, sobre la mediana) supera el 10 %, la medición no vale y se repite.

La regla del 10 % de CPU en reposo sigue rigiendo para todo tiempo de reloj, arranque, RAM y CPU de procesos, y para toda comparación entre apps (E8).

Motivo: PART-004 no pudo medirse en 40 minutos de espera por carga ajena al trabajo (Defender 60 a 70 %, la app Unity instalada abierta).
