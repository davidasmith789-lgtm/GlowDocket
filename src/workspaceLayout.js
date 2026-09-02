/*
 * Workspace layout domain model.
 *
 * Widgets are persisted separately for desktop, Chromebook, and mobile modes. This module
 * creates defaults, repairs older saved layouts, enforces usable sizes, and
 * resolves placement without depending on React or the browser DOM.
 */
export const DEFAULT_LAYOUT_VERSION = 6;
export const WORKSPACE_LAYOUT_VERSION = DEFAULT_LAYOUT_VERSION;

export const PROTECTED_WIDGETS = new Set([
  "add-assignment",
  "checklists",
  "todo-master",
  "in-progress-master",
  "completed-master",
]);

// Removed widget types are filtered from every saved tab during normalization,
// which also keeps them out of the widget library and hidden-widget tray.
const REMOVED_WIDGET_TYPES = new Set(["school-guide", "settings-master"]);

export const COLLAPSED_WIDGET_HEIGHT = 52;
export const MIN_WIDGET_LABEL_HEIGHT = 30;
export const MAX_WIDGET_LABEL_HEIGHT = 140;
export const MIN_WIDGET_WIDTH = 220;
const LEGACY_COLLAPSED_WIDGET_HEIGHT = 58;

const WIDGET_MIN_EXPANDED_HEIGHTS = {
  "mini-calendar": 360,
  "add-assignment": 360,
  recommended: 240,
  "quick-match": 220,
  checklists: 260,
  "course-colors": 260,
  reminders: 240,
  "course-overview": 240,
  "todo-master": 260,
  "in-progress-master": 260,
  "completed-master": 260,
};

export function getWidgetMinimumExpandedHeight(type) {
  if (type?.includes("-bucket-")) return 220;
  return WIDGET_MIN_EXPANDED_HEIGHTS[type] || 140;
}

const OLD_DEFAULT_DASHBOARD_MARKERS = [
  ["recommended", 0, 0],
  ["quick-match", 658, 0],
  ["mini-calendar", 1036, 0],
  ["school-guide", 468, 611],
];

export const DEFAULT_DESKTOP_LAYOUT = {
  dashboard: [
    { type: "recommended", width: 520, height: 430, desktopX: 0, xRatio: 0, desktopY: 0, zIndex: 337 },
    { type: "quick-match", width: 520, height: 430, desktopX: 558, xRatio: 558 / 1680, desktopY: 0, zIndex: 340 },
    { type: "mini-calendar", width: 520, height: 430, desktopX: 1116, xRatio: 1116 / 1680, desktopY: 0, zIndex: 349 },
    { type: "stat-active", width: 380, height: 145, desktopX: 0, xRatio: 0, desktopY: 448, zIndex: 336 },
    { type: "stat-today", width: 380, height: 145, desktopX: 414, xRatio: 414 / 1680, desktopY: 448, zIndex: 331 },
    { type: "stat-overdue", width: 380, height: 145, desktopX: 828, xRatio: 828 / 1680, desktopY: 448, zIndex: 332 },
    { type: "stat-workload", width: 380, height: 145, desktopX: 1242, xRatio: 1242 / 1680, desktopY: 448, zIndex: 335 },
    { type: "reminders", width: 520, height: 440, desktopX: 0, xRatio: 0, desktopY: 611, zIndex: 353 },
    { type: "course-overview", width: 520, height: 440, desktopX: 558, xRatio: 558 / 1680, desktopY: 611, zIndex: 355 },
    { type: "checklists", width: 520, height: 440, desktopX: 1116, xRatio: 1116 / 1680, desktopY: 611, zIndex: 31 },
    { type: "add-assignment", width: 1078, height: 620, desktopX: 0, xRatio: 0, desktopY: 1069, zIndex: 356 },
    { type: "course-colors", width: 520, height: 620, desktopX: 1116, xRatio: 1116 / 1680, desktopY: 1069, zIndex: 357, newUserOnly: true },
    { type: "todo-master", width: 520, height: 620, desktopX: 0, xRatio: 0, desktopY: 1707, zIndex: 358, newUserOnly: true },
    { type: "in-progress-master", width: 520, height: 620, desktopX: 558, xRatio: 558 / 1680, desktopY: 1707, zIndex: 359, newUserOnly: true },
    { type: "completed-master", width: 520, height: 620, desktopX: 1116, xRatio: 1116 / 1680, desktopY: 1707, zIndex: 360, newUserOnly: true },
  ],
  todo: [
    { type: "todo-master", width: 1238, height: 650, desktopX: 418, xRatio: 418 / 1680, desktopY: 0, zIndex: 358 },
    { type: "course-colors", width: 400, height: 500, desktopX: 0, xRatio: 0, desktopY: 0, zIndex: 322 },
    { type: "add-assignment", width: 1238, height: 620, desktopX: 418, xRatio: 418 / 1680, desktopY: 668, zIndex: 326 },
    { type: "reminders", width: 400, height: 500, desktopX: 0, xRatio: 0, desktopY: 518, zIndex: 357 },
  ],
  inProgress: [
    { type: "in-progress-master", width: 1138, height: 680, desktopX: 518, xRatio: 518 / 1680, desktopY: 0, zIndex: 359 },
    { type: "checklists", width: 500, height: 520, desktopX: 0, xRatio: 0, desktopY: 0, zIndex: 31 },
  ],
  completed: [
    { type: "completed-master", width: 1138, height: 620, desktopX: 518, xRatio: 518 / 1680, desktopY: 0, zIndex: 360 },
    { type: "checklists", width: 500, height: 520, desktopX: 0, xRatio: 0, desktopY: 0, zIndex: 202 },
  ],
  settings: [{ type: "course-colors", width: 418.5, height: 460, xRatio: 0.0775353033, desktopY: 830.5, hidden: true, zIndex: 45 }],
};

