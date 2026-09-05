import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { activityGoogleEvent, applyGoogleNativeUpdates, assignmentGoogleEvent, buildGoogleCalendarItems, buildNativeUpdateConfirmations, classGoogleEvents, googleDateTimeParts, googleEventDateKey, googleEventsForDate } from "../src/googleCalendarUtils.js";
import { auditManagedAssignmentEvents, canCreateEvents, changedFields, completeIssueResolution, eventSnapshot, isManagedEvent, managedIdentityDecision, managedProjectionDecision, mergeSnapshots, providerIssueCategory, semanticallyEquivalentSnapshots, snapshotHash, synchronizeNativeItems, upsertEventMappings, verifyLegacyMappingIssues } from "../server/services/googleCalendarService.js";
import { claimSyncJob, confirmNativeUpdates, continueSyncJob, finalizeSyncJob, markWebhookDirty } from "../api/google-calendar.js";

test("assignments map to all-day or fifteen-minute Google events", () => {
  const allDay = assignmentGoogleEvent({ title: "Essay", dueYear: 2026, dueMonth: 9, dueDay: 2 });
  assert.equal(allDay.summary, "Due: Essay"); assert.deepEqual(allDay.start, { date: "2026-09-02" }); assert.deepEqual(allDay.end, { date: "2026-09-03" });
  const timed = assignmentGoogleEvent({ title: "Quiz", dueYear: 2026, dueMonth: 9, dueDay: 2, dueHour: 1, dueAmPm: "PM" }, { timeZone: "America/New_York" });
  assert.equal(timed.start.dateTime, "2026-09-02T13:00:00"); assert.equal(timed.end.dateTime, "2026-09-02T13:15:00");
});

test("notes remain private by default and category defaults are respected", () => {
  const items = buildGoogleCalendarItems({ tasks: [{ id: "a", title: "Private", dueYear: 2026, dueMonth: 9, dueDay: 2, notes: "secret" }], calendarEvents: [], checklists: [{ title: "List", items: [{ id: "c", text: "Call", dueDate: "2026-09-02" }] }], courses: [], settings: {}, preferences: { sync_assignments: true, sync_activities: true, sync_classes: true, sync_checklists: false, include_notes: false }, origin: "https://glowdocket.com", timeZone: "UTC" });
  assert.equal(items.length, 1); assert.doesNotMatch(items[0].googleEvent.description, /secret/);
});

test("weekly classes use recurrence and cycle classes are deterministic future occurrences", () => {
  const weekly = classGoogleEvents(["Math"], { schoolScheduleMode: "weekly", weeklyCourseMeetings: { Math: [{ id: "m", weekdays: [1, 3], startTime: "09:00", endTime: "10:00" }] } }, { today: new Date("2026-08-31T12:00:00"), timeZone: "UTC" });
  assert.equal(weekly.length, 1, "a weekly class remains one recurring master rather than 12 months of occurrences"); assert.match(weekly[0].googleEvent.recurrence[0], /BYDAY=MO,WE/);
  const cycle = classGoogleEvents(["Math"], { schoolScheduleMode: "ab", cycleAnchorDate: "2026-08-31", cycleDayNames: ["A", "B"], courseCycleDays: { Math: ["A"] }, cycleCourseMeetings: { Math: { A: { startTime: "09:00", endTime: "10:00" } } } }, { today: new Date("2026-08-31T12:00:00"), timeZone: "UTC" });
  assert.ok(cycle.length > 100); assert.ok(cycle.every((item) => item.id.includes("cycle:Math:")));
});

test("managed events and writable roles include the compatible Google role", () => {
  assert.equal(isManagedEvent({ extendedProperties: { private: { glowdocketManaged: "1" } } }), true);
  assert.equal(canCreateEvents("writerWithoutPrivateAccess"), true); assert.equal(canCreateEvents("reader"), false);
});

test("an old managed Google identity cannot replace a valid active native mapping", () => {
  const oldEvent = { id: "old-google", extendedProperties: { private: { glowdocketManaged: "1", glowdocketItemType: "class", glowdocketItemId: "cycle:Math:2026-09-05" } } };
  const active = { id: "mapping", state: "active", google_event_id: "current-google" };
  assert.deepEqual(managedIdentityDecision(oldEvent, null, active), { mapping: null, suppressRecovery: true });
  assert.deepEqual(managedIdentityDecision(oldEvent, active, null), { mapping: active, suppressRecovery: false });
});

test("snapshot conflicts merge different fields and preserve same-field conflicts", () => {
  const base = { summary: "Old", location: "Room A", start: null, end: null, description: null, recurrence: null };
  const merged = mergeSnapshots(base, { ...base, summary: "Glow title" }, { ...base, location: "Room B" });
  assert.equal(merged.merged.summary, "Glow title"); assert.equal(merged.merged.location, "Room B"); assert.deepEqual(merged.conflicts, []);
  assert.deepEqual(mergeSnapshots(base, { ...base, summary: "Glow" }, { ...base, summary: "Google" }).conflicts, ["summary"]);
  assert.deepEqual(changedFields(base, base), []); assert.equal(snapshotHash({ b: { y: 2, x: 1 }, a: 1 }), snapshotHash({ a: 1, b: { x: 1, y: 2 } }));
  assert.equal(googleEventDateKey({ start: { dateTime: "2026-09-02T09:00:00-04:00" } }), "2026-09-02");
});

