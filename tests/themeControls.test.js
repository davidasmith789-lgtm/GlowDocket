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
  assert.match(app, /const loadedThemeMode = getSavedThemeMode/);
  assert.match(app, /setTheme\(loadedThemeMode\)/);
  assert.match(app, /activeColorThemeMode: selectedTheme\.mode/);
  assert.match(app, /activeColorThemeMode: theme/);
  assert.match(cloudSync, /"activeColorThemeMode"/);
});

test("background account updates merge persisted settings without erasing device themes", async () => {
  const app = await read("../src/App.jsx");

  assert.match(app, /JSON\.stringify\(\{ \.\.\.persisted, gamification: granted \}\)/);
  assert.match(app, /JSON\.stringify\(\{ \.\.\.persisted, signInDays: nextSignInDays \}\)/);
  assert.doesNotMatch(app, /setItem\(settingsStorageKey, JSON\.stringify\(updated\)\);[^}]*record this sign-in day/s);
});

test("calendar day colors cross the mobile cloud-sync boundary", async () => {
  const app = await read("../src/App.jsx");

  assert.match(app, /calendarDayColors: selected\.userSettings\?\.calendarDayColors \|\| settings\.calendarDayColors/);
  assert.match(app, /calendarDayColors: userSettings\.calendarDayColors/);
});
