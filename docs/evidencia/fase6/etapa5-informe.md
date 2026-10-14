# Informe de cierre de la etapa 5 — La interfaz (T18 a T23)

Cerrada el 2026-10-14. Último commit medido: `da82926`. Para el auditor: cada número sale de un
archivo de resultados versionado, con su tasa sobre tres corridas.

## Qué se hizo

- **T18:** inventario, arquitectura y dirección visual de la interfaz, con su evaluación antes de
  construir (D1 a D31). `docs/FASE6-INTERFAZ.md` §1 a §6.
- **T19:** configuración y primer arranque. `T19-resultados.md`.
- **T20 a T22:** la ronda conectada etapa por etapa, de la pregunta al informe en disco.
  `T20-resultados.md`, `T21-resultados.md`, `T22-resultados.md`.
- **T23:** historial, ayuda, apariencia, mantenimiento del panel, teclado, lector de pantalla y la
  revisión de accesibilidad. `T23-resultados.md` y `docs/FASE6-INTERFAZ.md` §11.

## Qué quedó probado, con su número

| Medición | Commit | Resultado | Archivos |
|---|---|---|---|
| Configuración y arranque (T19), tres fases | `0267e0c` | 13/13, 7/7 y 1/1 | `T19-resultados.md` |
| Ronda hasta la Investigación (T20) | `efd4e02` | 23/23, 3 de 3 | `T20/` |
| Ronda hasta la Operación (T21) | `a78b0c6` | 34/34, 3 de 3 | `T21/a78b0c6/` |
| Ronda hasta el informe en disco (T22) | `2429d52` | 51/51, 3 de 3 | `T22/2429d52/` |
| **Recorrido completo con T23** | `da82926` | **63/63, 3 de 3**; T19 13/13, 7/7 y 1/1; autoprueba del panel 37/37 | `T23/da82926/` |
| Motor | `da82926` | 81/81, con su XML y un rojo por mutación | `T23/da82926/motor-*.xml` |
| UI Automation (lo que lee Narrador) | `da82926` | 25 elementos con nombre, función y rectángulo | `T23/da82926/uia-arbol.txt` |
| Contraste | `da82926` | 68 pares en dos temas, todos sobre su mínimo AA | `pnpm guard:contraste` |

Defectos encontrados y arreglados en la etapa, cada uno visto en rojo:
- **T21:** el estado del panel al empezar la Operación (D39) y el «Aceptar» de un diálogo cerrado.
- **T22:** estados en las etapas de los roles (D44), la recaptura fallida que reemplazaba a la buena
  (D45) y las rutas de 260 caracteres que Windows no escribe (D47).
- **T23:** la trampa de teclado en la página del proveedor (D49), el foco con el color de Unity
  (D53), el reflujo a 320 dp y la lista sin teclado ni lector (D54).

## Medido frente a supuesto

- **Medido:** todo lo de la tabla, en el `.exe` de Windows, con páginas locales que imitan a los
  proveedores y carpetas de datos temporales.
- **Supuesto, no medido:**
  - que Narrador lea lo que muestra UI Automation (no se escuchó) y que anuncie los mensajes de estado;
  - el orden del Tab elemento por elemento (es el del documento por construcción);
  - recargar, el diagnóstico y cerrar la sesión en los sitios reales.

## Qué quedó abierto

- **Android: nada de la etapa 5 se compiló ni se midió allí** (desde T17). Es lo primero que falta:
  la interfaz, TalkBack, el tema del sistema y el foco de la página.
- **El recorrido con las cuentas de Juan:** pendiente. Incluye los límites de D30 (una sesión que
  parece abierta en un proveedor que deja escribir sin cuenta) y de D36 (un proveedor que reabre el
  chat anterior).
- **Una prueba con personas:** la evaluación heurística la hizo un solo evaluador, el agente; faltan
  personas, y personas con Narrador o TalkBack.
- **WCAG 3.1.1:** la jerarquía de accesibilidad de Unity no permite declarar el idioma.
- **El texto del informe** sigue sin tildes por la paridad con TypeScript: para T24.
- **Decisiones de dependencias pendientes de Juan** (2026-10-13): los majors no tomados, `marked`
  fijado sin motivo escrito y Newtonsoft 13.0.4 en las pruebas contra 13.0.2 en Unity.
