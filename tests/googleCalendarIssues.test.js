import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGoogleSyncIssue, summarizeGoogleSyncIssues } from "../src/googleCalendarIssues.js";
import { syncIssueDefaults, syncIssueDiagnosticReference, syncIssueIdentity } from "../server/services/googleCalendarService.js";
import { readFile } from "node:fs/promises";

test("Google Calendar issues use safe user-friendly explanations and applicable actions", () => {
  const defaults = syncIssueDefaults("permission_problem");
  const issue = normalizeGoogleSyncIssue({ category: "permission_problem", direction: "glowdocket_to_google", explanation: defaults.explanation, recommendedAction: defaults.action, diagnosticRef: "GC-8F2A", attemptCount: 3 });
  assert.equal(issue.categoryLabel, "Permission or access problem");
  assert.equal(issue.directionLabel, "GlowDocket → Google");
  assert.match(issue.explanation, /did not allow/);
  assert.deepEqual(issue.actions.map((action) => action.id), ["reconnect"]);
  assert.doesNotMatch(issue.explanation, /token|payload|stack|request id/i);
});

test("issue identity deduplicates repeats while retaining distinct items", () => {
  const input = { category: "event_missing", direction: "google_to_glowdocket", type: "assignment", id: "a-1", calendarId: "calendar", eventId: "event" };
  const first = syncIssueIdentity(input);
  assert.equal(syncIssueIdentity(input), first);
  assert.notEqual(syncIssueIdentity({ ...input, id: "a-2" }), first);
  assert.match(syncIssueDiagnosticReference("user", first), /^GC-[A-F0-9]{4}$/);
});

test("active and resolved issue summaries remain distinct", () => {
  const summary = summarizeGoogleSyncIssues(Array.from({ length: 20 }, (_, id) => ({ id })), Array.from({ length: 4 }, (_, id) => ({ id })));
  assert.equal(summary.activeCount, 20);
  assert.equal(summary.resolvedCount, 4);
  assert.equal(summary.needsAttentionLabel, "20 issues need attention");
  assert.equal(summary.resolvedLabel, "4 past issues resolved");
});

test("resolved issues offer dismissal and are not active", () => {
  const resolved = normalizeGoogleSyncIssue({ category: "temporary_provider_failure", resolvedAt: "2026-09-01T00:00:00.000Z", diagnosticRef: "GC-123A" });
  assert.deepEqual(resolved.actions.map((action) => action.id), ["dismiss"]);
  assert.equal(summarizeGoogleSyncIssues([], [resolved]).activeCount, 0);
});

test("later successful synchronization automatically resolves matching active issues", async () => {
  const service = await readFile(new URL("../server/services/googleCalendarService.js", import.meta.url), "utf8");
  const router = await readFile(new URL("../api/google-calendar.js", import.meta.url), "utf8");
  assert.match(service, /resolvedByType[\s\S]*resolution_reason: "successful_sync"/);
  assert.match(service, /resolved_at: new Date\(\)\.toISOString\(\)[\s\S]*\.is\("resolved_at", null\)/);
  assert.match(router, /categories: \["permission_problem", "temporary_provider_failure"\]/);
});

test("manual sync feedback remains active through continuations and restores server job state", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const service = await readFile(new URL("../server/services/googleCalendarService.js", import.meta.url), "utf8");
  assert.match(app, /result\.syncActive \? "sync"/);
  assert.match(app, /googleCalendarBusy === "sync" \? "Syncing/);
  assert.match(app, /googleCalendarBusy === "synced" \? "Synced"/);
  assert.match(app, /Syncing Google Calendar/);
  assert.match(app, /googleCalendarLastAutoSyncRef\.current = Date\.now\(\)/);
  assert.match(service, /sync_job_id,sync_lock_until,sync_started_at/);
  assert.match(service, /const syncActive = Boolean/);
});
