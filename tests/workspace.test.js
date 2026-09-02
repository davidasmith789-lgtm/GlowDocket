import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { formatChecklistCountdown, getChecklistDeadline } from "../src/checklistUtils.js";
import { preparePastedAssignmentLines } from "../src/bulkImportUtils.js";
import { findLikelySyllabusAssignments, getSyllabusFileKind } from "../src/syllabusImport.js";
import { formatAssignmentCountdown, getAssignmentCountdownTone } from "../src/assignmentCountdown.js";
import { getWeekDates, isSameCalendarDay, shiftCalendarWeek } from "../src/calendarWeekUtils.js";
import { getQuickMatchCustomPresets, getQuickMatchPresets, rankQuickMatchCandidates, rankRecommendedTasks, summarizeRecommendationWorkload } from "../src/recommendationUtils.js";
import { createDemoData, getTutorialStorageKey, mergeDemoData, removeUnchangedDemoData } from "../src/onboardingUtils.js";
import { canUndoVoiceCreation, lockVoiceUndo } from "../src/voiceTaskUtils.js";
import { getWorkloadPeriodRange, summarizeWorkload } from "../src/workloadUtils.js";
import { COLLAPSED_WIDGET_HEIGHT, DEFAULT_LAYOUT_VERSION, MIN_WIDGET_WIDTH, applyNamedWorkspaceLayout, canHideWidget, createDefaultWorkspaceLayout, deleteNamedWorkspaceLayout, getDesktopLayoutPresetWidth, getWidgetMinimumExpandedHeight, normalizeWorkspaceLayout, placeWidget, saveNamedWorkspaceLayout, setWidgetCollapsedState, shouldPreserveWidgetPositions } from "../src/workspaceLayout.js";

function findWidgetOverlaps(items) {
  const visible = items.filter((item) => !item.hidden);
  const overlaps = [];

  for (let i = 0; i < visible.length; i += 1) {
    for (let j = i + 1; j < visible.length; j += 1) {
      const a = visible[i];
      const b = visible[j];
      if (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
      ) {
        overlaps.push([a.type, b.type]);
      }
    }
  }

  return overlaps;
}

test("tutorial storage is isolated by profile", () => {
  assert.equal(getTutorialStorageKey("Alex"), "taskcabinet_tutorial_Alex");
  assert.notEqual(getTutorialStorageKey("Alex"), getTutorialStorageKey("Jordan"));
});

test("demo data is optional, dated, and deduplicated", () => {
  const now = new Date(2026, 6, 11);
  const demo = createDemoData(now);
  const first = mergeDemoData([], ["Other"], now);
  const second = mergeDemoData(first.tasks, first.courses, now);
  assert.equal(first.tasks.length, 3);
  assert.equal(second.tasks.length, 3);
  assert.deepEqual(second.courses, ["Other", ...demo.courses]);
  assert.equal(first.tasks[0].dueDay, 12);
});

test("demo cleanup removes only unchanged sample assignments", () => {
  const demo = createDemoData(new Date(2026, 6, 11)).tasks;
  const edited = { ...demo[1], title: "My edited assignment" };
  const real = { id: "real-task", title: "Keep me" };
  const remaining = removeUnchangedDemoData([demo[0], edited, real]);
  assert.deepEqual(remaining.map((task) => task.id), [edited.id, real.id]);
});

test("date-only checklist deadlines use the end of the local day", () => {
  const deadline = getChecklistDeadline({ dueDate: "2026-07-06", dueTime: "" });
  assert.equal(deadline.getHours(), 23);
  assert.equal(deadline.getMinutes(), 59);
});

test("countdown switches from days to hours", () => {
  const now = new Date("2026-07-06T12:00:00");
  assert.equal(formatChecklistCountdown({ dueDate: "2026-07-08" }, now), "3 days left");
  assert.equal(formatChecklistCountdown({ dueDate: "2026-07-06", dueTime: "14:30" }, now), "2h 30m left");
});

test("checklist due dates can be cleared on mobile and desktop", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /handleClearChecklistItemDeadline/);
  assert.match(source, /dueDate: "", dueTime: ""/);
  assert.match(source, /className="checklist-date-clear"/);
  assert.match(css, /\.mobile-checklist-fullscreen \.checklist-date-clear/);
});

test("empty checklist dates use a compact labeled picker", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /checklist-date-picker\$\{item\.dueDate \? "" : " is-empty"\}/);
  assert.match(source, /!item\.dueDate && <span aria-hidden="true">Select date<\/span>/);
  assert.match(css, /\.checklist-date-picker\.is-empty\s*\{[^}]*width:\s*118px;/s);
});

test("workload summaries support today, week, month, custom, and all remaining", () => {
  const now = new Date(2026, 6, 15, 12);
  const tasks = [
    { id: 1, dueMonth: "07", dueDay: "15", estimatedMinutes: 30 },
    { id: 2, dueMonth: "07", dueDay: "17", estimatedMinutes: 75 },
    { id: 3, dueMonth: "07", dueDay: "28", estimatedMinutes: "" },
    { id: 4, dueMonth: "08", dueDay: "02", estimatedMinutes: 20 },
    { id: 5, dueMonth: "", dueDay: "", estimatedMinutes: 10 },
  ];
  assert.equal(summarizeWorkload(tasks, "today", { now }).knownMinutes, 30);
  assert.equal(summarizeWorkload(tasks, "week", { now, weekStartsOn: "monday" }).knownMinutes, 105);
  const month = summarizeWorkload(tasks, "month", { now });
  assert.equal(month.taskCount, 3);
  assert.equal(month.unknownCount, 1);
  assert.equal(summarizeWorkload(tasks, "custom", { now, customStart: "2026-07-16", customEnd: "2026-08-02" }).knownMinutes, 95);
  assert.equal(summarizeWorkload(tasks, "all", { now }).knownMinutes, 135);
});

test("custom workload periods reject missing and reversed dates", () => {
  assert.equal(getWorkloadPeriodRange("custom", { customStart: "", customEnd: "" }).invalid, true);
  assert.equal(getWorkloadPeriodRange("custom", { customStart: "2026-08-02", customEnd: "2026-07-01" }).invalid, true);
});

test("workload presets stay compact and only custom periods can scroll", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /workload-stat\$\{workloadPeriod === "custom" \? " is-custom-period" : ""\}/);
  assert.match(css, /\.workload-stat\s*\{[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.workload-stat\.is-custom-period\s*\{[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;/s);
  assert.match(css, /\.workload-stat\s*\{[^}]*grid-template-columns:[^}]*grid-template-areas:[^}]*"period value"[^}]*"period summary";/s);
  assert.match(css, /\.workload-stat > strong\s*\{[^}]*grid-area:\s*value;[^}]*font-size:\s*clamp\(1\.25rem, 6cqw, 2rem\);/s);
  assert.match(source, /--workload-select-width[^}]*workloadPeriodLabels\[workloadPeriod\]\.length \+ 3/);
  assert.match(source, /className=\{!workloadSummary\.invalid && workloadSummary\.knownMinutes <= 0 \? "is-no-estimates" : ""\}/);
  assert.match(css, /\.workload-stat > label\s*\{[^}]*grid-area:\s*period;[^}]*font-size:\s*0\.7rem;[^}]*text-align:\s*center;/s);
  assert.match(css, /\.workload-stat > label > select\s*\{[^}]*--workload-select-width[^}]*min-height:\s*34px;[^}]*font-size:\s*0\.82rem;[^}]*text-align-last:\s*center;/s);
  assert.match(css, /\.workload-stat > strong\.is-no-estimates\s*\{[^}]*font-size:\s*clamp\(0\.82rem, 3\.2cqw, 1rem\);/s);
  assert.match(css, /@container \(max-width: 319px\)[\s\S]*?\.workload-stat\s*\{[^}]*grid-template-areas:\s*"period" "value" "summary";/s);
  assert.match(css, /@container \(max-width: 319px\)[\s\S]*?\.workload-stat > label > select\s*\{[^}]*min-height:\s*28px;[^}]*font-size:\s*0\.7rem;/s);
  assert.match(css, /@container \(max-width: 319px\)[\s\S]*?\.workload-stat > p\s*\{[^}]*font-size:\s*clamp\(0\.56rem, 2\.5cqw, 0\.68rem\);[^}]*line-height:\s*1\.1;/s);
});

test("detached mini calendars hide their inactive internal resize handle", async () => {
  const css = await readFile(new URL("../src/App.css", import.meta.url), "utf8");
  assert.match(css, /\.detached-widget-content \.mini-calendar-height-handle\s*\{\s*display:\s*none;/);
});

test("detached widgets inherit the active theme and use the polished shared shell", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /sourceApp\?\.className/);
  assert.match(source, /propertyName\.startsWith\("--"\)/);
  assert.match(source, /popupPrimer\.textContent/);
  assert.match(source, /className="detached-widget-title"/);
  assert.match(css, /\.detached-widget-title > span/);
  assert.match(css, /\.detached-widget-content :is\(h1, h2, h3, h4, strong, label\)/);
});

