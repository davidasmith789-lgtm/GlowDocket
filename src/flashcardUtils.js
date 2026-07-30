export const FLASHCARD_LIMITS = {
  decks: 100,
  cards: 500,
  title: 120,
  course: 100,
  description: 1000,
  front: 500,
  back: 2000,
  hint: 500,
  explanation: 2000,
  tags: 8,
  tag: 30,
};
export const RATINGS = ["Again", "Hard", "Good", "Easy"];
const PROFILE_TAG_PREFIXES = ["gdl:", "gdb:", "gdn:"];

export function getFlashcardLevel(totalXp = 0) {
  const xp = Math.max(0, Math.floor(Number(totalXp) || 0));
  let level = 1;
  let levelStartXp = 0;
  let levelCost = 100;
  while (xp >= levelStartXp + levelCost && level < 1000) {
    levelStartXp += levelCost;
    level += 1;
    levelCost = 100 + (level - 1) * 25;
  }
  const xpIntoLevel = xp - levelStartXp;
  return { level, totalXp: xp, levelStartXp, nextLevelXp: levelStartXp + levelCost, xpIntoLevel, xpNeeded: levelCost, progress: Math.min(100, Math.round((xpIntoLevel / levelCost) * 100)) };
}

export const isFlashcardProfileTag = (tag) => PROFILE_TAG_PREFIXES.some((prefix) => String(tag || "").startsWith(prefix));
export const stripFlashcardProfileTags = (tags) => (Array.isArray(tags) ? tags : []).filter((tag) => !isFlashcardProfileTag(tag));

export function buildFlashcardProfileTags(tags, profile = {}) {
  const publicTags = stripFlashcardProfileTags(tags);
  const reserved = [];
  if (profile.shareFlashcardLevel) {
    reserved.push(`gdl:${Math.max(1, Math.floor(Number(profile.level) || 1))}`);
  }
  if (profile.shareFlashcardBadge && profile.badgeId) reserved.push(`gdb:${String(profile.badgeId).slice(0, 26)}`);
  if (profile.showFlashcardName && String(profile.name || "").trim()) reserved.push(`gdn:${String(profile.name).trim().replace(/[\r\n]/g, " ").slice(0, 26)}`);
  return [...publicTags.slice(0, Math.max(0, 8 - reserved.length)), ...reserved];
}

export function parseFlashcardProfile(tags) {
  const values = Array.isArray(tags) ? tags : [];
  const level = Number(values.find((tag) => String(tag).startsWith("gdl:"))?.slice(4));
  const badgeId = values.find((tag) => String(tag).startsWith("gdb:"))?.slice(4) || "";
  const name = values.find((tag) => String(tag).startsWith("gdn:"))?.slice(4) || "";
  return { level: Number.isFinite(level) && level > 0 ? Math.floor(level) : null, badgeId, name };
}
export function parseFlashcardTags(value) {
  return [
    ...new Set(
      String(value || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ].slice(0, 8);
}
export function parseFlashcardImport(
  text,
  { separator = "auto", reverse = false, ignoreFirst = false } = {},
) {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .filter((x) => x.trim());
  if (ignoreFirst) lines.shift();
  return lines.map((line, index) => {
    let parts;
    if (separator !== "auto") parts = line.split(separator);
    else if (line.includes("\t")) parts = line.split("\t");
    else if (line.includes(";")) parts = line.split(";");
    else if (line.includes(",")) parts = line.split(",");
    else parts = line.split(/\s+[—–-]\s+/);
    const front = (parts.shift() || "").trim(),
      back = parts.join(separator === "auto" ? " " : separator).trim();
    return {
      id: `import-${index}`,
      front: reverse ? back : front,
      back: reverse ? front : back,
      hint: "",
      explanation: "",
      valid: Boolean(front && back),
    };
  });
}
export function confidenceFor(progress, rating) {
  if (rating === "Again") return "Learning";
  if (rating === "Hard")
    return progress?.review_count > 1 ? "Familiar" : "Learning";
  if (rating === "Good")
    return progress?.review_count > 0 ? "Familiar" : "Learning";
  return progress?.review_count > 1 ? "Strong" : "Familiar";
}
export function deckProgress(cards, progress) {
  const rows = cards.map((c) => progress[c.id] || {});
  const total = rows.length,
    strong = rows.filter((x) => x.confidence_status === "Strong").length,
    familiar = rows.filter((x) => x.confidence_status === "Familiar").length;
  return {
    total,
    strong,
    familiar,
    learning: rows.filter((x) => x.confidence_status === "Learning").length,
    newCount: rows.filter((x) => !x.review_count).length,
    starred: rows.filter((x) => x.is_starred).length,
    percent: total ? Math.round(((strong + familiar * 0.65) / total) * 100) : 0,
  };
}
export function parseCommunityFlashcards(body) {
  const lines = String(body || "")
      .replace(/\r/g, "")
      .split("\n"),
    cards = [];
  let heading = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^##\s+/.test(line)) {
      heading = line.replace(/^##\s+/, "");
      continue;
    }
    const item = line.replace(/^[-*]\s+|^\d+[.)]\s+/, "");
    const pair = item.match(/^(.{1,120}?)(?:\s*[:=]\s*|\s+[—–-]\s+)(.+)$/);
    if (pair)
      cards.push({
        front: pair[1].trim(),
        back: pair[2].trim(),
        selected: true,
      });
    else if (item !== line || heading)
      cards.push({
        front: heading || `Explain: ${item.slice(0, 80)}`,
        back: item,
        selected: true,
      });
  }
  return cards
    .filter((x) => x.front && x.back && x.front !== x.back)
    .slice(0, 500);
}
export function selectStudyCards(
  cards,
  progress,
  { mode = "all", order = "original", direction = "front", size = "all" } = {},
) {
  let selected = [...cards];
  if (mode === "starred")
    selected = selected.filter((c) => progress[c.id]?.is_starred);
  if (mode === "difficult")
    selected = selected.filter((c) =>
      ["Again", "Hard"].includes(progress[c.id]?.last_rating),
    );
  if (mode === "new")
    selected = selected.filter((c) => !progress[c.id]?.review_count);
  if (order === "shuffle") selected.sort(() => Math.random() - 0.5);
  const limit = size === "all" ? selected.length : Number(size);
  return selected
    .slice(0, limit)
    .map((c) =>
      direction === "back" ? { ...c, front: c.back, back: c.front } : c,
    );
}
