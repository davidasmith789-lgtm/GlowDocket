export const WEEKDAYS = [
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
];

export function isWeekdayDateValue(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day, 12);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return null;
  return date.getDay() !== 0 && date.getDay() !== 6;
}

export function getWeeklyMeetingsForDate(date, settings) {
  if (settings?.schoolScheduleMode !== "weekly") return [];
  const weekday = date instanceof Date ? date.getDay() : -1;
  const schedules = settings?.weeklyCourseMeetings;
  if (!schedules || typeof schedules !== "object") return [];

  return Object.entries(schedules)
    .flatMap(([course, meetings]) => (Array.isArray(meetings) ? meetings : []).map((meeting) => ({
      ...meeting,
      course,
      weekdays: Array.isArray(meeting?.weekdays) ? meeting.weekdays.map(Number) : [],
    })))
    .filter((meeting) => meeting.weekdays.includes(weekday))
    .sort((a, b) => String(a.startTime || "").localeCompare(String(b.startTime || "")) || a.course.localeCompare(b.course));
}

export function expandMeetingsToIndividualDays(meetings) {
  if (!Array.isArray(meetings)) return [];
  return meetings.flatMap((meeting, meetingIndex) => {
    const weekdays = Array.isArray(meeting?.weekdays) ? [...new Set(meeting.weekdays.map(Number))] : [];
    return weekdays.map((weekday) => ({
      ...meeting,
      id: `${meeting.id || `class-${meetingIndex}`}-day-${weekday}`,
      weekdays: [weekday],
    }));
  });
}

export function formatMeetingTime(time, useMilitaryTime = false) {
  if (!/^\d{2}:\d{2}$/.test(String(time || ""))) return "Time not set";
  const [hour, minute] = time.split(":").map(Number);
  if (useMilitaryTime) return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}
