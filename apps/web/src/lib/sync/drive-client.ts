/**
 * drive-client — Drive API v3 sobre appDataFolder (Fase 6, Q18)
 * ------------------------------------------------------------------
 * Transporte puro (fetch + Bearer): list / download / upload con
 * `multipart upload` SIMPLE — NO resumible, a propósito: el contenido
 * es JSON de texto+metadata (Q18) y los uploads resumibles son la
 * superficie CORS más frágil de googleapis documentada en el ledger.
 * El token entra por parámetro: este módulo no sabe de GIS ni de UI.
 *
 * guard:sync / guard:keys: prohibido web storage y el
 * key-vault en este path — acá no hay nada que persistir.
 */

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";

export interface DriveFileEntry {
  id: string;
  name: string;
  modifiedTime?: string;
}

async function driveError(resp: Response, what: string): Promise<Error> {
  let detail = "";
  try {
    detail = (await resp.text()).slice(0, 300);
  } catch {
    /* cuerpo ilegible: alcanza con el status */
  }
  return new Error(`Drive ${what} → HTTP ${resp.status}${detail ? ` · ${detail}` : ""}`);
}

/** Lista completa del appDataFolder (paginada por las dudas; a escala personal es 1 página). */
export async function listAppDataFiles(token: string): Promise<DriveFileEntry[]> {
  const files: DriveFileEntry[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      spaces: "appDataFolder",
      fields: "nextPageToken, files(id, name, modifiedTime)",
      pageSize: "1000",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const resp = await fetch(`${DRIVE_API}/files?${params.toString()}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!resp.ok) throw await driveError(resp, "files.list");
    const body = (await resp.json()) as { files?: DriveFileEntry[]; nextPageToken?: string };
    files.push(...(body.files ?? []));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return files;
}

export async function downloadFileContent(token: string, fileId: string): Promise<string> {
  const resp = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw await driveError(resp, "files.get(alt=media)");
  return resp.text();
}

/**
 * Crea o actualiza un archivo JSON vía multipart SIMPLE:
 *  · sin fileId → POST (create) con parents:["appDataFolder"]
 *  · con fileId → PATCH (update) — parents no se re-declara (inmutable)
 * Devuelve el fileId (nuevo o el mismo).
 */
export async function uploadJsonFile(
  token: string,
  opts: { fileId?: string; name: string; content: string },
): Promise<string> {
  const boundary = `chatcouncil_${crypto.randomUUID().replaceAll("-", "")}`;
  const metadata: Record<string, unknown> = opts.fileId
    ? { name: opts.name, mimeType: "application/json" }
    : { name: opts.name, mimeType: "application/json", parents: ["appDataFolder"] };

  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    opts.content,
    `--${boundary}--`,
    "",
  ].join("\r\n");

  const url = opts.fileId
    ? `${DRIVE_UPLOAD}/files/${encodeURIComponent(opts.fileId)}?uploadType=multipart`
    : `${DRIVE_UPLOAD}/files?uploadType=multipart`;

  const resp = await fetch(url, {
    method: opts.fileId ? "PATCH" : "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!resp.ok) throw await driveError(resp, opts.fileId ? "files.update" : "files.create");
  const created = (await resp.json()) as { id?: string };
  const id = created.id ?? opts.fileId;
  if (!id) throw new Error("Drive upload OK pero la respuesta no trae id de archivo");
  return id;
}
