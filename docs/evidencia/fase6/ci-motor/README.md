# Las pruebas del motor en el CI, vistas en rojo antes de confiar en ellas

El 2026-10-13, por decisión de Juan, `.github/workflows/ci.yml` corre
`dotnet test "motor/Dotnet~/Pruebas/Pruebas.csproj"` (`actions/setup-dotnet@v4`, 8.0.x) antes de
"Build". Así el conteo del motor es una compuerta y no una afirmación. Commit del paso: `8213879`.

## La prueba en rojo

- **Rama de prueba:** `ci-motor-rojo`, sobre `8213879`, con dos commits que no se fusionan:
  - `7ae46e9` rompe `LosConocidosSonLosDeTypeScript`: compara con
    `Referencias.Conocidos.Reverse()`;
  - `46fcda1` agrega la rama al disparador `push` del workflow. GitHub usa el workflow del
    commit empujado, y en esta máquina no hay `gh` para abrir un PR.
- **En local** (`dotnet test` sobre la rama): 72 de 73, con la prueba rota en "Con error";
  salida 1.
- **En el CI:** corrida `38401356594`
  (https://github.com/juanfernandezzz/ChatCouncil/actions/runs/38401356594), conclusión
  `failure`. Los pasos de `rojo-46fcda1-jobs.json`:
  - del 1 al 14, "success" (todos los guards y `setup-dotnet`);
  - el 15, "Pruebas del motor (dotnet test)", "failure";
  - "Build" y `guard:artefacto`, "skipped".

  La anotación de falla dice "Process completed with exit code 1."
  (`rojo-46fcda1-anotaciones.json`).
- **Por qué hay JSON y no el log crudo:** la API pública de GitHub devuelve los pasos y las
  anotaciones sin autenticación, pero no el log. Desde aquí no se usan credenciales.
- **Restauración:** la rama se borró del remoto y del local. `main` nunca tuvo la prueba rota
  ni el disparador extra.

Archivos: `rojo-46fcda1-corrida.json` (la corrida), `rojo-46fcda1-jobs.json` (el job y sus
pasos) y `rojo-46fcda1-anotaciones.json`.
