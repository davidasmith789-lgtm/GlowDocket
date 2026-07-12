/* Pure ranking and preset helpers for Plan of Attack and What Should I Do. */
const PRIORITY_RANK = { HIGH: 0, MED: 1, LOW: 2 };
const DEFAULT_QUICK_MATCH_PRESETS = [15, 30, 45, 60];

export function getQuickMatchPresets(customPresets = []) {
  const validCustomPresets = Array.isArray(customPresets)
    ? customPresets
      .map(Number)
      .filter((minutes) => Number.isInteger(minutes) && minutes > 0 && minutes <= 1440)
    : [];

  return [...new Set([...DEFAULT_QUICK_MATCH_PRESETS, ...validCustomPresets])]
    .sort((a, b) => a - b);
}

export function getQuickMatchCustomPresets(customPresets = []) {
  const defaults = new Set(DEFAULT_QUICK_MATCH_PRESETS);
  return getQuickMatchPresets(customPresets).filter((minutes) => !defaults.has(minutes));
}

export function getValidEstimate(task) {
  const estimate = Number(task?.estimatedMinutes);
  return Number.isFinite(estimate) && estimate > 0
    ? estimate
    : Number.POSITIVE_INFINITY;
}

export function getDueRank(bucket) {
  if (String(bucket).startsWith("Overdue")) return 0;
  if (String(bucket).startsWith("Due Today")) return 1;
  if (String(bucket).startsWith("Due Tomorrow")) return 2;
  if (bucket === "Due This Week") return 3;
  if (bucket === "Due Next Week") return 4;
  if (bucket === "Due Later") return 5;
  return 6;
}

export function getDueLabel(bucket) {
  if (String(bucket).startsWith("Overdue")) return "Overdue";
  if (String(bucket).startsWith("Due Today")) return "Due Today";
  if (String(bucket).startsWith("Due Tomorrow")) return "Due Tomorrow";
  return bucket || "No Due Date";
}

function getChecklistProgress(task) {
  const subtasks = Array.isArray(task?.subtasks) ? task.subtasks : [];
  if (subtasks.length === 0) return { total: 0, done: 0, ratio: 0 };
  const done = subtasks.filter((subtask) => subtask?.isDone).length;
  return { total: subtasks.length, done, ratio: done / subtasks.length };
}

function getStatusRank(task, getStatus) {
  return getStatus(task) === "inProgress" ? 0 : 1;
}

function compareCore(a, b, availableMinutes = null) {
  const dueDifference = getDueRank(a.dueBucket) - getDueRank(b.dueBucket);
  if (dueDifference) return dueDifference;

  const deadlineDifference = (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity);
  if (deadlineDifference) return deadlineDifference;

  const priorityDifference = (PRIORITY_RANK[a.task.priority] ?? 3) - (PRIORITY_RANK[b.task.priority] ?? 3);
  if (priorityDifference) return priorityDifference;

  const statusDifference = a.statusRank - b.statusRank;
  if (statusDifference) return statusDifference;

  if (a.checklistProgress.ratio !== b.checklistProgress.ratio) {
    return b.checklistProgress.ratio - a.checklistProgress.ratio;
  }

  if (availableMinutes !== null) {
    const fitDifferenceA = a.fits ? availableMinutes - a.estimate : a.estimate - availableMinutes;
    const fitDifferenceB = b.fits ? availableMinutes - b.estimate : b.estimate - availableMinutes;
    if (fitDifferenceA !== fitDifferenceB) return fitDifferenceA - fitDifferenceB;
  }

  if (a.estimate !== b.estimate) return a.estimate - b.estimate;
  return (a.task.title || "").localeCompare(b.task.title || "");
}

export function getRecommendationReasons(task, dueBucket, getStatus) {
  const estimate = getValidEstimate(task);
  const progress = getChecklistProgress(task);
  const reasons = [];

  if (String(dueBucket).startsWith("Overdue")) reasons.push("Overdue");
  else if (String(dueBucket).startsWith("Due Today")) reasons.push("Due today");
  else if (String(dueBucket).startsWith("Due Tomorrow")) reasons.push("Due tomorrow");
  else if (dueBucket === "No Due Date") reasons.push("Needs date");

  if (task?.priority === "HIGH") reasons.push("High priority");
  if (getStatus(task) === "inProgress") reasons.push("In progress");
  if (Number.isFinite(estimate) && estimate <= 30) reasons.push("Short win");
  if (Number.isFinite(estimate) && estimate >= 90) reasons.push("Long project");
  if (progress.total > 0 && progress.done > 0 && progress.done < progress.total) {
    reasons.push(`${progress.done}/${progress.total} steps done`);
  }

  return reasons.length > 0 ? reasons.slice(0, 4) : ["Next best"];
}

export function rankRecommendedTasks(taskList, options) {
  const {
    getDueBucket,
    getDeadline,
    getStatus,
    limit = 5,
  } = options;

  return taskList
    .map((task) => {
      const dueBucket = getDueBucket(task);
      return {
        task,
        dueBucket,
        dueLabel: getDueLabel(dueBucket),
        deadline: getDeadline(task),
        estimate: getValidEstimate(task),
        statusRank: getStatusRank(task, getStatus),
        checklistProgress: getChecklistProgress(task),
        reasons: getRecommendationReasons(task, dueBucket, getStatus),
      };
    })
    .sort((a, b) => compareCore(a, b))
    .slice(0, limit);
}

export function summarizeRecommendationWorkload(recommendations) {
  const knownMinutes = recommendations.reduce((total, item) =>
    total + (Number.isFinite(item.estimate) ? item.estimate : 0), 0);
  const unknownCount = recommendations.filter((item) => !Number.isFinite(item.estimate)).length;
  return { knownMinutes, unknownCount };
}

export function rankQuickMatchCandidates(taskList, availableMinutes, options) {
  const { getDueBucket, getDeadline, getStatus } = options;
  const candidates = taskList.map((task) => {
    const estimate = getValidEstimate(task);
    const dueBucket = getDueBucket(task);
    const hasEstimate = Number.isFinite(estimate);
    return {
      task,
      estimate,
      dueBucket,
      dueLabel: getDueLabel(dueBucket),
      deadline: getDeadline(task),
      hasEstimate,
      fits: hasEstimate && estimate <= availableMinutes,
      statusRank: getStatusRank(task, getStatus),
      checklistProgress: getChecklistProgress(task),
    };
  });

  const fitting = candidates.filter((candidate) => candidate.fits);
  const pool = fitting.length > 0
    ? fitting
    : candidates.filter((candidate) => candidate.hasEstimate);
  const fallbackPool = pool.length > 0 ? pool : candidates;

  return fallbackPool
    .sort((a, b) => compareCore(a, b, availableMinutes))
    .slice(0, 4);
}

export function getQuickMatchReason(match) {
  if (!match.hasEstimate) return "Time is unknown, but this is the most urgent task to start.";
  if (!match.fits) return "This may not fit completely, but it is your best use of this time.";
  if (match.statusRank === 0) return "Fits your time and you already have momentum.";
  if (match.dueLabel === "Overdue") return "Fits your time and is overdue.";
  if (match.dueLabel === "Due Today") return "Fits your time and is due today.";
  return "Fits your time and is one of your most urgent tasks.";
}
