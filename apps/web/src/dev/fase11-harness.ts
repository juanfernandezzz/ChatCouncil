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

// --- §0.30: disponibilidad segun transporte ---
import { listPanelOptions } from "../lib/model-registry";
const opts = listPanelOptions({ byoaSessionConfirmed: new Set<string>() });
const byoa = opts.filter((o) => o.connectionMode === "byoa");
const page = byoa.filter((o) => o.providerId === "chatgpt");
const cookie = byoa.filter((o) => o.providerId === "claude");
t("un proveedor page esta disponible SIN deteccion previa", page.every((o) => o.available));
t("un proveedor cookie NO esta disponible sin deteccion", cookie.every((o) => !o.available));
const conDeteccion = listPanelOptions({ byoaSessionConfirmed: new Set(["claude"]) })
  .filter((o) => o.providerId === "claude");
t("un proveedor cookie se habilita al detectar", conDeteccion.every((o) => o.available));

// --- §0.32: override remoto de la spec de pagina ---
import { parsePageSpec, resolvePageSpec, __seedPageSpecCache, __resetPageSpecCache } from "../lib/page-spec-source";
import { BYOA_PROVIDERS } from "@chatcouncil/adapters";

const chatgpt = BYOA_PROVIDERS.chatgpt;
const compiled = chatgpt && chatgpt.authTransport === "page" ? chatgpt.page : null;
t("chatgpt sigue siendo proveedor page", compiled !== null);

const valida = {
  newConversationUrl: "https://x.test/",
  composer: { selector: "#c", kind: "contenteditable" },
  submit: { kind: "click", selector: "#s" },
  responseRoot: { selector: "main" },
  assistantMessage: { selector: "#a", pick: "last" },
  completion: { kind: "element-gone", selector: "#stop", quiescenceMs: 1500 },
};
t("una spec bien formada se acepta", parsePageSpec(valida) !== null);
t("se rechaza si falta un campo obligatorio", parsePageSpec({ ...valida, composer: undefined }) === null);
t("se rechaza un enum invalido", parsePageSpec({ ...valida, composer: { selector: "#c", kind: "raro" } }) === null);
t("se rechaza quiescenceMs no positivo", parsePageSpec({ ...valida, completion: { kind: "quiescence", quiescenceMs: 0 } }) === null);
t("se rechaza un timeout con tipo incorrecto", parsePageSpec({ ...valida, timeouts: { submitReadyMs: "8000" } }) === null);
t("se rechaza basura", parsePageSpec(null) === null && parsePageSpec("x") === null && parsePageSpec([]) === null);

__resetPageSpecCache();
if (compiled) {
  t("sin manifiesto cae al valor compilado", resolvePageSpec("chatgpt", compiled) === compiled);
  __seedPageSpecCache({ chatgpt: parsePageSpec(valida)! });
  t("con manifiesto valido usa el override", resolvePageSpec("chatgpt", compiled).composer.selector === "#c");
  t("un proveedor sin override sigue en compilado", resolvePageSpec("otro", compiled) === compiled);
  __resetPageSpecCache();
}

// --- §0.35: GLM registrado, exclude y modelLabel ---
const glm = BYOA_PROVIDERS.glm;
t("glm esta registrado como proveedor page", !!glm && glm.authTransport === "page");
if (glm && glm.authTransport === "page") {
  t("glm descarta el bloque de razonamiento", (glm.page.assistantMessage.exclude ?? []).length > 0);
  t("glm declara donde mirar la etiqueta de modelo", !!glm.page.modelLabel?.selector);
}
const conExclude = { ...valida, assistantMessage: { selector: "#a", pick: "last", exclude: [".x"] } };
t("se acepta exclude bien formado", parsePageSpec(conExclude) !== null);
t("se rechaza exclude que no es arreglo de strings",
  parsePageSpec({ ...valida, assistantMessage: { selector: "#a", pick: "last", exclude: [1] } }) === null);
t("se acepta modelLabel bien formado", parsePageSpec({ ...valida, modelLabel: { selector: "#m" } }) !== null);
t("se rechaza modelLabel mal formado", parsePageSpec({ ...valida, modelLabel: { selector: 1 } }) === null);

// el espejo estructural: agregar un proveedor page extiende los matches solo
import { BYOA_PAGE_MATCH_PATTERNS, BYOA_SESSION_ALLOWED_ORIGINS } from "@chatcouncil/adapters";
t("los matches incluyen a glm", BYOA_PAGE_MATCH_PATTERNS.some((m) => m.includes("chat.z.ai")));
t("glm NO entra al allowlist de cookie", !BYOA_SESSION_ALLOWED_ORIGINS.some((o) => o.includes("chat.z.ai")));

// --- §0.36: la prioridad de paneles NO puede desincronizarse del registro ---
// Se valida la FUENTE (el registro) y no el store: importar el store en
// vite-node arrastra Dexie y APIs de navegador que no existen aca.
const todosLosPaneles = listPanelOptions({ byoaSessionConfirmed: new Set<string>() }).map((o) => o.panelSourceId);
t("todo proveedor del registro es alcanzable como panel", todosLosPaneles.length >= 8);
t("glm figura entre los paneles posibles", todosLosPaneles.includes("byoa:glm"));
t("chatgpt figura entre los paneles posibles", todosLosPaneles.includes("byoa:chatgpt"));
t("claude figura entre los paneles posibles", todosLosPaneles.includes("byoa:claude"));
t("no hay panelSourceId duplicado", new Set(todosLosPaneles).size === todosLosPaneles.length);
// Un proveedor BYOA nuevo debe quedar alcanzable sin editar el store: se
// verifica que TODO id de BYOA_PROVIDERS tenga su panel correspondiente.
const byoaIds = Object.keys(BYOA_PROVIDERS).map((id) => `byoa:${id}`);
t("todo proveedor BYOA del registro tiene panel", byoaIds.every((id) => todosLosPaneles.includes(id)));

// --- §0.37: el meta se pasa OPACO, no enumerado ---
// Se verifica la mecanica de reenvio, que es lo que fallo dos veces: un
// campo nuevo del evento del ejecutor debe sobrevivir el salto sin que nadie
// lo agregue a una lista.
const EXCLUIDOS = ["kind", "text", "requestId", "marker", "envelope"];
const reenviar = (ev: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(ev).filter(([k]) => !EXCLUIDOS.includes(k)));

const evento = {
  kind: "done", requestId: "r1", marker: "m", envelope: "e",
  text: "CONTENIDO QUE NO DEBE VIAJAR EN META",
  elapsedMs: 100, visibility: "visible", hiddenMs: 0,
  modelLabel: "GLM-5.2",
  campoFuturoQueNadieEnumero: 42,
};
const meta = reenviar(evento);
t("el contenido de la respuesta NO viaja en meta", !("text" in meta));
t("modelLabel sobrevive el salto", meta.modelLabel === "GLM-5.2");
t("un campo nuevo sobrevive sin enumerarlo", meta.campoFuturoQueNadieEnumero === 42);
t("los campos de sobre no ensucian el meta",
  !("kind" in meta) && !("requestId" in meta) && !("marker" in meta) && !("envelope" in meta));
t("la telemetria de visibilidad sobrevive", meta.visibility === "visible" && meta.hiddenMs === 0);

console.log(`[fase11-harness] ${ok} OK · ${fail} FALLOS`);
if (fail > 0) process.exit(1);
