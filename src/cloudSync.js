import { createReportMetadata } from "./buildMetadata.js";

export const CLOUD_STATE_SCHEMA_VERSION = 2;
const DEVICE_SETTING_KEYS = new Set(["externalPushEnabled", "notificationsEnabled"]);
// Workspace geometry is intentionally device-specific so a Chromebook layout
// cannot replace the arrangement saved in a desktop browser (or vice versa).
const ACCOUNT_FIELDS = ["tasks", "courses", "courseColors", "userSettings", "checklists", "calendarEvents", "displayName"];

const parse = (value, fallback) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const getCloudCacheKey = (userId) => `taskcabinet_cloud_cache_${userId}`;
export const getCloudMetaKey = (userId) => `taskcabinet_cloud_meta_${userId}`;
export const getCloudBackupKey = (userId) => `taskcabinet_cloud_backup_${userId}_${Date.now()}`;

export function readStoredSection(storage, key, fallback, isValid = () => true) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    return isValid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function isOpaqueProfileId(value) {
  return UUID_PATTERN.test(String(value || "").trim());
}

export function resolveProfileDisplayName(candidate, profileId = "", fallback = "") {
  const id = String(profileId || "").trim();
  for (const value of [candidate, fallback]) {
    const name = String(value || "").trim();
    if (name && name !== id && !isOpaqueProfileId(name)) return name;
  }
  return id && !isOpaqueProfileId(id) ? id : "";
}

export function sanitizeSettings(settings = {}) {
  return Object.fromEntries(Object.entries(settings).filter(([key]) => !DEVICE_SETTING_KEYS.has(key)));
}

export function collectSyncableState({ tasks = [], courses = ["Other"], courseColors = {}, userSettings = {}, checklists = [], calendarEvents = [], workspaceLayout = {}, displayName = "" } = {}) {
  return { schemaVersion: CLOUD_STATE_SCHEMA_VERSION, tasks, courses, courseColors, userSettings: sanitizeSettings(userSettings), checklists, calendarEvents, workspaceLayout, displayName: String(displayName || "").slice(0, 80) };
}

export function validateCloudState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Cloud state is not an object.");
  const version = Number(value.schemaVersion || 1);
  if (version > CLOUD_STATE_SCHEMA_VERSION) throw new Error("Cloud state was created by a newer GlowDocket version.");
  if (!Array.isArray(value.tasks) || !Array.isArray(value.courses) || !Array.isArray(value.checklists) || (value.calendarEvents !== undefined && !Array.isArray(value.calendarEvents))) throw new Error("Cloud state contains invalid lists.");
  if (!value.courseColors || typeof value.courseColors !== "object" || !value.userSettings || typeof value.userSettings !== "object" || !value.workspaceLayout || typeof value.workspaceLayout !== "object") throw new Error("Cloud state contains invalid settings.");
  return collectSyncableState(value);
}

export function hasMeaningfulState(state) {
  if (!state) return false;
  const workspace = state.workspaceLayout;
  const hasSavedWorkspace = Boolean(
    workspace
    && typeof workspace === "object"
    && !Array.isArray(workspace)
    && (
      workspace.userCustomized
      || workspace.updatedAt
      || Object.keys(workspace.collapsed || {}).length > 0
      || ["desktop", "chromebook", "mobile"].some((mode) => Object.values(workspace[mode] || {}).some((items) => Array.isArray(items) && items.length > 0))
    )
  );
  return state.tasks?.length > 0
    || state.checklists?.length > 0
    || state.calendarEvents?.length > 0
    || state.courses?.some((course) => course !== "Other")
    || Object.keys(state.courseColors || {}).length > 0
    || hasSavedWorkspace;
}

const isPlainObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));

function mergeObjects(localValue, cloudValue) {
  if (!isPlainObject(localValue) || !isPlainObject(cloudValue)) return cloudValue === undefined ? localValue : cloudValue;
  const merged = { ...localValue };
  Object.entries(cloudValue).forEach(([key, value]) => {
    merged[key] = isPlainObject(value) && isPlainObject(localValue[key])
      ? mergeObjects(localValue[key], value)
      : value;
  });
  return merged;
}

