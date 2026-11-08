# ADR-0002 · Compilar por la unión C:\cc-repo

- Estado: aceptado
- Fecha: 2026-11-08
- Decidió: Juan («2A»), con la evidencia de E3

## Contexto

El repo vive en C:\Users\Juan Fernández\Documents\Proyectos\ChatCouncil. flutter assemble falla cuando la ruta del proyecto tiene «á» («Unable to read file: …Fern´┐¢ndez…app.dill»). E3 probó cinco vías (bench/resultados/e3-ruta-acentos.json): la caché de pub sin acentos y la página de códigos UTF-8 no lo resuelven; una unión de directorio y una letra de unidad sí.

## Decisión

El repo no se mueve. La unión C:\cc-repo apunta a la carpeta del repo, y toda compilación de Flutter (local y de Code) corre desde C:\cc-repo.

## Consecuencias

- Sin cambios en la carpeta de proyectos de Juan ni en las carpetas conectadas a Claude.
- La unión es parte del entorno: si falta, se recrea con mklink /J C:\cc-repo "C:\Users\Juan Fernández\Documents\Proyectos\ChatCouncil".
- Se borra solo con rmdir C:\cc-repo, sin recursivo: un borrado recursivo borraría el repo.
- El CI en GitHub Actions no se ve afectado (rutas sin acentos).

## Qué la revisaría

Que una versión de Flutter corrija el manejo de rutas con acentos, o que alguna herramienta no siga uniones de directorio.
