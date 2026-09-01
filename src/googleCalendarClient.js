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
export const syncGoogleCalendar = (items) => request("sync", { items });
export const unlinkGoogleCalendarItem = (type, id, deleteGoogle = true) => request("unlink", { type, id, deleteGoogle });
export const restoreGoogleCalendarItem = (type, id) => request("restore", { type, id });
export const disconnectGoogleCalendar = (keepCalendar = true) => request("disconnect", { keepCalendar });
