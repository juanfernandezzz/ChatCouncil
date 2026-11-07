# Ajustes y preferencias

Propósito: elegir el consejo y sus roles, entrar a las cuentas, ajustar tema y tamaño, y ver dónde viven los datos, guardando todo fuera del registro.

> Extraído de ChatCouncil-Unity (ChatCouncil-main, commit 247f6db) el 2026-11-07. Rutas relativas a ese repo.

## Requisitos

### AJU-001 · Proveedores y roles en Ajustes
- Qué hace: muestra una casilla por proveedor conocido con su nombre y cuatro listas desplegables con los diez nombres: «Integrador: lee la tabla de hallazgos y escribe el informe», «Verificador 1: revisa las fuentes con búsqueda web», «Verificador 2: revisa las mismas fuentes por separado, para comparar», «Redactor: escribe la respuesta final; puede ser el integrador»; los valores iniciales salen del archivo de selección o de los defectos.
- Condición y resultado observable: sin archivo, los diez proveedores aparecen marcados y los roles en deepseek, glm, qwen y deepseek.
- Fuente: unity/Assets/Interfaz/Configuracion.cs:60-83 ; unity/Assets/Interfaz/Resources/Interfaz/Configuracion.uxml:17-26
- Prueba: vector — motor/Tests/RondaPruebas.cs:100 (LaSeleccionYLosRolesSeLeenComoEnTypeScript)
- Plataforma: ambas

### AJU-002 · Guardar la selección
- Qué hace: valida con las reglas de roles; si pasan, escribe `seleccion-proveedores.json` en UTF-8 sin BOM con `guardadoEn` en UTC; si no se puede escribir, «No se pudo guardar en la carpeta de datos: {error}».
- Condición y resultado observable: en el primer arranque, «Guardado.» y pasa a «Paso 2 de 2: tus cuentas»; después, «Guardado. Se aplica la próxima vez que abras ChatCouncil.».
- Fuente: unity/Assets/Interfaz/Configuracion.cs:133-161
- Prueba: vector — motor/Tests/RondaPruebas.cs:147 (LaSeleccionSeEscribeConElFormatoDeTypeScript)
- Plataforma: ambas

### AJU-003 · Los cambios se aplican al reabrir
- Qué hace: fuera del primer arranque, el consejo y los roles guardados se aplican la próxima vez que se abre la app; la pantalla lo avisa con «Los cambios se aplican la próxima vez que abras ChatCouncil.».
- Condición y resultado observable: cambiar el integrador y guardar no cambia la lista de roles de la Ronda abierta.
- Fuente: unity/Assets/Interfaz/Resources/Interfaz/Configuracion.uxml:27 ; unity/Assets/Interfaz/Configuracion.cs:120-121
- Prueba: manual — 1. Con un perfil de prueba, cambiar el integrador en Ajustes y Guardar. 2. Ir a Ronda y comprobar que no cambió. 3. Reabrir la app y comprobar el cambio.
- Plataforma: ambas

### AJU-004 · Guía de dos pasos
- Qué hace: en el primer arranque muestra el texto «Antes de la primera ronda, elige tu consejo y entra a tu cuenta en cada proveedor. Después puedes cambiarlo en Ajustes.», el paso 1 (consejo), y tras guardar el paso 2 (cuentas) con «Ir a la ronda»; al terminar, el título pasa a «Ajustes» y se arma la Ronda.
- Condición y resultado observable: tocar «Ir a la ronda» muestra la Ronda y el riel.
- Fuente: unity/Assets/Interfaz/Configuracion.cs:111-130 ; unity/Assets/Interfaz/Resources/Interfaz/Configuracion.uxml:13 ; unity/Assets/Interfaz/Resources/Interfaz/Configuracion.uxml:37 ; unity/Assets/Interfaz/Aplicacion.cs:130-136
- Prueba: manual — 1. Abrir la app con una carpeta vacía. 2. Guardar el consejo. 3. Tocar «Ir a la ronda» y comprobar la Ronda.
- Plataforma: ambas

### AJU-005 · Tus cuentas
- Qué hace: lista una fila por proveedor marcado con estado y botón «Entrar»; el texto explica «Entra a tu cuenta en la página de cada proveedor. ChatCouncil no ve tu contraseña: sabe que la sesión está abierta porque la página muestra dónde escribir.».
- Condición y resultado observable: tras guardar, la lista de cuentas tiene solo los proveedores marcados.
- Fuente: unity/Assets/Interfaz/Configuracion.cs:163-189 ; unity/Assets/Interfaz/Resources/Interfaz/Configuracion.uxml:33-36
- Prueba: manual — 1. Desmarcar Kimi y Guardar. 2. Comprobar que Kimi no aparece en «Tus cuentas».
- Plataforma: ambas

