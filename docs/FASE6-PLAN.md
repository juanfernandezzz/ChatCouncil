# Fase 6 — Plan de implementación de la versión 1 en Unity

Escrito con `planning-and-task-breakdown` el 2026-10-06, sobre
`docs/FASE6-SPEC.md`. La lista de tareas vive en este mismo archivo, y no en
`tasks/todo.md`, porque el prompt de la fase pide el plan en `docs/`.

Cada tarea se marca `[x]` sólo con su verificación MEDIDA y pegada en el
informe de la etapa. Compilar no es embarcar.

## Overview

Se construye en el orden que fija el prompt de la fase: motor, Unity,
interfaz, pruebas y revisión, y entrega. Dentro de cada etapa las tareas se
cortan por capacidad completa, de modo que cada una deja algo que se puede
probar por uno de los dos puntos acordados: el motor, con `dotnet test`, y el
panel, con la autoprueba dentro de la app. La interfaz se conecta al final,
cuando las dos mitades que conecta ya están probadas.

## Architecture Decisions

- **Ubicación.** El proyecto de Unity vive en `unity/` dentro del
  repositorio. El motor vive dentro de él como código fuente con su propio
  ensamblado sin referencias a Unity. Las pruebas del motor son un proyecto de
  .NET aparte que compila esos mismos archivos fuente. Así hay una sola copia
  del código, que corre en dos compiladores.
- **NUnit para las pruebas del motor**, el mismo framework que usa el Unity
  Test Framework, para que las mismas pruebas puedan correr dentro del Editor
  si hace falta.
- **Valores de referencia de TypeScript.** Un script de Node ejecuta las
  funciones de `packages/` con entradas fijas y guarda las salidas en un JSON
  versionado. Las pruebas de C# comparan contra ese JSON. Es la forma medible
  de "conservar los algoritmos".
