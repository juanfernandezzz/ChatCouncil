# Desviaciones respecto de ChatCouncil-Unity

Cada cambio de este archivo se aparta a propósito del comportamiento de la Unity, con evidencia, y la prueba de paridad correspondiente deja de ser el criterio.

## PART-022 (D35 a D38)

- Los prompts de operación (`prompt-operacion.ts`), del integrador (`prompt-integrador.ts`) y del redactor (`prompt-redactor.ts`) cambian respecto de la Unity (pasos B1 a B6). Los hashes DAT-002 de esos tres se actualizaron en `crates/nucleo/src/datos.rs`.
- El integrador lee la tabla de hallazgos desde un archivo adjunto con marcas (B4), como el redactor.
- Tres pruebas de paridad contra vectores de la Unity quedan `#[ignore]` con este motivo, hasta regenerar los vectores desde la app:
  - `operacion_los_prompts_de_operacion_son_los_de_la_unity`
  - `prompts_los_de_los_roles_en_la_corrida_son_los_de_la_unity`
  - `ronda_entera_deja_los_mismos_hechos_que_la_unity`
- `operacion_la_corrida_de_la_unity_da_los_mismos_sellos_y_prompts` sigue activa: conserva los siete sellos byte a byte y deja de comparar los prompts.
- El texto de control de lectura (R32) cambió también en los vectores `Controles.json` e `InformeDeRonda.json`.
- Cubren lo cambiado: `operacion_el_prompt_lleva_la_cantidad_de_respuestas_de_la_ronda` y la prueba de roles de `prompts.rs`.
- El aviso de prompts de captura (R18) compara cada mensaje con la pregunta pegada y nombra los paneles que no coinciden: cambió `CorridaAviso.json` y se quitó la prueba con `AvisosPrompts.json`.
- Las filas iguales de un mismo operador se juntan en la tabla (R14) y el nombre del archivo de operación ya no lleva el código estable (R27).
