import test from "node:test";
import assert from "node:assert/strict";
import {
  parseFlashcardImport,
  confidenceFor,
  deckProgress,
  parseCommunityFlashcards,
  selectStudyCards,
} from "../src/flashcardUtils.js";
test("flashcard import supports common separators and review failures", () => {
  assert.equal(
    parseFlashcardImport("Term\tDefinition\nA,B\nC;D\nE - F").filter(
      (x) => x.valid,
    ).length,
    4,
  );
  assert.equal(parseFlashcardImport("bad row")[0].valid, false);
});
test("flashcard import can reverse and ignore headings", () => {
  assert.deepEqual(
    parseFlashcardImport("Front,Back\nA,B", {
      ignoreFirst: true,
      reverse: true,
    })[0].front,
    "B",
  );
});
test("confidence has no scheduling date", () => {
  assert.equal(confidenceFor({ review_count: 2 }, "Easy"), "Strong");
  assert.equal(confidenceFor({}, "Good"), "Learning");
});
test("deck progress summarizes private card progress", () => {
  assert.equal(
    deckProgress([{ id: "a" }, { id: "b" }], {
      a: { confidence_status: "Strong", review_count: 2 },
    }).percent,
    50,
  );
});
test("community conversion produces a reviewable proposal", () => {
  const cards = parseCommunityFlashcards(
    "## Biology\n- Mitosis: Cell division\n1. Meiosis - Makes gametes",
  );
  assert.equal(cards.length, 2);
  assert.equal(
    cards.every((card) => card.selected),
    true,
  );
});
test("requested study filters, limits, and reverse direction work", () => {
  const cards = [
    { id: "a", front: "A", back: "1" },
    { id: "b", front: "B", back: "2" },
    { id: "c", front: "C", back: "3" },
  ];
  const progress = {
    a: { is_starred: true, last_rating: "Good", review_count: 1 },
    b: { last_rating: "Again", review_count: 2 },
  };
  assert.deepEqual(
    selectStudyCards(cards, progress, { mode: "starred" }).map(
      (card) => card.id,
    ),
    ["a"],
  );
  assert.deepEqual(
    selectStudyCards(cards, progress, { mode: "difficult" }).map(
      (card) => card.id,
    ),
    ["b"],
  );
  assert.deepEqual(
    selectStudyCards(cards, progress, { mode: "new" }).map((card) => card.id),
    ["c"],
  );
  assert.equal(
    selectStudyCards(cards, progress, { direction: "back", size: 10 })[0].front,
    "1",
  );
});
