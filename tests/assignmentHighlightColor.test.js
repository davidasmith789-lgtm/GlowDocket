import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/App.css", import.meta.url), "utf8");

test("assignment highlight is customizable and uses readable derived text", () => {
  assert.doesNotMatch(app, /group: "Workspace"/);
  assert.match(app, /key: "taskHighlight", label: "Assignment highlight", group: "Assignment Viewing"/);
  assert.match(app, /normalized\.taskHighlight && \{ taskHighlightText: getContrastText\(normalized\.taskHighlight\) \}/);
  assert.match(app, /taskHighlight: \["--task-highlight-bg"\]/);
  assert.match(app, /taskHighlightText: \["--task-highlight-text"\]/);
  assert.match(app, /\? " is-highlighted" : ""/);
  assert.match(css, /\.task-card\.is-highlighted\s*\{[^}]*background: var\(--task-highlight-bg\) !important;[^}]*color: var\(--task-highlight-text\);/s);
});
