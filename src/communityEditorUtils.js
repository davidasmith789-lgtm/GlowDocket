import { communityBodyBlocks, isSafeCommunityLink } from "./communityUtils.js";

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

const INLINE_PATTERN = /(\^\^#[0-9a-f]{6}\|.*?\^\^|@@(?:c:#[0-9a-f]{6}|f:[^|@]+|s:[1-7]|a:(?:left|center|right))\|.*?@@|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/gi;

export function communityMarkupToEditorHtml(value) {
  const inline = (text) => String(text).split(INLINE_PATTERN).filter(Boolean).map((part) => {
    const highlight = part.match(/^\^\^(#[0-9a-f]{6})\|(.*?)\^\^$/i);
    if (highlight) return `<mark style="background-color:${highlight[1]}">${inline(highlight[2])}</mark>`;
    const styled = part.match(/^@@(c:#[0-9a-f]{6}|f:[^|@]+|s:[1-7]|a:(?:left|center|right))\|(.*?)@@$/i);
    if (styled) {
      const [kind, value] = styled[1].split(":");
      if (kind === "a") return `<span style="display:block;text-align:${value}">${inline(styled[2])}</span>`;
      const attribute = kind === "c" ? `color="${value}"` : kind === "f" ? `face="${escapeHtml(value)}"` : `size="${value}"`;
      return `<font ${attribute}>${inline(styled[2])}</font>`;
    }
    if (/^\*\*[^*]+\*\*$/.test(part)) return `<strong>${inline(part.slice(2, -2))}</strong>`;
    if (/^__[^_]+__$/.test(part)) return `<u>${inline(part.slice(2, -2))}</u>`;
    if (/^\*[^*]+\*$/.test(part)) return `<em>${inline(part.slice(1, -1))}</em>`;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/i);
    if (link && isSafeCommunityLink(link[2])) return `<a href="${escapeHtml(link[2])}">${escapeHtml(link[1])}</a>`;
    return escapeHtml(part);
  }).join("");
  return communityBodyBlocks(value).map((block) => {
    if (block.type === "heading") return `<h2>${inline(block.text)}</h2>`;
    if (block.type === "bullets" || block.type === "numbers") {
      const tag = block.type === "bullets" ? "ul" : "ol";
      return `<${tag}>${block.items.map((item) => `<li>${inline(item)}</li>`).join("")}</${tag}>`;
    }
    return `<p>${block.lines.map(inline).join("<br>")}</p>`;
  }).join("");
}

const rgbToHex = (value) => {
  if (/transparent|rgba\([^)]*,\s*0(?:\.0+)?\s*\)/i.test(String(value || ""))) return "";
  const match = String(value || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return /^#[0-9a-f]{6}$/i.test(value || "") ? value.toLowerCase() : "";
  return `#${match.slice(1, 4).map((channel) => Number(channel).toString(16).padStart(2, "0")).join("")}`;
};

export function communityEditorToMarkup(editor) {
  const inline = (node) => {
    if (node.nodeType === 3) return node.textContent || "";
    if (node.nodeType !== 1) return "";
    const tag = node.tagName.toLowerCase();
    if (tag === "br") return "\n";
    const content = [...node.childNodes].map(inline).join("");
    if (tag === "strong" || tag === "b") return `**${content}**`;
    if (tag === "em" || tag === "i") return `*${content}*`;
    if (tag === "u") return `__${content}__`;
    if (tag === "a" && isSafeCommunityLink(node.getAttribute("href"))) return `[${content}](${node.getAttribute("href")})`;
    if (tag === "font") {
      let styled = content;
      const color = rgbToHex(node.getAttribute("color") || node.style?.color);
      if (node.getAttribute("size")) styled = `@@s:${node.getAttribute("size")}|${styled}@@`;
      if (node.getAttribute("face")) styled = `@@f:${node.getAttribute("face")}|${styled}@@`;
      if (color) styled = `@@c:${color}|${styled}@@`;
      return styled;
    }
    const highlight = rgbToHex(node.style?.backgroundColor || (tag === "mark" ? "#fff8c5" : ""));
    if (highlight) return `^^${highlight}|${content}^^`;
    return content;
  };
  const block = (node) => {
    if (node.nodeType === 3) return node.textContent || "";
    const tag = node.tagName?.toLowerCase();
    if (tag === "h1" || tag === "h2" || tag === "h3") return `## ${[...node.childNodes].map(inline).join("")}\n`;
    if (tag === "ul" || tag === "ol") return [...node.children].map((item, index) => `${tag === "ul" ? "-" : `${index + 1}.`} ${[...item.childNodes].map(inline).join("")}`).join("\n") + "\n";
    if (tag === "p" || tag === "div") {
      const content = [...node.childNodes].map(inline).join("");
      const alignment = ["left", "center", "right"].includes(node.style?.textAlign) ? node.style.textAlign : "";
      return `${alignment ? `@@a:${alignment}|${content}@@` : content}\n`;
    }
    return inline(node);
  };
  return [...editor.childNodes].map(block).join("").replace(/\n{3,}/g, "\n\n").trimEnd();
}
