import test from "node:test";
import assert from "node:assert/strict";
import { createOneSignal, createReminderService, idempotencyKeyFor, occurrenceKeyFor, SCHEDULING_HORIZON_MS, signEnrollmentToken, validateReminder, verifyEnrollmentToken } from "../api/reminders/_service.js";
import { buildDesiredReminders, createOpaqueDeviceId, getOccurrenceKey, getPushCleanupStorageKey, getPushDeviceStorageKey, shouldUseOpenAppFallback } from "../src/externalReminderUtils.js";
import { classifyDeadline, summarizeDeadlineConfidence } from "../src/deadlineConfidenceUtils.js";

function createFakeRegistry() {
  const devices = new Map(); const records = new Map();
  const key = (id, occurrence) => `${id}|${occurrence}`;
  return {
    devices, records,
    getDevice: async (id) => devices.get(id) || null,
    upsertDevice: async (device) => { devices.set(device.profileInstallationId, { ...device }); },
    get: async (id, occurrence) => records.get(key(id, occurrence)) || null,
    list: async (id) => [...records.values()].filter((row) => row.profileInstallationId === id),
    upsert: async (record) => { records.set(key(record.profileInstallationId, record.occurrenceKey), { ...record }); return { ...record }; },
    remove: async (id, occurrence) => { records.delete(key(id, occurrence)); },
    pendingWithin: async (endIso) => [...records.values()].filter((row) => ["pending_horizon", "scheduling_failed"].includes(row.status) && row.reminderSendTime <= endIso),
    cleanupPending: async () => [...records.values()].filter((row) => row.status === "pending_cleanup"),
  };
}
function createFakeOneSignal(events, options = {}) {
  return {
    schedule: async (record, key) => { events.push({ action: "schedule", occurrenceKey: record.occurrenceKey, key }); if (options.scheduleError) throw options.scheduleError; return options.emptyId ? "" : `message-${record.revision}`; },
    cancel: async (id) => { events.push({ action: "cancel", id }); if (options.cancelError) throw options.cancelError; },
    test: async () => "test-message",
  };
}

const now = new Date("2026-07-12T12:00:00.000Z").getTime();
const secret = "a-secure-test-signing-secret-that-is-long-enough";
const profileInstallationId = "opaque-profile-installation-12345";
const subscriptionId = "subscription-12345";
const baseReminder = { taskId: "task-1", title: "Biology review", course: "Biology", deadline: "2026-07-13T15:00:00.000Z", timeZone: "America/New_York", leadMinutes: 60, revision: "v1" };
const reminder = { ...baseReminder, occurrenceKey: occurrenceKeyFor(baseReminder.taskId, baseReminder.deadline) };

async function enrolledService(options = {}) {
  const registry = options.registry || createFakeRegistry(); const events = [];
  const oneSignal = options.oneSignal || createFakeOneSignal(events, options);
  const service = createReminderService({ registry, oneSignal, secret, now: () => now, externalEnabled: options.externalEnabled ?? true });
  const enrolled = await service.enroll({ profileInstallationId, subscriptionId });
  return { registry, events, service, enrolled };
}

test("opaque profile installation IDs and local keys remain profile-isolated", () => {
  let seed = 0; const fakeCrypto = { getRandomValues(bytes) { for (let index = 0; index < bytes.length; index += 1) bytes[index] = seed++; } };
  assert.equal(createOpaqueDeviceId(fakeCrypto).length, 48);
  assert.notEqual(getPushDeviceStorageKey("Alex"), getPushDeviceStorageKey("Jordan"));
  assert.notEqual(getPushCleanupStorageKey("Alex"), getPushCleanupStorageKey("Jordan"));
});

test("signed enrollment tokens bind one opaque installation to one subscription", () => {
  const token = signEnrollmentToken(profileInstallationId, subscriptionId, secret);
  assert.equal(verifyEnrollmentToken(token, { profileInstallationId, subscriptionId }, secret), true);
  assert.equal(verifyEnrollmentToken(token, { profileInstallationId, subscriptionId: "different-subscription" }, secret), false);
});

test("validation creates occurrence keys and rejects private assignment fields", () => {
  assert.throws(() => validateReminder({ ...reminder, notes: "private" }, now), /unsupported data/);
  const validated = validateReminder(reminder, now);
  assert.equal(validated.occurrenceKey, getOccurrenceKey(reminder.taskId, new Date(reminder.deadline)));
  assert.equal(validated.reminderSendTime, "2026-07-13T14:00:00.000Z");
});

