import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { advanceBadgeMastery, applyFlashcardMasterySummary, BADGE_MASTERY_CHALLENGES, CELEBRATION_STUDIO_REQUIRED_DAYS, DEFAULT_GAMIFICATION, GAMIFICATION_ACHIEVEMENTS, GAMIFICATION_CONFETTI, GAMIFICATION_TITLES, getCelebrationStudioProgress, getLocalSignInDay, getNewAchievementIds, grantAllGamificationRewards, isGamificationTestAccount, normalizeGamification, normalizeSignInDays, summarizeWeeklyMomentum } from "../src/gamificationUtils.js";

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
  assert.ok(GAMIFICATION_CONFETTI.length >= 15);
  assert.equal(GAMIFICATION_CONFETTI[0].id, "none");
  assert.equal(DEFAULT_GAMIFICATION.selectedConfetti, "standard");
  for (const id of ["meteors", "bubbles", "leaves", "snow", "fireworks", "gold-ripple", "hearts", "pixels", "crowns"]) assert.ok(GAMIFICATION_CONFETTI.some((option) => option.id === id));
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
  assert.deepEqual(new Set(granted.masteredBadgeIds), new Set(BADGE_MASTERY_CHALLENGES.map((item) => item.id)));
  assert.ok(granted.masteredBadgeIds.every((id) => granted.badgeAnimationPreferences[id]));
  assert.equal(grantAllGamificationRewards({ ...granted, selectedConfetti: "rainbow" }).selectedConfetti, "rainbow");
  const disabledAnimation = grantAllGamificationRewards({ ...granted, badgeAnimationPreferences: { ...granted.badgeAnimationPreferences, "first-completion": false } });
  assert.equal(disabledAnimation.badgeAnimationPreferences["first-completion"], false);
});

test("badge mastery stays hidden until every base badge is earned and then tracks harder challenges", () => {
  const allIds = GAMIFICATION_ACHIEVEMENTS.map((achievement) => achievement.id);
  const almostAll = { ...DEFAULT_GAMIFICATION, earnedAchievementIds: allIds.slice(0, -1) };
  const finalUnlock = { ...almostAll, earnedAchievementIds: allIds };
  const now = new Date(2026, 6, 24, 12);
  const unlocked = advanceBadgeMastery([], almostAll, finalUnlock, { priority: "HIGH", course: "Biology" }, { now });
  assert.ok(unlocked.masteryUnlockedAt);
  assert.equal(unlocked.masteryProgress["first-completion"], 0);
  const progressed = advanceBadgeMastery([completedTask("mastery-1", now.toISOString())], unlocked, unlocked, { priority: "HIGH", estimatedMinutes: 20, completedEarly: true, source: "focus", course: "Biology" }, { now });
  assert.equal(progressed.masteryProgress["first-completion"], 1);
  assert.equal(progressed.masteryProgress["high-priority"], 1);
  assert.equal(progressed.masteryProgress["quick-win"], 1);
  assert.equal(progressed.masteryProgress["focus-finish"], 1);
  assert.equal(progressed.masteryProgress["course-five"], 1);
  const mastered = normalizeGamification({ ...progressed, masteredBadgeIds: ["first-completion"], badgeAnimationPreferences: { "first-completion": false } });
  assert.equal(mastered.badgeAnimationPreferences["first-completion"], false);
});

test("flashcard badges have approachable mastery tasks driven by aggregate study totals", () => {
  const flashChallenges = BADGE_MASTERY_CHALLENGES.filter((challenge) => challenge.id.startsWith("flash-"));
  assert.equal(flashChallenges.length, 12);
  assert.ok(flashChallenges.every((challenge) => challenge.target > 1));
  const allIds = GAMIFICATION_ACHIEVEMENTS.map((achievement) => achievement.id);
  const mastered = applyFlashcardMasterySummary({ ...DEFAULT_GAMIFICATION, earnedAchievementIds: allIds }, {
    deck_count: 3,
    session_count: 3,
    unique_cards: 550,
    study_days: 4,
    recent_study_days: 8,
    before_target_sessions: 2,
    shared_deck_count: 2,
    helpful_count: 12,
    community_deck_count: 2,
  });
  assert.ok(flashChallenges.every((challenge) => mastered.masteredBadgeIds.includes(challenge.id)));
  assert.ok(flashChallenges.every((challenge) => mastered.badgeAnimationPreferences[challenge.id]));
});

