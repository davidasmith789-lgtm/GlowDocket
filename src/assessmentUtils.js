const pad = (value) => String(value).padStart(2, "0");

export const ASSESSMENT_TYPES = ["quiz", "test"];

export function isAssessment(item) {
  return item?.itemType === "assessment";
}

export function formatAssessmentType(value) {
  return value === "quiz" ? "Quiz" : "Test";
}

export function assessmentDateInputValue(item, fallbackYear = new Date().getFullYear()) {
  if (!item?.dueMonth || !item?.dueDay) return "";
  return `${Number(item.dueYear) || fallbackYear}-${pad(item.dueMonth)}-${pad(item.dueDay)}`;
}

export function assessmentTimeInputValue(item) {
  const match = String(item?.dueHour || "").match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return "";
  let hour = Number(match[1]) % 12;
  if (String(item?.dueAmPm || "PM").toUpperCase() === "PM") hour += 12;
  return `${pad(hour)}:${match[2] || "00"}`;
}

function dueTimeParts(timeInput, amPm) {
  if (["AM", "PM"].includes(amPm)) {
    const match = String(timeInput || "").trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    return {
      dueHour: `${hour}:${pad(minute)}`,
      dueAmPm: amPm,
    };
  }

  const match = String(timeInput || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return {
    dueHour: `${hour % 12 || 12}:${pad(minute)}`,
    dueAmPm: hour >= 12 ? "PM" : "AM",
  };
}

function dateParts(dateInput) {
  const match = String(dateInput || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) return null;
  return {
    date,
    dueYear: date.getFullYear(),
    dueMonth: pad(date.getMonth() + 1),
    dueDay: pad(date.getDate()),
  };
}

export function buildAssessmentTask({
  id = Date.now(),
  assessmentType = "test",
  name,
  course,
  date,
  time,
  amPm,
  notes = "",
  existing = {},
  now = new Date(),
} = {}) {
  const cleanName = String(name || "").trim();
  const cleanCourse = String(course || "").trim();
  const parsedDate = dateParts(date);
  const parsedTime = dueTimeParts(time, amPm);
  if (!cleanName || !cleanCourse || !parsedDate || !parsedTime) return null;
  const type = ASSESSMENT_TYPES.includes(assessmentType) ? assessmentType : "test";
  const timestamp = now.toISOString();
  return {
    ...existing,
    id,
    itemType: "assessment",
    assessmentType: type,
    title: cleanName,
    category: "School",
    course: cleanCourse,
    dueYear: parsedDate.dueYear,
    dueMonth: parsedDate.dueMonth,
    dueDay: parsedDate.dueDay,
    dueHour: parsedTime.dueHour,
    dueAmPm: parsedTime.dueAmPm,
    estimatedMinutes: "",
    priority: "HIGH",
    repeat: "NONE",
    isCompleted: false,
    status: "todo",
    notes: String(notes || "").trim(),
    subtasks: [],
    links: [],
    attachments: [],
    createdAt: existing.createdAt || timestamp,
    syncUpdatedAt: timestamp,
  };
}

export function getAssessmentStudyNotes(assessment) {
  const type = formatAssessmentType(assessment?.assessmentType);
  const date = assessmentDateInputValue(assessment);
  const time = assessment?.dueHour ? `${assessment.dueHour} ${assessment.dueAmPm || "PM"}` : "";
  return [
    `${type}: ${assessment?.title || "Untitled"}`,
    `Scheduled for: ${date} at ${time}`,
    assessment?.notes ? `Assessment notes:\n${assessment.notes}` : "",
  ].filter(Boolean).join("\n\n");
}

export function buildStudyTaskForAssessment(assessment, { id = Date.now(), existing = {}, now = new Date() } = {}) {
  if (!isAssessment(assessment)) return null;
  const assessmentDate = dateParts(assessmentDateInputValue(assessment))?.date;
  if (!assessmentDate) return null;
  const studyDate = new Date(assessmentDate);
  studyDate.setDate(studyDate.getDate() - 1);
  const timestamp = now.toISOString();
  return {
    ...existing,
    id,
    itemType: "assignment",
    title: `Study for: ${assessment.title}`,
    category: "School",
    course: assessment.course,
    dueYear: studyDate.getFullYear(),
    dueMonth: pad(studyDate.getMonth() + 1),
    dueDay: pad(studyDate.getDate()),
    dueHour: "11:59",
    dueAmPm: "PM",
    estimatedMinutes: existing.estimatedMinutes || "",
    priority: existing.priority || "HIGH",
    repeat: "NONE",
    isCompleted: Boolean(existing.isCompleted),
    status: existing.isCompleted ? "completed" : existing.status || "todo",
    notes: getAssessmentStudyNotes(assessment),
    subtasks: Array.isArray(existing.subtasks) ? existing.subtasks : [],
    links: Array.isArray(existing.links) ? existing.links : [],
    attachments: Array.isArray(existing.attachments) ? existing.attachments : [],
    sourceAssessmentId: assessment.id,
    createdAt: existing.createdAt || timestamp,
    syncUpdatedAt: timestamp,
  };
}
