# Inventario de paridad · ChatCouncil-Unity en Windows (E2)

Todo lo que ChatCouncil-Unity hace hoy, con fuente `ruta:línea` del repo juanfernandezzz/ChatCouncil-Unity (HEAD 247f6db) y cómo se prueba. Cada capacidad vive en `specs/<capacidad>/spec.md`.

Las columnas de prueba cuentan requisitos e invariantes. «Solo android» cuenta requisitos con plataforma android.

| Capacidad | Requisitos | Invariantes | Con vector existente | Con prueba nueva | Con comprobación manual | Solo android | Resueltos |
|---|---|---|---|---|---|---|---|
| ajustes | 10 | 2 | 3 | 1 | 8 | 1 | 0 |
| arranque-actualizacion | 12 | 2 | 3 | 0 | 11 | 1 | 1 |
| captura | 16 | 3 | 13 | 0 | 6 | 0 | 0 |
| datos | 2 | 0 | 0 | 2 | 0 | 0 | 0 |
| diagnosticos | 5 | 1 | 0 | 1 | 5 | 0 | 0 |
| escritura-compositor | 13 | 3 | 4 | 0 | 12 | 0 | 1 |
| informe-final | 14 | 3 | 13 | 1 | 3 | 0 | 1 |
| integrador | 9 | 2 | 8 | 2 | 1 | 0 | 0 |
| interfaz | 24 | 7 | 6 | 0 | 25 | 1 | 0 |
| operacion | 16 | 4 | 19 | 1 | 0 | 0 | 0 |
| paneles-sesiones | 15 | 3 | 2 | 1 | 15 | 0 | 0 |
| pruebas-internas | 18 | 3 | 0 | 1 | 20 | 0 | 0 |
| redactor | 7 | 2 | 8 | 1 | 0 | 0 | 0 |
| registro | 17 | 2 | 15 | 4 | 0 | 0 | 0 |
| ronda | 17 | 3 | 16 | 3 | 1 | 0 | 3 |
| verificadores | 9 | 3 | 8 | 0 | 4 | 0 | 2 |
| **Total** | **204** | **43** | **118** | **18** | **111** | **3** | **8** |

## Conflictos resueltos

- **RESUELTO-ARR-01** · docs/BLUEPRINT.md:2633-2637 (D16) rechaza el aviso automático de versión nueva; unity/Assets/Interfaz/Actualizador.cs:38-55 lo muestra, según D59 (docs/BLUEPRINT.md:2962-2966), posterior.
  Resuelto por Claude el 2026-11-07 con la regla de paridad: manda el comportamiento actual del código; el documento citado está desactualizado.
- **RESUELTO-ESC-01** · docs/BLUEPRINT.md:2765-2768 (D36) fija 20 s para que la conversación nueva quede vacía; unity/Assets/Interfaz/PantallaRonda.cs:56 espera 60 s (`EsperaChatNuevoMs`, usado en :926).
  Resuelto por Claude el 2026-11-07 con la regla de paridad: manda el comportamiento actual del código; el documento citado está desactualizado.
- **RESUELTO-INF-01** · docs/FASE6-SPEC.md:276-277 pide abrir el informe al terminar; unity/Assets/Interfaz/PantallaRonda.cs:1192 abre la carpeta, según D41 (docs/BLUEPRINT.md:2810).
  Resuelto por Claude el 2026-11-07 con la regla de paridad: manda el comportamiento actual del código; el documento citado está desactualizado.
- **RESUELTO-RON-01** · PRODUCT.md:27-28 dice un verificador; motor/Runtime/Roles.cs:22-23 y :46-48 tienen dos (D62).
  Resuelto por Claude el 2026-11-07 con la regla de paridad: manda el comportamiento actual del código; el documento citado está desactualizado.
- **RESUELTO-RON-02** · docs/FASE6-SPEC.md:80 y :87 piden un verificador, GLM por defecto; motor/Runtime/Roles.cs:46-48 usa glm y qwen.
  Resuelto por Claude el 2026-11-07 con la regla de paridad: manda el comportamiento actual del código; el documento citado está desactualizado.
- **RESUELTO-RON-03** · PRODUCT.md:47 dice nueve proveedores; motor/Runtime/Roles.cs:40 conoce diez (incluye perplexity).
  Resuelto por Claude el 2026-11-07 con la regla de paridad: manda el comportamiento actual del código; el documento citado está desactualizado.
- **RESUELTO-VER-01** · docs/FASE6-SPEC.md:254-256 fija 20 URLs por ronda; motor/Runtime/Puerta.cs:963 aplica 20 por verificación (llamada por verificador en :946-951): hasta 40 por ronda.
  Resuelto por Claude el 2026-11-07 con la regla de paridad: manda el comportamiento actual del código; el documento citado está desactualizado.
- **RESUELTO-VER-02** · PRODUCT.md:27-28 y docs/FASE6-SPEC.md:79-81 hablan de un verificador; motor/Runtime/Roles.cs:22-23 y unity/Assets/Interfaz/PantallaRonda.cs:1128 trabajan con dos.
  Resuelto por Claude el 2026-11-07 con la regla de paridad: manda el comportamiento actual del código; el documento citado está desactualizado.

## No cubierto

- Selectores de packages/providers/src/specs.json y plantillas de packages/analysis/src/prompt-*.ts: cubiertos como datos por sha256 (DAT-001, DAT-002), no selector por selector ni línea por línea.
- docs/LIMITACIONES.md: leído; no dio requisitos, porque describe límites de los proveedores y del método. Donde contradice al código, manda el código: dice que «Capturar» nunca hace clic (:117-121), pero el código hace clic en el canvas y en las tarjetas de Kimi (pagina/src/pagina.ts:301, :313, :341); dice pool de 8 y «Consolidar respuestas» (:26-29, :49-53, :290-291), y el código tiene 7 y «Pegar la operación en los paneles»; describe envío automático (:195-242), y la app nunca envía (pagina.ts:8-9); habla de DOI y título (:340-342), y el código solo pide el estado HTTP; dice «sin fuentes» (:346-347), y eso no aparece en el código; da deepseek fijo como redactor (:343), y es solo el valor por defecto; dice que el aviso de primer uso lo referencia (:4-5), y ningún .cs ni .uxml lo hace.
- Contenido de las citas: una muestra de 40 de 375 (semilla 20261107) revisada por un agente independiente; las demás solo se comprobaron mecánicamente (archivo y línea existen).
