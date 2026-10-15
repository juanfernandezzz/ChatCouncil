# T24 — Revisión y simplificación

Medido el 2026-10-14 sobre el commit `f3551de` (la simplificación, con todo lo anterior de T24), y
otra vez el 2026-10-15 sobre `0f3390d` (la prueba de T19 para el teléfono): ronda 65/65, T19 14/14,
8/8 y 2/2, autoprueba 37/37 y motor 84/84 (`T24/0f3390d/final-*`).
`.exe` de Windows con `Construir.Windows` (IL2CPP), desde la unidad `subst U:`; motor con
`dotnet test` (.NET 8).

SHA-256 del build verificado (`C:\cc-ev\simple`):
- `ChatCouncil.exe`: `145680641a2600d595ccb13b626cc9c873acf1aa118c441aa09de6fdd2c55b80`
- `GameAssembly.dll`: `21bc34ebf007edaee9127509bc03c2dae056a1e236ceedf6650d8cd80c539806`
- `ChatCouncilPanel.dll` (de `panel/windows/panel.cpp`; no se versiona y cambia en cada compilación):
  `30088630f561831dc7f0c35b26a99841263d2cb292da12be6e2a7fd5946c1433`

## Resultado

| Prueba | Resultado |
|---|---|
| Motor (`dotnet test`) | 84/84 |
| Ronda (`-pruebaronda`) | 65/65 en las tres corridas |
| T19 (`-pruebainterfaz`), fases 1, 2 y 3 | 14/14, 8/8 y 2/2 |
| Autoprueba del panel | 37/37, más dos líneas MEDIDO |
| Guards del CI (los ocho) | verdes en el CI de `a66f005` |
| Android (emulador) | autoprueba 36/36; T19 14/14, 8/8 y 2/2 |

Cada arreglo se vio primero en rojo; las salidas rojas y verdes están en `T24/<commit>/`:
`fe9768e` (los siete del handoff), `47d0505` (los de la revisión), `32cbac1` (D49 rehecha),
`f3551de` (la simplificación) y `0f3390d` (la verificación final y Android).

## Los siete hallazgos del handoff (revisión de `f02bdbe..HEAD`)

| # | Hallazgo | Arreglo | Rojo |
|---|---|---|---|
| 1 | `Puerta.LeerRegistro` releía y parseaba el JSONL entero, ~21 veces cada 1,5 s en el hilo principal (284 ms por lectura de 11,5 MB) | Reutiliza la lectura mientras el archivo no cambie de largo ni de fecha | motor 81/84 |
| 2 | `ComprobarUrls` pedía las URLs del verificador (un modelo) también a localhost, la red local y esquemas raros | Solo http y https a hosts públicos; lo demás queda registrado sin código y con su motivo. En IL2CPP rechaza también `0x7f.0.0.1` y `2130706433` | motor 81/84 |
| 3 | El PDF dibujaba `![](url)` y el panel pedía esa URL | El renderer de `image` escribe el texto y la dirección | ronda: el servidor vio `GET /imagen` |
| 4 | Un `apariencia.json` con `"texto":"abc"` impedía arrancar la app | Cualquier fallo al leer vuelve a lo del sistema; desde la revisión, un tamaño ilegible no se lleva el tema | T19 fase 2: sin informe, la app quedó abierta hasta el timeout |
| 5 | F1 en el primer arranque llevaba a la Ayuda y dejaba sin salida | Primero se ignoró en la guía; con D49 rehecha F1 ya no abre la Ayuda | T19 fase 1 |
| 6 | Un archivo ilegible rompía el historial | Se salta, como en `RestaurarRondaActiva` (también el `.md` del informe) | motor 81/84 |
| 7 | `menu-configuracion` tenía dos manejadores | Queda el de la clase `abre-cajon` | — (sin cambio visible) |

Límite de #2, anotado en el código: un nombre público que resuelve o redirige a una IP privada pasa;
cerrarlo exige ver la IP al conectar, y el `HttpClient` de Unity no la da.

## La revisión de dos ejes (`mattpocock-skills:code-review`)

**Spec — corregidos:**
- **D50:** el lector rearmaba toda la jerarquía al cambiar un texto o un valor (escribir la pregunta,
  cada resultado) y movía el foco del lector. Ahora la rearma solo si cambian los controles a la vista;
  lo demás actualiza su nodo. Rojo: la jerarquía cambió; verde: es la misma y el nodo trae el texto nuevo.
- **#2 incompleto:** faltaban 255.255.255.255, multidifusión, 240/4, `.lan`, `.internal` y `.home.arpa`.
- **`.md` con CRLF:** perdía la unión con su ronda en el historial.
- **D40:** marked se distribuye con su `LICENSE` completo (`Resources/Interfaz/marked-LICENSE.txt`).
- **Historia 74:** "Recargar la página" recarga desde el navegador (`CC_Recargar`: `Reload` en WebView2,
  `reload` en Android) y avisa al terminar, sin depender de un script de la página.

**Spec — explicados:**
- **Una página trabada en un script no se recupera.** Medido: con un bucle de 15 s, la recarga nativa
  responde a los 15 048 ms; `Runtime.terminateExecution` de DevTools tampoco lo corta (12 079 ms en
  `verde2`). Queda como `shortcut:` en `Paneles.Recargar`, con el camino para mejorarlo: matar el
  renderer (`GetProcessExtendedInfos` en WebView2, `WebViewRenderProcess` en Android). La autoprueba
  lo mide en cada corrida.
