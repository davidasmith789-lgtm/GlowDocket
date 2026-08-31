import { createClient } from "@supabase/supabase-js";
import process from "node:process";
import { mergeAccountStates, validateCloudState } from "../../src/cloudSync.js";

const messageFor = (error) => error instanceof Error ? error.message : "Account deletion failed.";

async function listMatchingVerifiedUsers(admin, user) {
  const email = String(user.email || "").trim().toLowerCase();
  if (!email || !user.email_confirmed_at) return [user];
  const matches = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users || [];
    matches.push(...users.filter((candidate) => candidate.email_confirmed_at && String(candidate.email || "").trim().toLowerCase() === email));
    if (users.length < 1000) break;
  }
  return matches.length > 0 ? matches : [user];
}

async function reconcileDuplicateAccounts(admin, user, incomingState) {
  const matchingUsers = await listMatchingVerifiedUsers(admin, user);
  const userIds = matchingUsers.map((candidate) => candidate.id);
  const { data: rows, error: rowsError } = await admin.from("taskcabinet_cloud_state").select("user_id,state,revision").in("user_id", userIds);
  if (rowsError) throw rowsError;
  const states = (rows || []).map((row) => validateCloudState(row.state));
  if (incomingState) states.unshift(validateCloudState(incomingState));
  if (states.length === 0) throw new Error("No planner state was available to reconcile.");
  const merged = states.slice(1).reduce((combined, state) => mergeAccountStates(combined, state), states[0]);
  const revision = Math.max(0, ...(rows || []).map((row) => Number(row.revision) || 0)) + 1;
  const updatedAt = new Date().toISOString();
  const payload = userIds.map((userId) => ({ user_id: userId, state: merged, schema_version: merged.schemaVersion, revision, updated_at: updatedAt }));
  const { error: upsertError } = await admin.from("taskcabinet_cloud_state").upsert(payload, { onConflict: "user_id" });
  if (upsertError) throw upsertError;
  return { state: merged, revision, updatedAt, identitiesMerged: userIds.length };
}

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
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    if (body.action === "reconcile-sync") {
      const result = await reconcileDuplicateAccounts(admin, data.user, body.state);
      return res.status(200).json(result);
    }
    const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
    if (deleteError) throw deleteError;
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[account-delete] Supabase deletion failed", { message: messageFor(error) });
    return res.status(500).json({ error: "GlowDocket could not delete the account. No browser data was erased; please retry." });
  }
}
