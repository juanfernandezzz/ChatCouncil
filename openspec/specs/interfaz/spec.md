# Interfaz

Propósito: mostrar la ronda por etapas con el estado de cada panel, dar navegación por secciones y teclado de una mano, y adaptar la pantalla a su ancho sin perder ninguna acción.

> Extraído de ChatCouncil-Unity (ChatCouncil-main, commit 247f6db) el 2026-11-07. Rutas relativas a ese repo.

## Requisitos

### IFZ-001 · Siete etapas y título de la barra
- Qué hace: la guía muestra las siete etapas «1 Pregunta» a «7 Informe»; la barra titula con el nombre de la etapa actual y su posición: nombres «Pregunta», «Investigación», «Operación», «Integración», «Verificación», «Redacción», «Informe».
- Condición y resultado observable: en investigación, la barra dice «Investigación · 2 de 7».
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:30-31 ; unity/Assets/Interfaz/PantallaRonda.cs:437 ; unity/Assets/Interfaz/Resources/Interfaz/Ronda.uxml:28-34
- Prueba: manual — 1. Con un perfil de prueba, pegar una pregunta. 2. Comprobar que la barra dice «Investigación · 2 de 7».
- Plataforma: ambas

### IFZ-002 · Palabra de estado de cada panel
- Qué hace: cada fila de la lista, la cabecera y el selector muestran el estado del panel con su símbolo y una de estas palabras: «Por pegar», «Pegado, falta que envíes», «Respondiendo», «Parece terminado», «Capturado», «Con problema».
- Condición y resultado observable: tras pegar sin enviar, la fila del panel dice «Pegado, falta que envíes».
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:34-43 ; unity/Assets/Interfaz/PantallaRonda.cs:463-471
- Prueba: manual — 1. Pegar la pregunta en un panel de prueba sin enviar. 2. Comprobar la palabra de la fila. 3. Enviar y comprobar «Respondiendo» y luego «Parece terminado».
- Plataforma: ambas

### IFZ-003 · Contadores de la investigación
- Qué hace: solo en investigación, muestra en ancho «Enviados {e} de {n} · Parecen terminados {t} · Capturados {c}» y en angosto «{e} de {n} enviados · {t} terminados»; en las demás etapas, vacío.
- Condición y resultado observable: con 7 investigadores y 2 enviados, la pantalla ancha dice «Enviados 2 de 7 · Parecen terminados 0 · Capturados 0».
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:458-460
- Prueba: manual — 1. Enviar en dos paneles de prueba. 2. Comprobar el contador en ventana ancha. 3. Angostar la ventana y comprobar la forma corta.
- Plataforma: ambas

### IFZ-004 · Filas de los roles
- Qué hace: un rol aparece en la lista solo mientras está en el recorrido; su fila dice «{función} · {palabra}» y el título de roles se oculta si no hay ninguno mostrado (D42).
- Condición y resultado observable: en investigación, los paneles de integrador, verificadores y redactor no ocupan la lista.
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:472-482
- Prueba: manual — 1. Abrir una ronda de prueba en investigación. 2. Comprobar que no hay filas de roles. 3. Llegar a integración y comprobar la fila «{función} · {palabra}» del integrador.
- Plataforma: ambas

### IFZ-005 · Cabecera y selector del panel visible
- Qué hace: la cabecera dice «{proveedor} · {palabra}» y agrega « · Zoom {z} %» solo si el zoom no es 100; el selector dice «{proveedor} · {palabra} · {i} de {n}»; la línea de problema aparece solo si hay problema; el botón de acción del panel se oculta sin acción y se deshabilita mientras la app está ocupada.
- Condición y resultado observable: con Ctrl + rueda a 125 %, la cabecera termina en « · Zoom 125 %»; al volver a 100 %, desaparece.
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:484-503
- Prueba: manual — 1. En un panel de prueba, cambiar el zoom con Ctrl + rueda. 2. Comprobar la cabecera. 3. Volver a 100 % y comprobar que el zoom no se muestra.
- Plataforma: ambas

