@PlannablePlan v0.1

ID=PART-018
PH=E7_INTERFAZ_Y_PANELES
SCN=SCN-018
OUT=Cierre de E7: auditoría, pulido, cobertura y medición orientativa
DEP=[PART-017]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- E7 queda cerrada: cada requisito con su comprobación, la interfaz pulida sin perder nada y la app medida de forma orientativa.

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: E7 (parte 8 de 8)
- prior: PART-017
- next: E8 revisión, medición y entrega
- spec: docs/specs/E7-interfaz-y-paneles.md

C:
- el pulido no cambia ningún texto, acción ni estado
- ninguna comprobación abre la página real de un proveedor
- las mediciones siguen D16; la comparación con la Unity es de E8

F:
- crates/app/
- crates/paneles/
- bench/resultados/

T:
1 ponytail-audit de crates/app y crates/paneles; sus hallazgos se reportan.
2 Pulido de la interfaz con impeccable, make-interfaces-feel-better y accessibility.
3 Las comprobaciones manuales que queden sin prueba automática, escritas y ejecutadas con agent-desktop sobre páginas locales.
4 Tabla de cobertura de E7 en bench/resultados/e7-cobertura.txt.
5 Medición orientativa con diez paneles locales: arranque, RAM y CPU del proceso y del árbol, y tamaño del .exe.

AC:
- La tabla de cobertura trae los 100 IDs de E7 (98 más DIA-001 e INF-013), cada uno con su comprobación, y 0 sin comprobación.
- Las tres pruebas internas terminan en «Resultado: N/N» con código 0 después del pulido.
- No queda ningún TEXTO-PENDIENTE en el código.
- Caso de falla: una comprobación manual que no pasa queda anotada como falla y E7 no se cierra.

V:
- Las tres pruebas internas, con sus salidas.
- bench/resultados/e7-cobertura.txt y bench/resultados/e7-app.json.

DONE:
- append PLAN_EVIDENCE.md#PART-018: summary+files+checks+notes
- run plannable complete PART-018

S:
- si una comprobación manual necesita la cuenta de Juan, no se hace: se anota para E9
