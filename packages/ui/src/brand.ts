/**
 * Marca ChatCouncil — Fase 7 E5
 * ------------------------------------------------------------------
 * Hub-and-spoke: nodo central = el prompt; 6 nodos perimetrales = el
 * consejo de modelos. Monocromo por diseño (funciona impresa en
 * escala de grises — requisito del PDF, Q28).
 *
 * ÚNICA fuente de la geometría. Todos los derivados (BrandMark en
 * JSX, favicon.svg, íconos de la extensión, primitivas canvas del
 * header del PDF) se generan DESDE acá — nunca se dibujan a mano dos
 * veces. Sin colores en este archivo: el color siempre llega como
 * parámetro (currentColor por defecto).
 */

export interface BrandMarkGeometry {
  /** Lado del viewBox cuadrado (unidades SVG). */
  viewBox: number;
  /** Nodo central (el prompt). */
  hub: { x: number; y: number; r: number };
  /** 6 nodos perimetrales (el consejo), desde -90° cada 60°. */
  nodes: { x: number; y: number; r: number }[];
  /** Radios hub→nodo, recortados: arrancan en r del hub, terminan donde empieza cada nodo. */
  spokes: { x1: number; y1: number; x2: number; y2: number }[];
  /** stroke-width de los radios (linecap round). */
  strokeWidth: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function brandMarkGeometry(): BrandMarkGeometry {
  const center = 50;
  const hubR = 9;
  const nodeR = 6.5;
  const ringR = 34;
  const strokeWidth = 3.5;

  const nodes: BrandMarkGeometry["nodes"] = [];
  const spokes: BrandMarkGeometry["spokes"] = [];
  for (let i = 0; i < 6; i++) {
    const theta = ((-90 + i * 60) * Math.PI) / 180;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    nodes.push({ x: round2(center + ringR * cos), y: round2(center + ringR * sin), r: nodeR });
    spokes.push({
      x1: round2(center + hubR * cos),
      y1: round2(center + hubR * sin),
      x2: round2(center + (ringR - nodeR) * cos),
      y2: round2(center + (ringR - nodeR) * sin),
    });
  }

  return { viewBox: 100, hub: { x: center, y: center, r: hubR }, nodes, spokes, strokeWidth };
}

export interface BrandMarkSvgOptions {
  color?: string;
  /** "none" (default) = sin tile de fondo; cualquier otro valor = fill del rect. */
  background?: string;
  backgroundRadius?: number;
}

/** SVG string standalone (favicon, media pack, README). */
export function brandMarkSvg({ color = "currentColor", background = "none", backgroundRadius = 20 }: BrandMarkSvgOptions = {}): string {
  const g = brandMarkGeometry();
  const bg =
    background !== "none"
      ? `<rect width="${g.viewBox}" height="${g.viewBox}" rx="${backgroundRadius}" fill="${background}"/>`
      : "";
  const spokes = g.spokes
    .map(
      (s) =>
        `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${color}" stroke-width="${g.strokeWidth}" stroke-linecap="round"/>`,
    )
    .join("");
  const circles = [
    `<circle cx="${g.hub.x}" cy="${g.hub.y}" r="${g.hub.r}" fill="${color}"/>`,
    ...g.nodes.map((n) => `<circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${color}"/>`),
  ].join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${g.viewBox} ${g.viewBox}">${bg}${spokes}${circles}</svg>`;
}
