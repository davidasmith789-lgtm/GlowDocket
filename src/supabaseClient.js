const url = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

export const CLOUD_SYNC_CONFIGURED = Boolean(url && anonKey);
let clientPromise;

export async function getSupabaseBrowserClient() {
  if (!CLOUD_SYNC_CONFIGURED) return null;
  clientPromise ||= import("@supabase/supabase-js").then(({ createClient }) => createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  }));
  return clientPromise;
}
