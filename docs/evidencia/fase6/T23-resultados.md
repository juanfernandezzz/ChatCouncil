# T23 — Acciones secundarias, capacidades aceptadas, teléfono y accesibilidad

Medido el 2026-10-14 sobre el commit `da82926` (el código de `9cc8afb` más el anuncio de los
mensajes de estado). `.exe` de Windows con `Construir.Windows` (IL2CPP), desde la unidad `subst U:`.
Al compilar, el único cambio sin commitear era la sección 11 de `docs/FASE6-INTERFAZ.md`, fuera del
proyecto Unity.

SHA-256:
- `ChatCouncil.exe`: `145680641a2600d595ccb13b626cc9c873acf1aa118c441aa09de6fdd2c55b80`
- `GameAssembly.dll`: `29729750e9bea4590c4fbd6585426423ba977d90cd0e09b32399463d22d7dc5e`
- `ChatCouncilPanel.dll`, compilada de `panel/windows/panel.cpp` con `compilar.cmd` (no se versiona;
  MSVC estampa la fecha, así que cambia en cada compilación):
  `af1e961db02c1b50810f7a0b7dcbe6bc15b08918ba2d9324e94b05dd779f50e2`

Decisiones: D48 a D54 en `docs/BLUEPRINT.md`. Lista de chequeo WCAG y evaluación heurística:
`docs/FASE6-INTERFAZ.md` §11.

## Qué se verifica

`PruebaRonda.cs` sigue todo el recorrido de T20 a T22 y agrega, al final:

1. **Rondas anteriores:** las tres rondas de la prueba, la más nueva primero; la que tiene informe
   lo abre.
2. **F1** abre la Ayuda, con la versión.
3. **Apariencia:** tema oscuro y texto al 200 %, guardados en `apariencia.json`; la interfaz pasa a
   medir la mitad en dp (1024 → 512).
4. **Objetivos de 48 dp** en todos los controles visibles de las cuatro secciones.
5. **Foco visible:** botón, campo, casilla y desplegable muestran el borde con el token de foco.
6. **F9** da el paso siguiente (en Operación abre el aviso) y **Ctrl+Tab / Ctrl+Mayús+Tab** cambian
   de panel.
7. **Recargar la página** (una navegación más), **el diagnóstico** en un archivo de `diagnosticos/`
   (con el compositor encontrado una vez) y la carpeta que se abre, y **cerrar la sesión** con
   confirmación: la marca de `localStorage` y la cookie desaparecen.
8. **F6 con teclas reales** (`SendInput`), leyendo el foco de Windows (`GetGUIThreadInfo`): de la
   cabecera a la página del proveedor, F6 desde la página vuelve a la app, y el Tab que sale de la
   página también.
9. **El lector de pantalla:** la jerarquía tiene el botón del paso con su función y su marco, las
   filas de los paneles como botones («Kimi, Por pegar»), la etapa actual dicha con palabras y no
   tiene el relleno de debajo de la página.
10. **La lista con el teclado:** Enter sobre una fila la pone a la vista.

## Resultado

- **Prueba de la Ronda,** tres corridas, cada una con su carpeta de datos nueva en `C:\cc-ev\cN`:
  **63/63 en las tres** (`T23/da82926/ronda-c1.txt` a `ronda-c3.txt`).
- **Regresiones** sobre el mismo `.exe`: T19 da 13/13, 7/7 y 1/1; la autoprueba del panel, 37/37.
- **UI Automation** (`uia.ps1`, lo que lee Narrador): 25 elementos con su nombre, su función y su
  rectángulo en coordenadas de pantalla (`uia-arbol.txt`). Las filas de los paneles son botones con
  su estado; la etapa actual dice «etapa actual».

**Motor, `dotnet test`,** sobre la carpeta `motor/` de `da82926`, extraída con `git archive`:

| Corrida | Archivo | Resultado |
|---|---|---|
| Verde | `motor-verde.xml` | `total="81" passed="81"` |
| Sin la unión con la carpeta del informe (`motor-rojo-historial.diff`) | `motor-rojo-historial.xml` | `passed="80" failed="1"`: `LasRondasAnterioresSalenDelRegistroConSuInforme` |

La prueba nueva se vio fallar durante el TDD: primero sin el método y después por el orden de dos
rondas con la misma hora, lo que llevó a desempatar por el índice.

**App, vista en rojo:**
- **El foco con el color de Unity:** la primera corrida con las comprobaciones de T23 dio 61/62, con
  el borde del botón en `#006AA6`; arreglado el botón, otra vez 61/62, ahora con el campo, la casilla
  y el desplegable. Esas salidas se sobrescribieron al repetir: la evidencia es la mutación de abajo.
- **Mutación del foco y de la trampa de teclado** (`ronda-mutante-foco-teclado.diff`): sin las reglas
  de foco de D53 y sin los manejadores de `panel.cpp`, **61/63 con salida 1**. Fallan «foco visible»
  (los cuatro controles en `#006AA6`) y «F6 entra a la página y sale» (ni F6 ni el Tab devuelven el
  foco). La trampa de teclado existía.
- **A 320 dp,** la captura mostró «Más…» cortado y el selector sin «de 7» (D54); la primera regla no
  alcanzó y hubo que darle `flex-basis: 0` al título y al centro del selector.
- **UI Automation** mostró las filas de los paneles como dos textos sueltos, la etapa actual sin
  decirse y el relleno de debajo de la página. Los tres se corrigieron (D54) y se comprueban en la
  prueba (punto 9).

## La página en el teléfono

Medido como en T20 a T22 (la tira `#ECEAE5` en x = 20):

| Captura | Alto de la página |
|---|---|
| `operacion-telefono-frase.png`, Operación con la frase a la vista | 474 px, 56,2 % |
| `operacion-telefono-plegada.png`, Operación con la frase plegada | 565 px, 66,9 % |
| `pregunta-telefono.png`, Pregunta | 345 px, 40,9 % |

## Capturas

`docs/evidencia/fase6/T23/`, del `.exe` de `da82926`:
- PC, 1366 × 768: Pregunta (la lista entra sin desplazarse), Historial, Ayuda (también en oscuro),
  Ajustes (la Apariencia queda más abajo, fuera de la captura; se comprueba en el punto 3) y la
  Ronda con el texto al 200 %;
- teléfono, 390 × 844: Pregunta, Operación (frase a la vista y plegada), Historial, Ayuda y Ajustes,
  sin el título repetido;
- 320 × 640: la Ronda y la Ayuda, sin nada cortado.

## Lo que queda abierto

- **Android:** no se compiló. Nada de T19 a T23 se midió allí: TalkBack, el tema del sistema por
  `uiMode`, el foco de la página (`requestFocus`), el teléfono real.
- **Lectores de pantalla con personas:** la jerarquía se midió por UI Automation, no escuchando a
  Narrador; el anuncio de los mensajes de estado no se pudo medir.
- **El idioma** no se puede declarar en la jerarquía de Unity (WCAG 3.1.1).
- **El orden del Tab** dentro de cada región es el del documento por construcción; no se recorrió
  tecla por tecla.
- **Proveedores reales:** recargar, el diagnóstico y cerrar la sesión se midieron en páginas de
  prueba.
