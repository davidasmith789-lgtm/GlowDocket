import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assignmentGoogleEvent, buildGoogleCalendarItems, classGoogleEvents, googleEventDateKey, googleEventsForDate } from "../src/googleCalendarUtils.js";
import { canCreateEvents, changedFields, completeIssueResolution, eventSnapshot, isManagedEvent, managedProjectionDecision, mergeSnapshots, providerIssueCategory, snapshotHash, synchronizeNativeItems, upsertEventMappings } from "../server/services/googleCalendarService.js";

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

test("snapshot conflicts merge different fields and preserve same-field conflicts", () => {
  const base = { summary: "Old", location: "Room A", start: null, end: null, description: null, recurrence: null };
  const merged = mergeSnapshots(base, { ...base, summary: "Glow title" }, { ...base, location: "Room B" });
  assert.equal(merged.merged.summary, "Glow title"); assert.equal(merged.merged.location, "Room B"); assert.deepEqual(merged.conflicts, []);
  assert.deepEqual(mergeSnapshots(base, { ...base, summary: "Glow" }, { ...base, summary: "Google" }).conflicts, ["summary"]);
  assert.deepEqual(changedFields(base, base), []); assert.equal(snapshotHash({ b: { y: 2, x: 1 }, a: 1 }), snapshotHash({ a: 1, b: { x: 1, y: 2 } }));
  assert.equal(googleEventDateKey({ start: { dateTime: "2026-09-02T09:00:00-04:00" } }), "2026-09-02");
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
