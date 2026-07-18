/**
 * build-mime — MIME multipart/mixed para Gmail API (Fase 6, camino A)
 * ------------------------------------------------------------------
 * Módulo PURO y portable (sin btoa/Buffer: base64 propio sobre
 * Uint8Array) — el harness lo verifica offline byte a byte. El
 * mensaje completo se codifica en base64url y va en `raw` a
 * `users.messages.send`.
 *
 * v1 deliberadamente mínimo: multipart/mixed con un text/plain + N
 * adjuntos en base64 (líneas de 76). Subject no-ASCII vía RFC 2047
 * (B-encoding UTF-8).
 */

const B64_STD = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = i + 1 < bytes.length ? (bytes[i + 1] as number) : null;
    const c = i + 2 < bytes.length ? (bytes[i + 2] as number) : null;
    out += B64_STD[a >> 2];
    out += B64_STD[((a & 0b11) << 4) | ((b ?? 0) >> 4)];
    out += b === null ? "=" : B64_STD[((b & 0b1111) << 2) | ((c ?? 0) >> 6)];
    out += c === null ? "=" : B64_STD[c & 0b111111];
  }
  return out;
}

export function textToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

/** base64url SIN padding — el formato que `users.messages.send` espera en `raw`. */
export function toBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function chunk76(b64: string): string {
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) lines.push(b64.slice(i, i + 76));
  return lines.join("\r\n");
}

/** RFC 2047 B-encoding sólo si hace falta (subject con no-ASCII). */
export function encodeSubject(subject: string): string {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]*$/.test(subject) ? subject : `=?UTF-8?B?${textToBase64(subject)}?=`;
}

export interface MimeAttachment {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface ReportMailInput {
  to: string;
  subject: string;
  bodyText: string;
  attachments: MimeAttachment[];
}

export interface BuiltMime {
  /** Mensaje MIME crudo (para inspección/harness). */
  mime: string;
  /** base64url del mensaje — el campo `raw` de users.messages.send. */
  raw: string;
  /** Tamaño del MIME en bytes (control de límites antes de enviar). */
  sizeBytes: number;
}

export function buildReportMime(input: ReportMailInput): BuiltMime {
  const boundary = `chatcouncil_${crypto.randomUUID().replaceAll("-", "")}`;
  const parts: string[] = [
    `To: ${input.to}`,
    `Subject: ${encodeSubject(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    chunk76(textToBase64(input.bodyText)),
  ];
  for (const att of input.attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${att.mimeType}; name="${att.filename}"`,
      `Content-Disposition: attachment; filename="${att.filename}"`,
      "Content-Transfer-Encoding: base64",
      "",
      chunk76(bytesToBase64(att.bytes)),
    );
  }
  parts.push(`--${boundary}--`, "");

  const mime = parts.join("\r\n");
  const mimeBytes = new TextEncoder().encode(mime);
  return { mime, raw: toBase64Url(mimeBytes), sizeBytes: mimeBytes.length };
}