test("class repeat choices keep radio controls separate from wrapping text", async () => {
  const styles = await readFile(new URL("../src/App.css", import.meta.url), "utf8");
  assert.match(styles, /\.schedule-mode-picker input\[type="radio"\]\s*\{[^}]*width:\s*20px[^}]*flex:\s*0 0 20px/s);
  assert.match(styles, /\.school-cycle-settings\s*\{[^}]*container-type:\s*inline-size/s);
  assert.match(styles, /@container \(max-width: 600px\)[\s\S]*?\.schedule-mode-picker\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test("detached widgets remain in the main canvas and locked drag handles stay available", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /const items = \(responsiveWorkspaceLayout\[workspaceMode\]\?\.\[tab\] \|\| \[\]\)\.filter\(\(item\) => !item\.hidden\)/);
  assert.doesNotMatch(source, /disabled=\{locked\}[\s\S]{0,160}aria-label=\{`Move/);
  assert.match(source, /else if \(locked\) return;/);
  assert.match(source, /const restoreOriginalPosition = locked \|\| releasedOutsideWindow;/);
  assert.match(source, /widget\.style\.left = `\$\{restoreOriginalPosition \? initialX : nextX\}px`;/);
  assert.match(source, /widget\.style\.top = `\$\{restoreOriginalPosition \? initialY : nextY\}px`;/);
  assert.match(source, /if \(releasedOutsideWindow && onDetach\) onDetach\(\);[\s\S]*?else onPosition\(nextX, nextY, canvas\.clientWidth\);/);
  assert.match(source, /popupWidth[\s\S]*popupHeight[\s\S]*width=\$\{popupWidth\},height=\$\{popupHeight\}/);
  assert.match(source, /const renderWidgetContent = \(instanceOrType\) =>/);
  assert.match(source, /typeof instanceOrType === "string" \? \{ type: instanceOrType \} : instanceOrType/);
  assert.match(source, /if \(!instance\?\.type\) return null;/);
  assert.match(source, /\{renderWidgetContent\(detached\)\}/);
  assert.doesNotMatch(source, /renderWidgetContent\(detached\.type\)/);
  assert.match(styles, /\.workspace-widget\.is-locked \.widget-drag-grip\s*\{\s*display:\s*inline-grid/);
});

test("placing a duplicate replaces the same widget type on the target tab", () => {
  const layout = createDefaultWorkspaceLayout();
  const widget = layout.desktop.dashboard.find((item) => item.type === "quick-match");
  const next = placeWidget(layout, "desktop", "todo", widget, { copy: true });
  assert.equal(next.desktop.todo.filter((item) => item.type === "quick-match").length, 1);
  assert.equal(next.desktop.dashboard.filter((item) => item.type === "quick-match").length, 1);
});

test("a widget added to a tab is placed below every visible widget already there", () => {
  const layout = createDefaultWorkspaceLayout();
  layout.collapsed = {};
  const widget = layout.desktop.dashboard.find((item) => item.type === "quick-match");
  const visibleTodoWidgets = layout.desktop.todo.filter((item) => !item.hidden);
  const existingBottom = Math.max(...visibleTodoWidgets.map((item) => item.y + item.height));
  const next = placeWidget(layout, "desktop", "todo", widget, { copy: true });
  const added = next.desktop.todo.find((item) => item.type === "quick-match");
  assert.equal(added.x, 0);
  assert.equal(added.y, existingBottom + 18);
  assert.deepEqual(findWidgetOverlaps(next.desktop.todo), []);
});

test("dropping a widget back on its current tab keeps its position", () => {
  const layout = createDefaultWorkspaceLayout();
  const widget = layout.desktop.dashboard.find((item) => item.type === "quick-match");
  const next = placeWidget(layout, "desktop", "dashboard", widget);
  assert.deepEqual(next.desktop.dashboard.find((item) => item.id === widget.id), widget);
});

test("named layouts restore one tab without changing its lock state", () => {
  const layout = createDefaultWorkspaceLayout();
  layout.desktop.dashboard[0].x = 77;
  layout.desktop.dashboard[0].width = 444;
  const saved = saveNamedWorkspaceLayout(layout, "desktop", "dashboard", "Study mode");
  const preset = saved.savedLayouts.desktop.dashboard[0];
  saved.desktop.dashboard[0].x = 900;
  saved.locked.desktop = false;
  const applied = applyNamedWorkspaceLayout(saved, "desktop", "dashboard", preset.id);
  assert.equal(applied.desktop.dashboard[0].x, 77);
  assert.equal(applied.desktop.dashboard[0].width, 444);
  assert.equal(applied.locked.desktop, false);
  assert.deepEqual(applied.desktop.todo, saved.desktop.todo);
});

test("named layouts are scoped by device mode and tab and can be deleted", () => {
  const layout = createDefaultWorkspaceLayout();
  const saved = saveNamedWorkspaceLayout(layout, "mobile", "todo", "Compact");
  assert.equal(saved.savedLayouts.mobile.todo.length, 1);
  assert.equal(saved.savedLayouts.desktop.todo, undefined);
  const presetId = saved.savedLayouts.mobile.todo[0].id;
  const removed = deleteNamedWorkspaceLayout(saved, "mobile", "todo", presetId);
  assert.deepEqual(removed.savedLayouts.mobile.todo, []);
});

test("a protected widget can be hidden only when another visible copy exists", () => {
  const layout = createDefaultWorkspaceLayout();
  assert.equal(canHideWidget(layout, "desktop", "checklists"), true);
  for (const tab of Object.keys(layout.desktop)) {
    layout.desktop[tab] = layout.desktop[tab].map((item) => item.type === "checklists" ? { ...item, hidden: true } : item);
  }
  layout.desktop.dashboard.find((item) => item.type === "checklists").hidden = false;
  assert.equal(canHideWidget(layout, "desktop", "checklists"), false);
});

test("new widget types are added without resetting a saved layout", () => {
  const saved = createDefaultWorkspaceLayout();
  saved.desktop.dashboard = saved.desktop.dashboard.filter((item) => !["course-overview", "reminders"].includes(item.type));
  saved.desktop.dashboard[0].width = 333;
  const normalized = normalizeWorkspaceLayout(saved);
  assert.equal(normalized.desktop.dashboard[0].width, 333);
  assert.equal(Number.isFinite(normalized.desktop.dashboard[0].xRatio), true);
  assert.equal(normalized.desktop.dashboard.some((item) => item.type === "course-overview"), true);
  assert.equal(normalized.desktop.dashboard.some((item) => item.type === "reminders"), true);
  assert.equal(normalized.locked.desktop, true);
});

test("older customized layouts receive corrected defaults without resetting unrelated tabs", () => {
  const saved = createDefaultWorkspaceLayout();
  saved.version = 4;
  saved.userCustomized = true;
  saved.desktop.dashboard[0].x = 123;
  saved.desktop.inProgress[0].x = 77;
  const normalized = normalizeWorkspaceLayout(saved, { preservePositions: true });
  assert.equal(normalized.version, DEFAULT_LAYOUT_VERSION);
  assert.equal(normalized.desktop.dashboard[0].x, 0);
  assert.equal(normalized.desktop.inProgress[0].x, 77);
  assert.equal(normalized.desktop.dashboard.find((item) => item.type === "recommended").width, 520);
});

test("To Do defaults use a utility column beside a wide working column", () => {
  const layout = createDefaultWorkspaceLayout();
  const todo = layout.desktop.todo;
  const courseColors = todo.find((item) => item.type === "course-colors");
  const reminders = todo.find((item) => item.type === "reminders");
  const todoMaster = todo.find((item) => item.type === "todo-master");
  const addAssignment = todo.find((item) => item.type === "add-assignment");

  assert.deepEqual(
    { x: reminders.x, y: reminders.y, width: reminders.width, height: reminders.height },
    { x: courseColors.x, y: courseColors.y + courseColors.height + 18, width: courseColors.width, height: courseColors.height },
  );
  assert.equal(todoMaster.x, 418);
  assert.equal(todoMaster.width, 1238);
  assert.equal(addAssignment.x, todoMaster.x);
  assert.equal(addAssignment.width, todoMaster.width);
  assert.deepEqual(findWidgetOverlaps(todo), []);
});

test("invalid, unknown, and duplicate saved widgets are repaired", () => {
  const saved = createDefaultWorkspaceLayout();
  saved.desktop.dashboard.push({ id: "recommended-0", type: "recommended", x: 1, y: 1 });
  saved.desktop.dashboard.push({ id: "unknown-1", type: "deleted-widget", x: 1, y: 1 });
  saved.desktop.todo = saved.desktop.todo.filter((item) => item.type !== "todo-master");
  const normalized = normalizeWorkspaceLayout(saved, { preservePositions: true });
  const ids = Object.values(normalized.desktop).flat().map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.includes("unknown-1"), false);
  assert.ok(normalized.desktop.todo.some((item) => item.type === "todo-master"));
});

test("school guide widget is removed from defaults and saved layouts", () => {
  const layout = createDefaultWorkspaceLayout();
  assert.equal(layout.desktop.dashboard.some((item) => item.type === "school-guide"), false);

  const saved = createDefaultWorkspaceLayout();
  saved.desktop.dashboard.push({ id: "school-guide-old", type: "school-guide", x: 468, y: 611, width: 466, height: 340 });
  const normalized = normalizeWorkspaceLayout(saved);
  assert.equal(normalized.desktop.dashboard.some((item) => item.type === "school-guide"), false);
});

test("settings shortcut widget is removed from defaults and saved layouts", () => {
  const saved = createDefaultWorkspaceLayout();
  saved.desktop.settings.push({ id: "settings-shortcut-old", type: "settings-master", x: 0, y: 0, width: 500, height: 300 });

  const normalized = normalizeWorkspaceLayout(saved);
  const allTypes = Object.values(normalized.desktop).flat().map((item) => item.type);

  assert.equal(allTypes.includes("settings-master"), false);
  assert.equal(normalized.desktop.settings.some((item) => item.type === "settings-master"), false);
});

test("tab-specific task bucket widgets are removed from defaults and saved layouts", () => {
  const layout = createDefaultWorkspaceLayout();
  const defaultTypes = Object.values(layout.desktop).flat().map((item) => item.type);
  assert.equal(defaultTypes.some((type) => type.startsWith("todo-bucket-") || type.startsWith("in-progress-bucket-")), false);

  const saved = createDefaultWorkspaceLayout();
  saved.desktop.todo.push({ id: "todo-bucket-old", type: "todo-bucket-today", x: 0, y: 0, width: 480, height: 430 });
  saved.desktop.inProgress.push({ id: "progress-bucket-old", type: "in-progress-bucket-overdue", x: 0, y: 0, width: 480, height: 430 });
  const normalized = normalizeWorkspaceLayout(saved);
  const normalizedTypes = Object.values(normalized.desktop).flat().map((item) => item.type);
  assert.equal(normalizedTypes.includes("todo-bucket-today"), false);
  assert.equal(normalizedTypes.includes("in-progress-bucket-overdue"), false);
});

test("course colors stays available and its finalized settings copy is hidden", () => {
  const layout = createDefaultWorkspaceLayout();

  for (const mode of ["desktop", "mobile"]) {
    const courseColors = Object.values(layout[mode]).flat().find((item) => item.type === "course-colors" && item.hidden);
    assert.ok(courseColors);
    assert.equal(courseColors.hidden, true);
  }
});

test("new mobile layouts start with compact app-sized widgets", () => {
  const layout = createDefaultWorkspaceLayout();
  const dashboard = layout.mobile.dashboard;

  assert.ok(dashboard.every((item) => item.width <= 420));
  assert.equal(dashboard.find((item) => item.type === "recommended").height, 400);
  assert.equal(dashboard.find((item) => item.type === "stat-active").height, 140);
  assert.equal(dashboard.find((item) => item.type === "add-assignment").height, 560);
});

test("compact mobile defaults do not rewrite an existing customized mobile layout", () => {
  const saved = createDefaultWorkspaceLayout();
  const recommended = saved.mobile.dashboard.find((item) => item.type === "recommended");
  Object.assign(recommended, { x: 77, y: 33, width: 600, height: 710, expandedHeight: 710 });
  saved.userCustomized = true;

  const normalized = normalizeWorkspaceLayout(saved, {
    mode: "mobile",
    canvasWidth: 720,
    preservePositions: true,
  });
  const preserved = normalized.mobile.dashboard.find((item) => item.type === "recommended");

  assert.equal(preserved.x, 77);
  assert.equal(preserved.y, 33);
  assert.equal(preserved.width, 600);
  assert.equal(preserved.height, 710);
});

test("default desktop and mobile workspace layouts do not overlap", () => {
  const layout = createDefaultWorkspaceLayout();

  assert.deepEqual(findWidgetOverlaps(layout.desktop.dashboard), []);
  assert.deepEqual(findWidgetOverlaps(layout.mobile.dashboard), []);
});

test("new widget defaults are expanded and follow an intentional desktop grid", () => {
  const layout = createDefaultWorkspaceLayout();
  assert.deepEqual(layout.collapsed, {});
  assert.deepEqual(findWidgetOverlaps(layout.desktop.dashboard), []);
  assert.deepEqual(findWidgetOverlaps(layout.desktop.todo), []);
  assert.deepEqual(findWidgetOverlaps(layout.desktop.inProgress), []);
  assert.deepEqual(findWidgetOverlaps(layout.desktop.completed), []);

  const dashboard = layout.desktop.dashboard;
  const topRow = ["recommended", "quick-match", "mini-calendar"].map((type) => dashboard.find((item) => item.type === type));
  assert.ok(topRow.every((item) => item.y === 0 && item.height === 430));
  const statRow = dashboard.filter((item) => item.type.startsWith("stat-"));
  assert.ok(statRow.every((item) => item.y === 448 && item.height === 145));
});

test("Chromebook widgets use an independent compact workspace", () => {
  const layout = createDefaultWorkspaceLayout();
  assert.ok(layout.chromebook);
  assert.notStrictEqual(layout.chromebook, layout.desktop);
  assert.notStrictEqual(layout.chromebook, layout.mobile);
  assert.equal(layout.locked.chromebook, false);
  assert.ok(layout.chromebook.dashboard.every((item) => item.width <= 540));
  assert.deepEqual(findWidgetOverlaps(layout.chromebook.dashboard), []);
});

test("Chromebook defaults use an expanded deliberate grid without changing mobile", () => {
  const layout = createDefaultWorkspaceLayout();
  assert.deepEqual(findWidgetOverlaps(layout.chromebook.dashboard), []);
  assert.deepEqual(findWidgetOverlaps(layout.chromebook.todo), []);
  assert.deepEqual(findWidgetOverlaps(layout.chromebook.inProgress), []);
  assert.deepEqual(findWidgetOverlaps(layout.chromebook.completed), []);
  assert.equal(layout.chromebook.dashboard.find((item) => item.type === "recommended").x, 0);
  assert.equal(layout.chromebook.dashboard.find((item) => item.type === "quick-match").x, 558);
  assert.equal(layout.chromebook.inProgress.find((item) => item.type === "in-progress-master").width, 720);
  assert.ok(layout.mobile.dashboard.every((item) => item.width <= 420));
});

test("older workspace layouts gain Chromebook defaults without changing saved desktop geometry", () => {
  const saved = createDefaultWorkspaceLayout();
  delete saved.chromebook;
  saved.version = 2;
  saved.userCustomized = true;
  const desktopBefore = structuredClone(saved.desktop);
  const normalized = normalizeWorkspaceLayout(saved, { preservePositions: true, preserveUnmeasuredPositions: true });
  assert.ok(normalized.chromebook.dashboard.length > 0);
  assert.deepEqual(normalized.desktop, desktopBefore);
});

test("ChromeOS mode detection and pointer-captured resizing stay wired", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /CrOS/);
  assert.match(app, /return "chromebook"/);
  assert.match(app, /setPointerCapture/);
  assert.match(app, /releasePointerCapture/);
});

test("phones, tablets, compact laptops, and wide desktops use independent workspaces", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /WORKSPACE_MOBILE_BREAKPOINT = 720/);
  assert.match(app, /WORKSPACE_DESKTOP_BREAKPOINT = 960/);
  assert.match(app, /if \(Number\(width\) < WORKSPACE_MOBILE_BREAKPOINT\) return "mobile"/);
  assert.match(app, /Number\(width\) < WORKSPACE_DESKTOP_BREAKPOINT \? "chromebook" : "desktop"/);
});

test("new accounts see every registered widget on the dashboard", () => {
  const layout = createDefaultWorkspaceLayout();
  const registeredTypes = new Set(Object.values(layout.desktop).flat().map((item) => item.type));
  const dashboardTypes = new Set(layout.desktop.dashboard.filter((item) => !item.hidden).map((item) => item.type));
  assert.deepEqual([...dashboardTypes].sort(), [...registeredTypes].sort());
  assert.deepEqual(findWidgetOverlaps(layout.desktop.dashboard), []);
});

test("resizing scales the full app shell without changing the chosen widget arrangement", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/App.css", import.meta.url), "utf8");
  assert.match(app, /const getVisibleViewportWidth = \(\) =>[\s\S]*?document\.documentElement\?\.clientWidth[\s\S]*?Math\.min\(windowWidth, documentWidth\)/);
  assert.match(app, /const viewportObserver = new ResizeObserver\(handleResize\);/);
  assert.match(app, /viewportObserver\.observe\(document\.documentElement\);/);
  assert.match(app, /\(appViewportWidth - 32\) \/ appShellDesignWidth/);
  assert.match(app, /marginLeft: "16px"/);
  assert.doesNotMatch(app, /marginLeft: `\$\{16 \/ appShellScale\}px`/);
  assert.match(app, /transform: `scale\(\$\{appShellScale\}\)`/);
  assert.match(app, /transformOrigin: "top left"/);
  assert.doesNotMatch(app, /zoom: appShellScale/);
  assert.match(app, /data-workspace-scale=\{scale\}/);
  assert.doesNotMatch(app, /setWorkspaceMode/);
  assert.match(app, /const workspaceMode = isMobileUi[\s\S]{0,120}\? "mobile"[\s\S]{0,180}Math\.max\(WORKSPACE_MOBILE_BREAKPOINT, appViewportWidth - 48\)/);
  assert.match(styles, /\.app-shell\.is-viewport-scaled/);
  assert.match(styles, /\.App:not\(\.mobile-app-ui\)\s*\{[^}]*overflow-x:\s*clip;/s);
});

test("rendered widgets use saved geometry without resize-time reflow", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /const responsiveWorkspaceLayout = workspaceLayout;/);
  assert.match(app, /savedWorkspaceRightEdge/);
  assert.doesNotMatch(app, /const responsiveWorkspaceLayout[\s\S]{0,400}reflowForCanvas/);
  assert.match(app, /responsiveWorkspaceLayout\[workspaceMode\]\?\.\[tab\]/);
});

test("desktop widget canvas keeps the full monitor-sized resize boundary", async () => {
  const styles = await readFile(new URL("../src/App.css", import.meta.url), "utf8");
  assert.match(styles, /\.App:not\(\.mobile-app-ui\) \.workspace-widget-canvas\s*\{\s*max-width:\s*none;/);
});

test("rendered widget dimensions include their borders in collision geometry", async () => {
  const styles = await readFile(new URL("../src/App.css", import.meta.url), "utf8");
  assert.match(styles, /\.workspace-widget\s*\{[^}]*box-sizing:\s*border-box;/s);
});

test("desktop pop-out widgets scroll without a visible right scrollbar", async () => {
  const styles = await readFile(new URL("../src/App.css", import.meta.url), "utf8");
  assert.match(styles, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?\.detached-widget-content \{ scrollbar-width: none; \}/);
  assert.match(styles, /\.detached-widget-content::-webkit-scrollbar \{ display: none; \}/);
});

test("narrow compact canvases keep every default widget inside the right edge", () => {
  const saved = createDefaultWorkspaceLayout();
  const normalized = normalizeWorkspaceLayout(saved, { mode: "chromebook", canvasWidth: 720, reflowForCanvas: true });
  for (const items of Object.values(normalized.chromebook)) {
    for (const item of items.filter((widget) => !widget.hidden)) {
      assert.ok(item.x >= 0);
      assert.ok(item.x + item.width <= 720);
    }
  }
});

test("desktop dashboard defaults use the full landscape canvas", () => {
  const layout = createDefaultWorkspaceLayout();
  const rightEdge = Math.max(...layout.desktop.dashboard.filter((item) => !item.hidden).map((item) => item.x + item.width));
  assert.ok(rightEdge >= 1600);
});

test("new and reset desktop layouts choose balanced screen-size presets", () => {
  const cases = [
    [1260, 1280],
    [1420, 1440],
    [1880, 1920],
    [2480, 2560],
    [3300, 3200],
  ];
  for (const [availableWidth, expectedPreset] of cases) {
    assert.equal(getDesktopLayoutPresetWidth(availableWidth), expectedPreset);
    const layout = createDefaultWorkspaceLayout({ desktopCanvasWidth: availableWidth });
    assert.equal(layout.defaultDesktopCanvasWidth, expectedPreset);
    const rightEdge = Math.max(...layout.desktop.dashboard.filter((item) => !item.hidden).map((item) => item.x + item.width));
    assert.ok(rightEdge >= expectedPreset * 0.97);
    assert.deepEqual(findWidgetOverlaps(layout.desktop.dashboard), []);
  }
});

test("new and reset layouts size themselves from the browser viewport", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");

  assert.match(app, /getAvailableWorkspaceWidth = \(\) => Math\.max\(960, getVisibleViewportWidth\(\) - 32\)/);
  assert.doesNotMatch(app, /getAvailableWorkspaceWidth[^;]*screen\?\.availWidth/);
});

test("old default desktop dashboard migrates to the balanced full-width layout", () => {
  const saved = createDefaultWorkspaceLayout();
  saved.desktop.dashboard = [
    { id: "recommended-0", type: "recommended", width: 640, height: 430, x: 0, y: 0 },
    { id: "quick-match-1", type: "quick-match", width: 360, height: 430, x: 658, y: 0 },
    { id: "mini-calendar-2", type: "mini-calendar", width: 330, height: 430, x: 1036, y: 0 },
    { id: "stat-active-3", type: "stat-active", width: 220, height: 145, x: 0, y: 448 },
    { id: "stat-today-4", type: "stat-today", width: 220, height: 145, x: 238, y: 448 },
    { id: "stat-overdue-5", type: "stat-overdue", width: 220, height: 145, x: 476, y: 448 },
    { id: "stat-workload-6", type: "stat-workload", width: 220, height: 145, x: 714, y: 448 },
    { id: "reminders-7", type: "reminders", width: 414, height: 360, x: 952, y: 448 },
    { id: "course-overview-8", type: "course-overview", width: 450, height: 340, x: 0, y: 611 },
    { id: "school-guide-9", type: "school-guide", width: 466, height: 340, x: 468, y: 611 },
    { id: "checklists-10", type: "checklists", width: 414, height: 480, x: 952, y: 826 },
    { id: "add-assignment-11", type: "add-assignment", width: 820, height: 620, x: 0, y: 969 },
    { id: "course-colors-12", type: "course-colors", width: 528, height: 460, x: 838, y: 969 },
  ];

  const normalized = normalizeWorkspaceLayout(saved);
  assert.equal(normalized.desktop.dashboard.some((item) => item.type === "school-guide"), false);
  assert.ok(normalized.desktop.dashboard.some((item) => item.type === "course-overview"));
});

test("desktop master widgets preserve the finalized proportional positions", () => {
  const layout = createDefaultWorkspaceLayout();
  const widgetWidth = layout.desktop.todo.find((item) => item.type === "todo-master").width;
  assert.ok(widgetWidth > 0);
  assert.ok(layout.desktop.todo.find((item) => item.type === "todo-master").x > 0);
  assert.ok(layout.desktop.inProgress.find((item) => item.type === "in-progress-master").x > 0);
  assert.ok(layout.desktop.completed.find((item) => item.type === "completed-master").x > 0);
});

test("workspace normalization separates overlapping visible widgets", () => {
  const saved = createDefaultWorkspaceLayout();
  saved.desktop.dashboard[0] = {
    ...saved.desktop.dashboard[0],
    x: 0,
    y: 0,
    width: 420,
    height: 260,
  };
  saved.desktop.dashboard[1] = {
    ...saved.desktop.dashboard[1],
    x: 120,
    y: 80,
    width: 420,
    height: 260,
  };

  const normalized = normalizeWorkspaceLayout(saved, { mode: "desktop", canvasWidth: 900 });
  assert.deepEqual(findWidgetOverlaps(normalized.desktop.dashboard), []);
});

test("workspace normalization re-centers widgets based on the actual canvas width", () => {
  const saved = createDefaultWorkspaceLayout();
  saved.desktop.dashboard[0] = {
    ...saved.desktop.dashboard[0],
    x: 1200,
    xRatio: 0.714,
    y: 0,
    width: 680,
    height: 460,
  };

  const normalized = normalizeWorkspaceLayout(saved, { mode: "desktop", canvasWidth: 900 });
  const widget = normalized.desktop.dashboard[0];

  assert.equal(widget.x, 220);
  assert.equal(widget.xRatio, 0.24444444444444444);
});

test("an unmeasured zero-width canvas preserves the distributed desktop layout", () => {
  const saved = createDefaultWorkspaceLayout();
  const expectedPositions = saved.desktop.dashboard.map(({ type, x }) => [type, x]);

  const collapsed = setWidgetCollapsedState(saved, "desktop", "mini-calendar-2", true);
  const normalized = normalizeWorkspaceLayout(collapsed, {
    mode: "desktop",
    canvasWidth: 0,
    collapsed: collapsed.collapsed,
    preservePositions: true,
  });
  const actualPositions = normalized.desktop.dashboard.map(({ type, x }) => [type, x]);

  assert.deepEqual(actualPositions, expectedPositions);
  assert.ok(actualPositions.some(([, x]) => x > 1000));
});

test("reload repair preserves right-edge positions before the canvas is measured", () => {
  const saved = createDefaultWorkspaceLayout();
  const rightWidget = saved.desktop.dashboard.find((item) => item.type === "stat-active");
  rightWidget.x = 1810;
  rightWidget.xRatio = 0.9;

  const normalized = normalizeWorkspaceLayout(saved, {
    preservePositions: true,
    preserveUnmeasuredPositions: true,
  });
  const restoredWidget = normalized.desktop.dashboard.find((item) => item.type === "stat-active");

  assert.equal(restoredWidget.x, 1810);
  assert.equal(restoredWidget.width, rightWidget.width);
});

test("missing and invalid canvas widths use the mode fallback", () => {
  const saved = createDefaultWorkspaceLayout();
  const miniCalendar = saved.desktop.dashboard.find((item) => item.type === "mini-calendar");

  for (const canvasWidth of [undefined, Number.NaN, -1]) {
    const normalized = normalizeWorkspaceLayout(structuredClone(saved), {
      mode: "desktop",
      canvasWidth,
      preservePositions: true,
    });
    const normalizedCalendar = normalized.desktop.dashboard.find((item) => item.type === "mini-calendar");
    assert.equal(normalizedCalendar.x, miniCalendar.x);
    assert.equal(normalizedCalendar.width, miniCalendar.width);
  }
});

test("a measured narrow canvas still clamps widgets to the available width", () => {
  const saved = createDefaultWorkspaceLayout();
  const normalized = normalizeWorkspaceLayout(saved, {
    mode: "desktop",
    canvasWidth: 700,
    preservePositions: true,
  });

  for (const widget of normalized.desktop.dashboard) {
    assert.ok(widget.width <= 700);
    assert.ok(widget.x >= 0);
    assert.ok(widget.x + widget.width <= 700);
  }
});

test("collapsed widgets reserve only their compact header footprint", () => {
  const saved = createDefaultWorkspaceLayout();
  saved.desktop.dashboard = [
    { id: "collapsed-a", type: "recommended", x: 0, y: 0, width: 320, height: 260 },
    { id: "floating-b", type: "quick-match", x: 0, y: 80, width: 240, height: 180 },
  ];

  const normalized = normalizeWorkspaceLayout(saved, {
    mode: "desktop",
    canvasWidth: 900,
    collapsed: { recommended: true },
  });
  const moved = normalized.desktop.dashboard.find((item) => item.id === "floating-b");

  assert.ok(moved.x >= 0);
  assert.ok(moved.y >= 0);
});

test("custom collapsed label height survives workspace normalization", () => {
  const saved = createDefaultWorkspaceLayout();
  const item = saved.desktop.dashboard[0];
  item.collapsedHeight = 92;
  saved.collapsed[item.type] = true;

  const normalized = normalizeWorkspaceLayout(saved, {
    mode: "desktop",
    canvasWidth: 1680,
    collapsed: saved.collapsed,
    preservePositions: true,
  });

  assert.equal(normalized.desktop.dashboard[0].collapsedHeight, 92);
});

test("widget labels have a smaller default and a persistent vertical resize handle", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.css", import.meta.url), "utf8"),
  ]);
  assert.equal(COLLAPSED_WIDGET_HEIGHT, 52);
  assert.match(source, /const labelResizeStart = \(event\) =>/);
  assert.match(source, /className="widget-label-resize-handle" onPointerDown=\{labelResizeStart\}/);
  assert.match(source, /onLabelResize=\{\(height\) => updateWidgetInstance\(instance\.id, \{ labelHeight: height, collapsedHeight: height \}\)\}/);
  assert.match(css, /\.workspace-widget-header\s*\{[^}]*height:\s*var\(--widget-label-height, 52px\);[^}]*min-height:\s*var\(--widget-label-height, 52px\);/s);
  assert.match(css, /\.widget-label-resize-handle\s*\{[^}]*cursor:\s*ns-resize;[^}]*touch-action:\s*none;/s);
});

test("widget labels can shrink to a compact header with proportionally smaller controls", async () => {
  const [source, layoutSource, css] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/workspaceLayout.js", import.meta.url), "utf8"),
    readFile(new URL("../src/App.css", import.meta.url), "utf8"),
  ]);
  assert.match(layoutSource, /export const MIN_WIDGET_LABEL_HEIGHT = 30;/);
  assert.match(source, /Math\.max\(MIN_WIDGET_LABEL_HEIGHT, Number\(instance\.labelHeight\)/);
  assert.match(source, /nextLabelHeight = Math\.min\(MAX_WIDGET_LABEL_HEIGHT, Math\.max\(MIN_WIDGET_LABEL_HEIGHT,/);
  assert.match(css, /width:\s*var\(--widget-header-control-size, 32px\);[^}]*height:\s*var\(--widget-header-control-size, 32px\);/s);
  assert.match(css, /font-size:\s*var\(--widget-header-title-size, 1rem\);/);
});

test("resizing a collapsed widget keeps content scaled from its expanded height", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(source, /const scaleHeight = collapsed \? Number\(instance\.height\) : nextHeight;/);
  assert.match(source, /\(scaleHeight - labelHeight - widgetBodyPadding\) \/ contentReferenceHeight/);
  assert.doesNotMatch(source, /\(nextHeight - labelHeight - widgetBodyPadding\) \/ contentReferenceHeight/);
});

test("workspace interaction exposes every resize edge and permits free widget overlap", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(source, /\["top", \{ top: true \}\].*\["bottom-left", \{ bottom: true, left: true \}\]/s);
  assert.match(source, /dragHandle\.setPointerCapture/);
  assert.doesNotMatch(source, /snapToEdges|another widget is blocking this direction/);
  assert.match(source, /x: Math\.max\(0, Math\.min\(maxX, initialX \+/);
  assert.match(source, /nextRect = aligned;/);
});

test("widget dragging snaps matching edges and centers to customizable alignment guides", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /const WORKSPACE_SNAP_THRESHOLD = 8;/);
  assert.match(source, /function snapWorkspaceRect\(desired, targets, maxX\)/);
  assert.match(source, /desired\.x \+ desired\.width \/ 2/);
  assert.match(source, /desired\.y \+ desired\.height \/ 2/);
  assert.match(source, /moveEvent\.altKey\s*\? \{ \.\.\.desired, guides: \[\] \}/);
  assert.match(source, /renderWorkspaceAlignmentGuides\(canvas, aligned\.guides\)/);
  assert.match(css, /\.workspace-alignment-guide\s*\{[^}]*background:\s*var\(--widget-snap-color, #ffd400\);/s);
  assert.match(css, /\.workspace-alignment-guide\.is-vertical\s*\{[^}]*width:\s*2px;/s);
  assert.match(css, /\.workspace-alignment-guide\.is-horizontal\s*\{[^}]*height:\s*2px;/s);
});

test("widget resizing snaps only the pulled edges and renders yellow guides", async () => {
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(source, /function snapWorkspaceResizeRect\(desired, edges, targets/);
  assert.match(source, /edges\.left[\s\S]*resized\.x = vertical\.value;[\s\S]*resized\.width = right - vertical\.value/);
  assert.match(source, /edges\.right[\s\S]*resized\.width = vertical\.value - desired\.x/);
  assert.match(source, /edges\.top[\s\S]*resized\.y = horizontal\.value;[\s\S]*resized\.height = bottom - horizontal\.value/);
  assert.match(source, /edges\.bottom[\s\S]*resized\.height = horizontal\.value - desired\.y/);
  assert.match(source, /snapWorkspaceResizeRect\(desired, edges, alignmentTargets/);
  assert.match(source, /renderWorkspaceAlignmentGuides\(canvas, aligned\.guides\)/);
});

test("every checklist widget view has an independent touch-friendly scroll area", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /instance\.type === "checklists" \? " is-checklists-widget"/);
  assert.match(css, /\.workspace-widget\.is-checklists-widget \.workspace-widget-scaled-content\s*\{[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;[^}]*touch-action:\s*pan-y;/s);
});

test("checklist checkboxes keep a visible fixed size and stable grid alignment", async () => {
  const css = await readFile(new URL("../src/App.css", import.meta.url), "utf8");
  assert.match(css, /\.standalone-checklist-items > li > input\[type="checkbox"\],[\s\S]*?appearance:\s*none;[^}]*width:\s*24px;[^}]*min-width:\s*24px;[^}]*height:\s*24px;[^}]*justify-self:\s*start;/s);
  assert.match(css, /\.standalone-checklist-items > li > input\[type="checkbox"\]:checked,[\s\S]*?background-image:\s*url\(/s);
});

test("checklist steps support an optional persisted information body", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /text: trimmed, body: ""/);
  assert.match(source, /className="checklist-item-details" defaultOpen=\{Boolean\(item\.body\)\}/);
  assert.match(source, /handleUpdateChecklistItem\(selectedList\.id, item\.id, "body", event\.target\.value\)/);
  assert.match(css, /\.checklist-item-details textarea \{[^}]*width: 100%;[^}]*resize: vertical;/);
  assert.match(css, /mobile-checklist-fullscreen \.checklist-item-details textarea \{[^}]*min-height: 96px;/);
});

test("global text scaling reaches button labels and large text reflows dense widgets", async () => {
  const css = await readFile(new URL("../src/App.css", import.meta.url), "utf8");
  assert.match(css, /button,\s*\[role="button"\]\s*\{[^}]*font-family:\s*inherit;[^}]*font-size:\s*inherit;/s);
  assert.match(css, /text-size-large[^}]*\.standalone-checklist-items li\s*\{[^}]*grid-template-columns:\s*auto auto minmax\(0, 1fr\) auto;/s);
  assert.match(css, /text-size-large[^}]*\.course-overview-breakdown\s*\{[^}]*repeat\(auto-fit,/s);
  assert.match(css, /text-size-large[^}]*\.account-dashboard-shortcuts\s*\{[^}]*repeat\(auto-fit,/s);
  assert.match(css, /text-size-large[^}]*\.reminder-suggestion\s*\{[^}]*flex-wrap:\s*wrap;/s);
});

test("mini calendar month rows dynamically fill the resized widget to its bottom edge", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /instance\.type === "mini-calendar" \? " is-mini-calendar-widget"/);
  assert.match(css, /\.workspace-widget\.is-mini-calendar-widget \.dashboard-calendar-card\s*\{[^}]*height:\s*100%;[^}]*flex-direction:\s*column;/s);
  assert.match(css, /\.workspace-widget\.is-mini-calendar-widget \.react-calendar__month-view > div\s*\{[^}]*align-items:\s*stretch !important;[^}]*height:\s*100%;/s);
  assert.match(css, /\.workspace-widget\.is-mini-calendar-widget \.react-calendar__month-view > div > div\s*\{[^}]*display:\s*flex;[^}]*height:\s*100%;[^}]*flex-direction:\s*column;/s);
  assert.match(css, /\.workspace-widget\.is-mini-calendar-widget \.react-calendar__month-view__days\s*\{[^}]*display:\s*grid !important;[^}]*flex:\s*1 1 0;[^}]*grid-auto-rows:\s*minmax\(0, 1fr\);/s);
  assert.doesNotMatch(css, /is-mini-calendar-widget \.react-calendar__month-view__days\s*\{[^}]*grid-template-rows:\s*repeat\(6/s);
  assert.match(css, /is-mini-calendar-widget \.react-calendar__month-view__days > \.react-calendar__tile\s*\{[^}]*width:\s*100% !important;[^}]*height:\s*100%;[^}]*place-items:\s*center;/s);
  assert.match(css, /is-mini-calendar-widget \.widget-resize-edge\.is-bottom::after/);
});

test("mini calendar has an independent internal bottom height handle", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /const startMiniCalendarHeightResize = \(event, instance\) =>/);
  assert.match(source, /className="mini-calendar-height-handle"[\s\S]*?startMiniCalendarHeightResize\(event, instance\)[\s\S]*?aria-label="Resize the calendar height"/);
  assert.match(source, /const interactionScale = canvasScale \* contentScale/);
  assert.match(source, /nextHeight = Math\.max\(minimumHeight, startHeight \+ \(moveEvent\.clientY - startY\) \/ interactionScale\)/);
  assert.match(source, /calendarArea\.style\.height = `\$\{nextHeight\}px`/);
  assert.match(source, /updateWidgetInstance\(instance\.id, \{ calendarContentHeight: nextHeight \}\)/);
  assert.doesNotMatch(source, /startMiniCalendarHeightResize[\s\S]*?updateWidgetInstance\(instance\.id, \{ height: nextHeight, expandedHeight: nextHeight \}\)/);
  assert.match(css, /\.mini-calendar-height-handle\s*\{[^}]*position:\s*absolute;[^}]*bottom:\s*1px;[^}]*cursor:\s*ns-resize;[^}]*touch-action:\s*none;/s);
  assert.match(source, /className=\{`mini-calendar-resizable-area\$\{Number\(instance\.calendarContentHeight\)/);
  assert.match(css, /\.mini-calendar-resizable-area\s*\{[^}]*display:\s*flex;[^}]*flex:\s*1;[^}]*flex-direction:\s*column;/s);
  assert.match(css, /\.mini-calendar-resizable-area\.has-custom-height\s*\{[^}]*flex:\s*0 0 auto;/s);
  assert.match(css, /\.mini-calendar-resizable-area > \.react-calendar\s*\{[^}]*flex:\s*1;/s);
  assert.match(css, /is-mini-calendar-widget\.has-fixed-overflow \.workspace-widget-body\s*\{[^}]*overflow-y:\s*auto;/s);
});

