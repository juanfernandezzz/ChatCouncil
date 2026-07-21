/**
 * Design tokens — ChatCouncil (Q26)
 * ------------------------------------------------------------------
 * FUENTE DE VERDAD REAL: apps/web/src/styles/globals.css (bloque
 * @theme de Tailwind v4). Este archivo espeja esos mismos valores en
 * TypeScript para consumirlos donde Tailwind no llega: series de
 * charts (recharts/chart.js), el generador de PDF (pdfmake no lee
 * CSS), y el media pack.
 *
 * Regla operativa: si cambias un color aca, cambia tambien el
 * @theme de globals.css en el mismo commit. Cuando el design system
 * crezca (Fase 5), esto deberia generarse desde una unica fuente
 * (ej. un script que parsee el @theme), pero para el scaffold inicial
 * mantenerlo espejado a mano es mas simple que un build step extra.
 */
export const colors = {
  bgBase: "#0A0A0A",
  surfaceElevated: "#141414",
  border: "#262626",
  accentPrimary: "#00E5FF", // streaming / activo
  accentSecondary: "#10B981", // exito / done
  textPrimary: "#EDEDED",
  textSecondary: "#8A8A8A",
  danger: "#F87171", // Fase 7 E4 — error/fallo (reemplaza text-red-400/bg-red-500 stock)
  warning: "#FBBF24", // Fase 7 E4 — advertencia (reemplaza text-yellow-500 stock)
} as const;

/**
 * Paleta de IMPRESIÓN (Fase 7 E5) — el PDF/DOCX es claro a propósito
 * (el tema oscuro no se imprime). Única fuente para los builders de
 * informe; los hexes locales de build-doc-definition/build-docx se
 * eliminaron a favor de este objeto.
 */
export const printColors = {
  ink: "#1a1a1a",
  muted: "#6b6b6b",
  rule: "#d9d9d9",
  codeBg: "#f2f2f2",
  accent: "#0d7f8c", // el cian del tema, oscurecido para papel
} as const;

export const fonts = {
  ui: '"Inter", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
} as const;

/** Mapeo de layout (Q23): cantidad de paneles -> grid-template-columns/rows. */
export const gridLayouts: Record<number, { cols: number; rows: number }> = {
  1: { cols: 1, rows: 1 },
  2: { cols: 2, rows: 1 },
  3: { cols: 3, rows: 1 },
  4: { cols: 2, rows: 2 },
  6: { cols: 3, rows: 2 },
  8: { cols: 4, rows: 2 },
  10: { cols: 5, rows: 2 },
};
