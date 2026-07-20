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
