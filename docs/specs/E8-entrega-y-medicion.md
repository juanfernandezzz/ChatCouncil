# E8 · Entrega y medición · spec

## Qué
La app nueva se instala, se actualiza y se publica como la Unity, y se compara medida contra la Unity en el mismo PC.

## Por qué
El valor 1 del proyecto es el rendimiento, demostrado contra la línea base de la Unity y nunca supuesto. Y para que Juan haga su ronda real (E9), la app tiene que instalarse y actualizarse sola.

## Alcance
- Los 6 requisitos de E8 en docs/E7-requisitos.md (ARR-008, ARR-009, ARR-011, ARR-012, INV-ARR-001, INV-ARR-002), más DIA-004 y la parte de ARR-007 que dice «no busca actualización en pruebas».
- La comparación M1, M2, M4 y M5 contra la Unity. M3 necesita una ronda real y queda para E9.

## Criterio de hecho de E8
- El CI publica en el Release «chatcouncil-v1» del repo nuevo el instalador y version.txt; una compilación local (0.1.0) nunca ofrece actualización.
- El instalador no pide administrador, está en español, convive con la Unity y avisa si falta WebView2.
- La app nueva está instalada en el PC de Juan desde ese Release.
- bench/resultados/e8-comparacion.json trae M1, M2, M4 y M5 de las dos apps, intercaladas, con la CPU de la máquina en reposo bajo 10 % antes de cada corrida, y la diferencia por medida.

## Reglas
- ADR-0006, ADR-0007 (con sus enmiendas) y ADR-0010.
- Nada del repo ChatCouncil-Unity, de su Release, de la app instalada ni de su carpeta de datos cambia.
- Una medida en que la app nueva pierde se informa con su número; no se omite ni se reinterpreta.
