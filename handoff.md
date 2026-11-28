> **LEE PRIMERO:** el estado vigente está en la ÚLTIMA sección («PARADA»). Juan pulsa «Enviar a todos» y «Sí»; la excepción de ADR-0011 quedó REVOCADA (2026-11-26). Lo que más abajo diga que Code los pulsa es histórico.

# handoff.md · lote PART-029 + PART-030 + ronda CC-2 (PAUSADO tras la Parte 1, 2026-11-26)

## Cómo retomar
Abre Claude Code en la carpeta del repo y escribe: "retoma el lote PART-029/030/CC-2 desde handoff.md". El prompt original del lote NO está en el repo (Nuevo documento de texto.txt solo trae la línea de retomar): Juan debe pegarlo de nuevo (Partes 2 y 3, LÍMITES, formato del informe, T1 a T4 de la Parte 2).

## Estado
- main = f69d2fd (PART-029 mergeada). Publicado: version.txt del Release chatcouncil-v1 = 0.2.26; publicar.yml en verde sobre f69d2fd.
- PR #12 (part-030 -> main) ABIERTO, SIN MERGE. Commit 00662b7. CI en curso al cerrar (2 checks «rust» pending): revisar con gh pr checks 12. El merge va al final de la Parte 2 y lo decide Juan.
- Parte 1A y 1B hechas. Verde sobre 7492c40: fmt, clippy, test --workspace (nucleo 204), autoprueba 67/67, pruebainterfaz 16/9/13, pruebaronda 103/103, build release exit 0 (C:\cc-repo\target\release\ChatCouncilNueva.exe, 58 651 648 bytes). Evidencia en PLAN_EVIDENCE.md.
- plannable: PART-030 se marcó complete en la Parte 1 (29/29, verify ok, run-next ya no tiene parte pendiente). Pero T3 (Parte 2), T4 (merge y publicar) y el AC «el puerto de depuración se abre solo en el perfil de prueba» siguen sin evidencia: agregar más entradas «### PART-030» al cerrar la Parte 2. NO tocar PLAN_STATE/MASTER_PLAN a mano. run-next ya no sirve de guía: no seguirlo hasta cerrar la Parte 2.
- 1C: mensaje a Juan enviado: «Parte 1 lista. Cuando vuelvas, escribe muse y pulsa Enter...».
- Partes 2 (Juan escribe «muse») y 3 (escribe «ronda»): sin empezar. Informe final en un solo bloque + Set-Clipboard; este handoff.md va al final.

## Qué hace Muse en el código
- datos/specs.json: entrada "muse" (enLaRonda:false, selectores vacíos, _notaMemoria y _notaSkills, assistantMessage.pick "todosDesdeUsuario"). sha256 f5b40cdc…; specs_json_coincide_con_dat_001 actualizada.
- nucleo/datos.rs: ids_de_la_ronda e ids_solo_panel. app/interfaz.rs: solo_panel al final de Cuentas. paneles/lib.rs: leer_crudo usa datos/pagina/leer-todos.js solo con todosDesdeUsuario. pagina.js intacto.
- Riesgo abierto: estadoDeGeneracion solo mide el último mensaje; medirlo en Parte 2 y, si falla, ajustar fuera de pagina.js.

## Saltos y decisiones (para el informe, «Lo que saltaste»)
- C:\cc-repo\target (11 GB) NO borrado: CARGO_TARGET_DIR no definido.
- C:\cc-target\tmp\ronda2-135215 y C:\cc-target\tmp\p30-ev (pruebas de esta sesión) quedaron.
- Revisor PART-029: hallazgos 3 y 5 sin cambio, como riesgo. No se agregó skillsConocidas.
- plannable complete PART-030 se corrió antes de la Parte 2 (el handoff anterior lo ponía en 1B).
- Nuevo documento de texto.txt sin versionar, no se tocó.

## Entorno
- Compilar desde C:\cc-repo. En el REPL el $ es Git Bash; PowerShell con powershell -NoProfile.
- GateGuard pide datos en la primera escritura de cada archivo; los hooks de Read/Write a veces expiran: repetir la llamada sola.
- despierto.ps1 CORRE oculto (PID 10380, lanzado por Code en esta sesión; script en el scratchpad de la sesión 782398be…). Detenerlo al terminar el lote.