// Mobile keeps its existing compact, sequential defaults. Only desktop adopts
// the finalized monitor arrangement above.
export const DEFAULT_WIDGET_LAYOUT = DEFAULT_DESKTOP_LAYOUT;

export const DESKTOP_LAYOUT_WIDTH_PRESETS = [1280, 1440, 1680, 1920, 2160, 2560, 3200];

export function getDesktopLayoutPresetWidth(availableWidth) {
  const width = Math.max(960, Number(availableWidth) || 1680);
  return DESKTOP_LAYOUT_WIDTH_PRESETS.reduce((closest, preset) => (
    Math.abs(preset - width) < Math.abs(closest - width) ? preset : closest
  ), DESKTOP_LAYOUT_WIDTH_PRESETS[0]);
}

function createSizedDesktopLayout(canvasWidth) {
  const scale = canvasWidth / 1680;
  return Object.fromEntries(Object.entries(DEFAULT_DESKTOP_LAYOUT).map(([tab, items]) => [
    tab,
    items.map((item) => ({
      ...item,
      width: Math.round(Number(item.width) * scale),
      desktopX: Number.isFinite(item.desktopX) ? Math.round(item.desktopX * scale) : item.desktopX,
    })),
  ]));
}

const makeInstance = (item, index, tab = "workspace") => ({
  id: `${item.type}-${tab}-${index}`,
  ...item,
  hidden: item.hidden ?? false,
});

const MOBILE_DEFAULT_HEIGHTS = {
  recommended: 400,
  "quick-match": 390,
  "mini-calendar": 410,
  "stat-active": 118,
  "stat-today": 118,
  "stat-overdue": 118,
  "stat-workload": 118,
  reminders: 350,
  "course-overview": 380,
  checklists: 440,
  "course-colors": 400,
  "add-assignment": 560,
  "todo-master": 620,
  "in-progress-master": 620,
  "completed-master": 620,
};

const CHROMEBOOK_DEFAULT_HEIGHTS = {
  recommended: 420, "quick-match": 400, "mini-calendar": 410,
  "stat-active": 125, "stat-today": 125, "stat-overdue": 125, "stat-workload": 125,
  reminders: 360, "course-overview": 390, checklists: 430, "course-colors": 390,
  "add-assignment": 560, "todo-master": 560, "in-progress-master": 560, "completed-master": 560,
};

const CHROMEBOOK_DEFAULT_POSITIONS = {
  dashboard: {
    recommended: { x: 0, y: 0, width: 540 }, "quick-match": { x: 558, y: 0, width: 540 },
    "mini-calendar": { x: 0, y: 438, width: 540 }, checklists: { x: 558, y: 418, width: 540 },
    "stat-active": { x: 0, y: 866, width: 230 }, "stat-today": { x: 248, y: 866, width: 230 },
    "stat-overdue": { x: 496, y: 866, width: 230 }, "stat-workload": { x: 744, y: 866, width: 230 },
    reminders: { x: 0, y: 1009, width: 540 }, "course-overview": { x: 558, y: 1009, width: 540 },
    "add-assignment": { x: 0, y: 1417, width: 540 },
  },
  todo: {
    "todo-master": { x: 0, y: 0, width: 540 }, "course-colors": { x: 558, y: 0, width: 540 },
    "add-assignment": { x: 0, y: 578, width: 540 }, reminders: { x: 558, y: 408, width: 540 },
  },
  inProgress: { "in-progress-master": { x: 0, y: 0, width: 720 }, checklists: { x: 738, y: 0, width: 404 } },
  completed: { "completed-master": { x: 0, y: 0, width: 720 }, checklists: { x: 738, y: 0, width: 404 } },
};

