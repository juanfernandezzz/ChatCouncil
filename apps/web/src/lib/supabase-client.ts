/**
 * supabase-client — identidad pura (Fase 6, Q19)
 * ------------------------------------------------------------------
 * Supabase gestiona SOLO el login (Google como provider) — cero
 * tablas, cero estado de la app (Q19, decisión que NO se reabre). Su
 * único aporte funcional: identidad estable + el email de la sesión
 * (default del destinatario en "Enviar por mail").
 *
 * Es la SUPERFICIE 1 de consentimiento de Google (Sign-In); el token
 * de Drive/Gmail es la superficie 2 (google-auth.ts, GIS token
 * client). Mantenerlas separadas es deliberado — ver ledger §0.
 *
 * `@supabase/supabase-js` se carga con IMPORT DINÁMICO: quien nunca
 * inicia sesión no paga el peso de la librería (mismo patrón que
 * pdfmake/docx). Sin env vars configuradas, toda la superficie se
 * reporta no-configurada y la app sigue 100% local (Q20).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export function supabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return Boolean(url && url.trim() && anon && anon.trim());
}

let clientPromise: Promise<SupabaseClient> | null = null;

export function getSupabase(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
      const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
      if (!url || !anon) throw new Error("Supabase no configurado (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)");
      const { createClient } = await import("@supabase/supabase-js");
      return createClient(url, anon);
    })();
    clientPromise.catch(() => {
      clientPromise = null; // permitir reintento si falló la carga
    });
  }
  return clientPromise;
}

/** Redirect OAuth con Google; vuelve al mismo origen. */
export async function signInWithGoogle(): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) throw new Error(`login con Google falló: ${error.message}`);
}

export async function signOut(): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(`cerrar sesión falló: ${error.message}`);
}

/**
 * Email de la sesión actual (o null). Suscripción: entrega el estado
 * inicial y cada cambio posterior; devuelve el unsubscribe.
 */
export function onSessionEmail(listener: (email: string | null) => void): () => void {
  let unsub: (() => void) | null = null;
  let cancelled = false;
  void getSupabase()
    .then((supabase) => {
      if (cancelled) return;
      void supabase.auth.getSession().then(({ data }) => {
        if (!cancelled) listener(data.session?.user.email ?? null);
      });
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        listener(session?.user.email ?? null);
      });
      unsub = () => data.subscription.unsubscribe();
    })
    .catch((err: unknown) => {
      console.warn("[chatcouncil:supabase] cliente no disponible:", err instanceof Error ? err.message : err);
      listener(null);
    });
  return () => {
    cancelled = true;
    unsub?.();
  };
}
