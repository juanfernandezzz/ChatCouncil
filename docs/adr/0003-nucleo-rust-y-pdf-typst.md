# ADR-0003 · Núcleo Rust al máximo y PDF con typst

- Estado: aceptado
- Fecha: 2026-11-10
- Decidió: Juan (E4: Q1 y Q9)

## Contexto

Juan pidió portar ChatCouncil «a lenguaje rust en toda la medida máxima posible». El informe final hoy se convierte a PDF tamaño Carta con WebView2 (INF-014).

## Decisión

Todo lo que no es dibujar la interfaz ni manejar los webviews vive en el núcleo Rust: la máquina de etapas de la ronda, los prompts literales (DAT-002), cuerpos, marcas, anonimización, barajado con semilla, parseos, tabla de hallazgos, informe .md, verificación de URL, registro, conversaciones, specs de proveedores (DAT-001) y ajustes. La interfaz dibuja el estado que le da el núcleo y le reenvía las acciones del usuario.

El PDF se genera en Rust con typst como librería, en tamaño Carta (612 x 792 pt), con el mismo contenido que hoy; el diseño puede mejorar.

## Consecuencias

- El núcleo se prueba sin interfaz, contra los vectores de referencia del repo Unity.
- El PDF ya no depende de WebView2; typst agrega peso al ejecutable, que se mide en E6 junto con el tiempo frente a M4 (3,74 s).

## Qué la revisaría

Que typst no reproduzca algún contenido del informe, o que su costo en tamaño o tiempo empeore la línea base.
