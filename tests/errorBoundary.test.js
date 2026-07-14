import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("the React application is wrapped in a top-level error boundary", async () => {
  const main = await read("../src/main.jsx");
  assert.match(main, /<AppErrorBoundary>[\s\S]*<App \/>[\s\S]*<\/AppErrorBoundary>/);
});

test("the crash screen offers safe recovery without clearing browser data", async () => {
  const boundary = await read("../src/AppErrorBoundary.jsx");
  assert.match(boundary, /getDerivedStateFromError/);
  assert.match(boundary, /componentDidCatch/);
  assert.match(boundary, /Try Again/);
  assert.match(boundary, /Reload GlowDocket/);
  assert.match(boundary, /Reload into Backup &amp; Restore/);
  assert.match(boundary, /sessionStorage\.setItem\(RECOVERY_SESSION_KEY/);
  assert.doesNotMatch(boundary, /localStorage\.(clear|removeItem)/);
});

test("recovery reload routes directly to Storage settings once", async () => {
  const app = await read("../src/App.jsx");
  assert.match(app, /sessionStorage\.getItem\(RECOVERY_SESSION_KEY\)/);
  assert.match(app, /sessionStorage\.removeItem\(RECOVERY_SESSION_KEY\)/);
  assert.match(app, /setCurrentTab\("settings"\)/);
  assert.match(app, /setSettingsSection\("storage"\)/);
});
