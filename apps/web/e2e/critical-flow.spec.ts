/**
 * Flujo crítico end-to-end (Fase 9, E1) — SIN extensión, SIN llaves
 * reales, SIN red real.
 *
 * Camino verificado: llaves (falsas) en el vault → routing direct
 * (effectiveCorsStatus declarado; openai `supported`, anthropic
 * `supported-with-header`) → fetch desde la página (interceptado por
 * `page.route`) → parser SSE del dialecto REAL de cada proveedor →
 * persistencia Dexie + lock de layout (Q14) → streaming visible en
 * N=2 paneles → "Exportar PDF" descarga un PDF real (pdfmake).
 *
 * Lo que NO cubre (a propósito, E2): el puente de la extensión (BYOA
 * y proxy BYOK) — verificado por fase en el Chrome real; cargar la
 * extensión en el Chromium de CI multiplica fragilidad sin cubrir el
 * criterio de aceptación de la fase.
 *
 * Los textos de respuesta son distintivos por proveedor: si aparecen
 * en la UI sólo pueden haber salido del mock atravesando el pipeline
 * completo — no hay otra fuente posible.
 */
import { expect, test } from "@playwright/test";

const OPENAI_REPLY = "Consejo simulado de OpenAI para el flujo critico.";
const ANTHROPIC_REPLY = "Consejo simulado de Anthropic para el flujo critico.";

/** Dialecto openai-compat: `data: {choices[].delta.content}` + usage + [DONE]. */
function openAiSseBody(): string {
  const words = OPENAI_REPLY.split(" ");
  const frames = words.map((w, i) =>
    `data: ${JSON.stringify({ choices: [{ delta: { content: (i > 0 ? " " : "") + w } }] })}\n\n`,
  );
  frames.push(
    `data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 7, completion_tokens: words.length } })}\n\n`,
  );
  frames.push("data: [DONE]\n\n");
  return frames.join("");
}

/** Dialecto Anthropic Messages: eventos nombrados message_start → deltas → message_stop. */
function anthropicSseBody(): string {
  const words = ANTHROPIC_REPLY.split(" ");
  const frames: string[] = [
    `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 7 } } })}\n\n`,
  ];
  for (const [i, w] of words.entries()) {
    frames.push(
      `event: content_block_delta\ndata: ${JSON.stringify({
        type: "content_block_delta",
        delta: { type: "text_delta", text: (i > 0 ? " " : "") + w },
      })}\n\n`,
    );
  }
  frames.push(
    `event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", usage: { output_tokens: words.length } })}\n\n`,
  );
  frames.push(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);
  return frames.join("");
}

test("prompt → streaming en 2 paneles → exportar PDF", async ({ page }) => {
  let openAiHit = false;
  let anthropicHit = false;

  await page.route("https://api.openai.com/v1/chat/completions", async (route) => {
    openAiHit = true;
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body: openAiSseBody(),
    });
  });
  await page.route("https://api.anthropic.com/v1/messages", async (route) => {
    anthropicHit = true;
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body: anthropicSseBody(),
    });
  });

  await page.goto("/");

  // Fase 10 (§0.12): las llaves FALSAS entran POR LA UI del panel de
  // cuentas — el mismo recorrido de primer uso de un usuario real, que
  // era exactamente lo que el sembrado por addInitScript escondía
  // (hallazgo de proceso del roadmap v2). Nunca tocan una red real:
  // los endpoints están interceptados arriba.
  await page.getByRole("button", { name: "Cuentas" }).click();
  await page.getByLabel("Llave de API de ChatGPT (OpenAI)").fill("sk-e2e-fake-openai");
  await page.getByRole("button", { name: "Guardar la llave de ChatGPT (OpenAI)" }).click();
  await page.getByLabel("Llave de API de Claude (Anthropic)").fill("sk-ant-e2e-fake");
  await page.getByRole("button", { name: "Guardar la llave de Claude (Anthropic)" }).click();
  await page.getByRole("button", { name: "Cerrar" }).click();

  // Pre-lock: reducir el consejo a 2 paneles → top-2 de la prioridad
  // por defecto = byok:openai + byok:anthropic (los dos con llave).
  await page.getByRole("button", { name: "2", exact: true }).click();
  await expect(page.getByText("ChatGPT (OpenAI)").first()).toBeVisible();
  await expect(page.getByText("Claude (Anthropic)").first()).toBeVisible();

  await page
    .getByPlaceholder("Prompt para todo el consejo…")
    .fill("¿Cuál es el veredicto del consejo?");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();

  // Streaming completado en ambos paneles (el texto sólo puede venir
  // del mock) + lock de layout disparado por el primer envío (Q14).
  await expect(page.getByText(OPENAI_REPLY)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(ANTHROPIC_REPLY)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("layout bloqueado", { exact: false })).toBeVisible();
  expect(openAiHit, "el mock de api.openai.com tiene que haber sido atravesado").toBe(true);
  expect(anthropicHit, "el mock de api.anthropic.com tiene que haber sido atravesado").toBe(true);

  // Exportar PDF: descarga real generada por pdfmake (chunk dinámico
  // servido por el preview del build).
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);

  const path = await download.path();
  expect(path).not.toBeNull();
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(path!);
  expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect(bytes.length).toBeGreaterThan(1_000);
});