test("primary navigation stays compact without changing widget or signed-in headers", async () => {
  const css = await readFile(new URL("../src/App.css", import.meta.url), "utf8");
  assert.match(css, /\.App \.tab-row \.tab-button\s*\{[^}]*font-size:\s*12px !important;[^}]*text-size-adjust:\s*none;/s);
  assert.match(css, /\.App \.tab-row \.tab-button-icon\s*\{[^}]*font-size:\s*12px !important;/s);
  assert.doesNotMatch(css, /text-size-large[^}]*:where\([^)]*, \.tab-button(?:,|\))/);
  assert.doesNotMatch(css, /\.workspace-widget-header > strong\s*\{[^}]*font-size:\s*12px !important;/s);
  assert.doesNotMatch(css, /\.hero-card[^}]*font-size:\s*12px !important/s);
  assert.match(css, /@media \(min-width: 701px\)[\s\S]*?\.App \.tab-row\s*\{[^}]*flex-flow:\s*row nowrap;[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden;/s);
  assert.match(css, /@media \(min-width: 701px\)[\s\S]*?\.App \.tab-row \.tab-button\s*\{[^}]*min-height:\s*32px;[^}]*padding:\s*6px 8px;[^}]*white-space:\s*nowrap;/s);
  assert.match(css, /\.App \.tab-row \.account-action-group \.cloud-sync-status\s*\{[^}]*max-width:\s*112px;[^}]*text-overflow:\s*ellipsis;/s);
});

