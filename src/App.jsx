import { useState, useEffect } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import "./App.css";
import { Analytics } from "@vercel/analytics/react";

const DEFAULT_USER_SETTINGS = {
  showPriority: true,
  showRepeat: true,
  showEstimatedMinutes: true,
  defaultCategory: "School",
  defaultPriority: "MED",
  defaultEstimatedMinutes: "",
  defaultRepeat: "NONE",
  defaultDueTime: "11:00",
  defaultDueAmPm: "PM",
  autoCompleteChecklist: true,
  confirmBeforeTrash: false,
  notificationsEnabled: false,
  reminderMinutes: 60,
  schoolLevel: "high",
  textSize: "medium",
  interfaceDensity: "comfortable",
  showHeaderSubtitle: true,
  reduceMotion: false,
  calendarWeekStartsOn: "sunday",
  showNeighboringMonth: true,
  showCalendarCycleLabels: true,
  showCalendarTaskDots: true,
  settingsSectionOrder: ["personalization", "assignments", "calendar", "reminders", "cycle", "storage"],
  cycleDayNames: ["A Day", "B Day"],
  cycleAnchorDate: "",
  courseCycleDays: {},
  customColors: {},
};

const ACCOUNTS_STORAGE_KEY = "taskacadia_accounts";
const AUTH_USER_STORAGE_KEY = "taskacadia_authenticated_user";
const LOGIN_COLORS_STORAGE_KEY = "taskacadia_login_colors";
const TASK_CATEGORIES = ["School", "Work", "Personal"];
const SCHOOL_LEVEL_COPY = {
  middle: {
    eyebrow: "Homework Command Center",
    subtitle: "Keep classes, homework, and daily steps clear and manageable.",
  },
  high: {
    eyebrow: "Student Productivity Hub",
    subtitle: "Organize assignments, track deadlines, manage courses, and plan your workload.",
  },
  college: {
    eyebrow: "College Coursework Planner",
    subtitle: "Coordinate courses, projects, readings, and independent work in one place.",
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
    heroStart: "#312e81", heroMiddle: "#581c87", heroEnd: "#1e3a8a", heroText: "#ffffff",
  },
};

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
  heroStart: ["--hero-start"],
  heroMiddle: ["--hero-middle"],
  heroEnd: ["--hero-end"],
  heroText: ["--hero-text"],
};

