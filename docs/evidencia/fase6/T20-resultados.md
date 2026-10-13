# T20 — Pregunta e Investigación conectadas, medido en la app compilada

Medido el 2026-10-13 sobre el commit `efd4e02`, con el árbol limpio antes y después de compilar.
`.exe` de Windows con `Construir.Windows` (IL2CPP), desde la unidad `subst U:`.

SHA-256:
- `ChatCouncil.exe`: `145680641a2600d595ccb13b626cc9c873acf1aa118c441aa09de6fdd2c55b80`
- `GameAssembly.dll`: `61f3174d2bbb01600e798b46bc85e2d797338214e9b5071d01843312197ad1f8`

## Qué se verifica

`unity/Assets/Interfaz/PruebaRonda.cs` recorre las etapas Pregunta e Investigación con los controles
reales. Trabaja sobre una carpeta de datos de prueba (`-datos`) y sobre una página local por operador
(`autoprueba/textarea.html`), con una spec de prueba. Un script en cada página hace lo que hace la
persona (enviar) y lo que hace el proveedor (responder y terminar). Lo que se comprueba es el registro:

1. **Paneles:** solo los siete operadores del pool tienen página; el integrador y el verificador no
   (historia 26).
2. **Pregunta vacía:** se rechaza con su texto y no abre una ronda.
3. **Aviso de capacidades** antes de pegar (historia 20): mientras está abierto, la página se aparta.
   Tiene la casilla «No volver a avisar en esta sesión».
4. **Pegar en los siete.** Grok tenía un borrador:
   - quedan una `Ronda` con la pregunta idéntica, la condición de los 9 cargados con el integrador, y 7
     `Intento` (6 bien; Grok con «el compositor ya tenía texto»);
   - la pregunta llega idéntica, con sus saltos de línea, a los 6 (historia 31), y el borrador de Grok
     sigue intacto (historia 30).
5. **El problema de Grok:** dice qué pasó en la cabecera, y una línea corta en el selector del
   teléfono (D9, H7). «Pegar la pregunta aquí» no agrega ni ronda ni intento (historia 29).
6. **El indicador:** muestra «Respondiendo» al enviar y «Parece terminado» al terminar. El botón dice
   «Capturar los que terminaron (5)», y los contadores, «Enviados 6 de 7 · Parecen terminados 5 ·
   Capturados 0».
7. **La captura de los cinco** deja:
   - 5 `Respuesta` con el texto idéntico y el prompt de usuario leído;
   - la continuidad «indeterminada» en la primera captura;
   - Kimi, que respondió muy corto, marcado con un `ErrorCaptura` de respuesta sospechosamente corta
     (historia 37).

   El aviso de que los prompts coinciden no se pinta como problema.
8. **Capturar este panel** (Grok, que respondió después de pegar ahí) y la segunda captura (Qwen), con
   la continuidad «confirmada». La etapa pasa a «Operación · 3 de 7», con su paso deshabilitado hasta
   T21.
9. **Abandonar la ronda (D13):** vuelve a Pregunta y el registro no cambia (18 líneas antes y 18 después).
10. **Capturar lo que ya está en los paneles, sin pegar:**
    - abre la ronda 1 con el marcador, con 7 `Respuesta`;
    - el paso pasa a «Declarar la pregunta de esta ronda»;
    - el diálogo deja una `PreguntaDeclarada` para esa ronda, y la etapa pasa a Operación (historia 40).

## Resultado

- **Prueba de la Ronda,** tres corridas, cada una con su carpeta de datos nueva: **23/23 en las tres**
  (`T20/efd4e02/ronda-c1.txt` a `ronda-c3.txt`).
- **Regresión de T19** sobre el mismo `.exe`: 13/13, 7/7 y 1/1 (`t19-f1.txt` a `t19-f3.txt`).
- **Autoprueba del panel:** 37/37 (`autoprueba.txt`).

