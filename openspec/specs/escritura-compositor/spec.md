# Escritura en el compositor y verificación del pegado

Propósito: pegar pregunta, operación y prompts de rol en el compositor de cada proveedor sin enviar nunca, y verificar que lo escrito quedó igual a lo armado.

> Extraído de ChatCouncil-Unity (ChatCouncil-main, commit 247f6db) el 2026-11-07. Rutas relativas a ese repo.

## Requisitos

### ESC-001 · Escribir sin pisar un borrador
- Qué hace: el script de página espera el compositor (hasta `composerMs` de la spec, 15 s por defecto) y, si ya tiene texto, no escribe. Errores literales: «compositor no encontrado: no se escribió nada» y «el compositor ya tenía texto: no se escribe encima de un borrador».
- Condición y resultado observable: con un borrador en el compositor, pegar la pregunta deja el borrador intacto y la cabecera del panel muestra el error.
- Fuente: pagina/src/pagina.ts:185-194
- Prueba: manual — 1. En un perfil de prueba, escribir «hola» a mano en el compositor de un panel. 2. Tocar «Pegar la pregunta aquí». 3. Comprobar que el compositor sigue con «hola» y el error.
- Plataforma: ambas

### ESC-002 · Saltos CRLF normalizados
- Qué hace: antes de escribir, `\r\n` y `\r` pasan a `\n`.
- Condición y resultado observable: una pregunta pegada desde Windows no deja líneas en blanco extra en el compositor.
- Fuente: pagina/src/pagina.ts:187-188
- Prueba: manual — 1. Escribir una pregunta de dos líneas en el campo de la app. 2. Pegarla en un panel. 3. Comprobar que el compositor tiene dos líneas, sin línea vacía entre ellas.
- Plataforma: ambas

### ESC-003 · Escritura por execCommand en tramos
- Qué hace: en un textarea inserta el texto entero; en un contenteditable escribe por líneas o en tramos de 1.000 caracteres, con `execCommand`; si hay una píldora de skill no editable, escribe a continuación sin borrarla.
- Condición y resultado observable: un texto de 92.000 caracteres queda entero en el compositor de Claude.
- Fuente: pagina/src/pagina.ts:124-145
- Prueba: manual — 1. Con la ruta «como texto», pegar una operación larga en Claude con un perfil de prueba. 2. Comprobar el mensaje de éxito y el largo del compositor.
- Plataforma: ambas

### ESC-004 · Espera a que el texto asiente y verifica
- Qué hace: tras escribir, espera a que el largo quede quieto 400 ms, con techo de 45 s, y compara con lo pedido sin contar espacios; si no coincide, error «el texto no quedó en el compositor ({x} de {n} caracteres): revisa el panel y vuelve a pegar».
- Condición y resultado observable: si el compositor queda vacío, la app no dice «pegado».
- Fuente: pagina/src/pagina.ts:195-215
- Prueba: manual — 1. Con un perfil de prueba, pegar en un panel cuya página aún carga. 2. Si el texto no queda, comprobar el mensaje con los conteos.
- Plataforma: ambas

### ESC-005 · Pegar la pregunta en todos a la vez
- Qué hace: con pregunta escrita, muestra el aviso «Antes de pegar la pregunta» (salvo que se marcó «No volver a avisar en esta sesión»), pega en todos los operadores en paralelo con techo de 60 s cada uno, abre la ronda y registra un intento por proveedor.
- Condición y resultado observable: mensaje «Pegada en los {ok} paneles. Revísala y envíala en cada uno.» o «Pegada en {ok} de {n}. Los que fallaron dicen qué hacer en su cabecera.»; sin pregunta, «Escribe la pregunta antes de pegarla.».
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:28 ; unity/Assets/Interfaz/PantallaRonda.cs:637-690
- Prueba: manual — 1. Abrir la app con un perfil de prueba. 2. Escribir una pregunta y tocar «Pegar la pregunta aquí». 3. Tocar «Pegar en los 7». 4. Comprobar el mensaje y el texto en cada compositor.
- Plataforma: ambas

### ESC-006 · Repegar en un panel sin duplicar
- Qué hace: repega la pregunta de la ronda solo en el panel visible, sin ronda nueva ni intento; si el chat ya tiene un mensaje enviado, no pega.
- Condición y resultado observable: con el chat ya enviado, mensaje «No se pegó en {nombre}: el chat ya tiene un mensaje enviado: no se vuelve a pegar para no duplicar la pregunta»; sin pregunta, «Esta ronda no tiene una pregunta que pegar.»; con éxito, «Pegada en {nombre}. Revísala y envíala.».
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:692-716
- Prueba: manual — 1. Pegar y enviar la pregunta en un panel. 2. Repegar en ese panel. 3. Comprobar el mensaje de chat ya enviado.
- Plataforma: ambas

### ESC-007 · Conversación nueva comprobada vacía antes de operación y roles
- Qué hace: si el chat no está vacío, navega a la URL del proveedor y exige tres lecturas seguidas con chat sin mensajes y compositor vacío, cada 300 ms, con límite de 60 s.
- Condición y resultado observable: si no queda vacía, no pega y el panel dice «la conversación nueva no quedó vacía: no se pega, porque el modelo leería su propia respuesta. Abre una conversación nueva a mano y vuelve a pegar».
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:56 ; unity/Assets/Interfaz/PantallaRonda.cs:914-947 ; pagina/src/pagina.ts:223-230
- Prueba: manual — 1. Llegar a la operación con un perfil de prueba. 2. Tocar «Pegar la operación aquí». 3. Comprobar que el panel navega a una conversación nueva antes de escribir.
- Plataforma: ambas

