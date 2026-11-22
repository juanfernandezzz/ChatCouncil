# PART-022 a PART-024 · Revisión ecc:rust-reviewer · rama part-022-024 (main...HEAD)

Solo lectura; no se ejecutó cargo (el cierre dice 24+11+197+15+14 en verde). Revisión estática del diff de crates/, datos/ y los vectores. Los números de línea son del árbol de trabajo en C:\cc-repo. Fuera de alcance por instrucción: roles por defecto glm/qwen/deepseek/glm (D38.1), nombre visible «ChatCouncil» y el abandono del vector de la Unity para los roles por defecto.

Veredicto: sin hallazgos de severidad alta. No hay unsafe nuevo, ni unwrap/expect nuevos en rutas de producción (los expect nuevos están solo en código de prueba), ni secretos. Hay 6 hallazgos medios y 7 bajos.

## Medios

### 1. Pérdida de la acción «capturar» en una operación ya capturada (regresión)
crates/nucleo/src/puerta.rs:2977-2994. Para etapa "operacion" y estado "capturado" ahora se hace `return Ok(Situacion { problema: aviso, ..Default::default() })`, sin `accion`. Antes ese estado caía en `_ if terminado => accion(CAPTURAR_ESTE)`. El aviso de bucle dice «Vuelve a capturar o repite la operación en este panel», pero la Situacion no ofrece ninguna acción de captura; y aunque no haya bucle se pierde la recaptura que antes se ofrecía mientras la página siguiera terminada. Una salida cortada es justo el caso en que `terminado` seguirá siendo cierto.
Arreglo: conservar la acción (`accion: terminado.then_some(CAPTURAR_ESTE)`) junto con `problema`, y añadir una prueba de que un panel capturado con bucle trae ambos.

### 2. Lectura completa del registro por panel en cada cálculo de Situacion
crates/nucleo/src/puerta.rs:2977-2994. Cada Situacion de un panel «capturado» llama a `self.leer_registro()?` (parseo del .jsonl entero, que crece con las rondas) y luego `parsear_hallazgos` sobre la salida. Con 7 paneles y refrescos de la interfaz son 7 lecturas completas por refresco. El valor 1 del proyecto es el rendimiento y el cierre mide tiempos de armado, no este camino. El mismo patrón ya existía para error-captura, pero solo corría en el estado de error.
Arreglo: calcular el aviso una vez, al registrar la captura, y guardarlo en memoria por (ronda, operador); o cachear por id de salida. Si se deja, medir antes y después.

### 3. aviso_prompts_de_captura no avisa si el mensaje leído es una subcadena corta de la pregunta
crates/nucleo/src/puerta.rs:3216-3222. El criterio es `t.contains(&pregunta) || pregunta.contains(t)` sobre letras y cifras. Si el selector userMessage devuelve un fragmento corto (un carácter, «Tú», una hora) o el mensaje quedó truncado a la mitad, `pregunta.contains(t)` es verdadero y el proveedor cuenta como «coincide». El aviso existe justo para detectar un pegado distinto o truncado, y el segundo sentido de la contención lo oculta. El texto «coincide en los N proveedores» tampoco es cierto en ese caso.
Arreglo: exigir un solo sentido (el mensaje leído contiene la pregunta) o una cobertura mínima (por ejemplo 90 % de la pregunta), y añadir una prueba con mensaje truncado que espere aviso.

### 4. Prueba de roles debilitada: un rol mal leído puede pasar
crates/nucleo/src/ronda.rs:493-495 (prueba que recorre el vector LeerRoles). `a_igual` acepta `leido == esperado || (esperado == unity && leido == nuevo)`. Si algún rol no cumple, la prueba solo exige `validar_seleccion(...) == None`: cualquier asignación válida pasa. Un error real al leer un rol explícito (por ejemplo, que leer_roles devuelva el defecto en vez del valor guardado) queda en verde mientras la asignación sea válida.
Arreglo: comparar rol a rol: si el esperado de la Unity es el defecto de la Unity, aceptar solo el defecto nuevo; en cualquier otro caso exigir igualdad exacta. Reservar el recurso a validar_seleccion para una lista explícita de contenidos con choque.

