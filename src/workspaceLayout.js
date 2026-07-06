export const WORKSPACE_LAYOUT_VERSION = 1;

export const PROTECTED_WIDGETS = new Set([
  "add-assignment",
  "checklists",
  "todo-master",
  "in-progress-master",
  "completed-master",
]);

export const DEFAULT_WIDGET_LAYOUT = {
  dashboard: [
    { type: "quick-match", width: 270, height: 390 },
    { type: "stat-active", width: 210, height: 145 },
    { type: "stat-today", width: 210, height: 145 },
    { type: "stat-overdue", width: 210, height: 145 },
    { type: "stat-workload", width: 210, height: 145 },
    { type: "recommended", width: 760, height: 430 },
    { type: "mini-calendar", width: 310, height: 430 },
    { type: "checklists", width: 370, height: 500 },
    { type: "course-overview", width: 370, height: 360 },
    { type: "school-guide", width: 370, height: 330 },
    { type: "reminders", width: 420, height: 470 },
    { type: "add-assignment", width: 760, height: 650 },
    { type: "course-colors", width: 370, height: 500 },
  ],
  todo: [
    { type: "todo-master", width: 1050, height: 760 },
    ...["overdue", "today", "tomorrow", "this-week", "next-week", "later", "no-date"].map((bucket) => ({ type: `todo-bucket-${bucket}`, width: 480, height: 430, hidden: true })),
  ],
  inProgress: [
    { type: "in-progress-master", width: 1050, height: 760 },
    ...["overdue", "today", "tomorrow", "this-week", "next-week", "later", "no-date"].map((bucket) => ({ type: `in-progress-bucket-${bucket}`, width: 480, height: 430, hidden: true })),
  ],
  completed: [{ type: "completed-master", width: 1050, height: 760 }],
  settings: [{ type: "settings-master", width: 1180, height: 820 }],
};

const makeInstance = (item, index) => ({
  id: `${item.type}-${index}`,
  ...item,
  hidden: item.hidden ?? false,
});

function addMissingPositions(items, mode) {
  const canvasWidth = mode === "mobile" ? 720 : 1600;
  const gap = mode === "mobile" ? 12 : 18;
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  return items.map((item) => {
    const width = Math.min(Number(item.width) || 320, canvasWidth);
    const height = Number(item.height) || 320;
    if (x > 0 && x + width > canvasWidth) {
      x = 0;
      y += rowHeight + gap;
      rowHeight = 0;
    }
    const positioned = {
      ...item,
      x: Number.isFinite(item.x) ? item.x : x,
      xRatio: Number.isFinite(item.xRatio)
        ? item.xRatio
        : Math.max(0, Math.min(1, (Number.isFinite(item.x) ? item.x : x) / canvasWidth)),
      y: Number.isFinite(item.y) ? item.y : y,
      zIndex: Number.isFinite(item.zIndex) ? item.zIndex : 1,
    };
    x += width + gap;
    rowHeight = Math.max(rowHeight, height);
    return positioned;
  });
}

export function createDefaultWorkspaceLayout() {
  const makeMode = (mode) => Object.fromEntries(
    Object.entries(DEFAULT_WIDGET_LAYOUT).map(([tab, items]) => [
      tab,
      addMissingPositions(items.map(makeInstance), mode),
    ]),
  );

  return {
    version: WORKSPACE_LAYOUT_VERSION,
    desktop: makeMode("desktop"),
    mobile: makeMode("mobile"),
    collapsed: {},
    locked: { desktop: false, mobile: false },
  };
}

export function normalizeWorkspaceLayout(value) {
  const defaults = createDefaultWorkspaceLayout();
  if (!value || value.version !== WORKSPACE_LAYOUT_VERSION) return defaults;

  for (const mode of ["desktop", "mobile"]) {
    const existingTypes = new Set(Object.values(value?.[mode] || {}).flat().map((item) => item.type));
    for (const tab of Object.keys(DEFAULT_WIDGET_LAYOUT)) {
      if (!Array.isArray(value?.[mode]?.[tab])) {
        value[mode] = { ...(value[mode] || {}), [tab]: defaults[mode][tab] };
        defaults[mode][tab].forEach((item) => existingTypes.add(item.type));
        continue;
      }
      const missing = defaults[mode][tab].filter((item) => !existingTypes.has(item.type));
      if (missing.length > 0) {
        value[mode][tab] = [...value[mode][tab], ...missing];
        missing.forEach((item) => existingTypes.add(item.type));
      }
      value[mode][tab] = addMissingPositions(value[mode][tab], mode);
    }
  }
  return { ...defaults, ...value, collapsed: value.collapsed || {}, locked: { ...defaults.locked, ...(value.locked || {}) } };
}

export function placeWidget(layout, mode, targetTab, widget, { copy = false } = {}) {
  const next = structuredClone(layout);
  const sourceTab = Object.keys(next[mode]).find((tab) =>
    next[mode][tab].some((item) => item.id === widget.id),
  );
  if (!copy && sourceTab) {
    next[mode][sourceTab] = next[mode][sourceTab].filter((item) => item.id !== widget.id);
  }
  next[mode][targetTab] = next[mode][targetTab].filter((item) => item.type !== widget.type);
  next[mode][targetTab].push({
    ...widget,
    id: copy ? `${widget.type}-${crypto.randomUUID()}` : widget.id,
    hidden: false,
  });
  return next;
}

export function canHideWidget(layout, mode, widgetType) {
  if (!PROTECTED_WIDGETS.has(widgetType)) return true;
  const visibleCount = Object.values(layout[mode] || {})
    .flat()
    .filter((item) => item.type === widgetType && !item.hidden).length;
  return visibleCount > 1;
}
