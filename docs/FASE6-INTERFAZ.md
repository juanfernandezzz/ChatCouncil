# Fase 6 — La interfaz: inventario, arquitectura y boceto evaluado (T18, partes 1 a 4)

Escrito el 2026-10-10. Es la base de T19 a T23. Cada decisión tiene un número (D1, D2…). Su
criterio y su fuente están en `docs/BLUEPRINT.md`, sección Fase 6, "Decisiones de interfaz
(T18)". Aquí se describe qué se decidió y se muestra el trabajo que la respalda. La parte 5
(dirección visual y tokens) queda para la segunda mitad de T18.

Lo que la interfaz no puede cambiar está en la spec ("La interfaz", "Lo que se exige") y en
`PRODUCT.md`. Este documento no lo repite.

## 1. Inventario de tareas

Una ronda con un consejo de 7 operadores. "Frecuencia" es cuántas veces ocurre por ronda en el
camino normal; "momento" es la etapa. Las acciones que se hacen dentro de la página del
proveedor (enviar, activar la búsqueda web, abrir las fuentes) no son de la app, pero se cuentan
porque son la mayor parte del trabajo.

### 1.1 Acciones de la `Puerta` del motor y de los paneles

| Tarea | Origen | Frecuencia por ronda | Momento |
|---|---|---|---|
| Ver el paso siguiente y la etapa | `PasoSiguiente` | continua | todas |
| Ver el estado de cada panel | `EstadoDePanel` | continua (7 a 9 paneles) | todas |
| **Cambiar de panel** | panel | **14 a 21** (uno por envío en 3 etapas) | Pregunta, Investigación, Operación |
| Escribir la pregunta | interfaz | 1 | Pregunta |
| Pegar la pregunta en los paneles (abre la ronda) | `AbrirRonda`, `RegistrarIntentos` | 1 | Pregunta |
| Enviar en cada panel | página | 7 + 7 + 3 = 17 | Pregunta, Operación, roles |
| Activar la búsqueda web | página | 7 + 1 | Pregunta, Verificación |
| Abrir el panel de fuentes antes de capturar | página | 7 | Investigación |
| Capturar los que terminaron | `RegistrarCapturas` | 2 a 6 (a medida que terminan) | Investigación, Operación, roles |
| Declarar la pregunta | `DeclararPregunta` | 0 (solo si se capturó sin pegar) | Investigación |
| Pegar la operación en los paneles | `ArmarOperacion`, `OperacionPegada` | 1 | Operación |
| Pegar el prompt del integrador | `ArmarPromptIntegrador`, `IntegradorPegado` | 1 | Integración |
| Pegar el prompt del verificador | `ArmarPromptVerificador`, `VerificadorPegado` | 1 | Verificación |
| Pegar el prompt y el archivo del redactor | `ArmarRedactor`, `RedactorPegado` | 1 | Redacción |
| Comprobar URLs y armar el informe | `ComprobarUrls`, `ArmarInforme` | 1 | Informe |
| Pegar en un solo panel | panel | 0 a 2 (reintento) | Pregunta, Operación |
| Capturar un solo panel | `RegistrarCapturas` (uno) | 0 a 2 (reintento) | Investigación, Operación, roles |
| Recapturar integrador o verificador | `Recapturar` | 0 (corrección) | después de su etapa |
| Usar la operación anterior | `ReutilizarOperacion` | 0 (ahorro) | Operación |
| Ronda nueva con respuestas copiadas | `RondaNuevaConRespuestasCopiadas` | 0 (corrección) | después de Investigación |
| Mostrar u ocultar los paneles de los roles | panel | 0 a 2 | cualquiera |
| Recargar un panel | panel | 0 a 1 | cualquiera |
| Diagnóstico de selectores | `pagina.js` (`diagnostico`) | 0 (cuando falla un panel) | cualquiera |
| Cerrar la sesión de un panel | panel | ~0 (cambio de cuenta) | fuera de la ronda |
| Restaurar la ronda activa | `RestaurarRondaActiva` | 1 (al abrir) | arranque |

### 1.2 Historias de usuario que piden interfaz

Las historias 4 a 24 y 29, 34, 40, 50, 51, 58, 59, 67, 72 y 74 (spec, "User Stories") piden un
lugar o un comportamiento en la interfaz. Todas quedan cubiertas en la sección 3 (columna
"Historias" de la tabla 3.4). Las demás las cumple el motor o el panel, sin interfaz propia.

### 1.3 El inventario candidato

