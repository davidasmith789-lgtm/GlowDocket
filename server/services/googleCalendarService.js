import crypto from "node:crypto";
import process from "node:process";
import { Buffer } from "node:buffer";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";

export const INITIAL_GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.app.created",
];
export const WRITE_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const WRITABLE_ACCESS_ROLES = new Set(["owner", "writer", "writerWithoutPrivateAccess"]);
const MANAGED = "glowdocketManaged";
const MAX_WRITE_ATTEMPTS = 3;

export class GoogleCalendarError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const stable = (value) => JSON.stringify(canonical(value));
export const snapshotHash = (value) => sha256(stable(value));
export const canCreateEvents = (role) => WRITABLE_ACCESS_ROLES.has(String(role || ""));
export const isManagedEvent = (event) => event?.extendedProperties?.private?.[MANAGED] === "1";
export function managedProjectionDecision(event, mapping = null) {
  if (mapping) return "managed";
  return isManagedEvent(event) ? "recovery_required" : "import";
}

const ISSUE_COPY = {
  conflict: { kind: "conflict", explanation: "This item changed in both GlowDocket and Google Calendar in a way that could not be merged safely.", action: "Review the item and choose which version to keep." },
  mapping_recovery: { kind: "mapping_recovery", explanation: "GlowDocket found managed event information but could not safely match it to the original item.", action: "Retry synchronization. GlowDocket will reconnect it after verifying the item." },
  event_missing: { kind: "sync_error", explanation: "The Google Calendar copy is missing or was deleted. The GlowDocket item was kept.", action: "Add the item back to Google Calendar if you still want it there." },
  permission_problem: { kind: "sync_error", explanation: "Google Calendar did not allow GlowDocket to complete this operation.", action: "Reconnect Google Calendar and confirm the requested permissions." },
  recurrence_problem: { kind: "sync_error", explanation: "Google Calendar could not apply this repeating schedule safely.", action: "Review the class schedule, then retry synchronization." },
  temporary_provider_failure: { kind: "sync_error", explanation: "Google Calendar was temporarily unavailable while processing this item.", action: "Retry synchronization in a moment." },
  stale_sync_state: { kind: "sync_error", explanation: "Google asked GlowDocket to refresh its saved synchronization state.", action: "Retry synchronization; GlowDocket can safely rebuild this calendar's state." },
};

export function syncIssueDefaults(category) { return ISSUE_COPY[category] || ISSUE_COPY.temporary_provider_failure; }
export function providerIssueCategory(error, itemType = "") {
  const status = Number(error?.code || error?.response?.status || 0);
  if ([401, 403].includes(status)) return "permission_problem";
  if (status === 410) return "stale_sync_state";
  if (itemType === "class" && status === 400) return "recurrence_problem";
  return "temporary_provider_failure";
}
export function syncIssueIdentity({ category, direction = "glowdocket_to_google", type = null, id = null, calendarId = null, eventId = null }) {
  return sha256([category, direction, type || "connection", id || "", calendarId || "", eventId || ""].join("|"));
}
export function syncIssueDiagnosticReference(userId, dedupeKey) {
  return `GC-${sha256(`${userId}:${dedupeKey}`).slice(0, 4).toUpperCase()}`;
}
export async function recordSyncIssue({ admin, userId, category, direction = "glowdocket_to_google", type = null, id = null, title = "Google Calendar connection", calendarId = null, eventId = null, details = {} }) {
  const copy = syncIssueDefaults(category); const dedupeKey = syncIssueIdentity({ category, direction, type, id, calendarId, eventId });
  const diagnosticRef = syncIssueDiagnosticReference(userId, dedupeKey); const occurredAt = new Date().toISOString();
  const { data: existing } = await admin.from("google_sync_issues").select("id,attempt_count").eq("user_id", userId).eq("dedupe_key", dedupeKey).maybeSingle();
  const row = { user_id: userId, kind: copy.kind, category, direction, glowdocket_type: type, glowdocket_id: id ? String(id) : null, google_calendar_id: calendarId, google_event_id: eventId, item_title: String(title || "Google Calendar item").slice(0, 180), safe_explanation: copy.explanation, recommended_action: copy.action, diagnostic_ref: diagnosticRef, dedupe_key: dedupeKey, attempt_count: Number(existing?.attempt_count || 0) + 1, last_occurred_at: occurredAt, resolved_at: null, resolution_reason: null, details, updated_at: occurredAt };
  if (existing) await admin.from("google_sync_issues").update(row).eq("id", existing.id);
  else await admin.from("google_sync_issues").insert(row);
  console.warn("[google-calendar-issue]", { diagnosticRef, category, direction, attempt: row.attempt_count });
  return { id: existing?.id || null, diagnosticRef, attemptCount: row.attempt_count };
}

