# Registro append-only y conversaciones

Propósito: guardar cada hecho de la investigación en un archivo JSONL por conversación que solo crece, y reconstruir de él el estado de cada ronda.

> Extraído de ChatCouncil-Unity (ChatCouncil-main, commit 247f6db) el 2026-11-07. Rutas relativas a ese repo.

## Requisitos

### REG-001 · Un archivo por conversación
- Qué hace: cada conversación vive en `conversaciones/<id>.jsonl` dentro de la carpeta de datos.
- Condición y resultado observable: al agregar el primer hecho de una conversación se crea la carpeta `conversaciones` y el archivo `<id>.jsonl`.
- Fuente: motor/Runtime/Registro.cs:67-68 ; motor/Runtime/Registro.cs:73
- Prueba: vector — motor/Tests/Referencias.g.cs:621 (RegistroLineas)
- Plataforma: ambas

### REG-002 · Agregar es una línea al final
- Qué hace: cada hecho se escribe como una sola línea JSON terminada en `\n` al final del archivo, en UTF-8 sin BOM.
- Condición y resultado observable: tras `Agregar`, el archivo tiene una línea más; las anteriores quedan idénticas byte a byte.
- Fuente: motor/Runtime/Registro.cs:70-75
- Prueba: vector — motor/Tests/DominioPruebas.cs:16 (CadaTipoDeHechoSeLeeYSeReescribeIgualQueLoEscribeLaVersionElectron)
- Plataforma: ambas

### REG-003 · Dieciséis tipos de hecho
- Qué hace: el registro admite exactamente los 16 tipos de hecho declarados, con el mismo esquema que la versión Electron.
- Condición y resultado observable: cada tipo de hecho se lee y se reescribe igual que lo escribía la versión Electron.
- Fuente: motor/Runtime/Registro.cs:32-50 ; motor/Runtime/Hechos.cs:6-10
- Prueba: vector — motor/Tests/DominioPruebas.cs:10 (ElEsquemaEsElMismoQueElDeLaVersionElectron)
- Plataforma: ambas

### REG-004 · Serialización igual a JSON.stringify
- Qué hace: el escritor escapa cadenas igual que `JSON.stringify`, para que las líneas sean comparables con las de la versión TypeScript.
- Condición y resultado observable: para el mismo hecho, la línea escrita coincide con el vector de referencia.
- Fuente: motor/Runtime/Registro.cs:134-170
- Prueba: vector — motor/Tests/Referencias.g.cs:621 (RegistroLineas)
- Plataforma: ambas

### REG-005 · Fechas como texto
- Qué hace: las fechas se leen como cadenas, sin convertirlas a fecha.
- Condición y resultado observable: un campo de fecha se devuelve con el mismo texto que tenía la línea.
- Fuente: motor/Runtime/Registro.cs:54-59
- Prueba: nueva — leer una línea con fecha ISO con zona y comprobar que el texto vuelve idéntico.
- Plataforma: ambas

### REG-006 · Lectura tolerante a líneas rotas
- Qué hace: al leer, las líneas que no se pueden parsear se cuentan y se guardan truncadas a 200 caracteres; una última línea incompleta se marca aparte.
- Condición y resultado observable: un archivo con una línea corrupta y una última línea cortada devuelve los hechos válidos, el conteo de ilegibles y `UltimaLineaIncompleta`.
- Fuente: motor/Runtime/Registro.cs:95-111
- Prueba: vector — motor/Tests/DominioPruebas.cs:28 (LeerCuentaLasIlegiblesYDetectaLaUltimaLineaIncompleta) ; motor/Tests/Referencias.g.cs:653 (Lecturas)
- Plataforma: ambas

### REG-007 · Un archivo con BOM se trata como ilegible
- Qué hace: si el archivo empieza con BOM, la lectura lo considera ilegible.
- Condición y resultado observable: un `.jsonl` con BOM no aporta hechos.
- Fuente: motor/Runtime/Registro.cs:82-86
- Prueba: nueva — escribir un archivo con BOM y comprobar que `LeerArchivo` lo rechaza.
- Plataforma: ambas

### REG-008 · Caché de lectura por tamaño y fecha
- Qué hace: la Puerta vuelve a leer el registro solo si cambió el tamaño o la fecha de modificación del archivo.
- Condición y resultado observable: dos lecturas seguidas sin escrituras entre medio no releen el disco.
- Fuente: motor/Runtime/Puerta.cs:182-195
- Prueba: vector — motor/Tests/PuertaPruebas.cs:639 (ElRegistroSinCambiosNoSeVuelveALeer)
- Plataforma: ambas

### REG-009 · Conversación real, nunca de prueba
- Qué hace: la app crea la conversación con `EsPrueba=false`.
- Condición y resultado observable: el hecho Conversación escrito desde la interfaz tiene `EsPrueba=false`.
- Fuente: motor/Runtime/Puerta.cs:299-305 ; motor/Runtime/Hechos.cs:16-24
- Prueba: nueva — abrir una ronda con la Puerta y comprobar `EsPrueba=false` en el primer hecho.
- Plataforma: ambas