| Capacidad | Frecuencia | Momento |
|---|---|---|
| Primer arranque guiado | 1 en la vida de la instalación | primer arranque |
| Configuración alcanzable | ~0 por ronda | entre rondas |
| Historial de rondas | 0 a 1 por ronda | entre rondas |
| Abandonar la ronda en curso | ~0 (salida de emergencia) | cualquiera |
| Ayuda | alta en las primeras rondas, ~0 después | cualquiera |
| Respaldo y ubicación de los datos | ~0 | entre rondas |
| Acerca de, versión y aviso de versión nueva | ~0 | entre rondas |
| Tema y tamaño de texto | 1 al configurar | entre rondas |
| Exportar el diagnóstico | ~0 (al reportar un problema) | cuando falla un panel |

**Lo que muestra el inventario:** la tarea más frecuente de la app es **cambiar de panel** (14 a
21 veces por ronda), seguida del **paso siguiente** (unas 12). Todo lo que no es la ronda ocurre
cero o una vez por ronda. La arquitectura se ordena por esa frecuencia (D1).

## 2. Decisión sobre el inventario candidato

| Capacidad | Decisión | Dónde entra |
|---|---|---|
| Primer arranque guiado: elegir el consejo y entrar a cada cuenta, con el estado de sesión a la vista | **Aceptada (D10).** El estado de sesión se deduce de la página (el compositor está o no), sin leer cookies | T19 |
| Configuración alcanzable en cualquier momento | **Aceptada (D11).** Los cambios del consejo se aplican al reabrir (historia 7) | T19 |
| Historial de rondas, abrir un informe o su carpeta | **Aceptada (D12),** en su forma mínima: lista de rondas de este aparato con fecha, pregunta, etapa alcanzada y su informe | T23 |
| Abandonar la ronda y empezar una limpia | **Aceptada (D13),** sin cambiar el esquema: vuelve a la etapa Pregunta; la ronda abandonada queda en el registro. **Límite:** si la app se cierra antes de pegar la pregunta nueva, al reabrir vuelve la abandonada | T20 |
| Ayuda: el método, cada etapa, los atajos | **Aceptada (D14)** | T23 |
| Respaldo y ubicación de los datos | **Aceptada en parte (D15):** se muestra dónde está la carpeta de datos y cómo copiarla. **Rechazado** el respaldo automático | T19 (ubicación) |
| Acerca de, versión y aviso de versión nueva | **Aceptada en parte (D16):** versión, licencias y un enlace a la página de versiones. **Rechazado** el aviso automático | T23 |
| Tema claro, oscuro o el del sistema, y tamaño de texto | **Aceptada (D17).** El tamaño de texto lo exige igual WCAG 1.4.4 | parte 5 y T23 |
| Exportar el diagnóstico | **Aceptada (D18):** el diagnóstico ya escribe un archivo; se agrega abrir su carpeta o compartirlo | T23 |

Ninguna capacidad necesita una tarea nueva: todas caben en T19, T20 y T23.

## 3. Arquitectura de información

### 3.1 Secciones (D2)

Cuatro secciones, en este orden:

1. **Ronda.** Es la de inicio y la única de uso continuo.
2. **Rondas anteriores** (D12).
3. **Configuración:** consejo y roles, apariencia (tema y texto) y datos.
4. **Ayuda:** el método, las etapas, los atajos, y Acerca de.

### 3.2 Navegación entre secciones (D3)

Una sola interfaz, que se acomoda por ancho de ventana con las clases de Material 3 (en Windows,
en píxeles efectivos):

| Clase | Ancho | Navegación | Pantalla de Ronda |
|---|---|---|---|
| Expandida | 840 o más | **riel** de cuatro destinos a la izquierda | **ancha** |
| Mediana | 600 a 839 | **riel** | **angosta** |
| Compacta | menos de 600 | **botón de menú** en la barra superior, que abre un **cajón modal** | **angosta** |

En la clase compacta, la guía de Android propone una barra inferior. Se elige el cajón modal,
que es lo que hace Fluent (`LeftMinimal`) por debajo de 641 px. Hay una contradicción de fuentes
y se resuelve por la frecuencia del inventario; ver D3 en el BLUEPRINT.

### 3.3 La pantalla de Ronda

**Ancha (D4)**, boceto en `docs/evidencia/fase6/T18/boceto-pc-1366x768.png`:

- **Arriba, la guía** de toda la pantalla de trabajo:
  - las siete etapas, con hechas, actual y pendientes;
  - un solo botón primario con el paso que da el motor;
  - la frase de lo que hace la persona a mano en esa etapa;
  - los contadores (enviados, parecen terminados, capturados);
  - "Siguiente por enviar";
  - el menú "Ronda".