### IFZ-006 · El paso imposible queda deshabilitado
- Qué hace: el botón principal de capturar en investigación u operación dice «{Texto} ({terminados})» y solo se habilita con al menos un panel terminado; capturar un rol se habilita solo si el rol está listo; las demás acciones quedan habilitadas (D7).
- Condición y resultado observable: en investigación sin paneles terminados, el botón de capturar se ve deshabilitado con «(0)».
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:507-516
- Prueba: manual — 1. Pegar la pregunta y enviar en un panel de prueba. 2. Antes de que termine, comprobar el botón deshabilitado. 3. Al terminar, comprobar «(1)» y habilitado.
- Plataforma: ambas

### IFZ-007 · Resultado anunciado al lector de pantalla
- Qué hace: el resultado de cada paso se muestra en las etiquetas de resultado ancha y angosta, marcado como problema si lo es, y se anuncia al lector de pantalla sin mover el foco (WCAG 4.1.3).
- Condición y resultado observable: con Narrador activo, tras pegar la pregunta se oye el mensaje del resultado y el foco no se mueve.
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:518-528
- Prueba: manual — 1. Activar Narrador. 2. Pegar la pregunta en un perfil de prueba. 3. Comprobar que se oye el resultado y el foco sigue en el botón.
- Plataforma: ambas

### IFZ-008 · Teclado de una mano F1 a F5
- Qué hace: en la Ronda sin capa abierta, F1 va al panel anterior, F2 al siguiente y F3 hace el paso; F4 y F5 van a la región siguiente y anterior en cualquier sección; con Alt la app no toma la tecla (Alt+F4 es del sistema) (D49).
- Condición y resultado observable: F2 cambia el selector a «… · 2 de {n}».
- Fuente: unity/Assets/Interfaz/Aplicacion.cs:435-448
- Prueba: manual — 1. Abrir una ronda de prueba. 2. Pulsar F2 y comprobar el selector. 3. Pulsar Alt+F4 y comprobar que se cierra la ventana.
- Plataforma: ambas

### IFZ-009 · Ctrl+Tab entre paneles
- Qué hace: con la Ronda visible, Ctrl+Tab y Ctrl+Mayús+Tab mueven al panel siguiente y al anterior sin mover el foco de la app.
- Condición y resultado observable: Ctrl+Tab cambia el panel visible.
- Fuente: unity/Assets/Interfaz/Aplicacion.cs:450-457
- Prueba: manual — 1. Abrir una ronda de prueba. 2. Pulsar Ctrl+Tab y comprobar el panel siguiente. 3. Pulsar Ctrl+Mayús+Tab y comprobar el anterior.
- Plataforma: ambas

### IFZ-010 · Regiones con F4 y F5, incluida la página nativa
- Qué hace: recorre las regiones visibles (riel, guía, lista, cabecera, página del proveedor, abajo) en ciclo; al llegar a la página, le entrega el foco del panel nativo y, si no puede, salta a la siguiente; desde la página, la tecla vuelve a la app y sigue desde ella.
- Condición y resultado observable: pulsando F4 repetido, el foco llega a la página del proveedor y el siguiente F4 lo devuelve a la región de abajo.
- Fuente: unity/Assets/Interfaz/Aplicacion.cs:466-491
- Prueba: manual — 1. Abrir una ronda de prueba. 2. Pulsar F4 hasta llegar a la página y escribir una letra en su compositor. 3. Pulsar F4 y comprobar que el foco vuelve a la app.
- Plataforma: ambas

### IFZ-011 · Menú contextual nativo del campo de la pregunta
- Qué hace: el clic derecho en un campo de texto abre el menú de Windows con «&Deshacer», «Cor&tar», «&Copiar», «&Pegar», «&Eliminar», «Seleccionar &todo»; cada uno se deshabilita si no aplica (sin cambio previo, sin selección, portapapeles vacío o campo vacío).
- Condición y resultado observable: con el campo vacío y el portapapeles con texto, solo «Pegar» está habilitado.
- Fuente: unity/Assets/Interfaz/Aplicacion.cs:191-233
- Prueba: manual — 1. Copiar un texto. 2. Clic derecho en «Tu pregunta» vacío. 3. Comprobar que solo «Pegar» está habilitado y que pega.
- Plataforma: windows

