/**
 * Registro curado de modelos intra-proveedor — ChatCouncil (Fase 4, E4)
 * ------------------------------------------------------------------
 * Decisión de la entrevista: CURADO, no discovery en vivo (para BYOA
 * evitaría un endpoint nuevo sin reconocimiento; para BYOK evitaría
 * llamadas extra). Mismo cuidado que ya tenía `defaultModel`: dato
 * frágil, con fecha, reemplazable a mano — acá formalizado por entrada.
 *
 * `verified` NO significa "el id existe" — significa "se probó con una
 * llamada real, de esta cuenta, contra ESTE camino de invocación". Un id
 * de modelo puede ser real y estar documentado oficialmente y aun así
 * llevar `verified: false` acá, si el camino específico (p. ej. el
 * endpoint interno de BYOA-claude, que es DISTINTO de la API pública)
 * nunca se probó con ese valor. Ver notas por entrada en cada registro.
 */
export interface CuratedModel {
  id: string;
  label: string;
  /** Probado con una llamada real por ESTE camino de invocación (no sólo "el id existe"). */
  verified: boolean;
  /** Por qué no está verificado, qué requiere, o riesgos de forma conocidos. */
  note?: string;
}
