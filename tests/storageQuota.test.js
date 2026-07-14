import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateAttachmentSelection, formatStorageBytes, getStorageQuotaStatus, MAX_ATTACHMENTS_PER_ASSIGNMENT } from "../src/storageQuotaUtils.js";

const file = (name, size) => ({ name, size });

test("storage quota status distinguishes healthy, warning, and critical usage", () => {
  assert.equal(getStorageQuotaStatus(20, 100).level, "ok");
  assert.equal(getStorageQuotaStatus(80, 100).level, "warning");
  assert.equal(getStorageQuotaStatus(95, 100).level, "critical");
  assert.equal(getStorageQuotaStatus(55, 100).percent, 55);
});

test("attachment selection enforces file, count, and assignment byte limits", () => {
  assert.equal(evaluateAttachmentSelection([], [file("large.pdf", 11 * 1024 * 1024)]).accepted.length, 0);
  const existing = Array.from({ length: MAX_ATTACHMENTS_PER_ASSIGNMENT }, (_, index) => file(`${index}.txt`, 1));
  assert.match(evaluateAttachmentSelection(existing, [file("extra.txt", 1)]).rejected[0].reason, /up to 10 files/i);
  const nearlyFull = [file("archive.zip", 49 * 1024 * 1024)];
  assert.match(evaluateAttachmentSelection(nearlyFull, [file("more.zip", 2 * 1024 * 1024)]).rejected[0].reason, /50 MB/i);
});

test("attachment selection blocks projected critical browser usage and warns near quota", () => {
  const blocked = evaluateAttachmentSelection([], [file("notes.pdf", 6)], { usage: 90, quota: 100 });
  assert.equal(blocked.accepted.length, 0);
  assert.match(blocked.rejected[0].reason, /critically full/i);
  const warning = evaluateAttachmentSelection([], [file("notes.pdf", 5)], { usage: 78, quota: 100 });
  assert.equal(warning.accepted.length, 1);
  assert.equal(warning.projectedStatus.level, "warning");
});

test("storage byte formatting stays readable", () => {
  assert.equal(formatStorageBytes(0), "0 B");
  assert.equal(formatStorageBytes(1536), "1.5 KB");
  assert.equal(formatStorageBytes(5 * 1024 * 1024), "5.0 MB");
});

test("storage monitoring and attachment warnings stay wired into the app", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /navigator\.storage\?\.estimate/);
  assert.match(app, /title="Browser Storage"/);
  assert.match(app, /Refresh Storage Check/);
  assert.match(app, /evaluateAttachmentSelection\(currentFiles, files, estimate\)/);
  assert.match(app, /Maximum 10 MB per file/);
});