### IFZ-012 · Asa para cambiar el alto del campo
- Qué hace: bajo el campo hay un asa con el texto de ayuda «Arrastra para cambiar el alto del campo»; arrastrarla fija el alto entre 48 y 600 y la página del proveedor se reacomoda.
- Condición y resultado observable: arrastrar el asa hacia abajo agranda el campo hasta 600 y no más.
- Fuente: unity/Assets/Interfaz/Aplicacion.cs:243-265
- Prueba: manual — 1. Arrastrar el asa hacia abajo al máximo. 2. Comprobar que el campo deja de crecer. 3. Comprobar que la página del proveedor se reacomodó.
- Plataforma: ambas

### IFZ-013 · Clases de ancho y cajón
- Qué hace: según el ancho de la ventana, en dp de Material 3 (D3), aplica «ancha» desde 840, «angosta» por debajo de 840 y «compacta» por debajo de 600; las secciones «Ronda», «Historial», «Ajustes» y «Ayuda» se abren desde el riel o desde el cajón «Menú»; el cajón aparta la página mientras está abierto y se cierra al elegir o al tocar el fondo; en la clase compacta, los menús se abren como hoja abajo.
- Condición y resultado observable: con la ventana a menos de 600 de ancho, «Menú» abre el cajón con las cuatro secciones.
- Fuente: unity/Assets/Interfaz/Aplicacion.cs:30 ; unity/Assets/Interfaz/Aplicacion.cs:112-118 ; unity/Assets/Interfaz/Aplicacion.cs:269-291 ; unity/Assets/Interfaz/Aplicacion.cs:299-310 ; unity/Assets/Interfaz/Resources/Interfaz/Ronda.uxml:188-191 ; unity/Assets/Interfaz/PantallaRonda.cs:1432-1444
- Prueba: manual — 1. Angostar la ventana a menos de 600. 2. Tocar «Menú» y elegir «Historial». 3. Comprobar que el cajón se cierra y se ve el historial.
- Plataforma: ambas

### IFZ-014 · Historial de rondas
- Qué hace: «Rondas anteriores» lista las rondas de este aparato, la más nueva primero (D12); cada fila tiene la pregunta (recortada a 240 caracteres con «…», o «(capturada sin pegar la pregunta, y sin declararla)») y «{fecha} · llegó a {Etapa}» con fecha «d 'de' MMMM 'de' yyyy, HH:mm» en español, más « · sin informe» si no hay informe; con informe, el botón «Abrir el informe»; sin rondas, «Todavía no hay rondas en este aparato.».
- Condición y resultado observable: en una carpeta de datos vacía, Historial muestra «Todavía no hay rondas en este aparato.».
- Fuente: unity/Assets/Interfaz/Aplicacion.cs:312-351 ; unity/Assets/Interfaz/Resources/Interfaz/Ronda.uxml:124-129
- Prueba: manual — 1. Abrir la app con una carpeta de prueba vacía y comprobar el texto vacío. 2. Hacer una ronda de prueba hasta el informe. 3. Comprobar la fila y que «Abrir el informe» abre la carpeta.
- Plataforma: ambas

### IFZ-015 · Historial en Android dice dónde está el informe
- Qué hace: en Android no hay «Abrir el informe»; el detalle agrega « · informe en {ruta}» (D41).
- Condición y resultado observable: una ronda con informe muestra la ruta de su carpeta en el detalle.
- Fuente: unity/Assets/Interfaz/Aplicacion.cs:319 ; unity/Assets/Interfaz/Aplicacion.cs:333-335 ; unity/Assets/Interfaz/Aplicacion.cs:342
- Prueba: manual — 1. En un Android de prueba, terminar una ronda. 2. Abrir Historial. 3. Comprobar la ruta y que no hay botón.
- Plataforma: android

