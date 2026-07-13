export const CLOUD_STATE_SCHEMA_VERSION = 1;
const DEVICE_SETTING_KEYS = new Set(["externalPushEnabled", "notificationsEnabled"]);
const ACCOUNT_FIELDS = ["tasks", "courses", "courseColors", "userSettings", "checklists", "workspaceLayout", "theme", "displayName"];

const parse = (value, fallback) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } };
export const getCloudCacheKey = (userId) => `taskcabinet_cloud_cache_${userId}`;
export const getCloudMetaKey = (userId) => `taskcabinet_cloud_meta_${userId}`;
export const getCloudBackupKey = (userId) => `taskcabinet_cloud_backup_${userId}_${Date.now()}`;

export function sanitizeSettings(settings = {}) {
  return Object.fromEntries(Object.entries(settings).filter(([key]) => !DEVICE_SETTING_KEYS.has(key)));
}

export function collectSyncableState({ tasks = [], courses = ["Other"], courseColors = {}, userSettings = {}, checklists = [], workspaceLayout = {}, theme = "light", displayName = "" } = {}) {
  return { schemaVersion: CLOUD_STATE_SCHEMA_VERSION, tasks, courses, courseColors, userSettings: sanitizeSettings(userSettings), checklists, workspaceLayout, theme, displayName: String(displayName || "").slice(0, 80) };
}

export function validateCloudState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Cloud state is not an object.");
  const version = Number(value.schemaVersion || 1);
  if (version > CLOUD_STATE_SCHEMA_VERSION) throw new Error("Cloud state was created by a newer TaskCabinet version.");
  if (!Array.isArray(value.tasks) || !Array.isArray(value.courses) || !Array.isArray(value.checklists)) throw new Error("Cloud state contains invalid lists.");
  if (!value.courseColors || typeof value.courseColors !== "object" || !value.userSettings || typeof value.userSettings !== "object" || !value.workspaceLayout || typeof value.workspaceLayout !== "object") throw new Error("Cloud state contains invalid settings.");
  return collectSyncableState(value);
}

export function hasMeaningfulState(state) {
  if (!state) return false;
  return state.tasks?.length > 0 || state.checklists?.length > 0 || state.courses?.some((course) => course !== "Other") || Object.keys(state.courseColors || {}).length > 0;
}

export function loadLocalSnapshot(storage, userId) {
  return parse(storage.getItem(getCloudCacheKey(userId)), null);
}

export function saveLocalSnapshot(storage, userId, state, revision = 0, pending = true) {
  const valid = validateCloudState(state);
  storage.setItem(getCloudCacheKey(userId), JSON.stringify(valid));
  storage.setItem(getCloudMetaKey(userId), JSON.stringify({ revision: Number(revision) || 0, pending, updatedAt: new Date().toISOString() }));
  return valid;
}

export function loadLocalMeta(storage, userId) {
  return parse(storage.getItem(getCloudMetaKey(userId)), { revision: 0, pending: false });
}

export function saveLocalBackup(storage, userId, state) {
  const key = getCloudBackupKey(userId);
  storage.setItem(key, JSON.stringify(validateCloudState(state)));
  return key;
}

export function readLegacySnapshot(storage, profileKey, defaults) {
  if (!profileKey) return null;
  return collectSyncableState({
    tasks: parse(storage.getItem(`tasks_${profileKey}`), []),
    courses: parse(storage.getItem(`courses_${profileKey}`), ["Other"]),
    courseColors: parse(storage.getItem(`courseColors_${profileKey}`), {}),
    userSettings: { ...defaults, ...parse(storage.getItem(`settings_${profileKey}`), {}) },
    checklists: parse(storage.getItem(`checklists_${profileKey}`), []),
    workspaceLayout: parse(storage.getItem(`workspaceLayout_${profileKey}`), {}),
    theme: storage.getItem("theme") || "light",
    displayName: profileKey,
  });
}

export function applyCloudStateToLocal(storage, userId, state, deviceSettings = {}) {
  const valid = validateCloudState(state);
  storage.setItem(`tasks_${userId}`, JSON.stringify(valid.tasks));
  storage.setItem(`courses_${userId}`, JSON.stringify(valid.courses));
  storage.setItem(`courseColors_${userId}`, JSON.stringify(valid.courseColors));
  storage.setItem(`settings_${userId}`, JSON.stringify({ ...valid.userSettings, ...deviceSettings }));
  storage.setItem(`checklists_${userId}`, JSON.stringify(valid.checklists));
  storage.setItem(`workspaceLayout_${userId}`, JSON.stringify(valid.workspaceLayout));
  storage.setItem("theme", valid.theme);
  return valid;
}

export async function loadCloudSnapshot(client, userId) {
  const { data, error } = await client.from("taskcabinet_cloud_state").select("state,schema_version,revision,updated_at").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data ? { state: validateCloudState(data.state), revision: Number(data.revision), updatedAt: data.updated_at } : null;
}

export async function createCloudSnapshot(client, userId, state) {
  const { data, error } = await client.from("taskcabinet_cloud_state").insert({ user_id: userId, state: validateCloudState(state), schema_version: CLOUD_STATE_SCHEMA_VERSION, revision: 1 }).select("revision,updated_at").single();
  if (error) throw error;
  return data;
}

export async function replaceCloudSnapshot(client, userId, state, expectedRevision) {
  const { data, error } = await client.from("taskcabinet_cloud_state").update({ state: validateCloudState(state), schema_version: CLOUD_STATE_SCHEMA_VERSION, revision: expectedRevision + 1, updated_at: new Date().toISOString() }).eq("user_id", userId).eq("revision", expectedRevision).select("revision,updated_at").maybeSingle();
  if (error) throw error;
  if (!data) { const conflict = new Error("Cloud state changed on another device."); conflict.code = "revision_conflict"; throw conflict; }
  return data;
}

export function getCloudStateFingerprint(state) {
  return JSON.stringify(Object.fromEntries(ACCOUNT_FIELDS.map((key) => [key, state?.[key]])));
}

export function sameState(left, right) {
  return getCloudStateFingerprint(left) === getCloudStateFingerprint(right);
}
