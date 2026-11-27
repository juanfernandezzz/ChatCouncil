@PlannablePlan v0.1

ID=PART-031
PH=POST_E9_PENDIENTES
SCN=SCN-031
OUT=Guarda de anonimato, botón de roles, Muse como integrador y fin de CC-2
DEP=[PART-030]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- Ampliar la guarda de anonimato a las páginas públicas del proveedor, dejar el botón de roles en todas las etapas, probar a Muse como integrador y terminar la ronda CC-2 desde la etapa 3.

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: post-E9 (lote PART-031; decisiones D49, D50, D51)
- prior: PART-030 (Muse como panel; CC-2 pausada en la etapa 3 por la guarda)
- next: ninguna
- la guarda rechazó https://www.perplexity.ai/en-GB/changelog/<x>: operacion.rs es_interfaz_propia solo acepta /blog, /help-center y /hub
- Juan pulsa «Enviar a todos» y «Sí» y escribe «captura»; Code pega

C:
- pagina.js no cambia; no se desactiva la guarda; roles por defecto (RON-002) no cambian; sin tercer verificador
- el registro real solo se agrega; diagnósticos sobre copias con sha256; navegador\ no se lee ni se lista
- compilar desde C:\cc-repo; git add por ruta

F:
- crates/nucleo/src/operacion.rs, crates/app/src/interfaz.rs y su .slint, datos/specs.json (muse)

T:
1 Diagnóstico de la guarda sobre una copia del registro de CC-2, antes y después.
2 Prueba en rojo y arreglo: prefijo de idioma opcional y rutas /blog /help-center /hub /changelog /docs.
3 Botón «Mostrar los paneles de los roles» en todas las etapas y un clic en la lista abre el proveedor.
4 Gates, revisión, PR, merge, publicar y actualizar la app real.
5 Pruebas T1 y T2 de Muse como integrador en un perfil de prueba.
6 Asignación de roles según T1 y T2.
7 Terminar CC-2 desde la etapa 3 y generar el PDF.

AC:
- /en-GB/changelog/x, /es-419/docs/x y /help-center/x pasan; /search/<id>, /c/<id>, /share/<id>, /chat/<id> y /app/<id> siguen rechazadas, también con prefijo de idioma
- «Mostrar los paneles de los roles» activo en las siete etapas y un clic en un proveedor abre su panel
- «Pegar la operación» pasa la guarda con las 7 capturas de CC-2; si no, se reporta la URL como forma
- Muse solo se asigna si aprueba T1 (SIN MEMORIA, sin girasol) y T2 (marcas exactas, parser sin errores, sin H## inventado)

V:
- cargo fmt --check; cargo clippy -D warnings; cargo test --workspace; los gates de .github/workflows

DONE:
- append PLAN_EVIDENCE.md#PART-031: summary+files+checks+notes
- run plannable complete PART-031

S:
- si un gate, un hook o la guarda bloquea, parar y reportar; nunca desactivar la guarda
