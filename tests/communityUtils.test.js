import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COMMUNITY_POST_TYPES,
  communityBodyBlocks,
  clearCommunityDraft,
  getCommunityDraftStorageKey,
  getCommunityFormattingMarker,
  isSafeCommunityLink,
  loadCommunityDraft,
  matchCommunityCourses,
  normalizeCommunityLinks,
  parseCommunityTags,
  saveCommunityDraft,
  validateCommunityPost,
} from "../src/communityUtils.js";
import { communityMarkupToEditorHtml } from "../src/communityEditorUtils.js";

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
test("community course search matches partial acronyms and words anywhere", () => {
  const courses = ["APUSH (United States History)", "AP Biology", "World History"];
  assert.deepEqual(matchCommunityCourses(courses, "APU"), ["APUSH (United States History)"]);
  assert.deepEqual(matchCommunityCourses(courses, "united states"), ["APUSH (United States History)"]);
  assert.deepEqual(matchCommunityCourses(courses, "world hist"), ["World History"]);
});

test("community post course entry suggests account and existing courses but remains free text", () => {
  const hub = readFileSync(
    new URL("../src/components/CommunityHub.jsx", import.meta.url),
    "utf8",
  );
  assert.match(hub, /select\("course_name"\)/);
  assert.match(hub, /matchCommunityCourses\(courseOptions, draft\.course_name\)/);
  assert.match(hub, /community-course-suggestions/);
  assert.match(hub, /\.\.\.courses\.map/);
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

test("Community posts use styled course and category pills", () => {
  const hub = readFileSync(
    new URL("../src/components/CommunityHub.jsx", import.meta.url),
    "utf8",
  );
  const styles = readFileSync(
    new URL("../src/components/CommunityHub.css", import.meta.url),
    "utf8",
  );
  assert.match(hub, /community-course-pill/);
  assert.match(hub, /community-type-pill/);
  assert.match(hub, /community-card-footer/);
  assert.match(styles, /\.community-card::before/);
  assert.match(styles, /backdrop-filter: blur\(8px\)/);
});

test("Community replaces tags with safe named links and document-style lists", () => {
  assert.deepEqual(normalizeCommunityLinks([{ name: " Notes ", url: "https://example.com/notes" }]), [{ name: "Notes", url: "https://example.com/notes" }]);
  assert.equal(isSafeCommunityLink("https://example.com"), true);
  assert.equal(isSafeCommunityLink("javascript:alert(1)"), false);
  const hub = readFileSync(new URL("../src/components/CommunityHub.jsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/components/CommunityHub.css", import.meta.url), "utf8");
  assert.match(hub, /Link name/);
  assert.match(hub, /href=\{link\.url\}/);
  assert.match(hub, /bodyWithNamedLinks/);
  assert.match(hub, /isMissingCommunityLinksSchema/);
  assert.match(hub, /namedLink\[1\]/);
  assert.doesNotMatch(hub, /Topic tags/);
  assert.match(styles, /\.community-body :is\(ul, ol\)/);
  assert.match(styles, /community-rich-editor/);
});

test("Community editor supports document keyboard formatting", () => {
  const hub = readFileSync(new URL("../src/components/CommunityHub.jsx", import.meta.url), "utf8");
  assert.match(hub, /contentEditable/);
  assert.match(hub, /onKeyDown=\{handleBodyKeyDown\}/);
  assert.match(hub, /event\.key === "Tab"/);
  assert.match(hub, /runEditorCommand\("bold"\)/);
  assert.match(hub, /runEditorCommand\("italic"\)/);
  assert.match(hub, /runEditorCommand\("underline"\)/);
  assert.match(hub, /runEditorCommand\("undo"\)/);
  assert.match(hub, /document\.queryCommandValue\("fontSize"\)/);
  assert.match(hub, /document\.queryCommandValue\("formatBlock"\)/);
  assert.match(hub, /document\.queryCommandState\("bold"\)/);
  assert.match(hub, /value=\{editorToolbarState\.size\}/);
  assert.match(hub, /<InlineText text=\{item\}/);
  assert.match(hub, /event\.shiftKey \? "outdent" : "indent"/);
  assert.match(hub, /HIGHLIGHT_PALETTE\.flatMap/);
  assert.match(hub, /community-highlight-transparent/);
  assert.match(hub, /runEditorCommand\("hiliteColor", "transparent"\)/);
  assert.match(hub, /new window\.EyeDropper\(\)\.open\(\)/);
});

test("Community rich text becomes safe visual editor content", () => {
  const html = communityMarkupToEditorHtml("## Notes\n**Bold** and ^^#fff8c5|highlighted^^ <script>alert(1)</script>");
  assert.match(html, /<h2>Notes<\/h2>/);
  assert.match(html, /<strong>Bold<\/strong>/);
  assert.match(html, /<mark style="background-color:#fff8c5">highlighted<\/mark>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("Community composer retains focus while a draft changes", () => {
  const hub = readFileSync(new URL("../src/components/CommunityHub.jsx", import.meta.url), "utf8");
  assert.match(hub, /closeDialogRef\.current\?\.\(\)/);
  assert.match(hub, /\}, \[formMode, reporting, selected\]\);/);
  assert.doesNotMatch(hub, /\}, \[closeDialog, formMode, reporting, selected\]\);/);
});

test("Community background and text colors are theme-controlled", () => {
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/components/CommunityHub.css", import.meta.url), "utf8");
  assert.match(app, /communityBackground[\s\S]*group: "Community"/);
  assert.match(app, /communityText[\s\S]*group: "Community"/);
  assert.match(styles, /var\(--community-background/);
  assert.match(styles, /var\(--community-text/);
});

test("Community drafts round-trip safely and stay isolated by account", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  const draft = { course_name: "APUSH", post_type: "Study Guide", title: "Review", body: "Notes", links: [{ name: "Source", url: "https://example.com" }] };
  saveCommunityDraft(storage, "user-a", draft, 1234);
  assert.deepEqual(loadCommunityDraft(storage, "user-a"), { draft: { ...draft, tags: "" }, savedAt: 1234 });
  assert.equal(loadCommunityDraft(storage, "user-b"), null);
  assert.notEqual(getCommunityDraftStorageKey("user-a"), getCommunityDraftStorageKey("user-b"));
  clearCommunityDraft(storage, "user-a");
  assert.equal(loadCommunityDraft(storage, "user-a"), null);
});

test("Community drafts discard empty, malformed, oversized, and old data", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  assert.equal(saveCommunityDraft(storage, "user", { course_name: "", title: "", body: "", links: [] }), null);
  values.set(getCommunityDraftStorageKey("user"), "not json");
  assert.equal(loadCommunityDraft(storage, "user"), null);
  values.set(getCommunityDraftStorageKey("user"), JSON.stringify({ version: 0, savedAt: 1, draft: { title: "Old" } }));
  assert.equal(loadCommunityDraft(storage, "user"), null);
  saveCommunityDraft(storage, "user", { title: "x".repeat(500), body: "y".repeat(20000) }, 2);
  const loaded = loadCommunityDraft(storage, "user");
  assert.equal(loaded.draft.title.length, 140);
  assert.equal(loaded.draft.body.length, 10000);
});

test("Community composer exposes draft status and mobile preview controls", () => {
  const hub = readFileSync(new URL("../src/components/CommunityHub.jsx", import.meta.url), "utf8");
  assert.match(hub, /Draft restored/);
  assert.match(hub, /Saving draft…/);
  assert.match(hub, /Draft saved · Saved on this device/);
  assert.match(hub, /mobileComposerView === "preview"/);
  assert.match(hub, /formMode !== "create"/);
  assert.match(hub, /latestFormModeRef\.current === "create"/);
  assert.match(hub, /saveCommunityDraft\(window\.localStorage, userId, latestDraftRef\.current\)/);
});
