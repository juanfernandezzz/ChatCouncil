# Informe de cierre de la etapa 4 — El panel (T14 a T17)

Cerrada el 2026-10-09. Último commit medido: `b9c3091`. Para el auditor: las autopruebas con su
tasa sobre tres corridas, cada número tomado de un archivo de resultados versionado.

## Qué se hizo

- **T14:** entorno Unity 6000.3.25f1 LTS (Android y Windows IL2CPP) y proyecto `unity/`, con el
  motor como paquete local. `T14-resultados.md`.
- **T15 y T16:** plugin de Windows en C++ sobre WebView2, y la autoprueba del panel y del script
  de página con las specs reales. `T15-resultados.md`, `T16-resultados.md`.
- **T17:** plugin de Android en Java sobre `android.webkit.WebView` y androidx.webkit 1.17.1,
  con las mismas funciones que el de Windows, y `Construir.Android` (IL2CPP ARM64).
  `T17-resultados.md`.

## Qué quedó probado, con su número

| Medición | Commit | Resultado | Archivos |
|---|---|---|---|
| Pruebas del motor, Editor (Mono) y player Windows IL2CPP | `5b387fe` | 69/69 y 69/69; mutado, 67 OK y las 2 fijadas en Failed | `T14-resultados.md` |
| Autoprueba del panel Windows I | `ead9dcf` | 14/14, 3 de 3 corridas | `T15/` |
| Autoprueba completa Windows | `ef3bb01` | 36/36, 3 de 3 | `T16/` |
| Autoprueba completa Android (emulador Android 36, WHPX, ARM64 traducido) | `b9c3091` | **36/36, 3 de 3** | `T17/b9c3091/android-corrida*.txt` |
| Autoprueba completa Windows, otra vez (con la comprobación del emoji) | `b9c3091` | **37/37, 3 de 3**, salida 0 | `T17/b9c3091/windows-corrida*.txt` |

Los dos binarios se compilaron en este PC, con su SHA-256 en `T17-resultados.md`.

Defectos encontrados y arreglados en la etapa: surrogates sueltos en los literales bajo IL2CPP
(`ea3b12c`, vigilado por `guard:surrogates`), Newtonsoft en el puente de Windows (`ef3bb01`) y
la carrera de los tickets en el plugin de Android (`b9c3091`).

## Medido frente a supuesto

- **Medido:** todo lo de la tabla, en páginas locales que imitan a los proveedores, con
  perfiles temporales.
- **Supuesto, no medido:**
  - que los switches de Windows eviten la limitación de un panel detrás (solo se midió que
    están aplicados);
  - el comportamiento en un teléfono ARM real (los tiempos de Android son de un emulador que
    traduce ARM64);
  - el mensaje de Android sin `MULTI_PROFILE` (el WebView del emulador lo admite);
  - el PDF de Android en otras versiones del sistema.

## Qué quedó abierto

- **Pruebas del motor en un player de Android: sin medir.**
- Los selectores, la escritura y el adjunto en los sitios reales, en escritorio y en móvil:
  solo se miden con las cuentas de Juan. En Android el adjunto toca el input, y con un input
  oculto (como en los compositores reales) no está medido.
- En Android, con un panel colgado, el otro panel respondió en 0,9 a 1,1 s (límite de la
  prueba: 1,5 s). Es cerca del límite y en un emulador; en un teléfono real, sin medir.
- `urlsUnicas` y `normalizarUrl` siguen sin portar (desde la etapa 3).
- La interfaz: T18 y la etapa 5.
- **Pendiente con el auditor (T16):** el arreglo de Newtonsoft se escribió antes de ver fallar la prueba corregida.
  Está dicho en `T16-resultados.md`. En T17, la carrera de los tickets no tiene una prueba
  determinista: la mide la tasa de tres corridas.
