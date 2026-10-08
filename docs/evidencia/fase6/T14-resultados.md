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

## Defecto encontrado en la primera corrida IL2CPP

Antes de `ea3b12c`, en el player IL2CPP fallaban 3 de las 69 y el runner se colgaba al serializar
el mensaje de una de ellas. Causa medida en `global-metadata.dat`: IL2CPP guarda los literales de
cadena en UTF-8 y cambia cada surrogate suelto por U+FFFD (`PRIMARIA` + U+D800 quedó como
`EF BF BD`). Afectaba a tres literales de los datos de prueba generados, no al código del motor
(`motor/Runtime` no tiene literales con surrogates sueltos). Otras pruebas pasaban en IL2CPP
probando U+FFFD en lugar del surrogate. `ea3b12c` arma esos caracteres con `(char)` en tiempo de
ejecución; `Datos.g.cs` salió idéntico.

## Abierto

- Android IL2CPP: sin emulador, las pruebas en el player de Android quedan **sin medir** (T17).