### ESC-008 · Aviso de operación una vez por ronda
- Qué hace: la primera vez en la ronda muestra «Antes de pegar la operación» con la casilla «Pegarla como texto, sin archivo» y el botón «Entendido, pegar»; por defecto va con archivo.
- Condición y resultado observable: en la segunda tanda de la misma ronda no vuelve a preguntar.
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:829-849
- Prueba: manual — 1. Pegar la operación en un panel y aceptar. 2. Pegar en otro. 3. Comprobar que no aparece el diálogo.
- Plataforma: ambas

### ESC-009 · Operación de a un panel, al frente
- Qué hace: pega la operación en un panel por vez, con ese panel visible, y resume al final.
- Condición y resultado observable: mensajes «Pegando la operación: {i} de {n} ({nombre})…» y «Operación pegada en {ok} de {n}.» más « No se pegó en: …; cada uno dice qué pasó.» y « Comprueba que el archivo quedó adjunto, revísala y envíala.» o « Revísala y envíala.».
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:852-877
- Prueba: manual — 1. Con un perfil de prueba tocar «Pegar la operación en los paneles». 2. Comprobar que cada panel pasa al frente en su turno y el resumen final.
- Plataforma: ambas

### ESC-010 · Verificación de la operación escrita
- Qué hace: lee de vuelta el compositor; exige las diez cadenas del prompt (CONVERGENCIA, DIVERGENCIA, TENSION, SINGULARIDAD, AUSENCIA, LIMITACION:CORPUS, LIMITACION:AMBIGUEDAD, LIMITACION:TAREA, LIMITACION:OTRA, LA PREGUNTA ORIGINAL FUE:) buscadas sin las marcas, y luego igualdad carácter por carácter con `\r\n` y espacio duro normalizados.
- Condición y resultado observable: errores «prompt incompleto: faltan …» o «el compositor no es igual al prompt: {x} de {y} líneas, {a} de {b} caracteres».
- Fuente: motor/Runtime/Cuerpos.cs:172-211 ; unity/Assets/Interfaz/PantallaRonda.cs:953-967
- Prueba: vector — motor/Tests/PromptsPruebas.cs:143 (LaOperacionEscritaSeVerificaComoEnElectron)
- Plataforma: ambas

### ESC-011 · Prompt de rol verificado por igualdad
- Qué hace: los prompts de integrador, verificadores y redactor se verifican solo por igualdad normalizada.
- Condición y resultado observable: un compositor que mezcló texto viejo da «el compositor no es igual al prompt: …».
- Fuente: motor/Runtime/Cuerpos.cs:198-211
- Prueba: vector — motor/Tests/PromptsPruebas.cs:166 (ElPromptDeUnRolSeVerificaPorIgualdad)
- Plataforma: ambas

### ESC-012 · Adjunto después del texto
- Qué hace: con archivo, primero escribe y verifica el texto; luego guarda el archivo (UTF-8 sin BOM) y lo adjunta. Si el adjunto falla, el error dice dónde quedó.
- Condición y resultado observable: mensaje «el texto quedó pegado pero el archivo no se adjuntó ({error}). Está en {ruta}: adjúntalo a mano o pega la operación como texto».
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:968-981 ; unity/Assets/Interfaz/PantallaRonda.cs:902-903
- Prueba: manual — 1. Con un perfil de prueba pegar la operación con archivo. 2. Comprobar que el archivo existe en `operaciones/` de la carpeta de datos y aparece adjunto.
- Plataforma: ambas

### ESC-013 · Lo pegado queda registrado al verificarse
- Qué hace: solo una operación verificada se marca pegada en la Puerta.
- Condición y resultado observable: tras un pegado fallido, el paso sigue en «Pegar la operación en los paneles» para ese operador.
- Fuente: unity/Assets/Interfaz/PantallaRonda.cs:904-906 ; motor/Runtime/Puerta.cs:594
- Prueba: vector — motor/Tests/PuertaPruebas.cs:142 (UnaRondaEnteraDejaLosMismosHechosQueElTypeScript)
- Plataforma: ambas

## Invariantes

### INV-ESC-001 · La app nunca envía
- Qué nunca pasa: el script de página o la app pulsan enviar; la persona envía a mano.
- Fuente: pagina/src/pagina.ts:6-10 ; pagina/src/pagina.ts:183 ; panel/windows/panel.cpp:8-9
- Prueba: manual — 1. Pegar la pregunta en los paneles de un perfil de prueba. 2. Esperar 2 minutos. 3. Comprobar que ningún chat tiene un mensaje enviado.

### INV-ESC-002 · Nunca se escribe encima de un borrador
- Qué nunca pasa: el compositor con texto previo se sobrescribe.
- Fuente: pagina/src/pagina.ts:192-194
- Prueba: manual — igual que ESC-001.

### INV-ESC-003 · Pegado se verifica, no se asume
- Qué nunca pasa: la app anuncia «pegado» sin haber comparado lo leído con lo pedido.
- Fuente: pagina/src/pagina.ts:208-213 ; unity/Assets/Interfaz/PantallaRonda.cs:960-964
- Prueba: vector — motor/Tests/PromptsPruebas.cs:143 (LaOperacionEscritaSeVerificaComoEnElectron)

## Conflictos

### RESUELTO-ESC-01
Resuelto por Claude el 2026-11-07 con la regla de paridad: manda el comportamiento actual del código; el documento citado está desactualizado.
- docs/BLUEPRINT.md:2765-2768 (D36) fija un techo de 20 s para que la conversación nueva quede vacía.
- unity/Assets/Interfaz/PantallaRonda.cs:56 usa `EsperaChatNuevoMs = 60_000` (60 s) en `AbrirChatNuevo` (unity/Assets/Interfaz/PantallaRonda.cs:926).
