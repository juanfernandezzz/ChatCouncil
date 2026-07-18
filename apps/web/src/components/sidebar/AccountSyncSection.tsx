import { useEffect, useState } from "react";
import { getGoogleAccessToken, googleAuthConfigured, onGoogleTokenState } from "@/lib/google-auth";
import { onSessionEmail, signInWithGoogle, signOut, supabaseConfigured } from "@/lib/supabase-client";
import { isSyncEnabled, onSyncState, setSyncEnabled, startSyncEngine, syncNow } from "@/lib/sync/sync-engine";
import { useCouncilStore } from "@/store/useCouncilStore";

/**
 * Cuenta + sync (Fase 6) — vive al pie de la sidebar.
 * ------------------------------------------------------------------
 * Dos superficies separadas a propósito (ledger §0):
 *  · Identidad: Supabase Google Auth (Q19, identidad pura).
 *  · Drive/Gmail: GIS token client (scopes combinados, E6) — se pide
 *    recién al habilitar el sync o al primer "Enviar por mail".
 * Q20: TODO acá es opt-in; sin configurar/sin sesión, la app es 100%
 * local y esta sección sólo informa, jamás bloquea.
 */
export function AccountSyncSection() {
  const accountEmail = useCouncilStore((s) => s.accountEmail);
  const setAccountEmail = useCouncilStore((s) => s.setAccountEmail);
  const setGoogleTokenReady = useCouncilStore((s) => s.setGoogleTokenReady);
  const syncStatus = useCouncilStore((s) => s.syncStatus);
  const syncLastAt = useCouncilStore((s) => s.syncLastAt);
  const syncMessage = useCouncilStore((s) => s.syncMessage);
  const setSyncState = useCouncilStore((s) => s.setSyncState);

  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configured = supabaseConfigured() && googleAuthConfigured();

  // Identidad (Supabase) → store; token GIS → store; motor → store.
  useEffect(() => {
    if (!supabaseConfigured()) return;
    return onSessionEmail(setAccountEmail);
  }, [setAccountEmail]);

  useEffect(() => onGoogleTokenState(setGoogleTokenReady), [setGoogleTokenReady]);

  useEffect(
    () => onSyncState((s) => setSyncState(s.status, s.lastSyncAt, s.message)),
    [setSyncState],
  );

  // Rehidratar el opt-in (Dexie) y re-arrancar el motor si estaba habilitado.
  useEffect(() => {
    void isSyncEnabled().then((on) => {
      setEnabled(on);
      if (on && googleAuthConfigured()) startSyncEngine();
    });
  }, []);

  const handleLogin = () => {
    setError(null);
    signInWithGoogle().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  const handleLogout = () => {
    setError(null);
    signOut().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  const handleToggleSync = async () => {
    setError(null);
    setBusy(true);
    try {
      if (!enabled) {
        // Gesto del usuario: momento correcto para el consent combinado (E6).
        await getGoogleAccessToken({ interactive: true });
        await setSyncEnabled(true);
        setEnabled(true);
      } else {
        await setSyncEnabled(false);
        setEnabled(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = (() => {
    switch (syncStatus) {
      case "off":
        return "sólo local";
      case "idle":
        return syncLastAt ? `sincronizado · ${new Date(syncLastAt).toLocaleTimeString()}` : "sincronizado";
      case "syncing":
        return "sincronizando…";
      case "error":
        return "error de sync";
    }
  })();

  if (!configured) {
    return (
      <section className="mt-auto rounded-md border border-border p-2 text-[11px] leading-snug text-text-secondary">
        <span className="font-semibold uppercase tracking-wide">Cuenta</span>
        <p className="mt-1">
          Sync a Drive no configurado (faltan variables de entorno de Google/Supabase). La app funciona 100% local.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-auto flex flex-col gap-1.5 rounded-md border border-border p-2 text-[11px]">
      <span className="font-semibold uppercase tracking-wide text-text-secondary">Cuenta</span>

      {accountEmail ? (
        <div className="flex items-center justify-between gap-1">
          <span className="truncate text-text-primary" title={accountEmail}>
            {accountEmail}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-text-secondary hover:border-text-secondary"
          >
            Salir
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleLogin}
          className="rounded border border-accent-primary px-2 py-1 text-[11px] text-accent-primary hover:opacity-90"
        >
          Iniciar sesión con Google
        </button>
      )}

      <label className="flex cursor-pointer items-center gap-1.5 text-text-secondary">
        <input type="checkbox" checked={enabled} disabled={busy} onChange={() => void handleToggleSync()} className="accent-accent-primary" />
        Sincronizar a Google Drive
      </label>

      <div className="flex items-center justify-between gap-1">
        <span className={syncStatus === "error" ? "text-red-400" : "text-text-secondary"}>{statusLabel}</span>
        {enabled && (
          <button
            type="button"
            onClick={() => syncNow()}
            disabled={syncStatus === "syncing"}
            className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-text-secondary hover:border-text-secondary disabled:opacity-40"
          >
            Sincronizar ahora
          </button>
        )}
      </div>
      {syncStatus === "error" && syncMessage && <p className="text-red-400">{syncMessage}</p>}
      {error && <p className="text-red-400">{error}</p>}
    </section>
  );
}
