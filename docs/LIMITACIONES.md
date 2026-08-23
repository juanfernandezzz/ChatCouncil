# Limitaciones — ChatCouncil

> Esto es lo que otra persona necesita saber antes de confiar en una salida
> de ChatCouncil. El aviso de primer uso de la aplicación REFERENCIA este
> archivo; no lo duplica.

**Regla de este archivo:** cada limitación lleva la fecha en que se
constató y si fue MEDIDA o simplemente observada de paso. Un documento de
limitaciones sin procedencia repite el problema que viene a resolver.

---

## Sobre el diseño

- **Diseño round-robin con exclusión de autoevaluación**, apoyado en el
  Modelo de Relaciones Sociales (Social Relations Model — Kenny, 1994; Kenny
  y La Voie, 1984). *Observado de paso, 2026-08-13: es la referencia
  metodológica que fundamenta el diseño de la parte 2, no una medición sobre
  ChatCouncil.*

- El marco de rigor es el de Lincoln y Guba (1985, *Naturalistic Inquiry*):
  credibilidad, transferibilidad, dependibilidad y confirmabilidad.
  ChatCouncil los cubre así:

  | Criterio | Cómo lo cubre ChatCouncil |
  |---|---|
  | credibilidad | triangulación entre ocho fuentes independientes |
  | dependibilidad | registro append-only con procedencia |
  | confirmabilidad | trazabilidad del informe a la matriz, celda a celda |
  | transferibilidad | registro de las condiciones de cada turno |

  *Observado de paso, 2026-08-13: mapeo declarado del diseño contra el
  marco, no una medición.*

- **La fiabilidad de este instrumento NO está medida.** El número de
  participantes (8) se eligió por analogía con una literatura de percepción
  interpersonal humana; no hay medición equivalente para modelos de
  lenguaje. *Constatado 2026-08-13, por ausencia: no existe en este
  repositorio ninguna medición de fiabilidad del pool de 8.*

### Sobre una cifra que circuló y que NO se usa

Circuló en conversaciones un dato del tipo "50,2 [algo] para 8 operadores".
**Ese dato, presentado así, es falso y no se escribe en este documento.**

El dato real, con todas sus condiciones — y sólo se puede citar con ellas,
nunca solo ni redondeado, nunca como propiedad de ChatCouncil:

> Bonito y Kenny (2010) presentan un **ejemplo hipotético** en el que, con
> covarianza diádica 0,20, covarianza target-perceptor -0,05 y varianza de
> target 0,10 mantenidas constantes, la fiabilidad del efecto target pasa de
> 0,29 a 0,52 al comparar un grupo de 4 con uno de 8. Es sobre **percepción
> interpersonal humana**, no sobre modelos de lenguaje.
> Referencia: *Personal Relationships* 17(2):235-251, DOI
> 10.1111/j.1475-6811.2010.01274.x.

No se agrega ninguna otra cifra a este documento salvo que se haya medido
en este repositorio.

## Sobre lo que el instrumento no puede ver

- **La anonimización no sobrevive a las fuentes citadas.** Dominios propios
  del proveedor, idioma de las fuentes, estilos de citación pueden delatar
  quién produjo qué. Se declara, no se resuelve. *Observado de paso,
  2026-08-13.*

- **Los ocho no buscan sobre el mismo índice.** Parte de la divergencia
  entre respuestas es de corpus y no de razonamiento. El código puede medir
  la superposición de dominios citados entre proveedores; superposición
  baja con divergencia alta sugiere corpus, no desacuerdo. *No medido
  todavía; el mecanismo de medición está pendiente de construir.*

- **El plan de suscripción de cada cuenta no es observable desde la
  interfaz** y afecta la capacidad del modelo (por ejemplo, si tiene
  búsqueda web habilitada). No queda registrado. *Observado de paso,
  2026-08-13.*

- **El proveedor puede cambiar el modelo por defecto sin aviso.** Se
  detecta entre rondas, comparando la etiqueta de modelo registrada; nunca
  antes de la primera ronda en que ocurre. Ver `docs/BLUEPRINT.md` §5/§10
  para el estado medido de la detección de etiqueta por proveedor.

- **kimi no expone `modelLabel` a ningún ancho ni con conversación real.**
  Cuatro corridas de sondeo (dos antes de tener conversación, una a ancho
  variable, una con conversación viva el 2026-08-23), CERO candidatos las
  cuatro veces, con `controlesNivelesArriba: 9` en las cuatro — el árbol del
  compositor de kimi es más profundo que el resto y ninguna vía estructural
  encuentra un selector de etiqueta de modelo. Consecuencia: **en kimi no
  hay detección de deriva de versión del modelo** — el mecanismo que la
  Fase 2 existe para dar no puede operar ahí, no por un defecto del código
  sino porque la interfaz no expone el dato de forma detectable. Tres
  hipótesis agotadas (ver `docs/BLUEPRINT.md`, C0b): no queda una cuarta
  pendiente de probar. *MEDIDA, última vez 2026-08-23, con conversación
  real.*

- **kimi: el envío usa Enter, no clic — y sólo el Enter MANUAL está
  medido.** No hay selector de envío derivable en el DOM de kimi (mismo
  bloqueo estructural que el ítem anterior), así que su spec usa
  `submit.kind: "key"` en vez de `"click"`. Juan confirmó que Enter
  tecleado por él en la app real envía. **El envío SINTÉTICO** —el que
  `difundir()` dispara con un evento de teclado generado por código, no por
  una persona— **no está medido.** Hay precedente en este mismo repositorio
  de que la vía importa: a Gemini, un evento de teclado sintético simple no
  le disparaba el envío y hubo que pasar a clic (Fase 1); la versión actual
  de ese evento sí incluye los campos que le faltaban entonces
  (`keyCode`/`which`), pero eso no es lo mismo que haberlo medido en kimi.
  Se confirma en la primera ronda real que use la difusión automática sobre
  kimi. *Enter manual: MEDIDO, 2026-08-23, reportado por Juan. Enter
  sintético: PENDIENTE.*

- **qwen: el botón de envío y el de chat de voz son controles DISTINTOS**,
  no el mismo elemento cambiando de rol según el estado del compositor —
  corregido tras medir con conversación real (2026-08-23): el botón de
  envío existe en reposo, sólo que deshabilitado. El riesgo que se había
  anotado ("un clic con el compositor vacío abre el chat de voz") no aplica
  tal como se había descrito, aunque sigue siendo buena práctica no hacer
  clic con el compositor vacío. Enter manual confirmado por Juan; el envío
  real de la spec usa clic sobre el botón (ya con texto presente), no
  Enter — a diferencia de kimi. *MEDIDA, 2026-08-23.*

## Sobre qué es y qué no es

- Es un instrumento para **comparar** respuestas, no para determinar cuál
  es correcta.
- La verificación mecánica comprueba que una fuente citada **existe** y
  **coincide** (estado HTTP, DOI, título contra metadatos). **No** comprueba
  que la fuente **sostenga** la afirmación para la que se citó.
- El informe final lo produce un modelo (el noveno, `deepseek`). Es una
  afirmación con procedencia — trazable celda a celda hasta la matriz —, no
  un resultado verificado.
- Una afirmación sin fuentes se marca "sin fuentes" y no se verifica. Es un
  hallazgo, no un error silencioso.
