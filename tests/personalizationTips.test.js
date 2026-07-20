import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("widget titles stay centered on the widget independently of header controls", async () => {
  const styles = await read("../src/App.css");
  const titleRule = styles.match(/\.workspace-widget-header > strong \{([\s\S]*?)\}/)?.[1] || "";

  assert.match(styles, /\.workspace-widget-header \{[\s\S]*?position: relative;/);
  assert.match(titleRule, /position: absolute;/);
  assert.match(titleRule, /left: 50%;/);
  assert.match(titleRule, /top: 50%;/);
  assert.match(titleRule, /transform: translate\(-50%, -50%\);/);
  assert.match(titleRule, /text-align: center;/);
});

test("personalization tips can be searched and filtered by useful topics", async () => {
  const [app, display] = await Promise.all([
    read("../src/App.jsx"),
    read("../src/components/AppDisplayComponents.jsx"),
  ]);

  assert.match(app, /const PERSONALIZATION_TIP_CATEGORIES = \["All", "Workspace", "Appearance", "Assignments", "Reminders", "Calendar", "Data & Accounts", "Accessibility"\]/);
  assert.match(app, /aria-label="Filter personalization tips by topic"/);
  assert.match(app, /aria-pressed=\{helpCategory === category\}/);
  assert.match(app, /visiblePersonalizationTips\.length === 0/);
  for (const title of ["Privacy and data use", "Install a GlowDocket update", "Storage and attachment warnings", "Verify accessibility", "Edit assignments on mobile"]) {
    assert.match(app, new RegExp(title));
  }
  assert.match(display, /personalization-tip-category/);
  assert.match(display, /\{category\}/);
});

test("the page color wash is editable, optional, and saved with personalization", async () => {
  const [app, styles] = await Promise.all([
    read("../src/App.jsx"),
    read("../src/App.css"),
  ]);

  assert.match(app, /pageColorWashEnabled: true/);
  assert.match(app, /pageColorWashColor: "#6366f1"/);
  assert.match(app, /handleAddFieldSettingChange\("pageColorWashEnabled"/);
  assert.match(app, /handleAddFieldSettingChange\("pageColorWashColor"/);
  assert.match(app, /type="color"/);
  assert.match(app, /aria-label="Page background accent color"/);
  assert.match(app, /pageColorWashEnabled !== false \? " page-color-wash"/);
  assert.match(styles, /\.App\.page-color-wash\s*\{[\s\S]*radial-gradient[\s\S]*--page-color-wash/);
  assert.match(styles, /\.App\s*\{[\s\S]*background: var\(--page-bg\)/);
});

test("assignment field and workflow settings expand horizontally on wider screens", async () => {
  const [app, styles] = await Promise.all([
    read("../src/App.jsx"),
    read("../src/App.css"),
  ]);

  assert.match(app, /title="Add Assignment Fields"[\s\S]{0,250}className="settings-horizontal-options settings-section-wide"/);
  assert.match(app, /title="Workflow & Safety"[\s\S]{0,250}className="settings-horizontal-options settings-section-wide"/);
  assert.match(styles, /\.settings-horizontal-options \.settings-collapsible-content \{[\s\S]*?grid-template-columns: repeat\(auto-fit, minmax\(190px, 1fr\)\);/);
  assert.match(styles, /@media \(max-width: 560px\)[\s\S]*?\.settings-horizontal-options \.settings-collapsible-content \{[\s\S]*?grid-template-columns: 1fr;/);
});

test("assignment cards have persistent detail controls and quick presets", async () => {
  const [app, styles] = await Promise.all([
    read("../src/App.jsx"),
    read("../src/App.css"),
  ]);

  for (const setting of ["showTaskCourseBadge", "showTaskDetailLine", "showTaskCountdown", "showTaskChecklistProgress", "showTaskReminderIndicator"]) {
    assert.match(app, new RegExp(`${setting}: true`));
    assert.match(app, new RegExp(`handleAddFieldSettingChange\\("${setting}"`));
  }
  assert.match(app, /const handleAssignmentCardPreset = \(preset\) =>/);
  assert.match(app, /aria-label="Assignment card display presets"/);
  assert.match(app, />Minimal<\/button>/);
  assert.match(app, />Deadline Focus<\/button>/);
  assert.match(app, />Show Everything<\/button>/);
  assert.match(styles, /\.hide-task-course-badges \.task-card \.task-course-pill/);
  assert.match(styles, /\.hide-task-reminder-indicators \.task-card \.task-reminder-indicator/);
});

test("assignment card display belongs to Assignment Options, not Accessibility", async () => {
  const app = await read("../src/App.jsx");
  const sectionSource = (id) => {
    const start = app.indexOf(`{settingsSection === "${id}" && (`);
    const end = app.indexOf('{settingsSection === "', start + 1);
    return start >= 0 ? app.slice(start, end >= 0 ? end : undefined) : "";
  };
  const assignmentsSection = sectionSource("assignments");
  const accessibilitySection = sectionSource("accessibility");

  assert.match(assignmentsSection, /title="Assignment Card Display"/);
  assert.doesNotMatch(accessibilitySection, /title="Assignment Card Display"/);
});
