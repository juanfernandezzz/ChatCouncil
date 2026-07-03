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
