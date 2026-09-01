const pad = (value) => String(value).padStart(2, "0");
const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const localDateTime = (date, time) => `${date}T${time}:00`;
const addMinutes = (dateTime, minutes) => {
  const date = new Date(dateTime); date.setMinutes(date.getMinutes() + minutes);
  return `${dateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
};
const nextDate = (value) => { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + 1); return dateKey(date); };
const assignmentTime = (task) => {
  const hour = Number(task.dueHour); if (!Number.isFinite(hour)) return "";
  const normalized = String(task.dueAmPm || "").toUpperCase() === "PM" ? (hour % 12) + 12 : hour % 12;
  return `${pad(normalized)}:00`;
};
const managedDescription = (item, includeNotes, managedClass = false) => [
  item.course ? `Course: ${item.course}` : "",
  item.returnUrl ? `Open in GlowDocket: ${item.returnUrl}` : "",
  includeNotes && item.notes ? item.notes : "",
  managedClass ? "This class schedule is managed by GlowDocket. Change the schedule in GlowDocket." : "",
].filter(Boolean).join("\n\n");

export function assignmentGoogleEvent(task, { includeNotes = false, returnUrl = "", timeZone = "UTC" } = {}) {
  const now = new Date(); const year = Number(task.dueYear) || now.getFullYear();
  const dueDate = `${year}-${pad(task.dueMonth)}-${pad(task.dueDay)}`; const time = assignmentTime(task);
  const summary = `Due: ${task.name || task.title || "Assignment"}`;
  const base = { summary, description: managedDescription({ ...task, returnUrl }, includeNotes), location: task.location || undefined };
  return time ? { ...base, start: { dateTime: localDateTime(dueDate, time), timeZone }, end: { dateTime: addMinutes(localDateTime(dueDate, time), 15), timeZone } } : { ...base, start: { date: dueDate }, end: { date: nextDate(dueDate) } };
}

export function activityGoogleEvent(entry, { includeNotes = false, returnUrl = "", timeZone = "UTC" } = {}) {
  if (!entry.time) return { summary: entry.name || "GlowDocket activity", description: managedDescription({ ...entry, returnUrl }, includeNotes), location: entry.location || undefined, start: { date: entry.date }, end: { date: nextDate(entry.date) } };
  const startTime = entry.time; const start = localDateTime(entry.date, startTime);
  const end = entry.endTime ? localDateTime(entry.date, entry.endTime) : addMinutes(start, 30);
  return { summary: entry.name || "GlowDocket event", description: managedDescription({ ...entry, returnUrl }, includeNotes), location: entry.location || undefined, start: { dateTime: start, timeZone }, end: { dateTime: end, timeZone } };
}

export function checklistGoogleEvent(item, list, options = {}) {
  const time = item.dueTime || ""; const base = { summary: `Due: ${item.text || "Checklist item"}`, description: managedDescription({ ...item, course: list.title, returnUrl: options.returnUrl }, options.includeNotes) };
  return time ? { ...base, start: { dateTime: localDateTime(item.dueDate, time), timeZone: options.timeZone }, end: { dateTime: addMinutes(localDateTime(item.dueDate, time), 15), timeZone: options.timeZone } } : { ...base, start: { date: item.dueDate }, end: { date: nextDate(item.dueDate) } };
}

const googleWeekday = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
export function classGoogleEvents(courses, settings, { returnUrl = "", timeZone = "UTC", today = new Date() } = {}) {
  if (settings.schoolScheduleMode === "weekly") return Object.entries(settings.weeklyCourseMeetings || {}).flatMap(([course, meetings]) => (meetings || []).filter((meeting) => meeting.startTime && meeting.endTime && meeting.weekdays?.length).map((meeting, index) => {
    const first = new Date(today); while (!meeting.weekdays.map(Number).includes(first.getDay())) first.setDate(first.getDate() + 1);
    const id = meeting.id || `${course}-${index}`;
    return { id: `weekly:${id}`, type: "class", updatedAt: settings.updatedAt, googleEvent: { summary: course, description: managedDescription({ course, returnUrl }, false, true), start: { dateTime: localDateTime(dateKey(first), meeting.startTime), timeZone }, end: { dateTime: localDateTime(dateKey(first), meeting.endTime), timeZone }, recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${meeting.weekdays.map((day) => googleWeekday[Number(day)]).join(",")}`] } };
  }));
  const result = []; const end = new Date(today); end.setFullYear(end.getFullYear() + 1);
  const dayNames = settings.cycleDayNames || []; const anchor = new Date(`${settings.cycleAnchorDate || ""}T12:00:00`);
  if (!dayNames.length || Number.isNaN(anchor.getTime())) return result;
  let schoolIndex = 0; for (const cursor = new Date(anchor); cursor < today; cursor.setDate(cursor.getDate() + 1)) if (![0, 6].includes(cursor.getDay())) schoolIndex += 1;
  for (const cursor = new Date(today); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    if ([0, 6].includes(cursor.getDay())) continue;
    const cycleDay = dayNames[((schoolIndex % dayNames.length) + dayNames.length) % dayNames.length]; schoolIndex += 1;
    for (const course of courses) {
      const assigned = settings.courseCycleDays?.[course]; if (Array.isArray(assigned) && !assigned.includes(cycleDay)) continue;
      const meeting = settings.cycleCourseMeetings?.[course]?.[cycleDay]; if (!meeting?.startTime || !meeting?.endTime) continue;
      const day = dateKey(cursor);
      result.push({ id: `cycle:${course}:${day}`, type: "class", googleEvent: { summary: course, description: managedDescription({ course, returnUrl }, false, true), start: { dateTime: localDateTime(day, meeting.startTime), timeZone }, end: { dateTime: localDateTime(day, meeting.endTime), timeZone } } });
    }
  }
  return result;
}

