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

## PART-034 (2026-11-28)

- El binario es ChatCouncil.exe y la carpeta Programs\ChatCouncil. El instalador no reutiliza la carpeta anterior (UsePreviousAppDir=no) y borra Programs\ChatCouncilNueva solo si ChatCouncilNueva.exe se puede borrar (espera hasta 10 s); si no, la instalación sigue y la carpeta vieja queda con su desinstalador huérfano. Un instalador silencioso no puede avisarlo en pantalla.
- El Release publica ChatCouncil-instalador.exe y una copia con el nombre ChatCouncilNueva-instalador.exe para que las versiones instaladas (0.2.29 y anteriores) se actualicen. Tras el primer Release con este cambio, el asset con el nombre viejo ya instala la carpeta nueva: el job migracion del CI avisa y sale en vez de probar una migración que ya no existe con ese asset.
- Caso rojo del job migracion (corre en cada CI): con /DSinUsePreviousAppDir=1 el instalador nuevo cae en Programs\ChatCouncilNueva (confirmado en la PR #15).
- Respaldo del instalador 0.2.29: C:\cc-target\respaldo\0.2.29\ChatCouncilNueva-instalador.exe, sha256 C2D8F0DC187E44B8A6783454EB561B4C63824FFBEC75F605F4432B011A06941B.
- Los registros históricos (PLAN_EVIDENCE.md, planes cerrados, bench/resultados, docs/revisiones, handoff anterior) conservan el nombre viejo.

## PART-035 (2026-11-28)

- «Muse (Meta)» pasa a «Muse» en specs.json, dominio.rs y pruebainterfaz.rs; el id «muse» no cambia. El sha256 de specs.json cambió a f7554ff9f1451a57379b46f6f2915f6b05229b001bdce22121fce064af6405a2 (prueba specs_json_coincide_con_dat_001).
- Rojo antes del cambio: pruebainterfaz fase 2 dio 9/10 al buscar «Muse».
- Hallazgos de la revisión de PART-034 que quedan abiertos (fuera de alcance, para Juan): UsePreviousAppDir=no vale para todas las actualizaciones futuras; si ChatCouncilNueva.exe sigue vivo, la carpeta vieja queda; bench/medir.ps1 usa el mismo nombre de proceso que la Unity (la guarda de la línea 347 aborta si hay otra abierta).


## Correcciones al cierre del Paso 1 (2026-11-28)
- PLAN_EVIDENCE (PART-035) decía «Revisión ponytail: diff mínimo, sin hallazgos» antes de que corriera la revisión. Corrida al cierre sobre 7f22361..ef903d1: sin hallazgos. PLAN_EVIDENCE es append-only; esta nota es la corrección.
- PLAN_EVIDENCE (PART-032) sobrestimó la revisión aplicada. No se aplicaron: exclude en el contador userMessage; fallo a medias de registrar_pegado en difundir; sonda de captura en serie sin tiempo límite (toca rendimiento); clave abriendo sin guarda Drop; seccion_pegados con las specs embebidas; aviso «N mensajes tuyos» sin nombre de proveedor (texto literal del prompt).
- C6: tras 0.2.30 Programs\ChatCouncilNueva quedó vacía hasta la instalación de 0.2.31 (~40 min). Se reporta como carpeta que no se pudo borrar.
- C4: restos de ChatCouncilNueva en ci.yml, probar-migracion.ps1 y actualizador.rs:242, además de los tres sitios del prompt.
- Versión en Ayuda confirmada en pantalla solo para 0.2.31.