test("widget header titles use all space remaining between their controls", async () => {
  const css = await readFile(new URL("../src/App.css", import.meta.url), "utf8");
  assert.match(css, /\.workspace-widget-header\s*\{[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\) auto auto;/s);
  assert.match(css, /\.workspace-widget-header > strong\s*\{[^}]*position:\s*static;[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*max-width:\s*none;[^}]*text-overflow:\s*ellipsis;/s);
  assert.doesNotMatch(css, /\.workspace-widget-header > strong\s*\{[^}]*max-width:\s*calc\(100% - 170px\)/s);
  assert.match(css, /\.workspace-widget\.is-small-widget\.is-locked \.workspace-widget-header\s*\{[^}]*grid-template-columns:\s*28px minmax\(0, 1fr\) 28px 28px;/s);
});

test("expanded widgets do not repeat names already shown in their headers", async () => {
  const css = await readFile(new URL("../src/App.css", import.meta.url), "utf8");
  assert.match(css, /:is\(\.workspace-widget, \.detached-widget-content\) \.quick-match-header h2,[\s\S]*?:is\(\.workspace-widget, \.detached-widget-content\) \.checklist-gallery-toolbar h2,[\s\S]*?:is\(\.workspace-widget, \.detached-widget-content\) \.dashboard-calendar-header h2\s*\{\s*display:\s*none;/s);
  assert.doesNotMatch(css, /:is\(\.workspace-widget, \.detached-widget-content\) \.quick-match-header\s*\{[^}]*display:\s*none/s);
  assert.doesNotMatch(css, /:is\(\.workspace-widget, \.detached-widget-content\) \.checklist-gallery-toolbar\s*\{[^}]*display:\s*none/s);
  assert.doesNotMatch(css, /:is\(\.workspace-widget, \.detached-widget-content\) \.dashboard-calendar-header\s*\{[^}]*display:\s*none/s);
});

test("checklist cards use two-dimensional pointer reordering with a cursor ghost", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /const startChecklistCardReorder = \(event, sourceId\) =>/);
  assert.match(source, /cloneNode\(true\)[\s\S]*checklist-gallery-drag-ghost/);
  assert.match(source, /const insideGallery = galleryBounds[\s\S]*moveEvent\.clientX[\s\S]*moveEvent\.clientY/);
  assert.match(source, /const nearestTarget = insideGallery && !hoveredTarget[\s\S]*querySelectorAll\("\.checklist-gallery-card"\)[\s\S]*Math\.hypot/);
  assert.match(source, /const target = hoveredTarget \|\| nearestTarget/);
  assert.match(source, /horizontalDistance > verticalDistance[\s\S]*"left" : "right"[\s\S]*"above" : "below"/);
  assert.match(source, /setChecklists\(workingItems\)/);
  assert.match(css, /\.checklist-gallery-drag-ghost\s*\{[^}]*position:\s*fixed;[^}]*pointer-events:\s*none;[^}]*animation:\s*none !important;[^}]*transition:\s*none;/s);
  assert.match(source, /className="standalone-checklists checklist-gallery-view"/);
  assert.match(css, /\.checklist-gallery-view\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*flex-direction:\s*column;/s);
  assert.match(source, /galleryColumn:\s*nextColumn, galleryRow:\s*1/);
  assert.match(source, /const placeChecklistCard = \(items, sourceId, targetId, placement\) =>/);
  assert.match(source, /const hasCardToRight = positioned\.some/);
  assert.match(source, /hasCardToRight && list\.galleryRow === source\.galleryRow && list\.galleryColumn > source\.galleryColumn/);
  assert.match(source, /!hasCardToRight && list\.galleryColumn === source\.galleryColumn && list\.galleryRow > source\.galleryRow/);
  assert.match(source, /const target = withoutSourceGap\.find/);
  assert.match(source, /placement === "above" \|\| placement === "below"/);
  assert.match(source, /gridColumn:\s*galleryPosition\.column, gridRow:\s*galleryPosition\.row/);
  assert.match(css, /\.checklist-gallery\s*\{[^}]*display:\s*grid;[^}]*grid-auto-columns:\s*minmax\(150px, 220px\);[^}]*grid-auto-rows:\s*110px;[^}]*overflow:\s*auto;/s);
  assert.match(css, /\.checklist-gallery-card\.drop-above/);
  assert.match(css, /\.checklist-gallery-card\.drop-below/);
  assert.match(css, /\.checklist-gallery-card\.drop-left/);
  assert.match(css, /\.checklist-gallery-card\.drop-right/);
});

