import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/App.css", import.meta.url), "utf8");

test("dropdown highlight is customizable and uses readable derived text", () => {
  assert.doesNotMatch(app, /group: "Workspace"/);
  assert.match(app, /key: "dropdownHighlight", label: "Dropdown highlight", group: "Actions"/);
  assert.match(app, /normalized\.dropdownHighlight && \{ dropdownHighlightText: getContrastText\(normalized\.dropdownHighlight\) \}/);
  assert.match(app, /dropdownHighlight: \["--dropdown-highlight-bg"\]/);
  assert.match(app, /dropdownHighlightText: \["--dropdown-highlight-text"\]/);
  assert.doesNotMatch(app, /is-highlighted/);
  assert.match(css, /select option:checked\s*\{[^}]*background-color: var\(--dropdown-highlight-bg\);[^}]*color: var\(--dropdown-highlight-text\);/s);
  assert.match(css, /select option:hover,[\s\S]*background: var\(--dropdown-highlight-bg\);[\s\S]*color: var\(--dropdown-highlight-text\);/);
});
