import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPortableExport, getCloudCacheKey } from "../src/cloudSync.js";
import { getTutorialStorageKey } from "../src/onboardingUtils.js";
import { getPushDeviceStorageKey } from "../src/externalReminderUtils.js";

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("browser and installed-app metadata use GlowDocket", async () => {
  const [html, manifestText] = await Promise.all([read("../index.html"), read("../public/manifest.webmanifest")]);
  const manifest = JSON.parse(manifestText);
  assert.match(html, /<title>GlowDocket<\/title>/);
  assert.match(html, /apple-mobile-web-app-title" content="GlowDocket"/);
  assert.equal(manifest.name, "GlowDocket");
  assert.equal(manifest.short_name, "GlowDocket");
});

test("public UI and active notification code contain no old product name", async () => {
  const sources = await Promise.all([
    read("../src/App.jsx"), read("../src/reminderUxUtils.js"),
    read("../api/reminders/_service.js"), read("../api/account/delete.js"),
  ]);
  for (const source of sources) assert.doesNotMatch(source, /Task[ _-]?Cabinet|TaskAcadia/);
  assert.match(sources[0], /GlowDocket/);
  assert.match(sources[2], /GlowDocket reminder/);
});

test("compatibility-sensitive saved-data identifiers remain unchanged", () => {
  assert.equal(getCloudCacheKey("user-1"), "taskcabinet_cloud_cache_user-1");
  assert.equal(getTutorialStorageKey("Alex"), "taskcabinet_tutorial_Alex");
  assert.equal(getPushDeviceStorageKey("Alex"), "taskacadia_push_device_Alex");
  assert.equal(createPortableExport({ tasks: [], courses: [], courseColors: {}, userSettings: {}, checklists: [], workspaceLayout: {}, displayName: "" }, "2026-01-01T00:00:00.000Z").format, "taskcabinet-export");
});

test("service-worker registration and rebranded cache update remain configured", async () => {
  const [main, worker] = await Promise.all([read("../src/main.jsx"), read("../public/sw.js")]);
  assert.match(main, /serviceWorker\.register\('\/sw\.js'\)/);
  assert.match(worker, /taskacadia-shell-v2/);
  assert.match(worker, /APP_SHELL = \["\/", "\/manifest\.webmanifest", "\/favicon\.svg"\]/);
});
