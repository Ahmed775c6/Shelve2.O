import type { WritingChapter, WritingPage, WritingPageSize } from "../../types";

export function countWords(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

export function countProjectWords(project: Pick<{ chapters: WritingChapter[]; pages?: WritingPage[] }, "chapters" | "pages">): number {
  const chapterWords = project.chapters.reduce((total, chapter) =>
    total + countWords(chapter.content) + (chapter.pages ?? []).reduce((pageTotal, page) => pageTotal + countWords(page.content), 0),
  0);
  return chapterWords + (project.pages ?? []).reduce((total, page) => total + countWords(page.content), 0);
}

export function paginateWritingText(content: string, pageSize: WritingPageSize, fontSize: number, lineSpacing: number): string[] {
  const capacity = Math.max(400, Math.floor(
    (pageSize === "a4" ? 920 : 660) / (fontSize * lineSpacing) *
    (pageSize === "a4" ? 65 : 43) * (18 / fontSize),
  ));
  const tokens = content.match(/\S+\s*|\s+/g) ?? [];
  if (tokens.length === 0) return [""];
  const pages: string[] = [];
  let page = "";
  for (const token of tokens) {
    const splitAt = Math.floor(capacity * 0.62);
    const chunks = token.length > splitAt
      ? Array.from({ length: Math.ceil(token.length / splitAt) }, (_, index) =>
        Array.from(token).slice(index * splitAt, (index + 1) * splitAt).join(""),
      )
      : [token];
    for (const chunk of chunks) {
      const pageCapacity = pages.length === 0 ? Math.floor(capacity * 0.62) : capacity;
      if (page && page.length + chunk.length > pageCapacity) {
        pages.push(page);
        page = "";
      }
      page += chunk;
    }
  }
  pages.push(page);
  return pages;
}

export function estimatePages(content: string): [string, string] {
  const words = content.split(/\s+/).filter(Boolean);
  const midpoint = Math.ceil(words.length / 2);
  return [words.slice(0, midpoint).join(" "), words.slice(midpoint).join(" ")];
}

const RICH_TEXT_TAGS = new Set([
  "A", "B", "BLOCKQUOTE", "BR", "CODE", "DEL", "DIV", "EM", "H1", "H2", "H3", "HR", "I",
  "IMG", "LI", "MARK", "OL", "P", "PRE", "S", "SPAN", "STRONG", "TABLE", "TBODY", "TD",
  "TH", "THEAD", "TR", "U", "UL",
]);
const RICH_TEXT_BLOCKS = new Set(["BLOCKQUOTE", "DIV", "H1", "H2", "H3", "LI", "P", "PRE", "TR"]);

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

export function sanitizeRichHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const cleanNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent ?? "");
    if (!(node instanceof HTMLElement)) return "";
    const tag = node.tagName;
    const children = Array.from(node.childNodes, cleanNode).join("");
    if (!RICH_TEXT_TAGS.has(tag)) return children;

    const attributes: string[] = [];
    if (tag === "A") {
      const href = node.getAttribute("href")?.trim() ?? "";
      if (/^(https?:|mailto:)/i.test(href)) attributes.push(`href="${escapeHtml(href)}"`);
      attributes.push('rel="noopener noreferrer"');
    }
    if (tag === "IMG") {
      const src = node.getAttribute("src")?.trim() ?? "";
      if (/^(https?:|blob:|data:image\/(?:png|jpeg|gif|webp);base64,)/i.test(src)) {
        attributes.push(`src="${escapeHtml(src)}"`);
      }
      const alt = node.getAttribute("alt");
      if (alt) attributes.push(`alt="${escapeHtml(alt)}"`);
    }
    if (tag === "DIV" && node.classList.contains("editor-callout")) attributes.push('class="editor-callout"');
    if (tag === "HR" && node.classList.contains("editor-page-break")) attributes.push('class="editor-page-break"');

    const style: string[] = [];
    for (const property of ["font-family", "font-size", "color", "background-color", "text-align", "line-height"]) {
      const value = node.style.getPropertyValue(property).trim();
      if (!value) continue;
      if (property === "font-family" && /^[\w\s,"'-]+$/.test(value)) style.push(`${property}:${value}`);
      else if (property === "font-size" && /^\d{1,2}(?:\.\d+)?px$/.test(value)) style.push(`${property}:${value}`);
      else if ((property === "color" || property === "background-color") && /^(#[\da-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|[a-z]{3,20})$/i.test(value)) style.push(`${property}:${value}`);
      else if (property === "text-align" && /^(left|center|right|justify)$/.test(value)) style.push(`${property}:${value}`);
      else if (property === "line-height" && /^\d(?:\.\d+)?$/.test(value)) style.push(`${property}:${value}`);
    }
    if (style.length) attributes.push(`style="${escapeHtml(style.join(";"))}"`);
    if (tag === "BR" || tag === "HR" || tag === "IMG") return `<${tag.toLowerCase()}${attributes.length ? ` ${attributes.join(" ")}` : ""}>`;
    return `<${tag.toLowerCase()}${attributes.length ? ` ${attributes.join(" ")}` : ""}>${children}</${tag.toLowerCase()}>`;
  };
  return Array.from(parsed.body.childNodes, cleanNode).join("");
}

export function richHtmlToText(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = sanitizeRichHtml(html);
  let text = "";
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? "";
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") {
      text += "\n";
      return;
    }
    const block = RICH_TEXT_BLOCKS.has(node.tagName);
    if (block && text && !text.endsWith("\n")) text += "\n";
    node.childNodes.forEach(visit);
    if (block && !text.endsWith("\n")) text += "\n";
  };
  container.childNodes.forEach(visit);
  return text.replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/^\n|\n$/g, "");
}

export function plainTextToRichHtml(value: string): string {
  return value.split(/\n{2,}/).map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>") || "<br>"}</p>`).join("") || "<p><br></p>";
}

export function markdownInlineToRichHtml(value: string): string {
  return escapeHtml(value).replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>");
}

export function markdownToRichHtml(value: string): string {
  return value.split(/\n{2,}/).filter(Boolean).map((block) => {
    const heading = block.match(/^(#{1,3})\s+([\s\S]+)/);
    if (heading) return `<h${heading[1].length}>${markdownInlineToRichHtml(heading[2]).replace(/\n/g, "<br>")}</h${heading[1].length}>`;
    if (block.trim() === "***") return "<hr>";
    if (block.startsWith(">")) return `<blockquote>${markdownInlineToRichHtml(block.replace(/^>\s?/gm, "")).replace(/\n/g, "<br>")}</blockquote>`;
    if (/^[-*]\s+/m.test(block)) return `<ul>${block.split("\n").map((line) => `<li>${markdownInlineToRichHtml(line.replace(/^[-*]\s+/, ""))}</li>`).join("")}</ul>`;
    return `<p>${markdownInlineToRichHtml(block).replace(/\n/g, "<br>")}</p>`;
  }).join("") || "<p><br></p>";
}

export function editorHtmlForDocument(document: WritingChapter | WritingPage): string {
  return document.richContent ? sanitizeRichHtml(document.richContent) : markdownToRichHtml(document.content);
}

export function safeFilename(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "shelve-writing";
}
