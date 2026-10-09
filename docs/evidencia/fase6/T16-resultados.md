# T16 — Panel Windows II y el script de página, medidos

Medido el 2026-10-09 sobre el commit `ef3bb01`, con el árbol limpio antes y después. Plugin
compilado con `panel/windows/compilar.cmd` y `.exe` con `Construir.Windows` (IL2CPP, x64).
Runtime de WebView2: 154.0.4258.62.

## Resultado

Tres corridas del mismo `.exe` con `-autoprueba`: **36/36 en las tres, código de salida 0**
(`T16/autoprueba-ef3bb01-1.txt`, `-2`, `-3`). Tasa: 3/3. Incluye las 14 comprobaciones de T15.

La autoprueba usa **las specs reales** de `specs.json` (las que la app lee, `Datos.Specs` del
motor) sobre páginas locales que imitan la estructura que esas specs esperan. Los perfiles son
temporales; nunca se tocan los reales.

### El script de página (abierto desde la etapa 3)

| Comprobación | Página y spec | Qué mide |
|---|---|---|
| escritura `insertText` en contenteditable | `chatgpt.html`, spec chatgpt | texto con ñ, acentos, línea vacía y sangría: idéntico al leerlo |
| escritura por párrafos | `mistral.html` (tipo ProseMirror), spec mistral | ídem, un `<p>` por línea |
| pegado de 180.000 caracteres con marcas | `kimi.html` (tipo Lexical, procesa el pegado él mismo), spec kimi | 185.416 caracteres con las 180 marcas del motor (`Cuerpos.InsertarMarcasIntercaladas`): idéntico e integridad `completo` (180/180) por `Cuerpos.EvaluarIntegridad`, en 1.330 a 1.436 ms |
| chat vacío / no vacío | textarea y chatgpt | `chatVacio` true y false |
| lectura tipo chatgpt | chatgpt | `userText`, `fuentesHref` = 2, `informeEnIframe`, `generating` |
| estado de generación | chatgpt | con el botón de detener, generando; sin él y con texto, fin `observado` |
| diagnóstico de selectores | chatgpt | conteos por selector, el iframe de otro origen, y un selector inválido da `invalido` |
| exclude y html crudo | kimi | el texto excluye `segment-assistant-actions`; el html lo conserva |
| archivos de kimi | kimi + `kimink/embed.html` | 2/2 archivos leídos desde su iframe |
| canvas de mistral | mistral | el texto del canvas reemplaza al aviso, el html guarda los dos, el canvas queda cerrado, `modelLabel` "Rápido" |
| surrogate suelto por `pagina.js` y por `JSON.stringify` | textarea | `0061 D800 0062 DC00 0063` llega igual a C# |

### El panel

| Comprobación | Qué mide |
|---|---|
| script en un iframe de otro origen | `informe.html` servido desde `https://cc-otro.test/`, dentro de un `about:blank`, como Deep Research: se lee su `_reportPage_` |
| adjunto sin selector (DevTools) | `pagina.js` marca el input y `DOM.setFileInputFiles` lo carga: la página recibe el nombre y el tamaño exactos |
| PDF | impresión nativa de WebView2: cabecera `%PDF-`, 67.692 bytes |
| ventana emergente con `opener` en el mismo perfil | `window.open` desde la página: `window.opener` apunta al origen, el perfil es el mismo y ve su marca |
| la emergente se cierra con `window.close()` | el panel de la emergente deja de existir |
| aislamiento entre dos perfiles | otro perfil, mismo origen, no ve la marca |
| borrado de los datos del perfil | después de `ClearBrowsingDataAll`, la marca no está |
| techo externo sobre una página colgada | un bucle de 15 s en la página: el techo (3 s en la prueba, 90 s en la app) corta entre 3.003 y 3.013 ms |
| un panel colgado no bloquea a los demás | otro panel responde en 3 a 6 ms mientras el colgado sigue colgado |

