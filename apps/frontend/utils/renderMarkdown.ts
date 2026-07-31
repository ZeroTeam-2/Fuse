import { marked } from "marked";
import { sanitizeRichText } from "./sanitizeRichText";

// Литеральные экранированные последовательности из ответов API («\n» двумя
// символами вместо перевода строки). Один проход: «\\» съедается первым и не
// порождает ложных «\n» из «\\n».
const ESCAPES: Record<string, string> = {
  "\\\\": "\\",
  "\\n": "\n",
  "\\t": "\t",
  '\\"': '"',
};

function unescapeLiteral(text: string): string {
  return text.replace(/\\[\\nt"]/g, (seq) => ESCAPES[seq] ?? seq);
}

/**
 * Рендер содержимого блока `paragraph` с форматом «Markdown»: нормализация
 * экранированных последовательностей → marked (breaks: одиночный перевод
 * строки — <br>) → allowlist-санитайзер. Результат безопасен для v-html:
 * содержимое приходит из внешних API и от авторов сценариев.
 */
export function renderMarkdown(text: string): string {
  if (!text) return "";
  const html = marked.parse(unescapeLiteral(text), {
    breaks: true,
    async: false,
  });
  return sanitizeRichText(html);
}
