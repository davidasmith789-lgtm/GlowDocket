import test from "node:test";
import assert from "node:assert/strict";
import { getTrashDaysRemaining, isTrashExpired, TRASH_RETENTION_MS } from "../src/trashUtils.js";

const now = Date.parse("2026-07-13T12:00:00.000Z");

test("Trash keeps assignments until the full 30-day retention period ends", () => {
  const task = { isDeleted: true, deletedAt: new Date(now - TRASH_RETENTION_MS + 1).toISOString() };
  assert.equal(isTrashExpired(task, now), false);
  assert.equal(isTrashExpired({ ...task, deletedAt: new Date(now - TRASH_RETENTION_MS).toISOString() }, now), true);
});

test("Trash countdown is understandable and legacy missing dates are preserved", () => {
  assert.equal(getTrashDaysRemaining({ isDeleted: true, deletedAt: new Date(now - 29 * 86400000).toISOString() }, now), 1);
  assert.equal(isTrashExpired({ isDeleted: true }, now), false);
  assert.equal(getTrashDaysRemaining({ isDeleted: true }, now), null);
});
