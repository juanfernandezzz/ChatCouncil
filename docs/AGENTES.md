# Contrato de agentes — ChatCouncil

**Leé este archivo entero antes de proponer, escribir o correr nada.**

## Por qué vive acá y no en la configuración de una herramienta

Este proyecto se trabaja desde varias superficies —la pestaña Chat, la pestaña
Code, Cowork, Dispatch— y cada una tiene su propio alcance de instrucciones,
su propia memoria y su propia idea de qué es un "proyecto". Ninguna de esas
memorias cruza a las otras, y algunas ni siquiera admiten instrucciones
persistentes.

Un contrato que vive en la configuración de una herramienta se pierde al
cambiar de herramienta. Uno que vive en el repositorio lo lee cualquiera que
tenga el repositorio, que es exactamente la condición para poder trabajar acá.

Es el mismo principio que sostiene `docs/BLUEPRINT.md`: la fuente de verdad
está en el repositorio, no en la cabeza de nadie ni en la sesión de nadie.

## Arranque obligatorio, en este orden

1. `git log --oneline -3` y `git status --porcelain`. Si hay cambios sin
   commitear que no sean archivos sueltos `*.txt` de mediciones, **pará y
   reportá**.
2. Leé `docs/BLUEPRINT.md` **entero**. Es el plan vigente y el registro de
   verificación. `docs/BLUEPRINT.v2.md` **no** es el plan: es archivo
   histórico de una arquitectura descartada.
3. Leé el código real: `apps/desktop/` completo y los cuatro paquetes de
   `packages/` (`domain`, `providers`, `analysis`, `ui`).
4. Corré la línea base con salidas reales: `pnpm install`, `pnpm typecheck`,
   los cinco gates, `pnpm build`.

**Todo reclamo sobre el repositorio sale de leer archivos en la sesión actual.
Nunca de memoria, nunca de un resumen, nunca de una sesión anterior.**

## Qué es ChatCouncil

Aplicación de escritorio en Electron que abre varias interfaces de IA a la vez,
difunde un prompt a todas y permite comparar las respuestas nativas lado a
lado. Es un **instrumento de investigación académica** en ciencias sociales, de
uso personal. Los modelos son el instrumento, no el objeto de estudio.

Las tres funciones del plan: **Investigadores** (Claude, Gemini, ChatGPT, GLM
respondiendo en paralelo en sus interfaces nativas), **Analistas** (extracción
y análisis comparativo), **Operador** (ejecución de herramientas definidas por
el usuario).

## Reglas duras

Ninguna de estas se negocia dentro de una tarea. Si una tarea parece exigir
romper una, la tarea está mal planteada: **pará y decilo.**

### Arquitectura

- **BYOA es el único camino.** No se propone BYOK ni claves de API — ni como
  solución, ni como respaldo, ni como piso de fiabilidad, ni "sólo para
  probar". Los problemas de volumen o de degradación de cuentas se resuelven
  como restricciones de diseño (ritmo, lotes donde sea metodológicamente
  válido), nunca con claves.
- **Las ventanas de los proveedores SON los paneles.** No se construye una capa
  espejo de streaming encima de las interfaces nativas. Las capacidades nativas
  —pensamiento extendido, búsqueda web, razonamiento— no se mapean afuera.
- Nada se codifica por cantidad de proveedores. Sumar un investigador es
  agregarlo a la lista y nada más.

### Seguridad y cuentas

- **Nunca** credenciales, cookies, tokens ni cabeceras de autenticación: ni
  leerlas, ni copiarlas, ni registrarlas, ni siquiera para diagnosticar. Los
  censos de sesión cuentan **cantidades**, jamás valores.
- **Nunca** resolver captchas ni desafíos.
- **Nunca** cambios irreversibles en cuentas de proveedores.
- **Ninguna tanda de diagnóstico contra las particiones reales.** Abrir y
  cerrar procesos en sucesión sobre la misma partición `persist:` corrompe la
  base de sesión: los cuatro logins ya se perdieron dos veces por eso. Los
  bancos de prueba usan `PARTICIONES_DE_PRUEBA`. Las particiones reales se
  abren para **usar** la aplicación o para una corrida del arnés, nunca para
  diagnosticar.
