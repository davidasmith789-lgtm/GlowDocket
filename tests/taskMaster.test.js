import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("desktop task widgets omit the repeated inner status heading", async () => {
  const app = await read("../src/App.jsx");
  assert.match(app, /\{isMobileUi && <div className="task-master-heading">/);
  assert.doesNotMatch(app, /<div className="task-master-heading"><h3>\{status[^\n]+<\/div>\n\s*\{!onlyBucket/);
});

test("desktop Completed keeps Archive All beside the filter", async () => {
  const [app, styles] = await Promise.all([read("../src/App.jsx"), read("../src/App.css")]);
  assert.match(app, /!isMobileUi && status === "completed"[^\n]+desktop-task-master-toolbar/);
  assert.match(styles, /\.desktop-task-master-toolbar \{ display: flex/);
  assert.match(styles, /\.desktop-task-master-toolbar \.filter-bar \{ flex: 1; margin-bottom: 0; \}/);
});