test("small widgets keep useful dimensions and scale content continuously", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.css", import.meta.url), "utf8"),
  ]);
  assert.equal(MIN_WIDGET_WIDTH, 220);
  assert.equal(getWidgetMinimumExpandedHeight("recommended"), 240);
  assert.equal(getWidgetMinimumExpandedHeight("quick-match"), 220);
  assert.match(source, /availableBodyWidth = Math\.max\(1, Number\(instance\.width\) - widgetBodyPadding\)/);
  assert.match(source, /Math\.max\(0\.35, availableBodyWidth \/ contentReferenceWidth\)/);
  assert.doesNotMatch(source, /Math\.max\(0\.55, (?:Number\(instance\.width\)|nextWidth)/);
  assert.match(css, /\.workspace-widget\.is-small-widget \.workspace-widget-header > strong\s*\{[^}]*position:\s*static;[^}]*text-overflow:\s*ellipsis;/s);
});

test("recommended widget scrolls vertically without visible scrollbars or horizontal movement", async () => {
  const [appSource, cssSource] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.css", import.meta.url), "utf8"),
  ]);
  assert.match(appSource, /instance\.type === "recommended" \? " is-recommended-widget"/);
  assert.match(cssSource, /\.workspace-widget\.is-recommended-widget \.workspace-widget-body\s*\{[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;[^}]*scrollbar-width:\s*none;/s);
  assert.match(cssSource, /\.workspace-widget\.is-recommended-widget \.workspace-widget-body::-webkit-scrollbar\s*\{\s*display:\s*none;/);
});