- **El script de página se escribe en TypeScript** y se compila con `tsc` a un
  único archivo JS. Es lo que pide el prompt ("usa también el LSP de
  TypeScript").
- **Windows: plugin en C++ compilado con MSVC**, con el SDK de WebView2 en la
  versión estable más reciente. **Android: plugin en Java** que compila el
  Gradle de Unity, con androidx.webkit en la versión estable más reciente.
- **Ruta con tilde.** La ruta del repositorio tiene "á" ("Juan Fernández").
  La compilación Android local se hace desde una unidad virtual sin tildes
  (`subst`), porque Gradle y el NDK fallan con rutas no ASCII en Windows. En
  la nube no hace falta: la ruta del runner es ASCII.

## Task List

Formato: **Acepta** (qué tiene que ser cierto), **Verifica** (cómo se mide),
**Depende de**, **Archivos** y **Tamaño**.

### Etapa 3 — El motor

- [ ] **T1. Esqueleto del motor y referencias de TypeScript.**
  Acepta: existen el proyecto del motor, el de pruebas y el script de
  referencias. Una prueba de humo falla primero y después pasa.
  Verifica: `dotnet test` (salida pegada); el JSON de referencias se regenera
  idéntico en dos corridas.
  Depende de: —. Archivos: ensamblado del motor, proyecto de pruebas, script
  de referencias, `.gitignore`. Tamaño: S.

- [ ] **T2. Dominio y registro.**
  Acepta: los dieciséis hechos leen y escriben JSON con los mismos nombres de
  campo que la versión Electron. `leerRegistro` cuenta ilegibles y detecta la
  última línea incompleta. Están portadas `etapaDeRonda` (operadores
  distintos), `preguntaEfectivaDeRonda` y `derivarProcedencia`.
  Verifica: un registro de muestra escrito por el TypeScript se lee entero y
  se re-escribe idéntico línea a línea; los casos de etapa del BLUEPRINT (6
  operadores con una recaptura → "operacion").
  Depende de: T1. Tamaño: M.

- [ ] **T3. Barajado, anonimización y códigos.**
  Acepta: `hashSemilla`, mulberry32, Fisher-Yates, `anonymizeReplies` con
  scrub y conteo, y `codigosEstables`.
  Verifica: igualdad con las referencias de TypeScript para 50 semillas;
  determinismo; uniformidad 1,00 ± 0,15 sobre 200 semillas; distribución
  50 ± 26 por celda sobre 400 barajados.
  Depende de: T1. Tamaño: S.

- [ ] **T4. Cuerpo del operador e integridad.**
  Acepta: lista blanca de query, detección de fugas, `armarCuerpoConFuentes`,
  marcas intercaladas con FIN, `evaluarIntegridad`, `localizarPerdida` y
  `armarCuerposPorOperador` con su comprobación cruzada.
  Verifica: regla 4 de `guard:sellado` (limpio pasa; `chatgpt.com/share`
  falla); los cuatro casos de integridad del BLUEPRINT; la comprobación
  cruzada falla con un cuerpo que incluye la respuesta propia; los cuerpos
  son iguales a la referencia de TypeScript con tokens fijos.
  Depende de: T3. Tamaño: M.

- [ ] **T5. Prompts literales y specs.**
  Acepta: los cuatro prompts y `specs.json` son archivos de datos extraídos
  por script, nunca copiados a mano. La sustitución se hace partiendo y
  juntando. Están armados el prompt de operación (con cuerpo y con archivo),
  el del integrador con `tablaDe`, el del verificador, el del redactor y su
  archivo.
  Verifica: igualdad byte a byte con los prompts armados por el TypeScript
  con las mismas entradas, incluida una pregunta con `$&` y `{{CUERPO}}`
  adentro; las reglas de `guard:specs`.
  Depende de: T1. Tamaño: M.

- [ ] **T6. Parseos y texto desde HTML.**
  Acepta: `parsearHallazgos`, `parsearVerificacion` (formato nuevo y
  anterior), `parsearReferenciasIntegrador`, `textoDeHtmlEnBloques` y los
  títulos y la sección de rescate.
  Verifica: el informe sembrado de siete párrafos de `guard:trazabilidad`; las
  siembras del BLUEPRINT (TENSION con P9; verificación con prosa, H999, tipo
  no reconocido, viñeta, `&quot;`, comillas tipográficas); `<ol start="5">`
  produce "5. QUE CONVIENE RESCATAR"; igualdad con las referencias de
  TypeScript.
  Depende de: T1. Tamaño: M.

- [ ] **T7. Citas, tabla de hallazgos y roles.**
  Acepta: `extraerCitas` (cuerpo y panel-ancestro, descartes con motivo),
  `armarTablaHallazgos`, salidas vigentes, etiquetas válidas por operador,
  clasificación de lecturas por etapa y reglas de roles y del pool.
  Verifica: los cuatro descartes sintéticos de T1; chip inline frente a lista
  de "Fuentes clave"; tabla única con un operador recapturado; los casos de
  roles del BLUEPRINT (redactor = verificador rechazado, etc.).
  Depende de: T2, T3. Tamaño: M.

- [ ] **T8. Informe final y controles del redactor.**
  Acepta: `armarInformeFinal`, el documento por respuesta, los nombres libres
  sin guion largo, `controlesRedaccion` con las líneas de control y la
  verificación para el informe con su aviso de "sin comprobar".
  Verifica: la parte 2 de `guard:trazabilidad` (`[CONFIRMA H##]`, la clave de
  los P#, ninguna sección vacía en los cuatro casos, marcas quitadas y
  declaradas); igualdad con el informe armado por TypeScript con las mismas
  entradas.
  Depende de: T5, T6, T7. Tamaño: M.

- [ ] **T9. La puerta del motor: pregunta e investigación.**
  Acepta: con los puertos falsos, se puede abrir una ronda (semilla y
  condición de cargados), registrar intentos y registrar capturas: umbral de
  20, corta < 300, citas derivadas, aviso de prompts y errores de captura
  como hechos. También se puede declarar la pregunta y restaurar la ronda
  activa.
  Verifica: una corrida simulada con nueve lecturas sembradas deja en el
  registro los hechos esperados, contados.
  Depende de: T2, T7. Tamaño: M.

- [ ] **T10. La puerta del motor: operación y roles.**
  Acepta: el motor arma la operación de un panel (archivo o pegado) y escribe
  el sello la primera vez; después compara y se niega si hay discrepancia.
  Registra las capturas de operación con hallazgos, arma los prompts del
  integrador, el verificador y el redactor, maneja las recapturas, la ronda
  nueva con respuestas copiadas y la reutilización de una operación.
  Verifica: las corridas simuladas del BLUEPRINT (7 cuerpos y 7 sellos; kimi
  reutilizado y chatgpt rechazado; informe vacío más una recaptura dan 2
  hechos y gana el último).
  Depende de: T4, T5, T9. Tamaño: M.

- [ ] **T11. La puerta del motor: URLs, informe y paso siguiente.**
  Acepta: la comprobación de URLs se hace con el puerto HTTP; la carpeta del
  informe se escribe con el puerto PDF; y el motor responde el paso siguiente
  y el estado de cada panel.
  Verifica: URLs 200, 404, `.invalid`, HEAD rechazado, timeout y una segunda
  llamada sin red; carpeta con un fallo sembrado en la cuarta respuesta (las
  demás se escriben y FALTAN las nombra); el paso siguiente en cada etapa de
  una ronda simulada completa.
  Depende de: T8, T10. Tamaño: M.

- [ ] **T12. Script de página: escritura y lectura.**
  Acepta: el port en TypeScript de escribir, esperar a que asiente, leer el
  compositor, chat vacío y leer la respuesta (exclude, HTML, canvas, archivos,
  enlaces, etiqueta y aviso de iframe), con el contrato de pedido y consulta.
  Verifica: `tsc` sin errores; una búsqueda en el JS compilado no encuentra
  `document.cookie`, `localStorage`, `sessionStorage` ni código de envío. La
  prueba de comportamiento llega en T16, por la autoprueba del panel.
  Depende de: T5. Tamaño: M.

- [ ] **T13. Script de página: generación, diagnóstico y adjunto.**
  Acepta: el estado de generación en el tiempo, el diagnóstico de selectores
  de solo lectura y la búsqueda del `<input type=file>`.
  Verifica: igual que T12.
  Depende de: T12. Tamaño: S.

**Control de la etapa 3:** `dotnet test` en verde con el conteo pegado,
`tsc` limpio, informe de etapa, y push a `main`.

### Etapa 4 — Unity y los paneles nativos

- [ ] **T14. Entorno y proyecto.**
  Acepta:
  - Instalados el Editor de Unity 6 LTS (versión más reciente) con los
    módulos de Android, y Visual Studio Build Tools con C++.
  - Juan activó la licencia Personal en Unity Hub.
  - Proyecto creado con `unity:new-unity-project`, paquetes mínimos con
    `unity:unity-package-management`, y el motor compila dentro de Unity.

  Verifica: `unity editors --installed`; la compilación del proyecto en
  batchmode sin errores; las pruebas del motor corren en el Editor.
  Depende de: T11. Tamaño: S. **Necesita a Juan**: aceptar las dos ventanas
  de permisos de Windows y activar la licencia.

- [ ] **T15. Panel Windows I: crear, mostrar, ejecutar.**
  Acepta: el plugin de WebView2 crea un panel con su perfil en un rectángulo,
  lo pone al frente o detrás, ejecuta el script con pedido y consulta, cuenta
  navegaciones, bloquea `/logout` y aplica los argumentos de no limitación.
  Verifica: en el `.exe` compilado, la autoprueba con la página de textarea y
  la de `/logout` sale en verde (archivo de resultados pegado).
  Depende de: T12, T14. Tamaño: M.

- [ ] **T16. Panel Windows II: el resto de la autoprueba.**
  Acepta: ventana emergente en el mismo perfil con `opener`, aislamiento entre
  dos perfiles de prueba, adjunto por DevTools, PDF, script en un iframe de
  otro origen, borrado del perfil y techo externo.
  Verifica: la autoprueba completa de la especificación (punto 2) en el
  `.exe` compilado, tres corridas, con su tasa.
  Depende de: T13, T15. Tamaño: M.

- [ ] **T17. Panel Android.**
  Acepta: el plugin Java con perfiles, comprobación de `MULTI_PROFILE`,
  apilado visible, ejecución del script, bloqueo de `/logout`, ventana
  emergente con `opener`, adjunto por el selector de archivos del sistema,
  PDF y script de inicio de documento para el iframe.
  Verifica: la misma autoprueba en un emulador Android, si este equipo puede
  correrlo (necesita aceleración por hipervisor); si no, el `.apk` compila y
  la autoprueba queda **sin medir**, dicho así.
  Depende de: T16. Tamaño: M.

**Control de la etapa 4:** las autopruebas medidas, los dos binarios
compilados en este PC, informe y push.

### Etapa 5 — Interfaz

- [ ] **T18. Dirección de diseño y tokens.**
  Acepta: el trabajo con `impeccable`, `make-interfaces-feel-better` y
  `ecc:accessibility` produce una dirección de diseño escrita (incluida la
  dirección estética del BLUEPRINT §2), los tokens en una hoja USS, la
  estructura de cuatro zonas y el vocabulario de estados.
  Verifica: capturas del esqueleto a 1366×768 y a 390×844.
  Depende de: T14. Tamaño: M.

- [ ] **T19. Configuración y arranque.**
  Acepta: la primera pantalla con proveedores y roles y sus reglas, que se
  aplica al reabrir, y la restauración de la ronda activa.
  Verifica: en la app compilada, las combinaciones inválidas se rechazan con
  su texto; el archivo de selección queda escrito y se aplica al reabrir.
  Depende de: T11, T16, T18. Tamaño: M.

- [ ] **T20. Pregunta e investigación conectadas.**
  Acepta: pegar en los 7, pegar en este panel, el aviso de capacidades, el
  indicador de cada panel, "Capturar los que terminaron", capturar este panel
  y declarar la pregunta.
  Verifica: en la app compilada, con páginas de prueba en lugar de
  proveedores (modo autoprueba), el recorrido de las dos etapas deja los
  hechos esperados en un registro temporal.
  Depende de: T19. Tamaño: M.

- [ ] **T21. Operación conectada.**
  Acepta: el chat nuevo con comprobación, la vía de archivo predeterminada y
  la de pegado como opción, el aviso de una vez por ronda, la reutilización
  de una operación y la ronda nueva con respuestas copiadas.
  Verifica: igual que T20, sobre la etapa de operación.
  Depende de: T20. Tamaño: M.

- [ ] **T22. Roles e informe conectados.**
  Acepta: integrador, verificador y redactor (con el adjunto), las
  recapturas, mostrar u ocultar los paneles de los roles, la comprobación de
  URLs y la carpeta del informe que se abre al terminar.
  Verifica: igual que T20 hasta el informe en disco, con su `.md` y su
  `.pdf`.
  Depende de: T21. Tamaño: M.

- [ ] **T23. Menú secundario, teléfono y accesibilidad.**
  Acepta: recargar, cerrar sesión del panel y diagnóstico; el diseño del
  teléfono; una revisión de accesibilidad (contraste, foco, objetivos
  táctiles) con sus defectos corregidos.
  Verifica: capturas de PC y de teléfono y la lista de chequeo de
  accesibilidad con cada punto medido.
  Depende de: T22. Tamaño: M.

**Control de la etapa 5:** capturas, recorrido completo en modo autoprueba,
informe y push.

### Etapa 6 — Pruebas y revisión

- [ ] **T24. Revisión y simplificación.**
  Acepta: revisión de código con `agent-skills:review` y
  `mattpocock-skills:code-review`, simplificación con
  `agent-skills:code-simplify`, y cada hallazgo corregido o explicado.
  Verifica: todas las pruebas y autopruebas otra vez en verde, con
  `superpowers:verification-before-completion`.
  Depende de: T23. Tamaño: M.

### Entrega

- [ ] **T25. Compilación en la nube y Release.**
  Acepta: el flujo de GitHub Actions compila Windows y Android, arma el
  instalador, firma el `.apk` con la llave fija y publica
  `chatcouncil-unity-v1`. La llave tiene su respaldo fuera del repositorio.
  Verifica: la corrida de Actions en verde y los dos binarios descargables
  del Release.
  Depende de: T24. Tamaño: M. **Necesita a Juan**: cargar los tres secretos
  de Unity y el de la llave, con instrucciones paso a paso.

- [ ] **T26. Instrucciones y registro.**
  Acepta: las instrucciones para Juan (descargar, instalar y abrir cada uno,
  sin terminal ni git) y la sección de la Fase 6 en `docs/BLUEPRINT.md`, con
  las decisiones y lo que quedó abierto.
  Verifica: las instrucciones siguen paso a paso el Release real.
  Depende de: T25. Tamaño: S.

### Etapa 7 — Handoff

Cada vez que la sesión se llene, Juan corre `/mattpocock-skills:handoff`
(la skill sólo la puede activar él) y la sesión siguiente retoma desde la
primera tarea sin marcar.

## Risks and Mitigations

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Los selectores no coinciden en los sitios móviles (Android) | Alto | Diagnóstico de selectores (Q8) en la prueba en vivo; no se puede medir antes. |
| Paneles de atrás en Android limitados por el sistema | Medio | Apilado visible en vez de ocultar; se mide en la prueba en vivo. |
| Las expresiones regulares de .NET no se comportan como las de JS | Medio | Igualdad contra las referencias de TypeScript en cada parseo. |
| La ventana nativa de WebView2 encima de la de Unity (foco, redimensionado, DPI) | Medio | T15 lo mide en el `.exe` antes de construir la interfaz encima. |
| Sin emulador Android en este equipo | Medio | Se intenta en T17; si no se puede, se dice "sin medir" y queda para la prueba en vivo. |
| Gradle o el NDK con la ruta con tilde | Medio | Unidad virtual sin tildes para compilar en local; la nube no lo necesita. |
| Licencia de Unity en GitHub Actions | Medio | Secretos con instrucciones; mientras tanto se compila en este PC. |
| Memoria con 7 a 9 paneles en el teléfono | Medio | Los paneles de los roles se cargan en su etapa; se mide en la prueba en vivo. |

## Open Questions

Ninguna bloquea el inicio. Lo que necesita a Juan está marcado en T14 y en
T25.
