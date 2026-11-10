# ADR-0004 · Interfaz con Slint, un solo código para cinco plataformas

- Estado: aceptado
- Fecha: 2026-11-10
- Decidió: Juan (E4: Q2 «C», luego «B, condicionada a su compatibilidad»)

## Contexto

Requisito de Juan: un solo código que compile para Android, iOS, macOS, Linux y Windows, en escritorio, móvil y tableta, eligiendo para qué plataformas compilar, con el rendimiento primero y el máximo de Rust. Se comparó Flutter con Slint con diez paneles nativos de WebView2 en la misma máquina (bench/resultados/e3-controlada.json, e4-slint.json, e4-slint-funcional.json).

## Decisión

La interfaz se escribe con Slint, en Rust y archivos .slint. Se compila por plataforma a elección; primero todo en Windows (D7), después Android y las demás.

## Evidencia

- Slint frente al mejor Flutter (ventanas nativas): RAM del proceso 74 contra 122 MB; arranque 0,76 contra 3,35 s; 11,0 contra 25,5 MiB; CPU del proceso 0 en ambos.
- Slint cumplió los siete requisitos funcionales: perfil persistente, compositor, DOM, adjunto sin diálogo por DevTools Protocol, login de Google, reacomodo y foco.
- La interfaz compila para Android. iOS está en vista previa técnica de Slint.
- La ronda de investigación del 2026-11-10 (docs/investigacion/2026-11-10-alternativas-ui/) no encontró una opción con mejores mediciones.

## Consecuencias

- Flutter, Dart y sus herramientas salen del proyecto.
- El foco entre interfaz y paneles necesita devolverlo explícitamente (focus_parent).
- iOS depende de que Slint madure su soporte; se verifica en la segunda pasada.

## Qué la revisaría

Que Slint no cumpla en Android o iOS lo que cumplió en Windows, o que su soporte de iOS no avance.
