const atStartOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const parseLocalDate = (value) => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
};

export function getWorkloadPeriodRange(period, { now = new Date(), weekStartsOn = "sunday", customStart = "", customEnd = "" } = {}) {
  const today = atStartOfDay(now);
  if (period === "all") return { start: null, end: null, label: "All remaining" };
  if (period === "today") return { start: today, end: today, label: "Due today" };
  if (period === "week") {
    const firstDay = weekStartsOn === "monday" ? 1 : 0;
    const start = new Date(today);
    start.setDate(start.getDate() - ((start.getDay() - firstDay + 7) % 7));
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start, end, label: "Due this week" };
  }
  if (period === "month") return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: new Date(today.getFullYear(), today.getMonth() + 1, 0), label: "Due this month" };
  const start = parseLocalDate(customStart);
  const end = parseLocalDate(customEnd);
  return { start, end, label: "Custom period", invalid: !start || !end || start > end };
}

export function summarizeWorkload(tasks, period, options = {}) {
  const range = getWorkloadPeriodRange(period, options);
  const now = options.now || new Date();
  const filteredTasks = (tasks || []).filter((task) => {
    if (period === "all") return true;
    if (range.invalid || !task.dueMonth || !task.dueDay) return false;
    const dueDate = new Date(now.getFullYear(), Number(task.dueMonth) - 1, Number(task.dueDay));
    return dueDate >= range.start && dueDate <= range.end;
  });
  const knownMinutes = filteredTasks.reduce((total, task) => total + (Number(task.estimatedMinutes) || 0), 0);
  const unknownCount = filteredTasks.filter((task) => !(Number(task.estimatedMinutes) > 0)).length;
  return { ...range, tasks: filteredTasks, taskCount: filteredTasks.length, knownMinutes, unknownCount };
}
