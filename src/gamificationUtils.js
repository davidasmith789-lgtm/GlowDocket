export const DEFAULT_GAMIFICATION = Object.freeze({
  version: 1,
  weeklyGoal: 5,
  earnedAchievementIds: [],
  selectedConfetti: "standard",
  selectedTitle: "getting-started",
  selectedBadge: "",
  showHeaderSummary: true,
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
]);

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
  return { version: 1, weeklyGoal, earnedAchievementIds, selectedConfetti, selectedTitle, selectedBadge, showHeaderSummary: source.showHeaderSummary !== false };
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
  });
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
