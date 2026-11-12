# E7 · Interfaz y paneles · spec

## Qué
La app de ChatCouncil: una ventana Slint que muestra la ronda por etapas, los paneles con las páginas reales de los proveedores y las secciones Ronda, Historial, Ajustes y Ayuda, sobre el núcleo de E6, con el mismo comportamiento que ChatCouncil-Unity en Windows. El comportamiento exacto está en openspec/; esta spec no lo repite.

## Por qué
El núcleo ya decide igual que la Unity. Falta lo que la persona ve y toca, y lo que habla con las páginas. Aquí vive lo que no se negocia: la app nunca envía, nunca lee credenciales y nunca captura sola.

## Alcance
- Los 98 requisitos e invariantes de la sección E7 de docs/E7-requisitos.md, más DIA-001 e INF-013, anotados para E7 en bench/resultados/e6-cobertura.txt.
- Fuera: actualización e instalador (E8), comparación con la Unity (E8), ronda real de Juan (E9), Android y las demás plataformas (segunda pasada).

## Criterio de hecho de E7
- Cada ID tiene su comprobación en una de las tres pruebas internas (-autoprueba, -pruebainterfaz, -pruebaronda), en cargo test o en una comprobación manual escrita y ejecutada con agent-desktop sobre páginas locales. Ninguno queda sin dueño.
- Las tres pruebas internas terminan en «Resultado: N/N» con código 0.
- Ninguna prueba automática abre la página real de un proveedor.
- La app queda medida de forma orientativa: arranque, RAM y CPU del proceso con diez paneles locales, y tamaño. La comparación válida es de E8.

## Reglas
- ADR-0003 a ADR-0010 y AGENTS.md mandan.
- Textos de la interfaz: literales de openspec y de la Unity. Un texto que haga falta y no exista se marca TEXTO-PENDIENTE; lo redacta Claude.
- La interfaz no pierde ninguna acción, texto ni estado de la Unity. Cómo se ve lo decide Juan y llega en el lote.
- El script de página (DAT-003) y las páginas de prueba son datos, idénticos a los de la Unity.
- Las pruebas usan carpetas temporales y perfiles de prueba; nunca la carpeta de datos real ni navegador/.