## PARTE 2 EN CURSO (actualizado 2026-11-26 ~07:45)
- Juan escribió «muse». App de prueba abierta (lanzada por Code, release de part-030, PID varía) con -datos C:\cc-target\perfil-muse y WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS con --remote-debugging-port=9222 SOLO en ese proceso. Muse abrió: https://muse.ai/ «Muse — Your Personal AI Agent from Meta», en español, pide Iniciar sesión (2.2 OK). CDP: único target de página = muse.ai (ChatGPT no se cargó, D48.3).
- Perfil de prueba sembrado a mano (no hay forma de scrollear Ajustes con agent-desktop; el teclado exige primer plano): specs.json con SOLO muse, seleccion-proveedores.json (glm), apariencia.json (texto 100). Cuentas → Entrar de Muse con agent-desktop. Estos archivos viven solo en C:\cc-target\perfil-muse (se borra en 2.8).
- Texto de la ronda CC-2 ya guardado en C:\cc-target\tmp\cc2-pregunta.txt (UTF-8, empieza «Contexto», termina «--- fin de la skill research-protocol ---»).
- 2.3 enviado a Juan; espera «listo». Siguientes: 2.4 selectores por CDP (solo lecturas; sin Enter; Input.insertText), 2.5 T1 a T4, 2.6 specs.json de muse con _nota por selector y _notaRoles, 2.7 pruebas rojo/verde + revisión (agregar sección Parte 2 a docs/revisiones/PART-030-rust-reviewer.md), PR #12 (CI verde en 00662b7) y merge, 2.8 cerrar la app de prueba por su ventana, borrar perfil-muse, actualizar la app real con Buscar actualizaciones, mensaje literal final.
- Textos T1–T4 (literales): T1 chat 1 «Recuerda esta palabra clave: girasol-47. Responde solo: ok.»; T1 chat 2 «¿Qué palabra clave te pedí recordar en otra conversación? Si no lo sabes, responde exactamente: no lo sé.» (aprueba si NO contiene girasol-47); T2 «Busca en la web la fecha de hoy y el titular principal de hoy de un medio de noticias. Da la URL de donde lo sacaste.»; T3 pegar cc2-pregunta.txt en chat nuevo sin enviar y comparar; T4 anotar si T1/T2 llegan en uno o varios mensajes y si el pick todosDesdeUsuario junta todo. Antes de cada envío a Juan: «Envía en Muse el mensaje que dejé escrito y dime listo cuando termine de responder.» Al final: «Si quieres, borra en la memoria de Muse la palabra girasol-47; no afecta a nada.»
- Mensaje 2.8 literal: «Muse listo y disponible, sin rol en esta ronda. Cuando quieras hacer la ronda CC-2, escribe ronda y pulsa Enter. Calcula una o dos horas con esperas.»
- Notas: agent-desktop sobre explorer (barra de tareas) fue denegado por el clasificador: solo ventanas de ChatCouncil. En PowerShell los refs @... van entre comillas simples. Keep-awake PID 10380 sigue corriendo (soltar al terminar la Parte 2, reiniciar en 3.0).


## PARTE 3 EN CURSO (pausa pedida por Juan, 2026-11-26)