- **D48, el historial dice "Informe" si existe la carpeta:** el registro no tiene un hecho de informe; la
  carpeta con su línea "Ronda: id" es el dato, no un paso inferido.
- **D49, atajos con el foco en la página:** resuelto por la D49 rehecha (abajo).
- **Android sin compilar:** compilado y medido en el emulador (ver "Android").

**Standards — corregidos:** la caché con nombres en lugar de `Item1..Item4` y su límite como
`shortcut:`; "acá" por "aquí" en `Lector.cs`; los smells de la simplificación (abajo).

**Standards — explicados:**
- Los `<summary>` de varias líneas son la convención del repo para los tipos y los métodos públicos;
  los comentarios nuevos de T24 son de una línea.
- La tupla `(Ok, Mensaje, Ruta, Completo)` ya tiene nombres y vive en tres firmas privadas de la misma
  clase: un tipo nuevo no la aclara.
- `Visible()` de `Aplicacion` y de `Lector` no son el mismo criterio (el del lector mira también
  `visibility` y el alto); juntarlos cambiaría lo que el lector publica.
- El parámetro `otraVia` es el final del mensaje, distinto en cada llamador.
- Divergent Change en `Aplicacion.cs` y `PantallaRonda.cs`: cada parte se usa desde un solo lugar;
  partirlos ahora es mover código, no borrarlo.

## D49 rehecha: teclado de una mano

Pedido de Juan del 2026-10-14. F1 el panel anterior, F2 el siguiente, F3 el paso siguiente, F4 la
región siguiente y F5 la anterior; Ctrl+Tab y Ctrl+Mayús+Tab como alias; la Ayuda sin atajo. Con el
foco en la página del proveedor, F1 a F5 devuelven el foco a la app y le entregan la tecla (`panel.cpp`
con `SendInput`; en Android, el `OnKeyListener` del WebView se la pasa a la vista de Unity).

Rojo (las pruebas nuevas contra el código viejo): 59/65. Verde: 65/65, con teclas reales desde la
página. Una ronda de `verde5` falló con "al frente False": Windows no dejó traer la ventana al frente y
las teclas reales fueron a otra; se repitió sin cambios y dio 65/65. La espera de F4 desde la página se
corrigió a "riel": en la clase ancha la página es la última región visible.

## Simplificación (`agent-skills:code-simplify`)

- El rol de cada etapa sale de `RolesElegidos.DeLaEtapa`; antes estaba escrito en dos lugares.
- `PantallaRonda.SacarRoles` junta el bloque repetido.
- `Http` y `Pdf` dejan de ser públicos con setter; `Diagnosticar` ya no devuelve una ruta sin uso.
- El espacio libre de la ruta (D47) se calcula una vez; el `PanelSettings` se llama `ajustesDelPanel`.

En `PantallaRonda.cs` no hay métodos sin llamador: es largo porque hace mucho, no porque sobre código.
Todo sigue verde sin tocar pruebas.

## Android

Primera compilación desde T17. `Construir.Android` (IL2CPP, ARM64) desde `subst U:`, con
`GRADLE_USER_HOME=C:\cc-gradle`: el cambio de plataforma recompiló el C++ entero (1442 pasos, unos
40 min); las siguientes, de 3 a 5 min. `ChatCouncil.apk`:
`e74e0594a3117d10c9cd48e32e6a67fd458d305835c72425777e498d6ec0c8cc`. Medido en el emulador `cc36`
(Android 36, Android System WebView 133.0.6943.137).

| Prueba | Resultado |
|---|---|
| Autoprueba del panel | 36/36 (la de Windows tiene una más, propia de WebView2); MEDIDO: la página trabada responde a los 16 136 ms del bucle de 15 s, el mismo límite que en Windows |
| T19, fases 1, 2 y 3 | 14/14, 8/8 y 2/2 |

- La recarga nativa (`recargar` en Java) funciona: es la que mide la autoprueba.
- La primera corrida de T19 en Android dio 13/14: la prueba esperaba el riel al terminar la guía, y en
  la clase compacta no hay riel, se navega con el botón Menú y el cajón (D3, `.compacta .riel`). Era la
  prueba, escrita para PC; ahora exige el riel o el botón del cajón según la clase.
- Dos tropiezos del entorno, no de la app: recién arrancado, el emulador remontó el almacenamiento y
  `vold` mató la primera autoprueba; y Unity mata el servidor de adb al compilar, así que una
  instalación falló con "device offline" hasta `adb reconnect offline`.
- **Fuera del alcance:** el paso de F1 a F5 en Android (decisión de Juan del 2026-10-15; queda cableado y
  compila, sin medir).
- **Sin medir en Android:** `foco()`, el tema del sistema por `uiMode` en modo oscuro
  y TalkBack. La ronda completa (`-pruebaronda`) tampoco corre en Android por lo mismo.

## Lo que queda abierto

- **La página trabada en un script:** matar el renderer, si se decide hacerlo.
- **Avisos de terceros:** marked ya lleva su licencia; Newtonsoft.Json y el resto se nombran en Acerca de,
  pero sus textos de licencia no viajan con la app. Corresponde al instalador de T25.
- **El recorrido con las cuentas de Juan:** ya no depende de los arreglos #1 y #2.
