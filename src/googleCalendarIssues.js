export const GOOGLE_ISSUE_CATEGORY_LABELS = {
  conflict: "Conflict",
  mapping_recovery: "Mapping recovery",
  event_missing: "Event missing or deleted",
  permission_problem: "Permission or access problem",
  recurrence_problem: "Recurrence problem",
  temporary_provider_failure: "Temporary provider failure",
  stale_sync_state: "Stale synchronization state",
};

export const GOOGLE_ISSUE_DIRECTION_LABELS = {
  glowdocket_to_google: "GlowDocket → Google",
  google_to_glowdocket: "Google → GlowDocket",
  bidirectional: "GlowDocket ↔ Google",
};

export function getGoogleIssueActions(issue) {
  if (issue.resolvedAt) return [{ id: "dismiss", label: "Dismiss resolved issue" }];
  if (issue.category === "conflict") return [{ id: "resolve_conflict", label: "Resolve conflict" }, { id: "retry", label: "Retry" }];
  if (issue.category === "event_missing") return [{ id: "add_back", label: "Add back to Google Calendar" }];
  if (issue.category === "permission_problem") return [{ id: "reconnect", label: "Reconnect Google" }];
  return [{ id: "retry", label: "Retry" }];
}

export function normalizeGoogleSyncIssue(issue, fallbackTitle = "Google Calendar item") {
  return {
    ...issue,
    itemTitle: issue.itemTitle || fallbackTitle,
    categoryLabel: GOOGLE_ISSUE_CATEGORY_LABELS[issue.category] || "Synchronization problem",
    directionLabel: GOOGLE_ISSUE_DIRECTION_LABELS[issue.direction] || "GlowDocket → Google",
    explanation: issue.explanation || "Google Calendar could not complete this synchronization step.",
    recommendedAction: issue.recommendedAction || "Retry synchronization.",
    diagnosticRef: /^GC-[A-F0-9]{4}$/.test(issue.diagnosticRef || "") ? issue.diagnosticRef : "GC-UNKNOWN",
    attemptCount: Math.max(1, Number(issue.attemptCount) || 1),
    actions: getGoogleIssueActions(issue),
  };
}

export function summarizeGoogleSyncIssues(activeIssues = [], resolvedIssues = [], counts = {}) {
  const activeCount = Number.isFinite(counts.activeCount) ? counts.activeCount : activeIssues.length;
  const resolvedCount = Number.isFinite(counts.resolvedCount) ? counts.resolvedCount : resolvedIssues.length;
  return {
    activeCount,
    resolvedCount,
    needsAttentionLabel: `${activeCount} issue${activeCount === 1 ? "" : "s"} need attention`,
    resolvedLabel: `${resolvedCount} past issue${resolvedCount === 1 ? "" : "s"} resolved`,
  };
}
