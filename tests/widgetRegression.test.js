import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createDefaultWorkspaceLayout } from "../src/workspaceLayout.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("every default widget type remains registered in the renderer", async () => {
  const app = await read("../src/App.jsx");
  const defaultTypes = [...new Set(Object.values(createDefaultWorkspaceLayout().desktop).flat().map((item) => item.type))];
  for (const type of defaultTypes) {
    if (type.includes("-bucket-")) assert.match(app, /type\.endsWith\(`-bucket-\$\{key\}`\)/);
    else assert.match(app, new RegExp(`["']${type}["']`), `${type} must remain registered`);
  }
});

test("widget drag release restores locked widgets, persists a position, moves tabs, or opens a standalone window", async () => {
  const app = await read("../src/App.jsx");
  assert.match(app, /releasedOutsideWindow/);
  assert.match(app, /if \(releasedOutsideWindow && onDetach\) onDetach\(\);\s*else if \(locked\) return;\s*else if \(targetTab\) onMove\(targetTab\);\s*else onPosition\(nextX, nextY, canvas\.clientWidth\);/);
  assert.match(app, /Open in desktop window/);
  assert.match(app, /window\.open\("", `glowdocket-widget-/);
});

test("feedback styles stay scoped away from workspace geometry and pointer controls", async () => {
  const css = await read("../src/App.css");
  const feedbackRules = css.match(/[^{}]*feedback[^{}]*\{[^{}]*\}/gi) || [];
  assert.ok(feedbackRules.length > 0);
  for (const rule of feedbackRules) {
    assert.doesNotMatch(rule, /workspace-widget|workspace-canvas|widget-drag-grip|pointer-events/);
  }
});

test("Feedback and Support state is isolated from workspace state", async () => {
  const app = await read("../src/App.jsx");
  const handler = app.match(/const handleFeedbackSubmit[\s\S]*?\n\s+};/)?.[0] || "";
  assert.match(handler, /fetch\("\/api\/feedback"/);
  assert.doesNotMatch(handler, /setWorkspaceLayout|workspaceLayoutRef|localStorage|saveLocalSnapshot/);
});

test("Vercel function entrypoints remain within the Hobby limit", async () => {
  const apiRoot = new URL("../api/", import.meta.url);
  const countEntrypoints = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
      if (entry.isDirectory()) count += await countEntrypoints(new URL(`${entry.name}/`, directory));
      else if (/\.(?:js|mjs|cjs|ts)$/.test(entry.name)) count += 1;
    }
    return count;
  };
  assert.ok(await countEntrypoints(apiRoot) <= 12);
});
