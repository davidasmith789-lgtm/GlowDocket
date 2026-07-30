import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const hub = fs.readFileSync(new URL("../src/components/FlashcardsHub.jsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/components/FlashcardsHub.css", import.meta.url), "utf8");

test("expanded XP guide fills its free space with account progression", () => {
  assert.match(hub, /className=\{`flash-level-card\$\{xpGuideOpen \? " is-guide-open" : ""\}`\}/);
  assert.match(hub, /\{xpGuideOpen && \([\s\S]*className="flash-level-showcase"/);
  assert.match(hub, /profileSettings\.selectedBadge/);
  assert.match(hub, /earnedGuideBadges\.length/);
  assert.match(hub, /Array\.from\(\{ length: 10 \}/);
  assert.match(styles, /\.flash-level-card\.is-guide-open\s*\{[^}]*grid-template-columns:/s);
  assert.match(styles, /\.flash-level-showcase\s*\{[^}]*min-height: 390px;/s);
});
