# T14 — Las 69 pruebas del motor en Unity (Mono e IL2CPP)

Medido el 2026-10-08 sobre el commit `5b387fe15ab2bdc76430bad4b9e68ce7a4a614bb`, con el
árbol limpio (`git status --short` vacío antes de la primera corrida). Unity 6000.3.25f1 (LTS),
Unity Test Framework 1.6.0, Visual Studio Build Tools 2026 (MSVC 14.51) y Windows SDK 10.0.26100.
Las tres corridas se hicieron seguidas, con el mismo script, en este orden.

## Resultados

| Corrida | Archivo | Resultado |
|---|---|---|
| Editor (Mono) | `editor-mono-5b387fe.xml` | 69 total, 69 Passed |
| Player Windows x64, IL2CPP | `il2cpp-verde-5b387fe.xml` | 69 total, 69 Passed |
| Player Windows x64, IL2CPP, con la mutación | `il2cpp-rojo-5b387fe.xml` | 69 total, 67 Passed, 2 Failed |

En la corrida mutada fallan exactamente las dos fijadas de antemano:
`ParseosPruebas.ElTituloYLaSeccionDeRescateSonLosMismosQueEnTypeScript` y
`ParseosPruebas.LaVerificacionEsLaMismaQueEnTypeScript`. La mutación es `mutacion-js-punto.diff`
(`Js.Punto` de `@"[^\n\r\u2028\u2029]"` a `"."`); se revirtió al terminar.

En los tres XML, los 69 `<test-case>` coinciden uno a uno con los 69 métodos `[Test]` de
`motor/Tests/*.cs` (comparado por clase y método).

## Comandos

Desde la raíz del repo, con Unity Hub abierto (la licencia Personal la entrega Hub):

```
Unity.exe -batchmode -projectPath unity -runTests -testPlatform PlayMode -testResults editor-mono.xml
Unity.exe -batchmode -projectPath unity -runTests -testPlatform StandaloneWindows64 -testSettingsFile docs/evidencia/fase6/il2cpp-windows.json -buildPlayerPath player-verde -testResults il2cpp-verde.xml
Unity.exe -batchmode -projectPath unity -runTests -testPlatform StandaloneWindows64 -testSettingsFile docs/evidencia/fase6/il2cpp-windows.json -buildPlayerPath player-rojo -testResults il2cpp-rojo.xml
```

En el Editor la corrida es PlayMode y no EditMode: el ensamblado de pruebas incluye todas las
plataformas para poder correr en el player, y Unity Test Framework no lista esos ensamblados en
EditMode (medido: EditMode encontró 0 pruebas). PlayMode dentro del Editor sigue siendo Mono.

Que el player es IL2CPP lo muestran los registros recortados (`il2cpp-verde-5b387fe-recortado.txt`,
`il2cpp-rojo-5b387fe-recortado.txt`: `il2cpp.exe`, compilación `C_Win_x64_VS2026`) y la presencia de
`GameAssembly.dll`, que solo existe con ese backend.

## SHA-256 de los binarios (no versionados)

| Binario | Verde | Rojo |
|---|---|---|
| `PlayerWithTests.exe` | `d817885fd05ab47f45856cab715eb7d1852828b925a45b612cfe106a5b988219` | `d817885fd05ab47f45856cab715eb7d1852828b925a45b612cfe106a5b988219` |
| `GameAssembly.dll` | `3fc2923192f55615e48dbe45265c70f403acd144a22dc88d6dc3c5f69e088fc0` | `6ae64a5303af49b5b8b4539a782bfbcf8ed19d7effd74fc1be679775b28fce5d` |
| `global-metadata.dat` | `27a4f85e53afc8fcb554be67137daecbd67a788fd7b538e8dfa8ccb638f1bb38` | `d5c93ba7bd9338058fbd4a6d7116f0e876e61e7dc30acebddad51d4e62683ea5` |