test("Google timed fields convert absolute instants into the configured IANA timezone", () => {
  assert.deepEqual(googleDateTimeParts({ dateTime: "2026-09-05T19:00:00Z", timeZone: "America/New_York" }), { date: "2026-09-05", time: "15:00", timeZone: "America/New_York", allDay: false });
  assert.equal(googleDateTimeParts({ dateTime: "2026-01-05T19:00:00Z", timeZone: "America/New_York" }).time, "14:00", "winter uses EST");
  assert.deepEqual(googleDateTimeParts({ dateTime: "2026-09-06T02:30:00Z", timeZone: "America/New_York" }), { date: "2026-09-05", time: "22:30", timeZone: "America/New_York", allDay: false });
  assert.equal(googleDateTimeParts({ dateTime: "2026-03-08T07:30:00Z", timeZone: "America/New_York" }).time, "03:30", "spring transition uses the post-transition offset");
  assert.equal(googleDateTimeParts({ dateTime: "2026-11-01T06:30:00Z", timeZone: "America/New_York" }).time, "01:30", "fall transition preserves the instant in the repeated hour");
  assert.equal(googleDateTimeParts({ dateTime: "2026-09-05T21:00:00+02:00", timeZone: "America/New_York" }).time, "15:00", "explicit offsets are instants, not local clock text");
  assert.deepEqual(googleDateTimeParts({ date: "2026-09-05" }, "America/New_York"), { date: "2026-09-05", time: "", timeZone: null, allDay: true });
});

test("semantic snapshots equate native local clocks with Google UTC or offset instants", () => {
  const local = eventSnapshot({ summary: "Due: Work", start: { dateTime: "2026-09-05T15:00:00", timeZone: "America/New_York" }, end: { dateTime: "2026-09-05T15:15:00", timeZone: "America/New_York" } });
  const utc = eventSnapshot({ summary: "Due: Work", start: { dateTime: "2026-09-05T19:00:00Z", timeZone: "America/New_York" }, end: { dateTime: "2026-09-05T19:15:00Z", timeZone: "America/New_York" } });
  const offset = eventSnapshot({ summary: "Due: Work", start: { dateTime: "2026-09-05T21:00:00+02:00", timeZone: "America/New_York" }, end: { dateTime: "2026-09-05T21:15:00+02:00", timeZone: "America/New_York" } });
  assert.equal(semanticallyEquivalentSnapshots(local, utc), true);
  assert.equal(semanticallyEquivalentSnapshots(local, offset), true);
  assert.equal(semanticallyEquivalentSnapshots(eventSnapshot({ start: { date: "2026-09-05" }, end: { date: "2026-09-06" } }), eventSnapshot({ start: { date: "2026-09-05" }, end: { date: "2026-09-06" } })), true);
  assert.equal(semanticallyEquivalentSnapshots(eventSnapshot({ start: { date: "2026-09-05" } }), eventSnapshot({ start: { date: "2026-09-06" } })), false, "all-day dates remain date-only values");
});

test("timezone conversion is applied to assignments, activities, and checklist deadlines", () => {
  const native = {
    tasks: [{ id: "assignment-1", title: "Quiz", dueYear: 2026, dueMonth: 9, dueDay: 6, dueHour: 7, dueAmPm: "PM" }],
    calendarEvents: [{ id: "activity-1", name: "Study", date: "2026-09-06", time: "01:00", endTime: "02:00" }],
    checklists: [{ id: "list-1", items: [{ id: "check-1", text: "Pack", dueDate: "2026-09-06", dueTime: "02:00" }] }],
  };
  const fields = { start: { dateTime: "2026-09-06T02:30:00Z", timeZone: "America/New_York" }, end: { dateTime: "2026-09-06T03:30:00Z", timeZone: "America/New_York" } };
  const saved = applyGoogleNativeUpdates(native, [
    { type: "assignment", id: "assignment-1", fields, timeZone: "America/New_York" },
    { type: "activity", id: "activity-1", fields, timeZone: "America/New_York" },
    { type: "checklist", id: "check-1", fields, timeZone: "America/New_York" },
  ]);
  assert.deepEqual([saved.tasks[0].dueYear, saved.tasks[0].dueMonth, saved.tasks[0].dueDay, saved.tasks[0].dueHour, saved.tasks[0].dueAmPm], [2026, 9, 5, 10, "PM"]);
  assert.deepEqual([saved.calendarEvents[0].date, saved.calendarEvents[0].time, saved.calendarEvents[0].endDate, saved.calendarEvents[0].endTime], ["2026-09-05", "22:30", "2026-09-05", "23:30"]);
  assert.deepEqual([saved.checklists[0].items[0].dueDate, saved.checklists[0].items[0].dueTime], ["2026-09-05", "22:30"]);
  const allDay = applyGoogleNativeUpdates(saved, [
    { type: "assignment", id: "assignment-1", fields: { start: { date: "2026-09-07" } }, timeZone: "America/New_York" },
    { type: "activity", id: "activity-1", fields: { start: { date: "2026-09-07" }, end: { date: "2026-09-08" } }, timeZone: "America/New_York" },
    { type: "checklist", id: "check-1", fields: { start: { date: "2026-09-07" } }, timeZone: "America/New_York" },
  ]);
  assert.deepEqual([allDay.tasks[0].dueYear, allDay.tasks[0].dueMonth, allDay.tasks[0].dueDay, allDay.tasks[0].dueHour, allDay.tasks[0].dueAmPm], [2026, 9, 7, "", ""]);
  assert.deepEqual([allDay.calendarEvents[0].date, allDay.calendarEvents[0].time, allDay.calendarEvents[0].endTime], ["2026-09-07", "", ""]);
  assert.deepEqual([allDay.checklists[0].items[0].dueDate, allDay.checklists[0].items[0].dueTime], ["2026-09-07", ""]);
});

