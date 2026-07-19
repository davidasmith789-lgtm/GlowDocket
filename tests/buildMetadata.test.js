import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createReportMetadata, createRuntimeDiagnostics, getBuildFingerprint } from "../src/buildMetadata.js";

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("diagnostic metadata has a stable build fingerprint and report timestamp", () => {
  const createdAt = "2026-07-14T12:34:56.000Z";
  const metadata = createReportMetadata(createdAt, 1);
  assert.equal(metadata.app, "GlowDocket");
  assert.equal(metadata.createdAt, createdAt);
  assert.equal(metadata.dataSchemaVersion, 1);
  assert.equal(typeof metadata.appVersion, "string");
  assert.equal(typeof metadata.commitSha, "string");
  assert.match(getBuildFingerprint(), /^GlowDocket v.+ · .+ · .+$/);
  assert.equal(createRuntimeDiagnostics(createdAt)._metadata.createdAt, createdAt);
});

test("Vite injects version, commit, environment, build time, and source state", async () => {
  const [config, packageJson] = await Promise.all([read("../vite.config.js"), read("../package.json")]);
  assert.match(config, /VERCEL_GIT_COMMIT_SHA/);
  assert.match(config, /readGitValue\(\['rev-parse', 'HEAD'\], 'unavailable'\)/);
  assert.match(config, /appVersion: packageJson\.version/);
  assert.match(config, /environment: process\.env\.VERCEL_ENV/);
  assert.match(config, /buildTimestamp: new Date\(\)\.toISOString\(\)/);
  assert.match(config, /sourceState/);
  assert.equal(JSON.parse(packageJson).version, "1.0.4");
});

test("assignment CSV omits build identity while crash diagnostics retain it", async () => {
  const [app, csv, boundary] = await Promise.all([read("../src/App.jsx"), read("../src/assignmentCsv.js"), read("../src/AppErrorBoundary.jsx")]);
  for (const field of ["appVersion", "commitSha", "environment", "exportedAt", "dataSchemaVersion"]) assert.doesNotMatch(csv, new RegExp(field));
  assert.match(app, /createAssignmentsCsv/);
  assert.match(app, /Version & Diagnostics/);
  assert.match(boundary, /_metadata: createReportMetadata\(\)/);
  assert.match(boundary, /getBuildFingerprint\(\)/);
});

test("visible version diagnostics show only version, environment, and build time", async () => {
  const app = await read("../src/App.jsx");
  const card = app.match(/<SettingsCard title="Version & Diagnostics"([\s\S]*?)<\/SettingsCard>/)?.[1] || "";

  assert.match(card, /<dt>App version<\/dt>/);
  assert.match(card, /<dt>Environment<\/dt>/);
  assert.match(card, /<dt>Built<\/dt>/);
  assert.doesNotMatch(card, /<dt>Commit<\/dt>|<dt>Data schema<\/dt>|Fingerprint:|Copy Diagnostics/);
});
