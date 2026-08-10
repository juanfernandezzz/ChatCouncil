import { buildBlocklistRegex, REDACTION_TOKEN } from "./provider-names";

/**
 * Anonimizador — capa 1 de 3 de la anonimización estructural.
 * (capa 2: `build-analyst-prompt.ts`; capa 3: `guard:sellado` en CI.)
 * ------------------------------------------------------------------
 * La numeración de fase que este encabezado traía —"Fase 5"— era de la v2 y
 * quedó desincronizada: en el plan vigente la capa de analistas es la
 * **Fase 3** (BLUEPRINT §5). El encabezado ya no numera fases a propósito:
 * una referencia de fase dentro de un módulo se desincroniza en cuanto el
 * roadmap se mueve, que es exactamente lo que pasó acá.
 *
 * ÚNICO módulo que decide qué etiqueta lleva cada respuesta. Produce
 * dos salidas deliberadamente separadas:
 *
 *   · `labeled` — {label, text}[] SIN identidad de proveedor: es lo
 *     único que build-analyst-prompt.ts acepta (el tipo no puede
 *     transportar identidad sin un cast deliberado).
 *   · `seal` — la correspondencia etiqueta→panel. Va al almacén y a la
 *     interfaz para des-referenciar al armar el informe final; JAMÁS al
 *     camino del prompt.
 *
 *     (Decía "va a Dexie (RoundAnalysis.labelMap)". Eso era la v2: la
 *     persistencia de hoy es un archivo append-only de una línea por hecho
 *     en `userData`, decisión 1 de la Fase 2. Se corrige porque un
 *     comentario que nombra un almacén que no existe manda a buscar el dato
 *     donde no está.)
 *
 * Con `anonymized: true` (el toggle sólo lo DESACTIVA):
 *   · etiquetas neutras "Modelo A/B/C…" en el orden recibido —barajado
 *     con semilla si se pasa una—
 *   · scrub de términos identificatorios del CONTENIDO → ▮▮▮, porque las
 *     respuestas se auto-identifican ("Soy Claude…") y eso rompe el
 *     análisis ciego por dentro. Sólo se toca la copia que va a los
 *     ANALISTAS; el original queda intacto. Cada redacción se cuenta.
 *
 * El prompt ORIGINAL del usuario no se scrubbea: es idéntico para
 * todas las respuestas y no revela qué etiqueta es qué proveedor
 * (mencionar "Claude" en la PREGUNTA no rompe la ceguera).
 */

export interface AnalyzableReply {
  panelSourceId: string;
  replyId: string;
  attemptId: string;
  /** Nombre visible (proveedor · modelo). Sólo llega al prompt con anonymized=false. */
  displayName: string;
  text: string;
}

export interface LabeledReply {
  label: string;
  text: string;
}

export interface SealEntry {
  label: string;
  panelSourceId: string;
  replyId: string;
  attemptId: string;
}

export interface RedactionCount {
  label: string;
  count: number;
}

export interface AnonymizeOutput {
  labeled: LabeledReply[];
  seal: SealEntry[];
  redactions: RedactionCount[];
}

const LABEL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * PRNG determinista (mulberry32). No hace falta aleatoriedad
 * criptográfica: lo único que importa es que la POSICIÓN no quede
 * correlacionada de forma estable con la IDENTIDAD del proveedor. Al ser
 * determinista dada la semilla, la ronda queda reproducible: se puede
 * volver a ver exactamente el orden que vio el analista.
 */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates con semilla. No muta la entrada. */
function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const rand = seededRandom(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function anonymizeReplies(
  replies: AnalyzableReply[],
  anonymized: boolean,
  /**
   * Semilla de barajado (§0.29). Cuando se pasa Y `anonymized` es true, el
   * ORDEN de las respuestas se baraja antes de etiquetar.
   *
   * POR QUÉ: sin esto las etiquetas seguían el orden de panel, que es
   * ESTABLE entre rondas — o sea que "Modelo A" era siempre el mismo
   * proveedor y la posición filtraba identidad. El sesgo de posición en
   * modelos evaluadores está documentado, así que un orden fijo contamina
   * el análisis con señal que no es contenido. Barajar lo corta.
   *
   * Sin semilla se conserva el comportamiento anterior (orden de panel),
   * para no alterar en silencio lo que ya estaba verificado.
   */
  shuffleSeed?: number,
): AnonymizeOutput {
  const source =
    anonymized && typeof shuffleSeed === "number" ? seededShuffle(replies, shuffleSeed) : replies;
  const labeled: LabeledReply[] = [];
  const seal: SealEntry[] = [];
  const redactions: RedactionCount[] = [];

  source.forEach((reply, i) => {
    const label = anonymized ? `Modelo ${LABEL_LETTERS[i % LABEL_LETTERS.length]}` : reply.displayName;
    let text = reply.text;
    let count = 0;
    if (anonymized) {
      const re = buildBlocklistRegex();
      text = text.replace(re, () => {
        count += 1;
        return REDACTION_TOKEN;
      });
    }
    labeled.push({ label, text });
    seal.push({ label, panelSourceId: reply.panelSourceId, replyId: reply.replyId, attemptId: reply.attemptId });
    if (count > 0) redactions.push({ label, count });
  });

  return { labeled, seal, redactions };
}