- **Izquierda, la lista de paneles:** operadores y, desde su etapa, roles. Cada fila lleva
  símbolo, color y palabra; el panel visible está marcado.
- **Centro, el panel:**
  - una cabecera con el nombre, el estado y, si hay un problema, qué pasó y qué hacer (D9);
  - la acción de un solo panel que corresponde (D6);
  - un menú "⋯" del panel;
  - debajo, la página real.

**Angosta (D5)**, boceto en `docs/evidencia/fase6/T18/boceto-telefono-390x844.png`:

- **Barra superior:**
  - menú de secciones (solo en la clase compacta);
  - la etapa como título ("Operación · etapa 3 de 7");
  - un menú "⋯" con dos grupos: este panel y la ronda.
- **Una barra de progreso** de siete segmentos.
- **La página real**, con el mayor alto posible.
- **Abajo, la guía:**
  - el selector de panel ‹ › con el estado del panel visible y su posición ("2 de 7");
  - el botón primario;
  - los contadores;
  - "Qué hago yo ahora" (la frase de la etapa);
  - "Ver todos los paneles" (la lista con el estado de cada uno).

### 3.4 Dónde va cada acción (D6, D7)

| Acción | Ancha | Angosta | Jerarquía | Historias |
|---|---|---|---|---|
| Paso siguiente del motor | botón primario de la guía | botón primario abajo | **primaria** | 14, 15 |
| Cambiar de panel | lista de paneles | ‹ › y "Ver todos los paneles" | **frecuente, siempre visible** | 18, 23 |
| Siguiente por enviar | botón de la guía | el selector empieza por el primero que falta | frecuente | 25 |
| Qué hago yo ahora | frase visible en la guía | frase visible al entrar en cada etapa; después, a un toque | guía | 16 |
| Pegar en este panel / capturar este panel | cabecera del panel, **solo cuando corresponde** (D6) | menú ⋯, grupo "Este panel" | secundaria | 29, 34 |
| Recargar, diagnóstico, cerrar la sesión | menú ⋯ del panel | menú ⋯, grupo "Este panel" | emergencia | 12, 72, 74 |
| Recapturar integrador o verificador, usar la operación anterior, ronda nueva con respuestas copiadas, mostrar u ocultar los roles, abandonar la ronda, declarar la pregunta | menú "Ronda" | menú ⋯, grupo "Ronda" | emergencia, separadas del camino (historia 21) | 21, 40, 50, 51, 58, 59 |
| Avisos antes de un paso | diálogo (la página se aparta) | pantalla completa | interrupción justificada | 20, 48 |
| Errores | en la cabecera del panel o en el aviso del paso, con detalle técnico plegado | igual | — | 19 |
| Configuración, rondas anteriores, ayuda | riel | riel o cajón | sección | 7 y capacidades |

### 3.5 Botones fuera de su etapa (D7)

- **No hay una fila de botones por etapa.** El único botón del flujo es el paso que da el motor,
  así que no hay botones de otra etapa que bloquear.
- Una acción **imposible por datos** (la operación sin las siete respuestas, la verificación
  sin el informe del integrador, la operación anterior cuando no hay copias sin cambios) se
  muestra **deshabilitada con su motivo**, no oculta.
- Una acción **posible fuera de su etapa** (recapturar el integrador después de su etapa) se
  queda habilitada en el menú de la ronda.

### 3.6 Atajos de teclado en el PC (D8)

- Una tecla para el paso siguiente y otra para cambiar de panel. **Nunca** combinaciones que la
  página del proveedor use para enviar (Enter, Ctrl+Enter).
- Una tecla para pasar el foco entre la guía, la lista y el panel (F4 y F5 desde la D49 rehecha).
- Las teclas exactas se fijan en T23, contra los atajos de los nueve sitios.

## 4. Evaluación del boceto antes de construir

### 4.1 Evaluación heurística

Las 10 heurísticas de Nielsen, con su escala de severidad: 0, no es un problema; 1, cosmético;
2, menor; 3, mayor; 4, catástrofe. Evaluador: el agente, sobre las dos capturas del boceto. Un
solo evaluador encuentra una parte de los problemas (Nielsen recomienda de 3 a 5): **la
repetición sobre la app compilada en T23 es obligatoria**.

