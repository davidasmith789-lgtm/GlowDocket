export const DEFAULT_GAMIFICATION = Object.freeze({
  version: 1,
  weeklyGoal: 5,
  earnedAchievementIds: [],
  selectedConfetti: "standard",
  selectedTitle: "getting-started",
  selectedBadge: "",
  showHeaderSummary: true,
  shareFlashcardLevel: false,
  showFlashcardName: false,
  sharedFlashcardBadge: "current",
});

export const GAMIFICATION_ACHIEVEMENTS = Object.freeze([
  { id: "first-completion", title: "First Win", description: "Complete your first assignment.", icon: "🌟", tone: "gold" },
  { id: "five-completions", title: "Momentum Builder", description: "Complete five assignments.", icon: "🚀", tone: "violet" },
  { id: "ten-completions", title: "Tenacious Ten", description: "Complete ten assignments.", icon: "🔟", tone: "blue" },
  { id: "twenty-five-completions", title: "Assignment Ace", description: "Complete twenty-five assignments.", icon: "🏆", tone: "legendary" },
  { id: "weekly-goal", title: "Goal Getter", description: "Reach your weekly assignment goal.", icon: "🎯", tone: "rose" },
  { id: "double-weekly-goal", title: "Overachiever", description: "Complete twice your weekly goal.", icon: "💥", tone: "orange" },
  { id: "three-productive-days", title: "Consistent Glow", description: "Complete work on three different days in one week.", icon: "🔥", tone: "orange" },
  { id: "five-productive-days", title: "Week Warrior", description: "Complete work on five different days in one week.", icon: "⚔️", tone: "blue" },
  { id: "high-priority", title: "Priority Pro", description: "Complete a high-priority assignment.", icon: "⚡", tone: "gold" },
  { id: "overdue-recovery", title: "Deadline Defender", description: "Complete an overdue assignment.", icon: "🛡️", tone: "emerald" },
  { id: "ahead-of-schedule", title: "Ahead of Schedule", description: "Finish more than a day before the deadline.", icon: "⏩", tone: "cyan" },
  { id: "quick-win", title: "Quick Win", description: "Complete an assignment estimated at 30 minutes or less.", icon: "🏃", tone: "lime" },
  { id: "deep-work", title: "Big Project Finisher", description: "Complete work estimated at two hours or more.", icon: "🏔️", tone: "violet" },
  { id: "course-five", title: "Course Champion", description: "Complete five assignments in one course.", icon: "🎓", tone: "cyan" },
  { id: "related-tasks", title: "Step by Step", description: "Finish an assignment by completing all related tasks.", icon: "🪜", tone: "emerald" },
  { id: "focus-finish", title: "Focus Finisher", description: "Complete an assignment after a focus session.", icon: "🧠", tone: "rose" },
  { id: "flash-first-deck", title: "First Deck", description: "Create your first Flashcard deck.", icon: "🗂️", tone: "cyan" },
  { id: "flash-first-session", title: "First Study Session", description: "Complete a meaningful Flashcard session.", icon: "📚", tone: "violet" },
  { id: "flash-25-cards", title: "25 Unique Cards", description: "Review 25 unique Flashcards.", icon: "✨", tone: "gold" },
  { id: "flash-100-cards", title: "100 Unique Cards", description: "Review 100 unique Flashcards.", icon: "💯", tone: "orange" },
  { id: "flash-500-cards", title: "500 Unique Cards", description: "Review 500 unique Flashcards.", icon: "🌟", tone: "legendary" },
  { id: "flash-three-days", title: "Three Study Days", description: "Study Flashcards on three days.", icon: "🔥", tone: "orange" },
  { id: "flash-seven-day-streak", title: "Seven-Day Study Streak", description: "Study Flashcards seven days in a row.", icon: "📅", tone: "emerald" },
  { id: "flash-before-target", title: "Ahead of the Test", description: "Complete a deck before its target date.", icon: "⏩", tone: "cyan" },
  { id: "flash-first-shared", title: "First Shared Deck", description: "Publish your first Shared Deck.", icon: "🌐", tone: "blue" },
  { id: "flash-first-helpful", title: "Helpful Creator", description: "Receive your first Helpful deck rating.", icon: "👍", tone: "lime" },
  { id: "flash-ten-helpful", title: "Trusted Study Creator", description: "Receive 10 Helpful deck ratings.", icon: "🏅", tone: "gold" },
  { id: "flash-community-creator", title: "Community Study Creator", description: "Attach a Shared Deck to Community.", icon: "🤝", tone: "rose" },
]);