export async function resolveSyncIssues({ admin, userId, categories, type = null, id = null, reason = "successful_sync" }) {
  let query = admin.from("google_sync_issues").update({ resolved_at: new Date().toISOString(), resolution_reason: reason, updated_at: new Date().toISOString() }).eq("user_id", userId).is("resolved_at", null).in("category", categories);
  if (type) query = query.eq("glowdocket_type", type);
  if (id) query = query.eq("glowdocket_id", String(id));
  await query;
}

function encryptionKey(env = process.env) {
  const source = String(env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY || "");
  if (source.length < 32) throw new GoogleCalendarError("integration_unavailable", "Google Calendar encryption is not configured.", 503);
  return crypto.createHash("sha256").update(source).digest();
}
export function encryptToken(value, env = process.env) {
  if (!value) return null;
  const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(env), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function decryptToken(value, env = process.env) {
  if (!value) return null;
  const [version, iv, tag, payload] = String(value).split(".");
  if (version !== "v1" || !payload) throw new GoogleCalendarError("invalid_token_store", "The saved Google connection must be reconnected.", 401);
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(env), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(payload, "base64url")), decipher.final()]).toString("utf8");
}

export function createAdmin(env = process.env) {
  const url = String(env.SUPABASE_URL || ""); const key = String(env.SUPABASE_SECRET_KEY || "");
  if (!url || !key) throw new GoogleCalendarError("integration_unavailable", "Google Calendar storage is not configured.", 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export function createOAuth(env = process.env) {
  const id = String(env.GOOGLE_CALENDAR_CLIENT_ID || ""); const secret = String(env.GOOGLE_CALENDAR_CLIENT_SECRET || "");
  const redirect = String(env.GOOGLE_CALENDAR_REDIRECT_URI || "");
  if (!id || !secret || !redirect) throw new GoogleCalendarError("integration_unavailable", "Google Calendar OAuth is not configured.", 503);
  return new google.auth.OAuth2(id, secret, redirect);
}

export async function authenticateRequest(req, admin) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new GoogleCalendarError("signed_out", "Sign in to manage Google Calendar.", 401);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new GoogleCalendarError("signed_out", "Your session expired. Sign in and retry.", 401);
  return data.user;
}

export async function beginOAuth({ admin, userId, kind = "initial", returnTo = "/", env = process.env }) {
  const state = crypto.randomBytes(32).toString("base64url");
  const safeReturn = String(returnTo).startsWith("/") && !String(returnTo).startsWith("//") ? returnTo : "/";
  await admin.from("google_oauth_states").insert({ state_hash: sha256(state), user_id: userId, authorization_kind: kind, return_to: safeReturn, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() }).throwOnError();
  const scopes = kind === "existing_calendar_write" ? [WRITE_SCOPE] : INITIAL_GOOGLE_SCOPES;
  return createOAuth(env).generateAuthUrl({ access_type: "offline", prompt: kind === "initial" ? "consent" : undefined, include_granted_scopes: true, scope: scopes, state });
}

export async function finishOAuth({ admin, code, state, env = process.env }) {
  const { data: rows, error } = await admin.from("google_oauth_states").select("*").eq("state_hash", sha256(state)).limit(1);
  if (error || !rows?.[0] || new Date(rows[0].expires_at).getTime() < Date.now()) throw new GoogleCalendarError("invalid_oauth_state", "This Google connection request expired. Please start again.", 400);
  const record = rows[0]; await admin.from("google_oauth_states").delete().eq("state_hash", record.state_hash);
  const oauth = createOAuth(env); const { tokens } = await oauth.getToken(code); oauth.setCredentials(tokens);
  const { data: existing } = await admin.from("google_calendar_connections").select("encrypted_refresh_token,granted_scopes,google_sub,google_email").eq("user_id", record.user_id).maybeSingle();
  let identity = existing ? { sub: existing.google_sub, email: existing.google_email, email_verified: true } : null;
  if (tokens.id_token) { const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: String(env.GOOGLE_CALENDAR_CLIENT_ID) }); identity = ticket.getPayload(); }
  if (!identity?.sub || !identity?.email || identity.email_verified === false) throw new GoogleCalendarError("invalid_google_identity", "Google did not provide a verified account identity.", 400);
  const scopes = [...new Set([...(existing?.granted_scopes || []), ...String(tokens.scope || "").split(/\s+/).filter(Boolean)])];
  await admin.from("google_calendar_connections").upsert({ user_id: record.user_id, google_sub: identity.sub, google_email: identity.email, encrypted_access_token: encryptToken(tokens.access_token, env), encrypted_refresh_token: tokens.refresh_token ? encryptToken(tokens.refresh_token, env) : existing?.encrypted_refresh_token, token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null, granted_scopes: scopes, status: "connected", last_error: null, updated_at: new Date().toISOString() }).throwOnError();
  await admin.from("google_calendar_preferences").upsert({ user_id: record.user_id }, { onConflict: "user_id", ignoreDuplicates: true }).throwOnError();
  return { userId: record.user_id, returnTo: record.return_to };
}

