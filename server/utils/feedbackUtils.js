import crypto from "node:crypto";
import process from "node:process";

export const FEEDBACK_CATEGORY_VALUES = ["bug", "feature", "usability", "account_sync", "notifications", "other"];
export const FEEDBACK_MAX_MESSAGE_LENGTH = 5000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCREENSHOT_PATTERN = /^([0-9a-f-]{36})\/([0-9a-f-]{36})\/screenshot\.(png|jpg|webp)$/i;

export class FeedbackError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

export function validateFeedbackInput(raw, authenticatedUserId) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new FeedbackError("invalid_request", "The feedback request is invalid.");
  const allowed = new Set(["feedbackId", "category", "message", "screenshotPath", "appVersion", "allowContact"]);
  if (Object.keys(raw).some((key) => !allowed.has(key))) throw new FeedbackError("invalid_request", "The feedback request included unsupported data.");
  const feedbackId = String(raw.feedbackId || "").trim();
  if (!UUID_PATTERN.test(feedbackId)) throw new FeedbackError("invalid_feedback_id", "The feedback request is invalid.");
  const category = raw.category === null || raw.category === "" || raw.category === undefined ? null : raw.category;
  if (category !== null && (typeof category !== "string" || !FEEDBACK_CATEGORY_VALUES.includes(category))) throw new FeedbackError("invalid_category", "Choose a valid feedback category.");
  if (typeof raw.message !== "string") throw new FeedbackError("invalid_message", "Write a feedback message before sending.");
  const message = raw.message.trim();
  if (!message) throw new FeedbackError("invalid_message", "Write a feedback message before sending.");
  if (message.length > FEEDBACK_MAX_MESSAGE_LENGTH) throw new FeedbackError("message_too_long", "Feedback messages must be 5,000 characters or fewer.");
  if (typeof raw.allowContact !== "boolean") throw new FeedbackError("invalid_contact_permission", "The contact permission value is invalid.");
  const appVersion = String(raw.appVersion || "").trim();
  if (!appVersion || appVersion.length > 80) throw new FeedbackError("invalid_app_version", "The application version is invalid.");
  let screenshotPath = null;
  if (raw.screenshotPath !== null && raw.screenshotPath !== "" && raw.screenshotPath !== undefined) {
    if (typeof raw.screenshotPath !== "string") throw new FeedbackError("invalid_screenshot", "The screenshot reference is invalid.");
    const match = raw.screenshotPath.match(SCREENSHOT_PATTERN);
    if (!match || match[1] !== authenticatedUserId || match[2] !== feedbackId || !UUID_PATTERN.test(match[1]) || !UUID_PATTERN.test(match[2])) throw new FeedbackError("invalid_screenshot", "The screenshot reference is invalid.");
    screenshotPath = raw.screenshotPath;
  }
  return { feedbackId, category, message, screenshotPath, appVersion, allowContact: raw.allowContact };
}

export function feedbackReleaseId(env = process.env) {
  return String(env.VERCEL_GIT_COMMIT_SHA || env.VERCEL_DEPLOYMENT_ID || env.VERCEL_URL || env.GITHUB_SHA || "").trim() || null;
}

export function feedbackRateKey(userId, now = Date.now()) {
  return crypto.createHash("sha256").update(`${userId}:${Math.floor(now / 60000)}`).digest("hex");
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