export const BADGE_MASTERY_CHALLENGES = Object.freeze([
  { id: "first-completion", target: 50, description: "Complete 50 more assignments." },
  { id: "five-completions", target: 75, description: "Complete 75 more assignments." },
  { id: "ten-completions", target: 100, description: "Complete 100 more assignments." },
  { id: "twenty-five-completions", target: 150, description: "Complete 150 more assignments." },
  { id: "weekly-goal", target: 5, description: "Reach your weekly goal in 5 different weeks." },
  { id: "double-weekly-goal", target: 3, description: "Double your weekly goal in 3 different weeks." },
  { id: "three-productive-days", target: 3, description: "Work on 5 different days in 3 weeks." },
  { id: "five-productive-days", target: 5, description: "Work on 5 different days in 5 weeks." },
  { id: "high-priority", target: 25, description: "Complete 25 high-priority assignments." },
  { id: "overdue-recovery", target: 15, description: "Recover 15 overdue assignments." },
  { id: "ahead-of-schedule", target: 25, description: "Finish 25 assignments at least one day early." },
  { id: "quick-win", target: 50, description: "Complete 50 assignments estimated at 30 minutes or less." },
  { id: "deep-work", target: 20, description: "Complete 20 assignments estimated at 2 hours or more." },
  { id: "course-five", target: 40, description: "Complete 40 assignments in one course." },
  { id: "related-tasks", target: 30, description: "Finish 30 assignments through all related tasks." },
  { id: "focus-finish", target: 25, description: "Complete 25 assignments after focus sessions." },
  { id: "flash-first-deck", target: 3, description: "Create 3 Flashcard decks." },
  { id: "flash-first-session", target: 3, description: "Complete 3 study sessions." },
  { id: "flash-25-cards", target: 40, description: "Review 40 unique Flashcards." },
  { id: "flash-100-cards", target: 125, description: "Review 125 unique Flashcards." },
  { id: "flash-500-cards", target: 550, description: "Review 550 unique Flashcards." },
  { id: "flash-three-days", target: 4, description: "Study Flashcards on 4 different days." },
  { id: "flash-seven-day-streak", target: 8, description: "Study on 8 days in a rolling week-plus." },
  { id: "flash-before-target", target: 2, description: "Finish 2 sessions before a target date." },
  { id: "flash-first-shared", target: 2, description: "Publish 2 Shared Decks." },
  { id: "flash-first-helpful", target: 2, description: "Receive 2 Helpful ratings." },
  { id: "flash-ten-helpful", target: 12, description: "Receive 12 Helpful ratings." },
  { id: "flash-community-creator", target: 2, description: "Attach 2 decks to Community." },
]);

const FLASHCARD_MASTERY_METRICS = Object.freeze({
  "flash-first-deck": "deck_count",
  "flash-first-session": "session_count",
  "flash-25-cards": "unique_cards",
  "flash-100-cards": "unique_cards",
  "flash-500-cards": "unique_cards",
  "flash-three-days": "study_days",
  "flash-seven-day-streak": "recent_study_days",
  "flash-before-target": "before_target_sessions",
  "flash-first-shared": "shared_deck_count",
  "flash-first-helpful": "helpful_count",
  "flash-ten-helpful": "helpful_count",
  "flash-community-creator": "community_deck_count",
});