test("display-only statistic widgets center their text without scrollbars", async () => {
  const cssSource = await readFile(new URL("../src/App.css", import.meta.url), "utf8");
  assert.match(cssSource, /\.workspace-widget\.is-display-only \.workspace-widget-body\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*center;[^}]*overflow:\s*hidden;/s);
  assert.match(cssSource, /\.workspace-widget\.is-display-only \.workspace-widget-scaled-content\s*\{[^}]*place-items:\s*center;/s);
  assert.match(cssSource, /\.portable-stat\s*\{[^}]*place-content:\s*center;[^}]*place-items:\s*center;[^}]*text-align:\s*center;/s);
});

test("expanding a widget restores its expanded height", () => {
  const saved = createDefaultWorkspaceLayout();
  saved.desktop.dashboard = [
    { id: "expanded-a", type: "recommended", x: 0, y: 0, width: 320, height: 260, expandedHeight: 260 },
  ];

  const collapsed = normalizeWorkspaceLayout(saved, {
    mode: "desktop",
    canvasWidth: 900,
    collapsed: { recommended: true },
  });
  const expanded = normalizeWorkspaceLayout(collapsed, {
    mode: "desktop",
    canvasWidth: 900,
    activeId: "expanded-a",
    reflowActiveWithNeighbors: true,
    collapsed: { recommended: false },
  });
  const widget = expanded.desktop.dashboard.find((item) => item.id === "expanded-a");

  assert.equal(widget.height, 260);
});

