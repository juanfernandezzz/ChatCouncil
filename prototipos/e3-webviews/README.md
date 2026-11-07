# e3_webviews (prototipo desechable de E3)

Compara plugins de webview de Flutter en Windows con diez paneles. Resultados: `bench/resultados/e3-webviews.json` en main.

1. `.\construir.ps1` compila un exe por plugin en `C:\cc-e3\<plugin>` (ruta ASCII; un DispatcherQueue por hilo impide juntarlos).
2. `.\medir.ps1 -Plugin windows -Exe C:\cc-e3\windows\build\windows\x64\runner\Release\e3_webviews.exe -Salida C:\cc-e3\corridas.jsonl`
3. `.\requisitos.ps1 -Plugin windows -Exe <exe> -Carpeta C:\cc-e3\req`
