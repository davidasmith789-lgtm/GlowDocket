export const COMMUNITY_POST_TYPES = ["Course Advice", "Study Guide", "Concept Explanation", "Class Tips", "Other"];
export const COMMUNITY_REPORT_REASONS = ["Cheating or answer key", "Copyrighted material", "Personal information", "Harassment or harmful content", "Spam", "Other"];
export const COMMUNITY_LIMITS = { course: 100, title: 140, body: 10000, tags: 8, tag: 30 };

export function normalizeCommunityLinks(links) {
  return (Array.isArray(links) ? links : []).map((link) => ({
    name: String(link?.name || "").trim().slice(0, 80),
    url: String(link?.url || "").trim().slice(0, 2000),
  })).filter((link) => link.name || link.url).slice(0, 5);
}

export function isSafeCommunityLink(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function parseCommunityTags(value) {
  return [...new Set(String(value || "").split(",").map((tag) => tag.trim()).filter(Boolean))].slice(0, COMMUNITY_LIMITS.tags);
}

export function validateCommunityPost(post, confirmed = false) {
  const tags = Array.isArray(post.topic_tags) ? post.topic_tags : parseCommunityTags(post.tags);
  if (!String(post.course_name || "").trim() || String(post.course_name).length > COMMUNITY_LIMITS.course) return "Enter a course name within 100 characters.";
  if (!COMMUNITY_POST_TYPES.includes(post.post_type)) return "Choose a valid post type.";
  if (!String(post.title || "").trim() || String(post.title).length > COMMUNITY_LIMITS.title) return "Enter a title within 140 characters.";
  if (!String(post.body || "").trim() || String(post.body).length > COMMUNITY_LIMITS.body) return "Enter post text within 10,000 characters.";
  if (tags.length > COMMUNITY_LIMITS.tags || tags.some((tag) => tag.length > COMMUNITY_LIMITS.tag)) return "Use no more than eight tags, each within 30 characters.";
  const links = normalizeCommunityLinks(post.links);
  if (links.some((link) => !link.name || !isSafeCommunityLink(link.url))) return "Give every link a name and a valid http or https address.";
  if (!confirmed) return "Confirm the community sharing agreement.";
  return "";
}

export function communityBodyBlocks(body) {
  const lines = String(body || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let list = null;
  const flushParagraph = () => { if (paragraph.length) blocks.push({ type: "paragraph", lines: paragraph.splice(0) }); };
  const flushList = () => { if (list) { blocks.push(list); list = null; } };
  lines.forEach((line) => {
    if (/^##\s+/.test(line)) { flushParagraph(); flushList(); blocks.push({ type: "heading", text: line.replace(/^##\s+/, "") }); return; }
    const bullet = line.match(/^[-*]\s+(.+)/); const numbered = line.match(/^\d+[.)]\s+(.+)/);
    if (bullet || numbered) { flushParagraph(); const type = bullet ? "bullets" : "numbers"; if (!list || list.type !== type) { flushList(); list = { type, items: [] }; } list.items.push((bullet || numbered)[1]); return; }
    if (!line.trim()) { flushParagraph(); flushList(); return; }
    flushList(); paragraph.push(line);
  });
  flushParagraph(); flushList();
  return blocks;
}

export function getCommunityFormattingMarker(kind, body = "", cursor = String(body).length) {
  if (kind === "heading") return "## ";
  if (kind === "bullet") return "- ";
  if (kind !== "numbered") return "";

  const beforeCursor = String(body).slice(0, cursor);
  const currentLineStart = beforeCursor.lastIndexOf("\n") + 1;
  const currentLinePrefix = beforeCursor.slice(currentLineStart);
  if (currentLinePrefix.trim()) return "1. ";

  const previousText = beforeCursor.slice(0, Math.max(0, currentLineStart - 1));
  const previousLine = previousText.slice(previousText.lastIndexOf("\n") + 1);
  const previousNumber = previousLine.match(/^\s*(\d+)[.)]\s+/);
  return `${previousNumber ? Number(previousNumber[1]) + 1 : 1}. `;
}