function mergeUniqueById(localItems = [], cloudItems = []) {
  const merged = [];
  const positions = new Map();
  [...localItems, ...cloudItems].forEach((item) => {
    const id = String(item?.id || "");
    if (id && positions.has(id)) merged[positions.get(id)] = item;
    else {
      if (id) positions.set(id, merged.length);
      merged.push(item);
    }
  });
  return merged;
}

function mergeCourses(localCourses = [], cloudCourses = []) {
  const merged = [];
  const seen = new Set();
  [...cloudCourses, ...localCourses, "Other"].forEach((course) => {
    const name = String(course || "").trim();
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key)) return;
    seen.add(key);
    merged.push(key === "other" ? "Other" : name);
  });
  const otherIndex = merged.indexOf("Other");
  if (otherIndex > 0) merged.unshift(...merged.splice(otherIndex, 1));
  return merged;
}

function mergeCalendarDayColors(localColors = {}, cloudColors = {}) {
  const merged = {};
  ["dates", "weekdays", "cycleDays", "entryNames"].forEach((scope) => {
    merged[scope] = { ...(localColors?.[scope] || {}) };
    Object.entries(cloudColors?.[scope] || {}).forEach(([key, cloudRule]) => {
      const localRule = merged[scope][key];
      const localTimestamp = typeof localRule === "string" ? 0 : Number(localRule?.updatedAt || 0);
      const cloudTimestamp = typeof cloudRule === "string" ? 0 : Number(cloudRule?.updatedAt || 0);
      if (localRule === undefined || cloudTimestamp >= localTimestamp) merged[scope][key] = cloudRule;
    });
  });
  return merged;
}

function normalizeCourseReferences(courses, items, courseColors, userSettings) {
  const canonical = new Map(courses.map((course) => [course.toLocaleLowerCase(), course]));
  const courseName = (value) => canonical.get(String(value || "").trim().toLocaleLowerCase()) || value;
  const remapObject = (value) => Object.fromEntries(Object.entries(isPlainObject(value) ? value : {}).map(([key, entry]) => [courseName(key), entry]));
  return {
    items: items.map((item) => item?.course ? { ...item, course: courseName(item.course) } : item),
    courseColors: remapObject(courseColors),
    userSettings: {
      ...userSettings,
      courseCycleDays: remapObject(userSettings.courseCycleDays),
      cycleCourseMeetings: remapObject(userSettings.cycleCourseMeetings),
      weeklyCourseMeetings: remapObject(userSettings.weeklyCourseMeetings),
    },
  };
}

export function mergeAccountStates(localState, cloudState) {
  const local = validateCloudState(localState);
  const cloud = validateCloudState(cloudState);
  const courses = mergeCourses(local.courses, cloud.courses);
  const userSettings = mergeObjects(local.userSettings, cloud.userSettings);
  userSettings.calendarDayColors = mergeCalendarDayColors(local.userSettings.calendarDayColors, cloud.userSettings.calendarDayColors);
  const customColorThemes = mergeUniqueById(local.userSettings.customColorThemes, cloud.userSettings.customColorThemes);
  if (customColorThemes.length > 0) userSettings.customColorThemes = customColorThemes;
  userSettings.deletedColorThemeIds = [...new Set([
    ...(local.userSettings.deletedColorThemeIds || []),
    ...(cloud.userSettings.deletedColorThemeIds || []),
  ])];
  const normalized = normalizeCourseReferences(
    courses,
    mergeUniqueById(local.tasks, cloud.tasks),
    mergeObjects(local.courseColors, cloud.courseColors),
    userSettings,
  );
  return collectSyncableState({
    tasks: normalized.items,
    courses,
    courseColors: normalized.courseColors,
    userSettings: normalized.userSettings,
    checklists: mergeUniqueById(local.checklists, cloud.checklists),
    calendarEvents: mergeUniqueById(local.calendarEvents, cloud.calendarEvents),
    workspaceLayout: local.workspaceLayout,
    displayName: cloud.displayName || local.displayName,
  });
}

