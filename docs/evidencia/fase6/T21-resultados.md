# T21 — Operación conectada, medido en la app compilada

Medido el 2026-10-13 sobre el commit `a78b0c6`, con el árbol limpio antes y después de compilar.
`.exe` de Windows con `Construir.Windows` (IL2CPP), desde la unidad `subst U:`.

SHA-256:
- `ChatCouncil.exe`: `145680641a2600d595ccb13b626cc9c873acf1aa118c441aa09de6fdd2c55b80`
- `GameAssembly.dll`: `a07f8456fe07c709588f6ebb5dbf611e1bce42075456c1f69d2efbcdccab6e96`

## Qué se verifica

`PruebaRonda.cs` sigue el recorrido de T20 hasta el fin de la Investigación y después recorre la
Operación. Lo hace con `autoprueba/ronda.html`: chat, compositor y un `<input type=file>` que muestra
lo que recibió. Con `?sucio=1`, la conversación «nueva» llega con un mensaje.

1. **Al terminar la Investigación,** los siete operadores están «Por pegar» y el paso «Pegar la
   operación en los paneles» está habilitado (D39).
2. **El aviso de la operación** (una vez por ronda) trae la casilla «Pegarla como texto, sin
   archivo».
3. **Pegar en los siete por la vía de archivo,** con la conversación de Mistral sin vaciar:
   - el resultado es «Operación pegada en 6 de 7. No se pegó en: Mistral…»;
   - en cada uno de los seis hay una navegación (la conversación nueva), el chat vacío, el texto del
     compositor idéntico al armado y el archivo adjunto. El input recibió el nombre y el tamaño del
     `.txt` guardado en `operaciones/`, con el mismo contenido (historia 41);
   - quedan las 7 etiquetas del sello.
4. **Mistral queda «Con problema»:** la cabecera dice que la conversación nueva no quedó vacía y que
   no se pega. El compositor sigue vacío y no hay operación registrada.
5. **Mistral otra vez,** por «Pegar la operación aquí como texto», sin que vuelva el aviso: el texto
   con sus marcas, idéntico, y el panel pasa a «Pegado, falta que envíes».
6. **Los siete responden** con una línea de hallazgo y la captura registra 7 `SalidaOperador`, cada
   una con el prompt que se pegó (el de archivo con «=== ARCHIVO ADJUNTO»). Quedan 7 hallazgos y la
   etapa pasa a «Integración · 4 de 7».
7. **Ronda nueva con las respuestas copiadas:** 7 copias marcadas con su ronda de origen, y la etapa
   vuelve a Operación.
8. **En la ronda nueva el aviso vuelve.** Después de pegar en un panel (Gemini, que escribe el sello),
   ChatGPT usa su operación anterior: una `SalidaOperador` copiada, y el panel queda «Capturado».
9. **Un diálogo cancelado no deja su acción:** un «Aceptar» después no abandona la ronda.
10. **Siguen** abandonar la ronda, capturar sin pegar (ahora ronda 2) y declarar la pregunta.

## Resultado

- **Prueba de la Ronda,** tres corridas, cada una con su carpeta de datos nueva: **34/34 en las tres**
  (`T21/a78b0c6/ronda-c1.txt` a `ronda-c3.txt`).
- **Regresiones** sobre el mismo `.exe`: T19 da 13/13, 7/7 y 1/1; la autoprueba del panel, 37/37.
- **CI de `a78b0c6`** en verde: https://github.com/juanfernandezzz/ChatCouncil/actions/runs/38448111113.

**Motor, `dotnet test`,** sobre la carpeta `motor/` de `a78b0c6`, extraída con `git archive` fuera del
repositorio. El adaptador de NUnit escribe el XML.

| Corrida | Archivo | Resultado |
|---|---|---|
| Verde | `motor-verde.xml` | `total="76" passed="76"` |
| Sin `VerificarEscritura` (cuerpo vacío, `motor-rojo-verificar-escritura.diff`) | `motor-rojo-verificar-escritura.xml` | `passed="75" failed="1"`: `LaOperacionEscritaSeVerificaComoEnElectron` |
| Sin la regla de etapa de D39 (`motor-rojo-estado-operacion.diff`) | `motor-rojo-estado-operacion.xml` | `passed="74" failed="2"`: la prueba nueva y la parte nueva de `ElEstadoDeCadaPanelSaleDelRegistro` («capturado» en lugar de «por-pegar») |

Las dos fallas se vieron también durante el TDD, antes de implementar. Las de este archivo son
reproducciones guardadas.

**App, vista en rojo:**
- **La primera corrida con la Operación dio 19/26.** El paso «Pegar la operación» no hizo nada,
  porque los paneles seguían «Capturado» (el defecto de D39). Después, un «Aceptar» repitió el pegado
  de la pregunta del diálogo anterior.
- **La segunda dio 31/33:**
  - la línea de hallazgo de la prueba no tenía el formato del prompt (`CATEGORÍA|EJE|…`, sin espacios);
  - el reúso de la operación necesita el sello de la ronda nueva. Esa es la regla del motor, que la
    prueba se salteaba.

  Las salidas de esas dos corridas no se guardaron: se sobrescribieron al repetir.
- **La comprobación del diálogo cancelado se vio fallar con una mutación** (sin `alAceptar = null`):
  33/34, con salida 1 (`ronda-mutante-dialogo.txt`).

## La página en el teléfono

Medido como en T20, en la etapa Operación sin problemas a la vista:

| Captura | Alto de la página |
|---|---|
| `operacion-telefono-frase.png`, la frase a la vista | 474 px, 56,2 % |
| `operacion-telefono-plegada.png`, la frase plegada | 565 px, 66,9 % |

## Capturas

`docs/evidencia/fase6/T21/`:
- `operacion-pc-claro.png` y `operacion-pc-oscuro.png`, a 1366 × 768;
- las dos del teléfono, a 390 × 844.

Usan la carpeta de la corrida 1 al terminar, con la ronda 2 en Operación. El diálogo del aviso se abre
con un clic y la captura no lo alcanza: se comprobó en la prueba.

## Lo que queda abierto

- **Android:** no se compiló. Allí el adjunto pasa por el selector del sistema (T17); no se midió con
  la operación.
- **Proveedores reales:**
  - la conversación nueva navega a la `newConversationUrl` de la spec, y un proveedor que la reabra
    con el chat anterior hace que la app no pegue (D36);
  - no se midió el adjunto en sus páginas.
- **Etapas de los roles:** se conectan en T22.
