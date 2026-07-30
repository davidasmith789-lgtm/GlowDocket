import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildFlashcardProfileTags, parseFlashcardProfile } from "../src/flashcardUtils.js";

const controls = fs.readFileSync(new URL("../src/components/FlashcardProfileSharingControls.jsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/components/FlashcardProfileSharingControls.css", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const appStyles = fs.readFileSync(new URL("../src/App.css", import.meta.url), "utf8");

test("level and badge sharing support all four combinations", () => {
  const profile = { level: 4, badgeId: "flash-first-session" };
  assert.deepEqual(parseFlashcardProfile(buildFlashcardProfileTags([], { ...profile, shareFlashcardLevel: true, shareFlashcardBadge: true })), { level: 4, badgeId: "flash-first-session", name: "" });
  assert.deepEqual(parseFlashcardProfile(buildFlashcardProfileTags([], { ...profile, shareFlashcardLevel: true, shareFlashcardBadge: false })), { level: 4, badgeId: "", name: "" });
  assert.deepEqual(parseFlashcardProfile(buildFlashcardProfileTags([], { ...profile, shareFlashcardLevel: false, shareFlashcardBadge: true })), { level: null, badgeId: "flash-first-session", name: "" });
  assert.deepEqual(parseFlashcardProfile(buildFlashcardProfileTags([], { ...profile, shareFlashcardLevel: false, shareFlashcardBadge: false })), { level: null, badgeId: "", name: "" });
});

test("sharing controls show an immediate public preview and scale safely", () => {
  assert.match(controls, /Share level/);
  assert.match(controls, /Share badge/);
  assert.match(controls, /<label><input type="checkbox" checked=\{profileSettings\.shareFlashcardLevel[\s\S]{0,180}<span><strong>Share level/);
  assert.match(controls, /<label><input type="checkbox" checked=\{profileSettings\.shareFlashcardBadge[\s\S]{0,180}<span><strong>Share badge/);
  assert.match(controls, /What other users will see/);
  assert.match(controls, /Nothing from your profile will be shared/);
  assert.match(styles, /\.flash-profile-sharing label[^}]*grid-template-columns: auto minmax\(0, 1fr\)/);
  assert.doesNotMatch(styles, /white-space:\s*nowrap/);
});

test("profile sharing is visible from both account surfaces", () => {
  assert.match(app, /account-password-card[\s\S]*account-profile-sharing-card[\s\S]*account-dashboard-security-card/);
  assert.match(app, /settingsSection === "account"[\s\S]*<SettingsCard title="Profile Sharing"[\s\S]*<FlashcardProfileSharingControls/);
  assert.match(app, /profileSettings=\{gamification\} onChange=\{updateGamification\}/);
  assert.match(appStyles, /\.account-profile-sharing-card\s*\{\s*grid-column: 1 \/ -1;/);
  assert.match(appStyles, /\.account-profile-sharing-card \.flash-profile-sharing-content\s*\{[^}]*grid-template-columns: minmax\(0, 1\.35fr\) minmax\(240px, \.65fr\)/s);
});