### AJU-006 · Apariencia: tema y tamaño
- Qué hace: «Tema» ofrece «El del sistema», «Claro», «Oscuro»; «Tamaño del texto y de los controles» ofrece «El del sistema», «100 %», «125 %», «150 %», «200 %»; se aplica al elegir, sin Guardar, y se guarda en `apariencia.json`; todo crece junto como un zoom.
- Condición y resultado observable: elegir «Oscuro» cambia la app al tema oscuro de inmediato y la reapertura lo conserva.
- Fuente: unity/Assets/Interfaz/Aplicacion.cs:353-410 ; unity/Assets/Interfaz/Resources/Interfaz/Configuracion.uxml:40-46
- Prueba: manual — 1. Elegir «Oscuro» y «150 %». 2. Comprobar el cambio inmediato. 3. Reabrir y comprobar que se mantiene.
- Plataforma: ambas

### AJU-007 · Apariencia ilegible nunca impide arrancar
- Qué hace: si `apariencia.json` falta, es ilegible o trae valores de otro tipo, se usan las del sistema.
- Condición y resultado observable: con `apariencia.json` corrupto, la app abre con el tema del sistema.
- Fuente: unity/Assets/Interfaz/Aplicacion.cs:363-378
- Prueba: manual — 1. Escribir «x» en `apariencia.json` de la carpeta de prueba. 2. Abrir la app. 3. Comprobar que abre con el tema del sistema.
- Plataforma: ambas

### AJU-008 · Tema del sistema
- Qué hace: «El del sistema» es oscuro si Windows tiene `AppsUseLightTheme` en 0 (sin el valor, claro) o si Android está en modo noche; el tamaño del sistema sigue la escala de fuente, entre 1 y 2.
- Condición y resultado observable: con Windows en modo oscuro y tema «El del sistema», la app se ve oscura.
- Fuente: unity/Assets/Interfaz/Aplicacion.cs:405-426
- Prueba: manual — 1. Poner Windows en modo oscuro. 2. Elegir «El del sistema». 3. Comprobar el tema oscuro.
- Plataforma: ambas

### AJU-009 · Tus datos
- Qué hace: muestra la ruta de la carpeta de datos con «Copiar la ruta» (pasa a «Ruta copiada») y «Abrir la carpeta» (oculto en Android); en Windows dice «Las rondas, los informes, estos ajustes y las sesiones de tus cuentas se guardan solo en este aparato, en esta carpeta:» y «Para hacer una copia, cierra ChatCouncil y copia la carpeta entera a otro disco. Lleva las sesiones de tus cuentas: guárdala donde nadie más pueda abrirla.».
- Condición y resultado observable: tocar «Copiar la ruta» deja la ruta en el portapapeles y el botón dice «Ruta copiada».
- Fuente: unity/Assets/Interfaz/Configuracion.cs:191-215 ; unity/Assets/Interfaz/Resources/Interfaz/Configuracion.uxml:48-57
- Prueba: manual — 1. Ir a Ajustes. 2. Tocar «Copiar la ruta» y pegar en el Bloc de notas. 3. Tocar «Abrir la carpeta» y comprobar el explorador.
- Plataforma: ambas

### AJU-010 · Tus datos en Android
- Qué hace: en Android dice «Las rondas, los informes y estos ajustes se guardan solo en este teléfono, en esta carpeta. Las sesiones de tus cuentas quedan dentro de la app.» y «Para hacer una copia, conecta el teléfono a una computadora por USB y copia la carpeta entera.».
- Condición y resultado observable: en Android no aparece «Abrir la carpeta».
- Fuente: unity/Assets/Interfaz/Configuracion.cs:193-196 ; unity/Assets/Interfaz/Configuracion.cs:204 ; unity/Assets/Interfaz/Configuracion.cs:211-213
- Prueba: manual — 1. Abrir Ajustes en un Android de prueba. 2. Comprobar los dos textos y que no hay «Abrir la carpeta».
- Plataforma: android

## Invariantes

### INV-AJU-001 · La selección nunca va al registro
- Qué nunca pasa: la selección de proveedores o la apariencia se escriben en el registro de conversaciones.
- Fuente: motor/Runtime/Roles.cs:42-43 ; unity/Assets/Interfaz/Aplicacion.cs:355
- Prueba: nueva — guardar la selección y la apariencia y comprobar que ningún `.jsonl` cambió de tamaño.

### INV-AJU-002 · Una selección inválida nunca se escribe
- Qué nunca pasa: se escribe `seleccion-proveedores.json` con un error de validación.
- Fuente: unity/Assets/Interfaz/Configuracion.cs:137-140 ; motor/Runtime/Roles.cs:130-131
- Prueba: vector — motor/Tests/RondaPruebas.cs:113 (LaSeleccionSeValidaComoEnTypeScript)
