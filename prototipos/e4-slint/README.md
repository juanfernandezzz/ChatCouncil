# Prototipo desechable E4: Slint con diez WebView2

Responde una sola pregunta: ¿cuánto gasta una ventana Slint con diez webviews nativos, frente a los prototipos Flutter de E3? No es código de producto ni pasa a main; en main queda solo `bench/resultados/e4-slint.json`.

Compilar y abrir (la carpeta de datos es un perfil de prueba en `%TEMP%`):

```
cargo run --release -- slint diez %TEMP%\e4-prueba file:///C:/ruta/paginas/estatica.html
```

Medir: `medir.ps1 -Plugin slint -Exe <exe> -Salida <jsonl> -Url <url>`, el mismo método de E3.

Android, solo la interfaz: `cargo rustc --lib --release --target aarch64-linux-android --crate-type cdylib`, con el enlazador del NDK.
