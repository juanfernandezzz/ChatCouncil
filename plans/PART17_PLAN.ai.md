@PlannablePlan v0.1

ID=PART-017
PH=E7_INTERFAZ_Y_PANELES
SCN=SCN-017
OUT=Menús, mantenimiento, teclado y lector de pantalla
DEP=[PART-016]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- Toda acción está en su menú con su motivo si no aplica, se alcanza con el teclado de una mano y se lee con el lector de pantalla.

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: E7 (parte 7 de 8)
- prior: PART-016
- next: PART-018 cierre de E7
- spec: openspec/specs/interfaz/spec.md; openspec/specs/paneles-sesiones/spec.md; openspec/specs/pruebas-internas/spec.md

C:
- una acción deshabilitada nunca queda sin motivo visible
- la app nunca toma una tecla F pulsada con Alt
- el lector usa la accesibilidad nativa de Slint (ADR-0010); la página nativa no entra en la jerarquía de la app
- cerrar la sesión de un panel nunca toca a los demás

F:
- crates/app/
- crates/paneles/

T:
1 Menús propios: del panel, Ronda, corregir, mantenimiento y paneles, con grupos y motivos, sin salirse de la ventana.
2 Mantenimiento: recargar la página, diagnóstico de selectores, cerrar la sesión de este panel y agregar una cuenta de Google.
3 Teclado: F1 a F5, Ctrl+Tab, regiones con la página nativa incluida y menú contextual del campo.
4 Lector de pantalla: papeles, nombres, estados y activación.
5 -pruebaronda: secciones, accesibilidad y teclado.

AC:
- IFZ-008, IFZ-009, IFZ-010, IFZ-011, IFZ-017, IFZ-018, IFZ-019, IFZ-020, IFZ-021, IFZ-022, INV-IFZ-001, INV-IFZ-002, INV-IFZ-003, INV-IFZ-004, INV-IFZ-005, PAN-008, PAN-009, PAN-010, PAN-015 y PRU-017 tienen comprobación y pasan.
- Caso de falla: con Alt pulsado, F4 no lo toma la app y la ventana se cierra.

V:
- La app con -pruebaronda completa, con la ventana al frente, con su salida.
- cargo test --workspace, con su salida.

DONE:
- append PLAN_EVIDENCE.md#PART-017: summary+files+checks+notes
- run plannable complete PART-017

S:
- si la accesibilidad de Slint no puede cumplir lo observable de IFZ-020 a IFZ-022, parar y reportar con lo que falta
