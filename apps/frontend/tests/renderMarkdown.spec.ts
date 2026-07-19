import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../utils/renderMarkdown";

describe("renderMarkdown", () => {
  it("нормализует литеральный \\n из ответа API в реальный перевод строки", () => {
    const html = renderMarkdown('## Итог\\n**Готово**');
    expect(html).toContain("<h2>Итог</h2>");
    expect(html).toContain("<strong>Готово</strong>");
    expect(html).not.toContain("\\n");
  });

  it("экранированный обратный слэш не порождает ложный перевод строки", () => {
    // «\\n» (экранированный слэш + n) — это литеральные символы «\n», не разрыв.
    const html = renderMarkdown("до \\\\n после");
    expect(html).toContain("\\n");
    expect(html).not.toContain("<br>");
  });

  it("рендерит жирный, заголовок и список", () => {
    const html = renderMarkdown("# Заголовок\n\n- пункт\n- **важно**");
    expect(html).toContain("<h1>Заголовок</h1>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>пункт</li>");
    expect(html).toContain("<strong>важно</strong>");
  });

  it("одиночный перевод строки становится разрывом строки", () => {
    expect(renderMarkdown("первая\nвторая")).toContain("<br>");
  });

  it("вырезает <script> вместе с содержимым", () => {
    const html = renderMarkdown('текст <script>alert("x")</script> хвост');
    expect(html).not.toContain("script");
    expect(html).not.toContain("alert");
    expect(html).toContain("текст");
    expect(html).toContain("хвост");
  });

  it("режет inline-обработчики событий у пропущенных тегов", () => {
    const html = renderMarkdown('<p onclick="alert(1)">текст</p>');
    expect(html).not.toContain("onclick");
    expect(html).toContain("текст");
  });

  it("отбрасывает href со схемой javascript:", () => {
    const html = renderMarkdown("[клик](javascript:alert(1))");
    expect(html).not.toContain("javascript");
    expect(html).toContain("<a>");
  });

  it("https-ссылка кликабельна и безопасна", () => {
    const html = renderMarkdown("[сайт](https://example.com/path)");
    expect(html).toContain('href="https://example.com/path"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });

  it("пустой ввод даёт пустую строку", () => {
    expect(renderMarkdown("")).toBe("");
  });
});
