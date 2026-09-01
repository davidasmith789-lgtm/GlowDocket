import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Google Calendar preview is interactive only for the exact tester account", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /accountEmail\.trim\(\)\.toLowerCase\(\) === "purplxr@gmail\.com"/);
  assert.match(app, /googleCalendarPreviewEnabled \? <SettingsCard title="Google Calendar"/);
  assert.match(app, /google-calendar-settings-locked/);
  assert.match(app, /aria-disabled="true"/);
});

test("non-preview accounts do not start Google Calendar status or background sync", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /accountMode !== "cloud" \|\| !googleCalendarPreviewEnabled/);
  assert.match(app, /!googleCalendarPreviewEnabled \|\| !googleCalendarState\.connected \|\| googleCalendarSyncingRef\.current/);
  assert.match(app, /!googleCalendarPreviewEnabled \|\| !googleCalendarState\.connected\) return undefined/);
});
