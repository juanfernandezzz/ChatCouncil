# Actualización de dependencias, 2026-10-13

Este repositorio es un instrumento, así que la actualización se hizo con medición: la misma
corrida antes y después (`medir.sh`). La corrida hace:
- `pnpm install --frozen-lockfile` y `pnpm typecheck`;
- los ocho guards;
- `dotnet test` del motor;
- `pnpm build`;
- regenerar las referencias con `node motor/Dotnet~/referencias.mjs` y mirar `git status`.

## Resultado

| | Antes (`medicion-antes.txt`) | Después (`medicion-despues.txt`) |
|---|---|---|
| install, typecheck, 8 guards, build | salida 0 en los 12 | salida 0 en los 12 |
| Motor, `dotnet test` | 73/73 | 73/73 |
| `referencias.mjs` | salida 0, sin diff | salida 0, sin diff: `Referencias.g.cs` y `Datos.g.cs` iguales byte a byte |

Con los tiempos fuera, las dos salidas solo difieren en el aviso de pnpm sobre su propia versión
y en los cinco archivos de este cambio, que aparecen en `git status`.

## Qué se tomó

**Solo minors y patches, dentro del rango declarado** (`pnpm update -r`). pnpm subió el piso de
los rangos en los `package.json` sin cambiar ningún major:

| Paquete | De | A |
|---|---|---|
| `react` | 19.2.7 | 19.3.0 |
| `@types/react` | 19.2.17 | 19.3.0 |
| `@types/node` | 22.20.1 | 22.20.5 |
| `electron` | 33.4.11 | 33.4.11 (rango `^33.0.0` → `^33.4.11`) |
| `vite` | 5.4.21 | 5.4.21 (rango `^5.4.0` → `^5.4.21`) |

Transitivas: Babel 7.29.7 → 7.29.8/7.29.10, Rollup → 4.64.5, PostCSS → 8.5.29, browserslist y
caniuse-lite, entre otras (`pnpm-lock.yaml`).

**GitHub Actions**, por el aviso de Node 20 obsoleto, a la vigente según la API de releases de
GitHub. Antes se verificó en su `action.yml` que corren en node24 y que conservan las entradas
que usamos:

| Action | De | A | Dónde |
|---|---|---|---|
| `actions/checkout` | v4 | v7 | `ci.yml`, `prueba-login.yml` |
| `actions/setup-node` | v4 | v7 | `ci.yml` |
| `actions/setup-dotnet` | v4 | v6 | `ci.yml`, `prueba-login.yml` |
| `pnpm/action-setup` | v4 | v6 | `ci.yml` |

## Majors disponibles que NO se tomaron (para decidir uno por uno)

| Paquete | Actual | Disponible | Nota |
|---|---|---|---|
| `electron` | 33.4.11 | 44.7.0 | Once majors. Cambia el Chromium de los paneles de la versión Electron. |
| `electron-vite` | 2.3.0 | 5.0.0 | Va con `vite` y `electron`. |
| `vite` | 5.4.21 | 8.3.4 | Va con `electron-vite`. |
| `@types/node` | 22.20.5 | 26.6.5 | El CI corre Node 22.22.2: los tipos siguen al major de Node que se usa. |
| `pnpm` (`packageManager`) | 11.9.0 | 12.11.2 | También está fijado en `ci.yml` (`version: 11.9.0`). |

En `prueba-login.yml` hay otras cuatro actions con su major vigente más alto, y también avisan
Node 20. No estaban en el pedido:

| Action | Actual | Disponible |
|---|---|---|
| `actions/upload-artifact` | v4 | v7 |
| `actions/download-artifact` | v4 | v8 |
| `actions/setup-java` | v4 | v6 |
| `gradle/actions/setup-gradle` | v4 | v6 |

**Fuera de rango sin ser major:** `marked` está fijado exacto en 18.0.14 desde que se agregó
(`b000ff0`) y hay un 18.1.1. Ese commit no da un motivo para fijarlo. Como es la conversión
del informe a PDF, no se tocó.

El motor C# usa `Newtonsoft.Json`, `NUnit` y el SDK de pruebas con `Version="*"`: toman la última
versión en cada restauración, también en el CI. No son parte de pnpm, y quedan como estaban.
