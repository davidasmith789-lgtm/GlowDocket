import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_REMINDERS = 100;
const MAX_FUTURE_MS = 366 * 24 * 60 * 60 * 1000;
export const SCHEDULING_HORIZON_MS = 28 * 24 * 60 * 60 * 1000;
const requestWindows = new Map();

export class ReminderError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

export const envEnabled = (value) => /^(1|true|yes|on)$/i.test(String(value || ""));
const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const safeEqual = (a, b) => { const left = Buffer.from(String(a)); const right = Buffer.from(String(b)); return left.length === right.length && crypto.timingSafeEqual(left, right); };
export const occurrenceKeyFor = (taskId, deadline) => `${taskId}:${new Date(deadline).toISOString()}`;
export function idempotencyKeyFor(profileInstallationId, occurrenceKey, revision) {
  const hex = sha256(`${profileInstallationId}:${occurrenceKey}:${revision}`).slice(0, 32).split("");
  hex[12] = "4"; hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

export function signEnrollmentToken(profileInstallationId, subscriptionId, secret) {
  const payload = `${profileInstallationId}.${sha256(subscriptionId)}`;
  return `${payload}.${crypto.createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
export function verifyEnrollmentToken(token, device, secret) { return Boolean(token && device && safeEqual(token, signEnrollmentToken(device.profileInstallationId, device.subscriptionId, secret))); }

export function validateReminder(raw, now = Date.now()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ReminderError("invalid_reminder", "A reminder is required.");
  const allowed = new Set(["taskId", "occurrenceKey", "title", "course", "deadline", "timeZone", "leadMinutes", "revision"]);
  if (Object.keys(raw).some((key) => !allowed.has(key))) throw new ReminderError("invalid_reminder", "The reminder included unsupported data.");
  const taskId = String(raw.taskId || "").trim(); const title = String(raw.title || "").trim(); const course = String(raw.course || "").trim();
  const deadlineDate = new Date(raw.deadline); const leadMinutes = Number(raw.leadMinutes); const revision = String(raw.revision || "").trim(); const timeZone = String(raw.timeZone || "UTC").trim();
  try { new Intl.DateTimeFormat("en-US", { timeZone }).format(); } catch { throw new ReminderError("invalid_schedule", "The reminder timezone is invalid."); }
  if (!/^[A-Za-z0-9_.:-]{1,120}$/.test(taskId) || !title || title.length > 160 || course.length > 100 || !revision || revision.length > 120) throw new ReminderError("invalid_reminder", "The reminder fields are invalid.");
  if (!Number.isFinite(deadlineDate.getTime()) || !Number.isFinite(leadMinutes) || leadMinutes < 1 || leadMinutes > 43200) throw new ReminderError("invalid_schedule", "The reminder schedule is invalid.");
  const reminderSendTime = deadlineDate.getTime() - leadMinutes * 60000;
  if (deadlineDate.getTime() < now - 24 * 60 * 60 * 1000 || reminderSendTime < now - 60000 || reminderSendTime > now + MAX_FUTURE_MS) throw new ReminderError("invalid_schedule", "The reminder time is outside the allowed range.");
  const occurrenceKey = occurrenceKeyFor(taskId, deadlineDate);
  if (raw.occurrenceKey && raw.occurrenceKey !== occurrenceKey) throw new ReminderError("invalid_occurrence", "The reminder occurrence does not match its deadline.");
  return { taskId, occurrenceKey, title, course, deadline: deadlineDate.toISOString(), timeZone, leadMinutes, reminderSendTime: new Date(reminderSendTime).toISOString(), revision };
}

function mapRow(row) {
  if (!row) return null;
  return { id: row.id, profileInstallationId: row.profile_installation_id, taskId: row.task_id, occurrenceKey: row.occurrence_key, subscriptionId: row.onesignal_subscription_id, messageId: row.onesignal_message_id, title: row.assignment_title, course: row.course || "", deadline: row.deadline, reminderSendTime: row.reminder_send_time, timeZone: row.timezone, leadMinutes: row.lead_time_minutes, revision: row.local_revision, status: row.scheduling_status, lastError: row.last_error };
}
function toRow(record) {
  return { profile_installation_id: record.profileInstallationId, task_id: record.taskId, occurrence_key: record.occurrenceKey, onesignal_subscription_id: record.subscriptionId, onesignal_message_id: record.messageId || null, assignment_title: record.title, course: record.course || null, deadline: record.deadline, reminder_send_time: record.reminderSendTime, timezone: record.timeZone, lead_time_minutes: record.leadMinutes, local_revision: record.revision, scheduling_status: record.status, last_error: record.lastError || null, updated_at: new Date().toISOString() };
}

export function createSupabaseRegistry(env = process.env) {
  const url = String(env.SUPABASE_URL || ""); const secret = String(env.SUPABASE_SECRET_KEY || "");
  if (!url || !secret) throw new ReminderError("registry_unavailable", "The reminder registry is not configured.", 503);
  const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, } });
  const checked = async (query) => {
  const { data, error } = await query;
    if (error) {
      console.error("[push-reminders] Supabase error", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });

      throw new ReminderError(
        "registry_failure",
        "The reminder registry is unavailable.",
        503
      );
    }

    return data;
  };
  return {
    getDevice: async (id) => { const rows = await checked(db.from("push_profile_installations").select("profile_installation_id,onesignal_subscription_id").eq("profile_installation_id", id).limit(1)); return rows[0] ? { profileInstallationId: rows[0].profile_installation_id, subscriptionId: rows[0].onesignal_subscription_id } : null; },
    upsertDevice: (device) => checked(db.from("push_profile_installations").upsert({ profile_installation_id: device.profileInstallationId, onesignal_subscription_id: device.subscriptionId, updated_at: new Date().toISOString() }, { onConflict: "profile_installation_id" })),
    get: async (id, occurrenceKey) => mapRow((await checked(db.from("push_reminders").select("*").eq("profile_installation_id", id).eq("occurrence_key", occurrenceKey).limit(1)))[0]),
    list: async (id) => (await checked(db.from("push_reminders").select("*").eq("profile_installation_id", id))).map(mapRow),
    upsert: async (record) => mapRow((await checked(db.from("push_reminders").upsert(toRow(record), { onConflict: "profile_installation_id,occurrence_key" }).select("*").limit(1)))[0]),
    remove: (id, occurrenceKey) => checked(db.from("push_reminders").delete().eq("profile_installation_id", id).eq("occurrence_key", occurrenceKey)),
    pendingWithin: async (endIso, limit = 200) => (await checked(db.from("push_reminders").select("*").in("scheduling_status", ["pending_horizon", "scheduling_failed"]).lte("reminder_send_time", endIso).order("reminder_send_time").limit(limit))).map(mapRow),
    cleanupPending: async (limit = 200) => (await checked(db.from("push_reminders").select("*").eq("scheduling_status", "pending_cleanup").order("updated_at").limit(limit))).map(mapRow),
  };
}

export function createOneSignal(env = process.env, fetchImpl = fetch) {
  const appId = String(env.ONESIGNAL_APP_ID || ""); const apiKey = String(env.ONESIGNAL_API_KEY || "");
  const allowedOrigin = String(env.PUSH_ALLOWED_ORIGIN || "").replace(/\/$/, "");
  if (!appId || !apiKey || !/^https:\/\/[^/]+$/i.test(allowedOrigin)) throw new ReminderError("push_unavailable", "External reminders are not configured.", 503);
  const request = async (path, options = {}) => { const response = await fetchImpl(`https://api.onesignal.com${path}`, { ...options, headers: { authorization: `Key ${apiKey}`, "content-type": "application/json", ...(options.headers || {}) } }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new ReminderError([404, 410].includes(response.status) ? "stale_subscription" : "onesignal_failure", "OneSignal could not update the reminder.", 502); return payload; };
  return {
    schedule: async (record, key) => { const due = new Date(record.deadline).toLocaleString("en-US", { timeZone: record.timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); const payload = await request("/notifications?c=push", { method: "POST", body: JSON.stringify({ app_id: appId, include_subscription_ids: [record.subscriptionId], target_channel: "push", headings: { en: "TaskCabinet reminder" }, contents: { en: `${record.title} is due ${due}${record.course ? ` for ${record.course}` : ""}.` }, send_after: record.reminderSendTime, url: `${allowedOrigin}/?push=${encodeURIComponent(record.profileInstallationId)}&task=${encodeURIComponent(record.taskId)}`, idempotency_key: key }) }); if (!payload.id) throw new ReminderError("empty_onesignal_id", "OneSignal did not create the reminder.", 502); return payload.id; },
    test: async (subscriptionId, key) => { const payload = await request("/notifications?c=push", { method: "POST", body: JSON.stringify({ app_id: appId, include_subscription_ids: [subscriptionId], target_channel: "push", headings: { en: "TaskCabinet test" }, contents: { en: "You’re all set — reminders can reach this browser." }, url: `${allowedOrigin}/`, idempotency_key: key }) }); if (!payload.id) throw new ReminderError("empty_onesignal_id", "OneSignal did not send the test.", 502); return payload.id; },
    cancel: (messageId) => messageId ? request(`/notifications/${encodeURIComponent(messageId)}?app_id=${encodeURIComponent(appId)}`, { method: "DELETE" }) : Promise.resolve(),
  };
}

export function createReminderService({ registry, oneSignal, secret, now = () => Date.now(), externalEnabled = true }) {
  if (!secret || secret.length < 32) throw new ReminderError("push_unavailable", "The push signing secret is not configured.", 503);
  const authenticate = async (id, token) => { const device = await registry.getDevice(id); if (!verifyEnrollmentToken(token, device, secret)) throw new ReminderError("invalid_token", "The reminder connection needs to be renewed.", 401); return device; };
  const cancelRecord = async (record) => { if (!record) return false; if (record.messageId) { try { await oneSignal.cancel(record.messageId); } catch (error) { await registry.upsert({ ...record, status: "pending_cleanup", lastError: error.code || "cancel_failed" }); throw error; } } await registry.remove(record.profileInstallationId, record.occurrenceKey); return true; };
  const scheduleRecord = async (record) => {
    const sendAt = new Date(record.reminderSendTime).getTime();
    if (sendAt > now() + SCHEDULING_HORIZON_MS) return registry.upsert({ ...record, messageId: null, status: "pending_horizon", lastError: null });
    if (!externalEnabled) throw new ReminderError("external_push_disabled", "External push scheduling is currently paused.", 503);
    try { const messageId = await oneSignal.schedule(record, idempotencyKeyFor(record.profileInstallationId, record.occurrenceKey, record.revision)); return registry.upsert({ ...record, messageId, status: "scheduled", lastError: null }); }
    catch (error) { await registry.upsert({ ...record, messageId: null, status: "scheduling_failed", lastError: error.code || "schedule_failed" }); throw error; }
  };
  const recordFor = (device, reminder) => ({ profileInstallationId: device.profileInstallationId, subscriptionId: device.subscriptionId, ...reminder, messageId: null, status: "pending_horizon", lastError: null });
  const replace = async (device, raw) => { const reminder = validateReminder(raw, now()); const existingRows = await registry.list(device.profileInstallationId); const old = existingRows.find((item) => item.taskId === reminder.taskId); if (old) await cancelRecord(old); return scheduleRecord(recordFor(device, reminder)); };
  return {
    enroll: async ({ profileInstallationId, subscriptionId }) => { if (!/^[A-Za-z0-9_-]{24,120}$/.test(String(profileInstallationId || "")) || !/^[A-Za-z0-9_-]{8,200}$/.test(String(subscriptionId || ""))) throw new ReminderError("invalid_device", "The browser subscription is invalid."); const device = { profileInstallationId, subscriptionId }; await registry.upsertDevice(device); return { profileInstallationId, token: signEnrollmentToken(profileInstallationId, subscriptionId, secret) }; },
    schedule: async (input, token) => { if (!externalEnabled) throw new ReminderError("external_push_disabled", "External push scheduling is currently paused.", 503); const device = await authenticate(input.profileInstallationId, token); const reminder = validateReminder(input.reminder, now()); if (await registry.get(device.profileInstallationId, reminder.occurrenceKey)) throw new ReminderError("reminder_exists", "Use replace for an existing reminder.", 409); return scheduleRecord(recordFor(device, reminder)); },
    replace: async (input, token) => { if (!externalEnabled) throw new ReminderError("external_push_disabled", "External push scheduling is currently paused.", 503); return replace(await authenticate(input.profileInstallationId, token), input.reminder); },
    cancel: async (input, token) => { const device = await authenticate(input.profileInstallationId, token); const occurrenceKey = String(input.occurrenceKey || ""); const record = await registry.get(device.profileInstallationId, occurrenceKey); return { cancelled: await cancelRecord(record) }; },
    cancelAll: async (input, token) => { const device = await authenticate(input.profileInstallationId, token); const rows = await registry.list(device.profileInstallationId); let cancelled = 0; const failures = []; for (const row of rows.slice(0, MAX_REMINDERS)) { try { if (await cancelRecord(row)) cancelled += 1; } catch { failures.push(row.occurrenceKey); } } if (failures.length) throw new ReminderError("cleanup_pending", "Some reminders still need cleanup.", 503); return { cancelled }; },
    test: async (input, token) => { if (!externalEnabled) throw new ReminderError("external_push_disabled", "External push testing is currently paused.", 503); const device = await authenticate(input.profileInstallationId, token); return { messageId: await oneSignal.test(device.subscriptionId, idempotencyKeyFor(device.profileInstallationId, "test", String(Math.floor(now() / 60000)))) }; },
    reconcile: async (input, token) => { const device = await authenticate(input.profileInstallationId, token); const desired = Array.isArray(input.reminders) ? input.reminders : []; if (desired.length > MAX_REMINDERS) throw new ReminderError("batch_too_large", "Too many reminders were sent at once.", 413); const validated = desired.map((item) => validateReminder(item, now())); if (new Set(validated.map((item) => item.occurrenceKey)).size !== validated.length) throw new ReminderError("duplicate_occurrence", "Each assignment occurrence can have only one reminder."); const existing = await registry.list(device.profileInstallationId); const wantedOccurrences = new Set(validated.map((item) => item.occurrenceKey)); const wantedTaskIds = new Set(validated.map((item) => item.taskId)); const results = []; for (const row of existing) if (!wantedOccurrences.has(row.occurrenceKey) && !wantedTaskIds.has(row.taskId)) { try { await cancelRecord(row); results.push({ occurrenceKey: row.occurrenceKey, action: "cancelled" }); } catch { results.push({ occurrenceKey: row.occurrenceKey, action: "cleanup_pending" }); } } for (const reminder of validated) { const exact = existing.find((row) => row.occurrenceKey === reminder.occurrenceKey); const priorOccurrence = existing.find((row) => row.taskId === reminder.taskId && row.occurrenceKey !== reminder.occurrenceKey); if (!exact && !priorOccurrence) { if (!externalEnabled) { results.push({ occurrenceKey: reminder.occurrenceKey, action: "external_disabled" }); continue; } const saved = await scheduleRecord(recordFor(device, reminder)); results.push({ occurrenceKey: reminder.occurrenceKey, action: saved.status }); } else if (priorOccurrence || exact.revision !== reminder.revision || exact.subscriptionId !== device.subscriptionId) { if (!externalEnabled) { results.push({ occurrenceKey: reminder.occurrenceKey, action: "external_disabled" }); continue; } const saved = await replace(device, reminder); results.push({ occurrenceKey: reminder.occurrenceKey, action: saved.status }); } else results.push({ occurrenceKey: reminder.occurrenceKey, action: exact.status }); } return { results }; },
    processHorizon: async () => { const results = []; const cleanupRows = registry.cleanupPending ? await registry.cleanupPending() : []; for (const row of cleanupRows) { try { await cancelRecord(row); results.push({ occurrenceKey: row.occurrenceKey, action: "cleanup_completed" }); } catch (error) { results.push({ occurrenceKey: row.occurrenceKey, action: "cleanup_pending", code: error.code }); } } if (!externalEnabled) return { processed: cleanupRows.length, disabled: true, results }; const rows = await registry.pendingWithin(new Date(now() + SCHEDULING_HORIZON_MS).toISOString()); for (const row of rows) { try { const saved = await scheduleRecord(row); results.push({ occurrenceKey: row.occurrenceKey, action: saved.status }); } catch (error) { results.push({ occurrenceKey: row.occurrenceKey, action: "scheduling_failed", code: error.code }); } } return { processed: cleanupRows.length + rows.length, results }; },
  };
}

const tokenFrom = (req) => String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
function allowedOrigin(req) { const allowed = String(process.env.PUSH_ALLOWED_ORIGIN || "").replace(/\/$/, ""); const origin = String(req.headers.origin || "").replace(/\/$/, ""); return Boolean(allowed && origin === allowed); }
function enforceRateLimit(action, req, body) {
  const identity = String(body.profileInstallationId || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "anonymous").split(",")[0].trim();
  const key = `${action}:${sha256(identity)}`; const current = Date.now(); const window = requestWindows.get(key);
  const limit = action === "enroll" ? 20 : 120;
  if (!window || current - window.startedAt >= 60000) { requestWindows.set(key, { startedAt: current, count: 1 }); return; }
  window.count += 1;
  if (window.count > limit) throw new ReminderError("rate_limited", "Too many reminder requests were sent. Please wait a moment.", 429);
}
export async function handleReminderRequest(action, req, res, overrides = {}) {
  res.setHeader("cache-control", "no-store"); res.setHeader("x-content-type-options", "nosniff");
  if (req.method !== "POST") return res.status(405).json({ error: "Only POST requests are accepted.", code: "method_not_allowed" });
  if (!overrides.skipOrigin && !allowedOrigin(req)) return res.status(403).json({ error: "This origin is not allowed.", code: "origin_not_allowed" });
  if (Number(req.headers["content-length"] || 0) > MAX_BODY_BYTES) return res.status(413).json({ error: "The request is too large.", code: "request_too_large" });
  const schedulingAction = ["schedule", "replace", "test"].includes(action);
  if (schedulingAction && !envEnabled(process.env.EXTERNAL_PUSH_ENABLED)) return res.status(503).json({ error: "External push scheduling is currently paused.", code: "external_push_disabled" });
  try { const registry = overrides.registry || createSupabaseRegistry(); const oneSignal = overrides.oneSignal || createOneSignal(); const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {}); enforceRateLimit(action, req, body); const service = createReminderService({ registry, oneSignal, secret: overrides.secret || process.env.PUSH_SIGNING_SECRET, now: overrides.now, externalEnabled: overrides.externalEnabled ?? envEnabled(process.env.EXTERNAL_PUSH_ENABLED) }); const result = await service[action](body, tokenFrom(req)); return res.status(200).json({ ok: true, ...result }); }
  catch (error) { const known = error instanceof ReminderError; return res.status(known ? error.status : 500).json({ error: known ? error.message : "The reminder service could not finish that request.", code: known ? error.code : "reminder_service_failure" }); }
}

export async function handleReminderCron(req, res, overrides = {}) {
  if (req.method !== "GET") return res.status(405).json({ error: "Only GET requests are accepted." });
  const secret = String(overrides.cronSecret || process.env.CRON_SECRET || "");
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: "Unauthorized.", code: "invalid_cron_secret" });
  try { const service = createReminderService({ registry: overrides.registry || createSupabaseRegistry(), oneSignal: overrides.oneSignal || createOneSignal(), secret: overrides.signingSecret || process.env.PUSH_SIGNING_SECRET, now: overrides.now, externalEnabled: overrides.externalEnabled ?? envEnabled(process.env.EXTERNAL_PUSH_ENABLED) }); return res.status(200).json({ ok: true, ...(await service.processHorizon()) }); }
  catch (error) { return res.status(error.status || 500).json({ error: error.message || "Cron processing failed.", code: error.code || "cron_failure" }); }
}
