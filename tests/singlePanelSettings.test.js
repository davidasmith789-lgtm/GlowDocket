import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const componentsSource = fs.readFileSync(new URL("../src/components/AppDisplayComponents.jsx", import.meta.url), "utf8");

test("single-panel settings stay open without a minimize control", () => {
  for (const title of ["Calendar Display", "School-Day Cycle", "Privacy & Data"]) {
    const openingTag = appSource.match(new RegExp(`<SettingsCard title="${title}"[^>]*>`))?.[0] || "";
    assert.match(openingTag, /collapsible=\{false\}/, `${title} should not be collapsible`);
  }

  assert.match(componentsSource, /const expanded = !collapsible \|\|/);
  assert.match(componentsSource, /\{collapsible && \(/);
  assert.doesNotMatch(appSource.match(/<SettingsCard title="Add Email & Enable Cross-Device Sync"[^>]*>/)?.[0] || "", /collapsible=\{false\}/);
});