La "marca" es un valor sintético en el `localStorage` del origen de prueba, en perfiles
temporales: mide perfiles, no lee datos reales. `pagina.js` no toca el almacenamiento.

## Lo que pasó antes del verde (en orden)

1. `antes-1-rojo-plugin-de-T15.txt` (10/30): la API nueva contra la DLL de T15. Faltan las
   funciones (`EntryPointNotFoundException`) y la DLL vieja no entiende dos hosts, así que no
   se sirven las páginas. Es la prueba escrita antes que el plugin.
2. `antes-2-intento-31de34.txt` (31/34): con el plugin nuevo, las siete capacidades del panel
   en verde; fallan las tres escrituras en contenteditable. Causa, medida en el navegador: los
   editores de prueba no tenían `white-space: pre-wrap`, y así el navegador cambia la sangría
   por U+00A0 (o la colapsa). ProseMirror y Lexical sí lo ponen (prosemirror-view y
   `packages/lexical/src/LexicalEditor.ts`, `style.whiteSpace = 'pre-wrap'`): el defecto era de
   las páginas de prueba, no de `pagina.js`.
3. `antes-3-verde-falso-esperado-plegado.txt` (36/36, **falso**): la comprobación nueva del
   surrogate suelto (abierta desde T14) daba "igual" porque el valor esperado también era
   U+FFFD. El compilador plegó `"a" + (char)0xD800 + "b"` en un literal, que IL2CPP
   corrompe. Lo recibido también era U+FFFD.
4. `antes-4-rojo-newtonsoft.txt` (35/36): con el esperado arreglado (`((char)0xD800).ToString()`),
   el panel todavía leía con Newtonsoft: por `pagina.js` llegaba `0061 FFFD 0062 FFFD 0063`.
   Defecto real del panel, arreglado en `ef3bb01`: lee con `JsonEstricto` del motor.

`guard:surrogates` se amplió por el punto 3: marca `(char)0xD800` sin `.ToString()` y revisa
también `unity/Assets`. Se lo vio en rojo sobre `Autoprueba.cs:119`, y en 13 casos sintéticos
(7 malos fallan, 6 buenos pasan).

## Medido, no exigido

- **Un resultado crudo de `ExecuteScript` con un surrogate suelto no vuelve nunca** (cortó el
  techo de 5 s en las tres corridas). Por eso todo script que devuelve texto de la página lo
  pasa por `JSON.stringify` en la página: `pagina.js` ya lo hacía, `LeerInformeEnIframe` ahora
  también.
- **Un compositor sin `white-space: pre-wrap`** cambia la sangría por U+00A0 al escribir. Los
  dos editores ricos de los proveedores medidos (ProseMirror, Lexical) lo ponen.

## SHA-256 de los binarios (no versionados)

| Binario | SHA-256 |
|---|---|
| `ChatCouncil.exe` | `145680641a2600d595ccb13b626cc9c873acf1aa118c441aa09de6fdd2c55b80` |
| `ChatCouncil_Data/Plugins/x86_64/ChatCouncilPanel.dll` | `aff9c4b964e5f3af184d668b9abd398c1b9c590d2a3a9c93a371c08f3283db0c` |
| `GameAssembly.dll` | `41392f018bbaa1396c9b381713589f7be4e52475181fab930cf9ca7773b5b3a0` |

El hash amarra este resultado a este binario; no permite verificar desde fuera su contenido.
La DLL cambia de hash entre compilaciones del mismo código: MSVC no es determinista por defecto.

## Abierto

- Que los switches **eviten** la limitación de un panel detrás (temporizadores a ritmo normal)
  sigue sin medir; T15 midió que están aplicados.
- Los selectores contra los sitios reales, en escritorio y en el sitio móvil de Android, solo
  se miden con las cuentas de Juan (spec, "Lo que solo Juan puede medir en vivo").
