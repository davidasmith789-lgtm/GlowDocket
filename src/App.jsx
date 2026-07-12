import { useState, useEffect, useLayoutEffect, useRef } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import "./App.css";
import { SpeedInsights } from "@vercel/speed-insights/react"
import { Analytics } from "@vercel/analytics/react";
import {
  formatChecklistCountdown,
  formatChecklistDeadline,
  getChecklistDeadline,
} from "./checklistUtils.js";
import {
  canHideWidget,
  COLLAPSED_WIDGET_HEIGHT,
  createDefaultWorkspaceLayout,
  getWidgetMinimumExpandedHeight,
  normalizeWorkspaceLayout,
  placeWidget,
  setWidgetCollapsedState,
} from "./workspaceLayout.js";
import { preparePastedAssignmentLines } from "./bulkImportUtils.js";
import { formatAssignmentCountdown, getAssignmentCountdownTone } from "./assignmentCountdown.js";
import { getWeekDates, isSameCalendarDay, shiftCalendarWeek } from "./calendarWeekUtils.js";
import { canUndoVoiceCreation, lockVoiceUndo } from "./voiceTaskUtils.js";
import {
  getQuickMatchReason,
  getQuickMatchCustomPresets,
  getQuickMatchPresets,
  getValidEstimate,
  rankQuickMatchCandidates,
  rankRecommendedTasks,
  summarizeRecommendationWorkload,
} 
from "./recommendationUtils.js";
import {
  getTutorialStorageKey,
} from "./onboardingUtils.js";
import { buildDesiredReminders, EXTERNAL_PUSH_CLIENT_ENABLED, getPushDeviceStorageKey, shouldUseOpenAppFallback } from "./externalReminderUtils.js";
import { cancelAllExternalReminders, cancelExternalReminder, reconcileExternalReminders, replaceExternalReminder, retryPendingExternalCleanup, scheduleExternalReminder, sendExternalReminderTest } from "./externalReminderClient.js";
import { summarizeDeadlineConfidence } from "./deadlineConfidenceUtils.js";
import { canSendReminderTest, clearReminderFailure, createReminderActionGuard, deriveReminderUserStatus, formatReminderLeadTime, friendlyReminderError, getAssignmentReminderIndicator, getReminderStatusCopy, shouldShowReminderSuggestion, shouldShowRepairReminderSync } from "./reminderUxUtils.js";
/*
 * TASKCABINET APPLICATION MAP
 *
 * This file owns the browser-local application shell and the UI workflows that
 * still share state: accounts, assignments, courses, settings, widgets,
 * calendars, checklists, imports, attachments, and archive/trash behavior.
 * Pure calculations live in the neighboring *Utils.js modules so they can be
 * tested without rendering React. Workspace placement and migration rules live
 * in workspaceLayout.js; keep persistence-compatible changes there.
 */
const DEFAULT_USER_SETTINGS = {
  showPriority: true,
  showRepeat: true,
  showEstimatedMinutes: true,
  showAssignmentFiles: true,
  showAssignmentLinks: true,
  showAssignmentChecklistSteps: true,
  defaultCategory: "School",
  defaultPriority: "MED",
  defaultEstimatedMinutes: "",
  defaultRepeat: "NONE",
  defaultDueTime: "11:00",
  defaultDueAmPm: "PM",
  autoCompleteChecklist: true,
  confirmBeforeTrash: false,
  notificationsEnabled: false,
  externalPushEnabled: false,
  reminderMinutes: 60,
  reminderSuggestionDismissed: false,
  dashboardReminderHours: 24,
  quickMatchCustomPresets: [],
  schoolLevel: "high",
  textSize: "medium",
  fontFamily: "sans",
  interfaceDensity: "comfortable",
  taskActionLayout: "wrap",
  showHeaderSubtitle: true,
  reduceMotion: false,
  calendarWeekStartsOn: "sunday",
  calendarViewMode: "month",
  showNeighboringMonth: true,
  showCalendarCycleLabels: true,
  showCalendarTaskDots: true,
  checklistTimesEnabled: false,
  settingsSectionOrder: ["personalization", "assignments", "checklists", "calendar", "reminders", "cycle", "storage"],
  cycleDayNames: ["A Day", "B Day"],
  cycleAnchorDate: "",
  courseCycleDays: {},
  customColors: {},
  activeColorThemeId: "light",
  customColorThemes: [],
  deletedColorThemeIds: [],
};

const ACCOUNTS_STORAGE_KEY = "taskacadia_accounts";
const AUTH_USER_STORAGE_KEY = "taskacadia_authenticated_user";
const LOGIN_COLORS_STORAGE_KEY = "taskacadia_login_colors";
const TUTORIAL_SLIDES = [
  { title: "Welcome to TaskCabinet", copy: "Your assignments, plans, and progress stay together in one calm workspace.", visual: "welcome" },
  { title: "Capture work quickly", copy: "Add a title and due date, then include priority, time, files, links, or checklist steps when useful.", visual: "add" },
  { title: "Know what to do next", copy: "Plan of Attack weighs deadlines, priority, progress, and time so the next step is always clear.", visual: "plan" },
  { title: "See the whole week", copy: "Calendar and independent checklists keep deadlines, routines, and small details visible.", visual: "calendar" },
  { title: "Make the workspace yours", copy: "Move, resize, minimize, and theme widgets to build a dashboard that fits how you study.", visual: "workspace" },
];
const TASK_CATEGORIES = ["School", "Work", "Personal"];
const SCHOOL_LEVEL_COPY = {
  middle: {
    eyebrow: "Homework Command Center",
    subtitle: "Keep classes, homework, and daily steps clear and manageable.",
    taskSingular: "homework item",
    taskPlural: "Homework",
    todoLabel: "Homework",
    addLabel: "Add Homework",
    nameLabel: "Homework Name",
    courseLabel: "Class",
    planTitle: "Homework Game Plan",
    guideTitle: "One Step at a Time",
    guideCopy: "Choose one important homework item, break it into checklist steps, and finish the first small step before switching subjects.",
    guidePrompts: ["Start with what is due soonest", "Use checklist steps for big homework", "Ask for help before a deadline"],
    emptyCopy: "Nothing here right now — nice work! Try changing a filter if you’re looking for something.",
  },
  high: {
    eyebrow: "Student Productivity Hub",
    subtitle: "Organize assignments, track deadlines, manage courses, and plan your workload.",
    taskSingular: "assignment",
    taskPlural: "Assignments",
    todoLabel: "To Do",
    addLabel: "Add Assignment",
    nameLabel: "Assignment Name",
    courseLabel: "Course",
    planTitle: "Recommended Plan of Attack",
    guideTitle: "Balance the Week",
    guideCopy: "Balance urgent assignments with longer projects so deadlines, activities, and study time do not pile up at once.",
    guidePrompts: ["Protect time for long projects", "Start high-priority work early", "Check tomorrow before signing off"],
    emptyCopy: "Nothing here right now! Try changing a filter, or add something new when you’re ready.",
  },
  college: {
    eyebrow: "College Coursework Planner",
    subtitle: "Coordinate courses, projects, readings, and independent work in one place.",
    taskSingular: "coursework item",
    taskPlural: "Coursework",
    todoLabel: "Coursework",
    addLabel: "Add Coursework",
    nameLabel: "Coursework Title",
    courseLabel: "Course",
    planTitle: "Coursework Priority Plan",
    guideTitle: "Plan Beyond the Next Deadline",
    guideCopy: "Track readings, assessments, and long-term projects together. Use syllabus import and estimates to reserve work blocks before deadlines become urgent.",
    guidePrompts: ["Import each course syllabus", "Schedule readings before class", "Break papers and projects into milestones"],
    emptyCopy: "Nothing here right now! Try changing a filter, or add something new when you’re ready.",
  },
};

const COLOR_PERSONALIZATION_FIELDS = [
  { key: "page", label: "Page background", group: "Foundations" },
  { key: "surface", label: "Cards and surfaces", group: "Foundations" },
  { key: "surfaceAlt", label: "Secondary surfaces", group: "Foundations" },
  { key: "text", label: "Main text", group: "Foundations" },
  { key: "muted", label: "Muted text", group: "Foundations" },
  { key: "border", label: "Borders", group: "Foundations" },
  { key: "focus", label: "Focus outline", group: "Foundations" },
  { key: "input", label: "Inputs", group: "Foundations" },
  { key: "nav", label: "Navigation", group: "Foundations" },
  { key: "task", label: "Assignment cards", group: "Workspace" },
  { key: "modal", label: "Modals", group: "Workspace" },
  { key: "backdrop", label: "Modal backdrop", group: "Workspace" },
  { key: "primary", label: "Primary actions", group: "Actions" },
  { key: "primaryText", label: "Primary button text", group: "Actions" },
  { key: "secondary", label: "Secondary actions", group: "Actions" },
  { key: "secondaryText", label: "Secondary button text", group: "Actions" },
  { key: "success", label: "Success", group: "Actions" },
  { key: "warning", label: "Warning", group: "Actions" },
  { key: "warningText", label: "Warning text", group: "Actions" },
  { key: "danger", label: "Danger", group: "Actions" },
  { key: "dangerText", label: "Danger text", group: "Actions" },
  { key: "priorityHigh", label: "High-priority cards", group: "Actions" },
  { key: "link", label: "Links", group: "Actions" },
  { key: "calendar", label: "Calendar background", group: "Calendar" },
  { key: "calendarText", label: "Calendar text", group: "Calendar" },
  { key: "calendarSelected", label: "Selected date", group: "Calendar" },
  { key: "calendarToday", label: "Today", group: "Calendar" },
  { key: "checklistSurface", label: "Checklist surface", group: "Checklists" },
  { key: "checklistText", label: "Checklist text", group: "Checklists" },
  { key: "checklistAccent", label: "Checklist accent", group: "Checklists" },
  { key: "checklistPalette1", label: "Checklist swatch 1", group: "Checklists" },
  { key: "checklistPalette2", label: "Checklist swatch 2", group: "Checklists" },
  { key: "checklistPalette3", label: "Checklist swatch 3", group: "Checklists" },
  { key: "checklistPalette4", label: "Checklist swatch 4", group: "Checklists" },
  { key: "checklistPalette5", label: "Checklist swatch 5", group: "Checklists" },
  { key: "heroStart", label: "Header gradient start", group: "Header" },
  { key: "heroMiddle", label: "Header gradient middle", group: "Header" },
  { key: "heroEnd", label: "Header gradient end", group: "Header" },
  { key: "heroText", label: "Header text", group: "Header" },
];

const normalizeHexColor = (colorId) => {
  const match = colorId.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;

  const hex = match[1];
  const expandedHex = hex.length === 3
    ? hex.split("").map((character) => character.repeat(2)).join("")
    : hex;
  return `#${expandedHex.toLowerCase()}`;
};

const getContrastText = (color) => {
  const hex = normalizeHexColor(color || "")?.slice(1);
  if (!hex) return "#111827";
  const [r, g, b] = [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map((part) => parseInt(part, 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? "#111827" : "#ffffff";
};

const THEME_COLOR_DEFAULTS = {
  light: {
    page: "#f4f7fb", surface: "#ffffff", surfaceAlt: "#ebeff3",
    text: "#111827", muted: "#6b7280", border: "#dbe3ef", focus: "#6366f1", input: "#ffffff",
    nav: "#ffffff", task: "#ffffff", modal: "#ffffff", backdrop: "#020617", primary: "#4f46e5",
    primaryText: "#ffffff", secondary: "#e5e7eb", secondaryText: "#111827",
    success: "#16a34a", warning: "#f59e0b", warningText: "#111827",
    danger: "#dc2626", dangerText: "#ffffff", priorityHigh: "#ffebeb",
    link: "#2563eb", calendar: "#ffffff", calendarText: "#111827",
    calendarSelected: "#2563eb", calendarToday: "#dbeafe",
    checklistSurface: "#ffffff", checklistText: "#111827", checklistAccent: "#4f46e5",
    checklistPalette1: "#fff7cc", checklistPalette2: "#dff7e8", checklistPalette3: "#dceeff",
    checklistPalette4: "#f3e4ff", checklistPalette5: "#ffe1e1",
    heroStart: "#4f46e5", heroMiddle: "#7c3aed", heroEnd: "#2563eb", heroText: "#ffffff",
  },
  dark: {
    page: "#0b1020", surface: "#151b2e", surfaceAlt: "#1f2937",
    text: "#f9fafb", muted: "#aab3c5", border: "#293247", focus: "#818cf8", input: "#111827",
    nav: "#151b2e", task: "#151b2e", modal: "#151b2e", backdrop: "#020617", primary: "#60a5fa",
    primaryText: "#0b1020", secondary: "#334155", secondaryText: "#ffffff",
    success: "#22c55e", warning: "#facc15", warningText: "#111827",
    danger: "#ef4444", dangerText: "#ffffff", priorityHigh: "#4a1a1a",
    link: "#60a5fa", calendar: "#111827", calendarText: "#f9fafb",
    calendarSelected: "#2563eb", calendarToday: "#4b5563",
    checklistSurface: "#151b2e", checklistText: "#f9fafb", checklistAccent: "#818cf8",
    checklistPalette1: "#5a4b1f", checklistPalette2: "#173f32", checklistPalette3: "#173755",
    checklistPalette4: "#3e2854", checklistPalette5: "#512a31",
    heroStart: "#312e81", heroMiddle: "#581c87", heroEnd: "#1e3a8a", heroText: "#ffffff",
  },
};

const DEFAULT_COLOR_THEME_PRESETS = [
  {
    id: "ocean-focus",
    name: "Ocean Focus",
    mode: "light",
    colors: {
      ...THEME_COLOR_DEFAULTS.light,
      page: "#eef8ff", surface: "#ffffff", surfaceAlt: "#dff1fb",
      text: "#0f172a", muted: "#486174", border: "#b9d7e8", focus: "#0284c7",
      primary: "#0284c7", primaryText: "#ffffff", secondary: "#dbeafe", secondaryText: "#0f172a",
      link: "#0369a1", calendarSelected: "#0284c7", calendarToday: "#bae6fd",
      checklistAccent: "#0ea5e9", heroStart: "#0284c7", heroMiddle: "#0f766e", heroEnd: "#1d4ed8",
    },
  },
  {
    id: "forest-study",
    name: "Forest Study",
    mode: "light",
    colors: {
      ...THEME_COLOR_DEFAULTS.light,
      page: "#f2f8f1", surface: "#ffffff", surfaceAlt: "#e3f1df",
      text: "#132019", muted: "#51624d", border: "#bdd5b8", focus: "#15803d",
      primary: "#15803d", primaryText: "#ffffff", secondary: "#dcfce7", secondaryText: "#14532d",
      success: "#16a34a", link: "#166534", calendarSelected: "#15803d", calendarToday: "#bbf7d0",
      checklistAccent: "#22c55e", heroStart: "#166534", heroMiddle: "#15803d", heroEnd: "#0f766e",
    },
  },
  {
    id: "sunset-planner",
    name: "Sunset Planner",
    mode: "light",
    colors: {
      ...THEME_COLOR_DEFAULTS.light,
      page: "#fff7ed", surface: "#ffffff", surfaceAlt: "#ffedd5",
      text: "#2f1b12", muted: "#7c5847", border: "#fed7aa", focus: "#f97316",
      primary: "#ea580c", primaryText: "#ffffff", secondary: "#fee2e2", secondaryText: "#7c2d12",
      warning: "#f59e0b", link: "#c2410c", calendarSelected: "#ea580c", calendarToday: "#fed7aa",
      checklistAccent: "#f97316", heroStart: "#f97316", heroMiddle: "#db2777", heroEnd: "#7c3aed",
    },
  },
  {
    id: "midnight-neon",
    name: "Midnight Neon",
    mode: "dark",
    colors: {
      ...THEME_COLOR_DEFAULTS.dark,
      page: "#080b17", surface: "#111827", surfaceAlt: "#172033",
      text: "#f8fafc", muted: "#a5b4fc", border: "#273449", focus: "#22d3ee",
      primary: "#22d3ee", primaryText: "#06121f", secondary: "#312e81", secondaryText: "#ffffff",
      link: "#67e8f9", calendarSelected: "#22d3ee", calendarToday: "#334155",
      checklistAccent: "#a78bfa", heroStart: "#0f172a", heroMiddle: "#312e81", heroEnd: "#0891b2",
    },
  },
  {
    id: "berry-night",
    name: "Berry Night",
    mode: "dark",
    colors: {
      ...THEME_COLOR_DEFAULTS.dark,
      page: "#130916", surface: "#211027", surfaceAlt: "#32153a",
      text: "#fff7fb", muted: "#d8b4fe", border: "#4a2559", focus: "#f472b6",
      primary: "#d946ef", primaryText: "#ffffff", secondary: "#581c87", secondaryText: "#ffffff",
      link: "#f0abfc", calendarSelected: "#c026d3", calendarToday: "#4a044e",
      checklistAccent: "#f472b6", heroStart: "#701a75", heroMiddle: "#be185d", heroEnd: "#7c2d12",
    },
  },
];

const BUILT_IN_COLOR_THEMES = [
  { id: "light", name: "Light", mode: "light", colors: THEME_COLOR_DEFAULTS.light, builtIn: true },
  { id: "dark", name: "Dark", mode: "dark", colors: THEME_COLOR_DEFAULTS.dark, builtIn: true },
  ...DEFAULT_COLOR_THEME_PRESETS.map((themePreset) => ({ ...themePreset, builtIn: true })),
];

const getEffectiveThemeColors = (mode, customColors = {}) => ({
  ...THEME_COLOR_DEFAULTS[mode],
  ...(customColors || {}),
});

const getSafeColorThemeColors = (colors = {}) => (
  Object.fromEntries(
    Object.keys(COLOR_CSS_VARIABLES)
      .map((key) => [key, normalizeHexColor(colors[key] || "")])
      .filter(([, color]) => Boolean(color)),
  )
);

const COLOR_CSS_VARIABLES = {
  page: ["--page-bg", "--background-color"],
  surface: ["--card-bg", "--card-background"],
  surfaceAlt: ["--surface-alt"],
  text: ["--text-color"],
  muted: ["--muted-text", "--placeholder-color", "--text-muted"],
  border: ["--border-color"],
  focus: ["--focus-color"],
  input: ["--input-bg"],
  nav: ["--nav-bg"],
  task: ["--task-bg"],
  modal: ["--modal-bg"],
  backdrop: ["--backdrop-color"],
  primary: ["--button-primary-bg", "--primary-color"],
  primaryText: ["--button-primary-color"],
  secondary: ["--secondary-color"],
  secondaryText: ["--secondary-text"],
  success: ["--success-color"],
  warning: ["--button-warning-bg", "--warning-color"],
  warningText: ["--button-warning-color"],
  danger: ["--button-danger-bg", "--danger-color"],
  dangerText: ["--danger-text"],
  priorityHigh: ["--priority-high-bg"],
  link: ["--link-color"],
  calendar: ["--calendar-bg"],
  calendarText: ["--calendar-text"],
  calendarSelected: ["--calendar-selected"],
  calendarToday: ["--calendar-today"],
  checklistSurface: ["--checklist-surface"],
  checklistText: ["--checklist-text"],
  checklistAccent: ["--checklist-accent"],
  checklistPalette1: ["--checklist-palette-1"],
  checklistPalette2: ["--checklist-palette-2"],
  checklistPalette3: ["--checklist-palette-3"],
  checklistPalette4: ["--checklist-palette-4"],
  checklistPalette5: ["--checklist-palette-5"],
  heroStart: ["--hero-start"],
  heroMiddle: ["--hero-middle"],
  heroEnd: ["--hero-end"],
  heroText: ["--hero-text"],
};

const SETTINGS_SECTIONS = [
  { id: "personalization", icon: "🎨", label: "Personalization", description: "Theme, layout, type, and every color." },
  { id: "assignments", icon: "📝", label: "Assignment Options", description: "Fields, defaults, and workflow behavior." },
  { id: "checklists", icon: "☑️", label: "Checklists", description: "Standalone list deadlines and appearance." },
  { id: "calendar", icon: "📅", label: "Calendar", description: "Week layout and calendar details." },
  { id: "reminders", icon: "🔔", label: "Reminders & App", description: "Notifications and installation." },
  { id: "cycle", icon: "🔁", label: "School Cycle", description: "Cycle labels, anchor date, and courses." },
  { id: "storage", icon: "🗄️", label: "Storage", description: "Archive, Trash, and preference tools." },
];

function getOrderedSettingsSections(savedOrder) {
  const validIds = new Set(SETTINGS_SECTIONS.map((section) => section.id));
  const safeOrder = Array.isArray(savedOrder)
    ? savedOrder.filter((id, index, items) => validIds.has(id) && items.indexOf(id) === index)
    : [];
  const missingIds = SETTINGS_SECTIONS.map((section) => section.id).filter((id) => !safeOrder.includes(id));
  const completeOrder = [...safeOrder, ...missingIds];
  return completeOrder.map((id) => SETTINGS_SECTIONS.find((section) => section.id === id));
}

function toggleFromCollapseButton(event, toggle) {
  event.stopPropagation();
  if (event.detail > 1) return;
  toggle();
}

function toggleFromHeaderDoubleClick(event, toggle) {
  if (event.target.closest("button, input, select, textarea, a, summary, details")) return;
  event.preventDefault();
  toggle();
}

function stopControlDoubleClick(event) {
  event.stopPropagation();
}

const WORKSPACE_COLLISION_GAP = 18;

function getWorkspaceObstacleRects(widget, canvas) {
  const canvasBounds = canvas.getBoundingClientRect();
  return [...canvas.querySelectorAll(".workspace-widget")]
    .filter((item) => item !== widget)
    .map((item) => {
      const bounds = item.getBoundingClientRect();
      const isCollapsed = item.classList.contains("is-collapsed");
      const expandedHeight = Number(item.dataset.expandedHeight);
      const effectiveHeight = isCollapsed ? bounds.height : Number.isFinite(expandedHeight) ? expandedHeight : bounds.height;
      return {
        x: bounds.left - canvasBounds.left,
        y: bounds.top - canvasBounds.top,
        width: Number(item.dataset.widgetWidth) || bounds.width,
        height: effectiveHeight,
      };
    });
}

function workspaceRectsOverlap(a, b, gap = WORKSPACE_COLLISION_GAP) {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

function isWorkspaceRectOpen(rect, obstacles) {
  return !obstacles.some((obstacle) => workspaceRectsOverlap(rect, obstacle));
}

function chooseLegalWorkspaceRect(desired, xOnly, yOnly, lastSafe, obstacles, options = {}) {
  if (isWorkspaceRectOpen(desired, obstacles)) return desired;

  // Besides axis-only movement, try the nearest legal edges around every
  // obstacle. This lets a widget slide through tight layouts instead of
  // appearing frozen as soon as the pointer crosses another widget.
  const candidates = [xOnly, yOnly];
  if (options.snapToEdges) {
    for (const obstacle of obstacles) {
      candidates.push(
      { ...desired, x: obstacle.x - desired.width - WORKSPACE_COLLISION_GAP },
      { ...desired, x: obstacle.x + obstacle.width + WORKSPACE_COLLISION_GAP },
      { ...desired, y: obstacle.y - desired.height - WORKSPACE_COLLISION_GAP },
      { ...desired, y: obstacle.y + obstacle.height + WORKSPACE_COLLISION_GAP },
      { ...desired, x: obstacle.x - desired.width - WORKSPACE_COLLISION_GAP, y: lastSafe.y },
      { ...desired, x: obstacle.x + obstacle.width + WORKSPACE_COLLISION_GAP, y: lastSafe.y },
      { ...desired, x: lastSafe.x, y: obstacle.y - desired.height - WORKSPACE_COLLISION_GAP },
      { ...desired, x: lastSafe.x, y: obstacle.y + obstacle.height + WORKSPACE_COLLISION_GAP },
      );
    }
  }

  const legalCandidates = candidates.filter((candidate) =>
    candidate.x >= 0 &&
    candidate.y >= 0 &&
    (!Number.isFinite(options.maxX) || candidate.x <= options.maxX) &&
    isWorkspaceRectOpen(candidate, obstacles)
  );
  if (legalCandidates.length === 0) return lastSafe;

  return legalCandidates.sort((a, b) => {
    const aDistance = Math.abs(a.x - desired.x) + Math.abs(a.y - desired.y);
    const bDistance = Math.abs(b.x - desired.x) + Math.abs(b.y - desired.y);
    return aDistance - bDistance;
  })[0];
}

function SettingsCard({ title, description, className = "", children }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className={`settings-section ${className}`.trim()}>
      <div className="settings-collapse-header double-click-collapse-header" onDoubleClick={(event) => toggleFromHeaderDoubleClick(event, () => setIsOpen((open) => !open))} title="Use the button to expand or minimize">
        <h4>{title}</h4>
        <button
          type="button"
          className="settings-collapse-button"
          onClick={(event) => toggleFromCollapseButton(event, () => setIsOpen((open) => !open))}
          onDoubleClick={stopControlDoubleClick}
          aria-expanded={isOpen}
          aria-label={`${isOpen ? "Shrink" : "Enlarge"} ${title}`}
          title={`${isOpen ? "Shrink" : "Enlarge"} ${title}`}
        >
          {isOpen ? "−" : "+"}
        </button>
      </div>
      {isOpen && (
        <div className="settings-collapsible-content">
          {description && <p className="hint-text settings-card-description">{description}</p>}
          {children}
        </div>
      )}
    </section>
  );
}

function PersonalizationTip({ title, children, forceOpen = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const expanded = forceOpen || isOpen;
  const contentId = `personalization-tip-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <article className="personalization-tip-card">
      <div className="personalization-tip-header double-click-collapse-header" onDoubleClick={(event) => toggleFromHeaderDoubleClick(event, () => setIsOpen((open) => !open))} title="Double-click to enlarge or minimize">
        <strong>{title}</strong>
        <button type="button" className="settings-collapse-button settings-collapse-button-small" onClick={(event) => toggleFromCollapseButton(event, () => setIsOpen((open) => !open))} onDoubleClick={stopControlDoubleClick} aria-expanded={expanded} aria-controls={contentId} aria-label={`${expanded ? "Minimize" : "Enlarge"} ${title}`}>{expanded ? "−" : "+"}</button>
      </div>
      {expanded && <p id={contentId}>{children}</p>}
    </article>
  );
}

function getTaskCategory(task) {
  return task?.category || "School";
}

function getCycleDayForDate(date, settings) {
  const dayNames = Array.isArray(settings?.cycleDayNames)
    ? settings.cycleDayNames.filter(Boolean)
    : [];
  if (!settings?.cycleAnchorDate || dayNames.length === 0) return null;
  if (date.getDay() === 0 || date.getDay() === 6) return null;
  const [year, month, day] = settings.cycleAnchorDate.split("-").map(Number);
  const anchor = new Date(year, month - 1, day);
  if (Number.isNaN(anchor.getTime())) return null;
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const cursor = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const direction = target >= cursor ? 1 : -1;
  let schoolDays = 0;
  while (cursor.getTime() !== target.getTime()) {
    cursor.setDate(cursor.getDate() + direction);
    if (cursor.getDay() !== 0 && cursor.getDay() !== 6) schoolDays += direction;
  }
  const index = ((schoolDays % dayNames.length) + dayNames.length) % dayNames.length;
  return dayNames[index];
}

function getStoredAccounts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACCOUNTS_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function findLegacyProfileKey(username) {
  const normalizedName = username.toLowerCase();
  const prefixes = ["tasks_", "courses_", "courseColors_", "settings_"];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index) || "";
    const prefix = prefixes.find((candidate) => key.startsWith(candidate));
    if (!prefix) continue;
    const profileKey = key.slice(prefix.length);
    if (profileKey !== "guest" && profileKey.toLowerCase() === normalizedName) {
      return profileKey;
    }
  }
  return null;
}

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function derivePasswordVerifier(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

function openAttachmentDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("taskacadia_attachments", 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("files")) {
        database.createObjectStore("files", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putAttachmentFile(id, file) {
  const database = await openAttachmentDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("files", "readwrite");
    transaction.objectStore("files").put({ id, blob: file });
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

async function getAttachmentFile(id) {
  const database = await openAttachmentDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("files", "readonly");
    const request = transaction.objectStore("files").get(id);
    request.onsuccess = () => { database.close(); resolve(request.result?.blob || null); };
    request.onerror = () => { database.close(); reject(request.error); };
  });
}

async function deleteAttachmentFile(id) {
  const database = await openAttachmentDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("files", "readwrite");
    transaction.objectStore("files").delete(id);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

/**
 * TASKCABINET APPLICATION GUIDE
 *
 * This file contains the app's data, behavior, and visible React interface.
 * how to read it is from top to bottom:
 *
 * 1. Helper functions answer small questions such as "Is dark mode preferred?"
 * 2. React state remembers information that can change while the app is open.
 * 3. Effects synchronize selected state with the browser and localStorage.
 * 4. Event handlers respond to clicks, typing, form submissions, and edits.
 * 5. Derived values filter and sort the task data without storing extra copies.
 * 6. The final return statement describes what appears on each screen.
 *
 * The main task object has this general shape:
 * {
 *   id, title, course, dueMonth, dueDay, dueHour, dueAmPm,
 *   estimatedMinutes, priority, repeat, isCompleted, status, notes, subtasks,
 *   isArchived, archivedAt, isDeleted, deletedAt
 * }
 *
 * Data is saved in localStorage, so refreshing the browser does not erase it.
 * Each username receives separate task, course, and course-color storage keys.
 */



/**
 * Read the operating system's preferred color scheme.
 * This is only used when the user has not already saved a theme choice.
 */
function getSystemPreference() {
  if (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

/**
 * Accept 12-hour times such as "3", "11", "3:05", or "11:45" and return a
 * consistent hour:minute value. Missing minutes are treated as zero.
 */
function normalizeDueTime(value) {
  const match = String(value ?? "")
    .trim()
    .match(/^(\d{1,2})(?::(\d{1,2}))?$/);

  if (!match) return null;

  const hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);

  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

  return `${hour}:${String(minute).padStart(2, "0")}`;
}

function getDeadlineDate(dueMonth, dueDay, dueHour = "11:59", dueAmPm = "PM") {
  if (!dueMonth || !dueDay) return null;
  const normalizedTime = normalizeDueTime(dueHour) || "11:59";
  const [hourText, minuteText] = normalizedTime.split(":");
  let hour = Number(hourText) % 12;
  if ((dueAmPm || "PM") === "PM") hour += 12;
  const now = new Date();
  const result = new Date(
    now.getFullYear(),
    Number(dueMonth) - 1,
    Number(dueDay),
    hour,
    Number(minuteText),
  );
  return Number.isNaN(result.getTime()) ? null : result;
}

function getEffectiveDeadline(task) {
  const deadlines = [
    getDeadlineDate(task?.dueMonth, task?.dueDay, task?.dueHour, task?.dueAmPm),
    ...getSafeSubtasks(task)
      .filter((subtask) => !subtask.isDone)
      .map((subtask) =>
        getDeadlineDate(
          subtask.dueMonth,
          subtask.dueDay,
          subtask.dueHour,
          subtask.dueAmPm,
        ),
      ),
  ].filter(Boolean);
  if (deadlines.length === 0) return null;
  return new Date(Math.min(...deadlines.map((deadline) => deadline.getTime())));
}

/**
 * Convert a stored month/day into a friendly urgency group.
 *
 * TaskCabinet currently stores month and day, but not a year. For that reason,
 * this helper compares every task with the current calendar year. The exact
 * returned strings are also used by filtering, sorting, counts, and headings,
 * so update those related features together if these labels ever change.
 */
function getDueDateBucket(dueMonth, dueDay) {
  if (!dueMonth || !dueDay) return "No Due Date";

  const now = new Date();
  const currentYear = now.getFullYear();

  // JavaScript months start at 0, so January is month 0, February is month 1, etc.
  const taskDate = new Date(currentYear, Number(dueMonth) - 1, Number(dueDay));

  // Midnight removes the current time of day from the date comparison.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // In this app, a week ends on Saturday.
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + (6 - today.getDay()));

  const endOfNextWeek = new Date(endOfWeek);
  endOfNextWeek.setDate(endOfNextWeek.getDate() + 7);

  const diffTime = taskDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "Overdue 🚨";
  if (diffDays === 0) return "Due Today ⏰";
  if (diffDays === 1) return "Due Tomorrow 🗓️";
  if (taskDate <= endOfWeek) return "Due This Week";
  if (taskDate <= endOfNextWeek) return "Due Next Week";
  return "Due Later";
}

/**
 * Return a safe checklist array for any task.
 *
 * Older assignments in localStorage do not have a subtasks property yet. This
 * helper lets the rest of the app treat those assignments as having an empty
 * checklist instead of crashing or forcing a localStorage migration.
 */
function getSafeSubtasks(task) {
  if (!Array.isArray(task?.subtasks)) return [];

  return task.subtasks.map((subtask, index) => ({
    id: subtask.id ?? `${task.id || "task"}-step-${index}`,
    text: subtask.text || "",
    isDone: Boolean(subtask.isDone),
    dueMonth: subtask.dueMonth || "",
    dueDay: subtask.dueDay || "",
    dueHour: subtask.dueHour || "",
    dueAmPm: subtask.dueAmPm || "PM",
  }));
}

function getSafeLinks(task) {
  if (!Array.isArray(task?.links)) return [];
  return task.links.map((link, index) => ({
    id: link.id ?? `${task.id || "task"}-link-${index}`,
    name: link.name || "",
    url: link.url || "",
  }));
}

function getSafeAttachments(task) {
  if (!Array.isArray(task?.attachments)) return [];
  return task.attachments.map((attachment, index) => ({
    id: attachment.id ?? `${task.id || "task"}-attachment-${index}`,
    name: attachment.name || "File",
    type: attachment.type || "application/octet-stream",
    size: Number(attachment.size) || 0,
  }));
}

function normalizeWebUrl(value) {
  const candidate = /^https?:\/\//i.test(value.trim())
    ? value.trim()
    : `https://${value.trim()}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

/**
 * Decide which workflow column a task belongs in.
 *
 * isCompleted stays the most important source of truth so old completion logic
 * and old saved data continue to behave correctly. status adds more detail for
 * incomplete assignments: either todo or inProgress.
 */
function getTaskStatus(task) {
  if (task?.isCompleted) return "completed";
  if (task?.status === "inProgress") return "inProgress";
  return "todo";
}

/**
 * Summarize checklist progress for compact task cards.
 * Returning null means the task has no checklist and should not show clutter.
 */
function getSubtaskProgress(task) {
  const subtasks = getSafeSubtasks(task);

  if (subtasks.length === 0) return null;

  const completedCount = subtasks.filter((subtask) => subtask.isDone).length;

  return {
    completedCount,
    totalCount: subtasks.length,
    label: `${completedCount}/${subtasks.length} steps done`,
  };
}

/**
 * Build one checklist step from user-entered text.
 * Empty text returns null so blank steps are quietly ignored.
 */
function createSubtask(text, deadline = {}) {
  const trimmedText = text.trim();

  if (!trimmedText) return null;

  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    text: trimmedText,
    isDone: false,
    dueMonth: deadline.dueMonth || "",
    dueDay: deadline.dueDay || "",
    dueHour: deadline.dueHour || "",
    dueAmPm: deadline.dueAmPm || "PM",
  };
}

/**
 * Create the next occurrence of a repeating task.
 *
 * This helper lives outside the React component because it creates a unique ID
 * with the current time and a random number. It is called only from the Complete
 * button's event handler, never while React is calculating the interface.
 *
 * Returning null means no follow-up task should be created. Monthly repeats
 * receive special handling: a task on the 31st moves to the last valid day when
 * the following month has fewer than 31 days.
 */
function getNextRepeatingTask(task) {
  if (!task.repeat || task.repeat === "NONE") return null;
  if (!task.dueMonth || !task.dueDay) return null;

  const currentYear = new Date().getFullYear();
  let nextDate = new Date(
    currentYear,
    Number(task.dueMonth) - 1,
    Number(task.dueDay),
  );

  if (task.repeat === "DAILY") {
    nextDate.setDate(nextDate.getDate() + 1);
  }

  if (task.repeat === "EVERY_OTHER_WEEKDAY") {
    let weekdaysAdded = 0;

    while (weekdaysAdded < 2) {
      nextDate.setDate(nextDate.getDate() + 1);

      if (nextDate.getDay() !== 0 && nextDate.getDay() !== 6) {
        weekdaysAdded += 1;
      }
    }
  }

  if (task.repeat === "WEEKLY") {
    nextDate.setDate(nextDate.getDate() + 7);
  }

  if (task.repeat === "MONTHLY") {
    const originalDay = Number(task.dueDay);
    let nextMonthIndex = Number(task.dueMonth);

    let nextYear = currentYear;
    if (nextMonthIndex > 11) {
      nextMonthIndex = 0;
      nextYear += 1;
    }

    const daysInNextMonth = new Date(
      nextYear,
      nextMonthIndex + 1,
      0,
    ).getDate();

    nextDate = new Date(
      nextYear,
      nextMonthIndex,
      Math.min(originalDay, daysInNextMonth),
    );
  }

  return {
    ...task,
    id: Date.now() + Math.floor(Math.random() * 1000),
    dueMonth: String(nextDate.getMonth() + 1).padStart(2, "0"),
    dueDay: String(nextDate.getDate()).padStart(2, "0"),
    isCompleted: false,
    status: "todo",
    subtasks: getSafeSubtasks(task).map((subtask) => ({
      ...subtask,
      isDone: false,
    })),
    copyGroupId: task.copyGroupId || task.id,
    createdFromRepeat: task.id,
    createdByVoice: false,
    voiceCreatedCourse: "",
  };
}

const WORKSPACE_TABS = [
  ["dashboard", "Dashboard"],
  ["todo", "To Do"],
  ["inProgress", "In Progress"],
  ["completed", "Completed"],
  ["settings", "Settings"],
];

const WORKSPACE_COMPACT_BREAKPOINT = 1100;
const getWorkspaceModeForWidth = (width) =>
  Number(width) < WORKSPACE_COMPACT_BREAKPOINT ? "mobile" : "desktop";

/**
 * Normalize a stored workspace before React uses it. Older unstamped layouts
 * are unlocked so a stale lock flag cannot make a migrated layout impossible
 * to repair. This helper is intentionally outside App because it is needed by
 * App's lazy state initializer during the component's first execution.
 */
function repairLoadedWorkspace(layout) {
  const repaired = normalizeWorkspaceLayout(layout, {
    preservePositions: true,
    preserveUnmeasuredPositions: true,
  });
  const isOldUnstampedLayout = !repaired.userCustomized && !repaired.updatedAt;

  return {
    ...repaired,
    locked: {
      desktop: isOldUnstampedLayout ? false : Boolean(repaired.locked?.desktop),
      mobile: isOldUnstampedLayout ? false : Boolean(repaired.locked?.mobile),
    },
  };
}

const PERSONALIZATION_TIPS = [
  ["Move a widget", "Grab the six-dot handle and drag. The widget you move comes to the front, and you can drag it over a navigation tab to send it there."],
  ["Resize a widget", "On desktop, drag any edge or corner. On mobile, tap the resize controls below the widget so everything stays easy to reach."],
  ["Widget hiding underneath another", "Open the top widget’s three-dot menu and choose Select widget underneath. The hidden one will come forward so you can grab it."],
  ["New widget not showing", "It is probably underneath another widget. Use Select widget underneath from the covering widget’s three-dot menu."],
  ["Add a widget", "Open Widgets beside the navigation, search for what you want, then choose Add to tab. Adding a copy never creates duplicate assignment data."],
  ["Copy a widget to another tab", "Open the widget’s three-dot menu and pick a tab under Copy to. Both copies show the same saved information."],
  ["Hide or bring back a widget", "Choose Hide widget from its three-dot menu. To bring it back, open Widgets and choose Restore."],
  ["Lock your layout", "When everything is where you want it, open Widgets and choose Lock Layout. Buttons still work, but widgets will not move by accident."],
  ["Reset a layout", "Reset this tab puts only the current tab back to its starting layout. Reset all layouts resets desktop and mobile layouts, but never deletes assignments or checklists."],
  ["Minimize or enlarge", "Use the + or − button, or double-click the header. This works on widgets, Settings cards, and optional assignment sections."],
  ["Change the app theme", "Pick a built-in or saved theme in Appearance. A theme changes the full color set, not your assignments or course colors."],
  ["Save your own theme", "Set up your colors in Full Color Studio, choose Make into theme, and give it a name. You can reuse it without rebuilding every color."],
  ["Full Color Studio", "Each group controls one part of TaskCabinet. Changes show right away, so you can try colors before saving a custom theme."],
  ["Text and background contrast", "If text gets hard to read after a color change, adjust Main text, Muted text, or the matching surface color in Full Color Studio."],
  ["Course colors", "Course colors label assignments and calendar dots. They stay separate from the main app theme so each course remains easy to spot."],
  ["Checklist colors", "The checklist palette supplies quick color choices. You can still give one list its own custom color without changing the others."],
  ["Text size", "Text size grows the words and the nearby controls together. If a widget feels crowded afterward, resize that widget to give it more room."],
  ["App font", "App font changes the writing style across TaskCabinet. Highly Readable is the clearest option; Typewriter Mono gives everything equal-width letters."],
  ["Interface spacing", "Compact fits more on screen, Comfortable is the everyday default, and Spacious adds extra breathing room around controls."],
  ["Task action layout", "Comfortable wrap keeps actions in rows, Compact buttons saves space, and Vertical actions stacks them for easier tapping."],
  ["Reduce motion", "Turn this on if you prefer a steadier screen. TaskCabinet will remove the extra movement while keeping every feature working."],
  ["Calendar display", "Use Calendar settings to choose week or month view, the first day of the week, and whether school-cycle details appear."],
  ["School-day cycle", "Choose an anchor date and name your cycle days. Weekends are skipped automatically when TaskCabinet works out the next cycle day."],
  ["Checklist deadlines", "A checklist item with only a date is due at 11:59 PM. Turn on checklist times when a step needs a specific hour."],
  ["Add Assignment fields", "Hide optional fields you rarely use. This only cleans up the form; it does not remove information from assignments you already made."],
  ["New Assignment defaults", "Defaults prefill new assignments and return after a successful add. You can still change any field before saving."],
  ["Dark and light themes", "Theme mode controls whether TaskCabinet uses a light or dark base. Custom themes remember which base they were made for."],
  ["Turn on push reminders", "Open Reminders & App in Settings and choose Enable Push Reminders. TaskCabinet waits for you to press that button before asking for notification permission."],
  ["Choose when reminders arrive", "The Remind me setting uses one timing choice for every assignment. The sentence below it shows exactly how early TaskCabinet will try to remind you."],
  ["Reminder bell icons", "A small bell on an assignment means its reminder is healthy, still syncing, or needs attention. Hover over it or focus it to hear the exact status."],
  ["Repair reminder sync", "If Push Reminders says Needs attention, choose Repair Reminder Sync. Healthy reminders hide that button because there is nothing you need to fix."],
  ["Notifications are blocked", "TaskCabinet cannot reopen a permission prompt after the browser blocks it. Allow notifications from your browser’s site settings, then return and repair the sync."],
  ["Test your reminders", "Send Test Reminder becomes available once Push Reminders is fully active. It checks this browser without changing any assignment deadline."],
  ["Reminders while the app is closed", "Push reminders can arrive while TaskCabinet is closed when your browser, device, internet, and notification settings allow it. Open-app reminders stay available as a fallback."],
  ["Push reminders on iPhone or iPad", "Add TaskCabinet to the Home Screen, open the installed app, and enable Push Reminders from there. Regular browser tabs on Apple mobile devices cannot always receive web push."],
  ["Deadline is too close for a reminder", "If the chosen reminder time has already passed, TaskCabinet skips the late alert instead of surprising you after the useful moment."],
  ["Overdue assignments", "Overdue work gets stronger red highlighting in assignments, reminders, recommendations, course summaries, and calendars. TaskCabinet never changes the deadline for you."],
  ["Recommended Plan of Attack", "This plan weighs due dates, priority, estimated time, and progress. Open an item to work with the real assignment; the plan never creates a duplicate."],
  ["What Should I Do?", "Enter how much time you have and TaskCabinet will look for work that fits. If nothing fits perfectly, it favors the most urgent useful choice."],
  ["To Do and In Progress", "Use Start when you begin something so it moves to In Progress. Move it back to To Do if you started by accident; your notes and checklist steps stay with it."],
  ["Repeating assignments", "Completing a repeating assignment creates its next occurrence. Each occurrence keeps its own deadline and reminder instead of reusing the finished one."],
  ["Assignment checklist steps", "Use optional checklist steps to break a large assignment into smaller pieces. If automatic completion is on, checking the final step completes the assignment."],
  ["Files stay on this browser", "Assignment files are stored in this browser, not uploaded with your reminder. Clearing site data can remove them, so keep another copy of anything important."],
  ["Assignment links", "Give each link a useful name and web address. Leave the link field after typing so it is added to the list before you save the assignment."],
  ["Import a syllabus", "Paste a list or choose a PDF, DOCX, TXT, Markdown, or CSV file. Review the preview before importing so dates and course headings look right."],
  ["Voice assignments", "On supported browsers, voice creation uses the browser’s speech recognition. You can review what was understood before relying on the new assignment."],
  ["Archive and Trash", "Archive keeps finished assignments out of the way. Trash is recoverable until you permanently delete it, so moving something there is not immediately final."],
  ["Calendar assignment details", "Choose a date to see everything due that day. Course-colored dots help you scan the month without changing the colors of the assignments themselves."],
  ["Dashboard reminder range", "The reminder widget’s upcoming range only changes what appears on the dashboard. It does not change when push notifications are sent."],
  ["Local profiles", "Each username on this browser has its own assignments, settings, themes, layouts, and reminder connection. These are local profiles, not cloud accounts."],
  ["Keep local data safe", "TaskCabinet saves your work in this browser. Clearing browser storage or using a different device does not automatically bring that data with you."],
];

function WorkspaceWidget({
  instance,
  title,
  collapsed,
  locked,
  mobileResize,
  onToggle,
  onResize,
  onPosition,
  onMove,
  onCopy,
  onHide,
  onSelectUnderneath,
  children,
}) {
  const widgetRef = useRef(null);
  const minimumExpandedHeight = getWidgetMinimumExpandedHeight(instance.type);
  // Keep a widget's internal composition stable while its outer viewport is
  // resized. Smaller widgets scale their contents instead of triggering a
  // different responsive layout or hiding controls behind new wrapping.
  const contentReferenceWidth = 520;
  const contentReferenceHeight = Math.max(260, minimumExpandedHeight - COLLAPSED_WIDGET_HEIGHT);
  const availableBodyHeight = Math.max(1, Number(instance.height) - COLLAPSED_WIDGET_HEIGHT);
  const smallWidget = Number(instance.width) <= 320 && Number(instance.height) <= 220;
  const displayOnlyWidget = instance.type.startsWith("stat-");
  const fixedOverflowWidget = [
    "mini-calendar",
    "course-colors",
    "reminders",
    "checklists",
    "quick-match",
    "course-overview",
  ].includes(instance.type);
  const contentScale = mobileResize || instance.type === "course-colors"
    ? 1
    : Math.min(
        1,
        Math.max(0.55, Number(instance.width) / contentReferenceWidth),
        Math.max(0.55, availableBodyHeight / contentReferenceHeight),
      );
  const resizeStart = (event, edges = { right: true, bottom: true }) => {
    event.preventDefault();
    event.stopPropagation();
    const widget = event.currentTarget.closest(".workspace-widget");
    const canvas = widget?.closest(".workspace-widget-canvas");
    widget?.classList.add("is-resizing");
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = Number(instance.width);
    const startHeight = Number(instance.height);
    const obstacles = widget && canvas ? getWorkspaceObstacleRects(widget, canvas) : [];
    const widgetBounds = widget?.getBoundingClientRect();
    const canvasBounds = canvas?.getBoundingClientRect();
    const widgetX = widgetBounds && canvasBounds ? widgetBounds.left - canvasBounds.left : 0;
    const widgetY = widgetBounds && canvasBounds ? widgetBounds.top - canvasBounds.top : 0;
    let nextWidth = startWidth;
    let nextHeight = startHeight;
    let lastSafe = {
      x: widgetX,
      y: widgetY,
      width: startWidth,
      height: startHeight,
    };
    const move = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const desiredX = edges.left ? Math.min(widgetX + startWidth - 190, Math.max(0, widgetX + deltaX)) : widgetX;
      const desiredY = edges.top ? Math.min(widgetY + startHeight - minimumExpandedHeight, Math.max(0, widgetY + deltaY)) : widgetY;
      const desiredWidth = edges.left
        ? startWidth + widgetX - desiredX
        : edges.right
          ? startWidth + deltaX
          : startWidth;
      const desiredHeight = edges.top
        ? startHeight + widgetY - desiredY
        : edges.bottom
          ? startHeight + deltaY
          : startHeight;
      const maxWidth = canvas ? Math.max(190, canvas.clientWidth - desiredX) : Number.POSITIVE_INFINITY;
      const desired = {
        x: desiredX,
        y: desiredY,
        width: Math.min(maxWidth, Math.max(190, desiredWidth)),
        height: Math.max(minimumExpandedHeight, desiredHeight),
      };
      const legal = chooseLegalWorkspaceRect(
        desired,
        { ...desired, height: lastSafe.height },
        { ...desired, width: lastSafe.width },
        lastSafe,
        obstacles,
      );
      nextWidth = legal.width;
      nextHeight = legal.height;
      lastSafe = legal;
      if (widget) {
        widget.style.left = `${legal.x}px`;
        widget.style.top = `${legal.y}px`;
        widget.style.width = `${nextWidth}px`;
        widget.style.height = `${nextHeight}px`;
        const liveScale = Math.min(
          1,
          Math.max(0.55, nextWidth / contentReferenceWidth),
          Math.max(0.55, (nextHeight - COLLAPSED_WIDGET_HEIGHT) / contentReferenceHeight),
        );
        widget.style.setProperty("--widget-content-scale", liveScale);
      }
    };
    const stop = () => {
      widget?.classList.remove("is-resizing");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      onResize(nextWidth, nextHeight, canvas?.clientWidth, lastSafe.x, lastSafe.y);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  const resizeForMobile = (heightChange = 0) => {
    const widget = widgetRef.current;
    const canvas = widget?.closest(".workspace-widget-canvas");
    const canvasWidth = canvas?.clientWidth || instance.width;
    const nextHeight = Math.max(
      minimumExpandedHeight,
      Math.min(1100, Number(instance.height) + heightChange),
    );
    onResize(canvasWidth, nextHeight, canvasWidth);
  };

  const positionStart = (event) => {
    if (locked) return;
    event.preventDefault();
    event.stopPropagation();
    const widget = event.currentTarget.closest(".workspace-widget");
    const canvas = widget?.closest(".workspace-widget-canvas");
    if (!widget || !canvas) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const widgetBounds = widget.getBoundingClientRect();
    const canvasBounds = canvas.getBoundingClientRect();
    const initialX = widgetBounds.left - canvasBounds.left;
    const initialY = widgetBounds.top - canvasBounds.top;
    let nextX = initialX;
    let nextY = initialY;
    let targetTab = null;
    const obstacles = getWorkspaceObstacleRects(widget, canvas);
    let lastSafe = {
      x: initialX,
      y: initialY,
      width: Number(widget.dataset.widgetWidth) || widget.offsetWidth,
      height: widget.classList.contains("is-collapsed")
        ? widget.offsetHeight
        : Number(widget.dataset.expandedHeight) || widget.offsetHeight,
    };
    widget.classList.add("is-dragging");
    const move = (moveEvent) => {
      const maxX = Math.max(0, canvas.clientWidth - widget.offsetWidth);
      const desired = {
        ...lastSafe,
        x: Math.max(0, Math.min(maxX, initialX + moveEvent.clientX - startX)),
        y: Math.max(0, initialY + moveEvent.clientY - startY),
      };
      const legal = chooseLegalWorkspaceRect(
        desired,
        { ...desired, y: lastSafe.y },
        { ...desired, x: lastSafe.x },
        lastSafe,
        obstacles,
        { snapToEdges: true, maxX },
      );
      nextX = legal.x;
      nextY = legal.y;
      lastSafe = legal;
      widget.style.left = `${nextX}px`;
      widget.style.top = `${nextY}px`;
      targetTab = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest?.("[data-tab]")?.dataset.tab || null;
    };
    const stop = () => {
      widget.classList.remove("is-dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      if (targetTab) onMove(targetTab);
      else onPosition(nextX, nextY, canvas.clientWidth);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  return (
    <section
      ref={widgetRef}
      className={`workspace-widget${collapsed ? " is-collapsed" : ""}${locked ? " is-locked" : ""}${mobileResize ? " uses-mobile-resize" : ""}${smallWidget ? " is-small-widget" : ""}${displayOnlyWidget ? " is-display-only" : ""}${fixedOverflowWidget ? " has-fixed-overflow" : ""}${instance.type === "course-colors" ? " uses-fluid-course-colors" : ""}`}
      data-widget-id={instance.id}
      data-widget-width={instance.width}
      data-expanded-height={instance.height}
      style={{ left: `${Math.max(0, Number(instance.x) || 0)}px`, top: `${instance.y || 0}px`, zIndex: instance.zIndex || 1, width: `${instance.width}px`, height: collapsed ? `${COLLAPSED_WIDGET_HEIGHT}px` : `${instance.height}px`, "--widget-content-scale": contentScale }}
    >
      <header className="workspace-widget-header double-click-collapse-header" onDoubleClick={(event) => toggleFromHeaderDoubleClick(event, onToggle)}>
        <button
          type="button"
          className="widget-drag-grip"
          onPointerDown={positionStart}
          onDoubleClick={stopControlDoubleClick}
          disabled={locked}
          aria-label={`Move ${title}`}
          title={locked ? "Unlock the layout to move widgets" : "Drag to move"}
        >
          ⠿
        </button>
        <strong>{title}</strong>
        <button
          type="button"
          className="widget-collapse-button"
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          onDoubleClick={stopControlDoubleClick}
          aria-label={`${collapsed ? "Expand" : "Minimize"} ${title}`}
          title={collapsed ? "Expand" : "Minimize"}
        >
          {collapsed ? "+" : "-"}
        </button>
        <details className="widget-menu" onDoubleClick={(event) => event.stopPropagation()}>
          <summary aria-label={`${title} options`}>•••</summary>
          <div className="widget-menu-popover" onClick={(event) => {
            if (event.target.closest("button")) event.currentTarget.closest("details")?.removeAttribute("open");
          }}>
            <strong>Copy to</strong>
            {WORKSPACE_TABS.filter(([tab]) => tab !== "calendar").map(([tab, label]) => <button type="button" key={`copy-${tab}`} onClick={() => onCopy(tab)}>{label}</button>)}
            {onSelectUnderneath && <button type="button" onClick={onSelectUnderneath}>Select widget underneath</button>}
            <button type="button" className="widget-hide-action" onClick={onHide}>Hide widget</button>
          </div>
        </details>
      </header>
      {!collapsed && (
        <div className="workspace-widget-body">
          <div className="workspace-widget-scaled-content">
            {children}
          </div>
        </div>
      )}
      {!locked && !mobileResize && (
        <div className="widget-resize-edges" aria-label={`Resize ${title}`}>
          {(collapsed
            ? [["right", { right: true }], ["left", { left: true }]]
            : [
                ["top", { top: true }], ["right", { right: true }], ["bottom", { bottom: true }], ["left", { left: true }],
                ["top-left", { top: true, left: true }], ["top-right", { top: true, right: true }],
                ["bottom-right", { bottom: true, right: true }], ["bottom-left", { bottom: true, left: true }],
              ]
          ).map(([edge, directions]) => <button key={edge} type="button" className={`widget-resize-edge is-${edge}`} onPointerDown={(event) => resizeStart(event, directions)} aria-label={`Resize ${title} from ${edge}`} />)}
        </div>
      )}
      {!collapsed && !locked && mobileResize && (
        <div className="mobile-widget-resize-controls" aria-label={`${title} size controls`}>
          <button type="button" onClick={() => resizeForMobile(-120)} aria-label={`Make ${title} shorter`}>−</button>
          <button type="button" onClick={() => resizeForMobile(0)} aria-label={`Fit ${title} to screen width`}>Fit</button>
          <button type="button" onClick={() => resizeForMobile(120)} aria-label={`Make ${title} taller`}>+</button>
        </div>
      )}
    </section>
  );
}

function WorkspaceCanvas({ children, height }) {
  return <div className="workspace-widget-canvas" style={{ height: `${height}px` }}>{children}</div>;
}

const VOICE_MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function splitLocalVoiceAssignments(transcript) {
  const marker = /\b(?:(?:and\s+)?then\s+|also\s+)?(?:add|create)\s+(?:another\s+|an?\s+)?(?:assignment\s+)?/gi;
  const matches = [...transcript.matchAll(marker)];
  if (matches.length <= 1) return [transcript.replace(marker, "").trim()].filter(Boolean);
  return matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? transcript.length;
    return transcript.slice(start, end).trim().replace(/^(?:and|then)\s+/i, "");
  }).filter(Boolean);
}

function getNextWeekdayDate(now, weekdayName) {
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const targetDay = weekdays.indexOf(weekdayName.toLowerCase());
  if (targetDay < 0) return null;
  const result = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let daysAhead = (targetDay - result.getDay() + 7) % 7;
  if (daysAhead === 0) daysAhead = 7;
  result.setDate(result.getDate() + daysAhead);
  return result;
}

function parseLocalVoiceDate(text, now) {
  const lower = text.toLowerCase();
  if (/\btoday\b/.test(lower)) return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (/\btomorrow\b/.test(lower)) {
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  const weekdayMatch = lower.match(/\b(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (weekdayMatch) return getNextWeekdayDate(now, weekdayMatch[1]);

  const monthMatch = lower.match(new RegExp(`\\b(${VOICE_MONTHS.join("|")})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`));
  if (!monthMatch) return null;
  const result = new Date(
    Number(monthMatch[3]) || now.getFullYear(),
    VOICE_MONTHS.indexOf(monthMatch[1]),
    Number(monthMatch[2]),
  );
  return Number.isNaN(result.getTime()) ? null : result;
}

function parseLocalVoiceAssignments(transcript, courses, defaults) {
  const now = new Date();
  const skipped = [];
  const assignments = splitLocalVoiceAssignments(transcript).slice(0, 10).flatMap((segment, index) => {
    const lower = segment.toLowerCase();
    const knownCourse = courses.find((course) => lower.includes(String(course).toLowerCase()));
    const spokenCourse = segment.match(/\b(?:for|course)\s+([a-z][a-z0-9 &'’-]{1,40}?)(?=\s+(?:due|on|at|by|high|medium|low|priority|estimated|takes|repeat|notes?|checklist|steps?)\b|[,.]|$)/i)?.[1]?.trim();
    const category = /\bwork\b/i.test(segment)
      ? "Work"
      : /\bpersonal\b/i.test(segment)
        ? "Personal"
        : defaults.category || "School";
    const course = category === "School" ? knownCourse || spokenCourse || "Other" : category;
    const dueDate = parseLocalVoiceDate(segment, now);
    const timeMatch = lower.match(/\b(?:at|by)\s+(\d{1,2})(?::(\d{1,2}))?\s*(a\.?m\.?|p\.?m\.?)?\b/);
    const dueHour = timeMatch
      ? `${Number(timeMatch[1])}:${String(Number(timeMatch[2] || 0)).padStart(2, "0")}`
      : null;
    const dueAmPm = timeMatch?.[3]
      ? timeMatch[3].toLowerCase().startsWith("a") ? "AM" : "PM"
      : null;
    const estimateMatch = lower.match(/\b(?:estimated?|takes?|about)?\s*(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)\b/);
    const estimatedMinutes = estimateMatch
      ? Math.round(Number(estimateMatch[1]) * (/hour|hr/.test(estimateMatch[2]) ? 60 : 1))
      : null;
    const priority = /\bhigh(?:\s+priority)?\b/.test(lower)
      ? "HIGH"
      : /\bmedium(?:\s+priority)?\b/.test(lower)
        ? "MED"
        : /\blow(?:\s+priority)?\b/.test(lower)
          ? "LOW"
          : null;
    const repeat = /\bevery other weekday\b/.test(lower)
      ? "EVERY_OTHER_WEEKDAY"
      : /\b(?:every day|daily)\b/.test(lower)
        ? "DAILY"
        : /\b(?:every week|weekly)\b/.test(lower)
          ? "WEEKLY"
          : /\b(?:every month|monthly)\b/.test(lower)
            ? "MONTHLY"
            : null;
    const notes = segment.match(/\bnotes?\s*(?:are|is|:)?\s+(.+?)(?=\s+(?:checklist|steps?)\b|$)/i)?.[1]?.trim() || "";
    const checklistText = segment.match(/\b(?:checklist|steps?)\s*(?:are|include|:)?\s+(.+)$/i)?.[1] || "";
    const subtasks = checklistText
      ? checklistText.split(/\s*(?:,|\band then\b|\bthen\b|\band\b)\s*/i).map((text) => ({ text: text.trim() })).filter((item) => item.text)
      : [];

    const metadataPatterns = [
      /\b(?:due|on)\s+(?:today|tomorrow|next\s+)?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
      new RegExp(`\\b(?:due\\s+)?(?:${VOICE_MONTHS.join("|")})\\s+\\d{1,2}(?:st|nd|rd|th)?`, "i"),
      /\b(?:at|by)\s+\d{1,2}(?::\d{1,2})?\s*(?:a\.?m\.?|p\.?m\.?)?/i,
      /\b(?:high|medium|low)(?:\s+priority)?\b/i,
      /\b(?:estimated?|takes?|about)?\s*\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|hrs?)\b/i,
      /\b(?:daily|weekly|monthly|every day|every week|every month|every other weekday)\b/i,
      /\bnotes?\b/i,
      /\b(?:checklist|steps?)\b/i,
    ];
    const metadataIndexes = metadataPatterns.map((pattern) => segment.search(pattern)).filter((position) => position >= 0);
    const titleEnd = metadataIndexes.length > 0 ? Math.min(...metadataIndexes) : segment.length;
    let title = segment.slice(0, titleEnd).trim().replace(/[,:;-]+$/, "");
    if (spokenCourse) {
      const suffix = ` for ${spokenCourse}`;
      if (title.toLowerCase().endsWith(suffix)) title = title.slice(0, -suffix.length).trim();
    }
    title = title.replace(/^(?:an?\s+)?assignment\s+(?:called\s+)?/i, "").trim();
    if (!title) {
      skipped.push({ reason: `Item ${index + 1} was skipped because no assignment title was understood.` });
      return [];
    }

    const assumptions = [];
    if (category === "School" && course === "Other") assumptions.push("No matching course was heard, so Other was used.");
    if (!dueDate) assumptions.push("No due date was heard.");
    if (!priority || !estimatedMinutes || !repeat) assumptions.push("Missing options use your assignment defaults.");

    return [{
      title,
      category,
      course,
      dueYear: dueDate?.getFullYear() ?? null,
      dueMonth: dueDate ? dueDate.getMonth() + 1 : null,
      dueDay: dueDate?.getDate() ?? null,
      dueHour,
      dueAmPm,
      estimatedMinutes,
      priority,
      repeat,
      notes,
      subtasks,
      assumptions,
    }];
  });

  return {
    assignments,
    assumptions: ["Voice details were interpreted in your browser."],
    skipped,
  };
}

/**
 * Main application component.
 *
 * React re-runs this function whenever state changes. React then compares the
 * returned JSX with the current page and updates only the necessary elements.
 */
function App() {
  // ---------------------------------------------------------------------------
  // USER PROFILE AND STORAGE NAMESPACES
  // ---------------------------------------------------------------------------
  // Only an authenticated account may restore a profile. Older passwordless
  // currentUser values are deliberately ignored until that profile is claimed.
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const authenticatedUser = localStorage.getItem(AUTH_USER_STORAGE_KEY) || "";
      const account = getStoredAccounts()[authenticatedUser.toLowerCase()];
      return account?.profileKey || "";
    } catch (error) {
      console.error("Error reading currentUser from localStorage:", error);
      return "";
    }
  });
  const [signInName, setSignInName] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPasswordConfirm, setAuthPasswordConfirm] = useState("");
  const [authMode, setAuthMode] = useState("signin");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  // A username becomes part of each key. This keeps one user's data separate
  // from another user's data while still using the same browser localStorage.
  const currentStorageKey = currentUser
    ? `tasks_${currentUser}`
    : "tasks_guest";
  const courseStorageKey = currentUser
    ? `courses_${currentUser}`
    : "courses_guest";
  const courseColorsStorageKey = currentUser
    ? `courseColors_${currentUser}`
    : "courseColors_guest";
  const settingsStorageKey = currentUser
    ? `settings_${currentUser}`
    : "settings_guest";
  const checklistStorageKey = currentUser
    ? `checklists_${currentUser}`
    : "checklists_guest";
  const workspaceStorageKey = currentUser
    ? `workspaceLayout_${currentUser}`
    : "workspaceLayout_guest";

  // ---------------------------------------------------------------------------
  // COURSES AND COURSE COLORS
  // ---------------------------------------------------------------------------
  // "Other" is permanent because deleted courses move their assignments there.
  const [courses, setCourses] = useState(() => {
    try {
      const storedCourses = localStorage.getItem(courseStorageKey);
      return storedCourses
        ? JSON.parse(storedCourses)
        : ["Other"];
    } catch (error) {
      console.error("Error reading courses from localStorage:", error);
      return ["Other"];
    }
  });
  const [courseColors, setCourseColors] = useState(() => {
    try {
      const storedColors = localStorage.getItem(courseColorsStorageKey);
      return storedColors ? JSON.parse(storedColors) : {};
    } catch (error) {
      console.error("Error reading course colors from localStorage:", error);
      return {};
    }
  });
  const [userSettings, setUserSettings] = useState(() => {
    try {
      const storedSettings = localStorage.getItem(settingsStorageKey);
      return storedSettings
        ? { ...DEFAULT_USER_SETTINGS, ...JSON.parse(storedSettings) }
        : DEFAULT_USER_SETTINGS;
    } catch (error) {
      console.error("Error reading user settings from localStorage:", error);
      return DEFAULT_USER_SETTINGS;
    }
  });

  const [isCustomCourse, setIsCustomCourse] = useState(false);
  const [customCourseName, setCustomCourseName] = useState("");
  const [newCourseName, setNewCourseName] = useState("");

  // ---------------------------------------------------------------------------
  // ADD ASSIGNMENT FORM
  // ---------------------------------------------------------------------------
  // These are "controlled inputs": each input displays a state value and uses
  // its onChange handler to put the user's latest typing back into that state.
  const [taskName, setTaskName] = useState("");
  const [category, setCategory] = useState(userSettings.defaultCategory || "School");
  const [selectedCourse, setSelectedCourse] = useState("");
  const [courseOverviewSelection, setCourseOverviewSelection] = useState("");
  const [dueMonth, setDueMonth] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [dueHour, setDueHour] = useState(userSettings.defaultDueTime || "11:00");
  const [dueAmPm, setDueAmPm] = useState(userSettings.defaultDueAmPm || "PM");
  const [estTime, setEstTime] = useState(String(userSettings.defaultEstimatedMinutes || ""));
  const [priority, setPriority] = useState(userSettings.defaultPriority || "MED");
  const [repeatFrequency, setRepeatFrequency] = useState(userSettings.defaultRepeat || "NONE");
  const [newSubtaskText, setNewSubtaskText] = useState("");
  const [newSubtaskDueMonth, setNewSubtaskDueMonth] = useState("");
  const [newSubtaskDueDay, setNewSubtaskDueDay] = useState("");
  const [newSubtaskDueHour, setNewSubtaskDueHour] = useState("");
  const [newSubtaskDueAmPm, setNewSubtaskDueAmPm] = useState("PM");
  const [draftSubtasks, setDraftSubtasks] = useState([]);
  const [newLinkName, setNewLinkName] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [draftLinkMessage, setDraftLinkMessage] = useState("");
  const [draftLinks, setDraftLinks] = useState([]);
  const [draftFiles, setDraftFiles] = useState([]);
  const [optionalLinksOpen, setOptionalLinksOpen] = useState(false);
  const [optionalFilesOpen, setOptionalFilesOpen] = useState(false);
  const [optionalChecklistOpen, setOptionalChecklistOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // TASK DATA, NAVIGATION, FILTERS, AND OPEN/CLOSED PANELS
  // ---------------------------------------------------------------------------
  // tasks is the app's central data array. The remaining values describe what
  // the user is currently viewing; they are interface state rather than data.
  const [tasks, setTasks] = useState([]);
  const [externalPushStatus, setExternalPushStatus] = useState(EXTERNAL_PUSH_CLIENT_ENABLED ? "idle" : "client_disabled");
  const [externalPushMessage, setExternalPushMessage] = useState("");
  const [externalPushLastSync, setExternalPushLastSync] = useState("");
  const [externalPushAction, setExternalPushAction] = useState("");
  const [externalPushDiagnostics, setExternalPushDiagnostics] = useState({ providerConnected: false, serverEnrolled: false, scheduling: "idle", lastError: "" });
  const [assignmentReminderStates, setAssignmentReminderStates] = useState({});
  const [testReminderSent, setTestReminderSent] = useState(false);
  const externalPushActionGuardRef = useRef(createReminderActionGuard());
  const [externalPushSubscriptionVersion, setExternalPushSubscriptionVersion] = useState(0);
  const externalPushSyncTimerRef = useRef(null);
  const [currentTab, setCurrentTab] = useState("dashboard");
  const [recommendationMessage, setRecommendationMessage] = useState("");
  const [recommendationStatus, setRecommendationStatus] = useState("idle");
  const [recommendationFeedback, setRecommendationFeedback] = useState("");
  const [quickMatchMinutes, setQuickMatchMinutes] = useState("");
  const [quickMatchSubmittedMinutes, setQuickMatchSubmittedMinutes] = useState(null);
  const [quickMatchPresetDraft, setQuickMatchPresetDraft] = useState("");
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendarAddOpen, setCalendarAddOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCourse, setFilterCourse] = useState("ALL");
  const [filterPriority, setFilterPriority] = useState("ALL");
  const [filterCategory, setFilterCategory] = useState("ALL");
  const [filterDueBucket, setFilterDueBucket] = useState("ALL");
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [editSubtaskText, setEditSubtaskText] = useState("");
  const [editSubtaskDueMonth, setEditSubtaskDueMonth] = useState("");
  const [editSubtaskDueDay, setEditSubtaskDueDay] = useState("");
  const [editSubtaskDueHour, setEditSubtaskDueHour] = useState("");
  const [editSubtaskDueAmPm, setEditSubtaskDueAmPm] = useState("PM");
  const [editLinkName, setEditLinkName] = useState("");
  const [editLinkUrl, setEditLinkUrl] = useState("");
  const [editLinkMessage, setEditLinkMessage] = useState("");
  const [pendingEditFiles, setPendingEditFiles] = useState([]);
  const [removedEditAttachmentIds, setRemovedEditAttachmentIds] = useState([]);
  const [editOptionalSections, setEditOptionalSections] = useState({
    files: false,
    links: false,
    checklist: false,
  });
  const schoolLevelCopy = SCHOOL_LEVEL_COPY[userSettings.schoolLevel] || SCHOOL_LEVEL_COPY.high;
  const [checklists, setChecklists] = useState(() => {
    try {
      const stored = localStorage.getItem(checklistStorageKey);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error("Error reading checklists from localStorage:", error);
      return [];
    }
  });
  const [workspaceLayout, setWorkspaceLayout] = useState(() => {
  try {
    return repairLoadedWorkspace(
      JSON.parse(localStorage.getItem(workspaceStorageKey) || "null"),
    );
  } catch (error) {
    console.error("Error reading workspace layout:", error);
    return createDefaultWorkspaceLayout();
  }
});
  const workspaceLayoutRef = useRef(workspaceLayout);
  const [voiceStatus, setVoiceStatus] = useState("idle");
  const [voiceElapsed, setVoiceElapsed] = useState(0);
  const [voiceError, setVoiceError] = useState("");
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [bulkImportText, setBulkImportText] = useState("");
  const [bulkImportPreview, setBulkImportPreview] = useState([]);
  const [bulkImportMessage, setBulkImportMessage] = useState("");
  const [bulkImportIssuesOnly, setBulkImportIssuesOnly] = useState(false);
  const [syllabusCourse, setSyllabusCourse] = useState("");
  const [syllabusFileName, setSyllabusFileName] = useState("");
  const [syllabusImportStatus, setSyllabusImportStatus] = useState("idle");
  const [syllabusExtractedText, setSyllabusExtractedText] = useState("");
  const voiceRecognitionRef = useRef(null);
  const voiceTranscriptRef = useRef("");
  const voiceTimerRef = useRef(null);
  const voiceStopTimerRef = useRef(null);
  const [copyingTask, setCopyingTask] = useState(null);
  const [copyDates, setCopyDates] = useState([]);
  const [copyResult, setCopyResult] = useState("");
  const [copyCycleFilter, setCopyCycleFilter] = useState("ALL");
  const [copyCalendarStart, setCopyCalendarStart] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [newCycleDayName, setNewCycleDayName] = useState("");
  const [filterRepeat, setFilterRepeat] = useState("ALL");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [addAssignmentOpen, setAddAssignmentOpen] = useState(true);
  const [courseColorsOpen, setCourseColorsOpen] = useState(true);
  const [completionCelebration, setCompletionCelebration] = useState(null);
  const completionCelebrationSequenceRef = useRef(0);
  const [settingsSection, setSettingsSection] = useState("personalization");
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialPracticeOpen, setTutorialPracticeOpen] = useState(false);
  const [tutorialPracticeDone, setTutorialPracticeDone] = useState([]);
  const [tutorialPracticeNote, setTutorialPracticeNote] = useState("");
  const [tutorialPracticeDate, setTutorialPracticeDate] = useState(17);
  const [tutorialPracticeHomeStep, setTutorialPracticeHomeStep] = useState(0);
  const [tutorialPracticeHiddenWidget, setTutorialPracticeHiddenWidget] = useState("");
  const [tutorialPracticeWidgetMenu, setTutorialPracticeWidgetMenu] = useState("");
  const [tutorialWidgetLayout, setTutorialWidgetLayout] = useState({
    plan: { x: 25, y: 70, width: 330, height: 135 },
    calendar: { x: 430, y: 110, width: 285, height: 135 },
    checklists: { x: 205, y: 235, width: 280, height: 120 },
  });
  const tutorialRef = useRef(null);
  const [storageView, setStorageView] = useState(null);
  const [draggedSettingsSection, setDraggedSettingsSection] = useState(null);
  const [settingsDropTarget, setSettingsDropTarget] = useState(null);
  const [appearanceSettingsOpen, setAppearanceSettingsOpen] = useState(true);
  const [personalizationTipsOpen, setPersonalizationTipsOpen] = useState(false);
  const [colorStudioOpen, setColorStudioOpen] = useState(false);
  const [colorGroupsOpen, setColorGroupsOpen] = useState({});
  const [colorTextDrafts, setColorTextDrafts] = useState({});
  const [themeSaveOpen, setThemeSaveOpen] = useState(false);
  const [newThemeName, setNewThemeName] = useState("");
  const [selectedChecklistId, setSelectedChecklistId] = useState(null);
  const [checklistSelectionMode, setChecklistSelectionMode] = useState(false);
  const [selectedChecklistIds, setSelectedChecklistIds] = useState([]);
  const [checklistNow, setChecklistNow] = useState(() => new Date());
  const [widgetsTrayOpen, setWidgetsTrayOpen] = useState(false);
  const [widgetSearch, setWidgetSearch] = useState("");
  const [helpSearch, setHelpSearch] = useState("");
  const [workspaceMode, setWorkspaceMode] = useState(() => getWorkspaceModeForWidth(Math.max(0, window.innerWidth - 48)));
  const [workspaceCanvasWidth, setWorkspaceCanvasWidth] = useState(0);
  const workspaceMainRef = useRef(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(() =>
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true,
  );
  const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition;
  const voiceRecordingSupported = Boolean(SpeechRecognitionApi);

  // ---------------------------------------------------------------------------
  // COLOR THEME
  // ---------------------------------------------------------------------------
  // Prefer the saved selection, then fall back to the operating system theme.
  const [theme, setTheme] = useState(() => {
    try {
      const storedTheme = localStorage.getItem("theme");
      return storedTheme ? storedTheme : getSystemPreference();
    } catch (error) {
      console.error("Error reading theme from localStorage:", error);
      return getSystemPreference();
    }
  });

  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  // Turn the compact values stored on a task into text suitable for the UI.
  const formatRepeatLabel = (repeat) => {
    if (repeat === "DAILY") return "Daily";
    if (repeat === "EVERY_OTHER_WEEKDAY") return "Every Other Weekday";
    if (repeat === "WEEKLY") return "Weekly";
    if (repeat === "MONTHLY") return "Monthly";
    return "Does not repeat";
  };

  // Courses without a custom choice use the app's default blue.
  const getCourseColor = (course) => {
    return courseColors[course] || "#3b82f6";
  };

  /**
   * Choose readable black or white text for a colored course badge.
   * The brightness formula gives green more visual weight because human eyes
   * perceive green as brighter than equally strong red or blue values.
   */
  const getTextColorForCourse = (course) => {
    const color = getCourseColor(course).replace("#", "");

    const r = parseInt(color.substring(0, 2), 16);
    const g = parseInt(color.substring(2, 4), 16);
    const b = parseInt(color.substring(4, 6), 16);

    const brightness = (r * 299 + g * 587 + b * 114) / 1000;

    return brightness > 160 ? "#111827" : "#ffffff";
  };

  const customColorThemes = Array.isArray(userSettings.customColorThemes)
    ? userSettings.customColorThemes.filter((colorTheme) =>
        colorTheme?.id &&
        colorTheme?.name &&
        colorTheme?.mode &&
        colorTheme?.colors
      )
    : [];
  const deletedColorThemeIds = new Set(
    Array.isArray(userSettings.deletedColorThemeIds)
      ? userSettings.deletedColorThemeIds
      : [],
  );
  const colorThemeChoices = [
    ...BUILT_IN_COLOR_THEMES.filter((colorTheme) => !deletedColorThemeIds.has(colorTheme.id)),
    ...customColorThemes,
  ];
  const activeColorThemeId = userSettings.activeColorThemeId || theme;

  // Build the one-line details shown beneath task names in several tabs.
  const formatTaskDetails = (task) => {
    const hasDate = task.dueMonth && task.dueDay;
    const monthLabel = hasDate ? monthNames[Number(task.dueMonth) - 1] : null;
    const dateLabel = hasDate
      ? `${monthLabel} ${Number(task.dueDay)}`
      : "No date";
    const normalizedDueTime = normalizeDueTime(task.dueHour);
    const timeLabel = normalizedDueTime
      ? `${normalizedDueTime} ${task.dueAmPm || ""}`
      : "No time";
    const repeatLabel =
      task.repeat && task.repeat !== "NONE"
        ? ` | 🔁 Repeats: ${formatRepeatLabel(task.repeat)}`
        : "";

    return `${getTaskCategory(task)} | 📅 Due: ${dateLabel} at ${timeLabel} | ⏱️ Est: ${task.estimatedMinutes || 0} mins | ⚠️ Priority: ${task.priority}${repeatLabel}`;
  };

  // ---------------------------------------------------------------------------
  // EFFECTS: SYNCHRONIZE REACT WITH THE BROWSER
  // ---------------------------------------------------------------------------
  // CSS reads data-theme from the root <html> element. The same effect saves
  // the choice so the theme survives a refresh.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("theme", theme);
    } catch (error) {
      console.error("Error writing theme to localStorage:", error);
    }
  }, [theme]);
  useEffect(() => {
    const scale = { xsmall: 0.7, small: 0.85, medium: 1, large: 1.25, xlarge: 1.5 }[userSettings.textSize] || 1;
    document.documentElement.style.fontSize = `${scale * 100}%`;
  }, [userSettings.textSize]);

  useEffect(() => {
    const rootStyle = document.documentElement.style;
    Object.values(COLOR_CSS_VARIABLES).flat().forEach((variable) => {
      rootStyle.removeProperty(variable);
    });
    let activeColors = userSettings.customColors || {};
    try {
      if (currentUser) {
        localStorage.setItem(LOGIN_COLORS_STORAGE_KEY, JSON.stringify(activeColors));
      } else {
        activeColors = JSON.parse(localStorage.getItem(LOGIN_COLORS_STORAGE_KEY) || "{}");
      }
    } catch (error) {
      console.error("Could not load login-screen colors:", error);
    }
    Object.entries(activeColors).forEach(([key, value]) => {
      if (!/^#[0-9a-f]{6}$/i.test(value)) return;
      (COLOR_CSS_VARIABLES[key] || []).forEach((variable) => {
        rootStyle.setProperty(variable, value);
      });
    });
    const appBarColor = normalizeHexColor(activeColors.nav || "") || THEME_COLOR_DEFAULTS[theme].nav;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", appBarColor);
  }, [currentUser, theme, userSettings.customColors]);

  useEffect(() => {
    const handleInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setIsStandalone(true);
    };
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => () => {
    window.clearInterval(voiceTimerRef.current);
    window.clearTimeout(voiceStopTimerRef.current);
    voiceRecognitionRef.current?.abort();
  }, []);

  useEffect(() => {
    const handleSubscriptionChange = () => setExternalPushSubscriptionVersion((version) => version + 1);
    const handleOnline = async () => {
      if (!currentUser) return;
      try { const result = await retryPendingExternalCleanup(currentUser); if (result.status === "cleaned") { setExternalPushStatus(userSettings.externalPushEnabled ? "sync_needed" : "idle"); setExternalPushDiagnostics((details) => clearReminderFailure(details, { scheduling: "sync_needed" })); setExternalPushMessage("Pending reminder cleanup finished."); } }
      catch (error) { setExternalPushStatus("cleanup_pending"); setExternalPushDiagnostics((details) => ({ ...details, scheduling: "cleanup_pending", lastError: String(error?.message || error) })); setExternalPushMessage("TaskCabinet will retry when you’re back online."); }
      setExternalPushSubscriptionVersion((version) => version + 1);
    };
    window.addEventListener("taskcabinet-push-subscription-change", handleSubscriptionChange);
    window.addEventListener("online", handleOnline);
    void handleOnline();
    return () => { window.removeEventListener("taskcabinet-push-subscription-change", handleSubscriptionChange); window.removeEventListener("online", handleOnline); };
  }, [currentUser, userSettings.externalPushEnabled]);

  useEffect(() => {
    if (currentUser) return;
    const pushId = new URLSearchParams(window.location.search).get("push");
    if (!pushId) return;
    const account = Object.values(getStoredAccounts()).find((candidate) => {
      try { return JSON.parse(localStorage.getItem(getPushDeviceStorageKey(candidate.profileKey)) || "null")?.profileInstallationId === pushId; } catch { return false; }
    });
    const timer = window.setTimeout(() => {
      if (account) { setSignInName(account.username || ""); setAuthError("This reminder belongs to this local profile. Sign in to open the assignment."); }
      else setAuthError("That reminder belongs to a local profile that is no longer available in this browser.");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const pushId = new URLSearchParams(window.location.search).get("push");
    const taskId = new URLSearchParams(window.location.search).get("task");
    if (!taskId) return;
    const timer = window.setTimeout(() => {
      let matchesProfile = true;
      if (pushId) { try { matchesProfile = JSON.parse(localStorage.getItem(getPushDeviceStorageKey(currentUser)) || "null")?.profileInstallationId === pushId; } catch { matchesProfile = false; } }
      if (!matchesProfile) { setExternalPushMessage("This reminder belongs to another local profile. Sign into that profile to open it."); return; }
      const matchingTask = tasks.find((task) => String(task.id) === taskId && !task.isDeleted);
      setCurrentTab(matchingTask && getTaskStatus(matchingTask) === "inProgress" ? "inProgress" : "todo");
      if (matchingTask) setExpandedTaskId(matchingTask.id);
      else setExternalPushMessage("That assignment is no longer available in this local profile.");
      window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [currentUser, tasks]);

  useEffect(() => {
    window.clearTimeout(externalPushSyncTimerRef.current);
    if (!currentUser || !userSettings.externalPushEnabled) {
      return undefined;
    }
    externalPushSyncTimerRef.current = window.setTimeout(async () => {
      setExternalPushStatus("syncing");
      try {
        const reminders = buildDesiredReminders(tasks, {
          leadMinutes: Number(userSettings.reminderMinutes || 60),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          getDeadline: getEffectiveDeadline,
        });
        const result = await reconcileExternalReminders(currentUser, reminders);
        setExternalPushStatus(result.status);
        if (result.syncedAt) setExternalPushLastSync(result.syncedAt);
        const taskByOccurrence = new Map(reminders.map((reminder) => [reminder.occurrenceKey, reminder.taskId]));
        setAssignmentReminderStates(Object.fromEntries((result.results || []).map((item) => [taskByOccurrence.get(item.occurrenceKey), ["scheduled", "pending_horizon"].includes(item.action) ? item.action : ["scheduling_failed", "cleanup_pending"].includes(item.action) ? item.action : "pending"]).filter(([taskId]) => taskId)));
        setExternalPushDiagnostics({ providerConnected: Boolean(result.device?.subscriptionId), serverEnrolled: Boolean(result.device?.token), scheduling: result.status, lastError: "" });
        setExternalPushMessage(result.status === "active" ? "Reminders are up to date." : "Some reminders could not be updated.");
      } catch (error) {
        setExternalPushStatus(error.code === "external_push_disabled" ? "server_disabled" : "failed");
        setExternalPushDiagnostics((details) => ({ ...details, scheduling: "failed", lastError: String(error?.message || error) }));
        setExternalPushMessage(friendlyReminderError(error, !navigator.onLine));
      }
    }, 800);
    return () => window.clearTimeout(externalPushSyncTimerRef.current);
  }, [currentUser, tasks, userSettings.externalPushEnabled, userSettings.reminderMinutes, externalPushSubscriptionVersion]);

  useEffect(() => {
    if (
      !currentUser ||
      !userSettings.notificationsEnabled ||
      !shouldUseOpenAppFallback(externalPushStatus) ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) {
      return undefined;
    }

    const checkReminders = async () => {
      const now = Date.now();
      const reminderWindow = Number(userSettings.reminderMinutes || 60) * 60000;
      const notificationKey = `taskacadia_notified_${currentUser}`;
      let notified = {};
      try {
        notified = JSON.parse(localStorage.getItem(notificationKey) || "{}");
      } catch {
        notified = {};
      }

      const upcomingTasks = tasks.filter((task) => {
        if (task.isArchived || task.isDeleted || getTaskStatus(task) === "completed") return false;
        const deadline = getEffectiveDeadline(task);
        if (!deadline) return false;
        const difference = deadline.getTime() - now;
        const notificationId = `${task.id}-${deadline.getTime()}`;
        return difference >= 0 && difference <= reminderWindow && !notified[notificationId];
      });

      for (const task of upcomingTasks) {
        const deadline = getEffectiveDeadline(task);
        const options = {
          body: `${task.course || task.category || "Task"} · due ${deadline.toLocaleString()}`,
          icon: "/favicon.svg",
          tag: `taskacadia-${currentUser}-${task.id}`,
        };
        try {
          if (navigator.serviceWorker?.controller) {
            const registration = await navigator.serviceWorker.ready;
            await registration.showNotification(`TaskCabinet: ${task.title}`, options);
          } else {
            new Notification(`TaskCabinet: ${task.title}`, options);
          }
          notified[`${task.id}-${deadline.getTime()}`] = new Date().toISOString();
        } catch (error) {
          console.error("Could not show assignment notification:", error);
        }
      }
      localStorage.setItem(notificationKey, JSON.stringify(notified));
    };

    checkReminders();
    const intervalId = window.setInterval(checkReminders, 60000);
    return () => window.clearInterval(intervalId);
  }, [currentUser, tasks, userSettings.notificationsEnabled, userSettings.reminderMinutes, externalPushStatus]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setChecklistNow(new Date()), 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const handleResize = () => setWorkspaceMode(getWorkspaceModeForWidth(Math.max(0, window.innerWidth - 48)));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useLayoutEffect(() => {
    const node = workspaceMainRef.current;
    if (!node) return undefined;
    const updateCanvasWidth = () => {
      const nextWidth = node.clientWidth || 0;
      setWorkspaceCanvasWidth(nextWidth);
      if (nextWidth > 0) {
        setWorkspaceMode(getWorkspaceModeForWidth(nextWidth));
      }
    };
    updateCanvasWidth();
    const resizeObserver = new ResizeObserver(updateCanvasWidth);
    resizeObserver.observe(node);
    window.addEventListener("resize", updateCanvasWidth);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateCanvasWidth);
    };
  }, [currentTab, currentUser, workspaceMode]);

  useEffect(() => {
  workspaceLayoutRef.current = workspaceLayout;
}, [workspaceLayout]);

  useEffect(() => {
    if (!currentUser || !userSettings.notificationsEnabled || !("Notification" in window) || Notification.permission !== "granted") return undefined;
    const checkChecklistReminders = async () => {
      const now = Date.now();
      const windowMs = Number(userSettings.reminderMinutes || 60) * 60000;
      const notificationKey = `taskacadia_checklist_notified_${currentUser}`;
      let notified = {};
      try { notified = JSON.parse(localStorage.getItem(notificationKey) || "{}"); } catch { /* use the empty fallback */ }
      for (const list of checklists) {
        for (const item of list.items || []) {
          if (item.isDone) continue;
          const deadline = getChecklistDeadline(item);
          if (!deadline) continue;
          const difference = deadline.getTime() - now;
          const id = `${item.id}-${deadline.getTime()}`;
          if (difference < 0 || difference > windowMs || notified[id]) continue;
          const options = { body: `${list.title || "Checklist"} · due ${deadline.toLocaleString()}`, icon: "/favicon.svg", tag: `taskcabinet-checklist-${item.id}` };
          try {
            if (navigator.serviceWorker?.controller) {
              const registration = await navigator.serviceWorker.ready;
              await registration.showNotification(`TaskCabinet: ${item.text}`, options);
            } else {
              new Notification(`TaskCabinet: ${item.text}`, options);
            }
            notified[id] = new Date().toISOString();
          } catch (error) {
            console.error("Could not show checklist notification:", error);
          }
        }
      }
      localStorage.setItem(notificationKey, JSON.stringify(notified));
    };
    checkChecklistReminders();
    const intervalId = window.setInterval(checkChecklistReminders, 60000);
    return () => window.clearInterval(intervalId);
  }, [checklists, currentUser, userSettings.notificationsEnabled, userSettings.reminderMinutes]);

  const handleInstallApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const getDesiredExternalReminders = () => buildDesiredReminders(tasks, {
    leadMinutes: Number(userSettings.reminderMinutes || 60),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    getDeadline: getEffectiveDeadline,
  });
  const getExternalReminderForTask = (task) => buildDesiredReminders([task], {
    leadMinutes: Number(userSettings.reminderMinutes || 60),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    getDeadline: getEffectiveDeadline,
  })[0] || null;

  const runImmediateReminderMutation = (taskId, operation) => {
    setAssignmentReminderStates((states) => ({ ...states, [taskId]: "pending" }));
    void operation.then(() => {
      setAssignmentReminderStates((states) => ({ ...states, [taskId]: "healthy" }));
      setExternalPushDiagnostics((details) => clearReminderFailure(details));
      if (externalPushStatus === "active") setExternalPushMessage("Reminders are up to date.");
    }).catch((error) => {
      setAssignmentReminderStates((states) => ({ ...states, [taskId]: "failed" }));
      setExternalPushDiagnostics((details) => ({ ...details, lastError: String(error?.message || error) }));
      setExternalPushStatus("sync_needed");
      setExternalPushMessage(friendlyReminderError(error, !navigator.onLine));
    });
  };

  const handleExternalPushSettingChange = async (isEnabled) => {
    if (externalPushActionGuardRef.current.isBusy()) return;
    setExternalPushAction(isEnabled ? "enabling" : "disabling"); setExternalPushMessage(""); setTestReminderSent(false);
    await externalPushActionGuardRef.current.run(async () => {
      try {
        if (!isEnabled) {
          setExternalPushStatus("syncing"); const cleanup = await cancelAllExternalReminders(currentUser); handleAddFieldSettingChange("externalPushEnabled", false);
          setExternalPushStatus(cleanup.confirmed === false ? "cleanup_pending" : "idle");
          setExternalPushMessage(cleanup.confirmed === false ? "TaskCabinet will retry when you’re back online." : "Push reminders were turned off and cleared.");
          if (cleanup.confirmed !== false) setExternalPushDiagnostics({ providerConnected: false, serverEnrolled: false, scheduling: "idle", lastError: "" });
          return;
        }
        setExternalPushStatus("connecting"); const result = await reconcileExternalReminders(currentUser, getDesiredExternalReminders(), { requestPermission: true });
        if ("Notification" in window && Notification.permission === "granted") handleAddFieldSettingChange("notificationsEnabled", true);
        setExternalPushStatus(result.status); if (result.syncedAt) setExternalPushLastSync(result.syncedAt);
        setExternalPushDiagnostics({ providerConnected: Boolean(result.device?.subscriptionId), serverEnrolled: Boolean(result.device?.token), scheduling: result.status, lastError: "" });
        if (result.status !== "active") { setExternalPushMessage(result.status === "permission_blocked" ? "Notifications are blocked in your browser settings." : "Some reminders could not be updated."); return; }
        handleAddFieldSettingChange("externalPushEnabled", true); setExternalPushMessage("Reminders are up to date.");
      } catch (error) {
        if ("Notification" in window && Notification.permission === "granted") handleAddFieldSettingChange("notificationsEnabled", true);
        setExternalPushStatus(error.code === "external_push_disabled" ? "server_disabled" : "failed");
        setExternalPushDiagnostics((details) => ({ ...details, scheduling: "failed", lastError: String(error?.message || error) }));
        setExternalPushMessage(friendlyReminderError(error, !navigator.onLine));
      }
    });
    setExternalPushAction("");
  };

  const handleExternalPushSync = async () => {
    if (externalPushActionGuardRef.current.isBusy()) return; setExternalPushAction("repairing");
    await externalPushActionGuardRef.current.run(async () => { try { setExternalPushStatus("syncing"); const result = await reconcileExternalReminders(currentUser, getDesiredExternalReminders()); setExternalPushStatus(result.status); if (result.syncedAt) setExternalPushLastSync(result.syncedAt); setExternalPushDiagnostics({ providerConnected: Boolean(result.device?.subscriptionId), serverEnrolled: Boolean(result.device?.token), scheduling: result.status, lastError: "" }); setExternalPushMessage(result.status === "active" ? "Reminder sync repaired." : "Some reminders could not be updated."); } catch (error) { setExternalPushStatus("failed"); setExternalPushDiagnostics((details) => ({ ...details, scheduling: "failed", lastError: String(error?.message || error) })); setExternalPushMessage(friendlyReminderError(error, !navigator.onLine)); } });
    setExternalPushAction("");
  };

  const handleExternalPushTest = async () => {
    if (externalPushActionGuardRef.current.isBusy()) return; setExternalPushAction("testing"); setTestReminderSent(false);
    await externalPushActionGuardRef.current.run(async () => { try { const result = await sendExternalReminderTest(currentUser); setExternalPushStatus(result.status); setExternalPushDiagnostics((details) => clearReminderFailure(details, { providerConnected: true, serverEnrolled: true })); setExternalPushMessage(result.status === "active" ? "Test sent" : "Some reminders could not be updated."); if (result.status === "active") { setTestReminderSent(true); window.setTimeout(() => { setTestReminderSent(false); setExternalPushMessage((message) => message === "Test sent" ? "Reminders are up to date." : message); }, 3000); } } catch (error) { setExternalPushStatus("failed"); setExternalPushDiagnostics((details) => ({ ...details, lastError: String(error?.message || error) })); setExternalPushMessage(friendlyReminderError(error, !navigator.onLine)); } });
    setExternalPushAction("");
  };

  const handleAddFieldSettingChange = (field, isEnabled) => {
    setUserSettings((prev) => {
      const updated = { ...prev, [field]: isEnabled };

      try {
        localStorage.setItem(settingsStorageKey, JSON.stringify(updated));
      } catch (error) {
        console.error("Failed to save user settings:", error);
      }

      return updated;
    });

    if (!isEnabled && field === "showPriority") setPriority("MED");
    if (!isEnabled && field === "showRepeat") setRepeatFrequency("NONE");
    if (!isEnabled && field === "showEstimatedMinutes") setEstTime("");
    if (!isEnabled && field === "showAssignmentLinks") {
      setOptionalLinksOpen(false);
      setNewLinkName("");
      setNewLinkUrl("");
      setDraftLinkMessage("");
      setDraftLinks([]);
    }
    if (!isEnabled && field === "showAssignmentFiles") {
      setOptionalFilesOpen(false);
      setDraftFiles([]);
    }
    if (!isEnabled && field === "showAssignmentChecklistSteps") {
      setOptionalChecklistOpen(false);
      setNewSubtaskText("");
      setNewSubtaskDueMonth("");
      setNewSubtaskDueDay("");
      setNewSubtaskDueHour("");
      setNewSubtaskDueAmPm("PM");
      setDraftSubtasks([]);
    }
  };

  const handleAssignmentDefaultChange = (field, value) => {
    handleAddFieldSettingChange(field, value);
    if (field === "defaultCategory") setCategory(value);
    if (field === "defaultPriority") setPriority(value);
    if (field === "defaultEstimatedMinutes") setEstTime(String(value));
    if (field === "defaultRepeat") setRepeatFrequency(value);
    if (field === "defaultDueTime") setDueHour(value);
    if (field === "defaultDueAmPm") setDueAmPm(value);
  };

  const handleResetPreferences = () => {
    const confirmed = window.confirm(
      "Reset appearance, assignment, calendar, reminder, and school-cycle preferences? Your assignments and courses will not be deleted.",
    );
    if (!confirmed) return;
    const resetTheme = getSystemPreference();

    const resetSettings = {
      ...DEFAULT_USER_SETTINGS,
      activeColorThemeId: resetTheme,
      cycleDayNames: [...DEFAULT_USER_SETTINGS.cycleDayNames],
      courseCycleDays: {},
      customColors: {},
      customColorThemes: [],
      deletedColorThemeIds: [],
    };
    setUserSettings(resetSettings);
    localStorage.setItem(settingsStorageKey, JSON.stringify(resetSettings));
    setTheme(resetTheme);
    setCategory(resetSettings.defaultCategory);
    setPriority(resetSettings.defaultPriority);
    setEstTime(resetSettings.defaultEstimatedMinutes);
    setRepeatFrequency(resetSettings.defaultRepeat);
    setDueHour(resetSettings.defaultDueTime);
    setDueAmPm(resetSettings.defaultDueAmPm);
  };

  const saveSettingsSectionOrder = (sections) => {
    handleAddFieldSettingChange(
      "settingsSectionOrder",
      sections.map((section) => section.id),
    );
  };

  const handleSettingsSectionDrop = (targetId, position) => {
    if (!draggedSettingsSection || draggedSettingsSection === targetId) {
      setDraggedSettingsSection(null);
      setSettingsDropTarget(null);
      return;
    }

    const reordered = getOrderedSettingsSections(userSettings.settingsSectionOrder)
      .filter((section) => section.id !== draggedSettingsSection);
    const targetIndex = reordered.findIndex((section) => section.id === targetId);
    const insertIndex = targetIndex + (position === "after" ? 1 : 0);
    const draggedSection = SETTINGS_SECTIONS.find((section) => section.id === draggedSettingsSection);
    reordered.splice(insertIndex, 0, draggedSection);
    saveSettingsSectionOrder(reordered);
    setDraggedSettingsSection(null);
    setSettingsDropTarget(null);
  };

  const handleSettingsSectionMove = (sectionId, direction) => {
    const reordered = getOrderedSettingsSections(userSettings.settingsSectionOrder);
    const currentIndex = reordered.findIndex((section) => section.id === sectionId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= reordered.length) return;
    [reordered[currentIndex], reordered[nextIndex]] = [reordered[nextIndex], reordered[currentIndex]];
    saveSettingsSectionOrder(reordered);
  };

  const handleCustomColorChange = (key, value) => {
    setUserSettings((prev) => {
      const updated = {
        ...prev,
        activeColorThemeId: "custom",
        customColors: {
          ...(prev.customColors || {}),
          [key]: value,
        },
      };

      try {
        localStorage.setItem(settingsStorageKey, JSON.stringify(updated));
      } catch (error) {
        console.error("Failed to save user settings:", error);
      }

      return updated;
    });
  };

  const handleApplyColorTheme = (themeId) => {
    const selectedTheme = colorThemeChoices
      .find((colorTheme) => colorTheme.id === themeId);

    if (!selectedTheme) return;

    setTheme(selectedTheme.mode);
    setUserSettings((prev) => {
      const updated = {
        ...prev,
        activeColorThemeId: selectedTheme.id,
        customColors:
          selectedTheme.id === "light" || selectedTheme.id === "dark"
            ? {}
            : getSafeColorThemeColors(selectedTheme.colors),
      };

      try {
        localStorage.setItem(settingsStorageKey, JSON.stringify(updated));
      } catch (error) {
        console.error("Failed to save color theme:", error);
      }

      return updated;
    });
  };

  const handleResetColorTheme = () => {
    handleApplyColorTheme(theme === "dark" ? "dark" : "light");
  };

  const handleSaveCurrentColorTheme = (event) => {
    event.preventDefault();

    const trimmedName = newThemeName.trim();
    if (!trimmedName) return;

    const themeId = `custom-${trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "theme"}-${Date.now()}`;
    const savedTheme = {
      id: themeId,
      name: trimmedName,
      mode: theme,
      colors: getSafeColorThemeColors(
        getEffectiveThemeColors(theme, userSettings.customColors),
      ),
    };

    setUserSettings((prev) => {
      const existingThemes = Array.isArray(prev.customColorThemes)
        ? prev.customColorThemes
        : [];
      const updated = {
        ...prev,
        activeColorThemeId: themeId,
        customColorThemes: [...existingThemes, savedTheme],
      };

      try {
        localStorage.setItem(settingsStorageKey, JSON.stringify(updated));
      } catch (error) {
        console.error("Failed to save custom color theme:", error);
      }

      return updated;
    });

    setNewThemeName("");
    setThemeSaveOpen(false);
  };

  const handleDeleteColorTheme = (themeId) => {
    const customThemes = Array.isArray(userSettings.customColorThemes)
      ? userSettings.customColorThemes
      : [];
    const deletedThemeIds = new Set(
      Array.isArray(userSettings.deletedColorThemeIds)
        ? userSettings.deletedColorThemeIds
        : [],
    );
    const availableThemes = [
      ...BUILT_IN_COLOR_THEMES.filter((colorTheme) => !deletedThemeIds.has(colorTheme.id)),
      ...customThemes,
    ];
    const themeToDelete = availableThemes.find((colorTheme) => colorTheme.id === themeId);
    if (!themeToDelete) return;
    if (!window.confirm(`Delete "${themeToDelete.name}"?`)) return;

    if (themeToDelete.builtIn) {
      deletedThemeIds.add(themeId);
    }

    const remainingCustomThemes = customThemes.filter((colorTheme) => colorTheme.id !== themeId);
    const remainingThemes = [
      ...BUILT_IN_COLOR_THEMES.filter((colorTheme) => !deletedThemeIds.has(colorTheme.id)),
      ...remainingCustomThemes,
    ];
    const deletingActiveTheme = activeColorThemeId === themeId;
    const fallbackTheme = deletingActiveTheme ? remainingThemes[0] : null;

    if (fallbackTheme) {
      setTheme(fallbackTheme.mode);
    }

    setUserSettings((prev) => {
      const updated = {
        ...prev,
        activeColorThemeId: fallbackTheme
          ? fallbackTheme.id
          : deletingActiveTheme
            ? "custom"
            : prev.activeColorThemeId,
        customColors: fallbackTheme
          ? fallbackTheme.id === "light" || fallbackTheme.id === "dark"
            ? {}
            : getSafeColorThemeColors(fallbackTheme.colors)
          : deletingActiveTheme
            ? {}
            : prev.customColors,
        customColorThemes: (Array.isArray(prev.customColorThemes) ? prev.customColorThemes : [])
          .filter((colorTheme) => colorTheme.id !== themeId),
        deletedColorThemeIds: [...deletedThemeIds],
      };

      try {
        localStorage.setItem(settingsStorageKey, JSON.stringify(updated));
      } catch (error) {
        console.error("Failed to delete color theme:", error);
      }

      return updated;
    });
  };

  const handleRestoreDefaultColorThemes = () => {
    setUserSettings((prev) => {
      const updated = {
        ...prev,
        deletedColorThemeIds: [],
      };

      try {
        localStorage.setItem(settingsStorageKey, JSON.stringify(updated));
      } catch (error) {
        console.error("Failed to restore default color themes:", error);
      }

      return updated;
    });
  };

  const clearColorTextDraft = (draftKey) => {
    setColorTextDrafts((drafts) => {
      if (!(draftKey in drafts)) return drafts;
      const updatedDrafts = { ...drafts };
      delete updatedDrafts[draftKey];
      return updatedDrafts;
    });
  };

  const commitColorTextDraft = (draftKey, currentValue, onValidColor) => {
    const normalizedColor = normalizeHexColor(
      colorTextDrafts[draftKey] ?? currentValue,
    );
    if (normalizedColor) onValidColor(normalizedColor);
    clearColorTextDraft(draftKey);
  };

  const handleAddCycleDay = () => {
    const name = newCycleDayName.trim();
    const dayNames = userSettings.cycleDayNames || ["A Day", "B Day"];
    if (!name || dayNames.some((item) => item.toLowerCase() === name.toLowerCase())) return;
    handleAddFieldSettingChange("cycleDayNames", [...dayNames, name]);
    setNewCycleDayName("");
  };

  const handleRemoveCycleDay = (dayName) => {
    const dayNames = userSettings.cycleDayNames || ["A Day", "B Day"];
    if (dayNames.length <= 2) {
      alert("Keep at least two school-day labels.");
      return;
    }
    handleAddFieldSettingChange(
      "cycleDayNames",
      dayNames.filter((item) => item !== dayName),
    );
    const updatedMapping = Object.fromEntries(
      Object.entries(userSettings.courseCycleDays || {}).map(([course, days]) => [
        course,
        Array.isArray(days) ? days.filter((item) => item !== dayName) : [],
      ]),
    );
    handleAddFieldSettingChange("courseCycleDays", updatedMapping);
  };

  const handleCourseCycleDayToggle = (course, dayName, isChecked) => {
    const mapping = userSettings.courseCycleDays || {};
    const currentDays = Array.isArray(mapping[course])
      ? mapping[course]
      : userSettings.cycleDayNames || ["A Day", "B Day"];
    const updatedDays = isChecked
      ? [...new Set([...currentDays, dayName])]
      : currentDays.filter((item) => item !== dayName);
    handleAddFieldSettingChange("courseCycleDays", {
      ...mapping,
      [course]: updatedDays,
    });
  };
  // Whenever the active profile changes, load that profile's saved datasets.
  // If stored JSON is damaged or unavailable, use safe empty/default values.
  // This effect intentionally copies an external browser data source into React
  // state. The targeted lint exception documents that profile switching is the
  // synchronization event, rather than an accidental state-calculation effect.
  useEffect(() => {
    try {
      const rawTasks = localStorage.getItem(currentStorageKey);
      setTasks(rawTasks ? JSON.parse(rawTasks) : []);

      const rawCourses = localStorage.getItem(courseStorageKey);
      setCourses(
        rawCourses
          ? JSON.parse(rawCourses)
          : ["Other"],
      );

      const rawCourseColors = localStorage.getItem(courseColorsStorageKey);
      setCourseColors(rawCourseColors ? JSON.parse(rawCourseColors) : {});

      const rawSettings = localStorage.getItem(settingsStorageKey);
      const loadedSettings = rawSettings
        ? { ...DEFAULT_USER_SETTINGS, ...JSON.parse(rawSettings) }
        : DEFAULT_USER_SETTINGS;
      setUserSettings(loadedSettings);
      const rawChecklists = localStorage.getItem(checklistStorageKey);
      setChecklists(rawChecklists ? JSON.parse(rawChecklists) : []);
      const rawWorkspace = localStorage.getItem(workspaceStorageKey);
      const loadedWorkspace = repairLoadedWorkspace(
        rawWorkspace ? JSON.parse(rawWorkspace) : null,
      );

      workspaceLayoutRef.current = loadedWorkspace;
      setWorkspaceLayout(loadedWorkspace);
      setSelectedChecklistId(null);
      setCategory(loadedSettings.defaultCategory);
      setPriority(loadedSettings.defaultPriority);
      setEstTime(String(loadedSettings.defaultEstimatedMinutes || ""));
      setRepeatFrequency(loadedSettings.defaultRepeat);
      setDueHour(loadedSettings.defaultDueTime);
      setDueAmPm(loadedSettings.defaultDueAmPm);
    } catch (error) {
      console.error("Failed to load user data from localStorage:", error);
      setTasks([]);
      setCourses(["Other"]);
      setCourseColors({});
      setUserSettings(DEFAULT_USER_SETTINGS);
      setChecklists([]);
      setWorkspaceLayout(createDefaultWorkspaceLayout());
      setCategory(DEFAULT_USER_SETTINGS.defaultCategory);
      setPriority(DEFAULT_USER_SETTINGS.defaultPriority);
      setEstTime(DEFAULT_USER_SETTINGS.defaultEstimatedMinutes);
      setRepeatFrequency(DEFAULT_USER_SETTINGS.defaultRepeat);
      setDueHour(DEFAULT_USER_SETTINGS.defaultDueTime);
      setDueAmPm(DEFAULT_USER_SETTINGS.defaultDueAmPm);
    }

    setIsCustomCourse(false);
    setCustomCourseName("");
  }, [
    currentStorageKey,
    courseStorageKey,
    courseColorsStorageKey,
    settingsStorageKey,
    checklistStorageKey,
    workspaceStorageKey,
  ]);
  useEffect(() => {
    if (!tutorialOpen) return undefined;
    const previousFocus = document.activeElement;
    const dialog = tutorialRef.current;
    dialog?.focus();
    const handleTutorialKeys = (event) => {
      if (event.key === "Escape") {
        localStorage.setItem(getTutorialStorageKey(currentUser), JSON.stringify({ complete: true }));
        setTutorialOpen(false);
      }
      if (event.key !== "Tab" || !dialog) return;
      const controls = [...dialog.querySelectorAll("button:not([disabled])")];
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleTutorialKeys);
    return () => {
      document.removeEventListener("keydown", handleTutorialKeys);
      previousFocus?.focus?.();
    };
  }, [currentUser, tutorialOpen]);

  useEffect(() => {
    if (!currentUser) return;
    try {
      const saved = localStorage.getItem(getTutorialStorageKey(currentUser));
      if (saved && JSON.parse(saved).complete === false) {
        setTutorialStep(0);
        setTutorialOpen(true);
      }
    } catch { /* A damaged optional tutorial flag must never block the planner. */ }
  }, [currentUser]);

  const finishTutorial = () => {
    localStorage.setItem(getTutorialStorageKey(currentUser), JSON.stringify({ complete: true }));
    setTutorialOpen(false);
    setTutorialStep(0);
    setTutorialPracticeOpen(false);
  };

  const openTutorialPractice = () => {
    setTutorialPracticeDone([]);
    setTutorialPracticeNote("");
    setTutorialPracticeDate(17);
    setTutorialPracticeHomeStep(tutorialStep);
    setTutorialPracticeHiddenWidget("");
    setTutorialPracticeWidgetMenu("");
    setTutorialWidgetLayout({ plan: { x: 25, y: 70, width: 330, height: 135 }, calendar: { x: 430, y: 110, width: 285, height: 135 }, checklists: { x: 205, y: 235, width: 280, height: 120 } });
    setTutorialPracticeOpen(true);
  };

  const startTutorialWidgetInteraction = (event, id, edges = null) => {
    event.preventDefault();
    event.stopPropagation();
    const canvas = event.currentTarget.closest(".practice-workspace");
    if (!canvas) return;
    const start = tutorialWidgetLayout[id];
    const startX = event.clientX;
    const startY = event.clientY;
    const move = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      setTutorialWidgetLayout((layout) => {
        const current = layout[id];
        if (!edges) {
          return { ...layout, [id]: { ...current, x: Math.max(0, Math.min(canvas.clientWidth - current.width, start.x + dx)), y: Math.max(55, Math.min(canvas.clientHeight - current.height, start.y + dy)) } };
        }
        let { x, y, width, height } = start;
        if (edges.right) width = Math.max(180, Math.min(canvas.clientWidth - x, start.width + dx));
        if (edges.bottom) height = Math.max(100, Math.min(canvas.clientHeight - y, start.height + dy));
        if (edges.left) { const nextX = Math.max(0, Math.min(start.x + start.width - 180, start.x + dx)); width = start.width + start.x - nextX; x = nextX; }
        if (edges.top) { const nextY = Math.max(55, Math.min(start.y + start.height - 100, start.y + dy)); height = start.height + start.y - nextY; y = nextY; }
        return { ...layout, [id]: { x, y, width, height } };
      });
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  // ---------------------------------------------------------------------------
  // EVENT HANDLERS: CREATE AND UPDATE DATA
  // ---------------------------------------------------------------------------
  // Event handlers run in response to an action such as a click or form submit.
  // Any handler that changes task data also saves the resulting array.

  /** Add one optional checklist step to the unsaved Add Assignment form. */
  const handleAddDraftSubtask = () => {
    const hasAnyDeadline = Boolean(
      newSubtaskDueMonth || newSubtaskDueDay || newSubtaskDueHour,
    );
    const normalizedTime = normalizeDueTime(newSubtaskDueHour);
    if (
      hasAnyDeadline &&
      (!newSubtaskDueMonth || !newSubtaskDueDay || !normalizedTime)
    ) {
      alert("Choose a checklist month, day, and valid time together.");
      return;
    }
    const newSubtask = createSubtask(newSubtaskText, {
      dueMonth: newSubtaskDueMonth,
      dueDay: newSubtaskDueDay,
      dueHour: hasAnyDeadline ? normalizedTime : "",
      dueAmPm: newSubtaskDueAmPm,
    });

    if (!newSubtask) return;

    setDraftSubtasks((prev) => [...prev, newSubtask]);
    setNewSubtaskText("");
    setNewSubtaskDueMonth("");
    setNewSubtaskDueDay("");
    setNewSubtaskDueHour("");
    setNewSubtaskDueAmPm("PM");
  };

  const handleAddDraftLink = () => {
    const name = newLinkName.trim();
    const url = normalizeWebUrl(newLinkUrl);
    if (!name && !newLinkUrl.trim()) {
      setDraftLinkMessage("");
      return false;
    }
    if (!name || !newLinkUrl.trim()) {
      setDraftLinkMessage("Enter both a link name and web address.");
      return false;
    }
    if (!url) {
      setDraftLinkMessage("Enter a valid http/https web address.");
      return false;
    }
    const isDuplicate = draftLinks.some(
      (link) =>
        link.name.trim().toLowerCase() === name.toLowerCase() &&
        normalizeWebUrl(link.url) === url,
    );
    if (isDuplicate) {
      setDraftLinkMessage("That link is already in the links list.");
      return false;
    }
    setDraftLinks((prev) => [
      ...prev,
      { id: Date.now() + Math.random(), name, url },
    ]);
    setNewLinkName("");
    setNewLinkUrl("");
    setDraftLinkMessage(`Added “${name}” to the links list.`);
    return true;
  };

  const handleFileSelection = (fileList, setter) => {
    const files = Array.from(fileList || []);
    const accepted = files.filter((file) => file.size <= 10 * 1024 * 1024);
    if (accepted.length !== files.length) {
      alert("Files larger than 10 MB were skipped.");
    }
    setter((prev) => [...prev, ...accepted]);
  };

  const handleAttachmentDownload = async (attachment) => {
    try {
      const blob = await getAttachmentFile(attachment.id);
      if (!blob) {
        alert("This local file is no longer available in this browser.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = attachment.name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error("Failed to open attachment:", error);
      alert("This browser could not open the attachment.");
    }
  };

  /** Remove one optional checklist step before the assignment is saved. */
  const handleRemoveDraftSubtask = (subtaskId) => {
    setDraftSubtasks((prev) =>
      prev.filter((subtask) => subtask.id !== subtaskId),
    );
  };

  /** Add one task, optionally add its custom course, and reset the form. */
  const handleAddTask = async (e) => {
    e.preventDefault();

    const finalCourse = category === "School"
      ? isCustomCourse
        ? customCourseName.trim()
        : selectedCourse
      : category;
    const normalizedDueTime = normalizeDueTime(dueHour);

    if (!taskName || !finalCourse) return;

    if (newLinkName.trim() || newLinkUrl.trim()) {
      setDraftLinkMessage(
        "Finish both link fields and leave the field so the link can be added before saving.",
      );
      return;
    }

    if (!normalizedDueTime) {
      alert("Enter a due time from 1:00 through 12:59.");
      return;
    }

    if (category === "School" && isCustomCourse && !courses.includes(finalCourse)) {
      const updatedCourses = [...courses, finalCourse].sort();
      setCourses(updatedCourses);
      try {
        localStorage.setItem(courseStorageKey, JSON.stringify(updatedCourses));
      } catch (error) {
        console.error("Failed to save updated courses list:", error);
      }
    }

    const newTaskId = Date.now();
    let attachments;
    try {
      attachments = await Promise.all(
        draftFiles.map(async (file, index) => {
          const id = `${newTaskId}-file-${index}-${Math.random().toString(36).slice(2)}`;
          await putAttachmentFile(id, file);
          return { id, name: file.name, type: file.type, size: file.size };
        }),
      );
    } catch (error) {
      console.error("Failed to save attachment:", error);
      alert("The selected file could not be stored in this browser.");
      return;
    }

    const newTask = {
      id: newTaskId,
      title: taskName,
      category,
      course: finalCourse,
      dueMonth: dueMonth,
      dueDay: dueDay,
      dueHour: normalizedDueTime,
      dueAmPm: dueAmPm,
      estimatedMinutes: estTime,
      priority: priority,
      repeat: repeatFrequency,
      isCompleted: false,
      status: "todo",
      notes: "",
      subtasks: draftSubtasks,
      links: draftLinks,
      attachments,
    };

    setTasks((prev) => {
      const updated = [...prev, newTask];
      try {
        localStorage.setItem(currentStorageKey, JSON.stringify(updated));
      } catch (error) {
        console.error("Failed to save tasks:", error);
      }
      return updated;
    });

    if (userSettings.externalPushEnabled) {
      const reminder = getExternalReminderForTask(newTask);
      if (reminder) runImmediateReminderMutation(newTask.id, scheduleExternalReminder(currentUser, reminder));
    }

    // Return the form to friendly defaults after a successful submission.
    setTaskName("");
    setCategory(userSettings.defaultCategory || "School");
    setSelectedCourse("");
    setCustomCourseName("");
    setIsCustomCourse(false);
    setDueMonth("");
    setDueDay("");
    setDueHour(userSettings.defaultDueTime || "11:00");
    setDueAmPm(userSettings.defaultDueAmPm || "PM");
    setEstTime(String(userSettings.defaultEstimatedMinutes || ""));
    setPriority(userSettings.defaultPriority || "MED");
    setRepeatFrequency(userSettings.defaultRepeat || "NONE");
    setNewSubtaskText("");
    setDraftSubtasks([]);
    setNewSubtaskDueMonth("");
    setNewSubtaskDueDay("");
    setNewSubtaskDueHour("");
    setNewSubtaskDueAmPm("PM");
    setNewLinkName("");
    setNewLinkUrl("");
    setDraftLinks([]);
    setDraftLinkMessage("");
    setDraftFiles([]);
    setOptionalLinksOpen(false);
    setOptionalFilesOpen(false);
    setOptionalChecklistOpen(false);

    if (currentTab === "calendar") {
      setCalendarAddOpen(false);
    } else if (currentTab === "dashboard") {
      setAddAssignmentOpen(false);
    }
  };

  /** Save a new color under the selected course name. */
  const handleCourseColorChange = (course, color) => {
    setCourseColors((prev) => {
      const updated = {
        ...prev,
        [course]: color,
      };

      try {
        localStorage.setItem(courseColorsStorageKey, JSON.stringify(updated));
      } catch (error) {
        console.error("Failed to save course colors:", error);
      }

      return updated;
    });
  };

  /**
   * Delete a course safely.
   * Existing tasks are not deleted; they are reassigned to "Other" instead.
   */
  const handleDeleteCourse = (courseToDelete) => {
    if (courseToDelete === "Other") {
      alert('The "Other" course cannot be deleted.');
      return;
    }

    const confirmDelete = window.confirm(
      `Delete "${courseToDelete}"? Any assignments using this course will be moved to "Other".`,
    );

    if (!confirmDelete) return;

    const updatedCourses = courses.filter(
      (course) => course !== courseToDelete,
    );

    setCourses(updatedCourses);

    try {
      localStorage.setItem(courseStorageKey, JSON.stringify(updatedCourses));
    } catch (error) {
      console.error("Failed to save courses after deleting course:", error);
    }

    setCourseColors((prev) => {
      const updatedColors = { ...prev };
      delete updatedColors[courseToDelete];

      try {
        localStorage.setItem(
          courseColorsStorageKey,
          JSON.stringify(updatedColors),
        );
      } catch (error) {
        console.error(
          "Failed to save course colors after deleting course:",
          error,
        );
      }

      return updatedColors;
    });

    setTasks((prev) => {
      const updatedTasks = prev.map((task) =>
        task.course === courseToDelete ? { ...task, course: "Other" } : task,
      );

      saveTasksForCurrentUser(updatedTasks);
      return updatedTasks;
    });
  };

  // Keeping localStorage writing in one helper prevents repeated try/catch code
  // throughout the task handlers below.
  const saveTasksForCurrentUser = (updated) => {
    try {
      localStorage.setItem(currentStorageKey, JSON.stringify(updated));
    } catch (error) {
      console.error("Failed to save tasks to localStorage:", error);
    }
  };

  const saveCoursesForCurrentUser = (updatedCourses) => {
    try {
      localStorage.setItem(courseStorageKey, JSON.stringify(updatedCourses));
    } catch (error) {
      console.error("Failed to save courses to localStorage:", error);
    }
  };

  const handleAddCourse = (event) => {
    event.preventDefault();

    const trimmedCourseName = newCourseName.trim();

    if (!trimmedCourseName) return;

    const courseAlreadyExists = courses.some(
      (course) => course.toLowerCase() === trimmedCourseName.toLowerCase(),
    );

    if (courseAlreadyExists) {
      alert(`"${trimmedCourseName}" is already in your course list.`);
      return;
    }

    const updatedCourses = [...courses, trimmedCourseName].sort();
    setCourses(updatedCourses);
    saveCoursesForCurrentUser(updatedCourses);
    setNewCourseName("");
  };

  const handleApplyVoiceAssignments = (payload, createdAt, source = "voice") => {
    const parsedAssignments = Array.isArray(payload?.assignments)
      ? payload.assignments.slice(0, source === "paste" ? 50 : 10)
      : [];
    const currentYear = new Date().getFullYear();
    const skipped = Array.isArray(payload?.skipped)
      ? payload.skipped.filter(Boolean).map((item) => String(item.reason || item))
      : [];
    const newCourseNames = new Set();

    const createdTasks = parsedAssignments.flatMap((assignment, index) => {
      const title = String(assignment?.title || "").trim();
      if (!title) {
        skipped.push(`Assignment ${index + 1} was skipped because no title was understood.`);
        return [];
      }
      const parsedCategory = TASK_CATEGORIES.includes(assignment.category)
        ? assignment.category
        : userSettings.defaultCategory || "School";
      let parsedCourse = parsedCategory;
      if (parsedCategory === "School") {
        parsedCourse = String(assignment.course || "Other").trim() || "Other";
        if (!courses.includes(parsedCourse)) newCourseNames.add(parsedCourse);
      }

      const dueYear = Number(assignment.dueYear);
      const dueMonthNumber = Number(assignment.dueMonth);
      const dueDayNumber = Number(assignment.dueDay);
      const hasValidCurrentYearDate =
        (!dueYear || dueYear === currentYear) &&
        dueMonthNumber >= 1 && dueMonthNumber <= 12 &&
        dueDayNumber >= 1 && dueDayNumber <= 31;
      if (dueYear && dueYear !== currentYear) {
        const warning = `${title} was added without its ${dueYear} due date because TaskCabinet currently stores month and day only.`;
        if (source === "voice") setVoiceError(warning);
        else setBulkImportMessage(warning);
      }

      const normalizedTime = normalizeDueTime(assignment.dueHour) ||
        normalizeDueTime(userSettings.defaultDueTime) || "11:00";
      const parsedPriority = ["LOW", "MED", "HIGH"].includes(assignment.priority)
        ? assignment.priority
        : userSettings.defaultPriority || "MED";
      const parsedRepeat = ["NONE", "DAILY", "EVERY_OTHER_WEEKDAY", "WEEKLY", "MONTHLY"].includes(assignment.repeat)
        ? assignment.repeat
        : userSettings.defaultRepeat || "NONE";
      const parsedEstimate = Number(assignment.estimatedMinutes);
      const subtasks = Array.isArray(assignment.subtasks)
        ? assignment.subtasks.slice(0, 20).flatMap((subtask, subtaskIndex) => {
            const text = String(subtask?.text || "").trim();
            if (!text) return [];
            return [{
              id: `${createdAt}-${index}-${source}-step-${subtaskIndex}`,
              text,
              isDone: false,
              dueMonth: "",
              dueDay: "",
              dueHour: "",
              dueAmPm: "PM",
            }];
          })
        : [];

      return [{
        id: `${createdAt}-task-${index}`,
        title,
        category: parsedCategory,
        course: parsedCourse,
        dueMonth: hasValidCurrentYearDate ? String(dueMonthNumber).padStart(2, "0") : "",
        dueDay: hasValidCurrentYearDate ? String(dueDayNumber).padStart(2, "0") : "",
        dueHour: normalizedTime,
        dueAmPm: assignment.dueAmPm === "AM" ? "AM" : assignment.dueAmPm === "PM" ? "PM" : userSettings.defaultDueAmPm || "PM",
        estimatedMinutes: Number.isFinite(parsedEstimate) && parsedEstimate >= 0
          ? String(Math.min(Math.round(parsedEstimate), 1440))
          : String(userSettings.defaultEstimatedMinutes || ""),
        priority: parsedPriority,
        repeat: parsedRepeat,
        isCompleted: false,
        status: "todo",
        notes: String(assignment.notes || "").trim(),
        subtasks,
        links: [],
        attachments: [],
        isArchived: false,
        archivedAt: null,
        isDeleted: false,
        deletedAt: null,
        createdByVoice: source === "voice",
        voiceUndoLocked: false,
        voiceCreatedCourse: source === "voice" && parsedCategory === "School" && !courses.includes(parsedCourse)
          ? parsedCourse
          : "",
      }];
    });

    if (createdTasks.length === 0) {
      throw new Error(skipped[0] || `No usable assignments were found in that ${source === "paste" ? "list" : "recording"}.`);
    }

    const updatedTasks = [...tasks, ...createdTasks];
    setTasks(updatedTasks);
    saveTasksForCurrentUser(updatedTasks);

    const trulyNewCourses = [...newCourseNames].filter((course) => !courses.includes(course));
    if (trulyNewCourses.length > 0) {
      const updatedCourses = [...new Set([...courses, ...trulyNewCourses])].sort();
      setCourses(updatedCourses);
      saveCoursesForCurrentUser(updatedCourses);
    }
    return createdTasks.length;
  };

  const parseBulkImportText = (value, forcedCourse = "") => {
    setBulkImportMessage("");
    setBulkImportIssuesOnly(false);
    const prepared = preparePastedAssignmentLines(value);
    const parsed = prepared.flatMap((entry, index) => {
      let text = entry.text;
      let courseHint = entry.courseHint;
      const prefixedCourse = courses.find((course) => text.toLowerCase().startsWith(`${course.toLowerCase()}:`) || text.toLowerCase().startsWith(`${course.toLowerCase()} -`));
      if (prefixedCourse) {
        courseHint = prefixedCourse;
        text = text.replace(new RegExp(`^${prefixedCourse.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:-]\\s*`, "i"), "");
      }
      const result = parseLocalVoiceAssignments(text, courses, {
        category: userSettings.defaultCategory,
        priority: userSettings.defaultPriority,
        estimatedMinutes: userSettings.defaultEstimatedMinutes,
        repeat: userSettings.defaultRepeat,
        dueTime: userSettings.defaultDueTime,
        dueAmPm: userSettings.defaultDueAmPm,
      });
      const assignment = result.assignments[0];
      if (!assignment) return [];
      return [{ ...assignment, course: forcedCourse || courseHint || assignment.course, previewId: `${index}-${crypto.randomUUID()}`, selected: true }];
    });
    setBulkImportPreview(parsed);
    setBulkImportMessage(parsed.length > 0 ? `Review ${parsed.length} assignment${parsed.length === 1 ? "" : "s"} before adding them.` : "No assignment lines could be understood. Put one assignment on each line.");
    return parsed;
  };

  const handleParseBulkImport = () => parseBulkImportText(bulkImportText);

  const handleSyllabusFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBulkImportOpen(true);
    setBulkImportPreview([]);
    setBulkImportMessage("");
    setSyllabusFileName(file.name);
    setSyllabusImportStatus("reading");
    try {
      const { extractSyllabusText, findLikelySyllabusAssignments } = await import("./syllabusImport.js");
      const extractedText = await extractSyllabusText(file);
      setSyllabusExtractedText(extractedText);
      const likelyAssignments = findLikelySyllabusAssignments(extractedText);
      if (!likelyAssignments) {
        setBulkImportText(extractedText);
        setBulkImportMessage("The file was read, but no dated assignment lines were identified automatically. Edit the extracted text so each assignment is on its own line, then choose Review Assignments.");
        setSyllabusImportStatus("needs-review");
        return;
      }
      setBulkImportText(likelyAssignments);
      const parsed = parseBulkImportText(likelyAssignments, syllabusCourse || courses[0] || "Other");
      setBulkImportMessage(`${file.name} was read locally. Review the ${parsed.length} suggested assignment${parsed.length === 1 ? "" : "s"} before adding them.`);
      setSyllabusImportStatus("ready");
    } catch (error) {
      setBulkImportMessage(error.message || "The syllabus could not be read.");
      setSyllabusImportStatus("error");
    }
  };

  const handleBulkPreviewChange = (previewId, field, value) => {
    setBulkImportPreview((items) => items.map((item) => item.previewId === previewId ? { ...item, [field]: value } : item));
  };

  const handleBulkPreviewSelectAll = (selected) => {
    setBulkImportPreview((items) => items.map((item) => ({ ...item, selected })));
  };

  const handleBulkPreviewSelectReady = () => {
    setBulkImportPreview((items) => items.map((item) => ({
      ...item,
      selected: getBulkImportWarnings(item).length === 0,
    })));
    setBulkImportIssuesOnly(true);
  };

  const getBulkImportWarnings = (item) => {
    const currentYear = new Date().getFullYear();
    const warnings = new Set(
      (Array.isArray(item.assumptions) ? item.assumptions : [])
        .filter(Boolean)
        .map((warning) => String(warning)),
    );
    if (!item.dueMonth || !item.dueDay) warnings.add("Missing due date. Add month and day before importing if this should appear on the calendar.");
    if (Number(item.dueYear) && Number(item.dueYear) !== currentYear) warnings.add(`${item.dueYear} date will be skipped until TaskCabinet supports full-year dates.`);
    if (!item.course || item.course === "Other") warnings.add("Course is unclear. Choose a course if this belongs somewhere specific.");
    if (!item.estimatedMinutes) warnings.add("No estimate yet. Recommendations work better with minutes.");
    return [...warnings];
  };

  const handleBulkImportSubmit = () => {
    const selected = bulkImportPreview.filter((item) => item.selected && String(item.title || "").trim());
    if (selected.length === 0) {
      setBulkImportMessage("Select at least one assignment with a title.");
      return;
    }
    try {
      const count = handleApplyVoiceAssignments({ assignments: selected, skipped: [] }, crypto.randomUUID(), "paste");
      setBulkImportPreview([]);
      setBulkImportText("");
      setBulkImportIssuesOnly(false);
      setSyllabusFileName("");
      setSyllabusImportStatus("idle");
      setSyllabusExtractedText("");
      setBulkImportMessage(`${count} assignment${count === 1 ? "" : "s"} added to To Do.`);
    } catch (error) {
      setBulkImportMessage(error.message || "The assignments could not be added.");
    }
  };

  const handleVoiceStop = () => {
    window.clearTimeout(voiceStopTimerRef.current);
    voiceRecognitionRef.current?.stop();
  };

  const handleVoiceStart = () => {
    setVoiceError("");
    const voiceBatchId = crypto.randomUUID();
    try {
      const recognition = new SpeechRecognitionApi();
      let recognitionFailed = false;
      recognition.lang = navigator.language || "en-US";
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      voiceRecognitionRef.current = recognition;
      voiceTranscriptRef.current = "";
      setVoiceElapsed(0);

      recognition.addEventListener("result", (event) => {
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          if (event.results[index].isFinal) {
            voiceTranscriptRef.current += `${event.results[index][0].transcript} `;
          }
        }
      });
      recognition.addEventListener("error", (event) => {
        recognitionFailed = true;
        window.clearInterval(voiceTimerRef.current);
        window.clearTimeout(voiceStopTimerRef.current);
        voiceRecognitionRef.current = null;
        const messages = {
          "not-allowed": "Microphone access was not allowed. You can still add assignments manually.",
          "audio-capture": "No working microphone was found.",
          "no-speech": "No speech was heard. Please try again and speak clearly.",
          network: "The browser's speech service is unavailable. Please try again.",
        };
        setVoiceError(messages[event.error] || "The browser could not recognize that recording.");
        setVoiceStatus("idle");
      }, { once: true });
      recognition.addEventListener("end", () => {
        window.clearInterval(voiceTimerRef.current);
        window.clearTimeout(voiceStopTimerRef.current);
        voiceRecognitionRef.current = null;
        if (recognitionFailed) return;
        const transcript = voiceTranscriptRef.current.trim();
        if (!transcript) {
          setVoiceError("No speech was heard. Please try again and speak clearly.");
          setVoiceStatus("idle");
          return;
        }
        setVoiceStatus("processing");
        try {
          const payload = parseLocalVoiceAssignments(transcript, courses, {
            category: userSettings.defaultCategory,
            priority: userSettings.defaultPriority,
            estimatedMinutes: userSettings.defaultEstimatedMinutes,
            repeat: userSettings.defaultRepeat,
            dueTime: userSettings.defaultDueTime,
            dueAmPm: userSettings.defaultDueAmPm,
          });
          handleApplyVoiceAssignments(payload, voiceBatchId);
        } catch (error) {
          setVoiceError(error.message || "The spoken assignment could not be understood.");
        } finally {
          voiceTranscriptRef.current = "";
          setVoiceStatus("idle");
        }
      }, { once: true });

      recognition.start();
      setVoiceStatus("recording");
      voiceTimerRef.current = window.setInterval(() => {
        setVoiceElapsed((seconds) => Math.min(seconds + 1, 90));
      }, 1000);
      voiceStopTimerRef.current = window.setTimeout(handleVoiceStop, 90000);
    } catch {
      setVoiceError("Microphone access was not allowed. You can still add assignments manually.");
      setVoiceStatus("idle");
    }
  };

  const handleUndoVoiceAdd = (id) => {
    const taskToUndo = tasks.find((task) => task.id === id && canUndoVoiceCreation(task));
    if (!taskToUndo) return;
    const remainingTasks = tasks.filter((task) => task.id !== id);
    setTasks(remainingTasks);
    saveTasksForCurrentUser(remainingTasks);
    getSafeAttachments(taskToUndo).forEach((attachment) => {
      const isStillReferenced = remainingTasks.some((task) =>
        getSafeAttachments(task).some((item) => item.id === attachment.id),
      );
      if (!isStillReferenced) {
        deleteAttachmentFile(attachment.id).catch((error) =>
          console.error("Failed to remove voice assignment attachment:", error),
        );
      }
    });

    const shouldRemoveCreatedCourse =
      taskToUndo.voiceCreatedCourse &&
      !remainingTasks.some((task) => task.course === taskToUndo.voiceCreatedCourse);
    const updatedCourses = shouldRemoveCreatedCourse
      ? courses.filter((course) => course !== taskToUndo.voiceCreatedCourse)
      : courses;
    if (updatedCourses.length !== courses.length) {
      setCourses(updatedCourses);
      saveCoursesForCurrentUser(updatedCourses);
      setCourseColors((previousColors) => {
        const updatedColors = { ...previousColors };
        delete updatedColors[taskToUndo.voiceCreatedCourse];
        try {
          localStorage.setItem(courseColorsStorageKey, JSON.stringify(updatedColors));
        } catch (error) {
          console.error("Failed to remove voice-created course color:", error);
        }
        return updatedColors;
      });
    }
    setVoiceError("");
  };

  /**
   * Return a new task array with one assignment completed.
   *
   * This central helper keeps the Complete button and checklist auto-complete
   * behavior identical. Repeating tasks still create their next occurrence, and
   * that new occurrence starts fresh in To Do with unchecked checklist steps.
   */
  const completeTaskList = (taskList, id) => {
    const taskToComplete = taskList.find((task) => task.id === id);

    if (!taskToComplete) return taskList;

    const completedTasks = taskList.map((task) => {
      if (task.id !== id) return task;

      const subtasks = getSafeSubtasks(task);

      return {
        ...task,
        isCompleted: true,
        status: "completed",
        subtasks: subtasks.map((subtask) => ({
          ...subtask,
          isDone: true,
        })),
      };
    });

    const nextRepeatingTask = getNextRepeatingTask(taskToComplete);

    const repeatingDateAlreadyExists = nextRepeatingTask
      ? completedTasks.some((task) => {
          const taskGroupId = task.copyGroupId || task.id;
          return (
            String(taskGroupId) === String(nextRepeatingTask.copyGroupId) &&
            Number(task.dueMonth) === Number(nextRepeatingTask.dueMonth) &&
            Number(task.dueDay) === Number(nextRepeatingTask.dueDay)
          );
        })
      : false;

    return nextRepeatingTask && !repeatingDateAlreadyExists
      ? [...completedTasks, nextRepeatingTask]
      : completedTasks;
  };

  // A single ID tracks the task whose inline notes panel is currently open.
  const toggleTaskExpansion = (id) => {
    setExpandedTaskId((prev) => (prev === id ? null : id));
  };

  // Notes save on every change, so no separate Save Notes button is required.
  const handleNoteChange = (id, notes) => {
    setTasks((prev) => {
      const updated = prev.map((t) => (t.id === id ? { ...t, notes } : t));
      saveTasksForCurrentUser(updated);
      return updated;
    });
  };

  // Completing a repeating task also appends its next incomplete occurrence.
  const handleComplete = (id) => {
    const completedTask = tasks.find((task) => task.id === id);
    if (completedTask) {
      completionCelebrationSequenceRef.current += 1;
      setCompletionCelebration({ id: `${id}-${completionCelebrationSequenceRef.current}`, title: completedTask.title });
    }
    setTasks((prev) => {
      const updated = completeTaskList(prev, id);

      saveTasksForCurrentUser(updated);
      return updated;
    });
    if (userSettings.externalPushEnabled && completedTask) { const reminder = getExternalReminderForTask(completedTask); if (reminder) runImmediateReminderMutation(completedTask.id, cancelExternalReminder(currentUser, reminder.occurrenceKey)); }
  };

  // Starting an assignment moves it from To Do into the new In Progress tab.
  const handleStartTask = (id) => {
    setTasks((prev) => {
      const updated = prev.map((task) =>
        task.id === id
          ? { ...lockVoiceUndo(task), isCompleted: false, status: "inProgress" }
          : task,
      );

      saveTasksForCurrentUser(updated);
      return updated;
    });
  };

  // This is the safety valve if a user starts something by mistake.
  const handleMoveToTodo = (id) => {
    setTasks((prev) => {
      const updated = prev.map((task) =>
        task.id === id
          ? { ...lockVoiceUndo(task), isCompleted: false, status: "todo" }
          : task,
      );

      saveTasksForCurrentUser(updated);
      return updated;
    });
  };

  /**
   * Toggle one checklist step.
   *
   * If, and only if, a task has at least one checklist step and every step is
   * checked after this click, the task automatically moves to Completed.
   */
  const handleSubtaskToggle = (taskId, subtaskId) => {
    const currentTask = tasks.find((task) => task.id === taskId);
    const willCompleteTask = Boolean(
      currentTask &&
      userSettings.autoCompleteChecklist &&
      getSafeSubtasks(currentTask).length > 0 &&
      getSafeSubtasks(currentTask).map((subtask) => subtask.id === subtaskId ? { ...subtask, isDone: !subtask.isDone } : subtask).every((subtask) => subtask.isDone),
    );
    if (willCompleteTask) {
      completionCelebrationSequenceRef.current += 1;
      setCompletionCelebration({ id: `${taskId}-${completionCelebrationSequenceRef.current}`, title: currentTask.title });
    }
    setTasks((prev) => {
      let shouldCompleteTask = false;

      const taskListWithToggledStep = prev.map((task) => {
        if (task.id !== taskId) return task;

        const updatedSubtasks = getSafeSubtasks(task).map((subtask) =>
          subtask.id === subtaskId
            ? { ...subtask, isDone: !subtask.isDone }
            : subtask,
        );

        shouldCompleteTask =
          userSettings.autoCompleteChecklist &&
          updatedSubtasks.length > 0 &&
          updatedSubtasks.every((subtask) => subtask.isDone);

        return {
          ...task,
          subtasks: updatedSubtasks,
        };
      });

      const updated = shouldCompleteTask
        ? completeTaskList(taskListWithToggledStep, taskId)
        : taskListWithToggledStep;

      saveTasksForCurrentUser(updated);
      return updated;
    });
  };

  // Undo restores the assignment to In Progress; all other information is kept.
  const handleUndo = (id) => {
    setTasks((prev) => {
      const updated = prev.map((t) =>
        t.id === id ? { ...t, isCompleted: false, status: "inProgress" } : t,
      );
      saveTasksForCurrentUser(updated);
      return updated;
    });
  };

  // Archiving keeps completed work available without cluttering Completed.
  const handleArchive = (id) => {
    const archivedAt = new Date().toISOString();

    setTasks((prev) => {
      const updated = prev.map((task) =>
        task.id === id &&
        !task.isDeleted &&
        getTaskStatus(task) === "completed"
          ? { ...task, isArchived: true, archivedAt }
          : task,
      );

      saveTasksForCurrentUser(updated);
      return updated;
    });
  };

  const handleArchiveAll = () => {
    const completedCount = tasks.filter(
      (task) =>
        !task.isDeleted &&
        getTaskStatus(task) === "completed" &&
        !task.isArchived,
    ).length;

    if (completedCount === 0) return;

    const confirmed = window.confirm(
      `Archive all ${completedCount} completed assignment${completedCount === 1 ? "" : "s"}?`,
    );

    if (!confirmed) return;

    const archivedAt = new Date().toISOString();
    setTasks((prev) => {
      const updated = prev.map((task) =>
        !task.isDeleted &&
        getTaskStatus(task) === "completed" &&
        !task.isArchived
          ? { ...task, isArchived: true, archivedAt }
          : task,
      );

      saveTasksForCurrentUser(updated);
      return updated;
    });
  };

  const handleRestoreArchived = (id) => {
    setTasks((prev) => {
      const updated = prev.map((task) =>
        task.id === id
          ? { ...task, isArchived: false, archivedAt: null }
          : task,
      );

      saveTasksForCurrentUser(updated);
      return updated;
    });
  };

  const handleMoveAllArchivedToTrash = () => {
    const archivedCount = tasks.filter((task) => task.isArchived && !task.isDeleted).length;
    if (archivedCount === 0) return;

    const confirmed = window.confirm(
      `Move all ${archivedCount} archived assignment${archivedCount === 1 ? "" : "s"} to Trash? They can still be restored.`,
    );
    if (!confirmed) return;

    const deletedAt = new Date().toISOString();
    setTasks((prev) => {
      const updated = prev.map((task) =>
        task.isArchived && !task.isDeleted
          ? { ...task, isDeleted: true, deletedAt }
          : task,
      );
      saveTasksForCurrentUser(updated);
      return updated;
    });
  };

  // Deleting moves an assignment to recoverable Trash instead of erasing it.
  const handleDelete = (id) => {
    const taskBeingDeleted = tasks.find((task) => task.id === id);
    if (userSettings.confirmBeforeTrash) {
      const taskToDelete = tasks.find((task) => task.id === id);
      const confirmed = window.confirm(
        `Move "${taskToDelete?.title || "this assignment"}" to Trash?`,
      );
      if (!confirmed) return;
    }

    const deletedAt = new Date().toISOString();

    setTasks((prev) => {
      const updated = prev.map((task) =>
        task.id === id ? { ...task, isDeleted: true, deletedAt } : task,
      );

      saveTasksForCurrentUser(updated);
      return updated;
    });
    if (userSettings.externalPushEnabled && taskBeingDeleted) { const reminder = getExternalReminderForTask(taskBeingDeleted); if (reminder) runImmediateReminderMutation(taskBeingDeleted.id, cancelExternalReminder(currentUser, reminder.occurrenceKey)); }
  };

  const handleRestoreDeleted = (id) => {
    setTasks((prev) => {
      const updated = prev.map((task) =>
        task.id === id
          ? { ...task, isDeleted: false, deletedAt: null }
          : task,
      );

      saveTasksForCurrentUser(updated);
      return updated;
    });
  };

  const handleDeletePermanently = (id) => {
    const taskToDelete = tasks.find((task) => task.id === id);
    const confirmed = window.confirm(
      `Permanently delete "${taskToDelete?.title || "this assignment"}"? This cannot be undone.`,
    );

    if (!confirmed) return;

    const remainingTasks = tasks.filter((task) => task.id !== id);
    getSafeAttachments(taskToDelete).forEach((attachment) => {
      const isStillReferenced = remainingTasks.some((task) =>
        getSafeAttachments(task).some((item) => item.id === attachment.id),
      );
      if (!isStillReferenced) {
        deleteAttachmentFile(attachment.id).catch((error) =>
          console.error("Failed to remove attachment file:", error),
        );
      }
    });

    setTasks((prev) => {
      const updated = prev.filter((task) => task.id !== id);
      saveTasksForCurrentUser(updated);
      return updated;
    });
  };

  const handleEmptyTrash = () => {
    const trashCount = tasks.filter((task) => task.isDeleted).length;
    if (trashCount === 0) return;

    const confirmed = window.confirm(
      `Permanently delete all ${trashCount} assignment${trashCount === 1 ? "" : "s"} in Trash? This cannot be undone.`,
    );

    if (!confirmed) return;

    const remainingTasks = tasks.filter((task) => !task.isDeleted);
    tasks
      .filter((task) => task.isDeleted)
      .flatMap((task) => getSafeAttachments(task))
      .forEach((attachment) => {
        const isStillReferenced = remainingTasks.some((task) =>
          getSafeAttachments(task).some((item) => item.id === attachment.id),
        );
        if (!isStillReferenced) {
          deleteAttachmentFile(attachment.id).catch((error) =>
            console.error("Failed to remove attachment file:", error),
          );
        }
      });

    setTasks((prev) => {
      const updated = prev.filter((task) => !task.isDeleted);
      saveTasksForCurrentUser(updated);
      return updated;
    });
  };

  // Copy the selected task into temporary editing state. Changes made in the
  // modal remain temporary until handleEditSave replaces the stored task.
  const handleEditStart = (task) => {
    setEditingTaskId(task.id);
    setEditingTask({
      ...task,
      title: task.title || "",
      category: getTaskCategory(task),
      status: getTaskStatus(task),
      repeat: task.repeat || "NONE",
      notes: task.notes || "",
      subtasks: getSafeSubtasks(task),
      links: getSafeLinks(task),
      attachments: getSafeAttachments(task),
      estimatedMinutes: task.estimatedMinutes || "",
      dueHour: normalizeDueTime(task.dueHour) || "11:00",
      dueAmPm: task.dueAmPm || "PM",
    });
    setEditSubtaskText("");
    setEditLinkName("");
    setEditLinkUrl("");
    setEditLinkMessage("");
    setPendingEditFiles([]);
    setRemovedEditAttachmentIds([]);
    setEditOptionalSections({ files: false, links: false, checklist: false });
  };

  // One generic field handler works for every input in the edit modal.
  const handleEditFieldChange = (field, value) => {
    setEditingTask((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  /** Add a checklist step while editing an existing assignment. */
  const handleAddEditSubtask = () => {
    const hasAnyDeadline = Boolean(
      editSubtaskDueMonth || editSubtaskDueDay || editSubtaskDueHour,
    );
    const normalizedTime = normalizeDueTime(editSubtaskDueHour);
    if (
      hasAnyDeadline &&
      (!editSubtaskDueMonth || !editSubtaskDueDay || !normalizedTime)
    ) {
      alert("Choose a checklist month, day, and valid time together.");
      return;
    }
    const newSubtask = createSubtask(editSubtaskText, {
      dueMonth: editSubtaskDueMonth,
      dueDay: editSubtaskDueDay,
      dueHour: hasAnyDeadline ? normalizedTime : "",
      dueAmPm: editSubtaskDueAmPm,
    });

    if (!newSubtask) return;

    setEditingTask((prev) => ({
      ...prev,
      subtasks: [...getSafeSubtasks(prev), newSubtask],
    }));
    setEditSubtaskText("");
    setEditSubtaskDueMonth("");
    setEditSubtaskDueDay("");
    setEditSubtaskDueHour("");
    setEditSubtaskDueAmPm("PM");
  };

  /** Rename a checklist step in the temporary edit-modal copy. */
  const handleEditSubtaskTextChange = (subtaskId, text) => {
    setEditingTask((prev) => ({
      ...prev,
      subtasks: getSafeSubtasks(prev).map((subtask) =>
        subtask.id === subtaskId ? { ...subtask, text } : subtask,
      ),
    }));
  };

  const handleEditSubtaskFieldChange = (subtaskId, field, value) => {
    setEditingTask((prev) => ({
      ...prev,
      subtasks: getSafeSubtasks(prev).map((subtask) =>
        subtask.id === subtaskId ? { ...subtask, [field]: value } : subtask,
      ),
    }));
  };

  const handleAddEditLink = () => {
    const name = editLinkName.trim();
    const url = normalizeWebUrl(editLinkUrl);
    if (!name && !editLinkUrl.trim()) {
      setEditLinkMessage("");
      return false;
    }
    if (!name || !editLinkUrl.trim()) {
      setEditLinkMessage("Enter both a link name and web address.");
      return false;
    }
    if (!url) {
      setEditLinkMessage("Enter a valid http/https web address.");
      return false;
    }
    const isDuplicate = getSafeLinks(editingTask).some(
      (link) =>
        link.name.trim().toLowerCase() === name.toLowerCase() &&
        normalizeWebUrl(link.url) === url,
    );
    if (isDuplicate) {
      setEditLinkMessage("That link is already in the links list.");
      return false;
    }
    setEditingTask((prev) => ({
      ...prev,
      links: [...getSafeLinks(prev), { id: Date.now() + Math.random(), name, url }],
    }));
    setEditLinkName("");
    setEditLinkUrl("");
    setEditLinkMessage(`Added “${name}” to the links list.`);
    return true;
  };

  /** Toggle a checklist step in the temporary edit-modal copy. */
  const handleEditSubtaskToggle = (subtaskId) => {
    setEditingTask((prev) => ({
      ...prev,
      subtasks: getSafeSubtasks(prev).map((subtask) =>
        subtask.id === subtaskId
          ? { ...subtask, isDone: !subtask.isDone }
          : subtask,
      ),
    }));
  };

  /** Remove a checklist step while editing an existing assignment. */
  const handleRemoveEditSubtask = (subtaskId) => {
    setEditingTask((prev) => ({
      ...prev,
      subtasks: getSafeSubtasks(prev).filter(
        (subtask) => subtask.id !== subtaskId,
      ),
    }));
  };

  // Validate the title, update the matching task, save, and close the modal.
  const handleEditSave = async () => {
    if (!editingTask) return;
    const taskBeforeEdit = tasks.find((task) => task.id === editingTaskId);

    if (editLinkName.trim() || editLinkUrl.trim()) {
      setEditLinkMessage(
        "Finish both link fields and leave the field so the link can be added before saving.",
      );
      return;
    }

    const cleanedTitle = editingTask.title.trim();
    const cleanedCourse =
      getTaskCategory(editingTask) === "School"
        ? editingTask.course || "Other"
        : getTaskCategory(editingTask);
    const normalizedDueTime = normalizeDueTime(editingTask.dueHour);
    const cleanedSubtasks = getSafeSubtasks(editingTask).filter((subtask) =>
      subtask.text.trim(),
    );
    const rawLinks = getSafeLinks(editingTask);
    const hasInvalidLink = rawLinks.some(
      (link) => !link.name.trim() || !normalizeWebUrl(link.url),
    );
    const cleanedLinks = rawLinks.map((link) => ({
      ...link,
      name: link.name.trim(),
      url: normalizeWebUrl(link.url),
    }));
    const hasInvalidSubtaskDeadline = cleanedSubtasks.some((subtask) => {
      const hasAny = subtask.dueMonth || subtask.dueDay || subtask.dueHour;
      return (
        hasAny &&
        (!subtask.dueMonth ||
          !subtask.dueDay ||
          !normalizeDueTime(subtask.dueHour))
      );
    });
    const shouldAutoCompleteFromSubtasks =
      cleanedSubtasks.length > 0 &&
      cleanedSubtasks.every((subtask) => subtask.isDone);
    const isCompleted =
      Boolean(editingTask.isCompleted) || shouldAutoCompleteFromSubtasks;

    if (!cleanedTitle) {
      alert("Assignment name cannot be empty.");
      return;
    }

    if (!normalizedDueTime) {
      alert("Enter a due time from 1:00 through 12:59.");
      return;
    }

    if (hasInvalidSubtaskDeadline) {
      alert("Each checklist deadline needs a month, day, and valid time.");
      return;
    }


    if (hasInvalidLink) {
      alert("Each assignment link needs a name and a valid http/https address.");
      return;
    }

    let addedAttachments;
    try {
      addedAttachments = await Promise.all(
        pendingEditFiles.map(async (file, index) => {
          const id = `${editingTaskId}-file-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`;
          await putAttachmentFile(id, file);
          return { id, name: file.name, type: file.type, size: file.size };
        }),
      );
    } catch (error) {
      console.error("Failed to save attachment:", error);
      alert("The selected file could not be stored in this browser.");
      return;
    }

    const updatedTask = {
      ...editingTask,
      title: cleanedTitle,
      course: cleanedCourse,
      dueHour: normalizedDueTime,
      repeat: editingTask.repeat || "NONE",
      isCompleted,
      status: isCompleted ? "completed" : getTaskStatus(editingTask),
      subtasks: cleanedSubtasks,
      links: cleanedLinks,
      attachments: [...getSafeAttachments(editingTask), ...addedAttachments],
    };

    setTasks((prev) => {
      const updated = prev.map((task) =>
        task.id === editingTaskId ? updatedTask : task,
      );

      saveTasksForCurrentUser(updated);
      return updated;
    });

    if (userSettings.externalPushEnabled) {
      const reminder = getExternalReminderForTask(updatedTask);
      if (reminder) runImmediateReminderMutation(updatedTask.id, replaceExternalReminder(currentUser, reminder));
      else { const oldReminder = taskBeforeEdit ? getExternalReminderForTask(taskBeforeEdit) : null; if (oldReminder) runImmediateReminderMutation(updatedTask.id, cancelExternalReminder(currentUser, oldReminder.occurrenceKey)); }
    }

    setEditingTaskId(null);
    setEditingTask(null);
    setPendingEditFiles([]);
    setEditOptionalSections({ files: false, links: false, checklist: false });

    removedEditAttachmentIds.forEach((attachmentId) => {
      const isStillReferenced = tasks.some(
        (task) =>
          task.id !== editingTaskId &&
          getSafeAttachments(task).some((attachment) => attachment.id === attachmentId),
      );
      if (!isStillReferenced) {
        deleteAttachmentFile(attachmentId).catch((error) =>
          console.error("Failed to remove attachment file:", error),
        );
      }
    });
    setRemovedEditAttachmentIds([]);
  };

  // Canceling discards the temporary editing copy without changing tasks.
  const handleEditCancel = () => {
    setEditingTaskId(null);
    setEditingTask(null);
    setEditSubtaskText("");
    setEditLinkName("");
    setEditLinkUrl("");
    setEditLinkMessage("");
    setPendingEditFiles([]);
    setRemovedEditAttachmentIds([]);
    setEditOptionalSections({ files: false, links: false, checklist: false });
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    const trimmedName = signInName.trim();
    const normalizedName = trimmedName.toLowerCase();
    setAuthError("");

    if (!trimmedName || !authPassword) {
      setAuthError("Enter both a username and password.");
      return;
    }
    if (authMode === "signup" && authPassword.length < 8) {
      setAuthError("Passwords must contain at least 8 characters.");
      return;
    }
    if (authMode === "signup" && authPassword !== authPasswordConfirm) {
      setAuthError("The password confirmation does not match.");
      return;
    }

    setAuthBusy(true);
    try {
      const accounts = getStoredAccounts();
      const existingAccount = accounts[normalizedName];

      if (authMode === "signin") {
        if (!existingAccount) {
          setAuthError("No local account was found for that username.");
          return;
        }
        const verifier = await derivePasswordVerifier(
          authPassword,
          base64ToBytes(existingAccount.salt),
        );
        if (verifier !== existingAccount.verifier) {
          setAuthError("Incorrect password.");
          return;
        }
        localStorage.setItem(AUTH_USER_STORAGE_KEY, normalizedName);
        setCurrentUser(existingAccount.profileKey);
      } else {
        if (existingAccount) {
          setAuthError("That username already has a local account.");
          return;
        }
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const verifier = await derivePasswordVerifier(authPassword, salt);
        const legacyProfileKey = findLegacyProfileKey(trimmedName);
        const profileKey = legacyProfileKey || trimmedName;
        accounts[normalizedName] = {
          username: trimmedName,
          profileKey,
          salt: bytesToBase64(salt),
          verifier,
        };
        localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
        if (!legacyProfileKey) {
          localStorage.setItem(`courses_${profileKey}`, JSON.stringify(["Other"]));
        }
        localStorage.setItem(AUTH_USER_STORAGE_KEY, normalizedName);
        localStorage.setItem(getTutorialStorageKey(profileKey), JSON.stringify({ complete: false }));
        setCurrentUser(profileKey);
        setTutorialStep(0);
        setTutorialOpen(true);
      }

      setSignInName("");
      setAuthPassword("");
      setAuthPasswordConfirm("");
      setCurrentTab("dashboard");
    } catch (error) {
      console.error("Local account error:", error);
      setAuthError("This browser could not save or verify the local account.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    if (currentUser && userSettings.externalPushEnabled) await cancelAllExternalReminders(currentUser);
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    setCurrentUser("");
    setCurrentTab("dashboard");
  };

  const handleRecommendationSubmit = async (event) => {
    event.preventDefault();

    const message = recommendationMessage.trim();
    if (!message) {
      setRecommendationStatus("error");
      setRecommendationFeedback("Please write a recommendation before sending.");
      return;
    }

    setRecommendationStatus("sending");
    setRecommendationFeedback("");

    try {
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: currentUser, message }),
      });

      let result = null;
      try {
        result = await response.json();
      } catch {
        // The fallback below also covers non-JSON errors from the hosting layer.
      }

      if (!response.ok) {
        throw new Error(result?.error || "Your recommendation could not be sent. Please try again.");
      }

      setRecommendationMessage("");
      setRecommendationStatus("success");
      setRecommendationFeedback("Thanks! Your recommendation was sent.");
    } catch (error) {
      setRecommendationStatus("error");
      setRecommendationFeedback(error instanceof Error
        ? error.message
        : "Your recommendation could not be sent. Please try again.");
    }
  };

  const prefillDueDate = (date) => {
    setDueMonth(String(date.getMonth() + 1).padStart(2, "0"));
    setDueDay(String(date.getDate()).padStart(2, "0"));
  };

  const handleCalendarDateChange = (date) => {
    setSelectedDate(date);

    if (calendarAddOpen) {
      prefillDueDate(date);
    }
  };

  const handleDashboardCalendarClick = (date) => {
    setSelectedDate(date);
    setCurrentTab("calendar");
  };

  // Open the shared assignment form directly beneath the selected calendar day.
  const handleAddForSelectedDate = () => {
    prefillDueDate(selectedDate);
    setCalendarAddOpen(true);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById("calendar-assignment-name")?.focus();
      });
    });
  };

  const handleCopyStart = (task) => {
    const startingMonth = task.dueMonth
      ? Number(task.dueMonth) - 1
      : new Date().getMonth();
    setCopyingTask(task);
    setCopyDates([]);
    setCopyCycleFilter("ALL");
    setCopyCalendarStart(new Date(new Date().getFullYear(), startingMonth, 1));
  };

  const handleCopyDateToggle = (date) => {
    const cycleDay = getCycleDayForDate(date, userSettings);
    if (copyCycleFilter !== "ALL" && cycleDay !== copyCycleFilter) return;
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const key = `${month}-${day}`;
    setCopyDates((prev) =>
      prev.some((item) => item.key === key)
        ? prev.filter((item) => item.key !== key)
        : [...prev, { key, month, day, cycleDay: cycleDay || "No cycle day" }],
    );
  };

  const handleSelectAllVisibleCycleDates = () => {
    if (copyCycleFilter === "ALL") return;
    const year = copyCalendarStart.getFullYear();
    const monthIndex = copyCalendarStart.getMonth();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const matchingDates = Array.from({ length: daysInMonth }, (_, index) => {
      const date = new Date(year, monthIndex, index + 1);
      const cycleDay = getCycleDayForDate(date, userSettings);
      if (cycleDay !== copyCycleFilter) return null;
      const month = String(monthIndex + 1).padStart(2, "0");
      const day = String(index + 1).padStart(2, "0");
      return { key: `${month}-${day}`, month, day, cycleDay };
    }).filter(Boolean);

    setCopyDates((prev) => {
      const existingKeys = new Set(prev.map((item) => item.key));
      return [
        ...prev,
        ...matchingDates.filter((item) => !existingKeys.has(item.key)),
      ];
    });
  };

  const handleCopyConfirm = () => {
    if (!copyingTask || copyDates.length === 0) return;
    const copyGroupId = copyingTask.copyGroupId || copyingTask.id;
    const skipped = [];
    const created = [];

    copyDates.forEach(({ month, day }) => {
      const duplicate = tasks.some((task) => {
        const taskGroupId = task.copyGroupId || task.id;
        return (
          String(taskGroupId) === String(copyGroupId) &&
          Number(task.dueMonth) === Number(month) &&
          Number(task.dueDay) === Number(day)
        );
      });
      const label = `${monthNames[Number(month) - 1]} ${Number(day)}`;
      if (duplicate) {
        skipped.push(label);
        return;
      }
      created.push({
        ...copyingTask,
        id: Date.now() + created.length + Math.floor(Math.random() * 100000),
        copyGroupId,
        dueMonth: month,
        dueDay: day,
        isCompleted: false,
        status: "todo",
        isArchived: false,
        archivedAt: null,
        isDeleted: false,
        deletedAt: null,
        createdByVoice: false,
        voiceCreatedCourse: "",
        subtasks: getSafeSubtasks(copyingTask).map((subtask) => ({
          ...subtask,
          id: Date.now() + Math.random(),
          isDone: false,
          dueMonth: "",
          dueDay: "",
          dueHour: "",
          dueAmPm: "PM",
        })),
        links: getSafeLinks(copyingTask).map((link) => ({
          ...link,
          id: Date.now() + Math.random(),
        })),
      });
    });

    if (created.length > 0) {
      setTasks((prev) => {
        const updated = [...prev, ...created];
        saveTasksForCurrentUser(updated);
        return updated;
      });
    }
    setCopyResult(
      `Created ${created.length} ${created.length === 1 ? "copy" : "copies"}.` +
        (skipped.length > 0
          ? ` Skipped duplicates: ${skipped.join(", ")}.`
          : ""),
    );
    setCopyingTask(null);
    setCopyDates([]);
  };

  const isFormInvalid =
    !taskName ||
    (category === "School" &&
      (isCustomCourse ? !customCourseName.trim() : !selectedCourse));

  const saveChecklistData = (next) => {
    setChecklists(next);
    try { localStorage.setItem(checklistStorageKey, JSON.stringify(next)); }
    catch (error) { console.error("Failed to save checklists:", error); }
  };

  const handleCreateChecklist = () => {
    const id = crypto.randomUUID();
    const color = userSettings.customColors?.checklistPalette1 || THEME_COLOR_DEFAULTS[theme].checklistPalette1;
    saveChecklistData([...checklists, { id, title: "Untitled checklist", color, pinned: false, items: [], createdAt: new Date().toISOString() }]);
  };

  const updateChecklist = (listId, updater) => {
    saveChecklistData(checklists.map((list) => list.id === listId ? updater(list) : list));
  };

  const handleReorderChecklist = (sourceId, targetId) => {
    if (!sourceId || sourceId === targetId) return;
    const items = [...checklists];
    const sourceIndex = items.findIndex((list) => list.id === sourceId);
    const targetIndex = items.findIndex((list) => list.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = items.splice(sourceIndex, 1);
    items.splice(targetIndex, 0, moved);
    saveChecklistData(items);
  };

  const handleAddChecklistItem = (listId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    updateChecklist(listId, (list) => ({ ...list, items: [...(list.items || []), { id: crypto.randomUUID(), text: trimmed, isDone: false, dueDate: "", dueTime: "" }] }));
  };

  const handleUpdateChecklistItem = (listId, itemId, field, value) => {
    updateChecklist(listId, (list) => ({
      ...list,
      items: (list.items || []).map((item) => item.id === itemId ? { ...item, [field]: value } : item),
    }));
  };

  const handleDeleteChecklistItem = (listId, itemId) => {
    if (!window.confirm("Delete this checklist item permanently?")) return;
    updateChecklist(listId, (list) => ({ ...list, items: (list.items || []).filter((item) => item.id !== itemId) }));
  };

  const handleReorderChecklistItem = (listId, sourceId, targetId) => {
    if (!sourceId || sourceId === targetId) return;
    updateChecklist(listId, (list) => {
      const items = [...(list.items || [])];
      const sourceIndex = items.findIndex((item) => item.id === sourceId);
      const targetIndex = items.findIndex((item) => item.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return list;
      const [moved] = items.splice(sourceIndex, 1);
      items.splice(targetIndex, 0, moved);
      return { ...list, items };
    });
  };

  const startChecklistTouchReorder = (event, selector, sourceId, reorder) => {
    if (event.pointerType === "mouse") return;
    event.preventDefault();
    const move = (moveEvent) => {
      const targetId = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest?.(selector)?.dataset.reorderId;
      if (targetId && targetId !== sourceId) reorder(sourceId, targetId);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  const saveWorkspace = (nextOrUpdater, options = {}) => {
  setWorkspaceLayout((previousLayout) => {
    const nextLayout =
      typeof nextOrUpdater === "function"
        ? nextOrUpdater(previousLayout)
        : nextOrUpdater;

    const stampedLayout = {
      ...nextLayout,
      userCustomized: true,
      updatedAt: new Date().toISOString(),
    };
    const requestedCanvasWidth = Number(options.canvasWidth);
    const mountedCanvasWidth = Number(workspaceMainRef.current?.clientWidth);
    const savedCanvasWidth = Number(workspaceCanvasWidth);
    const usableCanvasWidth = requestedCanvasWidth > 0
      ? requestedCanvasWidth
      : mountedCanvasWidth > 0
        ? mountedCanvasWidth
        : savedCanvasWidth > 0
          ? savedCanvasWidth
          : undefined;

    const normalized = normalizeWorkspaceLayout(stampedLayout, {
      mode: workspaceMode,
      canvasWidth: usableCanvasWidth,
      activeId: options.activeId,
      reflowActiveWithNeighbors: options.reflowActiveWithNeighbors,
      collapsed: options.collapsed ?? stampedLayout?.collapsed,
      preservePositions: true,
    });

    workspaceLayoutRef.current = normalized;

    try {
      localStorage.setItem(workspaceStorageKey, JSON.stringify(normalized));
    } catch (error) {
      console.error("Failed to save workspace layout:", error);
    }

    return normalized;
  });
};

  const updateWidgetInstance = (instanceId, changes, options = {}) => {
  saveWorkspace(
    (previousLayout) => {
      const next = structuredClone(previousLayout);
      const modeLayout = next[workspaceMode] || {};

      for (const tab of Object.keys(modeLayout)) {
        modeLayout[tab] = modeLayout[tab].map((item) =>
          item.id === instanceId ? { ...item, ...changes } : item,
        );
      }

      return next;
    },
    {
      ...options,
      activeId: instanceId,
      preservePositions: true,
    },
  );
};

  const moveWorkspaceWidget = (instance, targetTab, copy = false) => {
  if (targetTab === "calendar") return;

  saveWorkspace(
    (previousLayout) =>
      placeWidget(previousLayout, workspaceMode, targetTab, instance, { copy }),
    {
      activeId: copy ? undefined : instance.id,
      preservePositions: true,
    },
  );

  if (!copy) setCurrentTab(targetTab);
};

  const handleTabWidgetDrop = (event, targetTab) => {
    event.preventDefault();
    const instanceId = event.dataTransfer.getData("text/taskcabinet-widget");
    const instance = Object.values(workspaceLayout[workspaceMode] || {}).flat().find((item) => item.id === instanceId);
    if (instance) moveWorkspaceWidget(instance, targetTab, false);
  };

  const hideWorkspaceWidget = (instance) => {
    if (!canHideWidget(workspaceLayout, workspaceMode, instance.type)) {
      alert("Keep at least one visible copy of this core widget.");
      return;
    }
    updateWidgetInstance(instance.id, { hidden: true });
  };

  const restoreWorkspaceWidget = (instance) => updateWidgetInstance(instance.id, { hidden: false });

  const toggleWorkspaceWidget = (instance) => {
  const isCollapsing = !workspaceLayout.collapsed?.[instance.type];
  if (isCollapsing) {
    const heightReduction = Math.max(0, Number(instance.height) - COLLAPSED_WIDGET_HEIGHT);
    const nextMaximumScroll = Math.max(0, document.documentElement.scrollHeight - heightReduction - window.innerHeight);
    if (window.scrollY > nextMaximumScroll) window.scrollTo({ top: nextMaximumScroll, behavior: "auto" });
  }
  saveWorkspace(
    (previousLayout) => {
      const nextCollapsed = !previousLayout.collapsed?.[instance.type];
      return setWidgetCollapsedState(
        previousLayout,
        workspaceMode,
        instance.id,
        nextCollapsed,
      );
    },
    {
      activeId: instance.id,
      preservePositions: true,
    },
  );
};

  const toggleWorkspaceLock = () => {
  saveWorkspace(
    (previousLayout) => ({
      ...previousLayout,
      locked: {
        ...(previousLayout.locked || {}),
        [workspaceMode]: !previousLayout.locked?.[workspaceMode],
      },
    }),
    {
      preservePositions: true,
    },
  );
};

  const addWidgetToCurrentTab = (type) => {
    if (currentTab === "calendar") return;
    const currentInstance = workspaceLayout[workspaceMode]?.[currentTab]?.find((item) => item.type === type);
    if (currentInstance) {
      if (currentInstance.hidden) restoreWorkspaceWidget(currentInstance);
      return;
    }
    const source = Object.values(workspaceLayout[workspaceMode] || {}).flat().find((item) => item.type === type);
    if (source) moveWorkspaceWidget(source, currentTab, true);
  };

  const resetWorkspaceTab = () => {
    if (!window.confirm("Reset this tab's layout?")) return;
    const defaults = createDefaultWorkspaceLayout();
    const next = structuredClone(workspaceLayout);
    next[workspaceMode][currentTab] = defaults[workspaceMode][currentTab] || [];
    saveWorkspace(next);
  };

  const resetAllWorkspace = () => {
    if (!window.confirm("Reset every desktop and mobile workspace layout?")) return;
    saveWorkspace(createDefaultWorkspaceLayout());
  };

  // ---------------------------------------------------------------------------
  // DERIVED DATA: FILTERING, SORTING, RECOMMENDATIONS, AND COUNTS
  // ---------------------------------------------------------------------------
  // Derived values are recalculated from tasks during rendering. They are not
  // separate state and are never written to localStorage, which avoids stale or
  // conflicting copies of the same information.

  const bucketsOrder = [
    "Overdue 🚨",
    "Due Today ⏰",
    "Due Tomorrow 🗓️",
    "Due This Week",
    "Due Next Week",
    "Due Later",
    "No Due Date",
  ];

  const getTaskDueBucket = (task) => {
    const deadline = getEffectiveDeadline(task);
    return deadline
      ? getDueDateBucket(deadline.getMonth() + 1, deadline.getDate())
      : "No Due Date";
  };

  // A task must pass every active filter. "ALL" means that particular filter
  // is disabled. Search checks the title, course, and optional notes together.
  const assignmentMatchesFilters = (task) => {
    const search = searchTerm.trim().toLowerCase();
    const matchesRepeat =
      filterRepeat === "ALL" || (task.repeat || "NONE") === filterRepeat;
    const matchesSearch =
      !search ||
      task.title.toLowerCase().includes(search) ||
      task.course.toLowerCase().includes(search) ||
      getTaskCategory(task).toLowerCase().includes(search) ||
      (task.notes || "").toLowerCase().includes(search);

    const matchesCourse =
      filterCourse === "ALL" || task.course === filterCourse;

    const matchesPriority =
      filterPriority === "ALL" || task.priority === filterPriority;
    const matchesCategory =
      filterCategory === "ALL" || getTaskCategory(task) === filterCategory;

    const taskBucket = getTaskDueBucket(task);

    const matchesDueBucket =
      filterDueBucket === "ALL" || taskBucket === filterDueBucket;

    return (
      matchesSearch &&
      matchesCourse &&
      matchesPriority &&
      matchesCategory &&
      matchesDueBucket &&
      matchesRepeat
    );
  };

  const todoTasks = tasks.filter(
    (task) =>
      !task.isArchived &&
      !task.isDeleted &&
      getTaskStatus(task) === "todo" &&
      assignmentMatchesFilters(task),
  );

  const inProgressTasks = tasks.filter(
    (task) =>
      !task.isArchived &&
      !task.isDeleted &&
      getTaskStatus(task) === "inProgress" &&
      assignmentMatchesFilters(task),
  );

  const completedTasks = tasks.filter(
    (task) =>
      !task.isArchived &&
      !task.isDeleted &&
      getTaskStatus(task) === "completed" &&
      assignmentMatchesFilters(task),
  );

  const archivedTasks = tasks
    .filter((task) => task.isArchived && !task.isDeleted)
    .sort((a, b) =>
      String(b.archivedAt || "").localeCompare(String(a.archivedAt || "")),
    );

  const unarchivedCompletedCount = tasks.filter(
    (task) =>
      !task.isDeleted &&
      getTaskStatus(task) === "completed" &&
      !task.isArchived,
  ).length;

  const trashTasks = tasks
    .filter((task) => task.isDeleted)
    .sort((a, b) =>
      String(b.deletedAt || "").localeCompare(String(a.deletedAt || "")),
    );

  const calendarTasks = tasks.filter(
    (task) =>
      !task.isArchived &&
      !task.isDeleted &&
      getTaskStatus(task) !== "completed",
  );
  const getCourseDotsForDate = (date) => {
    const courseNames = calendarTasks
      .filter(
        (task) =>
          Number(task.dueMonth) === date.getMonth() + 1 &&
          Number(task.dueDay) === date.getDate(),
      )
      .map((task) => task.course || getTaskCategory(task));

    return [...new Set(courseNames)].map((course) => ({
      course,
      color: getCourseColor(course),
    }));
  };
  const selectedDateTasks = calendarTasks.filter(
    (task) =>
      Number(task.dueMonth) === selectedDate.getMonth() + 1 &&
      Number(task.dueDay) === selectedDate.getDate(),
  );
  const selectedCycleDay = getCycleDayForDate(selectedDate, userSettings);
  const selectedCycleCourses = selectedCycleDay
    ? courses.filter((course) => {
        const assignedDays = userSettings.courseCycleDays?.[course];
        return !Array.isArray(assignedDays) || assignedDays.includes(selectedCycleDay);
      })
    : [];
  const selectedCycleCourseTasks = selectedDateTasks.filter(
    (task) =>
      getTaskCategory(task) === "School" &&
      selectedCycleCourses.includes(task.course),
  );

  // To Do and In Progress use the same student-friendly order: urgent first,
  // then high priority, then shorter assignments.
  const sortAssignmentsByDuePriorityEstimate = (taskList) => {
    const priorityMap = { HIGH: 3, MED: 2, LOW: 1 };

    return [...taskList].sort((a, b) => {
      const bucketA = bucketsOrder.indexOf(getTaskDueBucket(a));
      const bucketB = bucketsOrder.indexOf(getTaskDueBucket(b));

      if (bucketA !== bucketB) {
        return bucketA - bucketB;
      }

      const deadlineA = getEffectiveDeadline(a)?.getTime() ?? Infinity;
      const deadlineB = getEffectiveDeadline(b)?.getTime() ?? Infinity;
      if (deadlineA !== deadlineB) return deadlineA - deadlineB;

      if (priorityMap[b.priority] !== priorityMap[a.priority]) {
        return priorityMap[b.priority] - priorityMap[a.priority];
      }

      const estimateDifference =
        (Number(a.estimatedMinutes) || 0) - (Number(b.estimatedMinutes) || 0)
      ;
      return estimateDifference || (a.title || "").localeCompare(b.title || "");
    });
  };

  const sortedTodoTasks = sortAssignmentsByDuePriorityEstimate(todoTasks);
  const sortedInProgressTasks =
    sortAssignmentsByDuePriorityEstimate(inProgressTasks);

  const recommendationItems = rankRecommendedTasks(
    tasks.filter(
      (task) =>
        !task.isArchived &&
        !task.isDeleted &&
        getTaskStatus(task) !== "completed",
    ),
    {
      getDueBucket: getTaskDueBucket,
      getDeadline: getEffectiveDeadline,
      getStatus: getTaskStatus,
      limit: 5,
    },
  );
  const recommendedTasks = recommendationItems.map((item) => item.task);
  const recommendationWorkload = summarizeRecommendationWorkload(recommendationItems);
  const recommendationWorkloadLabel = recommendationWorkload.knownMinutes > 0
    ? `${Math.floor(recommendationWorkload.knownMinutes / 60)}h ${recommendationWorkload.knownMinutes % 60}m`
    : "No estimates";

  // Create an object with one array per due-date heading, then fill those arrays
  // from an already sorted list. This powers the grouped task screens.
  const groupTasksByDueBucket = (taskList) => {
    const grouped = bucketsOrder.reduce((acc, bucket) => {
      acc[bucket] = [];
      return acc;
    }, {});

    taskList.forEach((task) => {
      const bucket = getTaskDueBucket(task);

      if (grouped[bucket]) {
        grouped[bucket].push(task);
      } else {
        grouped["No Due Date"].push(task);
      }
    });

    return grouped;
  };

  const groupedTasks = groupTasksByDueBucket(sortedTodoTasks);
  const groupedInProgressTasks = groupTasksByDueBucket(sortedInProgressTasks);

  const resetFilters = () => {
    setSearchTerm("");
    setFilterCourse("ALL");
    setFilterPriority("ALL");
    setFilterCategory("ALL");
    setFilterDueBucket("ALL");
    setFilterRepeat("ALL");
  };

  // A recommendation click clears filters so the target cannot be hidden,
  // opens its notes, changes tabs, and waits two animation frames for React to
  // render the correct task screen before smoothly scrolling the card into view.
  const handleTaskFocus = (taskId, forcedStatus = null) => {
    const targetTask = tasks.find((task) => task.id === taskId);
    const statusTab = forcedStatus || (getTaskStatus(targetTask) === "inProgress" ? "inProgress" : "todo");
    const masterType = statusTab === "inProgress" ? "in-progress-master" : "todo-master";
    const targetTab = forcedStatus || Object.keys(workspaceLayout[workspaceMode] || {}).find((tab) =>
      workspaceLayout[workspaceMode][tab].some((item) => item.type === masterType && !item.hidden),
    ) || statusTab;

    resetFilters();
    setExpandedTaskId(taskId);
    setCurrentTab(targetTab);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById(`${statusTab}-task-${taskId}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    });
  };

  const handleRecommendedTaskClick = (taskId) => {
    handleTaskFocus(taskId);
  };

  const handleReminderTaskClick = (task) => {
    handleTaskFocus(task.id, getTaskStatus(task) === "inProgress" ? "inProgress" : "todo");
  };

  const handleQuickMatchStart = (taskId) => {
    handleStartTask(taskId);
    handleTaskFocus(taskId, "inProgress");
  };

  const getFocusActionLabel = (task) => getTaskStatus(task) === "inProgress" ? "Continue" : "Open";

  // These small render helpers keep the identical filter interface shared by
  // the To Do and Completed tabs in one place.
  const renderFilterToggle = () => (
    <button
      type="button"
      className="filter-bar"
      onClick={() => setFiltersOpen((prev) => !prev)}
    >
      <span>🔎 Filter Assignments</span>
      <span>{filtersOpen ? "▲ Hide" : "▼ Show"}</span>
    </button>
  );

  const renderFilterControls = () => {
    if (!filtersOpen) return null;

    return (
      <div className="card filter-controls-card">
        <input
          type="text"
          placeholder="Search by title, course, or notes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <div className="filter-grid">
          <div>
            <label>Category:</label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="ALL">All Categories</option>
              {TASK_CATEGORIES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div>
            <label>{schoolLevelCopy.courseLabel}:</label>
            <select
              value={filterCourse}
              onChange={(e) => setFilterCourse(e.target.value)}
            >
              <option value="ALL">All Courses</option>
              {courses.map((course) => (
                <option key={course} value={course}>
                  {course}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Priority:</label>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
            >
              <option value="ALL">All Priorities</option>
              <option value="HIGH">High</option>
              <option value="MED">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          <div>
            <label>Due:</label>
            <select
              value={filterDueBucket}
              onChange={(e) => setFilterDueBucket(e.target.value)}
            >
              <option value="ALL">All Due Dates</option>
              {bucketsOrder.map((bucket) => (
                <option key={bucket} value={bucket}>
                  {bucket}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Repeat:</label>
            <select
              value={filterRepeat}
              onChange={(e) => setFilterRepeat(e.target.value)}
            >
              <option value="ALL">All Repeat Types</option>
              <option value="NONE">Does not repeat</option>
              <option value="DAILY">Daily</option>
              <option value="EVERY_OTHER_WEEKDAY">Every Other Weekday</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={resetFilters}
          style={{
            marginTop: "12px",
            padding: "8px 12px",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Reset Filters
        </button>
      </div>
    );
  };

  const handleCourseOverviewOpen = (course) => {
    resetFilters();
    setFilterCourse(course);
    setFiltersOpen(true);
    const targetTab = Object.keys(workspaceLayout[workspaceMode] || {}).find((tab) =>
      workspaceLayout[workspaceMode][tab].some((item) => item.type === "todo-master" && !item.hidden),
    ) || "todo";
    const targetWidget = workspaceLayout[workspaceMode]?.[targetTab]?.find((item) => item.type === "todo-master" && !item.hidden);
    setCurrentTab(targetTab);
    if (targetWidget) {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        document.querySelector(`[data-widget-id="${targetWidget.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }));
    }
  };

  const renderAssignmentCountdown = (task, extraClassName = "") => {
    if (getTaskStatus(task) === "completed") return null;
    const deadline = getDeadlineDate(task?.dueMonth, task?.dueDay, task?.dueHour, task?.dueAmPm);
    const label = formatAssignmentCountdown(deadline, checklistNow);
    if (!label) return null;
    const tone = getAssignmentCountdownTone(deadline, checklistNow);
    return <p className={`assignment-countdown countdown-${tone} ${extraClassName}`.trim()} aria-label={`Time until ${task.title} is due: ${label}`}>{label}</p>;
  };

  /**
   * Compact checklist progress.
   * This is intentionally only one line so collapsed cards stay calm and tidy.
   */
  const renderSubtaskProgressLine = (task, extraClassName = "") => {
    const progress = getSubtaskProgress(task);

    if (!progress) return null;

    return (
      <p className={`subtask-progress-line ${extraClassName}`.trim()}>
        {progress.label}
      </p>
    );
  };

  /**
   * Full checklist shown only in expanded cards.
   * Completed tasks show the checklist as read-only; active tasks can be checked
   * off directly from To Do, In Progress, or the selected calendar day.
   */
  const renderSubtaskChecklist = (task) => {
    const subtasks = getSafeSubtasks(task);
    const progress = getSubtaskProgress(task);
    const isReadOnly = getTaskStatus(task) === "completed";

    if (subtasks.length === 0) return null;

    return (
      <div className="subtask-checklist-panel">
        <div className="subtask-checklist-header">
          <span>Finish checklist</span>
          <span>{progress?.label}</span>
        </div>

        <ul className="subtask-checklist-list">
          {subtasks.map((subtask) => {
            const deadline = getDeadlineDate(
              subtask.dueMonth,
              subtask.dueDay,
              subtask.dueHour,
              subtask.dueAmPm,
            );
            const bucket = deadline
              ? getDueDateBucket(deadline.getMonth() + 1, deadline.getDate())
              : "";
            return (
            <li key={subtask.id} className="subtask-checklist-item">
              <label>
                <input
                  type="checkbox"
                  checked={subtask.isDone}
                  disabled={isReadOnly}
                  onChange={() => handleSubtaskToggle(task.id, subtask.id)}
                />
                <span>{subtask.text}</span>
              </label>
              {deadline && (
                <span className="subtask-deadline">
                  {monthNames[deadline.getMonth()]} {deadline.getDate()} at{" "}
                  {normalizeDueTime(subtask.dueHour)} {subtask.dueAmPm}
                  {(bucket === "Overdue 🚨" || bucket === "Due Today ⏰") &&
                    ` · ${bucket}`}
                </span>
              )}
            </li>
          )})}
        </ul>

        {!isReadOnly && (
          <p className="subtask-checklist-hint">
            Checking every step automatically completes this assignment.
          </p>
        )}
      </div>
    );
  };

  const renderTaskLinks = (task) => {
    const links = getSafeLinks(task);
    if (links.length === 0) {
      return <p className="subtask-form-hint">No links added.</p>;
    }
    return (
      <ul className="task-link-list">
        {links.map((link) => (
          <li key={link.id}>
            <a href={link.url} target="_blank" rel="noopener noreferrer">
              {link.name}
            </a>
          </li>
        ))}
      </ul>
    );
  };

  const renderTaskAttachments = (task) => {
    const attachments = getSafeAttachments(task);
    if (attachments.length === 0) return null;
    return (
      <div className="task-attachments-panel">
        <span className="task-notes-label">Files</span>
        <ul className="task-link-list">
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              <button type="button" className="attachment-link" onClick={() => handleAttachmentDownload(attachment)}>
                {attachment.name} ({Math.max(1, Math.round(attachment.size / 1024))} KB)
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const renderCopyAction = (task) => (
    <button
      type="button"
      className="btn btn-secondary copy-dates-button"
      onClick={() => handleCopyStart(task)}
    >
      Copy to dates
    </button>
  );
  const visibleWeekDates = getWeekDates(selectedDate, userSettings.calendarWeekStartsOn);

  const renderVoiceUndoAction = (task) => canUndoVoiceCreation(task) ? (
    <button
      type="button"
      className="btn btn-voice-undo"
      onClick={(event) => {
        event.stopPropagation();
        handleUndoVoiceAdd(task.id);
      }}
    >
      ↩ Undo Voice Add
    </button>
  ) : null;

  const renderExpandedTaskDetails = (task, notesId) => (
    <>
      <div className="task-resource-grid">
        <div className="task-resource-column">
          <label htmlFor={notesId} className="task-notes-label">Notes</label>
          <textarea
            id={notesId}
            value={task.notes || ""}
            onChange={(e) => handleNoteChange(task.id, e.target.value)}
            placeholder="Type notes for this assignment..."
            className="task-note-input"
          />
        </div>
        <div className="task-resource-column">
          <span className="task-notes-label">Links</span>
          {renderTaskLinks(task)}
        </div>
      </div>
      {renderTaskAttachments(task)}
      {renderSubtaskChecklist(task)}
      {renderCopyAction(task)}
    </>
  );

  // Dashboard and Calendar share one form so assignment behavior stays aligned.
  const bulkImportRowsWithWarnings = bulkImportPreview.map((item) => ({
    item,
    warnings: getBulkImportWarnings(item),
  }));
  const bulkImportIssueCount = bulkImportRowsWithWarnings.filter(({ warnings }) => warnings.length > 0).length;
  const visibleBulkImportRows = bulkImportIssuesOnly
    ? bulkImportRowsWithWarnings.filter(({ warnings }) => warnings.length > 0)
    : bulkImportRowsWithWarnings;

  const renderAddAssignmentForm = (formId) => (
    <form onSubmit={handleAddTask} className="card-form assignment-entry-form">
      <section className="bulk-import-panel" aria-label="Paste assignment list">
        <div className="bulk-import-heading">
          <div><strong>Paste Assignment List</strong><p>Create several assignments from one line each, with a review before saving.</p></div>
          <button type="button" className="btn btn-secondary" onClick={() => setBulkImportOpen((open) => !open)}>{bulkImportOpen ? "Close" : "Open Importer"}</button>
        </div>
        {bulkImportOpen && (
          <div className="bulk-import-content">
            <div className="syllabus-upload-panel">
              <div><strong>Import a course syllabus</strong><p>PDF, DOCX, TXT, Markdown, or CSV · processed locally · 10 MB maximum</p></div>
              <label><span>Course for imported work</span><select value={syllabusCourse || courses[0] || "Other"} onChange={(event) => setSyllabusCourse(event.target.value)}>{courses.map((course) => <option key={course} value={course}>{course}</option>)}</select></label>
              <label className={`btn btn-secondary syllabus-file-button${syllabusImportStatus === "reading" ? " disabled" : ""}`}>
                {syllabusImportStatus === "reading" ? "Reading syllabus…" : "Choose Syllabus File"}
                <input type="file" accept=".pdf,.docx,.txt,.md,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv" onChange={handleSyllabusFile} disabled={syllabusImportStatus === "reading"} />
              </label>
              {syllabusFileName && <span className="syllabus-file-name">{syllabusFileName}</span>}
              {syllabusExtractedText && <button type="button" className="syllabus-full-text-button" onClick={() => { setBulkImportText(syllabusExtractedText); setBulkImportPreview([]); setBulkImportMessage("Showing all extracted syllabus text. Remove policy and schedule lines that are not assignments, then choose Review Assignments."); setSyllabusImportStatus("needs-review"); }}>Use full extracted text</button>}
            </div>
            <div className="bulk-import-divider"><span>or paste assignment lines</span></div>
            <textarea value={bulkImportText} onChange={(event) => setBulkImportText(event.target.value)} placeholder={"Biology:\n- Lab report due July 9, high priority, 90 minutes\n- Chapter quiz due July 12\n\nEnglish: Essay draft due July 15"} rows={7} />
            <div className="bulk-import-actions"><button type="button" className="btn btn-primary" onClick={handleParseBulkImport} disabled={!bulkImportText.trim()}>Review Assignments</button><small>One assignment per line. Course headings ending in a colon apply to the lines below them.</small></div>
            {bulkImportMessage && <p className="bulk-import-message" role="status">{bulkImportMessage}</p>}
            {bulkImportPreview.length > 0 && (
              <div className="bulk-import-review">
                <div className="bulk-import-review-toolbar">
                  <strong>{bulkImportPreview.filter((item) => item.selected).length}/{bulkImportPreview.length} selected | {bulkImportIssueCount} need review</strong>
                  <span>
                    <button type="button" className={`btn ${bulkImportIssuesOnly ? "btn-primary" : "btn-secondary"}`} onClick={() => setBulkImportIssuesOnly((value) => !value)} disabled={bulkImportIssueCount === 0}>{bulkImportIssuesOnly ? "Show all" : "Issues only"}</button>
                    <button type="button" className="btn btn-secondary" onClick={handleBulkPreviewSelectReady} disabled={bulkImportIssueCount === bulkImportPreview.length}>Select ready</button>
                    <button type="button" className="btn btn-secondary" onClick={() => handleBulkPreviewSelectAll(true)}>Select all</button>
                    <button type="button" className="btn btn-secondary" onClick={() => handleBulkPreviewSelectAll(false)}>Skip all</button>
                  </span>
                </div>
                {visibleBulkImportRows.length === 0 && <p className="bulk-import-message">No rows need review right now.</p>}
                {visibleBulkImportRows.map(({ item, warnings }) => {
                  return (
                    <article key={item.previewId} className={item.selected ? "" : "is-skipped"}>
                      <label className="bulk-import-select"><input type="checkbox" checked={item.selected} onChange={(event) => handleBulkPreviewChange(item.previewId, "selected", event.target.checked)} /><span>{item.selected ? "Import" : "Skipped"}</span></label>
                      <label><span>Title</span><input value={item.title || ""} onChange={(event) => handleBulkPreviewChange(item.previewId, "title", event.target.value)} /></label>
                      <label><span>Course</span><select value={item.course || "Other"} onChange={(event) => handleBulkPreviewChange(item.previewId, "course", event.target.value)}>{[...new Set([...courses, item.course || "Other"])].map((course) => <option key={course} value={course}>{course}</option>)}</select></label>
                      <label><span>Month</span><input type="number" min="1" max="12" value={item.dueMonth || ""} onChange={(event) => handleBulkPreviewChange(item.previewId, "dueMonth", event.target.value)} /></label>
                      <label><span>Day</span><input type="number" min="1" max="31" value={item.dueDay || ""} onChange={(event) => handleBulkPreviewChange(item.previewId, "dueDay", event.target.value)} /></label>
                      <label><span>Priority</span><select value={item.priority || userSettings.defaultPriority || "MED"} onChange={(event) => handleBulkPreviewChange(item.previewId, "priority", event.target.value)}><option value="LOW">Low</option><option value="MED">Medium</option><option value="HIGH">High</option></select></label>
                      <label><span>Minutes</span><input type="number" min="0" max="1440" value={item.estimatedMinutes ?? ""} onChange={(event) => handleBulkPreviewChange(item.previewId, "estimatedMinutes", event.target.value)} /></label>
                      {warnings.length > 0 && <div className="bulk-import-warnings">{warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>}
                    </article>
                  );
                })}
                <button type="button" className="btn btn-primary bulk-import-submit" onClick={handleBulkImportSubmit}>Add Selected to To Do</button>
              </div>
            )}
          </div>
        )}
      </section>
      {voiceRecordingSupported && (
        <section className="voice-assignment-panel" aria-label="Create assignments with voice">
          <div>
            <strong>Voice Add</strong>
            <p>Try: “Add biology worksheet due July 10 at 3 PM, high priority, 45 minutes.” Say “then add” before another assignment.</p>
          </div>
          <button
            type="button"
            className={`btn ${voiceStatus === "recording" ? "btn-danger" : "btn-secondary"}`}
            onClick={voiceStatus === "recording" ? handleVoiceStop : handleVoiceStart}
            disabled={voiceStatus === "processing"}
          >
            {voiceStatus === "recording"
              ? `Stop Recording (${voiceElapsed}s)`
              : voiceStatus === "processing"
                ? "Interpreting Assignments…"
                : "🎙️ Start Recording"}
          </button>
          <small>Speak one or more assignments. Maximum 90 seconds.</small>
        </section>
      )}

      {voiceError && <div className="voice-inline-error" role="alert">{voiceError}</div>}

      <label htmlFor={`${formId}-assignment-name`}>{schoolLevelCopy.nameLabel}:</label>
      <input
        id={`${formId}-assignment-name`}
        type="text"
        placeholder="e.g., Read Chapter 4"
        value={taskName}
        onChange={(e) => setTaskName(e.target.value)}
      />

      <label>Category:</label>
      <select value={category} onChange={(e) => setCategory(e.target.value)}>
        {TASK_CATEGORIES.map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
      </select>

      {category === "School" && <><div
        className="assignment-course-heading"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <label>{schoolLevelCopy.courseLabel}:</label>
        <button
          type="button"
          onClick={() => setIsCustomCourse(!isCustomCourse)}
          style={{
            background: "none",
            border: "none",
            color: "var(--button-primary-bg, #007bff)",
            cursor: "pointer",
            fontSize: "12px",
            textDecoration: "underline",
          }}
        >
          {isCustomCourse ? "Select Existing Course" : "➕ Add Custom Course"}
        </button>
      </div>

      {isCustomCourse ? (
        <input
          type="text"
          placeholder="Type new course name (e.g., AP Psychology)"
          value={customCourseName}
          onChange={(e) => setCustomCourseName(e.target.value)}
        />
      ) : (
        <select
          value={selectedCourse}
          onChange={(e) => setSelectedCourse(e.target.value)}
        >
          <option value="">Select a course</option>
          {courses.map((course) => (
            <option key={course} value={course}>
              {course}
            </option>
          ))}
        </select>
      )}</>}

      <label>Due Date:</label>
      <div style={{ display: "flex", gap: "8px" }}>
        <select value={dueMonth} onChange={(e) => setDueMonth(e.target.value)}>
          <option value="">Month</option>
          {monthNames.map((month, index) => (
            <option
              key={month}
              value={String(index + 1).padStart(2, "0")}
            >
              {month}
            </option>
          ))}
        </select>
        <select value={dueDay} onChange={(e) => setDueDay(e.target.value)}>
          <option value="">Day</option>
          {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
            <option key={day} value={String(day).padStart(2, "0")}>
              {day}
            </option>
          ))}
        </select>
      </div>

      <label>Due Time:</label>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <input
          type="text"
          inputMode="numeric"
          placeholder="e.g., 3 or 3:45"
          value={dueHour}
          onChange={(e) => setDueHour(e.target.value)}
          onBlur={() => {
            const normalized = normalizeDueTime(dueHour);
            if (normalized) setDueHour(normalized);
          }}
          style={{ width: "130px" }}
        />
        <select value={dueAmPm} onChange={(e) => setDueAmPm(e.target.value)}>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>

      {userSettings.showEstimatedMinutes && (
        <>
          <label>Estimated Minutes:</label>
          <input
            type="number"
            placeholder="e.g., 45"
            value={estTime}
            onChange={(e) => setEstTime(e.target.value)}
          />
        </>
      )}

      {userSettings.showPriority && (
        <>
          <label>Priority:</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="LOW">Low</option>
            <option value="MED">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </>
      )}

      {userSettings.showRepeat && (
        <>
          <label>Repeat:</label>
          <select
            value={repeatFrequency}
            onChange={(e) => setRepeatFrequency(e.target.value)}
          >
            <option value="NONE">Does not repeat</option>
            <option value="DAILY">Daily</option>
            <option value="EVERY_OTHER_WEEKDAY">Every Other Weekday</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
          </select>
        </>
      )}

      {userSettings.showAssignmentLinks !== false && <div className="subtask-form-section assignment-links-form optional-assignment-section">
        <div className="optional-assignment-header double-click-collapse-header" onDoubleClick={(event) => toggleFromHeaderDoubleClick(event, () => setOptionalLinksOpen((open) => !open))} title="Double-click to open or minimize Optional Assignment Links">
          <label>Optional Assignment Links</label>
          <button
            type="button"
            className="optional-assignment-toggle"
            onClick={(event) => toggleFromCollapseButton(event, () => setOptionalLinksOpen((open) => !open))}
            onDoubleClick={stopControlDoubleClick}
            aria-expanded={optionalLinksOpen}
            aria-label={`${optionalLinksOpen ? "Minimize" : "Open"} Optional Assignment Links`}
          >
            {optionalLinksOpen ? "−" : "+"}
          </button>
        </div>
        {optionalLinksOpen && (
          <div className="optional-assignment-content">
        <p className="subtask-form-hint">Name a website, document, or resource.</p>
        <div className="link-form-row">
          <input
            type="text"
            placeholder="Link name"
            value={newLinkName}
            onChange={(e) => {
              setNewLinkName(e.target.value);
              setDraftLinkMessage("");
            }}
            onBlur={handleAddDraftLink}
          />
          <input
            type="text"
            placeholder="example.com/resource"
            value={newLinkUrl}
            onChange={(e) => {
              setNewLinkUrl(e.target.value);
              setDraftLinkMessage("");
            }}
            onBlur={handleAddDraftLink}
          />
        </div>
        <p
          className={`link-entry-feedback ${draftLinkMessage ? (draftLinkMessage.startsWith("Added") ? "success" : "error") : ""}`}
          role="status"
        >
          {draftLinkMessage || "Enter a link name and address, then click outside either field to add it. Confirm the link appears below before saving."}
        </p>
        {draftLinks.length > 0 && (
          <ul className="subtask-draft-list">
            {draftLinks.map((link) => (
              <li key={link.id} className="subtask-draft-item">
                <span>{link.name} — {link.url}</span>
                <button
                  type="button"
                  className="subtask-remove-button"
                  onClick={() =>
                    setDraftLinks((prev) => prev.filter((item) => item.id !== link.id))
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
          </div>
        )}
      </div>}

      {userSettings.showAssignmentFiles !== false && <div className="subtask-form-section attachment-form-section optional-assignment-section">
        <div className="optional-assignment-header double-click-collapse-header" onDoubleClick={(event) => toggleFromHeaderDoubleClick(event, () => setOptionalFilesOpen((open) => !open))} title="Double-click to open or minimize Optional Files">
          <label>Optional Files</label>
          <button
            type="button"
            className="optional-assignment-toggle"
            onClick={(event) => toggleFromCollapseButton(event, () => setOptionalFilesOpen((open) => !open))}
            onDoubleClick={stopControlDoubleClick}
            aria-expanded={optionalFilesOpen}
            aria-label={`${optionalFilesOpen ? "Minimize" : "Open"} Optional Files`}
          >
            {optionalFilesOpen ? "−" : "+"}
          </button>
        </div>
        {optionalFilesOpen && (
          <div className="optional-assignment-content">
        <input
          type="file"
          multiple
          onChange={(e) => {
            handleFileSelection(e.target.files, setDraftFiles);
            e.target.value = "";
          }}
        />
        <p className="subtask-form-hint">Stored only in this browser. Maximum 10 MB per file.</p>
        {draftFiles.map((file, index) => (
          <div className="attachment-draft-row" key={`${file.name}-${file.lastModified}-${index}`}>
            <span>{file.name}</span>
            <button type="button" className="subtask-remove-button" onClick={() => setDraftFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
          </div>
        ))}
          </div>
        )}
      </div>}

      {userSettings.showAssignmentChecklistSteps !== false && <div className="subtask-form-section optional-assignment-section">
        <div className="optional-assignment-header double-click-collapse-header" onDoubleClick={(event) => toggleFromHeaderDoubleClick(event, () => setOptionalChecklistOpen((open) => !open))} title="Double-click to open or minimize Optional Checklist Steps">
          <label>Optional Checklist Steps</label>
          <button
            type="button"
            className="optional-assignment-toggle"
            onClick={(event) => toggleFromCollapseButton(event, () => setOptionalChecklistOpen((open) => !open))}
            onDoubleClick={stopControlDoubleClick}
            aria-expanded={optionalChecklistOpen}
            aria-label={`${optionalChecklistOpen ? "Minimize" : "Open"} Optional Checklist Steps`}
          >
            {optionalChecklistOpen ? "−" : "+"}
          </button>
        </div>
        {optionalChecklistOpen && (
          <div className="optional-assignment-content">
          <p className="subtask-form-hint">
            Break the assignment into smaller pieces. Leave this blank if the
            assignment does not need steps.
          </p>

        <div className="subtask-form-row">
          <input
            type="text"
            placeholder="e.g., Find quotes"
            value={newSubtaskText}
            onChange={(e) => setNewSubtaskText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddDraftSubtask();
              }
            }}
          />
          <button
            type="button"
            className="btn btn-secondary subtask-add-button"
            onClick={handleAddDraftSubtask}
          >
            Add Step
          </button>
        </div>

        <div className="subtask-deadline-fields">
          <select
            aria-label="Checklist due month"
            value={newSubtaskDueMonth}
            onChange={(e) => setNewSubtaskDueMonth(e.target.value)}
          >
            <option value="">Optional month</option>
            {monthNames.map((month, index) => (
              <option key={month} value={String(index + 1).padStart(2, "0")}>{month}</option>
            ))}
          </select>
          <select
            aria-label="Checklist due day"
            value={newSubtaskDueDay}
            onChange={(e) => setNewSubtaskDueDay(e.target.value)}
          >
            <option value="">Day</option>
            {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
              <option key={day} value={String(day).padStart(2, "0")}>{day}</option>
            ))}
          </select>
          <input
            aria-label="Checklist due time"
            type="text"
            placeholder="Time, e.g. 4:30"
            value={newSubtaskDueHour}
            onChange={(e) => setNewSubtaskDueHour(e.target.value)}
          />
          <select
            aria-label="Checklist AM or PM"
            value={newSubtaskDueAmPm}
            onChange={(e) => setNewSubtaskDueAmPm(e.target.value)}
          >
            <option value="AM">AM</option><option value="PM">PM</option>
          </select>
        </div>

        {draftSubtasks.length > 0 && (
          <ul className="subtask-draft-list">
            {draftSubtasks.map((subtask) => (
              <li key={subtask.id} className="subtask-draft-item">
                <span>{subtask.text}</span>
                <button
                  type="button"
                  className="subtask-remove-button"
                  onClick={() => handleRemoveDraftSubtask(subtask.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
          </div>
        )}
      </div>}

      <button
        type="submit"
        className="btn btn-primary"
        disabled={isFormInvalid}
        style={{
          padding: "10px",
          borderRadius: "4px",
          marginTop: "10px",
          cursor: isFormInvalid ? "not-allowed" : "pointer",
          opacity: isFormInvalid ? 0.6 : 1,
        }}
      >
        {schoolLevelCopy.addLabel}
      </button>
    </form>
  );

  // Dashboard summary values. Only incomplete work contributes to the active,
  // overdue, due-today, and remaining-workload statistics.
  const activeDashboardTasks = tasks.filter(
    (task) =>
      !task.isArchived &&
      !task.isDeleted &&
      getTaskStatus(task) !== "completed",
  );
  const activeTasksCount = activeDashboardTasks.length;

  const quickMatchInputNumber = Number(quickMatchMinutes);
  const quickMatchInputIsValid =
    Number.isInteger(quickMatchInputNumber) && quickMatchInputNumber > 0;
  const quickMatchCustomPresets = getQuickMatchCustomPresets(userSettings.quickMatchCustomPresets);
  const quickMatchPresets = getQuickMatchPresets(quickMatchCustomPresets);
  const quickMatchResults = quickMatchSubmittedMinutes
    ? rankQuickMatchCandidates(
        activeDashboardTasks,
        quickMatchSubmittedMinutes,
        {
          getDueBucket: getTaskDueBucket,
          getDeadline: getEffectiveDeadline,
          getStatus: getTaskStatus,
        },
      )
    : [];
  const quickMatchBest = quickMatchResults[0] || null;
  const quickMatchBackups = quickMatchResults.slice(1, 4);

  const handleQuickMatchPreset = (minutes) => {
    setQuickMatchMinutes(String(minutes));
    setQuickMatchSubmittedMinutes(minutes);
  };

  const handleDeleteSelectedChecklists = () => {
    if (selectedChecklistIds.length === 0) return;
    const label = selectedChecklistIds.length === 1 ? "this checklist" : `these ${selectedChecklistIds.length} checklists`;
    if (!window.confirm(`Delete ${label} permanently?`)) return;
    saveChecklistData(checklists.filter((list) => !selectedChecklistIds.includes(list.id)));
    setSelectedChecklistIds([]);
    setChecklistSelectionMode(false);
  };

  const selectWidgetUnderneath = (instance) => {
    const items = (workspaceLayout[workspaceMode]?.[currentTab] || []).filter((item) => !item.hidden && item.id !== instance.id);
    const activeHeight = workspaceLayout.collapsed[instance.type] ? COLLAPSED_WIDGET_HEIGHT : Number(instance.height);
    const overlaps = items.filter((item) => {
      const itemHeight = workspaceLayout.collapsed[item.type] ? COLLAPSED_WIDGET_HEIGHT : Number(item.height);
      return Number(item.x) < Number(instance.x) + Number(instance.width)
        && Number(item.x) + Number(item.width) > Number(instance.x)
        && Number(item.y) < Number(instance.y) + activeHeight
        && Number(item.y) + itemHeight > Number(instance.y);
    });
    const underneath = overlaps
      .sort((a, b) => {
        const aIsLower = Number(a.zIndex || 1) < Number(instance.zIndex || 1) ? 1 : 0;
        const bIsLower = Number(b.zIndex || 1) < Number(instance.zIndex || 1) ? 1 : 0;
        return bIsLower - aIsLower || Number(b.zIndex || 1) - Number(a.zIndex || 1);
      })[0];
    if (!underneath) return;
    const highestLayer = Math.max(1, ...items.map((item) => Number(item.zIndex) || 1), Number(instance.zIndex) || 1);
    updateWidgetInstance(underneath.id, { zIndex: highestLayer + 1 });
  };

  const quickMatchPresetDraftNumber = Number(quickMatchPresetDraft);
  const quickMatchPresetDraftIsValid =
    Number.isInteger(quickMatchPresetDraftNumber) &&
    quickMatchPresetDraftNumber > 0 &&
    quickMatchPresetDraftNumber <= 1440 &&
    !quickMatchPresets.includes(quickMatchPresetDraftNumber);

  const handleAddQuickMatchPreset = (event) => {
    event.preventDefault();
    if (!quickMatchPresetDraftIsValid) return;
    handleAddFieldSettingChange(
      "quickMatchCustomPresets",
      getQuickMatchCustomPresets([...quickMatchCustomPresets, quickMatchPresetDraftNumber]),
    );
    setQuickMatchPresetDraft("");
  };

  const handleRemoveQuickMatchPreset = (minutes) => {
    handleAddFieldSettingChange(
      "quickMatchCustomPresets",
      quickMatchCustomPresets.filter((preset) => preset !== minutes),
    );
  };

  const renderQuickMatchCard = () => (
    <section className="quick-match-card" aria-label="What Should I Do?">
      <div className="quick-match-header">
        <h2>What Should I Do?</h2>
        <p>Find the best assignment for the time you have.</p>
      </div>
      <form
        className="quick-match-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (quickMatchInputIsValid) setQuickMatchSubmittedMinutes(quickMatchInputNumber);
        }}
      >
        <label>
          <span>I have</span>
          <input
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={quickMatchMinutes}
            onChange={(e) => setQuickMatchMinutes(e.target.value)}
            aria-label="Available minutes"
          />
          <span>minutes</span>
        </label>
        <button type="submit" className="btn btn-primary" disabled={!quickMatchInputIsValid}>Find Task</button>
      </form>
      <div className="quick-match-presets" aria-label="Quick time choices">
        {quickMatchPresets.map((minutes) => (
          <button
            type="button"
            key={minutes}
            className={quickMatchSubmittedMinutes === minutes ? "active" : ""}
            onClick={() => handleQuickMatchPreset(minutes)}
          >
            {minutes} min
          </button>
        ))}
      </div>
      <div className="quick-match-result" aria-live="polite">
        {quickMatchSubmittedMinutes === null ? (
          <p className="quick-match-placeholder">Enter your available time to get a match.</p>
        ) : !quickMatchBest ? (
          <p className="quick-match-placeholder">No incomplete assignments are available.</p>
        ) : (
          <>
            <span className="quick-match-kicker">Best fit</span>
            <div className="quick-match-title-row">
              <strong>{quickMatchBest.task.title}</strong>
              <span
                className="quick-match-course"
                style={{
                  backgroundColor: getCourseColor(quickMatchBest.task.course),
                  color: getTextColorForCourse(quickMatchBest.task.course),
                }}
              >
                {quickMatchBest.task.course || getTaskCategory(quickMatchBest.task)}
              </span>
            </div>
            <div className="quick-match-meta">
              <span>{quickMatchBest.hasEstimate ? `${quickMatchBest.estimate} min` : "No estimate"}</span>
              <span>{quickMatchBest.dueLabel}</span>
              <span>{quickMatchBest.task.priority || "No"} priority</span>
            </div>
            {renderAssignmentCountdown(quickMatchBest.task, "quick-match-countdown")}
            <p className="quick-match-reason">{getQuickMatchReason(quickMatchBest)}</p>
            <div className="quick-match-actions">
              <button type="button" className="btn btn-secondary" onClick={() => handleRecommendedTaskClick(quickMatchBest.task.id)}>{getFocusActionLabel(quickMatchBest.task)}</button>
              {getTaskStatus(quickMatchBest.task) === "todo" && (
                <button type="button" className="btn btn-primary" onClick={() => handleQuickMatchStart(quickMatchBest.task.id)}>Start this</button>
              )}
            </div>
            {quickMatchBackups.length > 0 && (
              <div className="quick-match-backups">
                <span>Backups</span>
                <ul>
                  {quickMatchBackups.map((match) => (
                    <li key={match.task.id}>
                      <button type="button" className="quick-match-backup-main" onClick={() => handleRecommendedTaskClick(match.task.id)}>
                        <strong>{match.task.title}</strong>
                        <small>{match.hasEstimate ? `${match.estimate} min` : "No estimate"} | {match.dueLabel}</small>
                      </button>
                      {getTaskStatus(match.task) === "todo" && (
                        <button type="button" className="quick-match-backup-start" onClick={() => handleQuickMatchStart(match.task.id)}>Start</button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );

  const renderStandaloneChecklists = () => {
    const selectedList = checklists.find((list) => list.id === selectedChecklistId);
    const palette = [1, 2, 3, 4, 5].map((index) =>
      userSettings.customColors?.[`checklistPalette${index}`] || THEME_COLOR_DEFAULTS[theme][`checklistPalette${index}`],
    );

    if (!selectedList) {
      const orderedLists = [...checklists].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
      return (
        <section className="standalone-checklists" aria-label="Standalone checklists">
          <div className="checklist-gallery-toolbar">
            <div><h2>Checklists</h2><p>Quick lists that stay separate from assignments.</p></div>
            <div className="checklist-gallery-actions">
              {checklists.length > 0 && (
                <button type="button" className="btn btn-secondary" onClick={() => { setChecklistSelectionMode((active) => !active); setSelectedChecklistIds([]); }}>
                  {checklistSelectionMode ? "Cancel" : "Select"}
                </button>
              )}
              <button type="button" className="btn btn-primary" onClick={handleCreateChecklist}>New list</button>
            </div>
          </div>
          {checklistSelectionMode && (
            <div className="checklist-selection-toolbar">
              <button type="button" className="btn btn-secondary" onClick={() => setSelectedChecklistIds(selectedChecklistIds.length === checklists.length ? [] : checklists.map((list) => list.id))}>
                {selectedChecklistIds.length === checklists.length ? "Clear all" : "Select all"}
              </button>
              <span>{selectedChecklistIds.length} selected</span>
              <button type="button" className="btn btn-danger" disabled={selectedChecklistIds.length === 0} onClick={handleDeleteSelectedChecklists}>Delete selected</button>
            </div>
          )}
          {orderedLists.length === 0 ? <p className="checklist-empty friendly-empty" role="status">No lists yet — when something pops into your head, you can start one right here.</p> : (
            <div className="checklist-gallery">
              {orderedLists.map((list) => (
                <article
                  key={list.id}
                  className="checklist-gallery-card"
                  data-reorder-id={list.id}
                  style={{ backgroundColor: list.color, color: getContrastText(list.color) }}
                  draggable={!checklistSelectionMode}
                  onDragStart={(event) => event.dataTransfer.setData("text/checklist-list", list.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleReorderChecklist(event.dataTransfer.getData("text/checklist-list"), list.id)}
                >
                  {!checklistSelectionMode && <button type="button" className="checklist-list-grip" onPointerDown={(event) => startChecklistTouchReorder(event, ".checklist-gallery-card", list.id, handleReorderChecklist)} aria-label={`Reorder ${list.title}`}>⠿</button>}
                  {checklistSelectionMode && <input className="checklist-list-select" type="checkbox" checked={selectedChecklistIds.includes(list.id)} onChange={(event) => setSelectedChecklistIds((ids) => event.target.checked ? [...ids, list.id] : ids.filter((id) => id !== list.id))} aria-label={`Select ${list.title || "Untitled checklist"}`} />}
                  <button type="button" className="checklist-card-open" onClick={() => checklistSelectionMode ? setSelectedChecklistIds((ids) => ids.includes(list.id) ? ids.filter((id) => id !== list.id) : [...ids, list.id]) : setSelectedChecklistId(list.id)}>
                    <strong>{list.pinned ? "📌 " : ""}{list.title || "Untitled checklist"}</strong>
                    <span>{(list.items || []).filter((item) => item.isDone).length}/{(list.items || []).length} checked</span>
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      );
    }

    return (
      <section className="standalone-checklists checklist-editor" style={{ "--active-list-color": selectedList.color, "--active-list-text": getContrastText(selectedList.color) }}>
        <div className="checklist-editor-toolbar">
          <button type="button" className="btn btn-secondary" onClick={() => setSelectedChecklistId(null)}>← Lists</button>
          <button type="button" className={`checklist-pin-button${selectedList.pinned ? " active" : ""}`} onClick={() => updateChecklist(selectedList.id, (list) => ({ ...list, pinned: !list.pinned }))}>{selectedList.pinned ? "Unpin" : "Pin"}</button>
        </div>
        <input className="checklist-title-input" value={selectedList.title} onChange={(event) => updateChecklist(selectedList.id, (list) => ({ ...list, title: event.target.value }))} aria-label="Checklist title" />
        <div className="checklist-color-row">
          {palette.map((color) => <button type="button" key={color} className="checklist-color-swatch" style={{ backgroundColor: color }} onClick={() => updateChecklist(selectedList.id, (list) => ({ ...list, color }))} aria-label={`Use color ${color}`} />)}
          <label className="checklist-custom-color">Custom <input type="color" value={selectedList.color} onChange={(event) => updateChecklist(selectedList.id, (list) => ({ ...list, color: event.target.value }))} /></label>
        </div>
        <form className="checklist-new-item" onSubmit={(event) => {
          event.preventDefault();
          const input = event.currentTarget.elements.namedItem("checklistItem");
          handleAddChecklistItem(selectedList.id, input.value);
          input.value = "";
          input.focus();
        }}>
          <input name="checklistItem" placeholder="Add a checklist item…" autoComplete="off" />
          <button type="submit" className="btn btn-primary">Add</button>
        </form>
        {(selectedList.items || []).length === 0 ? <p className="checklist-empty friendly-empty" role="status">This list is all clear. Add a step whenever you’re ready.</p> : (
          <ul className="standalone-checklist-items">
            {(selectedList.items || []).map((item) => (
              <li
                key={item.id}
                className={item.isDone ? "is-done" : ""}
                data-reorder-id={item.id}
                draggable
                onDragStart={(event) => event.dataTransfer.setData("text/checklist-item", item.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleReorderChecklistItem(selectedList.id, event.dataTransfer.getData("text/checklist-item"), item.id)}
              >
                <button type="button" className="checklist-item-grip" title="Drag to reorder" onPointerDown={(event) => startChecklistTouchReorder(event, ".standalone-checklist-items li", item.id, (source, target) => handleReorderChecklistItem(selectedList.id, source, target))}>⠿</button>
                <input type="checkbox" checked={item.isDone} onChange={(event) => handleUpdateChecklistItem(selectedList.id, item.id, "isDone", event.target.checked)} />
                <input className="checklist-item-text" value={item.text} onChange={(event) => handleUpdateChecklistItem(selectedList.id, item.id, "text", event.target.value)} />
                <div className="checklist-item-date-fields">
                  <input type="date" value={item.dueDate || ""} onChange={(event) => handleUpdateChecklistItem(selectedList.id, item.id, "dueDate", event.target.value)} aria-label={`Due date for ${item.text}`} />
                  {userSettings.checklistTimesEnabled && <input type="time" value={item.dueTime || ""} onChange={(event) => handleUpdateChecklistItem(selectedList.id, item.id, "dueTime", event.target.value)} aria-label={`Due time for ${item.text}`} />}
                </div>
                {item.dueDate && <div className="checklist-item-deadline"><strong>{formatChecklistDeadline(item)}</strong><span>{formatChecklistCountdown(item, checklistNow)}</span></div>}
                <button type="button" className="checklist-item-delete" onClick={() => handleDeleteChecklistItem(selectedList.id, item.id)} aria-label={`Delete ${item.text}`}>×</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  };

  const renderWorkspaceCalendar = () => (
    <section className="dashboard-calendar-card" aria-labelledby="dashboard-calendar-title">
      <div className="dashboard-calendar-header">
        <h2 id="dashboard-calendar-title">Calendar</h2>
        <button type="button" onClick={() => setCurrentTab("calendar")}>Open</button>
      </div>
      <p>Select a date to open the full calendar.</p>
      <Calendar
        value={selectedDate}
        calendarType={userSettings.calendarWeekStartsOn === "monday" ? "iso8601" : "gregory"}
        showNeighboringMonth={userSettings.showNeighboringMonth !== false}
        onClickDay={handleDashboardCalendarClick}
        tileClassName={({ date, view }) => view === "month" && activeDashboardTasks.some((task) => Number(task.dueMonth) === date.getMonth() + 1 && Number(task.dueDay) === date.getDate() && getTaskDueBucket(task).startsWith("Overdue")) ? "calendar-overdue-day" : ""}
        tileContent={({ date, view }) => {
          if (view !== "month" || userSettings.showCalendarTaskDots === false) return null;
          const dots = getCourseDotsForDate(date);
          return dots.length > 0 ? (
            <span className="calendar-course-dots" aria-label={`${dots.length} course${dots.length === 1 ? "" : "s"} with assignments`}>
              {dots.map((dot) => (
                <i key={dot.course} style={{ backgroundColor: dot.color }} title={dot.course} />
              ))}
            </span>
          ) : null;
        }}
      />
    </section>
  );

  const deadlineConfidenceCounts = summarizeDeadlineConfidence(activeDashboardTasks, (task) => getDeadlineDate(task.dueMonth, task.dueDay, task.dueHour, task.dueAmPm));
  const overdueTasksCount = deadlineConfidenceCounts.overdue;
  const dueTodayCount = deadlineConfidenceCounts.today;
  const dueTomorrowCount = deadlineConfidenceCounts.tomorrow;

  const totalEstimatedMinutes = activeDashboardTasks
    .reduce((total, task) => total + (Number(task.estimatedMinutes) || 0), 0);

  const estimatedHours = Math.floor(totalEstimatedMinutes / 60);
  const estimatedMinutesLeft = totalEstimatedMinutes % 60;
  const overviewCourse = courses.includes(courseOverviewSelection)
    ? courseOverviewSelection
    : courses[0] || "Other";
  const overviewCourseTasks = activeDashboardTasks.filter((task) => task.course === overviewCourse);
  const sortedOverviewCourseTasks = sortAssignmentsByDuePriorityEstimate(overviewCourseTasks);
  const overviewNextTask = sortedOverviewCourseTasks[0] || null;
  const overviewCourseEstimatedMinutes = overviewCourseTasks.reduce((total, task) => total + (Number(task.estimatedMinutes) || 0), 0);
  const overviewCourseWorkloadLabel = `${Math.floor(overviewCourseEstimatedMinutes / 60)}h ${overviewCourseEstimatedMinutes % 60}m`;
  const courseOverviewSummary = {
    todo: overviewCourseTasks.filter((task) => getTaskStatus(task) === "todo").length,
    inProgress: overviewCourseTasks.filter((task) => getTaskStatus(task) === "inProgress").length,
    upcoming: overviewCourseTasks.filter((task) => ["todo", "inProgress"].includes(getTaskStatus(task))).length,
    overdue: overviewCourseTasks.filter((task) => getTaskDueBucket(task).startsWith("Overdue")).length,
    dueToday: overviewCourseTasks.filter((task) => getTaskDueBucket(task).startsWith("Due Today")).length,
    dueTomorrow: overviewCourseTasks.filter((task) => getTaskDueBucket(task).startsWith("Due Tomorrow")).length,
    noDate: overviewCourseTasks.filter((task) => getTaskDueBucket(task) === "No Due Date").length,
  };
  const dashboardReminderHours = [24, 48, 72, 168, 336, 720].includes(Number(userSettings.dashboardReminderHours))
    ? Number(userSettings.dashboardReminderHours)
    : 24;
  const reminderWindowEnd = checklistNow.getTime() + dashboardReminderHours * 60 * 60 * 1000;
  const dashboardReminderTasks = activeDashboardTasks
    .map((task) => ({ task, deadline: getDeadlineDate(task.dueMonth, task.dueDay, task.dueHour, task.dueAmPm) }))
    .filter(({ deadline }) => deadline && deadline.getTime() >= checklistNow.getTime() && deadline.getTime() <= reminderWindowEnd)
    .sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
  const dashboardOverdueTasks = activeDashboardTasks
    .map((task) => ({ task, deadline: getDeadlineDate(task.dueMonth, task.dueDay, task.dueHour, task.dueAmPm) }))
    .filter(({ deadline }) => deadline && deadline.getTime() < checklistNow.getTime())
    .sort((a, b) => a.deadline.getTime() - b.deadline.getTime());

  const widgetTitles = {
    "quick-match": "What Should I Do?",
    "stat-active": "Active",
    "stat-today": "Due Today",
    "stat-overdue": "Overdue",
    "stat-workload": "Workload",
    recommended: schoolLevelCopy.planTitle,
    "mini-calendar": "Mini Calendar",
    checklists: "Checklists",
    "add-assignment": schoolLevelCopy.addLabel,
    "course-colors": "Course Colors",
    "course-overview": `${schoolLevelCopy.courseLabel} Overview`,
    reminders: "Reminders",
    "todo-master": schoolLevelCopy.todoLabel,
    "in-progress-master": "In Progress",
    "completed-master": `Completed ${schoolLevelCopy.taskPlural}`,
  };
  const bucketKeys = ["overdue", "today", "tomorrow", "this-week", "next-week", "later", "no-date"];
  const getWorkspaceWidgetTitle = (type) => {
    const bucketIndex = bucketKeys.findIndex((key) => type.endsWith(`-bucket-${key}`));
    if (bucketIndex >= 0) return `${type.startsWith("in-progress") ? "In Progress" : "To Do"}: ${bucketsOrder[bucketIndex]}`;
    return widgetTitles[type] || type;
  };
  const workspaceWidgetCatalog = [...new Map(
    Object.values(workspaceLayout[workspaceMode] || {}).flat().map((item) => [item.type, item]),
  ).values()].sort((a, b) => getWorkspaceWidgetTitle(a.type).localeCompare(getWorkspaceWidgetTitle(b.type)));
  const visibleWidgetCatalog = workspaceWidgetCatalog.filter((item) =>
    getWorkspaceWidgetTitle(item.type).toLowerCase().includes(widgetSearch.trim().toLowerCase()),
  );

  const renderRecommendedWidget = () => recommendationItems.length === 0 ? <div className="empty-state-action friendly-empty" role="status"><p className="recommended-plan-empty">You’re all caught up! Add something whenever you’re ready, and we’ll help you decide what to tackle first.</p><button type="button" className="btn btn-primary" onClick={() => setAddAssignmentOpen(true)}>Add an assignment</button></div> : (
    <>
      <div className="recommended-plan-workload compact"><strong>{recommendationWorkloadLabel}</strong><span>Top-plan workload{recommendationWorkload.unknownCount > 0 ? ` + ${recommendationWorkload.unknownCount} unestimated` : ""}</span></div>
      <ol className="recommended-plan-list portable-recommendations">
        {recommendationItems.map((item, index) => (
          <li key={item.task.id} className={`recommended-plan-item${getTaskDueBucket(item.task).startsWith("Overdue") ? " is-overdue" : ""}`}>
            <button type="button" className="recommended-plan-button" onClick={() => handleRecommendedTaskClick(item.task.id)}>
              <span className="recommended-plan-rank">{index + 1}</span>
              <div className="recommended-plan-content">
                <strong>{item.task.title}</strong>
                <div className="recommended-plan-details"><span>{item.task.course}</span><span>{item.dueLabel}</span><span>{item.task.priority} priority</span></div>
                <div className="recommended-plan-reasons">{item.reasons.map((reason) => <span key={reason}>{reason}</span>)}</div>
                {renderAssignmentCountdown(item.task, "recommended-countdown")}
              </div>
            </button>
            <div className="recommended-plan-actions">
              <button type="button" className="btn btn-secondary" onClick={() => handleRecommendedTaskClick(item.task.id)}>{getFocusActionLabel(item.task)}</button>
              {getTaskStatus(item.task) === "todo" && <button type="button" className="btn btn-primary" onClick={() => handleQuickMatchStart(item.task.id)}>Start</button>}
            </div>
          </li>
        ))}
      </ol>
    </>
  );

  const renderCourseColorsWidget = () => (
    <div className="portable-course-colors">
      <p className="hint-text">Customize course colors or remove courses you no longer need.</p>
      <form className="course-add-form portable-course-add-form" onSubmit={handleAddCourse}>
        <label htmlFor="portable-new-course-name">Add course</label>
        <input
          id="portable-new-course-name"
          type="text"
          value={newCourseName}
          onChange={(event) => setNewCourseName(event.target.value)}
          placeholder="Course name"
        />
        <button type="submit" className="btn btn-primary" disabled={!newCourseName.trim()}>Add</button>
      </form>
      {courses.map((course) => <div className="portable-course-color-row" key={course}><span style={{ backgroundColor: getCourseColor(course), color: getTextColorForCourse(course) }}>{course}</span><input type="color" value={getCourseColor(course)} onChange={(event) => handleCourseColorChange(course, event.target.value)} /><button type="button" className="btn btn-danger" disabled={course === "Other"} onClick={() => handleDeleteCourse(course)}>Delete</button></div>)}
    </div>
  );

  const renderCourseOverviewWidget = () => {
    const courseColor = getCourseColor(overviewCourse);
    return (
      <section className="course-overview-widget">
        <label><span>Choose a {schoolLevelCopy.courseLabel.toLowerCase()}</span><select value={overviewCourse} onChange={(event) => setCourseOverviewSelection(event.target.value)}>{courses.map((course) => <option key={course} value={course}>{course}</option>)}</select></label>
        <button type="button" className="course-overview-primary" style={{ "--course-overview-color": courseColor, "--course-overview-text": getTextColorForCourse(overviewCourse) }} onClick={() => handleCourseOverviewOpen(overviewCourse)}>
          <span>Upcoming {schoolLevelCopy.taskPlural}</span>
          <strong>{courseOverviewSummary.upcoming}</strong>
          <small>Includes {schoolLevelCopy.todoLabel.toLowerCase()} and in progress</small>
        </button>
        <div className="course-overview-breakdown">
          <div><strong>{courseOverviewSummary.inProgress}</strong><span>In progress</span></div>
          <div className={courseOverviewSummary.dueToday > 0 ? "has-warning" : ""}><strong>{courseOverviewSummary.dueToday}</strong><span>Due today</span></div>
          <div><strong>{courseOverviewSummary.dueTomorrow}</strong><span>Due tomorrow</span></div>
          <div className={courseOverviewSummary.overdue > 0 ? "has-danger" : ""}><strong>{courseOverviewSummary.overdue}</strong><span>Overdue</span></div>
          <div><strong>{overviewCourseEstimatedMinutes > 0 ? overviewCourseWorkloadLabel : courseOverviewSummary.noDate}</strong><span>{overviewCourseEstimatedMinutes > 0 ? "Estimated" : "No date"}</span></div>
        </div>
        {overviewNextTask ? (
          <article className="course-overview-next">
            <span>Next up</span>
            <strong>{overviewNextTask.title}</strong>
            <small>{getTaskDueBucket(overviewNextTask)} | {overviewNextTask.priority || "No"} priority</small>
            {renderAssignmentCountdown(overviewNextTask, "course-overview-countdown")}
            <div className="course-overview-actions">
              <button type="button" className="btn btn-secondary" onClick={() => handleRecommendedTaskClick(overviewNextTask.id)}>{getFocusActionLabel(overviewNextTask)}</button>
              {getTaskStatus(overviewNextTask) === "todo" && <button type="button" className="btn btn-primary" onClick={() => handleQuickMatchStart(overviewNextTask.id)}>Start</button>}
            </div>
          </article>
        ) : (
          <p className="course-overview-empty friendly-empty" role="status">You’re all clear in this {schoolLevelCopy.courseLabel.toLowerCase()} right now.</p>
        )}
      </section>
    );
  };

  const renderRemindersWidget = () => {
    const overdueItems = dashboardOverdueTasks.slice(0, 4).map((item) => ({ ...item, overdue: true }));
    const upcomingItems = dashboardReminderTasks.slice(0, 6).map((item) => ({ ...item, overdue: false }));
    const rangeLabel = dashboardReminderHours < 72
      ? `${dashboardReminderHours} hours`
      : `${dashboardReminderHours / 24} days`;
    const renderReminderGroup = (title, items) => items.length > 0 && (
      <div className="reminder-widget-group">
        <h4>{title}</h4>
        <ul className="reminder-widget-list">
          {items.map(({ task, deadline, overdue }) => (
            <li key={`${overdue ? "overdue" : "upcoming"}-${task.id}`}>
              <button type="button" className="reminder-widget-main" onClick={() => handleReminderTaskClick(task)}>
                <span><strong>{task.title}</strong><small>{task.course}</small></span>
                <span className={overdue ? "is-overdue" : ""}><strong>{formatAssignmentCountdown(deadline, checklistNow)}</strong><small>{deadline.toLocaleDateString(undefined, { month: "short", day: "numeric" })} | {deadline.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></span>
              </button>
              {getTaskStatus(task) === "todo" && <button type="button" className="reminder-widget-start" onClick={() => handleQuickMatchStart(task.id)}>Start</button>}
            </li>
          ))}
        </ul>
      </div>
    );
    return (
      <section className="dashboard-reminders-widget">
        <div className="reminder-widget-summary">
          <div className={dueTodayCount > 0 ? "has-warning" : ""}><strong>{dueTodayCount}</strong><span>Due today</span></div>
          <div><strong>{dueTomorrowCount}</strong><span>Due tomorrow</span></div>
          <div className={dashboardOverdueTasks.length > 0 ? "has-danger" : ""}><strong>{dashboardOverdueTasks.length}</strong><span>Overdue</span></div>
        </div>
        <label className="reminder-horizon-control"><span>Upcoming window</span><select value={dashboardReminderHours} onChange={(event) => handleAddFieldSettingChange("dashboardReminderHours", Number(event.target.value))}><option value={24}>Next 24 hours</option><option value={48}>Next 48 hours</option><option value={72}>Next 3 days</option><option value={168}>Next 7 days</option><option value={336}>Next 14 days</option><option value={720}>Next 30 days</option></select></label>
        {overdueItems.length === 0 && upcomingItems.length === 0 ? <p className="reminder-widget-empty friendly-empty" role="status">Looks calm in here — nothing is due in this window.</p> : (
          <>
            {renderReminderGroup("Overdue", overdueItems)}
            {renderReminderGroup(`Due in the next ${rangeLabel}`, upcomingItems)}
          </>
        )}
      </section>
    );
  };
  const renderTaskActionButtons = (task, status) => {
  const stopCardClick = (event, action) => {
    event.stopPropagation();
    action();
  };

  if (status === "todo") {
    return (
      <div className="task-actions">
        <button
          type="button"
          className="btn btn-secondary status-action-button"
          onClick={(event) => stopCardClick(event, () => handleStartTask(task.id))}
        >
          Start
        </button>

        <button
          type="button"
          className="btn btn-primary"
          onClick={(event) => stopCardClick(event, () => handleComplete(task.id))}
        >
          Complete ✅
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={(event) => stopCardClick(event, () => handleEditStart(task))}
        >
          ✏️ Edit
        </button>

        {renderVoiceUndoAction(task)}

        <button
          type="button"
          className="btn btn-danger"
          onClick={(event) => stopCardClick(event, () => handleDelete(task.id))}
        >
          Move to Trash
        </button>
      </div>
    );
  }

  if (status === "inProgress") {
    return (
      <div className="task-actions task-actions-in-progress">
        <div className="task-action-pair task-action-pair-left">
          <button type="button" className="btn btn-warning status-action-button" onClick={(event) => stopCardClick(event, () => handleMoveToTodo(task.id))}>Back to To Do</button>
          <button type="button" className="btn btn-primary" onClick={(event) => stopCardClick(event, () => handleComplete(task.id))}>Complete ✅</button>
        </div>
        {renderVoiceUndoAction(task)}
        <div className="task-action-pair task-action-pair-right">
          <button type="button" className="btn btn-secondary" onClick={(event) => stopCardClick(event, () => handleEditStart(task))}>✏️ Edit</button>
          <button type="button" className="btn btn-danger" onClick={(event) => stopCardClick(event, () => handleDelete(task.id))}>Move to Trash</button>
        </div>
      </div>
    );
  }

  if (status === "completed") {
    return (
      <div className="task-actions">
        <button
          type="button"
          className="btn btn-warning status-action-button"
          onClick={(event) => stopCardClick(event, () => handleUndo(task.id))}
        >
          Back to In Progress
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={(event) => stopCardClick(event, () => handleArchive(task.id))}
          disabled={task.isArchived}
        >
          Archive
        </button>

        <button
          type="button"
          className="btn btn-danger"
          onClick={(event) => stopCardClick(event, () => handleDelete(task.id))}
        >
          Move to Trash
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={(event) => stopCardClick(event, () => handleEditStart(task))}
        >
          ✏️ Edit
        </button>
      </div>
    );
  }

  return null;
};
  const browserNotificationPermission = "Notification" in window ? Notification.permission : "unsupported";
  const reminderUserStatus = deriveReminderUserStatus({
    featureEnabled: EXTERNAL_PUSH_CLIENT_ENABLED,
    remindersEnabled: Boolean(userSettings.externalPushEnabled),
    supported: browserNotificationPermission !== "unsupported" && externalPushStatus !== "unsupported",
    permission: browserNotificationPermission,
    providerConnected: externalPushDiagnostics.providerConnected,
    serverEnrolled: externalPushDiagnostics.serverEnrolled,
    rawStatus: externalPushStatus,
  });
  const reminderStatusCopy = getReminderStatusCopy(reminderUserStatus);
  const renderTaskReminderIndicator = (task) => {
    const indicator = getAssignmentReminderIndicator({ remindersEnabled: Boolean(userSettings.externalPushEnabled), hasDeadline: Boolean(getExternalReminderForTask(task)) && getTaskStatus(task) !== "completed" && !task.isDeleted && !task.isArchived, taskState: assignmentReminderStates[task.id] || (reminderUserStatus === "active" ? "healthy" : "pending"), userStatus: reminderUserStatus });
    return indicator ? <span className={`task-reminder-indicator is-${indicator.tone}`} aria-label={indicator.label} title={indicator.label}>🔔</span> : null;
  };
  const renderTaskMasterWidget = (status, onlyBucket = null) => {
    const allSource = status === "todo" ? sortedTodoTasks : status === "inProgress" ? sortedInProgressTasks : completedTasks;
    const source = onlyBucket ? allSource.filter((task) => getTaskDueBucket(task) === onlyBucket) : allSource;
    const grouped = status === "todo" ? groupedTasks : status === "inProgress" ? groupedInProgressTasks : null;
    const renderCard = (task) => (
  <li
    key={task.id}
    id={`${status}-task-${task.id}`}
    className={`task-card${status === "inProgress" ? " in-progress-task-card" : ""}${task.priority === "HIGH" ? " task-card-high" : ""}${getTaskDueBucket(task).startsWith("Overdue") ? " is-overdue" : ""}${expandedTaskId === task.id ? " expanded" : ""}`}
    onClick={() => toggleTaskExpansion(task.id)}
  >
    <div>
      <div className="task-title-row">
        <strong className="task-title-text">{task.title}</strong>

        {task.course ? (
          <span
            className="task-course-pill"
            style={{
              backgroundColor: getCourseColor(task.course),
              color: getTextColorForCourse(task.course),
            }}
          >
            {task.course}
          </span>
        ) : null}

        {status === "inProgress" ? (
          <span className="in-progress-status-pill">In Progress</span>
        ) : null}
        {renderTaskReminderIndicator(task)}
      </div>

      <div className="task-details">{formatTaskDetails(task)}</div>

      {renderAssignmentCountdown(task)}
      {renderSubtaskProgressLine(task)}
    </div>

    {renderTaskActionButtons(task, status)}

    {expandedTaskId === task.id && (
      <div
        className="task-notes-panel"
        onClick={(event) => event.stopPropagation()}
      >
        {renderExpandedTaskDetails(task, `${status}-widget-notes-${task.id}`)}
      </div>
    )}
  </li>
);
    return (
      <div className="task-master-widget">
        {!onlyBucket && renderFilterToggle()}
        <div className="task-master-heading"><h3>{status === "todo" ? `${schoolLevelCopy.todoLabel} (${source.length})` : status === "inProgress" ? `In Progress (${source.length})` : `Completed ${schoolLevelCopy.taskPlural} (${source.length})`}</h3>{status === "completed" && <button type="button" className="btn btn-secondary" onClick={handleArchiveAll} disabled={unarchivedCompletedCount === 0}>Archive All</button>}</div>
        {!onlyBucket && renderFilterControls()}
        {source.length === 0 ? <p className="placeholder-text friendly-empty" role="status">{schoolLevelCopy.emptyCopy}</p> : (status === "completed" || onlyBucket) ? <ul className="task-list">{source.map(renderCard)}</ul> : <div>{bucketsOrder.map((bucket) => grouped[bucket]?.length ? <section className="bucket-section" key={bucket}><h4 className="bucket-title">{bucket}</h4><ul className="task-list">{grouped[bucket].map(renderCard)}</ul></section> : null)}</div>}
      </div>
    );
  };

  const renderWidgetContent = (type) => {
    if (type === "quick-match") return renderQuickMatchCard();
    if (type === "mini-calendar") return renderWorkspaceCalendar();
    if (type === "checklists") return renderStandaloneChecklists();
    if (type === "recommended") return renderRecommendedWidget();
    if (type === "add-assignment") return renderAddAssignmentForm("workspace");
    if (type === "course-colors") return renderCourseColorsWidget();
    if (type === "course-overview") return renderCourseOverviewWidget();
    if (type === "reminders") return renderRemindersWidget();
    if (type === "todo-master") return renderTaskMasterWidget("todo");
    if (type === "in-progress-master") return renderTaskMasterWidget("inProgress");
    if (type === "completed-master") return renderTaskMasterWidget("completed");
    const bucketIndex = bucketKeys.findIndex((key) => type.endsWith(`-bucket-${key}`));
    if (bucketIndex >= 0) return renderTaskMasterWidget(type.startsWith("in-progress") ? "inProgress" : "todo", bucketsOrder[bucketIndex]);
    const statContent = {
      "stat-active": [activeTasksCount, "Assignments left"],
      "stat-today": [dueTodayCount, "Need attention"],
      "stat-overdue": [overdueTasksCount, "Past deadline"],
      "stat-workload": [`${estimatedHours}h ${estimatedMinutesLeft}m`, "Estimated remaining"],
    }[type];
    return statContent ? <div className="portable-stat"><strong>{statContent[0]}</strong><p>{statContent[1]}</p></div> : null;
  };

  const renderWorkspaceInstance = (instance) => (
    <WorkspaceWidget
      key={instance.id}
      instance={instance}
      title={getWorkspaceWidgetTitle(instance.type)}
      locked={Boolean(workspaceLayout.locked?.[workspaceMode])}
      mobileResize={workspaceMode === "mobile"}
      collapsed={Boolean(workspaceLayout.collapsed[instance.type]) || (() => {
        const bucketIndex = bucketKeys.findIndex((key) => instance.type.endsWith(`-bucket-${key}`));
        if (bucketIndex < 0) return false;
        const source = instance.type.startsWith("in-progress") ? sortedInProgressTasks : sortedTodoTasks;
        return !source.some((task) => getTaskDueBucket(task) === bucketsOrder[bucketIndex]);
      })()}
      onToggle={() => toggleWorkspaceWidget(instance)}
      onResize={(width, height, canvasWidth, x = instance.x, y = instance.y) => updateWidgetInstance(instance.id, { width, height, expandedHeight: height, x, y, xRatio: canvasWidth > 0 ? x / canvasWidth : instance.xRatio }, { canvasWidth })}
      onPosition={(x, y, canvasWidth) => {
        const highestLayer = Math.max(1, ...Object.values(workspaceLayout[workspaceMode] || {}).flat().map((item) => Number(item.zIndex) || 1));
        updateWidgetInstance(instance.id, { x, xRatio: canvasWidth > 0 ? x / canvasWidth : 0, y, zIndex: highestLayer + 1 }, { canvasWidth });
      }}
      onMove={(tab) => moveWorkspaceWidget(instance, tab, false)}
      onCopy={(tab) => moveWorkspaceWidget(instance, tab, true)}
      onHide={() => hideWorkspaceWidget(instance)}
      onSelectUnderneath={(() => {
        const instanceHeight = workspaceLayout.collapsed[instance.type] ? COLLAPSED_WIDGET_HEIGHT : Number(instance.height);
        const hasUnderneath = (workspaceLayout[workspaceMode]?.[currentTab] || []).some((item) => {
          if (item.hidden || item.id === instance.id) return false;
          const itemHeight = workspaceLayout.collapsed[item.type] ? COLLAPSED_WIDGET_HEIGHT : Number(item.height);
          return Number(item.x) < Number(instance.x) + Number(instance.width)
            && Number(item.x) + Number(item.width) > Number(instance.x)
            && Number(item.y) < Number(instance.y) + instanceHeight
            && Number(item.y) + itemHeight > Number(instance.y);
        });
        return hasUnderneath ? () => selectWidgetUnderneath(instance) : null;
      })()}
    >
      {renderWidgetContent(instance.type)}
    </WorkspaceWidget>
  );

  const getWorkspaceCanvasHeight = (items) => Math.max(420, ...items.map((item) => (Number(item.y) || 0) + (workspaceLayout.collapsed[item.type] ? 58 : Number(item.height) || 320) + 30));
  const renderWorkspaceForTab = (tab) => {
    const items = (workspaceLayout[workspaceMode]?.[tab] || []).filter((item) => !item.hidden);
    return <WorkspaceCanvas height={getWorkspaceCanvasHeight(items)}>
      {items.map(renderWorkspaceInstance)}
    </WorkspaceCanvas>
  };
  const renderWorkspaceExtrasForTab = (tab) => {
    const extras = (workspaceLayout[workspaceMode]?.[tab] || []).filter((item) => !item.hidden);
    return extras.length > 0 ? <WorkspaceCanvas height={getWorkspaceCanvasHeight(extras)}>{extras.map(renderWorkspaceInstance)}</WorkspaceCanvas> : null;
  };

  if (!currentUser) {
    return (
      <div className={`App ${theme} auth-screen`}>
        <main className="auth-card">
          <p className="eyebrow">Student Productivity Hub</p>
          <h1 className="app-title">TaskCabinet</h1>
          <p className="hero-subtitle">
            {authMode === "signin"
              ? "Sign in to open your local assignment planner."
              : "Create a local account or claim an existing username profile."}
          </p>
          <div className="auth-mode-tabs">
            <button
              type="button"
              className={`tab-button ${authMode === "signin" ? "active" : ""}`}
              onClick={() => { setAuthMode("signin"); setAuthError(""); }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`tab-button ${authMode === "signup" ? "active" : ""}`}
              onClick={() => { setAuthMode("signup"); setAuthError(""); }}
            >
              Sign Up
            </button>
          </div>
          <form className="card-form auth-form" onSubmit={handleAuthSubmit}>
            <label htmlFor="auth-username">Username</label>
            <input
              id="auth-username"
              autoComplete="username"
              value={signInName}
              onChange={(e) => setSignInName(e.target.value)}
            />
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              autoComplete={authMode === "signin" ? "current-password" : "new-password"}
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
            />
            {authMode === "signup" && (
              <>
                <label htmlFor="auth-confirm">Confirm Password</label>
                <input
                  id="auth-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={authPasswordConfirm}
                  onChange={(e) => setAuthPasswordConfirm(e.target.value)}
                />
              </>
            )}
            {authError && <p className="auth-error" role="alert">{authError}</p>}
            <button type="submit" className="btn btn-primary" disabled={authBusy}>
              {authBusy ? "Working…" : authMode === "signin" ? "Sign In" : "Create Account"}
            </button>
          </form>
          <div className="auth-warning">
            <strong>Password does not save, save independently!</strong>
            <p>
              TaskCabinet stores only a password verifier. Accounts and assignments
              stay on this browser, do not sync to other devices, and have no
              password recovery.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // USER INTERFACE (JSX)
  // ---------------------------------------------------------------------------
  // JSX resembles HTML but can insert JavaScript inside braces. Expressions
  // such as currentTab === "todo" conditionally show only the selected screen.
  const showReminderSuggestion = shouldShowReminderSuggestion({ hasProfile: Boolean(currentUser), remindersEnabled: Boolean(userSettings.externalPushEnabled), dismissed: Boolean(userSettings.reminderSuggestionDismissed), hasDatedAssignment: tasks.some((task) => !task.isDeleted && !task.isCompleted && getEffectiveDeadline(task)) });
  const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const reminderLeadAlreadyPassedCount = tasks.filter((task) => { const deadline = getEffectiveDeadline(task); return deadline && deadline.getTime() > checklistNow.getTime() && deadline.getTime() - Number(userSettings.reminderMinutes || 60) * 60000 < checklistNow.getTime() && !task.isDeleted && !task.isCompleted; }).length;
  return (
    <div className={`App ${theme} school-level-${userSettings.schoolLevel || "high"} text-size-${userSettings.textSize || "medium"} font-${userSettings.fontFamily || "sans"} density-${userSettings.interfaceDensity || "comfortable"} task-actions-${userSettings.taskActionLayout || "wrap"}${userSettings.reduceMotion ? " reduce-motion" : ""}`}>
      <div className="app-shell">
        {/* The header is always visible and identifies the active local profile. */}
        <header className="hero-card">
          <div>
            <p className="eyebrow">{schoolLevelCopy.eyebrow}</p>
            <h1 className="app-title">TaskCabinet</h1>
            {userSettings.showHeaderSubtitle && (
              <p className="hero-subtitle">
                {schoolLevelCopy.subtitle}
              </p>
            )}
          </div>

          <div className="user-pill">
            {currentUser ? `Signed in as ${currentUser}` : "Guest Mode"}
          </div>
        </header>

        {copyResult && (
          <div className="copy-result-banner" role="status">
            <span>{copyResult}</span>
            <button type="button" onClick={() => setCopyResult("")}>Dismiss</button>
          </div>
        )}
        {showReminderSuggestion && <aside className="reminder-suggestion" role="status"><span>Want a reminder before this is due? Enable push reminders in Settings.</span><button type="button" onClick={() => handleAddFieldSettingChange("reminderSuggestionDismissed", true)} aria-label="Dismiss reminder suggestion">×</button></aside>}

        {/*
          Navigation changes currentTab. The active class lets CSS highlight the
          selected view; signing out and Settings access are also available here.
        */}
        <div className="tab-row">
          <button
            data-tab="dashboard"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleTabWidgetDrop(event, "dashboard")}
            className={`tab-button ${currentTab === "dashboard" ? "active" : ""}`}
            onClick={() => setCurrentTab("dashboard")}
          >
            Dashboard
          </button>

          <button
            data-tab="todo"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleTabWidgetDrop(event, "todo")}
            className={`tab-button ${currentTab === "todo" ? "active" : ""}`}
            onClick={() => setCurrentTab("todo")}
          >
            {schoolLevelCopy.todoLabel}
          </button>

          <button
            data-tab="inProgress"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleTabWidgetDrop(event, "inProgress")}
            className={`tab-button ${currentTab === "inProgress" ? "active" : ""}`}
            onClick={() => setCurrentTab("inProgress")}
          >
            In Progress
          </button>

          <button
            data-tab="completed"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleTabWidgetDrop(event, "completed")}
            className={`tab-button ${currentTab === "completed" ? "active" : ""}`}
            onClick={() => setCurrentTab("completed")}
          >
            Completed
          </button>

          <button
            className={`tab-button ${currentTab === "calendar" ? "active" : ""}`}
            onClick={() => setCurrentTab("calendar")}
          >
            📅 Calendar
          </button>

          <button
            className={`tab-button ${currentTab === "recommendations" ? "active" : ""}`}
            onClick={() => setCurrentTab("recommendations")}
          >
            Recommendations
          </button>

          <button
            data-tab="settings"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleTabWidgetDrop(event, "settings")}
            className={`tab-button ${currentTab === "settings" ? "active" : ""}`}
            onClick={() => setCurrentTab("settings")}
            aria-label="Settings"
            title="Settings"
          >
            ⚙️ Settings
          </button>

          <button type="button" className={`tab-button widgets-tray-button${widgetsTrayOpen ? " active" : ""}`} onClick={() => setWidgetsTrayOpen((open) => !open)} aria-expanded={widgetsTrayOpen}>
            ▦ Widgets
          </button>

          {currentUser && (
            <div className="account-action-group">
              <span>{currentUser}</span>
              <button className="btn btn-danger sign-out-button" onClick={handleSignOut}>Sign Out</button>
            </div>
          )}
        </div>

        {widgetsTrayOpen && (
          <section className="widgets-tray workspace-organizer" aria-label="Workspace organizer">
            <div className="workspace-organizer-header">
              <div><h2>Workspace Organizer</h2><span>Place features on this tab, recover hidden widgets, or lock the layout when everything feels right.</span></div>
              <div className="workspace-organizer-actions">
                <button type="button" className={`btn ${workspaceLayout.locked?.[workspaceMode] ? "btn-primary" : "btn-secondary"}`} onClick={toggleWorkspaceLock}>{workspaceLayout.locked?.[workspaceMode] ? "Unlock Layout" : "Lock Layout"}</button>
              </div>
            </div>
            <label className="widget-library-search"><span>Find a widget</span><input type="search" value={widgetSearch} onChange={(event) => setWidgetSearch(event.target.value)} placeholder="Search assignments, calendar, courses…" /></label>
            <div className="widget-library-grid">
              {visibleWidgetCatalog.map((catalogItem) => {
                const currentInstance = workspaceLayout[workspaceMode]?.[currentTab]?.find((item) => item.type === catalogItem.type);
                return (
                  <article key={catalogItem.type}>
                    <div><strong>{getWorkspaceWidgetTitle(catalogItem.type)}</strong><small>{currentInstance?.hidden ? "Hidden on this tab" : currentInstance ? "Available on this tab" : "Available to add"}</small></div>
                    {currentTab === "calendar" ? <span className="widget-library-status">Calendar is fixed</span> : currentInstance?.hidden ? <button type="button" className="btn btn-secondary" onClick={() => restoreWorkspaceWidget(currentInstance)}>Restore</button> : currentInstance ? canHideWidget(workspaceLayout, workspaceMode, currentInstance.type) ? <button type="button" className="btn btn-secondary" onClick={() => hideWorkspaceWidget(currentInstance)}>Hide</button> : <span className="widget-library-status">Core widget</span> : <button type="button" className="btn btn-primary" onClick={() => addWidgetToCurrentTab(catalogItem.type)}>Add to tab</button>}
                  </article>
                );
              })}
            </div>
            <div className="widgets-tray-actions"><button type="button" className="btn btn-secondary" disabled={currentTab === "calendar"} onClick={resetWorkspaceTab}>Reset this tab</button><button type="button" className="btn btn-danger" onClick={resetAllWorkspace}>Reset all layouts</button></div>
          </section>
        )}

        <div className={`workspace-layout${currentTab === "calendar" ? " workspace-calendar-only" : " workspace-customizable"}${workspaceCanvasWidth > 0 ? " is-measured" : " is-measuring"}`}>
          <main className="workspace-main" ref={workspaceMainRef}>

        {currentTab === "dashboard" && renderWorkspaceForTab("dashboard")}
        {currentTab !== "dashboard" && currentTab !== "calendar" && renderWorkspaceExtrasForTab(currentTab)}

        {/*
          DASHBOARD VIEW
          Includes quick statistics, recommendations, assignment creation, and
          course customization. It does not replace the dedicated task tabs.
        */}
        {currentTab === "dashboard-legacy" && (
          <div>
            {/* Four summary cards calculated from the current task array. */}
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-label">Active</span>
                <strong>{activeTasksCount}</strong>
                <p>Assignments left</p>
              </div>

              <div className="stat-card">
                <span className="stat-label">Due Today</span>
                <strong>{dueTodayCount}</strong>
                <p>Need attention</p>
              </div>

              <div className="stat-card">
                <span className="stat-label">Overdue</span>
                <strong>{overdueTasksCount}</strong>
                <p>Past deadline</p>
              </div>

              <div className="stat-card">
                <span className="stat-label">Workload</span>
                <strong>
                  {estimatedHours}h {estimatedMinutesLeft}m
                </strong>
                <p>Estimated remaining</p>
              </div>
            </div>

            <div className="dashboard-focus-grid">
            {/* Clicking a recommendation opens that task in the To Do view. */}
            <section
              className="recommended-plan-card"
              aria-labelledby="recommended-plan-title"
            >
              <div className="recommended-plan-header">
                <div>
                  <p className="recommended-plan-eyebrow">
                    Suggested next steps
                  </p>
                  <h2 id="recommended-plan-title">
                    Recommended Plan of Attack
                  </h2>
                </div>
                <span className="recommended-plan-count">
                  Top {recommendedTasks.length}
                </span>
              </div>
              {recommendationItems.length > 0 && (
                <div className="recommended-plan-workload">
                  <strong>{recommendationWorkloadLabel}</strong>
                  <span>
                    Estimated across the top plan
                    {recommendationWorkload.unknownCount > 0
                      ? `, plus ${recommendationWorkload.unknownCount} without estimates`
                      : ""}
                  </span>
                </div>
              )}

              {recommendedTasks.length === 0 ? (
                <p className="recommended-plan-empty">
                  You’re all caught up — nice work! Add something new whenever you’re ready.
                </p>
              ) : (
                <ol className="recommended-plan-list">
                  {recommendationItems.map((item, index) => {
                    const task = item.task;
                    const estimatedMinutes = getValidEstimate(task);
                    const taskStatus = getTaskStatus(task);

                    return (
                      <li key={task.id} className={`recommended-plan-item${getTaskDueBucket(task).startsWith("Overdue") ? " is-overdue" : ""}`}>
                        <button
                          type="button"
                          className="recommended-plan-button"
                          onClick={() => handleRecommendedTaskClick(task.id)}
                          aria-label={`Open ${task.title} in the To Do list`}
                        >
                          <span
                            className="recommended-plan-rank"
                            aria-hidden="true"
                          >
                            {index + 1}
                          </span>

                          <div className="recommended-plan-content">
                            <div className="recommended-plan-title-row">
                              <strong>{task.title}</strong>
                              <span
                                className="recommended-plan-course"
                                style={{
                                  backgroundColor: getCourseColor(task.course),
                                  color: getTextColorForCourse(task.course),
                                }}
                              >
                                {task.course}
                              </span>
                            </div>

                            <div className="recommended-plan-details">
                              <span>
                                {getDueDateBucket(task.dueMonth, task.dueDay)}
                              </span>
                              <span>
                                {task.priority || "No priority"} priority
                              </span>
                              <span>
                                {Number.isFinite(estimatedMinutes)
                                  ? `${estimatedMinutes} min`
                                  : "No time estimate"}
                              </span>
                              {taskStatus === "inProgress" && (
                                <span>In progress</span>
                              )}
                            </div>

                            {renderAssignmentCountdown(task, "recommended-countdown")}
                            <div className="recommended-plan-reasons">
                              {item.reasons.map((reason) => (
                                <span key={reason}>{reason}</span>
                              ))}
                            </div>

                            {renderSubtaskProgressLine(
                              task,
                              "recommended-plan-progress",
                            )}
                          </div>
                        </button>
                        <div className="recommended-plan-actions">
                          <button type="button" className="btn btn-secondary" onClick={() => handleRecommendedTaskClick(task.id)}>{getFocusActionLabel(task)}</button>
                          {taskStatus === "todo" && (
                            <button type="button" className="btn btn-primary" onClick={() => handleQuickMatchStart(task.id)}>Start</button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            </div>

            <div className="quick-match-dashboard-mobile">
              {renderQuickMatchCard()}
            </div>

            {/* Collapsible form for creating a new assignment. */}
            <div
              id="add-assignment-section"
              className="card card-container"
            >
              <div className="assignment-header-row">
                <h3>➕ Add New Assignment</h3>

                <button
                  type="button"
                  className="btn btn-secondary assignment-toggle-button"
                  onClick={() => setAddAssignmentOpen((prev) => !prev)}
                  aria-label={addAssignmentOpen ? "Close Add Assignment" : "Open Add Assignment"}
                  title={addAssignmentOpen ? "Close Add Assignment" : undefined}
                >
                  {addAssignmentOpen ? "×" : "Open"}
                </button>
              </div>

              {addAssignmentOpen && renderAddAssignmentForm("dashboard")}
              <div
                className="course-colors-section"
                style={{ marginTop: "25px" }}
              >
                <div className="course-colors-header-row">
                  <h3>🎨 Course Colors</h3>

                  <button
                    type="button"
                    className="btn btn-secondary course-colors-toggle-button"
                    onClick={() => setCourseColorsOpen((prev) => !prev)}
                  >
                    {courseColorsOpen ? "Minimize" : "Open"}
                  </button>
                </div>

                {courseColorsOpen && (
                  <>
                    <p className="hint-text">
                      Customize course colors or delete courses you no longer
                      need. Assignments from deleted courses move to "Other".
                    </p>

                    <form className="course-add-form" onSubmit={handleAddCourse}>
                      <label htmlFor="new-course-name">Add course</label>

                      <input
                        id="new-course-name"
                        type="text"
                        value={newCourseName}
                        onChange={(event) => setNewCourseName(event.target.value)}
                        placeholder="Course name"
                      />

                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={!newCourseName.trim()}
                      >
                        Add Course
                      </button>
                    </form>

                    {courses.map((course) => (
                      <div
                        key={course}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "12px",
                          marginBottom: "10px",
                          padding: "8px",
                          borderRadius: "8px",
                          backgroundColor: "var(--card-bg)",
                        }}
                      >
                        <span
                          style={{
                            backgroundColor: getCourseColor(course),
                            color: getTextColorForCourse(course),
                            padding: "5px 10px",
                            borderRadius: "999px",
                            fontWeight: "600",
                          }}
                        >
                          {course}
                        </span>

                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            alignItems: "center",
                          }}
                        >
                          <input
                            type="color"
                            value={getCourseColor(course)}
                            onChange={(e) =>
                              handleCourseColorChange(course, e.target.value)
                            }
                          />

                          <button
                            type="button"
                            className="btn btn-danger"
                            disabled={course === "Other"}
                            onClick={() => handleDeleteCourse(course)}
                            style={{
                              padding: "5px 10px",
                              borderRadius: "4px",
                              cursor:
                                course === "Other" ? "not-allowed" : "pointer",
                              opacity: course === "Other" ? 0.5 : 1,
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/*
          TAB CONTENT
          Only one of the following sections is rendered at a time. Keeping each
          condition near its markup makes the screen-to-state relationship clear.
        */}
        <div>
          {/* TO DO: filtered incomplete tasks grouped into due-date buckets. */}
          {currentTab === "todo-legacy" && (
            <div>
              {renderFilterToggle()}

              <h3>📝 {schoolLevelCopy.todoLabel} ({todoTasks.length})</h3>

              {renderFilterControls()}

              {todoTasks.length === 0 ? (
                <p className="placeholder-text">
                  No pending assignments match your filters.
                </p>
              ) : (
                <div>
                  {bucketsOrder.map((bucketName) => {
                    const tasksInBucket = groupedTasks[bucketName];
                    if (tasksInBucket.length === 0) return null;

                    return (
                      <div
                        key={bucketName}
                        className="bucket-section"
                        style={{ marginTop: "20px" }}
                      >
                        <h4
                          className="bucket-title"
                          style={{
                            borderBottom: "1px solid #ccc",
                            paddingBottom: "4px",
                            marginBottom: "10px",
                            color: "var(--text-color)",
                          }}
                        >
                          {bucketName}
                        </h4>
                        <ul
                          className="task-list"
                          style={{ paddingLeft: 0, listStyle: "none" }}
                        >
                          {tasksInBucket.map((task) => (
                            <li
                              key={task.id}
                              id={`todo-task-${task.id}`}
                              className={`task-card${task.priority === "HIGH" ? " task-card-high" : ""}${expandedTaskId === task.id ? " expanded" : ""}`}
                              onClick={() => toggleTaskExpansion(task.id)}
                            >
                              <div>
                                <div className="task-title-row">
                                  <strong className="task-title-text">{task.title}</strong>
                                  {task.course ? <span className="task-course-pill" style={{ backgroundColor: getCourseColor(task.course), color: getTextColorForCourse(task.course) }}>{task.course}</span> : null}
                                  {renderTaskReminderIndicator(task)}
                                </div>
                                <div className="task-details">
                                  {formatTaskDetails(task)}
                                </div>
                                {renderSubtaskProgressLine(task)}
                              </div>

                              <div className="task-actions">
                                <button
                                  className="btn btn-secondary status-action-button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartTask(task.id);
                                  }}
                                  style={{
                                    padding: "5px 10px",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                  }}
                                >
                                  Start
                                </button>

                                <button
                                  className="btn btn-primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleComplete(task.id);
                                  }}
                                  style={{
                                    padding: "5px 10px",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                  }}
                                >
                                  Complete ✅
                                </button>

                                <button
                                  className="btn btn-secondary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditStart(task);
                                  }}
                                  style={{
                                    padding: "5px 10px",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                  }}
                                >
                                  ✏️ Edit
                                </button>

                                {renderVoiceUndoAction(task)}

                                <button
                                  className="btn btn-danger"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(task.id);
                                  }}
                                  style={{
                                    padding: "5px 10px",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                  }}
                                >
                                  Move to Trash
                                </button>
                              </div>

                              {expandedTaskId === task.id && (
                                <div
                                  className="task-notes-panel"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {renderExpandedTaskDetails(
                                    task,
                                    `notes-${task.id}`,
                                  )}
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* IN PROGRESS: started assignments that are still incomplete. */}
          {currentTab === "inProgress-legacy" && (
            <div className="in-progress-tab-section">
              {renderFilterToggle()}

              <h3>In Progress ({inProgressTasks.length})</h3>

              {renderFilterControls()}

              {inProgressTasks.length === 0 ? (
                <p className="placeholder-text">
                  No in-progress assignments match your filters.
                </p>
              ) : (
                <div>
                  {bucketsOrder.map((bucketName) => {
                    const tasksInBucket = groupedInProgressTasks[bucketName];
                    if (tasksInBucket.length === 0) return null;

                    return (
                      <div
                        key={bucketName}
                        className="bucket-section"
                        style={{ marginTop: "20px" }}
                      >
                        <h4
                          className="bucket-title"
                          style={{
                            borderBottom: "1px solid #ccc",
                            paddingBottom: "4px",
                            marginBottom: "10px",
                            color: "var(--text-color)",
                          }}
                        >
                          {bucketName}
                        </h4>
                        <ul
                          className="task-list"
                          style={{ paddingLeft: 0, listStyle: "none" }}
                        >
                          {tasksInBucket.map((task) => (
                            <li
                              key={task.id}
                              id={`inProgress-task-${task.id}`}
                              className={`task-card in-progress-task-card${task.priority === "HIGH" ? " task-card-high" : ""}${expandedTaskId === task.id ? " expanded" : ""}`}
                              onClick={() => toggleTaskExpansion(task.id)}
                            >
                              <div>
                                <div className="task-title-row">
                                  <strong className="task-title-text">{task.title}</strong>
                                  {task.course ? <span className="task-course-pill" style={{ backgroundColor: getCourseColor(task.course), color: getTextColorForCourse(task.course) }}>{task.course}</span> : null}
                                  {renderTaskReminderIndicator(task)}
                                </div>
                                <span className="in-progress-status-pill">
                                  In Progress
                                </span>
                                <div className="task-details">
                                  {formatTaskDetails(task)}
                                </div>
                                {renderSubtaskProgressLine(task)}
                              </div>

                              <div className="task-actions">
                                <button
                                  className="btn btn-warning status-action-button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveToTodo(task.id);
                                  }}
                                  style={{
                                    padding: "5px 10px",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                  }}
                                >
                                  Move to To Do
                                </button>

                                <button
                                  className="btn btn-primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleComplete(task.id);
                                  }}
                                  style={{
                                    padding: "5px 10px",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                  }}
                                >
                                  Complete ✅
                                </button>

                                <button
                                  className="btn btn-secondary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditStart(task);
                                  }}
                                  style={{
                                    padding: "5px 10px",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                  }}
                                >
                                  ✏️ Edit
                                </button>

                                {renderVoiceUndoAction(task)}

                                <button
                                  className="btn btn-danger"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(task.id);
                                  }}
                                  style={{
                                    padding: "5px 10px",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                  }}
                                >
                                  Move to Trash
                                </button>
                              </div>

                              {expandedTaskId === task.id && (
                                <div
                                  className="task-notes-panel"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {renderExpandedTaskDetails(
                                    task,
                                    `in-progress-notes-${task.id}`,
                                  )}
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* COMPLETED: finished tasks with undo, edit, delete, and notes. */}
          {currentTab === "completed-legacy" && (
            <div>
              {renderFilterToggle()}

              <div className="assignment-header-row">
                <h3>✅ Completed ({completedTasks.length})</h3>
                <button
                  type="button"
                  className="btn btn-secondary assignment-toggle-button"
                  onClick={handleArchiveAll}
                  disabled={unarchivedCompletedCount === 0}
                >
                  Archive All
                </button>
              </div>

              {renderFilterControls()}

              {completedTasks.length === 0 ? (
                <p className="placeholder-text">
                  Nothing here yet. Finished assignments will hang out here once you complete them.
                </p>
              ) : (
                <ul
                  className="task-list"
                  style={{ paddingLeft: 0, listStyle: "none" }}
                >
                  {completedTasks.map((task) => (
                    <li
                      key={task.id}
                      className={`task-card${expandedTaskId === task.id ? " expanded" : ""}`}
                      onClick={() => toggleTaskExpansion(task.id)}
                    >
                      <div>
                        <div className="task-title-row">
                          <strong className="task-title-text">{task.title}</strong>
                          {task.course ? <span className="task-course-pill" style={{ backgroundColor: getCourseColor(task.course), color: getTextColorForCourse(task.course) }}>{task.course}</span> : null}
                          {renderTaskReminderIndicator(task)}
                        </div>
                        <div className="task-details">
                          {formatTaskDetails(task)}
                        </div>
                        {renderSubtaskProgressLine(task)}
                      </div>
                      <div className="task-actions">
                        <button
                          className="btn btn-warning"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUndo(task.id);
                          }}
                          style={{
                            padding: "5px 10px",
                            borderRadius: "4px",
                            cursor: "pointer",
                          }}
                        >
                          Mark Undone
                        </button>

                        <button
                          className="btn btn-secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditStart(task);
                          }}
                          style={{
                            padding: "5px 10px",
                            borderRadius: "4px",
                            cursor: "pointer",
                          }}
                        >
                          ✏️ Edit
                        </button>

                        <button
                          className="btn btn-secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleArchive(task.id);
                          }}
                          style={{
                            padding: "5px 10px",
                            borderRadius: "4px",
                            cursor: "pointer",
                          }}
                        >
                          Archive
                        </button>

                        {renderVoiceUndoAction(task)}

                        <button
                          className="btn btn-danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(task.id);
                          }}
                          style={{
                            padding: "5px 10px",
                            borderRadius: "4px",
                            cursor: "pointer",
                          }}
                        >
                          Move to Trash
                        </button>
                      </div>

                      {expandedTaskId === task.id && (
                        <div
                          className="task-notes-panel"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {renderExpandedTaskDetails(task, `notes-${task.id}`)}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {/* CALENDAR: month overview plus tasks matching the selected day. */}
          {currentTab === "calendar" && (
            <div
              className="panel-card resizable-panel calendar-panel"
              style={{ marginTop: "10px" }}
            >
              <div className="panel-header calendar-view-header">
                <h3>📅 Assignment Calendar</h3>
                <div className="calendar-view-toggle" aria-label="Calendar view">
                  <button type="button" className={userSettings.calendarViewMode !== "week" ? "active" : ""} onClick={() => handleAddFieldSettingChange("calendarViewMode", "month")}>Month</button>
                  <button type="button" className={userSettings.calendarViewMode === "week" ? "active" : ""} onClick={() => handleAddFieldSettingChange("calendarViewMode", "week")}>Week</button>
                </div>
              </div>

              {userSettings.calendarViewMode === "week" ? (
                <section className="weekly-calendar" aria-label="Weekly assignment calendar">
                  <div className="weekly-calendar-navigation">
                    <button type="button" className="btn btn-secondary" onClick={() => handleCalendarDateChange(shiftCalendarWeek(selectedDate, -1))}>← Previous week</button>
                    <strong>{visibleWeekDates[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – {visibleWeekDates[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</strong>
                    <button type="button" className="btn btn-secondary" onClick={() => handleCalendarDateChange(new Date())}>Today</button>
                    <button type="button" className="btn btn-secondary" onClick={() => handleCalendarDateChange(shiftCalendarWeek(selectedDate, 1))}>Next week →</button>
                  </div>
                  <div className="weekly-calendar-scroll">
                    <div className="weekly-calendar-grid">
                      {visibleWeekDates.map((date) => {
                        const dayTasks = calendarTasks.filter((task) => Number(task.dueMonth) === date.getMonth() + 1 && Number(task.dueDay) === date.getDate());
                        const dots = getCourseDotsForDate(date);
                        const cycleDay = getCycleDayForDate(date, userSettings);
                        return (
                          <button type="button" key={date.toISOString()} className={`${isSameCalendarDay(date, selectedDate) ? "selected" : ""}${isSameCalendarDay(date, new Date()) ? " today" : ""}${dayTasks.some((task) => getTaskDueBucket(task).startsWith("Overdue")) ? " calendar-overdue-day" : ""}`} onClick={() => handleCalendarDateChange(date)}>
                            <span className="weekly-day-name">{date.toLocaleDateString(undefined, { weekday: "short" })}</span>
                            <strong>{date.getDate()}</strong>
                            <small>{date.toLocaleDateString(undefined, { month: "short" })}</small>
                            {userSettings.showCalendarCycleLabels !== false && cycleDay && <span className="weekly-cycle-day">{cycleDay}</span>}
                            {userSettings.showCalendarTaskDots !== false && dots.length > 0 && <span className="calendar-course-dots">{dots.map((dot) => <i key={dot.course} style={{ backgroundColor: dot.color }} title={dot.course} />)}</span>}
                            <span className="weekly-task-count">{dayTasks.length} assignment{dayTasks.length === 1 ? "" : "s"}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>
              ) : (
                  <Calendar
                    onChange={handleCalendarDateChange}
                    value={selectedDate}
                    calendarType={userSettings.calendarWeekStartsOn === "monday" ? "iso8601" : "gregory"}
                    showNeighboringMonth={userSettings.showNeighboringMonth !== false}
                    tileClassName={({ date, view }) => view === "month" && calendarTasks.some((task) => Number(task.dueMonth) === date.getMonth() + 1 && Number(task.dueDay) === date.getDate() && getTaskDueBucket(task).startsWith("Overdue")) ? "calendar-overdue-day" : ""}
                    tileContent={({ date, view }) => {
                      if (view !== "month") return null;
                      const dots = getCourseDotsForDate(date);
                      const cycleDay = getCycleDayForDate(date, userSettings);

                      const showCycleDay = userSettings.showCalendarCycleLabels !== false && cycleDay;
                      const showTaskDots = userSettings.showCalendarTaskDots !== false && dots.length > 0;

                      return showTaskDots || showCycleDay ? (
                        <div className="calendar-tile-details">
                          {showCycleDay && <span>{cycleDay}</span>}
                          {showTaskDots && (
                            <span className="calendar-course-dots" aria-label={`${dots.length} course${dots.length === 1 ? "" : "s"} with assignments`}>
                              {dots.map((dot) => (
                                <i key={dot.course} style={{ backgroundColor: dot.color }} title={dot.course} />
                              ))}
                            </span>
                          )}
                        </div>
                      ) : null;
                    }}
                  />
              )}

                  <h4 style={{ marginTop: "20px" }}>
                    Assignments for {selectedDate.toDateString()}
                  </h4>

                  <div className="calendar-day-summary">
                    <strong>{selectedCycleDay || "No scheduled school cycle day"}</strong>
                    {selectedCycleDay && (
                      <p>
                        Courses: {selectedCycleCourses.length > 0
                          ? selectedCycleCourses.join(", ")
                          : "No courses assigned"}
                      </p>
                    )}
                    {selectedCycleDay && (
                      <p>
                        Scheduled-course assignments due: {selectedCycleCourseTasks.length > 0
                          ? selectedCycleCourseTasks.map((task) => task.title).join(", ")
                          : "None"}
                      </p>
                    )}
                  </div>

                  {selectedDateTasks.length === 0 ? (
                    <p className="placeholder-text">
                      This day is wide open — nothing is due.
                    </p>
                  ) : (
                    <ul
                      className="task-list"
                      style={{ paddingLeft: 0, listStyle: "none" }}
                    >
                      {selectedDateTasks.map((task) => (
                          <li
                            key={task.id}
                            className={`task-card calendar-task-card${expandedTaskId === task.id ? " expanded" : ""}`}
                            onClick={() => toggleTaskExpansion(task.id)}
                          >
                            <div>
                              <div className="task-title-row">
                                <strong className="task-title-text">{task.title}</strong>
                                {task.course ? <span className="task-course-pill" style={{ backgroundColor: getCourseColor(task.course), color: getTextColorForCourse(task.course) }}>{task.course}</span> : null}
                                {renderTaskReminderIndicator(task)}
                              </div>
                              <div className="task-details">
                                {formatTaskDetails(task)}
                              </div>
                              {renderAssignmentCountdown(task)}
                              {renderSubtaskProgressLine(task)}
                              <p
                                className="hint-text"
                                style={{ marginTop: "8px", fontSize: "13px" }}
                              >
                                Click to view or edit notes
                              </p>
                              <div className="task-actions">
                                <button
                                  className="btn btn-secondary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditStart(task);
                                  }}
                                  style={{
                                    padding: "5px 10px",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                  }}
                                >
                                  ✏️ Edit Assignment
                                </button>
                                {renderVoiceUndoAction(task)}
                              </div>
                            </div>

                            {expandedTaskId === task.id && (
                              <div
                                className="task-notes-panel"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {renderExpandedTaskDetails(
                                  task,
                                  `calendar-notes-${task.id}`,
                                )}
                              </div>
                            )}
                          </li>
                        ))}
                    </ul>
                  )}

                  <div className="calendar-add-action">
                    <div>
                      <strong>Add something due on this day</strong>
                      <p className="hint-text">
                        Use the full assignment form below with the selected
                        month and day already filled in.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={`btn ${calendarAddOpen ? "btn-secondary" : "btn-primary"}`}
                      onClick={() => {
                        if (calendarAddOpen) {
                          setCalendarAddOpen(false);
                        } else {
                          handleAddForSelectedDate();
                        }
                      }}
                    >
                      {calendarAddOpen ? "Cancel" : `➕ ${schoolLevelCopy.addLabel}`}
                    </button>
                  </div>

                  {calendarAddOpen && (
                    <div
                      className="card card-container"
                      style={{ marginTop: "16px" }}
                    >
                      <h3>
                        {schoolLevelCopy.addLabel} for{" "}
                        {selectedDate.toLocaleDateString(undefined, {
                          month: "long",
                          day: "numeric",
                        })}
                      </h3>
                      {renderAddAssignmentForm("calendar")}
                    </div>
                  )}
            </div>
          )}
          {/* SETTINGS: central home for appearance and future app preferences. */}
          {currentTab === "recommendations" && (
            <section className="recommendations-page panel-card" aria-labelledby="recommendations-title">
              <div className="recommendations-header">
                <p className="eyebrow">Help improve TaskCabinet</p>
                <h2 id="recommendations-title">Recommendations</h2>
                <p>
                  Suggest an improvement, report something confusing, or recommend a change.
                  Please keep it respectful; profanity is blocked, and each account may send up to 10 messages per day.
                </p>
              </div>

              <form className="recommendations-form" onSubmit={handleRecommendationSubmit}>
                <label htmlFor="recommendation-message">Your recommendation</label>
                <textarea
                  id="recommendation-message"
                  value={recommendationMessage}
                  onChange={(event) => {
                    setRecommendationMessage(event.target.value);
                    if (recommendationStatus !== "sending") {
                      setRecommendationStatus("idle");
                      setRecommendationFeedback("");
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Write your recommendation here..."
                  maxLength={2000}
                  rows={8}
                  disabled={recommendationStatus === "sending"}
                  aria-describedby="recommendation-keyboard-hint"
                />
                <small id="recommendation-keyboard-hint" className="recommendations-keyboard-hint">
                  Press Enter to send. Use Shift+Enter for a new line.
                </small>
                <div className="recommendations-form-footer">
                  <span className="recommendations-counter" aria-live="polite">
                    {recommendationMessage.length.toLocaleString()} / 2,000 characters
                  </span>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={recommendationStatus === "sending" || !recommendationMessage.trim()}
                  >
                    {recommendationStatus === "sending" ? "Sending…" : "Send"}
                  </button>
                </div>
                {recommendationFeedback && (
                  <p
                    className={`recommendations-feedback ${recommendationStatus}`}
                    role={recommendationStatus === "error" ? "alert" : "status"}
                  >
                    {recommendationFeedback}
                  </p>
                )}
              </form>
            </section>
          )}

          {currentTab === "settings" && (
            <div className="card card-container" style={{ marginTop: "10px" }}>
              <div className={`settings-layout${storageView ? " settings-storage-focus" : ""}`}>
                {!storageView && <nav className="settings-sidebar" aria-label="Settings categories">
                  <p className="eyebrow">Settings</p>
                  <div className="settings-profile-chip">
                    <span>Preferences for</span>
                    <strong>{currentUser || "Guest profile"}</strong>
                  </div>
                  {getOrderedSettingsSections(userSettings.settingsSectionOrder).map((section) => (
                    <div
                      key={section.id}
                      className={`settings-nav-item${draggedSettingsSection === section.id ? " dragging" : ""}${settingsDropTarget?.id === section.id ? ` drop-${settingsDropTarget.position}` : ""}`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        const bounds = e.currentTarget.getBoundingClientRect();
                        const position = e.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
                        setSettingsDropTarget({ id: section.id, position });
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleSettingsSectionDrop(section.id, settingsDropTarget?.position || "before");
                      }}
                    >
                      <button
                        type="button"
                        className="settings-drag-handle"
                        draggable
                        aria-label={`Drag ${section.label} to reorder`}
                        title="Drag to reorder. Press Alt+Up or Alt+Down to move with the keyboard."
                        onKeyDown={(e) => {
                          if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
                          e.preventDefault();
                          handleSettingsSectionMove(section.id, e.key === "ArrowUp" ? -1 : 1);
                        }}
                        onDragStart={(e) => {
                          setDraggedSettingsSection(section.id);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", section.id);
                        }}
                        onDragEnd={() => {
                          setDraggedSettingsSection(null);
                          setSettingsDropTarget(null);
                        }}
                      >
                        ⋮⋮
                      </button>
                      <button
                        type="button"
                        className={`settings-nav-button ${settingsSection === section.id ? "active" : ""}`}
                        aria-current={settingsSection === section.id ? "page" : undefined}
                        onClick={() => {
                          setStorageView(null);
                          setSettingsSection(section.id);
                        }}
                      >
                        <strong className="settings-nav-label">
                          <span className="settings-nav-icon" aria-hidden="true">{section.icon}</span>
                          {section.label}
                        </strong>
                        <span>{section.description}</span>
                      </button>
                    </div>
                  ))}
                </nav>}
                <div className="settings-content">
                  <div className={`settings-grid${storageView ? " settings-grid-hidden" : ""}${settingsSection === "personalization" ? " settings-grid-personalization" : ""}`}>
                <section className="settings-section personalization-top-section appearance-settings-section" hidden={settingsSection !== "personalization"}>
                  <div className="settings-onboarding-card">
                    <div><p className="eyebrow">Getting started</p><h4>TaskCabinet Tutorial</h4><p className="hint-text">Replay the visual introduction or manage optional sample assignments.</p></div>
                    <div className="settings-onboarding-actions"><button type="button" className="btn btn-primary" onClick={() => { setTutorialStep(0); setTutorialOpen(true); }}>Replay Tutorial</button></div>
                  </div>
                  <div
                    className="settings-collapse-header double-click-collapse-header"
                    onDoubleClick={(event) => toggleFromHeaderDoubleClick(event, () => setAppearanceSettingsOpen((isOpen) => !isOpen))}
                    title="Double-click to expand or minimize"
                  >
                    <h4>Appearance</h4>
                    <button
                      type="button"
                      className="settings-collapse-button"
                      onClick={(event) => toggleFromCollapseButton(event, () => setAppearanceSettingsOpen((isOpen) => !isOpen))}
                      aria-expanded={appearanceSettingsOpen}
                      aria-controls="appearance-settings-content"
                      aria-label={`${appearanceSettingsOpen ? "Shrink" : "Enlarge"} Appearance`}
                      title={`${appearanceSettingsOpen ? "Shrink" : "Enlarge"} Appearance`}
                    >
                      {appearanceSettingsOpen ? "−" : "+"}
                    </button>
                  </div>
                  {appearanceSettingsOpen && (
                    <div id="appearance-settings-content" className="settings-collapsible-content">
                      <p className="hint-text">Choose a color theme or save your own from Full Color Studio.</p>
                      <label className="settings-select-row">
                        <span>Color theme</span>
                        <select
                          value={colorThemeChoices.some((colorTheme) => colorTheme.id === activeColorThemeId) ? activeColorThemeId : "custom"}
                          onChange={(event) => {
                            if (event.target.value !== "custom") {
                              handleApplyColorTheme(event.target.value);
                            }
                          }}
                        >
                          {colorThemeChoices.map((colorTheme) => (
                            <option key={colorTheme.id} value={colorTheme.id}>
                              {colorTheme.name}
                            </option>
                          ))}
                          <option value="custom">Unsaved custom colors</option>
                        </select>
                      </label>
                      <div className="color-theme-grid">
                        {colorThemeChoices.map((colorTheme) => (
                          <article className="color-theme-card" key={colorTheme.id}>
                            <button
                              type="button"
                              className={activeColorThemeId === colorTheme.id ? "active" : ""}
                              onClick={() => handleApplyColorTheme(colorTheme.id)}
                            >
                              <span className="theme-swatch-row" aria-hidden="true">
                                {[colorTheme.colors.page, colorTheme.colors.surface, colorTheme.colors.primary, colorTheme.colors.heroMiddle].map((color) => (
                                  <i key={color} style={{ backgroundColor: color }} />
                                ))}
                              </span>
                              <strong>{colorTheme.name}</strong>
                              <small>{colorTheme.mode === "dark" ? "Dark base" : "Light base"}</small>
                            </button>
                            <button
                              type="button"
                              className="color-theme-delete"
                              onClick={() => handleDeleteColorTheme(colorTheme.id)}
                            >
                              Delete
                            </button>
                          </article>
                        ))}
                      </div>
                      {deletedColorThemeIds.size > 0 && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={handleRestoreDefaultColorThemes}
                        >
                          Restore default themes
                        </button>
                      )}
                      <label className="settings-select-row">
                        <span>School level</span>
                        <select
                          value={userSettings.schoolLevel || "high"}
                          onChange={(e) => handleAddFieldSettingChange("schoolLevel", e.target.value)}
                        >
                          <option value="middle">Middle School</option>
                          <option value="high">High School</option>
                          <option value="college">College</option>
                        </select>
                      </label>
                      <div className="settings-option-grid">
                        <label className="settings-select-row settings-option-card">
                          <span>Text size</span>
                          <select
                            value={userSettings.textSize || "medium"}
                            onChange={(e) => handleAddFieldSettingChange("textSize", e.target.value)}
                          >
                            <option value="xsmall">Extra Small (70%)</option>
                            <option value="small">Small</option>
                            <option value="medium">Medium</option>
                            <option value="large">Large</option>
                            <option value="xlarge">Extra Large (150%)</option>
                          </select>
                        </label>
                        <label className="settings-select-row settings-option-card">
                          <span>App font</span>
                          <select value={userSettings.fontFamily || "sans"} onChange={(e) => handleAddFieldSettingChange("fontFamily", e.target.value)}>
                            <option value="sans">Modern Sans</option>
                            <option value="rounded">Friendly Rounded</option>
                            <option value="serif">Classic Serif</option>
                            <option value="readable">Highly Readable</option>
                            <option value="mono">Typewriter Mono</option>
                          </select>
                        </label>
                        <label className="settings-select-row settings-option-card">
                          <span>Interface spacing</span>
                          <select
                            value={userSettings.interfaceDensity || "comfortable"}
                            onChange={(e) => handleAddFieldSettingChange("interfaceDensity", e.target.value)}
                          >
                            <option value="compact">Compact</option>
                            <option value="comfortable">Comfortable</option>
                            <option value="spacious">Spacious</option>
                          </select>
                        </label>
                        <label className="settings-select-row settings-option-card">
                          <span>Task action layout</span>
                          <select value={userSettings.taskActionLayout || "wrap"} onChange={(event) => handleAddFieldSettingChange("taskActionLayout", event.target.value)}>
                            <option value="wrap">Comfortable wrap</option>
                            <option value="compact">Compact buttons</option>
                            <option value="stacked">Vertical actions</option>
                          </select>
                        </label>
                      </div>
                      <label className="settings-toggle settings-toggle-copy">
                        <span><strong>Header description</strong><small>Show the school-level message below TaskCabinet.</small></span>
                        <input
                          type="checkbox"
                          checked={userSettings.showHeaderSubtitle !== false}
                          onChange={(e) => handleAddFieldSettingChange("showHeaderSubtitle", e.target.checked)}
                        />
                      </label>
                      <label className="settings-toggle settings-toggle-copy">
                        <span><strong>Reduce motion</strong><small>Turn off interface animation and smooth scrolling.</small></span>
                        <input
                          type="checkbox"
                          checked={Boolean(userSettings.reduceMotion)}
                          onChange={(e) => handleAddFieldSettingChange("reduceMotion", e.target.checked)}
                        />
                      </label>
                    </div>
                  )}
                </section>

                <section className="settings-section personalization-top-section personalization-tips" hidden={settingsSection !== "personalization"}>
                  <div
                    className="settings-collapse-header double-click-collapse-header"
                    onDoubleClick={(event) => toggleFromHeaderDoubleClick(event, () => setPersonalizationTipsOpen((isOpen) => !isOpen))}
                    title="Double-click to expand or minimize"
                  >
                    <h4>Personalization Tips</h4>
                    <button
                      type="button"
                      className="settings-collapse-button"
                      onClick={(event) => toggleFromCollapseButton(event, () => setPersonalizationTipsOpen((isOpen) => !isOpen))}
                      aria-expanded={personalizationTipsOpen}
                      aria-controls="personalization-tips-content"
                      aria-label={`${personalizationTipsOpen ? "Shrink" : "Enlarge"} Personalization Tips`}
                      title={`${personalizationTipsOpen ? "Shrink" : "Enlarge"} Personalization Tips`}
                    >
                      {personalizationTipsOpen ? "−" : "+"}
                    </button>
                  </div>
                  {personalizationTipsOpen && (
                    <div id="personalization-tips-content" className="settings-collapsible-content personalization-tips-content">
                      <p className="hint-text">Find friendly explanations for personalizing TaskCabinet and using its features your way.</p>
                      <input type="search" value={helpSearch} onChange={(event) => setHelpSearch(event.target.value)} placeholder="Search reminders, assignments, layouts, colors…" aria-label="Search TaskCabinet tips" />
                      <div className="personalization-tip-grid">
                        {PERSONALIZATION_TIPS.filter(([title, copy]) => `${title} ${copy}`.toLowerCase().includes(helpSearch.trim().toLowerCase())).map(([title, copy]) => <PersonalizationTip key={title} title={title} forceOpen={Boolean(helpSearch.trim())}>{copy}</PersonalizationTip>)}
                      </div>
                    </div>
                  )}
                </section>

                <section className="settings-section color-studio-section" hidden={settingsSection !== "personalization"}>
                  <div
                    className="color-studio-header double-click-collapse-header"
                    onDoubleClick={(event) => toggleFromHeaderDoubleClick(event, () => setColorStudioOpen((isOpen) => !isOpen))}
                    title="Double-click to expand or minimize"
                  >
                    <h4>Full Color Studio</h4>
                    <button
                      type="button"
                      className="settings-collapse-button"
                      onClick={(event) => toggleFromCollapseButton(event, () => setColorStudioOpen((isOpen) => !isOpen))}
                      aria-expanded={colorStudioOpen}
                      aria-controls="color-studio-content"
                      aria-label={`${colorStudioOpen ? "Shrink" : "Enlarge"} Full Color Studio`}
                      title={`${colorStudioOpen ? "Shrink" : "Enlarge"} Full Color Studio`}
                    >
                      {colorStudioOpen ? "−" : "+"}
                    </button>
                  </div>

                  {colorStudioOpen && (
                    <div id="color-studio-content" className="settings-collapsible-content">
                      <div className="color-studio-intro">
                      <p className="hint-text">
                        Personalize every major surface and action. Changes preview instantly and save to this profile.
                      </p>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={handleResetColorTheme}
                        >
                          Reset to {theme === "dark" ? "Dark" : "Light"} Defaults
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => setThemeSaveOpen((isOpen) => !isOpen)}
                        >
                          Make into theme
                        </button>
                      </div>
                      {themeSaveOpen && (
                        <form className="color-theme-save-form" onSubmit={handleSaveCurrentColorTheme}>
                          <label htmlFor="new-theme-name">Theme name</label>
                          <input
                            id="new-theme-name"
                            value={newThemeName}
                            onChange={(event) => setNewThemeName(event.target.value)}
                            placeholder="My study theme"
                          />
                          <button type="submit" className="btn btn-primary" disabled={!newThemeName.trim()}>
                            Save Theme
                          </button>
                        </form>
                      )}

                  {[...new Set(COLOR_PERSONALIZATION_FIELDS.map((field) => field.group))].map((group) => (
                    <div className="color-studio-group" key={group}>
                      <div className="settings-collapse-header settings-collapse-subheader">
                        <h5>{group}</h5>
                        <button
                          type="button"
                          className="settings-collapse-button settings-collapse-button-small"
                          onClick={() => setColorGroupsOpen((openGroups) => ({
                            ...openGroups,
                            [group]: openGroups[group] !== true,
                          }))}
                          aria-expanded={colorGroupsOpen[group] === true}
                          aria-label={`${colorGroupsOpen[group] === true ? "Shrink" : "Enlarge"} ${group}`}
                          title={`${colorGroupsOpen[group] === true ? "Shrink" : "Enlarge"} ${group}`}
                        >
                          {colorGroupsOpen[group] === true ? "−" : "+"}
                        </button>
                      </div>
                      {colorGroupsOpen[group] === true && (
                        <div className="color-control-grid">
                        {COLOR_PERSONALIZATION_FIELDS.filter((field) => field.group === group).map((field) => {
                          const value =
                            userSettings.customColors?.[field.key] ||
                            THEME_COLOR_DEFAULTS[theme][field.key];
                          const draftKey = `theme:${field.key}`;
                          return (
                            <label className="color-control" key={field.key}>
                              <span>{field.label}</span>
                              <div>
                                <input
                                  type="color"
                                  value={value}
                                  onChange={(e) => {
                                    handleCustomColorChange(field.key, e.target.value);
                                    clearColorTextDraft(draftKey);
                                  }}
                                  aria-label={`${field.label} color`}
                                />
                                <input
                                  type="text"
                                  value={colorTextDrafts[draftKey] ?? value.toUpperCase()}
                                  onChange={(e) => setColorTextDrafts((drafts) => ({
                                    ...drafts,
                                    [draftKey]: e.target.value,
                                  }))}
                                  onBlur={() => commitColorTextDraft(
                                    draftKey,
                                    value,
                                    (color) => handleCustomColorChange(field.key, color),
                                  )}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") e.currentTarget.blur();
                                    if (e.key === "Escape") clearColorTextDraft(draftKey);
                                  }}
                                  maxLength={7}
                                  spellCheck="false"
                                  aria-label={`${field.label} hex color`}
                                />
                              </div>
                            </label>
                          );
                        })}
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="color-studio-group">
                    <div className="settings-collapse-header settings-collapse-subheader">
                      <h5>Course and category badges</h5>
                      <button
                        type="button"
                        className="settings-collapse-button settings-collapse-button-small"
                        onClick={() => setColorGroupsOpen((openGroups) => ({
                          ...openGroups,
                          badges: openGroups.badges !== true,
                        }))}
                        aria-expanded={colorGroupsOpen.badges === true}
                        aria-label={`${colorGroupsOpen.badges === true ? "Shrink" : "Enlarge"} Course and category badges`}
                        title={`${colorGroupsOpen.badges === true ? "Shrink" : "Enlarge"} Course and category badges`}
                      >
                        {colorGroupsOpen.badges === true ? "−" : "+"}
                      </button>
                    </div>
                    {colorGroupsOpen.badges === true && (
                      <div className="color-control-grid">
                      {[...new Set([...courses, "Work", "Personal"])].map((label) => {
                        const value = getCourseColor(label);
                        const draftKey = `badge:${label}`;
                        return (
                          <label className="color-control" key={label}>
                          <span>{label}</span>
                          <div className="badge-color-control">
                            <input
                              type="color"
                              value={value}
                              onChange={(e) => {
                                handleCourseColorChange(label, e.target.value);
                                clearColorTextDraft(draftKey);
                              }}
                              aria-label={`${label} badge color`}
                            />
                            <input
                              type="text"
                              value={colorTextDrafts[draftKey] ?? value.toUpperCase()}
                              onChange={(e) => setColorTextDrafts((drafts) => ({
                                ...drafts,
                                [draftKey]: e.target.value,
                              }))}
                              onBlur={() => commitColorTextDraft(
                                draftKey,
                                value,
                                (color) => handleCourseColorChange(label, color),
                              )}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
                                if (e.key === "Escape") clearColorTextDraft(draftKey);
                              }}
                              maxLength={7}
                              spellCheck="false"
                              aria-label={`${label} badge hex color`}
                            />
                          </div>
                          </label>
                        );
                      })}
                      </div>
                    )}
                  </div>
                    </div>
                  )}
                </section>

                <section className="settings-section" hidden>
                  <h4>Install TaskCabinet</h4>
                  <p className="hint-text">
                    Install the planner as a desktop or home-screen app with offline access.
                  </p>
                  {isStandalone ? (
                    <span className="settings-status-pill">Installed</span>
                  ) : installPrompt ? (
                    <button type="button" className="btn btn-primary" onClick={handleInstallApp}>
                      Install App
                    </button>
                  ) : (
                    <p className="hint-text">
                      Use your browser’s “Install app” or “Add to Home Screen” menu.
                    </p>
                  )}
                </section>

                <section className="settings-section school-cycle-settings" hidden>
                  <h4>School-Day Cycle</h4>
                  <p className="hint-text">
                    The anchor date uses the first label. Weekends are skipped automatically.
                  </p>
                  <label className="settings-select-row">
                    <span>Anchor date</span>
                    <input
                      type="date"
                      value={userSettings.cycleAnchorDate || ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        const date = value ? new Date(`${value}T00:00:00`) : null;
                        if (date && (date.getDay() === 0 || date.getDay() === 6)) {
                          alert("Choose a weekday as the first school-cycle day.");
                          return;
                        }
                        handleAddFieldSettingChange("cycleAnchorDate", value);
                      }}
                    />
                  </label>
                  <div className="cycle-day-list">
                    {(userSettings.cycleDayNames || ["A Day", "B Day"]).map((dayName) => (
                      <span className="cycle-day-chip" key={dayName}>
                        {dayName}
                        <button type="button" onClick={() => handleRemoveCycleDay(dayName)} aria-label={`Remove ${dayName}`}>×</button>
                      </span>
                    ))}
                  </div>
                  <div className="cycle-day-add-row">
                    <input
                      value={newCycleDayName}
                      onChange={(e) => setNewCycleDayName(e.target.value)}
                      placeholder="e.g., C Day"
                    />
                    <button type="button" className="btn btn-secondary" onClick={handleAddCycleDay}>Add Day</button>
                  </div>
                  <div className="course-cycle-grid">
                    {courses.map((course) => (
                      <div className="course-cycle-row" key={course}>
                        <strong>{course}</strong>
                        <div>
                          {(userSettings.cycleDayNames || ["A Day", "B Day"]).map((dayName) => {
                            const assignedDays = userSettings.courseCycleDays?.[course];
                            const isChecked = !Array.isArray(assignedDays) || assignedDays.includes(dayName);
                            return (
                              <label key={dayName}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => handleCourseCycleDayToggle(course, dayName, e.target.checked)}
                                />
                                {dayName}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="settings-section" hidden>
                  <h4>Add Assignment Fields</h4>
                  <p className="hint-text">
                    {currentUser
                      ? `Saved for ${currentUser}.`
                      : "Sign in to keep these preferences with a profile."}
                  </p>

                  <label className="settings-toggle">
                    <span>Priority</span>
                    <input
                      type="checkbox"
                      checked={userSettings.showPriority}
                      onChange={(e) =>
                        handleAddFieldSettingChange(
                          "showPriority",
                          e.target.checked,
                        )
                      }
                    />
                  </label>
                  <label className="settings-toggle">
                    <span>Repeat</span>
                    <input
                      type="checkbox"
                      checked={userSettings.showRepeat}
                      onChange={(e) =>
                        handleAddFieldSettingChange(
                          "showRepeat",
                          e.target.checked,
                        )
                      }
                    />
                  </label>
                  <label className="settings-toggle">
                    <span>Estimated Minutes</span>
                    <input
                      type="checkbox"
                      checked={userSettings.showEstimatedMinutes}
                      onChange={(e) =>
                        handleAddFieldSettingChange(
                          "showEstimatedMinutes",
                          e.target.checked,
                        )
                      }
                    />
                  </label>
                </section>

                {settingsSection === "checklists" && (
                  <>
                    <SettingsCard title="Checklist Deadlines" description="Date-only checklist items are due at 11:59 PM in your local time.">
                      <label className="settings-toggle settings-toggle-copy">
                        <span><strong>Optional item times</strong><small>Show a time field beside checklist dates. New items do not receive a time automatically.</small></span>
                        <input type="checkbox" checked={Boolean(userSettings.checklistTimesEnabled)} onChange={(event) => handleAddFieldSettingChange("checklistTimesEnabled", event.target.checked)} />
                      </label>
                      <p className="hint-text">Checklist reminders use the notification permission and reminder window under Reminders &amp; App.</p>
                    </SettingsCard>
                    <SettingsCard title="Checklist Appearance" description="Use the curated palette, choose a custom color on any list, or edit every swatch in Full Color Studio.">
                      <div className="checklist-settings-preview">{[1, 2, 3, 4, 5].map((index) => { const color = userSettings.customColors?.[`checklistPalette${index}`] || THEME_COLOR_DEFAULTS[theme][`checklistPalette${index}`]; return <span key={color} style={{ backgroundColor: color }} />; })}</div>
                      <button type="button" className="btn btn-secondary" onClick={() => { setSettingsSection("personalization"); setColorStudioOpen(true); setColorGroupsOpen((groups) => ({ ...groups, Checklists: true })); }}>Open Checklist Color Studio</button>
                    </SettingsCard>
                  </>
                )}

                {settingsSection === "reminders" && (
                  <>
                    <SettingsCard title="Install TaskCabinet" description="Install the planner as a desktop or home-screen app with offline access.">
                      {isStandalone ? (
                        <span className="settings-status-pill">Installed</span>
                      ) : installPrompt ? (
                        <button type="button" className="btn btn-primary" onClick={handleInstallApp}>Install App</button>
                      ) : (
                        <p className="hint-text">Use your browser’s “Install app” or “Add to Home Screen” menu.</p>
                      )}
                    </SettingsCard>
                    <SettingsCard title="Due Reminders" description="Choose when TaskCabinet should give you a heads-up.">
                      <div className={`external-push-status is-${reminderUserStatus}`} role="status">
                        <strong>{reminderStatusCopy.title}</strong>
                        <small>{reminderStatusCopy.detail}</small>
                      </div>
                      <div className="external-push-detail-grid"><span><strong>Push reminders</strong><small>{reminderUserStatus === "off" ? "Off" : reminderUserStatus === "connecting" ? "Connecting" : reminderUserStatus === "active" ? "Active" : "Needs attention"}</small></span><span><strong>Browser permission</strong><small>{browserNotificationPermission === "default" ? "Not requested" : browserNotificationPermission === "granted" ? "Allowed" : browserNotificationPermission === "denied" ? "Blocked" : "Unsupported"}</small></span><span><strong>Reminder timing</strong><small>{formatReminderLeadTime(userSettings.reminderMinutes || 60)} before</small></span></div>
                      {reminderUserStatus === "blocked" ? <div className="reminder-permission-guidance"><strong>Allow notifications in your browser settings</strong><p>TaskCabinet cannot reopen a blocked permission prompt. Open this site’s browser permissions, change Notifications to Allow, then return here and repair the sync.</p></div> : <button type="button" className={`btn ${userSettings.externalPushEnabled ? "btn-danger" : "btn-primary"}`} disabled={!EXTERNAL_PUSH_CLIENT_ENABLED || Boolean(externalPushAction)} onClick={() => handleExternalPushSettingChange(!userSettings.externalPushEnabled)}>{externalPushAction === "enabling" ? "Connecting…" : externalPushAction === "disabling" ? "Turning off…" : userSettings.externalPushEnabled ? "Disable Push Reminders" : "Enable Push Reminders"}</button>}
                      <label className="settings-select-row">
                        <span>Remind me</span>
                        <select value={userSettings.reminderMinutes || 60} onChange={(e) => handleAddFieldSettingChange("reminderMinutes", Number(e.target.value))}>
                          <option value={15}>15 minutes before</option>
                          <option value={30}>30 minutes before</option>
                          <option value={60}>1 hour before</option>
                          <option value={180}>3 hours before</option>
                          <option value={1440}>1 day before</option>
                        </select>
                      </label>
                      <p className="reminder-lead-copy">You’ll be reminded {formatReminderLeadTime(userSettings.reminderMinutes || 60)} before each assignment deadline.</p>
                      {reminderLeadAlreadyPassedCount > 0 && <p className="hint-text">{reminderLeadAlreadyPassedCount} upcoming assignment{reminderLeadAlreadyPassedCount === 1 ? " is" : "s are"} already inside that reminder window, so TaskCabinet won’t schedule a late alert.</p>}
                      <div className="external-push-actions"><button type="button" className="btn btn-secondary" onClick={handleExternalPushTest} disabled={!canSendReminderTest(reminderUserStatus, Boolean(externalPushAction))}>{externalPushAction === "testing" ? "Sending test…" : testReminderSent ? "Test sent" : "Send Test Reminder"}</button>{shouldShowRepairReminderSync(reminderUserStatus, externalPushStatus) && <button type="button" className="btn btn-secondary" onClick={handleExternalPushSync} disabled={Boolean(externalPushAction)}>{externalPushAction === "repairing" ? "Repairing…" : "Repair Reminder Sync"}</button>}</div>
                      {externalPushMessage && <p className="hint-text external-push-message">{externalPushMessage}</p>}
                      <p className="hint-text">Last successful sync: {externalPushLastSync ? new Date(externalPushLastSync).toLocaleString() : "Not yet"}</p>
                      <details className="reminder-technical-details"><summary>Technical details</summary><dl><div><dt>Provider connection</dt><dd>{externalPushDiagnostics.providerConnected ? "Connected" : "Not connected"}</dd></div><div><dt>Server enrollment</dt><dd>{externalPushDiagnostics.serverEnrolled ? "Confirmed" : "Not confirmed"}</dd></div><div><dt>Scheduling state</dt><dd>{externalPushDiagnostics.scheduling}</dd></div>{externalPushDiagnostics.lastError && <div><dt>Latest diagnostic</dt><dd>Available in this session</dd></div>}</dl></details>
                      <p className="hint-text">Closed-app delivery depends on your browser, operating system, permission, internet connection, and device notification settings. Reminder text may appear on your lock screen.</p>
                      {isAppleMobile && <p className="hint-text">On iPhone and iPad, add TaskCabinet to the Home Screen, open the installed app, and then enable Push Reminders.</p>}
                    </SettingsCard>
                    <SettingsCard title="Dashboard Reminder Range" description="Choose how far ahead the movable Reminders widget should look. This does not change browser-notification timing.">
                      <label className="settings-select-row">
                        <span>Show deadlines within</span>
                        <select value={dashboardReminderHours} onChange={(event) => handleAddFieldSettingChange("dashboardReminderHours", Number(event.target.value))}>
                          <option value={24}>Next 24 hours</option>
                          <option value={48}>Next 48 hours</option>
                          <option value={72}>Next 3 days</option>
                          <option value={168}>Next 7 days</option>
                          <option value={336}>Next 14 days</option>
                          <option value={720}>Next 30 days</option>
                        </select>
                      </label>
                    </SettingsCard>
                  </>
                )}

                {settingsSection === "calendar" && (
                  <SettingsCard title="Calendar Display" description="Choose how dates and school information appear in both calendar tools." className="settings-section-wide">
                    <div className="settings-option-grid">
                      <label className="settings-select-row settings-option-card">
                        <span>Week starts on</span>
                        <select value={userSettings.calendarWeekStartsOn || "sunday"} onChange={(e) => handleAddFieldSettingChange("calendarWeekStartsOn", e.target.value)}>
                          <option value="sunday">Sunday</option>
                          <option value="monday">Monday</option>
                        </select>
                      </label>
                      <label className="settings-select-row settings-option-card">
                        <span>Default calendar view</span>
                        <select value={userSettings.calendarViewMode || "month"} onChange={(e) => handleAddFieldSettingChange("calendarViewMode", e.target.value)}>
                          <option value="month">Month</option>
                          <option value="week">Week</option>
                        </select>
                      </label>
                    </div>
                    <label className="settings-toggle settings-toggle-copy"><span><strong>Neighboring-month dates</strong><small>Show faded dates from the previous and next month.</small></span><input type="checkbox" checked={userSettings.showNeighboringMonth !== false} onChange={(e) => handleAddFieldSettingChange("showNeighboringMonth", e.target.checked)} /></label>
                    <label className="settings-toggle settings-toggle-copy"><span><strong>School-cycle labels</strong><small>Display A Day, B Day, and custom cycle labels on dates.</small></span><input type="checkbox" checked={userSettings.showCalendarCycleLabels !== false} onChange={(e) => handleAddFieldSettingChange("showCalendarCycleLabels", e.target.checked)} /></label>
                    <label className="settings-toggle settings-toggle-copy"><span><strong>Assignment indicators</strong><small>Show a course-colored dot on dates with assignments.</small></span><input type="checkbox" checked={userSettings.showCalendarTaskDots !== false} onChange={(e) => handleAddFieldSettingChange("showCalendarTaskDots", e.target.checked)} /></label>
                  </SettingsCard>
                )}

                {settingsSection === "cycle" && (
                  <SettingsCard title="School-Day Cycle" description="The anchor date uses the first label. Weekends are skipped automatically." className="school-cycle-settings">
                    <label className="settings-select-row">
                      <span>Anchor date</span>
                      <input
                        type="date"
                        value={userSettings.cycleAnchorDate || ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          const date = value ? new Date(`${value}T00:00:00`) : null;
                          if (date && (date.getDay() === 0 || date.getDay() === 6)) {
                            alert("Choose a weekday as the first school-cycle day.");
                            return;
                          }
                          handleAddFieldSettingChange("cycleAnchorDate", value);
                        }}
                      />
                    </label>
                    <div className="cycle-day-list">
                      {(userSettings.cycleDayNames || ["A Day", "B Day"]).map((dayName) => (
                        <span className="cycle-day-chip" key={dayName}>{dayName}<button type="button" onClick={() => handleRemoveCycleDay(dayName)} aria-label={`Remove ${dayName}`}>×</button></span>
                      ))}
                    </div>
                    <div className="cycle-day-add-row">
                      <input value={newCycleDayName} onChange={(e) => setNewCycleDayName(e.target.value)} placeholder="e.g., C Day" />
                      <button type="button" className="btn btn-secondary" onClick={handleAddCycleDay}>Add Day</button>
                    </div>
                    <div className="course-cycle-grid">
                      {courses.map((course) => (
                        <div className="course-cycle-row" key={course}>
                          <strong>{course}</strong>
                          <div>
                            {(userSettings.cycleDayNames || ["A Day", "B Day"]).map((dayName) => {
                              const assignedDays = userSettings.courseCycleDays?.[course];
                              const isChecked = !Array.isArray(assignedDays) || assignedDays.includes(dayName);
                              return <label key={dayName}><input type="checkbox" checked={isChecked} onChange={(e) => handleCourseCycleDayToggle(course, dayName, e.target.checked)} />{dayName}</label>;
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </SettingsCard>
                )}

                {settingsSection === "assignments" && (
                  <>
                    <SettingsCard title="Add Assignment Fields" description={currentUser ? `Saved for ${currentUser}.` : "Sign in to keep these preferences with a profile."}>
                      <label className="settings-toggle"><span>Priority</span><input type="checkbox" checked={userSettings.showPriority} onChange={(e) => handleAddFieldSettingChange("showPriority", e.target.checked)} /></label>
                      <label className="settings-toggle"><span>Repeat</span><input type="checkbox" checked={userSettings.showRepeat} onChange={(e) => handleAddFieldSettingChange("showRepeat", e.target.checked)} /></label>
                      <label className="settings-toggle"><span>Estimated Minutes</span><input type="checkbox" checked={userSettings.showEstimatedMinutes} onChange={(e) => handleAddFieldSettingChange("showEstimatedMinutes", e.target.checked)} /></label>
                      <label className="settings-toggle"><span>Files</span><input type="checkbox" checked={userSettings.showAssignmentFiles !== false} onChange={(e) => handleAddFieldSettingChange("showAssignmentFiles", e.target.checked)} /></label>
                      <label className="settings-toggle"><span>Links</span><input type="checkbox" checked={userSettings.showAssignmentLinks !== false} onChange={(e) => handleAddFieldSettingChange("showAssignmentLinks", e.target.checked)} /></label>
                      <label className="settings-toggle"><span>Checklist Steps</span><input type="checkbox" checked={userSettings.showAssignmentChecklistSteps !== false} onChange={(e) => handleAddFieldSettingChange("showAssignmentChecklistSteps", e.target.checked)} /></label>
                    </SettingsCard>
                    <SettingsCard title="New Assignment Defaults" description="These values prefill new assignments and return after each successful add." className="settings-section-wide">
                      <div className="settings-option-grid assignment-defaults-grid">
                        <label className="settings-select-row settings-option-card"><span>Category</span><select value={userSettings.defaultCategory || "School"} onChange={(e) => handleAssignmentDefaultChange("defaultCategory", e.target.value)}>{TASK_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                        <label className="settings-select-row settings-option-card"><span>Priority</span><select value={userSettings.defaultPriority || "MED"} onChange={(e) => handleAssignmentDefaultChange("defaultPriority", e.target.value)}><option value="LOW">Low</option><option value="MED">Medium</option><option value="HIGH">High</option></select></label>
                        <label className="settings-select-row settings-option-card"><span>Estimated minutes</span><input type="number" min="0" value={userSettings.defaultEstimatedMinutes || ""} placeholder="None" onChange={(e) => handleAssignmentDefaultChange("defaultEstimatedMinutes", e.target.value)} /></label>
                        <label className="settings-select-row settings-option-card"><span>Repeat</span><select value={userSettings.defaultRepeat || "NONE"} onChange={(e) => handleAssignmentDefaultChange("defaultRepeat", e.target.value)}><option value="NONE">Does not repeat</option><option value="DAILY">Daily</option><option value="EVERY_OTHER_WEEKDAY">Every Other Weekday</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option></select></label>
                        <label className="settings-select-row settings-option-card"><span>Due time</span><input type="text" value={userSettings.defaultDueTime || "11:00"} placeholder="11:00" onChange={(e) => handleAssignmentDefaultChange("defaultDueTime", e.target.value)} onBlur={() => handleAssignmentDefaultChange("defaultDueTime", normalizeDueTime(userSettings.defaultDueTime) || "11:00")} /></label>
                        <label className="settings-select-row settings-option-card"><span>AM or PM</span><select value={userSettings.defaultDueAmPm || "PM"} onChange={(e) => handleAssignmentDefaultChange("defaultDueAmPm", e.target.value)}><option value="AM">AM</option><option value="PM">PM</option></select></label>
                      </div>
                    </SettingsCard>
                    <SettingsCard title="What Should I Do? Time Choices" description="Add extra one-tap time choices to the dashboard widget. The standard 15, 30, 45, and 60 minute choices always remain available." className="settings-section-wide">
                      <form className="quick-match-preset-settings" onSubmit={handleAddQuickMatchPreset}>
                        <label>
                          <span>New time choice</span>
                          <span className="quick-match-preset-entry">
                            <input type="number" min="1" max="1440" step="1" inputMode="numeric" value={quickMatchPresetDraft} onChange={(event) => setQuickMatchPresetDraft(event.target.value)} placeholder="90" aria-label="New preset minutes" />
                            <span>minutes</span>
                            <button type="submit" className="btn btn-primary" disabled={!quickMatchPresetDraftIsValid}>Add time</button>
                          </span>
                        </label>
                        {quickMatchCustomPresets.length > 0 ? (
                          <div className="quick-match-custom-presets" aria-label="Custom time choices">
                            {quickMatchCustomPresets.map((minutes) => (
                              <span key={minutes}>
                                {minutes} min
                                <button type="button" onClick={() => handleRemoveQuickMatchPreset(minutes)} aria-label={`Remove ${minutes} minute preset`}>&times;</button>
                              </span>
                            ))}
                          </div>
                        ) : <p className="hint-text quick-match-preset-empty">No extra time choices yet.</p>}
                      </form>
                    </SettingsCard>
                    <SettingsCard title="Workflow & Safety" description="Control automatic behavior and extra safeguards.">
                      <label className="settings-toggle settings-toggle-copy"><span><strong>Complete finished checklists</strong><small>Complete an assignment when every checklist item is checked.</small></span><input type="checkbox" checked={userSettings.autoCompleteChecklist !== false} onChange={(e) => handleAddFieldSettingChange("autoCompleteChecklist", e.target.checked)} /></label>
                      <label className="settings-toggle settings-toggle-copy"><span><strong>Confirm before Trash</strong><small>Ask before moving an assignment into recoverable Trash.</small></span><input type="checkbox" checked={Boolean(userSettings.confirmBeforeTrash)} onChange={(e) => handleAddFieldSettingChange("confirmBeforeTrash", e.target.checked)} /></label>
                    </SettingsCard>
                  </>
                )}

                {settingsSection === "storage" && (
                  <div className="storage-choice-grid settings-section-wide">
                    <button type="button" className="storage-choice-card" onClick={() => setStorageView("archive")}>
                      <span><strong>Archive</strong><small>Review and restore completed assignments you chose to archive.</small></span>
                      <span className="settings-count">{archivedTasks.length}</span>
                    </button>
                    <button type="button" className="storage-choice-card" onClick={() => setStorageView("trash")}>
                      <span><strong>Trash</strong><small>Recover assignments or remove them permanently.</small></span>
                      <span className="settings-count">{trashTasks.length}</span>
                    </button>
                  </div>
                )}

                <details className="settings-section settings-storage-section" hidden>
                  <summary>
                    <span>Archive</span>
                    <span className="settings-count">{archivedTasks.length}</span>
                  </summary>
                  <div className="settings-storage-body">
                    {archivedTasks.length === 0 ? (
                      <p className="placeholder-text">
                        No archived assignments.
                      </p>
                    ) : (
                      <ul className="task-list archive-list">
                        {archivedTasks.map((task) => (
                          <li key={task.id} className="task-card">
                            <div>
                              <strong>{task.title}</strong>
                              <div className="task-details">
                                {formatTaskDetails(task)}
                              </div>
                            </div>
                            <div className="task-actions">
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => handleRestoreArchived(task.id)}
                              >
                                Restore
                              </button>
                              {renderVoiceUndoAction(task)}
                              <button type="button" className="btn btn-danger" onClick={() => handleDelete(task.id)}>
                                Move to Trash
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>

                <details className="settings-section settings-storage-section" hidden>
                  <summary>
                    <span>Trash</span>
                    <span className="settings-count">{trashTasks.length}</span>
                  </summary>
                  <div className="settings-storage-body">
                    {trashTasks.length === 0 ? (
                      <p className="placeholder-text friendly-empty" role="status">Trash is empty — nothing to clean up here.</p>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-danger settings-empty-trash"
                          onClick={handleEmptyTrash}
                        >
                          Empty Trash
                        </button>
                        <ul className="task-list archive-list">
                          {trashTasks.map((task) => (
                            <li key={task.id} className="task-card">
                              <div>
                                <strong>{task.title}</strong>
                                <div className="task-details">
                                  {formatTaskDetails(task)}
                                </div>
                              </div>
                              <div className="task-actions">
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  onClick={() => handleRestoreDeleted(task.id)}
                                >
                                  Restore
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  onClick={() =>
                                    handleDeletePermanently(task.id)
                                  }
                                >
                                  Delete Permanently
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                </details>

                {settingsSection === "storage" && (
                  <SettingsCard
                    title="Reset Preferences"
                    description="Return personalization, assignment, calendar, reminder, and school-cycle settings to their defaults."
                    className="settings-danger-zone settings-section-wide"
                  >
                    <p className="hint-text">Assignments, courses, archived items, Trash, links, and files are not affected.</p>
                    <button type="button" className="btn btn-danger" onClick={handleResetPreferences}>Reset All Preferences</button>
                  </SettingsCard>
                )}
                  </div>
                  {storageView && (
                    <section className="storage-management-view" aria-label={`${storageView === "archive" ? "Archive" : "Trash"} assignments`}>
                      <div className="storage-management-header">
                        <div>
                          <button type="button" className="storage-back-button" onClick={() => setStorageView(null)}>← Back to Storage</button>
                          <h2>{storageView === "archive" ? "Archive" : "Trash"}</h2>
                          <p className="hint-text">
                            {storageView === "archive"
                              ? `${archivedTasks.length} archived assignment${archivedTasks.length === 1 ? "" : "s"}`
                              : `${trashTasks.length} deleted assignment${trashTasks.length === 1 ? "" : "s"}`}
                          </p>
                        </div>
                        {storageView === "archive" && archivedTasks.length > 0 && (
                          <button type="button" className="btn btn-danger" onClick={handleMoveAllArchivedToTrash}>Move All to Trash</button>
                        )}
                        {storageView === "trash" && trashTasks.length > 0 && (
                          <button type="button" className="btn btn-danger" onClick={handleEmptyTrash}>Empty Trash</button>
                        )}
                      </div>

                      {storageView === "archive" && (
                        archivedTasks.length === 0 ? (
                          <div className="storage-empty-state"><strong>Archive is empty</strong><p>Completed assignments you archive will appear here.</p></div>
                        ) : (
                          <ul className="storage-management-list">
                            {archivedTasks.map((task) => (
                              <li key={task.id} className="task-card storage-management-card">
                                <div><strong>{task.title}</strong><div className="task-details">{formatTaskDetails(task)}</div></div>
                                <div className="task-actions">
                                  <button type="button" className="btn btn-secondary" onClick={() => handleRestoreArchived(task.id)}>Restore</button>
                                  {renderVoiceUndoAction(task)}
                                  <button type="button" className="btn btn-danger" onClick={() => handleDelete(task.id)}>Move to Trash</button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )
                      )}

                      {storageView === "trash" && (
                        trashTasks.length === 0 ? (
                          <div className="storage-empty-state"><strong>Trash is empty</strong><p>Assignments moved to Trash can be recovered here.</p></div>
                        ) : (
                          <ul className="storage-management-list">
                            {trashTasks.map((task) => (
                              <li key={task.id} className="task-card storage-management-card">
                                <div><strong>{task.title}</strong><div className="task-details">{formatTaskDetails(task)}</div></div>
                                <div className="task-actions">
                                  <button type="button" className="btn btn-secondary" onClick={() => handleRestoreDeleted(task.id)}>Restore</button>
                                  <button type="button" className="btn btn-danger" onClick={() => handleDeletePermanently(task.id)}>Delete Permanently</button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )
                      )}
                    </section>
                  )}
                </div>
              </div>
            </div>
          )}
          </div>
          </main>
        </div>

        </div>
      {/*
        EDIT MODAL
        Rendered above every tab only while editingTask contains a temporary copy.
        Clicking the dark backdrop cancels; clicks inside stop propagation so the
        modal remains open while the user interacts with its fields.
      */}
      {editingTask && (
        <div className="modal-backdrop" onClick={handleEditCancel}>
          <div className="edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-assignment-title" onClick={(e) => e.stopPropagation()}>
            <div className="edit-modal-header">
              <div>
                <p className="eyebrow modal-eyebrow">Edit Assignment</p>
                <h2 id="edit-assignment-title">✏️ {editingTask.title || "Untitled Assignment"}</h2>
              </div>

              <button
                type="button"
                className="modal-close-button"
                onClick={handleEditCancel}
                aria-label="Close edit assignment"
              >
                ×
              </button>
            </div>

            <div className="edit-modal-grid">
              <div className="edit-field edit-field-full">
                <label>Assignment Name</label>
                <input
                  type="text"
                  value={editingTask?.title || ""}
                  onChange={(e) =>
                    handleEditFieldChange("title", e.target.value)
                  }
                  placeholder="Assignment name"
                />
              </div>

              <div className="edit-main-layout">
                <div className="edit-details-grid">
                  <div className="edit-field">
                    <label>Category</label>
                    <select
                      value={getTaskCategory(editingTask)}
                      onChange={(e) => handleEditFieldChange("category", e.target.value)}
                    >
                      {TASK_CATEGORIES.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </div>
                  <div className="edit-field">
                    <label>Course</label>
                    <select
                      value={editingTask.course || "Other"}
                      disabled={getTaskCategory(editingTask) !== "School"}
                      onChange={(e) =>
                        handleEditFieldChange("course", e.target.value)
                      }
                    >
                      {courses.map((course) => (
                        <option key={course} value={course}>
                          {course}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="edit-field">
                    <label>Priority</label>
                    <select
                      value={editingTask.priority || "MED"}
                      onChange={(e) =>
                        handleEditFieldChange("priority", e.target.value)
                      }
                    >
                      <option value="LOW">Low</option>
                      <option value="MED">Medium</option>
                      <option value="HIGH">High</option>
                    </select>
                  </div>

                  <div className="edit-field">
                    <label>Due Month</label>
                    <select
                      value={editingTask.dueMonth || ""}
                      onChange={(e) =>
                        handleEditFieldChange("dueMonth", e.target.value)
                      }
                    >
                      <option value="">No month</option>
                      {monthNames.map((month, index) => (
                        <option
                          key={month}
                          value={String(index + 1).padStart(2, "0")}
                        >
                          {month}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="edit-field">
                    <label>Due Day</label>
                    <select
                      value={editingTask.dueDay || ""}
                      onChange={(e) =>
                        handleEditFieldChange("dueDay", e.target.value)
                      }
                    >
                      <option value="">No day</option>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(
                        (day) => (
                          <option
                            key={day}
                            value={String(day).padStart(2, "0")}
                          >
                            {day}
                          </option>
                        ),
                      )}
                    </select>
                  </div>

                  <div className="edit-field">
                    <label>Due Time</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="e.g., 3 or 3:45"
                      value={editingTask.dueHour || "11:00"}
                      onChange={(e) =>
                        handleEditFieldChange("dueHour", e.target.value)
                      }
                      onBlur={() => {
                        const normalized = normalizeDueTime(
                          editingTask.dueHour,
                        );
                        if (normalized) {
                          handleEditFieldChange("dueHour", normalized);
                        }
                      }}
                    />
                  </div>

                  <div className="edit-field">
                    <label>AM / PM</label>
                    <select
                      value={editingTask.dueAmPm || "PM"}
                      onChange={(e) =>
                        handleEditFieldChange("dueAmPm", e.target.value)
                      }
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>

                  <div className="edit-field">
                    <label>Estimated Minutes</label>
                    <input
                      type="number"
                      min="0"
                      value={editingTask.estimatedMinutes || ""}
                      onChange={(e) =>
                        handleEditFieldChange(
                          "estimatedMinutes",
                          e.target.value,
                        )
                      }
                    />
                  </div>

                  <div className="edit-field">
                    <label>Repeat</label>
                    <select
                      value={editingTask.repeat || "NONE"}
                      onChange={(e) =>
                        handleEditFieldChange("repeat", e.target.value)
                      }
                    >
                      <option value="NONE">Does not repeat</option>
                      <option value="DAILY">Daily</option>
                      <option value="EVERY_OTHER_WEEKDAY">
                        Every Other Weekday
                      </option>
                      <option value="WEEKLY">Weekly</option>
                      <option value="MONTHLY">Monthly</option>
                    </select>
                  </div>
                </div>

                <div className="edit-field edit-notes-side">
                  <label>Notes</label>
                  <textarea
                    value={editingTask.notes || ""}
                    onChange={(e) =>
                      handleEditFieldChange("notes", e.target.value)
                    }
                    placeholder="Add notes, reminders, links, rubric details, or study instructions..."
                  />
                </div>
              </div>

              <div className="edit-field edit-field-full edit-subtask-section">
                <div className="optional-assignment-header double-click-collapse-header" onDoubleClick={(event) => toggleFromHeaderDoubleClick(event, () => setEditOptionalSections((sections) => ({ ...sections, files: !sections.files })))} title="Double-click to open or minimize Files">
                  <label>Files ({getSafeAttachments(editingTask).length + pendingEditFiles.length})</label>
                  <button
                    type="button"
                    className="optional-assignment-toggle"
                    onClick={(event) => toggleFromCollapseButton(event, () => setEditOptionalSections((sections) => ({ ...sections, files: !sections.files })))}
                    onDoubleClick={stopControlDoubleClick}
                    aria-expanded={editOptionalSections.files}
                    aria-label={`${editOptionalSections.files ? "Minimize" : "Open"} Files`}
                  >
                    {editOptionalSections.files ? "−" : "+"}
                  </button>
                </div>
                {editOptionalSections.files && <div className="edit-optional-content">
                <p className="subtask-form-hint">Files stay in this browser and may be up to 10 MB each.</p>
                <input
                  type="file"
                  multiple
                  onChange={(e) => {
                    handleFileSelection(e.target.files, setPendingEditFiles);
                    e.target.value = "";
                  }}
                />
                {[...getSafeAttachments(editingTask), ...pendingEditFiles.map((file, index) => ({
                  id: `pending-${index}`,
                  name: file.name,
                  size: file.size,
                  pendingIndex: index,
                }))].map((attachment) => (
                  <div className="attachment-draft-row" key={attachment.id}>
                    <span>{attachment.name}</span>
                    <button
                      type="button"
                      className="subtask-remove-button"
                      onClick={() => {
                        if (attachment.pendingIndex !== undefined) {
                          setPendingEditFiles((prev) => prev.filter((_, index) => index !== attachment.pendingIndex));
                        } else {
                          setEditingTask((prev) => ({
                            ...prev,
                            attachments: getSafeAttachments(prev).filter((item) => item.id !== attachment.id),
                          }));
                          setRemovedEditAttachmentIds((prev) => [...prev, attachment.id]);
                        }
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                </div>}
              </div>

              <div className="edit-field edit-field-full edit-subtask-section">
                <div className="optional-assignment-header double-click-collapse-header" onDoubleClick={(event) => toggleFromHeaderDoubleClick(event, () => setEditOptionalSections((sections) => ({ ...sections, links: !sections.links })))} title="Double-click to open or minimize Assignment Links">
                  <label>Assignment Links ({getSafeLinks(editingTask).length})</label>
                  <button
                    type="button"
                    className="optional-assignment-toggle"
                    onClick={(event) => toggleFromCollapseButton(event, () => setEditOptionalSections((sections) => ({ ...sections, links: !sections.links })))}
                    onDoubleClick={stopControlDoubleClick}
                    aria-expanded={editOptionalSections.links}
                    aria-label={`${editOptionalSections.links ? "Minimize" : "Open"} Assignment Links`}
                  >
                    {editOptionalSections.links ? "−" : "+"}
                  </button>
                </div>
                {editOptionalSections.links && <div className="edit-optional-content">
                <p className="subtask-form-hint">Only http and https web links are accepted.</p>
                <div className="link-form-row">
                  <input
                    type="text"
                    placeholder="Link name"
                    value={editLinkName}
                    onChange={(e) => {
                      setEditLinkName(e.target.value);
                      setEditLinkMessage("");
                    }}
                    onBlur={handleAddEditLink}
                  />
                  <input
                    type="text"
                    placeholder="example.com/resource"
                    value={editLinkUrl}
                    onChange={(e) => {
                      setEditLinkUrl(e.target.value);
                      setEditLinkMessage("");
                    }}
                    onBlur={handleAddEditLink}
                  />
                </div>
                <p
                  className={`link-entry-feedback ${editLinkMessage ? (editLinkMessage.startsWith("Added") ? "success" : "error") : ""}`}
                  role="status"
                >
                  {editLinkMessage || "Enter a link name and address, then click outside either field to add it. Confirm the link appears below before saving changes."}
                </p>
                {getSafeLinks(editingTask).map((link) => (
                  <div className="edit-link-row" key={link.id}>
                    <input
                      value={link.name}
                      onChange={(e) =>
                        setEditingTask((prev) => ({
                          ...prev,
                          links: getSafeLinks(prev).map((item) =>
                            item.id === link.id ? { ...item, name: e.target.value } : item,
                          ),
                        }))
                      }
                    />
                    <input
                      value={link.url}
                      onChange={(e) =>
                        setEditingTask((prev) => ({
                          ...prev,
                          links: getSafeLinks(prev).map((item) =>
                            item.id === link.id ? { ...item, url: e.target.value } : item,
                          ),
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="subtask-remove-button"
                      onClick={() =>
                        setEditingTask((prev) => ({
                          ...prev,
                          links: getSafeLinks(prev).filter((item) => item.id !== link.id),
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                </div>}
              </div>

              <div className="edit-field edit-field-full edit-subtask-section">
                <div className="optional-assignment-header double-click-collapse-header" onDoubleClick={(event) => toggleFromHeaderDoubleClick(event, () => setEditOptionalSections((sections) => ({ ...sections, checklist: !sections.checklist })))} title="Double-click to open or minimize Checklist Steps">
                  <label>Checklist Steps ({getSafeSubtasks(editingTask).length})</label>
                  <button
                    type="button"
                    className="optional-assignment-toggle"
                    onClick={(event) => toggleFromCollapseButton(event, () => setEditOptionalSections((sections) => ({ ...sections, checklist: !sections.checklist })))}
                    onDoubleClick={stopControlDoubleClick}
                    aria-expanded={editOptionalSections.checklist}
                    aria-label={`${editOptionalSections.checklist ? "Minimize" : "Open"} Checklist Steps`}
                  >
                    {editOptionalSections.checklist ? "−" : "+"}
                  </button>
                </div>
                {editOptionalSections.checklist && <div className="edit-optional-content">
                  <p className="subtask-form-hint">
                    Optional smaller steps that show up when the assignment card
                    is expanded. If every step is checked, the assignment
                    completes automatically.
                  </p>

                <div className="subtask-form-row">
                  <input
                    type="text"
                    placeholder="e.g., Write intro"
                    value={editSubtaskText}
                    onChange={(e) => setEditSubtaskText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddEditSubtask();
                      }
                    }}
                  />

                  <button
                    type="button"
                    className="btn btn-secondary subtask-add-button"
                    onClick={handleAddEditSubtask}
                  >
                    Add Step
                  </button>
                </div>

                <div className="subtask-deadline-fields">
                  <select value={editSubtaskDueMonth} onChange={(e) => setEditSubtaskDueMonth(e.target.value)}>
                    <option value="">Optional month</option>
                    {monthNames.map((month, index) => (
                      <option key={month} value={String(index + 1).padStart(2, "0")}>{month}</option>
                    ))}
                  </select>
                  <select value={editSubtaskDueDay} onChange={(e) => setEditSubtaskDueDay(e.target.value)}>
                    <option value="">Day</option>
                    {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                      <option key={day} value={String(day).padStart(2, "0")}>{day}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Time, e.g. 4:30"
                    value={editSubtaskDueHour}
                    onChange={(e) => setEditSubtaskDueHour(e.target.value)}
                  />
                  <select value={editSubtaskDueAmPm} onChange={(e) => setEditSubtaskDueAmPm(e.target.value)}>
                    <option value="AM">AM</option><option value="PM">PM</option>
                  </select>
                </div>

                {getSafeSubtasks(editingTask).length > 0 ? (
                  <ul className="edit-subtask-list">
                    {getSafeSubtasks(editingTask).map((subtask) => (
                      <li key={subtask.id} className="edit-subtask-item">
                        <input
                          type="checkbox"
                          checked={subtask.isDone}
                          onChange={() => handleEditSubtaskToggle(subtask.id)}
                        />

                        <input
                          type="text"
                          value={subtask.text}
                          onChange={(e) =>
                            handleEditSubtaskTextChange(
                              subtask.id,
                              e.target.value,
                            )
                          }
                        />

                        <div className="edit-subtask-deadline-fields">
                          <select
                            value={subtask.dueMonth}
                            onChange={(e) => handleEditSubtaskFieldChange(subtask.id, "dueMonth", e.target.value)}
                          >
                            <option value="">Month</option>
                            {monthNames.map((month, index) => (
                              <option key={month} value={String(index + 1).padStart(2, "0")}>{month}</option>
                            ))}
                          </select>
                          <select
                            value={subtask.dueDay}
                            onChange={(e) => handleEditSubtaskFieldChange(subtask.id, "dueDay", e.target.value)}
                          >
                            <option value="">Day</option>
                            {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                              <option key={day} value={String(day).padStart(2, "0")}>{day}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="Time"
                            value={subtask.dueHour}
                            onChange={(e) => handleEditSubtaskFieldChange(subtask.id, "dueHour", e.target.value)}
                          />
                          <select
                            value={subtask.dueAmPm}
                            onChange={(e) => handleEditSubtaskFieldChange(subtask.id, "dueAmPm", e.target.value)}
                          >
                            <option value="AM">AM</option><option value="PM">PM</option>
                          </select>
                        </div>

                        <button
                          type="button"
                          className="subtask-remove-button"
                          onClick={() => handleRemoveEditSubtask(subtask.id)}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="subtask-form-hint">
                    No checklist steps yet.
                  </p>
                )}
                </div>}
              </div>

              <label className="edit-checkbox edit-field-full">
                <input
                  type="checkbox"
                  checked={Boolean(editingTask.isCompleted)}
                  onChange={(e) =>
                    handleEditFieldChange("isCompleted", e.target.checked)
                  }
                />
                Mark as completed
              </label>
            </div>
            <div className="edit-modal-actions">
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleEditCancel}
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={handleEditSave}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
      {copyingTask && (
        <div className="modal-backdrop" onClick={() => setCopyingTask(null)}>
          <div className="edit-modal copy-dates-modal" role="dialog" aria-modal="true" aria-labelledby="copy-assignment-title" onClick={(e) => e.stopPropagation()}>
            <div className="edit-modal-header">
              <div>
                <p className="eyebrow modal-eyebrow">Copy Assignment</p>
                <h2 id="copy-assignment-title">Copy “{copyingTask.title}” to dates</h2>
              </div>
              <button type="button" className="modal-close-button" onClick={() => setCopyingTask(null)} aria-label="Close copy assignment">×</button>
            </div>
            <p className="hint-text">
              Dates are saved as month/day and repeat annually. Select as many
              dates as needed; existing copies in this assignment group are skipped.
            </p>
            <div className="copy-cycle-toolbar">
              <label>
                <span>Cycle-day filter</span>
                <select
                  value={copyCycleFilter}
                  disabled={!userSettings.cycleAnchorDate}
                  onChange={(e) => setCopyCycleFilter(e.target.value)}
                >
                  <option value="ALL">All days</option>
                  {(userSettings.cycleDayNames || ["A Day", "B Day"]).map((dayName) => (
                    <option key={dayName} value={dayName}>{dayName}</option>
                  ))}
                </select>
                {!userSettings.cycleAnchorDate && (
                  <small>Set a weekday anchor date in School Cycle settings to enable filters.</small>
                )}
              </label>
              {copyCycleFilter !== "ALL" && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleSelectAllVisibleCycleDates}
                >
                  Select All Visible {copyCycleFilter} Dates
                </button>
              )}
            </div>
            <Calendar
              activeStartDate={copyCalendarStart}
              calendarType={userSettings.calendarWeekStartsOn === "monday" ? "iso8601" : "gregory"}
              showNeighboringMonth={userSettings.showNeighboringMonth !== false}
              onClickDay={handleCopyDateToggle}
              onActiveStartDateChange={({ activeStartDate }) => {
                if (activeStartDate) setCopyCalendarStart(activeStartDate);
              }}
              tileContent={({ date, view }) => {
                if (view !== "month") return null;
                const cycleDay = getCycleDayForDate(date, userSettings);
                return cycleDay ? <span className="copy-cycle-day-label">{cycleDay}</span> : null;
              }}
              tileDisabled={({ date, view }) =>
                view === "month" &&
                copyCycleFilter !== "ALL" &&
                getCycleDayForDate(date, userSettings) !== copyCycleFilter
              }
              tileClassName={({ date, view }) => {
                const key = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                const classNames = [];
                if (copyDates.some((item) => item.key === key)) {
                  classNames.push("copy-date-selected");
                }
                if (view === "month" && copyCycleFilter !== "ALL") {
                  classNames.push(
                    getCycleDayForDate(date, userSettings) === copyCycleFilter
                      ? "copy-cycle-match"
                      : "copy-cycle-muted",
                  );
                }
                return classNames.join(" ");
              }}
            />
            <div className="copy-date-selection">
              <strong>Selected dates ({copyDates.length})</strong>
              {copyDates.length === 0 ? (
                <p>None</p>
              ) : (
                Object.entries(
                  copyDates.reduce((groups, item) => {
                    const group = item.cycleDay || "No cycle day";
                    return { ...groups, [group]: [...(groups[group] || []), item] };
                  }, {}),
                ).map(([cycleDay, dates]) => (
                  <p key={cycleDay}>
                    <strong>{cycleDay}:</strong>{" "}
                    {dates
                      .map(({ month, day }) => `${monthNames[Number(month) - 1]} ${Number(day)}`)
                      .join(", ")}
                  </p>
                ))
              )}
            </div>
            <div className="edit-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setCopyingTask(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={copyDates.length === 0} onClick={handleCopyConfirm}>
                Create Copies
              </button>
            </div>
          </div>
        </div>
      )}
      {tutorialOpen && (
        <div className="tutorial-backdrop" role="presentation">
          <section ref={tutorialRef} className="tutorial-dialog" role="dialog" aria-modal="true" aria-labelledby="tutorial-title" aria-describedby="tutorial-copy" tabIndex="-1">
            {tutorialPracticeOpen ? (
              <div className="tutorial-practice">
                <header className="tutorial-practice-header">
                  <div><p className="eyebrow">Practice mode</p><h2 id="tutorial-title">{TUTORIAL_SLIDES[tutorialStep].title}</h2><p id="tutorial-copy">Try this feature safely. Nothing here is saved to your real TaskCabinet.</p></div>
                  <button type="button" className="btn btn-secondary" onClick={() => { if (tutorialStep !== tutorialPracticeHomeStep) setTutorialStep(tutorialPracticeHomeStep); else setTutorialPracticeOpen(false); }}>← {tutorialStep !== tutorialPracticeHomeStep ? "Back to First Practice Page" : "Back to Tutorial"}</button>
                </header>
                <main className="tutorial-practice-stage">
                  {tutorialStep === 0 && <div className="practice-dashboard"><h3>Welcome back</h3><p>Everything you want to get done, organized.</p><div className="practice-stat-row"><button type="button" onClick={() => setTutorialPracticeDone((done) => done.includes("biology") ? done.filter((id) => id !== "biology") : [...done, "biology"])}><strong>{tutorialPracticeDone.includes("biology") ? "Done!" : "Biology review"}</strong><span>{tutorialPracticeDone.includes("biology") ? "Nice work" : "Due tomorrow · 30 min"}</span></button><button type="button" onClick={() => setTutorialStep(2)}><strong>Plan of Attack</strong><span>Open the recommendation practice</span></button></div></div>}
                  {tutorialStep === 1 && <div className="practice-form"><h3>Add a practice assignment</h3><label>Assignment name<input value={tutorialPracticeNote} onChange={(event) => setTutorialPracticeNote(event.target.value)} placeholder="Try typing an assignment" /></label><div><label>Course<select><option>Biology</option><option>Work</option><option>Personal</option></select></label><label>Priority<select><option>High</option><option>Medium</option><option>Low</option></select></label></div><button type="button" className="btn btn-primary" disabled={!tutorialPracticeNote.trim()} onClick={() => setTutorialPracticeDone(["created"])}>{tutorialPracticeDone.includes("created") ? "Practice assignment added!" : "Add Assignment"}</button></div>}
                  {tutorialStep === 2 && <div className="practice-plan"><h3>Recommended Plan of Attack</h3><p>Choose an assignment to mark it complete.</p>{[["biology","Review cell structure","Due tomorrow · High priority"],["english","Literature response","Due Friday · 45 minutes"],["math","Practice problems","Due next week · 20 minutes"]].map(([id,title,detail], index) => <button type="button" className={tutorialPracticeDone.includes(id) ? "done" : ""} key={id} onClick={() => setTutorialPracticeDone((done) => done.includes(id) ? done.filter((item) => item !== id) : [...done,id])}><b>{index + 1}</b><span><strong>{title}</strong><small>{tutorialPracticeDone.includes(id) ? "Completed" : detail}</small></span></button>)}</div>}
                  {tutorialStep === 3 && <div className="practice-calendar"><section><h3>July 2026</h3><div>{Array.from({ length: 28 }, (_, index) => index + 1).map((day) => <button type="button" className={tutorialPracticeDate === day ? "selected" : ""} key={day} onClick={() => setTutorialPracticeDate(day)}>{day}</button>)}</div><p>Selected: July {tutorialPracticeDate}</p></section><section><h3>Study checklist</h3>{["Review notes","Practice problems","Pack materials"].map((item) => <label key={item}><input type="checkbox" checked={tutorialPracticeDone.includes(item)} onChange={() => setTutorialPracticeDone((done) => done.includes(item) ? done.filter((value) => value !== item) : [...done,item])} />{item}</label>)}</section></div>}
                  {tutorialStep === 4 && <div className="practice-workspace"><p className="practice-widget-instruction">Open the <strong>Widgets</strong> tab in TaskCabinet to add widgets. Drag a six-dot handle to move a widget, or drag any edge or corner to resize it.</p>{[["plan","Plan of Attack","Biology review"],["calendar","Mini Calendar","3 deadlines"],["checklists","Checklists","1 of 3 complete"]].filter(([id]) => tutorialPracticeHiddenWidget !== id).map(([id,title,detail]) => <div key={id} style={{ left: tutorialWidgetLayout[id].x, top: tutorialWidgetLayout[id].y, width: tutorialWidgetLayout[id].width, height: tutorialWidgetLayout[id].height }}><header><button type="button" className="practice-widget-drag" aria-label={`Move ${title}`} onPointerDown={(event) => startTutorialWidgetInteraction(event, id)}>⠿</button><strong>{title}</strong><button type="button" className="practice-widget-menu-button" aria-label={`${title} options`} onClick={() => setTutorialPracticeWidgetMenu((open) => open === id ? "" : id)}>•••</button></header>{tutorialPracticeWidgetMenu === id && <button type="button" className="practice-widget-hide" onClick={() => { setTutorialPracticeHiddenWidget(id); setTutorialPracticeWidgetMenu(""); }}>Hide widget</button>}<span>{detail}</span>{[["top",{top:true}],["right",{right:true}],["bottom",{bottom:true}],["left",{left:true}],["top-left",{top:true,left:true}],["top-right",{top:true,right:true}],["bottom-right",{bottom:true,right:true}],["bottom-left",{bottom:true,left:true}]].map(([edge, edges]) => <button type="button" key={edge} className={`practice-widget-resize is-${edge}`} aria-label={`Resize ${title} from ${edge}`} onPointerDown={(event) => startTutorialWidgetInteraction(event, id, edges)} />)}</div>)}</div>}
                </main>
              </div>
            ) : (<>
            <button type="button" className="tutorial-skip" onClick={finishTutorial}>Skip tutorial</button>
            <div className={`tutorial-visual tutorial-${TUTORIAL_SLIDES[tutorialStep].visual}`} aria-hidden="true">
              {tutorialStep !== 0 && <div className="tutorial-browser-bar"><i /><i /><i /></div>}
              <div className="tutorial-illustration">
                {tutorialStep === 0 && <><div className="tutorial-mini-sidebar"><b>TC</b><span>Home</span><span>To Do</span><span>Calendar</span><span>Settings</span></div><div className="tutorial-mini-dashboard"><div className="tutorial-mini-heading"><span><strong>Welcome back</strong><small>Everything you want to get done, organized.</small></span><em>3 due soon</em></div><div className="tutorial-mini-grid"><i><strong>Plan of Attack</strong><small>Biology review</small><small>Literature response</small></i><i><strong>Today</strong><b>3</b><small>active tasks</small></i><i><strong>Progress</strong><b>72%</b><small>this week</small></i></div></div></>}
                {tutorialStep === 1 && <div className="tutorial-mini-form"><div className="tutorial-mini-form-heading"><strong>Add Assignment</strong><small>Required fields are marked</small></div><label>Assignment name<span>Biology chapter review</span></label><div><label>Course<span>Biology</span></label><label>Due date<span>Tomorrow · 11:00 PM</span></label></div><div><label>Priority<span>High</span></label><label>Estimated time<span>30 minutes</span></label></div><div className="tutorial-mini-options"><small>＋ Files</small><small>＋ Links</small><small>＋ Checklist steps</small></div><button type="button">Add Assignment</button></div>}
                {tutorialStep === 2 && <div className="tutorial-mini-plan"><div><span><strong>Recommended Plan of Attack</strong><small>Best next steps based on your workload</small></span><em>3 tasks · 1h 35m</em></div><ol><li><b>1</b><span><strong>Review cell structure</strong><small>Biology · Due tomorrow · 30 min</small><em><i>High priority</i><i>Due soon</i></em></span></li><li><b>2</b><span><strong>Literature response</strong><small>English · Due Friday · 45 min</small><em><i>2/3 steps done</i></em></span></li></ol></div>}
                {tutorialStep === 3 && <><div className="tutorial-mini-calendar"><div className="tutorial-mini-calendar-heading"><span>‹</span><strong>July 2026</strong><span>›</span></div><div>{["S","M","T","W","T","F","S","6","7","8","9","10","11","12","13","14","15","16","17","18","19"].map((day, index) => <span className={`${index === 17 ? "selected" : ""}${[10,15,19].includes(index) ? " has-task" : ""}`} key={`${day}-${index}`}>{day}</span>)}</div><small className="tutorial-calendar-legend"><i />Biology</small></div><div className="tutorial-mini-checklist"><div><strong>Study checklist</strong><em>1 of 3</em></div><span className="done">✓ Review notes</span><span>○ Practice problems <small>Due today</small></span><span>○ Pack materials</span><i><b /></i></div></>}
                {tutorialStep === 4 && <><div className="tutorial-mini-toolbar"><span>Open the Widgets tab to add widgets</span></div><div className="tutorial-mini-widget widget-one"><span>⠿ <i>•••</i></span><strong>Plan of Attack</strong><small>1. Biology review · Due tomorrow</small><small>2. Literature response · Friday</small></div><div className="tutorial-mini-widget widget-two"><span>⠿ <i>•••</i></span><strong>Mini Calendar</strong><small>July · 3 deadlines</small><b>◱</b></div><div className="tutorial-mini-widget widget-three"><span>⠿ <i>•••</i></span><strong>Checklists</strong><small>Study plan · 33%</small></div></>}
              </div>
            </div>
            <div className="tutorial-copy">
              <p className="eyebrow">Quick tour · {tutorialStep + 1} of {TUTORIAL_SLIDES.length}</p>
              <h2 id="tutorial-title">{TUTORIAL_SLIDES[tutorialStep].title}</h2>
              <p id="tutorial-copy">{TUTORIAL_SLIDES[tutorialStep].copy}</p>
            </div>
            <div className="tutorial-progress" aria-label={`Tutorial step ${tutorialStep + 1} of ${TUTORIAL_SLIDES.length}`}>
              {TUTORIAL_SLIDES.map((slide, index) => <span key={slide.visual} className={index === tutorialStep ? "active" : ""} />)}
            </div>
            {tutorialStep > 0 && <button type="button" className="tutorial-demo-link" onClick={openTutorialPractice}>Explore this feature</button>}
            <div className="tutorial-actions">
              <button type="button" className="btn btn-secondary" disabled={tutorialStep === 0} onClick={() => setTutorialStep((step) => step - 1)}>Back</button>
              {tutorialStep < TUTORIAL_SLIDES.length - 1
                ? <button type="button" className="btn btn-primary" onClick={() => setTutorialStep((step) => step + 1)}>Next</button>
                : <button type="button" className="btn btn-primary" onClick={finishTutorial}>Finish</button>}
            </div>
            </>)}
          </section>
        </div>
      )}
      {completionCelebration && (
        <div
          key={completionCelebration.id}
          className="completion-celebration"
          role="status"
          onAnimationEnd={() => setCompletionCelebration(null)}
        >
          <span aria-hidden="true">✓</span>
          <div><strong>Nice work!</strong><small>{completionCelebration.title} is complete.</small></div>
        </div>
      )}
      <Analytics />
      <SpeedInsights />
    </div>
  );
}

export default App;
