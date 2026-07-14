const textOf = (error) => String(error?.message || error || "").toLowerCase();

export function friendlyAccountError(error, { offline = false, action = "account" } = {}) {
  if (offline) return "You’re offline. Your work on this device is safe. Reconnect and try again.";
  const text = textOf(error);
  if (/invalid login|invalid credentials|email or password/.test(text)) return "That email or password didn’t match. Check both and try again.";
  if (/email not confirmed|confirmation/.test(text)) return "Please verify your email before signing in. You can resend the verification message from Account Settings.";
  if (/session|jwt|token|refresh/.test(text)) return "Your sign-in has expired. Sign in again to continue syncing.";
  if (/rate|too many|limit/.test(text)) return "Too many attempts were made in a short time. Wait a moment, then try again.";
  if (action === "recovery") return "We couldn’t complete password recovery right now. Check your connection and try again.";
  if (action === "save") return "We couldn’t save that account change right now. Your planner data is unchanged.";
  return "We couldn’t reach your account right now. Check your connection and try again.";
}

export function friendlyCloudSaveError({ offline = false } = {}) {
  return offline
    ? "You’re offline. Your latest work is stored on this device and will sync when you reconnect."
    : "We couldn’t save your latest changes online. Your work is still stored on this device. Try again when you’re connected.";
}
