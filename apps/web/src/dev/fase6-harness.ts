/* eslint-disable no-console */
import "fake-indexeddb/auto"; // PRIMERO: Dexie tiene que ver el IDB fake antes de abrir

import { db, createId, type Conversation, type PanelThread, type PromptTemplate, type Reply, type Round, type RoundAnalysis } from "../lib/db";
import { deleteConversationLocal } from "../lib/conversation-repo";
import { deleteTemplateWithTombstone } from "../lib/prompt-templates";
import {
  buildConversationFile,
  buildTombstoneFile,
  conversationFileName,
  decideLww,
  mergeTemplates,
  parseConversationFile,
  parseTemplatesFile,
  SYNC_SCHEMA_VERSION,
  TEMPLATES_FILE_NAME,
  type ConversationSyncData,
  type TemplatesSyncFileV1,
} from "../lib/sync/serialize";
import { buildReportMime, bytesToBase64, encodeSubject, toBase64Url } from "../lib/mail/build-mime";

/**
 * Harness de aceptación de Fase 6 — mitad OFFLINE (mismo patrón que
 * fase5-harness: vite-node + fake-indexeddb, persistido en src/dev
 * para que Code lo re-ejecute en la máquina real).
 *
 * Cubre lo verificable sin red ni consolas:
 *  · E1: contenido del archivo de sync (roundtrip completo, driveFileId
 *    excluido, labelMap/attempts/panelThreads incluidos, sin blobs)
 *  · Q17/E3: decideLww — todas las ramas, incluido el desempate del
 *    tombstone y la anti-resurrección
 *  · E3: deleteConversationLocal deja tombstone y limpia blobs
 *  · E2: mergeTemplates — LWW por-ítem en ambas direcciones, tombstones,
 *    no-resurrección, remoteStale
 *  · Camino A: buildReportMime — estructura MIME, base64url sin +/=,
 *    roundtrip byte a byte del adjunto, RFC 2047
 *  · Ley de hierro: el JSON serializado no contiene el prefijo del
 *    storage de llaves (el guard estático cubre el código; esto cubre
 *    el DATO)
 * La mitad ONLINE (Drive real entre dos navegadores + mail recibido)
 * es de Code — ver checklist §0.9.
 */

let pass = 0;
let failCount = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failCount += 1;
    failures.push(name + (detail ? ` — ${detail}` : ""));
    console.warn(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: createId("conv"),
    title: "Prueba de sync",
    createdAt: 1000,
    updatedAt: 5000,
    lockedModelIds: ["byok:openai", "byoa:claude"],
    hiddenModelIds: [],
    syncState: "local-only",
    driveFileId: "drive-file-LOCAL-ONLY",
    byoaOrgId: "org-123",
    ...overrides,
  };
}

function makeSyncData(conv: Conversation): ConversationSyncData {
  const round: Round = {
    id: createId("round"),
    conversationId: conv.id,
    index: 0,
    promptText: "¿Cuál es la capital de Australia?",
    attachments: [{ id: "att1", name: "nota.txt", mimeType: "text/plain", size: 12, blobId: "blob-1" }],
    toggles: { webSearch: false, imageGeneration: false },
    createdAt: 1100,
  };
  const reply: Reply = {
    id: createId("reply"),
    roundId: round.id,
    conversationId: conv.id,
    panelSourceId: "byok:openai",
    modelId: "gpt-4o",
    connectionMode: "byok",
    scope: "round",
    createdAt: 1200,
    attempts: [
      { id: "a1", status: "error", content: "", startedAt: 1200, finishedAt: 1210, errorMessage: "timeout" },
      { id: "a2", status: "done", content: "Canberra.", startedAt: 1300, finishedAt: 1350, latencyMs: 50 },
    ],
  };
  const analysis: RoundAnalysis = {
    id: createId("analysis"),
    conversationId: conv.id,
    roundId: round.id,
    kind: "compare",
    createdAt: 1400,
    judgePanelSourceId: "byoa:claude",
    judgeWasParticipant: true,
    anonymized: true,
    labelMap: [{ label: "Respuesta A", panelSourceId: "byok:openai", replyId: "reply-1", attemptId: "a2" }],
    redactions: [],
    rubricVersion: 1,
    status: "ok",
    rawResponse: "{}",
  };
  const thread: PanelThread = {
    id: createId("thread"),
    conversationId: conv.id,
    panelSourceId: "byoa:claude",
    providerConversationId: "prov-conv-1",
    lastMessageId: "msg-9",
    updatedAt: 1500,
  };
  return { conversation: conv, rounds: [round], replies: [reply], roundAnalyses: [analysis], panelThreads: [thread] };
}

