# Prototipo desechable E4: Slint con diez WebView2

Responde una sola pregunta: ¿cuánto gasta una ventana Slint con diez webviews nativos, frente a los prototipos Flutter de E3? No es código de producto ni pasa a main; en main queda solo `bench/resultados/e4-slint.json`.

Compilar y abrir (la carpeta de datos es un perfil de prueba en `%TEMP%`):

```
cargo run --release -- slint diez %TEMP%\e4-prueba file:///C:/ruta/paginas/estatica.html
```

Medir: `medir.ps1 -Plugin slint -Exe <exe> -Salida <jsonl> -Url <url>`, el mismo método de E3.

Requisitos funcionales de E3 (perfil, compositor, DOM, adjunto por DevTools Protocol, Google): `requisitos.ps1 -Exe <exe> -Carpeta <salida>`. Los modos `foco` y `foco-crudo` muestran una barra Slint con un campo de texto y dejan su estado en el JSON de salida cada 500 ms; `diez` anota el reacomodo en `<datos>\reacomodo.jsonl`. En `bench/resultados/e4-slint-funcional.json` quedan los resultados.

Android, solo la interfaz: `cargo rustc --lib --release --target aarch64-linux-android --crate-type cdylib`, con el enlazador del NDK.