### 5. Pérdida de cobertura de extremo a extremo: tres pruebas «de la Unity» en #[ignore]
crates/nucleo/src/puerta.rs:4331 (prompts_los_de_los_roles_en_la_corrida_son_los_de_la_unity), :5119 (ronda_entera_deja_los_mismos_hechos_que_la_unity) y crates/nucleo/src/operacion.rs:1497 (operacion_los_prompts_de_operacion_son_los_de_la_unity). ronda_entera... es la única que recorre una ronda completa comparando todos los hechos persistidos; al ignorarla entera tampoco se verifican los hechos que no cambiaron (verificador, sellos, informes, orden de campos). Además crates/nucleo/src/prompts.rs:707-722 (prompts_los_de_los_roles_son_los_mismos_que_en_la_unity) conserva el nombre, pero para integrador y redactor ya solo comprueba que el prompt contenga la pregunta, y prompts.rs:732 deja un `let _ = hallazgos;` de resto.
Arreglo: regenerar los vectores con el comportamiento nuevo (golden fijado a mano, con su motivo en DESVIACIONES.md) en vez de ignorar; o descartar solo los campos que cambiaron a propósito (prompt del integrador, nombre de archivo, roles) y comparar el resto. Mientras tanto, renombrar la prueba de prompts a lo que hace y quitar el `let _`.

### 6. Falso positivo de «bucle» con pocas líneas
crates/nucleo/src/puerta.rs:3237-3256. La condición `repetidas * 10 >= n * 3` con n pequeño se dispara con una sola repetición: n=2 con 1 repetida (50 %) y n=3 con 1 repetida (33 %) avisan. Un operador que devuelve 2 o 3 hallazgos y repite uno recibe «puede ser un bucle del modelo». La constante está marcada «inferido, se revisa con datos», pero la prueba solo cubre n=10 y n=20.
Arreglo: exigir un mínimo (por ejemplo n >= 10 o repetidas >= 3) y añadir pruebas para n=2 y n=3; la medición E9 debería informar cuántos operadores reales caen en cada caso.

## Bajos

### 7. Código muerto en el diálogo del límite de archivo
crates/app/src/interfaz.rs:2535: `let _ = r.clone();` dentro del cierre no hace nada. Quitarlo, y quitar también el clon de `r` de la línea 2527 si el cierre no lo usa.

### 8. marcas_integrador puede quedar viejo
crates/nucleo/src/puerta.rs:2681-2690. `integrador_pegado(prompt)` (camino sin archivo) no borra `marcas_integrador`; si se llamara tras un pegado con archivo, el informe se registraría con marcas que no corresponden al prompt. Hoy interfaz.rs:2597 ya no lo alcanza con "integracion", pero la API pública lo permite. Arreglo: poner `self.marcas_integrador = None;` ahí, o retirar esa rama.

### 9. pedidos.clear() en enviar.js
datos/pagina/enviar.js:75. Vaciar el mapa al llegar un pedido nuevo limpia los vencidos, pero si el anterior sigue en vuelo su promesa vuelve a escribir su resultado después y queda una entrada suelta; y no se impide un segundo pedido mientras otro sigue pendiente (dos clics posibles si Rust lanzara dos). Rust no reintenta, así que hoy no ocurre. Arreglo: rechazar un pedido nuevo mientras haya uno pendiente, o guardar solo el último id.

### 10. La comprobación huella es genérica pero sirve solo a enviar.js
crates/paneles/src/lib.rs:775: `window.{o}?.huella != "\"cc-enviar\""` aplica a cualquier script extra; hoy el único es enviar (:728), pero un segundo script sin huella se reinyectaría en cada pedido. Arreglo: pasar la huella esperada junto con `extra`, o comentar que es solo para enviar.

### 11. El nombre del archivo del integrador no es único por minuto
crates/nucleo/src/puerta.rs:1339 (`integrador-{sello}.txt`). Dos pegados del integrador en el mismo minuto dan el mismo nombre y el segundo sobrescribe el primero. No se pierde información (el prompt completo queda en el registro), pero el adjunto en disco puede diferir de lo registrado en la primera pegada. Arreglo: sufijo de 6 hexadecimales como en la operación (:1260).

