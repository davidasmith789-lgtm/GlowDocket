import test from "node:test";
import assert from "node:assert/strict";
import { applyCloudStateToLocal, chooseHydrationState, collectSyncableState, createPortableExport, getCloudStateFingerprint, hasMeaningfulState, loadLatestLocalBackup, loadLocalSnapshot, mergeAccountStates, parsePortableExport, readLegacySnapshot, readStoredSection, refreshLocalSnapshotFromStorage, removeCloudAccountLocalData, resolveProfileDisplayName, saveLocalBackup, saveLocalSnapshot, validateCloudState } from "../src/cloudSync.js";

function memoryStorage() {
  const values = new Map();
  return { get length() { return values.size; }, key: (index) => [...values.keys()][index] ?? null, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
}

const state = (overrides = {}) => collectSyncableState({ tasks: [], courses: ["Other"], courseColors: {}, userSettings: {}, checklists: [], workspaceLayout: { desktop: {}, mobile: {}, collapsed: {} }, theme: "light", displayName: "Student", ...overrides });

test("cloud snapshots exclude notification toggles and retain account preferences", () => {
  const snapshot = state({ theme: "dark", userSettings: { textSize: "large", externalPushEnabled: true, notificationsEnabled: true, activeColorThemeId: "ocean-focus", activeColorThemeMode: "light", customColors: { page: "#ffffff" }, reminderMinutes: 60 } });
  assert.equal(snapshot.userSettings.textSize, "large");
  assert.equal(snapshot.userSettings.reminderMinutes, 60);
  assert.equal("externalPushEnabled" in snapshot.userSettings, false);
  assert.equal("notificationsEnabled" in snapshot.userSettings, false);
  assert.equal(snapshot.userSettings.activeColorThemeId, "ocean-focus");
  assert.equal(snapshot.userSettings.activeColorThemeMode, "light");
  assert.deepEqual(snapshot.userSettings.customColors, { page: "#ffffff" });
  assert.equal("theme" in snapshot, false);
});

test("cloud validation rejects malformed account data", () => {
  assert.throws(() => validateCloudState({ schemaVersion: 1, tasks: "bad" }), /invalid/i);
  assert.throws(() => validateCloudState({ ...state(), schemaVersion: 999 }), /newer/i);
});

test("local cloud caches remain isolated by Supabase user id", () => {
  const storage = memoryStorage();
  saveLocalSnapshot(storage, "user-a", state({ tasks: [{ id: "a" }] }), 2, true);
  saveLocalSnapshot(storage, "user-b", state({ tasks: [{ id: "b" }] }), 7, false);
  assert.equal(loadLocalSnapshot(storage, "user-a").tasks[0].id, "a");
  assert.equal(loadLocalSnapshot(storage, "user-b").tasks[0].id, "b");
});

test("applying cloud state preserves device notifications and applies account themes", () => {
  const storage = memoryStorage();
  applyCloudStateToLocal(storage, "auth-user", state({ userSettings: { textSize: "small", activeColorThemeId: "ocean-focus", activeColorThemeMode: "dark", customColors: { page: "#101827" } } }), { externalPushEnabled: true, notificationsEnabled: false });
  const settings = JSON.parse(storage.getItem("settings_auth-user"));
  assert.deepEqual(settings, { textSize: "small", activeColorThemeId: "ocean-focus", activeColorThemeMode: "dark", customColors: { page: "#101827" }, externalPushEnabled: true, notificationsEnabled: false });
});

test("class schedules and badge progress survive a cloud round trip", () => {
  const userSettings = {
    cycleAnchorDate: "2026-08-24",
    cycleDayNames: ["A Day", "B Day"],
    courseCycleDays: { Biology: ["A Day"], Algebra: ["B Day"] },
    schoolScheduleMode: "weekly",
    weeklyCourseMeetings: { Biology: [1, 3, 5], Algebra: [2, 4] },
    gamification: { totalXp: 2400, earnedAchievementIds: ["first-task", "master-planner"] },
  };
  const snapshot = validateCloudState(JSON.parse(JSON.stringify(state({ courses: ["Other", "Biology", "Algebra"], userSettings }))));
  assert.deepEqual(snapshot.courses, ["Other", "Biology", "Algebra"]);
  assert.deepEqual(snapshot.userSettings, userSettings);
});

test("calendar events and calendar appearance survive a cloud round trip", () => {
  const calendarEvents = [{ id: "event-1", date: "2026-08-31", name: "Study group", time: "15:00", endTime: "16:00", type: "event" }];
  const userSettings = { calendarDayColors: { dates: { "2026-08-31": { color: "#ff0000", updatedAt: 10 } }, weekdays: {}, cycleDays: {}, entryNames: {} }, activeColorThemeId: "ocean-focus", activeColorThemeMode: "dark" };
  const snapshot = validateCloudState(JSON.parse(JSON.stringify(state({ calendarEvents, userSettings }))));
  assert.deepEqual(snapshot.calendarEvents, calendarEvents);
  assert.deepEqual(snapshot.userSettings, userSettings);
});

test("mismatched devices merge account data and deduplicate courses case-insensitively", () => {
  const local = state({ tasks: [{ id: "local-task", course: "biology" }], courses: ["Other", "biology", "Chemistry"], calendarEvents: [{ id: "local-event", date: "2026-08-31", name: "Lab" }], userSettings: { calendarDayColors: { dates: { "2026-08-31": { color: "#ff0000", updatedAt: 20 } } }, customColorThemes: [{ id: "local-theme", name: "Local" }] } });
  const cloud = state({ tasks: [{ id: "cloud-task", course: "Biology" }], courses: ["Other", "Biology", "Physics"], calendarEvents: [{ id: "cloud-event", date: "2026-09-01", name: "Review" }], userSettings: { calendarDayColors: { dates: { "2026-08-31": { color: "#0000ff", updatedAt: 10 } } }, customColorThemes: [{ id: "cloud-theme", name: "Cloud" }] } });
  const merged = mergeAccountStates(local, cloud);
  assert.deepEqual(merged.courses, ["Other", "Biology", "Physics", "Chemistry"]);
  assert.deepEqual(merged.tasks.map((task) => task.course), ["Biology", "Biology"]);
  assert.deepEqual(merged.calendarEvents.map((event) => event.id), ["local-event", "cloud-event"]);
  assert.equal(merged.userSettings.calendarDayColors.dates["2026-08-31"].color, "#ff0000");
  assert.deepEqual(merged.userSettings.customColorThemes.map((theme) => theme.id), ["local-theme", "cloud-theme"]);
});

test("legacy phone settings are merged into unified account data before hydration", () => {
  const storage = memoryStorage();
  const cached = state({ courses: ["Other"], userSettings: { textSize: "small" } });
  storage.setItem("courses_student", JSON.stringify(["Other", "Biology"]));
  storage.setItem("settings_student", JSON.stringify({ textSize: "large", schoolLevel: "high" }));
  storage.setItem("mobileSettings_student", JSON.stringify({ cycleAnchorDate: "2026-08-24", courseCycleDays: { Biology: ["A Day"] }, gamification: { totalXp: 800, earnedAchievementIds: ["first-task"] } }));
  const refreshed = refreshLocalSnapshotFromStorage(storage, "student", cached, {});
  assert.deepEqual(refreshed.courses, ["Other", "Biology"]);
  assert.equal(refreshed.userSettings.textSize, "large");
  assert.equal(refreshed.userSettings.cycleAnchorDate, "2026-08-24");
  assert.deepEqual(refreshed.userSettings.gamification.earnedAchievementIds, ["first-task"]);
  assert.equal(storage.getItem("mobileSettings_student"), null);
  assert.equal(JSON.parse(storage.getItem("settings_student")).cycleAnchorDate, "2026-08-24");
});

test("meaningful-state detection protects assignments and custom courses", () => {
  assert.equal(hasMeaningfulState(state()), false);
  assert.equal(hasMeaningfulState(state({ tasks: [{ id: "task" }] })), true);
  assert.equal(hasMeaningfulState(state({ courses: ["Other", "Biology"] })), true);
});

test("cloud account ids are never used as preferred names", () => {
  const storage = memoryStorage();
  const userId = "bbdf6a28-6727-42d2-aafd-8df1048ae28e";
  assert.equal(readLegacySnapshot(storage, userId, {}).displayName, "");
  assert.equal(resolveProfileDisplayName(userId, userId, "David"), "David");
});

test("legacy local profiles keep their preferred names", () => {
  const storage = memoryStorage();
  storage.setItem("taskacadia_preferred_name_student-profile", "Sam");
  assert.equal(readLegacySnapshot(storage, "student-profile", {}).displayName, "Sam");
});

test("saved fingerprints cannot be changed through a shared object reference", () => {
  const task = { id: "task", title: "Original" };
  const snapshot = state({ tasks: [task] });
  const savedFingerprint = getCloudStateFingerprint(snapshot);
  task.title = "Changed later";
  assert.notEqual(getCloudStateFingerprint(snapshot), savedFingerprint);
});

test("deleting a cloud account clears only that account's browser data", () => {
  const storage = memoryStorage();
  saveLocalSnapshot(storage, "deleted-user", state({ tasks: [{ id: "gone" }] }), 2, false);
  storage.setItem("tasks_deleted-user", "[]");
  storage.setItem("mobileSettings_deleted-user", "{}");
  storage.setItem("taskcabinet_cloud_backup_deleted-user_123", "{}");
  storage.setItem("tasks_other-user", "keep");
  removeCloudAccountLocalData(storage, "deleted-user");
  assert.equal(storage.getItem("tasks_deleted-user"), null);
  assert.equal(storage.getItem("mobileSettings_deleted-user"), null);
  assert.equal(storage.getItem("taskcabinet_cloud_backup_deleted-user_123"), null);
  assert.equal(storage.getItem("tasks_other-user"), "keep");
});

test("portable exports round-trip validated planner data", () => {
  const original = state({ tasks: [{ id: "assignment", title: "Essay" }] });
  const exported = createPortableExport(original, "2026-07-13T12:00:00.000Z");
  assert.equal(exported.format, "taskcabinet-export");
  assert.equal(exported._metadata.createdAt, "2026-07-13T12:00:00.000Z");
  assert.equal(exported._metadata.dataSchemaVersion, 2);
  assert.equal(exported._metadata.exportFormatVersion, 1);
  assert.equal(typeof exported._metadata.commitSha, "string");
  assert.deepEqual(parsePortableExport(exported), original);
  assert.deepEqual(parsePortableExport({ format: "taskcabinet-export", version: 1, exportedAt: exported.exportedAt, data: original }), original);
  assert.throws(() => parsePortableExport({ format: "unknown" }), /supported/i);
});

test("meaningful-state detection protects customized desktop and mobile layouts", () => {
  const desktopLayout = { desktop: { dashboard: [{ id: "recommended-1", type: "recommended", x: 140, y: 80, width: 420, height: 300 }] }, mobile: {}, collapsed: {}, locked: { desktop: false, mobile: false }, userCustomized: true };
  const mobileLayout = { desktop: {}, mobile: { dashboard: [{ id: "quick-match-2", type: "quick-match", x: 12, y: 24, width: 340, height: 260 }] }, collapsed: { "quick-match": true }, locked: { desktop: true, mobile: false } };
  assert.equal(hasMeaningfulState(state({ workspaceLayout: desktopLayout })), true);
  assert.equal(hasMeaningfulState(state({ workspaceLayout: mobileLayout })), true);
});

test("hydration keeps a device layout without prompting when only cloud geometry differs", () => {
  const localLayout = { desktop: { dashboard: [{ id: "recommended-1", type: "recommended", x: 140, y: 80, width: 420, height: 300 }] }, mobile: {}, collapsed: {}, locked: { desktop: false, mobile: false }, userCustomized: true };
  const cloudLayout = { desktop: { dashboard: [{ id: "recommended-1", type: "recommended", x: 0, y: 0, width: 320, height: 260 }] }, mobile: {}, collapsed: {}, locked: { desktop: true, mobile: false } };
  const local = state({ workspaceLayout: localLayout });
  const cloud = { state: state({ workspaceLayout: cloudLayout }), revision: 12 };
  const choice = chooseHydrationState(local, { revision: 12, pending: false }, cloud);
  assert.equal(choice.conflict, false);
  assert.strictEqual(choice.state, local);
});

test("workspace layouts are device-specific and do not create cloud conflicts", () => {
  const desktop = state({ workspaceLayout: { desktop: { dashboard: [{ id: "pc-layout" }] } } });
  const chromebook = state({ workspaceLayout: { chromebook: { dashboard: [{ id: "chromebook-layout" }] } } });
  assert.equal(getCloudStateFingerprint(desktop), getCloudStateFingerprint(chromebook));
  const choice = chooseHydrationState(desktop, { revision: 3, pending: false }, { state: chromebook, revision: 3 });
  assert.equal(choice.conflict, false);
  assert.strictEqual(choice.state, desktop);
});

test("hydration merges pending changes from devices with different revisions", () => {
  const local = state({ tasks: [{ id: "device-task", title: "Device draft" }] });
  const cloud = { state: state({ tasks: [{ id: "cloud-task", title: "Cloud draft" }] }), revision: 12 };
  const choice = chooseHydrationState(local, { revision: 11, pending: true }, cloud);
  assert.equal(choice.conflict, false);
  assert.equal(choice.needsUpload, true);
  assert.deepEqual(choice.state.tasks.map((task) => task.id), ["device-task", "cloud-task"]);
});

test("hydration combines unique data even when both devices previously reported saved", () => {
  const local = state({ courses: ["Other", "Biology"], checklists: [{ id: "computer-list", title: "Computer" }] });
  const cloud = { state: state({ courses: ["Other", "APES"], checklists: [{ id: "chromebook-list", title: "APES" }] }), revision: 9 };
  const choice = chooseHydrationState(local, { revision: 9, pending: false }, cloud);
  assert.equal(choice.conflict, false);
  assert.equal(choice.needsUpload, true);
  assert.deepEqual(choice.state.courses, ["Other", "APES", "Biology"]);
  assert.deepEqual(choice.state.checklists.map((list) => list.id), ["computer-list", "chromebook-list"]);
});

test("pending changes based on the current cloud revision sync without a popup", () => {
  const local = state({ tasks: [{ id: "device-task", title: "Safe local edit" }] });
  const cloud = { state: state({ tasks: [] }), revision: 12 };
  const choice = chooseHydrationState(local, { revision: 12, pending: true }, cloud);
  assert.equal(choice.conflict, false);
  assert.equal(choice.needsUpload, true);
  assert.deepEqual(choice.state.tasks, local.tasks);
});

test("new empty devices hydrate from meaningful cloud layouts without uploading defaults", () => {
  const cloudLayout = { desktop: { dashboard: [{ id: "checklists-1", type: "checklists", x: 55, y: 35, width: 500, height: 400 }] }, mobile: {}, collapsed: {}, locked: { desktop: false, mobile: false }, userCustomized: true };
  const emptyLocal = state();
  const cloud = { state: state({ workspaceLayout: cloudLayout }), revision: 4 };
  const choice = chooseHydrationState(emptyLocal, { revision: 0, pending: false }, cloud);
  assert.equal(choice.conflict, false);
  assert.strictEqual(choice.state, cloud.state);
});

test("damaged profile sections fall back independently", () => {
  const storage = memoryStorage();
  storage.setItem("tasks_student", "not-json");
  storage.setItem("courses_student", JSON.stringify(["Biology", "Other"]));
  storage.setItem("settings_student", JSON.stringify({ textSize: "large" }));
  assert.deepEqual(readStoredSection(storage, "tasks_student", [], Array.isArray), []);
  assert.deepEqual(readStoredSection(storage, "courses_student", ["Other"], Array.isArray), ["Biology", "Other"]);
  assert.deepEqual(readStoredSection(storage, "settings_student", {}, (value) => value && typeof value === "object" && !Array.isArray(value)), { textSize: "large" });
  storage.setItem("courses_student", JSON.stringify({ invalid: true }));
  assert.deepEqual(readStoredSection(storage, "courses_student", ["Other"], Array.isArray), ["Other"]);
});

test("latest local recovery backup is validated and skips damaged newer copies", () => {
  const storage = memoryStorage();
  assert.equal(loadLatestLocalBackup(storage, "student"), null);
  const originalNow = Date.now;
  try {
    Date.now = () => 100;
    saveLocalBackup(storage, "student", state({ tasks: [{ id: "safe-copy" }] }));
    storage.setItem("taskcabinet_cloud_backup_student_200", "damaged");
    const backup = loadLatestLocalBackup(storage, "student");
    assert.equal(backup.savedAt, 100);
    assert.equal(backup.state.tasks[0].id, "safe-copy");
  } finally {
    Date.now = originalNow;
  }
});

test("local recovery reports when every saved backup is malformed", () => {
  const storage = memoryStorage();
  storage.setItem("taskcabinet_cloud_backup_student_100", "{}");
  assert.throws(() => loadLatestLocalBackup(storage, "student"), /could not be read safely/i);
});
