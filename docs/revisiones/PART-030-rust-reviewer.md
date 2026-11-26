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
