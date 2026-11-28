@PlannablePlan v0.1

ID=PART-036
PH=POST_E9_PENDIENTES
SCN=SCN-036
OUT=La captura no se traba y cuenta mensajes; arreglos de la revisión de PART-032/033; capturas, ratón real y bytes de CC-2
DEP=[PART-035]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- La captura no se traba y cuenta mensajes; arreglos de la revisión de PART-032/033; capturas, ratón real y bytes de CC-2.

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: post-E9 (lote PART-036; decisión D55)
- prior: PART-035

C:
- pagina.js no cambia; el registro real solo se agrega; navegador\ no se lee ni se lista; sin envíos; no se tocan las cuentas
- compilar desde C:\cc-repo; git add por ruta; los textos van literales

F:
- crates/app/src/interfaz.rs
- crates/app/src/pruebaronda.rs
- crates/nucleo/src/puerta.rs
- bench/resultados/cc2-archivos.json

T:
1 Sonda en paralelo con techo de 2 s (A2).
2 Conteo de mensajes (A3) y aviso por panel (A4).
3 Pegado sin cortar la ronda (A5), specs en uso (A6), guarda de «abriendo» (A7).
4 Gates, revisión, evidence (A8).
5 Capturas, ratón real y bytes de CC-2 (B1 a B3).
6 PR, merge, Release y actualización de la app real.

AC:
- con un panel cuya página no responde a la sonda, la captura termina en menos de 3 s más de lo que tarda sin él, y los demás paneles conservan sus avisos. Caso de falla: con la sonda en serie y el techo de 90 s, la captura espera el techo
- una página simulada con un mensaje que coincide con las dos partes de una unión (como ChatGPT) cuenta 1; un mensaje con dos descendientes que coinciden (como Mistral) cuenta 1; dos mensajes cuentan 2
- el aviso del panel nombra al proveedor, y hay un aviso por panel
- si falla anotar un pegado al pegar la pregunta, la app no dice que la ronda no se abrió: dice el texto nuevo, y los demás pegados quedan anotados
- seccion_pegados usa las specs en uso
- la marca «abriendo» se suelta aunque la tarea termine antes de tiempo
- capturas de «Volver a pegar» y de sus dos ventanas; un clic real abre un rol sin página, y un doble clic real lo abre una sola vez
- bytes y sha256 de los archivos del integrador y del redactor de CC-2, medidos sobre la copia, con el sha de la copia igual antes y después

V:
- cargo fmt --check; cargo clippy -D warnings; cargo test --workspace; autoprueba, pruebainterfaz y pruebaronda; los gates de .github/workflows

DONE:
- append PLAN_EVIDENCE.md#PART-036: summary+files+checks+notes
- run plannable complete PART-036

S:
- si un gate, un hook o una prueba bloquea, parar esa parte y reportar
