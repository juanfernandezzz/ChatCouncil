# T15 — Panel Windows I: crear, mostrar, ejecutar

Medido el 2026-10-09 sobre el commit `ead9dcf`, con el árbol limpio antes y después. El
plugin se compiló con `panel/windows/compilar.cmd` (MSVC 14.51 de Build Tools 2026, SDK de
WebView2 1.0.4258.31) y el `.exe` con `Construir.Windows` (IL2CPP, x64). Runtime de WebView2
en este equipo: 154.0.4258.62.

## Resultado

Tres corridas del mismo `.exe` con `-autoprueba`: **14/14 en las tres, código de salida 0**
(`T15/autoprueba-ead9dcf-1.txt`, `-2`, `-3`). Tasa: 3/3.

| Comprobación | Cómo se mide |
|---|---|
| entorno | WebView2 arranca con una carpeta de datos temporal (nunca los perfiles reales) |
| perfil | el nombre que informa WebView2 (`ICoreWebView2Profile`), no el que se pidió |
| argumentos de no limitación | los tres switches de Electron están en la línea de comandos del proceso del navegador, leída del sistema operativo (`NtQueryInformationProcess`) |
| escribir, leer el compositor, chat vacío | `pagina.js` por pedido y consulta en un textarea, con ñ, acentos y una línea vacía: 74 caracteres idénticos |
| escribir no navega / contador de navegaciones | escribir deja el contador igual; navegar suma una |
| bloqueo de `/logout` y de `/auth/sign-out?vuelta=1` | la navegación se cancela, no cuenta como navegación, el panel sigue en su página y la URL queda registrada |
| navegar a un cierre de sesión avisa | `Panel.Navegar` lanza en vez de devolver éxito |
| frente, detrás, rectángulo | el orden real de las ventanas hijas y su rectángulo, medidos con Win32 |

## Lo que pasó antes del verde (en orden)

1. `antes-1-rojo-sin-plugin.txt`: el `.exe` sin la DLL falla con `DllNotFoundException`
   (0/1, salida 1). Es la prueba escrita antes que el plugin.
2. `antes-2-intento-10de13.txt`: con el plugin, 10/13. `Paneles.Crear` devolvía el panel
   antes de que terminara de cargar su URL inicial, y el contador se cruzaba con esa
   navegación. Arreglado en `Crear`: un panel está listo con su URL inicial cargada.
3. `antes-3-intento-10de13.txt`: 10/13. La página de prueba se llamaba `logout.html`, y su
   URL coincide con el patrón de cierre de sesión: el panel la bloqueaba, que es lo correcto.
   Se renombró a `cierre.html`. Eso destapó un defecto real: `Panel.Navegar` devolvía éxito
   en una navegación bloqueada, porque WebView2 la da por terminada igual. Ahora avisa.
4. `mutacion-navegar-sin-aviso.txt`: el aviso de `Navegar` se escribió antes que su
   comprobación, así que se la vio fallar después: con el aviso desactivado, 13/14 y FALLA
   "navegar a un cierre de sesión avisa".

## SHA-256 de los binarios (no versionados)

| Binario | SHA-256 |
|---|---|
| `ChatCouncil.exe` | `145680641a2600d595ccb13b626cc9c873acf1aa118c441aa09de6fdd2c55b80` |
| `ChatCouncil_Data/Plugins/x86_64/ChatCouncilPanel.dll` | `1773b4f2f211869b2637f898ab178b155de545d824630f5c4dc4ba6d3e5b4576` |
| `GameAssembly.dll` | `b78edeb60d27ed8010e7c533cd4f77d2c41b7cf1431f64c9ea0da2e9815beca7` |

El hash amarra este resultado a este binario; no permite verificar desde fuera su contenido.

## Abierto

- Que los switches **eviten** la limitación (un panel detrás que sigue con sus
  temporizadores a ritmo normal) no está medido: T15 mide que están aplicados al proceso.
- El resto de la autoprueba de la spec (ventana emergente con `opener`, aislamiento entre
  perfiles, adjunto, PDF, iframe de otro origen, borrado del perfil, techo externo) es T16.