### REG-010 · Abrir ronda escribe semilla y proveedores cargados
- Qué hace: abrir una ronda escribe el hecho Ronda con su semilla y un hecho de condición con los proveedores activos y el integrador.
- Condición y resultado observable: tras `AbrirRonda`, el registro tiene un hecho Ronda con semilla y un `CondicionProveedoresCargados`.
- Fuente: motor/Runtime/Puerta.cs:311-320
- Prueba: vector — motor/Tests/DominioPruebas.cs:79 (ElIntegradorYLosCargadosSonLosDeLaUltimaCondicion) ; motor/Tests/Referencias.g.cs:695 (Cargados)
- Plataforma: ambas

### REG-011 · Intentos registrados, también los fallidos
- Qué hace: tras pegar, se registra un hecho Intento por proveedor, incluidos los que fallaron; sin ronda abierta, lanza error.
- Condición y resultado observable: con 7 proveedores y 2 fallos quedan 7 intentos; sin ronda, `RegistrarIntentos` falla.
- Fuente: motor/Runtime/Puerta.cs:323-329
- Prueba: vector — motor/Tests/PuertaPruebas.cs:142 (UnaRondaEnteraDejaLosMismosHechosQueElTypeScript)
- Plataforma: ambas

### REG-012 · Etapa derivada de los hechos
- Qué hace: la etapa de la ronda se calcula desde los hechos, contando operadores distintos; no se guarda como campo.
- Condición y resultado observable: el mismo registro siempre da la misma etapa.
- Fuente: motor/Runtime/Dominio.cs:63-72
- Prueba: vector — motor/Tests/DominioPruebas.cs:41 (LaEtapaSaleDeLosHechosYCuentaOperadoresDistintos) ; motor/Tests/Referencias.g.cs:662 (Etapas)
- Plataforma: ambas

### REG-013 · Salidas vigentes: la última de cada operador
- Qué hace: de varias salidas del mismo operador vale la última.
- Condición y resultado observable: tras recapturar un operador, la salida vigente es la nueva y la anterior sigue en el archivo.
- Fuente: motor/Runtime/Dominio.cs:125-140
- Prueba: vector — motor/Tests/RondaPruebas.cs:66 (LasSalidasVigentesSonLaUltimaDeCadaOperador) ; motor/Tests/Referencias.g.cs:341 (Vigentes)
- Plataforma: ambas

### REG-014 · Restaurar la ronda activa al abrir
- Qué hace: al abrir la app se toma la conversación no de prueba más nueva por `CreadaEn` y su última ronda por `Indice`, sin escribir nada; un archivo ilegible se salta.
- Condición y resultado observable: con dos conversaciones, la pantalla vuelve a la última ronda de la más nueva.
- Fuente: motor/Runtime/Puerta.cs:207-240
- Prueba: vector — motor/Tests/PuertaPruebas.cs:605 (LaRondaActivaSeRestauraDelRegistro)
- Plataforma: ambas

### REG-015 · Rondas anteriores, la más nueva primero
- Qué hace: lista las rondas anteriores (D12) con su carpeta de informe, encontrada por la línea `Ronda: {id}` del informe, de la más nueva a la más vieja; un archivo ilegible no rompe la lista.
- Condición y resultado observable: el historial muestra primero la ronda más reciente y enlaza su informe si existe.
- Fuente: motor/Runtime/Puerta.cs:246-270
- Prueba: vector — motor/Tests/PuertaPruebas.cs:359 (LasRondasAnterioresSalenDelRegistroConSuInforme) ; motor/Tests/PuertaPruebas.cs:384 (UnArchivoIlegibleNoRompeElHistorial)
- Plataforma: ambas

### REG-016 · Abandonar una ronda no escribe
- Qué hace: abandonar una ronda (D13) limpia el estado en memoria (ronda actual y prompts armados) y no agrega hechos.
- Condición y resultado observable: tras abandonar, la pantalla vuelve a la pregunta y el archivo de la conversación queda igual.
- Fuente: motor/Runtime/Puerta.cs:290-297
- Prueba: vector — motor/Tests/PuertaPruebas.cs:573 (AbandonarLaRondaVuelveALaPreguntaSinTocarElRegistro)
- Plataforma: ambas

### REG-017 · Ronda nueva con respuestas copiadas
- Qué hace: crea una ronda nueva que copia las respuestas de la actual, con `CopiadaDe` y citas recalculadas; sin ronda activa devuelve «No hay una ronda activa de la que copiar.».
- Condición y resultado observable: la ronda nueva tiene las mismas respuestas con `CopiadaDe` apuntando a la original; la original no cambia.
- Fuente: motor/Runtime/Puerta.cs:742-771
- Prueba: nueva — copiar una ronda con 7 respuestas y comprobar `CopiadaDe` y que las líneas previas del archivo quedan iguales.
- Plataforma: ambas

## Invariantes

### INV-REG-001 · El registro nunca se reescribe
- Qué nunca pasa: una línea ya escrita se modifica o se borra; el archivo solo crece con `File.AppendAllText`.
- Fuente: motor/Runtime/Registro.cs:70-75
- Prueba: vector — motor/Tests/PuertaPruebas.cs:142 (UnaRondaEnteraDejaLosMismosHechosQueElTypeScript)

### INV-REG-002 · Leer nunca escribe
- Qué nunca pasa: restaurar, listar rondas anteriores o abandonar agregan hechos.
- Fuente: motor/Runtime/Puerta.cs:207-240 ; motor/Runtime/Puerta.cs:290-297
- Prueba: vector — motor/Tests/PuertaPruebas.cs:573 (AbandonarLaRondaVuelveALaPreguntaSinTocarElRegistro)
