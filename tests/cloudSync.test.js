import test from "node:test";
import assert from "node:assert/strict";
import { applyCloudStateToLocal, collectSyncableState, getCloudStateFingerprint, hasMeaningfulState, loadLocalSnapshot, readLegacySnapshot, resolveProfileDisplayName, saveLocalSnapshot, validateCloudState } from "../src/cloudSync.js";

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
}

const state = (overrides = {}) => collectSyncableState({ tasks: [], courses: ["Other"], courseColors: {}, userSettings: {}, checklists: [], workspaceLayout: { desktop: {}, mobile: {}, collapsed: {} }, theme: "light", displayName: "Student", ...overrides });

test("cloud snapshots exclude device-only reminder and theme settings", () => {
  const snapshot = state({ theme: "dark", userSettings: { textSize: "large", externalPushEnabled: true, notificationsEnabled: true, activeColorThemeId: "ocean-focus", customColors: { page: "#ffffff" }, reminderMinutes: 60 } });
  assert.equal(snapshot.userSettings.textSize, "large");
  assert.equal(snapshot.userSettings.reminderMinutes, 60);
  assert.equal("externalPushEnabled" in snapshot.userSettings, false);
  assert.equal("notificationsEnabled" in snapshot.userSettings, false);
  assert.equal("activeColorThemeId" in snapshot.userSettings, false);
  assert.equal("customColors" in snapshot.userSettings, false);
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

test("applying cloud state preserves device reminder and theme settings", () => {
  const storage = memoryStorage();
  applyCloudStateToLocal(storage, "auth-user", state({ userSettings: { textSize: "small" } }), { externalPushEnabled: true, notificationsEnabled: false, activeColorThemeId: "forest-study", customColors: { page: "#f2f8f1" } });
  const settings = JSON.parse(storage.getItem("settings_auth-user"));
  assert.deepEqual(settings, { textSize: "small", externalPushEnabled: true, notificationsEnabled: false, activeColorThemeId: "forest-study", customColors: { page: "#f2f8f1" } });
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
