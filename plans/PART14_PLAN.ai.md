@PlannablePlan v0.1

ID=PART-014
PH=E7_INTERFAZ_Y_PANELES
SCN=SCN-014
OUT=Secciones, Ajustes, primer arranque, historial y ayuda
DEP=[PART-013]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- La app tiene sus cuatro secciones, guía el primer arranque, guarda el consejo y la apariencia, muestra el historial y deja entrar a cada cuenta.

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: E7 (parte 4 de 8)
- prior: PART-013
- next: PART-015 la Ronda: pregunta e investigación
- spec: openspec/specs/interfaz/spec.md; openspec/specs/arranque-actualizacion/spec.md; openspec/specs/ajustes/spec.md; openspec/specs/paneles-sesiones/spec.md; openspec/specs/pruebas-internas/spec.md

C:
- los textos y las validaciones salen de nucleo::ajustes; la interfaz no los repite
- la sesión se deduce del compositor, nunca de cookies
- el diseño visual sigue lo que diga el lote
- el historial de la Unity se importa en solo lectura al arrancar (ADR-0006), con prueba sobre carpetas temporales

F:
- crates/app/

T:
1 Riel, cajón y clases de ancho; secciones Ronda, Historial, Ajustes y Ayuda.
2 Primer arranque guiado de dos pasos; consejo, roles, apariencia y «tus datos».
3 Cuentas: «Entrar», «Comprobar» y el estado de sesión.
4 Historial de rondas; Ayuda con versión, specs en caliente y licencias de terceros (crates y fuentes).
5 -pruebainterfaz RUTA -fase N en sus tres fases.

AC:
- ARR-002, ARR-004, IFZ-013, IFZ-014, IFZ-016, PAN-006, PAN-007, PRU-009, PRU-010 y PRU-011 tienen comprobación y pasan.
- Las tres fases de -pruebainterfaz terminan en «Resultado: N/N» con código 0, sobre la misma carpeta de prueba.
- Caso de falla: las seis combinaciones inválidas del consejo se rechazan con su texto y sin escribir el archivo.

V:
- La app con -pruebainterfaz, fases 1, 2 y 3, con sus salidas.
- cargo test --workspace, con su salida.

DONE:
- append PLAN_EVIDENCE.md#PART-014: summary+files+checks+notes
- run plannable complete PART-014

S:
- si falta un texto que la Unity no tiene, marcar TEXTO-PENDIENTE y seguir; si falta la decisión de diseño de Juan, parar y reportar