export const GAMIFICATION_TITLES = Object.freeze([
  { id: "getting-started", label: "Getting Started", requirement: null },
  { id: "momentum-builder", label: "Momentum Builder", requirement: "five-completions" },
  { id: "deadline-defender", label: "Deadline Defender", requirement: "overdue-recovery" },
  { id: "focus-finisher", label: "Focus Finisher", requirement: "focus-finish" },
  { id: "goal-getter", label: "Goal Getter", requirement: "weekly-goal" },
  { id: "priority-pro", label: "Priority Pro", requirement: "high-priority" },
  { id: "week-warrior", label: "Week Warrior", requirement: "five-productive-days" },
  { id: "course-champion", label: "Course Champion", requirement: "course-five" },
  { id: "assignment-ace", label: "Assignment Ace", requirement: "twenty-five-completions" },
  { id: "overachiever", label: "Overachiever", requirement: "double-weekly-goal" },
]);

export const GAMIFICATION_CONFETTI = Object.freeze([
  { id: "none", label: "None", requirement: null },
  { id: "standard", label: "Glow Mix", requirement: null },
  { id: "stars", label: "Golden Stars", requirement: "weekly-goal" },
  { id: "course", label: "Course Colors", requirement: "three-productive-days" },
  { id: "rainbow", label: "Rainbow Cascade", requirement: "ten-completions" },
  { id: "sparkles", label: "Focus Sparkles", requirement: "focus-finish" },
  { id: "ribbons", label: "Victory Ribbons", requirement: "related-tasks" },
  { id: "prism", label: "Prismatic Party", requirement: "twenty-five-completions" },
  { id: "meteors", label: "Meteor Shower", requirement: "high-priority" },
  { id: "bubbles", label: "Victory Bubbles", requirement: "quick-win" },
  { id: "leaves", label: "Ahead-of-Time Leaves", requirement: "ahead-of-schedule" },
  { id: "snow", label: "Study Snowfall", requirement: "course-five" },
  { id: "fireworks", label: "Overachiever Fireworks", requirement: "double-weekly-goal" },
  { id: "gold-ripple", label: "Completion Ripple", requirement: "first-completion" },
  { id: "hearts", label: "Momentum Hearts", requirement: "five-completions" },
  { id: "pixels", label: "Deep Work Pixels", requirement: "deep-work" },
  { id: "crowns", label: "Warrior Crowns", requirement: "five-productive-days" },
]);

export const GAMIFICATION_TEST_ACCOUNT = "purplxr@gmail.com";
export const CELEBRATION_STUDIO_REQUIRED_DAYS = 60;

export function normalizeSignInDays(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(String(day))))].sort();
}

