import test from "node:test";
import assert from "node:assert/strict";
import { getChecklistDropPlacement } from "../src/checklistReorderUtils.js";

const card = { left: 100, top: 50, width: 220, height: 110, right: 320, bottom: 160 };

test("the center of a checklist card is a neutral no-drop zone", () => {
  assert.equal(getChecklistDropPlacement(card, 210, 105), null);
  assert.equal(getChecklistDropPlacement(card, 180, 95), null);
  assert.equal(getChecklistDropPlacement(card, 240, 115), null);
});

test("horizontal pointer position wins on the left and right sides of wide cards", () => {
  assert.equal(getChecklistDropPlacement(card, 155, 133), "left");
  assert.equal(getChecklistDropPlacement(card, 265, 77), "right");
});

test("top and bottom placement remains available near the horizontal center", () => {
  assert.equal(getChecklistDropPlacement(card, 210, 58), "above");
  assert.equal(getChecklistDropPlacement(card, 210, 152), "below");
});

test("invalid hit-test input never offers a snap location", () => {
  assert.equal(getChecklistDropPlacement(null, 210, 105), null);
  assert.equal(getChecklistDropPlacement(card, Number.NaN, 105), null);
});
