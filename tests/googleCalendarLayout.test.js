import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Google Calendar settings use fluid non-overlapping controls", async () => {
  const css = await readFile(new URL("../src/App.css", import.meta.url), "utf8");
  assert.match(css, /\.google-calendar-settings \.settings-collapsible-content\s*\{[\s\S]*?min-width: 0;[\s\S]*?text-align: left;/);
  assert.match(css, /\.google-calendar-settings \.google-calendar-compact-option\s*\{[\s\S]*?grid-template-columns: 18px minmax\(0, 1fr\)/);
  assert.match(css, /grid-template-columns: repeat\(auto-fit, minmax\(min\(220px, 100%\), 1fr\)\)/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?google-calendar-actions \.btn \{ width: 100%; \}/);
});
