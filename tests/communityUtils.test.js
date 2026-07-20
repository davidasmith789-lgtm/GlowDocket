import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COMMUNITY_POST_TYPES,
  communityBodyBlocks,
  getCommunityFormattingMarker,
  parseCommunityTags,
  validateCommunityPost,
} from "../src/communityUtils.js";

test("community tags are trimmed, unique, and capped", () => {
  assert.deepEqual(parseCommunityTags(" algebra, study, algebra, exam "), [
    "algebra",
    "study",
    "exam",
  ]);
  assert.equal(parseCommunityTags("1,2,3,4,5,6,7,8,9").length, 8);
});
test("community post validation enforces body and confirmation", () => {
  const post = {
    course_name: "Math",
    post_type: "Course Advice",
    title: "Tip",
    body: "x".repeat(10001),
    topic_tags: [],
  };
  assert.match(validateCommunityPost(post, true), /10,000/);
  assert.match(
    validateCommunityPost({ ...post, body: "Useful text" }, false),
    /Confirm/,
  );
  assert.equal(
    validateCommunityPost({ ...post, body: "Useful text" }, true),
    "",
  );
});

test("community post categories include Other", () => {
  assert.ok(COMMUNITY_POST_TYPES.includes("Other"));
  assert.equal(validateCommunityPost({
    course_name: "General",
    post_type: "Other",
    title: "A useful post",
    body: "Community information",
    topic_tags: [],
  }, true), "");
});
test("safe formatter produces data blocks and never HTML", () => {
  const blocks = communityBodyBlocks(
    "## Heading\n- One\n- <script>alert(1)</script>\n\nParagraph",
  );
  assert.equal(blocks[0].type, "heading");
  assert.equal(blocks[1].type, "bullets");
  assert.equal(blocks[1].items[1], "<script>alert(1)</script>");
});
test("format controls insert markers without placeholder words", () => {
  assert.equal(getCommunityFormattingMarker("heading"), "## ");
  assert.equal(getCommunityFormattingMarker("bullet"), "- ");
  assert.equal(getCommunityFormattingMarker("numbered", "", 0), "1. ");
});
test("adjacent numbered list markers continue and gaps restart numbering", () => {
  assert.equal(
    getCommunityFormattingMarker("numbered", "1. First\n", 9),
    "2. ",
  );
  assert.equal(
    getCommunityFormattingMarker("numbered", "1. First\n2. Second\n", 19),
    "3. ",
  );
  assert.equal(
    getCommunityFormattingMarker("numbered", "1. First\n\n", 10),
    "1. ",
  );
});
test("community post course entry suggests existing courses but remains free text", () => {
  const hub = readFileSync(
    new URL("../src/components/CommunityHub.jsx", import.meta.url),
    "utf8",
  );
  assert.match(hub, /select\("course_name"\)/);
  assert.match(hub, /list="community-existing-courses"/);
  assert.match(hub, /<datalist id="community-existing-courses">/);
  assert.match(hub, /keep typing to\s+create a new course name/);
});

test("Community uses its Full Color Studio accent", () => {
  const styles = readFileSync(
    new URL("../src/components/CommunityHub.css", import.meta.url),
    "utf8",
  );
  assert.match(styles, /--primary-color: var\(--community-accent-color\)/);
  assert.match(
    styles,
    /--button-primary-color: var\(--community-action-text\)/,
  );
});
