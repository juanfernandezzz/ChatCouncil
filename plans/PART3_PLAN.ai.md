@PlannablePlan v0.1

ID=PART-003
PH=E6_NUCLEO_RUST
SCN=SCN-003
OUT=Registro append-only en JSONL e importación de solo lectura
DEP=[PART-002]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- El núcleo escribe el registro y las conversaciones en JSONL con el mismo formato de la Unity, append-only, e importa el historial de la Unity sin escribir nunca en su carpeta.

CTX:
- product: ChatCouncil (CONTEXT.md: registro)
- phase: E6 (parte 3 de 10)
- prior: PART-002
- next: PART-004 operación
- spec: openspec/specs/registro/spec.md
- decisions: ADR-0006 (AppData\Local\ChatCouncil; importación de solo lectura desde AppData\LocalLow\ChatCouncil\ChatCouncil-Unity)

C:
- nunca reescribir ni truncar una línea ya escrita
- las pruebas usan carpetas temporales; nunca la carpeta real de la Unity
- escritura con búfer y vaciado al cerrar cada hecho

F:
- crates/nucleo/src/registro.rs
- crates/nucleo/src/importar.rs

T:
1 Implementar los requisitos e invariantes de openspec/specs/registro/spec.md.
2 Implementar la importación: copiar conversaciones/*.jsonl de la carpeta de la Unity a la de la app nueva, solo si no existen ya, sin abrir en escritura la carpeta de origen.
3 Pruebas con los vectores de registro y con un registro real copiado a una carpeta temporal.

AC:
- REG-001 a REG-016 y los invariantes de registro con prueba; REG-012 y REG-013 como funciones puras de dominio; REG-008 a REG-011 y REG-014 a REG-016 en puerta.rs; REG-017 pasa a la parte que porta Citas.cs.
- Una línea escrita por el núcleo es igual, byte a byte, a la que escribe la Unity para el mismo hecho (vectores).
- Caso de falla: un intento de modificar una línea existente se rechaza con error y el archivo queda igual (mismo sha256).

V:
- cargo test -p nucleo registro, con su salida.
- sha256 de la carpeta de origen antes y después de importar en la prueba.

DONE:
- append PLAN_EVIDENCE.md#PART-003: summary+files+checks+notes
- run plannable complete PART-003

S:
- si el formato de la Unity no se puede reproducir byte a byte, parar y reportar la diferencia
