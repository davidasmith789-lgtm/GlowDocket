const ATTENTION_STATUSES = new Set(["failed", "sync_needed", "cleanup_pending", "server_disabled", "subscription_pending", "not_configured"]);
const CONNECTING_STATUSES = new Set(["connecting", "syncing", "connected"]);

export function deriveReminderUserStatus({ featureEnabled, remindersEnabled, supported, permission, providerConnected, serverEnrolled, rawStatus }) {
  if (!featureEnabled || rawStatus === "client_disabled") return "off";
  if (!supported || rawStatus === "unsupported") return "unsupported";
  if (permission === "denied" || rawStatus === "permission_blocked") return "blocked";
  if (!remindersEnabled) return "off";
  if (permission !== "granted" || rawStatus === "permission_needed") return CONNECTING_STATUSES.has(rawStatus) ? "connecting" : "off";
  if (CONNECTING_STATUSES.has(rawStatus)) return "connecting";
  if (rawStatus === "active" && providerConnected && serverEnrolled) return "active";
  if (ATTENTION_STATUSES.has(rawStatus) || !providerConnected || !serverEnrolled) return "needs_attention";
  return "needs_attention";
}

export function getReminderStatusCopy(status) {
  return {
    off: { title: "Push reminders are off", detail: "Push reminders are disabled." },
    connecting: { title: "Connecting", detail: "TaskCabinet is connecting this browser." },
    active: { title: "Push reminders are active", detail: "Reminders are up to date." },
    needs_attention: { title: "Push reminders need attention", detail: "Some reminders could not be updated." },
    blocked: { title: "Notifications are blocked", detail: "TaskCabinet cannot reopen the browser permission prompt." },
    unsupported: { title: "Push reminders are unsupported", detail: "This browser or platform does not support the required notification features." },
  }[status];
}

export const shouldShowRepairReminderSync = (status, rawStatus) => status === "needs_attention" || ["failed", "sync_needed", "cleanup_pending"].includes(rawStatus);
export const canSendReminderTest = (status, busy) => status === "active" && !busy;

export function friendlyReminderError(error, offline = false) {
  const message = String(error?.message || "");
  if (offline || error?.name === "TypeError" || /failed to fetch|network|offline/i.test(message)) return "You’re offline. TaskCabinet will finish setting up reminders when you reconnect.";
  if (/permission|blocked|denied/i.test(message)) return "Notifications are blocked. Allow them in your browser settings, then try again.";
  return "We couldn’t finish setting up reminders right now. Your assignments are safe. Try again in a moment.";
}

export function formatReminderLeadTime(minutes) {
  const value = Number(minutes);
  if (value === 1440) return "1 day";
  if (value >= 60 && value % 60 === 0) return `${value / 60} hour${value === 60 ? "" : "s"}`;
  return `${value} minute${value === 1 ? "" : "s"}`;
}

export function createReminderActionGuard() {
  let busy = false;
  return {
    isBusy: () => busy,
    run: async (action) => {
      if (busy) return { skipped: true };
      busy = true;
      try { return await action(); } finally { busy = false; }
    },
  };
}

export function getAssignmentReminderIndicator({ remindersEnabled, hasDeadline, taskState, userStatus }) {
  if (!remindersEnabled || !hasDeadline) return null;
  if (["failed", "cleanup_pending"].includes(taskState) || userStatus === "needs_attention") return { tone: "failed", label: "Reminder needs attention" };
  if (["pending", "syncing", "external_disabled"].includes(taskState) || userStatus === "connecting") return { tone: "pending", label: "Reminder sync pending" };
  if (["scheduled", "pending_horizon", "healthy"].includes(taskState) && userStatus === "active") return { tone: "healthy", label: "Reminder scheduled" };
  return null;
}

export function clearReminderFailure(details, updates = {}) { return { ...details, ...updates, lastError: "" }; }

export function shouldShowReminderSuggestion({ hasProfile, remindersEnabled, dismissed, hasDatedAssignment }) {
  return Boolean(hasProfile && !remindersEnabled && !dismissed && hasDatedAssignment);
}
