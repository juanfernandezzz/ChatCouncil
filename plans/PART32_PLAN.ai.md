@PlannablePlan v0.1

ID=PART-032
PH=POST_E9_PENDIENTES
SCN=SCN-032
OUT=Volver a pegar en «Más…», pegados en el registro y arrastres de PART-031
DEP=[PART-031]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- Volver a pegar en «Más…», pegados en el registro y arrastres de PART-031.

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: post-E9 (lote PART-032 a PART-035; decisiones D52, D53, D54)
- prior: PART-031 aprobada con arrastres (D52.1, D52.3)

C:
- pagina.js no cambia; el registro real solo se agrega; navegador\ no se lee ni se lista; sin envíos; no se tocan las cuentas
- compilar desde C:\cc-repo; git add por ruta; los textos van literales

F:
- crates/nucleo/src/puerta.rs
- crates/nucleo/src/informe.rs
- crates/app/src/interfaz.rs y su .slint
- crates/app/src/pruebaronda.rs

T:
1 Diagnóstico en rojo: operación pegada no vuelve a pegarse; investigación capturada con conversación nueva sigue Capturado.
2 Hecho «pegado» en el registro, prefijo intacto.
3 Estado por orden: último pegado posterior a la última captura.
4 Grupo «Volver a pegar» en los dos menús «Más…» y sus ventanas.
5 Sección «Lo que se pegó» en el informe.
6 Arrastres de PART-031: doble clic, agent-desktop, bytes de CC-2.
7 Gates, revisión, plannable evidence y complete.

AC:
- en Investigación, Operación, Integración, Verificación y Redacción, «Más…» trae «Volver a pegar en este panel…» y «Volver a pegar toda la etapa…»; fuera de eso quedan desactivados con su motivo
- volver a pegar abre una conversación nueva, pega lo mismo que pide la etapa y no envía; el panel queda «Pegado, falta que envíes» y entra en «Enviar a todos». Caso de falla: un panel capturado al que se le vuelve a pegar sigue «Capturado»
- con una respuesta sin capturar, la ventana lo dice y el foco empieza en «Cancelar»
- cada pegado agrega un hecho «pegado» (etapa, panel, bytes del texto; bytes y sha256 del archivo; repetido) y el prefijo del registro queda igual
- el informe muestra «Lo que se pegó»; sin hechos «pegado», queda la línea de hoy
- un doble clic rápido en un rol sin página lo abre una sola vez, y un clic real con el ratón lo abre
- PART-031 cerrada en plannable; los commits de part-031-pausa van en el PR

V:
- cargo fmt --check; cargo clippy -D warnings; cargo test --workspace; autoprueba, pruebainterfaz y pruebaronda; los gates de .github/workflows

DONE:
- append PLAN_EVIDENCE.md#PART-032: summary+files+checks+notes
- run plannable complete PART-032

S:
- si un gate, un hook o una prueba bloquea, parar esa parte y reportar
