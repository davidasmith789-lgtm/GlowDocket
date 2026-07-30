import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildFlashcardProfileTags, parseFlashcardProfile } from "../src/flashcardUtils.js";

const controls = fs.readFileSync(new URL("../src/components/FlashcardProfileSharingControls.jsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/components/FlashcardProfileSharingControls.css", import.meta.url), "utf8");

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
  assert.match(controls, /What other users will see/);
  assert.match(controls, /Nothing from your profile will be shared/);
  assert.match(styles, /\.App:is\(\.text-size-large, \.text-size-xlarge\) \.flash-profile-sharing label/);
  assert.doesNotMatch(styles, /white-space:\s*nowrap/);
});
