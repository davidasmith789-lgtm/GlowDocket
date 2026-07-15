import test from "node:test";
import assert from "node:assert/strict";
import handler, { sendNotification } from "../api/feedback.js";
import { FEEDBACK_CATEGORY_VALUES, FeedbackError, feedbackReleaseId, validateFeedbackInput } from "../server/utils/feedbackUtils.js";
import { FEEDBACK_MAX_SCREENSHOT_BYTES, feedbackScreenshotPath, validateFeedbackScreenshot } from "../src/feedbackUtils.js";

const userId = "123e4567-e89b-42d3-a456-426614174000";
const feedbackId = "123e4567-e89b-42d3-a456-426614174001";
const base = { feedbackId, category: null, message: " Useful feedback ", screenshotPath: null, appVersion: "1.0.0", allowContact: false };

test("feedback accepts no category as null and every supported category", () => {
  assert.equal(validateFeedbackInput(base, userId).category, null);
  assert.equal(validateFeedbackInput({ ...base, category: "" }, userId).category, null);
  for (const category of FEEDBACK_CATEGORY_VALUES) assert.equal(validateFeedbackInput({ ...base, category }, userId).category, category);
  assert.throws(() => validateFeedbackInput({ ...base, category: "school" }, userId), FeedbackError);
});

test("feedback trims messages and rejects empty, whitespace, and over-limit input", () => {
  assert.equal(validateFeedbackInput(base, userId).message, "Useful feedback");
  for (const message of ["", "   ", "x".repeat(5001)]) assert.throws(() => validateFeedbackInput({ ...base, message }, userId), FeedbackError);
  assert.equal(validateFeedbackInput({ ...base, message: "x".repeat(5000) }, userId).message.length, 5000);
});

test("feedback screenshot paths must match the authenticated user and feedback UUID", () => {
  const path = feedbackScreenshotPath(userId, feedbackId, "png");
  assert.equal(validateFeedbackInput({ ...base, screenshotPath: path }, userId).screenshotPath, path);
  assert.throws(() => validateFeedbackInput({ ...base, screenshotPath: feedbackScreenshotPath("223e4567-e89b-42d3-a456-426614174000", feedbackId, "png") }, userId), FeedbackError);
  assert.throws(() => validateFeedbackInput({ ...base, screenshotPath: `${userId}/${feedbackId}/original.png` }, userId), FeedbackError);
});

test("screenshot validation accepts PNG, JPEG, and WebP up to 5 MB", () => {
  for (const [type, extension] of [["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"]]) assert.deepEqual(validateFeedbackScreenshot({ type, size: FEEDBACK_MAX_SCREENSHOT_BYTES }), { valid: true, extension, error: "" });
  assert.equal(validateFeedbackScreenshot({ type: "image/gif", size: 100 }).valid, false);
  assert.equal(validateFeedbackScreenshot({ type: "image/png", size: FEEDBACK_MAX_SCREENSHOT_BYTES + 1 }).valid, false);
});

test("contact permission must be a boolean and release metadata uses Vercel identifiers", () => {
  assert.throws(() => validateFeedbackInput({ ...base, allowContact: "yes" }, userId), FeedbackError);
  assert.equal(feedbackReleaseId({ VERCEL_GIT_COMMIT_SHA: "abc123" }), "abc123");
  assert.equal(feedbackReleaseId({}), null);
});

test("missing Resend configuration skips notification without failing", async () => {
  let called = false;
  await sendNotification({}, {}, {}, async () => { called = true; });
  assert.equal(called, false);
});

test("notification omits authenticated email when contact permission is false", async () => {
  let payload;
  await sendNotification({ id: feedbackId, category: null, message: "Hello", app_version: "1.0.0", release_id: null, created_at: new Date().toISOString(), allow_contact: false, contact_email: null, screenshot_path: null }, { email: "private@example.com", user_metadata: {} }, { RESEND_API_KEY: "key", FEEDBACK_NOTIFICATION_TO: "team@example.com", FEEDBACK_FROM_EMAIL: "GlowDocket <feedback@example.com>" }, async (_url, options) => { payload = JSON.parse(options.body); return { ok: true }; });
  assert.doesNotMatch(payload.html, /private@example\.com|Contact email/);
});

test("notification includes authenticated email only when contact permission is true", async () => {
  let payload;
  await sendNotification({ id: feedbackId, category: "bug", message: "Hello", app_version: "1.0.0", release_id: "release", created_at: new Date().toISOString(), allow_contact: true, contact_email: "verified@example.com", screenshot_path: `${userId}/${feedbackId}/screenshot.webp` }, { email: "verified@example.com", user_metadata: { display_name: "Student" } }, { RESEND_API_KEY: "key", FEEDBACK_NOTIFICATION_TO: "team@example.com", FEEDBACK_FROM_EMAIL: "GlowDocket <feedback@example.com>", FEEDBACK_REPLY_TO: "support@example.com" }, async (_url, options) => { payload = JSON.parse(options.body); return { ok: true }; });
  assert.match(payload.html, /verified@example\.com/);
  assert.match(payload.html, /Included; review securely in Supabase/);
  assert.equal(payload.reply_to, "support@example.com");
});

test("unauthenticated feedback requests are rejected", async () => {
  let statusCode;
  let body;
  await handler({ method: "POST", headers: {} }, { setHeader() {}, status(code) { statusCode = code; return this; }, json(value) { body = value; return value; } });
  assert.equal(statusCode, 401);
  assert.equal(body.code, "unauthenticated");
});