test("normalization repairs a mini calendar saved at collapsed height", () => {
  const saved = createDefaultWorkspaceLayout();
  const calendar = saved.desktop.dashboard.find((item) => item.type === "mini-calendar");
  calendar.height = 58;
  delete calendar.expandedHeight;
  saved.userCustomized = true;

  const normalized = normalizeWorkspaceLayout(saved, {
    mode: "desktop",
    canvasWidth: 1680,
    preservePositions: true,
  });
  const repaired = normalized.desktop.dashboard.find((item) => item.type === "mini-calendar");

  assert.equal(repaired.height, 430);
  assert.equal(repaired.expandedHeight, 430);
});

test("collapsed normalization preserves a widget's expanded size", () => {
  const saved = createDefaultWorkspaceLayout();
  saved.desktop.dashboard = [
    { id: "calendar-a", type: "mini-calendar", x: 0, y: 0, width: 494, height: 410 },
  ];
  saved.userCustomized = true;

  const normalized = normalizeWorkspaceLayout(saved, {
    mode: "desktop",
    canvasWidth: 900,
    collapsed: { "mini-calendar": true },
    preservePositions: true,
  });
  const calendar = normalized.desktop.dashboard[0];

  assert.equal(calendar.height, 410);
  assert.equal(calendar.expandedHeight, 410);
});

test("a resized checklist replaces its stale expanded height and collision footprint", () => {
  const saved = createDefaultWorkspaceLayout();
  saved.desktop.dashboard = [
    { id: "checklists-a", type: "checklists", x: 0, y: 0, width: 540, height: 300, expandedHeight: 520 },
    { id: "calendar-a", type: "mini-calendar", x: 558, y: 0, width: 494, height: 460, expandedHeight: 460 },
  ];
  saved.userCustomized = true;

  const normalized = normalizeWorkspaceLayout(saved, {
    mode: "desktop",
    canvasWidth: 1200,
    preservePositions: true,
  });
  const checklist = normalized.desktop.dashboard.find((item) => item.id === "checklists-a");

  assert.equal(checklist.height, 300);
  assert.equal(checklist.expandedHeight, 300);

  const collapsed = setWidgetCollapsedState(normalized, "desktop", "checklists-a", true);
  const expanded = setWidgetCollapsedState(collapsed, "desktop", "checklists-a", false);
  const reopenedChecklist = expanded.desktop.dashboard.find((item) => item.id === "checklists-a");

  assert.equal(reopenedChecklist.height, 300);
  assert.equal(reopenedChecklist.expandedHeight, 300);
});

test("widget expanded-height rules repair unusable sizes without changing valid custom sizes", () => {
  const saved = createDefaultWorkspaceLayout();
  saved.desktop.dashboard = [
    { id: "tiny-checklists", type: "checklists", x: 0, y: 0, width: 320, height: 90 },
    { id: "custom-recommended", type: "recommended", x: 400, y: 0, width: 320, height: 275 },
  ];
  saved.userCustomized = true;

  const normalized = normalizeWorkspaceLayout(saved, {
    mode: "desktop",
    canvasWidth: 900,
    preservePositions: true,
  });

  assert.equal(normalized.desktop.dashboard[0].height, getWidgetMinimumExpandedHeight("checklists"));
  assert.equal(normalized.desktop.dashboard[1].height, 275);
});

test("expanding legacy collapsed widgets restores a usable default height", () => {
  const saved = createDefaultWorkspaceLayout();
  saved.desktop.dashboard = [
    { id: "legacy-calendar", type: "mini-calendar", x: 0, y: 0, width: 494, height: 58 },
  ];

  const expanded = setWidgetCollapsedState(saved, "desktop", "legacy-calendar", false);
  const calendar = expanded.desktop.dashboard[0];

  assert.equal(calendar.height, 430);
  assert.equal(calendar.expandedHeight, 430);
});

