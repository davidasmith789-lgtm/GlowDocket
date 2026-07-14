import { createClient } from "@supabase/supabase-js";
import process from "node:process";

const messageFor = (error) => error instanceof Error ? error.message : "Account deletion failed.";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const url = String(process.env.SUPABASE_URL || "").trim();
  const secret = String(process.env.SUPABASE_SECRET_KEY || "").trim();
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!url || !secret) return res.status(503).json({ error: "Account deletion is not configured." });
  if (!token) return res.status(401).json({ error: "Sign in again before deleting your account." });

  try {
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error: userError } = await admin.auth.getUser(token);
    if (userError || !data.user) return res.status(401).json({ error: "Your session is no longer valid. Sign in again and retry." });
    const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
    if (deleteError) throw deleteError;
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[account-delete] Supabase deletion failed", { message: messageFor(error) });
    return res.status(500).json({ error: "GlowDocket could not delete the account. No browser data was erased; please retry." });
  }
}
