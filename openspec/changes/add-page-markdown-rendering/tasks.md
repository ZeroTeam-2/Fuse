# Tasks: Рендеринг Markdown в блоке «Абзац»

## 1. Зависимости и санитайзер

- [ ] 1.1 Добавить `marked` в зависимости `apps/frontend` (зафиксировать мажорную версию), `pnpm install`
- [ ] 1.2 Расширить `apps/frontend/utils/sanitizeRichText.ts` поддержкой `<a>`: сохранять `href` только со схемами `http/https/mailto`, принудительно добавлять `rel="noopener noreferrer" target="_blank"`; остальные атрибуты по-прежнему резать

## 2. Утилита рендера Markdown

- [ ] 2.1 Создать `apps/frontend/utils/renderMarkdown.ts`: нормализация литеральных `\\`, `\n`, `\t`, `\"` (сначала `\\`) → `marked` c `breaks: true` → `sanitizeRichText`
- [ ] 2.2 Юнит-тесты утилиты: экранированный `\n` из API, жирный/заголовок/список, `<script>` и `javascript:`-ссылка вырезаются, `https`-ссылка получает `rel`/`target`

## 3. PageRunner

- [ ] 3.1 В `apps/frontend/components/run/PageRunner.vue` ветку `paragraph` перевести с интерполяции на `v-html` с результатом `renderMarkdown(displayValue(block))`; убрать `whitespace-pre-wrap`
- [ ] 3.2 Добавить typography-стили для вложенной разметки абзаца (заголовки, списки, `code`/`pre`, цитаты, ссылки) в духе существующего DS

## 4. Проверка

- [ ] 4.1 Прогнать существующие тесты и typecheck фронтенда
- [ ] 4.2 Ручная проверка на сиде «Демо: страницы»: статический Markdown-текст блока и значение из результата API с экранированным `\n` отображаются отформатированными; конструктор по-прежнему редактирует сырой текст