/** Create compact new-layout geometry without rewriting a saved mobile layout. */
const getModeDefaultItem = (item, mode, tab) => {
  if (mode === "mobile") return {
      ...item,
      width: Math.min(Number(item.width) || 360, 420),
      height: item.type?.includes("-bucket-")
        ? 360
        : MOBILE_DEFAULT_HEIGHTS[item.type] || Math.min(Number(item.height) || 320, 420),
    };
  if (mode === "chromebook") return {
    ...item,
    ...(CHROMEBOOK_DEFAULT_POSITIONS[tab]?.[item.type] || {}),
    width: CHROMEBOOK_DEFAULT_POSITIONS[tab]?.[item.type]?.width || (item.type?.startsWith("stat-") ? 230 : Math.min(Number(item.width) || 480, 540)),
    height: item.type?.includes("-bucket-") ? 390 : CHROMEBOOK_DEFAULT_HEIGHTS[item.type] || Math.min(Number(item.height) || 360, 440),
    desktopX: undefined,
    desktopY: undefined,
    xRatio: CHROMEBOOK_DEFAULT_POSITIONS[tab]?.[item.type] ? CHROMEBOOK_DEFAULT_POSITIONS[tab][item.type].x / 1160 : undefined,
  };
  return item;
};

const getCanvasWidth = (mode, override) => {
  const fallback = mode === "mobile" ? 720 : mode === "chromebook" ? 1160 : 1680;
  const measuredWidth = Number(override);
  return Math.max(320, Number.isFinite(measuredWidth) && measuredWidth > 0 ? measuredWidth : fallback);
};

const getGap = (mode) => mode === "mobile" ? 12 : 18;

const finiteNumber = (value, fallback) => (
  Number.isFinite(Number(value)) ? Number(value) : fallback
);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const getDefaultWidgetHeight = (type) => {
  for (const items of Object.values(DEFAULT_DESKTOP_LAYOUT)) {
    const match = items.find((item) => item.type === type);
    if (match) return match.height;
  }
  return 320;
};

const getExpandedWidgetHeight = (item) => {
  const minimum = getWidgetMinimumExpandedHeight(item.type);
  const explicitExpandedHeight = finiteNumber(item.expandedHeight, Number.NaN);
  const savedHeight = finiteNumber(item.height, Number.NaN);
  const candidate = Number.isFinite(savedHeight) && savedHeight > LEGACY_COLLAPSED_WIDGET_HEIGHT
    ? savedHeight
    : explicitExpandedHeight;

  if (!Number.isFinite(candidate) || candidate <= COLLAPSED_WIDGET_HEIGHT) {
    return Math.max(minimum, getDefaultWidgetHeight(item.type));
  }

  return Math.max(minimum, candidate);
};

const getEffectiveWidgetHeight = (item, collapsed = {}) => {
  const isCollapsed = Boolean(collapsed?.[item.type]);
  return isCollapsed
    ? Math.max(MIN_WIDGET_LABEL_HEIGHT, finiteNumber(item.collapsedHeight, COLLAPSED_WIDGET_HEIGHT))
    : getExpandedWidgetHeight(item);
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
  const width = clamp(finiteNumber(item.width, fallbackWidth), MIN_WIDGET_WIDTH, canvasWidth);
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
  const expandedHeight = getExpandedWidgetHeight(item);
  const layoutHeight = getEffectiveWidgetHeight({ ...item, height: expandedHeight }, collapsed);

  if (options.preservePositions) {
    const preserveUnmeasuredPositions = options.preserveUnmeasuredPositions === true;
    const width = preserveUnmeasuredPositions
      ? Math.max(MIN_WIDGET_WIDTH, finiteNumber(item.width, 320))
      : clamp(finiteNumber(item.width, 320), MIN_WIDGET_WIDTH, canvasWidth);
    const maxX = Math.max(0, canvasWidth - width);
    const rawX = finiteNumber(item.x, 0);
    const x = preserveUnmeasuredPositions ? Math.max(0, rawX) : clamp(rawX, 0, maxX);
    const savedRatio = finiteNumber(item.xRatio, Number.NaN);

    return {
      ...item,
      width,
      x,
      xRatio: Number.isFinite(savedRatio)
        ? savedRatio
        : canvasWidth > 0
          ? x / canvasWidth
          : 0,
      height: layoutHeight,
      __expandedHeight: expandedHeight,
      y: Math.max(0, finiteNumber(item.y, 0)),
      zIndex: Math.max(1, finiteNumber(item.zIndex, 1)),
      __order: index,
    };
  }

  const normalized = normalizeItemPosition(item, canvasWidth, 320);

  return {
    ...normalized,
    height: layoutHeight,
    __expandedHeight: expandedHeight,
    y: Math.max(0, finiteNumber(item.y, 0)),
    zIndex: Math.max(1, finiteNumber(item.zIndex, 1)),
    __order: index,
  };
});