**Vistas en rojo:**
- **Motor, `dotnet test`,** sobre la carpeta `motor/` de `efd4e02`, extraída con `git archive` fuera del
  repositorio:
  - verde: `motor-verde.xml`, con `result="Passed" total="74" passed="74"`;
  - rojo: `motor-rojo.xml` y `motor-rojo-salida.txt`, con `total="74" passed="73" failed="1"`. Corre
    contra el cuerpo vacío de `AbandonarRonda` (`motor-rojo-cuerpo-vacio.diff`), y falla
    `AbandonarLaRondaVuelveALaPreguntaSinTocarElRegistro` por su aserción («investigacion» en lugar de
    «pregunta»).

  Durante el TDD se vio la misma falla, pero esa salida no se guardó: esta es la reproducción.
- **App:** la prueba de la Ronda pasó entera en su primera corrida (22/22). La comprobación que se
  agregó después, que el aviso de prompts que coinciden no se pinte como problema, se vio fallar:
  **22/23**, salida 1 (`ronda-rojo-aviso-que-coincide.txt`). Esa corrida es de un `.exe` compilado del
  árbol de trabajo antes del arreglo, sin commit propio. El arreglo entró en `b70a35b`.

## La página en el teléfono (H7)

Medido en las capturas a 390 × 844: la tira más larga de filas con el color de la página en la columna
x = 20. El caso más cargado es Investigación con un panel con problema (Grok):

| Captura | Alto de la página |
|---|---|
| `investigacion-telefono-frase.png`, la frase de la etapa a la vista, como queda al entrar (H1) | 433 px, **51,3 %** |
| `investigacion-telefono-plegada.png`, la frase plegada con «Entendido» | 518 px, **61,4 %** |
| `pregunta-telefono-claro.png`, etapa Pregunta, con el campo de la pregunta | 345 px, 40,9 % |

**Comparación con T18:** el esqueleto daba 57 % con la frase y una línea de problema. Ahora hay dos
números:
- **con la frase plegada, 61,4 %,** que es como queda la pantalla después de leerla. Antes del arreglo
  de `efd4e02`, el detalle completo del problema ocupaba cuatro líneas y la página quedaba en 47 %;
- **al entrar en la etapa, 51,3 %.** Es el costo de tener a la vista la frase (H1) y el contador; no se
  cerró.

En la etapa Pregunta la página es más baja por el campo de la pregunta (D32).

## Capturas

De la app compilada, con `-captura`, sin páginas (`docs/evidencia/fase6/T20/`):

| Captura | Tamaño |
|---|---|
| `pregunta-pc-claro.png` | 1366 × 768 |
| `pregunta-telefono-claro.png` | 390 × 844 |
| `investigacion-pc-claro.png`, `investigacion-pc-oscuro.png` | 1366 × 768 |
| `investigacion-telefono-frase.png`, `investigacion-telefono-plegada.png`, `investigacion-telefono-plegada-oscuro.png` | 390 × 844 |

- **Investigación** usa la carpeta que la corrida 1 copió a mitad del recorrido, con Grok a la vista
  (`-panel grok`).
- **Pregunta** usa una carpeta con solo el archivo de selección.
- **Lo que no se puede capturar así:** los diálogos y los menús se abren con clics, y `-captura` no los
  alcanza. Se comprobaron en la prueba: el diálogo abierto, con la página apartada.

## Lo que queda abierto

- **Android:** no se compiló ni se midió.
- **En el PC, en la etapa Pregunta,** el campo de la pregunta acorta la lista de paneles y aparece la
  barra de desplazamiento (GLM queda abajo). Para T23.
- **Proveedores reales:** las páginas de prueba no son las de los proveedores. El recorrido con las
  cuentas de Juan queda para el recorrido de primer uso de la fase.
- **Etapa Operación y siguientes:** el botón primario está deshabilitado hasta que T21 y T22 las
  conecten.
