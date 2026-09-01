import process from "node:process";
import crypto from "node:crypto";
import {
  GoogleCalendarError,
  WRITE_SCOPE,
  authenticateRequest,
  authorizedCalendar,
  beginOAuth,
  canCreateEvents,
  channelTokenHash,
  createAdmin,
  ensureDedicatedCalendar,
  ensureDedicatedImportSelection,
  ensureWebhookChannel,
  finishOAuth,
  listCalendarChoices,
  restoreManagedItem,
  statusFor,
  syncImportedCalendar,
  synchronizeNativeItems,
  unlinkManagedItem,
} from "../server/services/googleCalendarService.js";

const jsonBody = (req) => typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
const appOrigin = () => String(process.env.GOOGLE_CALENDAR_APP_ORIGIN || process.env.PUSH_ALLOWED_ORIGIN || "").replace(/\/$/, "");
const safeError = (error) => error instanceof GoogleCalendarError ? error : new GoogleCalendarError("google_calendar_failure", "Google Calendar could not finish that request. Your GlowDocket data was not changed.", 500);
const SYNC_BUDGET_MS = 20_000;

async function claimSyncJob(admin, userId, requestedJobId) {
  const now = new Date(); const lockUntil = new Date(now.getTime() + 45_000).toISOString();
  if (requestedJobId) {
    const { data } = await admin.from("google_calendar_connections").update({ sync_lock_until: lockUntil }).eq("user_id", userId).eq("sync_job_id", requestedJobId).select("sync_job_id,sync_cursor").maybeSingle();
    if (!data) throw new GoogleCalendarError("sync_expired", "That synchronization pass expired. Start Sync now again.", 409);
    return { jobId: data.sync_job_id, cursor: Number(data.sync_cursor || 0) };
  }
  const jobId = crypto.randomUUID();
  const { data } = await admin.from("google_calendar_connections").update({ sync_job_id: jobId, sync_cursor: 0, sync_lock_until: lockUntil, sync_started_at: now.toISOString() }).eq("user_id", userId).or(`sync_lock_until.is.null,sync_lock_until.lt.${now.toISOString()}`).select("sync_job_id,sync_cursor").maybeSingle();
  if (!data) throw new GoogleCalendarError("sync_in_progress", "A Google Calendar synchronization is already running for this account.", 409);
  return { jobId, cursor: 0 };
}

async function continueSyncJob(admin, userId, jobId, cursor) {
  await admin.from("google_calendar_connections").update({ sync_cursor: cursor, sync_lock_until: new Date(Date.now() + 45_000).toISOString() }).eq("user_id", userId).eq("sync_job_id", jobId);
}

async function finishSyncJob(admin, userId, jobId) {
  await admin.from("google_calendar_connections").update({ sync_job_id: null, sync_cursor: 0, sync_lock_until: null, sync_started_at: null }).eq("user_id", userId).eq("sync_job_id", jobId);
}

async function callback(req, res, admin) {
  const result = await finishOAuth({ admin, code: String(req.query.code || ""), state: String(req.query.state || "") });
  const origin = appOrigin();
  if (!origin) throw new GoogleCalendarError("integration_unavailable", "The Google Calendar return URL is not configured.", 503);
  return res.redirect(302, `${origin}${result.returnTo}${result.returnTo.includes("?") ? "&" : "?"}googleCalendar=connected`);
}

async function webhook(req, res, admin) {
  const channelId = String(req.headers["x-goog-channel-id"] || "");
  const resourceId = String(req.headers["x-goog-resource-id"] || "");
  const token = String(req.headers["x-goog-channel-token"] || "");
  const messageNumber = Number(req.headers["x-goog-message-number"] || 0);
  const { data: channel } = await admin.from("google_webhook_channels").select("*").eq("channel_id", channelId).eq("active", true).maybeSingle();
  if (!channel || channel.token_hash !== channelTokenHash(token) || (channel.resource_id && channel.resource_id !== resourceId)) return res.status(404).end();
  if (!Number.isSafeInteger(messageNumber) || messageNumber <= Number(channel.latest_message_number || 0)) return res.status(204).end();
  await admin.from("google_webhook_channels").update({ latest_message_number: messageNumber, updated_at: new Date().toISOString() }).eq("channel_id", channelId);
  const { data: selection } = await admin.from("google_selected_calendars").select("*").eq("user_id", channel.user_id).eq("calendar_id", channel.calendar_id).eq("selected_for_import", true).maybeSingle();
  if (selection) { const auth = await authorizedCalendar({ admin, userId: channel.user_id }); await syncImportedCalendar({ admin, userId: channel.user_id, calendar: auth.calendar, selection }); }
  return res.status(204).end();
}

