import test from "node:test";
import assert from "node:assert/strict";
import { formatChecklistCountdown, getChecklistDeadline } from "../src/checklistUtils.js";
import { preparePastedAssignmentLines } from "../src/bulkImportUtils.js";
import { findLikelySyllabusAssignments, getSyllabusFileKind } from "../src/syllabusImport.js";
import { formatAssignmentCountdown, getAssignmentCountdownTone } from "../src/assignmentCountdown.js";
import { getWeekDates, isSameCalendarDay, shiftCalendarWeek } from "../src/calendarWeekUtils.js";
import { getQuickMatchCustomPresets, getQuickMatchPresets, rankQuickMatchCandidates, rankRecommendedTasks, summarizeRecommendationWorkload } from "../src/recommendationUtils.js";
import { canUndoVoiceCreation, lockVoiceUndo } from "../src/voiceTaskUtils.js";
import { DEFAULT_LAYOUT_VERSION, canHideWidget, createDefaultWorkspaceLayout, getWidgetMinimumExpandedHeight, normalizeWorkspaceLayout, placeWidget, setWidgetCollapsedState, shouldPreserveWidgetPositions } from "../src/workspaceLayout.js";

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

test("placing a duplicate replaces the same widget type on the target tab", () => {
  const layout = createDefaultWorkspaceLayout();
  const widget = layout.desktop.dashboard.find((item) => item.type === "quick-match");
  const next = placeWidget(layout, "desktop", "todo", widget, { copy: true });
  assert.equal(next.desktop.todo.filter((item) => item.type === "quick-match").length, 1);
  assert.equal(next.desktop.dashboard.filter((item) => item.type === "quick-match").length, 1);
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

test("version 1 customized layouts upgrade without losing their positions", () => {
  const saved = createDefaultWorkspaceLayout();
  saved.version = 1;
  saved.userCustomized = true;
  saved.desktop.dashboard[0].x = 123;
  const normalized = normalizeWorkspaceLayout(saved, { preservePositions: true });
  assert.equal(normalized.version, DEFAULT_LAYOUT_VERSION);
  assert.equal(normalized.desktop.dashboard[0].x, 123);
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

test("desktop dashboard defaults use the full landscape canvas", () => {
  const layout = createDefaultWorkspaceLayout();
  const rightEdge = Math.max(...layout.desktop.dashboard.filter((item) => !item.hidden).map((item) => item.x + item.width));
  assert.ok(rightEdge >= 1600);
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

  assert.equal(repaired.height, 428);
  assert.equal(repaired.expandedHeight, 428);
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

  assert.equal(calendar.height, 428);
  assert.equal(calendar.expandedHeight, 428);
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
