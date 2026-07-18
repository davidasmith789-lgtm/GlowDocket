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