| # | Heurística | Hallazgo | Sev. | Qué se hace |
|---|---|---|---|---|
| H1 | 6. Reconocer antes que recordar | En el teléfono, la frase de lo que hace la persona ("activa la búsqueda web…") queda detrás de un enlace. Es el olvido que la spec quiere evitar | **3** | **Corregido en el diseño:** la frase se muestra al entrar en cada etapa y se pliega a pedido (3.4) |
| H2 | 5. Prevención de errores | "Pegar operación aquí" visible con el panel ya respondiendo invita a pegar dos veces | **3** | **Corregido:** la acción de un panel solo aparece cuando su estado lo permite (por pegar o con problema), D6 |
| H3 | 9. Reconocer, diagnosticar y recuperarse de errores | "Con problema" en la lista no dice qué pasó ni qué hacer | **3** | **Corregido:** la cabecera del panel lleva la frase del problema y su acción; el detalle técnico, plegado (D9) |
| H4 | 1. Visibilidad del estado del sistema | En el teléfono solo se ve el estado del panel visible | 2 | Se acepta: los contadores resumen los siete y "Ver todos los paneles" está a un toque. Se mide en T23 |
| H5 | 4. Consistencia y estándares | En el teléfono, ‹ va al anterior en orden y › al siguiente por enviar: dos reglas en un mismo control | 2 | **Corregido:** ‹ y › van en orden; "siguiente por enviar" queda en el PC, y en el teléfono el selector empieza por el primero que falta |
| H6 | 4. Consistencia y estándares | En el PC, las siete etapas parecen botones y no lo son (el motor decide el paso) | 2 | Parte 5: se dibujan como indicador de progreso, sin forma de botón |
| H7 | Spec, historia 23 | En el teléfono la página ocupa el 72 % del alto (608 de 844 px), no "casi la pantalla completa" | 2 | Se acepta por ahora: la guía abajo es lo que exige la historia 15. En T23 se mide si la guía puede plegarse a una línea |
| H8 | 7. Flexibilidad y eficiencia | No hay atajos de teclado | 2 | D8 |
| H9 | 8. Diseño estético y minimalista | La cabecera del panel del PC lleva tres controles; con D6 queda en uno o ninguno | 1 | Ya resuelto por D6 |
| H10 | 3. Control y libertad | No había salida de emergencia de la ronda | 2 | Abandonar la ronda, D13, en el menú "Ronda" |
| H11 | 10. Ayuda y documentación | Sin sección de ayuda | 2 | D14 |
| H12 | 2. Coincidencia con el mundo real | "Operadores" y "roles" son palabras del método, no de la persona | 1 | Parte 5 y T23: textos finales con la palabra de la persona y la del método en la ayuda |

**Severidad 3 y 4: tres hallazgos de severidad 3, los tres corregidos en el diseño antes de
construir. Ninguno de severidad 4.** Las capturas del boceto son de antes de las correcciones;
las correcciones son de comportamiento (qué se muestra y cuándo) y se verán en la app compilada.

### 4.2 Recorrido cognitivo de una ronda completa

Método de Wharton, Rieman, Lewis y Polson (1994). En cada paso se responden cuatro preguntas: si
la persona intentará lograr el efecto correcto; si notará que la acción correcta está
disponible; si la asociará con el efecto; y si verá el progreso.

**Cómo se cuenta:** una ronda de 7 operadores, en el camino normal, una sola vez por etapa (sin
reintentos).
- **Acción de app:** un clic o toque en ChatCouncil.
- **Cambio de panel:** traer otro proveedor al frente.
- **Acción de página:** dentro del sitio del proveedor (enviar, activar la búsqueda web, abrir
  un chat nuevo, adjuntar).
- **Decisión sin guía:** elegir el control siguiente entre varios del mismo peso, de memoria.

La línea de base es la barra de Electron (`apps/desktop/src/renderer/index.html`): botones del
mismo peso; la operación, panel por panel, con el chat nuevo abierto a mano; el archivo del
redactor descargado y adjuntado a mano.

| Etapa | Electron: app / cambios / página / decisiones | Nueva: app / cambios / página / decisiones | Qué cambia |
|---|---|---|---|
| Pregunta | 3 / 7 / 14 / 1 | 3 / 6 / 14 / 0 | escribir, pegar, aviso; enviar y activar la búsqueda en cada uno siguen a mano |
| Investigación | 1 / 7 / 7 / 1 | 1 / 6 / 7 / 0 | abrir las fuentes y capturar |
| Operación | 9 / 7 / 14 / 8 | 3 / 6 / 7 / 0 | la app abre los chats nuevos y adjunta: desaparecen 7 pegados y 7 chats a mano, y la decisión riesgosa de acordarse del chat nuevo |
| Integración | 2 / 0 / 2 / 1 | 2 / 0 / 1 / 0 | la app abre el chat nuevo |
| Verificación | 2 / 0 / 3 / 1 | 2 / 0 / 2 / 0 | ídem |
| Redacción | 2 / 0 / 4 / 1 | 2 / 0 / 1 / 0 | la app adjunta el archivo |
| Informe | 1 / 0 / 0 / 1 | 1 / 0 / 0 / 0 | |
| **Total** | **20 / 21 / 44 / 14 = 85 acciones y 14 decisiones** | **14 / 18 / 32 / 0 = 64 acciones y 0 decisiones** | **−21 acciones (−25 %) y −14 decisiones** |

