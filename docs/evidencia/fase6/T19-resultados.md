# T19 — Configuración y arranque, medido en la app compilada

Medido el 2026-10-10 sobre el commit `0267e0c`, con el árbol limpio antes y después de compilar.
`.exe` de Windows con `Construir.Windows` (IL2CPP), desde la unidad `subst U:`.

SHA-256:
- `ChatCouncil.exe`: `145680641a2600d595ccb13b626cc9c873acf1aa118c441aa09de6fdd2c55b80`
- `GameAssembly.dll`: `0daca4a710fcdc0a8865fd8f4fc476d5f88c533624d884c28458527e302e3083`

## Qué se verifica

`unity/Assets/Interfaz/PruebaInterfaz.cs` maneja los controles reales de la interfaz (casillas,
desplegables y botones, con el mismo evento que la tecla Enter) sobre una carpeta de datos de
prueba (`-datos`), nunca la real, y páginas locales en lugar de los proveedores. Tres arranques
con la misma carpeta:

1. **Primer arranque.** Sin archivo de selección, arranca la guía sin riel. Las cinco
   combinaciones inválidas de las reglas de `Roles` se rechazan con su texto y no escriben el
   archivo. Una válida (todos menos Mistral; Claude integra y redacta; Grok verifica) lo
   escribe. La sesión se deduce del compositor: con él, "Sesión abierta"; sin él, "Sin
   sesión". Al terminar la guía, la Ronda usa el consejo recién guardado. Antes de cerrar se
   abre una ronda en el registro.
2. **Al reabrir.** La app arranca en la Ronda, sin la guía, con el consejo del archivo y la
   ronda restaurada ("Investigación · 2 de 7", "Capturar los que terminaron"). Ajustes muestra
   lo guardado y la carpeta de datos. Se desmarca Qwen y se guarda: el aviso dice que se aplica
   al reabrir, y la Ronda todavía lo tiene.
3. **Al reabrir otra vez.** Qwen ya no está en la Ronda.

## Resultado

Tres corridas, cada una con su carpeta de datos nueva (`T19/0267e0c/c1-f1.txt` a `c3-f3.txt`):

| Corrida | Fase 1 | Fase 2 | Fase 3 |
|---|---|---|---|
| 1 | 13/13 | 7/7 | 1/1 |
| 2 | 13/13 | 7/7 | 1/1 |
| 3 | 13/13 | 7/7 | 1/1 |

Tasa: 3/3. La autoprueba del panel sobre el mismo `.exe`: **37/37** (`T19/0267e0c/autoprueba.txt`),
la misma que antes de T19.

El motor, con `dotnet test`: **73/73**. Las cuatro pruebas nuevas (`Roles.Guardar` se lee
igual al reabrir y escribe con el formato de TypeScript, `Roles.Conocidos` y
`Dominio.EstadoDeSesion`) se vieron fallar antes de implementar: tres por su aserción, con
una implementación vacía; la de `Roles.Conocidos`, solo porque no compilaba.

**La prueba de la app pasó en su primera corrida**, así que no se la vio fallar. Se hizo una
mutación: `Guardar` escribía el archivo aunque la combinación fuera inválida. La fase 1 dio
**8/13**: las cinco combinaciones inválidas en FALLA, con "y escribió el archivo", y salió con 1
(`T19/0267e0c/mutante-fase1.txt`). Después se restauró el código.

## Capturas

De la app compilada, con `-captura` (`docs/evidencia/fase6/T19/`):

| Captura | Tamaño |
|---|---|
| `primer-arranque-pc-claro.png`, `primer-arranque-pc-oscuro.png` | 1366 × 768 |
| `primer-arranque-telefono-claro.png`, `primer-arranque-telefono-oscuro.png` | 390 × 844 |
| `ajustes-pc-claro.png` | 1366 × 768 |
| `ajustes-telefono-oscuro.png` | 390 × 844 |
| `ronda-restaurada-pc-claro.png`, `ronda-restaurada-telefono-claro.png` | 1366 × 768 y 390 × 844 |

Las de Ajustes y la Ronda usan la carpeta de la corrida 1, después de la fase 3.

## Corregido antes de la evidencia, por las capturas

- Historial y Ayuda se veían en el riel como cajas grises sin motivo. Salen hasta T23 (D31).
- Los textos quedaban 3 dp a la derecha de las casillas y los campos (el margen que el tema da a
  Label).
- En el teléfono entraba una sola casilla por fila: ahora entran dos.

## Lo que queda abierto

- **Android:** no se compiló ni se midió esta versión. Allí las sesiones quedan dentro de la app
  (ProfileStore), y Ajustes lo dice así; falta verlo en el emulador.
- **El límite de D30:** un proveedor que deja escribir sin cuenta da "Sesión abierta". Medirlo
  con las cuentas de Juan queda para el recorrido de primer uso.
- **Para T23**, vistos en las capturas: en el teléfono, "Ajustes" aparece dos veces (en la barra
  y como título), y la barra de desplazamiento tiene el estilo de Unity, también en el tema
  oscuro.
- **Los datos de Electron** están en otra carpeta (D28). Esta versión no los lee.
