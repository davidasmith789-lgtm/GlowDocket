import { getSupabaseBrowserClient } from "./supabaseClient.js";

async function request(action, body = {}, method = "POST") {
  const client = await getSupabaseBrowserClient(); const { data } = await client.auth.getSession();
  const token = data.session?.access_token; if (!token) throw new Error("Sign in to use Google Calendar.");
  const response = await fetch(`/api/google-calendar${method === "GET" ? `?action=${encodeURIComponent(action)}` : ""}`, { method, headers: { Authorization: `Bearer ${token}`, ...(method === "POST" ? { "Content-Type": "application/json" } : {}) }, body: method === "POST" ? JSON.stringify({ action, ...body }) : undefined });
  const result = await response.json().catch(() => ({})); if (!response.ok) { const error = new Error(result.error || "Google Calendar could not finish that request."); error.code = result.code; throw error; }
  return result;
}
export const getGoogleCalendarStatus = () => request("status", {}, "GET");
export const getGoogleCalendarChoices = () => request("calendars");
export const startGoogleCalendarOAuth = (kind = "initial") => request("oauth-start", { kind });
export const saveGoogleCalendarSettings = (settings) => request("settings", settings);
export async function syncGoogleCalendar(items) {
  let continuationToken = null; let nativeUpdates = [];
  for (let requestCount = 0; requestCount < 100; requestCount += 1) {
    const result = await request("sync", { items, continuationToken });
    nativeUpdates = [...nativeUpdates, ...(result.nativeUpdates || [])];
    if (result.syncState !== "in_progress") {
      const legacyIssueVerification = await verifyLegacyGoogleCalendarIssues(items);
      return { ...result, ...(await request("status", {}, "GET")), nativeUpdates, legacyIssueVerification };
    }
    continuationToken = result.continuationToken;
  }
  const error = new Error("Google Calendar is still synchronizing a very large calendar. Press Sync now to continue safely.");
  error.code = "sync_continuation_limit"; throw error;
}
export async function verifyLegacyGoogleCalendarIssues(items) {
  let cursor = ""; const counts = { missing: 0, cancelled: 0, active_orphan: 0, permission_or_lookup_failure: 0 }; const diagnosticReferences = { missing: [], cancelled: [], active_orphan: [], permission_or_lookup_failure: [] };
  for (let requestCount = 0; requestCount < 100; requestCount += 1) {
    const result = await request("verify-legacy-issues", { items: (items || []).map((item) => ({ id: item?.id, type: item?.type })), cursor });
    for (const classification of Object.keys(counts)) { counts[classification] += Number(result.counts?.[classification] || 0); diagnosticReferences[classification].push(...(result.diagnosticReferences?.[classification] || [])); }
    if (result.complete) { const checked = Object.values(counts).reduce((total, count) => total + count, 0); return { counts, diagnosticReferences, checked, totalCandidates: checked }; }
    cursor = String(result.nextCursor || "");
  }
  throw new Error("GlowDocket could not finish verifying the old Google Calendar issues in the bounded request limit.");
}
export const unlinkGoogleCalendarItem = (type, id, deleteGoogle = true) => request("unlink", { type, id, deleteGoogle });
export const restoreGoogleCalendarItem = (type, id) => request("restore", { type, id });
export const actOnGoogleCalendarIssue = (issueId, issueAction) => request("issue-action", { issueId, issueAction });
export const clearResolvedGoogleCalendarIssues = () => request("clear-resolved-issues");
export const disconnectGoogleCalendar = (keepCalendar = true) => request("disconnect", { keepCalendar });