test("recurring imports materialize in the selected view and exceptions replace masters", () => {
  const master = { id: "series", start: { dateTime: "2026-08-31T09:00:00" }, recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE"], status: "confirmed" };
  assert.deepEqual(googleEventsForDate([master], "2026-09-02"), [master]);
  const exception = { id: "exception", recurringEventId: "series", originalStartTime: { dateTime: "2026-09-02T09:00:00" }, start: { dateTime: "2026-09-02T10:00:00" }, status: "confirmed" };
  assert.deepEqual(googleEventsForDate([master, exception], "2026-09-02"), [exception]);
  assert.deepEqual(googleEventsForDate([master, { ...exception, status: "cancelled" }], "2026-09-02"), []);
});

test("a dedicated calendar keeps managed events native while importing manual Google events once", () => {
  const managed = { id: "managed", extendedProperties: { private: { glowdocketManaged: "1", glowdocketItemId: "assignment-1" } } };
  const mapped = { id: "mapped-without-metadata" };
  const manual = { id: "manual", summary: "Mom's appointment", start: { date: "2026-09-03" }, end: { date: "2026-09-04" } };
  const events = [managed, mapped, manual];
  const mappingIds = new Set(["mapped-without-metadata"]);
  const projections = events.filter((event) => managedProjectionDecision(event, mappingIds.has(event.id) ? { id: "mapping" } : null) === "import");
  assert.deepEqual(projections.map((event) => event.id), ["manual"]);
  assert.deepEqual(googleEventsForDate(projections, "2026-09-03").map((event) => event.id), ["manual"]);
  assert.deepEqual(googleEventsForDate([], "2026-09-03"), [], "a deleted manual event has no remaining projection");
});

test("the active dedicated export calendar is automatically imported and watched", async () => {
  const router = await readFile(new URL("../api/google-calendar.js", import.meta.url), "utf8");
  const service = await readFile(new URL("../server/services/googleCalendarService.js", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(router, /prefs\.destination_kind === "dedicated"[\s\S]*ensureDedicatedCalendar/);
  assert.match(router, /syncImportedCalendar[\s\S]*ensureWebhookChannel/);
  assert.match(service, /ensureDedicatedImportSelection[\s\S]*selected_for_import: true/);
  assert.match(app, /isAutomatic[\s\S]*disabled=\{isAutomatic\}[\s\S]*Automatic/);
  const migration = await readFile(new URL("../supabase/migrations/202609010001_bound_google_calendar_sync.sql", import.meta.url), "utf8");
  assert.match(migration, /pending_page_token/); assert.match(migration, /sync_job_id/); assert.match(migration, /sync_lock_until/);
});

test("a large unchanged managed dedicated calendar terminates without provider reads or writes", async () => {
  const mappings = []; const items = []; const managedEvents = [];
  for (let index = 0; index < 600; index += 1) {
    const type = index < 400 ? "class" : "activity"; const id = `${type}-${index}`;
    const googleEvent = type === "class"
      ? { summary: `Class ${index}`, description: "Managed", start: { dateTime: "2026-09-01T09:00:00", timeZone: "UTC" }, end: { dateTime: "2026-09-01T10:00:00", timeZone: "UTC" }, recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO"] }
      : { summary: `Event ${index}`, description: "", start: { dateTime: "2026-09-01T12:00:00", timeZone: "UTC" }, end: { dateTime: "2026-09-01T12:30:00", timeZone: "UTC" } };
    const snapshot = eventSnapshot(googleEvent); const mapping = { id: `mapping-${index}`, user_id: "user", glowdocket_type: type, glowdocket_id: id, google_calendar_id: "dedicated", google_event_id: `google-${index}`, state: "active", last_google_snapshot: snapshot, last_google_hash: snapshotHash(snapshot), last_glowdocket_snapshot: snapshot, last_glowdocket_hash: snapshotHash(snapshot), sync_version: 1 };
    mappings.push(mapping); items.push({ id, type, googleEvent }); managedEvents.push({ mapping, event: { id: mapping.google_event_id, ...googleEvent, etag: `etag-${index}` } });
  }
  const mappingQuery = { select() { return this; }, eq() { return this; }, in() { return this; }, then(resolve) { resolve({ data: mappings, error: null }); } };
  const issueQuery = { update() { return this; }, eq() { return this; }, is() { return this; }, in() { return this; }, then(resolve) { resolve({ data: null, error: null }); } };
  const admin = { from(table) { if (table === "google_event_mappings") return mappingQuery; if (table === "google_sync_issues") return issueQuery; assert.fail(`unexpected table ${table}`); } };
  const providerCalls = { get: 0, update: 0, insert: 0, delete: 0 };
  const calendar = { events: Object.fromEntries(Object.keys(providerCalls).map((method) => [method, async () => { providerCalls[method] += 1; throw new Error(`unexpected ${method}`); }])) };
  const result = await synchronizeNativeItems({ admin, userId: "user", calendar, destinationCalendarId: "dedicated", items, enabledTypes: ["class", "activity"], managedEvents, maxItems: 1000 });
  assert.equal(result.complete, true); assert.equal(result.noops, 600); assert.equal(result.googleWrites, 0); assert.deepEqual(providerCalls, { get: 0, update: 0, insert: 0, delete: 0 });
  const repeated = await synchronizeNativeItems({ admin, userId: "user", calendar, destinationCalendarId: "dedicated", items: [...items, { id: "unrelated", type: "activity", googleEvent: { summary: "Unrelated", start: { date: "2026-09-06" }, end: { date: "2026-09-07" } } }].slice(0, 600), enabledTypes: ["class", "activity"], managedEvents, maxItems: 1000 });
  assert.equal(repeated.noops, 600); assert.equal(repeated.googleWrites, 0); assert.equal(new Set(mappings.map((mapping) => mapping.google_event_id)).size, 600, "provider identities remain unique and unchanged");
  const manual = { id: "manual", summary: "Family dinner", start: { dateTime: "2026-09-01T18:00:00" } };
  const importable = [...managedEvents.map(({ event }) => event), manual].filter((event) => managedProjectionDecision(event, mappings.find((mapping) => mapping.google_event_id === event.id)) === "import");
  assert.deepEqual(importable.map((event) => event.id), ["manual"], "the manual event is imported once beside managed no-ops");
});

test("mapping batches omit IDs for new rows and retain IDs for existing rows", async () => {
  const batches = [];
  const admin = { from(table) { assert.equal(table, "google_event_mappings"); return { upsert(rows) { batches.push(rows); return { async throwOnError() {} }; } }; } };
  await upsertEventMappings(admin, [
    { id: "existing-uuid", user_id: "user", glowdocket_type: "assignment", glowdocket_id: "old" },
    { id: null, user_id: "user", glowdocket_type: "assignment", glowdocket_id: "new" },
  ]);
  assert.equal(batches.length, 2, "new and existing mappings cannot share a PostgREST batch column set");
  assert.equal(batches[0][0].id, "existing-uuid");
  assert.equal(Object.hasOwn(batches[1][0], "id"), false, "PostgreSQL must supply the UUID default");
});

test("new managed events reserve their mapping before provider creation", async () => {
  const order = []; const writes = []; let reservedMapping;
  const mappingSelect = { select() { return this; }, eq() { return this; }, then(resolve) { resolve({ data: [], error: null }); } };
  const issueUpdate = { update() { return this; }, eq() { return this; }, in() { return this; }, is() { return this; }, then(resolve) { resolve({ error: null }); } };
  const admin = { from(table) {
    if (table === "google_sync_issues") return issueUpdate;
    assert.equal(table, "google_event_mappings");
    return { ...mappingSelect, upsert(rows) { order.push("mapping"); writes.push(...rows); reservedMapping = rows[0]; return { async throwOnError() {} }; } };
  } };
  const calendar = { events: { async insert({ requestBody }) { order.push("provider"); const webhookEvent = { ...requestBody }; assert.equal(managedProjectionDecision(webhookEvent, reservedMapping), "managed", "a webhook between provider creation and finalization sees the reserved mapping"); return { data: { ...requestBody, etag: "etag-1", updated: "2026-09-05T18:00:00Z" } }; } } };
  const result = await synchronizeNativeItems({ admin, userId: "user", calendar, destinationCalendarId: "calendar", items: [{ id: "activity-1", type: "activity", googleEvent: activityGoogleEvent({ name: "Study", date: "2026-09-05", time: "13:00", endTime: "14:00" }, { timeZone: "UTC" }) }], enabledTypes: ["activity"] });
  assert.deepEqual(order, ["mapping", "provider", "mapping"]);
  assert.equal(writes[0].state, "creating"); assert.equal(writes[1].state, "active");
  assert.equal(writes[0].google_event_id, writes[1].google_event_id); assert.match(writes[0].google_event_id, /^[0-9a-f]{32}$/);
  assert.equal(result.googleWrites, 1);
});

const coordinatedSyncAdmin = (initialJob = "job-1") => {
  const state = { jobId: initialJob, dirty: new Set() };
  return { state, admin: { async rpc(name, args) {
    if (name === "mark_google_webhook_dirty") { state.dirty.add(args.p_calendar_id); return { data: true, error: null }; }
    if (name === "consume_google_webhook_dirty") { const data = [...state.dirty].map((calendar_id) => ({ calendar_id })); state.dirty.clear(); return { data, error: null }; }
    if (name === "finalize_google_sync_job") {
      if (state.jobId !== args.p_job_id) return { data: [{ result: "not_owner", calendar_id: null }], error: null };
      if (state.dirty.size) { const data = [...state.dirty].map((calendar_id) => ({ result: "continue", calendar_id })); state.dirty.clear(); return { data, error: null }; }
      state.jobId = null; return { data: [{ result: "complete", calendar_id: null }], error: null };
    }
    assert.fail(`unexpected rpc ${name}`);
  } } };
};

test("multiple webhook hints coalesce and a dirty active job retains ownership", async () => {
  const { admin, state } = coordinatedSyncAdmin();
  await Promise.all(Array.from({ length: 20 }, () => markWebhookDirty(admin, "user", "calendar")));
  const finalized = await finalizeSyncJob(admin, "user", "job-1");
  assert.deepEqual(finalized, { complete: false, calendarIds: ["calendar"] });
  assert.equal(state.jobId, "job-1"); assert.equal(state.dirty.size, 0);
});

test("webhooks on either side of atomic finalization are consumed or remain visible", async () => {
  const before = coordinatedSyncAdmin();
  await markWebhookDirty(before.admin, "user", "before");
  assert.deepEqual(await finalizeSyncJob(before.admin, "user", "job-1"), { complete: false, calendarIds: ["before"] });

  const after = coordinatedSyncAdmin();
  assert.deepEqual(await finalizeSyncJob(after.admin, "user", "job-1"), { complete: true, calendarIds: [] });
  await markWebhookDirty(after.admin, "user", "after");
  assert.deepEqual([...after.state.dirty], ["after"], "a webhook serialized after release remains visible to the next job");

  const duringBeforeLock = coordinatedSyncAdmin();
  await markWebhookDirty(duringBeforeLock.admin, "user", "during");
  assert.equal((await finalizeSyncJob(duringBeforeLock.admin, "user", "job-1")).complete, false);
  const duringAfterLock = coordinatedSyncAdmin();
  await finalizeSyncJob(duringAfterLock.admin, "user", "job-1");
  await markWebhookDirty(duringAfterLock.admin, "user", "during");
  assert.equal(duringAfterLock.state.dirty.has("during"), true);
});

test("clean atomic finalization releases only its owning job", async () => {
  const current = coordinatedSyncAdmin();
  await assert.rejects(finalizeSyncJob(current.admin, "user", "stale-job"), (error) => error.code === "sync_expired");
  assert.equal(current.state.jobId, "job-1", "a stale job cannot clear the current owner");
  assert.deepEqual(await finalizeSyncJob(current.admin, "user", "job-1"), { complete: true, calendarIds: [] });
  assert.equal(current.state.jobId, null);
});

const continuationAdmin = ({ accepted = true } = {}) => {
  const calls = [];
  return { calls, admin: { async rpc(name, args) { calls.push([name, args]); return { data: accepted ? { jobId: "11111111-1111-4111-8111-111111111111", cursor: 7 } : null, error: null }; } } };
};

test("an expired or stale continuation token cannot revive its historical sync job", async () => {
  const expired = continuationAdmin({ accepted: false });
  await assert.rejects(claimSyncJob(expired.admin, "user", "11111111-1111-4111-8111-111111111111"), (error) => error.code === "sync_expired");
  assert.equal(expired.calls[0][0], "continue_google_sync_job");
  const stale = continuationAdmin({ accepted: false });
  await assert.rejects(continueSyncJob(stale.admin, "user", "22222222-2222-4222-8222-222222222222", 8), (error) => error.code === "sync_expired");
  assert.equal(stale.calls[0][1].p_cursor, 8);
  const active = continuationAdmin();
  assert.deepEqual(await claimSyncJob(active.admin, "user", "11111111-1111-4111-8111-111111111111"), { jobId: "11111111-1111-4111-8111-111111111111", cursor: 7 });
});

test("a Google activity end-time edit persists in native state and the next export uses it", () => {
  const native = { tasks: [], calendarEvents: [{ id: "activity-1", name: "Study", date: "2026-09-05", time: "13:00", endTime: "19:00" }], checklists: [] };
  const updates = [{ type: "activity", id: "activity-1", fields: { start: { dateTime: "2026-09-05T17:00:00Z", timeZone: "America/New_York" }, end: { dateTime: "2026-09-05T19:00:00Z", timeZone: "America/New_York" } }, timeZone: "America/New_York" }];
  const saved = applyGoogleNativeUpdates(native, updates);
  assert.equal(saved.calendarEvents[0].endTime, "15:00");
  const refreshedEvent = activityGoogleEvent(saved.calendarEvents[0], { timeZone: "America/New_York" });
  assert.equal(refreshedEvent.end.dateTime, "2026-09-05T15:00:00");
});

test("native reconciliation imports a Google-only edit without writing stale state back", async () => {
  const oldEvent = activityGoogleEvent({ name: "Study", date: "2026-09-05", time: "13:00", endTime: "19:00" }, { timeZone: "America/New_York" });
  const googleEvent = { id: "google-1", ...oldEvent, start: { dateTime: "2026-09-05T17:00:00Z", timeZone: "America/New_York" }, end: { dateTime: "2026-09-05T19:00:00Z", timeZone: "America/New_York" }, etag: "etag-2", updated: "2026-09-05T19:01:00Z" };
  const mapping = { id: "mapping-1", user_id: "user", glowdocket_type: "activity", glowdocket_id: "activity-1", google_calendar_id: "calendar", google_event_id: "google-1", state: "active", last_google_snapshot: eventSnapshot(oldEvent), last_google_hash: snapshotHash(eventSnapshot(oldEvent)), last_glowdocket_snapshot: eventSnapshot(oldEvent), last_glowdocket_hash: snapshotHash(eventSnapshot(oldEvent)), sync_version: 1 };
  const mappingUpdates = [];
  const mappingQuery = { select() { return this; }, eq() { return this; }, update(payload) { mappingUpdates.push(payload); return this; }, async throwOnError() {}, upsert() { return { async throwOnError() {} }; }, then(resolve) { resolve({ data: [mapping], error: null }); } };
  const issueQuery = { update() { return this; }, eq() { return this; }, in() { return this; }, is() { return this; }, then(resolve) { resolve({ error: null }); } };
  const admin = { from(table) { return table === "google_event_mappings" ? mappingQuery : issueQuery; } };
  const calendar = { events: { async get() { assert.fail("unchanged native state must not cause a provider read"); }, async update() { assert.fail("the imported Google edit must not be overwritten"); }, async insert() { assert.fail("the mapped event must not be duplicated"); }, async delete() { assert.fail("the mapped event must not be cancelled"); } } };
  const result = await synchronizeNativeItems({ admin, userId: "user", calendar, destinationCalendarId: "calendar", items: [{ id: "activity-1", type: "activity", googleEvent: oldEvent }], enabledTypes: ["activity"], managedEvents: [{ mapping, event: googleEvent }] });
  assert.equal(result.googleWrites, 0); assert.equal(result.nativeUpdates.length, 1);
  assert.equal(result.nativeUpdates[0].fields.end.dateTime, "2026-09-05T19:00:00Z");
  assert.equal(mappingUpdates.length, 1); assert.equal(mappingUpdates[0].pending_google_snapshot.end.dateTime, "2026-09-05T19:00:00Z");
  assert.equal(Object.hasOwn(mappingUpdates[0], "last_google_snapshot"), false, "the synchronized baseline cannot advance before native persistence succeeds");

  const native = { tasks: [], calendarEvents: [{ id: "activity-1", name: "Study", date: "2026-09-05", time: "13:00", endTime: "19:00" }], checklists: [] };
  const savedNative = applyGoogleNativeUpdates(native, result.nativeUpdates); const synchronizedEvent = activityGoogleEvent(savedNative.calendarEvents[0], { timeZone: "America/New_York" });
  assert.deepEqual([savedNative.calendarEvents[0].time, savedNative.calendarEvents[0].endTime], ["13:00", "15:00"]);
  const confirmedMapping = { ...mapping, last_google_snapshot: eventSnapshot(googleEvent), last_google_hash: snapshotHash(eventSnapshot(googleEvent)), last_glowdocket_snapshot: eventSnapshot(synchronizedEvent), last_glowdocket_hash: snapshotHash(eventSnapshot(synchronizedEvent)), pending_google_snapshot: null, pending_google_hash: null };
  const confirmedQuery = { select() { return this; }, eq() { return this; }, then(resolve) { resolve({ data: [confirmedMapping], error: null }); } };
  const repeated = await synchronizeNativeItems({ admin: { from(table) { return table === "google_event_mappings" ? confirmedQuery : issueQuery; } }, userId: "user", calendar, destinationCalendarId: "calendar", items: [{ id: "activity-1", type: "activity", googleEvent: synchronizedEvent }], enabledTypes: ["activity"], managedEvents: [{ mapping: confirmedMapping, event: googleEvent }] });
  assert.equal(repeated.noops, 1); assert.equal(repeated.googleWrites, 0); assert.equal(repeated.nativeUpdates.length, 0);
});

test("a persisted Google edit with a missed confirmation recovers semantically without a provider write or conflict", async () => {
  const oldEvent = activityGoogleEvent({ name: "Study", date: "2026-09-05", time: "13:00", endTime: "19:00" }, { timeZone: "America/New_York" });
  const persistedEvent = activityGoogleEvent({ name: "Study", date: "2026-09-05", time: "13:00", endTime: "15:00" }, { timeZone: "America/New_York" });
  const googleEvent = { id: "google-1", ...oldEvent, start: { dateTime: "2026-09-05T17:00:00Z", timeZone: "America/New_York" }, end: { dateTime: "2026-09-05T19:00:00Z", timeZone: "America/New_York" }, etag: "etag-2", updated: "2026-09-05T19:01:00Z" };
  const pending = eventSnapshot(googleEvent); const mapping = { id: "11111111-1111-4111-8111-111111111111", user_id: "user", glowdocket_type: "activity", glowdocket_id: "activity-1", google_calendar_id: "calendar", google_event_id: "google-1", state: "active", last_google_snapshot: eventSnapshot(oldEvent), last_google_hash: snapshotHash(eventSnapshot(oldEvent)), last_glowdocket_snapshot: eventSnapshot(oldEvent), last_glowdocket_hash: snapshotHash(eventSnapshot(oldEvent)), pending_google_snapshot: pending, pending_google_hash: snapshotHash(pending), sync_version: 1 };
  await assert.rejects(confirmNativeUpdates({ async rpc() { return { data: false, error: null }; } }, "user", "expired-job", [{ mappingId: mapping.id, pendingGoogleHash: mapping.pending_google_hash, glowdocketSnapshot: eventSnapshot(persistedEvent) }]), (error) => error.code === "native_sync_confirmation_failed");
  const mappingQuery = { select() { return this; }, eq() { return this; }, then(resolve) { resolve({ data: [mapping], error: null }); } }; const issueQuery = { update() { return this; }, eq() { return this; }, in() { return this; }, is() { return this; }, then(resolve) { resolve({ error: null }); } };
  const rpcCalls = []; const admin = { from(table) { return table === "google_event_mappings" ? mappingQuery : issueQuery; }, async rpc(name, args) { rpcCalls.push({ name, args }); return { data: true, error: null }; } };
  const calendar = { events: { async get() { assert.fail("semantic recovery must not read the provider"); }, async update() { assert.fail("semantic recovery must not write the provider"); }, async insert() { assert.fail("semantic recovery must not duplicate the event"); }, async delete() { assert.fail("semantic recovery must not delete the event"); } } };
  const result = await synchronizeNativeItems({ admin, userId: "user", jobId: "22222222-2222-4222-8222-222222222222", calendar, destinationCalendarId: "calendar", items: [{ id: "activity-1", type: "activity", googleEvent: persistedEvent }], enabledTypes: ["activity"], managedEvents: [{ mapping, event: googleEvent }] });
  assert.equal(result.noops, 1); assert.equal(result.googleWrites, 0); assert.deepEqual(result.nativeUpdates, []); assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].args.p_pending_google_hash, mapping.pending_google_hash);
  assert.equal(semanticallyEquivalentSnapshots(eventSnapshot(persistedEvent), pending), true, "local 15:00 New York and 19:00Z are the same instant");

  const genuinelyEdited = eventSnapshot(activityGoogleEvent({ name: "Study", date: "2026-09-05", time: "13:00", endTime: "16:00" }, { timeZone: "America/New_York" }));
  assert.equal(semanticallyEquivalentSnapshots(genuinelyEdited, pending), false);
  assert.deepEqual(mergeSnapshots(eventSnapshot(oldEvent), genuinelyEdited, pending).conflicts, ["end"], "a later genuine native edit remains on the normal conflict path");
});

test("a newer pending Google edit cannot be finalized using the older pending hash", async () => {
  const nativeEvent = activityGoogleEvent({ name: "Study", date: "2026-09-05", time: "13:00", endTime: "15:00" }, { timeZone: "America/New_York" });
  const googleEvent = { id: "google-1", ...nativeEvent, start: { dateTime: "2026-09-05T17:00:00Z", timeZone: "America/New_York" }, end: { dateTime: "2026-09-05T19:00:00Z", timeZone: "America/New_York" } }; const current = eventSnapshot(googleEvent);
  const mapping = { id: "11111111-1111-4111-8111-111111111111", user_id: "user", glowdocket_type: "activity", glowdocket_id: "activity-1", google_calendar_id: "calendar", google_event_id: "google-1", state: "active", last_google_snapshot: current, last_google_hash: "old", last_glowdocket_snapshot: eventSnapshot(nativeEvent), last_glowdocket_hash: "old", pending_google_snapshot: current, pending_google_hash: "b".repeat(64) };
  const mappingQuery = { select() { return this; }, eq() { return this; }, then(resolve) { resolve({ data: [mapping], error: null }); } };
  const admin = { from() { return mappingQuery; }, async rpc() { assert.fail("a mismatched pending hash must not reach confirmation"); } };
  await assert.rejects(synchronizeNativeItems({ admin, userId: "user", jobId: "22222222-2222-4222-8222-222222222222", calendar: { events: {} }, destinationCalendarId: "calendar", items: [{ id: "activity-1", type: "activity", googleEvent: nativeEvent }], enabledTypes: ["activity"], managedEvents: [{ mapping, event: googleEvent }] }), (error) => error.code === "native_sync_confirmation_failed");
});

test("native persistence confirmation advances the baseline only while the sync job owns the lock", async () => {
  const calls = []; const mappingId = "11111111-1111-4111-8111-111111111111"; const pendingGoogleHash = "a".repeat(64);
  const admin = { async rpc(name, args) { calls.push({ name, args }); return { data: true, error: null }; } };
  const snapshot = eventSnapshot(activityGoogleEvent({ name: "Study", date: "2026-09-05", time: "13:00", endTime: "15:00" }, { timeZone: "America/New_York" }));
  await confirmNativeUpdates(admin, "user-id", "job-id", [{ mappingId, pendingGoogleHash, glowdocketSnapshot: snapshot }]);
  assert.equal(calls[0].name, "confirm_google_native_update");
  assert.equal(calls[0].args.p_mapping_id, mappingId); assert.equal(calls[0].args.p_pending_google_hash, pendingGoogleHash);
  assert.equal(calls[0].args.p_glowdocket_snapshot.end.dateTime, "2026-09-05T15:00:00");
  await assert.rejects(confirmNativeUpdates({ async rpc() { return { data: false, error: null }; } }, "user-id", "stale-job", [{ mappingId, pendingGoogleHash, glowdocketSnapshot: snapshot }]), (error) => error.code === "native_sync_confirmation_failed");
});

test("a failed or unverified native save cannot generate a synchronized-baseline confirmation", () => {
  const updates = [{ type: "activity", id: "activity-1", confirmation: { mappingId: "11111111-1111-4111-8111-111111111111", pendingGoogleHash: "a".repeat(64) } }];
  assert.throws(() => buildNativeUpdateConfirmations(updates), (error) => error.code === "native_sync_persistence_unconfirmed");
  assert.throws(() => buildNativeUpdateConfirmations(updates, []), (error) => error.code === "native_sync_persistence_unconfirmed");
  const googleEvent = activityGoogleEvent({ name: "Study", date: "2026-09-05", time: "13:00", endTime: "15:00" }, { timeZone: "America/New_York" });
  const confirmations = buildNativeUpdateConfirmations(updates, [{ type: "activity", id: "activity-1", googleEvent }]);
  assert.equal(confirmations[0].glowdocketSnapshot.end.dateTime, "2026-09-05T15:00:00");
});

test("native confirmation migration is service-only and atomically finalizes pending baselines", async () => {
  const migration = await readFile(new URL("../supabase/migrations/202609050002_confirm_google_native_updates.sql", import.meta.url), "utf8");
  assert.match(migration, /security definer[\s\S]*set search_path = pg_catalog/i);
  assert.match(migration, /select sync_job_id, sync_lock_until[\s\S]*from public\.google_calendar_connections[\s\S]*for update[\s\S]*owned_job is distinct from p_job_id[\s\S]*owned_lock_until is null[\s\S]*owned_lock_until <= clock_timestamp\(\)/i);
  assert.match(migration, /where id = p_mapping_id[\s\S]*user_id = p_user_id[\s\S]*state = 'active'[\s\S]*pending_google_hash = p_pending_google_hash[\s\S]*pending_google_snapshot is not null/i);
  for (const rejectedState of ["creating", "error", "unlinked_by_user", "google_deleted", "recovery_required"]) assert.doesNotMatch(migration.match(/where id = p_mapping_id[\s\S]*?pending_google_snapshot is not null/i)[0], new RegExp(`state\\s*=\\s*'${rejectedState}'`, "i"));
  assert.match(migration, /last_google_snapshot = pending_google_snapshot[\s\S]*pending_google_snapshot = null/i);
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute[\s\S]*to service_role/i);
  assert.match(migration, /continue_google_sync_job[\s\S]*for update[\s\S]*owned_lock_until <= checked_at[\s\S]*sync_lock_until = p_lock_until/i);
  assert.match(migration, /revoke all on function public\.continue_google_sync_job\(uuid, uuid, timestamptz, integer\) from public, anon, authenticated/i);
});

test("race coordination migration adds dirty coalescing and pending mapping state", async () => {
  const migration = await readFile(new URL("../supabase/migrations/202609050001_coordinate_google_sync_webhooks.sql", import.meta.url), "utf8");
  assert.match(migration, /webhook_dirty boolean not null default false/);
  assert.match(migration, /consume_google_webhook_dirty/);
  assert.match(migration, /mark_google_webhook_dirty[\s\S]+google_calendar_connections[\s\S]+for update/);
  assert.match(migration, /finalize_google_sync_job[\s\S]+owned_job is distinct from p_job_id/);
  assert.match(migration, /finalize_google_sync_job[\s\S]+sync_job_id = p_job_id/);
  assert.match(migration, /'creating','active'/);
  assert.match(migration, /revoke all on function public\.finalize_google_sync_job\(uuid, uuid\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.finalize_google_sync_job\(uuid, uuid\) to service_role/);
});

test("database constraint failures are not classified as provider failures", () => {
  assert.equal(providerIssueCategory({ code: "23502", message: "null value violates not-null constraint" }), "internal_database_failure");
  assert.equal(providerIssueCategory({ code: 503 }), "temporary_provider_failure");
});

test("issue-resolution database failures are logged server-side and surfaced with safe user copy", async () => {
  const rawMessage = "column google_sync_issues.category does not exist";
  const originalError = console.error; let protectedDiagnostic;
  console.error = (...args) => { protectedDiagnostic = args; };
  try {
    await assert.rejects(completeIssueResolution(Promise.resolve({ error: { code: "42703", message: rawMessage } }), "resolve_verified_mappings"), (error) => {
      assert.equal(error.code, "google_issue_lifecycle_failure");
      assert.equal(error.status, 500);
      assert.doesNotMatch(error.message, /category|column|42703/i);
      return true;
    });
  } finally { console.error = originalError; }
  assert.deepEqual(protectedDiagnostic, ["[google-calendar] issue lifecycle query failed", { operation: "resolve_verified_mappings", code: "42703", message: rawMessage }]);
});

test("legacy mapping verification resolves only cancelled orphan events and safely classifies all outcomes", async () => {
  const issues = [
    { id: "1", diagnostic_ref: "GC-0001", glowdocket_id: "cycle:Math:2027-06-02", google_calendar_id: "calendar", google_event_id: "missing" },
    { id: "2", diagnostic_ref: "GC-0002", glowdocket_id: "cycle:Math:2027-06-03", google_calendar_id: "calendar", google_event_id: "cancelled" },
    { id: "3", diagnostic_ref: "GC-0003", glowdocket_id: "cycle:Math:2027-06-04", google_calendar_id: "calendar", google_event_id: "active" },
    { id: "4", diagnostic_ref: "GC-0004", glowdocket_id: "cycle:Math:2027-06-05", google_calendar_id: "calendar", google_event_id: "forbidden" },
    { id: "5", diagnostic_ref: "GC-0005", glowdocket_id: "weekly:not-a-cycle", google_calendar_id: "calendar", google_event_id: "excluded" },
  ];
  const rows = { google_sync_issues: issues, google_event_mappings: [], google_imported_events: [] }; const updates = [];
  const query = (table) => { const state = { operation: "select", payload: null, filters: [] }; return { select() { return this; }, eq(column, value) { state.filters.push(["eq", column, value]); return this; }, is(column, value) { state.filters.push(["is", column, value]); return this; }, in(column, value) { state.filters.push(["in", column, value]); return this; }, update(payload) { state.operation = "update"; state.payload = payload; return this; }, then(resolve) { if (state.operation === "update") { updates.push({ table, payload: state.payload, filters: state.filters }); resolve({ data: null, error: null }); } else resolve({ data: rows[table], error: null }); } }; };
  const calls = []; const calendar = { events: { async get({ eventId }) { calls.push(eventId); if (eventId === "missing") throw { code: 404 }; if (eventId === "forbidden") throw { code: 403, message: "private provider detail" }; return { data: { status: eventId === "cancelled" ? "cancelled" : "confirmed", description: "must not leak" } }; } } };
  const originalInfo = console.info; console.info = () => {};
  let result; try { result = await verifyLegacyMappingIssues({ admin: { from: query }, userId: "user", calendar, currentItems: [], batchSize: 10 }); } finally { console.info = originalInfo; }
  assert.deepEqual(result.counts, { missing: 1, cancelled: 1, active_orphan: 1, permission_or_lookup_failure: 1 });
  assert.deepEqual(calls, ["missing", "cancelled", "active", "forbidden"]); assert.equal(result.checked, 4); assert.equal(result.complete, true);
  assert.equal(updates.length, 1); assert.equal(updates[0].payload.resolution_reason, "orphaned_google_event_cancelled");
  assert.deepEqual(updates[0].filters.find(([operator, column]) => operator === "in" && column === "id")[2], ["2"]);
  assert.doesNotMatch(JSON.stringify(result), /private provider detail|must not leak/);
});

test("targeted legacy verification includes obsolete weekly identities and is strictly read-only", async () => {
  const issue = { id: "weekly-issue", diagnostic_ref: "GC-4420", glowdocket_id: "weekly:APES-1-1788105185173", google_calendar_id: "calendar", google_event_id: "old-master" };
  let issueUpdateAttempted = false;
  const query = (table) => ({ select() { return this; }, eq() { return this; }, is() { return this; }, update() { issueUpdateAttempted = true; return this; }, then(resolve) { resolve({ data: table === "google_sync_issues" ? [issue] : [], error: null }); } });
  const calendar = { events: { async get() { return { data: { status: "cancelled", description: "private" } }; } } };
  const originalInfo = console.info; console.info = () => {};
  let result; try { result = await verifyLegacyMappingIssues({ admin: { from: query }, userId: "user", calendar, currentItems: [], diagnosticRef: "GC-4420", batchSize: 1, readOnly: true }); } finally { console.info = originalInfo; }
  assert.deepEqual(result.counts, { missing: 0, cancelled: 1, active_orphan: 0, permission_or_lookup_failure: 0 });
  assert.deepEqual(result.diagnosticReferences.cancelled, ["GC-4420"]); assert.equal(issueUpdateAttempted, false); assert.doesNotMatch(JSON.stringify(result), /private/);
});

test("assignment provider audit finds tracked, untracked, cancelled, and same-title events without writes", async () => {
  const mapping = { glowdocket_id: "assignment-1", google_calendar_id: "calendar", google_event_id: "tracked", state: "active", last_google_snapshot: { summary: "Due: Quiz", start: { date: "2026-09-08" }, end: { date: "2026-09-09" } } };
  const query = (table) => ({ select() { return this; }, eq() { return this; }, in() { return this; }, async maybeSingle() { return { data: { dedicated_calendar_id: "calendar" }, error: null }; }, then(resolve) { resolve({ data: table === "google_event_mappings" ? [mapping] : null, error: null }); } });
  const events = [
    { id: "tracked", status: "confirmed", summary: "Due: Quiz", start: { date: "2026-09-08" }, extendedProperties: { private: { glowdocketManaged: "1", glowdocketItemType: "assignment", glowdocketItemId: "assignment-1" } } },
    { id: "orphan", status: "confirmed", summary: "Due: Quiz", start: { date: "2026-09-08" }, extendedProperties: { private: { glowdocketManaged: "1", glowdocketItemType: "assignment", glowdocketItemId: "assignment-1" } } },
    { id: "old", status: "cancelled", summary: "Due: Quiz", start: { date: "2026-09-08" }, extendedProperties: { private: { glowdocketManaged: "1", glowdocketItemType: "assignment", glowdocketItemId: "assignment-1" } } },
    { id: "manual", status: "confirmed", summary: "Due: Quiz", start: { date: "2026-09-08" } },
  ];
  const calendar = { events: { async list() { return { data: { items: events } }; }, async get() { return { data: { id: "tracked", status: "confirmed" } }; } } };
  const originalInfo = console.info; console.info = () => {}; let result; try { result = await auditManagedAssignmentEvents({ admin: { from: query }, userId: "user", calendar, nativeIds: ["assignment-1"] }); } finally { console.info = originalInfo; }
  const audited = result.assignments[0]; assert.equal(result.readOnly, true); assert.equal(audited.mappedStatus, "active"); assert.equal(audited.activeManagedCount, 2); assert.equal(audited.cancelledManagedCount, 1); assert.equal(audited.untrackedManagedCount, 2); assert.equal(audited.sameTitleDateEvents.length, 4); assert.doesNotMatch(JSON.stringify(result), /description|attendees/);
});