export function getLocalSignInDay(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getCelebrationStudioProgress(value, forceUnlocked = false) {
  const signedInDays = normalizeSignInDays(value);
  const completed = forceUnlocked ? CELEBRATION_STUDIO_REQUIRED_DAYS : Math.min(CELEBRATION_STUDIO_REQUIRED_DAYS, signedInDays.length);
  return { completed, remaining: CELEBRATION_STUDIO_REQUIRED_DAYS - completed, unlocked: completed >= CELEBRATION_STUDIO_REQUIRED_DAYS };
}

export function isGamificationTestAccount(email) {
  return String(email || "").trim().toLocaleLowerCase() === GAMIFICATION_TEST_ACCOUNT;
}

const validIds = (values, allowed) => [...new Set((Array.isArray(values) ? values : []).filter((id) => allowed.has(id)))];

export function normalizeGamification(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const achievementIds = new Set(GAMIFICATION_ACHIEVEMENTS.map((item) => item.id));
  const earnedAchievementIds = validIds(source.earnedAchievementIds, achievementIds);
  const earned = new Set(earnedAchievementIds);
  const weeklyGoal = Math.max(1, Math.min(50, Math.round(Number(source.weeklyGoal) || DEFAULT_GAMIFICATION.weeklyGoal)));
  const selectedTitle = GAMIFICATION_TITLES.some((item) => item.id === source.selectedTitle && (!item.requirement || earned.has(item.requirement))) ? source.selectedTitle : DEFAULT_GAMIFICATION.selectedTitle;
  const selectedConfetti = GAMIFICATION_CONFETTI.some((item) => item.id === source.selectedConfetti && (!item.requirement || earned.has(item.requirement))) ? source.selectedConfetti : DEFAULT_GAMIFICATION.selectedConfetti;
  const selectedBadge = earned.has(source.selectedBadge) ? source.selectedBadge : earnedAchievementIds.at(-1) || "";
  const masteryIds = new Set(BADGE_MASTERY_CHALLENGES.map((item) => item.id));
  const masteredBadgeIds = validIds(source.masteredBadgeIds, masteryIds);
  const masteryProgress = Object.fromEntries(BADGE_MASTERY_CHALLENGES.map((challenge) => [challenge.id, Math.max(0, Math.min(challenge.target, Math.round(Number(source.masteryProgress?.[challenge.id]) || 0)))]));
  const masteryMilestoneKeys = Object.fromEntries(["weekly-goal", "double-weekly-goal", "three-productive-days", "five-productive-days"].map((id) => [id, [...new Set((Array.isArray(source.masteryMilestoneKeys?.[id]) ? source.masteryMilestoneKeys[id] : []).map(String))].slice(-20)]));
  const masteryCourseCounts = Object.fromEntries(Object.entries(source.masteryCourseCounts && typeof source.masteryCourseCounts === "object" ? source.masteryCourseCounts : {}).map(([course, count]) => [course, Math.max(0, Math.round(Number(count) || 0))]));
  const badgeAnimationPreferences = Object.fromEntries(masteredBadgeIds.map((id) => [id, source.badgeAnimationPreferences?.[id] !== false]));
  const sharedFlashcardBadge = source.sharedFlashcardBadge === "current" || !source.sharedFlashcardBadge
    ? "current"
    : earned.has(source.sharedFlashcardBadge) ? source.sharedFlashcardBadge : "current";
  return { version: 2, weeklyGoal, earnedAchievementIds, selectedConfetti, selectedTitle, selectedBadge, showHeaderSummary: source.showHeaderSummary !== false, shareFlashcardLevel: source.shareFlashcardLevel === true, showFlashcardName: source.showFlashcardName === true, sharedFlashcardBadge, masteryUnlockedAt: typeof source.masteryUnlockedAt === "string" ? source.masteryUnlockedAt : "", masteryProgress, masteryMilestoneKeys, masteryCourseCounts, masteredBadgeIds, badgeAnimationPreferences };
}

export function grantAllGamificationRewards(value = {}) {
  const current = normalizeGamification(value);
  const allAchievementIds = GAMIFICATION_ACHIEVEMENTS.map((achievement) => achievement.id);
  const alreadyGranted = allAchievementIds.every((id) => current.earnedAchievementIds.includes(id));
  return normalizeGamification({
    ...current,
    earnedAchievementIds: allAchievementIds,
    selectedConfetti: alreadyGranted ? current.selectedConfetti : "prism",
    selectedTitle: alreadyGranted ? current.selectedTitle : "assignment-ace",
    selectedBadge: alreadyGranted ? current.selectedBadge : "twenty-five-completions",
    masteryUnlockedAt: current.masteryUnlockedAt || new Date().toISOString(),
    masteryProgress: Object.fromEntries(BADGE_MASTERY_CHALLENGES.map((challenge) => [challenge.id, challenge.target])),
    masteredBadgeIds: BADGE_MASTERY_CHALLENGES.map((challenge) => challenge.id),
    badgeAnimationPreferences: Object.fromEntries(BADGE_MASTERY_CHALLENGES.map((challenge) => [challenge.id, current.badgeAnimationPreferences[challenge.id] !== false])),
  });
}

const getWeekKey = (now, weekStartsOn) => {
  const { start } = getWeekRange(now, weekStartsOn);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
};

export function advanceBadgeMastery(tasks, previousValue, nextValue, event = {}, options = {}) {
  const previous = normalizeGamification(previousValue);
  const next = normalizeGamification(nextValue);
  const allBaseIds = GAMIFICATION_ACHIEVEMENTS.map((achievement) => achievement.id);
  const wasUnlocked = allBaseIds.every((id) => previous.earnedAchievementIds.includes(id));
  const isUnlocked = allBaseIds.every((id) => next.earnedAchievementIds.includes(id));
  if (!isUnlocked) return next;
  const unlockedAt = next.masteryUnlockedAt || (options.now || new Date()).toISOString();
  if (!wasUnlocked) return normalizeGamification({ ...next, masteryUnlockedAt: unlockedAt });

  const progress = { ...next.masteryProgress };
  const milestoneKeys = Object.fromEntries(Object.entries(next.masteryMilestoneKeys).map(([id, keys]) => [id, [...keys]]));
  const courseCounts = { ...next.masteryCourseCounts };
  for (const id of ["first-completion", "five-completions", "ten-completions", "twenty-five-completions"]) progress[id] += 1;
  if (event.priority === "HIGH") progress["high-priority"] += 1;
  if (event.wasOverdue) progress["overdue-recovery"] += 1;
  if (event.completedEarly) progress["ahead-of-schedule"] += 1;
  if (Number(event.estimatedMinutes) > 0 && Number(event.estimatedMinutes) <= 30) progress["quick-win"] += 1;
  if (Number(event.estimatedMinutes) >= 120) progress["deep-work"] += 1;
  if (event.source === "related-tasks") progress["related-tasks"] += 1;
  if (event.source === "focus") progress["focus-finish"] += 1;

  const courseKey = String(event.course || "Other").trim().toLocaleLowerCase();
  courseCounts[courseKey] = (courseCounts[courseKey] || 0) + 1;
  progress["course-five"] = Math.max(progress["course-five"], courseCounts[courseKey]);
  const weekly = summarizeWeeklyMomentum(tasks, next, options);
  const weekKey = getWeekKey(options.now || new Date(), options.weekStartsOn);
  const addMilestone = (id, qualifies) => {
    if (!qualifies || milestoneKeys[id].includes(weekKey)) return;
    milestoneKeys[id].push(weekKey);
    progress[id] = milestoneKeys[id].length;
  };
  addMilestone("weekly-goal", weekly.goalReached);
  addMilestone("double-weekly-goal", weekly.completed >= weekly.goal * 2);
  addMilestone("three-productive-days", weekly.productiveDays >= 5);
  addMilestone("five-productive-days", weekly.productiveDays >= 5);

  const masteredBadgeIds = [...new Set([...next.masteredBadgeIds, ...BADGE_MASTERY_CHALLENGES.filter((challenge) => progress[challenge.id] >= challenge.target).map((challenge) => challenge.id)])];
  const badgeAnimationPreferences = { ...next.badgeAnimationPreferences };
  masteredBadgeIds.forEach((id) => { if (!(id in badgeAnimationPreferences)) badgeAnimationPreferences[id] = true; });
  return normalizeGamification({ ...next, masteryUnlockedAt: unlockedAt, masteryProgress: progress, masteryMilestoneKeys: milestoneKeys, masteryCourseCounts: courseCounts, masteredBadgeIds, badgeAnimationPreferences });
}

export function applyFlashcardMasterySummary(value, summary = {}) {
  const current = normalizeGamification(value);
  const allBaseIds = GAMIFICATION_ACHIEVEMENTS.map((achievement) => achievement.id);
  if (!allBaseIds.every((id) => current.earnedAchievementIds.includes(id))) return current;
  const progress = { ...current.masteryProgress };
  for (const [id, metric] of Object.entries(FLASHCARD_MASTERY_METRICS)) {
    progress[id] = Math.max(progress[id] || 0, Math.round(Number(summary[metric]) || 0));
  }
  const masteredBadgeIds = [...new Set([
    ...current.masteredBadgeIds,
    ...BADGE_MASTERY_CHALLENGES.filter((challenge) => progress[challenge.id] >= challenge.target).map((challenge) => challenge.id),
  ])];
  const badgeAnimationPreferences = { ...current.badgeAnimationPreferences };
  masteredBadgeIds.forEach((id) => { if (!(id in badgeAnimationPreferences)) badgeAnimationPreferences[id] = true; });
  return normalizeGamification({ ...current, progress, masteryProgress: progress, masteredBadgeIds, badgeAnimationPreferences });
}

export function getWeekRange(now = new Date(), weekStartsOn = "sunday") {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const firstDay = weekStartsOn === "monday" ? 1 : 0;
  start.setDate(start.getDate() - ((start.getDay() - firstDay + 7) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

export function summarizeWeeklyMomentum(tasks, gamification, options = {}) {
  const settings = normalizeGamification(gamification);
  const { start, end } = getWeekRange(options.now || new Date(), options.weekStartsOn);
  const completions = (Array.isArray(tasks) ? tasks : []).filter((task) => {
    if (!task?.isCompleted || task.isDeleted || !task.completedAt) return false;
    const completed = new Date(task.completedAt);
    return !Number.isNaN(completed.getTime()) && completed >= start && completed < end;
  });
  const productiveDays = new Set(completions.map((task) => {
    const date = new Date(task.completedAt);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  })).size;
  return { completed: completions.length, goal: settings.weeklyGoal, productiveDays, progress: Math.min(100, Math.round((completions.length / settings.weeklyGoal) * 100)), goalReached: completions.length >= settings.weeklyGoal };
}

export function getNewAchievementIds(tasks, gamification, event = {}, options = {}) {
  const settings = normalizeGamification(gamification);
  const earned = new Set(settings.earnedAchievementIds);
  const completed = (Array.isArray(tasks) ? tasks : []).filter((task) => task?.isCompleted && !task.isDeleted && task.completedAt);
  const courseCounts = completed.reduce((counts, task) => counts.set(String(task.course || task.category || "Other").trim().toLocaleLowerCase(), (counts.get(String(task.course || task.category || "Other").trim().toLocaleLowerCase()) || 0) + 1), new Map());
  const weekly = summarizeWeeklyMomentum(tasks, settings, options);
  const candidates = [];
  if (completed.length >= 1) candidates.push("first-completion");
  if (completed.length >= 5) candidates.push("five-completions");
  if (completed.length >= 10) candidates.push("ten-completions");
  if (completed.length >= 25) candidates.push("twenty-five-completions");
  if (weekly.goalReached) candidates.push("weekly-goal");
  if (weekly.completed >= weekly.goal * 2) candidates.push("double-weekly-goal");
  if (weekly.productiveDays >= 3) candidates.push("three-productive-days");
  if (weekly.productiveDays >= 5) candidates.push("five-productive-days");
  if (event.priority === "HIGH") candidates.push("high-priority");
  if (event.wasOverdue) candidates.push("overdue-recovery");
  if (event.completedEarly) candidates.push("ahead-of-schedule");
  if (Number(event.estimatedMinutes) > 0 && Number(event.estimatedMinutes) <= 30) candidates.push("quick-win");
  if (Number(event.estimatedMinutes) >= 120) candidates.push("deep-work");
  if ([...courseCounts.values()].some((count) => count >= 5)) candidates.push("course-five");
  if (event.source === "related-tasks") candidates.push("related-tasks");
  if (event.source === "focus") candidates.push("focus-finish");
  return candidates.filter((id) => !earned.has(id));
}

export function getGamificationTitle(gamification) {
  const settings = normalizeGamification(gamification);
  return GAMIFICATION_TITLES.find((item) => item.id === settings.selectedTitle) || GAMIFICATION_TITLES[0];
}
