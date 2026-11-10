# ADR-0005 · Paneles con wry y webview2-com

- Estado: aceptado; reemplaza a ADR-0001
- Fecha: 2026-11-10
- Decidió: Juan (E4: «Q3A»)

## Contexto

Los diez paneles son webviews nativos, ventanas hijas sobre áreas que reserva la interfaz (sin copia de texturas: ADR-0001 midió que copiar texturas cuesta 5 a 7 puntos de CPU cuando las páginas redibujan). El ADR-0001 suponía un plugin de Flutter; con Slint el componente es Rust.

## Decisión

wry crea, ubica, navega y ejecuta JavaScript en cada panel. Lo exclusivo de Windows, como el DevTools Protocol para adjuntar archivos, se hace con webview2-com sobre el controlador de WebView2 que expone wry. El núcleo Rust decide; el componente de paneles solo ejecuta.

## Consecuencias

- wry y webview2-com se actualizan siempre juntos, en la misma versión de webview2-com que trae wry.
- macOS y Linux salen casi sin código propio con wry.
- wry no crea webviews hijos en Android ni iOS (confirmado por su documentación y por la ronda de investigación). Esas plataformas llevan un componente propio detrás de la misma interfaz Rust, en la segunda pasada; ahí se evalúan Native Shell (nsh) y la forma en que la app Unity ya maneja sus paneles en el teléfono, con atención a los límites de procesos de iOS.

## Qué la revisaría

Que wry deje de exponer el controlador de WebView2, o que el costo de mantener la combinación supere al de un componente propio.
