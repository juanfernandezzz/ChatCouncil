# ADR-0008 · Textos de los hechos en WTF-8

Estado: aceptada · 2026-11-10 · D12 (decide Claude)

## Contexto
Los textos que llegan de las páginas de los proveedores pueden traer surrogates UTF-16 sueltos. La Unity los conserva: Registro.cs (Escapar) los escribe como \udXXX, igual que JSON.stringify, y JsonEstricto.cs los lee tal cual. Tres de las 29 líneas del vector RegistroLineas los traen. Un String de Rust no puede contenerlos, y serde_json rechaza esas líneas («unexpected end of hex escape»).

## Decisión
Los campos de texto de los hechos usan un tipo propio Texto, con bytes WTF-8 (UTF-8 más surrogates sueltos), sin dependencias. Texto entra sin pérdida desde UTF-16 (&[u16]) y desde String, da &str sin copia cuando no hay surrogates sueltos y una vista con U+FFFD solo para mostrar (interfaz y PDF). El resto del núcleo usa String. El JSON del registro se lee y escribe con un port a mano de JsonEstricto y Escapar, sin serde_json.

## Consecuencias
Las líneas del registro salen byte a byte iguales a las de la Unity, y leer y reescribir no altera nada, ni siquiera los registros importados. El núcleo sigue sin dependencias de ejecución. Pasar texto a Slint o a typst exige la vista para mostrar. Si en E8 esa conversión pesara en la medición, se revisa esta decisión.
