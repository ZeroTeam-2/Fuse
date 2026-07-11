// Minimal allowlist sanitizer for HTML produced by the RichTextEditor
// (Tiptap StarterKit + Placeholder). Strips every attribute and any tag
// outside the allowlist, and drops script/style/iframe content entirely —
// this guards the public marketplace render (which uses v-html) against a
// scenario owner writing to the description field directly via the API.
const ALLOWED_TAGS = new Set([
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

    result += isClosing ? `</${tag}>` : `<${tag}>`;
  }

  if (stripStack.length === 0) {
    result += html.slice(lastIndex);
  }

  return result;
}
