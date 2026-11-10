@PlannablePlan v0.1

ID=PART-002
PH=E6_NUCLEO_RUST
SCN=SCN-002
OUT=Datos idénticos y vectores de referencia como oráculo
DEP=[PART-001]

DICT:
G=goal; CTX=context; C=constraint; F=file; T=task; AC=acceptance; V=verify; DONE=completion; S=stop

G:
- El núcleo carga specs.json y los literales de los cuatro prompts idénticos a los de la Unity, y el repo tiene los vectores de referencia de la Unity en JSON como oráculo de las partes siguientes.

CTX:
- product: ChatCouncil (CONTEXT.md)
- phase: E6 (parte 2 de 10)
- prior: PART-001 workspace
- next: PART-003 registro
- spec: openspec/specs/datos/spec.md (DAT-001, DAT-002 con sus sha256)
- fuente de vectores: motor/Tests/Referencias.g.cs del repo ChatCouncil-Unity, generado desde TypeScript

C:
- el repo Unity es solo lectura
- los datos se copian tal cual; ningún literal se reescribe
- los vectores se extraen una vez con un script que queda en el repo, con el sha256 del archivo fuente

F:
- datos/specs.json
- datos/prompts/
- tests/vectores/
- herramientas/extraer-vectores (script)
- crates/nucleo/src/datos.rs

T:
1 Copiar specs.json y los literales de prompt-operacion.ts (PLANTILLA y PLANTILLA_CON_ARCHIVO), prompt-integrador.ts, prompt-verificador.ts y prompt-redactor.ts a datos/.
2 Cargar esos datos en nucleo, incrustados en el binario.
3 Escribir el script que convierte Referencias.g.cs en JSON por función bajo tests/vectores/, y correrlo.
4 Pruebas: hash de cada dato contra DAT-001 y DAT-002; los vectores se leen y cuentan.

AC:
- Los sha256 de specs.json y de los cuatro literales coinciden con los de openspec/specs/datos/spec.md.
- tests/vectores/ tiene un archivo por función de Referencias.g.cs, con la misma cantidad de casos.
- Caso de falla: cambiar un carácter de un literal hace fallar la prueba de hash.

V:
- cargo test -p nucleo datos, con su salida.
- Conteo de casos por función: Referencias.g.cs contra tests/vectores/.

DONE:
- append PLAN_EVIDENCE.md#PART-002: summary+files+checks+notes
- run plannable complete PART-002

S:
- si un sha256 no coincide con openspec, parar y reportar sin corregir el dato