export async function authorizedCalendar({ admin, userId, env = process.env }) {
  const { data: connection, error } = await admin.from("google_calendar_connections").select("*").eq("user_id", userId).maybeSingle();
  if (error || !connection || connection.status === "disconnected") throw new GoogleCalendarError("not_connected", "Connect Google Calendar first.", 409);
  const oauth = createOAuth(env);
  oauth.setCredentials({ access_token: decryptToken(connection.encrypted_access_token, env), refresh_token: decryptToken(connection.encrypted_refresh_token, env), expiry_date: connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : undefined });
  oauth.on("tokens", async (tokens) => {
    const update = { updated_at: new Date().toISOString() };
    if (tokens.access_token) update.encrypted_access_token = encryptToken(tokens.access_token, env);
    if (tokens.refresh_token) update.encrypted_refresh_token = encryptToken(tokens.refresh_token, env);
    if (tokens.expiry_date) update.token_expires_at = new Date(tokens.expiry_date).toISOString();
    await admin.from("google_calendar_connections").update(update).eq("user_id", userId);
  });
  return { calendar: google.calendar({ version: "v3", auth: oauth }), oauth, connection };
}

export function normalizeGoogleEvent(event, calendarId) {
  const allDay = Boolean(event.start?.date);
  return { id: event.id, calendarId, title: event.summary || "Untitled event", description: event.description || "", location: event.location || "", start: event.start || {}, end: event.end || {}, allDay, status: event.status || "confirmed", htmlLink: event.htmlLink || "", meetingLink: event.hangoutLink || event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri || "", recurringEventId: event.recurringEventId || "", recurrence: event.recurrence || [], originalStartTime: event.originalStartTime || null, organizer: event.organizer ? { email: event.organizer.email || "", displayName: event.organizer.displayName || "", self: Boolean(event.organizer.self) } : null, invitationStatus: event.attendees?.find((attendee) => attendee.self)?.responseStatus || "", readOnly: true, provider: "google" };
}

const comparableFields = ["summary", "description", "location", "start", "end", "recurrence"];
export function eventSnapshot(event) { return Object.fromEntries(comparableFields.map((field) => [field, event?.[field] ?? null])); }
export function changedFields(before, after) { return comparableFields.filter((field) => stable(before?.[field]) !== stable(after?.[field])); }
export function mergeSnapshots(base, glow, googleNow) {
  const glowChanged = changedFields(base, glow); const googleChanged = changedFields(base, googleNow);
  const conflicts = glowChanged.filter((field) => googleChanged.includes(field) && stable(glow[field]) !== stable(googleNow[field]));
  const merged = { ...googleNow };
  for (const field of glowChanged) if (!conflicts.includes(field)) merged[field] = glow[field];
  return { merged, glowChanged, googleChanged, conflicts };
}

export async function conditionalUpdate({ calendar, calendarId, eventId, desiredSnapshot, desiredExtendedProperties, priorGoogleSnapshot, onConflict, attempts = MAX_WRITE_ATTEMPTS }) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const latest = (await calendar.events.get({ calendarId, eventId })).data;
    const result = mergeSnapshots(priorGoogleSnapshot || eventSnapshot(latest), desiredSnapshot, eventSnapshot(latest));
    if (result.conflicts.length) { await onConflict?.(result, latest); return { conflict: true, fields: result.conflicts, latest }; }
    try {
      const response = await calendar.events.update({ calendarId, eventId, requestBody: { ...latest, ...result.merged, ...(desiredExtendedProperties ? { extendedProperties: desiredExtendedProperties } : {}) }, headers: { "If-Match": latest.etag } });
      return { event: response.data, conflict: false };
    } catch (error) {
      if (Number(error?.code || error?.response?.status) !== 412 || attempt === attempts - 1) throw error;
    }
  }
  throw new GoogleCalendarError("concurrent_update", "Google Calendar kept changing. Sync again to resolve it.", 409);
}