test("OneSignal idempotency keys are deterministic UUIDs", () => {
  const first = idempotencyKeyFor(profileInstallationId, reminder.occurrenceKey, "v1");
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(first, idempotencyKeyFor(profileInstallationId, reminder.occurrenceKey, "v1"));
  assert.notEqual(first, idempotencyKeyFor(profileInstallationId, reminder.occurrenceKey, "v2"));
});

test("near reminders schedule while far-future reminders stay pending_horizon", async () => {
  const { service, enrolled, registry, events } = await enrolledService();
  const near = await service.schedule({ profileInstallationId, reminder }, enrolled.token);
  assert.equal(near.status, "scheduled");
  const futureDeadline = new Date(now + SCHEDULING_HORIZON_MS + 3 * 24 * 60 * 60 * 1000).toISOString();
  const farBase = { ...baseReminder, taskId: "task-far", deadline: futureDeadline, revision: "far-v1" };
  const far = await service.schedule({ profileInstallationId, reminder: { ...farBase, occurrenceKey: occurrenceKeyFor(farBase.taskId, farBase.deadline) } }, enrolled.token);
  assert.equal(far.status, "pending_horizon");
  assert.equal(events.filter((event) => event.action === "schedule").length, 1);
  assert.equal([...registry.records.values()].length, 2);
});

test("daily horizon processing promotes pending reminders once without duplicates", async () => {
  const registry = createFakeRegistry(); const events = []; let clock = now;
  const service = createReminderService({ registry, oneSignal: createFakeOneSignal(events), secret, now: () => clock, externalEnabled: true });
  const enrolled = await service.enroll({ profileInstallationId, subscriptionId });
  const deadline = new Date(now + SCHEDULING_HORIZON_MS + 2 * 24 * 60 * 60 * 1000).toISOString();
  const item = { ...baseReminder, taskId: "future", deadline, occurrenceKey: occurrenceKeyFor("future", deadline), revision: "future-v1" };
  await service.schedule({ profileInstallationId, reminder: item }, enrolled.token);
  clock += 3 * 24 * 60 * 60 * 1000;
  const first = await service.processHorizon(); const second = await service.processHorizon();
  assert.equal(first.processed, 1); assert.equal(second.processed, 0);
  assert.equal(events.filter((event) => event.action === "schedule").length, 1);
});

test("replace cancels the old occurrence and schedules the changed occurrence", async () => {
  const { service, enrolled, events } = await enrolledService();
  await service.schedule({ profileInstallationId, reminder }, enrolled.token);
  const changedBase = { ...baseReminder, deadline: "2026-07-13T16:00:00.000Z", revision: "v2" };
  await service.replace({ profileInstallationId, reminder: { ...changedBase, occurrenceKey: occurrenceKeyFor(changedBase.taskId, changedBase.deadline) } }, enrolled.token);
  assert.deepEqual(events.map((event) => event.action), ["schedule", "cancel", "schedule"]);
});

test("failed cancellation leaves a pending_cleanup server record", async () => {
  const cleanupError = Object.assign(new Error("offline"), { code: "cancel_failed" });
  const { service, enrolled, registry } = await enrolledService({ cancelError: cleanupError });
  await service.schedule({ profileInstallationId, reminder }, enrolled.token);
  await assert.rejects(() => service.cancelAll({ profileInstallationId }, enrolled.token), /cleanup/);
  assert.equal([...registry.records.values()][0].status, "pending_cleanup");
});

test("cron retries stale pending_cleanup records", async () => {
  const registry = createFakeRegistry(); const events = []; let cancellationFails = true;
  const oneSignal = { schedule: async (record) => `message-${record.revision}`, cancel: async (id) => { events.push({ action: "cancel", id }); if (cancellationFails) throw Object.assign(new Error("offline"), { code: "cancel_failed" }); }, test: async () => "test" };
  const service = createReminderService({ registry, oneSignal, secret, now: () => now, externalEnabled: true });
  const enrolled = await service.enroll({ profileInstallationId, subscriptionId });
  await service.schedule({ profileInstallationId, reminder }, enrolled.token);
  await assert.rejects(() => service.cancelAll({ profileInstallationId }, enrolled.token));
  cancellationFails = false;
  const result = await service.processHorizon();
  assert.equal(result.results[0].action, "cleanup_completed");
  assert.equal((await registry.list(profileInstallationId)).length, 0);
});