export function chooseHydrationState(local, localMeta, cloud) {
  if (!cloud) return { state: local, conflict: false };
  if (!hasMeaningfulState(local)) return { state: cloud.state, conflict: false };
  if (sameState(local, cloud.state)) return { state: local, conflict: false };
  const cloudRevision = Number(cloud.revision) || 0;
  const localRevision = Number(localMeta?.revision) || 0;
  if (localRevision === cloudRevision) {
    return { state: mergeAccountStates(local, cloud.state), conflict: false, needsUpload: true };
  }
  return { state: mergeAccountStates(local, cloud.state), conflict: false, needsUpload: true, cloudRevision, localRevision };
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

export function loadLatestLocalBackup(storage, userId) {
  const prefix = `taskcabinet_cloud_backup_${String(userId || "")}_`;
  const backupKeys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) backupKeys.push(key);
  }
  backupKeys.sort((left, right) => Number(right.slice(prefix.length)) - Number(left.slice(prefix.length)));
  if (backupKeys.length === 0) return null;
  for (const key of backupKeys) {
    try {
      return {
        key,
        savedAt: Number(key.slice(prefix.length)) || 0,
        state: validateCloudState(JSON.parse(storage.getItem(key))),
      };
    } catch {
      // Keep looking so one damaged backup does not hide an earlier valid copy.
    }
  }
  throw new Error("GlowDocket found a previous local version, but it could not be read safely.");
}

export function readLegacySnapshot(storage, profileKey, defaults) {
  if (!profileKey) return null;
  const preferredName = storage.getItem(`taskacadia_preferred_name_${profileKey}`);
  return collectSyncableState({
    tasks: parse(storage.getItem(`tasks_${profileKey}`), []),
    courses: parse(storage.getItem(`courses_${profileKey}`), ["Other"]),
    courseColors: parse(storage.getItem(`courseColors_${profileKey}`), {}),
    userSettings: { ...defaults, ...parse(storage.getItem(`settings_${profileKey}`), {}) },
    checklists: parse(storage.getItem(`checklists_${profileKey}`), []),
    calendarEvents: parse(storage.getItem(`calendarEvents_${profileKey}`), []),
    workspaceLayout: parse(storage.getItem(`workspaceLayout_${profileKey}`), {}),
    displayName: resolveProfileDisplayName(preferredName, profileKey, profileKey),
  });
}

export function removeCloudAccountLocalData(storage, userId) {
  const id = String(userId || "");
  if (!id) return;
  const exactKeys = [
    `tasks_${id}`, `courses_${id}`, `courseColors_${id}`, `settings_${id}`, `mobileSettings_${id}`,
    `checklists_${id}`, `calendarEvents_${id}`, `workspaceLayout_${id}`, `taskacadia_preferred_name_${id}`,
    `taskacadia_notified_${id}`, `taskacadia_checklist_notified_${id}`,
    `taskcabinet_accessibility_checklist_${id}`,
    getCloudCacheKey(id), getCloudMetaKey(id),
  ];
  exactKeys.forEach((key) => storage.removeItem(key));
  const backupPrefix = `taskcabinet_cloud_backup_${id}_`;
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key?.startsWith(backupPrefix)) storage.removeItem(key);
  }
}