export function buildGoogleCalendarItems({ tasks, calendarEvents, checklists, courses, settings, preferences, origin = globalThis.location?.origin || "https://glowdocket.com", timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" }) {
  const common = { includeNotes: Boolean(preferences.include_notes), returnUrl: `${origin}/?tab=calendar`, timeZone }; const items = [];
  if (preferences.sync_assignments !== false) for (const task of tasks || []) if (!task.isDeleted && !task.isArchived && task.dueMonth && task.dueDay) items.push({ id: String(task.id), type: "assignment", updatedAt: task.updatedAt || task.createdAt, googleEvent: assignmentGoogleEvent(task, common) });
  if (preferences.sync_activities !== false) for (const entry of calendarEvents || []) if (["event", "day-note"].includes(entry.type) && entry.date) items.push({ id: String(entry.id), type: "activity", updatedAt: entry.updatedAt || entry.createdAt, googleEvent: activityGoogleEvent(entry, common) });
  if (preferences.sync_checklists) for (const list of checklists || []) for (const item of list.items || []) if (item.dueDate && !item.isDone) items.push({ id: String(item.id), type: "checklist", updatedAt: item.updatedAt, googleEvent: checklistGoogleEvent(item, list, common) });
  if (preferences.sync_classes !== false) items.push(...classGoogleEvents(courses || [], settings || {}, common));
  return items;
}

export function googleEventDateKey(event) { return event?.start?.date || String(event?.start?.dateTime || "").slice(0, 10); }
export function googleEventTime(event) { return event?.allDay ? "" : String(event?.start?.dateTime || "").slice(11, 16); }
const weekdayCode = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
export function googleEventOccursOnDate(event, targetKey) {
  if (googleEventDateKey(event) === targetKey) return event.status !== "cancelled";
  const rule = event?.recurrence?.find((line) => line.startsWith("RRULE:")); if (!rule || event.status === "cancelled") return false;
  const parts = Object.fromEntries(rule.slice(6).split(";").map((part) => part.split("="))); const startKey = googleEventDateKey(event);
  const start = new Date(`${startKey}T12:00:00`); const target = new Date(`${targetKey}T12:00:00`);
  if (Number.isNaN(start.getTime()) || target < start) return false;
  if (parts.UNTIL) { const until = new Date(`${parts.UNTIL.slice(0, 4)}-${parts.UNTIL.slice(4, 6)}-${parts.UNTIL.slice(6, 8)}T23:59:59Z`); if (target > until) return false; }
  const days = Math.floor((target - start) / 86_400_000); const interval = Math.max(1, Number(parts.INTERVAL) || 1);
  if (parts.FREQ === "DAILY") return days % interval === 0;
  if (parts.FREQ === "WEEKLY") return Math.floor(days / 7) % interval === 0 && (parts.BYDAY ? parts.BYDAY.split(",").some((value) => value.endsWith(weekdayCode[target.getDay()])) : target.getDay() === start.getDay());
  if (parts.FREQ === "MONTHLY") return (target.getFullYear() * 12 + target.getMonth() - (start.getFullYear() * 12 + start.getMonth())) % interval === 0 && target.getDate() === start.getDate();
  if (parts.FREQ === "YEARLY") return (target.getFullYear() - start.getFullYear()) % interval === 0 && target.getMonth() === start.getMonth() && target.getDate() === start.getDate();
  return false;
}
export function googleEventsForDate(events, targetKey) {
  const exceptions = new Set((events || []).filter((event) => event.recurringEventId && (event.originalStartTime?.date || event.originalStartTime?.dateTime || "").slice(0, 10) === targetKey).map((event) => event.recurringEventId));
  return (events || []).filter((event) => event.status !== "cancelled" && (googleEventDateKey(event) === targetKey || (!exceptions.has(event.id) && googleEventOccursOnDate(event, targetKey))));
}

const assignmentFieldsFromGoogle = (fields) => {
  const start = fields.start?.dateTime || fields.start?.date || ""; const date = start.slice(0, 10); const time = fields.start?.dateTime?.slice(11, 16);
  const result = {};
  if (typeof fields.summary === "string") result.title = fields.summary.replace(/^Due:\s*/i, "");
  if (date) { const [year, month, day] = date.split("-").map(Number); Object.assign(result, { dueYear: year, dueMonth: month, dueDay: day }); }
  if (time) { const [hour] = time.split(":").map(Number); Object.assign(result, { dueHour: hour % 12 || 12, dueAmPm: hour >= 12 ? "PM" : "AM" }); }
  if (typeof fields.location === "string") result.location = fields.location;
  return result;
};
export function applyGoogleNativeUpdates({ tasks, calendarEvents, checklists }, updates = []) {
  let nextTasks = tasks; let nextEvents = calendarEvents; let nextChecklists = checklists;
  for (const update of updates) {
    if (update.type === "assignment") nextTasks = nextTasks.map((task) => String(task.id) === update.id ? { ...task, ...assignmentFieldsFromGoogle(update.fields), syncUpdatedAt: new Date().toISOString() } : task);
    if (update.type === "activity") nextEvents = nextEvents.map((event) => String(event.id) === update.id ? { ...event, ...(typeof update.fields.summary === "string" ? { name: update.fields.summary } : {}), ...(update.fields.start?.dateTime ? { date: update.fields.start.dateTime.slice(0, 10), time: update.fields.start.dateTime.slice(11, 16) } : {}), ...(update.fields.end?.dateTime ? { endTime: update.fields.end.dateTime.slice(11, 16) } : {}), ...(typeof update.fields.location === "string" ? { location: update.fields.location } : {}) } : event);
    if (update.type === "checklist") nextChecklists = nextChecklists.map((list) => ({ ...list, items: (list.items || []).map((item) => String(item.id) === update.id ? { ...item, ...(typeof update.fields.summary === "string" ? { text: update.fields.summary.replace(/^Due:\s*/i, "") } : {}), ...(update.fields.start?.date || update.fields.start?.dateTime ? { dueDate: (update.fields.start.date || update.fields.start.dateTime).slice(0, 10), dueTime: update.fields.start.dateTime?.slice(11, 16) || "" } : {}) } : item) }));
  }
  return { tasks: nextTasks, calendarEvents: nextEvents, checklists: nextChecklists };
}
