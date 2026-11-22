@PlannablePlan v0.1

ID=PART-026
PH=POST_E9_PENDIENTES
SCN=SCN-026
OUT=Pendientes técnicos de la auditoría E9 resueltos y medidos
DEP=[PART-024]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- Cerrar los pendientes técnicos de la auditoría E9 (D39): nombre único del archivo del integrador, marcas del archivo de operación que sobreviven al reinicio, D3 del redactor re-medido y el costo de Situacion por panel.

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: post-E9 (lote PART-025 y PART-026; decisión D39)
- prior: PART-024 (relevo de la Unity hecho)
- next: ronda CC-2 (objeto 3, instrucciones y skill de los investigadores)
- fuente: el prompt del lote (Parte 4, pasos 4.1 a 4.8)

C:
- pagina.js no cambia (sha256 39b048ce…5161)
- nada fuera del lote; si un gate o un hook frena, parar y reportar
- compilar siempre desde C:\cc-repo
- el registro de investigación no cambia de formato (append-only)
- datos de las cuentas de Juan nunca en informes ni en el repo; solo números y estados
- git add por ruta; rama part-026; PR

F:
- crates/nucleo/src/puerta.rs (armar_integrador, marcas_integrador, marcas_redactor, Situacion)
- crates/nucleo/src/prompts.rs (lectura del archivo)
- crates/app/src/pruebaronda.rs, crates/app/src/pruebainterfaz.rs
- bench/resultados

T:
1 4.2 Nombre del archivo del integrador integrador-{sello}-{aleatorio}.txt con 6 hex nuevos por pegado. Prueba en rojo primero: dos pegados en el mismo minuto dan nombres distintos.
2 4.3 Guardar las marcas junto al archivo de operación (operaciones/, mismo nombre, extensión .marcas) al pegar y leerlas ahí al capturar. Prueba en rojo primero: tras reiniciar el control da entero, marcas-distintas, sin-linea o no-pudo-leer, nunca sin-marcas-registradas.
3 4.4 Re-medir D3 del redactor con el conjunto de sellos filtrado por ronda: ABAB intercalado, mediana de 5, regla del 10 % de D16, con CPU de la máquina; reemplazar el valor inválido en bench/resultados.
4 4.5 Medir Situacion por panel con el registro E9 y 10 paneles, mediana de 5; si pasa de 16 ms por panel, agregar caché invalidada al agregar al registro y medir de nuevo; si no, no cambiar nada.
5 4.6 a 4.8 Gates, revisión independiente (ponytail-review y ecc:rust-reviewer, salida en docs/revisiones/PART-026-rust-reviewer.md), PR y merge con el OK de Juan, CI, publicar y Actualizar.

AC:
- Dos pegados seguidos dan dos nombres distintos; tras reiniciar la lectura nunca es sin-marcas-registradas; mediciones con método, mediana y CPU; PR abierto, mergeado, CI y publicar en verde.
- caso de falla: se detiene y se reporta, sin tocar lo que está fuera del alcance

V:
- cargo test; autoprueba; pruebaronda; pruebainterfaz; fmt --check; clippy -D warnings; sha256 de pagina.js

DONE:
- append PLAN_EVIDENCE.md#PART-026: summary+files+checks+notes
- run plannable complete PART-026

S:
- si un gate o un hook frena, parar y reportar
- no leer ni copiar navegador/, cookies ni credenciales; el registro REAL solo en lectura