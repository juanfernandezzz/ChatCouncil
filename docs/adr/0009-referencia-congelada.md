# ADR-0009 · Referencia congelada y Pocket Party

Estado: aceptada · 2026-11-10 · D17 (decide Juan; la regla de congelar la fija Claude)

## Contexto
Juan decidió que la línea de ChatCouncil-Unity seguirá como otro producto, Pocket Party LLM-VTTRPG, y que este repo será la única versión de ChatCouncil. El port todavía depende de ChatCouncil-Unity: es la referencia de funciones, la línea base de E8 y el origen de los datos de E9. Además, un push a main en ese repo reemplaza el Release que la app instalada ofrece como actualización.

## Decisión
ChatCouncil-Unity queda congelado en el tag «referencia-port-chatcouncil» hasta el relevo (E9): ni el repo ni la app instalada reciben cambios ni cambian de nombre. Pocket Party nace en un repo aparte, github.com/juanfernandezzz/PocketParty, copiado desde ese tag. Después de E9, ChatCouncil-Unity se archiva en solo lectura.

## Consecuencias
La referencia que lee cada parte del port es ese tag. Las dos apps podrán convivir en la misma máquina cuando Pocket Party cambie su nombre, su id y sus carpetas. En este repo, «ChatCouncil-Unity» sigue nombrando a la referencia.
