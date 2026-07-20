import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sql = read("supabase/migrations/202607200002_create_flashcards.sql");
const hub = read("src/components/FlashcardsHub.jsx");
const community = read("src/components/CommunityFlashcardActions.jsx");
const assignment = read("src/components/AssignmentFlashcards.jsx");
const confirmDialog = read("src/components/FlashcardConfirmDialog.jsx");

test("ratings and reports are enforced server-side", () => {
  assert.match(sql, /primary key\(deck_id,user_id\)/i);
  assert.match(sql, /owner_id<>auth\.uid\(\).*Deck cannot be rated/i);
  assert.match(sql, /unique\(deck_id,reporter_id\)/i);
  assert.match(sql, /count\(distinct reporter_id\).*>=3/i);
  assert.match(hub, /FlashcardSharedActions/);
});

test("public deck and Community attachment visibility require active shared decks", () => {
  const guard = /visibility='shared'and d\.status='active'/i;
  assert.match(sql, guard);
  assert.match(community, /visibility", "shared"/);
  assert.match(community, /status", "active"/);
});

test("moderation uses Community moderator authorization", () => {
  assert.match(sql, /is_community_moderator\(auth\.uid\(\)\)/i);
  assert.match(sql, /flashcard_moderation_queue/);
  assert.match(sql, /moderate_flashcard_deck/);
});

test("Flashcards page omits the moderator queue and uses themed confirmations", () => {
  assert.doesNotMatch(hub, /FlashcardModeratorQueue|is_community_moderator/);
  assert.match(confirmDialog, /flash-confirm-dialog/);
  assert.match(confirmDialog, /flash-confirm-actions/);
});

test("Community conversion is reviewed and only selected cards are saved", () => {
  assert.match(community, /Review Proposed Flashcards/);
  assert.match(community, /filter\(\(x\) => x\.selected\)/);
  assert.match(sql, /attach_deck_to_community_post/);
});

test("assignment links are normalized and unlinking does not delete decks", () => {
  assert.match(assignment, /Link Existing Deck/);
  assert.match(assignment, /Create New Deck/);
  assert.match(sql, /unlink_assignment_flashcards/);
  assert.doesNotMatch(
    sql,
    /delete from public\.flashcard_decks where linked_assignment_id/i,
  );
});

test("XP and badges are server controlled and idempotent", () => {
  assert.match(sql, /check\(xp between 1 and 100\)/i);
  assert.match(sql, /unique\(user_id,event_key\)/i);
  assert.match(sql, /greatest\(0,100-coalesce\(sum\(xp\),0\)\)/i);
  assert.match(sql, /primary key\(user_id,badge_id\)/i);
  assert.match(
    sql,
    /duration>=greatest\(10,jsonb_array_length\(reviews\)\*2\)/i,
  );
  assert.doesNotMatch(sql, /client_xp|xp_amount/);
});

test("study remains confidence-based without queues or card due dates", () => {
  assert.match(hub, /Study starred cards/);
  assert.match(hub, /Focus on Again or Hard/);
  assert.match(hub, /Study cards not yet reviewed/);
  assert.doesNotMatch(
    `${sql}\n${hub}`,
    /next_review_at|Study Queue|Study Due Cards/i,
  );
});

test("deck tiles open study setup and Next records Good", () => {
  assert.match(hub, /className="flash-deck-tile"/);
  assert.match(hub, /openDeck\(d, "study"\)/);
  assert.match(hub, /Study this deck/);
  assert.match(hub, /onClick=\{\(\) => rate\("Good"\)\}/);
  assert.match(hub, /Counts as Good/);
  assert.match(hub, /e\.key === "ArrowLeft"/);
  assert.match(hub, /e\.key === "ArrowRight"/);
  assert.match(hub, /flash-card-navigation/);
  assert.match(hub, /study\.index \+ 1.*study\.cards\.length/s);
});

test("study progress follows the card and mobile is browse-and-study only", () => {
  assert.match(
    hub,
    /className={`flash-card[\s\S]*className="flash-study-progress"/,
  );
  assert.match(
    hub,
    /\{!isMobile && \(\s*<div className="flash-header-actions">/,
  );
  assert.match(hub, /section === "mine" && !isMobile/);
  assert.match(hub, /!isMobile && \([\s\S]*Copy to My Decks/);
});

test("Flashcards includes no uploads, paid AI, or service-role secret", () => {
  const all = `${sql}\n${hub}\n${community}\n${assignment}`;
  assert.doesNotMatch(
    all,
    /storage\.buckets|service.role|openai|anthropic|file upload/i,
  );
});

test("card edits preserve IDs and progress instead of replacing all cards", () => {
  assert.match(sql, /on conflict\(id\)do update/i);
  assert.doesNotMatch(
    sql,
    /delete from public\.flashcards where deck_id=did;end if/i,
  );
});
