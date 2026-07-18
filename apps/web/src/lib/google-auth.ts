/**
 * google-auth — GIS OAuth2 token client (Fase 6, E4/E6)
 * ------------------------------------------------------------------
 * SUPERFICIE 2 de las dos superficies de consentimiento de Google
 * (ledger §0): esto es `google.accounts.oauth2.initTokenClient`
 * (implicit grant, access token de ~1h, SIN refresh token), NO
 * `google.accounts.id` (Sign-In/FedCM — esa superficie acá es
 * Supabase). Confundirlas es la causa clásica del bug "se desloguea
 * solo"; por eso este módulo no toca identidad en absoluto: sólo
 * emite access tokens.
 *
 * E6 (decisión de Juan): UN solo token client con los DOS scopes
 * combinados (drive.appdata + gmail.send) — un paso de consentimiento
 * menos. El token vive SÓLO en memoria (jamás storage: sobrevive lo
 * que la pestaña, igual que la semántica del implicit grant).
 *
 * Ciclo de vida (E4): refresh proactivo = volver a llamar
 * `requestAccessToken({prompt:""})` antes del vencimiento; si el
 * camino silencioso falla (sin sesión de Google, popup bloqueado),
 * se degrada a un intento visible que la UI dispara con un gesto del
 * usuario. Q20: cualquier fallo deja la app en modo local, nunca la
 * bloquea.
 */

export const GOOGLE_SCOPES = "https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/gmail.send";

const GSI_SRC = "https://accounts.google.com/gsi/client";
/** Margen antes del vencimiento real (~1h) para el refresh proactivo. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

interface TokenResponse {
  access_token?: string;
  expires_in?: number; // segundos
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}

interface GoogleOauth2Namespace {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (resp: TokenResponse) => void;
    error_callback?: (err: { type?: string; message?: string }) => void;
  }) => TokenClient;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOauth2Namespace } };
  }
}

export function googleClientId(): string | null {
  const id = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  return id && id.trim().length > 0 ? id.trim() : null;
}

/** ¿Está configurado el OAuth client? Sin esto, toda la superficie Google se muestra deshabilitada (Q20). */
export function googleAuthConfigured(): boolean {
  return googleClientId() !== null;
}

let gsiLoading: Promise<GoogleOauth2Namespace> | null = null;

function loadGsi(): Promise<GoogleOauth2Namespace> {
  if (gsiLoading) return gsiLoading;
  gsiLoading = new Promise((resolve, reject) => {
    const existing = window.google?.accounts?.oauth2;
    if (existing) {
      resolve(existing);
      return;
    }
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => {
      const ns = window.google?.accounts?.oauth2;
      if (ns) resolve(ns);
      else reject(new Error("GIS cargó pero google.accounts.oauth2 no existe"));
    };
    script.onerror = () => {
      gsiLoading = null; // permitir reintento si la red falló
      reject(new Error("no se pudo cargar el script de Google Identity Services"));
    };
    document.head.appendChild(script);
  });
  return gsiLoading;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let cached: CachedToken | null = null;
let client: TokenClient | null = null;
/** Serializa solicitudes concurrentes: GIS tiene UN callback por client. */
let inFlight: Promise<string> | null = null;

type TokenListener = (hasToken: boolean) => void;
const listeners = new Set<TokenListener>();

export function onGoogleTokenState(listener: TokenListener): () => void {
  listeners.add(listener);
  listener(hasGoogleToken());
  return () => listeners.delete(listener);
}

function notify(): void {
  const has = hasGoogleToken();
  for (const l of listeners) l(has);
}

export function hasGoogleToken(): boolean {
  return cached !== null && cached.expiresAt > Date.now();
}

export function dropGoogleToken(): void {
  cached = null;
  notify();
}

async function ensureClient(): Promise<TokenClient> {
  if (client) return client;
  const clientId = googleClientId();
  if (!clientId) throw new Error("VITE_GOOGLE_CLIENT_ID no configurado — la superficie Google está deshabilitada");
  const oauth2 = await loadGsi();
  // El callback real se re-cablea por solicitud (ver requestToken); acá
  // va un no-op para satisfacer el shape del init.
  client = oauth2.initTokenClient({ client_id: clientId, scope: GOOGLE_SCOPES, callback: () => undefined });
  return client;
}

/**
 * Pide un access token a GIS. `prompt:""` = camino silencioso (reusa la
 * sesión de Google del navegador); si GIS decide que necesita
 * interacción, el popup que abra debe nacer de un gesto del usuario —
 * por eso los dos caminos (interactive true/false) existen separados.
 */
function requestToken(prompt: ""): Promise<string> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const c = await ensureClient();
    return new Promise<string>((resolve, reject) => {
      // Re-cablear callbacks de ESTA solicitud (GIS muta el client).
      const mutable = c as TokenClient & {
        callback?: (resp: TokenResponse) => void;
        error_callback?: (err: { type?: string; message?: string }) => void;
      };
      mutable.callback = (resp) => {
        if (resp.access_token) {
          const ttlMs = (resp.expires_in ?? 3600) * 1000;
          cached = { accessToken: resp.access_token, expiresAt: Date.now() + ttlMs };
          notify();
          resolve(resp.access_token);
        } else {
          reject(new Error(resp.error_description ?? resp.error ?? "GIS no devolvió access_token"));
        }
      };
      mutable.error_callback = (err) => {
        reject(new Error(err.message ?? err.type ?? "solicitud de token cancelada o bloqueada"));
      };
      c.requestAccessToken({ prompt });
    });
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * Token vigente para llamar a Drive/Gmail.
 *  · Con token en cache y margen: lo devuelve sin red.
 *  · `interactive: false` (refresh de fondo): intenta SOLO el camino
 *    silencioso; si falla, lanza — el caller degrada a badge (Q20) y
 *    espera un gesto del usuario.
 *  · `interactive: true` (click del usuario): mismo camino (GIS decide
 *    si muestra consent/selector); el gesto habilita el popup.
 */
export async function getGoogleAccessToken(opts: { interactive: boolean }): Promise<string> {
  if (cached && cached.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return cached.accessToken;
  }
  try {
    return await requestToken("");
  } catch (err) {
    dropGoogleToken();
    if (!opts.interactive) {
      console.warn("[chatcouncil:google-auth] refresh silencioso falló — se requiere un gesto del usuario:", err);
    }
    throw err;
  }
}