Las "más de treinta acciones" de la spec cuentan lo que no es enviar ni cambiar de panel. Con
esa regla: **Electron 47** (20 de app y 27 de página sin los 17 envíos); **la nueva 29** (14 de
app y 15 de página).

**Dónde el recorrido encontró riesgo (pregunta 2, "¿notará la acción?"):**
- Pregunta y Verificación: activar la búsqueda web es una acción en la página que la app no
  puede hacer ni ver. La cubre solo la frase de la etapa (H1). Riesgo que queda: se puede
  olvidar igual. **Se mide en T23** con una ronda en modo autoprueba.
- Investigación: abrir el panel de fuentes antes de capturar tampoco es visible para la app.
  Mismo tratamiento.
- Operación: con el archivo adjunto, la persona tiene que comprobar que quedó en el compositor
  antes de enviar. La app comprueba la integridad en la vía de pegado, pero no ve el adjunto en
  la página. Está en la frase de la etapa.

**Lo que no cubre este recorrido:** reintentos, paneles con problema, el primer arranque (T19)
y el tiempo de cada acción.

## 5. Para T19 a T23

- T19: D10, D11, D15 (primer arranque, configuración, ubicación de los datos).
- T20: D13 (abandonar la ronda) y la guía angosta con la frase visible al entrar en la etapa (H1).
- T20 a T22: D4 a D7 y D9 en cada etapa.
- T23: D8 (atajos), D12, D14, D16, D17, D18, y repetir la evaluación (H4, H7 y H12 quedan para
  medir ahí).

## 6. Dirección visual y tokens (T18, parte 5)

Escrito el 2026-10-10. Decisiones D20 a D27 en el BLUEPRINT.

### 6.1 Cómo se decidió

- **La escena:** profesionales en sesiones largas, de día y de noche, en el PC y en el
  teléfono. Lo que leen es la página del proveedor, que sigue el tema del sistema. La app es
  el marco: tiene que dejar ver la página y decir el estado sin competir con ella.
- **Sin votación de estética.** La skill `impeccable` propone tirar direcciones visuales al
  azar para que Juan elija una. La spec ("La interfaz") y la regla de Juan del 2026-10-06
  dicen que la estética no sale de su gusto sino de criterios, así que ese paso **no se
  corrió**. Del resto de la skill se aplicaron el modo "Operate" y su piso de calidad.
- **Antecedentes de §2 del BLUEPRINT:** se tomó la calidez de los neutros ("ceniza, papel"),
  donde la evidencia no decide. No se tomó el tono "no claro" como predeterminado, porque la
  evidencia de polaridad lo contradice (D20). Tampoco la textura generada por código: no hay
  criterio que la pida en una herramienta de trabajo.

### 6.2 Tokens

`unity/Assets/Interfaz/Tokens.uss` es la única hoja de color, tipografía y espacio, con el
tema claro en `:root` y el oscuro en `.tema-oscuro`. Los componentes
(`unity/Assets/Interfaz/Interfaz.uss`) usan solo esos tokens.

### 6.3 Contraste, medido

`pnpm guard:contraste` mide los **68 pares en los dos temas** y corre en el CI. La tabla
completa, generada por el mismo gate, está en `docs/evidencia/fase6/T18/contraste.md`. Los
márgenes más justos:

| Par | Contraste | Mínimo |
|---|---|---|
| estado "por pegar" sobre la superficie 2, tema claro | 4,74:1 | 4,5:1 |
| foco sobre el botón de tinta, tema claro | 3,49:1 | 3:1 |
| foco sobre la superficie 2, tema claro | 3,50:1 | 3:1 |
| estado "capturado" sobre la superficie 2, tema claro | 5,17:1 | 4,5:1 |

El gate se vio fallar antes de pasar: el primer color de foco daba 2,88:1 contra el botón de
tinta en el tema claro y 2,93:1 en el oscuro. El color definitivo se calculó para quedar en
la franja que pasa contra los dos vecinos.

### 6.4 El esqueleto, construido y capturado

