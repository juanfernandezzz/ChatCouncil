/**
 * Builder del prompt del juez — ChatCouncil Fase 5 (Q30/E2, capa 2)
 * ------------------------------------------------------------------
 * MÓDULO SELLADO: cero imports POR DISEÑO (scripts/guard-judge-anonymity
 * rompe el build si aparece uno). Este archivo no puede conocer
 * proveedores, modelos, la base de datos ni el store: su input es el
 * tipo anonimizado {label, text} y nada más. La identidad de proveedor
 * no tiene por dónde entrar al prompt sin un cast deliberado en el
 * llamador — que a su vez está limitado por el guard.
 *
 * La rúbrica v1 (Q30) es FIJA: corrección factual aparente,
 * profundidad, señales de sesgo, tono.
 */

export interface JudgeReplyInput {
  label: string;
  text: string;
}

export interface JudgePromptInput {
  kind: "compare" | "summarize";
  /** Pregunta original del usuario (idéntica para todas las respuestas — no rompe la ceguera). */
  originalPrompt: string;
  replies: JudgeReplyInput[];
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

function repliesSection(replies: JudgeReplyInput[]): string {
  return replies
    .map((r) => `### Respuesta ${r.label}\n${r.text.trim() || "(respuesta vacía)"}`)
    .join("\n\n");
}

export function buildJudgePrompt(input: JudgePromptInput): string {
  const header =
    input.kind === "compare"
      ? [
          "Eres un auditor imparcial de respuestas de modelos de lenguaje.",
          "Vas a recibir UNA pregunta y varias respuestas etiquetadas. No sabés qué sistema produjo cada una y no debés especularlo: evaluá SOLO el texto.",
          "Evaluá cada respuesta con esta rúbrica fija:",
          "· corrección factual APARENTE (verificable desde el propio texto y conocimiento general; 1 = errores graves, 5 = sin errores aparentes)",
          "· profundidad (1 = superficial, 5 = trata mecanismos, matices y límites)",
          "· señales de sesgo (encuadres cargados, omisiones sistemáticas, favoritismos)",
          "· tono (registro, seguridad, hedging)",
          "Si algún fragmento aparece tapado como ▮▮▮, tratalo como texto ilegible sin especular qué decía.",
          "Responde ÚNICAMENTE con un objeto JSON válido, sin backticks, sin texto antes ni después, con EXACTAMENTE esta forma:",
          COMPARE_SCHEMA,
        ]
      : [
          "Eres un sintetizador imparcial de respuestas de modelos de lenguaje.",
          "Vas a recibir UNA pregunta y varias respuestas etiquetadas. Resumí el conjunto con fidelidad, marcando coincidencias y divergencias entre respuestas (citá etiquetas cuando corresponda).",
          "Si algún fragmento aparece tapado como ▮▮▮, tratalo como texto ilegible sin especular qué decía.",
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