if (options.preservePositions) {
  return sanitized.map((item) => {
    const cleanItem = { ...item, height: item.__expandedHeight, expandedHeight: item.__expandedHeight };
    delete cleanItem.__expandedHeight;
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
      const cleanItem = { ...packed, height: packed.__expandedHeight, expandedHeight: packed.__expandedHeight };
      delete cleanItem.__expandedHeight;
      delete cleanItem.__order;
      return cleanItem;
    });
  }

  if (active) {
    return sanitized.map((item) => {
      const cleanItem = { ...item, height: item.__expandedHeight, expandedHeight: item.__expandedHeight };
      delete cleanItem.__expandedHeight;
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
    const cleanItem = { ...packed, height: packed.__expandedHeight, expandedHeight: packed.__expandedHeight };
    delete cleanItem.__expandedHeight;
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

  const nextExpandedHeight = getExpandedWidgetHeight(activeItem);

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
    const preserveUnmeasuredPositions = options.preserveUnmeasuredPositions === true;
    const width = preserveUnmeasuredPositions
      ? Number(item.width) || 320
      : Math.min(Number(item.width) || 320, canvasWidth);
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
    const resolvedX = preserveUnmeasuredPositions
      ? Math.max(0, Number.isFinite(explicitX) ? explicitX : 0)
      : resolveWidgetX(item, canvasWidth, width, explicitX);
    const positioned = {
      ...item,
      x: resolvedX,
      xRatio: preserveUnmeasuredPositions && Number.isFinite(item.xRatio)
        ? item.xRatio
        : canvasWidth > 0 ? resolvedX / canvasWidth : 0,
      y: Number.isFinite(explicitY) ? explicitY : y,
      zIndex: Number.isFinite(item.zIndex) ? item.zIndex : 1,
    };
    x += width + gap;
    rowHeight = Math.max(rowHeight, height);
    return positioned;
  });
  return packVisibleWidgets(positioned, mode, options);
}

export function createDefaultWorkspaceLayout(options = {}) {
  const desktopCanvasWidth = getDesktopLayoutPresetWidth(options.desktopCanvasWidth);
  const sizedDesktopLayout = createSizedDesktopLayout(desktopCanvasWidth);
  const makeMode = (mode) => Object.fromEntries(
    Object.entries(mode === "desktop" ? sizedDesktopLayout : DEFAULT_DESKTOP_LAYOUT).map(([tab, items]) => [
      tab,
      addMissingPositions(
        items.map((item, index) => makeInstance(getModeDefaultItem(item, mode, tab), index, tab)),
        mode,
        mode === "desktop" ? { canvasWidth: desktopCanvasWidth } : {},
      ),
    ]),
  );

  return {
    version: WORKSPACE_LAYOUT_VERSION,
    desktop: makeMode("desktop"),
    chromebook: makeMode("chromebook"),
    mobile: makeMode("mobile"),
    collapsed: {},
    locked: { desktop: true, chromebook: false, mobile: false },
    savedLayouts: { desktop: {}, chromebook: {}, mobile: {} },
    defaultDesktopCanvasWidth: desktopCanvasWidth,
  };
}

const normalizeSavedLayouts = (savedLayouts) => {
  const normalized = { desktop: {}, chromebook: {}, mobile: {} };
  for (const mode of Object.keys(normalized)) {
    for (const tab of Object.keys(DEFAULT_DESKTOP_LAYOUT)) {
      const presets = savedLayouts?.[mode]?.[tab];
      if (!Array.isArray(presets)) continue;
      normalized[mode][tab] = presets.slice(0, 20).flatMap((preset) => {
        if (!preset || typeof preset.id !== "string" || !preset.id || typeof preset.name !== "string" || !Array.isArray(preset.items)) return [];
        const name = preset.name.trim().slice(0, 60);
        if (!name) return [];
        return [{ ...preset, name, items: structuredClone(preset.items) }];
      });
    }
  }
  return normalized;
};