`unity/Assets/Interfaz/`: `Esqueleto.cs` arma la pantalla de Ronda de `Ronda.uxml`, con datos
de ejemplo, en el `.exe` de Windows (IL2CPP). `IconoEstado.cs` dibuja los seis estados. Las
capturas salen de la app compilada: con `-captura` dibuja la interfaz en una textura del tamaño
exacto en dp. Así no depende del monitor (esta notebook no deja abrir una ventana de 844 px de
alto).

| Captura | Tamaño |
|---|---|
| `docs/evidencia/fase6/T18/esqueleto-pc-claro.png` | 1366 × 768 |
| `docs/evidencia/fase6/T18/esqueleto-pc-oscuro.png` | 1366 × 768 |
| `docs/evidencia/fase6/T18/esqueleto-telefono-claro.png` | 390 × 844 |
| `docs/evidencia/fase6/T18/esqueleto-telefono-oscuro.png` | 390 × 844 |

Lo que muestran:
- el estado de un panel con forma, color y palabra;
- la acción del panel solo cuando corresponde (Qwen, con problema, ofrece "Pegar operación
  aquí");
- el problema con qué hacer;
- las etapas como indicador de progreso, no como botones;
- en el teléfono, la frase de la etapa a la vista y las flechas en orden.

**Medido en las capturas:**
- Interlineado de 1,5: dos líneas de 16 px separadas 24 px.
- **Alto de la página del proveedor:** 67 % en el PC y **57 % en el teléfono**, en el caso
  más cargado (un panel con problema y la frase de la etapa visible). El boceto daba 72 % en
  el teléfono, antes de las correcciones H1 y D9.

**H7 sube de severidad 2 a 3:** mostrar la frase y el problema (H1, H3) le quita espacio a la
página, que la historia 23 quiere casi a pantalla completa. Para T20:
- la frase se pliega después de leerla, como ya dice §3.4;
- la línea del problema va dentro del selector.

Sin la frase ni la línea del problema, el cálculo da cerca del 67 %. **No está medido.**

### 6.5 Lo que no se hizo en esta parte

- **El revisor final de `impeccable` y el documento DESIGN.md no se corrieron.** Los tokens y
  las decisiones D20 a D27 ya registran el sistema; un DESIGN.md los duplicaría. La revisión
  heurística sobre la app compilada sigue en T23.
- Los íconos de las secciones y de los menús ("Menú", "Más…" son texto por ahora), el tema
  según el sistema operativo (hoy, `-tema oscuro`) y el tamaño de texto en la app: T23 (D17).
- La accesibilidad para lectores de pantalla en UI Toolkit: T23.

## 7. Configuración y arranque (T19)

`Esqueleto.cs` pasó a ser `Aplicacion.cs`: la app ya no muestra datos de ejemplo.
- **Sin archivo de selección:** una guía de dos pasos, el consejo y las cuentas, sin riel hasta
  "Ir a la ronda" (D29).
- **Con archivo:** la Ronda con ese consejo y la ronda activa del registro.
- **Ajustes** (`Configuracion.uxml`, `Configuracion.cs`):
  - el consejo y los roles, con las reglas de `Roles` y el aviso de que se aplican al reabrir
    (D11);
  - las cuentas, con la sesión deducida del compositor (D10, D30);
  - la carpeta de datos, con cómo copiarla (D15, D28).

Historial y Ayuda salen del riel hasta T23 (D31). Las hojas `Tokens.uss` e `Interfaz.uss` van
en el tema (`Tema.tss`), no en el UXML, para alcanzar los menús desplegables. El tema oscuro se
pone en la raíz del panel.

Capturas y resultados: `docs/evidencia/fase6/T19/` y `docs/evidencia/fase6/T19-resultados.md`.

## 8. Pregunta e Investigación conectadas (T20)

`PantallaRonda.cs` conecta la Ronda con la Puerta del motor y con las páginas de los operadores. Las
páginas van apiladas en el área de la página, con la del panel visible al frente.
- **Etapa Pregunta:** el campo de la pregunta en la guía (D32). «Pegar la pregunta en los paneles»
  muestra antes el aviso de capacidades, que se puede omitir en la sesión.
- **Etapa Investigación:**
  - el indicador de cada panel, por sondeo de la página;
  - «Capturar los que terminaron (N)»;
  - en la cabecera, la acción del panel según su estado (D6) y el problema con qué hacer (D9). En el
    teléfono, el problema es una línea corta dentro del selector (H7).
- **Menú de la Ronda:** capturar lo que ya está en los paneles (D34), declarar la pregunta y abandonar la
  ronda (D13). Los menús y los diálogos son propios y apartan las páginas (D33).
- **Teléfono:** la frase de la etapa está a la vista al entrar y se pliega con «Entendido» (H1).
  Medido: 61,4 % de alto para la página con la frase plegada, y 51,3 % con la frase a la vista.

Resultados y capturas: `docs/evidencia/fase6/T20-resultados.md` y `docs/evidencia/fase6/T20/`.

## 9. Operación conectada (T21)

- **«Pegar la operación en los paneles»** va de a un panel, con ese panel al frente. En cada uno, la
  app abre la conversación nueva y comprueba que quedó vacía; si no, no pega y la cabecera dice qué
  hacer (D36).
- **La vía de archivo es la predeterminada:** el prompt en el compositor y el cuerpo en un `.txt`
  adjunto. La de texto se elige en el aviso, que sale una vez por ronda, o en el menú del panel
  (D37).
- **Lo escrito se verifica** contra lo armado (D38).
- **En el menú del panel:** pegar aquí, como archivo o como texto; usar su operación anterior; y
  capturar este panel.
- **En el menú de la Ronda:** ronda nueva con las respuestas copiadas.

Resultados y capturas: `docs/evidencia/fase6/T21-resultados.md` y `docs/evidencia/fase6/T21/`.


## 10. Roles e informe conectados (T22)

- **Los roles** abren su página en su etapa, en una conversación nueva comprobada vacía, y entran en
  el recorrido; en una ronda nueva salen (D42, D43).
- **El informe** se arma en .md y PDF Carta con pie numerado, y al terminar se abre su carpeta
  (D40, D41, D47).

Resultados y capturas: `docs/evidencia/fase6/T22-resultados.md` y `docs/evidencia/fase6/T22/`.

## 11. Secciones, mantenimiento, teclado y accesibilidad (T23)

- **Secciones:** Ronda, Historial, Ajustes y Ayuda (D48). Apariencia en Ajustes (D51). Recargar,
  diagnóstico y cerrar la sesión en «Más…» de cada panel (D52).
- **Teclado:** F1 a F5 para una mano, y Ctrl+Tab como alias (D49). **Lector de pantalla:** Lector.cs (D50).

### 11.1 Lista de chequeo WCAG 2.2 AA, medida en la app compilada de Windows

Cómo se midió: **P** = comprobación de `PruebaRonda` en el `.exe`; **U** = el árbol de UI
Automation que lee Narrador, leído por PowerShell; **C** = captura; **G** = `pnpm guard:contraste`.
Android no se compiló en T23: nada de esta lista se midió allí.

| Criterio | Resultado | Cómo |
|---|---|---|
| 1.1.1 Contenido no textual | Cumple. El ícono de estado va siempre con la palabra, y el lector nombra la fila con el proveedor y su estado | U |
| 1.3.1 Información y relaciones | Cumple desde T23. Los títulos son encabezados para el lector y la etapa actual se dice con palabras («3 Operación, etapa actual»); antes solo la barra la marcaba | U |
| 1.3.2 Secuencia con significado | Cumple. El lector recorre en el orden del documento, que es el visual | U |
| 1.4.1 Uso del color | Cumple. Cada estado lleva forma y palabra (D21) | C |
| 1.4.3 y 1.4.11 Contraste | Cumple. 68 pares de tokens en los dos temas | G |
| 1.4.4 Cambiar el tamaño del texto | Cumple. Al 200 % la interfaz mide la mitad en dp (1024 → 512) y pasa a la clase angosta sin perder controles | P, C |
| 1.4.10 Reflujo | Cumple desde T23. A 320 dp se cortaban «Más…» y el «de 7» del selector (D54) | C |
| 2.1.1 Teclado | Cumple desde T23. La página del proveedor se alcanza con F4 y F5, y la lista de paneles se usa con Enter (medido); los demás controles son botones, campos y casillas de UI Toolkit, que se alcanzan con Tab por construcción (ver 2.4.3) | P (en parte) |
| 2.1.2 Sin trampa de teclado | Cumple desde T23. Con teclas reales, F1 a F5 y el Tab que sale de la página devuelven el foco a la app (T24; antes, F6 con la mutación de T23). Android: cableado, sin medir | P |
| 2.1.4 Atajos de una tecla de carácter | Cumple. Los atajos son teclas de función y Ctrl+Tab | — |
| 2.4.3 Orden del foco | Por construcción, es el orden del documento. Se midió el orden de las regiones con F4 y F5; el Tab no se recorrió elemento por elemento | P (en parte) |
| 2.4.6 Encabezados y etiquetas | Cumple. Cada sección y bloque lleva su título, y cada campo su etiqueta | C, U |
| 2.4.7 Foco visible | Cumple desde T23. Botón, campo, casilla y desplegable muestran el borde con el token de foco; antes el tema de Unity lo pintaba con #006AA6, bajo 3:1 en el tema oscuro (D53) | P |
| 2.4.11 Foco no tapado | Cumple. Los menús y diálogos apartan la página nativa (D33) y el foco de Unity nunca queda debajo de ella | P |
| 2.5.3 Etiqueta en el nombre | Cumple. El nombre de cada botón es su texto visible | U |
| 2.5.7 Movimientos de arrastre | No hay arrastres | — |
| 2.5.8 Tamaño del objetivo | Cumple. Todos los controles de las cuatro secciones miden 48 dp o más (D19) | P |
| 3.1.1 Idioma de la página | **No se puede declarar:** la jerarquía de accesibilidad de Unity no tiene un campo de idioma. Narrador lee con la voz del sistema | — |
| 3.2.1 y 3.2.2 Al recibir el foco y al cambiar un valor | Cumple. El foco no cambia de contexto; el tema y el tamaño cambian el aspecto al elegirlos, que es lo que se pide (D51) | P |
| 3.3.1 y 3.3.2 Errores, etiquetas e instrucciones | Cumple. Cada problema dice qué pasó y qué hacer (D9) | P |
| 4.1.2 Nombre, función y valor | Cumple desde T23, medido por UI Automation: 25 elementos con su nombre y su función, y rectángulos en coordenadas de pantalla (D50). **No se probó con una persona usando Narrador ni con TalkBack** | U, P |
| 4.1.3 Mensajes de estado | Implementado: el resultado de cada paso se anuncia al lector. **No medido:** el anuncio no se puede leer desde UI Automation sin escuchar a Narrador | — |

### 11.2 Evaluación heurística repetida sobre la app compilada

Mismo método que §4.1: las 10 heurísticas de Nielsen, severidad de 0 a 4, un evaluador (el agente),
ahora sobre el `.exe` (las pruebas de T20 a T23 y las capturas de `docs/evidencia/fase6/T23/`).

| # | Heurística | Hallazgo | Sev. | Estado |
|---|---|---|---|---|
| H4 | 1. Visibilidad del estado | En el teléfono solo se ve el estado del panel visible; los contadores aparecen solo en Investigación | 2 | Se acepta: «Ver todos» lista el estado de cada uno a un toque |
| H7 | Historia 23 | En el teléfono la página ocupa el 56,2 % del alto con la frase de la etapa a la vista y el 66,9 % plegada (Operación); en Pregunta, el 40,9 %, por el campo de la pregunta | 2 | Se acepta: la frase se pliega con un toque y la pregunta solo está en su etapa |
| H12 | 2. Coincidencia con el mundo real | «Operadores» y «roles» eran palabras del método | 1 | **Corregido:** la lista dice «Proveedores», como Ajustes, y la Ayuda explica las palabras |
| N1 | 2.1.2 / 3. Control y libertad | Con el teclado no se salía de la página del proveedor | 4 | **Corregido** (D49), medido con teclas reales |
| N2 | 4.1.2 / 7. Flexibilidad | Las filas de la lista no se activaban con el teclado ni las veía el lector | 3 | **Corregido** (D54) |
| N3 | 1.4.10 | A 320 dp se cortaba «Más…» | 3 | **Corregido** (D54) |
| N4 | 2.4.7 / 1. Visibilidad | El foco en el tema oscuro quedaba bajo 3:1 | 3 | **Corregido** (D53) |
| N5 | Historia 23 | Al 200 % en una pantalla de 1366 × 768, a la página le queda una franja de unos 40 dp mientras la frase de la etapa está a la vista | 2 | Se acepta: con «Entendido» la frase se pliega; en pantallas más altas no pasa |
| N6 | 8. Diseño minimalista | En el teléfono, «Más…» junta los ítems del panel, los de mantenimiento y los de la ronda en una sola hoja larga | 1 | Se acepta: son de emergencia (D6) y van agrupados con su título |
| N7 | 7. Flexibilidad y eficiencia | Los atajos solo se aprenden en la Ayuda | 1 | Se acepta: la Ayuda está en el riel y en el cajón desde cualquier sección (desde T24 sin atajo, D49) |

**Severidad 3 y 4: cuatro hallazgos nuevos (N1 a N4), los cuatro corregidos y medidos en el `.exe`.
Ninguno queda abierto.** Un solo evaluador encuentra una parte de los problemas: la prueba con
personas, con Narrador y con TalkBack queda abierta (§11.1).

Resultados y capturas: `docs/evidencia/fase6/T23-resultados.md` y `docs/evidencia/fase6/T23/`.