const SETTINGS_SECTIONS = [
  { id: "personalization", icon: "🎨", label: "Personalization", description: "Theme, layout, type, and every color." },
  { id: "assignments", icon: "📝", label: "Assignment Options", description: "Fields, defaults, and workflow behavior." },
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

function SettingsCard({ title, description, className = "", children }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className={`settings-section ${className}`.trim()}>
      <div className="settings-collapse-header">
        <h4>{title}</h4>
        <button
          type="button"
          className="settings-collapse-button"
          onClick={() => setIsOpen((open) => !open)}
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

function getQuickMatchEstimate(task) {
  const estimate = Number(task?.estimatedMinutes);
  return Number.isFinite(estimate) && estimate > 0
    ? estimate
    : Number.POSITIVE_INFINITY;
}

function getQuickMatchDueRank(bucket) {
  if (bucket.startsWith("Overdue")) return 0;
  if (bucket.startsWith("Due Today")) return 1;
  if (bucket.startsWith("Due Tomorrow")) return 2;
  if (bucket === "Due This Week") return 3;
  if (bucket === "Due Next Week") return 4;
  if (bucket === "Due Later") return 5;
  return 6;
}

function getQuickMatchDueLabel(bucket) {
  if (bucket.startsWith("Overdue")) return "Overdue";
  if (bucket.startsWith("Due Today")) return "Due Today";
  if (bucket.startsWith("Due Tomorrow")) return "Due Tomorrow";
  return bucket;
}

function rankQuickMatchCandidates(taskList, availableMinutes, getDueBucket) {
  const priorityRank = { HIGH: 0, MED: 1, LOW: 2 };
  const candidates = taskList.map((task) => {
    const estimate = getQuickMatchEstimate(task);
    const dueBucket = getDueBucket(task);
    const hasEstimate = Number.isFinite(estimate);
    return {
      task,
      estimate,
      dueBucket,
      dueLabel: getQuickMatchDueLabel(dueBucket),
      hasEstimate,
      fits: hasEstimate && estimate <= availableMinutes,
    };
  });

  const compareCandidates = (a, b) => {
    const dueDifference = getQuickMatchDueRank(a.dueBucket) - getQuickMatchDueRank(b.dueBucket);
    if (dueDifference) return dueDifference;

    const deadlineDifference =
      (getEffectiveDeadline(a.task)?.getTime() ?? Infinity) -
      (getEffectiveDeadline(b.task)?.getTime() ?? Infinity);
    if (deadlineDifference) return deadlineDifference;

    const priorityDifference =
      (priorityRank[a.task.priority] ?? 3) - (priorityRank[b.task.priority] ?? 3);
    if (priorityDifference) return priorityDifference;

    const fitDifferenceA = a.fits
      ? availableMinutes - a.estimate
      : a.estimate - availableMinutes;
    const fitDifferenceB = b.fits
      ? availableMinutes - b.estimate
      : b.estimate - availableMinutes;
    if (fitDifferenceA !== fitDifferenceB) return fitDifferenceA - fitDifferenceB;

    const statusDifference =
      (getTaskStatus(a.task) === "inProgress" ? 0 : 1) -
      (getTaskStatus(b.task) === "inProgress" ? 0 : 1);
    if (statusDifference) return statusDifference;

    return (a.task.title || "").localeCompare(b.task.title || "");
  };

  const fitting = candidates.filter((candidate) => candidate.fits).sort(compareCandidates);
  const oversized = candidates
    .filter((candidate) => candidate.hasEstimate && !candidate.fits)
    .sort(compareCandidates);
  const missingEstimate = candidates
    .filter((candidate) => !candidate.hasEstimate)
    .sort(compareCandidates);

  return [...fitting, ...oversized, ...missingEstimate].slice(0, 4);
}

function getQuickMatchReason(match) {
  if (!match.hasEstimate) return "Time is unknown, but this is the most urgent task to start.";
  if (!match.fits) return "This may not fit completely, but it is your best use of this time.";
  if (getTaskStatus(match.task) === "inProgress") return "Fits your time and you already have momentum.";
  if (match.dueLabel === "Overdue") return "Fits your time and is overdue.";
  if (match.dueLabel === "Due Today") return "Fits your time and is due today.";
  return "Fits your time and is one of your most urgent tasks.";
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

  // ---------------------------------------------------------------------------
  // COURSES AND COURSE COLORS
  // ---------------------------------------------------------------------------
  // "Other" is permanent because deleted courses move their assignments there.
  const [courses, setCourses] = useState(() => {
    try {
      const storedCourses = localStorage.getItem(courseStorageKey);
      return storedCourses
        ? JSON.parse(storedCourses)
        : ["AP Stat", "British Literature", "Calculus H", "APES", "Other"];
    } catch (error) {
      console.error("Error reading courses from localStorage:", error);
      return ["AP Stat", "British Literature", "Calculus H", "APES", "Other"];
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

  // ---------------------------------------------------------------------------
  // ADD ASSIGNMENT FORM
  // ---------------------------------------------------------------------------
  // These are "controlled inputs": each input displays a state value and uses
  // its onChange handler to put the user's latest typing back into that state.
  const [taskName, setTaskName] = useState("");
  const [category, setCategory] = useState(userSettings.defaultCategory || "School");
  const [selectedCourse, setSelectedCourse] = useState("");
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
  const [currentTab, setCurrentTab] = useState("dashboard");
  const [quickMatchMinutes, setQuickMatchMinutes] = useState("");
  const [quickMatchSubmittedMinutes, setQuickMatchSubmittedMinutes] = useState(null);
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
  const [settingsSection, setSettingsSection] = useState("personalization");
  const [storageView, setStorageView] = useState(null);
  const [draggedSettingsSection, setDraggedSettingsSection] = useState(null);
  const [settingsDropTarget, setSettingsDropTarget] = useState(null);
  const [appearanceSettingsOpen, setAppearanceSettingsOpen] = useState(false);
  const [colorStudioOpen, setColorStudioOpen] = useState(false);
  const [colorGroupsOpen, setColorGroupsOpen] = useState({});
  const [colorTextDrafts, setColorTextDrafts] = useState({});
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(() =>
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true,
  );

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

  useEffect(() => {
    if (
      !currentUser ||
      !userSettings.notificationsEnabled ||
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
  }, [currentUser, tasks, userSettings.notificationsEnabled, userSettings.reminderMinutes]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  };

  const handleInstallApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const handleNotificationSettingChange = async (isEnabled) => {
    if (!("Notification" in window)) {
      alert("This browser does not support notifications.");
      return;
    }
    if (isEnabled) {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        alert("Notifications were not enabled. You can change browser permissions later.");
        return;
      }
    }
    handleAddFieldSettingChange("notificationsEnabled", isEnabled);
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

    const resetSettings = {
      ...DEFAULT_USER_SETTINGS,
      cycleDayNames: [...DEFAULT_USER_SETTINGS.cycleDayNames],
      courseCycleDays: {},
      customColors: {},
    };
    setUserSettings(resetSettings);
    localStorage.setItem(settingsStorageKey, JSON.stringify(resetSettings));
    setTheme(getSystemPreference());
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
    handleAddFieldSettingChange("customColors", {
      ...(userSettings.customColors || {}),
      [key]: value,
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
  /* eslint-disable react-hooks/set-state-in-effect -- Load the selected localStorage profile when its keys change. */
  useEffect(() => {
    try {
      const rawTasks = localStorage.getItem(currentStorageKey);
      setTasks(rawTasks ? JSON.parse(rawTasks) : []);

      const rawCourses = localStorage.getItem(courseStorageKey);
      setCourses(
        rawCourses
          ? JSON.parse(rawCourses)
          : ["AP Stat", "British Literature", "Calculus H", "APES", "Other"],
      );

      const rawCourseColors = localStorage.getItem(courseColorsStorageKey);
      setCourseColors(rawCourseColors ? JSON.parse(rawCourseColors) : {});

      const rawSettings = localStorage.getItem(settingsStorageKey);
      const loadedSettings = rawSettings
        ? { ...DEFAULT_USER_SETTINGS, ...JSON.parse(rawSettings) }
        : DEFAULT_USER_SETTINGS;
      setUserSettings(loadedSettings);
      setCategory(loadedSettings.defaultCategory);
      setPriority(loadedSettings.defaultPriority);
      setEstTime(String(loadedSettings.defaultEstimatedMinutes || ""));
      setRepeatFrequency(loadedSettings.defaultRepeat);
      setDueHour(loadedSettings.defaultDueTime);
      setDueAmPm(loadedSettings.defaultDueAmPm);
    } catch (error) {
      console.error("Failed to load user data from localStorage:", error);
      setTasks([]);
      setCourses([
        "AP Stat",
        "British Literature",
        "Calculus H",
        "APES",
        "Other",
      ]);
      setCourseColors({});
      setUserSettings(DEFAULT_USER_SETTINGS);
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
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Remember which profile should be restored on the next browser visit.
  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem("currentUser", currentUser);
      } else {
        localStorage.removeItem("currentUser");
      }
    } catch (error) {
      console.error("Failed to persist currentUser to localStorage:", error);
    }
  }, [currentUser]);

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
    setTasks((prev) => {
      const updated = completeTaskList(prev, id);

      saveTasksForCurrentUser(updated);
      return updated;
    });
  };

  // Starting an assignment moves it from To Do into the new In Progress tab.
  const handleStartTask = (id) => {
    setTasks((prev) => {
      const updated = prev.map((task) =>
        task.id === id
          ? { ...task, isCompleted: false, status: "inProgress" }
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
          ? { ...task, isCompleted: false, status: "todo" }
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

    setEditingTaskId(null);
    setEditingTask(null);
    setPendingEditFiles([]);

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
        const profileKey = findLegacyProfileKey(trimmedName) || trimmedName;
        accounts[normalizedName] = {
          username: trimmedName,
          profileKey,
          salt: bytesToBase64(salt),
          verifier,
        };
        localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
        localStorage.setItem(AUTH_USER_STORAGE_KEY, normalizedName);
        setCurrentUser(profileKey);
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

  const handleSignOut = () => {
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    setCurrentUser("");
    setCurrentTab("dashboard");
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

  const recommendationPriorityOrder = { HIGH: 0, MED: 1, LOW: 2 };

  // Infinity deliberately places missing, zero, negative, or invalid estimates
  // after real estimates when estimated time is used as the final tie-breaker.
  const getRecommendationEstimate = (task) => {
    const estimatedMinutes = Number(task.estimatedMinutes);
    return Number.isFinite(estimatedMinutes) && estimatedMinutes > 0
      ? estimatedMinutes
      : Number.POSITIVE_INFINITY;
  };

  /**
   * Dashboard recommendation rules, in order:
   * 1. Most urgent due-date bucket
   * 2. HIGH, then MED, then LOW priority
   * 3. Shortest valid estimated time
   * 4. Alphabetical title for a stable final tie
   */
  const recommendedTasks = tasks
    .filter(
      (task) =>
        !task.isArchived &&
        !task.isDeleted &&
        getTaskStatus(task) !== "completed",
    )
    .sort((a, b) => {
      const bucketA = bucketsOrder.indexOf(getTaskDueBucket(a));
      const bucketB = bucketsOrder.indexOf(getTaskDueBucket(b));
      const safeBucketA = bucketA === -1 ? bucketsOrder.length : bucketA;
      const safeBucketB = bucketB === -1 ? bucketsOrder.length : bucketB;

      if (safeBucketA !== safeBucketB) return safeBucketA - safeBucketB;

      const deadlineA = getEffectiveDeadline(a)?.getTime() ?? Infinity;
      const deadlineB = getEffectiveDeadline(b)?.getTime() ?? Infinity;
      if (deadlineA !== deadlineB) return deadlineA - deadlineB;

      const priorityA = recommendationPriorityOrder[a.priority] ?? 3;
      const priorityB = recommendationPriorityOrder[b.priority] ?? 3;

      if (priorityA !== priorityB) return priorityA - priorityB;

      const estimateA = getRecommendationEstimate(a);
      const estimateB = getRecommendationEstimate(b);

      if (estimateA !== estimateB) return estimateA - estimateB;

      return (a.title || "").localeCompare(b.title || "");
    })
    .slice(0, 5);

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
  const handleRecommendedTaskClick = (taskId) => {
    const targetTask = tasks.find((task) => task.id === taskId);
    const targetTab =
      getTaskStatus(targetTask) === "inProgress" ? "inProgress" : "todo";

    resetFilters();
    setExpandedTaskId(taskId);
    setCurrentTab(targetTab);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById(`${targetTab}-task-${taskId}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    });
  };

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
            <label>Course:</label>
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
  const renderAddAssignmentForm = (formId) => (
    <form onSubmit={handleAddTask} className="card-form">
      <label htmlFor={`${formId}-assignment-name`}>Assignment Name:</label>
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
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "8px",
        }}
      >
        <label>Course:</label>
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

      <div className="subtask-form-section assignment-links-form optional-assignment-section">
        <div className="optional-assignment-header">
          <label>Optional Assignment Links</label>
          <button
            type="button"
            className="optional-assignment-toggle"
            onClick={() => setOptionalLinksOpen((open) => !open)}
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
          {draftLinkMessage || "Complete both fields, then leave the field to add the link automatically."}
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
      </div>

      <div className="subtask-form-section attachment-form-section optional-assignment-section">
        <div className="optional-assignment-header">
          <label>Optional Files</label>
          <button
            type="button"
            className="optional-assignment-toggle"
            onClick={() => setOptionalFilesOpen((open) => !open)}
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
      </div>

      <div className="subtask-form-section optional-assignment-section">
        <div className="optional-assignment-header">
          <label>Optional Checklist Steps</label>
          <button
            type="button"
            className="optional-assignment-toggle"
            onClick={() => setOptionalChecklistOpen((open) => !open)}
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
      </div>

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
        Add Assignment
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
  const quickMatchResults = quickMatchSubmittedMinutes
    ? rankQuickMatchCandidates(
        activeDashboardTasks,
        quickMatchSubmittedMinutes,
        getTaskDueBucket,
      )
    : [];
  const quickMatchBest = quickMatchResults[0] || null;
  const quickMatchBackups = quickMatchResults.slice(1, 4);

  const renderQuickMatchCard = () => (
    <section className="quick-match-card" aria-label="Quick Match">
      <div className="quick-match-header">
        <h2>Quick Match</h2>
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
            <p className="quick-match-reason">{getQuickMatchReason(quickMatchBest)}</p>
            {quickMatchBackups.length > 0 && (
              <div className="quick-match-backups">
                <span>Backups</span>
                <ul>
                  {quickMatchBackups.map((match) => (
                    <li key={match.task.id}>
                      <strong>{match.task.title}</strong>
                      <small>{match.hasEstimate ? `${match.estimate} min` : "No estimate"}</small>
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
      />
    </section>
  );

  const overdueTasksCount = activeDashboardTasks.filter(
    (task) => getTaskDueBucket(task) === "Overdue 🚨",
  ).length;

  const dueTodayCount = activeDashboardTasks.filter(
    (task) => getTaskDueBucket(task) === "Due Today ⏰",
  ).length;

  const totalEstimatedMinutes = activeDashboardTasks
    .reduce((total, task) => total + (Number(task.estimatedMinutes) || 0), 0);

  const estimatedHours = Math.floor(totalEstimatedMinutes / 60);
  const estimatedMinutesLeft = totalEstimatedMinutes % 60;

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
  const schoolLevelCopy =
    SCHOOL_LEVEL_COPY[userSettings.schoolLevel] || SCHOOL_LEVEL_COPY.high;
  return (
    <div className={`App ${theme} school-level-${userSettings.schoolLevel || "high"} text-size-${userSettings.textSize || "medium"} density-${userSettings.interfaceDensity || "comfortable"}${userSettings.reduceMotion ? " reduce-motion" : ""}`}>
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

        {/*
          Navigation changes currentTab. The active class lets CSS highlight the
          selected view; signing out and Settings access are also available here.
        */}
        <div className="tab-row">
          <button
            className={`tab-button ${currentTab === "dashboard" ? "active" : ""}`}
            onClick={() => setCurrentTab("dashboard")}
          >
            Dashboard
          </button>

          <button
            className={`tab-button ${currentTab === "todo" ? "active" : ""}`}
            onClick={() => setCurrentTab("todo")}
          >
            To Do
          </button>

          <button
            className={`tab-button ${currentTab === "inProgress" ? "active" : ""}`}
            onClick={() => setCurrentTab("inProgress")}
          >
            In Progress
          </button>

          <button
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
            className={`tab-button ${currentTab === "settings" ? "active" : ""}`}
            onClick={() => setCurrentTab("settings")}
            aria-label="Settings"
            title="Settings"
          >
            ⚙️ Settings
          </button>

          {currentUser && (
            <button className="btn btn-danger" onClick={handleSignOut}>
              Sign Out
            </button>
          )}
        </div>

        <div className={`workspace-layout${currentTab === "calendar" ? " workspace-calendar-only" : ""}`}>
          <aside className={`workspace-rail workspace-rail-left${currentTab === "dashboard" ? " workspace-rail-left-dashboard" : ""}`}>
            {renderQuickMatchCard()}
          </aside>
          <main className="workspace-main">

        {/*
          DASHBOARD VIEW
          Includes quick statistics, recommendations, assignment creation, and
          course customization. It does not replace the dedicated task tabs.
        */}
        {currentTab === "dashboard" && (
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

              {recommendedTasks.length === 0 ? (
                <p className="recommended-plan-empty">
                  You have no incomplete assignments. Nice work!
                </p>
              ) : (
                <ol className="recommended-plan-list">
                  {recommendedTasks.map((task, index) => {
                    const estimatedMinutes = getRecommendationEstimate(task);
                    const taskStatus = getTaskStatus(task);

                    return (
                      <li key={task.id} className="recommended-plan-item">
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

                            {renderSubtaskProgressLine(
                              task,
                              "recommended-plan-progress",
                            )}
                          </div>
                        </button>
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
                >
                  {addAssignmentOpen ? "Minimize" : "Open"}
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
          {currentTab === "todo" && (
            <div>
              {renderFilterToggle()}

              <h3>📝 To Do ({todoTasks.length})</h3>

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
                                <strong>{task.title}</strong>
                                <span
                                  className="course-name"
                                  style={{
                                    backgroundColor: getCourseColor(
                                      task.course,
                                    ),
                                    color: getTextColorForCourse(task.course),
                                    padding: "4px 8px",
                                    borderRadius: "999px",
                                    fontWeight: "600",
                                  }}
                                >
                                  {task.course}
                                </span>
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
          {currentTab === "inProgress" && (
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
                                <strong>{task.title}</strong>
                                <span
                                  className="course-name"
                                  style={{
                                    backgroundColor: getCourseColor(
                                      task.course,
                                    ),
                                    color: getTextColorForCourse(task.course),
                                    padding: "4px 8px",
                                    borderRadius: "999px",
                                    fontWeight: "600",
                                  }}
                                >
                                  {task.course}
                                </span>
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
          {currentTab === "completed" && (
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
                  No completed assignments match your filters.
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
                        <strong>{task.title}</strong>
                        <span
                          className="course-name"
                          style={{
                            backgroundColor: getCourseColor(task.course),
                            color: getTextColorForCourse(task.course),
                            padding: "4px 8px",
                            borderRadius: "999px",
                            fontWeight: "600",
                          }}
                        >
                          {task.course}
                        </span>
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
              <div className="panel-header">
                <h3>📅 Assignment Calendar</h3>
              </div>

                  <Calendar
                    onChange={handleCalendarDateChange}
                    value={selectedDate}
                    calendarType={userSettings.calendarWeekStartsOn === "monday" ? "iso8601" : "gregory"}
                    showNeighboringMonth={userSettings.showNeighboringMonth !== false}
                    tileContent={({ date }) => {
                      const taskForDay = calendarTasks.find(
                        (task) =>
                          Number(task.dueMonth) === date.getMonth() + 1 &&
                          Number(task.dueDay) === date.getDate(),
                      );
                      const cycleDay = getCycleDayForDate(date, userSettings);

                      const showCycleDay = userSettings.showCalendarCycleLabels !== false && cycleDay;
                      const showTaskDot = userSettings.showCalendarTaskDots !== false && taskForDay;

                      return showTaskDot || showCycleDay ? (
                        <div className="calendar-tile-details">
                          {showCycleDay && <span>{cycleDay}</span>}
                          {showTaskDot && (
                            <i style={{ backgroundColor: getCourseColor(taskForDay.course) }} />
                          )}
                        </div>
                      ) : null;
                    }}
                  />

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
                      No assignments due on this day.
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
                              <strong>{task.title}</strong> —{" "}
                              <span
                                className="course-name"
                                style={{
                                  backgroundColor: getCourseColor(task.course),
                                  color: getTextColorForCourse(task.course),
                                  padding: "4px 8px",
                                  borderRadius: "999px",
                                  fontWeight: "600",
                                }}
                              >
                                {task.course}
                              </span>
                              <div className="task-details">
                                {formatTaskDetails(task)}
                              </div>
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
                      {calendarAddOpen ? "Cancel" : "➕ Add Assignment"}
                    </button>
                  </div>

                  {calendarAddOpen && (
                    <div
                      className="card card-container"
                      style={{ marginTop: "16px" }}
                    >
                      <h3>
                        Add Assignment for{" "}
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
                  <div className={`settings-grid${storageView ? " settings-grid-hidden" : ""}`}>
                <section className="settings-section" hidden={settingsSection !== "personalization"}>
                  <div className="settings-collapse-header">
                    <h4>Appearance</h4>
                    <button
                      type="button"
                      className="settings-collapse-button"
                      onClick={() => setAppearanceSettingsOpen((isOpen) => !isOpen)}
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
                      <p className="hint-text">Currently using {theme} mode.</p>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={toggleTheme}
                      >
                        Use {theme === "dark" ? "Light Mode" : "Dark Mode"}
                      </button>
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
                            <option value="small">Small</option>
                            <option value="medium">Medium</option>
                            <option value="large">Large</option>
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

                <section className="settings-section color-studio-section" hidden={settingsSection !== "personalization"}>
                  <div className="color-studio-header">
                    <h4>Full Color Studio</h4>
                    <button
                      type="button"
                      className="settings-collapse-button"
                      onClick={() => setColorStudioOpen((isOpen) => !isOpen)}
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
                          onClick={() => handleAddFieldSettingChange("customColors", {})}
                        >
                          Reset to {theme === "dark" ? "Dark" : "Light"} Defaults
                        </button>
                      </div>

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

                <section className="settings-section" hidden>
                  <h4>Due Reminders</h4>
                  <p className="hint-text">
                    Browser reminders are checked while TaskCabinet is open.
                  </p>
                  <label className="settings-toggle">
                    <span>Notifications</span>
                    <input
                      type="checkbox"
                      checked={Boolean(userSettings.notificationsEnabled)}
                      onChange={(e) => handleNotificationSettingChange(e.target.checked)}
                    />
                  </label>
                  <label className="settings-select-row">
                    <span>Remind me</span>
                    <select
                      value={userSettings.reminderMinutes || 60}
                      onChange={(e) => handleAddFieldSettingChange("reminderMinutes", Number(e.target.value))}
                    >
                      <option value={15}>15 minutes before</option>
                      <option value={30}>30 minutes before</option>
                      <option value={60}>1 hour before</option>
                      <option value={180}>3 hours before</option>
                      <option value={1440}>1 day before</option>
                    </select>
                  </label>
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
                    <SettingsCard title="Due Reminders" description="Browser reminders are checked while TaskCabinet is open.">
                      <label className="settings-toggle settings-toggle-copy">
                        <span><strong>Notifications</strong><small>Alert me when an incomplete assignment approaches its deadline.</small></span>
                        <input type="checkbox" checked={Boolean(userSettings.notificationsEnabled)} onChange={(e) => handleNotificationSettingChange(e.target.checked)} />
                      </label>
                      <label className="settings-select-row">
                        <span>Reminder window</span>
                        <select value={userSettings.reminderMinutes || 60} disabled={!userSettings.notificationsEnabled} onChange={(e) => handleAddFieldSettingChange("reminderMinutes", Number(e.target.value))}>
                          <option value={15}>15 minutes before</option>
                          <option value={30}>30 minutes before</option>
                          <option value={60}>1 hour before</option>
                          <option value={180}>3 hours before</option>
                          <option value={1440}>1 day before</option>
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
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => handleRestoreArchived(task.id)}
                            >
                              Restore
                            </button>
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
                      <p className="placeholder-text">Trash is empty.</p>
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
                                <button type="button" className="btn btn-secondary" onClick={() => handleRestoreArchived(task.id)}>Restore</button>
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
          {currentTab !== "calendar" && (
            <aside className="workspace-rail workspace-rail-right">
              {renderWorkspaceCalendar()}
            </aside>
          )}
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
          <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="edit-modal-header">
              <div>
                <p className="eyebrow modal-eyebrow">Edit Assignment</p>
                <h2>✏️ {editingTask.title || "Untitled Assignment"}</h2>
              </div>

              <button
                type="button"
                className="modal-close-button"
                onClick={handleEditCancel}
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
                <div>
                  <label>Files</label>
                  <p className="subtask-form-hint">Files stay in this browser and may be up to 10 MB each.</p>
                </div>
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
              </div>

              <div className="edit-field edit-field-full edit-subtask-section">
                <div>
                  <label>Assignment Links</label>
                  <p className="subtask-form-hint">Only http and https web links are accepted.</p>
                </div>
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
                  {editLinkMessage || "Complete both fields, then leave the field to add the link automatically."}
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
              </div>

              <div className="edit-field edit-field-full edit-subtask-section">
                <div>
                  <label>Checklist Steps</label>
                  <p className="subtask-form-hint">
                    Optional smaller steps that show up when the assignment card
                    is expanded. If every step is checked, the assignment
                    completes automatically.
                  </p>
                </div>

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
          <div className="edit-modal copy-dates-modal" onClick={(e) => e.stopPropagation()}>
            <div className="edit-modal-header">
              <div>
                <p className="eyebrow modal-eyebrow">Copy Assignment</p>
                <h2>Copy “{copyingTask.title}” to dates</h2>
              </div>
              <button type="button" className="modal-close-button" onClick={() => setCopyingTask(null)}>×</button>
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
      <Analytics />
    </div>
  );
}

export default App;
