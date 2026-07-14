import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("low-risk display components are extracted without changing their CSS contracts", async () => {
  const [app, display] = await Promise.all([
    read("../src/App.jsx"),
    read("../src/components/AppDisplayComponents.jsx"),
  ]);
  assert.match(app, /from "\.\/components\/AppDisplayComponents\.jsx"/);
  for (const className of ["settings-section", "personalization-tip-card", "assignment-countdown", "subtask-progress-line", "mobile-app-page-heading"]) {
    assert.match(display, new RegExp(className));
  }
  assert.doesNotMatch(display, /localStorage|indexedDB|workspaceLayout|cloud/i);
});

test("assignment filters remain controlled by App-owned state and handlers", async () => {
  const [app, filters] = await Promise.all([
    read("../src/App.jsx"),
    read("../src/components/AssignmentFilters.jsx"),
  ]);
  assert.match(app, /<AssignmentFilterControls[\s\S]*filtersOpen=\{filtersOpen\}[\s\S]*onReset=\{resetFilters\}/);
  for (const setter of ["setSearchTerm", "setFilterCategory", "setFilterCourse", "setFilterPriority", "setFilterDueBucket", "setFilterRepeat"]) assert.match(app, new RegExp(setter));
  assert.match(filters, /className="card filter-controls-card"/);
  assert.match(filters, /Search by title, course, or notes/);
  assert.doesNotMatch(filters, /useState|localStorage|indexedDB/);
});
