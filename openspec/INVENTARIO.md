# Inventario de paridad · ChatCouncil-Unity en Windows (E2)

Todo lo que ChatCouncil-Unity hace hoy, con fuente `ruta:línea` del repo juanfernandezzz/ChatCouncil-Unity (HEAD 247f6db) y cómo se prueba. Cada capacidad vive en `specs/<capacidad>/spec.md`.

Las columnas de prueba cuentan requisitos e invariantes. «Solo android» cuenta requisitos con plataforma android.

| Capacidad | Requisitos | Invariantes | Con vector existente | Con prueba nueva | Con comprobación manual | Solo android | Conflictos |
|---|---|---|---|---|---|---|---|
| ajustes | 10 | 2 | 3 | 1 | 8 | 1 | 0 |
| arranque-actualizacion | 12 | 2 | 3 | 0 | 11 | 1 | 1 |
| captura | 16 | 3 | 13 | 0 | 6 | 0 | 0 |
| diagnosticos | 5 | 1 | 0 | 1 | 5 | 0 | 0 |
| escritura-compositor | 13 | 3 | 4 | 0 | 12 | 0 | 1 |
| informe-final | 13 | 3 | 13 | 0 | 3 | 0 | 1 |
| integrador | 9 | 2 | 8 | 2 | 1 | 0 | 0 |
| interfaz | 19 | 3 | 0 | 0 | 22 | 1 | 0 |
| operacion | 16 | 4 | 19 | 1 | 0 | 0 | 0 |
| paneles-sesiones | 14 | 3 | 1 | 1 | 15 | 0 | 0 |
| redactor | 7 | 2 | 8 | 1 | 0 | 0 | 0 |
| registro | 17 | 2 | 15 | 4 | 0 | 0 | 0 |
| ronda | 15 | 3 | 14 | 3 | 1 | 0 | 3 |
| verificadores | 9 | 3 | 8 | 0 | 4 | 0 | 2 |
| **Total** | **175** | **36** | **109** | **14** | **88** | **3** | **8** |

## Conflictos

- **CONFLICTO-ARR-01** · docs/BLUEPRINT.md:2633-2637 (D16) rechaza el aviso automático de versión nueva; unity/Assets/Interfaz/Actualizador.cs:38-55 lo muestra, según D59 (docs/BLUEPRINT.md:2962-2966), posterior.
- **CONFLICTO-ESC-01** · docs/BLUEPRINT.md:2765-2768 (D36) fija 20 s para que la conversación nueva quede vacía; unity/Assets/Interfaz/PantallaRonda.cs:56 espera 60 s (`EsperaChatNuevoMs`, usado en :926).
- **CONFLICTO-INF-01** · docs/FASE6-SPEC.md:276-277 pide abrir el informe al terminar; unity/Assets/Interfaz/PantallaRonda.cs:1192 abre la carpeta, según D41 (docs/BLUEPRINT.md:2810).
- **CONFLICTO-RON-01** · PRODUCT.md:27-28 dice un verificador; motor/Runtime/Roles.cs:22-23 y :46-48 tienen dos (D62).
- **CONFLICTO-RON-02** · docs/FASE6-SPEC.md:80 y :87 piden un verificador, GLM por defecto; motor/Runtime/Roles.cs:46-48 usa glm y qwen.
- **CONFLICTO-RON-03** · PRODUCT.md:47 dice nueve proveedores; motor/Runtime/Roles.cs:40 conoce diez (incluye perplexity).
- **CONFLICTO-VER-01** · docs/FASE6-SPEC.md:254-256 fija 20 URLs por ronda; motor/Runtime/Puerta.cs:963 aplica 20 por verificación (llamada por verificador en :946-951): hasta 40 por ronda.
- **CONFLICTO-VER-02** · PRODUCT.md:27-28 y docs/FASE6-SPEC.md:79-81 hablan de un verificador; motor/Runtime/Roles.cs:22-23 y unity/Assets/Interfaz/PantallaRonda.cs:1128 trabajan con dos.

## No cubierto

- Contenido de los selectores de packages/providers/src/specs.json (406 líneas): se cita el mecanismo que los usa, no cada selector.
- Plantillas completas de packages/analysis/src/prompt-*.ts: solo las líneas clave.
- Sin leer: Lector.cs, IconoEstado.cs, Autoprueba.cs, PruebaRonda, PruebaInterfaz y docs/LIMITACIONES.md.
- Textos literales de DialogoDeclarar, DialogoAbandonar y DialogoCerrarSesion (PantallaRonda).
- Tamaño Carta del PDF: el código (panel/windows/panel.cpp:554-570) usa los valores por defecto de WebView2; Carta solo consta en D40.
