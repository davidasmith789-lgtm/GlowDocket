export const WORKSPACE_LAYOUT_VERSION = 1;

export const PROTECTED_WIDGETS = new Set([
  "add-assignment",
  "checklists",
  "todo-master",
  "in-progress-master",
  "completed-master",
]);

const REMOVED_WIDGET_TYPES = new Set(["school-guide"]);

const OLD_DEFAULT_DASHBOARD_MARKERS = [
  ["recommended", 0, 0],
  ["quick-match", 658, 0],
  ["mini-calendar", 1036, 0],
  ["school-guide", 468, 611],
];

export const DEFAULT_WIDGET_LAYOUT = {
  dashboard: [
    { type: "recommended", width: 680, height: 460, desktopX: 0, desktopY: 0 },
    { type: "quick-match", width: 470, height: 460, desktopX: 698, desktopY: 0 },
    { type: "mini-calendar", width: 494, height: 460, desktopX: 1186, desktopY: 0 },
    { type: "stat-active", width: 240, height: 145, desktopX: 0, desktopY: 478 },
    { type: "stat-today", width: 240, height: 145, desktopX: 258, desktopY: 478 },
    { type: "stat-overdue", width: 240, height: 145, desktopX: 516, desktopY: 478 },
    { type: "stat-workload", width: 240, height: 145, desktopX: 774, desktopY: 478 },
    { type: "reminders", width: 648, height: 390, desktopX: 1032, desktopY: 478 },
    { type: "course-overview", width: 540, height: 430, desktopX: 0, desktopY: 886 },
    { type: "checklists", width: 540, height: 520, desktopX: 558, desktopY: 886 },
    { type: "course-colors", width: 564, height: 460, desktopX: 1116, desktopY: 886 },
    { type: "add-assignment", width: 1680, height: 620, desktopX: 0, desktopY: 1424 },
  ],
  todo: [
    { type: "todo-master", width: 1050, height: 760, desktopX: 315, desktopY: 0 },
    ...["overdue", "today", "tomorrow", "this-week", "next-week", "later", "no-date"].map((bucket) => ({ type: `todo-bucket-${bucket}`, width: 480, height: 430, hidden: true })),
  ],
  inProgress: [
    { type: "in-progress-master", width: 1050, height: 760, desktopX: 315, desktopY: 0 },
    ...["overdue", "today", "tomorrow", "this-week", "next-week", "later", "no-date"].map((bucket) => ({ type: `in-progress-bucket-${bucket}`, width: 480, height: 430, hidden: true })),
  ],
  completed: [{ type: "completed-master", width: 1050, height: 760, desktopX: 315, desktopY: 0 }],
  settings: [{ type: "settings-master", width: 1180, height: 820, desktopX: 250, desktopY: 0 }],
};

const makeInstance = (item, index) => ({
  id: `${item.type}-${index}`,
  ...item,
  hidden: item.hidden ?? false,
});

const getCanvasWidth = (mode, override) => {
  const fallback = mode === "mobile" ? 720 : 1680;
  return Math.max(320, Number.isFinite(override) ? override : fallback);
};

const getGap = (mode) => mode === "mobile" ? 12 : 18;

const finiteNumber = (value, fallback) => (
  Number.isFinite(Number(value)) ? Number(value) : fallback
);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const getEffectiveWidgetHeight = (item, collapsed = {}) => {
  const isCollapsed = Boolean(collapsed?.[item.type]);
  if (isCollapsed) return 58;
  const explicitExpandedHeight = finiteNumber(item.expandedHeight, Number.NaN);
  return Number.isFinite(explicitExpandedHeight)
    ? Math.max(58, explicitExpandedHeight)
    : Math.max(58, finiteNumber(item.height, 320));
};

const closeTo = (value, expected, tolerance = 6) => (
  Math.abs(finiteNumber(value, Number.NaN) - expected) <= tolerance
);

function withoutRemovedWidgets(items) {
  return Array.isArray(items)
    ? items.filter((item) => !REMOVED_WIDGET_TYPES.has(item.type))
    : [];
}