test("collapsing and expanding a widget preserves its size and nearby widgets", () => {
  const saved = createDefaultWorkspaceLayout();
  saved.desktop.dashboard = [
    { id: "widget-a", type: "recommended", x: 0, y: 0, width: 320, height: 260 },
    { id: "widget-b", type: "quick-match", x: 0, y: 80, width: 240, height: 180 },
  ];

  const collapsed = setWidgetCollapsedState(saved, "desktop", "widget-a", true);
  const collapsedItem = collapsed.desktop.dashboard.find((item) => item.id === "widget-a");
  const neighbor = collapsed.desktop.dashboard.find((item) => item.id === "widget-b");
  assert.equal(collapsedItem.expandedHeight, 260);
  assert.equal(collapsedItem.height, 260);
  assert.equal(neighbor.x, 0);
  assert.equal(neighbor.y, 80);

  const expanded = setWidgetCollapsedState(collapsed, "desktop", "widget-a", false);
  const expandedItem = expanded.desktop.dashboard.find((item) => item.id === "widget-a");
  const expandedNeighbor = expanded.desktop.dashboard.find((item) => item.id === "widget-b");
  assert.equal(expandedItem.height, 260);
  assert.equal(expandedItem.expandedHeight, 260);
  assert.equal(expandedNeighbor.x, 0);
  assert.equal(expandedNeighbor.y, 80);
});

test("collapse toggles preserve existing widget positions", () => {
  const saved = createDefaultWorkspaceLayout();
  saved.desktop.dashboard = [
    { id: "widget-a", type: "recommended", x: 120, y: 40, width: 320, height: 260 },
    { id: "widget-b", type: "quick-match", x: 460, y: 40, width: 240, height: 180 },
  ];

  const collapsed = normalizeWorkspaceLayout(saved, {
    mode: "desktop",
    canvasWidth: 900,
    collapsed: { recommended: true },
    preservePositions: true,
  });
  const widgetA = collapsed.desktop.dashboard.find((item) => item.id === "widget-a");
  const widgetB = collapsed.desktop.dashboard.find((item) => item.id === "widget-b");

  assert.equal(widgetA.x, 120);
  assert.equal(widgetA.y, 40);
  assert.equal(widgetB.x, 460);
  assert.equal(widgetB.y, 40);
});

test("lock changes keep widget positions stable", () => {
  const previous = createDefaultWorkspaceLayout();
  const current = structuredClone(previous);
  current.locked.desktop = true;

  assert.equal(shouldPreserveWidgetPositions(previous, current, "desktop"), true);
});

test("active widget collision resolution preserves the active widget and moves the other one", () => {
  const saved = createDefaultWorkspaceLayout();
  saved.desktop.dashboard = saved.desktop.dashboard.map((item, index) => (
    index > 1 ? { ...item, hidden: true } : item
  ));
  const stationaryId = saved.desktop.dashboard[0].id;
  const activeId = saved.desktop.dashboard[1].id;
  saved.desktop.dashboard[0] = {
    ...saved.desktop.dashboard[0],
    x: 0,
    y: 0,
    width: 300,
    height: 200,
  };
  saved.desktop.dashboard[1] = {
    ...saved.desktop.dashboard[1],
    x: 280,
    y: 0,
    width: 300,
    height: 200,
  };

  const normalized = normalizeWorkspaceLayout(saved, { mode: "desktop", canvasWidth: 900, activeId, reflowActiveWithNeighbors: true });
  const stationary = normalized.desktop.dashboard.find((item) => item.id === stationaryId);
  const active = normalized.desktop.dashboard.find((item) => item.id === activeId);

  assert.equal(active.x, 280);
  assert.equal(active.y, 0);
  assert.ok(stationary.x === 0 && stationary.y > 0 || stationary.x > 0 || stationary.y > 0);
});

test("active widget keeps its exact position when it is already open", () => {
  const saved = createDefaultWorkspaceLayout();
  saved.desktop.dashboard = saved.desktop.dashboard.map((item, index) => (
    index > 1 ? { ...item, hidden: true } : item
  ));
  const activeId = saved.desktop.dashboard[1].id;
  saved.desktop.dashboard[0] = {
    ...saved.desktop.dashboard[0],
    x: 0,
    y: 0,
    width: 300,
    height: 200,
  };
  saved.desktop.dashboard[1] = {
    ...saved.desktop.dashboard[1],
    x: 360,
    y: 70,
    width: 300,
    height: 200,
  };

  const normalized = normalizeWorkspaceLayout(saved, { mode: "desktop", canvasWidth: 900, activeId });
  const active = normalized.desktop.dashboard.find((item) => item.id === activeId);

  assert.equal(active.x, 360);
  assert.equal(active.y, 70);
});

test("pasted assignment lists preserve course headings and remove bullets", () => {
  assert.deepEqual(
    preparePastedAssignmentLines("Biology:\n- Lab report due July 9\n2. Chapter quiz due July 12"),
    [
      { text: "Lab report due July 9", courseHint: "Biology" },
      { text: "Chapter quiz due July 12", courseHint: "Biology" },
    ],
  );
});

test("syllabus scanning keeps dated work and ignores policy prose", () => {
  const text = "Late work loses ten percent.\nBiology:\nSept 8 - Lab report due\nOffice hours are Monday at noon.\nOct 2 - Midterm exam";
  assert.equal(findLikelySyllabusAssignments(text), "Biology:\nSept 8 - Lab report due\nOct 2 - Midterm exam");
  assert.equal(getSyllabusFileKind({ name: "course.docx" }), "docx");
});

test("assignment countdowns use days normally and hours on the due date", () => {
  const now = new Date("2026-07-06T10:00:00");
  assert.equal(formatAssignmentCountdown(new Date("2026-07-08T15:00:00"), now), "2 days left");
  assert.equal(formatAssignmentCountdown(new Date("2026-07-06T15:30:00"), now), "5h 30m left today");
  assert.equal(formatAssignmentCountdown(new Date("2026-07-06T09:00:00"), now), "Overdue by 1h 0m");
  assert.equal(getAssignmentCountdownTone(new Date("2026-07-06T15:30:00"), now), "today");
});

test("weekly calendar honors Sunday and Monday starts", () => {
  const anchor = new Date(2026, 6, 8);
  assert.equal(getWeekDates(anchor, "sunday")[0].getDay(), 0);
  assert.equal(getWeekDates(anchor, "monday")[0].getDay(), 1);
  assert.equal(shiftCalendarWeek(anchor, 1).getDate(), 15);
  assert.equal(isSameCalendarDay(anchor, new Date(2026, 6, 8, 23, 59)), true);
});

test("voice undo permanently locks once work starts", () => {
  const untouched = { createdByVoice: true, status: "todo", isCompleted: false };
  assert.equal(canUndoVoiceCreation(untouched), true);
  const started = { ...lockVoiceUndo(untouched), status: "inProgress" };
  assert.equal(canUndoVoiceCreation(started), false);
  assert.equal(canUndoVoiceCreation({ ...started, status: "todo" }), false);
});

test("recommended plan explains urgency and totals known workload", () => {
  const tasks = [
    { id: "essay", title: "Essay", due: new Date("2026-07-10T23:00:00"), bucket: "Due Tomorrow", priority: "MED", estimatedMinutes: 120, status: "todo" },
    { id: "quiz", title: "Quiz", due: new Date("2026-07-09T12:00:00"), bucket: "Due Today", priority: "HIGH", estimatedMinutes: 25, status: "inProgress", subtasks: [{ isDone: true }, { isDone: false }] },
    { id: "reading", title: "Reading", due: null, bucket: "No Due Date", priority: "LOW", estimatedMinutes: "", status: "todo" },
  ];

  const ranked = rankRecommendedTasks(tasks, {
    getDueBucket: (task) => task.bucket,
    getDeadline: (task) => task.due,
    getStatus: (task) => task.status,
  });
  const workload = summarizeRecommendationWorkload(ranked);

  assert.equal(ranked[0].task.id, "quiz");
  assert.deepEqual(ranked[0].reasons, ["Due today", "High priority", "In progress", "Short win"]);
  assert.equal(workload.knownMinutes, 145);
  assert.equal(workload.unknownCount, 1);
});

test("quick match presets keep defaults and sanitize custom times", () => {
  assert.deepEqual(
    getQuickMatchPresets([90, "120", 30, 90, 0, -5, 1441, 22.5, "bad"]),
    [15, 30, 45, 60, 90, 120],
  );
  assert.deepEqual(
    getQuickMatchCustomPresets([60, 120, 90, 120]),
    [90, 120],
  );
});

test("quick match picks fitting work first and urgent work when nothing fits", () => {
  const tasks = [
    { id: "urgent", title: "Urgent", bucket: "Due Today", due: new Date("2026-07-09T15:00:00"), priority: "HIGH", estimatedMinutes: 90, status: "todo" },
    { id: "small", title: "Small", bucket: "Due Later", due: new Date("2026-08-01T15:00:00"), priority: "LOW", estimatedMinutes: 20, status: "todo" },
  ];
  const options = {
    getDueBucket: (task) => task.bucket,
    getDeadline: (task) => task.due,
    getStatus: (task) => task.status,
  };

  assert.equal(rankQuickMatchCandidates(tasks, 30, options)[0].task.id, "small");
  assert.equal(rankQuickMatchCandidates(tasks, 10, options)[0].task.id, "urgent");
});
