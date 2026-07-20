import { useCallback, useState, useEffect, useLayoutEffect, useRef } from "react";
import "./App.css";
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
import { findMatchingCourse, normalizeCourseName, parsePastedAssignmentRows } from "./bulkImportUtils.js";
import { createAssignmentsCsv } from "./assignmentCsv.js";
import { getReminderActionLabel, getWorkflowLabel, MOBILE_TASK_LEVELS, nextMobileTaskLevel, passwordsMatch, splitActiveAndOverdue } from "./mobileUxUtils.js";
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
  shouldStartTutorialForProfile,
} from "./onboardingUtils.js";
import { buildDesiredReminders, EXTERNAL_PUSH_CLIENT_ENABLED, getPushDeviceStorageKey, shouldUseOpenAppFallback } from "./externalReminderUtils.js";
import { cancelAllExternalReminders, cancelExternalReminder, reconcileExternalReminders, replaceExternalReminder, retryPendingExternalCleanup, scheduleExternalReminder, sendExternalReminderTest } from "./externalReminderClient.js";
import { summarizeDeadlineConfidence } from "./deadlineConfidenceUtils.js";
import { canSendReminderTest, clearReminderFailure, createReminderActionGuard, deriveReminderUserStatus, formatReminderLeadTime, friendlyReminderError, getAssignmentReminderIndicator, getReminderStatusCopy, shouldShowReminderSuggestion, shouldShowRepairReminderSync } from "./reminderUxUtils.js";
import { CLOUD_SYNC_CONFIGURED, getSupabaseBrowserClient } from "./supabaseClient.js";
import { applyCloudStateToLocal, chooseHydrationState, collectSyncableState, createPortableExport, ensureCloudSnapshot, getCloudStateFingerprint, hasMeaningfulState, loadCloudHistory, loadCloudSnapshot, loadLatestLocalBackup, loadLocalMeta, loadLocalSnapshot, parsePortableExport, readLegacySnapshot, readStoredSection, removeCloudAccountLocalData, replaceCloudSnapshot, resolveProfileDisplayName, saveLocalBackup, saveLocalSnapshot } from "./cloudSync.js";
import { getTrashDaysRemaining, isTrashExpired } from "./trashUtils.js";
import { friendlyAccountError, friendlyCloudSaveError } from "./userMessageUtils.js";
import { evaluateAttachmentSelection, formatStorageBytes, getStorageQuotaStatus, MAX_ATTACHMENTS_PER_ASSIGNMENT } from "./storageQuotaUtils.js";
import { MANUAL_ACCESSIBILITY_CHECKS, runAccessibilityAudit } from "./accessibilityAudit.js";
import { RECOVERY_SESSION_KEY } from "./AppErrorBoundary.jsx";
import GlowDocketLogo from "./GlowDocketLogo.jsx";
import { PrivacyDataDialog, PrivacyDataPanel } from "./PrivacyDataPanel.jsx";
import { APP_BUILD_METADATA } from "./buildMetadata.js";
import { FEEDBACK_CATEGORIES, FEEDBACK_MAX_MESSAGE_LENGTH, feedbackScreenshotPath, validateFeedbackScreenshot } from "./feedbackUtils.js";
import { AssignmentCountdown, MobilePageTitle, MobileSettingsPortal, PasswordEyeIcon, PersonalizationTip, SettingsAccordionProvider, SettingsCard, SubtaskProgressLine } from "./components/AppDisplayComponents.jsx";
import { AssignmentFilterControls, AssignmentFilterToggle } from "./components/AssignmentFilters.jsx";
import DeferredCalendar from "./components/DeferredCalendar.jsx";
import FocusSession from "./components/FocusSession.jsx";
import AchievementEmblem from "./components/AchievementEmblem.jsx";
import { getFocusTimeUpdate } from "./focusSessionUtils.js";
import { getUniqueAssignmentMetadata } from "./assignmentMetadataUtils.js";
import { CELEBRATION_STUDIO_REQUIRED_DAYS, DEFAULT_GAMIFICATION, GAMIFICATION_ACHIEVEMENTS, GAMIFICATION_CONFETTI, GAMIFICATION_TITLES, getCelebrationStudioProgress, getGamificationTitle, getLocalSignInDay, getNewAchievementIds, grantAllGamificationRewards, isGamificationTestAccount, normalizeGamification, normalizeSignInDays, summarizeWeeklyMomentum } from "./gamificationUtils.js";