test("celebration color studio counts unique sign-in days and unlocks at sixty", () => {
  assert.equal(CELEBRATION_STUDIO_REQUIRED_DAYS, 60);
  assert.equal(getLocalSignInDay(new Date(2026, 6, 9, 12)), "2026-07-09");
  assert.deepEqual(normalizeSignInDays(["2026-07-02", "bad", "2026-07-01", "2026-07-02"]), ["2026-07-01", "2026-07-02"]);
  const fiftyNineDays = Array.from({ length: 59 }, (_, index) => `2026-${String(1 + Math.floor(index / 28)).padStart(2, "0")}-${String(1 + (index % 28)).padStart(2, "0")}`);
  assert.deepEqual(getCelebrationStudioProgress(fiftyNineDays), { completed: 59, remaining: 1, unlocked: false });
  assert.deepEqual(getCelebrationStudioProgress([...fiftyNineDays, "2026-03-04"]), { completed: 60, remaining: 0, unlocked: true });
  assert.equal(getCelebrationStudioProgress([], true).unlocked, true);
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
  assert.match(app, /momentum-badge-stage/);
  assert.ok(app.indexOf("const selectedAchievement =") < app.indexOf("const selectedBadgeAnimated ="));
  assert.match(app, /momentum-badge-count/);
  assert.match(app, /selectedBadge: achievement\.id/);
  assert.match(css, /\.achievement-card\.is-selected/);
  assert.match(css, /content-visibility: auto/);
  assert.match(css, /\.adaptive-low-motion \.gamification-dialog \.badge-first-completion\.is-mastery-animated/);
  assert.match(app, /<h2 id="gamification-title">Cosmetics<\/h2>/);
  assert.doesNotMatch(app, /Gentle Momentum/);
  assert.match(css, /\.gamification-dialog h2[\s\S]*color: var\(--text-color\) !important/);
  assert.match(css, /selected-badge-aura/);
  assert.match(css, /\.achievement-rays/);
  assert.match(css, /\.achievement-core/);
  assert.match(app, /data-badge=\{achievement\.id\}/);
  assert.match(app, /AchievementEmblem id=\{earned \? achievement\.id : "locked"\}/);
  assert.match(app, /const masteryProgress = challenge \?/);
  assert.match(app, /masteryUnlocked && challenge &&/);
  assert.doesNotMatch(app, /selectedAchievement\?\.icon/);
  assert.match(css, /contain: layout paint style/);
  assert.doesNotMatch(app, /handleGamificationScroll/);
  assert.doesNotMatch(css, /\.gamification-dialog\.is-scrolling/);
  assert.doesNotMatch(css, /\.gamification-backdrop[^}]*backdrop-filter/);
  assert.match(css, /\.reduce-motion :is\(\.completion-confetti, \.completion-fireworks\)/);
  assert.match(app, /Celebration Color Studio/);
  assert.match(app, /celebrationStudioProgress\.unlocked/);
  assert.match(app, /currentUser !== "guest" \? userSettings\.signInDays : \[\]/);
  assert.match(app, /if \(!currentUser \|\| currentUser === "guest"\) return/);
  assert.match(app, /selectedCelebrationColorFields\.map/);
  assert.match(app, /lockedTitleOptions\.length > 0/);
  assert.match(app, /How to unlock more titles/);
  assert.match(app, /How to unlock more celebrations/);
  assert.match(app, /lockedCelebrationOptions\.length > 0/);
  assert.match(app, /selectedConfetti !== "none"/);
  assert.match(app, /Celebrations are turned off/);
  assert.match(app, /<details className="cosmetic-unlock-guide">/);
  assert.match(app, /CELEBRATION_PREVIEW_PARTICLES\.map/);
  assert.match(app, />Preview<\/strong>/);
  assert.match(css, /@keyframes celebration-preview-fall/);
  assert.match(app, /getCelebrationColorsForStyle/);
  assert.match(app, /studio-celebration-pill/);
  assert.match(app, /selectedCelebrationOption\.label/);
  assert.match(app, /CELEBRATION_STYLE_COLOR_FIELDS/);
  assert.match(app, /stars: \["palette3"\]/);
  assert.match(app, /ribbons: \["palette1", "palette6"\]/);
  assert.match(app, /selectedCelebrationColorFields\.map/);
  assert.match(app, /signInDays: normalizeSignInDays\(userSettings\.signInDays\)/);
  assert.match(css, /\.celebration-studio-progress/);
  assert.match(css, /\.completion-celebration\.has-custom-colors/);
});
