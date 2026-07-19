import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("mobile edit remains a full-screen assignment form with accessible fields", async () => {
  const app = await read("../src/App.jsx");
  assert.match(app, /mobile-edit-backdrop/);
  assert.match(app, /mobile-edit-screen/);
  assert.match(app, /mobile-edit-save/);
  for (const id of ["name", "category", "course", "priority", "due-time", "due-period", "estimated-minutes", "repeat", "notes"]) {
    assert.match(app, new RegExp(`htmlFor="edit-assignment-${id}"`));
    assert.match(app, new RegExp(`id="edit-assignment-${id}"`));
  }
  assert.match(app, /renderDueDateField\(editingTask\.dueMonth, editingTask\.dueDay/);
  assert.match(app, /"edit-assignment-due-date"/);
  assert.match(app, /type="date"/);
  assert.match(app, /className="date-picker-logo-button"[\s\S]{0,900}<input[\s\S]{0,120}id=\{id\}[\s\S]{0,80}type="date"/);
  assert.match(app, /event\.currentTarget\.nextElementSibling/);
});

test("mobile keyboard, horizontal labels, notes spacing, and trash toast stay hardened", async () => {
  const [app, styles] = await Promise.all([read("../src/App.jsx"), read("../src/App.css")]);
  assert.match(app, /keyboardIsOpen/);
  assert.doesNotMatch(app, /scrollIntoView\?\.\(\{ block: "center"/);
  assert.match(styles, /mobile-edit-screen \.edit-details-grid > \.edit-field[\s\S]{0,250}grid-template-columns: 92px minmax\(0, 1fr\)/);
  assert.match(styles, /mobile-edit-screen \.edit-notes-side > label[\s\S]{0,120}align-self: center/);
  assert.match(styles, /mobile-app-ui \.delete-undo-toast[\s\S]{0,400}grid-template-columns: minmax\(0, 1fr\) auto/);
});

test("assignment dialogs trap focus and restore it to their trigger", async () => {
  const app = await read("../src/App.jsx");
  assert.match(app, /dialogTriggerRef\.current = document\.activeElement/);
  assert.match(app, /event\.key !== "Tab"/);
  assert.match(app, /dialogTriggerRef\.current\?\.focus/);
  assert.match(app, /ref=\{activeDialogRef\}[\s\S]{0,180}role="dialog"/);
});

test("mobile settings expose Privacy and Data in the stable scrolling panel", async () => {
  const [app, styles] = await Promise.all([read("../src/App.jsx"), read("../src/App.css")]);
  assert.doesNotMatch(app, /SETTINGS_SECTIONS\.filter\(\(section\) => section\.id !== "privacy"\)/);
  assert.match(app, /id: "privacy"[\s\S]{0,120}label: "Privacy & Data"/);
  assert.match(app, /settingsSection === "privacy"/);
  assert.match(app, /ref=\{mobileSettingsScrollRef\} className="mobile-settings-scroll-body"/);
  assert.match(styles, /settings-content\.mobile-settings-panel-open \.mobile-settings-scroll-body[\s\S]{0,500}overflow-y: auto/);
});

test("mobile courses use accessible persisted reorder controls instead of a dead drag handle", async () => {
  const [app, styles] = await Promise.all([read("../src/App.jsx"), read("../src/App.css")]);
  assert.match(app, /renderMobilePageTitle\("", "Courses and Colors"/);
  assert.match(app, /className="mobile-course-order-actions"/);
  assert.match(app, /aria-label=\{`Move \$\{course\} up`\}/);
  assert.match(app, /handleCourseMove\(course, -1\)/);
  assert.match(styles, /portable-course-color-row \.course-drag-handle \{ display: none; \}/);
  assert.match(styles, /course-color-selector::-(?:webkit|moz)-color-swatch[^{]*\{[^}]*opacity: 0/);
});

test("mobile dashboard checklist controls share one compact heading row", async () => {
  const [app, styles] = await Promise.all([read("../src/App.jsx"), read("../src/App.css")]);
  assert.match(app, /mobile-dashboard-checklists/);
  assert.match(app, /mobile-checklist-heading-actions/);
  assert.match(app, /!isMobileUi && <p>Quick lists that stay separate from assignments\.<\/p>/);
  assert.match(styles, /mobile-checklist-heading-actions[\s\S]{0,220}grid-template-columns: repeat\(3/);
});

test("mobile assignment actions finish with a stable two-column grid", async () => {
  const styles = await read("../src/App.css");
  assert.match(styles, /mobile-task-card \.task-actions[\s\S]{0,260}grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /mobile-task-card \.task-action-pair[\s\S]{0,180}display: contents/);
});
