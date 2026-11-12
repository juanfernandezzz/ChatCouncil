@PlannablePlan v0.1

ID=PART-012
PH=E7_INTERFAZ_Y_PANELES
SCN=SCN-012
OUT=Paneles completos como el panel nativo de la Unity
DEP=[PART-011]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- crates/paneles hace todo lo que hace el panel nativo de la Unity (panel.cpp y Paneles.cs), sin leer nunca cookies ni almacenamiento.

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: E7 (parte 2 de 8)
- prior: PART-011
- next: PART-013 script de página
- spec: openspec/specs/paneles-sesiones/spec.md; openspec/specs/pruebas-internas/spec.md; ADR-0005; ADR-0010

C:
- el user agent no se toca; un solo perfil para los proveedores
- un cierre de sesión que no nace de un clic de la persona se cancela
- un panel oculto se mueve fuera de la ventana con su tamaño, nunca a 0x0
- adjuntar va por DevTools Protocol (ADR-0010, punto 10)

F:
- crates/paneles/
- crates/app/ (grupos de la autoprueba)

T:
1 Varios paneles con el perfil compartido, techo de 90 s al crear, frente y detrás, rectángulo, ocultar fuera de la ventana, zoom informado y recargar.
2 Ventanas emergentes en el mismo perfil con window.opener; bloqueo y conteo de cierres de sesión; borrado de los datos de un solo origen.
3 Teclado: el Tab que sale de la página y F1 a F5 vuelven a la app; Alt+F4 es del sistema.
4 Adjuntar un archivo; techo externo que corta una página colgada sin frenar a las demás.
5 Grupos de la autoprueba: panel, perfiles y techo externo.

AC:
- PAN-002, PAN-003, PAN-004, PAN-005, PAN-011, PAN-012, PAN-013, PAN-014, INV-PAN-001, INV-PAN-003, PRU-002, PRU-006 y PRU-007 tienen comprobación y pasan.
- PAN-014 se cumple sin panel (ADR-0003): una prueba muestra que armar el informe no crea ningún webview ni perfil.
- PAN-013: en una página local con un input de archivo, la página informa el nombre y el tamaño del archivo adjuntado; sin input, el error literal.
- Caso de falla: una navegación a /logout pedida por la página se cancela y se cuenta, y el panel se queda en su página.

V:
- La app con -autoprueba: grupos panel, perfiles y techo externo, con su salida.
- cargo test --workspace, con su salida.

DONE:
- append PLAN_EVIDENCE.md#PART-012: summary+files+checks+notes
- run plannable complete PART-012

S:
- si wry o webview2-com no permiten algo que el panel de la Unity hace, parar y reportar con la API que falta
