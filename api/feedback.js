import { createClient } from "@supabase/supabase-js";
import process from "node:process";
import { escapeHtml, FeedbackError, feedbackRateKey, feedbackReleaseId, validateFeedbackInput } from "../server/utils/feedbackUtils.js";

const inFlightUsers = new Set();
const requestWindows = new Map();
const DAILY_LIMIT = 20;
const MINUTE_LIMIT = 5;

function serverClient() {
  const url = String(process.env.SUPABASE_URL || "").trim();
  const secret = String(process.env.SUPABASE_SECRET_KEY || "").trim();
  if (!url || !secret) throw new FeedbackError("feedback_unavailable", "Feedback is temporarily unavailable. Please try again later.", 503);
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function enforceMinuteLimit(userId) {
  const key = feedbackRateKey(userId);
  const current = requestWindows.get(key) || 0;
  requestWindows.set(key, current + 1);
  if (current >= MINUTE_LIMIT) throw new FeedbackError("rate_limited", "Too many feedback requests were sent. Please wait a minute and retry.", 429);
  if (requestWindows.size > 500) requestWindows.clear();
}

export async function sendNotification(row, user, env = process.env, fetchImpl = fetch) {
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  const to = String(env.FEEDBACK_NOTIFICATION_TO || "").trim();
  const from = String(env.FEEDBACK_FROM_EMAIL || "").trim();
  const replyTo = String(env.FEEDBACK_REPLY_TO || "").trim();
  if (!apiKey || !to || !from) {
    console.warn("[feedback] Notification skipped because Resend configuration is incomplete.");
    return;
  }
  const category = row.category || "No category";
  const displayName = String(user.user_metadata?.display_name || user.user_metadata?.preferred_name || "Not provided").trim().slice(0, 80);
  const contactDetails = row.allow_contact ? `<dt>Contact email</dt><dd>${escapeHtml(row.contact_email)}</dd>` : "";
  const html = `<h1>New GlowDocket feedback</h1><dl><dt>Submission</dt><dd>${escapeHtml(row.id)}</dd><dt>Category</dt><dd>${escapeHtml(category)}</dd><dt>User display name</dt><dd>${escapeHtml(displayName)}</dd><dt>App version</dt><dd>${escapeHtml(row.app_version)}</dd><dt>Release</dt><dd>${escapeHtml(row.release_id || "Unavailable")}</dd><dt>Submitted</dt><dd>${escapeHtml(row.created_at)}</dd><dt>Contact permitted</dt><dd>${row.allow_contact ? "Yes" : "No"}</dd>${contactDetails}<dt>Private screenshot</dt><dd>${row.screenshot_path ? "Included; review securely in Supabase." : "Not included"}</dd></dl><h2>Message</h2><p>${escapeHtml(row.message).replace(/\n/g, "<br>")}</p>`;
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: `GlowDocket feedback: ${category}`, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}`);
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Only POST requests are accepted.", code: "method_not_allowed" });
  }
  if (Number(req.headers["content-length"] || 0) > 64 * 1024) return res.status(413).json({ ok: false, error: "The feedback request is too large.", code: "request_too_large" });
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return res.status(401).json({ ok: false, error: "Sign in again before sending feedback.", code: "unauthenticated" });
  let userId = "";
  try {
    const db = serverClient();
    const { data: userData, error: userError } = await db.auth.getUser(token);
    if (userError || !userData.user) throw new FeedbackError("unauthenticated", "Your session expired. Sign in again and retry.", 401);
    const user = userData.user;
    userId = user.id;
    if (inFlightUsers.has(userId)) throw new FeedbackError("duplicate_submission", "Your feedback is already being sent.", 409);
    inFlightUsers.add(userId);
    enforceMinuteLimit(userId);
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const input = validateFeedbackInput(body, userId);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await db.from("feedback_submissions").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
    if (countError) throw countError;
    if ((count || 0) >= DAILY_LIMIT) throw new FeedbackError("daily_limit", "You have reached today’s feedback limit. Please try again tomorrow.", 429);
    const row = {
      id: input.feedbackId,
      user_id: userId,
      category: input.category,
      message: input.message,
      screenshot_path: input.screenshotPath,
      app_version: input.appVersion,
      release_id: feedbackReleaseId(),
      allow_contact: input.allowContact,
      contact_email: input.allowContact ? user.email || null : null,
    };
    const { data: saved, error: insertError } = await db.from("feedback_submissions").insert(row).select("*").single();
    if (insertError) throw insertError;
    try { await sendNotification(saved, user); }
    catch (notificationError) { console.warn("[feedback] Notification failed after the submission was saved.", { message: notificationError instanceof Error ? notificationError.message : "Unknown notification error" }); }
    return res.status(201).json({ ok: true, id: saved.id });
  } catch (error) {
    const known = error instanceof FeedbackError;
    if (!known) console.error("[feedback] Submission failed.", { message: error instanceof Error ? error.message : "Unknown feedback error" });
    return res.status(known ? error.status : 500).json({ ok: false, error: known ? error.message : "GlowDocket could not send your feedback. Please try again.", code: known ? error.code : "feedback_failure" });
  } finally {
    if (userId) inFlightUsers.delete(userId);
  }
}
