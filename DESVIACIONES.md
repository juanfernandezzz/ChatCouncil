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

## CC-2 (2026-11-26): excepción a ADR-0011, solo para este lote

- Juan, verbatim: «quiero sobreescribir esa regla para este lote, envía los mensajes de prueba tú» y «en la parte 3 enviar a todos y "si" hazlos tú también». En este lote Code pulsa «Enviar a todos» y «Sí» en la ronda CC-2 (y envió los mensajes de prueba de Muse). Contradice AGENTS.md y ADR-0011; vale solo para este lote y vuelve a regir después.

> **REVOCADA (2026-11-26, Juan: «ahora sí esos los haré yo, ignora la excepción de antes»).** Lo escrito arriba sobre que Code pulse «Enviar a todos» y «Sí» YA NO APLICA: los pulsa Juan. Rige ADR-0011.

## PART-031 (2026-11-27)

- El prompt prohibía ampliar la guarda de anonimato más allá de lo que fija; Juan levantó esa regla para `/help` con «E1B E2A» (E2 A): `www.kimi.ai/help/features/<id>` es una página pública de ayuda y dejaba «Pegar la operación» en 0 de 7. `/helpx`, `/en/helper` y las rutas con `..`, `.` o `%2e` siguen siendo fuga.
- Muse (solo panel) es elegible como integrador o redactor desde esta build («E1 B»): se adelantó la elegibilidad al orden del prompt, que la probaba antes (T1 y T2). Nunca investigador ni verificador; los roles por defecto (RON-002) no cambian y CONOCIDOS sigue en 10. Que Muse sea integrador de la app real solo ocurre si T1 y T2 aprueban.
- La versión sale de publicar.yml (0.2.<run_number>): no hay un parche que subir a mano en Cargo.toml.
- PENDIENTE (pedido de Juan, 2026-11-27, aún sin hacer): (1) volver a pegar la Operación. Si una etapa ya se pegó y Juan debe cambiar de cuenta de Google por límite de uso, la app debe dejarle volver a pegar esa etapa; hoy no lo permite (causa sin diagnosticar). Falta diagnosticarlo en una copia y decidir la regla (p. ej. repetir el pegado solo de los paneles sin respuesta capturada). (2) Quitar «Nueva» de ChatCouncilNueva: exe, carpeta de instalación (Programs\ChatCouncilNueva), instalador (ChatCouncilNueva.iss), actualizador y su asset, textos y rutas. Toca el mecanismo de actualización: va en un lote propio, con decisión de Juan; si la carpeta de datos también cambia, con migración.

## PART-032 y PART-033 (2026-11-28)

- nucleo tiene su primera dependencia de ejecución: sha2 0.11.1 (antes solo de pruebas), para el sha256 del archivo que se pega.
- Los hechos nuevos «pegado» y «aviso-captura» se suman a los dieciséis de la Unity; el registro sigue append-only y los vectores reales de la Unity no cambian.
- «Volver a pegar» en un rol continúa con los demás paneles si uno falla; el pegado normal se detiene en el primer fallo. En la verificación, olvidar el pegado de un solo panel no quita el del otro (el prompt es uno para los dos).
- Redactor: el orden «capturado quita» no puede darse, porque la etapa avanza al capturar.
- B1 cambió los vectores y los sha256 de PROMPT_INTEGRADOR (11d55335…) y PROMPT_REDACTOR (1f648419…).
- A7: el doble clic en un rol sin página no se pudo reproducir en rojo en pruebaronda (crear_panel termina en el mismo turno); la guarda es defensiva. Sin verificar con ratón real.
- B2: el conteo de mensajes mira todas las coincidencias de userMessage sin respetar `exclude` y no mira dentro de iframes (límite conocido). pagina.js sin cambio (sha256 39b048ce…).
- Pendiente, no medido: bytes del integrador y el redactor de la ronda 0e319605… sobre la copia de CC-2.
