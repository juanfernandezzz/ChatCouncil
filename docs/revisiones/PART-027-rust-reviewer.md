# Revisión PART-027 · rust-reviewer

Revisión independiente (agente ecc:rust-reviewer) del diff de la rama part-027: control de lectura del operador (D2–D6) y botón «Buscar actualizaciones» (D44). Sin hallazgos de severidad alta; INV-ARR-001 se sostiene y el registro sigue append-only.

| # | Severidad | Hallazgo | Decisión |
|---|---|---|---|
| 1 | media | `actualizar_ahora`, `ofrecer` y `buscar` no miraban si ya había una descarga en curso (doble escritura del instalador) | Corregido: salen si `aviso_progreso >= 0` |
| 2 | media | `situacion_de_panel` lee el .marcas y recalcula los controles en cada sondeo (1500 ms) de un panel capturado | Sin cambio: reportado. Sin medición propia todavía; queda para la medición de la etapa |
| 3 | baja | Doc de `aviso_de_bucle` quedó pegado a `lectura_de_salida` | Corregido |
| 4 | baja | `unreachable!` en `texto_de_lectura` con entrada libre | Sin cambio: solo recibe valores de `controles_redaccion`; reportado |
| 5 | baja | «Buscando…» podría quedar pegado si el hilo muere | Sin cambio: `publicada()` tiene techo de 15 s y no hace unwrap |
| 6 | baja | La prueba de INV-ARR-001 cuenta cadenas solo en actualizador.rs | Sin cambio: reportado |
| 7 | baja | La prueba de la ventana no cubre el camino `ofrecer` (otro diálogo abierto) | Sin cambio: reportado |
| 8 | baja | Espera vacua en pruebaronda para el operador sin aviso | Corregido: se deja pasar un ciclo entero del sondeo |
| 9 | cosmético | Mayúscula tras los dos puntos en el aviso de lectura | Sin cambio |
