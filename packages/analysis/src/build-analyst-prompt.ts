/**
 * Builder del prompt de los ANALISTAS — capa 2 de la anonimización
 * estructural (capa 1: `anonymize.ts`; capa 3: el gate en CI).
 * ------------------------------------------------------------------
 * MÓDULO SELLADO: cero imports POR DISEÑO (`scripts/guard-sellado.mjs`
 * rompe el build si aparece uno). Este archivo no puede conocer
 * proveedores, modelos, el almacén ni el estado de la aplicación: su
 * input es el tipo anonimizado {label, text} y nada más. La identidad
 * de proveedor no tiene por dónde entrar al prompt sin un cast
 * deliberado en el llamador — que a su vez está limitado por el gate.
 *
 * VOCABULARIO. Acá no hay "juez": las tres funciones del plan son
 * INVESTIGADORES, ANALISTAS y OPERADOR (BLUEPRINT §1). El nombre viejo
 * —heredado de la v2— describía un ROL que ya no existe; el nuevo
 * describe a quién va dirigido el prompt que este módulo construye.
 *
 * La rúbrica de esta versión es FIJA: corrección factual aparente,
 * profundidad, señales de sesgo, tono. Es la heredada de la v2 y sigue
 * en pie porque nadie la llama todavía: la Fase 3 define dos plantillas
 * nuevas —ronda VERIFICABLE y ronda NO VERIFICABLE— y ahí se decide qué
 * pasa con ésta.
 *
 * PENDIENTE, y se anota en vez de resolverse solo: el esquema de salida
 * de `compare` todavía tiene un campo llamado "veredicto", palabra que
 * el plan vigente excluye junto con "juez". Cambiarlo altera el
 * contrato de salida que el modelo tiene que producir, o sea el
 * instrumento, no el vocabulario del repositorio. Se deja como está y
 * se decide con Juan al definir las plantillas de la Fase 3.
 */

export interface AnalystReplyInput {
  label: string;
  text: string;
}

export interface AnalystPromptInput {
  kind: "compare" | "summarize";
  /** Pregunta original del usuario (idéntica para todas las respuestas — no rompe la ceguera). */
  originalPrompt: string;
  replies: AnalystReplyInput[];
}

const COMPARE_SCHEMA = `{
  "veredicto": "1-3 frases con la lectura global",
  "porRespuesta": [
    {
      "label": "<etiqueta EXACTA de la respuesta>",
      "correccionFactual": { "score": 1-5, "nota": "breve justificación" },
      "profundidad": { "score": 1-5, "nota": "breve justificación" },
      "senalesSesgo": "señales de sesgo detectadas, o 'ninguna aparente'",
      "tono": "descripción breve del tono"
    }
  ]
}`;

const SUMMARIZE_SCHEMA = `{
  "resumen": "síntesis fiel del conjunto en un párrafo",
  "coincidencias": ["punto en el que las respuestas coinciden", "..."],
  "divergencias": ["punto en el que las respuestas divergen", "..."]
}`;

function repliesSection(replies: AnalystReplyInput[]): string {
  return replies
    .map((r) => `### Respuesta ${r.label}\n${r.text.trim() || "(respuesta vacía)"}`)
    .join("\n\n");
}

export function buildAnalystPrompt(input: AnalystPromptInput): string {
  const header =
    input.kind === "compare"
      ? [
          "Eres un auditor imparcial de respuestas de modelos de lenguaje.",
          "Vas a recibir UNA pregunta y varias respuestas etiquetadas. No sabes qué sistema produjo cada una y no debes especularlo: evalúa SOLO el texto.",
          "Evalúa cada respuesta con esta rúbrica fija:",
          "· corrección factual APARENTE (verificable desde el propio texto y conocimiento general; 1 = errores graves, 5 = sin errores aparentes)",
          "· profundidad (1 = superficial, 5 = trata mecanismos, matices y límites)",
          "· señales de sesgo (encuadres cargados, omisiones sistemáticas, favoritismos)",
          "· tono (registro, seguridad, hedging)",
          "Si algún fragmento aparece tapado como ▮▮▮, trátalo como texto ilegible sin especular qué decía.",
          "Responde ÚNICAMENTE con un objeto JSON válido, sin backticks, sin texto antes ni después, con EXACTAMENTE esta forma:",
          COMPARE_SCHEMA,
        ]
      : [
          "Eres un sintetizador imparcial de respuestas de modelos de lenguaje.",
          "Vas a recibir UNA pregunta y varias respuestas etiquetadas. Resume el conjunto con fidelidad, marcando coincidencias y divergencias entre respuestas (cita etiquetas cuando corresponda).",
          "Si algún fragmento aparece tapado como ▮▮▮, trátalo como texto ilegible sin especular qué decía.",
          "Responde ÚNICAMENTE con un objeto JSON válido, sin backticks, sin texto antes ni después, con EXACTAMENTE esta forma:",
          SUMMARIZE_SCHEMA,
        ];

  return [
    header.join("\n"),
    "",
    "## Pregunta original",
    input.originalPrompt.trim(),
    "",
    "## Respuestas a evaluar",
    repliesSection(input.replies),
  ].join("\n");
}
