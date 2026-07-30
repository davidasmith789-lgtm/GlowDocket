import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("native controls use the active theme without a light dropdown flash", async () => {
  const [html, app, appStyles, mountStyles] = await Promise.all([
    read("../index.html"),
    read("../src/App.jsx"),
    read("../src/App.css"),
    read("../src/index.css"),
  ]);

  assert.match(html, /document\.documentElement\.dataset\.theme = localStorage\.getItem\("theme"\)/);
  assert.match(app, /useLayoutEffect\(\(\) => \{\s*document\.documentElement\.setAttribute\("data-theme", theme\)/);
  assert.match(mountStyles, /:root\[data-theme="dark"\]\s*\{\s*color-scheme: dark;/);
  assert.match(appStyles, /html \{ color-scheme: light; \}\s*html\[data-theme="dark"\] \{ color-scheme: dark; \}/);
  assert.match(appStyles, /select,\s*select option,\s*select optgroup\s*\{[^}]*background-color: var\(--input-bg\);[^}]*color: var\(--text-color\);/);
  assert.match(appStyles, /@supports \(appearance: base-select\)[\s\S]*?::picker\(select\)[\s\S]*?background: var\(--input-bg\);/);
  assert.doesNotMatch(appStyles, /html \{ color-scheme: light dark; \}/);
});

test("profile theme selection restores its saved mode after reload and sign-in", async () => {
  const [app, cloudSync] = await Promise.all([
    read("../src/App.jsx"),
    read("../src/cloudSync.js"),
  ]);

  assert.match(app, /activeColorThemeMode: "dark"/);
  assert.match(app, /setTheme\(getSavedThemeMode\(loadedSettings, localStorage\.getItem\("theme"\)\)\)/);
  assert.match(app, /activeColorThemeMode: selectedTheme\.mode/);
  assert.match(app, /activeColorThemeMode: theme/);
  assert.match(cloudSync, /"activeColorThemeMode"/);
});
