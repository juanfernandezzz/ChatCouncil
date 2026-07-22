/**
 * Playwright — flujo crítico E2E (Fase 9, E1/E6)
 * ------------------------------------------------------------------
 * El test corre contra `vite preview` sirviendo el build REAL de
 * `dist/` (filosofía de gates del proyecto: se prueba lo compilado,
 * no el dev server). Requiere `pnpm build:web` previo — en CI el paso
 * de build viene antes; en local, correrlo a mano si dist/ no existe.
 *
 * retries: 0 a propósito — el transporte es mock de red determinista
 * (E1); un test flaky acá es un bug que debe fallar fuerte, no
 * re-intentarse hasta pasar.
 */
import { defineConfig } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
