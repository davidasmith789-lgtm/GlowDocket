/* Shared human-readable urgency labels used by cards and dashboard widgets. */
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function formatHoursAndMinutes(milliseconds) {
  const totalMinutes = Math.max(1, Math.ceil(milliseconds / MINUTE));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function formatWholeHours(milliseconds) {
  return `${Math.max(1, Math.floor(milliseconds / HOUR))}h`;
}

export function formatAssignmentCountdown(deadline, now = new Date()) {
  if (!(deadline instanceof Date) || Number.isNaN(deadline.getTime())) return "";
  const difference = deadline.getTime() - now.getTime();
  if (Math.abs(difference) < MINUTE) return "Due now";

  if (difference < 0) {
    const overdue = Math.abs(difference);
    if (overdue < DAY) return `Overdue by ${formatHoursAndMinutes(overdue)}`;
    const days = Math.floor(overdue / DAY);
    return `Overdue by ${days} day${days === 1 ? "" : "s"}`;
  }

  if (difference < 12 * HOUR) return `${formatHoursAndMinutes(difference)} left`;
  if (difference < DAY) return `${formatWholeHours(difference)} left`;

  const deadlineDay = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const calendarDays = Math.round((deadlineDay.getTime() - today.getTime()) / DAY);
  return `${calendarDays} day${calendarDays === 1 ? "" : "s"} left`;
}

export function getAssignmentCountdownTone(deadline, now = new Date()) {
  if (!(deadline instanceof Date) || Number.isNaN(deadline.getTime())) return "none";
  const difference = deadline.getTime() - now.getTime();
  if (difference < 0) return "overdue";
  const sameDay = deadline.getFullYear() === now.getFullYear()
    && deadline.getMonth() === now.getMonth()
    && deadline.getDate() === now.getDate();
  return sameDay ? "today" : "future";
}