test("server kill switch blocks scheduling but leaves cleanup available", async () => {
  const registry = createFakeRegistry(); const events = [];
  const active = createReminderService({ registry, oneSignal: createFakeOneSignal(events), secret, now: () => now, externalEnabled: true });
  const enrolled = await active.enroll({ profileInstallationId, subscriptionId });
  await active.schedule({ profileInstallationId, reminder }, enrolled.token);
  const disabled = createReminderService({ registry, oneSignal: createFakeOneSignal(events), secret, now: () => now, externalEnabled: false });
  await assert.rejects(() => disabled.replace({ profileInstallationId, reminder: { ...reminder, revision: "v2" } }, enrolled.token), /paused/);
  assert.equal((await disabled.cancelAll({ profileInstallationId }, enrolled.token)).cancelled, 1);
});

test("reconciliation isolates profiles and removes completed or deleted occurrences", async () => {
  const registry = createFakeRegistry(); const events = []; const service = createReminderService({ registry, oneSignal: createFakeOneSignal(events), secret, now: () => now, externalEnabled: true });
  const first = await service.enroll({ profileInstallationId, subscriptionId });
  const otherId = "opaque-profile-installation-67890"; const second = await service.enroll({ profileInstallationId: otherId, subscriptionId: "subscription-67890" });
  await service.reconcile({ profileInstallationId, reminders: [reminder] }, first.token);
  await service.reconcile({ profileInstallationId: otherId, reminders: [{ ...reminder, occurrenceKey: reminder.occurrenceKey }] }, second.token);
  await service.reconcile({ profileInstallationId, reminders: [] }, first.token);
  assert.equal((await registry.list(profileInstallationId)).length, 0);
  assert.equal((await registry.list(otherId)).length, 1);
});

test("client builder handles repeating occurrences, lead changes, and local exclusions", () => {
  const future = new Date(now + 3 * 60 * 60 * 1000);
  const tasks = [{ id: "repeat-occurrence", title: "Practice", repeat: "WEEKLY" }, { id: "done", title: "Done", isCompleted: true }, { id: "trash", title: "Trash", isDeleted: true }, { id: "none", title: "No date" }];
  const result = buildDesiredReminders(tasks, { leadMinutes: 60, timeZone: "UTC", now, getDeadline: (task) => task.id === "repeat-occurrence" ? future : null });
  assert.deepEqual(result.map((item) => item.taskId), ["repeat-occurrence"]);
  assert.equal(result[0].occurrenceKey, occurrenceKeyFor("repeat-occurrence", future));
  const changed = buildDesiredReminders(tasks, { leadMinutes: 30, timeZone: "UTC", now, getDeadline: (task) => task.id === "repeat-occurrence" ? future : null });
  assert.notEqual(result[0].revision, changed[0].revision);
});

test("OneSignal targets only the subscription and treats an empty message ID as failure", async () => {
  let captured;
  const oneSignal = createOneSignal({ ONESIGNAL_APP_ID: "app-id", ONESIGNAL_API_KEY: "server-secret", PUSH_ALLOWED_ORIGIN: "https://taskcabinet.example" }, async (_url, options) => { captured = JSON.parse(options.body); return { ok: true, json: async () => ({ id: "" }) }; });
  const record = { profileInstallationId, subscriptionId, ...validateReminder(reminder, now) };
  await assert.rejects(() => oneSignal.schedule(record, idempotencyKeyFor(profileInstallationId, reminder.occurrenceKey, reminder.revision)), /did not create/);
  assert.deepEqual(captured.include_subscription_ids, [subscriptionId]);
  assert.equal("username" in captured, false); assert.equal("notes" in captured, false);
});

test("open-app fallback covers unsupported, denied, offline, and API failure states", () => {
  for (const status of ["unsupported", "permission_blocked", "failed", "sync_needed", "client_disabled"]) assert.equal(shouldUseOpenAppFallback(status), true);
  assert.equal(shouldUseOpenAppFallback("active"), false);
  assert.equal(shouldUseOpenAppFallback("syncing"), false);
});

test("deadline confidence classifies and counts overdue, today, and tomorrow", () => {
  const localNow = new Date(2026, 6, 12, 15, 0);
  assert.equal(classifyDeadline(new Date(2026, 6, 11, 23, 0), localNow), "overdue");
  assert.equal(classifyDeadline(new Date(2026, 6, 12, 8, 0), localNow), "today");
  assert.equal(classifyDeadline(new Date(2026, 6, 13, 8, 0), localNow), "tomorrow");
  const tasks = [{ deadline: new Date(2026, 6, 11) }, { deadline: new Date(2026, 6, 12) }, { deadline: new Date(2026, 6, 13) }, { deadline: null }];
  assert.deepEqual(summarizeDeadlineConfidence(tasks, (task) => task.deadline, localNow), { overdue: 1, today: 1, tomorrow: 1, later: 0, "no-date": 1 });
});