El `.exe` es el lanzador y no cambia; `GameAssembly.dll` (el C# compilado a nativo) y los metadatos
sí cambian con la mutación. El hash amarra este resultado a este binario y, en T25, al del Release;
no permite verificar desde fuera el contenido del binario.

## Defecto encontrado en la primera corrida IL2CPP (`ea3b12c`)

**Orden.** `ea3b12c` (el arreglo) es anterior a `5b387fe`, y las tres corridas de arriba son
sobre `5b387fe`. Las corridas IL2CPP previas al arreglo están en `il2cpp-antes-de-ea3b12c.txt`:
la primera se colgó sin resultados; la segunda, con un callback de diagnóstico temporal, dio 66
Passed y 3 Failed.

**Qué falló.** Las tres pruebas que fallaban comparan contra un literal con un surrogate suelto:

| Prueba | Literal (`referencias.mjs`) | En el player IL2CPP |
|---|---|---|
| `ElTextoDesdeHtmlEsElMismoQueEnTypeScript` | esperado de `textoDeHtmlEnBloques` para `&#55296;` (líneas 241 y 249): contiene U+D800 | el esperado llegó con U+FFFD; el motor produjo U+D800, igual que TypeScript |
| `ElNombreDelInformeEsElMismoQueEnTypeScript` | esperado del recorte a 80 unidades de un título con un emoji (línea 353): termina en U+D83D | el esperado llegó con U+FFFD; el motor produjo U+D83D, igual que TypeScript |
| `LaVerificacionEsLaMismaQueEnTypeScript` | entrada `SALIDA_VERIFICADOR` (línea 290): `PRIMARIA` + U+D800 | la entrada llegó con U+FFFD y el motor la pasó tal cual |

Los mensajes de esos tres fallos, con lo no ASCII escapado, están en `il2cpp-antes-de-ea3b12c.txt`.

**Causa: IL2CPP, no el motor.** IL2CPP guarda los literales de cadena en UTF-8 dentro de
`global-metadata.dat`, y un surrogate suelto no existe en UTF-8: lo cambia por U+FFFD al compilar.
Medido en el binario de la segunda corrida: el literal `PRIMARIA` + U+D800 + `|` estaba guardado
como `PRIMARIA EF BF BD |` (ese binario no se conservó; los de verde y rojo sí tienen SHA-256).
Mono y .NET guardan los literales en UTF-16 y no los alteran, por eso pasaban. Las cadenas que se
forman en tiempo de ejecución (las que el motor recibe o arma) no pasan por los metadatos.

**Qué cambió `ea3b12c`.** Ningún dato cambió de contenido. Cambió cómo se escribe en C#:

```
antes:   "... 😀 <U+D800 como escape de C#> &nbsp; ..."
después: "... 😀 " + ((char)0xD800).ToString() + " &nbsp; ..."
```

El generador hace esto para cualquier cadena con un surrogate suelto; solo esas tres lo tenían
como carácter (`TEXTO_RARO` y `TAPADOS` llegan al C# dentro de JSON escapado, texto ASCII, y no
cambiaron). Las constantes de `Referencias` pasaron de `const` a `static readonly`, porque la
concatenación con `(char)` no es constante. `Datos.g.cs` (prompts y specs) salió idéntico.

**¿El motor recibe surrogates sueltos en producción? Sí, puede.** El propio motor los produce:
recortar un título a 80 unidades UTF-16 puede partir un emoji, y se conserva así porque es lo que
hace TypeScript. Además, el texto que llega de una página es una cadena de JS, que admite
surrogates sueltos. Por eso el caso **no se quitó ni se ablandó**: después de `ea3b12c` el player
IL2CPP recibe el surrogate real, armado en tiempo de ejecución, y el motor da el mismo resultado
que TypeScript (69/69). Antes del arreglo, IL2CPP probaba U+FFFD en esos casos, no el surrogate.

**Qué cubre esto y qué no.**
- `motor/Runtime` (incluido `Datos.g.cs`) no tiene ningún literal con un surrogate suelto: el único
  escape de ese tipo está en un comentario de `JsonEstricto.cs:11`. Si lo tuviera, IL2CPP lo
  corrompería en la app. Medido con una búsqueda en el código, no con una prueba que lo impida.
- El paso de un surrogate suelto desde la página hasta el motor, a través del puente del panel,
  queda **abierto**: se mide en la autoprueba del panel (T16).

## Por qué EditMode no descubría las pruebas

Unity Test Framework 1.6.0 clasifica cada ensamblado de pruebas por su marca de plataforma:
`EditorLoadedTestAssemblyProvider.cs:62` lo pone en EditMode solo si es `EditorOnly`, y si no, en
PlayMode. `ChatCouncil.Motor.Pruebas.asmdef` tiene `"includePlatforms": []` (todas), que es lo que
permite compilarlo y correrlo en el player IL2CPP. Un mismo ensamblado no puede ser solo de Editor
y correr en el player. Las pruebas están integradas como pruebas de PlayMode; dentro del Editor,
PlayMode corre en Mono.

## El XML de IL2CPP en verde

Tiene 20 líneas porque el player escribe varios elementos en la misma línea; son 46 138 bytes y
contienen los 69 `<test-case>`.

## Abierto

- Android IL2CPP: sin emulador, las pruebas en el player de Android quedan **sin medir** (T17).
