import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("global text size uses an accessible continuous slider with legacy migration", async () => {
  const [app, styles, communityStyles] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.css", import.meta.url), "utf8"),
    readFile(new URL("../src/components/CommunityHub.css", import.meta.url), "utf8"),
  ]);

  assert.match(app, /type="range" min="70" max="150" step="5"/);
  assert.match(app, /const legacyScales = \{ xsmall: 70, small: 85, medium: 100, large: 125, xlarge: 150 \}/);
  assert.match(app, /document\.documentElement\.style\.fontSize = `\$\{getTextScalePercent\(userSettings\.textSize\)\}%`/);
  assert.doesNotMatch(app, /<option value="xsmall">/);
  assert.doesNotMatch(styles, /font-size:\s*[0-9]+px/);
  assert.match(styles, /\.App:is\(\.text-size-large, \.text-size-xlarge\)[\s\S]*?\.achievement-card/);
  assert.match(communityStyles, /font-size: max\(1rem, 16px\)/);
});

test("scaled text wraps only between words and lets controls grow vertically", async () => {
  const styles = await readFile(new URL("../src/App.css", import.meta.url), "utf8");

  assert.match(styles, /button,[\s\S]*?overflow-wrap:\s*normal;[\s\S]*?word-break:\s*normal;[\s\S]*?hyphens:\s*none;/);
  assert.match(styles, /\.App:is\(\.text-size-large, \.text-size-xlarge\) \.btn\s*\{[^}]*height:\s*auto;[^}]*white-space:\s*normal;/s);
  assert.match(styles, /text-size-large[^}]*\.workspace-widget-header > strong\s*\{[^}]*word-break:\s*normal;[^}]*white-space:\s*nowrap;/s);
});