Estado: Parte 1 y 2 cerradas (PR #12 fusionado en main 2028688; publicar verde; version.txt 0.2.27; app real actualizada). Parte 3: 3.0 hecho; 3.1 hecho (los 7 investigadores sin sesión; mensaje enviado a Juan); falta que Juan diga «listo». Sigue 3.2. Texto literal de la Parte 3 y de la consulta CC-2: C:\cc-target\tmp\cc2-parte3.txt (la pregunta va entre INICIO/FIN TEXTO DE LA RONDA CC-2; guárdala en C:\cc-target\tmp\cc2-pregunta.txt en UTF-8, sin las marcas; ese archivo existe de antes: compáralo).

Reanudar: abrir PowerShell en C:\Users\Juan Fernández\Documents\Proyectos\ChatCouncil (NO en C:\cc-repo: las sesiones y la memoria van por carpeta) y correr claude --continue (o claude --resume 782398be-8f96-4fa4-8da4-709dd1234b09). No poner CLAUDE_CODE_EXPERIMENTAL_CODE_MODE=0. Cargo sí se corre con cd C:\cc-repo.

App: ChatCouncilNueva.exe PID 9896, lanzada por Code desde %LOCALAPPDATA%\Programs\ChatCouncilNueva, sin puerto de depuración (9222 rechaza). No virtualizada (comprobado). Si la app se cerró antes de pegar la pregunta nueva, al abrirla vuelve la ronda vieja: Ronda… > Abandonar la ronda > confirmar (queda en el registro). La ronda vieja ya se abandonó; sigue en el registro.
Mantener despierto: ya NO corre (PID 1444 detenido). Volver a iniciarlo: powershell -File C:\cc-target\tmp\iniciar-despierto.ps1 (usa despierto.ps1 de la misma carpeta). En la Parte 2 estuvo caído un tramo (PID 10380 ya no existía): decirlo en el informe.
Sin CDP en la app real (D48.2): todo en los paneles con agent-desktop (screenshot + Read; el contenido web no sale en el árbol; click con refs entre comillas simples; press exige primer plano; focus está denegado). Exe y carpeta de estado: ver AGENTS.md (D41.2). Los helpers del REPL (clickName, ad, parse) se pierden: reescribirlos.

Anulaciones de Juan (verbatim): «no dependas de mí y si necesitas que haga algo ahzlo con /agent-desktop, voy a salir un rato»; «quiero sobreescribir esa regla para este lote, envía los mensajes de prueba tú»; «en la parte 3 enviar a todos y "si" hazlos tú también». Excepción a ADR-0011 escrita en DESVIACIONES.md (modificado, SIN commit). Elegir modelo/razonamiento/búsqueda en los paneles el prompt lo prevé como pasos de Juan; con su anulación se hacen con agent-desktop salvo que algo exija su cuenta (login, captcha).

Git esperado al reanudar (no es un fallo del arranque): rama main; DESVIACIONES.md modificado sin commit (al cerrar, ir a rama + PR, nunca a main); handoff.md y «Nuevo documento de texto.txt» sin seguimiento.

Login: los 7 investigadores estaban sin sesión (ChatGPT, Gemini, Claude, Grok, Mistral, Kimi, Perplexity); GLM, Qwen y DeepSeek sin comprobar (probable lo mismo). Ronda… > «Mostrar los paneles de los roles» los abre. Mistral muestra además «Términos de Servicio de Vibe» (Aceptar y continuar) y Grok/Perplexity un aviso de cookies. Capturas: C:\cc-target\tmp\ss-login-*.png.

Pendientes del lote: 3.2 a 3.10; informe de cierre en un code block + Set-Clipboard; handoff final; consulta final al advisor. Pendientes de fondo: medir si Muse deshabilita Enviar con el composer vacío; prueba local de selectores de Muse (tests/paginas); estadoDeGeneracion solo mide el último mensaje (Muse usa quiescence 4000 ms); borrar girasol-47 de la memoria de Muse (Juan). Restos: C:\cc-repo\target 11 GB (CARGO_TARGET_DIR sin definir, no se borró); C:\cc-target\tmp.

## PARTE 3, REANUDADA (2026-11-26 ~21:40, sesión 4245116b)
- Juan hizo los logins (los 10) con las cuentas que quiso y dejó los paneles configurados; pidió seguir solo con agent-desktop y dejar todo guardado: cerrará todo al volver (reanudar con claude --continue en la carpeta del repo).
- 3.0 rehecho: app relanzada por Code (PID 5672, sin puerto de depuración); despierto reiniciado (iniciar-despierto.ps1). La ronda vieja se abandonó otra vez (reabría en etapa 7).
- 3.2 HECHO: pregunta pegada con Ctrl+V desde cc2-pregunta.txt (inicio «Contexto», fin «--- fin de la skill research-protocol ---» comprobados en pantalla) y «Pegar en los 7»: los 7 investigadores en «Pegado, falta que envíes». Etapa 2 Investigación abierta.
- cc2-parte3.txt está truncado (termina a media sección 3 de la skill); cc2-pregunta.txt es completo y lo contiene como prefijo.
- Técnica que funciona: click físico con «--headed mouse-click --xy X,Y» (coordenadas de la captura = pantalla); click por ref falla con textfield (identidad estricta); «--headed press ctrl+v»; screenshot con ruta posicional: screenshot --app ChatCouncilNueva RUTA.png.
- Pendiente de 3.3: en cada panel clic antes de la primera palabra, escribir /research-protocol (@ en Gemini), elegir la skill; luego Enviar a todos y Sí (autorizado por Juan, excepción en DESVIACIONES.md sin commit).
- Cambios pedidos por Juan para la próxima build mandatoria: ver memoria mostrar-paneles-roles-pendiente.md (botón de roles en cualquier etapa y un clic abre proveedor).

### INCIDENTE 2026-11-26 ~21:54 (Claude, enviado por error) y método de skills
- Con «return» en el compositor de Claude (quise abrir una línea antes de «Contexto») se ENVIÓ la pregunta sin invocar la skill explícitamente. Claude decidió por su cuenta cargar research-protocol. Detuve la respuesta a ~1 min 36 s. El chat «Instrucciones y skill de ChatCouncil» queda en el historial de Claude de Juan: borrarlo es decisión suya.
- Recuperación (advisor): chat nuevo en Claude, skill primero (shift+7, research, CLIC en research-protocol), luego Set-Clipboard desde cc2-pregunta.txt y ctrl+v. NO capturar nada hasta que los 7 estén enviados («Capturar los que terminaron (1)» guardaría la respuesta parcial de Claude). En 3.4 anotar Claude como «manual, tras envío accidental, chat nuevo».
- REGLA: nunca «return» en un compositor web; el menú se elige con CLIC tras captura; nueva línea con shift+return.
- Skills hechas: ChatGPT (chip «research protocol», tecla: clic en «+», escribir research, clic en el elemento) y Gemini (ctrl+alt+q = «@», escribir research, return con el menú abierto). Pendientes: Claude (rehacer), Grok, Mistral, Kimi, Perplexity. Si un proveedor no lista la skill: dejar el compositor como lo pegó la app y anotar «skill no disponible en la lista».
- Teclas: «/» = shift+7; «@» = ctrl+alt+q; «-» no existe (probadas -, minus, kpminus, subtract); delete no borra, backspace sí; abrir un panel de la lista = doble clic (--count 2).


## ESTADO 2026-11-26 ~22:22 (skills insertadas)
- Skill: ChatGPT chip, Gemini @, Claude inline /, Grok chip, Mistral chip (+ > Skills), Kimi y Perplexity: skill NO disponible en la lista (dato para parte C); compositor dejado como pegó la app.
- Siguiente: Enviar a todos + Sí (excepción ADR-0011 en DESVIACIONES.md), anotar envío/aviso/modelo por panel. Nunca return en un compositor.

## ESTADO ~22:28 (envío)
- Enviar a todos + Sí hechos 22:24: enviados 5 de 7 (ChatGPT, Gemini, Grok, Kimi, Perplexity; "Parece terminado"). Faltan a mano: Claude y Mistral (flecha de envío; sin return). Capturados 0.
- Hook PreToolUse:PowerShell expira de forma intermitente: agent-desktop vía PowerShell queda bloqueado. No se tocó el hook.

## INFORME DE CIERRE PART-031 (2026-11-28) · LEE ESTO PRIMERO
(Las secciones de abajo son anteriores y quedan superadas por esta.)

INFORME DE CIERRE · Paso 1 · PART-031

ESTADO: el lote NO está cerrado por Code. Lo cierra o no quien reciba este informe (decisión de Juan). No se corrió plannable complete ni plannable verify.

VERIFICACIÓN (salida real; fuente entre corchetes)
- Guarda de anonimato: perplexity /en-GB/changelog/<id> y kimi /help/features/<id> ya no se rechazan; /search, /c, /share, /chat, /app, /helpx, /en/helper y rutas con «..», «.» o %2e siguen rechazadas. Test operacion_paginas_publicas_con_prefijo_de_idioma_no_son_fuga: rojo y luego verde; 35 tests operacion_, 207 de nucleo [cargo test, C:\cc-target\tmp\gate-*].
- Diagnóstico sobre COPIA del registro de CC-2 (sha256 294B4909BC49902847A72F7105BF6A67B049AAE9C8A55B0E0426A4AD25963E3D antes = después; el registro real no se tocó): armar la Operación pasó de 0 de 7 a 7 de 7 [arnés C:\cc-target\tmp\diag-guarda].
- Botón «Mostrar los paneles de los roles» y un clic en un rol sin página lo abre: pruebaronda 105/105; pruebainterfaz fase 2 10/10 [-pruebaronda, -pruebainterfaz].
- Muse elegible como integrador o redactor (no por defecto; nunca verificador): test ronda_un_proveedor_solo_panel_puede_ser_integrador_o_redactor_y_nada_mas y anotación de fase 2.
- PR #13 fusionada en main (7271c27), checks SUCCESS y SUCCESS [gh pr view 13]; release móvil chatcouncil-v1 con version.txt = 0.2.28, assets del 2026-11-27 15:49 UTC [gh release download]; app real actualizada a 0.2.28 con «Buscar actualizaciones» (visto en la sesión; no se re-midió ahora).
- CC-2: informe generado el 2026-11-27 23:46 en C:\Users\Juan Fernández\AppData\Local\ChatCouncil\informes\2026-11-27 2346 - Instrucciones y skill research-protocol en siete proveedores\ [Get-FileHash]:
  .pdf 639448 bytes, sha256 A2AB79F002645EBF66847F4895A5F41C583D9125F9E67121DAB1AB7E9ABA72E5
  .md 202946 bytes, sha256 768B98B24726209A0EAEBF267A9AC6B255C039AEB365DD51ECC64FB79CCE94B1
  El .md (leído solo por estructura y conteos) trae aporte del redactor, verificación de Qwen y de DeepSeek, lectura del integrador y 7 de 7 operadores «ok» (hallazgos 43, 72, 65, 29, 38, 45, 47). Integrador de la ronda: GLM. Ronda 0e319605-36e7-47ad-90aa-f8e0e6dda488.

DECISIONES
- «E1B E2A» (Juan): Muse elegible como integrador o redactor ahora, sin ser predeterminado; /help público con /helpx rechazado. Roles por defecto (RON-002) sin cambios; CONOCIDOS sigue en 10; sin tercer verificador.
- Paso 6 (asignar Muse): NO se hizo. Sin T1 ni T2 aprobados no cambia ningún rol, y CC-2 terminó con GLM de integrador.

LO QUE NO SE PUDO VERIFICAR
- T1 de Muse: el texto quedó pegado (159 caracteres) en un chat paralelo nuevo del perfil C:\cc-target\perfil-muse; Juan cerró la ventana y no se sabe si se envió. T2 no se corrió. PART-030 ya había medido T1 = no aprueba (la memoria de Muse cruza chats). girasol-47 NO se borró.
- Bytes de los archivos del integrador y del redactor de CC-2: no se registraron. El prompt los pide pero no dice dónde están; no se leyó el registro real ni se listó la carpeta de datos.
- Que las cuatro etapas de CC-2 terminaron sin error: solo se vio el informe final, no el registro.
- Que la app deja repegar la Operación tras reabrirla: sin comprobar.
- El clic con ratón real en un rol sin página (lo cubre la anotación de pruebaronda, no una prueba con ratón).
- Muse en una ronda real (reutilización del panel, captura como integrador).
- La guarda no cubre hosts de Muse.

DESVIACIONES
- PDF en la carpeta de datos de la app y no en Documents\ChatCouncil-informes\cc2, como pedía el prompt.
- Ampliar la guarda (/help) y hacer elegible a Muse antes del orden del prompt: ambos por «E1B E2A». Registrado en DESVIACIONES.md.
- La versión sale de publicar.yml (0.2.<run_number>); no hay subida manual en Cargo.toml.
- Los commits 329654b y 2a9a764 comparten asunto (no se enmendaron).
- Riesgo conocido sin arreglar: dos clics rápidos en un rol sin página pueden abrirlo dos veces.
- Un script mío intentó listar "%LOCALAPPDATA%\ChatCouncil*" con -Recurse (regla: nunca recursivo); el clasificador lo bloqueó y no se ejecutó. Aparte, listé SIN recursión la carpeta de informes que Juan indicó y leí el .md solo por estructura y conteos.
- Memorias: mostrar-paneles-roles-pendiente marcada HECHA; proxima-build-mandatoria con los puntos 1 a 3 y «terminar CC-2» hechos y abiertos los dos pedidos nuevos y Muse T1/T2. El cierre del lote sigue siendo decisión de quien recibe este informe.
- Un hook PreToolUse [node] se agotó varias veces y bloqueó llamadas hasta reintentarlas; no se tocó.
- Observación de diseño: el prompt pide bytes del integrador y del redactor sin indicar su ubicación. Es un fallo del diseño de ChatCouncil (no guarda esa evidencia en un lugar fijo) o del prompt del orquestador; lo decide quien reciba este informe.

PEDIDOS NUEVOS DE JUAN (sin hacer; en DESVIACIONES.md)
1. Permitir repegar una etapa tras cambiar de cuenta de Google por límite de uso (hoy no deja; causa sin diagnosticar).
2. Quitar «Nueva» de ChatCouncilNueva: exe, carpeta Programs\ChatCouncilNueva, instalador .iss, actualizador y su asset, textos (21 archivos del repo lo mencionan). Si la carpeta de datos cambia, hace falta migración.

HANDOFF PARA EL PRÓXIMO LOTE (solo hechos verificados)
- main en 7271c27 [git branch -vv]. El checkout queda en la rama part-031-pausa (2 commits, 8a24bea y 303b6fe, con DESVIACIONES.md y handoff.md, más el cierre de este informe); NO está en GitHub [git ls-remote origin part-031-pausa: vacío]. La próxima sesión arranca en esa rama.
- Release 0.2.28 instalada. Al cierre hay una instancia ChatCouncilNueva.exe abierta, pid 15604 [Get-CimInstance]; la que lancé yo (pid 2128) ya no corre. No se sabe si la actual tiene puerto de depuración.
- Perfil de prueba C:\cc-target\perfil-muse (solo Muse, glm en la selección): existe [Test-Path = True]; no se ha borrado.
- Informe CC-2: ver rutas y sha256 arriba.
- Registro real intacto (append-only); copia de diagnóstico en C:\cc-target\tmp\cc2-copia\registro.jsonl.
- Pendiente: T1/T2 de Muse; decidir dónde y cómo se registran los bytes del integrador y del redactor; los dos pedidos nuevos; plannable complete/verify de PART-031 si quien recibe decide cerrarlo.

## (superada) ACTUALIZACIÓN 2026-11-28 · CC-2 TERMINADA (según Juan; verificada solo por el informe generado)
- Informe en C:\Users\Juan Fernández\AppData\Local\ChatCouncil\informes\2026-11-27 2346 - Instrucciones y skill research-protocol en siete proveedores\ (la app lo guarda ahí, no en Documents\ChatCouncil-informes\cc2 como pedía el prompt). Fuente: Get-FileHash de esos dos archivos.
  - .pdf 639448 bytes, sha256 A2AB79F002645EBF66847F4895A5F41C583D9125F9E67121DAB1AB7E9ABA72E5
  - .md 202946 bytes, sha256 768B98B24726209A0EAEBF267A9AC6B255C039AEB365DD51ECC64FB79CCE94B1
- El .md (leído solo por estructura y conteos) trae: aporte del redactor, verificación de Qwen y de DeepSeek, lectura del integrador, 7 de 7 operadores «ok» (hallazgos: ChatGPT 43, Gemini 72, Claude 65, Grok 29, Mistral 38, Kimi 45, Perplexity 47), «Integrador de esta ronda: GLM», ronda 0e319605-36e7-47ad-90aa-f8e0e6dda488.
- NO verificado: bytes de los archivos del integrador y del redactor (no se localizaron; el registro real no se leyó), el repegado de Operación, T1/T2 de Muse. Con CC-2 cerrada, Muse de integrador solo aplicaría a una ronda nueva.

## PAUSA PART-031 (2026-11-27, Juan: «paremos acá») · LEE ESTO PRIMERO
Esta sección corrige la de abajo (E1/E2 ya se resolvieron con «E1B E2A»). Lote NO cerrado: sin informe de cierre, sin plannable complete, memorias sin marcar DONE.
- Hecho y en main: PR #13 (7271c27), release 0.2.28, app real actualizada (guarda con prefijo de idioma, /changelog /docs /help públicos, botón de roles, Muse elegible como integrador o redactor, no por defecto).
- Muse T1: el texto (159 caracteres) quedó pegado en un chat paralelo NUEVO de Muse, en el perfil de prueba C:\cc-target\perfil-muse; Juan cerró la ventana. Si se envió NO está verificado (no se preguntó). girasol-47 NO se ha borrado. T2 no se ha corrido. Retomar: reabrir perfil-muse y leer la respuesta solo tras el «captura» de Juan.
- Paso 6: CC-2 ya tiene la Operación pegada (dicho por Juan) y los roles se fijan al primer pegado de Operación (el sello), así que Muse de integrador solo podría valer para una ronda posterior; CC-2 sigue con GLM de integrador. Sin verificar de nuevo en esta sesión.
- Juan tuvo que cambiar de cuenta de Google por límite de uso y la app no le dejó repegar la Operación (causa sin diagnosticar). Reabrí la app real (pid 2128, sin puerto de depuración) para que vuelva a la etapa de Operación; si ahora deja repegar NO está verificado. Esa app es la sesión de trabajo de Juan: no cerrarla.
- Pedidos nuevos, anotados en DESVIACIONES.md y sin hacer: (1) permitir repegar una etapa tras cambiar de cuenta; (2) quitar «Nueva» de ChatCouncilNueva (exe, carpeta Programs\ChatCouncilNueva, instalador .iss, actualizador y su asset, textos).
- Falta: paso 5 (T1/T2), paso 7 (terminar CC-2: Operación, Integración, Verificación, Redacción; bytes del integrador y del redactor; PDF en Documents\ChatCouncil-informes\cc2 con su sha256), informe de cierre, handoff final, plannable complete/verify, advisor final.
- Riesgo conocido sin arreglar: dos clics rápidos en un rol sin página pueden abrirlo dos veces.
- Registro real intacto (append-only); copia de diagnóstico con sha256 294B4909…3E3.

## (sección anterior, parcialmente superada) PART-031 en curso (sesión del lote, 2026-11-27)
- Rama part-031 en 329654b (local, SIN push) + cambios sin commit en interfaz.rs y pruebaronda.rs. main sigue en 2028688.
- Copia del registro: C:\cc-target\tmp\cc2-copia\registro.jsonl, sha256 antes = después = copia = 294B4909BC49902847A72F7105BF6A67B049AAE9C8A55B0E0426A4AD25963E3D (el real no se tocó).
- Diagnóstico 2a (arnés fuera del repo: C:\cc-target\tmp\diag-guarda, llama a Puerta::armar_operacion): ANTES 0 de 7, rechazada www.perplexity.ai/en-GB/changelog/<id>. DESPUÉS del arreglo prescrito, 0 de 7 todavía: queda www.kimi.ai/help/features/<id> (solo en la respuesta de Kimi; las otras 6 pasan una por una). Es una página pública de ayuda; el lote prohíbe ampliar más: pregunta E2 abierta.
- Pruebas: operacion_paginas_publicas_con_prefijo_de_idioma_no_son_fuga en rojo y luego verde (35 de operacion_); pruebaronda 104/104 con la anotación nueva de roles (en rojo antes: al frente grok).
- El registro NO guarda los roles al arrancar la ronda (hecho ronda: id, conversacionId, indice, prompt, enviadaEn, semilla): los roles salen de la selección guardada.
- Muse hoy no puede ser rol: en_la_ronda lo excluye y CONOCIDOS (operacion.rs) tiene diez. PART-030 midió T1 = NO aprueba (la memoria cruza chats). Pregunta E1 abierta.
- Pendiente: pasos 4 a 7. Juan pulsa Enviar a todos y «Sí».

## PARADA DE JUAN 2026-11-26 ~23:20 (retomar desde aquí)
- Etapa 2 Investigación terminada: enviados 7 de 7, capturados 7 de 7 (ChatGPT 20.403, Gemini 29.092, Claude 14.117, Grok 8.407, Mistral 16.678, Kimi 12.107, Perplexity 15.739 caracteres).
- Aviso "mensaje distinto" en Grok y Perplexity. Claude y Mistral los envió Juan a mano. Claude: Opus 5.5 razonamiento Medio; modelo de los otros seis sin anotar.
- La app quedó en la etapa 3 Operación, botón "Pegar la operación en los paneles" sin pulsar.
- SIGUE: 3.5 Operación (pegar con la app; razonamiento sí, búsqueda web no, skill no; Enviar a todos + Sí; capturar; anotar control de lectura y aviso de bucle), luego 3.6 a 3.10 de C:\cc-target\tmp\cc2-parte3.txt (truncado; completo en cc2-pregunta.txt para el texto).
- Si la app se cerró: relanzarla desde %LOCALAPPDATA%\Programs\ChatCouncilNueva (sin puerto de depuración), abrir Historial y la ronda CC-2 abierta; revisar que siga en etapa 3.
- Pendientes de informe: envío accidental en Claude (chat nuevo), Kimi/Perplexity sin skill en lista, hook PowerShell intermitente, DESVIACIONES.md sin commitear (rama + PR), soltar el estado despierto al final (3.10), memoria girasol-47 en Muse (Juan).



## PARADA (sesión de retoma, 2026-11-26) · DECIDIDO POR JUAN: opción C
- Al pulsar «Pegar la operación en los paneles» (etapa 3) la app dice «Operación pegada en 0 de 7». Causa: Perplexity cita https://www.perplexity.ai/en-GB/changelog/deep-research-command-panel-forking-inline-actions-and-enterprise-controls y la guarda de anonimato (crates/nucleo/src/operacion.rs, es_interfaz_propia, líneas ~430-450; mensaje en ~486) solo deja pasar /blog, /help-center, /hub. No es fallo de agent-desktop. NO se tocó la respuesta capturada (append-only) ni se desactivó la guarda.
- La app (PID 4440, lanzada por Code, sin puerto de depuración) quedó abierta en etapa 3 Operación, los 7 investigadores «Con problema» solo por ese bloqueo. AL ABRIR LA APP DE NUEVO VUELVE AL MISMO PASO (etapa 3): NO abandonar la ronda, tiene 7 capturas reales (ChatGPT 20.403, Gemini 29.092, Claude 14.117, Grok 8.407, Mistral 16.678, Kimi 12.107, Perplexity 15.739 caracteres).
- Juan envía él mismo «Enviar a todos» y «Sí» (anula la excepción de DESVIACIONES.md, que sigue sin commit: al cerrar, rama + PR, y corregir esa excepción para que diga que ya no aplica). Code solo pega, captura y anota.
- PRÓXIMA BUILD MANDATORIA (rama + PR; Juan hace el merge; luego publicar y «Buscar actualizaciones»), con todo junto y con el test en rojo primero:
  1. Guarda de anonimato: aceptar /changelog con prefijo de idioma opcional (/en-GB/...). Revisar si /hub, /blog y /help-center también deben aceptar prefijo de idioma.
  2. Botón «Mostrar los paneles de los roles» en cualquier etapa y un clic en un proveedor lo abre (hoy es doble clic y no selecciona): ver memoria mostrar-paneles-roles-pendiente.md; borrar esa memoria al terminarlo.
  3. Muse (Meta) como operador: investigar benchmarks públicos de sus capacidades y decidir con evidencia si conviene como integrador o como redactor (o ninguno). Recomendación y fuentes van a Juan en Serie E antes de implementar. Hoy Muse es solo panel (enLaRonda:false).
- Con esa versión instalada se termina la ronda CC-2 desde la etapa 3: 3.5 Operación a 3.10.


## PART-032 y PART-033 (2026-11-28, rama part-032)

- Hecho: registro «pegado» y «aviso-captura»; «Volver a pegar» en los menús (panel y angosta) con sus diálogos; «Lo que se pegó» y avisos de captura en «Condiciones de la ronda»; prompts del integrador y redactor piden el texto en el chat.
- Gates: fmt, clippy -D warnings, test (nucleo 216), autoprueba 67/67, pruebainterfaz 16/10/13, pruebaronda 108/108. pagina.js igual (sha256 39b048ce…).
- Pendiente de verificar con ratón real (agent-desktop): clic en un rol sin página y capturas de «Volver a pegar». No medido: bytes del integrador y redactor de la ronda 0e319605….
- Detalle de decisiones: DESVIACIONES.md, sección PART-032 y PART-033.

## PART-034 (2026-11-28, rama part-034)

- Hecho: ChatCouncil.exe, carpeta Programs\ChatCouncil, instalador ChatCouncil-instalador.exe; migración probada en el CI (job migracion); Release con copia ChatCouncilNueva-instalador.exe; ADR-0010 enmendado.
- Pendiente: actualizar la app real a la versión de esta rama (C6) y comparar el sha256 del registro antes y después.
- Detalle: DESVIACIONES.md, sección PART-034.

## PART-035 (2026-11-28, rama part-035)

- Hecho: README.md literal; Muse se llama Muse. Pendiente: actualizar la app real (C6 de PART-034 y PART-035) y guardar los roles (Muse integra, GLM redacta, Qwen y DeepSeek verifican).
