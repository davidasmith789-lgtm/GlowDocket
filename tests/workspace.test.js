import test from "node:test";
import assert from "node:assert/strict";
import { formatChecklistCountdown, getChecklistDeadline } from "../src/checklistUtils.js";
import { preparePastedAssignmentLines } from "../src/bulkImportUtils.js";
import { findLikelySyllabusAssignments, getSyllabusFileKind } from "../src/syllabusImport.js";
import { formatAssignmentCountdown, getAssignmentCountdownTone } from "../src/assignmentCountdown.js";
import { getWeekDates, isSameCalendarDay, shiftCalendarWeek } from "../src/calendarWeekUtils.js";
import { canUndoVoiceCreation, lockVoiceUndo } from "../src/voiceTaskUtils.js";
import { canHideWidget, createDefaultWorkspaceLayout, normalizeWorkspaceLayout, placeWidget } from "../src/workspaceLayout.js";

test("date-only checklist deadlines use the end of the local day", () => {
  const deadline = getChecklistDeadline({ dueDate: "2026-07-06", dueTime: "" });
  assert.equal(deadline.getHours(), 23);
  assert.equal(deadline.getMinutes(), 59);
});

test("countdown switches from days to hours", () => {
  const now = new Date("2026-07-06T12:00:00");
  assert.equal(formatChecklistCountdown({ dueDate: "2026-07-08" }, now), "3 days left");
  assert.equal(formatChecklistCountdown({ dueDate: "2026-07-06", dueTime: "14:30" }, now), "2h 30m left");
});

test("placing a duplicate replaces the same widget type on the target tab", () => {
  const layout = createDefaultWorkspaceLayout();
  const widget = layout.desktop.dashboard.find((item) => item.type === "quick-match");
  const next = placeWidget(layout, "desktop", "todo", widget, { copy: true });
  assert.equal(next.desktop.todo.filter((item) => item.type === "quick-match").length, 1);
  assert.equal(next.desktop.dashboard.filter((item) => item.type === "quick-match").length, 1);
});

test("the last protected widget cannot be hidden", () => {
  const layout = createDefaultWorkspaceLayout();
  assert.equal(canHideWidget(layout, "desktop", "checklists"), false);
});

test("new widget types are added without resetting a saved layout", () => {
  const saved = createDefaultWorkspaceLayout();
  saved.desktop.dashboard = saved.desktop.dashboard.filter((item) => !["course-overview", "school-guide", "reminders"].includes(item.type));
  saved.desktop.dashboard[0].width = 333;
  const normalized = normalizeWorkspaceLayout(saved);
  assert.equal(normalized.desktop.dashboard[0].width, 333);
  assert.equal(Number.isFinite(normalized.desktop.dashboard[0].xRatio), true);
  assert.equal(normalized.desktop.dashboard.some((item) => item.type === "course-overview"), true);
  assert.equal(normalized.desktop.dashboard.some((item) => item.type === "school-guide"), true);
  assert.equal(normalized.desktop.dashboard.some((item) => item.type === "reminders"), true);
  assert.equal(normalized.locked.desktop, false);
});

test("pasted assignment lists preserve course headings and remove bullets", () => {
  assert.deepEqual(
    preparePastedAssignmentLines("Biology:\n- Lab report due July 9\n2. Chapter quiz due July 12"),
    [
      { text: "Lab report due July 9", courseHint: "Biology" },
      { text: "Chapter quiz due July 12", courseHint: "Biology" },
    ],
  );
});

test("syllabus scanning keeps dated work and ignores policy prose", () => {
  const text = "Late work loses ten percent.\nBiology:\nSept 8 - Lab report due\nOffice hours are Monday at noon.\nOct 2 - Midterm exam";
  assert.equal(findLikelySyllabusAssignments(text), "Biology:\nSept 8 - Lab report due\nOct 2 - Midterm exam");
  assert.equal(getSyllabusFileKind({ name: "course.docx" }), "docx");
});

test("assignment countdowns use days normally and hours on the due date", () => {
  const now = new Date("2026-07-06T10:00:00");
  assert.equal(formatAssignmentCountdown(new Date("2026-07-08T15:00:00"), now), "2 days left");
  assert.equal(formatAssignmentCountdown(new Date("2026-07-06T15:30:00"), now), "5h 30m left today");
  assert.equal(formatAssignmentCountdown(new Date("2026-07-06T09:00:00"), now), "Overdue by 1h 0m");
  assert.equal(getAssignmentCountdownTone(new Date("2026-07-06T15:30:00"), now), "today");
});

test("weekly calendar honors Sunday and Monday starts", () => {
  const anchor = new Date(2026, 6, 8);
  assert.equal(getWeekDates(anchor, "sunday")[0].getDay(), 0);
  assert.equal(getWeekDates(anchor, "monday")[0].getDay(), 1);
  assert.equal(shiftCalendarWeek(anchor, 1).getDate(), 15);
  assert.equal(isSameCalendarDay(anchor, new Date(2026, 6, 8, 23, 59)), true);
});

test("voice undo permanently locks once work starts", () => {
  const untouched = { createdByVoice: true, status: "todo", isCompleted: false };
  assert.equal(canUndoVoiceCreation(untouched), true);
  const started = { ...lockVoiceUndo(untouched), status: "inProgress" };
  assert.equal(canUndoVoiceCreation(started), false);
  assert.equal(canUndoVoiceCreation({ ...started, status: "todo" }), false);
});
