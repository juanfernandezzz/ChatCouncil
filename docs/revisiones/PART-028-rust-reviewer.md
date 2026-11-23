# PART-028 · Revisión independiente (ecc:rust-reviewer y ponytail-review)

Alcance: el diff de la rama part-028 (actualizador.rs, interfaz.rs, pruebainterfaz.rs, operacion.rs, puerta.rs, pruebaronda.rs, medicion_tiempos_e9.rs). Solo lectura por parte del agente; no compiló.

## Hallazgos del agente ecc:rust-reviewer

| # | Tipo | Hallazgo | Decisión |
|---|---|---|---|
| 1 | Bug menor | `buscar` usaba como techo de la línea el mismo `TECHO_VERSION` (15 s) que el de la red: una respuesta a los 14,9 s se descartaba y la línea decía «No se pudo revisar» aunque hubiera versión nueva. | Queda, reportado: la ventana es de milisegundos y el lote fija 15 s (C3); se probó con +2 s y se revirtió. Una respuesta de red en el último instante puede perderse; en ese caso la línea dice «No se pudo revisar…», igual que si la red agotara su techo. |
| 2 | Prueba débil | El bloque C4 solo ponía la línea a mano y cambiaba de sección: un `al_salir_de_ayuda` que no subiera el contador pasaba en verde. | Corregido: se lanza `buscar_con` con un hilo lento, se sale de Ayuda y se comprueba que el resultado tardío no pinta la línea. |
| 3 | Nit | Los dos bloques `///` quedaron pegados sobre `static BUSQUEDA`; `buscar` quedó sin doc. | Corregido. |
| 4 | Nit | `solo_el_boton_instala` analiza texto: un alias de módulo o un segundo `#[cfg(test)]` antes lo burlarían. | Queda: es una guarda barata, hoy hay un solo `#[cfg(test)]` y está al final. Reportado. |
| 5 | Nit | El bloque C6 dejaba `aviso_texto`, `aviso_boton` y `aviso_nueva` con valores viejos para fases posteriores. | Corregido: se limpian al final del bloque. |
| 6 | Nit | El bloque C3 usa tiempos reales (300 ms de techo, 1500 ms de sleep): en una máquina muy cargada podría dar falso verde. | Queda: el margen es de 2300 ms contra 1500 ms. Reportado. |
| 7 | Nit | `medir_sondeo_e9` usa unwrap/expect y pasa de 100 líneas. | Queda: es un test `#[ignore]` de medición. |
| 8 | Nit | `al_salir_de_ayuda` también corre al pasar entre secciones que no son Ayuda (limpia una cadena vacía y sube el contador). | Queda: inofensivo. |

Revisado y correcto según el agente: el contador `BUSQUEDA` (el Timer, el cierre de `upgrade_in_event_loop` y `al_salir_de_ayuda` corren en el hilo de la interfaz, así que no se intercalan; ningún número se reutiliza), la línea no queda pegada en los tres caminos, la búsqueda nunca instala por sí sola y `to_lowercase` con `flat_map` es seguro con caracteres no ASCII. No revisó pruebaronda.rs ni puerta.rs más allá de los textos esperados.

## ponytail-review (revisión propia sobre el mismo diff)

- Coincide con los hallazgos 1 a 3 del agente; el comentario de doc mal pegado era mío y ya está corregido.
- Todo lo que llama a `actualizador::` desde interfaz.rs está cubierto por `solo_el_boton_instala`; `actualizar_ahora` sigue teniendo una sola llamada.
- Hallazgo propio durante C9: pruebaronda.rs repetía los textos de lectura con mayúscula; falló 101/102 y se ajustó (evidencia en PLAN_EVIDENCE.md).
- Lean: sin líneas que sobren; el único código añadido sin función de producto es la medición `#[ignore]` pedida por C2.

## Después de las correcciones

fmt, clippy, cargo test --workspace y pruebainterfaz fases 1 a 3 (16/16, 9/9, 13/13). La parte nueva de C4 (resultado tardío tras salir de Ayuda) tiene su rojo: sin el `fetch_add` de `al_salir_de_ayuda`, la fase 3 da 12/13. Ver PLAN_EVIDENCE.md para el resto de los gates.
