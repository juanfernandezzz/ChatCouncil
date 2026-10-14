# T22 — Roles e informe conectados, medido en la app compilada

Medido el 2026-10-13 sobre el commit `2429d52`, con el árbol limpio antes y después de compilar.
`.exe` de Windows con `Construir.Windows` (IL2CPP), desde la unidad `subst U:`.

SHA-256:
- `ChatCouncil.exe`: `145680641a2600d595ccb13b626cc9c873acf1aa118c441aa09de6fdd2c55b80`
- `GameAssembly.dll`: `d12db39c89c31bc067b99530341e9a19ab2c2f8f3893fe54851869e6343a8685`

Decisiones: D40 a D47 en `docs/BLUEPRINT.md`. Desde esta tarea rige la regla de `docs/AGENTES.md`:
Electron no es la referencia de diseño, y los criterios de D40 a D47 son razonamientos propios.

## Qué se verifica

`PruebaRonda.cs` sigue el recorrido de T20 y T21, y después de capturar la operación recorre los roles
hasta el informe en disco, sobre `autoprueba/ronda.html`. Los roles responden con un `<p>` por línea.

1. **Integración:** el integrador no tiene página hasta su etapa. «Pegar el prompt del integrador» la
   abre en una conversación nueva comprobada vacía, con el prompt idéntico al armado; entra en el
   recorrido (8 paneles) y su fila dice «Integra y redacta · Pegado, falta que envíes».
2. **Capturar el integrador:** queda el `InformeIntegrador` con su título y su prompt; la etapa pasa a
   Verificación y la fila dice «Capturado» (D44).
3. **Recapturar el integrador** desde el menú Ronda, ya en Verificación: 2 informes, gana el último.
4. **Verificación:** el prompt cita lo que rescata el último informe ([H2]); 9 en el recorrido. La
   respuesta trae 4 URLs: 200, 404, un HEAD rechazado y un dominio `.invalid`.
5. **Redacción:** el prompt idéntico y el archivo adjunto solo. El input recibió el nombre y el tamaño
   del `.txt` guardado en `redactor/`, con sus marcas. La captura guarda las marcas.
6. **El informe:**
   - las URLs con el adaptador real (`HttpSinCookies`) contra un servidor local: 404, 200, 200 (GET
     después del HEAD rechazado) y sin código para `.invalid`. El servidor vio 5 pedidos y ninguno
     trajo cookies;
   - la carpeta con el `.md` y el PDF, en Carta en todas las páginas (612 × 792), y las 7 respuestas
     de los investigadores en `.md` y PDF;
   - la carpeta que se abre al terminar es la del informe, y el resultado dice «responden 2 de 4».
7. **Ocultar y mostrar los roles** desde el menú Ronda: ocultos, el recorrido vuelve a los 7 y la
   página de GLM se aparta; mostrados, 9 otra vez.
8. **En la ronda nueva** con las respuestas copiadas, los roles salen del recorrido.
9. **Siguen** todas las comprobaciones de T20 y T21.

## Resultado

- **Prueba de la Ronda,** tres corridas, cada una con su carpeta de datos nueva en `C:\cc-ev\cN`:
  **51/51 en las tres** (`T22/2429d52/ronda-c1.txt` a `ronda-c3.txt`).
- **Regresiones** sobre el mismo `.exe`: T19 da 13/13, 7/7 y 1/1; la autoprueba del panel, 37/37.
- **El informe de la corrida 1:** `2026-10-13 2300 - Informe recapturado.md` y `.pdf`. El PDF tiene 4
  páginas Carta con el pie «ChatCouncil · página N de 4»; se miró dibujado (PyMuPDF): títulos, citas
  con fondo, enlaces y acentos.

**Motor, `dotnet test`,** sobre la carpeta `motor/` de `2429d52`, extraída con `git archive` fuera del
repositorio. Las cuatro pruebas nuevas se vieron fallar durante el TDD, antes de implementar; estas
son reproducciones por mutación (cada `.diff` muestra el cambio).

| Corrida | Archivo | Resultado |
|---|---|---|
| Verde | `motor-verde.xml` | `total="80" passed="80"` |
| Sin la regla de D44 | `motor-rojo-estado-roles.xml` | `passed="79" failed="1"`: `EnLasEtapasDeLosRolesLoYaCapturadoSigueCapturado` |
| Sin la guarda de D45 | `motor-rojo-recaptura.xml` | `passed="79" failed="1"`: `UnaRecapturaFallidaQuedaComoErrorYNoReemplaza` |
| Sin el tope de rutas de D47 | `motor-rojo-rutas.xml` | `passed="79" failed="1"`: `NingunaRutaDelInformePasaDe259Caracteres` |
| `VerificarIgualdad` que acepta todo | `motor-rojo-igualdad.xml` | `passed="78" failed="2"`: la prueba nueva y la de la operación, que delega en ella |

**App, vista en rojo:**
- **Rutas de 260 caracteres (el defecto de D47),** sobre `80aa8b8`: 50/51 en las tres corridas
  (`ronda-rojo-rutas-c1.txt` a `c3`). Con la carpeta de datos en el scratchpad, «1 - ChatGPT.pdf»,
  «5 - Mistral.pdf» y la nota de faltantes llegaban a 260 o más caracteres y Windows no los escribía.
  Además el resultado salía sin el color del problema. Corregido en `0359390`.
- **Con el arreglo y la misma carpeta honda,** 50/51 (`ronda-rojo-titulo-c1.txt` a `c3`): todo se
  escribió, pero no quedó lugar para el título y el nombre fue el de reserva, «Informe de ronda». Es
  el comportamiento de D47; la prueba espera el título del integrador, así que la evidencia corre con
  carpetas cortas, del largo de `Documentos\ChatCouncil`. El caso hondo lo cubre la prueba del motor.
- **Las comprobaciones de los roles se escribieron junto con el código,** así que se vieron fallar con
  una mutación: sin `rolesMostrados.Clear()` en la ronda nueva, 50/51 con salida 1
  (`ronda-mutante-roles.txt` y `.diff`).

## La página en el teléfono

Medido como en T20 y T21 (la tira `#ECEAE5` en x = 20), en la etapa Informe:

| Captura | Alto de la página |
|---|---|
| `informe-telefono-frase.png`, la frase a la vista | 498 px, 59,0 % |
| `informe-telefono-plegada.png`, la frase plegada | 565 px, 66,9 % |

## Capturas

`docs/evidencia/fase6/T22/`:
- `informe-pc-claro.png` e `informe-pc-oscuro.png`, a 1366 × 768;
- las dos del teléfono, a 390 × 844.

Usan la carpeta de la corrida 1 copiada al llegar al Informe. Las capturas no abren páginas, así que
los roles aparecen con su función y sin su estado: el recorrido con los roles a la vista se comprobó
en la prueba.

## Lo que queda abierto

- **Android:** no se compiló. Allí la carpeta no se abre al terminar (file:// da
  FileUriExposedException) y solo se dice dónde está; el PDF por `ImpresionPdf` no se midió con el
  informe.
- **Proveedores reales:** no se midió con las páginas de DeepSeek y GLM: la conversación nueva, el
  adjunto del redactor ni la captura de su HTML.
- **El texto del informe** (`InformeFinal`) sigue sin tildes, por la paridad byte a byte con
  TypeScript. Con la regla nueva conviene revisarlo: queda para T24.
