import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("assignment completion uses accessible dependency-free confetti with reduced-motion fallbacks", async () => {
  const [app, css, packageJson] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(app, /setCompletionCelebration/);
  assert.match(app, /className=\{`completion-confetti is-/);
  assert.match(app, /COMPLETION_CONFETTI\.map/);
  assert.match(app, /length: 24/);
  assert.match(css, /@keyframes completion-confetti-fall/);
  for (const animationName of [
    "completion-stars-fall",
    "completion-course-wave",
    "completion-rainbow-sweep",
    "completion-sparkle-float",
    "completion-ribbon-flutter",
    "completion-prism-helix",
    "completion-meteor-drop",
    "completion-bubble-fall",
    "completion-leaf-rock",
    "completion-firework-burst",
  ]) {
    assert.match(css, new RegExp(`@keyframes ${animationName}`));
  }
  assert.match(app, /celebration-\$\{completionCelebration\.confetti/);
  assert.match(app, /duration: `\$\{2900 \+ \(index % 4\) \* 350\}ms`/);
  assert.match(app, /reduceMotion \? 3100 : 7100/);
  assert.match(app, /window\.setTimeout\(\(\) => setCompletionCelebration\(null\)/);
  assert.match(css, /will-change: transform/);
  assert.match(css, /94% \{ opacity: 1; \}/);
  assert.match(css, /\.completion-celebration-toast/);
  assert.match(css, /\.reduce-motion \.completion-confetti \{ display: none; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(packageJson, /confetti|canvas-confetti/);
});