### 12. quitar_linea_archivo normaliza los saltos de línea
crates/nucleo/src/parseos.rs:164-172. Solo cuando hay línea ARCHIVO, `unir` junta con LF y se pierden los CRLF del resto del informe; el cuerpo derivado deja de ser byte a byte el capturado. Arreglo: cortar el texto original tras la primera línea en vez de reconstruirlo.

### 13. Pruebas de medición ignoradas con rutas y prefijo fijos
crates/nucleo/src/medicion_e9.rs:631-658, medicion_tiempos_e9.rs, medicion_roles.rs. Son #[ignore] y solo de prueba, así que no afectan al CI; pero dependen de C:\cc-target\tmp\e9-registro.jsonl y de `starts_with("8cc12458")`, y manejan una copia del registro con datos de cuentas reales (según el comentario solo se guardan números). Arreglo: documentar en bench/ cómo recrear la copia y comprobar que bench/resultados/*.json no lleva texto de respuestas ni preguntas (solo se leyó el principio de e9-ronda-base.json; no se auditó entero).

## Notas sin hallazgo
- ErrorEnvio.tras_el_pedido (paneles/lib.rs:573-801): la bandera se pone antes de ejecutar el pedido y se lee desde el cierre con Cell; los errores del guarda de pruebas y de la inyección quedan en false. Consistente con interfaz.rs:1897-1903 y autoprueba.rs:1289.
- enviar_a_todos (interfaz.rs:1775-1810) suelta la acción en las tres salidas tempranas; el único return sin soltar es el de upgrade() fallido, al cerrar la app.
- R17 (interfaz.rs:2512-2545): «Pegar igual» reutiliza pegar_rol_armado; el diálogo no deja la acción tomada porque en_accion la suelta al terminar el futuro.
- datos/specs.json perdió el salto de línea final; el hash fijado ya lo refleja, no es error.

---

## Resolución (2026-11-22)

Corregidos dentro del alcance, con prueba, tras esta revisión:
- 1: el panel de operación «capturado» conserva la acción de capturar junto con el aviso de bucle (`accion: terminado.then_some(CAPTURAR_ESTE)`).
- 3: el mensaje leído coincide si contiene la pregunta o si es al menos el 90 % de ella; un fragmento corto avisa. Prueba nueva.
- 4: la prueba de roles compara rol a rol con igualdad exacta (salvo el defecto nuevo); solo dos contenidos listados que chocan distinto con el defecto nuevo se comparan por validez.
- 6: el aviso de bucle exige al menos 3 repetidas además del 30 %; prueba nueva con 3 líneas y 1 repetida.

Reportados, sin cambiar:
- 2 (lectura del registro por panel en cada Situacion): rendimiento, hay que medirlo antes de cachear; queda para un lote propio.
- 5 (tres pruebas contra el vector de la Unity en `#[ignore]`): los prompts se apartaron a propósito (D35 a D38); regenerar los vectores a mano es trabajo aparte (DESVIACIONES.md).
- 7 a 13 (bajos): sin tocar; el 11 (nombre `integrador-{sello}.txt` repetido si se pega dos veces en el mismo minuto) es el más cercano a un fallo real y conviene un sufijo de azar como en el archivo de operación.

## ponytail-review (lectura propia del núcleo, puerta.rs y los cambios de G y H)

What this change does: PART-022 hace que el integrador reciba la tabla en un archivo con marcas, quita el código estable del nombre de archivo de operación, compara cada mensaje de usuario con la pregunta y avisa de bucles. PART-023 mide los selectores, cambia los roles por defecto a GLM y renombra lo visible a «ChatCouncil».

- Must fix: nada.
- Should fix: ver 2, 5 y 11 arriba (rendimiento sin medir, cobertura ignorada, nombre repetible).
- Nice to have: `let _ = r.clone();` sobrante en `crates/app/src/interfaz.rs:2535`.
- Not checked: bench/resultados/*.json completos y el JS de enviar.js a fondo.
Verdict: fix nothing blocking.