export async function syncImportedCalendar({ admin, userId, calendar, selection, jobId = null }) {
  const startedAt = Date.now();
  if (jobId && selection.last_sync_job_id === jobId && !selection.pending_page_token) return { complete: true, managedEvents: [], processed: 0, skipped: true };
  const mode = selection.pending_sync_mode || (selection.full_sync_required ? "full" : "incremental");
  const pageToken = selection.pending_page_token || undefined;
  const syncToken = mode === "incremental" ? selection.sync_token : undefined;
  let response;
  try { response = await calendar.events.list({ calendarId: selection.calendar_id, pageToken, syncToken, showDeleted: true, singleEvents: false, maxResults: 250 }); }
  catch (error) {
    if (Number(error?.code || error?.response?.status) === 410 && syncToken) {
      await admin.from("google_selected_calendars").update({ sync_token: null, pending_page_token: null, pending_sync_mode: "full", pending_started_at: new Date().toISOString(), full_sync_required: true }).eq("user_id", userId).eq("calendar_id", selection.calendar_id);
      await recordSyncIssue({ admin, userId, category: "stale_sync_state", direction: "google_to_glowdocket", title: selection.summary || "Google Calendar", calendarId: selection.calendar_id });
      return { complete: false, reset: true, managedEvents: [], processed: 0 };
    }
    throw error;
  }
  const events = response.data.items || [];
  const { data: mappings } = await admin.from("google_event_mappings").select("*").eq("user_id", userId);
  const byGoogle = new Map((mappings || []).map((mapping) => [`${mapping.google_calendar_id}:${mapping.google_event_id}`, mapping]));
  const byNative = new Map((mappings || []).map((mapping) => [`${mapping.glowdocket_type}:${mapping.glowdocket_id}`, mapping]));
  const managedEvents = []; const managedMappingWrites = []; const importedRows = []; const deleteIds = []; const cancelledMappingIds = []; const recoveryIssues = []; const recoveredByType = new Map();
  for (const event of events) {
    const meta = event.extendedProperties?.private || {}; let mapping = byGoogle.get(`${selection.calendar_id}:${event.id}`);
    if (!mapping && isManagedEvent(event) && meta.glowdocketItemId && meta.glowdocketItemType) {
      const candidate = byNative.get(`${meta.glowdocketItemType}:${meta.glowdocketItemId}`);
      if (candidate) {
        const { data } = await admin.from("google_event_mappings").update({ google_calendar_id: selection.calendar_id, google_event_id: event.id, state: "active", google_etag: event.etag, updated_at: new Date().toISOString() }).eq("id", candidate.id).select("*").single();
        mapping = data;
      }
    }
    const decision = managedProjectionDecision(event, mapping);
    if (decision !== "import") {
      deleteIds.push(event.id);
      if (mapping) { const pendingSnapshot = eventSnapshot(event); managedEvents.push({ mapping, event }); managedMappingWrites.push({ ...mapping, pending_google_snapshot: pendingSnapshot, pending_google_hash: snapshotHash(pendingSnapshot), pending_google_etag: event.etag, pending_google_updated_at: event.updated || null, updated_at: new Date().toISOString() }); if (event.status === "cancelled") cancelledMappingIds.push(mapping.id); const ids = recoveredByType.get(mapping.glowdocket_type) || new Set(); ids.add(String(mapping.glowdocket_id)); recoveredByType.set(mapping.glowdocket_type, ids); }
      else recoveryIssues.push({ category: "mapping_recovery", direction: "google_to_glowdocket", type: meta.glowdocketItemType || null, id: meta.glowdocketItemId || null, title: event.summary || "Google Calendar event", calendarId: selection.calendar_id, eventId: event.id, details: { reason: "metadata_not_validated" } });
      continue;
    }
    const declined = event.attendees?.find((attendee) => attendee.self)?.responseStatus === "declined";
    if (declined || (event.status === "cancelled" && !event.recurringEventId)) deleteIds.push(event.id);
    else importedRows.push({ user_id: userId, calendar_id: selection.calendar_id, event_id: event.id, recurring_event_id: event.recurringEventId || null, original_start_time: event.originalStartTime || null, event_status: event.status || "confirmed", normalized_event: normalizeGoogleEvent(event, selection.calendar_id), etag: event.etag, google_updated_at: event.updated || null, hidden: false, updated_at: new Date().toISOString() });
  }
  if (deleteIds.length) await admin.from("google_imported_events").delete().eq("user_id", userId).eq("calendar_id", selection.calendar_id).in("event_id", [...new Set(deleteIds)]);
  if (importedRows.length) await admin.from("google_imported_events").upsert(importedRows, { onConflict: "user_id,calendar_id,event_id" }).throwOnError();
  if (managedMappingWrites.length) await admin.from("google_event_mappings").upsert(managedMappingWrites, { onConflict: "user_id,glowdocket_type,glowdocket_id" }).throwOnError();
  if (cancelledMappingIds.length) await admin.from("google_event_mappings").update({ state: "unlinked_by_user", updated_at: new Date().toISOString() }).in("id", cancelledMappingIds);
  if (recoveryIssues.length) await Promise.all(recoveryIssues.map((issue) => recordSyncIssue({ admin, userId, ...issue })));
  for (const [type, ids] of recoveredByType) await admin.from("google_sync_issues").update({ resolved_at: new Date().toISOString(), resolution_reason: "mapping_verified", updated_at: new Date().toISOString() }).eq("user_id", userId).eq("category", "mapping_recovery").eq("glowdocket_type", type).in("glowdocket_id", [...ids]).is("resolved_at", null);
  const nextPageToken = response.data.nextPageToken || null;
  if (nextPageToken) await admin.from("google_selected_calendars").update({ pending_page_token: nextPageToken, pending_sync_mode: mode, pending_started_at: selection.pending_started_at || new Date().toISOString(), updated_at: new Date().toISOString() }).eq("user_id", userId).eq("calendar_id", selection.calendar_id);
  else await admin.from("google_selected_calendars").update({ sync_token: response.data.nextSyncToken, pending_page_token: null, pending_sync_mode: null, pending_started_at: null, last_sync_job_id: jobId, full_sync_required: false, updated_at: new Date().toISOString() }).eq("user_id", userId).eq("calendar_id", selection.calendar_id);
  if (!nextPageToken) await admin.from("google_sync_issues").update({ resolved_at: new Date().toISOString(), resolution_reason: "calendar_state_refreshed", updated_at: new Date().toISOString() }).eq("user_id", userId).eq("category", "stale_sync_state").eq("google_calendar_id", selection.calendar_id).is("resolved_at", null);
  console.info("[google-calendar-sync] import-page", { calendarKey: sha256(selection.calendar_id).slice(0, 10), mode, processed: events.length, managed: managedEvents.length, imported: importedRows.length, complete: !nextPageToken, durationMs: Date.now() - startedAt });
  return { complete: !nextPageToken, managedEvents, processed: events.length };
}