### IFZ-016 · Versión y licencias en Ayuda
- Qué hace: Ayuda muestra «ChatCouncil, versión {v}.», el texto «Al abrirse, la app busca una versión nueva y te la ofrece arriba. Las versiones publicadas están en la página del proyecto.», el botón «Ver las versiones publicadas» (abre la página de Releases del proyecto) y «Licencias de terceros».
- Condición y resultado observable: tocar «Ver las versiones publicadas» abre la página de versiones en el navegador.
- Fuente: unity/Assets/Interfaz/Aplicacion.cs:292-296 ; unity/Assets/Interfaz/Resources/Interfaz/Ronda.uxml:174-178
- Prueba: manual — 1. Ir a Ayuda. 2. Comprobar la versión. 3. Tocar «Ver las versiones publicadas» y comprobar el navegador.
- Plataforma: ambas

### IFZ-017 · Menús propios con grupos y motivos
- Qué hace: los menús son propios (apartan las páginas mientras están abiertos), agrupan los ítems bajo su título y muestran bajo cada ítem deshabilitado su motivo; se abren bajo el botón sin salirse de la ventana, hacia arriba si abajo hay menos de 240 y arriba más.
- Condición y resultado observable: en investigación, «Corregir la investigación…» se ve deshabilitado con «Solo cuando la investigación ya se cerró.».
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:1398-1445 ; unity/Assets/Interfaz/PantallaRonda.cs:999-1019
- Prueba: manual — 1. En investigación, abrir el menú de corrección. 2. Comprobar el ítem deshabilitado y su motivo. 3. Abrir el menú con el botón cerca del borde inferior y comprobar que se abre hacia arriba.
- Plataforma: ambas

### IFZ-018 · Ítems del menú del panel
- Qué hace: según el panel visible ofrece, bajo «Este panel: {proveedor}», en un rol «Pegar el prompt aquí» y «Capturar este panel ({Etapa})»; en operación «Pegar la operación aquí», «Pegar la operación aquí como texto», «Usar su operación anterior» y capturar; en los demás, «Pegar la pregunta aquí» y capturar; con motivos como «Solo en su etapa: fuera de ella, usa «Recapturar» del menú Ronda.» y «El panel no tiene su página abierta.».
- Condición y resultado observable: en un rol fuera de su etapa, «Capturar este panel» está deshabilitado con ese motivo.
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:45-54 ; unity/Assets/Interfaz/PantallaRonda.cs:1325-1366
- Prueba: manual — 1. En investigación, mostrar el panel del integrador. 2. Abrir el menú del panel. 3. Comprobar el ítem deshabilitado y su motivo.
- Plataforma: ambas

### IFZ-019 · Ítems del menú Ronda y mantenimiento
- Qué hace: el grupo «Ronda» ofrece «Recapturar el informe del integrador», «Recapturar la verificación», «Mostrar los paneles de los roles» u «Ocultar los paneles de los roles», «Capturar lo que ya está en los paneles», «Declarar la pregunta de esta ronda», «Ronda nueva con las respuestas copiadas» y «Abandonar la ronda», cada uno con su motivo si no aplica; el de mantenimiento, «Recargar la página», «Diagnóstico de selectores», «Cerrar la sesión de este panel…» y «Agregar una cuenta de Google»; el de paneles, «{proveedor} · {palabra}» por panel en la vista.
- Condición y resultado observable: sin ronda abierta, «Abandonar la ronda» está deshabilitado con «No hay una ronda abierta.».
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:1368-1396 ; unity/Assets/Interfaz/PantallaRonda.cs:1220-1232
- Prueba: manual — 1. Abrir la app sin ronda en un perfil de prueba. 2. Abrir el menú Ronda. 3. Comprobar los ítems deshabilitados y sus motivos.
- Plataforma: ambas

