# T17 — Panel Android, medido en un emulador

Medido el 2026-10-09 sobre el commit `b9c3091`, con el árbol limpio antes y después de
compilar. `.apk` con `Construir.Android` (IL2CPP, ARM64), desde la unidad `subst U:` sin
tildes. Plugin Java en `unity/Assets/Plugins/Android/ChatCouncilPanel.androidlib`, sobre
`android.webkit.WebView` y **androidx.webkit 1.17.1**, la estable más reciente en Google Maven
ese día (1.18.0 seguía en rc01).

## El entorno

- **Emulador:** el de Android SDK, imagen `system-images;android-36;google_apis;x86_64` (r07),
  sin ventana, con aceleración **WHPX** (`emulator -accel-check`: "WHPX(10.0.19045) is
  installed and usable"). Las licencias del SDK las aceptó Juan en el chat antes de instalar.
- **Android System WebView 133.0.6943.137**, el de la imagen.
- **Solo ARM64.** En Unity 6000.3, x86_64 para Android quedó limitado a Magic Leap y la
  compilación aborta ("x86-64 (Magic Leap) support is now limited"). La imagen x86_64 de
  Android 36 declara `x86_64,arm64-v8a` y ejecuta el `.apk` ARM64 traduciéndolo. **Los tiempos
  de esta evidencia son de código traducido**, no de un teléfono ARM.
- **Gradle fuera de la carpeta del usuario.** Con `GRADLE_USER_HOME` en el nombre corto
  `C:\Users\JUANFE~1\.gradle`, Gradle lo expande a la ruta larga con tilde, y la herramienta
  `prefab` falla (`ClassNotFoundException: com.google.prefab.cli.AppKt`, en la línea de
  comandos la ruta llega como "Fernßndez"). Se compila con `GRADLE_USER_HOME=C:\cc-gradle` y
  `ANDROID_USER_HOME=C:\cc-gradle\android-user`.
- **Arranque de la autoprueba:** `am start -n com.chatcouncil.app/com.unity3d.player.UnityPlayerGameActivity -e unity "-autoprueba RUTA"`.
  Unity pasa el extra `unity` a `Environment.GetCommandLineArgs()`. El archivo de resultados
  queda en `/sdcard/Android/data/com.chatcouncil.app/files/` y se trae con `adb pull`.
- Las horas dentro de los archivos de resultados son del emulador (UTC): 18:54 es 15:54 aquí.

## Resultado

Tres corridas del mismo `.apk` (`T17/b9c3091/android-corrida1.txt`, `-2`, `-3`): **36/36 en
las tres.** Tasa: 3/3.

SHA-256 de `ChatCouncil-b9c3091.apk`:
`7d0d8a472ccc4589fd89b2929a4c456140e2db7afe48c17c7092c7376cdaf9e5`.

Es la misma autoprueba que en Windows, con las specs reales, salvo dos diferencias de
plataforma: los "argumentos de no limitación" no existen en Android (los paneles se apilan
visibles, spec "El panel"), y el adjunto va por el selector del sistema. Windows tiene 37
comprobaciones; Android, 36.

| Comprobación | Android: cómo se cumple | Medido |
|---|---|---|
| perfil | `WebViewCompat.setProfile` antes de usar la vista; el nombre lo informa `getProfile().getName()` | "prueba-a" |
| sin `MULTI_PROFILE`, la app lo dice | `Paneles.Iniciar` falla con el mensaje "este teléfono no admite perfiles separados (MULTI_PROFILE)…" y no abre paneles | **no medido**: el WebView 133 sí lo admite |
| bloqueo de `/logout` y `/auth/sign-out?vuelta=1` | la misma regex en `shouldOverrideUrlLoading` (marco principal) y antes de `loadUrl` | bloqueadas +1, navegaciones sin cambio, la página sigue en `/cierre.html` |
| frente y detrás, rectángulo | los paneles se apilan en una capa sobre la vista de Unity; `bringToFront` y volver al índice 0 | (0, 0, 800, 600) |
| escritura en los tres editores y 180.000 caracteres con marcas | `evaluateJavascript` con `pagina.js` leído del `.apk` | 185.416 caracteres, 180/180 marcas, idénticos, en **17,4 a 21,3 s** (Windows: 1,3 a 1,4 s) |
| lectura, estado, diagnóstico, kimi, canvas de mistral | igual que en Windows | todas OK |
| script en un iframe de otro origen | script de inicio de documento (`addDocumentStartJavaScript`) y `addWebMessageListener`, los dos restringidos a los orígenes de `informeEnIframe` de las specs y a los hosts de prueba. El iframe avisa que existe y lee cuando el plugin le manda el selector: no hay `eval` | se lee el informe de `https://cc-otro.test/informe.html` |
| adjunto | el plugin prepara el archivo; un toque real (`MotionEvent`) sobre el input abre `onShowFileChooser`, que entrega el archivo sin mostrar el selector | nombre y tamaño exactos |
| PDF | `createPrintDocumentAdapter` del WebView escrito a un archivo, sin diálogo | `%PDF-`, 31.498 bytes |
| emergente con `opener`, mismo perfil, `window.close()` | `onCreateWindow` con `WebViewTransport` y el mismo perfil; `onCloseWindow` | opener `https://cc-prueba.test`, perfil y marca del perfil iguales; se cierra |
| aislamiento y borrado del perfil | otro perfil no ve la marca; `WebStorage.deleteAllData`, caché y cookies del perfil | marca null en los dos casos |
| techo externo | el mismo de C# | cortó entre 3.901 y 4.188 ms (límite de la prueba: 6.000) |
| un panel colgado no bloquea a los demás | | el otro respondió entre 891 y 1.144 ms (límite: 1.500; Windows: 3 a 6 ms) |
| surrogate suelto, por `pagina.js` y por `JSON.stringify` | | `0061 D800 0062 DC00 0063` intacto |
| texto fuera del plano básico (nueva en T17) | un emoji de ida y vuelta: en Android cruza JNI en los dos sentidos | `D83D DE00` intacto |

**Medido, no exigido:** un resultado crudo de `evaluateJavascript` con un surrogate suelto
llega como `0061 FFFD 0062 FFFD 0063` (en Windows, `ExecuteScript` no devuelve nada). El camino
de producción no depende de eso: todo texto de la página vuelve por `JSON.stringify`.

## Lo que pasó antes del verde (en orden)

1. `T17/01-rojo-sin-plugin.txt` (0/1): el C# nuevo sin el plugin Java.
   `ClassNotFoundException: com.chatcouncil.panel.Paneles`. Muestra también que el argumento
   llega por el intent y que el resultado se escribe y se trae.
2. `T17/02-verde-34de36-adjunto-y-prueba-emoji.txt` (34/36), con el plugin:
   - **adjunto:** un `click()` desde un script no abre el selector de archivos en Android
     WebView, porque falta la activación del usuario. Se cambió por un toque real en el centro del input.
   - **emoji:** el defecto estaba en la prueba, que escribí en T17. `escribir` no pisa un compositor con texto
     (`pagina.ts`: "el compositor ya tenía texto: no se escribe encima de un borrador"), y la
     comprobación no miraba su `ok`, así que leyó lo que había dejado el paso anterior. Ahora vacía el
     compositor y exige `ok`.
3. `T17/03-carrera-ticket-desconocido-33de34.txt` (33/34, sobre `6fb3954`; las otras dos
   corridas de ese commit dieron 36/36): **defecto del plugin, arreglado en `b9c3091`.**
   `resultado()` leía dos estructuras (resultados y pendientes) que el hilo de la interfaz
   cambiaba entre las dos lecturas, y el ticket aparecía como desconocido. Ahora hay un solo mapa con un
   valor pendiente y `replace` atómico. **Esta comprobación es la carrera observada**: no se
   escribió una prueba determinista de la carrera; la medida del arreglo son las tres corridas
   en verde de `b9c3091`, que no la descartan con certeza.

## Windows, otra vez sobre `b9c3091`

`Paneles.cs` cambió también para Windows (el lector del iframe como constante, `pagina.js`
por `Nativo.LeerStreamingAsset`) y la autoprueba suma el emoji. Se volvió a medir el `.exe`
compilado sobre `b9c3091` (IL2CPP, x64; WebView2 154.0.4258.62): **37/37 en las tres corridas,
código de salida 0** (`T17/b9c3091/windows-corrida1.txt`, `-2`, `-3`). Tasa: 3/3.

- Pegado de 180.000 caracteres: 1.277 a 1.346 ms. Techo: 3.001 a 3.005 ms. Otro panel con uno
  colgado: 3 a 7 ms. PDF: 67.692 bytes. Emoji: intacto.
- SHA-256: `ChatCouncil.exe` `145680641a2600d595ccb13b626cc9c873acf1aa118c441aa09de6fdd2c55b80`;
  `GameAssembly.dll` `a092717089ed05781026ca946a822c16941161283e22ea0ca7031f2eac8470bd`;
  `ChatCouncilPanel.dll` `aff9c4b964e5f3af184d668b9abd398c1b9c590d2a3a9c93a371c08f3283db0c` (la
  misma de T16; el plugin de Windows no cambió).
- Al importar para una plataforma, Unity agrega o quita dos entradas en
  `unity/Assets/Settings/UniversalRenderPipelineGlobalSettings.asset`. No es código: se
  restauró al versionado después de compilar Windows. El resto del árbol quedó limpio.

## Pruebas del motor en un player de Android

**Sin medir.** No se corrieron en el player de Android en esta tarea. Queda abierto.

## Abierto

- `MULTI_PROFILE` ausente: el mensaje existe, pero no se midió en un WebView sin la función.
- Los tiempos son de ARM64 traducido en un emulador: el pegado de 180.000 caracteres tarda
  unos 20 s, y el otro panel responde en ~1 s mientras uno está colgado, cerca del límite de
  1,5 s de la prueba. En un teléfono real, sin medir.
- Si un panel de atrás sigue ejecutando a ritmo normal en un teléfono real, con la pantalla
  apagada o con la app en segundo plano: **sin medir** (plan, riesgos).
- El toque del adjunto necesita que el input sea visible en el panel (se hace
  `scrollIntoView`). Con un input oculto, como el de los compositores reales, **sin medir**:
  es parte de lo que solo se mide con las cuentas de Juan.
- El PDF usa los constructores de `LayoutResultCallback` y `WriteResultCallback`, que no son
  públicos en el SDK (por eso la clase está en el paquete `android.print`). Funcionó en
  Android 36; en otras versiones, sin medir.