export async function ensureWebhookChannel({ admin, userId, calendar, calendarId, env = process.env, force = false }) {
  const address = String(env.GOOGLE_CALENDAR_WEBHOOK_URL || "");
  if (!/^https:\/\//i.test(address)) return null;
  const threshold = new Date(Date.now() + 36 * 60 * 60_000).toISOString();
  if (!force) {
    const { data: current } = await admin.from("google_webhook_channels").select("*").eq("user_id", userId).eq("calendar_id", calendarId).eq("active", true).gt("expiration", threshold).limit(1);
    if (current?.[0]) return current[0];
  }
  const channelId = crypto.randomUUID(); const channelToken = crypto.randomBytes(32).toString("base64url");
  const requestedExpiration = Date.now() + 7 * 24 * 60 * 60_000;
  const response = await calendar.events.watch({ calendarId, requestBody: { id: channelId, type: "web_hook", address, token: channelToken, expiration: String(requestedExpiration) } });
  const expiration = Number(response.data.expiration || requestedExpiration);
  const row = { channel_id: channelId, user_id: userId, calendar_id: calendarId, token_hash: channelTokenHash(channelToken), resource_id: response.data.resourceId, expiration: new Date(expiration).toISOString(), latest_message_number: 0, active: true, updated_at: new Date().toISOString() };
  await admin.from("google_webhook_channels").insert(row).throwOnError();
  return row;
}

export async function renewExpiringWebhookChannels({ admin = createAdmin(), env = process.env } = {}) {
  const cutoff = new Date(Date.now() + 48 * 60 * 60_000).toISOString();
  const { data: channels } = await admin.from("google_webhook_channels").select("user_id,calendar_id").eq("active", true).lt("expiration", cutoff);
  const unique = [...new Map((channels || []).map((item) => [`${item.user_id}:${item.calendar_id}`, item])).values()]; const results = [];
  for (const item of unique) try { const auth = await authorizedCalendar({ admin, userId: item.user_id, env }); await ensureWebhookChannel({ admin, userId: item.user_id, calendar: auth.calendar, calendarId: item.calendar_id, env, force: true }); results.push({ ...item, renewed: true }); } catch (error) { results.push({ ...item, renewed: false, code: error.code || "renewal_failed" }); }
  await admin.from("google_webhook_channels").update({ active: false, updated_at: new Date().toISOString() }).eq("active", true).lt("expiration", new Date().toISOString());
  return results;
}

export async function listCalendarChoices({ calendar }) {
  const items = []; let pageToken;
  do { const response = await calendar.calendarList.list({ pageToken, maxResults: 250 }); items.push(...(response.data.items || [])); pageToken = response.data.nextPageToken; } while (pageToken);
  return items.map((item) => ({ id: item.id, summary: item.summary || item.id, primary: Boolean(item.primary), accessRole: item.accessRole, writable: canCreateEvents(item.accessRole), selected: Boolean(item.selected), backgroundColor: item.backgroundColor || "" }));
}

export async function ensureDedicatedCalendar({ admin, userId, calendar }) {
  const { data: prefs } = await admin.from("google_calendar_preferences").select("*").eq("user_id", userId).single();
  if (prefs?.dedicated_calendar_id) { await ensureDedicatedImportSelection({ admin, userId, calendarId: prefs.dedicated_calendar_id }); return prefs.dedicated_calendar_id; }
  const created = await calendar.calendars.insert({ requestBody: { summary: "GlowDocket", description: "School planning events managed by GlowDocket.", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" } });
  await admin.from("google_calendar_preferences").update({ dedicated_calendar_id: created.data.id, destination_calendar_id: created.data.id, destination_kind: "dedicated", updated_at: new Date().toISOString() }).eq("user_id", userId);
  await ensureDedicatedImportSelection({ admin, userId, calendarId: created.data.id });
  return created.data.id;
}

export async function ensureDedicatedImportSelection({ admin, userId, calendarId }) {
  const { data: existing } = await admin.from("google_selected_calendars").select("calendar_id").eq("user_id", userId).eq("calendar_id", calendarId).maybeSingle();
  if (existing) await admin.from("google_selected_calendars").update({ summary: "GlowDocket", access_role: "owner", selected_for_import: true, updated_at: new Date().toISOString() }).eq("user_id", userId).eq("calendar_id", calendarId);
  else await admin.from("google_selected_calendars").insert({ user_id: userId, calendar_id: calendarId, summary: "GlowDocket", access_role: "owner", selected_for_import: true, full_sync_required: true, updated_at: new Date().toISOString() }).throwOnError();
  return calendarId;
}

export async function synchronizeNativeItems({ admin, userId, calendar, destinationCalendarId, items = [], enabledTypes = [], startIndex = 0, maxItems = 250, managedEvents = [], deadline = Infinity }) {
  const startedAt = Date.now(); const nativeUpdates = []; const mappingWrites = []; let googleWrites = 0; let noops = 0;
  const resolvedByType = new Map();
  const markResolved = (type, id) => { const ids = resolvedByType.get(type) || new Set(); ids.add(String(id)); resolvedByType.set(type, ids); };
  const seen = new Set(items.filter((item) => item?.id && item?.type).map((item) => `${item.type}:${item.id}`));
  const { data: mappings } = await admin.from("google_event_mappings").select("*").eq("user_id", userId);
  const mappingByNative = new Map((mappings || []).map((mapping) => [`${mapping.glowdocket_type}:${mapping.glowdocket_id}`, mapping]));
  const scannedByGoogle = new Map(managedEvents.map(({ mapping, event }) => [`${mapping.google_calendar_id}:${mapping.google_event_id}`, event]));
  const batch = items.slice(startIndex, Math.min(items.length, startIndex + maxItems)); let processed = 0;
  for (const item of batch) {
    if (Date.now() >= deadline) break;
    if (!item?.id || !item?.type || !item.googleEvent) continue;
    processed += 1;
    const identity = `${item.type}:${item.id}`; const mapping = mappingByNative.get(identity);
    if (mapping && ["unlinked_by_user", "google_deleted"].includes(mapping.state)) continue;
    const version = Number(mapping?.sync_version || 0) + 1;
    const desired = { ...item.googleEvent, extendedProperties: { ...(item.googleEvent.extendedProperties || {}), private: { ...(item.googleEvent.extendedProperties?.private || {}), glowdocketManaged: "1", glowdocketItemId: String(item.id), glowdocketItemType: item.type, glowdocketSyncVersion: String(version) } } };
    const currentGlow = eventSnapshot(desired); const currentGlowHash = snapshotHash(currentGlow);
    const scannedGoogle = mapping ? scannedByGoogle.get(`${mapping.google_calendar_id}:${mapping.google_event_id}`) : null;
    const currentGoogle = scannedGoogle ? eventSnapshot(scannedGoogle) : mapping?.pending_google_snapshot || null;
    const currentGoogleEtag = scannedGoogle?.etag || mapping?.pending_google_etag || mapping?.google_etag;
    const glowChanged = !mapping || mapping.last_glowdocket_hash !== currentGlowHash;
    const googleChanged = Boolean(mapping && currentGoogle && mapping.last_google_hash !== snapshotHash(currentGoogle));
    if (mapping && !glowChanged && !googleChanged) { noops += 1; markResolved(item.type, item.id); if (mapping.pending_google_snapshot) mappingWrites.push({ ...mapping, pending_google_snapshot: null, pending_google_hash: null, pending_google_etag: null, pending_google_updated_at: null, updated_at: new Date().toISOString() }); continue; }
    if (mapping && !glowChanged && googleChanged && item.type !== "class") {
      const googleFields = changedFields(mapping.last_google_snapshot || {}, currentGoogle);
      if (googleFields.length) nativeUpdates.push({ type: item.type, id: String(item.id), fields: Object.fromEntries(googleFields.map((field) => [field, currentGoogle[field]])) });
      const synchronizedGlow = { ...currentGlow, ...Object.fromEntries(googleFields.map((field) => [field, currentGoogle[field]])) };
      mappingWrites.push({ ...mapping, google_etag: currentGoogleEtag, google_updated_at: scannedGoogle?.updated || mapping.pending_google_updated_at || null, last_google_snapshot: currentGoogle, last_google_hash: snapshotHash(currentGoogle), last_glowdocket_snapshot: synchronizedGlow, last_glowdocket_hash: snapshotHash(synchronizedGlow), pending_google_snapshot: null, pending_google_hash: null, pending_google_etag: null, pending_google_updated_at: null, updated_at: new Date().toISOString() });
      markResolved(item.type, item.id);
      continue;
    }
    let saved;
    if (!mapping) {
      try { saved = (await calendar.events.insert({ calendarId: destinationCalendarId, requestBody: desired })).data; googleWrites += 1; }
      catch (error) { await recordSyncIssue({ admin, userId, category: providerIssueCategory(error, item.type), direction: "glowdocket_to_google", type: item.type, id: item.id, title: desired.summary || "GlowDocket item", calendarId: destinationCalendarId }); throw error; }
    } else {
      try {
        let result;
        if (item.type === "class") {
          let authoritativeLatest = scannedGoogle || (mapping.pending_google_snapshot ? { ...mapping.pending_google_snapshot, etag: mapping.pending_google_etag, updated: mapping.pending_google_updated_at } : null);
          for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
            authoritativeLatest ||= (await calendar.events.get({ calendarId: mapping.google_calendar_id, eventId: mapping.google_event_id })).data;
            try { result = { event: (await calendar.events.update({ calendarId: mapping.google_calendar_id, eventId: mapping.google_event_id, requestBody: { ...authoritativeLatest, ...currentGlow, extendedProperties: desired.extendedProperties }, headers: { "If-Match": authoritativeLatest.etag } })).data, conflict: false }; break; }
            catch (error) { if (Number(error?.code || error?.response?.status) !== 412 || attempt === MAX_WRITE_ATTEMPTS - 1) throw error; authoritativeLatest = null; }
          }
        } else result = await conditionalUpdate({ calendar, calendarId: mapping.google_calendar_id, eventId: mapping.google_event_id, desiredSnapshot: currentGlow, desiredExtendedProperties: desired.extendedProperties, priorGoogleSnapshot: mapping.last_google_snapshot, onConflict: async (conflict, latest) => { const latestSnapshot = eventSnapshot(latest); await admin.from("google_event_mappings").update({ pending_google_snapshot: latestSnapshot, pending_google_hash: snapshotHash(latestSnapshot), pending_google_etag: latest.etag, pending_google_updated_at: latest.updated || null, updated_at: new Date().toISOString() }).eq("id", mapping.id); await recordSyncIssue({ admin, userId, category: "conflict", direction: "bidirectional", type: item.type, id: item.id, title: desired.summary || "GlowDocket item", calendarId: mapping.google_calendar_id, eventId: mapping.google_event_id, details: { fields: conflict.conflicts } }); } });
        if (result.conflict) continue;
        saved = result.event; googleWrites += 1;
      } catch (error) {
        if (Number(error?.code || error?.response?.status) === 404) {
          await admin.from("google_event_mappings").update({ state: "unlinked_by_user", updated_at: new Date().toISOString() }).eq("id", mapping.id);
          await recordSyncIssue({ admin, userId, category: "event_missing", direction: "google_to_glowdocket", type: item.type, id: item.id, title: desired.summary || "GlowDocket item", calendarId: mapping.google_calendar_id, eventId: mapping.google_event_id });
          continue;
        }
        await recordSyncIssue({ admin, userId, category: providerIssueCategory(error, item.type), direction: "glowdocket_to_google", type: item.type, id: item.id, title: desired.summary || "GlowDocket item", calendarId: mapping.google_calendar_id, eventId: mapping.google_event_id });
        throw error;
      }
    }
    const googleSnapshot = eventSnapshot(saved); const glowSnapshot = eventSnapshot(desired);
    mappingWrites.push({ user_id: userId, glowdocket_type: item.type, glowdocket_id: String(item.id), google_calendar_id: mapping?.google_calendar_id || destinationCalendarId, google_event_id: saved.id, state: "active", google_etag: saved.etag, google_updated_at: saved.updated || null, glowdocket_updated_at: item.updatedAt || null, last_google_snapshot: googleSnapshot, last_google_hash: snapshotHash(googleSnapshot), last_glowdocket_snapshot: glowSnapshot, last_glowdocket_hash: snapshotHash(glowSnapshot), pending_google_snapshot: null, pending_google_hash: null, pending_google_etag: null, pending_google_updated_at: null, sync_version: version, updated_at: new Date().toISOString() });
    markResolved(item.type, item.id);
  }
  if (mappingWrites.length) await admin.from("google_event_mappings").upsert(mappingWrites, { onConflict: "user_id,glowdocket_type,glowdocket_id" }).throwOnError();
  for (const [type, ids] of resolvedByType) await admin.from("google_sync_issues").update({ resolved_at: new Date().toISOString(), resolution_reason: "successful_sync", updated_at: new Date().toISOString() }).eq("user_id", userId).eq("glowdocket_type", type).in("glowdocket_id", [...ids]).is("resolved_at", null);
  const nextCursor = startIndex + processed; const itemsComplete = nextCursor >= items.length;
  let cleanupComplete = true; let cleanupProcessed = 0;
  if (itemsComplete && enabledTypes.length) {
    const staleMappings = (mappings || []).filter((entry) => entry.state === "active" && enabledTypes.includes(entry.glowdocket_type) && !seen.has(`${entry.glowdocket_type}:${entry.glowdocket_id}`));
    for (const mapping of staleMappings.slice(0, 25)) {
      if (Date.now() >= deadline) { cleanupComplete = false; break; }
      await calendar.events.delete({ calendarId: mapping.google_calendar_id, eventId: mapping.google_event_id }).catch((error) => { if (Number(error?.code || error?.response?.status) !== 404) throw error; });
      if (mapping.glowdocket_type === "class") await admin.from("google_event_mappings").delete().eq("id", mapping.id);
      else await admin.from("google_event_mappings").update({ state: "unlinked_by_user", updated_at: new Date().toISOString() }).eq("id", mapping.id);
      cleanupProcessed += 1;
    }
    if (cleanupProcessed < staleMappings.length) cleanupComplete = false;
  }
  const complete = itemsComplete && cleanupComplete;
  console.info("[google-calendar-sync] native-batch", { startIndex, processed, total: items.length, noops, googleWrites, cleanupProcessed, complete, durationMs: Date.now() - startedAt });
  return { nativeUpdates, nextCursor, complete, noops, googleWrites };
}

export async function unlinkManagedItem({ admin, userId, calendar, type, id, deleteGoogle = true, state = "unlinked_by_user" }) {
  const { data: mapping } = await admin.from("google_event_mappings").select("*").eq("user_id", userId).eq("glowdocket_type", type).eq("glowdocket_id", String(id)).maybeSingle();
  if (!mapping) return false;
  if (deleteGoogle && mapping.state === "active") await calendar.events.delete({ calendarId: mapping.google_calendar_id, eventId: mapping.google_event_id }).catch((error) => { if (Number(error?.code || error?.response?.status) !== 404) throw error; });
  await admin.from("google_event_mappings").update({ state, updated_at: new Date().toISOString() }).eq("id", mapping.id);
  return true;
}

export async function restoreManagedItem({ admin, userId, type, id }) {
  await admin.from("google_event_mappings").delete().eq("user_id", userId).eq("glowdocket_type", type).eq("glowdocket_id", String(id));
}

export async function statusFor({ admin, userId }) {
  const [{ data: connection }, { data: preferences }, { data: selected }, { data: imports }, { data: issues }, { data: resolvedIssues }, { count: activeIssueCount }, { count: resolvedIssueCount }, { data: mappings }] = await Promise.all([
    admin.from("google_calendar_connections").select("google_email,status,last_sync_at,granted_scopes").eq("user_id", userId).maybeSingle(),
    admin.from("google_calendar_preferences").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("google_selected_calendars").select("calendar_id,summary,access_role,selected_for_import").eq("user_id", userId),
    admin.from("google_imported_events").select("normalized_event").eq("user_id", userId).eq("hidden", false),
    admin.from("google_sync_issues").select("id,category,direction,glowdocket_type,glowdocket_id,item_title,safe_explanation,recommended_action,diagnostic_ref,attempt_count,last_occurred_at,resolved_at").eq("user_id", userId).is("resolved_at", null).order("last_occurred_at", { ascending: false }).limit(100),
    admin.from("google_sync_issues").select("id,category,direction,glowdocket_type,glowdocket_id,item_title,safe_explanation,recommended_action,diagnostic_ref,attempt_count,last_occurred_at,resolved_at").eq("user_id", userId).not("resolved_at", "is", null).order("resolved_at", { ascending: false }).limit(50),
    admin.from("google_sync_issues").select("id", { count: "exact", head: true }).eq("user_id", userId).is("resolved_at", null),
    admin.from("google_sync_issues").select("id", { count: "exact", head: true }).eq("user_id", userId).not("resolved_at", "is", null),
    admin.from("google_event_mappings").select("glowdocket_type,glowdocket_id,state").eq("user_id", userId),
  ]);
  const publicIssue = (issue) => ({ id: issue.id, category: issue.category || "temporary_provider_failure", direction: issue.direction || "glowdocket_to_google", itemType: issue.glowdocket_type || "", itemId: issue.glowdocket_id || "", itemTitle: issue.item_title || "Google Calendar item", explanation: issue.safe_explanation || ISSUE_COPY.temporary_provider_failure.explanation, recommendedAction: issue.recommended_action || ISSUE_COPY.temporary_provider_failure.action, diagnosticRef: issue.diagnostic_ref || "GC-UNKNOWN", attemptCount: Number(issue.attempt_count || 1), lastOccurredAt: issue.last_occurred_at, resolvedAt: issue.resolved_at });
  return { connected: Boolean(connection && connection.status !== "disconnected"), connection: connection || null, preferences: preferences || null, selectedCalendars: selected || [], importedEvents: (imports || []).map((row) => row.normalized_event), issues: (issues || []).map(publicIssue), resolvedIssues: (resolvedIssues || []).map(publicIssue), activeIssueCount: Number(activeIssueCount || 0), resolvedIssueCount: Number(resolvedIssueCount || 0), mappings: mappings || [] };
}

export const channelTokenHash = sha256;
