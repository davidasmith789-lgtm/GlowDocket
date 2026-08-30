import test from "node:test";
import assert from "node:assert/strict";
import { getNextCalendarColorTimestamp, resolveLatestCalendarColor } from "../src/calendarDayColors.js";

test("a cleared date overrides older calendar color rules with the default", () => {
  assert.equal(resolveLatestCalendarColor([
    { color: "#ff0000", updatedAt: 10 },
    { color: "", cleared: true, updatedAt: 11 },
  ]), "");
});

test("a newly applied activity color overrides an older date color", () => {
  assert.equal(resolveLatestCalendarColor([
    { color: "#ff0000", updatedAt: 10 },
    { color: "#0000ff", updatedAt: 11 },
  ]), "#0000ff");
});

test("new calendar rules are always newer than every saved rule", () => {
  const colors = {
    dates: { "2026-08-31": { color: "#ff0000", updatedAt: 500 } },
    entryNames: { work: { color: "#0000ff", updatedAt: 800 } },
  };
  assert.equal(getNextCalendarColorTimestamp(colors, 100), 801);
});