async function disconnect({ admin, userId, calendar, oauth, keepCalendar }) {
  const { data: prefs } = await admin.from("google_calendar_preferences").select("*").eq("user_id", userId).maybeSingle();
  const { data: channels } = await admin.from("google_webhook_channels").select("channel_id,resource_id").eq("user_id", userId).eq("active", true);
  const leftovers = [];
  for (const channel of channels || []) try { await calendar.channels.stop({ requestBody: { id: channel.channel_id, resourceId: channel.resource_id } }); } catch { leftovers.push("A notification channel will expire automatically."); }
  if (!keepCalendar && prefs?.dedicated_calendar_id) try { await calendar.calendars.delete({ calendarId: prefs.dedicated_calendar_id }); } catch { leftovers.push("The GlowDocket calendar may still remain in Google."); }
  await admin.from("google_webhook_channels").update({ active: false, updated_at: new Date().toISOString() }).eq("user_id", userId);
  await admin.from("google_imported_events").delete().eq("user_id", userId);
  await admin.from("google_selected_calendars").update({ sync_token: null, full_sync_required: true }).eq("user_id", userId);
  await admin.from("google_oauth_states").delete().eq("user_id", userId);
  await admin.from("google_calendar_connections").update({ encrypted_access_token: null, encrypted_refresh_token: null, token_expires_at: null, status: "disconnected", updated_at: new Date().toISOString() }).eq("user_id", userId);
  try { await oauth.revokeCredentials(); } catch { leftovers.push("Google access could not be revoked automatically; remove GlowDocket from your Google Account permissions."); }
  return { disconnected: true, warnings: leftovers };
}