function tpl(id: string, updatedAt: number, title = `tpl-${id}`): PromptTemplate {
  return { id, title, body: "Hola {{nombre}}", tags: ["t"], createdAt: 100, updatedAt };
}

async function main() {
  console.log("\n[fase6-harness] E1 — serialización de conversación");
  {
    const conv = makeConversation();
    const data = makeSyncData(conv);
    const file = buildConversationFile(data);
    const json = JSON.stringify(file);
    const reparsed = parseConversationFile(json);

    check("schemaVersion presente", file.schemaVersion === SYNC_SCHEMA_VERSION);
    check("reloj LWW = conversation.updatedAt", file.updatedAt === conv.updatedAt);
    check("driveFileId EXCLUIDO (metadata local, no contenido)", !json.includes("driveFileId") && !json.includes("drive-file-LOCAL-ONLY"));
    check("byoaOrgId incluido (identificador no secreto, E1)", file.conversation?.byoaOrgId === "org-123");
    check("attempts completos incluidos (Q15: historial de fallos)", file.replies?.[0]?.attempts.length === 2 && file.replies[0].attempts[0]?.status === "error");
    check("labelMap incluido (sello de auditoría, E1)", file.roundAnalyses?.[0]?.labelMap.length === 1);
    check("panelThreads incluidos", file.panelThreads?.[0]?.providerConversationId === "prov-conv-1");
    check("attachments = SOLO metadata (blobId referencial, sin datos)", json.includes('"blobId":"blob-1"') && !json.includes('"data"'));
    check("roundtrip parse OK", reparsed !== null && reparsed.conversationId === conv.id && reparsed.rounds?.length === 1);
    check("ley de hierro: el DATO serializado no contiene el prefijo de llaves", !json.includes("chatcouncil:byok:key"));
    check("nombre de archivo estable", conversationFileName(conv.id) === `conv_${conv.id}.json`);
    check("parse rechaza basura", parseConversationFile("{no json") === null && parseConversationFile('{"schemaVersion":99}') === null);
  }

  console.log("\n[fase6-harness] Q17/E3 — decideLww");
  {
    const conv = makeConversation({ updatedAt: 5000 });
    const contentFile = buildConversationFile(makeSyncData(conv));
    check("remoto más nuevo → apply-remote", decideLww({ updatedAt: 4000, deletedAt: null }, contentFile).action === "apply-remote");
    check("local más nuevo → push-local", decideLww({ updatedAt: 6000, deletedAt: null }, contentFile).action === "push-local");
    check("empate → noop", decideLww({ updatedAt: 5000, deletedAt: null }, contentFile).action === "noop");
    check("no existe local → apply-remote", decideLww({ updatedAt: null, deletedAt: null }, contentFile).action === "apply-remote");

    const tombRemote = buildTombstoneFile(conv.id, 7000);
    check("tombstone remoto más nuevo → delete-local", decideLww({ updatedAt: 5000, deletedAt: null }, tombRemote).action === "delete-local");
    check("tombstone local más nuevo que contenido remoto → push-tombstone (anti-resurrección)", decideLww({ updatedAt: null, deletedAt: 9000 }, contentFile).action === "push-tombstone");
    check("tombstone local vs tombstone remoto viejo → push-tombstone", decideLww({ updatedAt: null, deletedAt: 9000 }, tombRemote).action === "push-tombstone");
    check("tombstone remoto más nuevo que tombstone local → delete-local (idempotente)", decideLww({ updatedAt: null, deletedAt: 6000 }, tombRemote).action === "delete-local");
  }

  console.log("\n[fase6-harness] E3 — deleteConversationLocal deja tombstone");
  {
    const conv = makeConversation();
    const data = makeSyncData(conv);
    await db.conversations.put(conv);
    await db.rounds.bulkPut(data.rounds);
    await db.replies.bulkPut(data.replies);
    await db.roundAnalyses.bulkPut(data.roundAnalyses);
    await db.panelThreads.bulkPut(data.panelThreads);
    await db.blobs.put({ id: "blob-1", data: new Blob(["hola"]) });

    await deleteConversationLocal(conv.id);
    const [c, r, rep, an, th, blob, meta] = await Promise.all([
      db.conversations.get(conv.id),
      db.rounds.where("conversationId").equals(conv.id).count(),
      db.replies.where("conversationId").equals(conv.id).count(),
      db.roundAnalyses.where("conversationId").equals(conv.id).count(),
      db.panelThreads.where("[conversationId+panelSourceId]").between([conv.id, ""], [conv.id, "\uffff"]).count(),
      db.blobs.get("blob-1"),
      db.syncMeta.get(conv.id),
    ]);
    check("conversación y contenido borrados", c === undefined && r === 0 && rep === 0 && an === 0 && th === 0);
    check("blob del attachment borrado", blob === undefined);
    check("tombstone en syncMeta (deleted + deletedAt + pendiente de push)", meta?.deleted === true && typeof meta.deletedAt === "number" && meta.tombstonePushed === false);
  }

  console.log("\n[fase6-harness] E2 — mergeTemplates");
  {
    // Dirección remoto→local: remoto más nuevo gana
    const m1 = mergeTemplates([tpl("x", 100, "local-viejo")], [], { schemaVersion: 1, templates: [tpl("x", 200, "remoto-nuevo")], tombstones: [] });
    check("remoto más nuevo → upsertLocal", m1.upsertLocal.length === 1 && m1.upsertLocal[0]?.title === "remoto-nuevo");
    check("resuelto queda con el ganador", m1.resolved.templates[0]?.title === "remoto-nuevo");
    check("remoto ya al día → remoteStale false", m1.remoteStale === false);

    // Dirección local→remoto: local más nuevo gana
    const m2 = mergeTemplates([tpl("x", 300, "local-nuevo")], [], { schemaVersion: 1, templates: [tpl("x", 200, "remoto-viejo")], tombstones: [] });
    check("local más nuevo → sin upsertLocal y remoteStale true", m2.upsertLocal.length === 0 && m2.remoteStale === true && m2.resolved.templates[0]?.title === "local-nuevo");

    // Tombstone remoto borra local
    const m3 = mergeTemplates([tpl("x", 100)], [], { schemaVersion: 1, templates: [], tombstones: [{ id: "x", deletedAt: 200 }] });
    check("tombstone remoto más nuevo → deleteLocal", m3.deleteLocal.includes("x") && m3.resolved.templates.length === 0);
    check("tombstone sobrevive en el resuelto (anti-resurrección)", m3.resolved.tombstones.some((t) => t.id === "x"));

    // No-resurrección inversa: tombstone local vs copia remota vieja
    const m4 = mergeTemplates([], [{ id: "x", deletedAt: 500 }], { schemaVersion: 1, templates: [tpl("x", 400, "zombie")], tombstones: [] });
    check("tombstone local mata la copia remota vieja", m4.resolved.templates.length === 0 && m4.upsertLocal.length === 0 && m4.remoteStale === true);

    // Recreación posterior al borrado: updatedAt > deletedAt revive legítimamente
    const m5 = mergeTemplates([], [{ id: "x", deletedAt: 500 }], { schemaVersion: 1, templates: [tpl("x", 600, "recreada")], tombstones: [] });
    check("edición posterior al borrado gana al tombstone", m5.resolved.templates[0]?.title === "recreada" && m5.upsertLocal.length === 1);

    // Merge disjunto: unión de ambos lados
    const m6 = mergeTemplates([tpl("a", 100)], [], { schemaVersion: 1, templates: [tpl("b", 100)], tombstones: [] });
    check("ítems disjuntos se unen", m6.resolved.templates.length === 2 && m6.upsertLocal.length === 1 && m6.remoteStale === true);

    // Sin remoto (primer push)
    const m7 = mergeTemplates([tpl("a", 100)], [], null);
    check("sin archivo remoto → remoteStale true (primer push)", m7.remoteStale === true && m7.resolved.templates.length === 1);

    const roundtrip = parseTemplatesFile(JSON.stringify(m6.resolved));
    check("templates.json roundtrip parse", roundtrip !== null && roundtrip.templates.length === 2);
    check("nombre de archivo de templates estable", TEMPLATES_FILE_NAME === "templates.json");
  }

  console.log("\n[fase6-harness] E2 — deleteTemplateWithTombstone (Dexie)");
  {
    const t = tpl("del-1", 100);
    await db.promptTemplates.put(t);
    await deleteTemplateWithTombstone(t.id);
    const [gone, meta] = await Promise.all([db.promptTemplates.get(t.id), db.syncMeta.get(`tpl:${t.id}`)]);
    check("plantilla borrada + tombstone tpl:<id> en syncMeta", gone === undefined && meta?.kind === "template" && meta.deleted === true && typeof meta.deletedAt === "number");
  }

  console.log("\n[fase6-harness] camino A — buildReportMime");
  {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0xff, 0x00, 0x7b]); // "%PDF-" + bytes no-ASCII
    const docxBytes = new Uint8Array(300).map((_, i) => (i * 7) % 256);
    const built = buildReportMime({
      to: "juan@example.com",
      subject: "ChatCouncil — informe: Prueba con acentos áéñ",
      bodyText: "Cuerpo de prueba.\n",
      attachments: [
        { filename: "informe.pdf", mimeType: "application/pdf", bytes: pdfBytes },
        { filename: "informe.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: docxBytes },
      ],
    });
    check("headers de sobre presentes", built.mime.startsWith("To: juan@example.com\r\n") && built.mime.includes("MIME-Version: 1.0"));
    check("subject no-ASCII va RFC 2047", built.mime.includes("Subject: =?UTF-8?B?") && !built.mime.includes("áéñ"));
    check("subject ASCII queda plano", encodeSubject("plain subject") === "plain subject");
    check("multipart/mixed con boundary declarado y de cierre", /Content-Type: multipart\/mixed; boundary="([^"]+)"/.test(built.mime) && /--chatcouncil_[0-9a-f]+--\r\n$/.test(built.mime));
    check("dos adjuntos con Content-Disposition", (built.mime.match(/Content-Disposition: attachment/g) ?? []).length === 2);
    check("raw es base64url puro (sin +, /, =)", /^[A-Za-z0-9_-]+$/.test(built.raw));
    check("sizeBytes coincide con el MIME real", built.sizeBytes === new TextEncoder().encode(built.mime).length);

    // Roundtrip byte a byte del adjunto PDF desde el MIME
    const attSection = built.mime.split("Content-Transfer-Encoding: base64\r\n\r\n")[2] ?? "";
    const attB64 = (attSection.split("\r\n--")[0] ?? "").replaceAll("\r\n", "");
    check("base64 del adjunto = bytes originales", attB64 === bytesToBase64(pdfBytes));
    // 76 aplica a los CUERPOS transfer-encoded; los headers sólo tienen el MUST de 998 (RFC 5322).
    const bodyBlocks = built.mime.split("Content-Transfer-Encoding: base64\r\n\r\n").slice(1);
    const bodyLines = bodyBlocks.flatMap((b) => (b.split("\r\n--")[0] ?? "").split("\r\n"));
    check("cuerpos base64 en líneas ≤ 76", bodyLines.length > 0 && bodyLines.every((l) => l.length <= 76));
    check("ninguna línea supera el MUST de RFC 5322 (998)", built.mime.split("\r\n").every((l) => l.length <= 998));
    // std base64 de [0xfb,0xef,0xff] = "++//" → base64url "--__" (mapeo exacto de los chars reservados)
    check("toBase64Url mapea + y / exactamente", toBase64Url(new Uint8Array([0xfb, 0xef, 0xff])) === "--__" && bytesToBase64(new Uint8Array([0xfb, 0xef, 0xff])) === "++//");
  }

  console.log(`\n[fase6-harness] ${pass} OK · ${failCount} FALLOS`);
  if (failCount > 0) {
    console.error("Fallos:\n" + failures.map((f) => `  · ${f}`).join("\n"));
    process.exit(1);
  }
  await db.delete();
}

void main();
