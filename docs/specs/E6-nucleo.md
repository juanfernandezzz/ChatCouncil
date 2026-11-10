# E6 · Núcleo Rust · spec

## Qué
El núcleo de ChatCouncil en Rust, sin interfaz: todo lo que ADR-0003 asigna al núcleo, con el mismo comportamiento que ChatCouncil-Unity en Windows. El comportamiento exacto está en openspec/ (requisitos e invariantes por capacidad); esta spec no lo repite.

## Por qué
Juan pidió portar ChatCouncil a Rust «en toda la medida máxima posible», con el rendimiento primero y las mismas funciones. Un núcleo sin interfaz se prueba contra los vectores de referencia de la Unity y se mide solo.

## Alcance
- Capacidades de openspec cubiertas en E6: datos, registro, operacion, captura (solo los parseos), integrador, verificadores, redactor, ronda, informe-final, ajustes y diagnosticos, en sus requisitos de plataforma windows o ambas.
- Fuera de E6: paneles-sesiones, escritura-compositor, interfaz, arranque-actualizacion y pruebas-internas (van en E7 y E8).

## Criterio de hecho de E6
- Cada requisito e invariante de las capacidades cubiertas tiene su prueba en cargo test, y pasa.
- Los vectores de referencia de la Unity pasan todos.
- El núcleo está medido: tiempo de armar el informe .md y PDF contra M4 (3,74 s) y tamaño del binario de prueba.

## Reglas
- ADR-0003 a ADR-0007 y AGENTS.md mandan.
- Los literales de los prompts y specs.json se cargan como datos, idénticos (DAT-001, DAT-002).
- El registro es append-only; ninguna prueba escribe en carpetas reales de la Unity.
