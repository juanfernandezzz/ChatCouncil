# PART-030 · revisión de ecc:rust-reviewer

Alcance: git diff HEAD de PART-030 (Muse como proveedor 11, solo panel). Solo lectura, sin compilar.

| # | Hallazgo | Decisión |
|---|---|---|
| 1 | leer-todos.js devolvía la lectura normal, sin aviso, si el selector del mensaje del usuario no encontraba nada (Muse lo tiene vacío hasta medirlo). | Aplicado: devuelve `error` «no se encontró el mensaje del usuario». |
| 2 | `estadoDeGeneracion` (pagina.js, no se toca) mide la quiescencia solo del último mensaje. | Se mide en la Parte 2; si falla, se ajusta fuera de pagina.js. |
| 3 | La huella de pedir_al_script sigue válida para enviar.js. | Sin falla. |
| 4 | Muse no se cuela en selección, roles ni pool. | Sin falla. |
| 5 | Un specs.json en la carpeta de datos sin `enLaRonda` volvería a poner a Muse en `conocidos`. | Sin cambio: divergencia previa (conocidos sale de las specs, el pool de CONOCIDOS). |
| 6 | Selectores vacíos no lanzan excepción; escribir/enviar darán «no se encontró el compositor» hasta medirlos. | Esperado. |
| 7 | La prueba de varios.html depende del orden de los nodos. | El orden está fijado en la página; sin cambio. |
| 8 | Hash de specs.json. | Verificado por cargo test (verde). |

## Parte 2 · revisión de ecc:rust-reviewer (Muse medido)

Alcance: git diff de la Parte 2 (specs.json de Muse, prueba nueva en datos.rs, spec.md). Solo lectura. Sin bloqueantes.

| # | Hallazgo | Decisión |
|---|---|---|
| 1 | Media: con element-gone el motor marca «observado» en cuanto el botón Detener no está (pagina.js:319-323); quiescenceMs no entra, y el botón desaparece ~1 s antes del fin. | Aplicado: Muse usa completion quiescence 4000 ms; la nota lo explica. pagina.js sin cambio. |
| 2 | Media: la prueba nueva era débil (find sobre todo el archivo, contains que acepta notas). | Aplicado: lee la spec de muse con el parser JSON y compara campo a campo. |
| 3 | Baja: el composer usa aria-label localizado. | Anotado en _notaSelectores; comentario de la prueba corregido. |
| 4 | Baja: no se midió si Enviar se deshabilita con el composer vacío. | Anotado en _notaComposer: medirlo antes del primer uso real en una ronda. |
| 5 | Baja: oración duplicada en spec.md. | Sin cambio de fondo; el hash vigente se actualizó. |
| 6 | Info: «Nuevo documento de texto.txt» sin seguimiento. | No se agrega al commit. |
