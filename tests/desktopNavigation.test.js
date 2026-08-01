import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("desktop navigation keeps study destinations in order and feedback on the right", async () => {
  const [app, styles] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.css", import.meta.url), "utf8"),
  ]);
  const nav = app.slice(app.indexOf('<div className="tab-row">'), app.indexOf("{assignmentSaveError"));
  const labels = ["Dashboard", 'data-tab="todo"', "In Progress", "Completed", "Calendar", "Flashcards", "Community"];
  const positions = labels.map((label) => nav.indexOf(label));

  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.ok(nav.indexOf("Feedback & Support") > nav.indexOf("Community"));
  assert.ok(nav.indexOf("Widgets") < nav.indexOf("Feedback & Support"));
  assert.ok(nav.indexOf("Settings") > nav.indexOf("Feedback & Support"));
  assert.match(nav, /desktop-feedback-tab/);
  assert.match(styles, /@media \(min-width: 768px\)[\s\S]*?\.widgets-tray-button \{ margin-left: auto; \}/);
  assert.match(app, /const communityEnabled = accountMode === "cloud";/);
  assert.match(app, /const flashcardsEnabled = accountMode === "cloud";/);
  for (const icon of ["📌", "📝", "✍️", "✅", "📅", "📚", "👥", "🙋"]) {
    assert.match(nav, new RegExp(`<span className="tab-button-icon" aria-hidden="true">${icon}</span>`));
  }
  assert.match(styles, /\.tab-button-icon \{[^}]*margin-right: 4px;/);
  assert.match(styles, /@media \(min-width: 701px\)[\s\S]*?\.App \.tab-row \{[^}]*flex-flow: row nowrap;[^}]*overflow-x: auto;[^}]*overflow-y: hidden;/);
});
