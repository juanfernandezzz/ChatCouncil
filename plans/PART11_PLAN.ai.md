@PlannablePlan v0.1

ID=PART-011
PH=E7_INTERFAZ_Y_PANELES
SCN=SCN-011
OUT=Esqueleto que camina: ventana Slint, un panel real, script de página, hilo del núcleo y autoprueba
DEP=[PART-010]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- La app abre una ventana Slint con un panel real, le inyecta el script de página de la Unity, habla con el núcleo en su hilo y se prueba sola por línea de comandos. Confirma o refuta ADR-0010 antes de construir encima.

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: E7 (parte 1 de 8)
- prior: E6 completa
- next: PART-012 paneles completos
- spec: docs/specs/E7-interfaz-y-paneles.md; docs/adr/0010-arquitectura-de-la-app.md; openspec/specs/arranque-actualizacion, paneles-sesiones y pruebas-internas

C:
- lo mínimo de cada pieza: una ventana, un panel, una orden al núcleo, una autoprueba corta
- antes de usar una API de Slint, wry o webview2-com se lee su documentación de la versión fijada
- paneles no expone enviar, clic ni teclas sobre la página, ni lectura de cookies o almacenamiento
- las pruebas usan una carpeta temporal; nunca la carpeta de datos real ni navegador/

F:
- crates/paneles/ (biblioteca)
- crates/app/ (binario ChatCouncilNueva)
- datos/pagina/ (DAT-003)
- tests/paginas/

T:
1 Traer el script de página de la Unity, compilado e idéntico, a datos/pagina/ con su sha256 y su origen; y las páginas locales de la autoprueba a tests/paginas/.
2 crates/paneles como biblioteca: un navegador compartido en <datos>/navegador con los tres switches, un panel hijo en un rectángulo, navegar, inyectar el script y llamarlo, y servir las páginas de prueba como cc-prueba.test y cc-otro.test.
3 crates/app: ventana Slint «ChatCouncil (nueva)» con un área para el panel que se reacomoda, la carpeta de datos (-datos o AppData\Local\ChatCouncil), el hilo del núcleo con la Puerta y una orden de ida y vuelta.
4 -autoprueba RUTA con el formato de PRU-001 y las comprobaciones que el esqueleto ya puede hacer.
5 Medición orientativa (D16): tamaño del .exe, arranque hasta la ventana, RAM y tiempo de CPU del proceso en 30 s de reposo con un panel.

AC:
- ARR-001, ARR-005, ARR-006, ARR-007, PAN-001, INV-PAN-002, PRU-001, INV-PRU-001 e INV-PRU-003 tienen comprobación y pasan. De ARR-007, «no busca actualización» se prueba en E8, cuando exista el actualizador; queda anotado.
- DAT-003: una prueba compara el sha256 del script de página con el anotado.
- La autoprueba escribe la cabecera, la versión de WebView2, una línea por comprobación y «Resultado: N/N», y sale con 0. Incluye al menos: los tres switches en el proceso del navegador; el user agent sin tocar; escribir y leer por el script un texto con ñ, acentos y líneas vacías, idéntico; una orden al núcleo con su respuesta; y una línea MEDIDO que no cuenta.
- En 30 s de reposo con un panel, el proceso de la app no gasta CPU en dibujo continuo (tiempo de CPU del proceso anotado).
- Caso de falla: un grupo de la autoprueba que lanza queda como «FALLA … se cortó con una excepción: …», los demás siguen, el resultado no es N/N y el proceso sale con 1.
- El informe dice, punto por punto, si ADR-0010 se sostiene, con lo observado.

V:
- cargo test --workspace, con su salida.
- La app con -autoprueba sobre una carpeta temporal, con su archivo de salida y su código de salida, en local y en el CI si el runner puede abrir WebView2.

DONE:
- append PLAN_EVIDENCE.md#PART-011: summary+files+checks+notes
- run plannable complete PART-011

S:
- si Slint y wry no pueden compartir la ventana, el foco o el bucle de eventos como pide ADR-0010, parar y reportar con lo observado
- si el script de página no se puede traer idéntico, parar y reportar