/*
 * GLOWDOCKET APPLICATION MAP
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
  showTaskCourseBadge: true,
  showTaskDetailLine: true,
  showTaskCountdown: true,
  showTaskChecklistProgress: true,
  showTaskReminderIndicator: true,
  defaultCategory: "School",
  defaultPriority: "MED",
  defaultEstimatedMinutes: "",
  defaultRepeat: "NONE",
  defaultDueTime: "11:00",
  defaultDueAmPm: "PM",
  autoCompleteChecklist: true,
  confirmBeforeTrash: true,
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
  gamification: DEFAULT_GAMIFICATION,
  calendarWeekStartsOn: "sunday",
  calendarViewMode: "month",
  showNeighboringMonth: true,
  showCalendarCycleLabels: true,
  showCalendarTaskDots: true,
  checklistTimesEnabled: false,
  settingsSectionOrder: ["personalization", "assignments", "checklists", "calendar", "reminders", "cycle", "accessibility", "privacy", "storage"],
  mobileSettingsExpandedCards: {},
  cycleDayNames: ["A Day", "B Day"],
  cycleAnchorDate: "",
  courseCycleDays: {},
  customColors: {},
  activeColorThemeId: "midnight-neon",
  customCategories: [],
  customColorThemes: [],
  deletedColorThemeIds: [],
  signInDays: [],
  celebrationColors: {},
};

const ACCOUNTS_STORAGE_KEY = "taskacadia_accounts";
const AUTH_USER_STORAGE_KEY = "taskacadia_authenticated_user";
const MOBILE_SETTINGS_FIRST_CARD = {
  personalization: "appearance",
  account: "preferred-name",
  assignments: "add-assignment-fields",
  checklists: "checklist-deadlines",
  reminders: "install-glowdocket",
  calendar: "calendar-display",
  cycle: "school-day-cycle",
  storage: "browser-storage",
  privacy: "privacy-data",
  accessibility: "automated-accessibility-check",
};
const LOGIN_COLORS_STORAGE_KEY = "taskacadia_login_colors";
const TUTORIAL_SLIDES = [
  { title: "Welcome to GlowDocket", copy: "Your assignments, plans, and progress stay together in one calm workspace.", visual: "welcome" },
  { title: "Capture work quickly", copy: "Add a title and due date, then include priority, time, files, links, or checklist steps when useful.", visual: "add" },
  { title: "Know what to do next", copy: "Plan of Attack weighs deadlines, priority, progress, and time so the next step is always clear.", visual: "plan" },
  { title: "See the whole week", copy: "Calendar and independent checklists keep deadlines, routines, and small details visible.", visual: "calendar" },
  { title: "Make the workspace yours", copy: "Move, resize, minimize, and theme widgets to build a dashboard that fits how you study.", visual: "workspace" },
  { title: "Match your day cycle", copy: "Have different classes on different days? Use Day Cycles to name each schedule day, choose an anchor date, and see the right cycle across your calendar.", visual: "cycle" },
];
const TASK_CATEGORIES = ["School", "Work", "Personal"];
const COMPLETION_CONFETTI = Array.from({ length: 24 }, (_, index) => ({
  id: index,
  x: `${6 + ((index * 37) % 88)}%`,
  drift: `${((index * 29) % 90) - 45}px`,
  sway: `${18 + ((index * 17) % 34)}px`,
  swayBack: `${-14 - ((index * 11) % 28)}px`,
  scale: `${0.78 + (index % 5) * 0.09}`,
  delay: `${(index % 5) * 60}ms`,
  duration: `${2900 + (index % 4) * 350}ms`,
  rotation: `${120 + ((index * 47) % 300)}deg`,
  color: ["var(--primary-color)", "var(--secondary-color)", "var(--success-color)", "var(--warning-color)"][index % 4],
}));
const METEOR_SHOWER_PARTICLES = Array.from({ length: 48 }, (_, index) => ({
  id: `meteor-${index}`,
  x: `${2 + ((index * 43) % 96)}%`,
  drift: "0px",
  sway: "0px",
  swayBack: "0px",
  scale: `${0.68 + (index % 6) * 0.08}`,
  delay: `${(index % 9) * 310}ms`,
  duration: `${1450 + (index % 5) * 170}ms`,
  rotation: "0deg",
  color: ["var(--primary-color)", "var(--secondary-color)"][index % 2],
}));
const getFireworkBursts = (celebrationId) => {
  const seed = String(celebrationId || "fireworks").split("").reduce((total, character) => (total * 31 + character.charCodeAt(0)) % 9973, 17);
  return Array.from({ length: 7 }, (_, index) => ({
    id: index,
    x: 10 + ((seed + index * 47) % 80),
    y: 9 + ((seed * (index + 3) + index * 29) % 62),
    delay: index * 250,
  }));
};
const CELEBRATION_PREVIEW_PARTICLES = Array.from({ length: 14 }, (_, index) => ({
  id: index,
  x: `${7 + ((index * 29) % 86)}%`,
  delay: `${-((index * 173) % 2400)}ms`,
  duration: `${2100 + (index % 4) * 260}ms`,
  drift: `${((index * 17) % 34) - 17}px`,
}));
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
  { key: "focus", label: "Header outline", group: "Foundations" },
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
  { key: "calendarDropdownLogo", label: "Calendar Drop Down Logo", group: "Calendar" },
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
  { key: "logoBackground", label: "Logo background", group: "Logo" },
  { key: "logoGradientStart", label: "Gradient start", group: "Logo" },
  { key: "logoGradientEnd", label: "Gradient end", group: "Logo" },
  { key: "logoStar", label: "Star", group: "Logo" },
  { key: "logoGlow", label: "Star glow", group: "Logo" },
  { key: "logoSpeedLines", label: "Speed lines", group: "Logo" },
];

const CELEBRATION_COLOR_FIELDS = [
  { key: "palette1", label: "Particle color 1", fallback: "#f43f5e" },
  { key: "palette2", label: "Particle color 2", fallback: "#f59e0b" },
  { key: "palette3", label: "Particle color 3", fallback: "#facc15" },
  { key: "palette4", label: "Particle color 4", fallback: "#22c55e" },
  { key: "palette5", label: "Particle color 5", fallback: "#06b6d4" },
  { key: "palette6", label: "Particle color 6", fallback: "#a855f7" },
  { key: "accent", label: "Celebration border", fallback: "#8b5cf6" },
  { key: "toastBackground", label: "Message background", fallback: "#111827" },
  { key: "toastText", label: "Message text", fallback: "#ffffff" },
];

const CELEBRATION_STYLE_COLOR_FIELDS = {
  none: [],
  standard: ["palette1", "palette2", "palette3", "palette4", "palette5", "palette6"],
  stars: ["palette3"],
  course: ["palette1"],
  rainbow: ["palette1", "palette2", "palette3", "palette4", "palette5", "palette6"],
  sparkles: ["palette3"],
  ribbons: ["palette1", "palette6"],
  prism: ["palette1", "palette2", "palette4", "palette5", "palette6"],
  meteors: ["palette1", "palette2"],
  bubbles: ["palette5", "palette6"],
  leaves: ["palette2", "palette4"],
  snow: ["palette3", "palette5"],
  fireworks: ["palette1", "palette2", "palette3", "palette4", "palette5", "palette6"],
  "gold-ripple": ["palette3"],
  hearts: ["palette1"],
  pixels: ["palette1", "palette2", "palette3", "palette4", "palette5", "palette6"],
  crowns: ["palette2", "palette3"],
};

const CELEBRATION_STYLE_COLOR_LABELS = {
  stars: { palette3: "Star color" },
  course: { palette1: "Course particle color" },
  sparkles: { palette3: "Sparkle color" },
  ribbons: { palette1: "Ribbon color 1", palette6: "Ribbon color 2" },
  prism: { palette1: "Prism color 1", palette2: "Prism color 2", palette4: "Prism color 3", palette5: "Prism color 4", palette6: "Prism color 5" },
  meteors: { palette1: "Meteor color 1", palette2: "Meteor color 2" },
  bubbles: { palette5: "Bubble color 1", palette6: "Bubble color 2" },
  leaves: { palette2: "Leaf color 1", palette4: "Leaf color 2" },
  snow: { palette3: "Snow color 1", palette5: "Snow color 2" },
  fireworks: { palette1: "Firework color 1", palette2: "Firework color 2", palette3: "Firework color 3", palette4: "Firework color 4", palette5: "Firework color 5", palette6: "Firework color 6" },
  "gold-ripple": { palette3: "Ripple energy color" },
  hearts: { palette1: "Heart color" },
  crowns: { palette2: "Crown color", palette3: "Crown jewel" },
};

const getCelebrationColorsForStyle = (savedColors, celebrationId) => {
  if (!savedColors || typeof savedColors !== "object" || Array.isArray(savedColors)) return {};
  const styleColors = savedColors[celebrationId];
  if (styleColors && typeof styleColors === "object" && !Array.isArray(styleColors)) return styleColors;
  return CELEBRATION_COLOR_FIELDS.some((field) => savedColors[field.key]) ? savedColors : {};
};

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

const getColorLuminance = (color) => {
  const hex = normalizeHexColor(color || "")?.slice(1);
  if (!hex) return 0;
  const channels = [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map((part) => {
    const value = parseInt(part, 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

const ensureReadableText = (textColor, backgroundColor, minimumRatio = 4.5) => {
  const foreground = normalizeHexColor(textColor || "");
  const background = normalizeHexColor(backgroundColor || "");
  if (!foreground || !background) return foreground || getContrastText(background);
  const foregroundLuminance = getColorLuminance(foreground);
  const backgroundLuminance = getColorLuminance(background);
  const ratio = (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
  return ratio >= minimumRatio ? foreground : getContrastText(background);
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
    calendarSelected: "#2563eb", calendarToday: "#dbeafe", calendarDropdownLogo: "#111827",
    checklistSurface: "#ffffff", checklistText: "#111827", checklistAccent: "#4f46e5",
    checklistPalette1: "#fff7cc", checklistPalette2: "#dff7e8", checklistPalette3: "#dceeff",
    checklistPalette4: "#f3e4ff", checklistPalette5: "#ffe1e1",
    heroStart: "#4f46e5", heroMiddle: "#7c3aed", heroEnd: "#2563eb", heroText: "#ffffff",
    logoBackground: "#ffffff", logoGradientStart: "#4f46e5", logoGradientEnd: "#2563eb",
    logoStar: "#ffffff", logoGlow: "#a78bfa", logoSpeedLines: "#4f46e5",
  },
  dark: {
    page: "#0b1020", surface: "#151b2e", surfaceAlt: "#1f2937",
    text: "#f9fafb", muted: "#aab3c5", border: "#293247", focus: "#818cf8", input: "#111827",
    nav: "#151b2e", task: "#151b2e", modal: "#151b2e", backdrop: "#020617", primary: "#60a5fa",
    primaryText: "#0b1020", secondary: "#334155", secondaryText: "#ffffff",
    success: "#22c55e", warning: "#facc15", warningText: "#111827",
    danger: "#ef4444", dangerText: "#ffffff", priorityHigh: "#4a1a1a",
    link: "#60a5fa", calendar: "#111827", calendarText: "#f9fafb",
    calendarSelected: "#2563eb", calendarToday: "#4b5563", calendarDropdownLogo: "#ffffff",
    checklistSurface: "#151b2e", checklistText: "#f9fafb", checklistAccent: "#818cf8",
    checklistPalette1: "#5a4b1f", checklistPalette2: "#173f32", checklistPalette3: "#173755",
    checklistPalette4: "#3e2854", checklistPalette5: "#512a31",
    heroStart: "#312e81", heroMiddle: "#581c87", heroEnd: "#1e3a8a", heroText: "#ffffff",
    logoBackground: "#151b2e", logoGradientStart: "#818cf8", logoGradientEnd: "#60a5fa",
    logoStar: "#ffffff", logoGlow: "#a78bfa", logoSpeedLines: "#60a5fa",
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
      logoBackground: "#ffffff", logoGradientStart: "#06b6d4", logoGradientEnd: "#1d4ed8",
      logoStar: "#ffffff", logoGlow: "#67e8f9", logoSpeedLines: "#0284c7",
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
      logoBackground: "#ffffff", logoGradientStart: "#22c55e", logoGradientEnd: "#0f766e",
      logoStar: "#ffffff", logoGlow: "#86efac", logoSpeedLines: "#15803d",
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
      logoBackground: "#ffffff", logoGradientStart: "#f97316", logoGradientEnd: "#7c3aed",
      logoStar: "#ffffff", logoGlow: "#f9a8d4", logoSpeedLines: "#ea580c",
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
      logoBackground: "#111827", logoGradientStart: "#22d3ee", logoGradientEnd: "#8b5cf6",
      logoStar: "#ffffff", logoGlow: "#67e8f9", logoSpeedLines: "#22d3ee",
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
      logoBackground: "#211027", logoGradientStart: "#f472b6", logoGradientEnd: "#7c3aed",
      logoStar: "#ffffff", logoGlow: "#f0abfc", logoSpeedLines: "#d946ef",
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

const getSafeColorThemeColors = (colors = {}) => {
  const normalized = Object.fromEntries(
    Object.keys(COLOR_CSS_VARIABLES)
      .map((key) => [key, normalizeHexColor(colors[key] || "")])
      .filter(([, color]) => Boolean(color)),
  );
  return {
    ...normalized,
    ...(normalized.surface && { text: ensureReadableText(normalized.text, normalized.surface) }),
    ...(normalized.page && { muted: ensureReadableText(normalized.muted, normalized.page, 3) }),
    ...(normalized.primary && { primaryText: ensureReadableText(normalized.primaryText, normalized.primary) }),
    ...(normalized.secondary && { secondaryText: ensureReadableText(normalized.secondaryText, normalized.secondary) }),
    ...(normalized.warning && { warningText: ensureReadableText(normalized.warningText, normalized.warning) }),
    ...(normalized.danger && { dangerText: ensureReadableText(normalized.dangerText, normalized.danger) }),
    ...(normalized.calendar && { calendarText: ensureReadableText(normalized.calendarText, normalized.calendar) }),
    ...(normalized.checklistSurface && { checklistText: ensureReadableText(normalized.checklistText, normalized.checklistSurface) }),
    ...(normalized.heroMiddle && { heroText: ensureReadableText(normalized.heroText, normalized.heroMiddle) }),
  };
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
  calendarDropdownLogo: ["--calendar-dropdown-logo"],
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
  logoBackground: ["--logo-background"],
  logoGradientStart: ["--logo-gradient-start"],
  logoGradientEnd: ["--logo-gradient-end"],
  logoStar: ["--logo-star"],
  logoGlow: ["--logo-glow"],
  logoSpeedLines: ["--logo-speed-lines"],
};

const SETTINGS_SECTIONS = [
  { id: "account", icon: "👤", label: "Account", description: "Preferred name, email, and password." },
  { id: "personalization", icon: "🎨", label: "Personalization", description: "Theme, layout, type, and every color." },
  { id: "assignments", icon: "📝", label: "Assignment Options", description: "Fields, defaults, and workflow behavior." },
  { id: "checklists", icon: "☑️", label: "Checklists", description: "Standalone list deadlines and appearance." },
  { id: "calendar", icon: "📅", label: "Calendar", description: "Week layout and calendar details." },
  { id: "reminders", icon: "🔔", label: "Reminders & App", description: "Notifications and installation." },
  { id: "cycle", icon: "🔁", label: "School Cycle", description: "Cycle labels, anchor date, and courses." },
  { id: "accessibility", icon: "♿", label: "Accessibility", description: "Automated checks and manual verification." },
  { id: "privacy", icon: "🛡️", label: "Privacy & Data", description: "Local data, cloud sync, and device-specific behavior." },
  { id: "storage", icon: "🗄️", label: "Storage", description: "Archive, Trash, and preference tools." },
];

function getOrderedSettingsSections(savedOrder) {
  const visibleSections = SETTINGS_SECTIONS;
  const validIds = new Set(visibleSections.map((section) => section.id));
  const safeOrder = Array.isArray(savedOrder)
    ? savedOrder.filter((id, index, items) => validIds.has(id) && items.indexOf(id) === index)
    : [];
  const missingIds = visibleSections.map((section) => section.id).filter((id) => !safeOrder.includes(id));
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
      const effectiveHeight = isCollapsed
        ? Number(item.dataset.collapsedHeight) || bounds.height
        : Number.isFinite(expandedHeight) ? expandedHeight : bounds.height;
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

function getTaskCategory(task) {
  return task?.category || "School";
}

function getTaskCourseOrCategory(task) {
  return getTaskCategory(task) === "School" ? task?.course || "Other" : getTaskCategory(task);
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

async function readBrowserStorageEstimate() {
  if (!navigator.storage?.estimate) return { supported: false, usage: 0, quota: 0 };
  const estimate = await navigator.storage.estimate();
  return { supported: true, usage: Number(estimate.usage) || 0, quota: Number(estimate.quota) || 0 };
}

function friendlyAttachmentStorageError(error) {
  return error?.name === "QuotaExceededError"
    ? "This browser does not have enough storage space for the selected attachments. Remove unused files and try again."
    : "The selected file could not be stored in this browser.";
}

function recoveryRequestedOnLoad() {
  try {
    return sessionStorage.getItem(RECOVERY_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * GLOWDOCKET APPLICATION GUIDE
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
 * GlowDocket currently stores month and day, but not a year. For that reason,
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
    completedAt: null,
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

const WORKSPACE_MOBILE_BREAKPOINT = 720;
const WORKSPACE_DESKTOP_BREAKPOINT = 1400;
const getWorkspaceModeForWidth = (width, userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent) => {
  if (/CrOS/i.test(userAgent)) return "chromebook";
  if (Number(width) < WORKSPACE_MOBILE_BREAKPOINT) return "mobile";
  return Number(width) < WORKSPACE_DESKTOP_BREAKPOINT ? "chromebook" : "desktop";
};

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
      chromebook: isOldUnstampedLayout ? false : Boolean(repaired.locked?.chromebook),
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
  ["Minimize or enlarge", "Use the + or − button. With a mouse, you can also double-click the header. This works on widgets, Settings cards, and optional assignment sections."],
  ["Change the app theme", "Pick a built-in or saved theme in Appearance. A theme changes the full color set, not your assignments or course colors."],
  ["Save your own theme", "Set up your colors in Full Color Studio, choose Make into theme, and give it a name. You can reuse it without rebuilding every color."],
  ["Full Color Studio", "Each group controls one part of GlowDocket. Changes show right away, so you can try colors before saving a custom theme."],
  ["Text and background contrast", "If text gets hard to read after a color change, adjust Main text, Muted text, or the matching surface color in Full Color Studio."],
  ["Course colors", "Course colors label assignments and calendar dots. They stay separate from the main app theme so each course remains easy to spot."],
  ["Checklist colors", "The checklist palette supplies quick color choices. You can still give one list its own custom color without changing the others."],
  ["Text size", "Text size grows the words and the nearby controls together. If a widget feels crowded afterward, resize that widget to give it more room."],
  ["App font", "App font changes the writing style across GlowDocket. Highly Readable is the clearest option; Typewriter Mono gives everything equal-width letters."],
  ["Interface spacing", "Compact fits more on screen, Comfortable is the everyday default, and Spacious adds extra breathing room around controls."],
  ["Task action layout", "Comfortable wrap keeps actions in rows, Compact buttons saves space, and Vertical actions stacks them for easier tapping."],
  ["Reduce motion", "Turn this on if you prefer a steadier screen. GlowDocket will remove the extra movement while keeping every feature working."],
  ["Calendar display", "Use Calendar settings to choose week or month view, the first day of the week, and whether school-cycle details appear."],
  ["School-day cycle", "Choose an anchor date and name your cycle days. Weekends are skipped automatically when GlowDocket works out the next cycle day."],
  ["Checklist deadlines", "A checklist item with only a date is due at 11:59 PM. Turn on checklist times when a step needs a specific hour."],
  ["Add Assignment fields", "Hide optional fields you rarely use. This only cleans up the form; it does not remove information from assignments you already made."],
  ["New Assignment defaults", "Defaults prefill new assignments and return after a successful add. You can still change any field before saving."],
  ["Dark and light themes", "Theme mode controls whether GlowDocket uses a light or dark base. Custom themes remember which base they were made for."],
  ["Turn on push reminders", "Open Reminders & App in Settings and choose Enable Push Reminders. GlowDocket waits for you to press that button before asking for notification permission."],
  ["Choose when reminders arrive", "The Remind me setting uses one timing choice for every assignment. The sentence below it shows exactly how early GlowDocket will try to remind you."],
  ["Reminder bell icons", "A small bell on an assignment means its reminder is healthy, still syncing, or needs attention. Tap or focus it to hear the exact status; a mouse can also hover."],
  ["Repair reminder sync", "If Push Reminders says Needs attention, choose Repair Reminder Sync. Healthy reminders hide that button because there is nothing you need to fix."],
  ["Notifications are blocked", "GlowDocket cannot reopen a permission prompt after the browser blocks it. Allow notifications from your browser’s site settings, then return and repair the sync."],
  ["Test your reminders", "Send Test Reminder becomes available once Push Reminders is fully active. It checks this browser without changing any assignment deadline."],
  ["Reminders while the app is closed", "Push reminders can arrive while GlowDocket is closed when your browser, device, internet, and notification settings allow it. Open-app reminders stay available as a fallback."],
  ["Push reminders on iPhone or iPad", "Add GlowDocket to the Home Screen, open the installed app, and enable Push Reminders from there. Regular browser tabs on Apple mobile devices cannot always receive web push."],
  ["Deadline is too close for a reminder", "If the chosen reminder time has already passed, GlowDocket skips the late alert instead of surprising you after the useful moment."],
  ["Overdue assignments", "Overdue work gets stronger red highlighting in assignments, reminders, recommendations, course summaries, and calendars. GlowDocket never changes the deadline for you."],
  ["Recommended Plan of Attack", "This plan weighs due dates, priority, estimated time, and progress. Open an item to work with the real assignment; the plan never creates a duplicate."],
  ["What Should I Do?", "Enter how much time you have and GlowDocket will look for work that fits. If nothing fits perfectly, it favors the most urgent useful choice."],
  ["To Do and In Progress", "Choose In Progress when you begin something. Move it back to To Do if you started by accident; your notes and checklist steps stay with it."],
  ["Repeating assignments", "Completing a repeating assignment creates its next occurrence. Each occurrence keeps its own deadline and reminder instead of reusing the finished one."],
  ["Assignment related tasks", "Use optional related tasks to break a large assignment into smaller pieces. If automatic completion is on, completing the final related task completes the assignment."],
  ["Files stay on this browser", "Assignment files are stored in this browser, not uploaded with your reminder. Clearing site data can remove them, so keep another copy of anything important."],
  ["Assignment links", "Give each link a useful name and web address. Leave the link field after typing so it is added to the list before you save the assignment."],
  ["Import a syllabus", "Paste a list or choose a PDF, DOCX, TXT, Markdown, or CSV file. Review the preview before importing so dates and course headings look right."],
  ["Voice assignments", "Voice assignment creation is in the works and currently unavailable. Add assignments manually or use the paste and syllabus tools for now."],
  ["Archive and Trash", "Archive keeps finished assignments out of the way. Trash is recoverable until you permanently delete it, so moving something there is not immediately final."],
  ["Calendar assignment details", "Choose a date to see everything due that day. Course-colored dots help you scan the month without changing the colors of the assignments themselves."],
  ["Dashboard reminder range", "The reminder widget’s upcoming range only changes what appears on the dashboard. It does not change when push notifications are sent."],
  ["Accounts and profiles", "With account sync configured, your assignments and personalization can follow your email account. Push permission, reminder connection, and attachment files still belong to each browser."],
  ["Forgot your password", "On the welcome page, choose Sign In and then Forgot password? Enter your account email, open the recovery link, and choose a new password. Your planner data is not reset."],
  ["Password eye buttons", "Each password box has its own eye button. Showing one password never reveals the confirmation box, so you can check either entry safely."],
  ["Preferred name", "Add the name you like to be called under Account. GlowDocket can use it in friendly greetings and reminders, but never as your sign-in identity."],
  ["Welcome page", "The public welcome page explains GlowDocket before you sign in. Get Started and I Already Have an Account open the account panel, while Continue as Guest lets you preview the planner using browser-only data."],
  ["Keep local data safe", "GlowDocket saves your work in this browser. Clearing browser storage or using a different device does not automatically bring that data with you."],
  ["Privacy and data use", "Open Privacy & Data to see where information is stored, what cloud accounts sync, and which features remain specific to this device. GlowDocket does not load usage analytics or advertising trackers."],
  ["Install a GlowDocket update", "When an update is ready, finish any open edit and choose Update. Choose Later if you need to keep working; GlowDocket will not force the new version into the middle of your task."],
  ["Check your GlowDocket version", "Open Storage, then Version & Diagnostics, to see the app version, environment, and when that version was built."],
  ["Restore a previous local version", "Backup & Restore can recover the latest safety copy made before a restore or cloud conflict. GlowDocket saves the current version again before replacing it."],
  ["Storage and attachment warnings", "The Browser Storage card warns when this site is getting full. Attachment limits prevent one assignment from unexpectedly using too much browser space."],
  ["Verify accessibility", "Accessibility Settings includes an automated scan and a manual checklist. Use both because keyboard flow, zoom, focus order, and screen-reader clarity need human review."],
  ["Tutorial after sign-in", "The quick tour opens the first time an account signs in. Use Finish on the last page, and replay it later from Personalization."],
  ["Edit assignments on mobile", "Edit opens as a full-screen mobile form. Labels stay beside their fields, Notes has its own section, and Save and Close remain reachable above the phone keyboard."],
  ["Choose an assignment card preset", "Open Assignment Options, then Assignment Card Display. Minimal keeps cards quiet, Deadline Focus emphasizes timing, and Show Everything restores every card detail."],
  ["Fine-tune assignment cards", "Course badges, detail lines, countdowns, checklist progress, and reminder indicators can each be shown or hidden independently after choosing a preset."],
];

const PERSONALIZATION_TIP_CATEGORIES = ["All", "Workspace", "Appearance", "Assignments", "Reminders", "Calendar", "Data & Accounts", "Accessibility"];
function getPersonalizationTipCategory(title) {
  if (/widget|layout|minimize|enlarge/i.test(title)) return "Workspace";
  if (/theme|color|contrast|text size|font|spacing|motion|action layout/i.test(title)) return "Appearance";
  if (/reminder|notification|deadline is too close/i.test(title)) return "Reminders";
  if (/calendar|school-day cycle/i.test(title)) return "Calendar";
  if (/accessibility/i.test(title)) return "Accessibility";
  if (/account|password|welcome|local data|privacy|analytics|version|storage|restore|update|tutorial/i.test(title)) return "Data & Accounts";
  return "Assignments";
}

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
  const [resizeLimit, setResizeLimit] = useState("");
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
    const resizeHandle = event.currentTarget;
    const activePointerId = event.pointerId;
    try { resizeHandle.setPointerCapture?.(activePointerId); } catch { /* Window listeners remain as a fallback. */ }
    const widget = event.currentTarget.closest(".workspace-widget");
    const canvas = widget?.closest(".workspace-widget-canvas");
    widget?.classList.add("is-resizing");
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = Number(instance.width);
    const startHeight = collapsed
      ? Math.max(COLLAPSED_WIDGET_HEIGHT, Number(instance.collapsedHeight) || COLLAPSED_WIDGET_HEIGHT)
      : Number(instance.height);
    const minimumHeight = collapsed ? COLLAPSED_WIDGET_HEIGHT : minimumExpandedHeight;
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
      if (moveEvent.pointerId !== activePointerId) return;
      moveEvent.preventDefault();
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const rawX = widgetX + deltaX;
      const rawY = widgetY + deltaY;
      const desiredX = edges.left ? Math.min(widgetX + startWidth - 190, Math.max(0, rawX)) : widgetX;
      const desiredY = edges.top ? Math.min(widgetY + startHeight - minimumHeight, Math.max(0, rawY)) : widgetY;
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
        height: Math.max(minimumHeight, desiredHeight),
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
      const hitMinimumWidth = (edges.left || edges.right) && desiredWidth <= 190;
      const hitMinimumHeight = (edges.top || edges.bottom) && desiredHeight <= minimumHeight;
      const hitCanvasLeft = edges.left && rawX <= 0;
      const hitCanvasTop = edges.top && rawY <= 0;
      const hitCanvasRight = edges.right && desiredWidth >= maxWidth;
      const blockedByWidget = legal.x !== desired.x || legal.y !== desired.y || legal.width !== desired.width || legal.height !== desired.height;
      setResizeLimit(
        hitMinimumWidth ? "Minimum width reached: the widget controls need 190 px."
          : hitMinimumHeight ? `Minimum height reached: ${collapsed ? "the label controls" : "this widget's content"} need ${minimumHeight} px.`
            : hitCanvasLeft || hitCanvasTop || hitCanvasRight ? "Workspace edge reached: there is no more canvas in this direction."
              : blockedByWidget ? "Resize stopped: another widget is blocking this direction. Move it or resize from another side."
                : "",
      );
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
    const stop = (stopEvent) => {
      if (stopEvent?.pointerId !== undefined && stopEvent.pointerId !== activePointerId) return;
      widget?.classList.remove("is-resizing");
      setResizeLimit("");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      try { if (resizeHandle.hasPointerCapture?.(activePointerId)) resizeHandle.releasePointerCapture(activePointerId); } catch { /* Capture may already be released. */ }
      onResize(nextWidth, nextHeight, canvas?.clientWidth, lastSafe.x, lastSafe.y, { collapsed });
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
    const dragHandle = event.currentTarget;
    const activePointerId = event.pointerId;
    try { dragHandle.setPointerCapture?.(activePointerId); } catch { /* Window listeners remain as a fallback. */ }
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
      if (moveEvent.pointerId !== activePointerId) return;
      moveEvent.preventDefault();
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
    const stop = (stopEvent) => {
      if (stopEvent?.pointerId !== undefined && stopEvent.pointerId !== activePointerId) return;
      widget.classList.remove("is-dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      try { if (dragHandle.hasPointerCapture?.(activePointerId)) dragHandle.releasePointerCapture(activePointerId); } catch { /* Capture may already be released. */ }
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
      className={`workspace-widget${collapsed ? " is-collapsed" : ""}${locked ? " is-locked" : ""}${mobileResize ? " uses-mobile-resize" : ""}${smallWidget ? " is-small-widget" : ""}${displayOnlyWidget ? " is-display-only" : ""}${fixedOverflowWidget ? " has-fixed-overflow" : ""}${instance.type === "recommended" ? " is-recommended-widget" : ""}${instance.type === "course-colors" ? " uses-fluid-course-colors" : ""}`}
      data-widget-id={instance.id}
      data-widget-width={instance.width}
      data-expanded-height={instance.height}
      data-collapsed-height={instance.collapsedHeight || COLLAPSED_WIDGET_HEIGHT}
      style={{ left: `${Math.max(0, Number(instance.x) || 0)}px`, top: `${instance.y || 0}px`, zIndex: instance.zIndex || 1, width: `${instance.width}px`, height: collapsed ? `${Math.max(COLLAPSED_WIDGET_HEIGHT, Number(instance.collapsedHeight) || COLLAPSED_WIDGET_HEIGHT)}px` : `${instance.height}px`, "--widget-content-scale": contentScale }}
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
          {[
                ["top", { top: true }], ["right", { right: true }], ["bottom", { bottom: true }], ["left", { left: true }],
                ["top-left", { top: true, left: true }], ["top-right", { top: true, right: true }],
                ["bottom-right", { bottom: true, right: true }], ["bottom-left", { bottom: true, left: true }],
              ].map(([edge, directions]) => <button key={edge} type="button" className={`widget-resize-edge is-${edge}`} onPointerDown={(event) => resizeStart(event, directions)} aria-label={`Resize ${title} from ${edge}`} />)}
        </div>
      )}
      {resizeLimit && <div className="widget-resize-limit" role="status" aria-live="polite">{resizeLimit}</div>}
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
  const [accountMode, setAccountMode] = useState(() => {
    try { return localStorage.getItem(AUTH_USER_STORAGE_KEY) ? "local" : "signed-out"; }
    catch { return "signed-out"; }
  });
  const [signInName, setSignInName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountEmailVerified, setAccountEmailVerified] = useState(false);
  const [accountDisplayNameDraft, setAccountDisplayNameDraft] = useState("");
  const [accountEmailDraft, setAccountEmailDraft] = useState("");
  const [accountPasswordDraft, setAccountPasswordDraft] = useState("");
  const [accountPasswordConfirm, setAccountPasswordConfirm] = useState("");
  const [showAccountPassword, setShowAccountPassword] = useState(false);
  const [showAccountPasswordConfirm, setShowAccountPasswordConfirm] = useState(false);
  const [accountUpdateStatus, setAccountUpdateStatus] = useState({ type: "", message: "" });
  const [accountUpdateBusy, setAccountUpdateBusy] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPasswordConfirm, setAuthPasswordConfirm] = useState("");
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [showAuthPasswordConfirm, setShowAuthPasswordConfirm] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [welcomeAuthOpen, setWelcomeAuthOpen] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryPasswordConfirm, setRecoveryPasswordConfirm] = useState("");
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);
  const [showRecoveryPasswordConfirm, setShowRecoveryPasswordConfirm] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authInitializing, setAuthInitializing] = useState(CLOUD_SYNC_CONFIGURED);
  const [syncStatus, setSyncStatus] = useState(CLOUD_SYNC_CONFIGURED ? "initializing" : "local-only");
  const [syncError, setSyncError] = useState("");
  const [assignmentSaveError, setAssignmentSaveError] = useState("");
  const [syncConflict, setSyncConflict] = useState(null);
  const [syncConflictOpen, setSyncConflictOpen] = useState(false);
  const [syncRetryNonce, setSyncRetryNonce] = useState(0);
  const cloudRevisionRef = useRef(0);
  const cloudHydratedUserRef = useRef("");
  const cloudSaveTimerRef = useRef(null);
  const cloudSavingRef = useRef(false);
  const cloudSaveQueuedRef = useRef(false);
  const cloudConflictResolutionRef = useRef(false);
  const latestCloudStateRef = useRef(null);
  const cloudLastSavedFingerprintRef = useRef("");
  const intentionalSignOutRef = useRef(false);
  const authPanelRef = useRef(null);
  const authTriggerRef = useRef(null);
  const authSubmitPendingRef = useRef(false);
  const [privacyDialogOpen, setPrivacyDialogOpen] = useState(false);
  const closePrivacyDialog = useCallback(() => setPrivacyDialogOpen(false), []);

  const waitForCloudRequest = async (request, message) => {
    let timeoutId;
    try {
      return await Promise.race([
        request,
        new Promise((_, reject) => { timeoutId = window.setTimeout(() => reject(new Error(message)), 15000); }),
      ]);
    } finally { window.clearTimeout(timeoutId); }
  };

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
  const [draggedCourse, setDraggedCourse] = useState(null);
  const [courseDropTarget, setCourseDropTarget] = useState(null);
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
      if (storedSettings) return { ...DEFAULT_USER_SETTINGS, ...JSON.parse(storedSettings) };
      const midnightNeon = DEFAULT_COLOR_THEME_PRESETS.find((colorTheme) => colorTheme.id === "midnight-neon");
      return { ...DEFAULT_USER_SETTINGS, customColors: midnightNeon?.colors || THEME_COLOR_DEFAULTS.dark };
    } catch (error) {
      console.error("Error reading user settings from localStorage:", error);
      return DEFAULT_USER_SETTINGS;
    }
  });

  useEffect(() => {
    if (!currentUser || accountMode !== "cloud" || !isGamificationTestAccount(accountEmail)) return;
    setUserSettings((previous) => {
      const granted = grantAllGamificationRewards(previous.gamification);
      if (JSON.stringify(granted) === JSON.stringify(normalizeGamification(previous.gamification))) return previous;
      const updated = { ...previous, gamification: granted };
      try { localStorage.setItem(settingsStorageKey, JSON.stringify(updated)); }
      catch (error) { console.error("Failed to save gamification tester rewards:", error); }
      return updated;
    });
  }, [accountEmail, accountMode, currentUser, settingsStorageKey, userSettings.gamification]);

  useEffect(() => {
    if (!currentUser || currentUser === "guest") return;
    const today = getLocalSignInDay();
    setUserSettings((previous) => {
      const signInDays = normalizeSignInDays(previous.signInDays);
      if (signInDays.includes(today)) return previous;
      const updated = { ...previous, signInDays: [...signInDays, today] };
      try { localStorage.setItem(settingsStorageKey, JSON.stringify(updated)); }
      catch (error) { console.error("Failed to record this sign-in day:", error); }
      return updated;
    });
  }, [currentUser, settingsStorageKey, userSettings.signInDays]);

  const [isCustomCourse, setIsCustomCourse] = useState(false);
  const [customCourseName, setCustomCourseName] = useState("");
  const [customCategoryName, setCustomCategoryName] = useState("");
  const [newCourseName, setNewCourseName] = useState("");
  const [guidedCourseCreationOpen, setGuidedCourseCreationOpen] = useState(false);
  const [guidedCourseName, setGuidedCourseName] = useState("");
  const [guidedCourseColor, setGuidedCourseColor] = useState("#3b82f6");
  const [guidedCourseError, setGuidedCourseError] = useState("");

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
  const [attachmentSelectionMessage, setAttachmentSelectionMessage] = useState("");
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
  const [currentTab, setCurrentTab] = useState(() => recoveryRequestedOnLoad() ? "settings" : "dashboard");
  const [feedbackCategory, setFeedbackCategory] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackScreenshot, setFeedbackScreenshot] = useState(null);
  const [feedbackScreenshotPreview, setFeedbackScreenshotPreview] = useState("");
  const [feedbackAllowContact, setFeedbackAllowContact] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState("idle");
  const [feedbackNotice, setFeedbackNotice] = useState("");
  const [quickMatchMinutes, setQuickMatchMinutes] = useState("");
  const [quickMatchSubmittedMinutes, setQuickMatchSubmittedMinutes] = useState(null);
  const [quickMatchPresetDraft, setQuickMatchPresetDraft] = useState("");
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [mobileTaskLevels, setMobileTaskLevels] = useState({});
  const [focusTaskId, setFocusTaskId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendarAddOpen, setCalendarAddOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCourse, setFilterCourse] = useState("ALL");
  const [filterPriority, setFilterPriority] = useState("ALL");
  const [filterCategory, setFilterCategory] = useState("ALL");
  const [filterDueBucket, setFilterDueBucket] = useState("ALL");
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const activeDialogRef = useRef(null);
  const dialogTriggerRef = useRef(null);
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
  const [bulkImportSource, setBulkImportSource] = useState("Pasted assignment list");
  const [bulkImportSaving, setBulkImportSaving] = useState(false);
  const [bulkImportHelpOpen, setBulkImportHelpOpen] = useState(false);
  const [guidedEntryOpen, setGuidedEntryOpen] = useState(false);
  const [guidedEntryStep, setGuidedEntryStep] = useState(0);
  const [guidedNotes, setGuidedNotes] = useState("");
  const [syllabusCourse, setSyllabusCourse] = useState("");
  const [syllabusFileName, setSyllabusFileName] = useState("");
  const [syllabusImportStatus, setSyllabusImportStatus] = useState("idle");
  const [syllabusExtractedText, setSyllabusExtractedText] = useState("");
  const syllabusAbortRef = useRef(null);
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
  const [gamificationOpen, setGamificationOpen] = useState(false);

  useEffect(() => {
    if (!completionCelebration) return undefined;
    const timeoutId = window.setTimeout(() => setCompletionCelebration(null), userSettings.reduceMotion ? 3100 : 7100);
    return () => window.clearTimeout(timeoutId);
  }, [completionCelebration, userSettings.reduceMotion]);

  const [settingsSection, setSettingsSection] = useState(() => recoveryRequestedOnLoad() ? "storage" : "personalization");
  const [accessibilityAudit, setAccessibilityAudit] = useState(null);
  const [manualAccessibilityChecks, setManualAccessibilityChecks] = useState([]);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialPracticeOpen, setTutorialPracticeOpen] = useState(false);
  const [tutorialPracticeDone, setTutorialPracticeDone] = useState([]);
  const [tutorialPracticeNote, setTutorialPracticeNote] = useState("");
  const [tutorialPracticeDate, setTutorialPracticeDate] = useState(17);
  const [tutorialPracticeHomeStep, setTutorialPracticeHomeStep] = useState(0);
  const [tutorialPracticeHiddenWidget, setTutorialPracticeHiddenWidget] = useState("");
  const [tutorialPracticeWidgetMenu, setTutorialPracticeWidgetMenu] = useState("");
  const [tutorialExploredSteps, setTutorialExploredSteps] = useState([]);
  const [tutorialGateMessage, setTutorialGateMessage] = useState("");
  const [tutorialWidgetLayout, setTutorialWidgetLayout] = useState({
    plan: { x: 25, y: 70, width: 330, height: 135 },
    calendar: { x: 430, y: 110, width: 285, height: 135 },
    checklists: { x: 205, y: 235, width: 280, height: 120 },
  });
  const tutorialRef = useRef(null);
  const [storageView, setStorageView] = useState(null);
  const [deletedAssignmentUndo, setDeletedAssignmentUndo] = useState(null);
  const [recoveryStatus, setRecoveryStatus] = useState({ type: "", message: "" });
  const [browserStorage, setBrowserStorage] = useState({ supported: null, usage: 0, quota: 0, error: "" });
  const [cloudHistory, setCloudHistory] = useState([]);
  const [cloudHistoryBusy, setCloudHistoryBusy] = useState(false);
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
  const [helpCategory, setHelpCategory] = useState("All");
  const [isMobileUi, setIsMobileUi] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const mobileSettingsScrollRef = useRef(null);
  const mobileSettingsListScrollRef = useRef(null);
  const [mobileSummaryCategory, setMobileSummaryCategory] = useState("");
  const [mobileReturnTab, setMobileReturnTab] = useState("dashboard");
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
  // Prefer the saved selection, then use Midnight Neon for a new device.
  const [theme, setTheme] = useState(() => {
    try {
      const storedTheme = localStorage.getItem("theme");
      return storedTheme ? storedTheme : "dark";
    } catch (error) {
      console.error("Error reading theme from localStorage:", error);
      return "dark";
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
  const categoryChoices = [...new Set([
    ...TASK_CATEGORIES,
    ...(Array.isArray(userSettings.customCategories) ? userSettings.customCategories : []),
    ...tasks.map((task) => getTaskCategory(task)),
  ].filter(Boolean))];
  const safeDisplayName = resolveProfileDisplayName(displayName, currentUser, accountEmail.split("@")[0]) || "GlowDocket user";

  useEffect(() => {
    if (!CLOUD_SYNC_CONFIGURED) return undefined;
    let mounted = true;
    let authListener;
    const initializationTimer = window.setTimeout(() => {
      if (!mounted) return;
      setAuthInitializing(false);
      setSyncStatus("local-only");
      setAuthError("GlowDocket couldn’t reach the sign-in service. Check your connection and try again.");
    }, 15000);
    const restoreSession = async () => {
      const client = await getSupabaseBrowserClient();
      if (!mounted) return;
      client.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      window.clearTimeout(initializationTimer);
      const user = data.session?.user;
      if (user) {
        setCurrentUser(user.id);
        setAccountMode("cloud");
        setDisplayName(user.user_metadata?.display_name || user.email?.split("@")[0] || "");
        setAccountEmail(user.email || "");
        setAccountEmailVerified(Boolean(user.email_confirmed_at));
        setAccountEmailDraft(user.email || "");
        setAccountDisplayNameDraft(user.user_metadata?.display_name || user.email?.split("@")[0] || "");
      }
      setAuthInitializing(false);
      if (!user) setSyncStatus("local-only");
    }).catch((error) => {
      window.clearTimeout(initializationTimer);
      console.error("Session restoration failed:", error);
      if (mounted) { setAuthInitializing(false); setSyncStatus("local-only"); setAuthError(friendlyAccountError(error, { offline: !navigator.onLine })); }
      });
      const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY") {
        setAuthMode("recovery");
        setAuthError("");
        setAuthNotice("Your recovery link is ready. Choose a new password below.");
        setAuthInitializing(false);
      }
      const user = session?.user;
      if (event === "SIGNED_OUT") {
        const wasIntentional = intentionalSignOutRef.current;
        intentionalSignOutRef.current = false;
        setCurrentUser("");
        setAccountMode("signed-out");
        setSyncStatus("local-only");
        if (!wasIntentional) setAuthError("Your sign-in expired. Sign in again to reconnect your saved planner.");
        return;
      }
      if (user) {
        setCurrentUser(user.id);
        setAccountMode("cloud");
        setDisplayName(user.user_metadata?.display_name || user.email?.split("@")[0] || "");
        setAccountEmail(user.email || "");
        setAccountEmailVerified(Boolean(user.email_confirmed_at));
        setAccountEmailDraft(user.email || "");
        setAccountDisplayNameDraft(user.user_metadata?.display_name || user.email?.split("@")[0] || "");
      }
      });
      authListener = listener;
    };
    restoreSession().catch((error) => {
      window.clearTimeout(initializationTimer);
      console.error("Sign-in service loading failed:", error);
      if (mounted) { setAuthInitializing(false); setSyncStatus("local-only"); setAuthError(friendlyAccountError(error, { offline: !navigator.onLine })); }
    });
    return () => { mounted = false; window.clearTimeout(initializationTimer); authListener?.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!CLOUD_SYNC_CONFIGURED) return;
    const url = new URL(window.location.href);
    const recoveryError = url.searchParams.get("error_description") || new URLSearchParams(url.hash.replace(/^#/, "")).get("error_description");
    if (recoveryError) {
      setAuthMode("forgot");
      setAuthError("That recovery link is no longer valid. Request a fresh one below.");
      window.history.replaceState({}, document.title, url.pathname);
    }
  }, []);

  useEffect(() => {
    if (accountMode !== "local" || !currentUser) return;
    const preferredName = localStorage.getItem(`taskacadia_preferred_name_${currentUser}`)?.trim() || currentUser;
    setDisplayName(preferredName);
    setAccountDisplayNameDraft(preferredName);
  }, [accountMode, currentUser]);

  useEffect(() => {
    if (!CLOUD_SYNC_CONFIGURED || accountMode !== "cloud" || !currentUser) return undefined;
    let cancelled = false;
    setSyncStatus("cloud-loading");
    setSyncError("");
    const hydrate = async () => {
      let cloudRequestAttempted = false;
      try {
        const client = await getSupabaseBrowserClient();
        const local = loadLocalSnapshot(localStorage, currentUser) || readLegacySnapshot(localStorage, currentUser, DEFAULT_USER_SETTINGS);
        const localMeta = loadLocalMeta(localStorage, currentUser);
        const ensured = await ensureCloudSnapshot(client, currentUser, local, {
          onRequest: () => { cloudRequestAttempted = true; },
        });
        const cloud = ensured.snapshot;
        if (cancelled) return;
        let selected = local;
        let revision = cloud.revision;
        if (!ensured.created) {
          revision = cloud.revision;
          const hydrationChoice = chooseHydrationState(local, localMeta, cloud);
          if (hydrationChoice.conflict) {
            saveLocalBackup(localStorage, currentUser, local);
            setSyncConflict({ local, cloud: cloud.state, cloudRevision: cloud.revision });
            setSyncConflictOpen(true);
            setSyncStatus("conflict");
            return;
          }
          selected = {
            ...hydrationChoice.state,
            workspaceLayout: local?.workspaceLayout || {},
          };
        }
        const localDeviceSettings = JSON.parse(localStorage.getItem(`settings_${currentUser}`) || "{}");
        applyCloudStateToLocal(localStorage, currentUser, selected, {
          externalPushEnabled: Boolean(localDeviceSettings.externalPushEnabled),
          notificationsEnabled: Boolean(localDeviceSettings.notificationsEnabled),
          activeColorThemeId: localDeviceSettings.activeColorThemeId || localStorage.getItem("theme") || getSystemPreference(),
          customColors: localDeviceSettings.customColors || {},
        });
        saveLocalSnapshot(localStorage, currentUser, selected, revision, false);
        cloudRevisionRef.current = revision;
        cloudHydratedUserRef.current = currentUser;
        cloudLastSavedFingerprintRef.current = getCloudStateFingerprint(selected);
        setTasks(selected.tasks);
        setCourses(selected.courses);
        setCourseColors(selected.courseColors);
        setUserSettings((settings) => ({ ...DEFAULT_USER_SETTINGS, ...selected.userSettings, externalPushEnabled: settings.externalPushEnabled, notificationsEnabled: settings.notificationsEnabled, activeColorThemeId: settings.activeColorThemeId, customColors: settings.customColors }));
        setChecklists(selected.checklists);
        const repairedWorkspace = repairLoadedWorkspace(selected.workspaceLayout);
        workspaceLayoutRef.current = repairedWorkspace;
        setWorkspaceLayout(repairedWorkspace);
        setDisplayName((existingName) => resolveProfileDisplayName(selected.displayName, currentUser, existingName));
        setSyncStatus("saved");
      } catch (error) {
        if (cancelled) return;
        console.error("Cloud loading failed:", error);
        setSyncError(friendlyCloudSaveError({ offline: !navigator.onLine }));
        setSyncStatus(!navigator.onLine ? "offline" : cloudRequestAttempted ? "failed" : "initializing");
      }
    };
    void hydrate();
    return () => { cancelled = true; };
  }, [currentUser, accountMode, syncRetryNonce]);

  useEffect(() => {
    if (!CLOUD_SYNC_CONFIGURED || accountMode !== "cloud" || !currentUser || cloudHydratedUserRef.current !== currentUser || syncConflict || cloudConflictResolutionRef.current) return undefined;
    const snapshot = collectSyncableState({ tasks, courses, courseColors, userSettings, checklists, workspaceLayout, theme, displayName });
    latestCloudStateRef.current = snapshot;
    if (getCloudStateFingerprint(snapshot) === cloudLastSavedFingerprintRef.current) {
      saveLocalSnapshot(localStorage, currentUser, snapshot, cloudRevisionRef.current, false);
      setSyncStatus("saved");
      return undefined;
    }
    saveLocalSnapshot(localStorage, currentUser, snapshot, cloudRevisionRef.current, true);
    if (!navigator.onLine) { setSyncStatus("offline"); return undefined; }
    setSyncStatus("saving");
    window.clearTimeout(cloudSaveTimerRef.current);
    const flush = async () => {
      if (cloudSavingRef.current) { cloudSaveQueuedRef.current = true; return; }
      cloudSavingRef.current = true;
      let savedSuccessfully = false;
      try {
        const stateToSave = latestCloudStateRef.current;
        const result = await waitForCloudRequest(
          replaceCloudSnapshot(await getSupabaseBrowserClient(), currentUser, stateToSave, cloudRevisionRef.current),
          "Cloud saving took too long. Your changes are still safe on this device.",
        );
        if (cloudHydratedUserRef.current !== currentUser) return;
        cloudRevisionRef.current = Number(result.revision);
        cloudLastSavedFingerprintRef.current = getCloudStateFingerprint(stateToSave);
        saveLocalSnapshot(localStorage, currentUser, stateToSave, result.revision, false);
        setSyncStatus("saved");
        setSyncError("");
        savedSuccessfully = true;
      } catch (error) {
        if (error.code === "revision_conflict") {
          cloudSaveQueuedRef.current = false;
          const newest = await loadCloudSnapshot(await getSupabaseBrowserClient(), currentUser).catch(() => null);
          saveLocalBackup(localStorage, currentUser, latestCloudStateRef.current);
          setSyncConflict({ local: latestCloudStateRef.current, cloud: newest?.state, cloudRevision: newest?.revision || cloudRevisionRef.current });
          setSyncConflictOpen(true);
          setSyncStatus("conflict");
        } else {
          cloudSaveQueuedRef.current = false;
          console.error("Cloud saving failed:", error);
          setSyncError(friendlyCloudSaveError({ offline: !navigator.onLine }));
          setSyncStatus(navigator.onLine ? "failed" : "offline");
        }
      } finally {
        cloudSavingRef.current = false;
        if (savedSuccessfully && cloudSaveQueuedRef.current) { cloudSaveQueuedRef.current = false; void flush(); }
      }
    };
    cloudSaveTimerRef.current = window.setTimeout(flush, 750);
    return () => window.clearTimeout(cloudSaveTimerRef.current);
  }, [tasks, courses, courseColors, userSettings, checklists, workspaceLayout, theme, displayName, currentUser, accountMode, syncConflict, syncRetryNonce]);

  useEffect(() => {
    if (!CLOUD_SYNC_CONFIGURED) return undefined;
    const handleOnline = () => { if (accountMode === "cloud" && currentUser && ["offline", "failed"].includes(syncStatus)) { setSyncStatus("reconnecting"); window.setTimeout(() => setSyncRetryNonce((value) => value + 1), 250); } };
    const handleOffline = () => { if (accountMode === "cloud" && currentUser) { setSyncError(friendlyCloudSaveError({ offline: true })); setSyncStatus("offline"); } };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => { window.removeEventListener("online", handleOnline); window.removeEventListener("offline", handleOffline); };
  }, [currentUser, accountMode, syncStatus]);

  const retryCloudSync = () => {
    setSyncError("");
    setSyncStatus("reconnecting");
    setSyncRetryNonce((value) => value + 1);
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

    return `📅 Due: ${dateLabel} at ${timeLabel} | ⏱️ Est: ${task.estimatedMinutes || 0} mins | ⚠️ Priority: ${task.priority}${repeatLabel}`;
  };

  const handleAddCustomCategory = () => {
    const nextCategory = customCategoryName.trim();
    if (!nextCategory) return;
    const existingCategory = categoryChoices.find((item) => item.toLowerCase() === nextCategory.toLowerCase());
    const savedCategory = existingCategory || nextCategory;
    if (!existingCategory) {
      setUserSettings((settings) => ({
        ...settings,
        customCategories: [...(Array.isArray(settings.customCategories) ? settings.customCategories : []), savedCategory],
      }));
    }
    setCategory(savedCategory);
    setCustomCategoryName("");
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
    activeColors = getSafeColorThemeColors(activeColors);
    Object.entries(activeColors).forEach(([key, value]) => {
      if (!/^#[0-9a-f]{6}$/i.test(value)) return;
      (COLOR_CSS_VARIABLES[key] || []).forEach((variable) => {
        rootStyle.setProperty(variable, value);
      });
    });
    const appBarColor = normalizeHexColor(activeColors.page || "") || THEME_COLOR_DEFAULTS[theme].page;
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
      catch (error) { setExternalPushStatus("cleanup_pending"); setExternalPushDiagnostics((details) => ({ ...details, scheduling: "cleanup_pending", lastError: String(error?.message || error) })); setExternalPushMessage("GlowDocket will retry when you’re back online."); }
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
    if (CLOUD_SYNC_CONFIGURED) {
      const timer = window.setTimeout(() => setAuthError("Sign in to the same GlowDocket account to open this reminder."), 0);
      return () => window.clearTimeout(timer);
    }
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
          preferredName: displayName,
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
  }, [currentUser, displayName, tasks, userSettings.externalPushEnabled, userSettings.reminderMinutes, externalPushSubscriptionVersion]);

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
          icon: "/glowdocket-icon-192.png",
          tag: `taskacadia-${currentUser}-${task.id}`,
        };
        try {
          if (navigator.serviceWorker?.controller) {
            const registration = await navigator.serviceWorker.ready;
            await registration.showNotification(displayName ? `${displayName}, ${task.title}` : `GlowDocket: ${task.title}`, options);
          } else {
            new Notification(displayName ? `${displayName}, ${task.title}` : `GlowDocket: ${task.title}`, options);
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
  }, [currentUser, displayName, tasks, userSettings.notificationsEnabled, userSettings.reminderMinutes, externalPushStatus]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setChecklistNow(new Date()), 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!currentUser) return undefined;
    const removeExpiredTrash = () => {
      const expired = tasks.filter((task) => isTrashExpired(task));
      if (expired.length === 0) return;
      const remaining = tasks.filter((task) => !isTrashExpired(task));
      expired.flatMap((task) => getSafeAttachments(task)).forEach((attachment) => {
        const stillReferenced = remaining.some((task) => getSafeAttachments(task).some((item) => item.id === attachment.id));
        if (!stillReferenced) deleteAttachmentFile(attachment.id).catch((error) => console.error("Failed to auto-delete expired Trash attachment:", error));
      });
      setTasks(remaining);
      try {
        localStorage.setItem(currentStorageKey, JSON.stringify(remaining));
      } catch (error) {
        console.error("Failed to save automatic Trash cleanup:", error);
      }
    };
    removeExpiredTrash();
    const intervalId = window.setInterval(removeExpiredTrash, 60 * 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [currentStorageKey, currentUser, tasks]);

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
          const options = { body: `${list.title || "Checklist"} · due ${deadline.toLocaleString()}`, icon: "/glowdocket-icon-192.png", tag: `taskcabinet-checklist-${item.id}` };
          try {
            if (navigator.serviceWorker?.controller) {
              const registration = await navigator.serviceWorker.ready;
              await registration.showNotification(displayName ? `${displayName}, ${item.text}` : `GlowDocket: ${item.text}`, options);
            } else {
              new Notification(displayName ? `${displayName}, ${item.text}` : `GlowDocket: ${item.text}`, options);
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
  }, [checklists, currentUser, displayName, userSettings.notificationsEnabled, userSettings.reminderMinutes]);

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
    preferredName: displayName,
  });
  const getExternalReminderForTask = (task) => buildDesiredReminders([task], {
    leadMinutes: Number(userSettings.reminderMinutes || 60),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    getDeadline: getEffectiveDeadline,
    preferredName: displayName,
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
          setExternalPushMessage(cleanup.confirmed === false ? "GlowDocket will retry when you’re back online." : "Push reminders were turned off and cleared.");
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
    await externalPushActionGuardRef.current.run(async () => { try { const result = await sendExternalReminderTest(currentUser, displayName); setExternalPushStatus(result.status); setExternalPushDiagnostics((details) => clearReminderFailure(details, { providerConnected: true, serverEnrolled: true })); setExternalPushMessage(result.status === "active" ? "Test sent" : "Some reminders could not be updated."); if (result.status === "active") { setTestReminderSent(true); window.setTimeout(() => { setTestReminderSent(false); setExternalPushMessage((message) => message === "Test sent" ? "Reminders are up to date." : message); }, 3000); } } catch (error) { setExternalPushStatus("failed"); setExternalPushDiagnostics((details) => ({ ...details, lastError: String(error?.message || error) })); setExternalPushMessage(friendlyReminderError(error, !navigator.onLine)); } });
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
      setAttachmentSelectionMessage("");
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

  const handleAssignmentCardPreset = (preset) => {
    const presets = {
      minimal: { showTaskCourseBadge: false, showTaskDetailLine: false, showTaskCountdown: false, showTaskChecklistProgress: false, showTaskReminderIndicator: false },
      deadline: { showTaskCourseBadge: true, showTaskDetailLine: true, showTaskCountdown: true, showTaskChecklistProgress: false, showTaskReminderIndicator: true },
      detailed: { showTaskCourseBadge: true, showTaskDetailLine: true, showTaskCountdown: true, showTaskChecklistProgress: true, showTaskReminderIndicator: true },
    };
    const selected = presets[preset];
    if (!selected) return;
    setUserSettings((previous) => {
      const updated = { ...previous, ...selected };
      try {
        localStorage.setItem(settingsStorageKey, JSON.stringify(updated));
      } catch (error) {
        console.error("Failed to save assignment card preset:", error);
      }
      return updated;
    });
  };

  const handleRunAccessibilityAudit = () => {
    setAccessibilityAudit(runAccessibilityAudit(document));
  };

  const handleManualAccessibilityCheck = (checkId, isChecked) => {
    const updated = isChecked
      ? [...new Set([...manualAccessibilityChecks, checkId])]
      : manualAccessibilityChecks.filter((id) => id !== checkId);
    setManualAccessibilityChecks(updated);
    if (currentUser) localStorage.setItem(`taskcabinet_accessibility_checklist_${currentUser}`, JSON.stringify(updated));
  };

  const handleResetAccessibilityChecks = () => {
    setManualAccessibilityChecks([]);
    setAccessibilityAudit(null);
    if (currentUser) localStorage.removeItem(`taskcabinet_accessibility_checklist_${currentUser}`);
  };

  const handleResetPreferences = () => {
    const confirmed = window.confirm(
      "Reset appearance, assignment, calendar, reminder, and school-cycle preferences? Your assignments and courses will not be deleted.",
    );
    if (!confirmed) return;
    const resetTheme = "dark";
    const midnightNeon = DEFAULT_COLOR_THEME_PRESETS.find((colorTheme) => colorTheme.id === "midnight-neon");

    const resetSettings = {
      ...DEFAULT_USER_SETTINGS,
      signInDays: normalizeSignInDays(userSettings.signInDays),
      activeColorThemeId: "midnight-neon",
      cycleDayNames: [...DEFAULT_USER_SETTINGS.cycleDayNames],
      courseCycleDays: {},
      customColors: midnightNeon?.colors || THEME_COLOR_DEFAULTS.dark,
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
    const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
    const loadedTasks = readStoredSection(localStorage, currentStorageKey, [], Array.isArray);
    const loadedCourses = readStoredSection(localStorage, courseStorageKey, ["Other"], (value) => Array.isArray(value) && value.every((course) => typeof course === "string"));
    const loadedCourseColors = readStoredSection(localStorage, courseColorsStorageKey, {}, isObject);
    const storedSettings = readStoredSection(localStorage, settingsStorageKey, {}, isObject);
    const midnightNeon = DEFAULT_COLOR_THEME_PRESETS.find((colorTheme) => colorTheme.id === "midnight-neon");
    const loadedSettings = Object.keys(storedSettings).length > 0
      ? { ...DEFAULT_USER_SETTINGS, ...storedSettings }
      : { ...DEFAULT_USER_SETTINGS, customColors: midnightNeon?.colors || THEME_COLOR_DEFAULTS.dark };
    const loadedChecklists = readStoredSection(localStorage, checklistStorageKey, [], Array.isArray);
    const storedWorkspace = readStoredSection(localStorage, workspaceStorageKey, null, (value) => value === null || isObject(value));
    const loadedWorkspace = repairLoadedWorkspace(storedWorkspace);

    setTasks(loadedTasks);
    setCourses(loadedCourses);
    setCourseColors(loadedCourseColors);
    setUserSettings(loadedSettings);
    setChecklists(loadedChecklists);
    workspaceLayoutRef.current = loadedWorkspace;
    setWorkspaceLayout(loadedWorkspace);
    setSelectedChecklistId(null);
    setCategory(loadedSettings.defaultCategory);
    setPriority(loadedSettings.defaultPriority);
    setEstTime(String(loadedSettings.defaultEstimatedMinutes || ""));
    setRepeatFrequency(loadedSettings.defaultRepeat);
    setDueHour(loadedSettings.defaultDueTime);
    setDueAmPm(loadedSettings.defaultDueAmPm);

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
    let cancelled = false;
    readBrowserStorageEstimate()
      .then((estimate) => { if (!cancelled) setBrowserStorage({ ...estimate, error: "" }); })
      .catch(() => { if (!cancelled) setBrowserStorage({ supported: true, usage: 0, quota: 0, error: "Storage details are temporarily unavailable." }); });
    return () => { cancelled = true; };
  }, [currentUser, tasks]);

  useEffect(() => {
    setAccessibilityAudit(null);
    if (!currentUser) {
      setManualAccessibilityChecks([]);
      return;
    }
    try {
      const stored = JSON.parse(localStorage.getItem(`taskcabinet_accessibility_checklist_${currentUser}`) || "[]");
      const validIds = new Set(MANUAL_ACCESSIBILITY_CHECKS.map((item) => item.id));
      setManualAccessibilityChecks(Array.isArray(stored) ? stored.filter((id) => validIds.has(id)) : []);
    } catch {
      setManualAccessibilityChecks([]);
    }
  }, [currentUser]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const handleMobileUiChange = (event) => setIsMobileUi(event.matches);
    setIsMobileUi(query.matches);
    query.addEventListener?.("change", handleMobileUiChange);
    return () => query.removeEventListener?.("change", handleMobileUiChange);
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(RECOVERY_SESSION_KEY) !== "1") return;
      sessionStorage.removeItem(RECOVERY_SESSION_KEY);
      setCurrentTab("settings");
      setSettingsSection("storage");
      setStorageView(null);
      setMobileMoreOpen(false);
      setMobileSettingsOpen(true);
    } catch {
      // Recovery routing is optional; normal app loading remains available.
    }
  }, []);

  useEffect(() => {
    if (!isMobileUi || !window.visualViewport) return undefined;
    const viewport = window.visualViewport;
    let stableMobileHeight = window.innerHeight;
    const updateMobileViewport = () => {
      const fieldHasFocus = document.activeElement?.matches?.("input, textarea, select");
      const keyboardIsOpen = fieldHasFocus && viewport.height < stableMobileHeight * 0.82;
      document.documentElement.style.setProperty("--taskcabinet-visible-mobile-height", `${viewport.height}px`);
      if (!keyboardIsOpen) {
        stableMobileHeight = viewport.height;
        document.documentElement.style.setProperty("--taskcabinet-mobile-height", `${stableMobileHeight}px`);
      }
    };
    updateMobileViewport();
    viewport.addEventListener("resize", updateMobileViewport);
    viewport.addEventListener("scroll", updateMobileViewport);
    return () => {
      viewport.removeEventListener("resize", updateMobileViewport);
      viewport.removeEventListener("scroll", updateMobileViewport);
      document.documentElement.style.removeProperty("--taskcabinet-mobile-height");
      document.documentElement.style.removeProperty("--taskcabinet-visible-mobile-height");
    };
  }, [isMobileUi]);

  useEffect(() => {
    const mobileShellActive = Boolean(isMobileUi && currentUser);
    document.documentElement.classList.toggle("taskcabinet-mobile-active", mobileShellActive);
    document.body.classList.toggle("taskcabinet-mobile-active", mobileShellActive);
    return () => {
      document.documentElement.classList.remove("taskcabinet-mobile-active");
      document.body.classList.remove("taskcabinet-mobile-active");
    };
  }, [currentUser, isMobileUi]);

  useEffect(() => {
    if (isMobileUi || !["mobile-add", "mobile-tools", "mobile-courses"].includes(currentTab)) return;
    setCurrentTab("dashboard");
  }, [currentTab, isMobileUi]);

  useEffect(() => {
    if (!isMobileUi || currentTab !== "mobile-add") return;
    const frameId = window.requestAnimationFrame(() => {
      document.querySelector(".mobile-add-fullscreen")?.scrollTo({ top: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [currentTab, isMobileUi]);

  useLayoutEffect(() => {
    if (!isMobileUi || !mobileSettingsOpen) return undefined;
    const scrollBody = mobileSettingsScrollRef.current;
    if (!scrollBody) return undefined;
    scrollBody.scrollTop = 0;
    const frameId = window.requestAnimationFrame(() => {
      scrollBody.scrollTo({ top: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isMobileUi, mobileSettingsOpen, settingsSection, storageView]);

  useLayoutEffect(() => {
    if (!isMobileUi || mobileSettingsOpen || currentTab !== "settings" || mobileSettingsListScrollRef.current === null) return undefined;
    const appShell = document.querySelector(".mobile-app-ui .app-shell");
    if (!appShell) return undefined;
    const targetTop = mobileSettingsListScrollRef.current;
    const frameId = window.requestAnimationFrame(() => {
      appShell.scrollTo({ top: targetTop, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [currentTab, isMobileUi, mobileSettingsOpen]);

  useEffect(() => {
    const handleMobileHistory = () => {
      setMobileSettingsOpen(false);
      setMobileSummaryCategory("");
      setSelectedChecklistId(null);
    };
    window.addEventListener("popstate", handleMobileHistory);
    return () => window.removeEventListener("popstate", handleMobileHistory);
  }, []);

  useEffect(() => {
    if (!isMobileUi || (!mobileMoreOpen && !mobileSummaryCategory && !selectedChecklistId && currentTab !== "mobile-add")) return undefined;
    const scrollY = window.scrollY;
    const previousBodyStyles = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      Object.assign(document.body.style, previousBodyStyles);
      window.scrollTo(0, scrollY);
    };
  }, [currentTab, isMobileUi, mobileMoreOpen, mobileSummaryCategory, selectedChecklistId]);

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

  const resetTutorialExperience = () => {
    setTutorialStep(0);
    setTutorialPracticeOpen(false);
    setTutorialPracticeDone([]);
    setTutorialPracticeNote("");
    setTutorialPracticeDate(17);
    setTutorialPracticeHomeStep(0);
    setTutorialPracticeHiddenWidget("");
    setTutorialPracticeWidgetMenu("");
    setTutorialExploredSteps([]);
    setTutorialGateMessage("");
    setTutorialWidgetLayout({ plan: { x: 25, y: 70, width: 330, height: 135 }, calendar: { x: 430, y: 110, width: 285, height: 135 }, checklists: { x: 205, y: 235, width: 280, height: 120 } });
  };

  const handleCelebrationColorChange = (key, value) => {
    setUserSettings((previous) => {
      const currentStyleColors = getCelebrationColorsForStyle(previous.celebrationColors, gamification.selectedConfetti);
      const nestedColors = CELEBRATION_COLOR_FIELDS.some((field) => previous.celebrationColors?.[field.key]) ? {} : (previous.celebrationColors || {});
      const updated = { ...previous, celebrationColors: { ...nestedColors, [gamification.selectedConfetti]: { ...currentStyleColors, [key]: value } } };
      try { localStorage.setItem(settingsStorageKey, JSON.stringify(updated)); }
      catch (error) { console.error("Failed to save celebration colors:", error); }
      return updated;
    });
  };

  const finishTutorial = () => {
    localStorage.setItem(getTutorialStorageKey(currentUser), JSON.stringify({ complete: true }));
    resetTutorialExperience();
    setTutorialOpen(false);
  };

  const replayTutorial = () => {
    resetTutorialExperience();
    setTutorialOpen(true);
  };

  const openTutorialPractice = () => {
    setTutorialPracticeDone([]);
    setTutorialPracticeNote("");
    setTutorialPracticeDate(17);
    setTutorialPracticeHomeStep(tutorialStep);
    setTutorialPracticeHiddenWidget("");
    setTutorialPracticeWidgetMenu("");
    setTutorialWidgetLayout({ plan: { x: 25, y: 70, width: 330, height: 135 }, calendar: { x: 430, y: 110, width: 285, height: 135 }, checklists: { x: 205, y: 235, width: 280, height: 120 } });
    setTutorialGateMessage("");
    setTutorialPracticeOpen(true);
  };

  const closeTutorialPractice = () => {
    if (tutorialStep !== tutorialPracticeHomeStep) {
      setTutorialStep(tutorialPracticeHomeStep);
      return;
    }
    setTutorialExploredSteps((steps) => steps.includes(tutorialPracticeHomeStep) ? steps : [...steps, tutorialPracticeHomeStep]);
    setTutorialGateMessage("");
    setTutorialPracticeOpen(false);
  };

  const advanceTutorial = () => {
    if (tutorialStep > 0 && !tutorialExploredSteps.includes(tutorialStep)) {
      setTutorialGateMessage("Explore this feature before continuing so you can try it safely without changing your real assignments.");
      return;
    }
    setTutorialGateMessage("");
    setTutorialStep((step) => step + 1);
  };

  const completeTutorial = () => {
    if (tutorialStep > 0 && !tutorialExploredSteps.includes(tutorialStep)) {
      setTutorialGateMessage("Explore this feature before finishing so you can try it safely without changing your real assignments.");
      return;
    }
    finishTutorial();
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

  const handleFileSelection = async (fileList, setter, currentFiles = []) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    let estimate = browserStorage;
    try {
      estimate = await readBrowserStorageEstimate();
      setBrowserStorage({ ...estimate, error: "" });
    } catch {
      // Per-file and per-assignment limits still protect the selection.
    }
    const result = evaluateAttachmentSelection(currentFiles, files, estimate);
    const reasons = [...new Set(result.rejected.map((item) => item.reason))];
    if (result.projectedStatus.level === "warning") reasons.push(`Browser storage will be about ${result.projectedStatus.percent}% full after these files are saved.`);
    const message = reasons.join(" ");
    setAttachmentSelectionMessage(message || `${result.accepted.length} file${result.accepted.length === 1 ? "" : "s"} ready to attach.`);
    if (result.accepted.length > 0) setter((prev) => [...prev, ...result.accepted]);
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
      const updatedCourses = [...courses, finalCourse];
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
      alert(friendlyAttachmentStorageError(error));
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
      notes: guidedNotes.trim(),
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
    setAttachmentSelectionMessage("");
    setOptionalLinksOpen(false);
    setOptionalFilesOpen(false);
    setOptionalChecklistOpen(false);
    setGuidedEntryOpen(false);
    setGuidedEntryStep(0);
    setGuidedNotes("");

    if (currentTab === "calendar") {
      setCalendarAddOpen(false);
    } else if (currentTab === "mobile-add") {
      setCurrentTab(mobileReturnTab || "dashboard");
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
      setAssignmentSaveError("");
    } catch (error) {
      console.error("Failed to save tasks to localStorage:", error);
      setAssignmentSaveError("We couldn’t save that assignment on this device. Keep this page open, free some browser storage, and try again.");
    }
  };

  const saveCoursesForCurrentUser = (updatedCourses) => {
    try {
      localStorage.setItem(courseStorageKey, JSON.stringify(updatedCourses));
    } catch (error) {
      console.error("Failed to save courses to localStorage:", error);
    }
  };

  const createCourse = (courseName, color = "") => {
    const trimmedCourseName = courseName.trim();
    if (!trimmedCourseName) return { ok: false, message: "Enter a course name." };

    const courseAlreadyExists = courses.some(
      (course) => course.toLowerCase() === trimmedCourseName.toLowerCase(),
    );

    if (courseAlreadyExists) {
      return { ok: false, message: `"${trimmedCourseName}" is already in your course list.` };
    }

    const updatedCourses = [...courses, trimmedCourseName];
    setCourses(updatedCourses);
    saveCoursesForCurrentUser(updatedCourses);
    if (color) handleCourseColorChange(trimmedCourseName, color);
    return { ok: true, course: trimmedCourseName };
  };

  const handleAddCourse = (event) => {
    event.preventDefault();
    const result = createCourse(newCourseName);
    if (!result.ok) {
      alert(result.message);
      return;
    }
    setNewCourseName("");
  };

  const handleGuidedCourseCreate = () => {
    const result = createCourse(guidedCourseName, guidedCourseColor);
    if (!result.ok) {
      setGuidedCourseError(result.message);
      return;
    }
    setSelectedCourse(result.course);
    setGuidedCourseName("");
    setGuidedCourseError("");
    setGuidedCourseCreationOpen(false);
  };

  const saveCourseOrder = (updatedCourses) => {
    setCourses(updatedCourses);
    saveCoursesForCurrentUser(updatedCourses);
  };

  const handleCourseDrop = (targetCourse, position) => {
    if (!draggedCourse || draggedCourse === targetCourse) {
      setDraggedCourse(null);
      setCourseDropTarget(null);
      return;
    }
    const reorderedCourses = courses.filter((course) => course !== draggedCourse);
    const targetIndex = reorderedCourses.indexOf(targetCourse);
    reorderedCourses.splice(targetIndex + (position === "after" ? 1 : 0), 0, draggedCourse);
    saveCourseOrder(reorderedCourses);
    setDraggedCourse(null);
    setCourseDropTarget(null);
  };

  const handleCourseMove = (course, direction) => {
    const reorderedCourses = [...courses];
    const currentIndex = reorderedCourses.indexOf(course);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= reorderedCourses.length) return;
    [reorderedCourses[currentIndex], reorderedCourses[nextIndex]] = [reorderedCourses[nextIndex], reorderedCourses[currentIndex]];
    saveCourseOrder(reorderedCourses);
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
      const requestedCategory = String(assignment.category || "").trim();
      const parsedCategory = requestedCategory || userSettings.defaultCategory || "School";
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
        const warning = `${title} was added without its ${dueYear} due date because GlowDocket currently stores month and day only.`;
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
      const updatedCourses = [...new Set([...courses, ...trulyNewCourses])];
      setCourses(updatedCourses);
      saveCoursesForCurrentUser(updatedCourses);
    }
    return createdTasks.length;
  };

  const parseBulkImportText = (value, forcedCourse = "") => {
    setBulkImportMessage("");
    setBulkImportIssuesOnly(false);
    const prepared = parsePastedAssignmentRows(value, courses);
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
      return [{
        ...assignment,
        ...Object.fromEntries(Object.entries(entry).filter(([key, fieldValue]) => !["text", "courseHint"].includes(key) && fieldValue !== null && fieldValue !== "")),
        course: forcedCourse || courseHint || assignment.course,
        assumptions: [...(assignment.assumptions || []), ...(entry.importWarnings || [])],
        previewId: `${index}-${crypto.randomUUID()}`,
        selected: true,
      }];
    });
    setBulkImportPreview(parsed);
    setBulkImportMessage(parsed.length > 0 ? `Review ${parsed.length} assignment${parsed.length === 1 ? "" : "s"} before adding them.` : "No assignment lines could be understood. Put one assignment on each line.");
    return parsed;
  };

  const handleParseBulkImport = () => { setBulkImportSource("Pasted assignment list"); parseBulkImportText(bulkImportText); };

  const handleSyllabusFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBulkImportOpen(true);
    setBulkImportPreview([]);
    setBulkImportMessage("");
    setSyllabusFileName(file.name);
    setBulkImportSource(file.name);
    setSyllabusImportStatus("reading");
    const controller = new AbortController();
    syllabusAbortRef.current = controller;
    try {
      const { extractSyllabusText, findLikelySyllabusAssignments } = await import("./syllabusImport.js");
      const extractedText = await extractSyllabusText(file, {
        signal: controller.signal,
        onProgress: ({ message }) => setBulkImportMessage(message),
      });
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
    } finally {
      if (syllabusAbortRef.current === controller) syllabusAbortRef.current = null;
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
      [...(Array.isArray(item.assumptions) ? item.assumptions : []), ...(Array.isArray(item.importWarnings) ? item.importWarnings : [])]
        .filter(Boolean)
        .map((warning) => String(warning)),
    );
    if (!item.dueMonth || !item.dueDay) warnings.add("Missing due date. Add month and day before importing if this should appear on the calendar.");
    if (Number(item.dueYear) && Number(item.dueYear) !== currentYear) warnings.add(`${item.dueYear} date will be skipped until GlowDocket supports full-year dates.`);
    if (!item.title?.trim()) warnings.add("Missing assignment name.");
    if (!item.course || item.course === "Other") warnings.add("Missing course. Choose or create one before importing.");
    if (!item.estimatedMinutes) warnings.add("No estimate yet. Recommendations work better with minutes.");
    return [...warnings];
  };

  const handleBulkImportSubmit = () => {
    if (bulkImportSaving) return;
    const selected = bulkImportPreview.filter((item) => item.selected && String(item.title || "").trim());
    if (selected.length === 0) {
      setBulkImportMessage("Select at least one assignment with a title.");
      return;
    }
    setBulkImportSaving(true);
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
    } finally {
      setBulkImportSaving(false);
    }
  };

  const handleBulkImportCourseCreate = (previewId) => {
    const item = bulkImportPreview.find((candidate) => candidate.previewId === previewId);
    const requested = window.prompt("New course name", item?.course === "Other" ? "" : item?.course || "");
    if (requested === null) return;
    const normalized = normalizeCourseName(requested);
    const existing = findMatchingCourse(normalized, courses);
    if (existing) { handleBulkPreviewChange(previewId, "course", existing); return; }
    const result = createCourse(normalized);
    if (!result.ok) { setBulkImportMessage(result.message); return; }
    handleBulkPreviewChange(previewId, "course", result.course);
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
  const completeTaskList = (taskList, id, completedAt = new Date().toISOString()) => {
    const taskToComplete = taskList.find((task) => task.id === id);

    if (!taskToComplete) return taskList;

    const completedTasks = taskList.map((task) => {
      if (task.id !== id) return task;

      const subtasks = getSafeSubtasks(task);

      return {
        ...task,
        isCompleted: true,
        status: "completed",
        completedAt,
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
    if (isMobileUi) {
      setMobileTaskLevels((levels) => ({ ...levels, [id]: nextMobileTaskLevel(levels[id]) }));
      return;
    }
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
  const getCelebrationOrigin = (element) => {
    const bounds = element?.getBoundingClientRect?.();
    return bounds ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 } : null;
  };

  const handleComplete = (id, context = {}) => {
    const completedTask = tasks.find((task) => task.id === id);
    if (!completedTask || completedTask.isCompleted) return;
    const completedAt = new Date().toISOString();
    const taskListWithFocusTime = context.source === "focus" && Number(context.elapsedSeconds) > 0
      ? tasks.map((task) => task.id === id ? { ...task, ...getFocusTimeUpdate(task, context.elapsedSeconds, context.reduceEstimate) } : task)
      : tasks;
    const updated = completeTaskList(taskListWithFocusTime, id, completedAt);
    const deadline = getEffectiveDeadline(completedTask);
    const source = context.source || "direct";
    const gamification = normalizeGamification(userSettings.gamification);
    const newAchievementIds = getNewAchievementIds(updated, gamification, { priority: completedTask.priority, estimatedMinutes: completedTask.estimatedMinutes, wasOverdue: Boolean(deadline && deadline < new Date(completedAt)), completedEarly: Boolean(deadline && deadline.getTime() - new Date(completedAt).getTime() >= 86400000), source }, { now: new Date(completedAt), weekStartsOn: userSettings.calendarWeekStartsOn });
    const nextGamification = { ...gamification, earnedAchievementIds: [...new Set([...gamification.earnedAchievementIds, ...newAchievementIds])] };
    handleAddFieldSettingChange("gamification", nextGamification);
    completionCelebrationSequenceRef.current += 1;
    const selectedStyleColors = getCelebrationColorsForStyle(userSettings.celebrationColors, nextGamification.selectedConfetti);
    if (nextGamification.selectedConfetti !== "none") setCompletionCelebration({ id: `${id}-${completionCelebrationSequenceRef.current}`, title: completedTask.title, achievementIds: newAchievementIds, confetti: nextGamification.selectedConfetti, courseColor: getCourseColor(getTaskCourseOrCategory(completedTask)), celebrationOrigin: context.celebrationOrigin || null, celebrationColors: celebrationStudioProgress.unlocked && Object.keys(selectedStyleColors).length ? selectedStyleColors : null });
    setTasks(updated);
    saveTasksForCurrentUser(updated);
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

  const handleFocusStart = (id) => {
    const task = tasks.find((item) => item.id === id && !item.isCompleted && !item.isDeleted);
    if (!task) return;
    if (getTaskStatus(task) === "todo") handleStartTask(id);
    setFocusTaskId(id);
  };

  const saveFocusSession = (id, elapsedSeconds, reduceEstimate) => {
    if (elapsedSeconds <= 0) return;
    setTasks((prev) => {
      const updated = prev.map((task) => task.id === id
        ? { ...task, ...getFocusTimeUpdate(task, elapsedSeconds, reduceEstimate) }
        : task);
      saveTasksForCurrentUser(updated);
      return updated;
    });
  };

  const closeFocusSession = (elapsedSeconds, reduceEstimate) => {
    if (focusTaskId) saveFocusSession(focusTaskId, elapsedSeconds, reduceEstimate);
    setFocusTaskId(null);
  };

  const keepFocusTaskInProgress = (elapsedSeconds, reduceEstimate) => {
    closeFocusSession(elapsedSeconds, reduceEstimate);
  };

  const completeFocusTask = (elapsedSeconds, reduceEstimate, celebrationOrigin) => {
    const id = focusTaskId;
    if (!id) return;
    setFocusTaskId(null);
    handleComplete(id, { source: "focus", elapsedSeconds, reduceEstimate, celebrationOrigin });
  };

  const toggleFocusSubtask = (subtaskId, elapsedSeconds, reduceEstimate) => {
    const task = tasks.find((item) => item.id === focusTaskId);
    const updatedSteps = getSafeSubtasks(task).map((step) => step.id === subtaskId
      ? { ...step, isDone: !step.isDone }
      : step);
    if (userSettings.autoCompleteChecklist && updatedSteps.length > 0 && updatedSteps.every((step) => step.isDone)) {
      saveFocusSession(focusTaskId, elapsedSeconds, reduceEstimate);
      setFocusTaskId(null);
    }
    handleSubtaskToggle(focusTaskId, subtaskId);
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
    let shouldCompleteTask = false;
    const taskListWithToggledStep = tasks.map((task) => {
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
    if (willCompleteTask && shouldCompleteTask) {
      const completedAt = new Date().toISOString();
      const updated = completeTaskList(taskListWithToggledStep, taskId, completedAt);
      const deadline = getEffectiveDeadline(currentTask);
      const gamification = normalizeGamification(userSettings.gamification);
      const newAchievementIds = getNewAchievementIds(updated, gamification, { priority: currentTask.priority, estimatedMinutes: currentTask.estimatedMinutes, wasOverdue: Boolean(deadline && deadline < new Date(completedAt)), completedEarly: Boolean(deadline && deadline.getTime() - new Date(completedAt).getTime() >= 86400000), source: "related-tasks" }, { now: new Date(completedAt), weekStartsOn: userSettings.calendarWeekStartsOn });
      const nextGamification = { ...gamification, earnedAchievementIds: [...new Set([...gamification.earnedAchievementIds, ...newAchievementIds])] };
      handleAddFieldSettingChange("gamification", nextGamification);
      completionCelebrationSequenceRef.current += 1;
      const selectedStyleColors = getCelebrationColorsForStyle(userSettings.celebrationColors, nextGamification.selectedConfetti);
      if (nextGamification.selectedConfetti !== "none") setCompletionCelebration({ id: `${taskId}-${completionCelebrationSequenceRef.current}`, title: currentTask.title, achievementIds: newAchievementIds, confetti: nextGamification.selectedConfetti, courseColor: getCourseColor(getTaskCourseOrCategory(currentTask)), celebrationColors: celebrationStudioProgress.unlocked && Object.keys(selectedStyleColors).length ? selectedStyleColors : null });
      setTasks(updated);
      saveTasksForCurrentUser(updated);
    } else {
      setTasks(taskListWithToggledStep);
      saveTasksForCurrentUser(taskListWithToggledStep);
    }
  };

  // Undo restores the assignment to In Progress; all other information is kept.
  const handleUndo = (id) => {
    setTasks((prev) => {
      const updated = prev.map((t) =>
        t.id === id ? { ...t, isCompleted: false, status: "inProgress", completedAt: null } : t,
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
    if (userSettings.confirmBeforeTrash !== false) {
      const taskToDelete = tasks.find((task) => task.id === id);
      const confirmed = window.confirm(
        `Move "${taskToDelete?.title || "this assignment"}" to Trash?`,
      );
      if (!confirmed) return;
    }

    const deletedAt = new Date().toISOString();
    setDeletedAssignmentUndo({ id, title: taskBeingDeleted?.title || "Assignment" });

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
    dialogTriggerRef.current = document.activeElement;
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
    setAttachmentSelectionMessage("");
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
      alert(friendlyAttachmentStorageError(error));
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
    setAttachmentSelectionMessage("");
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
    setAttachmentSelectionMessage("");
    setRemovedEditAttachmentIds([]);
    setEditOptionalSections({ files: false, links: false, checklist: false });
  };

  const startTutorialForProfile = (profileKey) => {
    try {
      if (!shouldStartTutorialForProfile(localStorage, profileKey)) return;
      localStorage.setItem(getTutorialStorageKey(profileKey), JSON.stringify({ complete: false }));
    } catch {
      // Tutorial persistence is optional and must never turn a successful sign-in into an error.
      return;
    }
    setTutorialStep(0);
    setTutorialPracticeOpen(false);
    setTutorialOpen(true);
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    if (authSubmitPendingRef.current) return;
    const trimmedName = signInName.trim();
    const normalizedName = trimmedName.toLowerCase();
    setAuthError("");

    if (!trimmedName || !authPassword) {
      setAuthError(CLOUD_SYNC_CONFIGURED ? "Enter both an email and password." : "Enter both a username and password.");
      return;
    }
    if (authMode === "signup" && authPassword !== authPasswordConfirm) {
      setAuthError("The password confirmation does not match.");
      return;
    }

    authSubmitPendingRef.current = true;
    setAuthBusy(true);
    try {
      if (CLOUD_SYNC_CONFIGURED) {
        const client = await getSupabaseBrowserClient();
        if (authMode === "signin") {
          const { data, error } = await client.auth.signInWithPassword({ email: trimmedName, password: authPassword });
          if (error) throw error;
          setCurrentUser(data.user.id);
          setAccountMode("cloud");
          setDisplayName(data.user.user_metadata?.display_name || data.user.email?.split("@")[0] || "");
          startTutorialForProfile(data.user.id);
        } else {
          if (!displayName.trim()) { setAuthError("Enter a display name."); return; }
          const { data, error } = await client.auth.signUp({ email: trimmedName, password: authPassword, options: { data: { display_name: displayName.trim() } } });
          if (error) throw error;
          if (data.user) {
            localStorage.setItem(getTutorialStorageKey(data.user.id), JSON.stringify({ complete: false }));
            const legacyProfileKey = findLegacyProfileKey(displayName.trim());
            const legacy = readLegacySnapshot(localStorage, legacyProfileKey, DEFAULT_USER_SETTINGS);
            if (legacy && hasMeaningfulState(legacy) && !loadLocalSnapshot(localStorage, data.user.id)) {
              const migrated = { ...legacy, displayName: displayName.trim() };
              applyCloudStateToLocal(localStorage, data.user.id, migrated);
              saveLocalSnapshot(localStorage, data.user.id, migrated, 0, true);
            }
          }
          if (!data.session) {
            setAuthNotice("Your account is ready for verification. Check your email, confirm the account, then come back and sign in.");
            setAuthMode("signin");
            return;
          }
          setCurrentUser(data.user.id);
          setAccountMode("cloud");
          startTutorialForProfile(data.user.id);
        }
        setSignInName("");
        setAuthPassword("");
        setAuthPasswordConfirm("");
        setCurrentTab("dashboard");
        return;
      }
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
        setAccountMode("local");
        startTutorialForProfile(existingAccount.profileKey);
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
        setCurrentUser(profileKey);
        setAccountMode("local");
        startTutorialForProfile(profileKey);
      }

      setSignInName("");
      setAuthPassword("");
      setAuthPasswordConfirm("");
      setCurrentTab("dashboard");
    } catch (error) {
      console.error("Account error:", error);
      setAuthError(CLOUD_SYNC_CONFIGURED ? friendlyAccountError(error, { offline: !navigator.onLine }) : "This browser could not save or verify the local account.");
    } finally {
      authSubmitPendingRef.current = false;
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setMobileMoreOpen(false);
    setMobileSettingsOpen(false);
    setMobileSummaryCategory("");
    setSelectedChecklistId(null);
    setCalendarAddOpen(false);
    if (currentUser && userSettings.externalPushEnabled) await cancelAllExternalReminders(currentUser);
    if (CLOUD_SYNC_CONFIGURED) { intentionalSignOutRef.current = true; await (await getSupabaseBrowserClient()).auth.signOut(); }
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    cloudHydratedUserRef.current = "";
    cloudRevisionRef.current = 0;
    cloudLastSavedFingerprintRef.current = "";
    setSyncConflict(null);
    setSyncConflictOpen(false);
    setAccountEmail("");
    setAccountEmailVerified(false);
    setCurrentUser("");
    setAccountMode("signed-out");
    setCurrentTab("dashboard");
  };

  const applyResolvedCloudState = (state, revision) => {
    const deviceSettings = { externalPushEnabled: userSettings.externalPushEnabled, notificationsEnabled: userSettings.notificationsEnabled, activeColorThemeId: userSettings.activeColorThemeId, customColors: userSettings.customColors };
    const deviceState = { ...state, workspaceLayout };
    applyCloudStateToLocal(localStorage, currentUser, deviceState, deviceSettings);
    saveLocalSnapshot(localStorage, currentUser, deviceState, revision, false);
    cloudRevisionRef.current = revision;
    cloudLastSavedFingerprintRef.current = getCloudStateFingerprint(deviceState);
    setTasks(deviceState.tasks);
    setCourses(deviceState.courses);
    setCourseColors(deviceState.courseColors);
    setUserSettings({ ...DEFAULT_USER_SETTINGS, ...deviceState.userSettings, ...deviceSettings });
    setChecklists(deviceState.checklists);
    setDisplayName(resolveProfileDisplayName(deviceState.displayName, currentUser, displayName));
  };

  const handleKeepCloudConflict = () => {
    if (!syncConflict?.cloud) return;
    saveLocalBackup(localStorage, currentUser, syncConflict.local);
    applyResolvedCloudState(syncConflict.cloud, syncConflict.cloudRevision);
    setSyncConflict(null);
    setSyncConflictOpen(false);
    setSyncStatus("saved");
  };

  const handleUseDeviceConflict = async () => {
    if (!syncConflict?.local) return;
    const localChoice = syncConflict.local;
    const expectedRevision = syncConflict.cloudRevision;
    saveLocalBackup(localStorage, currentUser, syncConflict.cloud);
    window.clearTimeout(cloudSaveTimerRef.current);
    cloudSaveQueuedRef.current = false;
    cloudConflictResolutionRef.current = true;
    cloudSavingRef.current = true;
    latestCloudStateRef.current = localChoice;
    cloudRevisionRef.current = expectedRevision;
    saveLocalSnapshot(localStorage, currentUser, localChoice, expectedRevision, true);
    setSyncConflict(null);
    setSyncConflictOpen(false);
    setSyncStatus("saving");
    setSyncError("");
    try {
      const result = await waitForCloudRequest(
        replaceCloudSnapshot(await getSupabaseBrowserClient(), currentUser, localChoice, expectedRevision),
        "Cloud saving took too long. Your changes are still safe on this device.",
      );
      cloudRevisionRef.current = Number(result.revision);
      cloudLastSavedFingerprintRef.current = getCloudStateFingerprint(localChoice);
      saveLocalSnapshot(localStorage, currentUser, localChoice, result.revision, false);
      setSyncStatus("saved");
    } catch (error) {
      if (error.code === "revision_conflict") {
        const newest = await loadCloudSnapshot(await getSupabaseBrowserClient(), currentUser).catch(() => null);
        setSyncConflict({ local: localChoice, cloud: newest?.state, cloudRevision: newest?.revision || expectedRevision });
        setSyncConflictOpen(true);
        setSyncStatus("conflict");
      } else {
        setSyncError(error.message || "Cloud save failed.");
        setSyncStatus(navigator.onLine ? "failed" : "offline");
      }
    } finally {
      cloudSavingRef.current = false;
      cloudSaveQueuedRef.current = false;
      cloudConflictResolutionRef.current = false;
    }
  };

  const showWelcomeAuth = (mode = "signup") => {
    if (!welcomeAuthOpen) authTriggerRef.current = document.activeElement;
    setWelcomeAuthOpen(true);
    setAuthMode(mode);
    setAuthError("");
    setAuthNotice("");
    window.requestAnimationFrame(() => {
      window.setTimeout(() => document.getElementById(mode === "recovery" ? "recovery-password" : "auth-username")?.focus(), 120);
    });
  };

  const closeWelcomeAuth = useCallback(() => {
    setWelcomeAuthOpen(false);
    setAuthError("");
    setAuthNotice("");
    window.requestAnimationFrame(() => authTriggerRef.current?.focus?.());
  }, []);

  useEffect(() => {
    if (!welcomeAuthOpen && authMode !== "recovery") return undefined;
    const panel = authPanelRef.current;
    if (!panel) return undefined;
    const handleAuthPanelKeyDown = (event) => {
      if (event.key === "Escape" && authMode !== "recovery" && !authBusy) {
        event.preventDefault();
        closeWelcomeAuth();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [...panel.querySelectorAll('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleAuthPanelKeyDown);
    return () => document.removeEventListener("keydown", handleAuthPanelKeyDown);
  }, [welcomeAuthOpen, authMode, authBusy, closeWelcomeAuth]);

  const handleForgotPassword = async (event) => {
    event.preventDefault();
    const email = signInName.trim().toLowerCase();
    setAuthError("");
    setAuthNotice("");
    if (!email || !email.includes("@")) { setAuthError("Enter the email you use for GlowDocket."); return; }
    if (!navigator.onLine) { setAuthError("You appear to be offline. Reconnect, then send the recovery email again."); return; }
    setAuthBusy(true);
    try {
      const { error } = await (await getSupabaseBrowserClient()).auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/` });
      if (error) throw error;
      setAuthNotice("If that email has a GlowDocket account, a password reset link is on its way. You can safely try again if it does not arrive.");
    } catch (error) {
      console.error("Recovery email failed:", error);
      setAuthError(friendlyAccountError(error, { offline: !navigator.onLine, action: "recovery" }));
    } finally { setAuthBusy(false); }
  };

  const handleRecoveryPassword = async (event) => {
    event.preventDefault();
    setAuthError("");
    setAuthNotice("");
    if (!passwordsMatch(recoveryPassword, recoveryPasswordConfirm)) { setAuthError(recoveryPassword ? "Those passwords do not match yet." : "Enter and confirm your new password."); return; }
    setAuthBusy(true);
    try {
      const { error } = await (await getSupabaseBrowserClient()).auth.updateUser({ password: recoveryPassword });
      if (error) throw error;
      setRecoveryPassword("");
      setRecoveryPasswordConfirm("");
      setShowRecoveryPassword(false);
      setShowRecoveryPasswordConfirm(false);
      setAuthMode("signin");
      setAuthNotice("Your password is updated. Welcome back!");
    } catch (error) {
      console.error("Password recovery failed:", error);
      setAuthError(friendlyAccountError(error, { offline: !navigator.onLine, action: "recovery" }));
    } finally { setAuthBusy(false); }
  };

  const handleAccountDisplayNameUpdate = async (event) => {
    event.preventDefault();
    const nextName = accountDisplayNameDraft.trim();
    if (!nextName) { setAccountUpdateStatus({ type: "error", message: "Enter a preferred name." }); return; }
    if (nextName.length > 60) { setAccountUpdateStatus({ type: "error", message: "Keep your preferred name to 60 characters or fewer." }); return; }
    setAccountUpdateBusy("display-name");
    setAccountUpdateStatus({ type: "", message: "" });
    try {
      if (CLOUD_SYNC_CONFIGURED && accountMode === "cloud") {
        const { error } = await (await getSupabaseBrowserClient()).auth.updateUser({ data: { display_name: nextName } });
        if (error) throw error;
      } else {
        localStorage.setItem(`taskacadia_preferred_name_${currentUser}`, nextName);
      }
      setDisplayName(nextName);
      setAccountUpdateStatus({ type: "success", message: "Preferred name updated. Friendly greetings and newly synced reminders will use it." });
    } catch (error) {
      console.error("Preferred-name update failed:", error);
      setAccountUpdateStatus({ type: "error", message: friendlyAccountError(error, { offline: !navigator.onLine, action: "save" }) });
    } finally { setAccountUpdateBusy(""); }
  };

  const handleLocalAccountUpgrade = async (event) => {
    event.preventDefault();
    const email = accountEmailDraft.trim().toLowerCase();
    const nextName = accountDisplayNameDraft.trim();
    if (!nextName) { setAccountUpdateStatus({ type: "error", message: "Enter a display name." }); return; }
    if (!email) { setAccountUpdateStatus({ type: "error", message: "Enter an email address." }); return; }
    if (!passwordsMatch(accountPasswordDraft, accountPasswordConfirm)) { setAccountUpdateStatus({ type: "error", message: accountPasswordDraft ? "The password confirmation does not match." : "Enter and confirm a password." }); return; }
    setAccountUpdateBusy("upgrade");
    setAccountUpdateStatus({ type: "", message: "" });
    try {
      const snapshot = collectSyncableState({ tasks, courses, courseColors, userSettings, checklists, workspaceLayout, theme, displayName: nextName });
      const { data, error } = await (await getSupabaseBrowserClient()).auth.signUp({ email, password: accountPasswordDraft, options: { data: { display_name: nextName } } });
      if (error) throw error;
      if (!data.user) throw new Error("Account creation did not finish.");
      applyCloudStateToLocal(localStorage, data.user.id, snapshot, { externalPushEnabled: false, notificationsEnabled: false });
      saveLocalSnapshot(localStorage, data.user.id, snapshot, 0, true);
      setAccountPasswordDraft("");
      setAccountPasswordConfirm("");
      setShowAccountPassword(false);
      setShowAccountPasswordConfirm(false);
      if (data.session) {
        localStorage.removeItem(AUTH_USER_STORAGE_KEY);
        setDisplayName(nextName);
        setAccountEmail(data.user.email || email);
        setCurrentUser(data.user.id);
        setAccountMode("cloud");
        setAccountUpdateStatus({ type: "success", message: "Email added. Your account can now sync across devices." });
      } else {
        setAccountUpdateStatus({ type: "success", message: "Your local data is safely prepared. Confirm the email, then sign in with it to finish enabling cross-device sync." });
      }
    } catch (error) {
      console.error("Account upgrade failed:", error);
      setAccountUpdateStatus({ type: "error", message: friendlyAccountError(error, { offline: !navigator.onLine, action: "save" }) });
    } finally { setAccountUpdateBusy(""); }
  };

  const handleAccountEmailUpdate = async (event) => {
    event.preventDefault();
    const nextEmail = accountEmailDraft.trim().toLowerCase();
    if (!nextEmail || nextEmail === accountEmail.toLowerCase()) { setAccountUpdateStatus({ type: "error", message: "Enter a different valid email address." }); return; }
    setAccountUpdateBusy("email");
    setAccountUpdateStatus({ type: "", message: "" });
    try {
      const { data, error } = await (await getSupabaseBrowserClient()).auth.updateUser({ email: nextEmail });
      if (error) throw error;
      setAccountEmail(data.user?.email || accountEmail);
      setAccountUpdateStatus({ type: "success", message: "Check your email to confirm the address change. Your current email remains active until confirmation is complete." });
    } catch (error) {
      console.error("Email update failed:", error);
      setAccountUpdateStatus({ type: "error", message: friendlyAccountError(error, { offline: !navigator.onLine, action: "save" }) });
    } finally { setAccountUpdateBusy(""); }
  };

  const handleAccountPasswordUpdate = async (event) => {
    event.preventDefault();
    if (!passwordsMatch(accountPasswordDraft, accountPasswordConfirm)) { setAccountUpdateStatus({ type: "error", message: accountPasswordDraft ? "The new password confirmation does not match." : "Enter and confirm your new password." }); return; }
    setAccountUpdateBusy("password");
    setAccountUpdateStatus({ type: "", message: "" });
    try {
      const { error } = await (await getSupabaseBrowserClient()).auth.updateUser({ password: accountPasswordDraft });
      if (error) throw error;
      setAccountPasswordDraft("");
      setAccountPasswordConfirm("");
      setShowAccountPassword(false);
      setShowAccountPasswordConfirm(false);
      setAccountUpdateStatus({ type: "success", message: "Password updated." });
    } catch (error) {
      console.error("Password update failed:", error);
      setAccountUpdateStatus({ type: "error", message: friendlyAccountError(error, { offline: !navigator.onLine, action: "save" }) });
    } finally { setAccountUpdateBusy(""); }
  };

  useEffect(() => {
    if (!editingTaskId && !copyingTask) return undefined;
    const dialog = activeDialogRef.current;
    const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    window.requestAnimationFrame(() => {
      const initialFocus = dialog?.querySelector("[data-dialog-initial-focus]:not([disabled])") || dialog?.querySelector(focusableSelector) || dialog;
      initialFocus?.focus();
    });
    const handleDialogKeys = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (copyingTask) setCopyingTask(null);
        else {
          setEditingTaskId(null);
          setEditingTask(null);
          setEditSubtaskText("");
          setEditLinkName("");
          setEditLinkUrl("");
          setEditLinkMessage("");
          setPendingEditFiles([]);
          setRemovedEditAttachmentIds([]);
          setEditOptionalSections({ files: false, links: false, checklist: false });
        }
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const controls = [...dialog.querySelectorAll(focusableSelector)].filter((control) => control.getClientRects().length > 0);
      if (controls.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleDialogKeys);
    return () => {
      document.removeEventListener("keydown", handleDialogKeys);
      window.requestAnimationFrame(() => dialogTriggerRef.current?.focus?.());
    };
  }, [copyingTask, editingTaskId]);

  const handleUndoDeletedAssignment = () => {
    if (!deletedAssignmentUndo) return;
    handleRestoreDeleted(deletedAssignmentUndo.id);
    setDeletedAssignmentUndo(null);
  };

  const handleResendVerification = async () => {
    setAccountUpdateBusy("verification");
    setAccountUpdateStatus({ type: "", message: "" });
    try {
      const { error } = await (await getSupabaseBrowserClient()).auth.resend({
        type: "signup",
        email: accountEmail,
        options: { emailRedirectTo: `${window.location.origin}/` },
      });
      if (error) throw error;
      setAccountUpdateStatus({ type: "success", message: "Verification email sent. Open the link in that email, then return to GlowDocket." });
    } catch (error) {
      console.error("Verification email failed:", error);
      setAccountUpdateStatus({ type: "error", message: friendlyAccountError(error, { offline: !navigator.onLine }) });
    } finally { setAccountUpdateBusy(""); }
  };

  const handleSignOutAllDevices = async () => {
    setAccountUpdateBusy("sign-out-all");
    setAccountUpdateStatus({ type: "", message: "" });
    try {
      intentionalSignOutRef.current = true;
      const { error } = await (await getSupabaseBrowserClient()).auth.signOut({ scope: "global" });
      if (error) throw error;
      localStorage.removeItem(AUTH_USER_STORAGE_KEY);
      setCurrentUser("");
      setAccountMode("signed-out");
      setCurrentTab("dashboard");
    } catch (error) {
      intentionalSignOutRef.current = false;
      console.error("Global sign-out failed:", error);
      setAccountUpdateStatus({ type: "error", message: friendlyAccountError(error, { offline: !navigator.onLine }) });
    } finally { setAccountUpdateBusy(""); }
  };

  const handleDeleteAccount = async () => {
    const confirmation = window.prompt("This permanently deletes your GlowDocket cloud account and all cloud-synced assignments, checklists, courses, settings, and workspace layouts. It also erases this account's cached planner data from this browser. This cannot be undone.\n\nType DELETE to continue.");
    if (confirmation !== "DELETE") {
      if (confirmation !== null) setAccountUpdateStatus({ type: "error", message: "Account deletion cancelled. Type DELETE exactly to confirm." });
      return;
    }
    setAccountUpdateBusy("delete-account");
    intentionalSignOutRef.current = true;
    setAccountUpdateStatus({ type: "", message: "" });
    try {
      if (userSettings.externalPushEnabled) {
        const reminderResult = await cancelAllExternalReminders(currentUser);
        if (reminderResult.status === "cleanup_pending") throw new Error("Scheduled reminders could not be fully removed yet. Repair reminder sync, then retry account deletion.");
      }
      const { data: sessionData } = await (await getSupabaseBrowserClient()).auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Your session expired. Sign in again before deleting your account.");
      const response = await fetch("/api/account/delete", { method: "POST", headers: { authorization: `Bearer ${token}` } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "GlowDocket could not delete the account.");
      const deletedTaskAttachments = tasks.flatMap((task) => getSafeAttachments(task).map((attachment) => attachment.id));
      await Promise.allSettled(deletedTaskAttachments.map((id) => deleteAttachmentFile(id)));
      removeCloudAccountLocalData(localStorage, currentUser);
      localStorage.removeItem(AUTH_USER_STORAGE_KEY);
      await (await getSupabaseBrowserClient()).auth.signOut({ scope: "local" }).catch(() => {});
      setCurrentUser("");
      setAccountMode("signed-out");
      setCurrentTab("dashboard");
      setAuthNotice("Your account and cloud planner data were permanently deleted.");
    } catch (error) {
      intentionalSignOutRef.current = false;
      console.error("Account deletion failed:", error);
      setAccountUpdateStatus({ type: "error", message: "We couldn’t delete your account right now. Nothing was erased from this browser. Check your connection and try again." });
    } finally { setAccountUpdateBusy(""); }
  };

  const getCurrentPortableState = () => collectSyncableState({ tasks, courses, courseColors, userSettings, checklists, workspaceLayout, theme, displayName });
  const downloadTextFile = (name, text, type) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const exportFileDate = () => new Date().toISOString().slice(0, 10);

  const handleExportJson = () => {
    downloadTextFile(`glowdocket-backup-${exportFileDate()}.json`, JSON.stringify(createPortableExport(getCurrentPortableState()), null, 2), "application/json");
    setRecoveryStatus({ type: "success", message: "Complete JSON backup downloaded. Keep it somewhere safe; this file can restore your planner." });
  };

  const handleExportCsv = () => {
    downloadTextFile(`glowdocket-assignments-${exportFileDate()}.csv`, createAssignmentsCsv(tasks, { getStatus: getTaskStatus }), "text/csv;charset=utf-8");
    setRecoveryStatus({ type: "success", message: "Google Sheets-compatible assignment CSV downloaded. Use the JSON backup—not CSV—to restore GlowDocket." });
  };

  const applyRecoveryState = (state) => {
    const deviceSettings = { externalPushEnabled: userSettings.externalPushEnabled, notificationsEnabled: userSettings.notificationsEnabled, activeColorThemeId: userSettings.activeColorThemeId, customColors: userSettings.customColors };
    saveLocalBackup(localStorage, currentUser, getCurrentPortableState());
    applyCloudStateToLocal(localStorage, currentUser, state, deviceSettings);
    setTasks(state.tasks);
    setCourses(state.courses);
    setCourseColors(state.courseColors);
    setUserSettings({ ...DEFAULT_USER_SETTINGS, ...state.userSettings, ...deviceSettings });
    setChecklists(state.checklists);
    setWorkspaceLayout(repairLoadedWorkspace(state.workspaceLayout));
    setDisplayName(resolveProfileDisplayName(state.displayName, currentUser, displayName));
  };

  const handleImportBackup = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const state = parsePortableExport(JSON.parse(await file.text()));
      if (!window.confirm(`Restore the GlowDocket backup from this file? Your current planner will be backed up in this browser first, then replaced. The imported version contains ${state.tasks.length} assignment${state.tasks.length === 1 ? "" : "s"}.`)) return;
      applyRecoveryState(state);
      setRecoveryStatus({ type: "success", message: "Backup restored. GlowDocket saved your previous version locally in case you need it." });
    } catch (error) {
      setRecoveryStatus({ type: "error", message: error.message || "GlowDocket could not read that backup." });
    }
  };

  const handleRestoreLocalBackup = () => {
    setRecoveryStatus({ type: "", message: "" });
    try {
      const backup = loadLatestLocalBackup(localStorage, currentUser);
      if (!backup) {
        setRecoveryStatus({ type: "error", message: "No previous local version is available for this profile yet." });
        return;
      }
      const savedLabel = backup.savedAt ? new Date(backup.savedAt).toLocaleString() : "an earlier time";
      if (!window.confirm(`Restore the local version saved ${savedLabel}? GlowDocket will first save your current planner as another recovery copy.`)) return;
      applyRecoveryState(backup.state);
      setRecoveryStatus({ type: "success", message: "Previous local version restored. Your newer version was also saved locally in case you need it again." });
    } catch (error) {
      setRecoveryStatus({ type: "error", message: error.message || "GlowDocket could not restore the previous local version safely." });
    }
  };

  const handleRefreshStorageEstimate = async () => {
    setBrowserStorage((current) => ({ ...current, error: "" }));
    try {
      setBrowserStorage({ ...(await readBrowserStorageEstimate()), error: "" });
    } catch {
      setBrowserStorage({ supported: true, usage: 0, quota: 0, error: "Storage details are temporarily unavailable." });
    }
  };

  const handleLoadCloudHistory = async () => {
    setCloudHistoryBusy(true);
    setRecoveryStatus({ type: "", message: "" });
    try {
      setCloudHistory(await loadCloudHistory(await getSupabaseBrowserClient(), currentUser));
    } catch (error) {
      console.error("Backup history loading failed:", error);
      setRecoveryStatus({ type: "error", message: "Earlier versions aren’t available right now. Your current planner is still safe." });
    } finally { setCloudHistoryBusy(false); }
  };

  const handleRestoreCloudHistory = (entry) => {
    if (!window.confirm(`Restore the cloud backup saved ${new Date(entry.created_at).toLocaleString()}? Your current planner will be preserved as another recoverable version.`)) return;
    applyRecoveryState(entry.state);
    setRecoveryStatus({ type: "success", message: "Earlier cloud version restored. It will sync as the newest version without bypassing conflict protection." });
    setCloudHistory([]);
  };

  const handleFeedbackScreenshotChange = (event) => {
    const file = event.target.files?.[0] || null;
    const validation = validateFeedbackScreenshot(file);
    if (!validation.valid) {
      event.target.value = "";
      setFeedbackStatus("error");
      setFeedbackNotice(validation.error);
      return;
    }
    if (feedbackScreenshotPreview) URL.revokeObjectURL(feedbackScreenshotPreview);
    setFeedbackScreenshot(file);
    setFeedbackScreenshotPreview(file ? URL.createObjectURL(file) : "");
    setFeedbackStatus("idle");
    setFeedbackNotice("");
  };

  const removeFeedbackScreenshot = () => {
    if (feedbackScreenshotPreview) URL.revokeObjectURL(feedbackScreenshotPreview);
    setFeedbackScreenshot(null);
    setFeedbackScreenshotPreview("");
  };

  useEffect(() => () => {
    if (feedbackScreenshotPreview) URL.revokeObjectURL(feedbackScreenshotPreview);
  }, [feedbackScreenshotPreview]);

  const handleFeedbackSubmit = async (event) => {
    event.preventDefault();
    if (feedbackStatus === "sending") return;
    const message = feedbackMessage.trim();
    if (!message) {
      setFeedbackStatus("error");
      setFeedbackNotice("Write a feedback message before sending.");
      return;
    }
    if (message.length > FEEDBACK_MAX_MESSAGE_LENGTH) {
      setFeedbackStatus("error");
      setFeedbackNotice("Feedback messages must be 5,000 characters or fewer.");
      return;
    }
    setFeedbackStatus("sending");
    setFeedbackNotice("");
    let uploadedPath = null;
    try {
      const client = await getSupabaseBrowserClient();
      if (!client) throw new Error("Sign in to your GlowDocket account before sending feedback.");
      const { data: sessionData } = await client.auth.getSession();
      const session = sessionData.session;
      if (!session?.access_token || !session.user?.id) throw new Error("Your session expired. Sign in again and retry.");
      const feedbackId = crypto.randomUUID();
      if (feedbackScreenshot) {
        const validation = validateFeedbackScreenshot(feedbackScreenshot);
        if (!validation.valid) throw new Error(validation.error);
        uploadedPath = feedbackScreenshotPath(session.user.id, feedbackId, validation.extension);
        const { error: uploadError } = await client.storage.from("feedback-screenshots").upload(uploadedPath, feedbackScreenshot, { contentType: feedbackScreenshot.type, upsert: false });
        if (uploadError) throw new Error("GlowDocket could not securely upload the screenshot. Please retry.");
      }
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ feedbackId, category: feedbackCategory || null, message, screenshotPath: uploadedPath, appVersion: APP_BUILD_METADATA.appVersion, allowContact: feedbackAllowContact }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "GlowDocket could not send your feedback. Please try again.");
      setFeedbackCategory("");
      setFeedbackMessage("");
      removeFeedbackScreenshot();
      setFeedbackAllowContact(false);
      setFeedbackStatus("success");
      setFeedbackNotice("Thanks! Your feedback was sent securely.");
    } catch (error) {
      if (uploadedPath) {
        try {
          const client = await getSupabaseBrowserClient();
          await client.storage.from("feedback-screenshots").remove([uploadedPath]);
        } catch (cleanupError) { console.warn("Feedback screenshot cleanup could not finish.", cleanupError); }
      }
      setFeedbackStatus("error");
      setFeedbackNotice(error instanceof Error ? error.message : "GlowDocket could not send your feedback. Please try again.");
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
    if (isMobileUi) {
      setMobileReturnTab("calendar");
      setBulkImportOpen(false);
      setCurrentTab("mobile-add");
      setCalendarAddOpen(false);
      return;
    }
    setCalendarAddOpen(true);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById("calendar-assignment-name")?.focus();
      });
    });
  };

  const handleCopyStart = (task) => {
    dialogTriggerRef.current = document.activeElement;
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
  const uniqueAttachmentMetadata = new Map();
  tasks.forEach((task) => getSafeAttachments(task).forEach((attachment) => uniqueAttachmentMetadata.set(attachment.id, attachment)));
  const attachmentMetadataBytes = [...uniqueAttachmentMetadata.values()].reduce((total, attachment) => total + attachment.size, 0);
  const storageQuotaStatus = getStorageQuotaStatus(browserStorage.usage, browserStorage.quota);

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
    <AssignmentFilterToggle filtersOpen={filtersOpen} onToggle={() => setFiltersOpen((prev) => !prev)} />
  );

  const renderFilterControls = () => <AssignmentFilterControls
    filtersOpen={filtersOpen}
    searchTerm={searchTerm}
    onSearchTermChange={setSearchTerm}
    filterCategory={filterCategory}
    onFilterCategoryChange={setFilterCategory}
    taskCategories={TASK_CATEGORIES}
    courseLabel={schoolLevelCopy.courseLabel}
    filterCourse={filterCourse}
    onFilterCourseChange={setFilterCourse}
    courses={courses}
    filterPriority={filterPriority}
    onFilterPriorityChange={setFilterPriority}
    filterDueBucket={filterDueBucket}
    onFilterDueBucketChange={setFilterDueBucket}
    dueBuckets={bucketsOrder}
    filterRepeat={filterRepeat}
    onFilterRepeatChange={setFilterRepeat}
    onReset={resetFilters}
  />;

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

  const getAssignmentCountdownLabel = (task) => {
    if (getTaskStatus(task) === "completed") return null;
    const deadline = getDeadlineDate(task?.dueMonth, task?.dueDay, task?.dueHour, task?.dueAmPm);
    return formatAssignmentCountdown(deadline, checklistNow) || null;
  };

  const renderAssignmentCountdown = (task, extraClassName = "") => {
    const label = getAssignmentCountdownLabel(task);
    if (!label) return null;
    const deadline = getDeadlineDate(task?.dueMonth, task?.dueDay, task?.dueHour, task?.dueAmPm);
    const tone = getAssignmentCountdownTone(deadline, checklistNow);
    return <AssignmentCountdown title={task.title} label={label} tone={tone} extraClassName={extraClassName} />;
  };

  const renderRecommendationMetadata = (item, { showCourse = false } = {}) => {
    const task = item.task;
    const estimate = getValidEstimate(task);
    const status = getTaskStatus(task);
    const countdownLabel = getAssignmentCountdownLabel(task) || "";
    const metadata = getUniqueAssignmentMetadata({
      dueLabel: item.dueLabel,
      countdownLabel,
      reasons: item.reasons,
      priorityShown: true,
      statusShown: status === "inProgress",
      estimateShown: Number.isFinite(estimate),
    });
    const details = [
      showCourse ? getTaskCourseOrCategory(task) : "",
      metadata.dueLabel,
      `${task.priority || "No"} priority`,
      Number.isFinite(estimate) ? `${estimate} min` : "No time estimate",
      status === "inProgress" ? "In Progress" : "",
    ].filter(Boolean);
    return <>
      <div className="recommended-plan-details">{details.map((detail) => <span key={detail}>{detail}</span>)}</div>
      {metadata.countdownLabel && <AssignmentCountdown title={task.title} label={metadata.countdownLabel} tone={getAssignmentCountdownTone(getDeadlineDate(task?.dueMonth, task?.dueDay, task?.dueHour, task?.dueAmPm), checklistNow)} extraClassName="recommended-countdown" />}
      {metadata.reasons.length > 0 && <div className="recommended-plan-reasons">{metadata.reasons.map((reason) => <span key={reason}>{reason}</span>)}</div>}
    </>;
  };

  /**
   * Compact checklist progress.
   * This is intentionally only one line so collapsed cards stay calm and tidy.
   */
  const renderSubtaskProgressLine = (task, extraClassName = "") => {
    const progress = getSubtaskProgress(task);

    if (!progress) return null;

    return <SubtaskProgressLine label={progress.label} extraClassName={extraClassName} />;
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
          <span>Related Tasks to Complete</span>
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
            Completing every related task automatically completes this assignment.
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

  const renderDueDateField = (month, day, onChange, id) => {
    const today = new Date();
    const value = month && day
      ? `${today.getFullYear()}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      : "";
    return (
      <label className="mobile-due-date-field" htmlFor={id}>
        Due date
        <span className="date-picker-control">
          <button
            type="button"
            className="date-picker-logo-button"
            aria-label="Open due date calendar"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const input = event.currentTarget.nextElementSibling;
              try {
                if (typeof input.showPicker === "function") input.showPicker();
                else input.click();
              } catch {
                input.focus();
              }
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" /></svg>
          </button>
          <input
            id={id}
            type="date"
            value={value}
            onChange={(event) => {
              const [, selectedMonth = "", selectedDay = ""] = event.target.value.split("-");
              onChange(selectedMonth, selectedDay);
            }}
          />
        </span>
      </label>
    );
  };

  const continueAsGuest = () => {
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    setWelcomeAuthOpen(false);
    setAuthError("");
    setAuthNotice("");
    setAccountEmail("");
    setAccountEmailVerified(false);
    setDisplayName("Guest");
    setAccountMode("local");
    setCurrentUser("guest");
    setCurrentTab("dashboard");
  };

  const renderAddAssignmentForm = (formId) => (
    <form onSubmit={handleAddTask} className="card-form assignment-entry-form">
      <section className="bulk-import-panel" aria-label="Paste assignment list">
        <div className="bulk-import-heading">
          <div>{isMobileUi && <span className="mobile-add-option-number">Option 1</span>}<strong>{isMobileUi ? "Import Assignments" : "Paste Assignment List"}</strong><p>{isMobileUi ? "Paste one assignment per line or upload a syllabus, then review every detected item before saving." : "Create several assignments from one line each, with a review before saving."}</p></div>
          <button type="button" className="btn btn-secondary" onClick={() => setBulkImportOpen((open) => !open)}>{bulkImportOpen ? "Close" : isMobileUi ? "Open Optional Import" : "Open Importer"}</button>
        </div>
        {bulkImportOpen && (
          <div className="bulk-import-content">
            <div className="syllabus-upload-panel">
              <div><strong>Upload a syllabus or assignment file</strong><p>PDF, DOCX, TXT, Markdown, or CSV · processed on this device · 10 MB maximum. Old .doc files must first be saved as DOCX, PDF, or TXT.</p></div>
              <label><span>Course for imported work</span><select value={syllabusCourse || courses[0] || "Other"} onChange={(event) => setSyllabusCourse(event.target.value)}>{courses.map((course) => <option key={course} value={course}>{course}</option>)}</select></label>
              <label className={`btn btn-secondary syllabus-file-button${syllabusImportStatus === "reading" ? " disabled" : ""}`}>
                {syllabusImportStatus === "reading" ? "Reading syllabus…" : "Choose Syllabus File"}
                <input aria-label="Choose a syllabus or assignment file" type="file" accept=".pdf,.doc,.docx,.txt,.md,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv" onChange={handleSyllabusFile} disabled={syllabusImportStatus === "reading"} />
              </label>
              {syllabusImportStatus === "reading" && <button type="button" className="btn btn-secondary" onClick={() => syllabusAbortRef.current?.abort()}>Cancel reading</button>}
              {syllabusFileName && <span className="syllabus-file-name">{syllabusFileName}</span>}
              {syllabusExtractedText && <button type="button" className="syllabus-full-text-button" onClick={() => { setBulkImportText(syllabusExtractedText); setBulkImportPreview([]); setBulkImportMessage("Showing all extracted syllabus text. Remove policy and schedule lines that are not assignments, then choose Review Assignments."); setSyllabusImportStatus("needs-review"); }}>Use full extracted text</button>}
            </div>
            <div className="bulk-import-divider"><span>or paste assignment lines</span></div>
            <div className="bulk-import-instructions"><div className="bulk-import-instructions-heading"><strong>Paste one assignment per line</strong><button type="button" className="syllabus-full-text-button" aria-expanded={bulkImportHelpOpen} onClick={() => setBulkImportHelpOpen((open) => !open)}>{bulkImportHelpOpen ? "Hide examples" : "Show examples"}</button></div><p>Include course, assignment name, and due date. Tabs, commas, spaced dashes, copied table rows, dates with times, and a first row of column names are accepted.</p>{bulkImportHelpOpen && <div className="bulk-import-examples"><section><strong>Spaced dashes</strong><code>{"History — Chapter 4 Notes — September 18\nBiology — Lab Report — September 20 at 11:59 PM\nMath — Problems 1–25 — Friday"}</code></section><section><strong>Commas</strong><code>{"Course, Assignment, Due Date\nEnglish, Essay Draft, October 3\nChemistry, Chapter Quiz, October 5 at 9:00 AM"}</code></section><section><strong>Copied spreadsheet rows</strong><code>{"Course\tAssignment\tDue Date\nArt\tSketchbook Review\tOctober 7\nPhysics\tMotion Lab\tOctober 9"}</code></section></div>}</div>
            <label className="bulk-import-text-label">Assignment list<textarea aria-describedby="bulk-import-format-help" value={bulkImportText} onChange={(event) => setBulkImportText(event.target.value)} placeholder={"Course, Assignment, Due Date\nHistory, Chapter 4 Notes, 9/18/2026"} rows={7} /></label>
            <div className="bulk-import-actions"><button type="button" className="btn btn-primary" onClick={handleParseBulkImport} disabled={!bulkImportText.trim()}>Review Assignments</button><small id="bulk-import-format-help">Nothing is saved until you review and approve the detected rows.</small></div>
            {bulkImportMessage && <p className="bulk-import-message" role="status">{bulkImportMessage}</p>}
            {bulkImportPreview.length > 0 && (
              <div className="bulk-import-review">
                <div className="bulk-import-review-toolbar">
                  <strong>{bulkImportPreview.length} assignment{bulkImportPreview.length === 1 ? "" : "s"} detected · {bulkImportIssueCount} need review</strong>
                  <small>Source: {bulkImportSource}</small>
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
                      <label><span>Course</span><span className="bulk-import-course-control"><select value={item.course || "Other"} onChange={(event) => handleBulkPreviewChange(item.previewId, "course", event.target.value)}>{[...new Set([...courses, item.course || "Other"])].map((course) => <option key={course} value={course}>{course}</option>)}</select><button type="button" className="btn btn-secondary" onClick={() => handleBulkImportCourseCreate(item.previewId)}>New</button></span></label>
                      <label><span>Month</span><input type="number" min="1" max="12" value={item.dueMonth || ""} onChange={(event) => handleBulkPreviewChange(item.previewId, "dueMonth", event.target.value)} /></label>
                      <label><span>Day</span><input type="number" min="1" max="31" value={item.dueDay || ""} onChange={(event) => handleBulkPreviewChange(item.previewId, "dueDay", event.target.value)} /></label>
                      <label><span>Due time</span><input value={item.dueHour || ""} placeholder="11:59" inputMode="numeric" onChange={(event) => handleBulkPreviewChange(item.previewId, "dueHour", event.target.value)} /></label>
                      <label><span>AM/PM</span><select value={item.dueAmPm || userSettings.defaultDueAmPm || "PM"} onChange={(event) => handleBulkPreviewChange(item.previewId, "dueAmPm", event.target.value)}><option>AM</option><option>PM</option></select></label>
                      <label><span>Priority</span><select value={item.priority || userSettings.defaultPriority || "MED"} onChange={(event) => handleBulkPreviewChange(item.previewId, "priority", event.target.value)}><option value="LOW">Low</option><option value="MED">Medium</option><option value="HIGH">High</option></select></label>
                      <label><span>Minutes</span><input type="number" min="0" max="1440" value={item.estimatedMinutes ?? ""} onChange={(event) => handleBulkPreviewChange(item.previewId, "estimatedMinutes", event.target.value)} /></label>
                      <label className="bulk-import-notes"><span>Notes</span><textarea value={item.notes || ""} onChange={(event) => handleBulkPreviewChange(item.previewId, "notes", event.target.value)} rows="2" /></label>
                      <span className={`bulk-import-readiness ${warnings.length ? "needs-review" : "ready"}`}>{warnings.length ? "Needs Review" : "Ready"}</span>
                      {warnings.length > 0 && <div className="bulk-import-warnings">{warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>}
                    </article>
                  );
                })}
                <button type="button" className="btn btn-primary bulk-import-submit" onClick={handleBulkImportSubmit} disabled={bulkImportSaving}>{bulkImportSaving ? "Adding…" : "Add Selected to To Do"}</button>
              </div>
            )}
          </div>
        )}
      </section>
      <section
        className="voice-assignment-panel is-coming-soon"
        aria-label="Voice assignments are in the works"
        data-browser-supported={voiceRecordingSupported}
        data-voice-status={voiceStatus}
        data-recording-seconds={voiceElapsed}
      >
          <div>
            {isMobileUi && <span className="mobile-add-option-number">Option 3</span>}
            <strong>Voice Add</strong>
            <p>In the works! Voice assignment creation is temporarily unavailable.</p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={voiceStatus === "recording" ? handleVoiceStop : handleVoiceStart}
            disabled
            aria-disabled="true"
            title="Voice Add is in the works"
          >
            In the works!
          </button>
          <small>This option will be available in a future update.</small>
      </section>

      {voiceError && <div className="voice-inline-error" role="alert">{voiceError}</div>}

      <div className={`manual-assignment-fields${guidedEntryOpen ? " guided-active" : ""}`}>
      {isMobileUi && <div className="mobile-add-option-heading"><span>Option 2</span><h3>Add Assignment</h3><p>Enter the assignment details yourself or use the guided mode.</p><button type="button" className="btn btn-primary guided-entry-launch" onClick={() => { setGuidedEntryStep(0); setGuidedEntryOpen(true); }}>Guided entry</button></div>}
      {isMobileUi && guidedEntryOpen && (
        <section className="guided-assignment-entry" aria-labelledby="guided-entry-title">
          <div className="guided-entry-progress"><span>Step {guidedEntryStep + 1} of 7</span><progress max="7" value={guidedEntryStep + 1}>{guidedEntryStep + 1}</progress></div>
          <h3 id="guided-entry-title">{["What is the assignment called?", "Which course is it for?", "When is it due?", "What is its priority?", "Would you like to add notes?", "Would you like to add related tasks to complete?", "Review your assignment"][guidedEntryStep]}</h3>
          {guidedEntryStep === 0 && <label>Assignment name<input autoFocus value={taskName} onChange={(event) => setTaskName(event.target.value)} /></label>}
          {guidedEntryStep === 1 && <div className="guided-course-step"><label>Course<select value={selectedCourse} onChange={(event) => { setSelectedCourse(event.target.value); setGuidedCourseError(""); }}><option value="">Select a course</option>{courses.map((course) => <option key={course} value={course}>{course}</option>)}</select></label><button type="button" className="btn btn-secondary" onClick={() => { setGuidedCourseCreationOpen((open) => !open); setGuidedCourseError(""); }}>+ Create New Course</button>{guidedCourseCreationOpen && <div className="guided-course-create"><label>Course name<input autoFocus value={guidedCourseName} onChange={(event) => { setGuidedCourseName(event.target.value); setGuidedCourseError(""); }} /></label><label>Course color<input type="color" value={guidedCourseColor} onChange={(event) => setGuidedCourseColor(event.target.value)} /></label>{guidedCourseError && <p className="guided-course-error" role="alert">{guidedCourseError}</p>}<div><button type="button" className="btn btn-secondary" onClick={() => { setGuidedCourseCreationOpen(false); setGuidedCourseError(""); }}>Cancel</button><button type="button" className="btn btn-primary" onClick={handleGuidedCourseCreate}>Create course</button></div></div>}</div>}
          {guidedEntryStep === 2 && <div className="guided-entry-date">{renderDueDateField(dueMonth, dueDay, (month, day) => { setDueMonth(month); setDueDay(day); }, "guided-assignment-due-date")}<label>Time<input value={dueHour} inputMode="numeric" onChange={(event) => setDueHour(event.target.value)} /></label><label>AM/PM<select value={dueAmPm} onChange={(event) => setDueAmPm(event.target.value)}><option>AM</option><option>PM</option></select></label></div>}
          {guidedEntryStep === 3 && <label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="LOW">Low</option><option value="MED">Medium</option><option value="HIGH">High</option></select></label>}
          {guidedEntryStep === 4 && <label>Notes<textarea value={guidedNotes} onChange={(event) => setGuidedNotes(event.target.value)} rows="5" placeholder="Optional notes" /></label>}
          {guidedEntryStep === 5 && <><div className="guided-checklist-add"><input value={newSubtaskText} onChange={(event) => setNewSubtaskText(event.target.value)} placeholder="Related task to complete" /><button type="button" className="btn btn-secondary" onClick={handleAddDraftSubtask} disabled={!newSubtaskText.trim()}>Add</button></div>{draftSubtasks.length > 0 ? <ol className="creation-related-task-list">{draftSubtasks.map((item) => <li key={item.id}><input type="checkbox" checked={false} readOnly tabIndex="-1" aria-hidden="true" /><span>{item.text}</span><button type="button" className="subtask-remove-button" onClick={() => handleRemoveDraftSubtask(item.id)}>Remove</button></li>)}</ol> : <p className="subtask-form-hint">No related tasks added.</p>}</>}
          {guidedEntryStep === 6 && <dl className="guided-entry-review"><div><dt>Name</dt><dd>{taskName || "Missing"}</dd></div><div><dt>Course</dt><dd>{selectedCourse || "Other"}</dd></div><div><dt>Due</dt><dd>{dueMonth && dueDay ? `${dueMonth}/${dueDay} at ${dueHour} ${dueAmPm}` : "Missing"}</dd></div><div><dt>Priority</dt><dd>{{ LOW: "Low", MED: "Medium", HIGH: "High" }[priority]}</dd></div><div><dt>Notes</dt><dd>{guidedNotes || "None"}</dd></div><div><dt>Related tasks</dt><dd>{draftSubtasks.length} item{draftSubtasks.length === 1 ? "" : "s"}</dd></div></dl>}
          <div className="guided-entry-actions">
            <button type="button" className="btn btn-secondary" onClick={() => { if (guidedEntryStep > 0) setGuidedEntryStep((step) => step - 1); else if (!taskName && !selectedCourse && !guidedNotes && draftSubtasks.length === 0 || window.confirm("Exit guided entry without saving?")) setGuidedEntryOpen(false); }}>{guidedEntryStep > 0 ? "Back" : "Exit"}</button>
            {guidedEntryStep > 3 && guidedEntryStep < 6 && <button type="button" className="btn btn-secondary" onClick={() => setGuidedEntryStep((step) => step + 1)}>Skip</button>}
            {guidedEntryStep < 6 ? <button type="button" className="btn btn-primary" disabled={(guidedEntryStep === 0 && !taskName.trim()) || (guidedEntryStep === 1 && !selectedCourse) || (guidedEntryStep === 2 && (!dueMonth || !dueDay))} onClick={() => setGuidedEntryStep((step) => step + 1)}>Continue</button> : <button type="submit" className="btn btn-primary" disabled={!taskName.trim() || !dueMonth || !dueDay}>Save Assignment</button>}
          </div>
        </section>
      )}
      <div className="assignment-primary-fields">
      <div className="assignment-form-row">
      <label htmlFor={`${formId}-assignment-name`}>{schoolLevelCopy.nameLabel}:</label>
      <input
        id={`${formId}-assignment-name`}
        type="text"
        placeholder="e.g., Read Chapter 4"
        value={taskName}
        onChange={(e) => setTaskName(e.target.value)}
      />
      </div>

      <div className="assignment-form-row">
      <label>Category:</label>
      <div className="assignment-form-control-stack"><select value={category} onChange={(e) => setCategory(e.target.value)}>
        {categoryChoices.map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
      </select>
      <div className="custom-category-row">
        <input type="text" value={customCategoryName} onChange={(event) => setCustomCategoryName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); handleAddCustomCategory(); } }} placeholder="Add a custom category" aria-label="Custom category name" />
        <button type="button" className="btn btn-secondary" onClick={handleAddCustomCategory} disabled={!customCategoryName.trim()}>Add category</button>
      </div>
      </div>
      </div>

      {category === "School" && <div className="assignment-form-row assignment-course-row"><div
        className="assignment-course-heading"
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
      )}</div>}

      {renderDueDateField(dueMonth, dueDay, (month, day) => { setDueMonth(month); setDueDay(day); }, `${formId}-assignment-due-date`)}

      <div className="assignment-form-row"><label>Due Time:</label>
      <div className="assignment-time-controls">
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
        />
        <select value={dueAmPm} onChange={(e) => setDueAmPm(e.target.value)}>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div></div>

      {userSettings.showEstimatedMinutes && (
        <div className="assignment-form-row">
          <label>Estimated Minutes:</label>
          <input
            type="number"
            placeholder="e.g., 45"
            value={estTime}
            onChange={(e) => setEstTime(e.target.value)}
          />
        </div>
      )}

      {userSettings.showPriority && (
        <div className="assignment-form-row">
          <label>Priority:</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="LOW">Low</option>
            <option value="MED">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </div>
      )}

      {userSettings.showRepeat && (
        <div className="assignment-form-row">
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
        </div>
      )}
      </div>

      <div className="assignment-optional-sections">
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
          {draftLinkMessage || (isMobileUi ? "Enter a link name and address, then tap outside either field to add it. Confirm the link appears below before saving." : "Enter a link name and address, then click outside either field to add it. Confirm the link appears below before saving.")}
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
            handleFileSelection(e.target.files, setDraftFiles, draftFiles);
            e.target.value = "";
          }}
        />
        <p className="subtask-form-hint">Stored only in this browser. Maximum 10 MB per file, {MAX_ATTACHMENTS_PER_ASSIGNMENT} files and 50 MB per assignment.</p>
        {attachmentSelectionMessage && <p className="attachment-selection-message" role="status" aria-live="polite">{attachmentSelectionMessage}</p>}
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
        <div className="optional-assignment-header double-click-collapse-header" onDoubleClick={(event) => toggleFromHeaderDoubleClick(event, () => setOptionalChecklistOpen((open) => !open))} title="Double-click to open or minimize Related Tasks to Complete">
          <label>Related Tasks to Complete</label>
          <button
            type="button"
            className="optional-assignment-toggle"
            onClick={(event) => toggleFromCollapseButton(event, () => setOptionalChecklistOpen((open) => !open))}
            onDoubleClick={stopControlDoubleClick}
            aria-expanded={optionalChecklistOpen}
            aria-label={`${optionalChecklistOpen ? "Minimize" : "Open"} Related Tasks to Complete`}
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
            Add related task
          </button>
        </div>

        <div className="subtask-deadline-fields">
          <select
            aria-label="Related task due month"
            value={newSubtaskDueMonth}
            onChange={(e) => setNewSubtaskDueMonth(e.target.value)}
          >
            <option value="">Optional month</option>
            {monthNames.map((month, index) => (
              <option key={month} value={String(index + 1).padStart(2, "0")}>{month}</option>
            ))}
          </select>
          <select
            aria-label="Related task due day"
            value={newSubtaskDueDay}
            onChange={(e) => setNewSubtaskDueDay(e.target.value)}
          >
            <option value="">Day</option>
            {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
              <option key={day} value={String(day).padStart(2, "0")}>{day}</option>
            ))}
          </select>
          <input
            aria-label="Related task due time"
            type="text"
            placeholder="Time, e.g. 4:30"
            value={newSubtaskDueHour}
            onChange={(e) => setNewSubtaskDueHour(e.target.value)}
          />
          <select
            aria-label="Related task AM or PM"
            value={newSubtaskDueAmPm}
            onChange={(e) => setNewSubtaskDueAmPm(e.target.value)}
          >
            <option value="AM">AM</option><option value="PM">PM</option>
          </select>
        </div>

        {draftSubtasks.length > 0 && (
          <ol className={`subtask-draft-list${isMobileUi ? " creation-related-task-list" : ""}`}>
            {draftSubtasks.map((subtask) => (
              <li key={subtask.id} className="subtask-draft-item">
                {isMobileUi && <input type="checkbox" checked={false} readOnly tabIndex="-1" aria-hidden="true" />}
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
          </ol>
        )}
          </div>
        )}
      </div>}
      </div>

      <button
        type="submit"
        className="btn btn-primary assignment-submit-button"
        disabled={isFormInvalid}
      >
        {schoolLevelCopy.addLabel}
      </button>
      </div>
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
  const mobileDueGroups = splitActiveAndOverdue(activeDashboardTasks, getTaskDueBucket);
  const activeTasksCount = isMobileUi ? mobileDueGroups.active.length : activeDashboardTasks.length;

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
              {!getAssignmentCountdownLabel(quickMatchBest.task) && <span>{quickMatchBest.dueLabel}</span>}
              <span>{quickMatchBest.task.priority || "No"} priority</span>
            </div>
            {renderAssignmentCountdown(quickMatchBest.task, "quick-match-countdown")}
            <p className="quick-match-reason">{getQuickMatchReason(quickMatchBest)}</p>
            <div className="quick-match-actions">
              <button type="button" className="btn btn-secondary" onClick={() => handleRecommendedTaskClick(quickMatchBest.task.id)}>{getFocusActionLabel(quickMatchBest.task)}</button>
              {getTaskStatus(quickMatchBest.task) === "todo" && (
                <button type="button" className="btn btn-primary" onClick={() => handleQuickMatchStart(quickMatchBest.task.id)}>In Progress</button>
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
                        <button type="button" className="quick-match-backup-start" onClick={() => handleQuickMatchStart(match.task.id)}>In Progress</button>
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

  const openChecklist = (checklistId) => {
    if (isMobileUi) window.history.pushState({ taskcabinetMobilePanel: "checklist" }, "");
    setSelectedChecklistId(checklistId);
  };
  const closeChecklist = () => {
    if (isMobileUi && window.history.state?.taskcabinetMobilePanel === "checklist") window.history.back();
    else setSelectedChecklistId(null);
  };
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
            <div><h2>Checklists</h2>{!isMobileUi && <p>Quick lists that stay separate from assignments.</p>}</div>
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
                  draggable={!checklistSelectionMode && !isMobileUi}
                  onDragStart={(event) => event.dataTransfer.setData("text/checklist-list", list.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleReorderChecklist(event.dataTransfer.getData("text/checklist-list"), list.id)}
                >
                  {!checklistSelectionMode && !isMobileUi && <button type="button" className="checklist-list-grip" onPointerDown={(event) => startChecklistTouchReorder(event, ".checklist-gallery-card", list.id, handleReorderChecklist)} aria-label={`Reorder ${list.title}`}>⠿</button>}
                  {checklistSelectionMode && <input className="checklist-list-select" type="checkbox" checked={selectedChecklistIds.includes(list.id)} onChange={(event) => setSelectedChecklistIds((ids) => event.target.checked ? [...ids, list.id] : ids.filter((id) => id !== list.id))} aria-label={`Select ${list.title || "Untitled checklist"}`} />}
                  <button type="button" className="checklist-card-open" onClick={() => checklistSelectionMode ? setSelectedChecklistIds((ids) => ids.includes(list.id) ? ids.filter((id) => id !== list.id) : [...ids, list.id]) : openChecklist(list.id)}>
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
      <section className={`standalone-checklists checklist-editor${isMobileUi ? " mobile-checklist-fullscreen" : ""}`} style={{ "--active-list-color": selectedList.color, "--active-list-text": getContrastText(selectedList.color) }}>
        <div className="checklist-editor-toolbar">
          {isMobileUi ? <button type="button" className="mobile-checklist-close" onClick={closeChecklist} aria-label="Close checklist">×</button> : <button type="button" className="btn btn-secondary" onClick={closeChecklist}>← Lists</button>}
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
                draggable={!isMobileUi}
                onDragStart={(event) => event.dataTransfer.setData("text/checklist-item", item.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleReorderChecklistItem(selectedList.id, event.dataTransfer.getData("text/checklist-item"), item.id)}
              >
                {!isMobileUi && <button type="button" className="checklist-item-grip" title="Drag to reorder" onPointerDown={(event) => startChecklistTouchReorder(event, ".standalone-checklist-items li", item.id, (source, target) => handleReorderChecklistItem(selectedList.id, source, target))}>⠿</button>}
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
      <DeferredCalendar
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

  const renderRecommendedWidget = () => recommendationItems.length === 0 ? <div className="empty-state-action friendly-empty" role="status"><p className="recommended-plan-empty">You’re all caught up! Add something whenever you’re ready, and we’ll help you decide what to tackle first.</p>{isMobileUi ? <button type="button" className="recommended-plan-tip-bubble mobile-empty-add-action" onClick={() => openMobileAdd("dashboard")}>Tap here or use the + Add button to add your next assignment.</button> : <p className="recommended-plan-tip-bubble">Add your next assignment from the Add Assignment section on the Dashboard.</p>}</div> : (
    <>
      <div className="recommended-plan-workload compact"><strong>{recommendationWorkloadLabel}</strong><span>Top-plan workload{recommendationWorkload.unknownCount > 0 ? ` + ${recommendationWorkload.unknownCount} unestimated` : ""}</span></div>
      <ol className="recommended-plan-list portable-recommendations">
        {recommendationItems.map((item, index) => (
          <li key={item.task.id} className={`recommended-plan-item${getTaskDueBucket(item.task).startsWith("Overdue") ? " is-overdue" : ""}`}>
            <button type="button" className="recommended-plan-button" onClick={() => handleRecommendedTaskClick(item.task.id)}>
              <span className="recommended-plan-rank">{index + 1}</span>
              <div className="recommended-plan-content">
                <strong>{item.task.title}</strong>
                {renderRecommendationMetadata(item, { showCourse: true })}
              </div>
            </button>
            <div className="recommended-plan-actions">
              <button type="button" className="btn btn-secondary" onClick={() => handleRecommendedTaskClick(item.task.id)}>{getFocusActionLabel(item.task)}</button>
              {getTaskStatus(item.task) === "todo" && <button type="button" className="btn btn-primary" onClick={() => handleQuickMatchStart(item.task.id)}>In Progress</button>}
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
        <label htmlFor="portable-new-course-name">Add course by entering a name and pressing Add below</label>
        <input
          id="portable-new-course-name"
          type="text"
          value={newCourseName}
          onChange={(event) => setNewCourseName(event.target.value)}
          placeholder="Course name"
        />
        <button type="submit" className="btn btn-primary" disabled={!newCourseName.trim()}>Add</button>
      </form>
      {courses.map((course, index) => <div className={`portable-course-color-row course-reorder-row${draggedCourse === course ? " dragging" : ""}${courseDropTarget?.course === course ? ` drop-${courseDropTarget.position}` : ""}`} key={course} onDragOver={(event) => { event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); setCourseDropTarget({ course, position: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after" }); }} onDrop={(event) => { event.preventDefault(); handleCourseDrop(course, courseDropTarget?.position || "before"); }}><button type="button" className="course-drag-handle" draggable aria-label={`Drag ${course} to reorder`} title="Drag to reorder. Press Alt+Up or Alt+Down to move with the keyboard." onKeyDown={(event) => { if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return; event.preventDefault(); handleCourseMove(course, event.key === "ArrowUp" ? -1 : 1); }} onDragStart={(event) => { setDraggedCourse(course); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", course); }} onDragEnd={() => { setDraggedCourse(null); setCourseDropTarget(null); }}>⋮⋮</button><span style={{ backgroundColor: getCourseColor(course), color: getTextColorForCourse(course) }}>{course}</span><input className="course-color-selector" type="color" value={getCourseColor(course)} style={{ backgroundColor: getCourseColor(course) }} onChange={(event) => handleCourseColorChange(course, event.target.value)} aria-label={`Color for ${course}`} /><button type="button" className="btn btn-danger" disabled={course === "Other"} onClick={() => handleDeleteCourse(course)}>Delete</button><div className="mobile-course-order-actions" aria-label={`Reorder ${course}`}><button type="button" className="btn btn-secondary" disabled={index === 0} onClick={() => handleCourseMove(course, -1)} aria-label={`Move ${course} up`}>↑ Up</button><button type="button" className="btn btn-secondary" disabled={index === courses.length - 1} onClick={() => handleCourseMove(course, 1)} aria-label={`Move ${course} down`}>↓ Down</button></div></div>)}
    </div>
  );

  const renderCourseOverviewWidget = () => {
    if (courses.length === 0) return <div className="empty-state-action friendly-empty" role="status"><p>No courses yet. Add your first course to organize assignments and colors.</p><button type="button" className="btn btn-primary" onClick={() => setCurrentTab(isMobileUi ? "mobile-courses" : "settings")}>Add a Course</button></div>;
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
            <small>{!getAssignmentCountdownLabel(overviewNextTask) ? `${getTaskDueBucket(overviewNextTask)} | ` : ""}{overviewNextTask.priority || "No"} priority</small>
            {renderAssignmentCountdown(overviewNextTask, "course-overview-countdown")}
            <div className="course-overview-actions">
              <button type="button" className="btn btn-secondary" onClick={() => handleRecommendedTaskClick(overviewNextTask.id)}>{getFocusActionLabel(overviewNextTask)}</button>
              {getTaskStatus(overviewNextTask) === "todo" && <button type="button" className="btn btn-primary" onClick={() => handleQuickMatchStart(overviewNextTask.id)}>In Progress</button>}
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
                <span><strong>{task.title}</strong><small>{getTaskCourseOrCategory(task)}</small></span>
                <span className={overdue ? "is-overdue" : ""}><strong>{formatAssignmentCountdown(deadline, checklistNow)}</strong><small>{deadline.toLocaleDateString(undefined, { month: "short", day: "numeric" })} | {deadline.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></span>
              </button>
              {getTaskStatus(task) === "todo" && <button type="button" className="reminder-widget-start" onClick={() => handleQuickMatchStart(task.id)}>In Progress</button>}
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
        <button type="button" className="btn btn-primary focus-session-start-button" onClick={(event) => stopCardClick(event, () => handleFocusStart(task.id))}>Focus</button>
        <button
          type="button"
          className="btn btn-secondary status-action-button"
          onClick={(event) => stopCardClick(event, () => handleStartTask(task.id))}
        >
          In Progress
        </button>

        <button
          type="button"
          className="btn btn-primary"
          onClick={(event) => stopCardClick(event, () => handleComplete(task.id, { celebrationOrigin: getCelebrationOrigin(event.currentTarget) }))}
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
        <button type="button" className="btn btn-primary focus-session-start-button" onClick={(event) => stopCardClick(event, () => handleFocusStart(task.id))}>Focus</button>
        <div className="task-action-pair task-action-pair-left">
          <button type="button" className="btn btn-warning status-action-button" onClick={(event) => stopCardClick(event, () => handleMoveToTodo(task.id))}>Back to To Do</button>
          <button type="button" className="btn btn-primary" onClick={(event) => stopCardClick(event, () => handleComplete(task.id, { celebrationOrigin: getCelebrationOrigin(event.currentTarget) }))}>Complete ✅</button>
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
  const reminderActionLabel = getReminderActionLabel(reminderUserStatus, Boolean(userSettings.externalPushEnabled));
  const renderTaskReminderIndicator = (task) => {
    const indicator = getAssignmentReminderIndicator({ remindersEnabled: Boolean(userSettings.externalPushEnabled), hasDeadline: Boolean(getExternalReminderForTask(task)) && getTaskStatus(task) !== "completed" && !task.isDeleted && !task.isArchived, taskState: assignmentReminderStates[task.id] || (reminderUserStatus === "active" ? "healthy" : "pending"), userStatus: reminderUserStatus });
    return indicator ? <span className={`task-reminder-indicator is-${indicator.tone}`} aria-label={indicator.label} title={indicator.label}>🔔</span> : null;
  };
  const renderTaskMasterWidget = (status, onlyBucket = null) => {
    const allSource = status === "todo" ? sortedTodoTasks : status === "inProgress" ? sortedInProgressTasks : completedTasks;
    const source = onlyBucket ? allSource.filter((task) => getTaskDueBucket(task) === onlyBucket) : allSource;
    const grouped = status === "todo" ? groupedTasks : status === "inProgress" ? groupedInProgressTasks : null;
    const renderCard = (task) => {
      const mobileLevel = mobileTaskLevels[task.id] || MOBILE_TASK_LEVELS.compact;
      const mobileSummaryOpen = !isMobileUi || mobileLevel >= MOBILE_TASK_LEVELS.summary;
      const mobileDetailsOpen = !isMobileUi ? expandedTaskId === task.id : mobileLevel >= MOBILE_TASK_LEVELS.details;
      const overdue = getTaskDueBucket(task).startsWith("Overdue");
      return (
  <li
    key={task.id}
    id={`${status}-task-${task.id}`}
    className={`task-card${isMobileUi ? ` mobile-task-card mobile-task-level-${mobileLevel}` : ""}${status === "inProgress" ? " in-progress-task-card" : ""}${task.priority === "HIGH" && !isMobileUi ? " task-card-high" : ""}${overdue ? " is-overdue" : ""}${mobileSummaryOpen ? " expanded" : ""}`}
    onClick={() => toggleTaskExpansion(task.id)}
    onKeyDown={(event) => { if (isMobileUi && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); toggleTaskExpansion(task.id); } }}
    role={isMobileUi ? "button" : undefined}
    tabIndex={isMobileUi ? 0 : undefined}
    aria-expanded={isMobileUi ? mobileSummaryOpen : expandedTaskId === task.id}
    aria-label={isMobileUi ? `${task.title}, ${getWorkflowLabel(status)}. Detail level ${mobileLevel} of 3.` : undefined}
  >
    <div>
      <div className="task-title-row">
        <strong className="task-title-text">{task.title}</strong>

        {getTaskCourseOrCategory(task) ? (
          <span
            className="task-course-pill"
            style={{
              backgroundColor: getCourseColor(getTaskCourseOrCategory(task)),
              color: getTextColorForCourse(getTaskCourseOrCategory(task)),
            }}
          >
            {getTaskCourseOrCategory(task)}
          </span>
        ) : null}

        {isMobileUi ? <span className="mobile-workflow-pill">{getWorkflowLabel(status)}</span> : status === "inProgress" ? <span className="in-progress-status-pill">In Progress</span> : null}
        {renderTaskReminderIndicator(task)}
      </div>

      {mobileSummaryOpen && <div className="task-details">{formatTaskDetails(task)}</div>}
      {overdue || mobileSummaryOpen ? renderAssignmentCountdown(task) : null}
      {mobileSummaryOpen && renderSubtaskProgressLine(task)}
    </div>

    {mobileSummaryOpen && renderTaskActionButtons(task, status)}

    {mobileDetailsOpen && (
      <div
        className="task-notes-panel"
        onClick={(event) => event.stopPropagation()}
      >
        {renderExpandedTaskDetails(task, `${status}-widget-notes-${task.id}`)}
      </div>
    )}
  </li>
      );
    };
    return (
      <div className="task-master-widget">
        {!onlyBucket && !isMobileUi && status === "completed" ? <div className="desktop-task-master-toolbar">{renderFilterToggle()}<button type="button" className="btn btn-secondary" onClick={handleArchiveAll} disabled={unarchivedCompletedCount === 0}>Archive All</button></div> : !onlyBucket ? renderFilterToggle() : null}
        {isMobileUi && <div className="task-master-heading"><h3>{status === "todo" ? `${schoolLevelCopy.todoLabel} (${source.length})` : status === "inProgress" ? `In Progress (${source.length})` : `Completed ${schoolLevelCopy.taskPlural} (${source.length})`}</h3>{status === "completed" && <button type="button" className="btn btn-secondary" onClick={handleArchiveAll} disabled={unarchivedCompletedCount === 0}>Archive All</button>}</div>}
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
      onResize={(width, height, canvasWidth, x = instance.x, y = instance.y, resizeState = {}) => updateWidgetInstance(instance.id, resizeState.collapsed
        ? { width, collapsedHeight: height, x, y, xRatio: canvasWidth > 0 ? x / canvasWidth : instance.xRatio }
        : { width, height, expandedHeight: height, x, y, xRatio: canvasWidth > 0 ? x / canvasWidth : instance.xRatio }, { canvasWidth })}
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

  const getWorkspaceCanvasHeight = (items) => Math.max(420, ...items.map((item) => (Number(item.y) || 0) + (workspaceLayout.collapsed[item.type] ? Math.max(COLLAPSED_WIDGET_HEIGHT, Number(item.collapsedHeight) || COLLAPSED_WIDGET_HEIGHT) : Number(item.height) || 320) + 30));
  const responsiveWorkspaceLayout = workspaceCanvasWidth > 0
    ? normalizeWorkspaceLayout(structuredClone(workspaceLayout), {
        mode: workspaceMode,
        canvasWidth: workspaceCanvasWidth,
        reflowForCanvas: true,
        collapsed: workspaceLayout.collapsed,
      })
    : workspaceLayout;
  const renderWorkspaceForTab = (tab) => {
    const items = (responsiveWorkspaceLayout[workspaceMode]?.[tab] || []).filter((item) => !item.hidden);
    return <WorkspaceCanvas height={getWorkspaceCanvasHeight(items)}>
      {items.map(renderWorkspaceInstance)}
    </WorkspaceCanvas>
  };
  const renderWorkspaceExtrasForTab = (tab) => {
    const extras = (responsiveWorkspaceLayout[workspaceMode]?.[tab] || []).filter((item) => !item.hidden);
    return extras.length > 0 ? <WorkspaceCanvas height={getWorkspaceCanvasHeight(extras)}>{extras.map(renderWorkspaceInstance)}</WorkspaceCanvas> : null;
  };

  if (authInitializing) {
    return <div className={`App ${theme} auth-screen`}><main className="auth-card" role="status"><div className="brand-lockup brand-lockup-loading"><GlowDocketLogo decorative /><h1 className="app-title">GlowDocket</h1></div><p>Restoring your secure session…</p></main></div>;
  }

  if (!currentUser || authMode === "recovery") {
    return (
      <div className={`App ${theme} welcome-screen`}>
        <div className="welcome-motion-scene" aria-hidden="true">
          <span className="welcome-orb welcome-orb-one" /><span className="welcome-orb welcome-orb-two" /><span className="welcome-orb welcome-orb-three" />
          <span className="welcome-laser welcome-laser-one" /><span className="welcome-laser welcome-laser-two" />
          <div className="welcome-particles">{Array.from({ length: 18 }, (_, index) => <i key={index} />)}</div>
        </div>
        <a className="skip-link" href="#welcome-main-content">Skip to main content</a>
        <main id="welcome-main-content" className="welcome-page" tabIndex="-1">
          <header className="hero-card welcome-top-header">
            <div>
              <p className="eyebrow">{schoolLevelCopy.eyebrow}</p>
              <div className="brand-lockup hero-brand"><GlowDocketLogo decorative /><h1 className="app-title">GlowDocket</h1></div>
              {userSettings.showHeaderSubtitle && (
                <p className="hero-subtitle">
                  {schoolLevelCopy.subtitle}
                </p>
              )}
            </div>
            <div className="welcome-header-actions">
              <button type="button" className="btn btn-secondary welcome-header-signin" onClick={() => showWelcomeAuth("signin")}>I Already Have an Account</button>
              <button type="button" className="btn btn-secondary welcome-header-guest" onClick={continueAsGuest}>Continue as Guest</button>
            </div>
          </header>
          <section className="welcome-hero" aria-labelledby="welcome-title">
            <div className="welcome-hero-copy">
              <p className="eyebrow">Your schoolwork, finally in one place</p>
              <h1 id="welcome-title" className="welcome-title"><span>Plan less.</span> <span>Know what to do next.</span></h1>
              <p>GlowDocket brings assignments, checklists, calendars, reminders, and your own workspace together in a planner that feels like yours.</p>
              <div className="welcome-actions">
                <button type="button" className="btn btn-primary welcome-get-started" onClick={() => showWelcomeAuth("signup")}>Get Started</button>
              </div>
              <div className="welcome-trust"><span aria-hidden="true">&#10003;</span><strong>Local-first by design.</strong> Your planner keeps working on this device, with optional account sync when configured.</div>
            </div>
            <div className="welcome-preview" aria-label="A preview of GlowDocket's planner"><span className="welcome-preview-shine" aria-hidden="true" />
              <div className="welcome-preview-top"><span>Today</span><strong>3 things to tackle</strong></div>
              <div className="welcome-preview-task"><i className="is-blue" /><span><strong>Finish History outline</strong><small>Recommended next</small></span><b>Today</b></div>
              <div className="welcome-preview-task"><i className="is-purple" /><span><strong>Study Biology notes</strong><small>45 minutes</small></span><b>Tomorrow</b></div>
              <div className="welcome-preview-progress"><span style={{ width: "68%" }} /></div>
            </div>
          </section>

          <div className="welcome-energy-rail" aria-hidden="true"><div className="welcome-energy-track">{[0, 1].map((group) => <div className="welcome-energy-group" key={group}>{["Assignments organized", "Deadlines conquered", "Study plans activated", "Focus mode engaged", "GlowDocket energy", "Priorities sorted", "Courses coordinated", "Progress unlocked", "Workload balanced", "Reminders ready", "Calendar conquered", "Momentum building"].map((phrase) => <span className="welcome-energy-item" key={`${group}-${phrase}`}><b>{phrase}</b><i /></span>)}</div>)}</div></div>

          <section className="welcome-features" aria-label="What GlowDocket helps with">
            {[
              ["Plan the next move", "Get a recommended plan based on deadlines, priority, time, and progress."],
              ["Pick up on another device", "Secure account sync keeps your planner ready wherever you sign in."],
              ["Remember the deadline", "Optional browser reminders give you a friendly heads-up before work is due."],
              ["See the whole month", "Course-colored calendars make busy weeks easier to understand at a glance."],
              ["Make the space yours", "Move widgets, tune colors, and shape a workspace that fits how you think."],
            ].map(([title, copy], index) => <article className="welcome-feature-card" key={title}><span aria-hidden="true">{index + 1}</span><h2>{title}</h2><p>{copy}</p></article>)}
          </section>

          {(welcomeAuthOpen || authMode === "recovery") && <div className="welcome-auth-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && authMode !== "recovery" && !authBusy) closeWelcomeAuth(); }}>
          <section ref={authPanelRef} id="auth-panel" className="auth-card welcome-auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-heading">
          <div className="welcome-auth-heading"><div><p className="eyebrow">Ready when you are</p><h2 id="auth-heading" className="app-title">{authMode === "forgot" ? "Reset your password" : authMode === "recovery" ? "Choose a new password" : authMode === "signup" ? "Create Account" : "Sign In"}</h2></div>{authMode !== "recovery" && <button type="button" className="welcome-auth-close" onClick={closeWelcomeAuth} disabled={authBusy} aria-label="Close account panel">×</button>}</div>
          {authMode !== "forgot" && authMode !== "recovery" && <div className="auth-mode-tabs" role="tablist" aria-label="Account action">
            <button type="button" role="tab" aria-selected={authMode === "signin"} className={`tab-button ${authMode === "signin" ? "active" : ""}`} onClick={() => showWelcomeAuth("signin")}>Sign In</button>
            <button type="button" role="tab" aria-selected={authMode === "signup"} className={`tab-button ${authMode === "signup" ? "active" : ""}`} onClick={() => showWelcomeAuth("signup")}>Create Account</button>
          </div>}

          {authMode === "forgot" ? <form key="forgot" className="card-form auth-form auth-mode-content" onSubmit={handleForgotPassword}>
            <p className="auth-form-intro">Enter your account email and we’ll send you a secure recovery link.</p>
            <label htmlFor="auth-username">Email</label>
            <input id="auth-username" type="email" autoComplete="email" value={signInName} onChange={(event) => setSignInName(event.target.value)} />
            {authError && <p className="auth-error" role="alert">{authError}</p>}
            {authNotice && <p className="auth-notice" role="status" aria-live="polite">{authNotice}</p>}
            <button type="submit" className="btn btn-primary" disabled={authBusy}>{authBusy ? "Sending…" : "Send Recovery Email"}</button>
            <button type="button" className="auth-text-button" onClick={() => showWelcomeAuth("signin")}>Back to sign in</button>
          </form> : authMode === "recovery" ? <form key="recovery" className="card-form auth-form auth-mode-content" onSubmit={handleRecoveryPassword}>
            <p className="auth-form-intro">Choose a new password. GlowDocket will show any policy required by the account provider.</p>
            <label htmlFor="recovery-password">New password</label>
            <div className="password-input-row"><input id="recovery-password" type={showRecoveryPassword ? "text" : "password"} autoComplete="new-password" value={recoveryPassword} onChange={(event) => setRecoveryPassword(event.target.value)} /><button type="button" className="password-visibility-button is-icon-only" onClick={() => setShowRecoveryPassword((shown) => !shown)} aria-pressed={showRecoveryPassword} aria-label={showRecoveryPassword ? "Hide new password" : "Show new password"}><PasswordEyeIcon hidden={!showRecoveryPassword} /></button></div>
            <label htmlFor="recovery-password-confirm">Confirm new password</label>
            <div className="password-input-row"><input id="recovery-password-confirm" type={showRecoveryPasswordConfirm ? "text" : "password"} autoComplete="new-password" value={recoveryPasswordConfirm} onChange={(event) => setRecoveryPasswordConfirm(event.target.value)} /><button type="button" className="password-visibility-button is-icon-only" onClick={() => setShowRecoveryPasswordConfirm((shown) => !shown)} aria-pressed={showRecoveryPasswordConfirm} aria-label={showRecoveryPasswordConfirm ? "Hide password confirmation" : "Show password confirmation"}><PasswordEyeIcon hidden={!showRecoveryPasswordConfirm} /></button></div>
            {authError && <p className="auth-error" role="alert">{authError}</p>}
            {authNotice && <p className="auth-notice" role="status" aria-live="polite">{authNotice}</p>}
            <button type="submit" className="btn btn-primary" disabled={authBusy}>{authBusy ? "Updating…" : "Save New Password"}</button>
          </form> : <form key={authMode} className="card-form auth-form auth-mode-content" onSubmit={handleAuthSubmit}>
            <label htmlFor="auth-username">{CLOUD_SYNC_CONFIGURED ? "Email" : "Username"}</label>
            <input
              id="auth-username"
              type={CLOUD_SYNC_CONFIGURED ? "email" : "text"}
              autoComplete={CLOUD_SYNC_CONFIGURED ? "email" : "username"}
              value={signInName}
              onChange={(e) => setSignInName(e.target.value)}
            />
            {CLOUD_SYNC_CONFIGURED && authMode === "signup" && <><label htmlFor="auth-display-name">Preferred name</label><input id="auth-display-name" autoComplete="nickname" maxLength={60} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></>}
            <label htmlFor="auth-password">Password</label>
            <div className="password-input-row">
              <input
                id="auth-password"
                type={showAuthPassword ? "text" : "password"}
                autoComplete={authMode === "signin" ? "current-password" : "new-password"}
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
              />
              <button
                type="button"
                className="password-visibility-button is-icon-only"
                onClick={() => setShowAuthPassword((isVisible) => !isVisible)}
                aria-pressed={showAuthPassword}
                aria-label={showAuthPassword ? "Hide password" : "Show password"}
              >
                <PasswordEyeIcon hidden={!showAuthPassword} />
              </button>
            </div>
            {authMode === "signup" && (
              <>
                <label htmlFor="auth-confirm">Confirm Password</label>
                <div className="password-input-row"><input
                  id="auth-confirm"
                  type={showAuthPasswordConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  value={authPasswordConfirm}
                  onChange={(e) => setAuthPasswordConfirm(e.target.value)}
                /><button type="button" className="password-visibility-button is-icon-only" onClick={() => setShowAuthPasswordConfirm((shown) => !shown)} aria-pressed={showAuthPasswordConfirm} aria-label={showAuthPasswordConfirm ? "Hide password confirmation" : "Show password confirmation"}><PasswordEyeIcon hidden={!showAuthPasswordConfirm} /></button></div>
              </>
            )}
            {authError && <p className="auth-error" role="alert">{authError}</p>}
            {authNotice && <p className="auth-notice" role="status" aria-live="polite">{authNotice}</p>}
            {CLOUD_SYNC_CONFIGURED && authMode === "signin" && <button type="button" className="auth-text-button" onClick={() => showWelcomeAuth("forgot")}>Forgot password?</button>}
            <button type="submit" className="btn btn-primary" disabled={authBusy}>
              {authBusy ? (authMode === "signin" ? "Signing in…" : "Creating account…") : authMode === "signin" ? "Sign In" : "Create Account"}
            </button>
          </form>}
          <div className="auth-warning">
            <strong>{CLOUD_SYNC_CONFIGURED ? "Your password is protected by your secure account." : "Password recovery is not available for browser-only profiles."}</strong>
            <p>
              {CLOUD_SYNC_CONFIGURED ? "Your account data can sync across devices. Attachment files and push-reminder connections still stay on each browser." : "GlowDocket stores only a password verifier. Accounts and assignments stay on this browser, do not sync to other devices, and have no password recovery."}
            </p>
          </div>
          </section></div>}
          <footer className="welcome-footer">
            <span>GlowDocket helps you organize the work. You stay in charge of it.</span>
            <button type="button" className="auth-text-button" onClick={() => setPrivacyDialogOpen(true)}>Privacy &amp; Data</button>
          </footer>
        </main>
        <PrivacyDataDialog open={privacyDialogOpen} onClose={closePrivacyDialog} />
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
  const isAndroidMobile = /Android/i.test(navigator.userAgent);
  const installInstructions = isAppleMobile
    ? "On iPhone or iPad: open GlowDocket in Safari, tap Share, choose Add to Home Screen, then open GlowDocket from its new Home Screen icon."
    : isAndroidMobile
      ? "On Android: open your browser menu and choose Install app or Add to Home screen. In Chrome, this is usually under the three-dot menu."
      : "On a computer: open your browser’s address-bar install icon or menu, then choose Install GlowDocket. Chrome and Edge usually show Install app.";
  const reminderLeadAlreadyPassedCount = tasks.filter((task) => { const deadline = getEffectiveDeadline(task); return deadline && deadline.getTime() > checklistNow.getTime() && deadline.getTime() - Number(userSettings.reminderMinutes || 60) * 60000 < checklistNow.getTime() && !task.isDeleted && !task.isCompleted; }).length;
  const gamification = normalizeGamification(userSettings.gamification);
  const celebrationStudioProgress = getCelebrationStudioProgress(currentUser && currentUser !== "guest" ? userSettings.signInDays : [], accountMode === "cloud" && currentUser !== "guest" && isGamificationTestAccount(accountEmail));
  const selectedCelebrationOption = GAMIFICATION_CONFETTI.find((option) => option.id === gamification.selectedConfetti) || GAMIFICATION_CONFETTI[0];
  const selectedCelebrationColors = getCelebrationColorsForStyle(userSettings.celebrationColors, selectedCelebrationOption.id);
  const selectedCelebrationColorFields = selectedCelebrationOption.id === "none" ? [] : [
    ...(CELEBRATION_STYLE_COLOR_FIELDS[selectedCelebrationOption.id] || CELEBRATION_STYLE_COLOR_FIELDS.standard).map((key) => {
      const field = CELEBRATION_COLOR_FIELDS.find((candidate) => candidate.key === key);
      return { ...field, label: CELEBRATION_STYLE_COLOR_LABELS[selectedCelebrationOption.id]?.[key] || field.label };
    }),
    ...CELEBRATION_COLOR_FIELDS.filter((field) => ["accent", "toastBackground", "toastText"].includes(field.key)),
  ];
  const selectedCelebrationPreviewColors = selectedCelebrationColorFields.filter((field) => field.key.startsWith("palette")).map((field) => selectedCelebrationColors[field.key] || field.fallback);
  const weeklyMomentum = summarizeWeeklyMomentum(tasks, gamification, { now: checklistNow, weekStartsOn: userSettings.calendarWeekStartsOn });
  const gamificationTitle = getGamificationTitle(gamification);
  const earnedAchievements = new Set(gamification.earnedAchievementIds);
  const selectedAchievement = GAMIFICATION_ACHIEVEMENTS.find((achievement) => achievement.id === gamification.selectedBadge);
  const lockedTitleOptions = GAMIFICATION_TITLES.filter((option) => option.requirement && !earnedAchievements.has(option.requirement)).map((option) => ({ ...option, achievement: GAMIFICATION_ACHIEVEMENTS.find((achievement) => achievement.id === option.requirement) }));
  const lockedCelebrationOptions = GAMIFICATION_CONFETTI.filter((option) => option.requirement && !earnedAchievements.has(option.requirement)).map((option) => ({ ...option, achievement: GAMIFICATION_ACHIEVEMENTS.find((achievement) => achievement.id === option.requirement) }));
  const updateGamification = (changes) => handleAddFieldSettingChange("gamification", normalizeGamification({ ...gamification, ...changes }));
  const mobileOwnedTabs = ["dashboard", "todo", "inProgress", "completed", "mobile-add", "mobile-tools", "mobile-courses"];
  const mobileUsesOwnScreen = isMobileUi && mobileOwnedTabs.includes(currentTab);
  const mobileTaskTabActive = ["todo", "inProgress", "completed"].includes(currentTab);
  const mobileMoreActive = ["settings", "recommendations", "mobile-tools", "mobile-courses"].includes(currentTab);
  const selectedMobileSettingsSection = SETTINGS_SECTIONS.find((section) => section.id === settingsSection) || SETTINGS_SECTIONS[0];
  const normalizedHelpSearch = helpSearch.trim().toLowerCase();
  const visiblePersonalizationTips = PERSONALIZATION_TIPS
    .map(([title, copy]) => ({ title, copy, category: getPersonalizationTipCategory(title) }))
    .filter(({ title, copy, category }) => (
      (helpCategory === "All" || category === helpCategory)
      && (!normalizedHelpSearch || `${title} ${copy} ${category}`.toLowerCase().includes(normalizedHelpSearch))
    ));
  const savedMobileAccordion = userSettings.mobileSettingsExpandedCards
    && typeof userSettings.mobileSettingsExpandedCards === "object"
    && !Array.isArray(userSettings.mobileSettingsExpandedCards)
    ? userSettings.mobileSettingsExpandedCards
    : {};
  const getDefaultMobileCardId = (sectionId) => {
    if (sectionId === "account" && !currentUser && CLOUD_SYNC_CONFIGURED) return "add-email-enable-cross-device-sync";
    return MOBILE_SETTINGS_FIRST_CARD[sectionId] || "";
  };
  const getMobileExpandedCards = (sectionId) => {
    const saved = savedMobileAccordion[sectionId];
    if (Array.isArray(saved) && saved.every((cardId) => typeof cardId === "string")) return saved;
    const firstCardId = getDefaultMobileCardId(sectionId);
    return firstCardId ? [firstCardId] : [];
  };
  const isMobileSettingsCardExpanded = (cardId, sectionId = settingsSection) => (
    getMobileExpandedCards(sectionId).includes(cardId)
  );
  const setMobileSettingsCardExpanded = (cardId, expanded, sectionId = settingsSection) => {
    const currentCards = getMobileExpandedCards(sectionId);
    const nextCards = expanded
      ? [...new Set([...currentCards, cardId])]
      : currentCards.filter((currentCardId) => currentCardId !== cardId);
    handleAddFieldSettingChange("mobileSettingsExpandedCards", {
      ...savedMobileAccordion,
      [sectionId]: nextCards,
    });
  };
  const toggleMobileSettingsCard = (cardId, sectionId = settingsSection) => {
    setMobileSettingsCardExpanded(cardId, !isMobileSettingsCardExpanded(cardId, sectionId), sectionId);
  };
  const settingsAccordionValue = {
    isMobile: isMobileUi,
    isExpanded: isMobileSettingsCardExpanded,
    toggle: toggleMobileSettingsCard,
  };
  const appearanceExpanded = isMobileUi ? isMobileSettingsCardExpanded("appearance", "personalization") : appearanceSettingsOpen;
  const personalizationTipsExpanded = isMobileUi ? isMobileSettingsCardExpanded("personalization-tips", "personalization") : personalizationTipsOpen;
  const colorStudioExpanded = isMobileUi ? isMobileSettingsCardExpanded("full-color-studio", "personalization") : colorStudioOpen;
  const toggleAppearanceSettings = () => isMobileUi
    ? toggleMobileSettingsCard("appearance", "personalization")
    : setAppearanceSettingsOpen((open) => !open);
  const togglePersonalizationTips = () => isMobileUi
    ? toggleMobileSettingsCard("personalization-tips", "personalization")
    : setPersonalizationTipsOpen((open) => !open);
  const toggleColorStudio = () => isMobileUi
    ? toggleMobileSettingsCard("full-color-studio", "personalization")
    : setColorStudioOpen((open) => !open);
  const openColorStudio = () => {
    if (isMobileUi) setMobileSettingsCardExpanded("full-color-studio", true, "personalization");
    else setColorStudioOpen(true);
  };
  const openMobileSettingsSection = (sectionId) => {
    setStorageView(null);
    setSettingsSection(sectionId);
    if (!isMobileUi) return;
    mobileSettingsListScrollRef.current = document.querySelector(".mobile-app-ui .app-shell")?.scrollTop || 0;
    mobileSettingsScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    window.history.pushState({ taskcabinetMobilePanel: "settings" }, "");
    setMobileSettingsOpen(true);
  };
  const closeMobileSettings = () => {
    setStorageView(null);
    if (window.history.state?.taskcabinetMobilePanel === "settings") window.history.back();
    else setMobileSettingsOpen(false);
  };
  const openMobileSummary = (category) => {
    window.history.pushState({ taskcabinetMobilePanel: "summary" }, "");
    setMobileSummaryCategory(category);
  };
  const closeMobileSummary = () => {
    if (window.history.state?.taskcabinetMobilePanel === "summary") window.history.back();
    else setMobileSummaryCategory("");
  };
  const openMobileTab = (tab) => {
    setCurrentTab(tab);
    setMobileMoreOpen(false);
    setMobileSettingsOpen(false);
    setStorageView(null);
    const behavior = userSettings.reduceMotion ? "auto" : "smooth";
    document.querySelector(".mobile-app-ui .app-shell")?.scrollTo({ top: 0, behavior });
    window.scrollTo({ top: 0, behavior });
  };
  const renderMobilePageTitle = (eyebrow, title, copy) => <MobilePageTitle eyebrow={eyebrow} title={title} copy={copy} />;
  const mobileTodayTasks = activeDashboardTasks.filter((task) => getTaskDueBucket(task).startsWith("Due Today"));
  const mobileOverdueTasks = mobileDueGroups.overdue;
  const mobileSummaryTasks = mobileSummaryCategory === "active"
    ? mobileDueGroups.active
    : mobileSummaryCategory === "today"
      ? mobileTodayTasks
      : mobileSummaryCategory === "overdue"
        ? mobileOverdueTasks
        : [];
  const mobileSummaryTitle = { active: "Active assignments", today: "Due today", overdue: "Overdue" }[mobileSummaryCategory] || "Assignments";
  const openMobileAdd = (returnTab = currentTab) => {
    setMobileReturnTab(returnTab === "mobile-add" ? "dashboard" : returnTab);
    setMobileSummaryCategory("");
    setBulkImportOpen(false);
    setCurrentTab("mobile-add");
  };
  const closeMobileAdd = () => {
    setCalendarAddOpen(false);
    setCurrentTab(mobileReturnTab || "dashboard");
  };
  const renderMobileSummaryAssignments = () => mobileSummaryTasks.length === 0 ? (
    <p className="mobile-fullscreen-empty friendly-empty">There are no assignments in this category right now.</p>
  ) : (
    <ul className="task-list mobile-summary-task-list">
      {mobileSummaryTasks.map((task) => {
        const status = getTaskStatus(task);
        const level = mobileTaskLevels[task.id] || MOBILE_TASK_LEVELS.compact;
        const summaryOpen = level >= MOBILE_TASK_LEVELS.summary;
        const detailsOpen = level >= MOBILE_TASK_LEVELS.details;
        return <li key={task.id} className={`task-card mobile-task-card mobile-task-level-${level}${getTaskDueBucket(task).startsWith("Overdue") ? " is-overdue" : ""}`} role="button" tabIndex="0" aria-expanded={summaryOpen} onClick={() => toggleTaskExpansion(task.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleTaskExpansion(task.id); } }}><div><div className="task-title-row"><strong className="task-title-text">{task.title}</strong><span className="task-course-pill" style={{ backgroundColor: getCourseColor(getTaskCourseOrCategory(task)), color: getTextColorForCourse(getTaskCourseOrCategory(task)) }}>{getTaskCourseOrCategory(task)}</span><span className="mobile-workflow-pill">{getWorkflowLabel(status)}</span></div>{summaryOpen && <div className="task-details">{formatTaskDetails(task)}</div>}{getTaskDueBucket(task).startsWith("Overdue") || summaryOpen ? renderAssignmentCountdown(task) : null}{summaryOpen && renderSubtaskProgressLine(task)}</div>{summaryOpen && renderTaskActionButtons(task, status)}{detailsOpen && <div className="task-notes-panel" onClick={(event) => event.stopPropagation()}>{renderExpandedTaskDetails(task, `mobile-summary-notes-${task.id}`)}</div>}</li>;
      })}
    </ul>
  );
  return (
    <div className={`App ${theme} school-level-${userSettings.schoolLevel || "high"} text-size-${userSettings.textSize || "medium"} font-${userSettings.fontFamily || "sans"} density-${userSettings.interfaceDensity || "comfortable"} task-actions-${userSettings.taskActionLayout || "wrap"}${userSettings.showTaskCourseBadge === false ? " hide-task-course-badges" : ""}${userSettings.showTaskDetailLine === false ? " hide-task-detail-lines" : ""}${userSettings.showTaskCountdown === false ? " hide-task-countdowns" : ""}${userSettings.showTaskChecklistProgress === false ? " hide-task-checklist-progress" : ""}${userSettings.showTaskReminderIndicator === false ? " hide-task-reminder-indicators" : ""}${userSettings.reduceMotion ? " reduce-motion" : ""}${isStandalone ? " is-standalone" : ""}${isMobileUi && currentUser ? " mobile-app-ui" : ""}${isMobileUi && (mobileMoreOpen || mobileSettingsOpen || mobileSummaryCategory || selectedChecklistId) ? " mobile-overlay-open" : ""}`}>
      <div className="app-shell">
        <a className="skip-link" href={isMobileUi ? "#mobile-main-content" : "#workspace-main-content"}>Skip to main content</a>
        {isMobileUi && currentUser && (
          <header className="mobile-app-header">
            <button type="button" className="mobile-app-brand" onClick={() => openMobileTab("dashboard")} aria-label="Open mobile home">
              <GlowDocketLogo decorative />
              <div><strong>GlowDocket</strong></div>
            </button>
            {gamification.showHeaderSummary && <button type="button" className="mobile-momentum-summary" onClick={() => setGamificationOpen(true)} aria-label={`Weekly momentum: ${weeklyMomentum.completed} of ${weeklyMomentum.goal}. Displayed badge: ${selectedAchievement?.title || "none"}. ${earnedAchievements.size} badges earned. Open achievements.`}><span className="mobile-momentum-badge" aria-hidden="true"><AchievementEmblem id={selectedAchievement?.id} /></span><strong>{weeklyMomentum.completed}/{weeklyMomentum.goal}</strong><small>Momentum</small></button>}
            <button type="button" className="mobile-app-profile-button" onClick={() => setMobileMoreOpen(true)} aria-label="Open account and more menu">
              {safeDisplayName.charAt(0).toUpperCase()}
            </button>
          </header>
        )}
        {/* The header is always visible and identifies the active local profile. */}
        <header className="hero-card">
          <div>
            <p className="eyebrow">{schoolLevelCopy.eyebrow}</p>
            <div className="brand-lockup hero-brand"><GlowDocketLogo decorative /><h1 className="app-title">GlowDocket</h1></div>
            {userSettings.showHeaderSubtitle && (
              <p className="hero-subtitle">
                {schoolLevelCopy.subtitle}
              </p>
            )}
          </div>

          <div className="hero-status-stack">
            <div className="user-pill">{currentUser ? `Signed in as ${displayName || "GlowDocket user"}` : "Guest Mode"}</div>
            {gamification.showHeaderSummary && <button type="button" className="momentum-header-summary" onClick={() => setGamificationOpen(true)} aria-label={`Weekly momentum: ${weeklyMomentum.completed} of ${weeklyMomentum.goal} assignments, ${weeklyMomentum.productiveDays} productive days, displayed badge ${selectedAchievement?.title || "none"}, ${earnedAchievements.size} badges earned. Open achievements.`}><span className="momentum-summary-copy"><strong>{gamificationTitle.label}</strong><small>{weeklyMomentum.completed}/{weeklyMomentum.goal} this week · {weeklyMomentum.productiveDays} active day{weeklyMomentum.productiveDays === 1 ? "" : "s"}</small></span><span className={`momentum-badge-stage badge-${selectedAchievement?.id || "empty"} tone-${selectedAchievement?.tone || "gold"}`} title={selectedAchievement ? `Displayed badge: ${selectedAchievement.title}` : "Complete an assignment to earn your first badge"} aria-hidden="true"><span className="achievement-medallion"><span className="achievement-rays" /><span className="achievement-core"><span className="achievement-icon"><AchievementEmblem id={selectedAchievement?.id} /></span></span><span className="achievement-ornament">✦</span></span></span><progress max="100" value={weeklyMomentum.progress}>{weeklyMomentum.progress}%</progress><em className="momentum-badge-count">{earnedAchievements.size}</em></button>}
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
            Feedback & Support
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
              <span>{displayName || "GlowDocket user"}</span>
              {CLOUD_SYNC_CONFIGURED && accountMode === "cloud" && (syncStatus === "conflict" ? <button type="button" className={`cloud-sync-status is-${syncStatus}`} onClick={() => setSyncConflictOpen(true)}>Two versions need review</button> : <span className={`cloud-sync-status is-${syncStatus}`} role="status" aria-live="polite">{{ saved: "All changes saved", saving: "Saving changes…", offline: "Offline — saved on this device", reconnecting: "Back online — reconnecting…", failed: "Online saving paused", "cloud-loading": "Loading your saved planner…", initializing: "Checking your account…" }[syncStatus] || "Preparing your planner…"}</span>)}
              {CLOUD_SYNC_CONFIGURED && accountMode === "local" && <span className="cloud-sync-status">Local profile</span>}
              {CLOUD_SYNC_CONFIGURED && accountMode === "cloud" && syncStatus === "failed" && <button type="button" className="btn btn-secondary" onClick={retryCloudSync}>Retry</button>}
              {CLOUD_SYNC_CONFIGURED && accountMode === "cloud" && ["failed", "offline"].includes(syncStatus) && syncError && <span className="cloud-sync-error">{syncError}</span>}
              <button className="btn btn-danger sign-out-button" onClick={handleSignOut}>Sign Out</button>
            </div>
          )}
        </div>

        {assignmentSaveError && <div className="persistent-status-banner is-error" role="alert"><strong>Assignment not saved</strong><span>{assignmentSaveError}</span><button type="button" onClick={() => setAssignmentSaveError("")} aria-label="Dismiss assignment save warning">×</button></div>}

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

        {isMobileUi && currentUser && mobileUsesOwnScreen && (
          <main id="mobile-main-content" className={`mobile-app-main${currentTab === "mobile-add" ? " mobile-add-fullscreen" : ""}${mobileTaskTabActive ? " mobile-task-page" : ""}`} tabIndex="-1">
            {currentTab === "dashboard" && (
              <>
                {renderMobilePageTitle("Today", `Ready when you are, ${displayName || "student"}.`, dueTodayCount > 0 ? `${dueTodayCount} assignment${dueTodayCount === 1 ? "" : "s"} due today.` : "Nothing is due today.")}
                <section className="mobile-app-stat-strip" aria-label="Assignment summary">
                  <button type="button" disabled={activeTasksCount === 0} onClick={() => openMobileSummary("active")}><strong>{activeTasksCount}</strong><span>Active</span></button>
                  <button type="button" disabled={mobileTodayTasks.length === 0} className={mobileTodayTasks.length > 0 ? "has-warning" : ""} onClick={() => openMobileSummary("today")}><strong>{mobileTodayTasks.length}</strong><span>Today</span></button>
                  <button type="button" disabled={mobileOverdueTasks.length === 0} className={mobileOverdueTasks.length > 0 ? "has-danger" : ""} onClick={() => openMobileSummary("overdue")}><strong>{mobileOverdueTasks.length}</strong><span>Overdue</span></button>
                </section>
                <section className="mobile-app-card mobile-app-plan-card">
                  <div className="mobile-app-section-heading"><div><h3>Best Next Steps</h3></div><button type="button" onClick={() => openMobileTab("todo")}>View tasks</button></div>
                  {renderRecommendedWidget()}
                </section>
                <section className="mobile-app-card mobile-app-quick-card">
                  <div className="mobile-app-section-heading"><div><h3>Find a quick task</h3></div></div>
                  {renderQuickMatchCard()}
                </section>
                <section className="mobile-app-card mobile-dashboard-checklists">
                  <div className="mobile-app-section-heading"><div><span>Stay organized</span><h3>Checklists</h3></div><div className="mobile-checklist-heading-actions">{checklists.length > 0 && <button type="button" onClick={() => { setChecklistSelectionMode((active) => !active); setSelectedChecklistIds([]); }}>{checklistSelectionMode ? "Cancel" : "Select"}</button>}<button type="button" onClick={handleCreateChecklist}>New list</button><button type="button" onClick={() => openMobileTab("mobile-tools")}>More tools</button></div></div>
                  {renderStandaloneChecklists()}
                </section>
              </>
            )}

            {mobileTaskTabActive && (
              <>
                {renderMobilePageTitle("Assignments", "Your tasks", "Move between each stage without leaving this screen.")}
                <nav className="mobile-app-segmented" aria-label="Assignment status">
                  <button type="button" className={currentTab === "todo" ? "active" : ""} onClick={() => openMobileTab("todo")}>To Do <span>{todoTasks.length}</span></button>
                  <button type="button" className={currentTab === "inProgress" ? "active" : ""} onClick={() => openMobileTab("inProgress")}>Doing <span>{inProgressTasks.length}</span></button>
                  <button type="button" className={currentTab === "completed" ? "active" : ""} onClick={() => openMobileTab("completed")}>Done <span>{completedTasks.length}</span></button>
                </nav>
                <section className="mobile-app-card mobile-app-task-screen">
                  {renderTaskMasterWidget(currentTab)}
                </section>
              </>
            )}

            {currentTab === "mobile-add" && (
              <>
                <header className="mobile-fullscreen-header inline-mobile-fullscreen-header"><div><p>New assignment</p><h2>{schoolLevelCopy.addLabel}</h2><span>Add the basics now and optional details when you need them.</span></div><button type="button" onClick={closeMobileAdd} aria-label="Close Add Assignment">×</button></header>
                <div className="mobile-add-scroll-body"><section className="mobile-app-card mobile-app-add-screen">{renderAddAssignmentForm("mobile")}</section></div>
              </>
            )}

            {currentTab === "mobile-tools" && (
              <>
                {renderMobilePageTitle("", "Study tools", "The same GlowDocket features, arranged for a phone.")}
                <section className="mobile-app-card"><div className="mobile-app-section-heading"><div><span>Plan ahead</span><h3>Reminders</h3></div></div>{renderRemindersWidget()}</section>
                <section className="mobile-app-card"><div className="mobile-app-section-heading"><div><span>By subject</span><h3>{schoolLevelCopy.courseLabel} overview</h3></div></div>{renderCourseOverviewWidget()}</section>
              </>
            )}

            {currentTab === "mobile-courses" && (
              <>
                {renderMobilePageTitle("", "Courses and Colors", "Course changes are saved to this same account on desktop and mobile.")}
                <section className="mobile-app-card">{renderCourseColorsWidget()}</section>
              </>
            )}
          </main>
        )}

        {isMobileUi && currentUser && mobileSummaryCategory && (
          <section className="mobile-fullscreen-panel" role="dialog" aria-modal="true" aria-labelledby="mobile-summary-title">
            <header className="mobile-fullscreen-header"><div><p>Assignment category</p><h2 id="mobile-summary-title">{mobileSummaryTitle}</h2><span>{mobileSummaryTasks.length} assignment{mobileSummaryTasks.length === 1 ? "" : "s"}</span></div><button type="button" onClick={closeMobileSummary} aria-label="Close assignment category">×</button></header>
            <main>{renderMobileSummaryAssignments()}</main>
          </section>
        )}

        <div className={`workspace-layout workspace-mode-${workspaceMode}${currentTab === "calendar" ? " workspace-calendar-only" : " workspace-customizable"}${workspaceCanvasWidth > 0 ? " is-measured" : " is-measuring"}${mobileUsesOwnScreen ? " mobile-app-desktop-content-hidden" : ""}`}>
          <main id="workspace-main-content" className="workspace-main" ref={workspaceMainRef} tabIndex="-1">

        {currentTab === "dashboard" && renderWorkspaceForTab("dashboard")}
        {!isMobileUi && currentTab !== "dashboard" && currentTab !== "calendar" && renderWorkspaceExtrasForTab(currentTab)}

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
                                  backgroundColor: getCourseColor(getTaskCourseOrCategory(task)),
                                  color: getTextColorForCourse(getTaskCourseOrCategory(task)),
                                }}
                              >
                                {getTaskCourseOrCategory(task)}
                              </span>
                            </div>

                            {renderRecommendationMetadata(item)}

                            {renderSubtaskProgressLine(
                              task,
                              "recommended-plan-progress",
                            )}
                          </div>
                        </button>
                        <div className="recommended-plan-actions">
                          <button type="button" className="btn btn-primary" onClick={() => handleFocusStart(task.id)}>Focus</button>
                          <button type="button" className="btn btn-secondary" onClick={() => handleRecommendedTaskClick(task.id)}>{getFocusActionLabel(task)}</button>
                          {taskStatus === "todo" && (
                            <button type="button" className="btn btn-primary" onClick={() => handleQuickMatchStart(task.id)}>In Progress</button>
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
                      <label htmlFor="new-course-name">Add course by entering a name and pressing Add below</label>

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
                        className={`course-color-row course-reorder-row${draggedCourse === course ? " dragging" : ""}${courseDropTarget?.course === course ? ` drop-${courseDropTarget.position}` : ""}`}
                        onDragOver={(event) => {
                          event.preventDefault();
                          const bounds = event.currentTarget.getBoundingClientRect();
                          setCourseDropTarget({ course, position: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after" });
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          handleCourseDrop(course, courseDropTarget?.position || "before");
                        }}
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
                        <button
                          type="button"
                          className="course-drag-handle"
                          draggable
                          aria-label={`Drag ${course} to reorder`}
                          title="Drag to reorder. Press Alt+Up or Alt+Down to move with the keyboard."
                          onKeyDown={(event) => {
                            if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
                            event.preventDefault();
                            handleCourseMove(course, event.key === "ArrowUp" ? -1 : 1);
                          }}
                          onDragStart={(event) => {
                            setDraggedCourse(course);
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", course);
                          }}
                          onDragEnd={() => {
                            setDraggedCourse(null);
                            setCourseDropTarget(null);
                          }}
                        >
                          ⋮⋮
                        </button>
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
                                  <span className="task-course-pill" style={{ backgroundColor: getCourseColor(getTaskCourseOrCategory(task)), color: getTextColorForCourse(getTaskCourseOrCategory(task)) }}>{getTaskCourseOrCategory(task)}</span>
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
                                  In Progress
                                </button>

                                <button
                                  className="btn btn-primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleComplete(task.id, { celebrationOrigin: getCelebrationOrigin(e.currentTarget) });
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
                                  <span className="task-course-pill" style={{ backgroundColor: getCourseColor(getTaskCourseOrCategory(task)), color: getTextColorForCourse(getTaskCourseOrCategory(task)) }}>{getTaskCourseOrCategory(task)}</span>
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
                                    handleComplete(task.id, { celebrationOrigin: getCelebrationOrigin(e.currentTarget) });
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
                          <span className="task-course-pill" style={{ backgroundColor: getCourseColor(getTaskCourseOrCategory(task)), color: getTextColorForCourse(getTaskCourseOrCategory(task)) }}>{getTaskCourseOrCategory(task)}</span>
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
                  <DeferredCalendar
                    onChange={handleCalendarDateChange}
                    value={selectedDate}
                    minDetail="decade"
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
                          : "No courses are scheduled for this day yet"}
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
                            onClick={() => setExpandedTaskId((currentId) => currentId === task.id ? null : task.id)}
                          >
                            <div>
                              <div className="task-title-row">
                                <strong className="task-title-text">{task.title}</strong>
                                <span className="task-course-pill" style={{ backgroundColor: getCourseColor(getTaskCourseOrCategory(task)), color: getTextColorForCourse(getTaskCourseOrCategory(task)) }}>{getTaskCourseOrCategory(task)}</span>
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
                                {isMobileUi ? "Tap to view assignment details and notes" : "Click to view assignment details and notes"}
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
                      {calendarAddOpen ? "Cancel" : isMobileUi ? `+ ${schoolLevelCopy.addLabel} for this day` : `➕ ${schoolLevelCopy.addLabel}`}
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
            <section className="recommendations-page feedback-support-page panel-card" aria-labelledby="feedback-support-title">
              <div className="recommendations-header">
                <p className="eyebrow">We’re here to help</p>
                <h2 id="feedback-support-title">Feedback & Support</h2>
                <p>Report a problem, request a feature, or tell us what would make GlowDocket work better for you.</p>
              </div>

              <form className="recommendations-form feedback-support-form" onSubmit={handleFeedbackSubmit}>
                <label htmlFor="feedback-category">Feedback category</label>
                <select id="feedback-category" value={feedbackCategory} onChange={(event) => { setFeedbackCategory(event.target.value); setFeedbackStatus("idle"); setFeedbackNotice(""); }} disabled={feedbackStatus === "sending"}>
                  {FEEDBACK_CATEGORIES.map((item) => <option key={item.value || "none"} value={item.value}>{item.label}</option>)}
                </select>
                <label htmlFor="feedback-message">Message</label>
                <textarea
                  id="feedback-message"
                  value={feedbackMessage}
                  onChange={(event) => {
                    setFeedbackMessage(event.target.value);
                    setFeedbackStatus("idle");
                    setFeedbackNotice("");
                  }}
                  placeholder="Tell us what happened, what you expected, or what could be improved."
                  maxLength={FEEDBACK_MAX_MESSAGE_LENGTH}
                  rows={8}
                  required
                  disabled={feedbackStatus === "sending"}
                  aria-describedby="feedback-message-counter"
                />
                <span id="feedback-message-counter" className="recommendations-counter" aria-live="polite">{feedbackMessage.length.toLocaleString()} / 5,000 characters</span>

                <fieldset className="feedback-screenshot-fieldset" disabled={feedbackStatus === "sending"}>
                  <legend>Optional screenshot</legend>
                  <p>PNG, JPEG, or WebP · Maximum 5 MB · Stored privately</p>
                  <label className="btn btn-secondary feedback-file-button">{feedbackScreenshot ? "Replace screenshot" : "Choose screenshot"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFeedbackScreenshotChange} /></label>
                  {feedbackScreenshotPreview && <div className="feedback-screenshot-preview"><img src={feedbackScreenshotPreview} alt="Selected feedback screenshot preview" /><div><span>{feedbackScreenshot?.type.replace("image/", "").toUpperCase()} · {(feedbackScreenshot.size / 1024 / 1024).toFixed(2)} MB</span><button type="button" className="btn btn-secondary" onClick={removeFeedbackScreenshot}>Remove screenshot</button></div></div>}
                </fieldset>

                <label className="feedback-contact-permission" htmlFor="feedback-allow-contact"><input id="feedback-allow-contact" type="checkbox" checked={feedbackAllowContact} onChange={(event) => setFeedbackAllowContact(event.target.checked)} disabled={feedbackStatus === "sending"} /><span>You may contact me about this feedback.</span></label>
                <div className="recommendations-form-footer">
                  <small>GlowDocket version {APP_BUILD_METADATA.appVersion}</small>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={feedbackStatus === "sending" || !feedbackMessage.trim()}
                  >
                    {feedbackStatus === "sending" ? "Sending securely…" : "Send feedback"}
                  </button>
                </div>
                {feedbackNotice && (
                  <p
                    className={`recommendations-feedback ${feedbackStatus}`}
                    role={feedbackStatus === "error" ? "alert" : "status"}
                    aria-live={feedbackStatus === "error" ? "assertive" : "polite"}
                  >
                    {feedbackNotice}
                  </p>
                )}
              </form>
              <p className="feedback-direct-support">Need direct help? Email <a href={`mailto:${String(import.meta.env.VITE_SUPPORT_EMAIL || "support@glowdocket.com").trim() || "support@glowdocket.com"}`}>{String(import.meta.env.VITE_SUPPORT_EMAIL || "support@glowdocket.com").trim() || "support@glowdocket.com"}</a></p>
            </section>
          )}

          {currentTab === "settings" && (
            <div className={`card card-container settings-page-shell${isMobileUi ? " mobile-settings-page" : ""}`} style={{ marginTop: "10px" }}>
              <div className={`settings-layout${storageView ? " settings-storage-focus" : ""}`} data-active-settings-section={settingsSection}>
                {!storageView && <nav className="settings-sidebar" aria-label="Settings categories">
                  <div className="mobile-settings-list-heading"><p className="eyebrow">Settings</p>{isMobileUi && <><h2>Customize GlowDocket</h2><span>Choose a section to open its options.</span></>}</div>
                  <div className="settings-profile-chip">
                    <span>Preferences for</span>
                    <strong>{displayName || "GlowDocket user"}</strong>
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
                        onClick={() => openMobileSettingsSection(section.id)}
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
                {isMobileUi && mobileSettingsOpen && <button type="button" className="mobile-settings-backdrop" onClick={closeMobileSettings} aria-label="Close settings section" />}
                <MobileSettingsPortal active={isMobileUi && mobileSettingsOpen}>
                <div className={`settings-content${isMobileUi && mobileSettingsOpen ? " mobile-settings-panel-open" : ""}`} role={isMobileUi && mobileSettingsOpen ? "dialog" : undefined} aria-modal={isMobileUi && mobileSettingsOpen ? "true" : undefined} aria-label={isMobileUi && mobileSettingsOpen ? selectedMobileSettingsSection.label : undefined}>
                  {isMobileUi && (
                    <header className="mobile-settings-panel-header">
                      <div><span>Settings</span><h2>{selectedMobileSettingsSection.label}</h2><p>{selectedMobileSettingsSection.description}</p></div>
                      <button type="button" onClick={closeMobileSettings} aria-label="Back to settings categories">←</button>
                    </header>
                  )}
                  <div key={isMobileUi && mobileSettingsOpen ? settingsSection : "desktop-settings"} ref={mobileSettingsScrollRef} className="mobile-settings-scroll-body">
                  <SettingsAccordionProvider value={settingsAccordionValue}>
                  <div key={`${settingsSection}-${storageView || "main"}`} className={`settings-grid${storageView ? " settings-grid-hidden" : ""}${settingsSection === "personalization" ? " settings-grid-personalization" : ""}`}>
                <section className="settings-section personalization-top-section appearance-settings-section" hidden={settingsSection !== "personalization"}>
                  {!isMobileUi && <div className="settings-onboarding-card">
                    <div><p className="eyebrow">Getting started</p><h4>GlowDocket Tutorial</h4><p className="hint-text">Replay the visual introduction or manage optional sample assignments.</p></div>
                    <div className="settings-onboarding-actions"><button type="button" className="btn btn-primary" onClick={replayTutorial}>Replay Tutorial</button></div>
                  </div>}
                  <div
                    className="settings-collapse-header double-click-collapse-header"
                    onDoubleClick={(event) => toggleFromHeaderDoubleClick(event, toggleAppearanceSettings)}
                    title="Double-click to expand or minimize"
                  >
                    <h4>Appearance</h4>
                    <button
                      type="button"
                      className="settings-collapse-button"
                      onClick={(event) => toggleFromCollapseButton(event, toggleAppearanceSettings)}
                      aria-expanded={appearanceExpanded}
                      aria-controls="appearance-settings-content"
                      aria-label={`${appearanceExpanded ? "Shrink" : "Enlarge"} Appearance`}
                      title={`${appearanceExpanded ? "Shrink" : "Enlarge"} Appearance`}
                    >
                      {appearanceExpanded ? "−" : "+"}
                    </button>
                  </div>
                  {appearanceExpanded && (
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
                      <label className="settings-toggle settings-toggle-copy mobile-hidden-header-description">
                        <span><strong>Header description</strong><small>Show the school-level message below GlowDocket.</small></span>
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
                      <label className="settings-toggle settings-toggle-copy">
                        <span><strong>Weekly momentum in header</strong><small>Show your weekly goal, productive days, and selected title in the main header.</small></span>
                        <input type="checkbox" checked={gamification.showHeaderSummary} onChange={(event) => updateGamification({ showHeaderSummary: event.target.checked })} />
                      </label>
                      {!gamification.showHeaderSummary && <button type="button" className="btn btn-secondary" onClick={() => setGamificationOpen(true)}>Open Momentum & Achievements</button>}
                    </div>
                  )}
                </section>

                <section className="settings-section personalization-top-section personalization-tips" hidden={settingsSection !== "personalization"}>
                  <div
                    className="settings-collapse-header double-click-collapse-header"
                    onDoubleClick={(event) => toggleFromHeaderDoubleClick(event, togglePersonalizationTips)}
                    title="Double-click to expand or minimize"
                  >
                    <h4>Personalization Tips</h4>
                    <button
                      type="button"
                      className="settings-collapse-button"
                      onClick={(event) => toggleFromCollapseButton(event, togglePersonalizationTips)}
                      aria-expanded={personalizationTipsExpanded}
                      aria-controls="personalization-tips-content"
                      aria-label={`${personalizationTipsExpanded ? "Shrink" : "Enlarge"} Personalization Tips`}
                      title={`${personalizationTipsExpanded ? "Shrink" : "Enlarge"} Personalization Tips`}
                    >
                      {personalizationTipsExpanded ? "−" : "+"}
                    </button>
                  </div>
                  {personalizationTipsExpanded && (
                    <div id="personalization-tips-content" className="settings-collapsible-content personalization-tips-content">
                      <p className="hint-text">Browse by topic or search for a specific setting, feature, or workflow.</p>
                      <input type="search" value={helpSearch} onChange={(event) => setHelpSearch(event.target.value)} placeholder="Search reminders, assignments, layouts, colors…" aria-label="Search GlowDocket tips" />
                      <div className="personalization-tip-toolbar" role="group" aria-label="Filter personalization tips by topic">
                        {PERSONALIZATION_TIP_CATEGORIES.map((category) => (
                          <button
                            type="button"
                            key={category}
                            className={helpCategory === category ? "active" : ""}
                            aria-pressed={helpCategory === category}
                            onClick={() => setHelpCategory(category)}
                          >
                            {category}
                          </button>
                        ))}
                      </div>
                      <div className="personalization-tip-results" role="status" aria-live="polite">
                        <span>{visiblePersonalizationTips.length} {visiblePersonalizationTips.length === 1 ? "tip" : "tips"}</span>
                        <span>{helpCategory === "All" ? "All topics" : helpCategory}</span>
                      </div>
                      <div className="personalization-tip-grid">
                        {visiblePersonalizationTips.map(({ title, copy, category }) => <PersonalizationTip key={title} title={title} category={category} forceOpen={Boolean(normalizedHelpSearch)}>{copy}</PersonalizationTip>)}
                        {visiblePersonalizationTips.length === 0 && <p className="personalization-tip-empty">No tips match this topic and search. Try another topic or a shorter search.</p>}
                      </div>
                    </div>
                  )}
                </section>

                <section className="settings-section color-studio-section" hidden={settingsSection !== "personalization"}>
                  <div
                    className="color-studio-header double-click-collapse-header"
                    onDoubleClick={(event) => toggleFromHeaderDoubleClick(event, toggleColorStudio)}
                    title="Double-click to expand or minimize"
                  >
                    <h4>Full Color Studio</h4>
                    <button
                      type="button"
                      className="settings-collapse-button"
                      onClick={(event) => toggleFromCollapseButton(event, toggleColorStudio)}
                      aria-expanded={colorStudioExpanded}
                      aria-controls="color-studio-content"
                      aria-label={`${colorStudioExpanded ? "Shrink" : "Enlarge"} Full Color Studio`}
                      title={`${colorStudioExpanded ? "Shrink" : "Enlarge"} Full Color Studio`}
                    >
                      {colorStudioExpanded ? "−" : "+"}
                    </button>
                  </div>

                  {colorStudioExpanded && (
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
                      <div
                        className="settings-collapse-header settings-collapse-subheader double-click-collapse-header"
                        onDoubleClick={(event) => toggleFromHeaderDoubleClick(event, () => setColorGroupsOpen((openGroups) => ({
                          ...openGroups,
                          [group]: openGroups[group] !== true,
                        })))}
                        title="Double-click to expand or minimize"
                      >
                        <h5>{group}</h5>
                        <button
                          type="button"
                          className="settings-collapse-button settings-collapse-button-small"
                          onClick={(event) => toggleFromCollapseButton(event, () => setColorGroupsOpen((openGroups) => ({
                            ...openGroups,
                            [group]: openGroups[group] !== true,
                          })))}
                          aria-expanded={colorGroupsOpen[group] === true}
                          aria-label={`${colorGroupsOpen[group] === true ? "Shrink" : "Enlarge"} ${group}`}
                          title={`${colorGroupsOpen[group] === true ? "Shrink" : "Enlarge"} ${group}`}
                        >
                          {colorGroupsOpen[group] === true ? "−" : "+"}
                        </button>
                      </div>
                      {colorGroupsOpen[group] === true && (
                        <>
                        {group === "Logo" && <div className="logo-color-preview"><GlowDocketLogo label="Custom logo color preview" /><span>Logo preview</span></div>}
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
                        </>
                      )}
                    </div>
                  ))}
                  {celebrationStudioProgress.unlocked && (
                    <div className="color-studio-group celebration-color-studio">
                      <div className="settings-collapse-header settings-collapse-subheader">
                        <h5>Celebrations <span className="studio-unlocked-pill">60-day unlock</span><span className="studio-celebration-pill">{selectedCelebrationOption.label}</span></h5>
                        <button type="button" className="settings-collapse-button settings-collapse-button-small" onClick={() => setColorGroupsOpen((openGroups) => ({ ...openGroups, celebrations: openGroups.celebrations !== true }))} aria-expanded={colorGroupsOpen.celebrations === true} aria-label={`${colorGroupsOpen.celebrations === true ? "Shrink" : "Enlarge"} Celebrations`}>
                          {colorGroupsOpen.celebrations === true ? "−" : "+"}
                        </button>
                      </div>
                      {colorGroupsOpen.celebrations === true && (
                        <>
                          {selectedCelebrationOption.id === "none" ? <p className="celebration-disabled-note">Celebrations are turned off. Select a celebration in Cosmetics to preview and customize it.</p> : <><div className="celebration-studio-preview-row"><p className="hint-text">Editing <strong>{selectedCelebrationOption.label}</strong>. Choose another celebration in Cosmetics to give it a separate palette.</p><div className={`celebration-color-preview preview-${selectedCelebrationOption.id}`} aria-label={`Animated preview of ${selectedCelebrationOption.label}`}><strong>Preview</strong><div aria-hidden="true">{CELEBRATION_PREVIEW_PARTICLES.map((particle, index) => <i key={particle.id} style={{ "--preview-x": particle.x, "--preview-delay": particle.delay, "--preview-duration": particle.duration, "--preview-drift": particle.drift, "--preview-color": selectedCelebrationPreviewColors[index % selectedCelebrationPreviewColors.length] }} />)}</div></div></div>
                          <div className="celebration-palette-preview" aria-hidden="true">{selectedCelebrationColorFields.filter((field) => field.key.startsWith("palette")).map((field) => <i key={field.key} style={{ backgroundColor: selectedCelebrationColors[field.key] || field.fallback }} />)}</div>
                          <div className="color-control-grid">
                            {selectedCelebrationColorFields.map((field) => {
                              const value = selectedCelebrationColors[field.key] || field.fallback;
                              const draftKey = `celebration:${selectedCelebrationOption.id}:${field.key}`;
                              return <label className="color-control" key={field.key}><span>{field.label}</span><div><input type="color" value={value} onChange={(event) => { handleCelebrationColorChange(field.key, event.target.value); clearColorTextDraft(draftKey); }} aria-label={`${field.label} color`} /><input type="text" value={colorTextDrafts[draftKey] ?? value.toUpperCase()} onChange={(event) => setColorTextDrafts((drafts) => ({ ...drafts, [draftKey]: event.target.value }))} onBlur={() => commitColorTextDraft(draftKey, value, (color) => handleCelebrationColorChange(field.key, color))} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") clearColorTextDraft(draftKey); }} maxLength={7} spellCheck="false" aria-label={`${field.label} hex color`} /></div></label>;
                            })}
                          </div></>}
                        </>
                      )}
                    </div>
                  )}
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
                  <h4>Install GlowDocket</h4>
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
                      ? `Saved for ${displayName || "this account"}.`
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

                {settingsSection === "account" && (
                  CLOUD_SYNC_CONFIGURED && accountMode === "cloud" ? <>
                    <SettingsCard title="Preferred Name" description="What should GlowDocket call you? This can appear in friendly greetings and reminders, but it is never your sign-in or external identity." className="settings-section-wide account-top-card">
                      <form className="account-settings-form" onSubmit={handleAccountDisplayNameUpdate}>
                        <label htmlFor="account-display-name">Preferred name</label>
                        <input id="account-display-name" value={accountDisplayNameDraft} maxLength={60} autoComplete="nickname" onChange={(event) => setAccountDisplayNameDraft(event.target.value)} />
                        <button type="submit" className="btn btn-primary" disabled={Boolean(accountUpdateBusy) || !accountDisplayNameDraft.trim()}>{accountUpdateBusy === "display-name" ? "Saving…" : "Save Preferred Name"}</button>
                      </form>
                    </SettingsCard>
                    <SettingsCard title="Email Address" description={`Your current sign-in email is ${accountEmail || "still loading"}. You may be asked to confirm both the old and new addresses.`} className="settings-section-wide account-top-card">
                      <div className={`account-verification-status ${accountEmailVerified ? "is-verified" : "is-unverified"}`}>
                        <strong>{accountEmailVerified ? "Email verified" : "Email verification needed"}</strong>
                        <span>{accountEmailVerified ? "Your sign-in email has been confirmed." : "Confirm your email to make account recovery and secure sign-in fully available."}</span>
                        {!accountEmailVerified && <button type="button" className="btn btn-secondary" disabled={Boolean(accountUpdateBusy) || !accountEmail} onClick={handleResendVerification}>{accountUpdateBusy === "verification" ? "Sendingâ€¦" : "Resend Verification Email"}</button>}
                      </div>
                      <form className="account-settings-form" onSubmit={handleAccountEmailUpdate}>
                        <label htmlFor="account-email">New email</label>
                        <input id="account-email" type="email" value={accountEmailDraft} autoComplete="email" onChange={(event) => setAccountEmailDraft(event.target.value)} />
                        <button type="submit" className="btn btn-primary" disabled={Boolean(accountUpdateBusy) || !accountEmailDraft.trim()}>{accountUpdateBusy === "email" ? "Sending confirmation…" : "Change Email"}</button>
                      </form>
                    </SettingsCard>
                    <SettingsCard title="Password" description="Choose a new password. GlowDocket never displays your current password and will show any provider policy error." className="settings-section-wide">
                      <form className="account-settings-form account-password-form" onSubmit={handleAccountPasswordUpdate}>
                        <label htmlFor="account-new-password">New password</label>
                        <div className="password-input-row"><input id="account-new-password" type={showAccountPassword ? "text" : "password"} value={accountPasswordDraft} autoComplete="new-password" onChange={(event) => setAccountPasswordDraft(event.target.value)} /><button type="button" className="password-visibility-button is-icon-only" aria-pressed={showAccountPassword} aria-label={showAccountPassword ? "Hide new password" : "Show new password"} onClick={() => setShowAccountPassword((shown) => !shown)}><PasswordEyeIcon hidden={!showAccountPassword} /></button></div>
                        <label htmlFor="account-confirm-password">Confirm new password</label>
                        <div className="password-input-row"><input id="account-confirm-password" type={showAccountPasswordConfirm ? "text" : "password"} value={accountPasswordConfirm} autoComplete="new-password" onChange={(event) => setAccountPasswordConfirm(event.target.value)} /><button type="button" className="password-visibility-button is-icon-only" aria-pressed={showAccountPasswordConfirm} aria-label={showAccountPasswordConfirm ? "Hide password confirmation" : "Show password confirmation"} onClick={() => setShowAccountPasswordConfirm((shown) => !shown)}><PasswordEyeIcon hidden={!showAccountPasswordConfirm} /></button></div>
                        <button type="submit" className="btn btn-primary" disabled={Boolean(accountUpdateBusy) || !accountPasswordDraft || !accountPasswordConfirm}>{accountUpdateBusy === "password" ? "Updating…" : "Update Password"}</button>
                      </form>
                    </SettingsCard>
                    <SettingsCard title="Sessions & Account Deletion" description="Manage access on other devices or permanently remove this cloud account." className="settings-section-wide account-danger-zone">
                      <div className="account-management-action">
                        <div><strong>Sign out of all devices</strong><p>Revokes this account's refresh sessions everywhere, including this browser. A device may remain visible until its short-lived access token expires.</p></div>
                        <button type="button" className="btn btn-secondary" disabled={Boolean(accountUpdateBusy)} onClick={handleSignOutAllDevices}>{accountUpdateBusy === "sign-out-all" ? "Signing outâ€¦" : "Sign Out All Devices"}</button>
                      </div>
                      <div className="account-management-action account-delete-explanation">
                        <div><strong>Delete account permanently</strong><p>This deletes your secure account and online planner data, including assignments, checklists, courses, colors, settings, and workspace layouts. The same saved planner data and attachment files are erased from this browser. This cannot be undone.</p><p>Other devices are signed out as their access expires. An offline device may retain a browser copy until GlowDocket is opened there or that browser's site data is cleared.</p></div>
                        <button type="button" className="btn btn-danger" disabled={Boolean(accountUpdateBusy)} onClick={handleDeleteAccount}>{accountUpdateBusy === "delete-account" ? "Deleting accountâ€¦" : "Delete My Account"}</button>
                      </div>
                    </SettingsCard>
                    {accountUpdateStatus.message && <div className={`account-update-message is-${accountUpdateStatus.type} settings-section-wide`} role="status">{accountUpdateStatus.message}</div>}
                  </> : CLOUD_SYNC_CONFIGURED ? <SettingsCard title="Add Email & Enable Cross-Device Sync" description="Turn this existing browser-only profile into a secure account without removing its assignments or personalization." className="settings-section-wide">
                    <form className="account-settings-form account-password-form" onSubmit={handleLocalAccountUpgrade}>
                      <label htmlFor="upgrade-display-name">Preferred name</label>
                      <input id="upgrade-display-name" value={accountDisplayNameDraft} maxLength={60} autoComplete="nickname" onChange={(event) => setAccountDisplayNameDraft(event.target.value)} />
                      <button type="button" className="btn btn-secondary" disabled={Boolean(accountUpdateBusy) || !accountDisplayNameDraft.trim()} onClick={handleAccountDisplayNameUpdate}>{accountUpdateBusy === "display-name" ? "Saving…" : "Save Preferred Name on This Browser"}</button>
                      <label htmlFor="upgrade-email">Email</label>
                      <input id="upgrade-email" type="email" value={accountEmailDraft} autoComplete="email" onChange={(event) => setAccountEmailDraft(event.target.value)} />
                      <label htmlFor="upgrade-password">New account password</label>
                      <div className="password-input-row"><input id="upgrade-password" type={showAccountPassword ? "text" : "password"} value={accountPasswordDraft} autoComplete="new-password" onChange={(event) => setAccountPasswordDraft(event.target.value)} /><button type="button" className="password-visibility-button is-icon-only" aria-pressed={showAccountPassword} aria-label={showAccountPassword ? "Hide account passwords" : "Show account passwords"} onClick={() => setShowAccountPassword((shown) => !shown)}><PasswordEyeIcon hidden={!showAccountPassword} /></button></div>
                      <label htmlFor="upgrade-password-confirm">Confirm new account password</label>
                      <div className="password-input-row"><input id="upgrade-password-confirm" type={showAccountPasswordConfirm ? "text" : "password"} value={accountPasswordConfirm} autoComplete="new-password" onChange={(event) => setAccountPasswordConfirm(event.target.value)} /><button type="button" className="password-visibility-button is-icon-only" aria-pressed={showAccountPasswordConfirm} aria-label={showAccountPasswordConfirm ? "Hide password confirmation" : "Show password confirmation"} onClick={() => setShowAccountPasswordConfirm((shown) => !shown)}><PasswordEyeIcon hidden={!showAccountPasswordConfirm} /></button></div>
                      <button type="submit" className="btn btn-primary" disabled={Boolean(accountUpdateBusy) || !accountEmailDraft.trim() || !accountPasswordDraft || !accountPasswordConfirm}>{accountUpdateBusy === "upgrade" ? "Creating secure account…" : "Add Email & Enable Sync"}</button>
                    </form>
                    {accountUpdateStatus.message && <div className={`account-update-message is-${accountUpdateStatus.type}`} role="status">{accountUpdateStatus.message}</div>}
                  </SettingsCard> : <><SettingsCard title="Preferred Name" description="Choose what GlowDocket calls you in friendly greetings and open-app reminders." className="settings-section-wide"><form className="account-settings-form" onSubmit={handleAccountDisplayNameUpdate}><label htmlFor="local-preferred-name">Preferred name</label><input id="local-preferred-name" value={accountDisplayNameDraft} maxLength={60} autoComplete="nickname" onChange={(event) => setAccountDisplayNameDraft(event.target.value)} /><button type="submit" className="btn btn-primary" disabled={Boolean(accountUpdateBusy) || !accountDisplayNameDraft.trim()}>{accountUpdateBusy === "display-name" ? "Saving…" : "Save Preferred Name"}</button></form>{accountUpdateStatus.message && <div className={`account-update-message is-${accountUpdateStatus.type}`} role="status">{accountUpdateStatus.message}</div>}</SettingsCard><SettingsCard title="Browser-Only Profile" description="This version saves the profile only in this browser." className="settings-section-wide"><p className="hint-text">Assignments remain available on this device. Online account controls will appear automatically when cross-device saving is available.</p></SettingsCard></>
                )}

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
                      <button type="button" className="btn btn-secondary" onClick={() => { setSettingsSection("personalization"); openColorStudio(); setColorGroupsOpen((groups) => ({ ...groups, Checklists: true })); }}>Open Checklist Color Studio</button>
                    </SettingsCard>
                  </>
                )}

                {settingsSection === "reminders" && (
                  <>
                    <SettingsCard title="Install GlowDocket" description="Install the planner on this device for an app-like window and offline access.">
                      {isStandalone ? (
                        <span className="settings-status-pill">Installed</span>
                      ) : installPrompt ? (
                        <button type="button" className="btn btn-primary" onClick={handleInstallApp}>Install GlowDocket</button>
                      ) : (
                        <p className="hint-text">Use your browser’s “Install app” or “Add to Home Screen” menu.</p>
                      )}
                      {!isStandalone && <p className="hint-text install-device-guidance">{installInstructions}</p>}
                    </SettingsCard>
                    <SettingsCard title="Due Reminders" description="Choose when GlowDocket should give you a heads-up.">
                      <div className={`external-push-status is-${reminderUserStatus}`} role="status">
                        <strong>{reminderStatusCopy.title}</strong>
                        <small>{reminderStatusCopy.detail}</small>
                      </div>
                      <div className="external-push-detail-grid"><span><strong>Push reminders</strong><small>{reminderUserStatus === "off" ? "Off" : reminderUserStatus === "connecting" ? "Connecting" : reminderUserStatus === "active" ? "Active" : "Needs attention"}</small></span><span><strong>Browser permission</strong><small>{browserNotificationPermission === "default" ? "Not requested" : browserNotificationPermission === "granted" ? "Allowed" : browserNotificationPermission === "denied" ? "Blocked" : "Unsupported"}</small></span><span><strong>Reminder timing</strong><small>{formatReminderLeadTime(userSettings.reminderMinutes || 60)} before</small></span></div>
                      {reminderUserStatus === "blocked" ? <div className="reminder-permission-guidance"><strong>Blocked in Browser Settings</strong><p>GlowDocket cannot reopen a blocked permission prompt. Open this site’s browser permissions, change Notifications to Allow, then return here and retry.</p></div> : <button type="button" className={`btn ${userSettings.externalPushEnabled && reminderUserStatus === "active" ? "btn-danger" : "btn-primary"}`} disabled={!EXTERNAL_PUSH_CLIENT_ENABLED || reminderUserStatus === "unsupported" || Boolean(externalPushAction)} onClick={() => handleExternalPushSettingChange(reminderUserStatus === "active" ? false : true)}>{externalPushAction === "enabling" ? "Connecting…" : externalPushAction === "disabling" ? "Turning off…" : reminderActionLabel}</button>}
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
                      {reminderLeadAlreadyPassedCount > 0 && <p className="hint-text">{reminderLeadAlreadyPassedCount} upcoming assignment{reminderLeadAlreadyPassedCount === 1 ? " is" : "s are"} already inside that reminder window, so GlowDocket won’t schedule a late alert.</p>}
                      <div className="external-push-actions"><button type="button" className="btn btn-secondary" onClick={handleExternalPushTest} disabled={!canSendReminderTest(reminderUserStatus, Boolean(externalPushAction))}>{externalPushAction === "testing" ? "Sending test…" : testReminderSent ? "Test sent" : "Send Test Reminder"}</button>{shouldShowRepairReminderSync(reminderUserStatus, externalPushStatus) && <button type="button" className="btn btn-secondary" onClick={handleExternalPushSync} disabled={Boolean(externalPushAction)}>{externalPushAction === "repairing" ? "Repairing…" : "Repair Reminder Sync"}</button>}</div>
                      {externalPushMessage && <p className="hint-text external-push-message">{externalPushMessage}</p>}
                      <p className="hint-text">Last successful sync: {externalPushLastSync ? new Date(externalPushLastSync).toLocaleString() : "Not yet"}</p>
                      <details className="reminder-technical-details"><summary>Connection details</summary><dl><div><dt>Browser connection</dt><dd>{externalPushDiagnostics.providerConnected ? "Connected" : "Not connected"}</dd></div><div><dt>Reminder setup</dt><dd>{externalPushDiagnostics.serverEnrolled ? "Ready" : "Needs attention"}</dd></div><div><dt>Update status</dt><dd>{{ idle: "Waiting", active: "Up to date", syncing: "Updating", sync_needed: "Update needed", cleanup_pending: "Finishing cleanup", failed: "Needs attention" }[externalPushDiagnostics.scheduling] || "Checking"}</dd></div>{externalPushDiagnostics.lastError && <div><dt>Latest check</dt><dd>Needs attention</dd></div>}</dl></details>
                      <p className="hint-text">Closed-app delivery depends on your browser, operating system, permission, internet connection, and device notification settings. Reminder text may appear on your lock screen.</p>
                      {isAppleMobile && <p className="hint-text">On iPhone and iPad, add GlowDocket to the Home Screen, open the installed app, and then enable Push Reminders.</p>}
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
                    <SettingsCard title="Add Assignment Fields" description={currentUser ? `Saved for ${displayName || "this account"}.` : "Sign in to keep these preferences with a profile."} className="settings-horizontal-options settings-section-wide">
                      <label className="settings-toggle"><span>Priority</span><input type="checkbox" checked={userSettings.showPriority} onChange={(e) => handleAddFieldSettingChange("showPriority", e.target.checked)} /></label>
                      <label className="settings-toggle"><span>Repeat</span><input type="checkbox" checked={userSettings.showRepeat} onChange={(e) => handleAddFieldSettingChange("showRepeat", e.target.checked)} /></label>
                      <label className="settings-toggle"><span>Estimated Minutes</span><input type="checkbox" checked={userSettings.showEstimatedMinutes} onChange={(e) => handleAddFieldSettingChange("showEstimatedMinutes", e.target.checked)} /></label>
                      <label className="settings-toggle"><span>Files</span><input type="checkbox" checked={userSettings.showAssignmentFiles !== false} onChange={(e) => handleAddFieldSettingChange("showAssignmentFiles", e.target.checked)} /></label>
                      <label className="settings-toggle"><span>Links</span><input type="checkbox" checked={userSettings.showAssignmentLinks !== false} onChange={(e) => handleAddFieldSettingChange("showAssignmentLinks", e.target.checked)} /></label>
                      <label className="settings-toggle"><span>Related Tasks to Complete</span><input type="checkbox" checked={userSettings.showAssignmentChecklistSteps !== false} onChange={(e) => handleAddFieldSettingChange("showAssignmentChecklistSteps", e.target.checked)} /></label>
                    </SettingsCard>
                    <SettingsCard title="Assignment Card Display" description="Choose how much information appears on assignment cards across desktop and mobile." className="settings-section-wide assignment-card-display-settings">
                      <div className="assignment-card-presets" role="group" aria-label="Assignment card display presets">
                        <span>Quick presets</span>
                        <button type="button" className="btn btn-secondary" onClick={() => handleAssignmentCardPreset("minimal")}>Minimal</button>
                        <button type="button" className="btn btn-secondary" onClick={() => handleAssignmentCardPreset("deadline")}>Deadline Focus</button>
                        <button type="button" className="btn btn-secondary" onClick={() => handleAssignmentCardPreset("detailed")}>Show Everything</button>
                      </div>
                      <div className="assignment-card-option-grid">
                        <label className="settings-toggle settings-toggle-copy"><span><strong>Course badges</strong><small>Show the course color and name beside each assignment title.</small></span><input type="checkbox" checked={userSettings.showTaskCourseBadge !== false} onChange={(event) => handleAddFieldSettingChange("showTaskCourseBadge", event.target.checked)} /></label>
                        <label className="settings-toggle settings-toggle-copy"><span><strong>Assignment details</strong><small>Show due date, priority, estimate, and repeat information.</small></span><input type="checkbox" checked={userSettings.showTaskDetailLine !== false} onChange={(event) => handleAddFieldSettingChange("showTaskDetailLine", event.target.checked)} /></label>
                        <label className="settings-toggle settings-toggle-copy"><span><strong>Deadline countdowns</strong><small>Show the remaining days or hours beneath assignment details.</small></span><input type="checkbox" checked={userSettings.showTaskCountdown !== false} onChange={(event) => handleAddFieldSettingChange("showTaskCountdown", event.target.checked)} /></label>
                        <label className="settings-toggle settings-toggle-copy"><span><strong>Related-task progress</strong><small>Show completed related tasks directly on assignment cards.</small></span><input type="checkbox" checked={userSettings.showTaskChecklistProgress !== false} onChange={(event) => handleAddFieldSettingChange("showTaskChecklistProgress", event.target.checked)} /></label>
                        <label className="settings-toggle settings-toggle-copy"><span><strong>Reminder indicators</strong><small>Show reminder health icons beside assignments with notifications.</small></span><input type="checkbox" checked={userSettings.showTaskReminderIndicator !== false} onChange={(event) => handleAddFieldSettingChange("showTaskReminderIndicator", event.target.checked)} /></label>
                      </div>
                    </SettingsCard>
                    <SettingsCard title="New Assignment Defaults" description="These values prefill new assignments and return after each successful add." className="settings-section-wide">
                      <div className="settings-option-grid assignment-defaults-grid">
                        <label className="settings-select-row settings-option-card"><span>Category</span><select value={userSettings.defaultCategory || "School"} onChange={(e) => handleAssignmentDefaultChange("defaultCategory", e.target.value)}>{categoryChoices.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
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
                    <SettingsCard title="Workflow & Safety" description="Control automatic behavior and extra safeguards." className="settings-horizontal-options settings-section-wide">
                      <label className="settings-toggle settings-toggle-copy"><span><strong>Complete finished assignments</strong><small>Complete an assignment when every related task is checked.</small></span><input type="checkbox" checked={userSettings.autoCompleteChecklist !== false} onChange={(e) => handleAddFieldSettingChange("autoCompleteChecklist", e.target.checked)} /></label>
                      <label className="settings-toggle settings-toggle-copy"><span><strong>Confirm before Trash</strong><small>Ask before moving an assignment into recoverable Trash.</small></span><input type="checkbox" checked={userSettings.confirmBeforeTrash !== false} onChange={(e) => handleAddFieldSettingChange("confirmBeforeTrash", e.target.checked)} /></label>
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
                      <span><strong>Trash</strong><small>Recover assignments before they are automatically deleted after 30 days.</small></span>
                      <span className="settings-count">{trashTasks.length}</span>
                    </button>
                  </div>
                )}

                {settingsSection === "storage" && (
                  <SettingsCard title="Browser Storage" description="Monitor the browser space used by GlowDocket, attachments, and other saved site data." className="settings-section-wide storage-quota-card">
                    {browserStorage.supported === false ? (
                      <p className="hint-text">This browser does not report storage quota details. Attachment limits still remain active.</p>
                    ) : browserStorage.error ? (
                      <div className="account-update-message is-error" role="alert">{browserStorage.error}</div>
                    ) : browserStorage.supported === null ? (
                      <p className="hint-text">Checking browser storage…</p>
                    ) : (
                      <div className={`storage-quota-summary is-${storageQuotaStatus.level}`}>
                        <div><strong>{formatStorageBytes(browserStorage.usage)} used</strong><span>of approximately {formatStorageBytes(browserStorage.quota)} available to this site</span></div>
                        <meter min="0" max="100" low="80" high="95" optimum="0" value={storageQuotaStatus.percent} aria-label={`${storageQuotaStatus.percent}% of browser storage used`}>{storageQuotaStatus.percent}%</meter>
                        <p>{storageQuotaStatus.level === "critical" ? "Storage is critically full. Remove unused attachments or browser site data before adding more files." : storageQuotaStatus.level === "warning" ? "Storage is getting full. Consider removing unused attachments or downloading a backup." : "Storage has comfortable room available."}</p>
                      </div>
                    )}
                    <div className="storage-quota-details"><span><strong>{uniqueAttachmentMetadata.size}</strong> attachment file{uniqueAttachmentMetadata.size === 1 ? "" : "s"} referenced</span><span><strong>{formatStorageBytes(attachmentMetadataBytes)}</strong> attachment size recorded</span></div>
                    <p className="hint-text">Browser estimates cover this site’s IndexedDB, localStorage, caches, and related data. Attachment totals use assignment metadata and may include files unavailable on this device.</p>
                    <button type="button" className="btn btn-secondary" onClick={handleRefreshStorageEstimate}>Refresh Storage Check</button>
                  </SettingsCard>
                )}

                {settingsSection === "privacy" && (
                  <SettingsCard title="Privacy & Data" description="Understand where GlowDocket keeps information and which features are specific to this device." className="settings-section-wide privacy-settings-card">
                    <PrivacyDataPanel />
                  </SettingsCard>
                )}

                {settingsSection === "accessibility" && (
                  <>
                    <SettingsCard title="Automated Accessibility Check" description="Scan the current GlowDocket screen for common machine-detectable accessibility problems." className="settings-section-wide accessibility-verification-card">
                      <div className="accessibility-audit-heading">
                        <div><strong>Checks accessible names, form labels, image text alternatives, dialog names, duplicate IDs, and keyboard access for custom buttons.</strong><p className="hint-text">Automated checks cannot prove that the full experience is accessible. Complete the manual checks below too.</p></div>
                        <button type="button" className="btn btn-primary" onClick={handleRunAccessibilityAudit}>Run Accessibility Check</button>
                      </div>
                      {!accessibilityAudit ? (
                        <p className="accessibility-audit-empty">No automated check has been run in this session.</p>
                      ) : (
                        <div className={`accessibility-audit-result ${accessibilityAudit.passed ? "is-passed" : "is-warning"}`} role="status" aria-live="polite">
                          <div><strong>{accessibilityAudit.passed ? "Automated checks passed" : `${accessibilityAudit.issueCount} possible issue${accessibilityAudit.issueCount === 1 ? "" : "s"} found`}</strong><span>Checked {new Date(accessibilityAudit.checkedAt).toLocaleTimeString()}</span></div>
                          {accessibilityAudit.groups.length > 0 && <ul>{accessibilityAudit.groups.map((group) => <li key={group.rule}><strong>{group.count} × {group.message}</strong><small>Examples: {group.examples.join("; ")}</small></li>)}</ul>}
                        </div>
                      )}
                    </SettingsCard>
                    <SettingsCard title="Manual Accessibility Verification" description="Complete these checks on the device and browser you are reviewing." className="settings-section-wide accessibility-verification-card">
                      <div className="accessibility-manual-progress"><strong>{manualAccessibilityChecks.length} of {MANUAL_ACCESSIBILITY_CHECKS.length} checked</strong><progress max={MANUAL_ACCESSIBILITY_CHECKS.length} value={manualAccessibilityChecks.length}>{manualAccessibilityChecks.length}</progress></div>
                      <div className="accessibility-checklist">
                        {MANUAL_ACCESSIBILITY_CHECKS.map((check) => (
                          <label key={check.id} className="accessibility-check-item">
                            <input type="checkbox" checked={manualAccessibilityChecks.includes(check.id)} onChange={(event) => handleManualAccessibilityCheck(check.id, event.target.checked)} />
                            <span><strong>{check.label}</strong><small>{check.detail}</small></span>
                          </label>
                        ))}
                      </div>
                      <button type="button" className="btn btn-secondary" disabled={!accessibilityAudit && manualAccessibilityChecks.length === 0} onClick={handleResetAccessibilityChecks}>Reset Verification</button>
                    </SettingsCard>
                  </>
                )}

                {settingsSection === "storage" && (
                  <SettingsCard title="Version & Diagnostics" description="Check which GlowDocket version is running and when it was built." className="settings-section-wide build-diagnostics-card">
                    <dl className="build-diagnostics-list">
                      <div><dt>App version</dt><dd>v{APP_BUILD_METADATA.appVersion}</dd></div>
                      <div><dt>Environment</dt><dd>{APP_BUILD_METADATA.environment}</dd></div>
                      <div><dt>Built</dt><dd>{APP_BUILD_METADATA.buildTimestamp === "unavailable" ? "Unavailable" : new Date(APP_BUILD_METADATA.buildTimestamp).toLocaleString()}</dd></div>
                    </dl>
                  </SettingsCard>
                )}

                {settingsSection === "storage" && (
                  <SettingsCard title="Backup & Restore" description="Download a copy you control, restore a complete JSON backup, or recover an earlier cloud version." className="settings-section-wide recovery-center-card">
                    <div className="recovery-action-grid">
                      <div><strong>Complete JSON backup</strong><p>Includes assignments, Trash, checklists, courses, preferences, and workspace layouts. Attachment files are browser-only and are not included.</p><button type="button" className="btn btn-primary" onClick={handleExportJson}>Download JSON Backup</button></div>
                      <div><strong>Assignment spreadsheet</strong><p>Download a CSV you can open or import in Google Sheets, Microsoft Excel, or Apple Numbers. CSV files cannot restore the full app.</p><button type="button" className="btn btn-secondary" onClick={handleExportCsv}>Export for Google Sheets / CSV</button></div>
                      <div><strong>Restore from JSON</strong><p>Your current planner is backed up locally before the imported version replaces it.</p><label className="btn btn-secondary recovery-file-button">Choose JSON Backup<input type="file" accept="application/json,.json" onChange={handleImportBackup} /></label></div>
                      <div><strong>Previous local version</strong><p>Restore the latest safety copy created before a backup, cloud conflict, or earlier restore.</p><button type="button" className="btn btn-secondary" onClick={handleRestoreLocalBackup}>Restore Previous Local Version</button></div>
                    </div>
                    {CLOUD_SYNC_CONFIGURED && accountMode === "cloud" && <div className="cloud-history-panel"><div><strong>Automatic cloud history</strong><p>GlowDocket keeps up to 20 earlier versions. Restoring one safely makes it the current version without silently overwriting newer work.</p></div><button type="button" className="btn btn-secondary" disabled={cloudHistoryBusy} onClick={handleLoadCloudHistory}>{cloudHistoryBusy ? "Loading earlier versions…" : cloudHistory.length ? "Refresh History" : "View Earlier Versions"}</button>{cloudHistory.length > 0 && <ul>{cloudHistory.map((entry) => <li key={entry.id}><span><strong>{new Date(entry.created_at).toLocaleString()}</strong><small>{entry.state.tasks.length} assignments</small></span><button type="button" className="btn btn-secondary" onClick={() => handleRestoreCloudHistory(entry)}>Restore This Version</button></li>)}</ul>}</div>}
                    {recoveryStatus.message && <div className={`account-update-message is-${recoveryStatus.type}`} role={recoveryStatus.type === "error" ? "alert" : "status"} aria-live={recoveryStatus.type === "error" ? "assertive" : "polite"}>{recoveryStatus.message}</div>}
                  </SettingsCard>
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
                                <div><strong>{task.title}</strong><div className="task-details">{formatTaskDetails(task)}</div>{getTrashDaysRemaining(task) !== null && <div className="trash-retention-note">Auto-deletes in {getTrashDaysRemaining(task)} day{getTrashDaysRemaining(task) === 1 ? "" : "s"}</div>}</div>
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
                  </SettingsAccordionProvider>
                  </div>
                </div>
                </MobileSettingsPortal>
              </div>
            </div>
          )}
          </div>
          </main>
        </div>

        {isMobileUi && currentUser && (
          <>
            <nav className="mobile-app-bottom-nav" aria-label="Mobile navigation">
              <button type="button" className={currentTab === "dashboard" ? "active" : ""} onClick={() => openMobileTab("dashboard")}><span aria-hidden="true">⌂</span><small>Home</small></button>
              <button type="button" className={mobileTaskTabActive ? "active" : ""} onClick={() => openMobileTab("todo")}><span aria-hidden="true">☑</span><small>Tasks</small></button>
              <button type="button" className={`mobile-app-add-nav${currentTab === "mobile-add" ? " active" : ""}`} onClick={() => openMobileAdd(currentTab)}><span aria-hidden="true">+</span><small>Add</small></button>
              <button type="button" className={currentTab === "calendar" ? "active" : ""} onClick={() => openMobileTab("calendar")}><span aria-hidden="true">□</span><small>Calendar</small></button>
              <button type="button" className={mobileMoreActive || mobileMoreOpen ? "active" : ""} onClick={() => setMobileMoreOpen(true)}><span aria-hidden="true">•••</span><small>More</small></button>
            </nav>

            {mobileMoreOpen && (
              <div className="mobile-app-sheet-backdrop" role="presentation" onClick={() => setMobileMoreOpen(false)}>
                <section className="mobile-app-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-more-title" onClick={(event) => event.stopPropagation()}>
                  <header><div><span id="mobile-more-title">GlowDocket</span></div><button type="button" onClick={() => setMobileMoreOpen(false)} aria-label="Close account menu">×</button></header>
                  <div className="mobile-app-menu-grid">
                    <button type="button" onClick={() => openMobileTab("mobile-tools")}><strong>Study tools</strong><span>Reminders and course overview</span></button>
                    <button type="button" onClick={() => openMobileTab("mobile-courses")}><strong>Courses & colors</strong><span>Manage your subjects</span></button>
                    <button type="button" onClick={() => openMobileTab("recommendations")}><strong>Feedback & Support</strong><span>Report a problem or suggest an improvement</span></button>
                    <button type="button" onClick={() => openMobileTab("settings")}><strong>Settings</strong><span>Appearance, reminders, and account</span></button>
                  </div>
                  <div className="mobile-app-account-row"><div><strong>{safeDisplayName}</strong><span>{accountMode === "cloud" ? "Cloud account" : "Local profile"}</span></div><button type="button" className="btn btn-danger" onClick={handleSignOut}>Sign out</button></div>
                </section>
              </div>
            )}
          </>
        )}

        </div>
      {/*
        EDIT MODAL
        Rendered above every tab only while editingTask contains a temporary copy.
        Clicking the dark backdrop cancels; clicks inside stop propagation so the
        modal remains open while the user interacts with its fields.
      */}
      {editingTask && (
        <div className={`modal-backdrop${isMobileUi ? " mobile-edit-backdrop" : ""}`} onClick={handleEditCancel}>
          <div ref={activeDialogRef} className={`edit-modal${isMobileUi ? " mobile-edit-screen" : ""}`} role="dialog" aria-modal="true" aria-labelledby="edit-assignment-title" tabIndex="-1" onClick={(e) => e.stopPropagation()}>
            <div className={`edit-modal-header${isMobileUi ? " mobile-fullscreen-header mobile-edit-header" : ""}`}>
              <div>
                <p className={isMobileUi ? "" : "eyebrow modal-eyebrow"}>{isMobileUi ? "Update assignment" : "Edit Assignment"}</p>
                <h2 id="edit-assignment-title">{isMobileUi ? "Edit Assignment" : `✏️ ${editingTask.title || "Untitled Assignment"}`}</h2>
                {isMobileUi && <span>Change the details below, then save when you’re finished.</span>}
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
              {isMobileUi && <div className="mobile-add-option-heading mobile-edit-option-heading"><span>Assignment details</span><h3>Edit Assignment</h3><p>Update the assignment details below.</p></div>}
              <div className="edit-field edit-field-full">
                <label htmlFor="edit-assignment-name">Assignment Name</label>
                <input
                  id="edit-assignment-name"
                  data-dialog-initial-focus
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
                    <label htmlFor="edit-assignment-category">Category</label>
                    <select
                      id="edit-assignment-category"
                      value={getTaskCategory(editingTask)}
                      onChange={(e) => handleEditFieldChange("category", e.target.value)}
                    >
                      {categoryChoices.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </div>
                  <div className="edit-field">
                    <label htmlFor="edit-assignment-course">Course</label>
                    <select
                      id="edit-assignment-course"
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
                    <label htmlFor="edit-assignment-priority">Priority</label>
                    <select
                      id="edit-assignment-priority"
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

                  {renderDueDateField(editingTask.dueMonth, editingTask.dueDay, (month, day) => { handleEditFieldChange("dueMonth", month); handleEditFieldChange("dueDay", day); }, "edit-assignment-due-date")}

                  <div className="edit-field">
                    <label htmlFor="edit-assignment-due-time">Due Time</label>
                    <input
                      id="edit-assignment-due-time"
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
                    <label htmlFor="edit-assignment-due-period">AM / PM</label>
                    <select
                      id="edit-assignment-due-period"
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
                    <label htmlFor="edit-assignment-estimated-minutes">Estimated Minutes</label>
                    <input
                      id="edit-assignment-estimated-minutes"
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
                    <label htmlFor="edit-assignment-repeat">Repeat</label>
                    <select
                      id="edit-assignment-repeat"
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
                  <label htmlFor="edit-assignment-notes">Notes</label>
                  <textarea
                    id="edit-assignment-notes"
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
                <p className="subtask-form-hint">Files stay in this browser. Maximum 10 MB per file, {MAX_ATTACHMENTS_PER_ASSIGNMENT} files and 50 MB per assignment.</p>
                {attachmentSelectionMessage && <p className="attachment-selection-message" role="status" aria-live="polite">{attachmentSelectionMessage}</p>}
                <input
                  type="file"
                  multiple
                  onChange={(e) => {
                    handleFileSelection(e.target.files, setPendingEditFiles, [...getSafeAttachments(editingTask), ...pendingEditFiles]);
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
                  {editLinkMessage || (isMobileUi ? "Enter a link name and address, then tap outside either field to add it. Confirm the link appears below before saving changes." : "Enter a link name and address, then click outside either field to add it. Confirm the link appears below before saving changes.")}
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
                <div className="optional-assignment-header double-click-collapse-header" onDoubleClick={(event) => toggleFromHeaderDoubleClick(event, () => setEditOptionalSections((sections) => ({ ...sections, checklist: !sections.checklist })))} title="Double-click to open or minimize Related Tasks to Complete">
                  <label>Related Tasks to Complete ({getSafeSubtasks(editingTask).length})</label>
                  <button
                    type="button"
                    className="optional-assignment-toggle"
                    onClick={(event) => toggleFromCollapseButton(event, () => setEditOptionalSections((sections) => ({ ...sections, checklist: !sections.checklist })))}
                    onDoubleClick={stopControlDoubleClick}
                    aria-expanded={editOptionalSections.checklist}
                    aria-label={`${editOptionalSections.checklist ? "Minimize" : "Open"} Related Tasks to Complete`}
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
                    Add related task
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
                    No related tasks added.
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
              {isMobileUi && (
                <button type="button" className="btn btn-primary mobile-edit-save" onClick={handleEditSave}>
                  Save Changes
                </button>
              )}
            </div>
            {!isMobileUi && <div className="edit-modal-actions">
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
            </div>}
          </div>
        </div>
      )}
      {copyingTask && (
        <div className="modal-backdrop" onClick={() => setCopyingTask(null)}>
          <div ref={activeDialogRef} className="edit-modal copy-dates-modal" role="dialog" aria-modal="true" aria-labelledby="copy-assignment-title" tabIndex="-1" onClick={(e) => e.stopPropagation()}>
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
                  data-dialog-initial-focus
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
            <DeferredCalendar
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
                  <div><p className="eyebrow">Practice mode</p><h2 id="tutorial-title">{TUTORIAL_SLIDES[tutorialStep].title}</h2><p id="tutorial-copy">Try this feature safely. Nothing here is saved to your real GlowDocket.</p></div>
                  <button type="button" className="btn btn-secondary" onClick={closeTutorialPractice}>← {tutorialStep !== tutorialPracticeHomeStep ? "Back to First Practice Page" : "Back to Tutorial"}</button>
                </header>
                <main className="tutorial-practice-stage">
                  {tutorialStep === 0 && <div className="practice-dashboard"><h3>Welcome back</h3><p>Everything you want to get done, organized.</p><div className="practice-stat-row"><button type="button" onClick={() => setTutorialPracticeDone((done) => done.includes("biology") ? done.filter((id) => id !== "biology") : [...done, "biology"])}><strong>{tutorialPracticeDone.includes("biology") ? "Done!" : "Biology review"}</strong><span>{tutorialPracticeDone.includes("biology") ? "Nice work" : "Due tomorrow · 30 min"}</span></button><button type="button" onClick={() => setTutorialStep(2)}><strong>Plan of Attack</strong><span>Open the recommendation practice</span></button></div></div>}
                  {tutorialStep === 1 && <div className="practice-form"><h3>Add a practice assignment</h3><label>Assignment name<input value={tutorialPracticeNote} onChange={(event) => setTutorialPracticeNote(event.target.value)} placeholder="Try typing an assignment" /></label><div><label>Course<select><option>Biology</option><option>Work</option><option>Personal</option></select></label><label>Priority<select><option>High</option><option>Medium</option><option>Low</option></select></label></div><button type="button" className="btn btn-primary" disabled={!tutorialPracticeNote.trim()} onClick={() => setTutorialPracticeDone(["created"])}>{tutorialPracticeDone.includes("created") ? "Practice assignment added!" : "Add Assignment"}</button></div>}
                  {tutorialStep === 2 && <div className="practice-plan"><h3>Best Next Steps</h3><p>Choose an assignment to mark it complete.</p>{[["biology","Review cell structure","Due tomorrow · High priority"],["english","Literature response","Due Friday · 45 minutes"],["math","Practice problems","Due next week · 20 minutes"]].map(([id,title,detail], index) => <button type="button" className={tutorialPracticeDone.includes(id) ? "done" : ""} key={id} onClick={() => setTutorialPracticeDone((done) => done.includes(id) ? done.filter((item) => item !== id) : [...done,id])}><b>{index + 1}</b><span><strong>{title}</strong><small>{tutorialPracticeDone.includes(id) ? "Completed" : detail}</small></span></button>)}</div>}
                  {tutorialStep === 3 && <div className="practice-calendar"><section><h3>July 2026</h3><div>{Array.from({ length: 28 }, (_, index) => index + 1).map((day) => <button type="button" className={tutorialPracticeDate === day ? "selected" : ""} key={day} onClick={() => setTutorialPracticeDate(day)}>{day}</button>)}</div><p>Selected: July {tutorialPracticeDate}</p></section><section><h3>Study checklist</h3>{["Review notes","Practice problems","Pack materials"].map((item) => <label key={item}><input type="checkbox" checked={tutorialPracticeDone.includes(item)} onChange={() => setTutorialPracticeDone((done) => done.includes(item) ? done.filter((value) => value !== item) : [...done,item])} />{item}</label>)}</section></div>}
                  {tutorialStep === 4 && <div className="practice-workspace"><p className="practice-widget-instruction">Open the <strong>Widgets</strong> tab in GlowDocket to add widgets. Drag a six-dot handle to move a widget, or drag any edge or corner to resize it.</p>{[["plan","Plan of Attack","Biology review"],["calendar","Mini Calendar","3 deadlines"],["checklists","Checklists","1 of 3 complete"]].filter(([id]) => tutorialPracticeHiddenWidget !== id).map(([id,title,detail]) => <div key={id} style={{ left: tutorialWidgetLayout[id].x, top: tutorialWidgetLayout[id].y, width: tutorialWidgetLayout[id].width, height: tutorialWidgetLayout[id].height }}><header><button type="button" className="practice-widget-drag" aria-label={`Move ${title}`} onPointerDown={(event) => startTutorialWidgetInteraction(event, id)}>⠿</button><strong>{title}</strong><button type="button" className="practice-widget-menu-button" aria-label={`${title} options`} onClick={() => setTutorialPracticeWidgetMenu((open) => open === id ? "" : id)}>•••</button></header>{tutorialPracticeWidgetMenu === id && <button type="button" className="practice-widget-hide" onClick={() => { setTutorialPracticeHiddenWidget(id); setTutorialPracticeWidgetMenu(""); }}>Hide widget</button>}<span>{detail}</span>{[["top",{top:true}],["right",{right:true}],["bottom",{bottom:true}],["left",{left:true}],["top-left",{top:true,left:true}],["top-right",{top:true,right:true}],["bottom-right",{bottom:true,right:true}],["bottom-left",{bottom:true,left:true}]].map(([edge, edges]) => <button type="button" key={edge} className={`practice-widget-resize is-${edge}`} aria-label={`Resize ${title} from ${edge}`} onPointerDown={(event) => startTutorialWidgetInteraction(event, id, edges)} />)}</div>)}</div>}
                  {tutorialStep === 5 && <div className="practice-calendar"><section><h3>Your Day Cycle</h3><p>Have different classes on different days? Name each schedule day and choose an anchor date.</p><div>{["A Day", "B Day", "C Day", "D Day"].map((day) => <button type="button" key={day}>{day}</button>)}</div><p>Weekends are skipped automatically.</p></section><section><h3>Today: A Day</h3><p>Biology · English · Study Hall</p><p>Cycle labels can appear directly on your calendar.</p></section></div>}
                </main>
              </div>
            ) : (<>
            <div className={`tutorial-visual tutorial-${TUTORIAL_SLIDES[tutorialStep].visual}`} aria-hidden="true">
              {tutorialStep !== 0 && <div className="tutorial-browser-bar"><i /><i /><i /></div>}
              <div className="tutorial-illustration">
                {tutorialStep === 0 && <><div className="tutorial-mini-sidebar"><b>TC</b><span>Home</span><span>To Do</span><span>Calendar</span><span>Settings</span></div><div className="tutorial-mini-dashboard"><div className="tutorial-mini-heading"><span><strong>Welcome back</strong><small>Everything you want to get done, organized.</small></span><em>3 due soon</em></div><div className="tutorial-mini-grid"><i><strong>Plan of Attack</strong><small>Biology review</small><small>Literature response</small></i><i><strong>Today</strong><b>3</b><small>active tasks</small></i><i><strong>Progress</strong><b>72%</b><small>this week</small></i></div></div></>}
                {tutorialStep === 1 && <div className="tutorial-mini-form"><div className="tutorial-mini-form-heading"><strong>Add Assignment</strong><small>Required fields are marked</small></div><label>Assignment name<span>Biology chapter review</span></label><div><label>Course<span>Biology</span></label><label>Due date<span>Tomorrow · 11:00 PM</span></label></div><div><label>Priority<span>High</span></label><label>Estimated time<span>30 minutes</span></label></div><div className="tutorial-mini-options"><small>＋ Files</small><small>＋ Links</small><small>＋ Checklist steps</small></div><button type="button">Add Assignment</button></div>}
                {tutorialStep === 2 && <div className="tutorial-mini-plan"><div><span><strong>Best Next Steps</strong><small>Based on your workload</small></span><em>3 tasks · 1h 35m</em></div><ol><li><b>1</b><span><strong>Review cell structure</strong><small>Biology · Due tomorrow · 30 min</small><em><i>High priority</i><i>Due soon</i></em></span></li><li><b>2</b><span><strong>Literature response</strong><small>English · Due Friday · 45 min</small><em><i>2/3 steps done</i></em></span></li></ol></div>}
                {tutorialStep === 3 && <><div className="tutorial-mini-calendar"><div className="tutorial-mini-calendar-heading"><span>‹</span><strong>July 2026</strong><span>›</span></div><div>{["S","M","T","W","T","F","S","6","7","8","9","10","11","12","13","14","15","16","17","18","19"].map((day, index) => <span className={`${index === 17 ? "selected" : ""}${[10,15,19].includes(index) ? " has-task" : ""}`} key={`${day}-${index}`}>{day}</span>)}</div><small className="tutorial-calendar-legend"><i />Biology</small></div><div className="tutorial-mini-checklist"><div><strong>Study checklist</strong><em>1 of 3</em></div><span className="done">✓ Review notes</span><span>○ Practice problems <small>Due today</small></span><span>○ Pack materials</span><i><b /></i></div></>}
                {tutorialStep === 4 && <><div className="tutorial-mini-toolbar"><span>Open the Widgets tab to add widgets</span></div><div className="tutorial-mini-widget widget-one"><span>⠿ <i>•••</i></span><strong>Plan of Attack</strong><small>1. Biology review · Due tomorrow</small><small>2. Literature response · Friday</small></div><div className="tutorial-mini-widget widget-two"><span>⠿ <i>•••</i></span><strong>Mini Calendar</strong><small>July · 3 deadlines</small><b>◱</b></div><div className="tutorial-mini-widget widget-three"><span>⠿ <i>•••</i></span><strong>Checklists</strong><small>Study plan · 33%</small></div></>}
                {tutorialStep === 5 && <><div className="tutorial-mini-calendar"><div className="tutorial-mini-calendar-heading"><span>‹</span><strong>Day Cycle</strong><span>›</span></div><div>{["M","T","W","T","F","A","B","C","D","A","B","C","D","A"].map((day, index) => <span className={index > 4 ? "has-task" : ""} key={`${day}-${index}`}>{day}</span>)}</div><small className="tutorial-calendar-legend"><i />Different classes, right on schedule</small></div><div className="tutorial-mini-checklist"><div><strong>Today: A Day</strong><em>July 14</em></div><span>Biology</span><span>English</span><span>Study Hall</span></div></>}
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
            {tutorialGateMessage && <p id="tutorial-exploration-help" className="tutorial-gate-message" role="status" aria-live="polite">{tutorialGateMessage}</p>}
            <div className="tutorial-actions">
              <button type="button" className="btn btn-secondary" disabled={tutorialStep === 0} onClick={() => { setTutorialGateMessage(""); setTutorialStep((step) => step - 1); }}>Back</button>
              {tutorialStep < TUTORIAL_SLIDES.length - 1
                ? <button type="button" className="btn btn-primary" aria-describedby={tutorialGateMessage ? "tutorial-exploration-help" : undefined} onClick={advanceTutorial}>Next</button>
                : <button type="button" className="btn btn-primary" aria-describedby={tutorialGateMessage ? "tutorial-exploration-help" : undefined} onClick={completeTutorial}>Finish</button>}
            </div>
            </>)}
          </section>
        </div>
      )}
      {focusTaskId && tasks.find((task) => task.id === focusTaskId && !task.isCompleted && !task.isDeleted) && (
        <FocusSession
          task={tasks.find((task) => task.id === focusTaskId)}
          onClose={closeFocusSession}
          onKeepInProgress={keepFocusTaskInProgress}
          onComplete={completeFocusTask}
          onToggleSubtask={toggleFocusSubtask}
        />
      )}
      {gamificationOpen && (
        <div className="gamification-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setGamificationOpen(false); }}>
          <section className="gamification-dialog" role="dialog" aria-modal="true" aria-labelledby="gamification-title" onKeyDown={(event) => { if (event.key === "Escape") setGamificationOpen(false); }}>
            <header><div><h2 id="gamification-title">Cosmetics</h2><p>Collect badges, choose your display piece, equip a title, and pick a celebration style.</p></div><button autoFocus type="button" className="gamification-close" onClick={() => setGamificationOpen(false)} aria-label="Close Cosmetics">×</button></header>
            <div className="gamification-week-card"><div><strong>{weeklyMomentum.completed} of {weeklyMomentum.goal}</strong><span>assignments completed this week</span></div><progress max="100" value={weeklyMomentum.progress}>{weeklyMomentum.progress}%</progress><span>{weeklyMomentum.productiveDays} productive day{weeklyMomentum.productiveDays === 1 ? "" : "s"} this week</span><label>Weekly goal<input type="number" min="1" max="50" value={gamification.weeklyGoal} onChange={(event) => updateGamification({ weeklyGoal: event.target.value })} /></label></div>
            <section><h3>Badges</h3><p className="gamification-section-hint">Choose any earned badge to display in your momentum summary.</p><div className="achievement-grid">{GAMIFICATION_ACHIEVEMENTS.map((achievement) => { const earned = earnedAchievements.has(achievement.id); const selected = gamification.selectedBadge === achievement.id; return <button type="button" key={achievement.id} data-badge={achievement.id} className={`achievement-card badge-${achievement.id} ${earned ? "is-earned" : "is-locked"}${selected ? " is-selected" : ""} tone-${achievement.tone}`} disabled={!earned} aria-pressed={earned ? selected : undefined} onClick={() => updateGamification({ selectedBadge: achievement.id })}><span className="achievement-medallion" aria-hidden="true"><span className="achievement-rays" /><span className="achievement-core"><span className="achievement-icon"><AchievementEmblem id={earned ? achievement.id : "locked"} /></span></span><span className="achievement-ornament">✦</span></span><span className="achievement-card-copy"><strong>{achievement.title}</strong><small>{achievement.description}</small><em>{earned ? selected ? "Displayed" : "Earned" : "Locked"}</em></span></button>; })}</div></section>
            <section className="gamification-rewards">
              <h3>Celebration style</h3>
              <div>{GAMIFICATION_CONFETTI.map((option) => { const unlocked = !option.requirement || earnedAchievements.has(option.requirement); return <button type="button" key={option.id} className={gamification.selectedConfetti === option.id ? "is-selected" : ""} disabled={!unlocked} onClick={() => updateGamification({ selectedConfetti: option.id })}>{option.label}{!unlocked ? " 🔒" : ""}</button>; })}</div>
              {lockedCelebrationOptions.length > 0 && <details className="cosmetic-unlock-guide"><summary>How to unlock more celebrations <span>{lockedCelebrationOptions.length}</span></summary><ul>{lockedCelebrationOptions.map((option) => <li key={option.id}><span>{option.label}</span><small>{option.achievement?.description || "Complete its matching achievement."}</small></li>)}</ul></details>}
              <div className={`celebration-studio-progress${celebrationStudioProgress.unlocked ? " is-unlocked" : ""}`}><span aria-hidden="true">{celebrationStudioProgress.unlocked ? "🎨" : "🔒"}</span><div><strong>{celebrationStudioProgress.unlocked ? "Celebration Color Studio unlocked" : "Celebration Color Studio"}</strong><small>{celebrationStudioProgress.unlocked ? "Your custom celebration palette is available in Full Color Studio." : `Sign in on ${celebrationStudioProgress.remaining} more different day${celebrationStudioProgress.remaining === 1 ? "" : "s"} to unlock custom celebration colors.`}</small><progress max={CELEBRATION_STUDIO_REQUIRED_DAYS} value={celebrationStudioProgress.completed}>{celebrationStudioProgress.completed} of {CELEBRATION_STUDIO_REQUIRED_DAYS} days</progress><em>{celebrationStudioProgress.completed}/{CELEBRATION_STUDIO_REQUIRED_DAYS} days</em></div></div>
              <h3>Profile title</h3>
              <div>{GAMIFICATION_TITLES.map((option) => { const unlocked = !option.requirement || earnedAchievements.has(option.requirement); return <button type="button" key={option.id} className={gamification.selectedTitle === option.id ? "is-selected" : ""} disabled={!unlocked} onClick={() => updateGamification({ selectedTitle: option.id })}>{option.label}{!unlocked ? " 🔒" : ""}</button>; })}</div>
              {lockedTitleOptions.length > 0 && <details className="cosmetic-unlock-guide"><summary>How to unlock more titles <span>{lockedTitleOptions.length}</span></summary><ul>{lockedTitleOptions.map((option) => <li key={option.id}><span>{option.label}</span><small>{option.achievement?.description || "Complete its matching achievement."}</small></li>)}</ul></details>}
            </section>
          </section>
        </div>
      )}
      {syncConflict && syncConflictOpen && (
        <div className="sync-conflict-backdrop" role="presentation">
          <section className="sync-conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="sync-conflict-title">
            <p className="eyebrow">Nothing will be overwritten automatically</p>
            <h2 id="sync-conflict-title">Choose which saved version to keep</h2>
            <p>This device and the cloud both contain different GlowDocket data. A local backup has already been saved in this browser.</p>
            <div className="sync-conflict-actions">
              <button type="button" className="btn btn-secondary" onClick={handleKeepCloudConflict}>Keep cloud data</button>
              <button type="button" className="btn btn-primary" onClick={handleUseDeviceConflict}>Use this device’s data</button>
              <button type="button" className="btn btn-secondary" onClick={() => setSyncConflictOpen(false)}>Cancel and decide later</button>
            </div>
          </section>
        </div>
      )}
      {completionCelebration && (
        <div
          key={completionCelebration.id}
          className={`completion-celebration celebration-${completionCelebration.confetti || "standard"}${completionCelebration.celebrationColors ? " has-custom-colors" : ""}${completionCelebration.celebrationColors?.accent ? " has-custom-toast-accent" : ""}${completionCelebration.celebrationColors?.toastBackground ? " has-custom-toast-background" : ""}${completionCelebration.celebrationColors?.toastText ? " has-custom-toast-text" : ""}`}
          style={{ "--ripple-x": completionCelebration.celebrationOrigin ? `${completionCelebration.celebrationOrigin.x}px` : "50vw", "--ripple-y": completionCelebration.celebrationOrigin ? `${completionCelebration.celebrationOrigin.y}px` : "50vh", ...(completionCelebration.celebrationColors ? { "--celebration-1": completionCelebration.celebrationColors.palette1 || "#f43f5e", "--celebration-2": completionCelebration.celebrationColors.palette2 || "#f59e0b", "--celebration-3": completionCelebration.celebrationColors.palette3 || "#d4a72c", "--celebration-4": completionCelebration.celebrationColors.palette4 || "#22c55e", "--celebration-5": completionCelebration.celebrationColors.palette5 || "#06b6d4", "--celebration-6": completionCelebration.celebrationColors.palette6 || "#a855f7", "--celebration-accent": completionCelebration.celebrationColors.accent || "#8b5cf6", "--celebration-toast-bg": completionCelebration.celebrationColors.toastBackground || "#111827", "--celebration-toast-text": completionCelebration.celebrationColors.toastText || "#ffffff" } : {}) }}
          role="status"
          aria-live="polite"
        >
          {completionCelebration.confetti === "fireworks" ? <div className="completion-fireworks" aria-hidden="true">{getFireworkBursts(completionCelebration.id).map((burst) => <span className="completion-firework" key={burst.id} style={{ "--burst-x": `${burst.x}%`, "--burst-y": `${burst.y}%`, "--burst-delay": `${burst.delay}ms` }}><b />{Array.from({ length: 12 }, (_, lineIndex) => <i key={lineIndex} style={{ "--burst-angle": `${lineIndex * 30}deg`, "--burst-color": `var(--celebration-${(burst.id + lineIndex) % 6 + 1}, ${["#f43f5e", "#f59e0b", "#facc15", "#22c55e", "#06b6d4", "#a855f7"][(burst.id + lineIndex) % 6]})` }} />)}</span>)}</div> : completionCelebration.confetti === "gold-ripple" ? <div className="completion-gold-ripple" aria-hidden="true"><span className="gold-ripple-flash" />{Array.from({ length: 7 }, (_, index) => <svg className="completion-gold-ripple-ring" key={index} style={{ "--ripple-delay": `${index * 95}ms` }} width="1" height="1" focusable="false"><ellipse className="ripple-vector-halo ripple-vector-halo-outer" cx="0" cy="0" /><ellipse className="ripple-vector-halo" cx="0" cy="0" /><ellipse className="ripple-vector-core" cx="0" cy="0" /></svg>)}<div className="gold-ripple-speed-lines">{Array.from({ length: 24 }, (_, index) => <b key={index} style={{ "--line-angle": `${index * 15}deg`, "--line-delay": `${(index % 4) * 45}ms` }} />)}</div></div> : <div className={`completion-confetti is-${completionCelebration.confetti || "standard"}`} style={{ "--course-confetti": completionCelebration.courseColor }} aria-hidden="true">
            {(completionCelebration.confetti === "meteors" ? METEOR_SHOWER_PARTICLES : COMPLETION_CONFETTI).map((piece, index) => <i key={piece.id} style={{ "--confetti-x": piece.x, "--confetti-drift": piece.drift, "--confetti-sway": piece.sway, "--confetti-sway-back": piece.swayBack, "--confetti-scale": piece.scale, "--confetti-delay": piece.delay, "--confetti-duration": piece.duration, "--confetti-rotation": piece.rotation, "--confetti-color": `var(--celebration-${(index % 6) + 1}, ${piece.color})` }} />)}
          </div>}
          <div className="completion-celebration-toast"><span aria-hidden="true">✓</span><div><strong>{completionCelebration.achievementIds?.length ? "Achievement unlocked!" : "Nice work!"}</strong><small>{completionCelebration.title} is complete.{completionCelebration.achievementIds?.length ? ` ${completionCelebration.achievementIds.map((id) => GAMIFICATION_ACHIEVEMENTS.find((item) => item.id === id)?.title).filter(Boolean).join(", ")}.` : ""}</small></div></div>
        </div>
      )}
      {deletedAssignmentUndo && (
        <div className="delete-undo-toast" role="status" aria-live="polite">
          <span><strong>Moved to Trash</strong><small>{deletedAssignmentUndo.title} can still be recovered.</small></span>
          <button type="button" className="btn btn-secondary" onClick={handleUndoDeletedAssignment}>Undo</button>
          <button type="button" className="delete-undo-dismiss" aria-label="Dismiss undo message" onClick={() => setDeletedAssignmentUndo(null)}>×</button>
        </div>
      )}
    </div>
  );
}

export default App;
