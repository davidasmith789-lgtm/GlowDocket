import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("every successful local and cloud authentication starts the profile tutorial", async () => {
  const app = await read("../src/App.jsx");

  assert.match(app, /const startTutorialForProfile = \(profileKey\) =>/);
  assert.match(app, /signInWithPassword[\s\S]{0,500}startTutorialForProfile\(data\.user\.id\)/);
  assert.match(app, /setCurrentUser\(existingAccount\.profileKey\)[\s\S]{0,180}startTutorialForProfile\(existingAccount\.profileKey\)/);
  assert.match(app, /setCurrentUser\(profileKey\)[\s\S]{0,180}startTutorialForProfile\(profileKey\)/);
  assert.match(app, /setCurrentUser\(data\.user\.id\)[\s\S]{0,180}startTutorialForProfile\(data\.user\.id\)/);
  assert.match(app, /getTutorialStorageKey\(profileKey\)/);
});

test("tutorial is available on mobile and has no skip control", async () => {
  const [app, styles] = await Promise.all([read("../src/App.jsx"), read("../src/App.css")]);

  assert.match(app, /\{tutorialOpen && \(/);
  assert.doesNotMatch(app, /tutorialOpen && !isMobileUi/);
  assert.doesNotMatch(app, /Skip tutorial|className="tutorial-skip"/);
  assert.doesNotMatch(styles, /\.tutorial-skip/);
  assert.match(app, /<button type="button" className="btn btn-primary" onClick=\{finishTutorial\}>Finish<\/button>/);
});