export function normalizeWorkspaceLayout(value, options = {}) {
  const defaults = createDefaultWorkspaceLayout();

  const savedVersion = Number(value?.version);
  if (!value || !Number.isInteger(savedVersion) || savedVersion < 1 || savedVersion > WORKSPACE_LAYOUT_VERSION) {
    return defaults;
  }

  const userCustomized = Boolean(value.userCustomized);
  const modes = options.mode ? [options.mode] : ["desktop", "chromebook", "mobile"];
  const collapsedState = options.collapsed ?? value?.collapsed ?? {};

  // Version 5 deploys the corrected, roomier dashboard to existing accounts
  // exactly once. Other tabs and all non-layout account data remain untouched.
  if (savedVersion < 5) {
    for (const mode of modes) {
      value[mode] = value[mode] || {};
      value[mode].dashboard = structuredClone(defaults[mode].dashboard);
    }
  }

  // Version 6 gives the To Do tab a narrow utility column and a wide working
  // column. This migration changes only widget geometry on that tab.
  if (savedVersion < 6) {
    for (const mode of modes) {
      value[mode] = value[mode] || {};
      value[mode].todo = structuredClone(defaults[mode].todo);
    }
  }

  for (const mode of modes) {
    value[mode] = value[mode] || {};

    const allowedTypes = new Set(Object.values(DEFAULT_DESKTOP_LAYOUT).flat().map((item) => item.type));
    const seenIds = new Set();
    for (const tab of Object.keys(value[mode])) {
      if (!Array.isArray(value[mode][tab]) || !Object.hasOwn(DEFAULT_DESKTOP_LAYOUT, tab)) {
        delete value[mode][tab];
        continue;
      }
      value[mode][tab] = value[mode][tab].filter((item) => {
        if (!item || !allowedTypes.has(item.type) || REMOVED_WIDGET_TYPES.has(item.type)) return false;
        const id = typeof item.id === "string" && item.id ? item.id : `${item.type}-${tab}`;
        if (seenIds.has(id)) return false;
        seenIds.add(id);
        item.id = id;
        return true;
      });
    }

    for (const tab of Object.keys(DEFAULT_DESKTOP_LAYOUT)) {
      if (!Array.isArray(value?.[mode]?.[tab])) {
        value[mode] = {
          ...(value[mode] || {}),
          [tab]: defaults[mode][tab],
        };

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
        continue;
      }

      value[mode][tab] = withoutRemovedWidgets(value[mode][tab]);
      const existingTypes = new Set(value[mode][tab].map((item) => item.type));
      const missing = defaults[mode][tab].filter(
        (item) => !existingTypes.has(item.type) && (!userCustomized || !item.newUserOnly),
      );

      if (missing.length > 0) {
        value[mode][tab] = [...value[mode][tab], ...missing];
      }

      value[mode][tab] = addMissingPositions(value[mode][tab], mode, {
        ...options,
        collapsed: collapsedState,
        preservePositions: options.reflowForCanvas
          ? false
          : userCustomized || options.preservePositions,
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
    savedLayouts: normalizeSavedLayouts(value.savedLayouts),
    version: WORKSPACE_LAYOUT_VERSION,
  };
}

export function saveNamedWorkspaceLayout(layout, mode, tab, rawName) {
  const name = String(rawName || "").trim().slice(0, 60);
  if (!name || !Array.isArray(layout?.[mode]?.[tab])) return layout;
  const next = structuredClone(layout);
  next.savedLayouts = normalizeSavedLayouts(next.savedLayouts);
  const presets = next.savedLayouts[mode][tab] || [];
  const existingIndex = presets.findIndex((preset) => preset.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  const now = new Date().toISOString();
  const existing = existingIndex >= 0 ? presets[existingIndex] : null;
  const preset = {
    id: existing?.id || globalThis.crypto?.randomUUID?.() || `layout-${Date.now()}`,
    name,
    items: structuredClone(next[mode][tab]),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  if (existingIndex >= 0) presets[existingIndex] = preset;
  else presets.push(preset);
  next.savedLayouts[mode][tab] = presets.slice(-20);
  return next;
}

export function applyNamedWorkspaceLayout(layout, mode, tab, presetId) {
  const preset = layout?.savedLayouts?.[mode]?.[tab]?.find((item) => item.id === presetId);
  if (!preset || !Array.isArray(preset.items)) return layout;
  const next = structuredClone(layout);
  next[mode][tab] = structuredClone(preset.items);
  return next;
}

export function deleteNamedWorkspaceLayout(layout, mode, tab, presetId) {
  if (!layout?.savedLayouts?.[mode]?.[tab]?.some((item) => item.id === presetId)) return layout;
  const next = structuredClone(layout);
  next.savedLayouts[mode][tab] = next.savedLayouts[mode][tab].filter((item) => item.id !== presetId);
  return next;
}

export function createShareableWorkspaceLayout({ items, name, mode, tab, screenWidth, screenHeight }) {
  return {
    format: "glowdocket-widget-layout", version: 1,
    name: String(name || "Shared layout").trim().slice(0, 60) || "Shared layout",
    mode, tab,
    screen: { width: Math.max(1, Math.round(Number(screenWidth) || 1)), height: Math.max(1, Math.round(Number(screenHeight) || 1)) },
    items: structuredClone(Array.isArray(items) ? items : []),
    exportedAt: new Date().toISOString(),
  };
}

export function importShareableWorkspaceLayout(value, targetWidth, targetHeight) {
  if (value?.format !== "glowdocket-widget-layout" || value.version !== 1 || !Array.isArray(value.items)) throw new Error("This is not a valid GlowDocket widget layout file.");
  const sourceWidth = Math.max(1, Number(value.screen?.width) || Number(targetWidth) || 1);
  const sourceHeight = Math.max(1, Number(value.screen?.height) || Number(targetHeight) || 1);
  const width = Math.max(1, Number(targetWidth) || sourceWidth);
  const height = Math.max(1, Number(targetHeight) || sourceHeight);
  const scaleX = width / sourceWidth;
  const scaleY = height / sourceHeight;
  const differentScreen = Math.abs(width - sourceWidth) > 1 || Math.abs(height - sourceHeight) > 1;
  const items = value.items.map((item) => {
    const scaledWidth = Math.min(width, Math.max(Math.min(MIN_WIDGET_WIDTH, width), (Number(item.width) || MIN_WIDGET_WIDTH) * scaleX));
    const scaledX = Math.min(Math.max(0, (Number(item.x) || Number(item.desktopX) || 0) * scaleX), Math.max(0, width - scaledWidth));
    const scaledY = Math.max(0, Math.round((Number(item.y) || Number(item.desktopY) || 0) * scaleY));
    return { ...structuredClone(item), id: `${item.type || "widget"}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`, x: Math.round(scaledX), desktopX: Math.round(scaledX), xRatio: width > 0 ? scaledX / width : 0, y: scaledY, desktopY: scaledY, width: Math.round(scaledWidth), height: Math.max(item.collapsed ? COLLAPSED_WIDGET_HEIGHT : getWidgetMinimumExpandedHeight(item.type), Math.round((Number(item.height) || getWidgetMinimumExpandedHeight(item.type)) * scaleY)) };
  });
  return { items, name: String(value.name || "Imported layout").slice(0, 60), differentScreen, sourceScreen: value.screen };
}

export function placeWidget(layout, mode, targetTab, widget, { copy = false } = {}) {
  const next = structuredClone(layout);
  const sourceTab = Object.keys(next[mode]).find((tab) =>
    next[mode][tab].some((item) => item.id === widget.id),
  );
  if (!copy && sourceTab === targetTab) return next;
  if (!copy && sourceTab) {
    next[mode][sourceTab] = next[mode][sourceTab].filter((item) => item.id !== widget.id);
  }
  next[mode][targetTab] = next[mode][targetTab].filter((item) => item.type !== widget.type);
  const visibleDestinationWidgets = next[mode][targetTab].filter((item) => !item.hidden);
  const destinationBottom = visibleDestinationWidgets.reduce(
    (bottom, item) => Math.max(bottom, finiteNumber(item.y, 0) + getEffectiveWidgetHeight(item, next.collapsed)),
    0,
  );
  const nextY = visibleDestinationWidgets.length > 0 ? destinationBottom + getGap(mode) : 0;
  next[mode][targetTab].push({
    ...widget,
    id: copy ? `${widget.type}-${crypto.randomUUID()}` : widget.id,
    hidden: false,
    x: 0,
    xRatio: 0,
    y: nextY,
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
