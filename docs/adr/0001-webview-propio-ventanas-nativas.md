# ADR-0001 · Webview propio de ventanas nativas de WebView2

- Estado: aceptado
- Fecha: 2026-11-08
- Decidió: Juan («1B»), con la evidencia de E3

## Contexto

La app nueva necesita diez paneles web vivos a la vez, con las páginas reales de los proveedores, y además: perfil persistente único, escribir en el compositor (insertText y paste), leer el DOM y el HTML, adjuntar un archivo sin diálogo y abrir el login de Google. El valor 1 del proyecto es el rendimiento.

E3 midió cuatro plugins de Flutter para Windows (bench/resultados/e3-webviews.json y e3-controlada.json):
- Solo flutter_inappwebview cumple los seis requisitos, pero dibuja por textura.
- webview_win_floating monta ventanas nativas y no adjunta archivos.
- Con páginas quietas no hay diferencia de CPU. Con páginas que redibujan, los plugins de textura gastan +5,4 puntos de CPU en el proceso y +7 en el árbol (29 % contra 22 % de la máquina, diez paneles). Las respuestas en streaming y los indicadores de carga redibujan durante toda la ronda.
- La app Unity ya resuelve todos los requisitos con un panel propio en C++ sobre WebView2 (panel/windows/panel.cpp), con ventanas nativas, y no dibuja nada encima de los paneles.

## Decisión

Un plugin propio de Flutter para Windows que crea cada panel como ventana nativa hija de WebView2, posicionada sobre el área que la interfaz le reserva, y que expone por canal de plataforma lo que la app necesita, incluido DevTools Protocol. Su lógica se porta de panel/windows/panel.cpp. Lo que se pueda llevar al núcleo Rust (decisiones, parseos, verificaciones) vive allí; el plugin solo hace lo que exige WebView2.

## Consecuencias

- Costo cero de copia de texturas: la CPU del proceso propio no crece cuando las páginas redibujan.
- Cumple los seis requisitos, como hoy en Unity.
- No se pueden dibujar widgets de Flutter encima de un panel (igual que hoy). Diálogos y menús se ubican fuera del área de los paneles o los ocultan mientras están abiertos.
- El plugin es código nuestro que se mantiene; se prueba con los requisitos de openspec (paneles-sesiones, escritura-compositor, captura) y con agent-desktop.
- Android e iOS (segunda pasada, D7) tendrán su propia implementación detrás de la misma interfaz del canal.

## Qué la revisaría

Que la medición de E8 con sesiones reales no muestre ventaja de CPU frente a la línea base, o que el costo de mantener el plugin supere lo que ahorra.
