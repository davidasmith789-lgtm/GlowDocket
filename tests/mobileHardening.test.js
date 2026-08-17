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

test("mobile pages reserve bottom navigation space only once", async () => {
  const [styles, flashcards, community] = await Promise.all([
    read("../src/App.css"),
    read("../src/components/FlashcardsHub.css"),
    read("../src/components/CommunityHub.css"),
  ]);
  assert.match(styles, /Authoritative end-of-cascade mobile overrides[\s\S]*?\.mobile-app-main \{ min-height: 0; padding-bottom: 28px;/);
  assert.match(flashcards, /\.flash-page,[\s\S]*?padding: 12px 10px 22px;/);
  assert.match(flashcards, /\.flash-setup \{\s*min-height: 0;/);
  assert.match(community, /\.community-page\.is-mobile \{\s*padding-bottom: 22px;/);
  assert.doesNotMatch(community, /community-page\.is-mobile[\s\S]{0,100}padding[^;]*mobile-nav-clearance/);
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

test("mobile Add Assignment methods retain import, manual, then voice order", async () => {
  const styles = await read("../src/App.css");
  assert.match(styles, /assignment-entry-form > \.bulk-import-panel \{ order: 1; \}/);
  assert.match(styles, /assignment-entry-form > \.manual-assignment-fields \{ order: 2; \}/);
  assert.match(styles, /assignment-entry-form > \.voice-assignment-panel \{ order: 3; \}/);
  assert.doesNotMatch(styles, /assignment-entry-form > \.voice-assignment-panel \{ order: -/);
});

test("mobile Add Assignment fills Safari's dynamic viewport", async () => {
  const styles = await read("../src/App.css");
  assert.match(styles, /mobile-app-main\.mobile-add-fullscreen[\s\S]{0,180}inset: 0/);
  assert.match(styles, /mobile-app-main\.mobile-add-fullscreen[\s\S]{0,220}height: 100dvh/);
  assert.match(styles, /mobile-app-main\.mobile-add-fullscreen[\s\S]{0,400}overflow-y: auto/);
});

test("mobile recommendation wording stays concise", async () => {
  const app = await read("../src/App.jsx");
  assert.match(app, /mobile-app-section-heading[^\n]*<h3>Best Next Steps<\/h3>/);
  assert.doesNotMatch(app, /Short on time\?/i);
  assert.match(app, /<h3>Best Next Steps<\/h3>/);
  assert.match(app, /Finish History outline/);
  assert.match(app, /Study Biology notes/);
});

test("mobile Customize GlowDocket heading stays white in dark themes", async () => {
  const [app, styles] = await Promise.all([read("../src/App.jsx"), read("../src/App.css")]);
  assert.match(app, /<h2>Customize GlowDocket<\/h2>/);
  assert.match(styles, /html\[data-theme="dark"\] \.mobile-app-ui \.mobile-settings-page \.mobile-settings-list-heading h2 \{ color: #ffffff; \}/);
});
