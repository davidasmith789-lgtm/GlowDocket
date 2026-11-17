import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assessmentDateInputValue,
  assessmentTimeInputValue,
  buildAssessmentTask,
  buildStudyTaskForAssessment,
  isAssessment,
} from "../src/assessmentUtils.js";

test("quiz and test events retain their exact course date time and notes", () => {
  const assessment = buildAssessmentTask({
    id: "assessment-1",
    assessmentType: "quiz",
    name: "Chapter 6 Quiz",
    course: "Biology",
    date: "2027-01-08",
    time: "9:30",
    amPm: "AM",
    notes: "Bring a calculator.",
    now: new Date("2026-11-18T12:00:00Z"),
  });

  assert.equal(isAssessment(assessment), true);
  assert.equal(assessment.title, "Chapter 6 Quiz");
  assert.equal(assessment.course, "Biology");
  assert.equal(assessment.dueYear, 2027);
  assert.equal(assessment.dueMonth, "01");
  assert.equal(assessment.dueDay, "08");
  assert.equal(assessment.dueHour, "9:30");
  assert.equal(assessment.dueAmPm, "AM");
  assert.equal(assessment.notes, "Bring a calculator.");
  assert.equal(assessmentDateInputValue(assessment), "2027-01-08");
  assert.equal(assessmentTimeInputValue(assessment), "09:30");
});

test("optional study assignments are due at 11:59 PM on the previous calendar day", () => {
  const assessment = buildAssessmentTask({
    id: "assessment-2",
    assessmentType: "test",
    name: "Winter Final",
    course: "Chemistry",
    date: "2027-01-01",
    time: "1:15",
    amPm: "PM",
    notes: "Units 1 through 5",
    now: new Date("2026-11-18T12:00:00Z"),
  });
  const studyTask = buildStudyTaskForAssessment(assessment, {
    id: "assessment-2-study",
    now: new Date("2026-11-18T12:00:00Z"),
  });

  assert.equal(isAssessment(studyTask), false);
  assert.equal(studyTask.itemType, "assignment");
  assert.equal(studyTask.title, "Study for: Winter Final");
  assert.equal(studyTask.dueYear, 2026);
  assert.equal(studyTask.dueMonth, "12");
  assert.equal(studyTask.dueDay, "31");
  assert.equal(studyTask.dueHour, "11:59");
  assert.equal(studyTask.dueAmPm, "PM");
  assert.equal(studyTask.sourceAssessmentId, assessment.id);
  assert.match(studyTask.notes, /Units 1 through 5/);
  assert.match(studyTask.notes, /1:15 PM/);
});

test("assessment integration keeps events out of task workflows and exposes the themed editor", async () => {
  const [app, css] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.css", import.meta.url), "utf8"),
  ]);

  assert.match(app, /!isAssessment\(task\)[\s\S]*?getTaskStatus\(task\) === "todo"/);
  assert.match(app, /Add a Quiz or Test/);
  assert.match(app, /className="bulk-import-panel"[\s\S]*className="assessment-add-panel"/);
  assert.match(app, /Upcoming quizzes & tests/);
  assert.match(app, /Assignments, quizzes & tests for/);
  assert.match(app, /Create a “Study for:/);
  assert.match(app, /className="assessment-time-controls"/);
  assert.match(app, /placeholder="e\.g\., 3 or 3:45" value=\{assessmentTime\}/);
  assert.match(app, /value=\{assessmentAmPm\}/);
  assert.doesNotMatch(app, /required type="time" value=\{assessmentTime\}/);
  assert.match(app, /if \(isAssessment\(task\)\) \{\s*openAssessmentEditor\(task\);/);
  assert.match(app, /className="reminder-widget-start reminder-widget-calendar"[\s\S]*?onClick=\{\(\) => handleAssessmentFocus\(task\)\}>Calendar/);
  assert.match(css, /@media \(max-width: 500px\)[\s\S]*?\.reminder-widget-list li\.is-assessment-reminder\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/s);
  assert.match(app, /className="trash-confirm-dialog"/);
  assert.match(css, /\.trash-confirm-dialog\s*\{[^}]*background:\s*var\(--modal-bg\);[^}]*color:\s*var\(--text-color\)/s);
  assert.match(css, /\.assessment-editor\s*\{[^}]*background:\s*var\(--card-bg\)/s);
  assert.match(css, /\.assessment-add-panel\s*\{/);
  assert.match(css, /\.assignment-entry-form > \.bulk-import-panel \{ margin-bottom: 0; \}/);
  assert.match(css, /\.assignment-entry-form > \.assessment-add-panel \{ margin-bottom: 16px; \}/);
  assert.match(css, /\.calendar-assessment-card\s*\{/);
});
