import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("assignment completion uses accessible dependency-free confetti with reduced-motion fallbacks", async () => {
  const [app, css, rippleCanvas, packageJson] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.css", import.meta.url), "utf8"),
    readFile(new URL("../src/components/CompletionRippleCanvas.jsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(app, /setCompletionCelebration/);
  assert.match(app, /className=\{`completion-confetti is-/);
  assert.match(app, /METEOR_SHOWER_PARTICLES : COMPLETION_CONFETTI\)\.map/);
  assert.match(app, /length: 24/);
  assert.match(app, /METEOR_SHOWER_PARTICLES = Array\.from\(\{ length: 48 \}/);
  assert.match(app, /Array\.from\(\{ length: 7 \}/);
  assert.match(app, /<CompletionRippleCanvas/);
  assert.match(rippleCanvas, /window\.requestAnimationFrame/);
  assert.match(rippleCanvas, /Math\.min\(window\.devicePixelRatio \|\| 1, MAX_DEVICE_PIXEL_RATIO\)/);
  assert.match(rippleCanvas, /context\.ellipse/);
  assert.match(rippleCanvas, /RIPPLE_COUNT = 7/);
  assert.match(rippleCanvas, /RIPPLE_STAGGER_MS = 95/);
  assert.match(rippleCanvas, /RIPPLE_DURATION_MS = 1120/);
  assert.match(rippleCanvas, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(app, /completion-gold-ripple-ring/);
  assert.match(app, /Array\.from\(\{ length: 12 \}/);
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
    "completion-firework-ray",
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
  assert.match(css, /\.reduce-motion :is\(\.completion-confetti, \.completion-fireworks\) \{ display: none; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(packageJson, /confetti|canvas-confetti/);
});
