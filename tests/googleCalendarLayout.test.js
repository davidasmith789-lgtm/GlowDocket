import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Google Calendar settings use fluid non-overlapping controls", async () => {
  const [app, css] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.css", import.meta.url), "utf8"),
  ]);
  assert.match(css, /\.google-calendar-settings \.settings-collapsible-content\s*\{[\s\S]*?min-width: 0;[\s\S]*?text-align: left;/);
  assert.match(css, /\.google-calendar-settings \.google-calendar-compact-option\s*\{[\s\S]*?grid-template-columns: 18px minmax\(0, 1fr\)/);
  assert.match(css, /grid-template-columns: repeat\(auto-fit, minmax\(min\(220px, 100%\), 1fr\)\)/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?google-calendar-actions \.btn \{ width: 100%; \}/);
  assert.match(css, /\.google-disconnect-dialog\s*\{[^}]*border:\s*1px solid var\(--border-color\);[^}]*background:\s*var\(--modal-bg\);[^}]*color:\s*var\(--text-color\);/s);
  assert.doesNotMatch(css, /\.google-disconnect-dialog\s*\{[^}]*var\(--panel-bg, #fff\)/s);
  assert.match(app, /const isAssignmentLinkedToGoogle = \(id\) =>[\s\S]*?mapping\.state === "active"/);
  assert.match(app, /isAssignmentLinkedToGoogle\(pendingGoogleAssignmentDelete\.id\) && <label className="google-delete-calendar-option"><span>Remove from Google Calendar<\/span><input type="checkbox"/);
  assert.match(css, /\.google-disconnect-dialog > \.google-delete-calendar-option\s*\{[^}]*width:\s*fit-content;[^}]*white-space:\s*nowrap;/s);
  assert.match(css, /\.google-delete-calendar-option > input\[type="checkbox"\]\s*\{[^}]*width:\s*auto;[^}]*flex:\s*0 0 auto;/s);
});
