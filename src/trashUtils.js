export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function isTrashExpired(task, now = Date.now()) {
  if (!task?.isDeleted || !task.deletedAt) return false;
  const deletedTime = new Date(task.deletedAt).getTime();
  return Number.isFinite(deletedTime) && now - deletedTime >= TRASH_RETENTION_MS;
}

export function getTrashDaysRemaining(task, now = Date.now()) {
  if (!task?.isDeleted || !task.deletedAt) return null;
  const deletedTime = new Date(task.deletedAt).getTime();
  if (!Number.isFinite(deletedTime)) return null;
  return Math.max(0, Math.ceil((deletedTime + TRASH_RETENTION_MS - now) / (24 * 60 * 60 * 1000)));
}
