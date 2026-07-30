export const WEEKDAYS = [
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
];

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

export function formatMeetingTime(time) {
  if (!/^\d{2}:\d{2}$/.test(String(time || ""))) return "Time not set";
  const [hour, minute] = time.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}
