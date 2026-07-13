export const EXTERNAL_PUSH_CLIENT_ENABLED = /^(1|true|yes|on)$/i.test(String(import.meta.env?.VITE_EXTERNAL_PUSH_ENABLED || ""));

export function isPushEnvironmentSupported(locationValue = globalThis.location, navigatorValue = globalThis.navigator) {
  const localHost = ["localhost", "127.0.0.1", "::1"].includes(locationValue?.hostname);
  return Boolean((locationValue?.protocol === "https:" || localHost) && navigatorValue?.serviceWorker && "PushManager" in globalThis && "Notification" in globalThis);
}

export function createOpaqueDeviceId(cryptoValue = globalThis.crypto) {
  if (!cryptoValue?.getRandomValues) throw new Error("Secure random IDs are unavailable.");
  const bytes = new Uint8Array(24);
  cryptoValue.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function getPushDeviceStorageKey(profile) {
  return `taskacadia_push_device_${encodeURIComponent(String(profile || ""))}`;
}
export function getPushCleanupStorageKey(profile) { return `taskacadia_push_cleanup_${encodeURIComponent(String(profile || ""))}`; }
export function getOccurrenceKey(taskId, deadline) { return `${taskId}:${new Date(deadline).toISOString()}`; }

export function makeReminderRevision(reminder) {
  const value = [reminder.taskId, reminder.title, reminder.course, reminder.preferredName, reminder.deadline, reminder.timeZone, reminder.leadMinutes].join("\u001f");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function buildDesiredReminders(tasks, { leadMinutes, timeZone, getDeadline, preferredName = "", now = Date.now() }) {
  return tasks.flatMap((task) => {
    if (task?.isArchived || task?.isDeleted || task?.isCompleted || task?.status === "completed") return [];
    const deadline = getDeadline(task);
    if (!(deadline instanceof Date) || !Number.isFinite(deadline.getTime())) return [];
    const scheduledFor = deadline.getTime() - Number(leadMinutes) * 60000;
    if (deadline.getTime() <= now || scheduledFor < now - 60000) return [];
    const reminder = { taskId: String(task.id), occurrenceKey: getOccurrenceKey(String(task.id), deadline), title: String(task.title || "Assignment").slice(0, 160), course: String(task.course || "").slice(0, 100), preferredName: String(preferredName || "").trim().slice(0, 60), deadline: deadline.toISOString(), timeZone, leadMinutes: Number(leadMinutes) };
    return [{ ...reminder, revision: makeReminderRevision(reminder) }];
  });
}

export function shouldUseOpenAppFallback(status) {
  return !["active", "syncing"].includes(status);
}
