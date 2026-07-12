export function classifyDeadline(deadline, now = new Date()) {
  if (!(deadline instanceof Date) || !Number.isFinite(deadline.getTime())) return "no-date";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  if (target < today) return "overdue";
  if (target.getTime() === today.getTime()) return "today";
  if (target.getTime() === tomorrow.getTime()) return "tomorrow";
  return "later";
}

export function summarizeDeadlineConfidence(tasks, getDeadline, now = new Date()) {
  return tasks.reduce((summary, task) => {
    const bucket = classifyDeadline(getDeadline(task), now);
    summary[bucket] += 1;
    return summary;
  }, { overdue: 0, today: 0, tomorrow: 0, later: 0, "no-date": 0 });
}