### IFZ-020 · Jerarquía para el lector de pantalla
- Qué hace: con un lector de pantalla activo (Narrador en Windows, TalkBack en Android), cada 0,5 s arma la jerarquía de accesibilidad con los controles a la vista, en el orden del documento: botones y filas de panel como botón, casillas como casilla, campos de texto, desplegables, y textos sueltos como texto o como encabezado (títulos de sección y de bloque); cada nodo lleva el marco del control en píxeles de la ventana. Sin lector activo no hace nada.
- Condición y resultado observable: con Narrador activo, el botón del paso aparece como botón con su texto y un marco de ancho mayor que 0, y «Ronda…» está en la jerarquía.
- Fuente: unity/Assets/Interfaz/Lector.cs:9-53 ; unity/Assets/Interfaz/Lector.cs:66-78 ; unity/Assets/Interfaz/Lector.cs:103-117 ; unity/Assets/Interfaz/Aplicacion.cs:143
- Prueba: vector — unity/Assets/Interfaz/PruebaRonda.cs:528-547 («jerarquía para el lector de pantalla»)
- Plataforma: ambas

### IFZ-021 · Lo que dice el lector de cada control
- Qué hace: el nombre de un botón es su texto; el de una fila de panel, sus textos unidos con «, » (proveedor y estado); un texto de la etapa actual agrega «, etapa actual» y uno de una etapa hecha, «, hecha»; una casilla, su texto; un campo, su etiqueta y su contenido como valor. El estado es deshabilitado si el control no está habilitado y seleccionado si la casilla está marcada; solo se asigna lo que cambió, y asignarlo avisa al lector.
- Condición y resultado observable: en Operación, el lector dice «3 Operación, etapa actual» y la fila de Kimi empieza con «Kimi, ».
- Fuente: unity/Assets/Interfaz/Lector.cs:55-64 ; unity/Assets/Interfaz/Lector.cs:87-101
- Prueba: vector — unity/Assets/Interfaz/PruebaRonda.cs:541-547
- Plataforma: ambas

### IFZ-022 · Activar un control desde el lector
- Qué hace: activar un nodo desde el lector cambia una casilla; en un botón, un desplegable o una fila de panel manda el mismo evento que Enter; en otro control enfocable le da el foco; si el control está deshabilitado no hace nada. Cuando el lector enfoca un nodo, el control enfocable recibe el foco.
- Condición y resultado observable: con Narrador, activar la fila de Kimi pone a Kimi a la vista, igual que Enter sobre la fila.
- Fuente: unity/Assets/Interfaz/Lector.cs:49-50 ; unity/Assets/Interfaz/Lector.cs:119-141 ; unity/Assets/Interfaz/PantallaRonda.cs:314-315
- Prueba: manual — 1. Abrir una ronda de prueba con Narrador activo. 2. Llevar el cursor de Narrador a la fila de Kimi y activarla. 3. Comprobar que Kimi queda a la vista. 4. Activar una casilla de Ajustes y comprobar que cambia.
- Plataforma: ambas

### IFZ-023 · Símbolo dibujado de cada estado
- Qué hace: el símbolo del estado de un panel se dibuja con una forma por estado: «por-pegar» círculo vacío; «falta-enviar» círculo con un punto; «respondiendo» círculo medio lleno; «terminado» círculo lleno; «capturado» círculo lleno con una marca; «problema» triángulo con un signo de exclamación. El color sale de los tokens `--icono-color` y `--icono-fondo`. Se usa en cada fila, en la cabecera y en el selector; «Parece terminado» observado y deducido comparten el círculo lleno.
- Condición y resultado observable: un panel «Con problema» muestra el triángulo con el signo y un panel «Capturado», el círculo lleno con la marca.
- Fuente: unity/Assets/Interfaz/IconoEstado.cs:6-45 ; unity/Assets/Interfaz/IconoEstado.cs:47-102 ; unity/Assets/Interfaz/PantallaRonda.cs:33-43 ; unity/Assets/Interfaz/PantallaRonda.cs:463-489
- Prueba: manual — 1. Abrir una ronda de prueba. 2. Pegar en un panel sin enviar y comprobar el círculo con punto junto a «Pegado, falta que envíes». 3. Enviar y comprobar el medio lleno, y al terminar el lleno. 4. Capturar y comprobar la marca.
- Plataforma: ambas

