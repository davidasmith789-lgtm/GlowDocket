import OneSignal from "react-onesignal";
import { createOpaqueDeviceId, EXTERNAL_PUSH_CLIENT_ENABLED, getPushCleanupStorageKey, getPushDeviceStorageKey, isPushEnvironmentSupported } from "./externalReminderUtils.js";

let initializationPromise;
let subscriptionListenerAttached = false;

async function api(action, body, token = "") {
  const response = await fetch(`/api/reminders/${action}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(payload.error || "External reminders are unavailable."); error.code = payload.code || "external_push_failure"; throw error; }
  return payload;
}
function readJson(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } }
const readDevice = (profile) => readJson(getPushDeviceStorageKey(profile));
const writeDevice = (profile, value) => localStorage.setItem(getPushDeviceStorageKey(profile), JSON.stringify(value));
const writeCleanup = (profile, value) => localStorage.setItem(getPushCleanupStorageKey(profile), JSON.stringify(value));
const clearCleanup = (profile) => localStorage.removeItem(getPushCleanupStorageKey(profile));

async function initialize() {
  if (!EXTERNAL_PUSH_CLIENT_ENABLED) return "client_disabled";
  if (!isPushEnvironmentSupported()) return "unsupported";
  const appId = String(import.meta.env.VITE_ONESIGNAL_APP_ID || "");
  if (!appId) return "not_configured";
  initializationPromise ||= OneSignal.init({ appId, serviceWorkerPath: "push/onesignal/OneSignalSDKWorker.js", serviceWorkerParam: { scope: "/push/onesignal/" }, notifyButton: { enable: false }, allowLocalhostAsSecureOrigin: true });
  await initializationPromise;
  if (!subscriptionListenerAttached) { OneSignal.User.PushSubscription.addEventListener("change", () => window.dispatchEvent(new Event("taskcabinet-push-subscription-change"))); subscriptionListenerAttached = true; }
  return "ready";
}

export async function connectExternalPush(profile, { requestPermission = false } = {}) {
  const ready = await initialize();
  if (ready !== "ready") return { status: ready };
  if (requestPermission && Notification.permission !== "granted") await OneSignal.Notifications.requestPermission();
  if (Notification.permission !== "granted") return { status: Notification.permission === "denied" ? "permission_blocked" : "permission_needed" };
  if (!OneSignal.User.PushSubscription.optedIn) await OneSignal.User.PushSubscription.optIn();
  let subscriptionId = OneSignal.User.PushSubscription.id;
  for (let attempt = 0; !subscriptionId && attempt < 20; attempt += 1) { await new Promise((resolve) => window.setTimeout(resolve, 250)); subscriptionId = OneSignal.User.PushSubscription.id; }
  if (!subscriptionId) return { status: "subscription_pending" };
  const saved = readDevice(profile); const profileInstallationId = saved?.profileInstallationId || createOpaqueDeviceId();
  if (!saved?.token || saved.subscriptionId !== subscriptionId) { const enrolled = await api("enroll", { profileInstallationId, subscriptionId }); const device = { profileInstallationId, subscriptionId, token: enrolled.token }; writeDevice(profile, device); return { status: "connected", device }; }
  return { status: "connected", device: saved };
}

export async function retryPendingExternalCleanup(profile) {
  const pending = readJson(getPushCleanupStorageKey(profile));
  if (!pending?.device?.token) return { status: "none" };
  try { await api("cancel-all", { profileInstallationId: pending.device.profileInstallationId }, pending.device.token); clearCleanup(profile); return { status: "cleaned" }; }
  catch (error) { writeCleanup(profile, { ...pending, lastAttemptAt: new Date().toISOString(), lastError: error.code || "cleanup_failed" }); throw error; }
}

export async function reconcileExternalReminders(profile, reminders, options = {}) {
  await retryPendingExternalCleanup(profile).catch(() => {});
  const connection = await connectExternalPush(profile, options); if (!connection.device) return connection;
  const payload = await api("reconcile", { profileInstallationId: connection.device.profileInstallationId, reminders }, connection.device.token);
  return { status: payload.results?.some((item) => ["scheduling_failed", "cleanup_pending", "external_disabled"].includes(item.action)) ? "sync_needed" : "active", device: connection.device, results: payload.results || [], syncedAt: new Date().toISOString() };
}
export async function sendExternalReminderTest(profile, preferredName = "") { const connection = await connectExternalPush(profile, { requestPermission: true }); if (!connection.device) return connection; await api("test", { profileInstallationId: connection.device.profileInstallationId, preferredName: String(preferredName || "").trim().slice(0, 60) }, connection.device.token); return { status: "active", device: connection.device }; }
export async function cancelAllExternalReminders(profile) { const device = readDevice(profile); if (!device?.token) return { status: "disabled" }; try { await api("cancel-all", { profileInstallationId: device.profileInstallationId }, device.token); clearCleanup(profile); return { status: "disabled", confirmed: true }; } catch (error) { writeCleanup(profile, { device, createdAt: new Date().toISOString(), lastError: error.code || "cleanup_failed" }); return { status: "cleanup_pending", confirmed: false, error }; } }
async function mutate(profile, action, payload) { const device = readDevice(profile); if (!device?.token) return { status: "not_connected" }; await api(action, { profileInstallationId: device.profileInstallationId, ...payload }, device.token); return { status: "active" }; }
export const scheduleExternalReminder = (profile, reminder) => mutate(profile, "schedule", { reminder });
export const replaceExternalReminder = (profile, reminder) => mutate(profile, "replace", { reminder });
export const cancelExternalReminder = (profile, occurrenceKey) => mutate(profile, "cancel", { occurrenceKey });
export const getExternalPushSnapshot = (profile) => ({ device: readDevice(profile), cleanup: readJson(getPushCleanupStorageKey(profile)), permission: "Notification" in globalThis ? Notification.permission : "unsupported" });
