# ADR-0011 · Envío con confirmación
Fecha: 2026-11-18 · Estado: aceptada · Decide: Juan (D33) · Sustituye: INV-ESC-001
## Contexto
La app pegaba en todos los paneles a la vez, pero Juan enviaba a mano en cada uno, en cada etapa. Con siete paneles por etapa, eso es trabajo repetido que no agrega juicio.
## Decisión
Cada etapa tiene un botón «Enviar a todos». Antes de enviar se abre siempre una ventana con las indicaciones de la etapa y la pregunta de si están activadas; solo «Sí» envía. La app envía solo en paneles pegados sin enviar cuyo compositor tiene exactamente el texto pegado, y nunca reintenta sola. El envío usa los selectores «submit» de specs.json desde un script aparte; pagina.js no cambia. Enviar a mano sigue igual.
## Consecuencias
Juan pulsa dos veces por etapa en vez de una vez por panel. El clic es sintético: un proveedor puede ignorarlo o tratarlo como automatización; ese panel se envía a mano. El registro de investigación no cambia de formato.
