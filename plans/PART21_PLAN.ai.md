@PlannablePlan v0.1

ID=PART-021
PH=E9_RECORRIDO_REAL
SCN=SCN-021
OUT=ESC-014 a ESC-017 e INV-ESC-001 con prueba y evidencia
DEP=[PART-020]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- Enviar a todos con confirmación en las cinco etapas: Juan pulsa «Enviar a todos» y «Sí» en vez de enviar en cada panel.

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: E9 (segunda parte)
- prior: PART-020; E9 fase 1 (f7f9fac a ba0da36)
- next: ronda real de E9 con el botón
- spec: openspec/specs/escritura-compositor/spec.md (ESC-014 a ESC-017, INV-ESC-001); docs/adr/0011-envio-con-confirmacion.md (D33)

C:
- pagina.js no cambia (sha256 39b048ce…5161); el envío vive en datos/pagina/enviar.js
- solo se envía en paneles «pegado-falta-enviar» cuyo compositor tiene exactamente el texto pegado; nunca dos veces; nunca reintento solo
- en modo de prueba solo en las páginas locales de tests/paginas
- el registro no cambia de formato; el estado tras el envío es el mismo que tras enviar a mano
- nucleo sigue sin dependencias

F:
- datos/pagina/enviar.js
- crates/paneles/src/lib.rs
- crates/app/src/interfaz.rs, crates/app/src/ventana.rs, crates/app/src/puerta.rs
- crates/nucleo/src/ronda.rs
- crates/app/src/bin/pruebaronda.rs, pruebainterfaz, tests/paginas

T:
1 Guardia nueva de INV-ESC-001 en rojo y después en verde.
2 enviar.js con los seis estados y la comprobación de 15 s (ESC-016, ESC-017).
3 Botón «Enviar a todos», ventana de confirmación y envío en paralelo en las cinco etapas (ESC-014, ESC-015).
4 Textos de B3 y B4 literales; pruebas que los comparan ajustadas.
5 Pruebas de pruebaronda y pruebainterfaz; medición del envío y de la CPU en reposo.

AC:
- «No, todavía no» no envía: 0 clics; «Sí» envía 1 clic por panel elegible.
- Caso de falla: compositor distinto, ya enviado, sin botón o sin comprobación en 15 s: 0 clics en ese panel, su cabecera dice por qué y los demás se envían.
- Kimi con Enter y DeepSeek con div; las cinco etapas.
- Esc equivale a «No»; el foco vuelve al botón; el lector lee título, cuerpo y botones.

V:
- cargo test; autoprueba; pruebaronda; pruebainterfaz; sha256 de pagina.js; medición en bench/resultados.

DONE:
- append PLAN_EVIDENCE.md#PART-021: summary+files+checks+notes
- run plannable complete PART-021

S:
- si un gate o un hook frena, parar y reportar
- si un proveedor solo falla en segundo plano, medirlo antes de cambiar el envío a uno por vez
