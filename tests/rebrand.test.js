import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPortableExport, getCloudCacheKey } from "../src/cloudSync.js";
import { getTutorialStorageKey } from "../src/onboardingUtils.js";
import { getPushDeviceStorageKey } from "../src/externalReminderUtils.js";

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("browser and installed-app metadata use GlowDocket", async () => {
  const [html, manifestText, favicon] = await Promise.all([read("../index.html"), read("../public/manifest.webmanifest"), read("../public/favicon.svg")]);
  const manifest = JSON.parse(manifestText);
  assert.match(html, /<title>GlowDocket<\/title>/);
  assert.match(html, /apple-mobile-web-app-title" content="GlowDocket"/);
  assert.equal(manifest.name, "GlowDocket");
  assert.equal(manifest.short_name, "GlowDocket");
  assert.deepEqual(manifest.icons.map(({ src, purpose }) => [src, purpose]), [
    ["/glowdocket-icon-192.png?v=2", "any"],
    ["/glowdocket-icon-512.png?v=2", "any"],
    ["/glowdocket-maskable-512.png?v=2", "maskable"],
  ]);
  assert.match(html, /apple-touch-icon[^>]+href="\/apple-touch-icon\.png\?v=2"/);
  assert.match(favicon, /<title id="title">GlowDocket<\/title>/);
  assert.match(favicon, /linearGradient id="brand"/);
});

test("public UI and active notification code contain no old product name", async () => {
  const sources = await Promise.all([
    read("../src/App.jsx"), read("../src/reminderUxUtils.js"),
    read("../server/services/reminderService.js"), read("../api/account/delete.js"),
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
  const [main, updates, worker] = await Promise.all([read("../src/main.jsx"), read("../src/serviceWorkerUpdates.js"), read("../public/sw.js")]);
  assert.match(main, /registerServiceWorkerUpdates\(\)/);
  assert.match(updates, /serviceWorker\.register\("\/sw\.js"\)/);
  assert.match(worker, /taskacadia-shell-v6/);
  for (const asset of ["glowdocket-icon-192.png", "glowdocket-icon-512.png", "glowdocket-maskable-512.png", "apple-touch-icon.png"]) {
    assert.match(worker, new RegExp(asset.replace(".", "\\.")));
  }
});

test("customizable logo exposes independent theme layers with safe defaults", async () => {
  const [app, component, styles] = await Promise.all([
    read("../src/App.jsx"), read("../src/GlowDocketLogo.jsx"), read("../src/App.css"),
  ]);
  const keys = ["logoBackground", "logoGradientStart", "logoGradientEnd", "logoStar", "logoGlow", "logoSpeedLines"];
  for (const key of keys) {
    assert.equal(app.includes(`key: "${key}"`), true);
    assert.equal(app.includes(`${key}: ["--logo-`), true);
  }
  assert.match(component, /glowdocket-logo-background/);
  assert.match(component, /glowdocket-logo-gradient-start/);
  assert.match(component, /glowdocket-logo-gradient-end/);
  assert.match(component, /glowdocket-logo-star-glow/);
  assert.match(component, /glowdocket-logo-speed-line/);
  assert.match(styles, /--logo-background: #ffffff/);
  assert.match(styles, /--logo-background: #151b2e/);
  for (const themeId of ["ocean-focus", "forest-study", "sunset-planner", "midnight-neon", "berry-night"]) {
    const themeStart = app.indexOf(`id: "${themeId}"`);
    assert.notEqual(themeStart, -1);
    assert.match(app.slice(themeStart, themeStart + 1200), /logoGradientStart/);
    assert.match(app.slice(themeStart, themeStart + 1200), /logoSpeedLines/);
  }
});

test("logo appears in loading, public home, signed-in headers, and Color Studio", async () => {
  const app = await read("../src/App.jsx");
  assert.match(app, /brand-lockup-loading[^>]*><GlowDocketLogo/);
  assert.doesNotMatch(app, /brand-lockup welcome-brand/);
  assert.match(app, /welcome-page[\s\S]{0,500}<header className="hero-card welcome-top-header">[\s\S]{0,500}<GlowDocketLogo decorative/);
  assert.match(app, /mobile-app-brand[\s\S]{0,300}<GlowDocketLogo decorative/);
  assert.match(app, /brand-lockup hero-brand[^>]*><GlowDocketLogo/);
  assert.match(app, /Signed in as \$\{displayName \|\| "GlowDocket user"\}/);
  assert.match(app, /logo-color-preview"><GlowDocketLogo label="Custom logo color preview"/);
  assert.match(app, /icon: "\/glowdocket-icon-192\.png"/);
});
