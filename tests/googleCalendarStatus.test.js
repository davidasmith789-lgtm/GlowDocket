import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GOOGLE_SYNC_STATUS_POLL_MS, reconcileGoogleSyncStatus } from "../src/googleCalendarStatus.js";

test("an active account job restores the Syncing state", () => {
  assert.equal(reconcileGoogleSyncStatus({ syncActive: true }, "", "").busy, "sync");
});

test("an inactive account job clears a latched Syncing state", () => {
  assert.equal(reconcileGoogleSyncStatus({ syncActive: false }, "sync", "").busy, "");
});

test("historical per-calendar job bookkeeping cannot activate the UI", () => {
  const status = { syncActive: false, selectedCalendars: [{ last_sync_job_id: "historical-job" }] };
  assert.equal(reconcileGoogleSyncStatus(status, "sync", "").busy, "");
});

test("server inactivity clears only the stale already-running notice", () => {
  const stale = "A Google Calendar synchronization is already running for this account.";
  assert.equal(reconcileGoogleSyncStatus({ syncActive: false }, "sync", stale).notice, "");
  const unrelated = "Google Calendar could not save this event.";
  assert.equal(reconcileGoogleSyncStatus({ syncActive: false }, "sync", unrelated).notice, unrelated);
  assert.equal(reconcileGoogleSyncStatus({ syncActive: true }, "sync", stale).notice, stale);
});

test("active status polling is bounded and stops when status becomes inactive", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.equal(GOOGLE_SYNC_STATUS_POLL_MS, 2000);
  assert.match(app, /googleCalendarState\.syncActive !== true[^;]+return undefined/);
  assert.match(app, /setTimeout\([^]*refreshGoogleCalendarStatus[^]*GOOGLE_SYNC_STATUS_POLL_MS/);
  assert.match(app, /return \(\) => window\.clearTimeout\(timer\)/);
  assert.match(app, /error\.code === "sync_in_progress"[^;]+await refreshGoogleCalendarStatus\(\)/);
});
