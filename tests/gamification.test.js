import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DEFAULT_GAMIFICATION, GAMIFICATION_ACHIEVEMENTS, GAMIFICATION_CONFETTI, GAMIFICATION_TITLES, getNewAchievementIds, grantAllGamificationRewards, isGamificationTestAccount, normalizeGamification, summarizeWeeklyMomentum } from "../src/gamificationUtils.js";

const completedTask = (id, completedAt, extra = {}) => ({ id, title: id, isCompleted: true, completedAt, ...extra });

test("weekly momentum honors week starts, ignores legacy and deleted work, and clamps goals", () => {
  const now = new Date(2026, 6, 22, 12);
  const tasks = [
    completedTask("sun", "2026-07-19T12:00:00"),
    completedTask("mon", "2026-07-20T12:00:00"),
    completedTask("legacy", null),
    completedTask("deleted", "2026-07-21T12:00:00", { isDeleted: true }),
  ];
  assert.deepEqual(summarizeWeeklyMomentum(tasks, { weeklyGoal: 5 }, { now, weekStartsOn: "sunday" }), { completed: 2, goal: 5, productiveDays: 2, progress: 40, goalReached: false });
  assert.equal(summarizeWeeklyMomentum(tasks, { weeklyGoal: 5 }, { now, weekStartsOn: "monday" }).completed, 1);
  assert.equal(normalizeGamification({ weeklyGoal: 999 }).weeklyGoal, 50);
  assert.equal(normalizeGamification({ weeklyGoal: -2 }).weeklyGoal, 1);
});

test("achievements unlock from totals, weekly consistency, and completion context without duplicates", () => {
  const tasks = [0, 1, 2, 3, 4].map((offset) => completedTask(String(offset), `2026-07-${20 + offset}T12:00:00`, { priority: offset === 4 ? "HIGH" : "MED" }));
  const unlocked = getNewAchievementIds(tasks, { ...DEFAULT_GAMIFICATION, weeklyGoal: 5 }, { priority: "HIGH", wasOverdue: true, source: "focus" }, { now: new Date(2026, 6, 24), weekStartsOn: "sunday" });
  for (const id of ["first-completion", "five-completions", "weekly-goal", "three-productive-days", "high-priority", "overdue-recovery", "focus-finish"]) assert.ok(unlocked.includes(id));
  assert.deepEqual(getNewAchievementIds(tasks, { weeklyGoal: 5, earnedAchievementIds: unlocked }, { priority: "HIGH", wasOverdue: true, source: "focus" }, { now: new Date(2026, 6, 24) }), []);
});

test("locked cosmetics and badges cannot be restored as selected", () => {
  const normalized = normalizeGamification({ selectedConfetti: "stars", selectedTitle: "focus-finisher", selectedBadge: "weekly-goal", earnedAchievementIds: [] });
  assert.equal(normalized.selectedConfetti, "standard");
  assert.equal(normalized.selectedTitle, "getting-started");
  assert.equal(normalized.selectedBadge, "");
  assert.equal(normalizeGamification({ selectedBadge: "weekly-goal", earnedAchievementIds: ["weekly-goal"] }).selectedBadge, "weekly-goal");
});

test("expanded reward collection includes elaborate badges, titles, and celebration styles", () => {
  assert.ok(GAMIFICATION_ACHIEVEMENTS.length >= 16);
  assert.ok(GAMIFICATION_TITLES.length >= 10);
  assert.ok(GAMIFICATION_CONFETTI.length >= 7);
  const tasks = Array.from({ length: 25 }, (_, index) => completedTask(`task-${index}`, `2026-07-${String(1 + (index % 24)).padStart(2, "0")}T12:00:00`, { course: "Biology" }));
  const unlocked = getNewAchievementIds(tasks, DEFAULT_GAMIFICATION, { completedEarly: true, estimatedMinutes: 20 }, { now: new Date(2026, 6, 24) });
  for (const id of ["ten-completions", "twenty-five-completions", "ahead-of-schedule", "quick-win", "course-five"]) assert.ok(unlocked.includes(id));
});

test("the exact tester account receives every reward without granting lookalike emails", () => {
  assert.equal(isGamificationTestAccount(" PURPLXR@gmail.com "), true);
  assert.equal(isGamificationTestAccount("purplxr+test@gmail.com"), false);
  assert.equal(isGamificationTestAccount("other@gmail.com"), false);
  const granted = grantAllGamificationRewards(DEFAULT_GAMIFICATION);
  assert.deepEqual(new Set(granted.earnedAchievementIds), new Set(GAMIFICATION_ACHIEVEMENTS.map((item) => item.id)));
  assert.equal(granted.selectedConfetti, "prism");
  assert.equal(granted.selectedTitle, "assignment-ace");
  assert.equal(granted.selectedBadge, "twenty-five-completions");
  assert.equal(grantAllGamificationRewards({ ...granted, selectedConfetti: "rainbow" }).selectedConfetti, "rainbow");
});

test("completion paths timestamp work, undo clears it, and celebration covers the viewport", async () => {
  const [app, css] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.css", import.meta.url), "utf8"),
  ]);
  assert.match(app, /completedAt,/);
  assert.match(app, /completedAt: null/);
  assert.match(app, /source: "focus"/);
  assert.match(app, /source: "related-tasks"/);
  assert.match(app, /Momentum & Achievements/);
  assert.match(css, /\.completion-celebration\s*\{[\s\S]*?inset: 0;/);
  assert.match(css, /translate3d\(var\(--confetti-drift\), 100vh/);
  assert.match(app, /momentum-earned-badge/);
  assert.match(app, /selectedBadge: achievement\.id/);
  assert.match(css, /\.achievement-card\.is-selected/);
  assert.match(app, /<h2 id="gamification-title">Cosmetics<\/h2>/);
  assert.doesNotMatch(app, /Gentle Momentum/);
  assert.match(css, /\.gamification-dialog h2[\s\S]*color: var\(--text-color\) !important/);
  assert.match(css, /selected-badge-aura/);
  assert.match(css, /\.achievement-rays/);
  assert.match(css, /\.achievement-core/);
  assert.match(app, /data-badge=\{achievement\.id\}/);
  assert.match(css, /content-visibility: auto/);
  assert.match(css, /contain: layout paint style/);
  assert.doesNotMatch(css, /\.gamification-backdrop[^}]*backdrop-filter/);
  assert.match(css, /\.reduce-motion \.completion-confetti/);
});
