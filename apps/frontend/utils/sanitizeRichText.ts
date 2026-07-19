// Minimal allowlist sanitizer for HTML produced by the RichTextEditor
// (Tiptap StarterKit + Placeholder) and the page-block Markdown renderer.
// Strips every attribute and any tag outside the allowlist, and drops
// script/style/iframe content entirely — this guards the public marketplace
// render and page paragraphs (both use v-html) against a scenario owner or an
// external API response injecting markup. The single exception is `a`: a
// scheme-allowlisted href survives, with rel/target forced (see below).
const ALLOWED_TAGS = new Set([
  "a",
  "p",
  "br",
  "strong",
  "em",
  "s",
  "code",
  "pre",
  "ul",
  "ol",
  "li",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
]);

const STRIP_CONTENT_TAGS = new Set(["script", "style", "iframe", "object", "embed", "template"]);

// Ссылки — единственный тег с атрибутом: href живёт только с безопасной
// схемой, всё остальное (javascript:, data:, протокол-относительные //…)
// отбрасывается вместе с атрибутом. rel/target принудительные — содержимое
// приходит из внешних API, вкладка автора не должна быть доступна странице.
const SAFE_HREF_RE = /^(https?:|mailto:)/i;
const HREF_ATTR_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

function openLinkTag(rawTag: string): string {
  const href = HREF_ATTR_RE.exec(rawTag);
  const value = (href?.[1] ?? href?.[2] ?? href?.[3] ?? "").trim();
  if (!SAFE_HREF_RE.test(value)) return "<a>";
  const safe = value.replace(/"/g, "%22");
  return `<a href="${safe}" rel="noopener noreferrer" target="_blank">`;
}

export function hasHtmlTags(value: string): boolean {
  return /<[a-z][^>]*>/i.test(value);
}

export function sanitizeRichText(html: string): string {
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  const stripStack: string[] = [];
  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(html))) {
    const [full, rawTag] = match;
    const tag = rawTag.toLowerCase();
    const isClosing = full.startsWith("</");

    if (stripStack.length === 0) {
      result += html.slice(lastIndex, match.index);
    }
    lastIndex = tagRe.lastIndex;

    if (STRIP_CONTENT_TAGS.has(tag)) {
      if (isClosing) {
        if (stripStack[stripStack.length - 1] === tag) stripStack.pop();
      } else if (!full.endsWith("/>")) {
        stripStack.push(tag);
      }
      continue;
    }

    if (stripStack.length > 0 || !ALLOWED_TAGS.has(tag)) continue;

    if (tag === "a" && !isClosing) {
      result += openLinkTag(full);
      continue;
    }

    result += isClosing ? `</${tag}>` : `<${tag}>`;
  }

  if (stripStack.length === 0) {
    result += html.slice(lastIndex);
  }

  return result;
}
