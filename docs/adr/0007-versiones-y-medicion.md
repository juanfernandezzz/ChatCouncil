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