export function applyCloudStateToLocal(storage, userId, state, deviceSettings = {}) {
  const valid = validateCloudState(state);
  storage.setItem(`tasks_${userId}`, JSON.stringify(valid.tasks));
  storage.setItem(`courses_${userId}`, JSON.stringify(valid.courses));
  storage.setItem(`courseColors_${userId}`, JSON.stringify(valid.courseColors));
  storage.setItem(`settings_${userId}`, JSON.stringify({ ...valid.userSettings, ...deviceSettings }));
  storage.setItem(`checklists_${userId}`, JSON.stringify(valid.checklists));
  storage.setItem(`calendarEvents_${userId}`, JSON.stringify(valid.calendarEvents));
  storage.setItem(`workspaceLayout_${userId}`, JSON.stringify(valid.workspaceLayout));
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

export function refreshLocalSnapshotFromStorage(storage, profileKey, cachedState, defaults = {}) {
  if (!profileKey) return cachedState;
  const legacy = readLegacySnapshot(storage, profileKey, defaults);
  const settingsKey = `settings_${profileKey}`;
  const mobileSettingsKey = `mobileSettings_${profileKey}`;
  const hasSettings = storage.getItem(settingsKey) !== null;
  const hasMobileSettings = storage.getItem(mobileSettingsKey) !== null;
  const isSettingsObject = (value) => value && typeof value === "object" && !Array.isArray(value);
  const desktopSettings = readStoredSection(storage, settingsKey, {}, isSettingsObject);
  const mobileSettings = readStoredSection(storage, mobileSettingsKey, {}, isSettingsObject);
  const mergedSettings = { ...defaults, ...desktopSettings, ...mobileSettings };
  if (hasMobileSettings) {
    storage.setItem(settingsKey, JSON.stringify(mergedSettings));
    storage.removeItem(mobileSettingsKey);
  }
  const cached = cachedState || legacy;
  const stored = (prefix) => storage.getItem(`${prefix}_${profileKey}`) !== null;
  return collectSyncableState({
    ...cached,
    tasks: stored("tasks") ? legacy.tasks : cached.tasks,
    courses: stored("courses") ? legacy.courses : cached.courses,
    courseColors: stored("courseColors") ? legacy.courseColors : cached.courseColors,
    userSettings: hasSettings || hasMobileSettings ? mergedSettings : cached.userSettings,
    checklists: stored("checklists") ? legacy.checklists : cached.checklists,
    calendarEvents: stored("calendarEvents") ? legacy.calendarEvents : cached.calendarEvents,
    workspaceLayout: stored("workspaceLayout") ? legacy.workspaceLayout : cached.workspaceLayout,
    displayName: storage.getItem(`taskacadia_preferred_name_${profileKey}`) !== null ? legacy.displayName : cached.displayName,
  });
}

export async function ensureCloudSnapshot(client, userId, localState, operations = {}) {
  const load = operations.load || loadCloudSnapshot;
  const create = operations.create || createCloudSnapshot;
  const validLocal = validateCloudState(localState);
  operations.onRequest?.("load");
  const existing = await load(client, userId);
  if (existing) return { snapshot: existing, created: false };
  operations.onRequest?.("create");
  const created = await create(client, userId, validLocal);
  return {
    snapshot: {
      state: validLocal,
      revision: Number(created.revision),
      updatedAt: created.updated_at,
    },
    created: true,
  };
}

export async function reconcileCloudAccountIdentities(client, localState, fetchImpl = fetch) {
  const validLocal = validateCloudState(localState);
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token) throw error || new Error("Sign in again to reconcile account data.");
  const response = await fetchImpl("/api/account/delete", {
    method: "POST",
    headers: { authorization: `Bearer ${data.session.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ action: "reconcile-sync", state: validLocal }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "GlowDocket could not reconcile account data.");
  return {
    state: validateCloudState(payload.state),
    revision: Number(payload.revision) || 0,
    updatedAt: payload.updatedAt || "",
    identitiesMerged: Number(payload.identitiesMerged) || 1,
  };
}

export async function replaceCloudSnapshot(client, userId, state, expectedRevision) {
  const { data, error } = await client.from("taskcabinet_cloud_state").update({ state: validateCloudState(state), schema_version: CLOUD_STATE_SCHEMA_VERSION, revision: expectedRevision + 1, updated_at: new Date().toISOString() }).eq("user_id", userId).eq("revision", expectedRevision).select("revision,updated_at").maybeSingle();
  if (error) throw error;
  if (!data) { const conflict = new Error("Cloud state changed on another device."); conflict.code = "revision_conflict"; throw conflict; }
  return data;
}

export async function loadCloudHistory(client, userId, limit = 10) {
  const { data, error } = await client.from("taskcabinet_cloud_history").select("id,state,revision,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data || []).map((item) => ({ ...item, state: validateCloudState(item.state), revision: Number(item.revision) || 0 }));
}

export function createPortableExport(state, exportedAt = new Date().toISOString()) {
  const data = validateCloudState(state);
  return {
    format: "taskcabinet-export",
    version: 1,
    exportedAt,
    _metadata: { ...createReportMetadata(exportedAt, data.schemaVersion), exportFormatVersion: 1 },
    data,
  };
}

export function parsePortableExport(value) {
  if (!value || value.format !== "taskcabinet-export" || Number(value.version) !== 1) throw new Error("This is not a supported GlowDocket export file.");
  return validateCloudState(value.data);
}

export function getCloudStateFingerprint(state) {
  return JSON.stringify(Object.fromEntries(ACCOUNT_FIELDS.map((key) => [key, state?.[key]])));
}

export function sameState(left, right) {
  return getCloudStateFingerprint(left) === getCloudStateFingerprint(right);
}