async function routeAction(req, admin, user) {
  const body = jsonBody(req); const action = String(body.action || req.query.action || "status");
  if (action === "oauth-start") return { authorizationUrl: await beginOAuth({ admin, userId: user.id, kind: body.kind === "existing_calendar_write" ? body.kind : "initial", returnTo: body.returnTo || "/?tab=settings&settings=calendar" }) };
  if (action === "status") return statusFor({ admin, userId: user.id });
  const auth = await authorizedCalendar({ admin, userId: user.id });
  if (action === "calendars") return { calendars: await listCalendarChoices(auth) };
  if (action === "settings") {
    const allowed = ["sync_assignments", "sync_activities", "sync_classes", "sync_checklists", "include_notes"];
    const values = Object.fromEntries(allowed.filter((key) => typeof body[key] === "boolean").map((key) => [key, body[key]]));
    if (body.destination_kind === "existing") {
      if (!auth.connection.granted_scopes?.includes(WRITE_SCOPE)) return { incrementalAuthorizationRequired: true, authorizationUrl: await beginOAuth({ admin, userId: user.id, kind: "existing_calendar_write", returnTo: "/?tab=settings&settings=calendar" }) };
      const choices = await listCalendarChoices(auth); const choice = choices.find((item) => item.id === body.destination_calendar_id);
      if (!choice || !canCreateEvents(choice.accessRole)) throw new GoogleCalendarError("calendar_not_writable", "Choose a Google calendar that allows GlowDocket to create events.");
      Object.assign(values, { destination_kind: "existing", destination_calendar_id: choice.id });
    }
    if (body.destination_kind === "dedicated") Object.assign(values, { destination_kind: "dedicated", destination_calendar_id: await ensureDedicatedCalendar({ admin, userId: user.id, calendar: auth.calendar }) });
    await admin.from("google_calendar_preferences").update({ ...values, updated_at: new Date().toISOString() }).eq("user_id", user.id);
    if (Array.isArray(body.import_calendar_ids)) {
      const choices = await listCalendarChoices(auth); const selected = new Set(body.import_calendar_ids.map(String));
      for (const choice of choices) await admin.from("google_selected_calendars").upsert({ user_id: user.id, calendar_id: choice.id, summary: choice.summary, access_role: choice.accessRole, selected_for_import: selected.has(choice.id), full_sync_required: true, updated_at: new Date().toISOString() });
    }
    const { data: savedPreferences } = await admin.from("google_calendar_preferences").select("destination_kind,dedicated_calendar_id").eq("user_id", user.id).single();
    if (savedPreferences.destination_kind === "dedicated" && savedPreferences.dedicated_calendar_id) await ensureDedicatedImportSelection({ admin, userId: user.id, calendarId: savedPreferences.dedicated_calendar_id });
    return statusFor({ admin, userId: user.id });
  }
  if (action === "sync") {
    const syncStartedAt = Date.now(); const deadline = syncStartedAt + SYNC_BUDGET_MS;
    const job = await claimSyncJob(admin, user.id, body.continuationToken ? String(body.continuationToken) : null);
    const { data: prefs } = await admin.from("google_calendar_preferences").select("*").eq("user_id", user.id).single();
    let destination = prefs.destination_calendar_id;
    if (prefs.destination_kind === "dedicated") destination = await ensureDedicatedCalendar({ admin, userId: user.id, calendar: auth.calendar });
    const { data: selections } = await admin.from("google_selected_calendars").select("*").eq("user_id", user.id).eq("selected_for_import", true);
    let importsComplete = true; const managedEvents = []; let importedProcessed = 0;
    for (const selection of selections || []) {
      if (Date.now() >= deadline) { importsComplete = false; break; }
      const result = await syncImportedCalendar({ admin, userId: user.id, calendar: auth.calendar, selection, jobId: job.jobId });
      managedEvents.push(...result.managedEvents); importedProcessed += result.processed; if (!result.complete) importsComplete = false;
    }
    if (!importsComplete) {
      await continueSyncJob(admin, user.id, job.jobId, job.cursor);
      console.info("[google-calendar-sync] continuation", { phase: "imports", importedProcessed, durationMs: Date.now() - syncStartedAt });
      return { syncState: "in_progress", continuationToken: job.jobId, phase: "imports", processed: importedProcessed };
    }
    const enabledTypes = [["assignment", prefs.sync_assignments], ["activity", prefs.sync_activities], ["class", prefs.sync_classes], ["checklist", prefs.sync_checklists]].filter(([, enabled]) => enabled).map(([type]) => type);
    const nativeResult = destination ? await synchronizeNativeItems({ admin, userId: user.id, calendar: auth.calendar, destinationCalendarId: destination, items: Array.isArray(body.items) ? body.items : [], enabledTypes, startIndex: job.cursor, managedEvents, deadline }) : { nativeUpdates: [], complete: true, nextCursor: 0 };
    if (!nativeResult.complete) {
      await continueSyncJob(admin, user.id, job.jobId, nativeResult.nextCursor);
      console.info("[google-calendar-sync] continuation", { phase: "native", cursor: nativeResult.nextCursor, total: Array.isArray(body.items) ? body.items.length : 0, googleWrites: nativeResult.googleWrites, noops: nativeResult.noops, durationMs: Date.now() - syncStartedAt });
      return { syncState: "in_progress", continuationToken: job.jobId, phase: "native", cursor: nativeResult.nextCursor, nativeUpdates: nativeResult.nativeUpdates };
    }
    for (const selection of selections || []) await ensureWebhookChannel({ admin, userId: user.id, calendar: auth.calendar, calendarId: selection.calendar_id });
    if (destination && !(selections || []).some((selection) => selection.calendar_id === destination)) await ensureWebhookChannel({ admin, userId: user.id, calendar: auth.calendar, calendarId: destination });
    await admin.from("google_calendar_connections").update({ last_sync_at: new Date().toISOString(), last_error: null, status: "connected", updated_at: new Date().toISOString() }).eq("user_id", user.id);
    await finishSyncJob(admin, user.id, job.jobId);
    console.info("[google-calendar-sync] complete", { importedProcessed, nativeItems: Array.isArray(body.items) ? body.items.length : 0, googleWrites: nativeResult.googleWrites, noops: nativeResult.noops, durationMs: Date.now() - syncStartedAt });
    return { ...(await statusFor({ admin, userId: user.id })), syncState: "complete", nativeUpdates: nativeResult.nativeUpdates };
  }
  if (action === "unlink") return { unlinked: await unlinkManagedItem({ admin, userId: user.id, calendar: auth.calendar, type: String(body.type || ""), id: String(body.id || ""), deleteGoogle: body.deleteGoogle !== false }) };
  if (action === "restore") { await restoreManagedItem({ admin, userId: user.id, type: String(body.type || ""), id: String(body.id || "") }); return { restored: true }; }
  if (action === "disconnect") return disconnect({ admin, userId: user.id, ...auth, keepCalendar: body.keepCalendar !== false });
  throw new GoogleCalendarError("unknown_action", "That Google Calendar action is not supported.", 404);
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store"); res.setHeader("x-content-type-options", "nosniff");
  const admin = createAdmin();
  try {
    if (req.method === "GET" && req.query.action === "callback") return await callback(req, res, admin);
    if (req.method === "POST" && req.query.action === "webhook") return await webhook(req, res, admin);
    if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ error: "Method not allowed." });
    const user = await authenticateRequest(req, admin); const result = await routeAction(req, admin, user);
    return res.status(200).json({ ok: true, ...result });
  } catch (rawError) {
    const error = safeError(rawError);
    if (error.status >= 500) console.error("[google-calendar] request failed", { code: error.code, message: rawError?.message });
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
}
