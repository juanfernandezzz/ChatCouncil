import { db } from "./db";

/**
 * Interpolación de plantillas — ChatCouncil Fase 5 (Q29)
 * ------------------------------------------------------------------
 * El esquema PromptTemplate existe desde Fase 0 (db.ts, con *tags
 * indexados); esta fase agrega SOLO la UI de gestión y esta lógica de
 * `{{variable}}`. Reglas v1, deliberadamente simples:
 *
 *  · variable = lo que haya entre {{ y }} (trim), sin llaves anidadas
 *  · duplicadas se piden UNA vez (dedup preservando orden de aparición)
 *  · valores vacíos PERMITIDOS (la UI avisa, no bloquea) — se
 *    reemplazan por "" igual que cualquier otro valor
 *  · sin escapes ni anidamiento: fuera de alcance v1
 */

const VARIABLE_RE = /\{\{([^{}]+)\}\}/g;

export function extractTemplateVariables(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of body.matchAll(VARIABLE_RE)) {
    const name = (m[1] ?? "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export function interpolateTemplate(body: string, values: Record<string, string>): string {
  return body.replace(VARIABLE_RE, (whole, rawName: string) => {
    const name = rawName.trim();
    if (!name) return whole;
    return values[name] ?? "";
  });
}

/**
 * Borrado con tombstone (Fase 6, E2): sin el registro en syncMeta, el
 * merge por-ítem de templates.json resucitaría la plantilla borrada
 * en el próximo pull (el otro navegador la re-aportaría). La UI debe
 * borrar por acá, nunca con db.promptTemplates.delete directo.
 */
export async function deleteTemplateWithTombstone(templateId: string): Promise<void> {
  const deletedAt = Date.now();
  await db.transaction("rw", [db.promptTemplates, db.syncMeta], async () => {
    await db.promptTemplates.delete(templateId);
    await db.syncMeta.put({ id: `tpl:${templateId}`, kind: "template", deleted: true, deletedAt });
  });
}