function isOldDefaultDashboard(items) {
  if (!Array.isArray(items)) return false;
  return OLD_DEFAULT_DASHBOARD_MARKERS.every(([type, expectedX, expectedY]) => {
    const item = items.find((candidate) => candidate.type === type);
    return item && closeTo(item.x, expectedX) && closeTo(item.y, expectedY);
  });
}

function isDefaultLikeCenteredTab(tab, items) {
  const primaryTypes = {
    todo: "todo-master",
    inProgress: "in-progress-master",
    completed: "completed-master",
    settings: "settings-master",
  };
  const primary = Array.isArray(items)
    ? items.find((item) => item.type === primaryTypes[tab])
    : null;
  return Boolean(primary) && closeTo(primary.x, 0) && closeTo(primary.y, 0);
}

const rectsOverlap = (a, b, gap) => (
  a.x < b.x + b.width + gap &&
  a.x + a.width + gap > b.x &&
  a.y < b.y + b.height + gap &&
  a.y + a.height + gap > b.y
);

function findNearestOpenPosition(item, obstacles, canvasWidth, gap) {
  const maxX = Math.max(0, canvasWidth - item.width);
  const desiredX = clamp(item.x, 0, maxX);
  const desiredY = Math.max(0, item.y);
  const xValues = new Set([desiredX, 0, maxX]);
  const yValues = new Set([desiredY, 0]);

  for (const obstacle of obstacles) {
    xValues.add(obstacle.x - item.width - gap);
    xValues.add(obstacle.x + obstacle.width + gap);
    xValues.add(obstacle.x);
    yValues.add(obstacle.y - item.height - gap);
    yValues.add(obstacle.y + obstacle.height + gap);
    yValues.add(obstacle.y);
  }

  const candidates = [];
  for (const rawX of xValues) {
    candidates.push({ x: clamp(rawX, 0, maxX), y: desiredY });
  }
  for (const rawY of yValues) {
    candidates.push({ x: desiredX, y: Math.max(0, rawY) });
  }
  for (const rawX of xValues) {
    for (const rawY of yValues) {
      candidates.push({ x: clamp(rawX, 0, maxX), y: Math.max(0, rawY) });
    }
  }

  let best = null;
  const seen = new Set();
  for (const candidate of candidates) {
    const key = `${Math.round(candidate.x)}:${Math.round(candidate.y)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const positioned = { ...item, x: candidate.x, y: candidate.y };
    if (obstacles.some((obstacle) => rectsOverlap(positioned, obstacle, gap))) continue;

    const horizontalMove = Math.abs(candidate.x - desiredX);
    const verticalMove = Math.abs(candidate.y - desiredY);
    const score = horizontalMove + verticalMove * 1.08;
    if (
      !best ||
      score < best.score ||
      (score === best.score && candidate.y < best.y) ||
      (score === best.score && candidate.y === best.y && candidate.x < best.x)
    ) {
      best = { ...candidate, score };
    }
  }

  if (best) return { ...item, x: best.x, y: best.y, xRatio: canvasWidth > 0 ? best.x / canvasWidth : 0 };

  const fallbackY = obstacles.reduce((bottom, obstacle) => Math.max(bottom, obstacle.y + obstacle.height + gap), desiredY);
  return { ...item, x: desiredX, y: fallbackY, xRatio: canvasWidth > 0 ? desiredX / canvasWidth : 0 };
}

function resolveWidgetX(item, canvasWidth, width, explicitX = undefined) {
  const maxX = Math.max(0, canvasWidth - width);
  const previousX = finiteNumber(item.x, Number.NaN);
  const previousRatio = finiteNumber(item.xRatio, Number.NaN);
  const shouldUseRatio = Number.isFinite(previousRatio) && (!Number.isFinite(previousX) || previousX > canvasWidth || previousX + width > canvasWidth + 18);
  if (shouldUseRatio) return clamp(previousRatio * canvasWidth, 0, maxX);
  if (Number.isFinite(explicitX)) return clamp(explicitX, 0, maxX);
  if (Number.isFinite(previousX)) return clamp(previousX, 0, maxX);
  return 0;
}

function normalizeItemPosition(item, canvasWidth, fallbackWidth = 320) {
  const width = clamp(finiteNumber(item.width, fallbackWidth), 190, canvasWidth);
  const x = resolveWidgetX(item, canvasWidth, width);
  return {
    ...item,
    width,
    x,
    xRatio: canvasWidth > 0 ? x / canvasWidth : 0,
  };
}

function packVisibleWidgets(items, mode, options = {}) {
  const canvasWidth = getCanvasWidth(mode, options.canvasWidth);
  const gap = getGap(mode);
  const collapsed = options.collapsed || {};
  const sanitized = items.map((item, index) => {
    const normalized = normalizeItemPosition(item, canvasWidth, 320);
    const height = getEffectiveWidgetHeight(item, collapsed);
    return {
      ...normalized,
      height,
      y: Math.max(0, finiteNumber(item.y, 0)),
      zIndex: Math.max(1, finiteNumber(item.zIndex, 1)),
      __order: index,
    };
  });

  if (options.preservePositions) {
    return sanitized.map((item) => {
      const cleanItem = { ...item };
      delete cleanItem.__order;
      return cleanItem;
    });
  }

  const active = options.activeId
    ? sanitized.find((item) => item.id === options.activeId && !item.hidden)
    : null;

  if (active && options.reflowActiveWithNeighbors) {
    const placed = [active];
    const packedById = new Map([[active.id, active]]);
    const visible = sanitized
      .filter((item) => !item.hidden && item.id !== active.id)
      .sort((a, b) => a.y - b.y || a.x - b.x || a.__order - b.__order);

    for (const item of visible) {
      const next = findNearestOpenPosition(item, placed, canvasWidth, gap);
      next.xRatio = canvasWidth > 0 ? next.x / canvasWidth : 0;
      placed.push(next);
      packedById.set(next.id, next);
    }

    return sanitized.map((item) => {
      const packed = packedById.get(item.id) || item;
      const cleanItem = { ...packed };
      delete cleanItem.__order;
      return cleanItem;
    });
  }

  if (active) {
    return sanitized.map((item) => {
      const cleanItem = { ...item };
      delete cleanItem.__order;
      return cleanItem;
    });
  }

  const placed = [];
  const packedById = new Map();
  const visible = sanitized
    .filter((item) => !item.hidden)
    .sort((a, b) => a.y - b.y || a.x - b.x || a.__order - b.__order);

  for (const item of visible) {
    const next = findNearestOpenPosition(item, placed, canvasWidth, gap);
    next.xRatio = canvasWidth > 0 ? next.x / canvasWidth : 0;
    placed.push(next);
    packedById.set(next.id, next);
  }

  return sanitized.map((item) => {
    const packed = packedById.get(item.id) || item;
    const cleanItem = { ...packed };
    delete cleanItem.__order;
    return cleanItem;
  });
}

export function shouldPreserveWidgetPositions(previousLayout, currentLayout, mode = "desktop") {
  const previousItems = Object.values(previousLayout?.[mode] || {}).flat();
  const currentItems = Object.values(currentLayout?.[mode] || {}).flat();

  if (previousItems.length !== currentItems.length) return false;

  return previousItems.every((item, index) => {
    const nextItem = currentItems[index];
    if (!nextItem) return false;
    return item.id === nextItem.id && item.type === nextItem.type;
  });
}

export function setWidgetCollapsedState(layout, mode, instanceId, collapsed) {
  const next = structuredClone(layout);
  const activeItem = Object.values(next[mode] || {})
    .flat()
    .find((item) => item.id === instanceId);

  if (!activeItem) return next;

  const explicitExpandedHeight = finiteNumber(activeItem.expandedHeight, Number.NaN);
  const fallbackExpandedHeight = Number.isFinite(explicitExpandedHeight)
    ? explicitExpandedHeight
    : finiteNumber(activeItem.height, 320);
  const nextExpandedHeight = Number.isFinite(fallbackExpandedHeight)
    ? Math.max(58, fallbackExpandedHeight)
    : 320;

  next.collapsed = { ...(next.collapsed || {}), [activeItem.type]: Boolean(collapsed) };

  for (const tab of Object.keys(next[mode] || {})) {
    next[mode][tab] = next[mode][tab].map((item) => item.id === instanceId
      ? {
          ...item,
          expandedHeight: nextExpandedHeight,
          height: nextExpandedHeight,
        }
      : item);
  }

  return next;
}

function addMissingPositions(items, mode, options = {}) {
  const canvasWidth = getCanvasWidth(mode, options.canvasWidth);
  const gap = mode === "mobile" ? 12 : 18;
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  const positioned = items.map((item) => {
    const width = Math.min(Number(item.width) || 320, canvasWidth);
    const height = Number(item.height) || 320;
    if (x > 0 && x + width > canvasWidth) {
      x = 0;
      y += rowHeight + gap;
      rowHeight = 0;
    }
    const explicitX = Number.isFinite(item.x)
      ? item.x
      : mode === "desktop" && Number.isFinite(item.desktopX)
        ? item.desktopX
        : undefined;
    const explicitY = Number.isFinite(item.y)
      ? item.y
      : mode === "desktop" && Number.isFinite(item.desktopY)
        ? item.desktopY
        : undefined;
    const resolvedX = resolveWidgetX(item, canvasWidth, width, explicitX);
    const positioned = {
      ...item,
      x: resolvedX,
      xRatio: canvasWidth > 0 ? resolvedX / canvasWidth : 0,
      y: Number.isFinite(explicitY) ? explicitY : y,
      zIndex: Number.isFinite(item.zIndex) ? item.zIndex : 1,
    };
    x += width + gap;
    rowHeight = Math.max(rowHeight, height);
    return positioned;
  });
  return packVisibleWidgets(positioned, mode, options);
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

export function normalizeWorkspaceLayout(value, options = {}) {
  const defaults = createDefaultWorkspaceLayout();

  if (!value || value.version !== WORKSPACE_LAYOUT_VERSION) {
    return defaults;
  }

  const userCustomized = Boolean(value.userCustomized);
  const modes = options.mode ? [options.mode] : ["desktop", "mobile"];
  const collapsedState = options.collapsed ?? value?.collapsed ?? {};

  for (const mode of modes) {
    value[mode] = value[mode] || {};

    const existingTypes = new Set(
      Object.values(value?.[mode] || {})
        .flat()
        .filter((item) => !REMOVED_WIDGET_TYPES.has(item.type))
        .map((item) => item.type),
    );

    for (const tab of Object.keys(DEFAULT_WIDGET_LAYOUT)) {
      if (!Array.isArray(value?.[mode]?.[tab])) {
        value[mode] = {
          ...(value[mode] || {}),
          [tab]: defaults[mode][tab],
        };

        defaults[mode][tab].forEach((item) => existingTypes.add(item.type));
        continue;
      }

      const shouldRunOldLayoutMigration =
        !userCustomized &&
        !options.preservePositions &&
        (
          (mode === "desktop" &&
            tab === "dashboard" &&
            isOldDefaultDashboard(value[mode][tab])) ||
          (mode === "desktop" &&
            isDefaultLikeCenteredTab(tab, value[mode][tab]))
        );

      if (shouldRunOldLayoutMigration) {
        value[mode][tab] = defaults[mode][tab];
        defaults[mode][tab].forEach((item) => existingTypes.add(item.type));
        continue;
      }

      value[mode][tab] = withoutRemovedWidgets(value[mode][tab]);
      value[mode][tab].forEach((item) => existingTypes.add(item.type));

      const missing = defaults[mode][tab].filter(
        (item) => !existingTypes.has(item.type),
      );

      if (missing.length > 0) {
        value[mode][tab] = [...value[mode][tab], ...missing];
        missing.forEach((item) => existingTypes.add(item.type));
      }

      value[mode][tab] = addMissingPositions(value[mode][tab], mode, {
        ...options,
        collapsed: collapsedState,
        preservePositions: userCustomized || options.preservePositions,
      });
    }
  }

  return {
    ...defaults,
    ...value,
    userCustomized,
    collapsed: value.collapsed || {},
    locked: {
      ...defaults.locked,
      ...(value.locked || {}),
    },
  };
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
