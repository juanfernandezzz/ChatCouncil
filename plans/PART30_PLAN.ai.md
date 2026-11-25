@PlannablePlan v0.1

ID=PART-030
PH=POST_E9_PENDIENTES
SCN=SCN-030
OUT=Muse de Meta como proveedor
DEP=[PART-029]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- Agregar Muse (Meta) como proveedor 11, disponible como panel y sin rol en la ronda CC-2 (D48.1), con sus selectores medidos en un perfil de prueba (D48.2).

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: post-E9 (lote PART-029, PART-030 y ronda CC-2; decisiones D43.1, D46, D47, D48)
- prior: PART-029
- next: ronda CC-2 (Parte 3 del lote)
- fuente: el prompt del lote (Partes 1B y 2)
- Juan solo está en la Parte 2 (cuando escribe «muse») y en la Parte 3 (cuando escribe «ronda»); lo que lo necesitaría fuera de esos momentos se salta, se anota y el lote sigue

C:
- pagina.js no cambia; el repo, el Release y el tag chatcouncil-v1 de ChatCouncil-Unity no se tocan
- no terminar procesos de la app que no lanzó Code; no leer, copiar ni listar navegador\
- compilar siempre desde C:\cc-repo; git add por ruta, nunca -A
- el registro de investigación no cambia de formato (append-only)

F:
- datos/specs.json (muse), crates/nucleo y crates/app (listas de proveedores)
- datos/pagina/ (script nuevo para «todos desde el último del usuario»; pagina.js no cambia)
- docs/revisiones/PART-030-rust-reviewer.md

T:
1 Entrada «muse» en specs.json con selectores vacíos y notas; ajustar lo que suponga diez proveedores.
2 Modo de captura «todos los mensajes del asistente desde el último del usuario», con prueba en páginas locales.
3 Parte 2 con Juan: selectores y pruebas T1 a T4 en un perfil de prueba; specs.json completo.
4 Gates, revisión independiente, PR, merge con el CI en verde y publicar en verde.

AC:
- Muse sale en la lista de proveedores y no entra en ningún rol ni en la selección por defecto
- el modo nuevo junta solo los mensajes del asistente posteriores al último del usuario
- el puerto de depuración se abre solo en el perfil de prueba

V:
- cargo test; autoprueba; pruebaronda; pruebainterfaz; fmt --check; clippy -D warnings

DONE:
- append PLAN_EVIDENCE.md#PART-030: summary+files+checks+notes
- run plannable complete PART-030

S:
- si un gate o un hook frena, anotar, saltar lo que dependa y seguir
- no leer ni copiar navegador\, cookies ni credenciales
