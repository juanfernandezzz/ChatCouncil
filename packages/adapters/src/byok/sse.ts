/**
 * Decoder SSE incremental — @chatcouncil/adapters (Fase 2)
 * ------------------------------------------------------------------
 * Los transportes entregan texto en piezas ARBITRARIAS (cortes de red o
 * de relay del puente que no respetan límites de evento). Este decoder
 * bufferiza y emite eventos completos: bloques separados por línea en
 * blanco, campos `event:` / `data:` (multilínea → join "\n"), comentarios
 * `:` ignorados, tolerante a CRLF. Deliberadamente NO interpreta el
 * `data` (eso es del dialecto de cada proveedor) ni soporta `id:`/
 * `retry:` (ningún proveedor BYOK de Fase 2 los usa para semántica).
 *
 * `end()` es leniente: si el cuerpo terminó sin línea en blanco final
 * (visto en streams EOF-terminados como Gemini), el bloque residual se
 * parsea igual en vez de descartarse en silencio.
 */

export interface SseEvent {
  event: string;
  data: string;
}

const BLOCK_SEPARATOR = /\r?\n\r?\n/;

function parseBlock(block: string): SseEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const rawLine of block.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (!line || line.startsWith(":")) continue; // vacío o comentario
    const idx = line.indexOf(":");
    const field = idx === -1 ? line : line.slice(0, idx);
    let value = idx === -1 ? "" : line.slice(idx + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
    // otros campos: ignorados a propósito (ver header)
  }
  if (data.length === 0) return null;
  return { event, data: data.join("\n") };
}

export interface SseDecoder {
  push(text: string): SseEvent[];
  end(): SseEvent[];
}

export function createSseDecoder(): SseDecoder {
  let buf = "";
  return {
    push(text: string): SseEvent[] {
      buf += text;
      const events: SseEvent[] = [];
      for (;;) {
        const m = buf.match(BLOCK_SEPARATOR);
        if (!m || m.index === undefined) break;
        const block = buf.slice(0, m.index);
        buf = buf.slice(m.index + m[0]!.length);
        const ev = parseBlock(block);
        if (ev) events.push(ev);
      }
      return events;
    },
    end(): SseEvent[] {
      const rest = buf;
      buf = "";
      if (!rest.trim()) return [];
      const ev = parseBlock(rest);
      return ev ? [ev] : [];
    },
  };
}
