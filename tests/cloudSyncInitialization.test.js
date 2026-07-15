import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { collectSyncableState, ensureCloudSnapshot } from "../src/cloudSync.js";

const emptyState = (workspaceLayout = {}) => collectSyncableState({
  tasks: [],
  courses: ["Other"],
  courseColors: {},
  userSettings: {},
  checklists: [],
  workspaceLayout,
  displayName: "Student",
});

test("a new authenticated account creates exactly one initial snapshot after no row is found", async () => {
  const calls = [];
  const local = emptyState();
  const result = await ensureCloudSnapshot({}, "authenticated-user-id", local, {
    load: async (_client, userId) => { calls.push(["load", userId]); return null; },
    create: async (_client, userId, state) => { calls.push(["create", userId, state]); return { revision: 1, updated_at: "2026-07-15T12:00:00Z" }; },
  });
  assert.deepEqual(calls.map(([operation, userId]) => [operation, userId]), [["load", "authenticated-user-id"], ["create", "authenticated-user-id"]]);
  assert.equal(result.created, true);
  assert.equal(result.snapshot.revision, 1);
  assert.deepEqual(calls[1][2], local);
});

test("an existing account loads its snapshot without attempting another insert", async () => {
  let creates = 0;
  const existing = { state: emptyState(), revision: 8, updatedAt: "2026-07-15T12:00:00Z" };
  const result = await ensureCloudSnapshot({}, "existing-user", emptyState(), {
    load: async () => existing,
    create: async () => { creates += 1; },
  });
  assert.equal(result.created, false);
  assert.strictEqual(result.snapshot, existing);
  assert.equal(creates, 0);
});

test("a widget-only default state is valid for initial snapshot creation", async () => {
  const workspace = { desktop: { dashboard: [{ id: "recommended-1", type: "recommended", x: 0, y: 0, width: 320, height: 260 }] }, mobile: {}, collapsed: {}, locked: { desktop: true, mobile: false } };
  let uploaded;
  await ensureCloudSnapshot({}, "new-user", emptyState(workspace), {
    load: async () => null,
    create: async (_client, _userId, state) => { uploaded = state; return { revision: 1, updated_at: "2026-07-15T12:00:00Z" }; },
  });
  assert.deepEqual(uploaded.workspaceLayout, workspace);
});

test("initial request failures are surfaced to the caller", async () => {
  const failure = new Error("request failed");
  await assert.rejects(() => ensureCloudSnapshot({}, "new-user", emptyState(), { load: async () => { throw failure; } }), failure);
});

test("invalid local preparation does not report that a cloud request was attempted", async () => {
  let requestStage = "";
  await assert.rejects(() => ensureCloudSnapshot({}, "new-user", { tasks: "invalid" }, {
    onRequest: (stage) => { requestStage = stage; },
    load: async () => null,
  }), /invalid/i);
  assert.equal(requestStage, "");
});

test("Retry reruns hydration instead of exiting through the post-hydration save guard", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /const retryCloudSync = \(\) => \{[\s\S]*?setSyncRetryNonce\(\(value\) => value \+ 1\);/);
  assert.match(app, /\}, \[currentUser, accountMode, syncRetryNonce\]\);/);
  assert.match(app, /syncStatus === "failed"[^\n]+onClick=\{retryCloudSync\}>Retry/);
});

test("email confirmation is not part of snapshot ownership or initialization", async () => {
  const cloudSync = await readFile(new URL("../src/cloudSync.js", import.meta.url), "utf8");
  assert.doesNotMatch(cloudSync, /email_confirmed|emailConfirmed|confirmed_at/);
  assert.match(cloudSync, /user_id: userId/);
});