- El sondeo **nunca envía**. Puede escribir un marcador y limpiarlo; un clic o
  una tecla en el compositor consume cuota y deja un mensaje que no se deshace.

### Pruebas

- **Con Claude, sólo Haiku.** Es regla del arnés: vive en `test-runner.ts` y
  nunca en las specs ni en `difundir()`. Juan paga esa cuenta.
- Cada corrida del arnés escribe mensajes reales y gasta cuota. Se corren las
  que hagan falta, no más.
- **Verificación por defecto: tres corridas y tasa**, no el último resultado.
  Un arnés que informa la última corrida no distingue un arreglo de una
  casualidad.

### Evidencia

- **Salidas reales, nunca supuestas.** Compilar no es embarcar.
- **Un resumen no es evidencia.** Si no lo mediste en esta sesión, no lo
  afirmes. Historial del proyecto: todo número que llegó resumido no
  reprodujo; todo número que llegó crudo se sostuvo.
- **Ningún número en una tabla de verificación sin haberlo medido.**
- Nunca colapsar "no pasó" con "no pude ver". Los tri-estados —`null` de no
  observable, `indeterminada`, `ausente`— viajan intactos hasta el disco.
- **Medir antes de arreglar.** Si el arreglo probable no se midió, se mide
  primero.
- No inventar enlaces de descarga a archivos locales. Citar ruta y línea.

### Gates

Cinco, y los cinco tienen que dar verde:

    pnpm guard:sellado · guard:specs · guard:sondeo · guard:dominio · guard:artefacto

- Todo requisito declarativo nuevo necesita un gate o una rama que lo consuma.
  Un campo de spec que nadie ramifica es decoración, y miente.
- **Todo gate nuevo se prueba en rojo antes de confiar en él.** Un gate que
  pasa por el motivo equivocado es peor que no tenerlo.
- **Si un gate te frena, cedés vos.** No se afloja. Si creés que un gate está
  mal, **pará y decilo**: eso es decisión de diseño, no elección técnica.

### Git

- `git add` **explícito por ruta**. Nunca `git add -A`.
- Revertir trabajo **no commiteado** se hace re-extrayendo del zip de la
  entrega, nunca con `git checkout` ni `git restore --source=HEAD`: los dos
  llevan al estado previo a la entrega.
- Se empuja cuando el trabajo está **verificado**, aunque el objetivo completo
  no cierre todavía. Atar el push al objetivo entero deja trabajo bueno
  encerrado en una máquina.

## Cómo se trabaja

Cada objetivo se ejecuta de forma **autónoma**: diagnosticás, escribís código,
compilás, medís, commiteás y reiterás hasta cumplirlo. **No parás a reportar un
problema: lo arreglás.**

Se escala **sólo** si:

- **(a)** es técnicamente imposible sin Juan (una credencial que hay que
  tipear, una decisión de cuenta), o
- **(b)** hace falta una decisión de diseño.

**Escalar significa PARAR.** No se escala y se procede igual. **Ninguna línea
de código ni de documentación atribuye una decisión a Juan que Juan no haya
escrito.**

Antes de iterar sobre un arreglo, **separá el mecanismo bajo prueba de todo lo
que exija a una persona**. Un ciclo de verificación que necesita a alguien no
se puede iterar.

## Cómo se le presentan decisiones a Juan

Preguntas **numeradas**, opciones por **letra**, con lo que se gana y lo que se
pierde en cada una, y una **recomendación firme**. Nunca preguntas abiertas:
Juan detesta la fatiga de decisión, y una recomendación sin alternativa visible
no es una decisión, es un anuncio.

Instrucciones para Juan: **paso a paso, numeradas, en orden, diciendo quién
hace cada cosa**. Nada de "abrí X" sin decir cómo se abre X.

## Formato y lenguaje

- **Español neutro** en todo: respuestas, interfaz y documentación.
- En texto en español de la interfaz, la palabra "council" no aparece: se dice
  **"consejo"**. "ChatCouncil" queda como marca sin traducir.
- Los mensajes de commit explican **por qué**, no sólo qué.

## Entorno

Node 22.22.2 · pnpm 11.9.0 · monorepo pnpm · TypeScript · Electron Vite ·
React 19 · Tailwind v4 · Zustand.