### IFZ-024 · Diálogo propio con Cancelar
- Qué hace: los diálogos de la ronda muestran título y texto, un campo opcional (que recibe el foco; si no hay campo, el foco va al botón de aceptar), una casilla opcional que arranca desmarcada y el botón de aceptar con su texto; «Cancelar» o tocar el fondo lo cierran sin hacer nada; aceptar cierra y luego corre la acción con el texto del campo y la casilla.
- Condición y resultado observable: al tocar «Cancelar» en «Abandonar la ronda», la ronda sigue abierta.
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:143-152 ; unity/Assets/Interfaz/PantallaRonda.cs:1461-1487 ; unity/Assets/Interfaz/Resources/Interfaz/Ronda.uxml:207
- Prueba: vector — unity/Assets/Interfaz/PruebaRonda.cs:245-251 («diálogo cancelado»)
- Plataforma: ambas

## Invariantes

### INV-IFZ-001 · Una acción deshabilitada nunca queda sin motivo visible
- Qué nunca pasa: un ítem de menú se deshabilita sin mostrar debajo su motivo.
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:1420-1430
- Prueba: manual — 1. Recorrer los menús del panel, Ronda, Corregir y mantenimiento en cada etapa de una ronda de prueba. 2. Comprobar que todo ítem gris tiene su motivo debajo.

### INV-IFZ-002 · Las teclas de la app nunca le quitan Alt+F4 al sistema
- Qué nunca pasa: la app toma una tecla F pulsada con Alt.
- Fuente: unity/Assets/Interfaz/Aplicacion.cs:437-438
- Prueba: manual — 1. Abrir la app. 2. Pulsar Alt+F4. 3. Comprobar que la ventana se cierra.

### INV-IFZ-003 · Un menú nunca se abre fuera de la vista
- Qué nunca pasa: un menú queda fuera de la ventana; su alto máximo es el espacio disponible del lado en que se abre.
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:1432-1445
- Prueba: manual — 1. Achicar la ventana al mínimo de alto. 2. Abrir cada menú. 3. Comprobar que se ve entero o con desplazamiento dentro de la ventana.

### INV-IFZ-004 · Un texto que cambia nunca rearma la jerarquía del lector
- Qué nunca pasa: un cambio de texto, valor o estado rearma la jerarquía y mueve el foco del lector; solo se rearma cuando cambian los controles a la vista.
- Fuente: unity/Assets/Interfaz/Lector.cs:32-37
- Prueba: vector — unity/Assets/Interfaz/PruebaRonda.cs:549-561 («un texto nuevo no rearma la jerarquía»)

### INV-IFZ-005 · La página nativa nunca entra en la jerarquía de la app
- Qué nunca pasa: el relleno bajo la página del proveedor, los textos dentro de un control o de una fila de panel, o un elemento oculto o de tamaño cero aparecen como nodo propio del lector.
- Fuente: unity/Assets/Interfaz/Lector.cs:72-77 ; unity/Assets/Interfaz/Lector.cs:103-108
- Prueba: vector — unity/Assets/Interfaz/PruebaRonda.cs:546 (ningún nodo «Página del proveedor (vista nativa)» ni «Kimi» suelto)

### INV-IFZ-006 · El estado nunca se distingue solo por color
- Qué nunca pasa: dos estados de panel comparten forma sin ser el mismo símbolo, o el símbolo aparece sin la palabra del estado al lado (WCAG 1.4.1).
- Fuente: unity/Assets/Interfaz/IconoEstado.cs:6-10 ; unity/Assets/Interfaz/PantallaRonda.cs:318-325
- Prueba: manual — 1. Activar en Windows el filtro de color en escala de grises. 2. Recorrer una ronda de prueba hasta tener paneles en varios estados. 3. Comprobar que cada estado se distingue por la forma y lleva su palabra.

### INV-IFZ-007 · Un diálogo cerrado nunca deja su acción
- Qué nunca pasa: tras cancelar o cerrar un diálogo, un «Aceptar» posterior ejecuta la acción de ese diálogo.
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:1461-1466
- Prueba: vector — unity/Assets/Interfaz/PruebaRonda.cs:245-251
