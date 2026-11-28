@PlannablePlan v0.1

ID=PART-033
PH=POST_E9_PENDIENTES
SCN=SCN-033
OUT=El integrador y el redactor entregan texto, y la captura avisa más de un mensaje de la persona o un enlace de descarga
DEP=[PART-032]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- El integrador y el redactor entregan texto, y la captura avisa más de un mensaje de la persona o un enlace de descarga.

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: post-E9 (lote PART-032 a PART-035; decisiones D52, D53, D54)
- prior: PART-032 (D52.5, R61); en CC-2 GLM entregó primero un PDF

C:
- pagina.js no cambia; el registro real solo se agrega; navegador\ no se lee ni se lista; sin envíos; no se tocan las cuentas
- compilar desde C:\cc-repo; git add por ruta; los textos van literales

F:
- datos/prompts/prompt-integrador.ts
- datos/prompts/prompt-redactor.ts
- crates/paneles/src/lib.rs
- crates/nucleo/src/puerta.rs
- crates/nucleo/src/informe.rs

T:
1 Dos líneas literales en los prompts y sus vectores de referencia.
2 Prueba de que no contienen palabras de los analizadores.
3 Aviso de más de un mensaje de la persona y de enlace de descarga, sin tocar pagina.js.
4 Gates, revisión, evidence y complete.

AC:
- las dos líneas nuevas están literales en prompt-integrador.ts y prompt-redactor.ts, sin palabras que lean los analizadores
- una conversación con dos mensajes de la persona deja aviso en el panel, un hecho «aviso-captura» y una línea en el informe. Caso de falla: sin aviso
- una respuesta con un enlace de descarga (a[download], blob: o data:) deja aviso y hecho
- pagina.js tiene el mismo sha256

V:
- cargo fmt --check; cargo clippy -D warnings; cargo test --workspace; autoprueba, pruebainterfaz y pruebaronda; los gates de .github/workflows

DONE:
- append PLAN_EVIDENCE.md#PART-033: summary+files+checks+notes
- run plannable complete PART-033

S:
- si un gate, un hook o una prueba bloquea, parar esa parte y reportar
