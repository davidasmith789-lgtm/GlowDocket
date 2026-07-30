import test from "node:test";
import assert from "node:assert/strict";
import { formatMeetingTime, getWeeklyMeetingsForDate } from "../src/schoolScheduleUtils.js";

const settings = {
  schoolScheduleMode: "weekly",
  weeklyCourseMeetings: {
    Biology: [{ id: "bio", weekdays: [1, 3], startTime: "11:00", endTime: "12:15" }],
    Calculus: [
      { id: "calc-mon", weekdays: [1], startTime: "09:00", endTime: "09:50" },
      { id: "calc-fri", weekdays: [5], startTime: "13:00", endTime: "14:30" },
    ],
  },
};

test("weekly schedules return only meetings for the selected weekday in time order", () => {
  assert.deepEqual(
    getWeeklyMeetingsForDate(new Date(2026, 7, 3), settings).map(({ course, id }) => ({ course, id })),
    [{ course: "Calculus", id: "calc-mon" }, { course: "Biology", id: "bio" }],
  );
  assert.deepEqual(getWeeklyMeetingsForDate(new Date(2026, 7, 4), settings), []);
});

test("weekly meetings are ignored while A/B mode is selected", () => {
  assert.deepEqual(getWeeklyMeetingsForDate(new Date(2026, 7, 3), { ...settings, schoolScheduleMode: "ab" }), []);
});

test("meeting times are shown in readable twelve-hour time", () => {
  assert.equal(formatMeetingTime("09:05"), "9:05 AM");
  assert.equal(formatMeetingTime("13:30"), "1:30 PM");
});
