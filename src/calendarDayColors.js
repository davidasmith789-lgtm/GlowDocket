export function normalizeCalendarColorRule(rule) {
  return typeof rule === "string" ? { color: rule, updatedAt: 0 } : rule;
}

export function getNextCalendarColorTimestamp(colors, now = Date.now()) {
  const latestSavedTimestamp = ["dates", "weekdays", "cycleDays", "entryNames"]
    .flatMap((scope) => Object.values(colors?.[scope] || {}))
    .map(normalizeCalendarColorRule)
    .reduce((latest, rule) => Math.max(latest, Number(rule?.updatedAt || 0)), 0);
  return Math.max(now, latestSavedTimestamp + 1);
}

export function resolveLatestCalendarColor(rules) {
  const latest = rules
    .map(normalizeCalendarColorRule)
    .filter(Boolean)
    .reduce((current, rule) => Number(rule.updatedAt || 0) >= Number(current?.updatedAt || -1) ? rule : current, null);
  return latest?.cleared ? "" : latest?.color || "";
}
