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
