import test from "node:test";
import assert from "node:assert/strict";
import { assignmentGoogleEvent, buildGoogleCalendarItems, classGoogleEvents, googleEventDateKey, googleEventsForDate } from "../src/googleCalendarUtils.js";
import { canCreateEvents, changedFields, isManagedEvent, mergeSnapshots, snapshotHash } from "../server/services/googleCalendarService.js";

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
  assert.match(weekly[0].googleEvent.recurrence[0], /BYDAY=MO,WE/);
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
