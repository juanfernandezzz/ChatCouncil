import { anonymizeReplies, type AnalyzableReply } from "../lib/judge/anonymize";
let ok = 0, fail = 0;
const t = (name: string, cond: boolean) => { if (cond) { ok++; } else { fail++; console.log("  FALLO:", name); } };
const mk = (n: number): AnalyzableReply[] =>
  Array.from({ length: n }, (_, i) => ({
    panelSourceId: `p${i}`, replyId: `r${i}`, attemptId: `a${i}`,
    displayName: `Prov${i}`, text: `respuesta ${i}`,
  }) as AnalyzableReply);

const replies = mk(4);

// 1. sin semilla: comportamiento anterior intacto (orden de panel)
const a = anonymizeReplies(replies, true);
t("sin semilla conserva el orden de panel", a.seal[0]!.panelSourceId === "p0");

// 2. determinismo: misma semilla, mismo orden
const b1 = anonymizeReplies(replies, true, 12345);
const b2 = anonymizeReplies(replies, true, 12345);
t("misma semilla produce el mismo orden",
  JSON.stringify(b1.seal.map(s => s.panelSourceId)) === JSON.stringify(b2.seal.map(s => s.panelSourceId)));

// 3. el barajado efectivamente cambia el orden en alguna semilla
const orders = new Set<string>();
for (let seed = 1; seed <= 40; seed++) {
  orders.add(anonymizeReplies(replies, true, seed).seal.map(s => s.panelSourceId).join(","));
}
t("distintas semillas producen ordenes distintos", orders.size > 1);

// 4. no se pierde ni se duplica ninguna respuesta
const c = anonymizeReplies(replies, true, 999);
t("conserva las 4 respuestas", c.seal.length === 4);
t("sin duplicados", new Set(c.seal.map(s => s.panelSourceId)).size === 4);

// 5. el sello sigue mapeando etiqueta -> panel correctamente tras barajar
const seedD = 777;
const d = anonymizeReplies(replies, true, seedD);
const okMap = d.labeled.every((l, i) => {
  const sealed = d.seal[i]!;
  const orig = replies.find(r => r.panelSourceId === sealed.panelSourceId)!;
  return l.label === sealed.label && l.text === orig.text;
});
t("el sello sigue mapeando etiqueta->panel tras barajar", okMap);

// 6. las etiquetas no filtran identidad
t("las etiquetas son genericas", d.labeled.every(l => /^Modelo [A-Z]$/.test(l.label)));

// 7. sin anonimizar no baraja (la UI muestra orden de panel)
const e = anonymizeReplies(replies, false, 12345);
t("sin anonimizar conserva el orden de panel", e.seal[0]!.panelSourceId === "p0");

console.log(`[fase11-harness] ${ok} OK · ${fail} FALLOS`);
if (fail > 0) process.exit(1);
